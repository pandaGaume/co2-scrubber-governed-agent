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
 */
import type { Broker } from "../lib/broker.js";

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
}

const POLL_MS = 700;

export class AudioOutput {
    private readonly el = new Audio();
    private timer: number | null = null;
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
        return this.timer !== null;
    }

    /** Called from a click: unlocks the element, starts polling. */
    enable(): void {
        if (this.timer !== null) return;
        // Playing a silent data URI on the gesture unlocks later, programmatic plays.
        this.el.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
        void this.el.play().catch(() => undefined);
        this.timer = window.setInterval(() => void this.tick(), POLL_MS);
    }

    disable(): void {
        if (this.timer !== null) window.clearInterval(this.timer);
        this.timer = null;
        this.cut();
    }

    /** Resolves when nothing is queued for this output and nothing is playing: what the page waits for before its next decision. */
    async idle(): Promise<void> {
        if (this.timer === null) return;
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
        if (!taken.ok) return;
        const r = await session.request<{ contents: Array<{ mimeType?: string; blob?: string }> }>("resources/read", { uri: `speech://utterances/${item.utteranceId}` });
        const c = r.contents[0];
        if (!c?.blob) throw new Error(`no audio for ${item.utteranceId}`);
        const bytes = Uint8Array.from(atob(c.blob), (ch) => ch.charCodeAt(0));
        const url = URL.createObjectURL(new Blob([bytes], { type: c.mimeType ?? item.mimeType }));
        this.playing = item;
        this.events.onPlay?.(item);
        const started = performance.now();
        await new Promise<void>((resolve) => {
            const finish = () => {
                this.el.onended = null;
                this.el.onerror = null;
                URL.revokeObjectURL(url);
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
