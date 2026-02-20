import { query, getClient } from './index';
import fs from 'fs';
import path from 'path';

const initDb = async () => {
    const client = await getClient();
    try {
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');

        console.log('Running schema.sql...');
        await client.query(schemaSql);
        console.log('Database initialized successfully.');
    } catch (err) {
        console.error('Error initializing database:', err);
        process.exit(1);
    } finally {
        client.release();
        process.exit(0);
    }
};

initDb();
