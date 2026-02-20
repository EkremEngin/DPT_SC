import { query } from '../db';

async function cleanupTestData() {
    try {
        // Clean up test users
        await query("DELETE FROM users WHERE username LIKE 'test-%' OR username LIKE 'delete-%' OR username LIKE 'create-%' OR username LIKE 'manager-%'");
        console.log('Test users cleaned up');

        // Clean up test companies
        await query("DELETE FROM companies WHERE name LIKE 'Test%' OR name LIKE '%Test Company%'");
        console.log('Test companies cleaned up');

        // Clean up test campuses
        await query("DELETE FROM campuses WHERE name LIKE 'Test%' OR name LIKE '%Test Campus%'");
        console.log('Test campuses cleaned up');

        process.exit(0);
    } catch (error) {
        console.error('Error cleaning up test data:', error);
        process.exit(1);
    }
}

cleanupTestData();
