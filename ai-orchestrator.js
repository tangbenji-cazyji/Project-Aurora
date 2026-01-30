import { GeminiAPI } from './gemini-api.js';

/**
 * AI Orchestrator
 * Interprets system telemetry and provides neural insights.
 */
export class AIOrchestrator {
    constructor() {
        this.lastInsight = "";
        this.isThinking = false;
        this.nextUpdate = 0;
    }

    /**
     * Get deep insight based on system state
     */
    async getInsights(systemState, envContext, lang = 'zh') {
        const now = Date.now();
        if (now < this.nextUpdate && this.lastInsight) return this.lastInsight;
        if (this.isThinking) return this.lastInsight;

        this.isThinking = true;

        const systemSummary = `
            Time: ${new Date().getHours()}:${new Date().getMinutes()} (Hobart)
            Solar: ${systemState.simResults.solar_pv_kw.toFixed(2)} kW (Today: ${systemState.simResults.daily_pv_kwh.toFixed(1)} kWh)
            Battery: ${systemState.simResults.battery_soc.toFixed(1)}%
            Total Load: ${systemState.simResults.total_load_kw.toFixed(2)} kW
            Grid Tariff: ${systemState.strategy.period}
            Environment: ${envContext.forecast} (Temp: ${envContext.outdoor_temp.toFixed(1)}°C)
        `;

        const prompt = lang === 'zh'
            ? `你是一个名为 AURA 的高级全域治理 AI。请分析以下 Hobart 智慧别墅的实时能量数据和天气预报，并提供一个极其精炼的“神经洞察”（2句话）。
               侧重于根据预报（如：预报有雨、气温下降）对当前决策的预测性建议。
               不要打招呼。数据摘要：${systemSummary}`
            : `You are AURA, an advanced governance AI. Analyze the telemetry and 24h forecast below to provide a 2-sentence Neural Insight.
               Focus on predictive advice based on the forecast trends (e.g. rain prep, thermal buffering).
               No greetings. Telemetry: ${systemSummary}`;

        try {
            const insight = await GeminiAPI.analyze(prompt);
            this.lastInsight = insight.trim();
            this.nextUpdate = now + 45000;
        } catch (e) {
            console.warn("[AI_ORCHESTRATOR] Insights Failed:", e);
            if (!this.lastInsight) this.lastInsight = "Awaiting neural synchronization...";
        } finally {
            this.isThinking = false;
        }
        return this.lastInsight;
    }

    /**
     * Process natural language command to update state
     */
    async processCommand(command, currentState, telemetry, forecast, lang = 'zh') {
        // Deep Telemetry sanitization for prompt size and safety
        const telemetrySnap = {
            solar: telemetry?.solar_pv_kw,
            pv_day: telemetry?.daily_pv_kwh,
            load_day: telemetry?.daily_load_kwh,
            batt: telemetry?.battery_soc,
            load: telemetry?.total_load_kw
        };

        const prompt = `
            You are AURA, the core energy controller. 
            USER INPUT: "${command}"
            
            CONTEXT:
            - Persistent Config: ${JSON.stringify(currentState)}
            - Live Telemetry: ${JSON.stringify(telemetrySnap)}
            - 24h Forecast: ${forecast}
            
            RULES:
            1. If asking about data, answer using thermal or economic terms (COP, Entropy, ToU, Peak Shaving) if relevant.
            2. Valid keys: field.base_load_kw, space.indoor_target, space.override, time.peak_load, time.off_peak_load, field.habit, field.autopilot.
            3. If user wants to save money, suggest lowering time.peak_load and explain the "Peak Shaving" strategy.
            4. CRITICAL: Return ONLY a JSON object. No Markdown.
            
            SCHEMA:
            {
              "delta": { "category": { "key": "value" } } or null,
              "feedback": "A single concise expert sentence in ${lang === 'zh' ? 'Chinese' : 'English'}."
            }
        `;

        try {
            console.log("[AI_ORCHESTRATOR] Sending Prompt...");
            const rawResponse = await GeminiAPI.analyze(prompt);
            console.log("[AI_ORCHESTRATOR] Raw Response:", rawResponse);

            // Resilient JSON extraction: look for the outermost braces
            const firstBrace = rawResponse.indexOf('{');
            const lastBrace = rawResponse.lastIndexOf('}');

            if (firstBrace === -1 || lastBrace === -1) {
                return { delta: null, feedback: rawResponse.trim() };
            }

            const jsonCandidate = rawResponse.substring(firstBrace, lastBrace + 1);
            try {
                return JSON.parse(jsonCandidate);
            } catch (err) {
                console.warn("[AI_ORCHESTRATOR] JSON Parse Error. Attempting cleanup.");
                // Fallback: search for feedback field manually if JSON is mangled
                const fbMatch = rawResponse.match(/"feedback":\s*"([^"]+)"/);
                return {
                    delta: null,
                    feedback: fbMatch ? fbMatch[1] : rawResponse.split('\n')[0].trim()
                };
            }
        } catch (e) {
            console.error("[AI_ORCHESTRATOR] Fatal Error:", e);
            return {
                delta: null,
                feedback: lang === 'zh' ? `神经链路中断: ${e.message}` : `Neural link severance: ${e.message}`
            };
        }
    }
}
