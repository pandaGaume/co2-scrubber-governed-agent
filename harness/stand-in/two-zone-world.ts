/**
 * A stand-in for the room, until the two-volume world runs in the
 * substrate (the CO2 in mass on `atmosphere`, spec section 17): the Lab and
 * Hab-B as two well-mixed zones, a scrubber in the Lab with a first-order
 * lag, the occupants as sources, and the inter-module ventilation that
 * carries Hab-B's air to the scrubber and back (the scrubber is centralised,
 * as on the ISS: without that flow Hab-B would have no CO2 removal).
 *
 *     VLab * dCl/dt = Gl - r(t) * Cl - q * (Cl - Ch)
 *     VHab * dCh/dt = Gh + q * (Cl - Ch)
 *     dr/dt         = (speed(t) * QeFull - r) / lag
 *
 * It exists to produce telemetry for the tests and the rehearsals of the
 * graph factory, and says so: nothing in the factory reads it, the factory
 * only receives its rows, as it would receive a logger's. Its constants
 * are the truth the factory has to find; the tests keep them to check it
 * found them.
 */

export interface TwoZoneWorld {
    VLab: number;
    VHab: number;
    /** The scrubber's effective flow at full speed, m3/min. */
    QeFull: number;
    /** The flow the inter-module ventilation delivers, hatch closed, m3/min: what the commissioning measures. */
    q: number;
    /** The ventilation's design flow, hatch closed, m3/min: what the documentation says. */
    qNominal: number;
    /** CO2 per person, L/min, in each zone. */
    gLabPerson: number;
    gHabPerson: number;
    labOccupants: number;
    habOccupants: number;
    lagMinutes: number;
    labStartPpm: number;
    habStartPpm: number;
}

/**
 * The Lab as the test world plays it. The crew's rates sit inside NASA's
 * band for a crewmember awake in the cabin (BVAD Rev2, Table 3-26: 0.26 to
 * 0.45 L/min, reference 0.38): two operators slightly above the reference,
 * as people at work are; Hab-B's two between asleep and awake. The twin
 * knows the band, never these numbers. The ventilation delivers 2 m3/min
 * where its design says 3 (a clogged filter, a damper half shut): the gap the
 * commissioning finds.
 */
export const LAB_WORLD: TwoZoneWorld = { VLab: 30, VHab: 400, QeFull: 1.0, q: 2.0, qNominal: 3.0, gLabPerson: 0.42, gHabPerson: 0.3, labOccupants: 2, habOccupants: 2, lagMinutes: 3.33, labStartPpm: 1480, habStartPpm: 1500 };

export interface TelemetryRow {
    minute: number;
    co2_lab_ppm: number;
    co2_habb_ppm: number;
    speed_percent: number;
}

/**
 * The same world, stepped a minute at a time by whoever drives the
 * scrubber: the example of the commissioning runs it under the agent's
 * procedure, reading the speed the board actually took at each minute, so
 * the telemetry answers the commands that were really sent.
 */
export class TwoZoneWorldSim {
    private cl: number;
    private ch: number;
    private r = 0;
    minute = 0;
    constructor(private readonly world: TwoZoneWorld) {
        this.cl = world.labStartPpm;
        this.ch = world.habStartPpm;
    }
    /** The row of the current minute, as the logger records it. */
    row(speedPercent: number): TelemetryRow {
        return { minute: this.minute, co2_lab_ppm: Math.round(this.cl), co2_habb_ppm: Math.round(this.ch), speed_percent: speedPercent };
    }
    /** One minute at this speed. */
    step(speedPercent: number): void {
        const w = this.world;
        const gl = w.labOccupants * w.gLabPerson * 1e3;
        const gh = w.habOccupants * w.gHabPerson * 1e3;
        const dt = 0.05;
        for (let k = 0; k < 1 / dt; k++) {
            this.r += (((speedPercent / 100) * w.QeFull - this.r) / w.lagMinutes) * dt;
            const dcl = (gl - this.r * this.cl - w.q * (this.cl - this.ch)) / w.VLab;
            const dch = (gh + w.q * (this.cl - this.ch)) / w.VHab;
            this.cl += dcl * dt;
            this.ch += dch * dt;
        }
        this.minute++;
    }
    get labPpm(): number {
        return this.cl;
    }
}

/** One row a minute over the steps (speed percent, minutes), integrated in twentieths of a minute. */
export function twoZoneTelemetry(world: TwoZoneWorld, steps: Array<{ speedPercent: number; minutes: number }>): TelemetryRow[] {
    const total = steps.reduce((s, x) => s + x.minutes, 0);
    const speedAt = (t: number) => {
        let end = 0;
        for (const s of steps) {
            end += s.minutes;
            if (t < end) return s.speedPercent;
        }
        return steps.at(-1)?.speedPercent ?? 0;
    };
    const gl = world.labOccupants * world.gLabPerson * 1e3; // ppm * m3 per minute
    const gh = world.habOccupants * world.gHabPerson * 1e3;
    const dt = 0.05;
    let cl = world.labStartPpm;
    let ch = world.habStartPpm;
    let r = 0;
    let t = 0;
    const rows: TelemetryRow[] = [];
    for (let m = 0; m <= total; m++) {
        rows.push({ minute: m, co2_lab_ppm: Math.round(cl), co2_habb_ppm: Math.round(ch), speed_percent: speedAt(m) });
        for (let k = 0; k < 1 / dt; k++) {
            r += (((speedAt(t) / 100) * world.QeFull - r) / world.lagMinutes) * dt;
            const dcl = (gl - r * cl - world.q * (cl - ch)) / world.VLab;
            const dch = (gh + world.q * (cl - ch)) / world.VHab;
            cl += dcl * dt;
            ch += dch * dt;
            t += dt;
        }
    }
    return rows;
}
