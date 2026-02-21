const axios = require('axios');

async function testBackend() {
    try {
        const response = await axios.post('http://localhost:3000/api/register', {
            username: "ironicfrvr2",
            password: "password123",
            license_key: "thLGpqPycdvRLEBGpwjwVeZDBJFWSdkD"
        }, {
            headers: { 'Content-Type': 'application/json' }
        });

        console.log("Success:", response.data);
    } catch (e) {
        if (e.response) {
            console.error("Failed:", e.response.status, e.response.data);
        } else {
            console.error(e.message);
        }
    }
}

testBackend();
