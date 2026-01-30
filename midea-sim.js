/**
 * Midea Villa Device Simulation Engine
 * Models Solar PV, Battery, and Heat Pump behaviors.
 */
export class MideaVillaSim {
    constructor() {
        // Midea Villa Professional Specs
        this.tiers = {
            "ARCTIC_12": {
                name: "Arctic 12kW",
                maxInverter: 8.0, // ME-HS8L
                maxPv: 10.0,
                hpRating: 3.5, // Avg Elec Input
                hpMaxInput: 4.2,
                buhPower: 3.0, // 3kW Backup Heater
                defModules: 3,
                tankSize: 240
            },
            "ARCTIC_14": {
                name: "Arctic 14kW",
                maxInverter: 10.0, // M1-T10K
                maxPv: 15.0,
                hpRating: 4.2,
                hpMaxInput: 5.5,
                buhPower: 6.0, // 6kW Backup Heater
                defModules: 4,
                tankSize: 300
            }
        };

        this.state = {
            solar_pv_kw: 0,
            battery_soc: 72,
            battery_power_kw: 0,
            heat_pump_kw: 1.5,
            buh_active: false,
            buh_kw: 0,
            cop: 4.2,
            base_load_kw: 0.85,
            total_load_kw: 2.35,
            dhw_temp: 48,
            dhw_energy_kw: 0,
            daily_pv_kwh: 12.8,   // Simulated start of day accumulation
            daily_load_kwh: 15.4
        };
    }

    /**
     * Update simulation state
     * @param {number} irradiance - W/m2 
     * @param {number} deltaTemp - Temperature difference
     * @param {number} baseLoad - Manual override
     * @param {string} tier - Midea Tier (ARCTIC_12, ARCTIC_14)
     * @param {number} modules - Battery modules (5.12kWh each)
     * @param {number} thermalCoefficient - House thermal loss factor
     * @param {number} dhwTarget - Target water temp
     * @param {number} dhwTankVolume - Tank size in Liters
     */
    update(irradiance, deltaTemp, baseLoad = 0.85, tier = "ARCTIC_12", modules = 3, thermalCoefficient = 1.0, dhwTarget = 55, dhwTankVolume = 200) {
        const spec = this.tiers[tier] || this.tiers["ARCTIC_12"];
        const battCapacity = modules * 5.12;
        this.state.base_load_kw = baseLoad;

        // 1. Solar PV logic with Tier limit
        const potentialPv = (irradiance / 1000) * (spec.maxPv / 0.85) * 0.85;
        this.state.solar_pv_kw = Math.min(spec.maxPv, potentialPv);

        // 2. Heat Pump: Scaled by HP Rating and Thermal Coefficient
        this.state.cop = Math.max(1.8, 5.0 - (deltaTemp * 0.12));
        const hpBaseLoad = (deltaTemp / this.state.cop) * spec.hpRating;
        this.state.heat_pump_kw = Math.max(0.4, Math.min(spec.hpMaxInput, hpBaseLoad * thermalCoefficient));

        // Arctic BUH (Backup Heater) Activation Logic
        if (deltaTemp > 15) {
            this.state.buh_active = true;
            this.state.buh_kw = spec.buhPower;
        } else {
            this.state.buh_active = false;
            this.state.buh_kw = 0;
        }

        // 3. DHW (Domestic Hot Water) Logic
        this.state.dhw_temp -= 0.05;

        if (this.state.dhw_temp < dhwTarget - 5) {
            this.state.dhw_energy_kw = spec.hpRating * 1.2;
            const tempIncrease = (this.state.dhw_energy_kw * 1000 * (1 / 60)) / (dhwTankVolume * 1.16);
            this.state.dhw_temp += tempIncrease;
        } else {
            this.state.dhw_energy_kw = 0;
        }
        this.state.dhw_temp = Math.min(dhwTarget, this.state.dhw_temp);

        // 4. Battery Management with Tier Limit
        const consumption = this.state.heat_pump_kw + this.state.base_load_kw + this.state.dhw_energy_kw + this.state.buh_kw;
        const netPower = this.state.solar_pv_kw - consumption;

        // Battery charge/discharge bandwidth: 2.5kW per H1 Module
        const maxBattPower = Math.min(spec.maxInverter, modules * 2.5);

        if (netPower > 0) {
            this.state.battery_power_kw = -Math.min(maxBattPower, netPower);
        } else {
            this.state.battery_power_kw = Math.min(maxBattPower, Math.abs(netPower));
        }

        // SoC Update (1 minute step)
        const energyDeltaKWh = (this.state.battery_power_kw * (1 / 60));
        const socDelta = (energyDeltaKWh / battCapacity) * 100;
        this.state.battery_soc = Math.max(10, Math.min(100, this.state.battery_soc - socDelta));

        this.state.total_load_kw = consumption;

        // Cumulative Energy logic (1 minute step)
        this.state.daily_pv_kwh += (this.state.solar_pv_kw / 60);
        this.state.daily_load_kwh += (this.state.total_load_kw / 60);

        return this.state;
    }
}
