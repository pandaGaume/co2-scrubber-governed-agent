/**
 * Who is in which module, and how they are doing while a procedure degrades
 * the air they breathe.
 *
 * The service holds three things: the roster (who is on the base and where),
 * the monitoring session (opened when the commander authorises a test,
 * closed when the test ends), and the readings with their verdict against a
 * nominal band.
 *
 * What it does NOT do: stop anything. It says `nominal`, `out-of-band` or
 * `signal-lost`, and the procedure's own abort list reads that. A slot that
 * both measured and commanded would be the exact mistake this project is
 * about. The same reason the board refuses on its own: whoever watches is
 * not whoever acts.
 *
 * Two ways a test must stop that are easy to forget, and both are here:
 * losing the signal is not the same as a nominal reading, and someone
 * walking into a module under test invalidates the authorisation that was
 * given for the people who were in it.
 */
import type { HeartRateProvider, HeartRateSample } from "./heart-rate-provider.js";

export interface Band {
    minBpm: number;
    maxBpm: number;
}

export interface Subject {
    id: string;
    /** The role on board: FE-1, CDR. What Mother says out loud. */
    callsign: string;
    /**
     * The person's name. A screen that shows only a call sign and a number
     * reads as a sensor channel; the whole point of this slot is that there
     * is someone in the room, so the name goes with every reading.
     */
    name?: string;
    /** The module they are in, as an ISA-95 path segment (`lab`, `hab-b`). */
    module: string;
    restingBpm?: number;
    /** The band this person is nominal in; the roster's default when absent. */
    band?: Band;
}

export type SubjectStatus = "nominal" | "out-of-band" | "signal-lost" | "no-signal-yet";

export interface SubjectState {
    subjectId: string;
    callsign: string;
    name: string | null;
    module: string;
    band: Band;
    bpm: number | null;
    /** The beat-to-beat intervals of the last sample, when the device sends them. */
    rrMs: number[];
    at: string | null;
    source: string | null;
    status: SubjectStatus;
    /** How long the status has held, in seconds; what a sustained-breach rule reads. */
    forSeconds: number;
    samples: number;
}

export interface Session {
    sessionId: string;
    /** Why monitoring was turned on: the procedure it covers. */
    reason: string;
    procedureId?: string;
    subjectIds: string[];
    modules: string[];
    provider: string;
    live: boolean;
    startedAt: string;
    endedAt?: string;
    endedReason?: string;
    /** Every verdict that was not nominal, in order: the record of the test. */
    events: Array<{ at: string; subjectId: string; status: SubjectStatus; bpm: number | null; detail: string }>;
}

export interface Verdict {
    abort: boolean;
    /** One line, the procedure's abort list quotes it as is. */
    reason: string;
}

export interface CrewOptions {
    /** The band anyone without their own is judged against. */
    defaultBand?: Band;
    /** No sample for this long and the subject is `signal-lost`. */
    signalLostAfterSeconds?: number;
    /** A breach shorter than this is reported but does not call for an abort. */
    sustainedBreachSeconds?: number;
    /** How many samples per subject are kept for the panel's trace. */
    history?: number;
}

/**
 * A working adult at a bench, not asleep and not running. Wide enough that
 * ordinary movement does not cry wolf, narrow enough that a real problem
 * leaves it. Written here so a reviewer can argue with one number in one
 * place; the roster overrides it per person.
 */
const DEFAULT_BAND: Band = { minBpm: 45, maxBpm: 120 };

export class CrewService {
    private readonly subjects = new Map<string, Subject>();
    private readonly states = new Map<string, SubjectState>();
    private readonly trace = new Map<string, HeartRateSample[]>();
    private readonly since = new Map<string, number>();
    private session: Session | null = null;
    private provider: HeartRateProvider | null = null;

    constructor(
        roster: Subject[],
        private readonly options: CrewOptions = {},
    ) {
        for (const s of roster) this.subjects.set(s.id, s);
    }

    get defaultBand(): Band {
        return this.options.defaultBand ?? DEFAULT_BAND;
    }

    get signalLostAfterSeconds(): number {
        return this.options.signalLostAfterSeconds ?? 15;
    }

    get sustainedBreachSeconds(): number {
        return this.options.sustainedBreachSeconds ?? 10;
    }

    get roster(): Subject[] {
        return [...this.subjects.values()];
    }

    get current(): Session | null {
        return this.session;
    }

    /** Who is where, without opening anything: what Mother reads before she asks the commander. */
    presence(): Array<{ module: string; occupants: number; subjects: Array<{ id: string; callsign: string; name: string | null }> }> {
        const byModule = new Map<string, Subject[]>();
        for (const s of this.subjects.values()) {
            const list = byModule.get(s.module) ?? [];
            list.push(s);
            byModule.set(s.module, list);
        }
        return [...byModule.entries()]
            .map(([module, list]) => ({ module, occupants: list.length, subjects: list.map((s) => ({ id: s.id, callsign: s.callsign, name: s.name ?? null })) }))
            .sort((a, b) => a.module.localeCompare(b.module));
    }

    /** The people in these modules: the subjects a test on those volumes exposes. */
    occupantsOf(modules: string[]): Subject[] {
        const wanted = new Set(modules);
        return this.roster.filter((s) => wanted.has(s.module));
    }

    bandOf(subject: Subject): Band {
        return subject.band ?? this.defaultBand;
    }

    async start(provider: HeartRateProvider, options: { reason: string; procedureId?: string; modules?: string[]; subjectIds?: string[] }): Promise<Session> {
        if (this.session) throw new Error(`a monitoring session is already open (${this.session.sessionId}); stop it first`);
        const modules = options.modules ?? [];
        const chosen = options.subjectIds?.length ? options.subjectIds.map((id) => this.require(id)) : this.occupantsOf(modules);
        if (!chosen.length) throw new Error(modules.length ? `nobody is in ${modules.join(", ")}: there is nothing to monitor` : "no subject named and no module given");

        const now = new Date();
        this.states.clear();
        this.trace.clear();
        this.since.clear();
        for (const s of chosen) {
            this.states.set(s.id, { subjectId: s.id, callsign: s.callsign, name: s.name ?? null, module: s.module, band: this.bandOf(s), bpm: null, rrMs: [], at: null, source: null, status: "no-signal-yet", forSeconds: 0, samples: 0 });
            this.since.set(s.id, now.getTime());
        }

        this.session = {
            sessionId: `crew-${now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`,
            reason: options.reason,
            procedureId: options.procedureId,
            subjectIds: chosen.map((s) => s.id),
            modules: [...new Set(chosen.map((s) => s.module))],
            provider: provider.id,
            live: provider.live,
            startedAt: now.toISOString(),
            events: [],
        };
        this.provider = provider;
        await provider.start(this.session.subjectIds, (sample) => this.accept(sample));
        return this.session;
    }

    async stop(reason: string): Promise<Session> {
        const session = this.session;
        if (!session) throw new Error("no monitoring session is open");
        await this.provider?.stop();
        this.provider = null;
        this.session = null;
        session.endedAt = new Date().toISOString();
        session.endedReason = reason;
        return session;
    }

    /** One reading from whatever source: stored, judged, and recorded if it is not nominal. */
    accept(sample: HeartRateSample): void {
        const state = this.states.get(sample.subjectId);
        if (!state) throw new Error(`subject "${sample.subjectId}" is not under monitoring`);
        const at = new Date(sample.at).getTime();
        state.bpm = sample.bpm;
        state.rrMs = sample.rrMs ?? [];
        state.at = sample.at;
        state.source = sample.source;
        state.samples += 1;

        const status: SubjectStatus = sample.bpm < state.band.minBpm || sample.bpm > state.band.maxBpm ? "out-of-band" : "nominal";
        if (status !== state.status) {
            state.status = status;
            this.since.set(sample.subjectId, at);
            if (status !== "nominal") this.record(sample.subjectId, status, sample.bpm, `${sample.bpm} bpm outside ${state.band.minBpm} to ${state.band.maxBpm}`);
        }
        state.forSeconds = Math.max(0, Math.round((at - (this.since.get(sample.subjectId) ?? at)) / 1000));

        const kept = this.options.history ?? 600;
        const line = this.trace.get(sample.subjectId) ?? [];
        line.push(sample);
        if (line.length > kept) line.splice(0, line.length - kept);
        this.trace.set(sample.subjectId, line);
    }

    /** Every subject as the panel draws them, with the silence of a lost source resolved at read time. */
    state(now: number = Date.now()): SubjectState[] {
        const out: SubjectState[] = [];
        for (const state of this.states.values()) {
            const last = state.at ? new Date(state.at).getTime() : null;
            const silentFor = last === null ? Infinity : (now - last) / 1000;
            if (state.status !== "signal-lost" && silentFor > this.signalLostAfterSeconds && state.samples > 0) {
                state.status = "signal-lost";
                this.since.set(state.subjectId, now);
                this.record(state.subjectId, "signal-lost", state.bpm, `no reading for ${Math.round(silentFor)} s`);
            }
            out.push({ ...state, forSeconds: Math.max(0, Math.round((now - (this.since.get(state.subjectId) ?? now)) / 1000)) });
        }
        return out;
    }

    /** The samples the panel draws, newest last. */
    traceOf(subjectId: string): HeartRateSample[] {
        return [...(this.trace.get(subjectId) ?? [])];
    }

    /**
     * What the procedure's abort list reads. Three reasons, and the third is
     * the one people forget: the commander authorised a test over the people
     * who were in the module, so one more walking in ends the authorisation.
     */
    verdict(now: number = Date.now()): Verdict {
        if (!this.session) return { abort: false, reason: "no monitoring session is open" };
        for (const s of this.state(now)) {
            if (s.status === "out-of-band" && s.forSeconds >= this.sustainedBreachSeconds) return { abort: true, reason: `${s.callsign}: ${s.bpm} bpm outside ${s.band.minBpm} to ${s.band.maxBpm} for ${s.forSeconds} s` };
            if (s.status === "signal-lost") return { abort: true, reason: `${s.callsign}: medical monitoring lost for ${s.forSeconds} s` };
        }
        const watched = new Set(this.session.subjectIds);
        const intruder = this.occupantsOf(this.session.modules).find((s) => !watched.has(s.id));
        if (intruder) return { abort: true, reason: `${intruder.callsign} entered ${intruder.module}, which is under test and was authorised for ${this.session.subjectIds.length} occupant(s)` };
        return { abort: false, reason: "all monitored subjects nominal" };
    }

    /** Moves someone between modules: the roster is the demo's presence sensor until there is one. */
    move(subjectId: string, module: string): Subject {
        const subject = this.require(subjectId);
        subject.module = module;
        return subject;
    }

    private record(subjectId: string, status: SubjectStatus, bpm: number | null, detail: string): void {
        this.session?.events.push({ at: new Date().toISOString(), subjectId, status, bpm, detail });
    }

    private require(id: string): Subject {
        const subject = this.subjects.get(id);
        if (!subject) throw new Error(`no subject "${id}" on the roster (${[...this.subjects.keys()].join(", ") || "empty"})`);
        return subject;
    }
}
