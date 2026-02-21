const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const https = require('https');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const LUARMOR_API_KEY = process.env.LUARMOR_API_KEY;
const LUARMOR_PROJECT_ID = process.env.LUARMOR_PROJECT_ID;
const JWT_SECRET = String(process.env.JWT_SECRET || '');
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'users.json');
const ENV_FILE = path.join(__dirname, '.env');
const TELEMETRY_CACHE_TTL_MS = 30000;
const TEAM_PROFILE_CACHE_TTL_MS = 120000;
const ALLOW_INSECURE_TLS = process.env.ALLOW_INSECURE_TLS === 'true';
const PASSWORD_HASH_ROUNDS = 10;
const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,24}$/;
const LICENSE_KEY_REGEX = /^[A-Za-z0-9-]{10,128}$/;
const PASSWORD_MIN_LENGTH = 6;

const declaredCorsOrigins = String(process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

const defaultCorsOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    `http://localhost:${PORT}`,
    `http://127.0.0.1:${PORT}`,
    'https://flow-website.onrender.com'
];

const allowedOrigins = new Set([...defaultCorsOrigins, ...declaredCorsOrigins]);

app.disable('x-powered-by');
app.use(compression());
app.use(helmet({
    contentSecurityPolicy: {
        useDefaults: true,
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com'],
            fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com'],
            imgSrc: ["'self'", 'data:', 'https://cdn.discordapp.com', 'https://media.discordapp.net', 'https://placehold.co'],
            connectSrc: ["'self'"],
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"]
        }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.has(origin)) {
            return callback(null, true);
        }
        return callback(new Error('Origin is not allowed by CORS policy'));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
    maxAge: 600
}));

app.use(express.json({ limit: '64kb' }));
app.use(express.urlencoded({ extended: false, limit: '64kb' }));

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 280,
    standardHeaders: true,
    legacyHeaders: false
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 25,
    standardHeaders: true,
    legacyHeaders: false
});

app.use('/api', apiLimiter);
app.use('/api/login', authLimiter);
app.use('/api/register', authLimiter);

app.use(express.static(path.resolve(__dirname), {
    setHeaders: (res, filePath) => {
        if (/\.(css|js)$/i.test(filePath)) {
            res.setHeader('Cache-Control', 'public, max-age=300');
            return;
        }
        if (/\.(png|jpg|jpeg|gif|webp|svg|ico)$/i.test(filePath)) {
            res.setHeader('Cache-Control', 'public, max-age=86400');
        }
    }
}));

app.get('/', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'index.html'));
});

if (JWT_SECRET.length < 16) {
    console.warn('JWT_SECRET is too short or missing. Set a long random secret for production.');
}
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
const isJwtConfigured = () => JWT_SECRET.length >= 16;
const normalizeUsername = (value) => String(value || '').trim();
const normalizeLicenseKey = (value) => String(value || '').trim();
const normalizePassword = (value) => String(value || '');

const isUsernameValid = (username) => USERNAME_REGEX.test(username);
const isLicenseKeyValid = (key) => LICENSE_KEY_REGEX.test(key);
const isPasswordValid = (password) => password.length >= PASSWORD_MIN_LENGTH;

const isBcryptHash = (value) => /^\$2[aby]\$/.test(String(value || ''));

const verifyUserPassword = async (inputPassword, storedPassword) => {
    if (!storedPassword) return false;
    if (isBcryptHash(storedPassword)) {
        return bcrypt.compare(inputPassword, storedPassword);
    }
    return inputPassword === storedPassword;
};

// TLS verification stays enabled by default. Allow override only for temporary debugging.
const httpsAgent = new https.Agent({ rejectUnauthorized: !ALLOW_INSECURE_TLS, keepAlive: true });

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
    if (!isJwtConfigured()) {
        return res.status(500).json({ success: false, message: 'Server auth is not configured.' });
    }

    const authHeader = req.headers['authorization'];
    const isBearer = typeof authHeader === 'string' && authHeader.startsWith('Bearer ');
    const token = isBearer ? authHeader.slice(7).trim() : '';
    if (!token) return res.status(401).json({ success: false, message: 'No authentication token provided' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ success: false, message: 'Invalid or expired token' });
        req.user = user;
        next();
    });
};

// 1. Register User (Creating a user in Luarmor User System)
app.post('/api/register', async (req, res) => {
    const username = normalizeUsername(req.body?.username);
    const password = normalizePassword(req.body?.password);
    const license_key = normalizeLicenseKey(req.body?.license_key);

    if (!username || !password || !license_key) {
        return res.status(400).json({ success: false, message: 'Username, password, and Luarmor License Key are required.' });
    }

    if (!isUsernameValid(username)) {
        return res.status(400).json({ success: false, message: 'Username must be 3-24 chars and use letters, numbers, or underscores.' });
    }

    if (!isPasswordValid(password)) {
        return res.status(400).json({ success: false, message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` });
    }

    if (!isLicenseKeyValid(license_key)) {
        return res.status(400).json({ success: false, message: 'License key format is invalid.' });
    }

    const localUsers = getLocalUsers();
    const lowercaseUsername = username.toLowerCase();

    // Check if username already exists
    if (localUsers.find(u => String(u.username || '').toLowerCase() === lowercaseUsername)) {
        return res.status(400).json({ success: false, message: 'Username is already taken.' });
    }

    // Check if key is already registered to another account
    if (localUsers.find(u => String(u.license_key || '') === license_key)) {
        return res.status(400).json({ success: false, message: 'This License Key has already been registered to an account.' });
    }

    // Call Luarmor API to check if key exists/is valid for this project
    const { status, data } = await luarmorRequest(`/users?user_key=${encodeURIComponent(license_key)}`, null, 'GET');

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

        const passwordHash = await bcrypt.hash(password, PASSWORD_HASH_ROUNDS);

        // Register the new user locally
        localUsers.push({
            username,
            password: passwordHash,
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
    if (!isJwtConfigured()) {
        return res.status(500).json({ success: false, message: 'Server auth is not configured.' });
    }

    const username = normalizeUsername(req.body?.username);
    const password = normalizePassword(req.body?.password);
    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Username and password are required.' });
    }

    const localUsers = getLocalUsers();
    const userIndex = localUsers.findIndex((u) => String(u.username || '').toLowerCase() === username.toLowerCase());
    if (userIndex === -1) {
        return res.status(400).json({ success: false, message: 'Invalid credentials' });
    }
    const user = localUsers[userIndex];
    const passwordOk = await verifyUserPassword(password, user.password);

    if (passwordOk) {
        // Backward compatibility: silently upgrade legacy plain text passwords.
        if (!isBcryptHash(user.password)) {
            localUsers[userIndex].password = await bcrypt.hash(password, PASSWORD_HASH_ROUNDS);
            saveLocalUsers(localUsers);
        }
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
    const { status, data } = await luarmorRequest(`/users?user_key=${encodeURIComponent(user.license_key)}`, { action: 'reset_hwid' }, 'POST');

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
    const { status, data } = await luarmorRequest(`/users?user_key=${encodeURIComponent(user.license_key)}`, null, 'GET');

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

app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ success: false, message: 'API endpoint not found.' });
    }
    return next();
});

app.use((err, req, res, next) => {
    if (err?.message?.includes('CORS')) {
        return res.status(403).json({ success: false, message: 'Request origin is blocked.' });
    }
    console.error('Unhandled server error:', err?.message || err);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
});

app.listen(PORT, () => {
    console.log(`Flow API server running on port ${PORT}`);
});
