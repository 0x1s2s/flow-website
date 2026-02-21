const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const https = require('https');
require('dotenv').config();

// Bypass Node TLS Handshake bugs entirely for local Luarmor requests
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.resolve(__dirname)));

app.get('/', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'index.html'));
});

const LUARMOR_API_KEY = process.env.LUARMOR_API_KEY;
const LUARMOR_PROJECT_ID = process.env.LUARMOR_PROJECT_ID;
const JWT_SECRET = process.env.JWT_SECRET;
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'users.json');
const ENV_FILE = path.join(__dirname, '.env');
const TELEMETRY_CACHE_TTL_MS = 30000;
const TEAM_PROFILE_CACHE_TTL_MS = 120000;
const TEAM_DISCORD_MEMBERS = [
    { id: '361164855623024641', name: 'Null' },
    { id: '1226751090427559966', name: 'Gensis' },
    { id: '627177737358147594', name: 'bezydll' },
    { id: '1361430335782518995', name: 'vortex' },
    { id: '945370152298504304', name: 'saintcn2' }
];
let telemetryCache = { expiresAt: 0, payload: null };
let teamProfileCache = { expiresAt: 0, payload: null };

// Initialize local DB if it doesn't exist
if (!fs.existsSync(DB_FILE)) {
    fs.writeJsonSync(DB_FILE, []);
}

// Helper to interact with local DB
const getLocalUsers = () => fs.readJsonSync(DB_FILE);
const saveLocalUsers = (users) => fs.writeJsonSync(DB_FILE, users);

// axios TLS bypass configuration for Cloudflare/Luarmor nodes
const httpsAgent = new https.Agent({ rejectUnauthorized: false, keepAlive: false });

// Helper to make requests to Luarmor API
const luarmorRequest = async (endpoint, data, method = 'POST') => {
    try {
        const config = {
            url: `https://api.luarmor.net/v3/projects/${LUARMOR_PROJECT_ID}${endpoint}`,
            method: method,
            httpsAgent,
            timeout: 15000,
            headers: {
                'Authorization': LUARMOR_API_KEY,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'User-Agent': 'Flow Node Backend'
            }
        };
        // Luarmor throws 400 Bad Request if you send a body on a GET request
        if (data && method !== 'GET') {
            config.data = data;
        }

        const response = await axios(config);
        return { status: response.status, data: response.data };
    } catch (error) {
        if (error.response) {
            console.error(`Luarmor API Error on ${endpoint}: Status ${error.response.status}`);
            return { status: error.response.status, data: error.response.data };
        }
        console.error(`Luarmor Network Error on ${endpoint}:`, error.message);
        return { status: 500, data: { success: false, message: 'Internal Server Error' } };
    }
};

const toSafeNumber = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
};

const fetchLuarmorTelemetry = async () => {
    try {
        const response = await axios.get(`https://api.luarmor.net/v3/keys/${LUARMOR_API_KEY}/stats?noUsers=false`, {
            httpsAgent,
            timeout: 15000,
            headers: {
                'Authorization': LUARMOR_API_KEY,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'User-Agent': 'Flow Node Backend'
            }
        });
        return { status: response.status, data: response.data };
    } catch (error) {
        if (error.response) {
            return { status: error.response.status, data: error.response.data };
        }
        return { status: 500, data: { success: false, message: 'Luarmor telemetry network error' } };
    }
};

const readEnvValueFromFile = (key) => {
    try {
        if (!fs.existsSync(ENV_FILE)) return '';
        const content = fs.readFileSync(ENV_FILE, 'utf8');
        const lines = content.split(/\r?\n/);
        const prefix = `${key}=`;
        const line = lines.find((entry) => entry.trim().startsWith(prefix));
        if (!line) return '';
        return line.slice(prefix.length).trim();
    } catch {
        return '';
    }
};

const getDiscordBotToken = () => {
    const runtimeToken = String(process.env.DISCORD_BOT_TOKEN || '').trim();
    const fileToken = String(readEnvValueFromFile('DISCORD_BOT_TOKEN') || '').trim();
    const runtimeValid = runtimeToken && !runtimeToken.includes('YOUR_DISCORD_BOT_TOKEN_HERE');
    const fileValid = fileToken && !fileToken.includes('YOUR_DISCORD_BOT_TOKEN_HERE');
    const token = fileValid ? fileToken : (runtimeValid ? runtimeToken : '');

    if (!token) {
        return '';
    }
    return token;
};

const getDiscordDefaultAvatarUrl = (user) => {
    const discriminator = String(user?.discriminator || '0');
    if (discriminator !== '0') {
        const index = Number(discriminator) % 5;
        return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
    }

    try {
        const snowflake = BigInt(String(user?.id || '0'));
        const index = Number((snowflake >> 22n) % 6n);
        return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
    } catch {
        return 'https://cdn.discordapp.com/embed/avatars/0.png';
    }
};

const getDiscordAvatarUrl = (user) => {
    if (user?.avatar) {
        const extension = String(user.avatar).startsWith('a_') ? 'gif' : 'png';
        return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${extension}?size=256`;
    }
    return getDiscordDefaultAvatarUrl(user);
};

const fetchDiscordUser = async (userId, botToken) => {
    const response = await axios.get(`https://discord.com/api/v10/users/${userId}`, {
        timeout: 12000,
        headers: {
            'Authorization': `Bot ${botToken}`,
            'Accept': 'application/json',
            'User-Agent': 'Flow Team Avatar Sync (https://localhost)'
        }
    });
    return response.data;
};


// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.status(401).json({ success: false, message: 'No authentication token provided' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ success: false, message: 'Invalid or expired token' });
        req.user = user;
        next();
    });
};

// 1. Register User (Creating a user in Luarmor User System)
app.post('/api/register', async (req, res) => {
    const { username, password, license_key } = req.body;

    if (!username || !password || !license_key) {
        return res.status(400).json({ success: false, message: 'Username, password, and Luarmor License Key are required.' });
    }

    const localUsers = getLocalUsers();

    // Check if username already exists
    if (localUsers.find(u => u.username.toLowerCase() === username.toLowerCase())) {
        return res.status(400).json({ success: false, message: 'Username is already taken.' });
    }

    // Check if key is already registered to another account
    if (localUsers.find(u => u.license_key === license_key)) {
        return res.status(400).json({ success: false, message: 'This License Key has already been registered to an account.' });
    }

    // Call Luarmor API to check if key exists/is valid for this project
    const { status, data } = await luarmorRequest(`/users?user_key=${license_key}`, null, 'GET');

    console.log("LUARMOR REGISTRATION VALIDATION ===");
    console.log("Status:", status);
    console.log("Data:", JSON.stringify(data));

    if (status === 403 || status === 401 || (typeof data === 'string' && data.includes('Not Authorized'))) {
        return res.status(500).json({ success: false, message: 'Luarmor firewall blocked the API request! You must whitelist this server IP address in your Luarmor Dashboard.' });
    }

    if (status === 500) {
        return res.status(500).json({ success: false, message: 'Luarmor API connection failed due to network error.' });
    }

    // If Luarmor returned success and the users array has at least one matching key record
    if (status === 200 && data.success === true && Array.isArray(data.users) && data.users.length > 0) {
        // Validation success. Wait, is it banned?
        const luarmorUser = data.users[0];
        if (luarmorUser.banned === 1) {
            return res.status(400).json({ success: false, message: 'This Luarmor License Key is banned.' });
        }

        // Register the new user locally
        localUsers.push({
            username,
            password, // In production, this should be hashed (e.g., bcrypt)
            license_key,
            created_at: new Date().toISOString()
        });
        saveLocalUsers(localUsers);

        res.status(200).json({ success: true, message: 'License verified! Account created successfully. Please login.' });
    } else {
        res.status(400).json({ success: false, message: 'Invalid Luarmor License Key.' });
    }
});

// 2. Login User
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const localUsers = getLocalUsers();

    const user = localUsers.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);

    if (user) {
        // Create JWT for web session
        const token = jwt.sign({ username: user.username, license_key: user.license_key }, JWT_SECRET, { expiresIn: '24h' });
        res.status(200).json({ success: true, token, user: { username: user.username } });
    } else {
        res.status(400).json({ success: false, message: 'Invalid credentials' });
    }
});

// 3. Redeem Key (Skipped for now, as registration is the main validation point)
app.post('/api/redeem', authenticateToken, async (req, res) => {
    const { key } = req.body;
    // ...
    res.status(200).json({ success: true, message: 'Under construction.', key_data: { status: 'Active' } });
});

// 4. Reset HWID
app.post('/api/reset_hwid', authenticateToken, async (req, res) => {
    const localUsers = getLocalUsers();
    const userIndex = localUsers.findIndex(u => u.username.toLowerCase() === req.user.username.toLowerCase());

    if (userIndex === -1) return res.status(404).json({ success: false, message: 'User not found in local DB' });
    const user = localUsers[userIndex];

    const currentTime = Math.floor(Date.now() / 1000);
    const cooldownSeconds = 86400; // 24 hours

    if (user.last_hwid_reset && (currentTime - user.last_hwid_reset) < cooldownSeconds) {
        const timeDiff = cooldownSeconds - (currentTime - user.last_hwid_reset);
        const remainingHours = Math.floor(timeDiff / 3600);
        const remainingMins = Math.floor((timeDiff % 3600) / 60);
        return res.status(400).json({ success: false, message: `HWID is on cooldown for ${remainingHours}h ${remainingMins}m` });
    }

    // Call Luarmor API to perform reset
    const { status, data } = await luarmorRequest(`/users?user_key=${user.license_key}`, { action: 'reset_hwid' }, 'POST');

    if (status === 200 && data.success === true && data.user_key) {
        // Luarmor generates a NEW key when HWID is reset via API
        // We must update the local DB so the user's account remains linked
        localUsers[userIndex].license_key = data.user_key;
        localUsers[userIndex].last_hwid_reset = currentTime;
        saveLocalUsers(localUsers);

        res.status(200).json({ success: true, message: 'HWID reset successfully! New license key synchronized.' });
    } else {
        res.status(400).json({ success: false, message: 'Luarmor API failed to reset HWID.' });
    }
});

// 5. Get User Stats Check
app.get('/api/stats', authenticateToken, async (req, res) => {
    const localUsers = getLocalUsers();
    // Use req.user.username from JWT token
    const user = localUsers.find(u => u.username.toLowerCase() === req.user.username.toLowerCase());

    if (!user) return res.status(404).json({ success: false, message: 'User not found in local DB' });

    // Call Luarmor API 
    const { status, data } = await luarmorRequest(`/users?user_key=${user.license_key}`, null, 'GET');

    if (status === 200 && data.success === true && Array.isArray(data.users) && data.users.length > 0) {
        const luarmorUser = data.users[0];

        // Calculate HWID Cooldown based on LOCAL last_hwid_reset (UNIX timestamp seconds)
        const currentTime = Math.floor(Date.now() / 1000);
        const cooldownSeconds = 86400; // 24 hours
        let hwidStatus = 'Ready';

        if (user.last_hwid_reset && (currentTime - user.last_hwid_reset) < cooldownSeconds) {
            const timeDiff = cooldownSeconds - (currentTime - user.last_hwid_reset);
            const remainingHours = Math.floor(timeDiff / 3600);
            const remainingMins = Math.floor((timeDiff % 3600) / 60);
            hwidStatus = `${remainingHours}h ${remainingMins}m remaining`;
        }

        res.status(200).json({
            success: true,
            executions: luarmorUser.total_executions,
            hwid_status: hwidStatus,
            key_status: luarmorUser.status
        });
    } else {
        res.status(400).json({ success: false, message: 'Could not fetch stats from Luarmor.' });
    }
});

// 6. Public Telemetry (Project-level Luarmor stats for homepage cards)
app.get('/api/public/telemetry', async (req, res) => {
    if (!LUARMOR_API_KEY) {
        return res.status(500).json({ success: false, message: 'Luarmor API key is not configured' });
    }

    if (telemetryCache.payload && telemetryCache.expiresAt > Date.now()) {
        return res.status(200).json({
            ...telemetryCache.payload,
            cached: true
        });
    }

    const { status, data } = await fetchLuarmorTelemetry();

    if (status !== 200 || data?.success !== true) {
        return res.status(502).json({
            success: false,
            message: 'Could not fetch Luarmor telemetry',
            upstream_status: status
        });
    }

    const stats = data.stats || {};
    const executions = Array.isArray(data.execution_data?.executions)
        ? data.execution_data.executions.map(toSafeNumber)
        : [];

    const monthlyExecutions = executions.reduce((sum, n) => sum + n, 0);
    const todayExecutions = executions.length ? executions[executions.length - 1] : 0;
    const yesterdayExecutions = executions.length > 1 ? executions[executions.length - 2] : 0;
    const dailyChangePct = yesterdayExecutions > 0
        ? ((todayExecutions - yesterdayExecutions) / yesterdayExecutions) * 100
        : 0;

    const payload = {
        success: true,
        source: 'luarmor',
        refreshed_at: new Date().toISOString(),
        frequency_seconds: toSafeNumber(data.execution_data?.frequency),
        users: toSafeNumber(stats.users),
        scripts: toSafeNumber(stats.scripts),
        obfuscations_monthly: toSafeNumber(stats.obfuscations),
        threats_blocked: toSafeNumber(stats.attacks_blocked),
        monthly_executions: monthlyExecutions,
        today_executions: todayExecutions,
        yesterday_executions: yesterdayExecutions,
        daily_change_pct: Number(dailyChangePct.toFixed(2)),
        traffic_series: executions.slice(-30),
        reset_at_unix: toSafeNumber(stats.reset_at)
    };

    telemetryCache = {
        expiresAt: Date.now() + TELEMETRY_CACHE_TTL_MS,
        payload
    };

    return res.status(200).json(payload);
});

// 7. Public server egress IP helper (for Luarmor whitelist setup)
app.get('/api/public/server-ip', async (req, res) => {
    try {
        const response = await axios.get('https://api64.ipify.org?format=json', {
            timeout: 8000,
            headers: {
                Accept: 'application/json',
                'User-Agent': 'Flow Server IP Check'
            }
        });

        return res.status(200).json({
            success: true,
            ip: response.data?.ip || null
        });
    } catch (error) {
        return res.status(502).json({
            success: false,
            message: 'Could not resolve server IP'
        });
    }
});

// 7. Public Team Profiles (Discord avatar sync for About Team section)
app.get('/api/public/team-profiles', async (req, res) => {
    const discordBotToken = getDiscordBotToken();
    if (!discordBotToken) {
        const payload = {
            success: true,
            source: 'discord-fallback',
            refreshed_at: new Date().toISOString(),
            live: false,
            profiles: TEAM_DISCORD_MEMBERS.map((member) => ({
                id: member.id,
                name: member.name,
                username: null,
                global_name: null,
                avatar_url: getDiscordDefaultAvatarUrl({ id: member.id, discriminator: '0' }),
                unavailable: true
            }))
        };

        return res.status(200).json(payload);
    }

    if (teamProfileCache.payload && teamProfileCache.expiresAt > Date.now()) {
        return res.status(200).json({
            ...teamProfileCache.payload,
            cached: true
        });
    }

    const profiles = await Promise.all(TEAM_DISCORD_MEMBERS.map(async (member) => {
        try {
            const user = await fetchDiscordUser(member.id, discordBotToken);
            return {
                id: user.id,
                name: member.name,
                username: user.username,
                global_name: user.global_name || null,
                avatar_url: getDiscordAvatarUrl(user),
                unavailable: false
            };
        } catch (error) {
            const status = error?.response?.status;
            console.error(`Discord profile fetch failed for ${member.name} (${member.id})`, status || error.message);
            return {
                id: member.id,
                name: member.name,
                username: null,
                global_name: null,
                avatar_url: getDiscordDefaultAvatarUrl({ id: member.id, discriminator: '0' }),
                unavailable: true
            };
        }
    }));

    const payload = {
        success: true,
        source: 'discord',
        refreshed_at: new Date().toISOString(),
        profiles
    };

    teamProfileCache = {
        expiresAt: Date.now() + TEAM_PROFILE_CACHE_TTL_MS,
        payload
    };

    return res.status(200).json(payload);
});

app.listen(PORT, () => {
    console.log(`Flow API server running on port ${PORT}`);
});
