const LUARMOR_API_KEY = "d0b08722bb7efeaf32228293a8c1191cf9db7f81a340ed41788e";
const LUARMOR_PROJECT_ID = "ea6339c9a303cd446e2b1e0703299827";

async function test() {
    try {
        const response = await fetch(`https://api.luarmor.net/v3/projects/${LUARMOR_PROJECT_ID}/users`, {
            method: 'GET',
            headers: {
                'Authorization': `${LUARMOR_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        const text = await response.text();
        console.log("Status:", response.status);
        if (text.startsWith('<')) {
            console.log("HTML Response:", text.substring(0, 200));
        } else {
            console.log("JSON:", JSON.parse(text));
        }
    } catch (e) {
        console.error(e);
    }
}

test();
