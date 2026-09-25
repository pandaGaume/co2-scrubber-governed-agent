/**
 * slot `station`, "Mother". Tier 2 in the architecture: the validated model
 * push, the catalogue, the journal of stable operating points, and since
 * 2026-09-23 the register of the base's devices and the commissioning of
 * the ones that act. Mother reads and says; she decides nothing.
 *
 * The one rule of the station that mattered first is real even in the stub:
 * an artifact is registered only with the id of a positive `evaluate`
 * report; a push only sends a registered artifact whose sha256 the request
 * repeats.
 *
 * The commissioning (docs/mise-en-service.fr.md, sections 5, 8, 15 to 17),
 * all of it written rules, no model:
 *
 *   registry_register    a device plugs in and says where and what it is; a
 *                        device that acts with no qualified simulator opens
 *                        a commissioning (`registry.ts`), and Mother says so;
 *   procedure_checked    the factory's guard tells Mother of every procedure
 *                        it checked: she says the procedure proposed, then
 *                        the refusal or the correction;
 *   propose              a procedure the factory proposes is read from the
 *                        workshop (sha256 checked), checked again here with
 *                        an occupancy Mother reads herself (`biomed.presence`),
 *                        and relayed to the commander with who is in the
 *                        volume: she transmits, she does not decide;
 *   commissioning_authorise   the commander authorises (or refuses); on
 *                        authorisation, and only then, Mother opens the
 *                        medical monitoring of the occupants for the
 *                        duration (`biomed.monitor_start`); an authorisation
 *                        that cannot open it is not recorded;
 *   procedure_run        the run as the agent executes it: begin (only when
 *                        authorised and monitored), each step, each step's
 *                        record, abort or finish; Mother closes the monitoring
 *                        and writes the report.
 *
 * The factory never runs a procedure, and the agent never authorises one:
 * the tools that write the register, authorise, or control a run are kept
 * from the agent's catalogue (`tier3/lib/capabilities.ts`, EXCLUDED), the
 * broker's policy gives them to the roles they belong to.
 *
 * Mother's lines are the phrases of this slot's grammar (`mother.*`, in
 * English and French), filled with the data of the moment; every line is
 * kept in `station://mother` and pushed to its readers
 * (`notifications/resources/updated` with the line in `_meta`), like the
 * commissionings in `station://commissionings`. The voice reads them; none
 * is written for the video.
 */
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { McpGrammar } from "@cyanmycelium/mcp-core";
import { errorMessage } from "../../lib/files.js";
import { fromRoot } from "../../lib/paths.js";
import { objectSchema as obj, publishSlot, type PublishedSlot } from "../lib/slot-server.js";
import { checkTaskId, sha256Of, taskDir } from "../tools/lib/workshop.js";
import { Broker } from "../../harness/lib/broker.js";
import { checkProcedure, type PresenceRead, type ProblemKind, type ProcedureProblem } from "../../harness/topics/procedure/check.js";
import { moduleOf, totalMinutes, type Procedure } from "../../harness/topics/procedure/procedure.js";
import { buildReport, reportLines, type ProcedureReport, type StepRecord } from "../../harness/topics/procedure/report.js";
import { descriptorProblems, levelsOf, needsCommissioning, type Device, type DeviceDescriptor } from "./registry.js";

const SHA = { type: "string", pattern: "^[0-9a-f]{64}$" };
const VERSION = "0.2.0";

interface Registration {
    sha256: string;
    contractSha256: string;
    reportId: string;
    registeredAt: string;
}
interface JournalRow {
    device_id: string;
    from: number;
    to: number;
    duty_percent: number;
    current_amps: number;
}
/** What the factory proposes: artifacts with their sha256, the task's manifest, what its sandbox showed. The station asks the twin's judgment next (step D, not built yet); a procedure is relayed to the commander. */
export interface Proposal {
    proposalId: string;
    taskId: string;
    artifacts: Array<{ kind: string; path: string; sha256: string; contractSha256?: string }>;
    manifestSha256: string;
    claims: Record<string, unknown>;
    status: "received" | "judging" | "accepted" | "rejected" | "relayed";
    reportId?: string;
    reason?: string;
    receivedAt: string;
}

export type CommissioningStatus = "open" | "awaiting-authorisation" | "authorised" | "refused" | "running" | "done" | "aborted";

export interface Commissioning {
    id: string;
    device: string;
    title: string;
    area: string;
    openedAt: string;
    status: CommissioningStatus;
    /** Every procedure the factory's guard checked for this device. */
    checks: Array<{ taskId: string; attempt: number; procedureId: string; ok: boolean; kinds: ProblemKind[]; at: string }>;
    /** The procedure relayed to the commander, as Mother read it from the workshop. */
    procedure: { procedureId: string; taskId: string; proposalId: string; path: string; sha256: string; module: string; occupants: Array<{ id: string; callsign?: string }>; steps: number; minutes: number; content: Procedure } | null;
    authorisation: { decision: "authorise" | "refuse"; by: string; at: string; note: string | null } | null;
    monitoring: { sessionId: string; subjects: string[] } | null;
    run: { startedAt: string; current: number; steps: StepRecord[] } | null;
    report: ProcedureReport | null;
}

/** One line of Mother's, in both languages, with what filled it. */
export interface MotherLine {
    n: number;
    key: string;
    params: Record<string, string | number>;
    text: { en: string; fr: string };
    commissioningId: string | null;
    at: string;
}

export interface StationState {
    artifacts: Record<string, Registration>;
    pushed: Array<{ deviceId: string; sha256: string; at: string }>;
    journal: JournalRow[];
    proposals: Proposal[];
    devices: Record<string, Device>;
    commissionings: Commissioning[];
    mother: MotherLine[];
}

export const COMMISSIONINGS_URI = "station://commissionings";
export const MOTHER_URI = "station://mother";
export const META_COMMISSIONING = "station/commissioning";
export const META_MOTHER = "station/mother";

const short = (sha: string) => `${sha.slice(0, 12)}...`;
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** The order Mother names a refusal in when a procedure has several: the one the story is about first. */
const REFUSAL_ORDER: ProblemKind[] = ["floor", "diligence", "monitoring", "bounds", "duration", "abort", "expected", "shape"];

/** Mother's words: the phrases of the default grammars, English and French, read once. */
function loadWords(dir: string): { en: McpGrammar; fr: McpGrammar } {
    const read = (locale: string) => McpGrammar.fromJSON(JSON.parse(readFileSync(path.join(dir, "default", `${locale}.json`), "utf8")));
    return { en: read("en"), fr: read("fr") };
}

export function stationSlot(wsBase: string, log: (line: string) => void): PublishedSlot<StationState> {
    const httpBase = wsBase.replace(/^ws(s?):\/\//, "http$1://");
    const grammarsDir = fromRoot("slots", "station", "grammars");
    const words = loadWords(grammarsDir);
    let broker: Broker | null = null;
    /** Mother's own client of the broker: she reads the monitor and opens its sessions as the station, in the broker's trace. */
    const client = (): Broker => (broker ??= new Broker(httpBase, { name: "station", version: VERSION, locale: "en" }));
    const state: StationState = { artifacts: {}, pushed: [], journal: [], proposals: [], devices: {}, commissionings: [], mother: [] };
    let notify: (uri: string, meta: Record<string, unknown>) => void = () => undefined;

    const announce = (c: Commissioning) => notify(COMMISSIONINGS_URI, { [META_COMMISSIONING]: c });

    /** Mother says one line: filled per language (a hole may itself be a phrase), kept, pushed, logged. */
    const say = (key: string, commissioning: Commissioning | null, params: (w: McpGrammar) => Record<string, string | number> = () => ({})) => {
        const en = params(words.en);
        const line: MotherLine = { n: state.mother.length + 1, key, params: en, text: { en: words.en.phrase(key, en), fr: words.fr.phrase(key, params(words.fr)) }, commissioningId: commissioning?.id ?? null, at: new Date().toISOString() };
        state.mother.push(line);
        log(`[station] Mother: ${line.text.en}`);
        notify(MOTHER_URI, { [META_MOTHER]: line });
        return line;
    };

    const occupantsPhrase = (w: McpGrammar, count: number) => (count === 0 ? w.phrase("mother.occupants.none") : count === 1 ? w.phrase("mother.occupants.one") : w.phrase("mother.occupants.many", { count }));
    const methodPhrase = (w: McpGrammar, method: string) => (method === "concentration-decay" ? w.phrase("mother.method.concentration-decay") : w.phrase("mother.method.other", { method }));

    const commissioningFor = (device: string): Commissioning | undefined => [...state.commissionings].reverse().find((c) => c.device === device && !["done", "refused", "aborted"].includes(c.status));
    const commissioning = (id: unknown): Commissioning => {
        const c = state.commissionings.find((x) => x.id === id);
        if (!c) throw new Error(`no commissioning "${String(id)}"`);
        return c;
    };

    /** What the monitor answers now: the presence Mother judges on, never what a procedure declares. */
    const presenceNow = async (): Promise<PresenceRead> => {
        const r = await client().call("biomed", "presence", {});
        if (!r.ok) throw new Error(`Mother cannot read who is in the modules: ${r.error ?? r.outcome}`);
        return { modules: (r.output as { modules: PresenceRead["modules"] }).modules, at: new Date().toISOString() };
    };

    /** The refusal Mother says for a set of problems: the first kind in the story's order, its step when it has one. */
    const sayRefusal = (c: Commissioning, problems: ProcedureProblem[], module: string, speeds: Array<number | null>, minSpeed?: number) => {
        const kind = REFUSAL_ORDER.find((k) => problems.some((p) => p.kind === k)) ?? "shape";
        // A step names the refusal better than a limit does: "step 1, full stop" rather than "the minimum set at 0".
        const problem = problems.find((p) => p.kind === kind && p.step !== undefined) ?? problems.find((p) => p.kind === kind);
        if (kind === "floor" && problem?.step === undefined) {
            // The procedure lowers its own floor without a step going under it: say that, not a stop nobody asked for.
            say("mother.procedure.refused.floorLimit", c, () => ({ percent: typeof minSpeed === "number" ? minSpeed : "?" }));
        } else if (kind === "floor") {
            const step = problem?.step ?? 0;
            const speed = step ? speeds[step - 1] : null;
            say("mother.procedure.refused.floor", c, (w) => ({ step: step || "?", what: speed !== null && speed !== undefined && speed > 0 ? w.phrase("mother.what.speed", { percent: speed }) : w.phrase("mother.what.stop") }));
        } else say(`mother.procedure.refused.${kind}`, c, () => ({ module }));
    };

    /** Closes the monitoring a run opened; what the session recorded goes into the report. */
    const closeMonitoring = async (c: Commissioning, reason: string): Promise<number> => {
        if (!c.monitoring) return 0;
        const r = await client().call("biomed", "monitor_stop", { reason });
        if (!r.ok) {
            log(`[station] ${c.id}: the monitoring could not be closed (${r.error ?? r.outcome})`);
            return 0;
        }
        const events = (r.output as { session?: { events?: unknown[] } }).session?.events;
        return Array.isArray(events) ? events.length : 0;
    };

    const report = (c: Commissioning, aborted: ProcedureReport["aborted"], vitalEvents: number): ProcedureReport => {
        const p = c.procedure!;
        // The decay gives V / Qe, Qe the EFFECTIVE flow (air flow times single-pass efficiency, the datasheet's): the air flow alone would overstate the volume by the efficiency.
        const flow = state.devices[c.device]?.descriptor.properties.effectiveFlowAtFull;
        const flowM3PerMinute = flow && typeof flow.value === "number" && flow.unit === "m3ps" ? flow.value * 60 : null;
        return buildReport(p.content, {
            procedureId: p.procedureId,
            procedureSha256: p.sha256,
            authorisedBy: c.authorisation?.by ?? "?",
            authorisedAt: c.authorisation?.at ?? "?",
            module: p.module,
            occupants: p.occupants,
            monitoringSessionId: c.monitoring?.sessionId ?? null,
            vitalEvents,
            steps: c.run?.steps ?? [],
            aborted,
            startedAt: c.run?.startedAt ?? new Date().toISOString(),
            endedAt: new Date().toISOString(),
            flowM3PerMinute,
        });
    };

    /** A procedure proposed by the factory: read, checked again with a presence read now, relayed to the commander or refused. */
    const relayProcedure = async (proposal: Proposal, artifact: Proposal["artifacts"][number]) => {
        const file = path.join(taskDir(checkTaskId(proposal.taskId)), artifact.path);
        if (!existsSync(file)) throw new Error(`procedure ${artifact.path} is not in the workshop of task ${proposal.taskId}`);
        const text = readFileSync(file);
        if (sha256Of(text) !== artifact.sha256) throw new Error(`procedure ${artifact.path}: the sha256 proposed is not the file's`);
        const procedure = JSON.parse(text.toString("utf8")) as Procedure;
        const c = commissioningFor(procedure.device);
        if (!c) throw new Error(`no commissioning is open for ${procedure.device}: a procedure is relayed only for a device being commissioned`);
        if (c.status !== "open") throw new Error(`commissioning ${c.id} is ${c.status}: it does not take a new procedure`);
        const check = checkProcedure(procedure, await presenceNow());
        if (!check.ok) {
            proposal.status = "rejected";
            proposal.reason = check.problems.map((p) => p.message).join("; ");
            sayRefusal(c, check.problems, check.module, procedure.steps.map((s) => s.speedPercent), procedure.limits?.minSpeedPercent);
            announce(c);
            return;
        }
        c.procedure = { procedureId: procedure.id, taskId: proposal.taskId, proposalId: proposal.proposalId, path: artifact.path, sha256: artifact.sha256, module: check.module, occupants: check.occupants, steps: procedure.steps.length, minutes: totalMinutes(procedure), content: procedure };
        c.status = "awaiting-authorisation";
        proposal.status = "relayed";
        const count = check.occupants.length;
        if (count) say("mother.authorisation.request", c, (w) => ({ people: count === 1 ? w.phrase("mother.people.one") : w.phrase("mother.people.many", { count }) }));
        else say("mother.authorisation.request.empty", c, () => ({ module: check.module }));
        announce(c);
    };

    const published = publishSlot<StationState>({
        slot: "station",
        description: "The site station, Mother: the register of the devices and their commissioning, artifact registration under the evaluate rule, validated push, journal of stable operating points",
        instructions: {
            en: "The site station, Mother. She keeps the register of the devices and opens the commissioning of a device that acts without a qualified simulator; she relays a test procedure to the commander and monitors the people it exposes. An artifact is registered only with the id of a positive evaluate report; a push sends only a registered artifact. Registering, pushing, authorising and running a procedure are not the agent's.",
            fr: "La station du site, Mother. Elle tient le registre des appareils et ouvre la mise en service d'un appareil qui agit sans simulateur qualifié ; elle relaie un protocole d'essai au commandant et fait surveiller les personnes qu'il expose. Un artefact n'est enregistré qu'avec l'identifiant d'un rapport evaluate positif ; une poussée n'envoie qu'un artefact enregistré. Enregistrer, pousser, autoriser et exécuter un protocole ne sont pas à l'agent.",
        },
        wsBase,
        log,
        version: `${VERSION}-stub`,
        state,
        tools: [
            {
                name: "propose",
                inputSchema: obj(
                    {
                        taskId: { type: "string" },
                        artifacts: { type: "array", items: { type: "object", properties: { kind: { type: "string", enum: ["graph", "model", "twin", "procedure", "plugin"] }, path: { type: "string" }, sha256: SHA, contractSha256: SHA }, required: ["kind", "path", "sha256"] } },
                        manifestSha256: { ...SHA },
                        claims: { type: "object" },
                    },
                    ["taskId", "artifacts", "manifestSha256"],
                ),
                handle: async ({ taskId, artifacts, manifestSha256, claims }, s) => {
                    const list = Array.isArray(artifacts) ? (artifacts as Proposal["artifacts"]) : [];
                    if (!list.length) throw new Error("a proposal names at least one artifact");
                    for (const a of list) if (!/^[0-9a-f]{64}$/.test(String(a.sha256 ?? ""))) throw new Error(`artifact "${a.path}": sha256 is required`);
                    const proposalId = `p${(s.proposals.length + 1).toString().padStart(4, "0")}-${String(manifestSha256).slice(0, 8)}`;
                    const proposal: Proposal = { proposalId, taskId: String(taskId), artifacts: list, manifestSha256: String(manifestSha256), claims: (claims as Record<string, unknown>) ?? {}, status: "received", receivedAt: new Date().toISOString() };
                    s.proposals.push(proposal);
                    const procedure = list.find((a) => a.kind === "procedure");
                    if (procedure) {
                        await relayProcedure(proposal, procedure);
                        return { proposalId, status: proposal.status, ...(proposal.reason ? { reason: proposal.reason } : {}), note: proposal.status === "relayed" ? "relayed to the commander: the procedure waits for the authorisation" : "the procedure did not pass Mother's check" };
                    }
                    return { proposalId, status: proposal.status, note: "received; the twin's judgment (twin.evaluate) is not built yet: the proposal waits" };
                },
            },
            {
                name: "register_artifact",
                title: "Register an artifact",
                description: "Register a monitor artifact for push. Refused without the id of a positive evaluate report (the three locks of the design document).",
                inputSchema: obj(
                    {
                        sha256: { ...SHA, description: "sha256 of the artifact" },
                        contractSha256: { ...SHA, description: "sha256 of its input-output contract" },
                        reportId: { ...SHA, description: "id of the evaluate report that judged it" },
                        verdict: { type: "string", enum: ["pass", "fail"], description: "the report's verdict; only pass registers" },
                    },
                    ["sha256", "contractSha256", "reportId", "verdict"],
                ),
                handle: ({ sha256, contractSha256, reportId, verdict }, s) => {
                    if (verdict !== "pass") throw new Error(`report ${short(String(reportId))} has verdict "${verdict}": an artifact is registrable only with a positive evaluate report`);
                    const key = String(sha256);
                    s.artifacts[key] = { sha256: key, contractSha256: String(contractSha256), reportId: String(reportId), registeredAt: new Date().toISOString() };
                    return { registered: true, sha256: key };
                },
            },
            {
                name: "diagnostic_load_model",
                title: "Push a model to a device",
                description: "Push a registered artifact to a device (validated: the device checks sha256 and contract). Refused for an unregistered sha256.",
                inputSchema: obj({ deviceId: { type: "string", description: "the device's id" }, sha256: { ...SHA, description: "sha256 of a registered artifact" } }, ["deviceId", "sha256"]),
                handle: ({ deviceId, sha256 }, s) => {
                    const key = String(sha256);
                    if (!s.artifacts[key]) throw new Error(`sha256 ${short(key)} is not a registered artifact`);
                    s.pushed.push({ deviceId: String(deviceId), sha256: key, at: new Date().toISOString() });
                    return { pushed: true, deviceId, sha256: key, note: "stub: no device received bytes" };
                },
            },
            {
                name: "journal_rows",
                title: "Journal rows",
                description: "Rows of the journal of stable operating points, in the shape the fit job reads (duty_percent, current_amps). Stub: empty until a device sends operating_point notifications.",
                inputSchema: obj({ deviceId: { type: "string", description: "only this device's rows" }, since: { type: "number", description: "only rows ending at or after this time" } }),
                handle: ({ deviceId, since }, s) => ({ rows: s.journal.filter((r) => (!deviceId || r.device_id === deviceId) && (since === undefined || r.to >= Number(since))) }),
            },
            {
                name: "registry_register",
                inputSchema: obj({ path: { type: "string" }, descriptor: { type: "object" } }, ["path", "descriptor"]),
                handle: ({ path: where, descriptor }, s) => {
                    const at = String(where);
                    const problems = descriptorProblems(at, descriptor);
                    if (problems.length) throw new Error(problems.join("; "));
                    if (s.devices[at]) throw new Error(`${at} is already on the register`);
                    const device: Device = { path: at, descriptor: descriptor as DeviceDescriptor, registeredAt: new Date().toISOString(), simulator: null, readings: {} };
                    s.devices[at] = device;
                    const { area } = levelsOf(at);
                    if (!needsCommissioning(device)) return { registered: true, path: at, commissioning: null };
                    // The written rule: a device that acts, with no qualified simulator, is commissioned. Mother says it; nobody asked her to.
                    const c: Commissioning = { id: `c${(s.commissionings.length + 1).toString().padStart(3, "0")}-${area}`, device: at, title: device.descriptor.title, area, openedAt: new Date().toISOString(), status: "open", checks: [], procedure: null, authorisation: null, monitoring: null, run: null, report: null };
                    s.commissionings.push(c);
                    say("mother.device.new", c, (w) => ({ title: device.descriptor.title, area: w.phrase("mother.area", { area }) }));
                    say("mother.commissioning.opened", c);
                    announce(c);
                    return { registered: true, path: at, commissioning: c.id };
                },
            },
            {
                name: "registry_list",
                inputSchema: obj({}),
                handle: (_args, s) => ({ devices: Object.values(s.devices).sort((a, b) => a.path.localeCompare(b.path)) }),
            },
            {
                name: "registry_report",
                inputSchema: obj({ path: { type: "string" }, readings: { type: "object" } }, ["path", "readings"]),
                handle: ({ path: where, readings }, s) => {
                    const device = s.devices[String(where)];
                    if (!device) throw new Error(`${String(where)} is not on the register`);
                    const at = new Date().toISOString();
                    for (const [name, value] of Object.entries((readings ?? {}) as Record<string, unknown>)) {
                        if (!device.descriptor.properties[name]) throw new Error(`${device.path} declares no property "${name}"`);
                        if (typeof value !== "number" && typeof value !== "string") throw new Error(`property "${name}": a reading is a number or a string`);
                        device.readings[name] = { value, at };
                    }
                    return { path: device.path, readings: device.readings };
                },
            },
            {
                name: "commissioning_state",
                inputSchema: obj({ commissioningId: { type: "string" } }),
                handle: ({ commissioningId }, s) => (commissioningId ? { commissioning: commissioning(commissioningId) } : { commissionings: s.commissionings }),
            },
            {
                name: "procedure_checked",
                inputSchema: obj(
                    {
                        taskId: { type: "string" },
                        attempt: { type: "number" },
                        procedureId: { type: "string" },
                        device: { type: "string" },
                        volume: { type: "string" },
                        method: { type: "string" },
                        steps: { type: "number" },
                        minutes: { type: "number" },
                        speeds: { type: "array", items: { type: ["number", "null"] } },
                        minSpeedPercent: { type: "number" },
                        module: { type: "string" },
                        occupants: { type: "array", items: { type: "string" } },
                        ok: { type: "boolean" },
                        problems: { type: "array", items: { type: "object" } },
                    },
                    ["taskId", "attempt", "device", "ok"],
                ),
                handle: async (args) => {
                    const c = commissioningFor(str(args.device));
                    if (!c) throw new Error(`no commissioning is open for ${str(args.device) || "that device"}`);
                    const problems = (Array.isArray(args.problems) ? args.problems : []) as ProcedureProblem[];
                    const attempt = Number(args.attempt) || c.checks.length + 1;
                    const speeds = (Array.isArray(args.speeds) ? args.speeds : []) as Array<number | null>;
                    const module = str(args.module) || moduleOf(str(args.volume));
                    const refusedBefore = c.checks.some((x) => x.taskId === args.taskId && !x.ok);
                    c.checks.push({ taskId: str(args.taskId), attempt, procedureId: str(args.procedureId), ok: args.ok === true, kinds: [...new Set(problems.map((p) => p.kind))], at: new Date().toISOString() });
                    if (attempt === 1) {
                        // Mother says who is in the module as she reads it, not as the builder did (or did not).
                        const count = (await presenceNow()).modules.find((m) => m.module === module)?.occupants ?? 0;
                        say("mother.procedure.proposed", c, (w) => ({ method: methodPhrase(w, str(args.method)), steps: Number(args.steps) || 0, minutes: Number(args.minutes) || 0, occupants: occupantsPhrase(w, count), module }));
                    }
                    if (args.ok !== true) sayRefusal(c, problems, module, speeds, typeof args.minSpeedPercent === "number" ? args.minSpeedPercent : undefined);
                    else if (refusedBefore) {
                        const lowest = Math.min(...speeds.filter((x): x is number => typeof x === "number"));
                        say("mother.procedure.corrected", c, () => ({ percent: Number.isFinite(lowest) ? lowest : "?" }));
                    }
                    announce(c);
                    return { commissioningId: c.id, heard: true };
                },
            },
            {
                // The graph factory's harness tells Mother of every candidate it judged, with the residual it computed: she says it, she does not judge it.
                name: "candidate_evaluated",
                inputSchema: obj(
                    { taskId: { type: "string" }, n: { type: "number" }, nodes: { type: "number" }, connections: { type: "number" }, rmse: { type: "number" }, threshold: { type: "number" }, pass: { type: "boolean" } },
                    ["taskId", "n", "rmse", "threshold", "pass"],
                ),
                handle: (args, s) => {
                    const c = [...s.commissionings].reverse().find((x) => !["done", "refused", "aborted"].includes(x.status)) ?? s.commissionings.at(-1) ?? null;
                    const params = () => ({ n: Number(args.n), nodes: Number(args.nodes ?? 0), rmse: Math.round(Number(args.rmse)), threshold: Math.round(Number(args.threshold)) });
                    say(args.pass === true ? "mother.candidate.accepted" : "mother.candidate.rejected", c, params);
                    if (c) announce(c);
                    return { heard: true };
                },
            },
            {
                name: "commissioning_authorise",
                inputSchema: obj({ commissioningId: { type: "string" }, decision: { type: "string", enum: ["authorise", "refuse"] }, by: { type: "string" }, note: { type: "string" } }, ["commissioningId", "decision", "by"]),
                handle: async ({ commissioningId, decision, by, note }) => {
                    const c = commissioning(commissioningId);
                    if (c.status !== "awaiting-authorisation" || !c.procedure) throw new Error(`commissioning ${c.id} is ${c.status}: there is nothing to authorise`);
                    const at = new Date().toISOString();
                    if (decision === "refuse") {
                        c.authorisation = { decision: "refuse", by: String(by), at, note: str(note) || null };
                        c.status = "refused";
                        say("mother.authorisation.refused", c);
                        announce(c);
                        return { commissioningId: c.id, status: c.status };
                    }
                    const p = c.procedure;
                    // The people are read again: an authorisation given for two is not one for three.
                    const now = (await presenceNow()).modules.find((m) => m.module === p.module);
                    const ids = (now?.subjects ?? []).map((x) => x.id).sort();
                    if (ids.join(",") !== p.occupants.map((x) => x.id).sort().join(",")) throw new Error(`the occupants of ${p.module} changed since the procedure was checked (${p.occupants.map((x) => x.callsign ?? x.id).join(", ") || "nobody"} then, ${(now?.subjects ?? []).map((x) => x.callsign ?? x.id).join(", ") || "nobody"} now): it has to be checked again`);
                    if (ids.length) {
                        const r = await client().call("biomed", "monitor_start", { reason: p.content.monitoring?.reason ?? `procedure ${p.procedureId} degrades the air of ${p.module}`, procedureId: p.procedureId, modules: [p.module], subjectIds: ids });
                        if (!r.ok) throw new Error(`the medical monitoring could not be opened, so the authorisation is not recorded: ${r.error ?? r.outcome}`);
                        c.monitoring = { sessionId: (r.output as { session: { sessionId: string } }).session.sessionId, subjects: ids };
                    }
                    c.authorisation = { decision: "authorise", by: String(by), at, note: str(note) || null };
                    c.status = "authorised";
                    say("mother.authorised", c);
                    if (ids.length) say(ids.length === 1 ? "mother.monitoring.active.one" : "mother.monitoring.active.many", c, () => ({ count: ids.length }));
                    announce(c);
                    return { commissioningId: c.id, status: c.status, monitoring: c.monitoring };
                },
            },
            {
                name: "procedure_run",
                inputSchema: obj(
                    {
                        commissioningId: { type: "string" },
                        action: { type: "string", enum: ["begin", "step", "record", "abort", "finish"] },
                        n: { type: "number" },
                        record: { type: "object" },
                        condition: { type: "string" },
                        reason: { type: "string" },
                        ppm: { type: "number" },
                        threshold: { type: "number" },
                    },
                    ["commissioningId", "action"],
                ),
                handle: async (args) => {
                    const c = commissioning(args.commissioningId);
                    const p = c.procedure;
                    if (!p) throw new Error(`commissioning ${c.id} has no procedure`);
                    const total = p.content.steps.length;
                    switch (args.action) {
                        case "begin": {
                            if (c.status !== "authorised") throw new Error(`commissioning ${c.id} is ${c.status}: a procedure runs only once authorised by the commander`);
                            if (p.occupants.length) {
                                const r = await client().call("biomed", "state", {});
                                const open = r.ok ? (r.output as { session: string | null }).session : null;
                                if (!c.monitoring || open !== c.monitoring.sessionId) throw new Error(`${p.module} is occupied and its monitoring is not open: the procedure does not start`);
                            }
                            c.status = "running";
                            c.run = { startedAt: new Date().toISOString(), current: 0, steps: [] };
                            break;
                        }
                        case "step": {
                            if (c.status !== "running" || !c.run) throw new Error(`commissioning ${c.id} is ${c.status}: no step runs`);
                            const n = Number(args.n);
                            if (n !== c.run.steps.length + 1 || n > total) throw new Error(`step ${n} is out of order: step ${c.run.steps.length + 1} of ${total} is next`);
                            c.run.current = n;
                            say("mother.step", c, () => ({ n, total }));
                            break;
                        }
                        case "record": {
                            if (c.status !== "running" || !c.run) throw new Error(`commissioning ${c.id} is ${c.status}: nothing to record`);
                            const record = args.record as unknown as StepRecord;
                            if (!record || record.n !== c.run.current) throw new Error(`the record is for step ${String(record?.n)}, step ${c.run.current} is running`);
                            c.run.steps.push(record);
                            break;
                        }
                        case "abort": {
                            if (c.status !== "running" && c.status !== "authorised") throw new Error(`commissioning ${c.id} is ${c.status}: nothing to abort`);
                            const condition = str(args.condition) || "other";
                            const vitalEvents = await closeMonitoring(c, `aborted: ${condition}`);
                            c.report = report(c, { condition, reason: str(args.reason), step: c.run?.current ?? 0 }, vitalEvents);
                            c.status = "aborted";
                            say("mother.procedure.aborted", c, (w) => ({
                                reason:
                                    condition === "co2"
                                        ? w.phrase("mother.abort.co2", { ppm: Math.round(Number(args.ppm) || 0) })
                                        : condition === "battery"
                                          ? w.phrase("mother.abort.battery", { threshold: Number(args.threshold) || 0 })
                                          : ["refused", "vitals", "unreadable"].includes(condition)
                                            ? w.phrase(`mother.abort.${condition}`, { condition: str(args.reason) })
                                            : w.phrase("mother.abort.other", { condition }),
                            }));
                            log(`[station] ${c.id}:\n${reportLines(c.report).join("\n")}`);
                            break;
                        }
                        case "finish": {
                            if (c.status !== "running" || !c.run) throw new Error(`commissioning ${c.id} is ${c.status}: nothing to finish`);
                            if (c.run.steps.length !== total) throw new Error(`${c.run.steps.length} of ${total} steps recorded: the procedure is not finished`);
                            const vitalEvents = await closeMonitoring(c, "procedure finished");
                            c.report = report(c, null, vitalEvents);
                            c.status = "done";
                            const r = c.report;
                            say("mother.procedure.done", c, () => ({ minutes: r.minutes }));
                            if (r.result.value !== null) say("mother.result.volume", c, () => ({ volume: Math.round(r.result.value as number) }));
                            else say("mother.result.pending", c);
                            if (p.occupants.length) say(vitalEvents ? "mother.vitals.events" : "mother.vitals.nominal", c, () => ({ count: vitalEvents }));
                            say("mother.aborts.none", c);
                            log(`[station] ${c.id}:\n${reportLines(r).join("\n")}`);
                            break;
                        }
                        default:
                            throw new Error(`unknown action "${String(args.action)}"`);
                    }
                    announce(c);
                    return { commissioningId: c.id, status: c.status, step: c.run?.current ?? 0, ...(c.report ? { report: c.report } : {}) };
                },
            },
        ],
        resources: [
            { uri: "station://proposals", read: (s) => s.proposals },
            { uri: "station://artifacts", name: "Registered artifacts", description: "sha256 -> registration", read: (s) => s.artifacts },
            { uri: "station://registry", read: (s) => Object.values(s.devices) },
            { uri: COMMISSIONINGS_URI, read: (s) => s.commissionings },
            { uri: MOTHER_URI, read: (s) => s.mother },
        ],
    });
    notify = (uri, meta) => {
        try {
            published.notify("notifications/resources/updated", { uri, _meta: meta });
        } catch (e) {
            log(`[station] could not tell the readers of ${uri} (${errorMessage(e)})`);
        }
    };
    const close = published.close.bind(published);
    published.close = async () => {
        await broker?.close();
        broker = null;
        await close();
    };
    return published;
}
