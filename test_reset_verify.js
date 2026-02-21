const axios = require('axios');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
async function run() {
    const res = await axios({
        url: 'https://api.luarmor.net/v3/projects/ea6339c9a303cd446e2b1e0703299827/users?user_key=LeAEbSACOxdbrmzhxuOdQpAZNfQABONf',
        headers: { 'Authorization': 'd0b08722bb7efeaf32228293a8c1191cf9db7f81a340ed41788e', 'Accept': 'application/json' }
    });
    console.log(res.data.users[0]);
}
run();
