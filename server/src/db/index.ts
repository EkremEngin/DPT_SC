import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { metrics } from '../utils/metrics';

// Load env vars
dotenv.config();

const connectionString = process.env.DATABASE_URL;

// SSL Configuration: rejectUnauthorized can be controlled via DB_SSL_REJECT_UNAUTHORIZED env var
// Default: true (secure) for production, can be set to 'false' for development with self-signed certs
const rejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false';

const pool = new Pool(
    connectionString
        ? {
            connectionString,
            ssl: {
                rejectUnauthorized
            }
        }
        : {
            host: process.env.DB_HOST,
            port: parseInt(process.env.DB_PORT || '5432'),
            database: process.env.DB_NAME,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
        }
);

console.log('DB Connection Config:', {
    connectionString: connectionString ? '***' : undefined,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    ssl: connectionString ? { rejectUnauthorized } : undefined,
});


pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
});

/**
 * P5.4: Query wrapper with automatic timing
 * Tracks query execution time for observability
 */
export const query = (text: string, params?: any[]) => {
    const startTime = Date.now();
    
    // Extract query type from SQL for categorization
    const queryType = extractQueryType(text);
    
    return pool.query(text, params)
        .then(result => {
            const queryTime = Date.now() - startTime;
            metrics.recordDbQuery(queryTime, queryType);
            return result;
        })
        .catch(error => {
            const queryTime = Date.now() - startTime;
            metrics.recordDbQuery(queryTime, queryType);
            throw error;
        });
};

export const getClient = () => pool.connect();

// SECURITY: Transaction helper for atomic multi-query operations
// P5.4: Enhanced with query timing tracking
export async function transaction<T>(
    callback: (client: import('pg').PoolClient) => Promise<T>
): Promise<T> {
    const client = await pool.connect();
    const transactionStart = Date.now();
    
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        
        // Record total transaction time
        const transactionTime = Date.now() - transactionStart;
        metrics.recordDbQuery(transactionTime, 'TRANSACTION');
        
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Extract SQL query type from query text
 * Used for categorizing metrics by operation type
 */
function extractQueryType(sql: string): string {
    const trimmed = sql.trim().toUpperCase();
    
    if (trimmed.startsWith('SELECT')) return 'SELECT';
    if (trimmed.startsWith('INSERT')) return 'INSERT';
    if (trimmed.startsWith('UPDATE')) return 'UPDATE';
    if (trimmed.startsWith('DELETE')) return 'DELETE';
    if (trimmed.startsWith('BEGIN')) return 'BEGIN';
    if (trimmed.startsWith('COMMIT')) return 'COMMIT';
    if (trimmed.startsWith('ROLLBACK')) return 'ROLLBACK';
    if (trimmed.startsWith('CREATE')) return 'CREATE';
    if (trimmed.startsWith('ALTER')) return 'ALTER';
    if (trimmed.startsWith('DROP')) return 'DROP';
    if (trimmed.startsWith('INDEX')) return 'INDEX';
    
    return 'OTHER';
}

export default pool;
