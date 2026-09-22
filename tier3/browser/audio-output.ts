/**
 * The page as an audio output of the speech slot: it reads the slot's queue
 * (`speech://queue`), plays what it has not played yet through one `<audio>`
 * element, in the slot's order, and reports each utterance it finished
 * (`speech.played`, with the measured duration). It never synthesizes; the
 * page is an endpoint, the slot is the service. A stop mark past an
 * utterance cuts it and skips the rest.
 *
 * Browsers only play sound after a gesture on the page: `enable()` is called
 * from the sound button, and the first click is what unlocks the element.
 *
 * Two pages on the same machine (the Control Board twice, or one hidden
 * behind the factory's window): an utterance is delivered once, so a hidden
 * page does not take any (the visible one does), and a take another output
 * won the page reports and skips. The poll clock ticks in a worker, because
 * a browser slows the timers of a hidden page down to one a minute after
 * five minutes, and the board is often behind another window.
 */
import type { Broker } from "../../harness/lib/broker.js";

interface QueueItem {
    utteranceId: string;
    seq: number;
    text: string;
    voice: string;
    mimeType: string;
}
interface Queue {
    seq: number;
    stopMark: number;
    pending: QueueItem[];
}

export interface AudioOutputEvents {
    /** An utterance starts playing (or is shown as text when the engine is silent). */
    onPlay?: (item: QueueItem) => void;
    onDone?: (item: QueueItem, durationMs: number) => void;
    onError?: (message: string) => void;
    /** Another output took the utterance first: another page is the speaker. */
    onTakenElsewhere?: (item: QueueItem) => void;
}

const POLL_MS = 700;

/** A clock that keeps ticking when the page is hidden: a worker's timer is not slowed down the way a page's is. */
function startClock(ms: number, onTick: () => void): () => void {
    try {
        const worker = new Worker(URL.createObjectURL(new Blob([`setInterval(() => postMessage(0), ${ms});`], { type: "text/javascript" })));
        worker.onmessage = onTick;
        return () => worker.terminate();
    } catch {
        const timer = window.setInterval(onTick, ms);
        return () => window.clearInterval(timer);
    }
}

/** The refusal that means "come back", from the speech slot's `take`. Kept in
    step with `FLOOR_BUSY` in slots/speech/service.ts by the test that plays two
    outputs against one queue. */
const FLOOR_BUSY = "speech:floor-busy";

export class AudioOutput {
    private readonly el = new Audio();
    /** Used only to decode the bytes of an utterance, never connected. */
    private decoder?: AudioContext;
    /** The shape of the utterance being said. See `wave`. */
    private envelope?: number[] | null;
    private stopClock: (() => void) | null = null;
    private playing: QueueItem | null = null;
    private readonly played = new Set<string>();
    private busy = false;
    private lastPending = 0;

    constructor(
        private readonly broker: Broker,
        private readonly outputId: string,
        private readonly events: AudioOutputEvents = {},
    ) {}

    get enabled(): boolean {
        return this.stopClock !== null;
    }

    /** Called from a click: unlocks the element, starts polling. */
    enable(): void {
        if (this.stopClock !== null) return;
        // Playing a silent data URI on the gesture unlocks later, programmatic plays.
        this.el.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
        void this.el.play().catch(() => undefined);
        this.stopClock = startClock(POLL_MS, () => void this.tick());
    }

    disable(): void {
        this.stopClock?.();
        this.stopClock = null;
        this.cut();
    }

    /** Resolves when nothing is queued for this output and nothing is playing: what the page waits for before its next decision. */
    async idle(): Promise<void> {
        if (this.stopClock === null) return;
        for (;;) {
            if (!this.busy) await this.tick();
            if (!this.playing && this.lastPending === 0 && !this.busy) return;
            await new Promise((r) => setTimeout(r, 250));
        }
    }

    private cut(): void {
        if (!this.playing) return;
        this.el.pause();
        this.el.removeAttribute("src");
        this.playing = null;
    }

    /**
     * The shape of the sentence being said, and how far through it we are.
     *
     * The bytes are the ones already fetched to play it, decoded in a context
     * of their own that is never connected to anything: **the playback path is
     * not touched**. An earlier version tapped the element with
     * `createMediaElementSource`, which permanently reroutes its output
     * through the Web Audio graph; a context that fails to leave `suspended`
     * then costs the sound itself, not just the meter. No indicator is worth
     * that.
     *
     * `envelope` is the peak of each slice of the whole utterance, so the
     * drawing is the sentence, and `progress` is where the element actually
     * is in it.
     */
    public wave(): { envelope: ReadonlyArray<number>; progress: number } | null {
        if (!this.playing || !this.envelope) return null;
        const d = this.el.duration;
        const progress = Number.isFinite(d) && d > 0 ? Math.min(1, this.el.currentTime / d) : 0;
        return { envelope: this.envelope, progress };
    }

    /**
     * The peak of each slice of an utterance, for the meter. Decoding only:
     * nothing here is connected to an output.
     *
     * Fine on purpose. A coarse envelope makes the running trace climb in
     * steps, because several frames in a row read the same slice and the
     * signal turns into a staircase; at this resolution a frame advances one
     * or two slices and the trace has the grain of a voice.
     */
    private async shapeOf(bytes: Uint8Array, slices = 1600): Promise<number[] | null> {
        if (typeof AudioContext === "undefined") return null;
        try {
            this.decoder ??= new AudioContext();
            const copy = bytes.slice().buffer as ArrayBuffer;
            const buffer = await this.decoder.decodeAudioData(copy);
            const channel = buffer.getChannelData(0);
            const per = Math.max(1, Math.floor(channel.length / slices));
            const out: number[] = [];
            let loudest = 0;
            for (let i = 0; i < slices; i++) {
                let peak = 0;
                for (let k = i * per, end = Math.min(channel.length, k + per); k < end; k++) peak = Math.max(peak, Math.abs(channel[k]));
                out.push(peak);
                loudest = Math.max(loudest, peak);
            }
            return loudest > 0 ? out.map((v) => v / loudest) : out;
        } catch {
            return null;   // no shape; the sound is untouched either way
        }
    }

    private async tick(): Promise<void> {
        if (this.busy) return;
        this.busy = true;
        try {
            const session = await this.broker.session("speech");
            const r = await session.request<{ contents: Array<{ text?: string }> }>("resources/read", { uri: "speech://queue" });
            const q = JSON.parse(r.contents[0]?.text ?? "{}") as Queue;
            this.lastPending = q.pending.filter((p) => p.seq > q.stopMark && !this.played.has(p.utteranceId)).length;
            if (this.playing && this.playing.seq <= q.stopMark) this.cut();
            if (this.playing) return;
            // A hidden page leaves the utterances to the visible one (the Control Board behind the factory's window, or open twice).
            if (document.hidden) return;
            const next = q.pending.find((p) => p.seq > q.stopMark && !this.played.has(p.utteranceId));
            if (next) await this.play(next, session);
        } catch (e) {
            this.events.onError?.(e instanceof Error ? e.message : String(e));
        } finally {
            this.busy = false;
        }
    }

    private async play(item: QueueItem, session: Awaited<ReturnType<Broker["session"]>>): Promise<void> {
        // Delivered once: another output (a second page on the same machine) may have taken it first.
        this.played.add(item.utteranceId);
        const taken = await this.broker.call("speech", "take", { utteranceId: item.utteranceId, output: this.outputId });
        if (!taken.ok) {
            // The room is busy with another line: this one has not been said by
            // anyone, so it stays for the next tick. Forgetting that distinction
            // dropped every line that happened to arrive while another was
            // playing, and the voice went quiet for half the night.
            if (String(taken.error ?? "").includes(FLOOR_BUSY)) {
                this.played.delete(item.utteranceId);
                return;
            }
            this.events.onTakenElsewhere?.(item);
            return;
        }
        const r = await session.request<{ contents: Array<{ mimeType?: string; blob?: string }> }>("resources/read", { uri: `speech://utterances/${item.utteranceId}` });
        const c = r.contents[0];
        if (!c?.blob) throw new Error(`no audio for ${item.utteranceId}`);
        const bytes = Uint8Array.from(atob(c.blob), (ch) => ch.charCodeAt(0));
        const url = URL.createObjectURL(new Blob([bytes], { type: c.mimeType ?? item.mimeType }));
        this.envelope = await this.shapeOf(bytes);
        this.playing = item;
        this.events.onPlay?.(item);
        const started = performance.now();
        await new Promise<void>((resolve) => {
            const finish = () => {
                this.el.onended = null;
                this.el.onerror = null;
                URL.revokeObjectURL(url);
                this.envelope = null;
                resolve();
            };
            this.el.onended = finish;
            this.el.onerror = () => {
                this.events.onError?.(`could not play ${item.utteranceId} (${c.mimeType ?? item.mimeType})`);
                finish();
            };
            this.el.src = url;
            this.el.play().catch((e: unknown) => {
                this.events.onError?.(e instanceof Error ? e.message : String(e));
                finish();
            });
        });
        const durationMs = Math.round(performance.now() - started);
        const wasCut = this.playing !== item;
        this.playing = null;
        if (!wasCut) {
            this.events.onDone?.(item, durationMs);
            await this.broker.call("speech", "played", { utteranceId: item.utteranceId, output: this.outputId, durationMs });
        }
    }
}
