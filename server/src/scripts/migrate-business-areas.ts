import { query } from '../db';

async function migrate() {
    console.log('Starting business areas migration...');
    try {
        // Ensure table exists just in case
        await query(`
            CREATE TABLE IF NOT EXISTS business_areas (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                name VARCHAR(255) UNIQUE NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
            );
        `);
        console.log('Verified business_areas table exists.');

        const result = await query(`
            SELECT DISTINCT unnest(business_areas) as area 
            FROM companies 
            WHERE business_areas IS NOT NULL AND array_length(business_areas, 1) > 0
        `);

        console.log(`Found ${result.rows.length} unique business areas in companies.`);

        for (const row of result.rows) {
            const area = row.area;
            try {
                await query('INSERT INTO business_areas (name) VALUES ($1) ON CONFLICT DO NOTHING', [area]);
                console.log(`Inserted: ${area}`);
            } catch (err) {
                console.error(`Failed to insert ${area}:`, err);
            }
        }
        console.log('Migration completed successfully.');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        process.exit(0);
    }
}

migrate();
