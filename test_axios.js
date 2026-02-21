const axios = require('axios');

const LUARMOR_API_KEY = "d0b08722bb7efeaf32228293a8c1191cf9db7f81a340ed41788e";
const LUARMOR_PROJECT_ID = "ea6339c9a303cd446e2b1e0703299827";

async function test() {
    try {
        const response = await axios.get(`https://api.luarmor.net/v3/projects/${LUARMOR_PROJECT_ID}/users`, {
            headers: {
                'Authorization': `${LUARMOR_API_KEY}`,
                'User-Agent': "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                'Accept': 'application/json'
            }
        });
        console.log("Status:", response.status);
        console.log("Data:", response.data);
    } catch (e) {
        if (e.response) {
            console.error("Status:", e.response.status);
            console.error("Data:", e.response.data);
        } else {
            console.error(e.message);
        }
    }
}

test();
