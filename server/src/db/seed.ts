
import pool from './index';
import {
    rizeData, atasehirData, atasehirCommonAreaData,
    cekmekoyData, cekmekoyOrtakAlanData, cekmekoyKuluckaData
} from './seedData';
import { hashPassword } from '../services/authService';

const sanitize = (str: string) => str.replace(/'/g, "''");

async function seed() {
    // SECURITY: Prevent seed execution in production
    if (process.env.NODE_ENV === 'production') {
        throw new Error('❌ SEED BLOCKED: Database seeding is not allowed in production environment.');
    }

    console.log('🌱 Seeding database...');
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Clear existing data
        console.log('Cleaning up...');
        await client.query('TRUNCATE audit_logs, leases, units, company_documents, company_score_entries, companies, blocks, campuses CASCADE');

        // 2. Insert Campuses
        console.log('Inserting Campuses...');
        const atasehirRes = await client.query(`
            INSERT INTO campuses (name, address, max_office_cap, max_area_cap, max_floors_cap)
            VALUES ('Ataşehir Kampüsü', 'Ataşehir Teknoloji Bölgesi', 500, 50000, 50)
            RETURNING id
        `);
        const atasehirId = atasehirRes.rows[0].id;

        const cekmekoyRes = await client.query(`
            INSERT INTO campuses (name, address, max_office_cap, max_area_cap, max_floors_cap)
            VALUES ('Çekmeköy Kampüsü', 'Çekmeköy Kampüs Alanı', 300, 8391.5, 5)
            RETURNING id
        `);
        const cekmekoyId = cekmekoyRes.rows[0].id;

        const rizeRes = await client.query(`
            INSERT INTO campuses (name, address, max_office_cap, max_area_cap, max_floors_cap)
            VALUES ('Rize Kampüsü', 'Rize Sahil Dolgu Alanı', 200, 15000, 10)
            RETURNING id
        `);
        const rizeId = rizeRes.rows[0].id;


        // 3. Insert Blocks
        console.log('Inserting Blocks...');

        // Rize A1 Blok
        const rizeFloors = [{ floor: 'Zemin', totalSqM: 392.5 }];
        const rizeBlockRes = await client.query(`
            INSERT INTO blocks (campus_id, name, max_floors, max_offices, max_area_sqm, floor_capacities, default_operating_fee, sqm_per_employee)
            VALUES ($1, 'Rize A1 Blok', 1, 50, 392.5, $2, 150, 5)
            RETURNING id
        `, [rizeId, JSON.stringify(rizeFloors)]);
        const rizeBlockId = rizeBlockRes.rows[0].id;

        // Ataşehir Ana Bina
        const atasehirFloors = [
            { floor: '25', totalSqM: 157 }, { floor: '24', totalSqM: 763 }, { floor: '23A', totalSqM: 763 },
            { floor: '23', totalSqM: 763 }, { floor: '22A', totalSqM: 763 }, { floor: '22', totalSqM: 763 },
            { floor: '21', totalSqM: 763 }, { floor: '20', totalSqM: 763 }, { floor: '19', totalSqM: 762 },
            { floor: '18', totalSqM: 728 }, { floor: '17', totalSqM: 763 }, { floor: '16', totalSqM: 763 },
            { floor: '15', totalSqM: 763 }, { floor: '14', totalSqM: 763 }, { floor: '13', totalSqM: 763 },
            { floor: '12', totalSqM: 713 }, { floor: '11', totalSqM: 763 }, { floor: '10', totalSqM: 763 },
            { floor: '9', totalSqM: 763 }, { floor: '8', totalSqM: 763 }, { floor: '7', totalSqM: 763 },
            { floor: '6', totalSqM: 753 }, { floor: '5', totalSqM: 763 }, { floor: '4', totalSqM: 584 },
            { floor: '3', totalSqM: 763 }, { floor: '2A', totalSqM: 763 }, { floor: '2', totalSqM: 606 },
            { floor: '1A', totalSqM: 442 }, { floor: '1', totalSqM: 357 }, { floor: 'Zemin Asma', totalSqM: 553 },
            { floor: '-1', totalSqM: 2300 }
        ];
        const atasehirBlockRes = await client.query(`
            INSERT INTO blocks (campus_id, name, max_floors, max_offices, max_area_sqm, floor_capacities, default_operating_fee, sqm_per_employee)
            VALUES ($1, 'Ataşehir - Ana Bina', ${atasehirFloors.length}, 200, ${atasehirFloors.reduce((sum, f) => sum + f.totalSqM, 0)}, $2, 450, 5.5)
            RETURNING id
        `, [atasehirId, JSON.stringify(atasehirFloors)]);
        const atasehirBlockId = atasehirBlockRes.rows[0].id;

        // Ataşehir Ortak Alan
        const atasehirCommonFloors = [{ floor: 'Zemin', totalSqM: 3445 }];
        const atasehirCommonBlockRes = await client.query(`
            INSERT INTO blocks (campus_id, name, max_floors, max_offices, max_area_sqm, floor_capacities, default_operating_fee, sqm_per_employee)
            VALUES ($1, 'Ortak Alan', 1, 100, 3445, $2, 320, 5)
            RETURNING id
        `, [atasehirId, JSON.stringify(atasehirCommonFloors)]);
        const atasehirCommonBlockId = atasehirCommonBlockRes.rows[0].id;

        // Çekmeköy Blocks
        // 1. Çekmeköy A1 Blok
        const cekmekoyFloors = [
            { floor: '5', totalSqM: 1690 }, { floor: '4', totalSqM: 1462.5 },
            { floor: '3', totalSqM: 1569 }, { floor: '2', totalSqM: 1690 },
            { floor: '1', totalSqM: 1980 }
        ];
        const cekmekoyBlockRes = await client.query(`
            INSERT INTO blocks (campus_id, name, max_floors, max_offices, max_area_sqm, floor_capacities, default_operating_fee, sqm_per_employee)
            VALUES ($1, 'Çekmeköy A1 Blok', 5, 100, 8391.5, $2, 450, 5)
            RETURNING id
        `, [cekmekoyId, JSON.stringify(cekmekoyFloors)]);
        const cekmekoyBlockId = cekmekoyBlockRes.rows[0].id;

        // 2. Çekmeköy Ortak Alan
        const cekmekoyCommonFloors = [{ floor: 'Zemin', totalSqM: 690 }];
        const cekmekoyCommonBlockRes = await client.query(`
            INSERT INTO blocks (campus_id, name, max_floors, max_offices, max_area_sqm, floor_capacities, default_operating_fee, sqm_per_employee)
            VALUES ($1, 'Çekmeköy - Ortak Alan A1', 1, 50, 690, $2, 320, 5)
            RETURNING id
        `, [cekmekoyId, JSON.stringify(cekmekoyCommonFloors)]);
        const cekmekoyCommonBlockId = cekmekoyCommonBlockRes.rows[0].id;

        // 3. Çekmeköy Kuluçka
        const cekmekoyKuluckaFloors = [{ floor: 'Zemin', totalSqM: 180 }];
        const cekmekoyKuluckaBlockRes = await client.query(`
            INSERT INTO blocks (campus_id, name, max_floors, max_offices, max_area_sqm, floor_capacities, default_operating_fee, sqm_per_employee)
            VALUES ($1, 'Çekmeköy Kuluçka', 1, 10, 180, $2, 320, 6.5)
            RETURNING id
        `, [cekmekoyId, JSON.stringify(cekmekoyKuluckaFloors)]);
        const cekmekoyKuluckaBlockId = cekmekoyKuluckaBlockRes.rows[0].id;


        // 4. Helper to insert company, unit, lease
        const processData = async (data: any[], blockId: string) => {
            for (let i = 0; i < data.length; i++) {
                const item = data[i];

                // Create Company
                const companyRes = await client.query(`
                    INSERT INTO companies (name, sector, manager_name, manager_phone, manager_email, business_areas)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    RETURNING id
                `, [
                    item.name,
                    item.sector || 'Belirtilmedi',
                    item.manager || null,
                    item.phone || null,
                    item.email || null,
                    item.sector ? [item.sector] : []
                ]);
                const companyId = companyRes.rows[0].id;

                // Create Unit
                if (item.floor) {
                    const unitRes = await client.query(`
                        INSERT INTO units (block_id, number, floor, area_sqm, status, company_id)
                        VALUES ($1, $2, $3, $4, 'OCCUPIED', $5)
                        RETURNING id
                    `, [blockId, `No. ${i + 1}`, item.floor, item.area || 0, companyId]);
                    const unitId = unitRes.rows[0].id;

                    // Create Lease
                    await client.query(`
                        INSERT INTO leases (unit_id, company_id, start_date, end_date, monthly_rent)
                        VALUES ($1, $2, CURRENT_DATE, CURRENT_DATE + INTERVAL '1 year', $3)
                    `, [unitId, companyId, (item.area || 0) * (item.rate || 0)]);
                }
            }
        };

        // 5. Process Data Arrays
        console.log('Processing Rize Data...');
        await processData(rizeData, rizeBlockId);

        console.log('Processing Ataşehir Data...');
        await processData(atasehirData, atasehirBlockId);

        console.log('Processing Ataşehir Common Area Data...');
        await processData(atasehirCommonAreaData, atasehirCommonBlockId);

        console.log('Processing Çekmeköy Data...');
        await processData(cekmekoyData, cekmekoyBlockId);

        console.log('Processing Çekmeköy Common Area Data...');
        await processData(cekmekoyOrtakAlanData, cekmekoyCommonBlockId);

        console.log('Processing Çekmeköy Kuluçka Data...');
        await processData(cekmekoyKuluckaData, cekmekoyKuluckaBlockId);

        // Seed Admin User
        console.log('Seeding admin user...');
        const adminPasswordHash = await hashPassword('Ekoreiz54!');
        // Check if admin exists
        const adminCheck = await client.query("SELECT * FROM users WHERE username = 'Ekoreiz54'");
        if (adminCheck.rows.length === 0) {
            await client.query(
                "INSERT INTO users (username, password_hash, role) VALUES ($1, $2, 'ADMIN')",
                ['Ekoreiz54', adminPasswordHash]
            );
            console.log('Admin user created.');
        } else {
            // Update password just in case
            await client.query(
                "UPDATE users SET password_hash = $1, role = 'ADMIN' WHERE username = 'Ekoreiz54'",
                [adminPasswordHash]
            );
            console.log('Admin user updated.');
        }

        await client.query('COMMIT');
        console.log('✅ Seeding complete!');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Seeding failed:', error);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

seed();
