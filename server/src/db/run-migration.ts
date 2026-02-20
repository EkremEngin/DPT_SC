import { query } from './index';
import * as fs from 'fs';
import * as path from 'path';

async function runMigration(migrationFile: string) {
    try {
        const migrationPath = path.join(__dirname, 'migrations', migrationFile);
        let sql = fs.readFileSync(migrationPath, 'utf8');
        
        console.log(`Running migration: ${migrationFile}`);
        
        // Remove single-line comments but preserve newlines
        sql = sql.replace(/--.*$/gm, '');
        
        // Split by semicolon and execute each statement
        // Filter empty statements and whitespace-only
        const statements = sql
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0);
        
        console.log(`Found ${statements.length} SQL statements to execute`);
        
        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i];
            const preview = statement.substring(0, 60).replace(/\n/g, ' ');
            console.log(`[${i + 1}/${statements.length}] Executing: ${preview}...`);
            await query(statement);
        }
        
        console.log(`Migration ${migrationFile} completed successfully!`);
    } catch (error) {
        console.error(`Migration failed:`, error);
        throw error;
    }
}

// Run the Phase 5.2 optimization indexes migration
// Pass migration file as argument: npm run db:migrate 004_add_phase5_indexes.sql
const migrationFile = process.argv[2] || '004_add_phase5_indexes.sql';

runMigration(migrationFile)
    .then(() => {
        console.log('All migrations completed!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Migration failed:', error);
        process.exit(1);
    });
