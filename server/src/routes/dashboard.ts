import { Router } from 'express';
import { query } from '../db';
import { cacheConfig } from '../middleware/cacheMiddleware';
import { createLoggerWithReq } from '../utils/logger';

const router = Router();

// Apply semi-static caching (1 minute) to dashboard data
router.get('/', async (req, res) => {
    const { campusId } = req.query;

    try {
        // Optimized dashboard using SQL aggregates instead of memory processing
        const campusFilter = campusId ? 'WHERE b.campus_id = $1' : '';
        const queryParams = campusId ? [campusId] : [];

        // Get all metrics in optimized SQL queries
        const [totalsResult, sectorResult, campusResult] = await Promise.all([
            // Total area and occupancy - total_area = sum of block max_area_sqm, used_area = occupied units area
            query(`
                SELECT
                    COALESCE(SUM(DISTINCT b.max_area_sqm), 0) as total_area,
                    COALESCE(SUM(u.area_sqm), 0) as used_area,
                    COUNT(DISTINCT u.company_id) as total_companies
                FROM blocks b
                LEFT JOIN units u ON u.block_id = b.id AND u.status = 'OCCUPIED' AND u.deleted_at IS NULL
                WHERE b.deleted_at IS NULL
                ${campusId ? 'AND b.campus_id = $1' : ''}
            `, queryParams),

            // Sector breakdown
            query(`
                SELECT
                    COALESCE(c.sector, 'Diğer') as sector_name,
                    COUNT(DISTINCT c.id) as company_count
                FROM units u
                INNER JOIN companies c ON u.company_id = c.id AND c.deleted_at IS NULL
                ${campusId ? 'INNER JOIN blocks b ON u.block_id = b.id WHERE b.campus_id = $1 AND b.deleted_at IS NULL' : 'WHERE 1=1'}
                AND u.status = 'OCCUPIED'
                AND u.deleted_at IS NULL
                GROUP BY c.sector
                ORDER BY company_count DESC
            `, queryParams),

            // Campus breakdown
            query(`
                SELECT
                    c.id,
                    c.name,
                    COALESCE(SUM(DISTINCT b.max_area_sqm), 0) as total_area,
                    COALESCE(SUM(u.area_sqm), 0) as used_area,
                    COUNT(DISTINCT u.id) as unit_count,
                    COUNT(DISTINCT CASE WHEN u.status = 'OCCUPIED' THEN u.id END) as occupied_count,
                    COALESCE(SUM(l.monthly_rent + COALESCE(l.operating_fee, 0)), 0) as revenue
                FROM campuses c
                LEFT JOIN blocks b ON b.campus_id = c.id AND b.deleted_at IS NULL
                LEFT JOIN units u ON u.block_id = b.id AND u.status = 'OCCUPIED' AND u.deleted_at IS NULL
                LEFT JOIN leases l ON l.company_id = u.company_id AND l.deleted_at IS NULL
                WHERE c.deleted_at IS NULL
                ${campusId ? 'AND c.id = $1' : ''}
                GROUP BY c.id, c.name
                ORDER BY c.name
            `, queryParams)
        ]);

        // Calculate totals
        const totalArea = parseFloat(totalsResult.rows[0].total_area);
        const usedArea = parseFloat(totalsResult.rows[0].used_area);
        const occupancyRate = totalArea > 0 ? (usedArea / totalArea) * 100 : 0;
        const totalCompanies = parseInt(totalsResult.rows[0].total_companies);

        // Format sector data
        const sectorData = sectorResult.rows.map(row => ({
            name: row.sector_name,
            value: parseInt(row.company_count)
        }));

        // Format campus data
        const campusData = campusResult.rows.map(row => ({
            id: row.id,
            name: row.name,
            totalArea: parseFloat(row.total_area),
            usedArea: parseFloat(row.used_area),
            emptyArea: parseFloat(row.total_area) - parseFloat(row.used_area),
            occupancyRate: parseFloat(row.total_area) > 0 ? (parseFloat(row.used_area) / parseFloat(row.total_area)) * 100 : 0,
            unitCount: parseInt(row.unit_count),
            occupiedCount: parseInt(row.occupied_count),
            revenue: parseFloat(row.revenue)
        }));

        const totalRevenue = campusData.reduce((sum, c) => sum + c.revenue, 0);

        res.json({
            totalArea,
            usedArea,
            emptyArea: totalArea - usedArea,
            occupancyRate,
            totalRevenue,
            sectorData,
            campusData,
            totalCompanies
        });

    } catch (err) {
        const log = createLoggerWithReq(req);
        log.error({ err }, 'Database error');
        res.status(500).json({ error: 'Database error' });
    }
});

export default router;
