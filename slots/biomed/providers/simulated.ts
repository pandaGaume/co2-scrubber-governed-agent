/**
 * A heartbeat with nobody behind it: a resting rate that drifts slowly and
 * breathes, so the panel, the bands and the abort conditions can be built
 * and filmed in rehearsal without a strap. It costs nothing and it lies
 * about nothing: `live` is false, the slot publishes itself as a stub, and
 * every sample carries `source: "simulated"`.
 *
 * The walk is deterministic for a given seed, so a test can assert on the
 * numbers. `push(subjectId, bpm)` forces a value, which is how a test drives
 * a subject out of the nominal band without waiting for chance.
 */
import type { HeartRateProvider, HeartRateSample, SampleSink } from "../heart-rate-provider.js";

export interface SimulatedOptions {
    /** Resting rate per subject; 62 bpm for anyone not named. */
    restingBpm?: Record<string, number>;
    /** How often a sample is produced, in milliseconds. */
    periodMs?: number;
    seed?: number;
}

/** A small deterministic generator: the same seed gives the same night, twice. */
function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const DEFAULT_RESTING = 62;

export class SimulatedProvider implements HeartRateProvider {
    readonly id = "simulated";
    readonly live = false;

    private timer: ReturnType<typeof setInterval> | null = null;
    private readonly rate = new Map<string, number>();
    private readonly random: () => number;
    private phase = 0;

    constructor(private readonly options: SimulatedOptions = {}) {
        this.random = mulberry32(options.seed ?? 20261014);
    }

    async start(subjectIds: string[], onSample: SampleSink): Promise<void> {
        await this.stop();
        for (const id of subjectIds) this.rate.set(id, this.options.restingBpm?.[id] ?? DEFAULT_RESTING);
        const period = this.options.periodMs ?? 1000;
        const tick = () => {
            this.phase += period / 1000;
            for (const id of subjectIds) onSample(this.sample(id));
        };
        this.timer = setInterval(tick, period);
        // Unref so a forgotten provider never holds the process open; the tests rely on it.
        this.timer.unref?.();
        tick();
    }

    async stop(): Promise<void> {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }

    /** Forces the next rate for a subject: a test raises someone out of band without waiting. */
    push(subjectId: string, bpm: number): void {
        this.rate.set(subjectId, bpm);
    }

    /** One sample: a slow random walk around the resting rate, plus a respiratory wobble. */
    private sample(subjectId: string): HeartRateSample {
        const resting = this.options.restingBpm?.[subjectId] ?? DEFAULT_RESTING;
        const previous = this.rate.get(subjectId) ?? resting;
        const drift = (resting - previous) * 0.08 + (this.random() - 0.5) * 1.6;
        const wobble = Math.sin(this.phase / 4) * 1.5;
        const bpm = Math.max(35, Math.min(200, Math.round(previous + drift + wobble)));
        this.rate.set(subjectId, bpm);
        return { subjectId, bpm, rrMs: [Math.round(60000 / bpm)], at: new Date().toISOString(), source: "simulated" };
    }
}
