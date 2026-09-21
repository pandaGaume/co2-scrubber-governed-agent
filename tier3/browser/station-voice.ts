/**
 * The station's voice: the on-board AI, one voice (the `station` speaker of
 * `profiles/voice.json`), which says aloud, in short sentences, what the loop
 * shows on screen: a message from Earth as it arrives, what the model
 * proposes (the first sentence of its answer), what the twin answered (its
 * numbers), what the board did or refused, what is reported to the crew.
 *
 * Everything said is derived from the trace, never invented: the sentences
 * are the trace's fields, cut to one sentence. The calls to `speech.say` go
 * out in order, one after the other, so the queue keeps the order of the
 * loop; `idle()` resolves once they have all been accepted, and the page
 * waits for the audio output before the next decision, so the voice is what
 * paces the demo when the sound is on.
 */
import type { Broker } from "../../harness/lib/broker.js";
import type { CapabilityCall } from "../lib/capabilities.js";

export interface SpokenEvent {
    intention: string;
    message?: string;
}

/** One sentence: what a proposal is cut to (the model is asked to open with one). */
const ONE_SENTENCE = 170;
/** A message or a report: whole sentences, as many as fit; the action is often in the second one. */
const A_MESSAGE = 320;

const plain = (text: string): string =>
    text
        .replace(/[*_`#>]/g, "")
        .replace(/\s+/g, " ")
        .trim();

/** The text split into sentences, punctuation kept; a full stop inside a number or a reference (2.6, ECLSS-7.4) is not an end. */
const sentencesOf = (text: string): string[] => text.match(/[^]+?[.!?]+(?=\s|$)|[^]+$/g)?.map((x) => x.trim()).filter(Boolean) ?? [];

/**
 * Said the way a person would read it: whole sentences from the start, as
 * many as fit in `max` characters (at least one, cut at a word if it alone
 * is too long), a capital to begin, a full stop to end, percents in words.
 */
export function spoken(text: string | undefined | null, max = A_MESSAGE): string | null {
    if (!text) return null;
    const all = sentencesOf(plain(text));
    if (!all.length) return null;
    let s = all[0];
    for (const next of all.slice(1)) {
        if (s.length + 1 + next.length > max) break;
        s = `${s} ${next}`;
    }
    if (s.length > max) {
        const cut = s.lastIndexOf(" ", max);
        s = `${s.slice(0, cut > 40 ? cut : max)}...`;
    }
    s = s.charAt(0).toUpperCase() + s.slice(1);
    if (!/[.!?]$/.test(s) && !s.endsWith("...")) s += ".";
    return s.replace(/(\d)\s?%/g, "$1 percent");
}

/** The first sentence only. */
export const shortSentence = (text: string | undefined | null): string | null => {
    const first = text ? sentencesOf(plain(text))[0] : undefined;
    return spoken(first, ONE_SENTENCE);
};

/** A message from Earth is read as such; a change of the world is stated by the station itself. */
export function eventSentence(event: SpokenEvent): string | null {
    const message = event.message ?? "";
    const fromEarth = /^(ground|procedure)/i.test(message) || /ground confirms/i.test(message);
    const body = spoken(message.replace(/^ground to habitat assistant:\s*/i, ""));
    if (!body) return null;
    return fromEarth ? `Incoming from Earth. ${body}` : body;
}

/** What the model or the script proposed, from the first sentence of its rationale; nothing for the harness's own fillers. */
export function proposalSentence(rationale: string | undefined): string | null {
    if (!rationale || /^(said in text|tell the crew)/i.test(rationale)) return null;
    return shortSentence(rationale);
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** The twin's answer in one sentence, with its numbers. */
export function twinSentence(tool: string, input: unknown, output: unknown): string | null {
    const o = (output ?? {}) as Record<string, unknown>;
    const q = (o.question ?? input ?? {}) as Record<string, unknown>;
    if (tool === "twin.time_to_critical") {
        const peak = num(o.peakPpm);
        const final = str(o.finalState)?.toLowerCase();
        const critical = num(o.minutesToCritical);
        if (peak === null || !final) return null;
        const stop = num(q.stopMinutes);
        const flow = num(q.flowPercent);
        const what = stop && stop > 0 ? `a ${stop}-minute stop` : flow !== null ? `at ${Math.round(flow)} percent` : "this plan";
        const risk = critical !== null ? `critical in ${critical} minutes` : "never critical";
        return `The twin says: ${what}, the cabin peaks at ${Math.round(peak)} ppm and ends ${final}, ${risk}.`;
    }
    if (tool === "twin.sweep") {
        const points = Array.isArray(o.points) ? (o.points as Array<Record<string, unknown>>) : [];
        const safe = points.filter((p) => str(p.finalState) === "NOMINAL" && p.crossesCritical !== true).map((p) => num(p.flowPercent)).filter((f): f is number => f !== null);
        if (!points.length) return null;
        if (!safe.length) return `The twin's map: none of the ${points.length} flows keeps the cabin nominal.`;
        return `The twin's map: the lowest flow that keeps the cabin nominal is ${Math.min(...safe)} percent.`;
    }
    return null;
}

/** What the board did or refused, or what was told to the crew. */
export function outcomeSentence(call: CapabilityCall): string | null {
    const input = (call.input ?? {}) as Record<string, unknown>;
    if (call.slot === "twin") return call.result.ok ? twinSentence(call.id, call.input, call.result.output) : null;
    // The report is said whole (within reason): what was done is often its second sentence.
    if (call.slot === "crew") return spoken(str(input.message));
    if (!call.result.ok) {
        const reason = (call.result.error ?? call.result.outcome).replace(/^(device refused|policy deny|error):\s*/i, "");
        return spoken(`${call.result.outcome === "deny" ? "Denied by the policy" : "Refused by the board"}: ${reason}`, ONE_SENTENCE);
    }
    const percent = num(input.percent);
    switch (call.tool) {
        case "motor.set_speed":
            return percent !== null ? `Scrubber set to ${Math.round(percent)} percent.` : "Scrubber speed changed.";
        case "scrubber.power":
            return input.on === false ? "Scrubber powered off." : "Scrubber powered on.";
        case "scrubber.set_min_flow":
            return percent !== null ? `Minimum flow set to ${Math.round(percent)} percent.` : "Minimum flow changed.";
        default:
            return null;
    }
}

/**
 * Resolves when the slot has nothing pending and nothing in flight (taken by
 * an output, not yet played), whichever page is the output: what a page that
 * speaks but does not play waits for before its next decision.
 */
export async function speechHeard(broker: Broker, pollMs = 300, timeoutMs = 120_000): Promise<void> {
    const started = Date.now();
    for (;;) {
        try {
            const session = await broker.session("speech");
            const r = await session.request<{ contents: Array<{ text?: string }> }>("resources/read", { uri: "speech://queue" });
            const q = JSON.parse(r.contents[0]?.text ?? "{}") as { stopMark?: number; pending?: unknown[]; recent?: Array<{ seq: number; queued: boolean; takenBy?: string; playedBy?: unknown[] }> };
            const inFlight = (q.recent ?? []).some((u) => u.queued && u.seq > (q.stopMark ?? 0) && u.takenBy && !u.playedBy?.length);
            if (!(q.pending ?? []).length && !inFlight) return;
        } catch {
            return;
        }
        if (Date.now() - started > timeoutMs) return;
        await new Promise((r) => setTimeout(r, pollMs));
    }
}

export class StationVoice {
    private chain: Promise<void> = Promise.resolve();
    private count = 0;

    constructor(
        private readonly broker: Broker,
        readonly speaker: string,
        private readonly isOn: () => boolean,
        private readonly onError: (message: string) => void,
    ) {}

    get said(): number {
        return this.count;
    }

    /** Says a sentence, after the ones before it; silently nothing when the sound is off or there is nothing to say. */
    say(text: string | null | undefined, priority: "low" | "normal" | "high" = "normal"): void {
        if (!text || !this.isOn()) return;
        this.count++;
        this.chain = this.chain.then(async () => {
            const r = await this.broker.call("speech", "say", { text, voice: this.speaker, priority });
            if (!r.ok) this.onError(r.error ?? "speech.say failed");
        });
    }

    /** Resolves once every sentence asked so far has been accepted by the slot. */
    idle(): Promise<void> {
        return this.chain;
    }
}
