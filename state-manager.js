/**
 * Tasman State Manager
 * Handles cross-page synchronization via localStorage.
 */
export const StateManager = {
    // Default Initial State
    defaults: {
        field: { base_load_kw: 0.85, background_flux: 0.75, habit: "HOME_OFFICE", autopilot: true },
        space: { outdoor_temp: 14.5, indoor_target: 22.0, override: false },
        energy: {
            midea_tier: "ARCTIC_12",
            battery_modules: 3, // 5kWh each
            pv_efficiency: 0.18,
            thermal_type: "BRICK_VENEER", // WEATHERBOARD, BRICK_VENEER, MODERN, AI_FINGERPRINT
            thermal_coefficient: 1.2,
            fingerprint_val: 0.82, // Simulated learned fingerprint
            dhw_target: 55, // 55°C default
            dhw_tank_volume: 200 // 200L default for Midea Villa
        },
        time: { peak_price: 0.38, offpeak_price: 0.15 }
    },

    init() {
        if (!localStorage.getItem('tasman_state')) {
            localStorage.setItem('tasman_state', JSON.stringify(this.defaults));
        }
    },

    get() {
        const stored = JSON.parse(localStorage.getItem('tasman_state'));
        if (!stored) return this.defaults;
        // Basic deep alignment (ensure energy/etc keys exist)
        return {
            field: { ...this.defaults.field, ...stored.field },
            space: { ...this.defaults.space, ...stored.space },
            energy: { ...this.defaults.energy, ...stored.energy },
            time: { ...this.defaults.time, ...stored.time }
        };
    },

    set(key, value) {
        const state = this.get();
        state[key] = { ...state[key], ...value };
        localStorage.setItem('tasman_state', JSON.stringify(state));

        // Dispatch custom event for same-page listeners
        window.dispatchEvent(new CustomEvent('aurora-state-changed', { detail: state }));
    },

    subscribe(callback) {
        window.addEventListener('storage', (e) => {
            if (e.key === 'tasman_state') callback(JSON.parse(e.newValue));
        });
        window.addEventListener('tasman-state-changed', (e) => callback(e.detail));
    }
};
