/**
 * The `biomed` slot: who is in which module, and how they are doing while a
 * procedure degrades the air they breathe.
 *
 * It exists because of one line of the commissioning scenario: before the
 * decay test runs, Mother has to know that two operators are working in the
 * Lab, ask the commander, and put them under monitoring for the duration.
 * Presence is what makes the authorisation necessary; the heart rates are
 * what make the abort conditions real.
 *
 * Tools: `describe`, `presence` (read before anything is opened),
 * `monitor_start` / `monitor_stop` (the session the commander authorises),
 * `report` (a Bluetooth gateway hands over one reading), `state`, `verdict`
 * (what the procedure's abort list reads), `move` (the demo's presence
 * sensor until there is one).
 * Resources: `biomed://state`, `biomed://session`, `biomed://trace/{subjectId}`.
 *
 * The profile (`profiles/biomed.json`, `BIOMED_PROFILE` names another): the
 * roster, the nominal band, and `provider` (`simulated` or `bridge`).
 * `BIOMED_PROVIDER` overrides it, which is how the tests stay on `simulated`.
 *
 * Honesty, which is the whole reason this slot is written the way it is:
 * with `simulated` the slot publishes `stub: true` and every sample says
 * `source: "simulated"`, so the trace and the screen cannot pass a rehearsal
 * off as a measurement. With `bridge`, a real strap is on a real chest and
 * the stub flag is gone. Nothing else in the chain changes, which is the
 * point.
 *
 * What this slot never does: stop a test. It publishes a verdict; the
 * procedure decides. Whoever watches is not whoever acts, here as
 * everywhere else in this repository.
 */
import { existsSync } from "node:fs";
import { fromRoot, relativeToRoot } from "../../lib/paths.js";
import { errorMessage, readJson, sha256File } from "../../lib/files.js";
import { objectSchema, publishSlot, type PublishedSlot, type SlotTool } from "../lib/slot-server.js";
import { CrewService, type Band, type Subject } from "./service.js";
import type { HeartRateProvider } from "./heart-rate-provider.js";
import { SimulatedProvider } from "./providers/simulated.js";
import { BridgeProvider } from "./providers/bridge.js";
import { PolarProvider, type StrapBinding } from "./providers/polar.js";

export interface BiomedProfile {
    provider?: string;
    /** Which strap each person wears, for the `polar` provider; the sidecar scans when an address is absent. */
    straps?: StrapBinding[];
    /** Only consider straps whose advertised name starts with this, e.g. `Polar`. */
    strapNamePrefix?: string;
    defaultBand?: Band;
    signalLostAfterSeconds?: number;
    sustainedBreachSeconds?: number;
    roster?: Subject[];
}

export interface BiomedState {
    service: CrewService;
    provider: HeartRateProvider | null;
    /** Why no provider could be built; null when ready. */
    notReady: string | null;
    requested: string;
    profile: { file: string; sha256: string } | null;
}

const DEFAULT_PROFILE = "profiles/biomed.json";
const TRACE_TEMPLATE = "biomed://trace/{subjectId}";

/** The two operators of the commissioning scene, when no profile says otherwise. */
const FALLBACK_ROSTER: Subject[] = [
    { id: "fe-1", callsign: "FE-1", name: "A. Pelletier", module: "lab", restingBpm: 64 },
    { id: "fe-2", callsign: "FE-2", name: "M. Chen", module: "lab", restingBpm: 58 },
];

export function buildProvider(requested: string, roster: Subject[], profile: BiomedProfile = {}, log?: (line: string) => void): HeartRateProvider {
    switch (requested) {
        case "simulated": {
            const restingBpm: Record<string, number> = {};
            for (const s of roster) if (s.restingBpm) restingBpm[s.id] = s.restingBpm;
            return new SimulatedProvider({ restingBpm });
        }
        case "bridge":
            return new BridgeProvider();
        case "polar":
            return new PolarProvider({ straps: profile.straps, namePrefix: profile.strapNamePrefix, log });
        default:
            throw new Error(`unknown biomed provider "${requested}" (simulated, bridge, polar)`);
    }
}

export function biomedSlot(wsBase: string, log: (line: string) => void): PublishedSlot<BiomedState> {
    const profileFile = fromRoot(process.env.BIOMED_PROFILE ?? DEFAULT_PROFILE);
    const profile: BiomedProfile = existsSync(profileFile) ? (readJson<{ biomed?: BiomedProfile }>(profileFile).biomed ?? {}) : {};
    const requested = process.env.BIOMED_PROVIDER ?? profile.provider ?? "simulated";
    const roster = profile.roster?.length ? profile.roster : FALLBACK_ROSTER;

    const state: BiomedState = {
        service: new CrewService(roster, { defaultBand: profile.defaultBand, signalLostAfterSeconds: profile.signalLostAfterSeconds, sustainedBreachSeconds: profile.sustainedBreachSeconds }),
        provider: null,
        notReady: null,
        requested,
        profile: existsSync(profileFile) ? { file: relativeToRoot(profileFile), sha256: sha256File(profileFile) } : null,
    };
    try {
        state.provider = buildProvider(requested, roster, profile, log);
        log(`[biomed] provider ${state.provider.id}${state.provider.live ? " (live)" : " (simulated: the slot publishes as a stub)"}, roster ${roster.map((s) => `${s.callsign}@${s.module}`).join(", ")}`);
    } catch (e) {
        state.notReady = errorMessage(e);
        log(`[biomed] not ready: ${state.notReady}`);
    }

    const ready = (s: BiomedState): HeartRateProvider => {
        if (!s.provider) throw new Error(`biomedical monitoring is not ready: ${s.notReady ?? "no provider"}`);
        return s.provider;
    };
    const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
    const strings = (v: unknown): string[] | undefined => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : undefined);
    const numbers = (v: unknown): number[] | undefined => (Array.isArray(v) ? v.filter((x): x is number => typeof x === "number" && Number.isFinite(x)) : undefined);

    const tools: SlotTool<BiomedState>[] = [
        {
            name: "describe",
            title: "What this monitor is",
            description: "The biomed monitor: the roster, the nominal band, the source behind the readings, and whether a monitoring session is open. Says plainly when the readings are simulated.",
            inputSchema: objectSchema({}),
            handle: (_args, s) => ({
                provider: s.provider?.id ?? null,
                live: s.provider?.live ?? false,
                simulated: !(s.provider?.live ?? false),
                notReady: s.notReady,
                requested: s.requested,
                profile: s.profile,
                defaultBand: s.service.defaultBand,
                signalLostAfterSeconds: s.service.signalLostAfterSeconds,
                sustainedBreachSeconds: s.service.sustainedBreachSeconds,
                // The resting rate goes out with the roster: the panel reads it once and shows every
                // rate as a delta against it, which is what makes a number mean something at a glance.
                roster: s.service.roster.map((x) => ({ id: x.id, callsign: x.callsign, name: x.name ?? null, module: x.module, restingBpm: x.restingBpm ?? null, band: s.service.bandOf(x) })),
                session: s.service.current?.sessionId ?? null,
            }),
        },
        {
            name: "presence",
            title: "Who is in which module",
            description: "The occupants of every module, read before anything is opened. This is what tells you that a test on a volume exposes people, and therefore that a human has to authorise it.",
            inputSchema: objectSchema({}),
            handle: (_args, s) => ({ modules: s.service.presence() }),
        },
        {
            name: "monitor_start",
            title: "Put the occupants under monitoring",
            description: "Opens a monitoring session over the people in the given modules, for the duration of a procedure. Refuses when a session is already open, and when nobody is in the modules named.",
            inputSchema: objectSchema(
                {
                    reason: { type: "string", description: "Why monitoring is on: the procedure it covers" },
                    procedureId: { type: "string", description: "The identifier of the procedure this session covers" },
                    modules: { type: "array", items: { type: "string" }, description: "The modules under test; everyone in them is monitored" },
                    subjectIds: { type: "array", items: { type: "string" }, description: "Named subjects instead of whole modules" },
                },
                ["reason"],
            ),
            handle: async (args, s) => {
                const session = await s.service.start(ready(s), {
                    reason: str(args.reason) ?? "unstated",
                    procedureId: str(args.procedureId),
                    modules: strings(args.modules),
                    subjectIds: strings(args.subjectIds),
                });
                return { session, simulated: !(s.provider?.live ?? false) };
            },
        },
        {
            name: "monitor_stop",
            title: "End the monitoring session",
            description: "Closes the session and returns its record: who was watched, by what source, and every verdict that was not nominal.",
            inputSchema: objectSchema({ reason: { type: "string", description: "Why it ended: the procedure finished, was aborted, was refused" } }, ["reason"]),
            handle: async (args, s) => ({ session: await s.service.stop(str(args.reason) ?? "unstated") }),
        },
        {
            name: "report",
            title: "Hand over one reading",
            description: "A Bluetooth gateway relays one reading from a chest strap: the rate in beats per minute and, when the device sends them, the beat-to-beat intervals. Refuses a subject nobody asked to watch and a rate outside what a heart does.",
            inputSchema: objectSchema(
                {
                    subjectId: { type: "string", description: "Which monitored subject this reading belongs to" },
                    bpm: { type: "number", description: "Beats per minute as the device reported it" },
                    rrMs: { type: "array", items: { type: "number" }, description: "Beat-to-beat intervals in milliseconds, newest last" },
                    at: { type: "string", description: "When the sample was taken, ISO 8601; now when absent" },
                    source: { type: "string", description: "What produced it, for the record: polar-h10, ..." },
                },
                ["subjectId", "bpm"],
            ),
            handle: (args, s) => {
                const provider = ready(s);
                const sample = { subjectId: String(args.subjectId), bpm: Number(args.bpm), rrMs: numbers(args.rrMs), at: str(args.at) ?? new Date().toISOString(), source: str(args.source) ?? provider.id };
                if (provider instanceof BridgeProvider) provider.accept(sample);
                else s.service.accept(sample);
                return { accepted: true, subjectId: sample.subjectId, bpm: sample.bpm, at: sample.at };
            },
        },
        {
            name: "state",
            title: "The monitored subjects right now",
            description: "Every monitored subject with their last rate, their band, and their status: nominal, out-of-band, signal-lost. This is what the panel draws.",
            inputSchema: objectSchema({}),
            handle: (_args, s) => ({ session: s.service.current?.sessionId ?? null, simulated: !(s.provider?.live ?? false), subjects: s.service.state() }),
        },
        {
            name: "verdict",
            title: "Is there a reason to abort",
            description: "One line for a procedure's abort list: whether a monitored subject has been out of band long enough, whether monitoring was lost, or whether someone walked into a module under test. This slot never stops anything itself.",
            inputSchema: objectSchema({}),
            handle: (_args, s) => s.service.verdict(),
        },
        {
            name: "move",
            title: "Move someone between modules",
            description: "The demo's presence sensor until there is one: puts a subject in a module. The scenario uses it to walk a third person into a volume under test.",
            inputSchema: objectSchema({ subjectId: { type: "string" }, module: { type: "string" } }, ["subjectId", "module"]),
            handle: (args, s) => ({ subject: s.service.move(String(args.subjectId), String(args.module)) }),
        },
    ];

    return publishSlot<BiomedState>({
        slot: "biomed",
        description: "The biomed monitor: who is in which module, and their heart rate while a procedure degrades the air they breathe.",
        tools,
        resources: [
            { uri: "biomed://state", name: "Monitored subjects", description: "Every monitored subject with their last rate, band and status.", read: (s) => ({ session: s.service.current?.sessionId ?? null, simulated: !(s.provider?.live ?? false), subjects: s.service.state() }) },
            { uri: "biomed://session", name: "Monitoring session", description: "The open session, or nothing.", read: (s) => s.service.current ?? { session: null } },
            { uri: TRACE_TEMPLATE, template: true, name: "One subject's readings", description: "The kept readings of one subject, newest last: what the panel draws.", read: (s, uri) => ({ subjectId: uri.split("/").pop(), samples: s.service.traceOf(uri.split("/").pop() ?? "") }) },
        ],
        state,
        wsBase,
        log,
        // A simulated heartbeat is a rehearsal and says so; a real strap is not a stub.
        stub: !(state.provider?.live ?? false),
        version: "0.1.0",
    });
}
