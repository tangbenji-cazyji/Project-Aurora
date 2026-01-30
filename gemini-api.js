import { CONFIG } from './config.js';

/**
 * Gemini API Wrapper
 * Handles communication with Google AI with aggressive model searching.
 */
export const GeminiAPI = {
    /**
     * Generate content from a prompt
     * @param {string} prompt 
     */
    async analyze(prompt) {
        if (!CONFIG.GOOGLE_API_KEY || CONFIG.GOOGLE_API_KEY.includes("YOUR_")) {
            throw new Error("Gemini API key not configured.");
        }

        // Expanded list of model/version candidates to pierce through 404s
        const attempts = [
            { ver: 'v1beta', model: 'gemini-1.5-flash-latest' },
            { ver: 'v1beta', model: 'gemini-1.5-flash' },
            { ver: 'v1', model: 'gemini-1.5-flash' },
            { ver: 'v1', model: 'gemini-pro' },
            { ver: 'v1beta', model: 'gemini-pro' }
        ];

        let lastError = null;

        for (const attempt of attempts) {
            try {
                const url = `https://generativelanguage.googleapis.com/${attempt.ver}/models/${attempt.model}:generateContent?key=${CONFIG.GOOGLE_API_KEY}`;

                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [{ text: prompt }]
                        }],
                        generationConfig: {
                            temperature: 0.7,
                            topK: 40,
                            topP: 0.95,
                            maxOutputTokens: 300,
                        }
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.candidates && data.candidates[0].content) {
                        return data.candidates[0].content.parts[0].text;
                    }
                } else {
                    const status = response.status;
                    const errorText = await response.text();
                    console.warn(`[GEMINI_API] 404/Fail on ${attempt.ver}/${attempt.model}:`, status, errorText);

                    // If it's a 401/403, no point in trying other models
                    if (status === 401 || status === 403) {
                        throw new Error(`Auth Error (${status}): Check your API Key.`);
                    }

                    lastError = new Error(`HTTP ${status} on ${attempt.model}`);
                }
            } catch (err) {
                console.warn(`[GEMINI_API] Attempt error (${attempt.model}):`, err);
                lastError = err;
                if (err.message.includes("Auth Error")) throw err;
            }
        }

        throw lastError || new Error("AURA couldn't find a compatible AI model branch.");
    }
};
