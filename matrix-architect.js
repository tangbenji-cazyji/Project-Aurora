/**
 * Matrix Architect - The Shadow Governance System
 * Arbitrates between Space, Energy, Time, and Field.
 */
export class MatrixArchitect {
    constructor() {
        this.redline_kw = 8.5;
        this.stress_index = 0;
    }

    /**
     * Calculate Matrix Stress & Dispatch Plan
     * @param {Object} state - Current energy assets state
     * @param {Object} strategy - Recommendation from Time Strategist
     */
    govern(state, strategy) {
        const total_consumption = state.total_load_kw || (state.base_load_kw + state.heat_pump_kw + (state.dhw_energy_kw || 0) + (state.buh_kw || 0));
        const net_load = Math.max(0, total_consumption - state.solar_pv_kw);

        // 1. Calculate Stress Index (0-1)
        // Stress increases as load approaches redline
        this.stress_index = Math.min(1, net_load / this.redline_kw);

        const actions = [];

        // 2. Redline Protection (Highest Priority)
        if (net_load > this.redline_kw * 0.9) {
            actions.push({ target: "heat_pump", op: "throttle", value: 30, reason: "REDLINE_PROTECTION" });
            actions.push({ target: "battery", op: "max_discharge", value: 100, reason: "REDLINE_PROTECTION" });
        }

        // 3. Economic Steering (Arbitrated by Stress)
        if (strategy.goal === 'PEAK_SHAVING' && this.stress_index < 0.8) {
            actions.push({ target: "battery", op: "discharge", value: 80, reason: "ECONOMIC_OPTIMIZATION" });
        } else if (strategy.goal === 'PRE_CHARGE') {
            actions.push({ target: "battery", op: "charge", value: 100, reason: "ECONOMIC_PREPARATION" });
        }

        return {
            stress_index: this.stress_index.toFixed(2),
            actions,
            strategy_approved: strategy.goal,
            sovereignty: "ADVISORY"
        };
    }

    /**
     * THREE DUALITIES FIELD FORMULA
     * Calculates the 3D Force Manifold [Ex, Sy, Tz]
     * @param {Object} state 
     * @param {Object} strategy 
     */
    getForceVector(state, strategy, outdoorTemp, indoorTarget = 22) {
        // Tension (X): Energy -> Resilience Factor (Battery + PV)
        // Expressed as X-axis expansion/buoyancy
        const pvFactor = (state.solar_pv_kw / 10); // Normalizing 10kW as 1.0
        const Ex = ((state.battery_soc / 100) * 0.7) + (pvFactor * 0.3) + 0.5;

        // Pressure (Y): Space -> Atmospheric Load (Temp Gradient)
        // Expressed as Y-axis compression
        const temp_gradient = Math.abs(indoorTarget - outdoorTemp);
        const Sy = Math.max(0.2, 1.2 - (temp_gradient / 20)); // Inverse: higher gradient = lower Sy

        // Cadence (Z): Time -> Strategy Velocity
        const Tz = strategy.goal === 'STABLE' ? 1.0 : 1.8;

        return {
            Ex: Ex.toFixed(3),
            Sy: Sy.toFixed(3),
            Tz: Tz.toFixed(3),
            magnitude: Math.sqrt(Ex * Ex + Sy * Sy + Tz * Tz).toFixed(3)
        };
    }
}
