/**
 * What a person and a crew share: the ladder of activities and NASA's rate
 * per activity (library `nasa-crew-metabolic-loads`), the reading of an
 * activity off a signal, and the litres-to-mass conversion.
 *
 * An activity on a wire is a word (`sleep`, `rest`, `light_work`,
 * `heavy_work`) or a number, the rung of the ladder (0 asleep to 3 at
 * heavy work), so a `Logic.Time:timeline`, which holds numbers, can
 * schedule a person's day; a fraction is rounded to the nearest rung.
 */
export const HABITAT_ACTIVITIES = ["sleep", "rest", "light_work", "heavy_work"] as const;
export type HabitatActivity = (typeof HABITAT_ACTIVITIES)[number];

/** The per-person rates, litres of CO2 per minute at cabin conditions, one per rung. */
export interface ActivityRates {
    sleep: number;
    rest: number;
    lightWork: number;
    heavyWork: number;
}

/** NASA BVAD Rev2's reference crewmember: asleep 0.24, awake 0.38; rest between the two, heavy work well below exercise. */
export const REFERENCE_RATES: Readonly<ActivityRates> = { sleep: 0.24, rest: 0.3, lightWork: 0.38, heavyWork: 1.0 };

/** The activity a signal names, or the fallback when it names none. */
export function activityOf(value: unknown, fallback: HabitatActivity): HabitatActivity {
    if (typeof value === "number" && Number.isFinite(value)) return HABITAT_ACTIVITIES[Math.max(0, Math.min(HABITAT_ACTIVITIES.length - 1, Math.round(value)))];
    if (typeof value === "string" && (HABITAT_ACTIVITIES as ReadonlyArray<string>).includes(value)) return value as HabitatActivity;
    return fallback;
}

/** The rung of an activity on the ladder, 0 to 3. */
export const activityLevel = (activity: HabitatActivity): number => HABITAT_ACTIVITIES.indexOf(activity);

/** The per-person rate of an activity, L/min. */
export function rateOf(rates: Readonly<ActivityRates>, activity: string): number {
    switch (activity) {
        case "sleep":
            return rates.sleep;
        case "rest":
            return rates.rest;
        case "heavy_work":
            return rates.heavyWork;
        default:
            return rates.lightWork;
    }
}

/** Litres of CO2 per minute as a mass flow, kg/s, at the density of CO2 at cabin conditions (kg/m3). */
export const litresPerMinuteToKgps = (litres: number, co2DensityKgPerM3: number): number => (litres * 1e-3 * co2DensityKgPerM3) / 60;

/** The reverse: a mass flow, kg/s, as litres of CO2 per minute. */
export const kgpsToLitresPerMinute = (kgps: number, co2DensityKgPerM3: number): number => (co2DensityKgPerM3 > 0 ? (kgps * 60 * 1e3) / co2DensityKgPerM3 : 0);
