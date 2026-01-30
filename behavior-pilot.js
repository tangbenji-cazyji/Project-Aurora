/**
 * Tasman Logic Behavior Pilot
 * Maps Hobart time to human habitation patterns.
 */
export const BehaviorPilot = {
    // 24h Behavior Matrix: [Hour, BackgroundFlux, ActiveApplianceKeys]
    matrix: [
        { start: 0, end: 6, flux: 0.12, active: [] }, // Deep Sleep
        { start: 6, end: 7, flux: 0.25, active: [] }, // Wake up prep
        { start: 7, end: 8, flux: 0.45, active: ['kettle', 'microwave'] }, // Breakfast & Coffee
        { start: 8, end: 9, flux: 0.60, active: ['hair_dryer'] }, // Shower & Hair dry
        { start: 9, end: 12, flux: 0.80, active: ['tv'] }, // Working / News
        { start: 12, end: 13, flux: 1.10, active: ['microwave'] }, // Lunch peak
        { start: 13, end: 17, flux: 0.75, active: [] }, // Focus work
        { start: 17, end: 18, flux: 0.40, active: [] }, // Commute / Gap
        { start: 18, end: 20, flux: 1.30, active: ['kettle', 'microwave', 'tv'] }, // Evening Peak / Dinner
        { start: 20, end: 22, flux: 0.90, active: ['dishwasher', 'tv'] }, // Cleaning & Relaxation
        { start: 22, end: 23, flux: 0.35, active: [] }, // Wind down
        { start: 23, end: 24, flux: 0.15, active: [] }  // Pre-sleep
    ],

    /**
     * Get current expected state based on Hobart Hour
     * @param {number} hour - 0-23
     * @returns {Object} { background, activeKeys }
     */
    getBehavior(hour) {
        const slot = this.matrix.find(s => hour >= s.start && hour < s.end);
        return slot || this.matrix[0];
    },

    /**
     * Calculate total base load based on behavior and appliance definitions
     * @param {number} hour 
     * @param {Array} applianceSpecs - Objects with {key, power, isBaseline}
     */
    calculateAutopilotLoad(hour, applianceSpecs) {
        const behavior = this.getBehavior(hour);
        let total = behavior.flux;

        applianceSpecs.forEach(app => {
            if (app.isBaseline) {
                total += app.power; // Baseline is always on
            } else if (behavior.active.includes(app.key)) {
                total += app.power;
            }
        });

        return {
            total: total,
            background: behavior.flux,
            activeKeys: behavior.active
        };
    }
};
