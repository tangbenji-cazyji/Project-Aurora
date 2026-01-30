/**
 * Time Strategist - Economic & Predictive Logic
 * Focuses on Tasmania Grid Policies (ToU) and 30-min window optimization.
 */
export class TimeStrategist {
    constructor() {
        // Tasmania common TOU pricing (Standard residential example)
        this.gridPolicy = {
            peak: { start: 7, end: 10, price: 0.38 },   // 07:00 - 10:00
            shoulder: { start: 10, end: 16, price: 0.22 }, // 10:00 - 16:00
            peak2: { start: 16, end: 21, price: 0.38 },  // 16:00 - 21:00
            offpeak: { start: 21, end: 7, price: 0.15 }  // 21:00 - 07:00
        };
    }

    /**
     * Get current grid price based on time
     * @param {Date} date 
     */
    getCurrentPrice(date = new Date()) {
        const hour = date.getHours();

        if (hour >= 7 && hour < 10) return { period: 'peak', price: this.gridPolicy.peak.price };
        if (hour >= 10 && hour < 16) return { period: 'shoulder', price: this.gridPolicy.shoulder.price };
        if (hour >= 16 && hour < 21) return { period: 'peak', price: this.gridPolicy.peak2.price };
        return { period: 'offpeak', price: this.gridPolicy.offpeak.price };
    }

    /**
     * Predict next 30 minutes strategy
     * @param {Object} currentState - Output from MideaVillaSim
     * @returns {Object} Strategy goals
     */
    get30MinStrategy(currentState) {
        const now = new Date();
        const current = this.getCurrentPrice(now);

        // Look ahead 30 mins
        const futureDate = new Date(now.getTime() + 30 * 60000);
        const future = this.getCurrentPrice(futureDate);

        let goal = "STABLE";
        let recommendation = "";
        let strategyI18n = "";

        // Economic Steering Logic
        if (current.period === 'offpeak') {
            strategyI18n = "offpeak_strategy";
            if (future.period === 'peak' || future.period === 'shoulder') {
                goal = "PRE_CHARGE";
                recommendation = "Upcoming price surge. Accelerating battery buffering.";
            } else {
                goal = "RESERVE_MODE";
                recommendation = "Low tariff window. Optimizing thermal storage.";
            }
        } else if (current.period === 'peak') {
            strategyI18n = "peak_strategy";
            goal = "PEAK_SHAVING";
            recommendation = "Critical high tariff. Inhibiting grid draw via SoC-Max.";
        } else if (current.period === 'shoulder') {
            strategyI18n = "shoulder_strategy";
            goal = "BALANCED_FLUX";
            recommendation = "Standard trading flux. Balancing PV with internal demand.";
        }

        return {
            period: current.period,
            price: current.price,
            periodI18n: `period_${current.period}`,
            strategyI18n,
            goal,
            recommendation,
            nextPriceChange: future.period !== current.period ? "Imminent" : "Stable window"
        };
    }
}
