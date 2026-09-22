/**
 * The source of a heartbeat, as the crew service sees it.
 *
 * Two providers, one interface, and the difference is never hidden.
 * `simulated` invents a plausible rhythm so the whole chain (the bands, the
 * abort conditions, the panel on the page, the sentences Mother says) can be
 * built and rehearsed with nothing strapped to anyone. `bridge` holds no
 * radio at all: a gateway outside this process reads a real strap and pushes
 * what it reads through `biomed.report`; the service treats those samples
 * exactly like the invented ones, which is the point of the interface.
 *
 * A provider says whether it is `live`. The slot publishes itself as a stub
 * while nothing real is attached, so neither the trace nor the screen can
 * mistake a rehearsal for a measurement. The day the strap is on a chest,
 * one field flips and every line of the trace says so.
 *
 * What a standard BLE Heart Rate Service gives (0x180D, characteristic
 * 0x2A37, which is what the Polar H10 exposes): a rate in beats per minute
 * and, when the device sends them, the beat-to-beat intervals. It does NOT
 * give an ECG waveform; the H10 has one, but on its own service, at 130 Hz,
 * which is a different job and is not this. So `rrMs` is the finest thing
 * this slot ever holds, and anything drawn on screen is drawn from it.
 */

export interface HeartRateSample {
    subjectId: string;
    /** Beats per minute, as the device reported it. */
    bpm: number;
    /**
     * Beat-to-beat intervals in milliseconds, newest last, when the device
     * sends them. The standard carries them in units of 1/1024 s; whoever
     * parses the characteristic converts before it gets here.
     */
    rrMs?: number[];
    /** When the sample was taken, ISO 8601. */
    at: string;
    /** What produced it: `simulated`, `polar-h10`, ... It goes into the record and onto the screen. */
    source: string;
}

export type SampleSink = (sample: HeartRateSample) => void;

export interface HeartRateProvider {
    /** `simulated`, `bridge`, ... as the trace names it. */
    readonly id: string;
    /** True when a real device is behind it. The slot publishes `stub: !live`. */
    readonly live: boolean;
    /** Begins watching these subjects, or throws with a reason a human can read. */
    start(subjectIds: string[], onSample: SampleSink): Promise<void>;
    stop(): Promise<void>;
}
