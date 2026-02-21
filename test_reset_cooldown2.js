const axios = require('axios');
const https = require('https');
const agent = new https.Agent({ rejectUnauthorized: false });

async function run() {
    try {
        const res = await axios({
            method: 'POST',
            url: 'https://api.luarmor.net/v3/projects/ea6339c9a303cd446e2b1e0703299827/users/reset_hwid?user_key=FXnPEQbEShmWonrgBqgMzhjnUoIwbvJt',
            headers: { 'Authorization': 'd0b08722bb7efeaf32228293a8c1191cf9db7f81a340ed41788e', 'Accept': 'application/json' },
            httpsAgent: agent
        });
        console.log(res.status, res.data);
    } catch (e) {
        console.log(e.response ? e.response.status : "No Response", e.response ? e.response.data : e.message);
    }
}
run();
