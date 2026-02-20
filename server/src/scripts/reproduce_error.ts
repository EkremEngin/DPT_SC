import axios from 'axios';

const API_URL = 'http://localhost:3001/api';

async function reproduce() {
    try {
        console.log('1. Attempting login...');
        const loginRes = await axios.post(`${API_URL}/auth/login`, {
            username: 'Ekoreiz54',
            password: 'Ekoreiz54!'
        });

        const token = loginRes.data.accessToken;
        console.log('✅ Login successful. Token obtained.');

        console.log('2. Attempting to create user...');
        const username = `TestUser_${Date.now()}`;
        const createRes = await axios.post(`${API_URL}/users`, {
            username,
            password: 'password123',
            email: `${username}@example.com`,
            role: 'VIEWER'
        }, {
            headers: { Authorization: `Bearer ${token}` }
        });

        console.log('✅ User created successfully:', createRes.data);

    } catch (error: any) {
        console.log('❌ Error occurred:');
        if (error.response) {
            console.log('Status:', error.response.status);
            console.log('Data:', error.response.data);
        } else {
            console.log('Message:', error.message);
        }
    }
}

reproduce();
