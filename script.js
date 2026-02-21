document.addEventListener('DOMContentLoaded', () => {
    const mediaMatches = (query) => {
        if (!window.matchMedia) return false;
        try {
            return window.matchMedia(query).matches;
        } catch {
            return false;
        }
    };
    const prefersReducedMotion = mediaMatches('(prefers-reduced-motion: reduce)');
    const hasHoverPointer = mediaMatches('(hover: hover) and (pointer: fine)');
    const isCoarsePointer = mediaMatches('(pointer: coarse)');
    const isSmallScreen = mediaMatches('(max-width: 980px)');
    const lowCpu = Number(navigator.hardwareConcurrency || 0) > 0 && Number(navigator.hardwareConcurrency) <= 4;
    const lowMemory = Number(navigator.deviceMemory || 0) > 0 && Number(navigator.deviceMemory) <= 4;
    const isLiteMode = prefersReducedMotion || isCoarsePointer || isSmallScreen || lowCpu || lowMemory;

    document.body.classList.toggle('perf-lite', isLiteMode);

    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const API_URL = isLocalhost ? 'http://localhost:3000/api' : `${window.location.origin}/api`;

    // Regex Syntax Highlighting for Loader Code
    const loaderCode = document.getElementById('loaderCode');
    if (loaderCode) {
        let html = loaderCode.innerHTML;
        html = html.replace(/(".*?")/g, '<span class="code-string">$1</span>');
        html = html.replace(/(loadstring|game|HttpGet)/g, '<span class="code-keyword">$1</span>');
        loaderCode.innerHTML = html;
    }

    // Copy to clipboard functionality
    const copyLoaderBtn = document.getElementById('copyLoaderBtn');
    const toast = document.getElementById('toast');
    const toastCloseBtn = document.getElementById('toastCloseBtn');
    let toastTimer = null;

    async function copyText(text) {
        if (!text) return false;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const copied = document.execCommand('copy');
        document.body.removeChild(textarea);
        return copied;
    }

    if (copyLoaderBtn && loaderCode) {
        copyLoaderBtn.addEventListener('click', async () => {
            const textToCopy = loaderCode.innerText.trim();

            try {
                await copyText(textToCopy);
                showToast();

                const originalHTML = copyLoaderBtn.innerHTML;
                copyLoaderBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
                copyLoaderBtn.style.backgroundColor = 'var(--accent-cyan)';
                copyLoaderBtn.style.color = '#000';
                copyLoaderBtn.style.borderColor = 'var(--accent-cyan)';

                setTimeout(() => {
                    copyLoaderBtn.innerHTML = originalHTML;
                    copyLoaderBtn.style.backgroundColor = '';
                    copyLoaderBtn.style.color = '';
                    copyLoaderBtn.style.borderColor = '';
                }, 2000);
            } catch (err) {
                console.error('Failed to copy', err);
            }
        });
    }

    function hideToast() {
        if (!toast) return;
        toast.classList.remove('show');
        if (toastTimer) {
            clearTimeout(toastTimer);
            toastTimer = null;
        }
    }

    function showToast(title = 'Copied!', message = 'Script copied to clipboard.', isSuccess = true, durationMs = 3200) {
        const titleEl = document.getElementById('toast-title');
        const msgEl = document.getElementById('toast-msg');
        const iconWrap = toast ? toast.querySelector('.toast-icon') : null;

        if (titleEl) titleEl.innerText = title;
        if (msgEl) msgEl.innerText = message;
        if (iconWrap) {
            iconWrap.innerHTML = isSuccess ? '<i class="fa-solid fa-check"></i>' : '<i class="fa-solid fa-xmark"></i>';
        }
        if (!toast) return;
        toast.classList.toggle('toast-error', !isSuccess);
        toast.classList.toggle('toast-success', isSuccess);
        if (toastTimer) clearTimeout(toastTimer);
        toast.classList.add('show');
        toastTimer = setTimeout(hideToast, durationMs);
    }

    if (toastCloseBtn) {
        toastCloseBtn.addEventListener('click', hideToast);
    }

    // Scroll reveal observers
    const revealTargets = document.querySelectorAll('.fade-in');
    if ('IntersectionObserver' in window) {
        const observerOptions = {
            root: null,
            rootMargin: '0px',
            threshold: 0.1
        };

        const observer = new IntersectionObserver((entries, revealObserver) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    revealObserver.unobserve(entry.target);
                }
            });
        }, observerOptions);

        revealTargets.forEach(el => observer.observe(el));
    } else {
        revealTargets.forEach((el) => el.classList.add('visible'));
    }

    // Navbar, active section links, and progress indicator
    const navbar = document.querySelector('.navbar');
    const scrollProgress = document.getElementById('scrollProgress');
    const sectionAnchors = Array.from(document.querySelectorAll('.nav-links a[href^="#"]'))
        .filter(link => link.getAttribute('href') && link.getAttribute('href') !== '#');
    const sectionIds = sectionAnchors.map(link => link.getAttribute('href'));
    const sections = sectionIds
        .map(id => document.querySelector(id))
        .filter(Boolean);

    function updateScrollUI() {
        if (navbar) {
            navbar.classList.toggle('scrolled', window.scrollY > 40);
        }

        if (scrollProgress) {
            const scrollable = document.documentElement.scrollHeight - window.innerHeight;
            const progress = scrollable > 0 ? Math.min(window.scrollY / scrollable, 1) : 0;
            scrollProgress.style.transform = `scaleX(${progress})`;
        }
    }

    window.addEventListener('scroll', updateScrollUI, { passive: true });
    updateScrollUI();

    if (sections.length && sectionAnchors.length) {
        const setActiveNav = (targetId) => {
            sectionAnchors.forEach(link => {
                const isActive = link.getAttribute('href') === `#${targetId}`;
                link.classList.toggle('active', isActive);
            });
        };

        if ('IntersectionObserver' in window) {
            const navObserver = new IntersectionObserver((entries) => {
                let topEntry = null;
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        if (!topEntry || entry.intersectionRatio > topEntry.intersectionRatio) {
                            topEntry = entry;
                        }
                    }
                });
                if (topEntry?.target?.id) {
                    setActiveNav(topEntry.target.id);
                }
            }, {
                threshold: [0.3, 0.5, 0.8],
                rootMargin: '-20% 0px -55% 0px'
            });

            sections.forEach(section => navObserver.observe(section));
        }
    }

    // About Team: live Discord avatar sync with local image fallback
    const teamCards = Array.from(document.querySelectorAll('.team-card[data-discord-id]'));
    const teamRefreshIntervalMs = isLiteMode ? 10 * 60 * 1000 : 5 * 60 * 1000;

    const normalizePath = (src = '') => src.split('?')[0].replace(/^https?:\/\/[^/]+/i, '');
    const isFallbackPath = (currentSrc = '', fallbackSrc = '') => {
        if (!fallbackSrc) return false;
        const normalizedCurrent = normalizePath(currentSrc);
        const normalizedFallback = normalizePath(fallbackSrc);
        if (/^https?:\/\//i.test(fallbackSrc)) {
            return normalizedCurrent === normalizedFallback;
        }
        return normalizedCurrent.endsWith(normalizedFallback.startsWith('/') ? normalizedFallback : `/${normalizedFallback}`);
    };

    const bindTeamAvatarFallback = (avatarEl) => {
        if (!avatarEl || avatarEl.dataset.boundFallback === '1') return;
        const shell = avatarEl.closest('.team-avatar-shell');
        const fallbackSrc = avatarEl.dataset.fallbackSrc || avatarEl.getAttribute('src') || '';

        avatarEl.dataset.boundFallback = '1';
        avatarEl.dataset.usingFallback = '1';

        avatarEl.addEventListener('error', () => {
            const hasFallback = Boolean(fallbackSrc);
            const alreadyUsingFallback = avatarEl.dataset.usingFallback === '1' || isFallbackPath(avatarEl.currentSrc, fallbackSrc);

            if (hasFallback && !alreadyUsingFallback) {
                avatarEl.dataset.usingFallback = '1';
                avatarEl.src = fallbackSrc;
                return;
            }

            avatarEl.style.display = 'none';
            if (shell) shell.classList.add('fallback');
        });

        avatarEl.addEventListener('load', () => {
            avatarEl.style.display = 'block';
            const usingFallback = isFallbackPath(avatarEl.currentSrc, fallbackSrc);
            avatarEl.dataset.usingFallback = usingFallback ? '1' : '0';
            if (shell) shell.classList.remove('fallback');
        });
    };

    const isDiscordDefaultAvatar = (url = '') => /cdn\.discordapp\.com\/embed\/avatars\/\d+\.png/i.test(String(url));

    const applyTeamProfileAvatar = (card, profile) => {
        if (!card || !profile?.avatar_url) return;
        if (profile.unavailable) return;
        if (isDiscordDefaultAvatar(profile.avatar_url)) return;
        const avatarEl = card.querySelector('.team-avatar');
        if (!avatarEl) return;

        bindTeamAvatarFallback(avatarEl);

        if (avatarEl.dataset.lastDiscordSrc === profile.avatar_url) return;
        avatarEl.dataset.usingFallback = '0';
        avatarEl.dataset.lastDiscordSrc = profile.avatar_url;
        avatarEl.style.display = 'block';
        card.querySelector('.team-avatar-shell')?.classList.remove('fallback');
        avatarEl.src = profile.avatar_url;
    };

    const syncDiscordTeamAvatars = async () => {
        if (!teamCards.length) return;

        teamCards.forEach((card) => {
            const avatarEl = card.querySelector('.team-avatar');
            bindTeamAvatarFallback(avatarEl);
        });

        try {
            const response = await fetch(`${API_URL}/public/team-profiles`);
            const payload = await response.json();

            if (!response.ok || !payload?.success || !Array.isArray(payload.profiles)) {
                throw new Error(payload?.message || 'Team profiles unavailable');
            }

            // Keep local team photos when backend is in fallback mode (no live Discord data)
            if (payload.live === false || payload.source === 'discord-fallback') {
                return;
            }

            const profilesById = new Map(payload.profiles.map((profile) => [String(profile.id), profile]));
            teamCards.forEach((card) => {
                const memberId = card.dataset.discordId;
                applyTeamProfileAvatar(card, profilesById.get(String(memberId)));
            });
        } catch (error) {
            console.error('Discord team profile sync failed:', error.message);
        }
    };

    syncDiscordTeamAvatars();
    setInterval(syncDiscordTeamAvatars, teamRefreshIntervalMs);

    // Live telemetry metrics from Luarmor stats API
    const telemetryTargets = {
        users: document.getElementById('metricTotalUsers'),
        monthlyExecutions: document.getElementById('metricMonthlyExecutions'),
        todayExecutions: document.getElementById('metricTodayTraffic'),
        threatsBlocked: document.getElementById('metricThreatsBlocked')
    };
    const telemetryTrendTargets = {
        users: document.getElementById('metricUsersTrend'),
        monthlyExecutions: document.getElementById('metricMonthlyTrend'),
        todayExecutions: document.getElementById('metricTodayTrend'),
        threatsBlocked: document.getElementById('metricThreatsTrend')
    };
    const telemetryTiles = {
        users: telemetryTargets.users ? telemetryTargets.users.closest('.metric-tile') : null,
        monthlyExecutions: telemetryTargets.monthlyExecutions ? telemetryTargets.monthlyExecutions.closest('.metric-tile') : null,
        todayExecutions: telemetryTargets.todayExecutions ? telemetryTargets.todayExecutions.closest('.metric-tile') : null,
        threatsBlocked: telemetryTargets.threatsBlocked ? telemetryTargets.threatsBlocked.closest('.metric-tile') : null
    };
    const trafficBars = document.getElementById('trafficBars');
    const telemetryUpdatedAt = document.getElementById('telemetryUpdatedAt');
    const compactNumberFormatter = new Intl.NumberFormat('en-US', {
        notation: 'compact',
        maximumFractionDigits: 1
    });

    const formatCompact = (value) => compactNumberFormatter.format(Math.max(0, Math.round(value || 0)));

    const animateCounter = (element, targetValue, formatter = formatCompact) => {
        if (!element) return;

        const currentValue = Number(element.dataset.currentValue || 0);
        const target = Number.isFinite(Number(targetValue)) ? Number(targetValue) : 0;
        const duration = prefersReducedMotion ? 0 : 1200;

        if (duration === 0) {
            element.textContent = formatter(target);
            element.dataset.currentValue = String(target);
            return;
        }

        const start = performance.now();
        const step = (now) => {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const value = currentValue + ((target - currentValue) * eased);
            element.textContent = formatter(value);

            if (progress < 1) {
                requestAnimationFrame(step);
            } else {
                element.dataset.currentValue = String(target);
                element.textContent = formatter(target);
            }
        };

        requestAnimationFrame(step);
    };

    const flashMetricTile = (tile) => {
        if (!tile) return;
        tile.classList.remove('metric-hot');
        void tile.offsetWidth;
        tile.classList.add('metric-hot');
    };

    const setTrendText = (element, text, tone = 'neutral') => {
        if (!element) return;
        element.textContent = text;
        element.classList.remove('trend-up', 'trend-down', 'trend-neutral');
        element.classList.add(`trend-${tone}`);
    };

    const renderTrafficBars = (series) => {
        if (!trafficBars) return;

        const values = Array.isArray(series) ? series.map(n => Number(n) || 0).slice(-20) : [];
        if (!values.length) {
            trafficBars.innerHTML = '<span class="traffic-empty">No traffic data yet</span>';
            return;
        }

        const maxValue = Math.max(...values, 1);
        trafficBars.innerHTML = values.map((value, index) => {
            const height = Math.max(8, Math.round((value / maxValue) * 100));
            return `<span class="traffic-bar" style="--h:${height}%;--delay:${index * 45}ms" title="Day ${index + 1}: ${value.toLocaleString()} executions"></span>`;
        }).join('');
    };

    const setTelemetryTimestamp = (isoValue, isLive = true) => {
        if (!telemetryUpdatedAt) return;
        if (!isoValue) {
            telemetryUpdatedAt.textContent = isLive ? 'Updated just now' : 'Live sync unavailable';
            telemetryUpdatedAt.classList.toggle('telemetry-live', isLive);
            telemetryUpdatedAt.classList.toggle('telemetry-dead', !isLive);
            return;
        }

        const parsed = new Date(isoValue);
        if (Number.isNaN(parsed.getTime())) {
            telemetryUpdatedAt.textContent = isLive ? 'Updated just now' : 'Live sync unavailable';
            telemetryUpdatedAt.classList.toggle('telemetry-live', isLive);
            telemetryUpdatedAt.classList.toggle('telemetry-dead', !isLive);
            return;
        }

        telemetryUpdatedAt.textContent = isLive
            ? `Updated ${parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
            : 'Live sync unavailable';
        telemetryUpdatedAt.classList.toggle('telemetry-live', isLive);
        telemetryUpdatedAt.classList.toggle('telemetry-dead', !isLive);
    };

    const applyTelemetryPayload = (payload) => {
        animateCounter(telemetryTargets.users, payload.users);
        animateCounter(telemetryTargets.monthlyExecutions, payload.monthly_executions);
        animateCounter(telemetryTargets.todayExecutions, payload.today_executions);
        animateCounter(telemetryTargets.threatsBlocked, payload.threats_blocked, (value) => `${Math.round(value || 0)}`);
        flashMetricTile(telemetryTiles.users);
        flashMetricTile(telemetryTiles.monthlyExecutions);
        flashMetricTile(telemetryTiles.todayExecutions);
        flashMetricTile(telemetryTiles.threatsBlocked);

        const changePctRaw = Number(payload.daily_change_pct);
        const changePct = Number.isFinite(changePctRaw) ? changePctRaw : 0;
        const pctText = `${changePct > 0 ? '+' : ''}${changePct.toFixed(1)}% vs yesterday`;
        setTrendText(telemetryTrendTargets.users, 'Audience online', 'neutral');
        setTrendText(telemetryTrendTargets.monthlyExecutions, 'Rolling monthly total', 'neutral');
        setTrendText(
            telemetryTrendTargets.todayExecutions,
            pctText,
            changePct > 0 ? 'up' : (changePct < 0 ? 'down' : 'neutral')
        );
        setTrendText(telemetryTrendTargets.threatsBlocked, 'Protection engine active', 'up');
        renderTrafficBars(payload.traffic_series || []);
        setTelemetryTimestamp(payload.refreshed_at, true);
    };

    const fetchPublicTelemetry = async () => {
        try {
            const response = await fetch(`${API_URL}/public/telemetry`);
            const payload = await response.json();

            if (!response.ok || !payload?.success) {
                throw new Error(payload?.message || 'Telemetry unavailable');
            }

            applyTelemetryPayload(payload);
        } catch (error) {
            console.error('Telemetry fetch failed:', error.message);
            setTelemetryTimestamp(null, false);
            setTrendText(telemetryTrendTargets.todayExecutions, 'Live sync unavailable', 'down');
        }
    };

    fetchPublicTelemetry();
    setInterval(fetchPublicTelemetry, isLiteMode ? 120000 : 60000);

    // Logo Tilt Effect (Parallax)
    const tiltLogo = document.querySelector('.flow-emblem-3d, .main-logo, .premium-f-logo');
    const logoContainer = document.querySelector('.tilt-effect');

    if (tiltLogo && logoContainer && hasHoverPointer && !isLiteMode) {
        logoContainer.addEventListener('mousemove', (e) => {
            const rect = logoContainer.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            const centerX = rect.width / 2;
            const centerY = rect.height / 2;

            const rotateX = ((y - centerY) / centerY) * -11;
            const rotateY = ((x - centerX) / centerX) * 11;

            tiltLogo.style.transform = `perspective(1200px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateZ(12px)`;
        });

        logoContainer.addEventListener('mouseleave', () => {
            tiltLogo.style.transform = 'perspective(1200px) rotateX(0) rotateY(0) translateZ(0)';
        });
    }

    // Unified tilt highlight effect for cards and CTA buttons
    if (!prefersReducedMotion && hasHoverPointer && !isLiteMode) {
        const tiltTargets = document.querySelectorAll('.glass-card, .premium-key-card, .game-image-card, .btn');
        tiltTargets.forEach((element) => {
            const intensity = element.classList.contains('btn') ? 6 : 12;

            const handleMove = (event) => {
                const rect = element.getBoundingClientRect();
                const x = event.clientX - rect.left;
                const y = event.clientY - rect.top;
                const px = (x / rect.width) * 100;
                const py = (y / rect.height) * 100;
                const ry = ((x - rect.width / 2) / rect.width) * intensity;
                const rx = -((y - rect.height / 2) / rect.height) * intensity;

                element.style.setProperty('--mx', `${px}%`);
                element.style.setProperty('--my', `${py}%`);
                element.style.setProperty('--rx', `${rx}deg`);
                element.style.setProperty('--ry', `${ry}deg`);
            };

            const resetTilt = () => {
                element.style.setProperty('--rx', '0deg');
                element.style.setProperty('--ry', '0deg');
                element.style.setProperty('--mx', '50%');
                element.style.setProperty('--my', '50%');
            };

            element.addEventListener('mousemove', handleMove);
            element.addEventListener('mouseleave', resetTilt);
        });
    }

    // --- Premium Auth & Dashboard Logic ---
    let authToken = localStorage.getItem('flow_auth_token');

    const modalOverlay = document.getElementById('modalOverlay');
    const authModal = document.getElementById('authModal');
    const dashboardModal = document.getElementById('dashboardModal');
    const openAuthBtn = document.getElementById('openAuthBtn');

    if (openAuthBtn) {
        openAuthBtn.addEventListener('click', (e) => {
            e.preventDefault();
            openModal();
        });
    }

    // Make closeModals global so HTML onclick can reach it
    window.closeModals = function () {
        modalOverlay.classList.remove('active');
        authModal.classList.remove('active');
        dashboardModal.classList.remove('active');
    };

    function openModal() {
        modalOverlay.classList.add('active');
        if (authToken) {
            authModal.classList.remove('active');
            dashboardModal.classList.add('active');
            const storedUsername = (window.localStorage.getItem('flow_username') || 'User').trim();
            document.getElementById('dashUsername').innerText = `Welcome, ${storedUsername}`;
            const avatarInitialEl = document.getElementById('dashAvatarInitial');
            if (avatarInitialEl) {
                const firstCharMatch = storedUsername.match(/[A-Za-z0-9]/);
                avatarInitialEl.textContent = (firstCharMatch ? firstCharMatch[0] : 'U').toUpperCase();
            }
            fetchDashboardStats();
        } else {
            dashboardModal.classList.remove('active');
            authModal.classList.add('active');
        }
    }

    async function fetchDashboardStats() {
        try {
            const stats = await apiCall('/stats', {}, 'GET'); // apiCall wrapper expects POST default
            if (stats.success) {
                document.getElementById('statTotalExecutions').innerText = stats.executions;

                const hwidEl = document.getElementById('statHWIDCooldown');
                hwidEl.classList.remove('stat-ok', 'stat-warn');
                if (stats.hwid_status === 'Ready') {
                    hwidEl.textContent = 'Ready';
                    hwidEl.classList.add('stat-ok');
                } else {
                    hwidEl.textContent = stats.hwid_status;
                    hwidEl.classList.add('stat-warn');
                }

                const statusBadge = document.getElementById('dashStatusBadge');
                statusBadge.classList.remove('status-warning', 'status-danger');

                if (stats.key_status === 'banned') {
                    statusBadge.innerHTML = '<i class="fa-solid fa-ban"></i> Banned';
                    statusBadge.classList.add('status-danger');
                } else if (stats.key_status === 'reset') {
                    statusBadge.innerHTML = '<i class="fa-solid fa-link-slash"></i> Unlinked HWID';
                    statusBadge.classList.add('status-warning');
                } else {
                    statusBadge.innerHTML = '<i class="fa-solid fa-circle-check"></i> Premium Active';
                }

                document.querySelectorAll('#dashboardModal .stat-box').forEach((box) => {
                    box.classList.remove('stat-flash');
                    void box.offsetWidth;
                    box.classList.add('stat-flash');
                });
            }
        } catch (e) {
            console.error("Failed to fetch dashboard stats", e);
        }
    }

    if (modalOverlay) {
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) window.closeModals();
        });
    }

    let currentAuthMode = 'login';
    window.switchAuthTab = function (mode) {
        currentAuthMode = mode;
        document.getElementById('tabLogin').classList.toggle('active', mode === 'login');
        document.getElementById('tabRegister').classList.toggle('active', mode === 'register');
        document.getElementById('authSubmitBtn').innerText = mode === 'login' ? 'Login' : 'Register';
        document.getElementById('authError').style.display = 'none';
        document.getElementById('licenseGroup').style.display = mode === 'register' ? 'block' : 'none';
        document.getElementById('license_key').required = mode === 'register';
    };

    const authForm = document.getElementById('authForm');
    if (authForm) {
        authForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            const licenseKey = document.getElementById('license_key').value;
            const errEl = document.getElementById('authError');

            try {
                const endpoint = currentAuthMode === 'login' ? '/login' : '/register';
                const payload = currentAuthMode === 'login' ? { username, password } : { username, password, license_key: licenseKey };
                const res = await fetch(`${API_URL}${endpoint}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();

                if (data.success) {
                    if (currentAuthMode === 'login') {
                        authToken = data.token;
                        localStorage.setItem('flow_auth_token', authToken);
                        localStorage.setItem('flow_username', username);
                        openModal();
                    } else {
                        window.switchAuthTab('login');
                        errEl.style.display = 'block';
                        errEl.style.color = '#00ff88';
                        errEl.innerText = data.message;
                        setTimeout(() => errEl.style.display = 'none', 3000);
                    }
                } else {
                    errEl.style.display = 'block';
                    errEl.style.color = '#ff4444';
                    errEl.innerText = data.message || 'Error occurred';
                }
            } catch (err) {
                errEl.style.display = 'block';
                errEl.style.color = '#ff4444';
                errEl.innerText = 'Server connection failed.';
            }
        });
    }

    window.logout = function () {
        authToken = null;
        localStorage.removeItem('flow_auth_token');
        localStorage.removeItem('flow_username');
        openModal();
    };

    async function apiCall(endpoint, payload, method = 'POST') {
        try {
            const reqData = {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                }
            };
            if (method !== 'GET') {
                reqData.body = JSON.stringify(payload);
            }

            const res = await fetch(`${API_URL}${endpoint}`, reqData);
            return await res.json();
        } catch (err) {
            return { success: false, message: 'Connection Error' };
        }
    }

    window.redeemKey = async function () {
        const key = document.getElementById('redeemKeyInput').value;
        if (!key) return alert('Enter a key first');

        const res = await apiCall('/redeem', { key });
        showDashboardToast(res.message, res.success);
    };

    window.getScript = async function () {
        await apiCall('/get_script', {});
        navigator.clipboard.writeText(`loadstring(game:HttpGet("https://api.luarmor.net/files/v3/loaders/premium_loader.lua"))()`);
        showDashboardToast('Premium Script copied to clipboard!', true);
    };

    window.resetHWID = async function () {
        if (!confirm('Are you sure you want to reset your HWID? This takes effect immediately.')) return;
        const res = await apiCall('/reset_hwid', {});
        showDashboardToast(res.message, res.success);
        if (res.success) {
            fetchDashboardStats();
        }
    };

    function showDashboardToast(msg, isSuccess) {
        showToast(isSuccess ? 'Success' : 'Error', msg, isSuccess, 4200);
    }

    // --- STUNNING 3D MODAL TILT EFFECT ---
    const modals = document.querySelectorAll('.modal');
    if (hasHoverPointer && !isLiteMode) {
        modals.forEach(modal => {
            const maxTilt = modal.id === 'dashboardModal' ? 0 : 16;

            modal.addEventListener('mousemove', (e) => {
                if (!modal.classList.contains('active')) return;
                const rect = modal.getBoundingClientRect();
                const x = e.clientX - rect.left - rect.width / 2;
                const y = e.clientY - rect.top - rect.height / 2;

                const rotateX = -(y / rect.height) * maxTilt;
                const rotateY = (x / rect.width) * maxTilt;

                modal.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1) translateY(0)`;
            });

            modal.addEventListener('mouseleave', () => {
                if (!modal.classList.contains('active')) return;
                modal.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) scale(1) translateY(0)';
                modal.style.transition = 'transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
            });

            modal.addEventListener('mouseenter', () => {
                modal.style.transition = 'transform 0.1s ease';
            });
        });
    }

    // --- HIGH PERFORMANCE CANVAS SNOWFALL & MOUSE PHYSICS ---
    const canvas = document.getElementById('snowfall');
    const mouseGlow = document.querySelector('.mouse-glow-tracker');
    const ambientScene = document.querySelector('.ambient-scene');
    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;

    if (!isLiteMode && hasHoverPointer) {
        window.addEventListener('mousemove', (e) => {
            mouseX = e.clientX;
            mouseY = e.clientY;
            if (mouseGlow) {
                mouseGlow.style.transform = `translate(calc(${mouseX}px - 50%), calc(${mouseY}px - 50%))`;
            }
            if (ambientScene && !prefersReducedMotion) {
                const offsetX = ((mouseX / window.innerWidth) - 0.5) * 14;
                const offsetY = ((mouseY / window.innerHeight) - 0.5) * 14;
                ambientScene.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0)`;
            }
        });
    }

    if (canvas && !isLiteMode && !prefersReducedMotion) {
        const ctx = canvas.getContext('2d');
        let width, height;
        let particles = [];
        const MAX_PARTICLES = window.innerWidth < 1200 ? 90 : 130;
        const MOUSE_RADIUS = 120; // How far the snow is pushed away
        let isSnowPaused = false;

        function resizeCanvas() {
            width = canvas.width = window.innerWidth;
            height = canvas.height = window.innerHeight;
        }

        class SnowParticle {
            constructor() {
                this.x = Math.random() * width;
                this.y = Math.random() * height;
                this.radius = Math.random() * 2 + 0.5;
                this.speedX = Math.random() * 1 - 0.5;
                this.speedY = Math.random() * 1 + 0.5;
                this.opacity = Math.random() * 0.5 + 0.2;
                this.baseX = this.x;
                this.baseY = this.y;
            }
            update() {
                this.y += this.speedY;
                this.x += this.speedX + Math.sin(this.y * 0.01) * 0.5;

                // --- MOUSE REPEL PHYSICS ---
                const dx = mouseX - this.x;
                const dy = mouseY - this.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance > 0 && distance < MOUSE_RADIUS) {
                    const forceDirectionX = dx / distance;
                    const forceDirectionY = dy / distance;
                    const force = (MOUSE_RADIUS - distance) / MOUSE_RADIUS;

                    // Push particles away smoothly
                    this.x -= forceDirectionX * force * 5;
                    this.y -= forceDirectionY * force * 5;
                }

                if (this.y > height) {
                    this.y = -10;
                    this.x = Math.random() * width;
                }
                if (this.x > width) this.x = 0;
                if (this.x < 0) this.x = width;
            }
            draw() {
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(180, 240, 255, ${this.opacity})`;
                ctx.fill();
            }
        }

        function initSnow() {
            resizeCanvas();
            for (let i = 0; i < MAX_PARTICLES; i++) {
                particles.push(new SnowParticle());
            }
            window.addEventListener('resize', resizeCanvas);
            animateSnow();
        }

        function animateSnow() {
            if (isSnowPaused) {
                return;
            }
            ctx.clearRect(0, 0, width, height);
            particles.forEach(p => {
                p.update();
                p.draw();
            });
            requestAnimationFrame(animateSnow);
        }

        document.addEventListener('visibilitychange', () => {
            isSnowPaused = document.hidden;
            if (!isSnowPaused) {
                requestAnimationFrame(animateSnow);
            }
        });

        initSnow();
    }

    // Global copy function for the Keys section
    window.copyKeyLink = function (link) {
        navigator.clipboard.writeText(link).then(() => {
            showToast('Copied', 'Key link copied to your clipboard.');
        });
    };
});
