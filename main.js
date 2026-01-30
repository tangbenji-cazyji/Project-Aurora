import { CONFIG } from './config.js';
import { MideaVillaSim } from './midea-sim.js';
import { TimeStrategist } from './time-strategist.js';
import { MatrixArchitect } from './matrix-architect.js';
import { StateManager } from './state-manager.js';
import { BehaviorPilot } from './behavior-pilot.js';
import { AIOrchestrator } from './ai-orchestrator.js';
import { TRANSLATIONS } from './i18n.js';

document.addEventListener('DOMContentLoaded', () => {
    console.log('Tasman Logic Initialized.');
    StateManager.init();

    const clockEl = document.getElementById('clock');
    const dateEl = document.getElementById('date-val');
    const logEl = document.getElementById('logs');

    let timeOffset = 0; // InternetTime - LocalTime
    let currentLang = localStorage.getItem('tasman-lang') || 'zh';
    let lastSimResults = null;
    let lastForecast = "";

    const getHobartTime = () => {
        const now = new Date(Date.now() + timeOffset);
        return new Date(now.toLocaleString("en-US", { timeZone: "Australia/Hobart" }));
    };

    const updateClock = () => {
        if (!clockEl && !dateEl) return;
        const hobartNow = getHobartTime();
        if (clockEl) {
            clockEl.textContent = hobartNow.toLocaleTimeString('zh-CN', { hour12: false });
        }
        if (dateEl) {
            const y = hobartNow.getFullYear();
            const m = String(hobartNow.getMonth() + 1).padStart(2, '0');
            const d = String(hobartNow.getDate()).padStart(2, '0');
            const dayNames = {
                zh: ['週日', '週一', '週二', '週三', '週四', '週五', '週六'],
                en: ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
            };
            const w = dayNames[currentLang][hobartNow.getDay()] || '';
            dateEl.textContent = `${y}-${m}-${d} ${w}`;
        }
    };

    const syncInternetTime = async () => {
        try {
            const start = Date.now();
            const resp = await fetch('https://worldtimeapi.org/api/timezone/Australia/Hobart');
            if (resp.ok) {
                const data = await resp.json();
                const latency = Date.now() - start;
                const internetTime = new Date(data.datetime).getTime() + (latency / 2);
                timeOffset = internetTime - Date.now();
                console.log(`[TIME_SYNC] Offset set: ${timeOffset}ms`);
                updateClock();
            }
        } catch (e) {
            console.warn('[TIME_SYNC] Failed, using local fallback.', e);
        }
    };

    const sim = new MideaVillaSim();
    const timeStrategist = new TimeStrategist();
    const matrix = new MatrixArchitect();
    const auraAI = new AIOrchestrator();

    const setLanguage = (lang) => {
        currentLang = lang;
        localStorage.setItem('tasman-lang', lang);
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (TRANSLATIONS[lang][key]) {
                if (el.tagName === 'TITLE') {
                    document.title = TRANSLATIONS[lang][key];
                } else {
                    el.textContent = TRANSLATIONS[lang][key];
                }
            }
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            if (TRANSLATIONS[lang][key]) el.placeholder = TRANSLATIONS[lang][key];
        });
        updateClock();
    };

    document.getElementById('lang-zh')?.addEventListener('click', () => setLanguage('zh'));
    document.getElementById('lang-en')?.addEventListener('click', () => setLanguage('en'));

    // Initialize
    setLanguage(currentLang);
    syncInternetTime();
    setInterval(syncInternetTime, 3600000); // Sync every hour
    setInterval(updateClock, 1000);

    const APPLIANCES = [
        { key: 'fridge', power: 0.15, isBaseline: true },
        { key: 'router', power: 0.02, isBaseline: true },
        { key: 'security_cam', power: 0.04, isBaseline: true },
        { key: 'nas_server', power: 0.06, isBaseline: true },
        { key: 'smart_hub', power: 0.01, isBaseline: true },
        { key: 'tv', power: 0.12, isBaseline: false },
        { key: 'washing_machine', power: 1.20, isBaseline: false },
        { key: 'dishwasher', power: 1.80, isBaseline: false },
        { key: 'microwave', power: 1.10, isBaseline: false },
        { key: 'kettle', power: 2.20, isBaseline: false },
        { key: 'hair_dryer', power: 1.50, isBaseline: false }
    ];

    let isFetching = false;
    const fetchData = async () => {
        if (isFetching) return;
        isFetching = true;

        try {
            const state = StateManager.get();
            const hobartNow = getHobartTime();
            const hour = hobartNow.getHours();

            // Automatic Behavioral Pilot
            if (state.field.autopilot) {
                const behavior = BehaviorPilot.calculateAutopilotLoad(hour, APPLIANCES);
                const updates = {};
                if (Math.abs(state.field.base_load_kw - behavior.total) > 0.01) {
                    updates.base_load_kw = behavior.total;
                }
                if (Math.abs(state.field.background_flux - behavior.background) > 0.01) {
                    updates.background_flux = behavior.background;
                }
                if (Object.keys(updates).length > 0) {
                    StateManager.set('field', updates);
                }
            }

            let irradiance = 800;
            let outdoor_temp = 14.5;
            let forecast = TRANSLATIONS[currentLang].weather_clear;
            let weatherStatus = "DEFAULT_SIM";

            if (CONFIG.OPENWEATHER_API_KEY && CONFIG.OPENWEATHER_API_KEY.length > 10 && !CONFIG.OPENWEATHER_API_KEY.includes("YOUR_")) {
                try {
                    // Current Weather
                    const owUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${CONFIG.COORDINATES.lat}&lon=${CONFIG.COORDINATES.lng}&appid=${CONFIG.OPENWEATHER_API_KEY}&units=metric`;
                    const owResp = await fetch(owUrl);
                    if (owResp.ok) {
                        const owData = await owResp.json();
                        if (owData.main) {
                            outdoor_temp = owData.main.temp;
                            irradiance = Math.max(100, 1000 - ((owData.clouds?.all || 0) * 8));
                            weatherStatus = "LIVE_OPEN_WEATHER";

                            // Sync live outdoor temp to global state for Space page
                            if (Math.abs(state.space.outdoor_temp - outdoor_temp) > 0.05) {
                                StateManager.set('space', { outdoor_temp });
                            }
                            const weatherDesc = owData.weather?.[0]?.main || 'Clear';
                            const localizedDesc = TRANSLATIONS[currentLang][`weather_${weatherDesc.toLowerCase()}`] || weatherDesc;
                            addLog(`${TRANSLATIONS[currentLang].weather_sync}: ${outdoor_temp.toFixed(1)}°C (${localizedDesc})`);
                        }
                    } else {
                        throw new Error(`API returned ${owResp.status}`);
                    }

                    // Simple Forecast (next 24h)
                    const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${CONFIG.COORDINATES.lat}&lon=${CONFIG.COORDINATES.lng}&appid=${CONFIG.OPENWEATHER_API_KEY}&units=metric`;
                    const fResp = await fetch(forecastUrl);
                    if (fResp.ok) {
                        const fData = await fResp.json();
                        const next24h = fData.list.slice(0, 8); // 8 intervals * 3h = 24h
                        forecast = next24h.map(f => {
                            const desc = f.weather[0].main;
                            const locDesc = TRANSLATIONS[currentLang][`weather_${desc.toLowerCase()}`] || desc;
                            return `${new Date(f.dt * 1000).getHours()}h: ${locDesc}, ${f.main.temp}°C`;
                        }).join("; ");
                    }
                } catch (e) {
                    console.warn("[WEATHER] Fetch failed:", e.message);
                    addLog(TRANSLATIONS[currentLang].weather_error);
                }
            }

            const temp_diff = Math.max(0, state.space.indoor_target - outdoor_temp);

            // AI Fingerprint Learning Simulation
            if (state.energy.thermal_type === 'AI_FINGERPRINT') {
                const drift = (Math.random() - 0.5) * 0.002;
                state.energy.fingerprint_val = Math.max(0.4, Math.min(2.0, state.energy.fingerprint_val + drift));
                state.energy.thermal_coefficient = state.energy.fingerprint_val;
                StateManager.set('energy', {
                    fingerprint_val: state.energy.fingerprint_val,
                    thermal_coefficient: state.energy.thermal_coefficient
                });
            }

            // Hardware Specs Integration
            const simResults = sim.update(
                irradiance * (state.energy.pv_efficiency / 0.18),
                temp_diff,
                state.field.base_load_kw,
                state.energy.midea_tier,
                state.energy.battery_modules,
                state.energy.thermal_coefficient
            );

            const strategy = timeStrategist.get30MinStrategy(simResults, hobartNow);
            const governance = matrix.govern(simResults, strategy);
            lastSimResults = simResults;
            lastForecast = forecast;
            const envContext = { forecast, outdoor_temp, irradiance };

            // Async AI Insights (Non-blocking)
            auraAI.getInsights({ simResults, strategy }, envContext, currentLang).then(insight => {
                docSetText('ai-insight-text', insight);
            });

            updateUI(irradiance, simResults, outdoor_temp, strategy, governance, state);

        } catch (error) {
            console.error('Data Sync Error:', error);
        } finally {
            isFetching = false;
        }
    };

    // AI Command Listener
    const aiInput = document.getElementById('ai-command-input');
    const aiStatus = document.getElementById('ai-status-pulse');

    aiInput?.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter' && aiInput.value.trim()) {
            const cmd = aiInput.value.trim();
            aiInput.value = '';
            aiInput.disabled = true;
            if (aiStatus) aiStatus.style.opacity = '1';

            try {
                const state = StateManager.get();
                const result = await auraAI.processCommand(cmd, state, lastSimResults, lastForecast, currentLang);

                if (result.delta) {
                    Object.keys(result.delta).forEach(cat => {
                        StateManager.set(cat, result.delta[cat]);
                    });
                }

                docSetText('ai-insight-text', result.feedback);
                addLog(`${TRANSLATIONS[currentLang].ai_cmd_prefix} ${result.feedback}`);
            } catch (err) {
                console.error("AI Command Error:", err);
            } finally {
                aiInput.disabled = false;
                if (aiStatus) aiStatus.style.opacity = '0';
                aiInput.focus();
            }
        }
    });

    function updateUI(irradiance, simResults, outdoor_temp, strategy, governance, manualState) {
        docSetText('irradiance-val', `${irradiance.toFixed(0)} W/m²`);
        docSetText('outdoor-temp-val', `${outdoor_temp.toFixed(1)}°C`);
        docSetText('static-load-val', `${manualState.field.base_load_kw.toFixed(2)} kW`);
        docSetText('habit-val', TRANSLATIONS[currentLang][manualState.field.habit] || manualState.field.habit);
        docSetText('indoor-target-val', `${manualState.space.indoor_target.toFixed(1)}°C`);

        document.getElementById('override-indicator')?.classList.toggle('hidden', !manualState.space.override);

        docSetText('pv-power-val', `${simResults.solar_pv_kw.toFixed(2)} kW`);
        docSetText('batt-soc-val', `${simResults.battery_soc.toFixed(1)}%`);
        docSetText('hp-power-val', `${simResults.heat_pump_kw.toFixed(2)} kW`);
        docSetText('cop-val', simResults.cop.toFixed(1));

        docSetText('dhw-temp-val', `${simResults.dhw_temp.toFixed(1)}°C`);
        const dhwBar = document.getElementById('dhw-progress');
        if (dhwBar) {
            const dhwPercent = ((simResults.dhw_temp - 15) / (manualState.energy.dhw_target - 15)) * 100;
            dhwBar.style.width = `${Math.max(5, Math.min(100, dhwPercent))}%`;
            dhwBar.classList.toggle('bg-orange-600', simResults.dhw_energy_kw > 0);
            dhwBar.classList.toggle('bg-orange-400', simResults.dhw_energy_kw === 0);
        }
        const stressCore = document.getElementById('stress-core');
        const stressVal = parseFloat(governance.stress_index);

        if (stressCore) {
            const scale = 1 + (stressVal * 0.2);
            stressCore.style.transform = `scale(${scale})`;
            stressCore.style.borderColor = `rgba(34, 211, 238, ${0.1 + (stressVal * 0.4)})`;
        }

        const forceManifold = matrix.getForceVector(simResults, strategy, outdoor_temp, manualState.space.indoor_target);
        const totalCurrent = (simResults.base_load_kw + simResults.heat_pump_kw + simResults.dhw_energy_kw + simResults.buh_kw).toFixed(2);
        const safetyStatus = totalCurrent < 8.5 ? TRANSLATIONS[currentLang].safe : TRANSLATIONS[currentLang].alert;
        docSetText('total-load-val', `${TRANSLATIONS[currentLang].total_load_prefix}: ${totalCurrent}kW (${safetyStatus})`);

        const axialStress = {
            Ex: parseFloat(forceManifold.Ex),
            Sy: parseFloat(forceManifold.Sy),
            Tz: parseFloat(forceManifold.Tz),
            overall: stressVal,
            pulse_freq: strategy.goal === 'STABLE' ? 0.02 : 0.05,
            breach_predicted: totalCurrent > 7.5,
            breach_accepted: totalCurrent > 8.5
        };

        window.dispatchEvent(new CustomEvent('tasman-stress-update', { detail: axialStress }));
        const gridPeriodEl = document.getElementById('grid-period-val');
        if (gridPeriodEl) {
            gridPeriodEl.textContent = TRANSLATIONS[currentLang][strategy.periodI18n] || strategy.period.toUpperCase();
            gridPeriodEl.className = 'px-2 py-1 text-[8px] rounded font-black uppercase tracking-tighter transition-all';
            if (strategy.period === 'peak') {
                gridPeriodEl.classList.add('bg-rose-900/40', 'text-rose-500');
            } else if (strategy.period === 'shoulder') {
                gridPeriodEl.classList.add('bg-amber-900/40', 'text-amber-500');
            } else {
                gridPeriodEl.classList.add('bg-emerald-900/40', 'text-emerald-500');
            }
        }
        docSetText('grid-price-val', strategy.price.toFixed(2));
        docSetText('grid-strategy-desc', TRANSLATIONS[currentLang][strategy.strategyI18n] || strategy.recommendation);

        if (simResults.buh_active) {
            addLog(`${TRANSLATIONS[currentLang].buh_status}: ${TRANSLATIONS[currentLang].status_active}`);
        }

        const battBar = document.getElementById('batt-progress');
        if (battBar) battBar.style.width = `${simResults.battery_soc}%`;
        const pvBar = document.getElementById('pv-progress');
        if (pvBar) {
            const maxPv = manualState.energy.midea_tier === 'ARCTIC_14' ? 15 : 10;
            pvBar.style.width = `${Math.min(100, (simResults.solar_pv_kw / maxPv) * 100)}%`;
        }
    }

    function docSetText(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    function addLog(message) {
        const ts = getHobartTime().toLocaleTimeString('zh-CN', { hour12: false });
        if (logEl) logEl.textContent = `[${ts}] ${message}`;
    }

    StateManager.subscribe(() => fetchData());
    fetchData();
    setInterval(fetchData, 60000);

    const canvas = document.getElementById('twin-canvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        let width, height;
        const resize = () => { width = canvas.width = window.innerWidth; height = canvas.height = window.innerHeight; };
        window.addEventListener('resize', resize); resize();
        const particles = Array.from({ length: 50 }, () => ({
            x: Math.random() * width, y: Math.random() * height,
            vx: (Math.random() - 0.5) * 0.5, vy: (Math.random() - 0.5) * 0.5, size: Math.random() * 2
        }));
        const animate = () => {
            ctx.clearRect(0, 0, width, height);
            ctx.fillStyle = 'rgba(34, 211, 238, 0.5)';
            particles.forEach(p => {
                p.x += p.vx; p.y += p.vy;
                if (p.x < 0) p.x = width; if (p.x > width) p.x = 0; if (p.y < 0) p.y = height; if (p.y > height) p.y = 0;
                ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
            });
            ctx.strokeStyle = 'rgba(34, 211, 238, 0.05)'; ctx.lineWidth = 1;
            for (let i = 0; i < width; i += 50) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, height); ctx.stroke(); }
            for (let j = 0; j < height; j += 50) { ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(width, j); ctx.stroke(); }
            requestAnimationFrame(animate);
        };
        animate();
    }

    const coreCanvas = document.getElementById('matrix-core-canvas');
    if (coreCanvas) {
        const cctx = coreCanvas.getContext('2d');
        const cwidth = coreCanvas.width = 2048;
        const cheight = coreCanvas.height = 2048;
        let forces = { Ex: 0.5, Sy: 0.5, Tz: 1.0, pulse_freq: 0.02, overall: 0, breach_predicted: false, breach_accepted: false };
        window.addEventListener('tasman-stress-update', (e) => { forces = e.detail; });
        const nodeCount = 120;
        const nodes = [];
        for (let i = 0; i < nodeCount; i++) {
            const phi = Math.acos(-1 + (2 * i) / nodeCount);
            const theta = Math.sqrt(nodeCount * Math.PI) * phi;
            nodes.push({ baseX: Math.cos(theta) * Math.sin(phi), baseY: Math.sin(theta) * Math.sin(phi), baseZ: Math.cos(phi), phase: Math.random() * Math.PI * 2 });
        }
        const connections = [];
        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                const dist = Math.sqrt(Math.pow(nodes[i].baseX - nodes[j].baseX, 2) + Math.pow(nodes[i].baseY - nodes[j].baseY, 2) + Math.pow(nodes[i].baseZ - nodes[j].baseZ, 2));
                if (dist < 0.45) connections.push([i, j]);
            }
        }
        let pulse = 0;
        const animateCore = () => {
            if (!coreCanvas) return;
            cctx.clearRect(0, 0, cwidth, cheight);
            pulse += forces.pulse_freq || 0.02;
            let color = "#22d3ee";
            if (forces.breach_predicted) color = "#f97316";
            if (forces.breach_accepted) color = "#a855f7";
            const ex = parseFloat(forces.Ex) || 1.0;
            const sy = parseFloat(forces.Sy) || 1.0;
            const tz = parseFloat(forces.Tz) || 1.0;
            const overall = parseFloat(forces.overall) || 0;
            const projected = nodes.map(n => {
                const wobble = Math.sin(pulse + n.phase) * 0.05;
                let x = n.baseX * (ex * 1.2 + wobble);
                let y = n.baseY * (sy * 1.5 + wobble);
                let z = n.baseZ * (tz * 0.8 + wobble);
                if (forces.breach_predicted) {
                    const pull = overall * 0.7;
                    x *= (1 - pull); y *= (1 - pull); z *= (1 - pull);
                }
                const ax = 0.35, ay = 0.45;
                let tx = x * Math.cos(ay) - z * Math.sin(ay);
                let tz2 = x * Math.sin(ay) + z * Math.cos(ay);
                let ty = y * Math.cos(ax) - tz2 * Math.sin(ax);
                tz2 = y * Math.sin(ax) + tz2 * Math.cos(ax);
                const factor = 1200 / (tz2 + 8);
                return { x: tx * factor + cwidth / 2, y: ty * factor + cheight / 2, z: tz2 };
            });
            cctx.lineWidth = 0.8;
            connections.forEach(([i, j]) => {
                const p1 = projected[i]; const p2 = projected[j];
                const opacity = 0.1 + (0.3 / (p1.z + p2.z + 10));
                cctx.strokeStyle = color;
                cctx.globalAlpha = forces.breach_accepted ? opacity * 1.5 : opacity;
                cctx.beginPath(); cctx.moveTo(p1.x, p1.y); cctx.lineTo(p2.x, p2.y); cctx.stroke();
            });
            projected.forEach(p => {
                cctx.globalAlpha = 0.6; cctx.fillStyle = color;
                cctx.beginPath(); cctx.arc(p.x, p.y, forces.breach_accepted ? 1.5 : 2, 0, Math.PI * 2); cctx.fill();
                if (forces.breach_predicted) { cctx.shadowBlur = 10; cctx.shadowColor = color; cctx.fill(); cctx.shadowBlur = 0; }
            });
            requestAnimationFrame(animateCore);
        };
        animateCore();
    }
});
