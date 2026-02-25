import { Router } from 'express';
import { query, transaction } from '../db';
import { audit } from '../services/auditService';
import { AuthRequest } from '../middleware/authMiddleware';
import { requireRole } from '../middleware/roleMiddleware';
import { validate } from '../middleware/validationMiddleware';
import { body } from 'express-validator';
import { getPaginationParams, getSqlPagination } from '../utils/pagination';
import { createLoggerWithReq } from '../utils/logger';
import { validateBase64File } from '../utils/fileValidation';

const router = Router();

router.get('/', async (req, res) => {
    try {
        const params = getPaginationParams(req);
        const { limit, offset } = getSqlPagination(params);

        // Get total count (soft delete filter)
        const countResult = await query('SELECT COUNT(*) FROM leases WHERE deleted_at IS NULL');
        const totalCount = parseInt(countResult.rows[0].count);

        // Get paginated leases (soft delete filter)
        const result = await query('SELECT * FROM leases WHERE deleted_at IS NULL LIMIT $1 OFFSET $2', [limit, offset]);
        // We might need to join with companies/units/blocks/campuses for the "ExtendedLeaseData" view
        // But for raw leases, this is fine.
        // Frontend expects "ExtendedLeaseData" via getAllLeaseDetails usually.
        // So we might want a special endpoint for that.

        const data = result.rows.map(row => ({
            id: row.id,
            unitId: row.unit_id,
            companyId: row.company_id,
            startDate: row.start_date,
            endDate: row.end_date,
            monthlyRent: parseFloat(row.monthly_rent),
            operatingFee: parseFloat(row.operating_fee),
            contractUrl: row.contract_url,
            documents: row.documents,
            createdAt: row.created_at
        }));

        // Return with pagination metadata (preserving existing response structure)
        res.json({
            data,
            pagination: {
                page: params.page,
                limit: params.limit,
                totalCount,
                totalPages: Math.ceil(totalCount / params.limit)
            }
        });
    } catch (err) {
        res.status(500).json({ error: 'Database error' });
    }
});

// Endpoint for ExtendedLeaseData (used by LeasingManagement page)
router.get('/details', async (req, res) => {
    // A1: Request-level timings setup
    const { v4: uuidv4 } = require('uuid');
    const reqId = uuidv4().slice(0, 8);
    const start_ts = process.hrtime.bigint();
    let db_start, db_end, app_start, app_end;

    try {
        db_start = process.hrtime.bigint();
        // complex join with soft delete filters + SQL Aggregation to fix NxM App-Layer Memory leak
        const text = `
            SELECT
                c.id as company_id, c.*,
                l.id as lease_id, l.start_date, l.end_date, l.monthly_rent, l.operating_fee, l.contract_url, l.documents as lease_documents, l.unit_price_per_sqm,
                u.id as unit_id, u.number, u.floor, u.area_sqm, u.status,
                b.id as block_id, b.name as block_name, b.campus_id,
                cp.id as campus_id, cp.name as campus_name,
                COALESCE(
                    (SELECT json_agg(json_build_object(
                        'id', cse.id,
                        'type', cse.type,
                        'description', cse.description,
                        'points', cse.points,
                        'date', cse.date,
                        'note', cse.note,
                        'documents', cse.documents
                    )) FROM company_score_entries cse WHERE cse.company_id = c.id AND cse.deleted_at IS NULL),
                    '[]'
                ) as score_entries,
                COALESCE(
                    (SELECT json_agg(json_build_object(
                        'id', cd.id,
                        'name', cd.name,
                        'url', cd.url,
                        'type', cd.type
                    )) FROM company_documents cd WHERE cd.company_id = c.id AND cd.deleted_at IS NULL),
                    '[]'
                ) as company_documents
            FROM companies c
            LEFT JOIN leases l ON l.company_id = c.id AND l.deleted_at IS NULL
            LEFT JOIN units u ON u.company_id = c.id AND u.deleted_at IS NULL
            LEFT JOIN blocks b ON u.block_id = b.id AND b.deleted_at IS NULL
            LEFT JOIN campuses cp ON b.campus_id = cp.id AND cp.deleted_at IS NULL
            WHERE c.deleted_at IS NULL
        `;

        const result = await query(text);
        db_end = process.hrtime.bigint();

        app_start = process.hrtime.bigint();

        const extendedData = result.rows.map(row => {
            // Reconstruct the nested object structure expected by frontend ExtendedLeaseData
            // But now using the pre-aggregated SQL data to prevent OOM

            // Map Company
            const company = {
                id: row.company_id,
                name: row.name,
                registrationNumber: row.registration_number,
                sector: row.sector,
                businessAreas: row.business_areas || [],
                workArea: row.work_area,
                managerName: row.manager_name,
                managerPhone: row.manager_phone,
                managerEmail: row.manager_email,
                employeeCount: row.employee_count,
                score: parseFloat(row.score || 0),
                contractTemplate: row.contract_template,
                scoreEntries: (row.score_entries || []).map((s: any) => ({
                    ...s,
                    points: parseFloat(s.points)
                })),
                documents: row.company_documents || []
            };

            // Map Lease
            let lease = null;
            if (row.lease_id) {
                lease = {
                    id: row.lease_id,
                    unitId: row.unit_id,
                    companyId: row.company_id,
                    startDate: row.start_date,
                    endDate: row.end_date,
                    monthlyRent: parseFloat(row.monthly_rent),
                    unitPricePerSqm: row.unit_price_per_sqm ? parseFloat(row.unit_price_per_sqm) : undefined,
                    operatingFee: parseFloat(row.operating_fee),
                    documents: row.lease_documents,
                };
            }

            if (!lease && company.contractTemplate) {
                const area = row.area_sqm ? parseFloat(row.area_sqm) : 0;
                const rentPerSqM = parseFloat(company.contractTemplate.rentPerSqM || 0);

                lease = {
                    id: 'PENDING',
                    unitId: row.unit_id || '',
                    companyId: company.id,
                    startDate: company.contractTemplate.startDate,
                    endDate: company.contractTemplate.endDate,
                    monthlyRent: area > 0 ? (area * rentPerSqM) : rentPerSqM,
                    unitPricePerSqm: rentPerSqM,
                    documents: []
                };
            }

            if (!lease) return null;

            return {
                id: company.id,
                company: company,
                lease: lease,
                unit: row.unit_id ? {
                    id: row.unit_id,
                    number: row.number,
                    floor: row.floor,
                    areaSqM: parseFloat(row.area_sqm),
                    status: row.status
                } : { floor: '-', areaSqM: 0, number: lease.id === 'PENDING' ? 'BEKLEMEDE' : '-' },
                block: row.block_id ? { id: row.block_id, name: row.block_name } : { name: '-' },
                campus: row.campus_id ? { id: row.campus_id, name: row.campus_name } : { name: '-' }
            };
        }).filter(item => item !== null);

        app_end = process.hrtime.bigint();

        const serialize_start = process.hrtime.bigint();
        // A1: Stringify merely for measuring serialization impact/bandwidth, without modifying the code path response object.
        const responseJsonStr = JSON.stringify(extendedData);
        const serialize_end = process.hrtime.bigint();

        // Return original res.json(extendedData) response per constraints!
        res.json(extendedData);

        const end_ts = process.hrtime.bigint();

        // Output Evidence Pack metrics
        console.log(JSON.stringify({
            "t": "req",
            "id": reqId,
            "route": "/api/leases/details",
            "db_ms": Number(db_end - db_start) / 1000000,
            "app_ms": Number(app_end - app_start) / 1000000,
            "json_ms": Number(serialize_end - serialize_start) / 1000000,
            "bytes": Buffer.byteLength(responseJsonStr, 'utf8'),
            "status": 200,
            "total_ms": Number(end_ts - start_ts) / 1000000
        }));

    } catch (err) {
        const log = createLoggerWithReq(req);
        log.error({ err }, 'Database error');
        res.status(500).json({ error: 'Database error' });
    }
});
// UPDATE lease (dates, financials)
// SECURITY: Require ADMIN or MANAGER role
router.put('/:companyId', requireRole(['ADMIN', 'MANAGER']),
    validate([
        body('startDate').optional().isISO8601().withMessage('Start date must be a valid date'),
        body('endDate').optional().isISO8601().withMessage('End date must be a valid date'),
        body('monthlyRent').optional().isFloat({ min: 0 }).withMessage('Monthly rent must be a positive number'),
        body('operatingFee').optional().isFloat({ min: 0 }).withMessage('Operating fee must be a positive number')
    ]),
    async (req: AuthRequest, res: any) => {
        const { companyId } = req.params;
        const updates = req.body;

        try {
            const leaseRes = await query('SELECT * FROM leases WHERE company_id = $1 AND deleted_at IS NULL', [companyId]);

            if (leaseRes.rows.length > 0) {
                const lease = leaseRes.rows[0];
                // Recalculate unit_price_per_sqm if monthlyRent is updated and unit exists
                let unitPrice = lease.unit_price_per_sqm || 0;
                if (updates.monthlyRent !== undefined && lease.unit_id) {
                    const unitRes = await query('SELECT area_sqm FROM units WHERE id = $1', [lease.unit_id]);
                    if (unitRes.rows.length > 0) {
                        const area = parseFloat(unitRes.rows[0].area_sqm);
                        if (area > 0) {
                            unitPrice = parseFloat(updates.monthlyRent) / area;
                        }
                    }
                }

                // Update active lease
                await query(
                    `UPDATE leases SET
                    start_date = COALESCE($1, start_date),
                    end_date = COALESCE($2, end_date),
                    monthly_rent = COALESCE($3, monthly_rent),
                    operating_fee = COALESCE($4, operating_fee),
                    unit_price_per_sqm = $5
                 WHERE company_id = $6 AND deleted_at IS NULL`,
                    [updates.startDate, updates.endDate, updates.monthlyRent, updates.operatingFee, unitPrice, companyId]
                );
                await audit(
                    'LEASE',
                    'UPDATE',
                    `Sözleşme güncellendi.`,
                    undefined,
                    undefined,
                    req.user?.username,
                    req.user?.role
                );
            } else {
                // Try updating contract template if no lease (Pending state)
                const companyRes = await query('SELECT * FROM companies WHERE id = $1 AND deleted_at IS NULL', [companyId]);
                if (companyRes.rows.length > 0) {
                    const company = companyRes.rows[0];
                    if (company.contract_template) {
                        const newTemplate = {
                            ...company.contract_template,
                            startDate: updates.startDate || company.contract_template.startDate,
                            endDate: updates.endDate || company.contract_template.endDate
                        };
                        await query('UPDATE companies SET contract_template = $1 WHERE id = $2', [JSON.stringify(newTemplate), companyId]);
                        await audit(
                            'COMPANY',
                            'UPDATE',
                            `Taslak sözleşme güncellendi.`,
                            undefined,
                            undefined,
                            req.user?.username,
                            req.user?.role
                        );
                    }
                }
            }
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Database error' });
        }
    });

// SOFT DELETE lease (Termination)
// SECURITY: Require ADMIN or MANAGER role
// SECURITY: Wrapped in transaction for atomicity
router.delete('/:companyId', requireRole(['ADMIN', 'MANAGER']), async (req: AuthRequest, res) => {
    const { companyId } = req.params;
    try {
        return await transaction(async (client) => {
            // 1. Get company name for audit
            const companyRes = await client.query('SELECT * FROM companies WHERE id = $1 AND deleted_at IS NULL', [companyId]);
            if (companyRes.rows.length === 0) {
                return res.status(404).json({ error: 'Company not found' });
            }
            const company = companyRes.rows[0];

            // 2. Update Unit to VACANT
            await client.query('UPDATE units SET company_id = NULL, reservation_company_id = NULL, status = \'VACANT\' WHERE company_id = $1 AND deleted_at IS NULL', [companyId]);

            // 3. Soft Delete Lease
            await client.query('UPDATE leases SET deleted_at = CURRENT_TIMESTAMP WHERE company_id = $1', [companyId]);

            // 4. Soft Delete Company
            await client.query('UPDATE companies SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [companyId]);

            // 5. Soft Delete related records
            await client.query('UPDATE company_documents SET deleted_at = CURRENT_TIMESTAMP WHERE company_id = $1', [companyId]);
            await client.query('UPDATE company_score_entries SET deleted_at = CURRENT_TIMESTAMP WHERE company_id = $1', [companyId]);

            await audit(
                'LEASE',
                'DELETE',
                `Sözleşme ve firma silindi (soft delete): ${company.name}`,
                undefined,
                undefined,
                req.user?.username,
                req.user?.role
            );
            res.status(204).send();
        });
    } catch (err: any) {
        const status = err.status || 500;
        const message = err.message || 'Database error';
        res.status(status).json({ error: message });
    }
});

// GET documents for a specific lease
// SECURITY: Require ADMIN or MANAGER role
router.get('/:id/documents', requireRole(['ADMIN', 'MANAGER']), async (req: AuthRequest, res) => {
    const { id } = req.params;
    try {
        const result = await query('SELECT documents FROM leases WHERE id = $1 AND deleted_at IS NULL', [id]);

        if (result.rows.length === 0) {
            // No active lease exists, return empty array
            return res.json([]);
        }

        res.json(result.rows[0].documents || []);
    } catch (err) {
        const log = createLoggerWithReq(req);
        log.error({ err }, 'Database error');
        res.status(500).json({ error: 'Database error' });
    }
});

// ADD document to a lease
// SECURITY: Require ADMIN or MANAGER role
router.post('/:id/documents', requireRole(['ADMIN', 'MANAGER']),
    validate([
        body('name').trim().isLength({ min: 1, max: 255 }).withMessage('Document name is required'),
        body('url').isString().withMessage('Document URL is required'),
        body('type').optional().trim().isLength({ max: 50 })
    ]),
    async (req: AuthRequest, res: any) => {
        const { id } = req.params;
        const { name, url, type } = req.body;

        const validation = validateBase64File(url);
        if (!validation.isValid) {
            return res.status(400).json({ error: validation.error });
        }

        try {
            // Check if lease exists
            const leaseRes = await query('SELECT * FROM leases WHERE id = $1 AND deleted_at IS NULL', [id]);

            if (leaseRes.rows.length === 0) {
                return res.status(404).json({ error: 'No active lease found for this company' });
            }

            const lease = leaseRes.rows[0];
            const documents = lease.documents || [];

            // Check if document with same name already exists
            const existingDoc = documents.find((doc: any) => doc.name === name);
            if (existingDoc) {
                return res.status(400).json({ error: 'A document with this name already exists' });
            }

            // Add new document
            const newDocument = {
                name,
                url,
                type: type || 'CONTRACT'
            };

            const updatedDocuments = [...documents, newDocument];

            await query(
                'UPDATE leases SET documents = $1 WHERE id = $2 AND deleted_at IS NULL',
                [JSON.stringify(updatedDocuments), id]
            );

            await audit(
                'LEASE',
                'UPDATE',
                `Belge eklendi: ${name}`,
                undefined,
                undefined,
                req.user?.username,
                req.user?.role
            );

            res.status(201).json({ success: true, document: newDocument });
        } catch (err) {
            const log = createLoggerWithReq(req);
            log.error({ err }, 'Database error');
            res.status(500).json({ error: 'Database error' });
        }
    });

// DELETE document from a lease
// SECURITY: Require ADMIN or MANAGER role
router.delete('/:id/documents/:docName', requireRole(['ADMIN', 'MANAGER']), async (req: AuthRequest, res) => {
    const { id, docName } = req.params;

    try {
        const leaseRes = await query('SELECT documents FROM leases WHERE id = $1 AND deleted_at IS NULL', [id]);
        if (leaseRes.rows.length === 0) return res.status(404).json({ error: 'Lease not found' });

        let documents = leaseRes.rows[0].documents || [];
        const initialLength = documents.length;
        documents = documents.filter((d: any) => d.name !== docName);
        if (documents.length === initialLength) return res.status(404).json({ error: 'Document not found' });

        await query('UPDATE leases SET documents = $1 WHERE id = $2', [JSON.stringify(documents), id]);

        await audit(
            'LEASE',
            'UPDATE',
            `Belge silindi: ${docName}`,
            undefined,
            undefined,
            req.user?.username,
            req.user?.role
        );

        res.status(204).send();
    } catch (err) {
        const log = createLoggerWithReq(req);
        log.error({ err }, 'Database error');
        res.status(500).json({ error: 'Database error' });
    }
});

export default router;
