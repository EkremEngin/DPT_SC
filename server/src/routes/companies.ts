import { Router } from 'express';
import { query } from '../db';
import { audit } from '../services/auditService';
import { v4 as uuidv4 } from 'uuid';
import { AuthRequest } from '../middleware/authMiddleware';
import { requireRole } from '../middleware/roleMiddleware';
import { validate } from '../middleware/validationMiddleware';
import { body } from 'express-validator';
import { getPaginationParams, getSqlPagination } from '../utils/pagination';
import { cacheConfig } from '../middleware/cacheMiddleware';
import { createLoggerWithReq } from '../utils/logger';
import { validateBase64File } from '../utils/fileValidation';

const router = Router();

// GET all companies (optimized - only fetches list data, use /:id for full details)
// Apply semi-static caching (1 minute) for company list
router.get('/', cacheConfig.semiStatic, async (req, res) => {
    try {
        const params = getPaginationParams(req);
        const { limit, offset } = getSqlPagination(params);

        // Get total count and companies in parallel (soft delete filter)
        const [countResult, result] = await Promise.all([
            query('SELECT COUNT(*) FROM companies WHERE deleted_at IS NULL'),
            query(`
                SELECT
                    c.id,
                    c.name,
                    c.registration_number,
                    c.sector,
                    c.business_areas,
                    c.work_area,
                    c.manager_name,
                    c.manager_phone,
                    c.manager_email,
                    c.employee_count,
                    c.score,
                    c.contract_template,
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
                    ) as documents
                FROM companies c
                WHERE c.deleted_at IS NULL
                ORDER BY c.name
                LIMIT $1 OFFSET $2
            `, [limit, offset])
        ]);

        const totalCount = parseInt(countResult.rows[0].count);

        const companies = result.rows.map(row => ({
            id: row.id,
            name: row.name,
            registrationNumber: row.registration_number,
            sector: row.sector,
            businessAreas: row.business_areas,
            workArea: row.work_area,
            managerName: row.manager_name,
            managerPhone: row.manager_phone,
            managerEmail: row.manager_email,
            employeeCount: row.employee_count,
            score: parseFloat(row.score),
            contractTemplate: row.contract_template,
            scoreEntries: row.score_entries || [],
            documents: row.documents || []
        }));

        // Return with pagination metadata (preserving existing response structure)
        res.json({
            data: companies,
            pagination: {
                page: params.page,
                limit: params.limit,
                totalCount,
                totalPages: Math.ceil(totalCount / params.limit)
            }
        });
    } catch (err) {
        const log = createLoggerWithReq(req);
        log.error({ err }, 'Database error');
        res.status(500).json({ error: 'Database error' });
    }
});

// GET single company with semi-static caching
router.get('/:id', cacheConfig.semiStatic, async (req, res) => {
    const { id } = req.params;
    try {
        const result = await query('SELECT * FROM companies WHERE id = $1 AND deleted_at IS NULL', [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Company not found' });

        const company = result.rows[0];

        const scoresResult = await query('SELECT * FROM company_score_entries WHERE company_id = $1 AND deleted_at IS NULL', [id]);
        const docsResult = await query('SELECT * FROM company_documents WHERE company_id = $1 AND deleted_at IS NULL', [id]);

        const fullCompany = {
            id: company.id,
            name: company.name,
            registrationNumber: company.registration_number,
            sector: company.sector,
            businessAreas: company.business_areas,
            workArea: company.work_area,
            managerName: company.manager_name,
            managerPhone: company.manager_phone,
            managerEmail: company.manager_email,
            employeeCount: company.employee_count,
            score: parseFloat(company.score),
            contractTemplate: company.contract_template,
            scoreEntries: scoresResult.rows.map(s => ({
                id: s.id,
                type: s.type,
                description: s.description,
                points: parseFloat(s.points),
                date: s.date,
                note: s.note,
                documents: s.documents
            })),
            documents: docsResult.rows.map(d => ({
                name: d.name,
                url: d.url,
                type: d.type
            }))
        };

        res.json(fullCompany);
    } catch (err) {
        res.status(500).json({ error: 'Database error' });
    }
});

// POST new company
// SECURITY: Require ADMIN or MANAGER role
router.post('/', requireRole(['ADMIN', 'MANAGER']),
    validate([
        body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Company name must be 2-100 characters'),
        body('registrationNumber').optional().trim(),
        body('sector').trim().isLength({ min: 2, max: 50 }).withMessage('Sector must be 2-50 characters'),
        body('workArea').optional().trim(),
        body('managerName').trim().isLength({ min: 2, max: 100 }).withMessage('Manager name must be 2-100 characters'),
        body('managerPhone').optional().isString().isLength({ max: 255 }).withMessage('Phone must be a valid string (max 255)'),
        body('managerEmail').optional().isString().isLength({ max: 255 }).withMessage('Email must be a valid string (max 255)'),
        body('employeeCount').optional().isInt({ min: 0 }).withMessage('Employee count must be a positive integer')
    ]),
    async (req: AuthRequest, res: any) => {
        const data = req.body;
        try {
            // Check Duplicate (exclude soft-deleted records)
            const existing = await query('SELECT id FROM companies WHERE LOWER(name) = LOWER($1) AND deleted_at IS NULL', [data.name]);
            if (existing.rows.length > 0) {
                return res.status(400).json({ error: "Bu isimde bir firma zaten kayıtlı." });
            }

            // Validate Sector
            const sectorRes = await query('SELECT id FROM sectors WHERE name = $1 AND deleted_at IS NULL', [data.sector]);
            if (sectorRes.rows.length === 0) {
                return res.status(400).json({ error: "Geçersiz veya silinmiş sektör seçimi." });
            }

            const result = await query(
                `INSERT INTO companies (
                name, registration_number, sector, business_areas, work_area, 
                manager_name, manager_phone, manager_email, employee_count, 
                score, contract_template
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, $10)
            RETURNING *`,
                [
                    data.name,
                    data.registrationNumber,
                    data.sector,
                    [data.sector], // Default business area
                    data.workArea,
                    data.managerName,
                    data.managerPhone,
                    data.managerEmail,
                    data.employeeCount,
                    data.contractTemplate ? JSON.stringify(data.contractTemplate) : null
                ]
            );

            const newCompany = result.rows[0];

            await audit(
                'COMPANY',
                'CREATE',
                `${newCompany.name} firması oluşturuldu.`,
                undefined,
                undefined,
                req.user?.username,
                req.user?.role
            );
            res.status(201).json(newCompany);
        } catch (err) {
            const log = createLoggerWithReq(req);
            log.error({ err }, 'Database error');
            res.status(500).json({ error: 'Database error' });
        }
    });

// UPDATE company
// SECURITY: Require ADMIN or MANAGER role
router.put('/:id', requireRole(['ADMIN', 'MANAGER']),
    validate([
        body('name').optional({ checkFalsy: true }).trim().isLength({ min: 2, max: 100 }).withMessage('Company name must be 2-100 characters'),
        body('sector').optional({ checkFalsy: true }).trim().isLength({ min: 2, max: 50 }).withMessage('Sector must be 2-50 characters'),
        body('managerName').optional({ checkFalsy: true }).trim().isLength({ min: 2, max: 100 }).withMessage('Manager name must be 2-100 characters'),
        body('managerPhone').optional({ checkFalsy: true }).trim().isString().isLength({ max: 255 }).withMessage('Phone must be a valid string (max 255)'),
        body('managerEmail').optional({ checkFalsy: true }).trim().isString().isLength({ max: 255 }).withMessage('Email must be a valid string (max 255)'),
        body('employeeCount').optional({ checkFalsy: true }).isInt({ min: 0 }).withMessage('Employee count must be a positive integer')
    ]),
    async (req: AuthRequest, res: any) => {
        const { id } = req.params;
        const updates = req.body;

        try {
            const companyRes = await query('SELECT * FROM companies WHERE id = $1 AND deleted_at IS NULL', [id]);
            if (companyRes.rows.length === 0) return res.status(404).json({ error: 'Company not found' });

            // Validate Sector Update
            if (updates.sector) {
                const sectorRes = await query('SELECT id FROM sectors WHERE name = $1 AND deleted_at IS NULL', [updates.sector]);
                if (sectorRes.rows.length === 0) {
                    return res.status(400).json({ error: "Geçersiz veya silinmiş sektör seçimi." });
                }
            }

            // Build dynamic query
            // This is simplified. In production, use a query builder or careful loop.
            // We handle specific fields allowed for update in db.ts updateCompany

            await query(
                `UPDATE companies SET
                name = COALESCE($1, name),
                sector = COALESCE($2, sector),
                manager_name = COALESCE($3, manager_name),
                manager_phone = COALESCE($4, manager_phone),
                manager_email = COALESCE($5, manager_email),
                employee_count = COALESCE($6, employee_count),
                business_areas = COALESCE($7::text[], business_areas)
             WHERE id = $8 AND deleted_at IS NULL`,
                [
                    updates.name,
                    updates.sector,
                    updates.managerName,
                    updates.managerPhone,
                    updates.managerEmail,
                    updates.employeeCount,
                    updates.businessAreas,
                    id
                ]
            );

            await audit(
                'COMPANY',
                'UPDATE',
                `${updates.name || companyRes.rows[0].name} firma bilgileri güncellendi.`,
                undefined,
                undefined,
                req.user?.username,
                req.user?.role
            );
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Database error' });
        }
    });

// ADD document to company
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
            const companyRes = await query('SELECT * FROM companies WHERE id = $1 AND deleted_at IS NULL', [id]);
            if (companyRes.rows.length === 0) return res.status(404).json({ error: 'Company not found' });

            await query(
                'INSERT INTO company_documents (company_id, name, url, type) VALUES ($1, $2, $3, $4)',
                [id, name, url, type || 'CONTRACT']
            );

            await audit(
                'COMPANY',
                'UPDATE',
                `Belge eklendi: ${name}`,
                undefined,
                undefined,
                req.user?.username,
                req.user?.role
            );
            res.status(201).json({ success: true });
        } catch (err) {
            const log = createLoggerWithReq(req);
            log.error({ err }, 'Database error');
            res.status(500).json({ error: 'Database error' });
        }
    });

// DELETE document from company
// SECURITY: Require ADMIN or MANAGER role
router.delete('/:id/documents/:docName', requireRole(['ADMIN', 'MANAGER']), async (req: AuthRequest, res) => {
    const { id, docName } = req.params;
    try {
        const companyRes = await query('SELECT * FROM companies WHERE id = $1 AND deleted_at IS NULL', [id]);
        if (companyRes.rows.length === 0) return res.status(404).json({ error: 'Company not found' });

        // Soft delete document
        await query('UPDATE company_documents SET deleted_at = CURRENT_TIMESTAMP WHERE company_id = $1 AND name = $2 AND deleted_at IS NULL', [id, docName]);

        await audit(
            'COMPANY',
            'UPDATE',
            `Belge silindi: ${docName}`,
            undefined,
            undefined,
            req.user?.username,
            req.user?.role
        );
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ error: 'Database error' });
    }
});

// ADD score entry to company
// SECURITY: Require ADMIN or MANAGER role
router.post('/:id/scores', requireRole(['ADMIN', 'MANAGER']),
    validate([
        body('type').trim().isLength({ min: 1, max: 50 }).withMessage('Score type is required'),
        body('description').optional().trim().isLength({ max: 500 }),
        body('points').isFloat({ min: -100, max: 100 }).withMessage('Points must be between -100 and 100'),
        body('note').optional().trim().isLength({ max: 1000 }),
        body('documents').optional().isArray(),
        body('documents.*.name').optional().isString().isLength({ max: 255 }),
        body('documents.*.url').optional().isString(),
        body('documents.*.type').optional().isString().isLength({ max: 50 })
    ]),
    async (req: AuthRequest, res: any) => {
        const { id } = req.params;
        const { type, description, points, note, documents } = req.body;
        try {
            const companyRes = await query('SELECT * FROM companies WHERE id = $1 AND deleted_at IS NULL', [id]);
            if (companyRes.rows.length === 0) return res.status(404).json({ error: 'Company not found' });

            if (documents && Array.isArray(documents)) {
                for (const doc of documents) {
                    if (doc.url) {
                        const validation = validateBase64File(doc.url);
                        if (!validation.isValid) {
                            return res.status(400).json({ error: `Document validation failed for '${doc.name || 'untitled'}': ${validation.error}` });
                        }
                    }
                }
            }

            const result = await query(
                `INSERT INTO company_score_entries (company_id, type, description, points, note, documents)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
                [id, type, description, points, note, JSON.stringify(documents || [])]
            );

            // Update company score (exclude soft-deleted entries)
            const scoresRes = await query('SELECT COALESCE(SUM(points), 0) as total FROM company_score_entries WHERE company_id = $1 AND deleted_at IS NULL', [id]);
            const newScore = parseFloat(scoresRes.rows[0].total);
            await query('UPDATE companies SET score = $1 WHERE id = $2', [newScore, id]);

            await audit(
                'COMPANY',
                'UPDATE',
                `Puan eklendi: ${type} (+${points})`,
                undefined,
                undefined,
                req.user?.username,
                req.user?.role
            );
            res.status(201).json(result.rows[0]);
        } catch (err) {
            const log = createLoggerWithReq(req);
            log.error({ err }, 'Database error');
            res.status(500).json({ error: 'Database error' });
        }
    });

// DELETE score entry from company
// SECURITY: Require ADMIN or MANAGER role
router.delete('/:id/scores/:scoreId', requireRole(['ADMIN', 'MANAGER']), async (req: AuthRequest, res) => {
    const { id, scoreId } = req.params;
    try {
        const scoreRes = await query('SELECT * FROM company_score_entries WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL', [scoreId, id]);
        if (scoreRes.rows.length === 0) return res.status(404).json({ error: 'Score entry not found' });

        // Soft delete score entry
        await query('UPDATE company_score_entries SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [scoreId]);

        // Update company score (exclude soft-deleted entries)
        const scoresRes = await query('SELECT COALESCE(SUM(points), 0) as total FROM company_score_entries WHERE company_id = $1 AND deleted_at IS NULL', [id]);
        const newScore = parseFloat(scoresRes.rows[0].total);
        await query('UPDATE companies SET score = $1 WHERE id = $2', [newScore, id]);

        await audit(
            'COMPANY',
            'UPDATE',
            `Puan silindi: ${scoreRes.rows[0].type}`,
            undefined,
            undefined,
            req.user?.username,
            req.user?.role
        );
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ error: 'Database error' });
    }
});

// SOFT DELETE company
// SECURITY: Require ADMIN or MANAGER role
router.delete('/:id', requireRole(['ADMIN', 'MANAGER']), async (req: AuthRequest, res) => {
    const { id } = req.params;
    try {
        const companyRes = await query('SELECT * FROM companies WHERE id = $1 AND deleted_at IS NULL', [id]);
        if (companyRes.rows.length === 0) return res.status(404).json({ error: 'Company not found' });

        const company = companyRes.rows[0];

        // Soft delete the company
        await query('UPDATE companies SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);

        // Also soft delete related records
        await query('UPDATE company_documents SET deleted_at = CURRENT_TIMESTAMP WHERE company_id = $1', [id]);
        await query('UPDATE company_score_entries SET deleted_at = CURRENT_TIMESTAMP WHERE company_id = $1', [id]);

        await audit(
            'COMPANY',
            'DELETE',
            `${company.name} firması silindi (soft delete).`,
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
