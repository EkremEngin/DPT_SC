
import pool from '../db';
import axios from 'axios';

const API_URL = 'http://localhost:3001/api';

async function checkAndReproduce() {
    try {
        const client = await pool.connect();

        // 1. Check existing emails
        const res = await client.query('SELECT username, email FROM users');
        console.log('Existing users:', res.rows);
        client.release();

        // 2. Try to create duplicate email
        console.log('\nTrying to create user with EXISTING email if any...');

        // Get an existing email if any
        const existingEmail = res.rows.find(u => u.email)?.email;

        if (existingEmail) {
            console.log(`Found existing email: ${existingEmail}. Trying to duplicate...`);

            // Login first
            const loginRes = await axios.post(`${API_URL}/auth/login`, {
                username: 'Ekoreiz54',
                password: 'Ekoreiz54!'
            });
            const token = loginRes.data.accessToken;

            try {
                await axios.post(`${API_URL}/users`, {
                    username: `DuplicateUser_${Date.now()}`,
                    password: 'password123',
                    email: existingEmail, // DUPLICATE!
                    role: 'VIEWER'
                }, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                console.log('❌ Created duplicate email user! (Should have failed)');
            } catch (err: any) {
                console.log('✅ Expected error occurred:');
                if (err.response) {
                    console.log(`Status: ${err.response.status}`);
                    console.log(`Data: ${JSON.stringify(err.response.data)}`);
                } else {
                    console.log(err.message);
                }
            }
        } else {
            console.log('No users with email found. Cannot test duplicate email.');
            // Create one with email
            console.log('Creating initial user with email...');
            // Login first
            const loginRes = await axios.post(`${API_URL}/auth/login`, {
                username: 'Ekoreiz54',
                password: 'Ekoreiz54!'
            });
            const token = loginRes.data.accessToken;

            const email = 'mail@ornek.com';
            await axios.post(`${API_URL}/users`, {
                username: `FirstEmailUser_${Date.now()}`,
                password: 'password123',
                email: email,
                role: 'VIEWER'
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            console.log(`Created user with ${email}. run this script AGAIN to test duplicate.`);
        }

    } catch (err) {
        console.error('Script error:', err);
    } finally {
        pool.end();
    }
}

checkAndReproduce();
