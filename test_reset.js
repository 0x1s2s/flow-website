const axios = require('axios');
const https = require('https');

const LUARMOR_API_KEY = "d0b08722bb7efeaf32228293a8c1191cf9db7f81a340ed41788e";
const LUARMOR_PROJECT_ID = "ea6339c9a303cd446e2b1e0703299827";
const KEY = "wtjRTUlTwWFmHfVWCDpRWFmKHIcxQloi";

const agent = new https.Agent({ rejectUnauthorized: false });
const headers = {
    'Authorization': LUARMOR_API_KEY,
    'Accept': 'application/json'
};

async function check(url, method, data = null) {
    try {
        const reqData = { method, url: `https://api.luarmor.net/v3/projects/${LUARMOR_PROJECT_ID}${url}`, headers, httpsAgent: agent };
        if (data) Object.assign(reqData, { data: data, headers: { ...headers, 'Content-Type': 'application/json' } });
        const res = await axios(reqData);
        console.log(method, url, res.status, res.data);
    } catch (e) { console.log(method, url, e.response?.status, e.response?.data || e.message); }
}

async function main() {
    await check(`/users/reset_hwid?user_key=${KEY}`, 'POST');
    await check(`/users?user_key=${KEY}`, 'POST', { action: "reset_hwid" });
    await check(`/users?user_key=${KEY}`, 'PATCH', { action: "reset_hwid" });
}
main();
