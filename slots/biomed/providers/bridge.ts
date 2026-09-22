/**
 * The provider with a real chest strap behind it, and no radio in this
 * process.
 *
 * A Bluetooth Low Energy peripheral has no address a server can dial: some
 * gateway has to hold the connection and relay. Here the gateway is outside
 * Node (the dashboard page over Web Bluetooth, a phone, a small script), it
 * reads the standard Heart Rate Service off a Polar H10, and it pushes each
 * reading through the slot's `report` tool. This class is the seam: it
 * accepts those pushes and hands them to the service as if it had read them
 * itself.
 *
 * Why the radio is not in here. On Windows, the usual Node BLE packages want
 * a WinUSB driver swapped under the Bluetooth adapter, which takes the
 * adapter away from everything else on the machine. A browser talks to the
 * same strap through the operating system's own stack with nothing
 * installed. Paying a round trip to keep the machine intact is the right
 * trade for a demo that has to work on a filming day.
 *
 * `live` is true: a real heart is on the other end, the slot stops
 * publishing itself as a stub, and the trace says so. It is true even before
 * the first reading arrives, because what makes it live is what the gateway
 * is connected to, not whether a packet has landed yet; a source that goes
 * quiet is a signal loss, which the service already treats as a reason to
 * abort, not as a rehearsal.
 */
import type { HeartRateProvider, HeartRateSample, SampleSink } from "../heart-rate-provider.js";

export class BridgeProvider implements HeartRateProvider {
    readonly id = "bridge";
    readonly live = true;

    private sink: SampleSink | null = null;
    private expected = new Set<string>();

    async start(subjectIds: string[], onSample: SampleSink): Promise<void> {
        this.expected = new Set(subjectIds);
        this.sink = onSample;
    }

    async stop(): Promise<void> {
        this.sink = null;
        this.expected.clear();
    }

    /**
     * A gateway hands over one reading. Refuses a subject nobody asked to
     * watch and a rate outside what a human heart does, because a bad parse
     * on the gateway side must not reach a screen that says it is measured.
     */
    accept(sample: HeartRateSample): void {
        if (!this.sink) throw new Error("no monitoring session is open: call monitor_start first");
        if (!this.expected.has(sample.subjectId)) throw new Error(`subject "${sample.subjectId}" is not under monitoring in this session`);
        if (!Number.isFinite(sample.bpm) || sample.bpm < 20 || sample.bpm > 240) throw new Error(`heart rate ${sample.bpm} is outside what this slot accepts as a reading (20 to 240 bpm)`);
        this.sink(sample);
    }
}
