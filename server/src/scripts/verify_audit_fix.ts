
import { query } from '../db';
import { generateTokens } from '../services/authService';
import { audit } from '../services/auditService';
import jwt from 'jsonwebtoken';

async function verify() {
    try {
        console.log('--- Starting Audit Fix Verification ---');

        // 1. Simulate Login to get Token
        console.log('1. Logging in as Ekoreiz54...');
        const userRes = await query("SELECT * FROM users WHERE username = 'Ekoreiz54'");
        const user = userRes.rows[0];

        if (!user) {
            console.error('User Ekoreiz54 not found!');
            return;
        }

        const { accessToken } = generateTokens(user);
        console.log('Token generated.');

        const decoded: any = jwt.decode(accessToken);
        console.log('Decoded Token Payload:', decoded);

        if (!decoded.username) {
            console.error('ERROR: Token missing username property!');
        } else {
            console.log('Token has username:', decoded.username);
        }

        // 2. Simulate what logic does (calling audit)
        console.log('2. calling audit() manually with token data...');
        // Emulate the call in routes
        const mockReqUser = decoded;

        await audit(
            'LEASE',
            'UPDATE',
            'Test Audit Log from Verification Script',
            undefined,
            undefined,
            mockReqUser?.username,
            mockReqUser?.role
        );

        // 3. Check DB
        console.log('3. Checking DB for latest log...');
        const logRes = await query("SELECT * FROM audit_logs WHERE details = 'Test Audit Log from Verification Script' ORDER BY timestamp DESC LIMIT 1");

        if (logRes.rows.length === 0) {
            console.error('Log not found in DB!');
        } else {
            const log = logRes.rows[0];
            console.log('Log Found:');
            console.log('  User Name:', log.user_name);
            console.log('  User Role:', log.user_role);
            console.log('  Details:', log.details);

            if (log.user_name === 'Ekoreiz54') {
                console.log('SUCCESS: Log has correct username!');
            } else {
                console.error(`FAILURE: Log has '${log.user_name}' instead of 'Ekoreiz54'`);
            }
        }

    } catch (error) {
        console.error('Verification failed:', error);
    } finally {
        process.exit();
    }
}

verify();
