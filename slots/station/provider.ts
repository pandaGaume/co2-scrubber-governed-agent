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
import { notHolder, roleOf, ROLES_FILE, SIGNATORY } from "../../lib/roles.js";
import { Playbook, playbookProblems, type PlaybookFile } from "../../harness/core/conduct.js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { adaptationProblems, observe, reflectionFormat, type Adaptation } from "../../lib/reflection.js";
import { enterAdoption, historyOf, judge, judgedFamilies, mistakeRate, readLedger, underJudgement, undo, writeLedger } from "../../lib/adaptations.js";
import { snapshotAt } from "../../lib/fork.js";
import * as path from "node:path";
import { McpGrammar } from "@cyanmycelium/mcp-core";
import { errorMessage } from "../../lib/files.js";
import { forkDir, forkId, fromRoot } from "../../lib/paths.js";
import { objectSchema as obj, publishSlot, type PublishedSlot } from "../lib/slot-server.js";
import { checkTaskId, sha256Of, taskDir, WORKSHOP_ROOT } from "../tools/lib/workshop.js";
import { Broker } from "../../harness/lib/broker.js";
import { checkProcedure, FORMAT as PROCEDURE_FORMAT, rulesAndFacts, type PresenceRead, type ProblemKind, type ProcedureProblem, safetyProblems } from "../../harness/topics/procedure/check.js";
import { moduleOf, totalMinutes, type Procedure } from "../../lib/procedure/format.js";
import { buildReport, reportLines, type ProcedureReport, type StepRecord } from "../../lib/procedure/report.js";
import { DEFAULT_POLICY, questionProblems, standingOrder, type Question, type QuestionAnswer, type QuestionsPolicy, type Resume } from "./questions.js";
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
    status: "received" | "judging" | "accepted" | "rejected" | "relayed" | "awaiting-signature" | "adopted";
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
    run: { startedAt: string; current: number; steps: StepRecord[]; clock?: { minute: number; planned: number | null; secondsPerMinute: number; at: string } } | null;
    report: ProcedureReport | null;
    /** The tests of this commissioning that were aborted, before it was reopened for another procedure (2026-09-29: recovery after an abort). */
    attempts?: Array<{ procedureId: string; taskId: string; aborted: ProcedureReport["aborted"]; minutes: number; reopenedAt: string; reason: string }>;
    /** The factory's analysis of the aborted test, when the procedure relayed follows one: what the commander authorises knowing. */
    analysis?: { cause: string; evidence: string[]; whyNotPrevented: string; changes: Array<{ path: string; change: string; prevents: string }> } | null;
}

/** One line of Mother's, in both languages, with what filled it. */
export interface MotherLine {
    n: number;
    key: string;
    params: Record<string, string | number>;
    text: { en: string; fr: string };
    commissioningId: string | null;
    at: string;
    /** The fork the station runs in: a line said there is the fork's, not the station's (2026-09-29). */
    fork?: string;
}

export interface StationState {
    artifacts: Record<string, Registration>;
    pushed: Array<{ deviceId: string; sha256: string; at: string }>;
    journal: JournalRow[];
    proposals: Proposal[];
    devices: Record<string, Device>;
    commissionings: Commissioning[];
    mother: MotherLine[];
    /** The questions to the commander (Tier 4), open or answered, and the standing orders that answer some of them (`questions.ts`). */
    questions: Question[];
    questionsPolicy: QuestionsPolicy;
}

export const QUESTIONS_URI = "station://questions";
export const QUESTIONS_POLICY_URI = "station://questions-policy";
export const META_QUESTION = "station/question";
export const COMMISSIONINGS_URI = "station://commissionings";
export const MOTHER_URI = "station://mother";
export const META_COMMISSIONING = "station/commissioning";
export const META_MOTHER = "station/mother";

const short = (sha: string) => `${sha.slice(0, 12)}...`;
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** The order Mother names a refusal in when a procedure has several: the one the story is about first. */
const REFUSAL_ORDER: ProblemKind[] = ["rules", "health", "analysis", "floor", "start", "diligence", "monitoring", "bounds", "duration", "abort", "expected", "justification", "shape"];

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
    const state: StationState = { artifacts: {}, pushed: [], journal: [], proposals: [], devices: {}, commissionings: [], mother: [], questions: [], questionsPolicy: { ...DEFAULT_POLICY, byKind: {} } };
    let notify: (uri: string, meta: Record<string, unknown>) => void = () => undefined;

    const announce = (c: Commissioning) => notify(COMMISSIONINGS_URI, { [META_COMMISSIONING]: c });

    /** The asker called back with the answer, through the broker; what it answered, or why it could not, kept on the question. */
    const resumeAsker = async (q: Question): Promise<void> => {
        if (!q.resume) return;
        try {
            const r = await client().call(q.resume.slot, q.resume.tool, { ...q.resume.args, questionId: q.id, answer: q.answer as never });
            q.resumed = r.ok ? ((r.output ?? { ok: true }) as never) : ({ error: r.error ?? r.outcome } as never);
        } catch (e) {
            q.resumed = { error: e instanceof Error ? e.message : String(e) } as never;
        }
        notify(QUESTIONS_URI, { [META_QUESTION]: q });
    };

    /** Mother says one line: filled per language (a hole may itself be a phrase), kept, pushed, logged. */
    const say = (key: string, commissioning: Commissioning | null, params: (w: McpGrammar) => Record<string, string | number> = () => ({})) => {
        const en = params(words.en);
        return emit({ n: state.mother.length + 1, key, params: en, text: { en: words.en.phrase(key, en), fr: words.fr.phrase(key, params(words.fr)) }, commissioningId: commissioning?.id ?? null, at: new Date().toISOString(), ...(forkId() ? { fork: forkId()! } : {}) });
    };

    /** A line of Mother's: kept, pushed to whoever reads her, logged, spoken. */
    const emit = (line: MotherLine): MotherLine => {
        state.mother.push(line);
        log(`[station] Mother: ${line.text.en}`);
        notify(MOTHER_URI, { [META_MOTHER]: line });
        // Mother embodies the station: what she says is spoken, in the station's voice, by the speech slot the control room plays (2026-09-27: a silent station read as software).
        // Said and not awaited: a voice that is down or not configured never holds the register, a relay or a question back.
        if (process.env.STATION_VOICE !== "off") void client().call("speech", "say", { text: line.text.en, voice: "station" }).catch(() => undefined);
        return line;
    };

    /** A question to the commander (Tier 4): kept, said by Mother unless she just asked it in her own words, answered on the control post or by a standing order; on the answer the asker is called back. */
    const askQuestion = async (args: Record<string, unknown>): Promise<{ questionId: string; status: Question["status"]; answer?: QuestionAnswer | null; resumed?: Question["resumed"] }> => {
        const problems = questionProblems(args as never);
        // A signature is asked of the role that signs (2026-09-29: an authorised signatory, not the commander); any other question for the role it names, if any.
        const role = str(args.role) || (str(args.kind) === "sign" ? SIGNATORY : "");
        if (role && !roleOf(role)) problems.push(`no role "${role}" in ${ROLES_FILE}`);
        if (problems.length) throw new Error(problems.join("; "));
        const q: Question = {
            id: `q${(state.questions.length + 1).toString().padStart(4, "0")}`,
            at: new Date().toISOString(),
            taskId: str(args.taskId) || null,
            from: str(args.from),
            kind: str(args.kind),
            question: str(args.question),
            options: (args.options as Array<{ id: string; label: string }>).map((o) => ({ id: String(o.id), label: String(o.label ?? o.id) })),
            role: role || null,
            ...(role ? { holders: roleOf(role)?.holders ?? [] } : {}),
            context: (args.context ?? null) as never,
            resume: args.resume ? ({ slot: str((args.resume as Resume).slot), tool: str((args.resume as Resume).tool), args: (((args.resume as Resume).args ?? {}) as Record<string, never>) } as Resume) : null,
            status: "open",
            answer: null,
            resumed: null,
        };
        state.questions.push(q);
        const order = standingOrder(state.questionsPolicy, q.kind, q.options, q.role);
        if (order.mode === "auto") {
            // The standing order answers: said as such, and the asker called back at once.
            const choice = q.options.find((o) => o.id === order.choice)!;
            q.answer = { choice: choice.id, by: "standing order", at: new Date().toISOString(), note: null, how: "policy" };
            q.status = "auto";
            say("mother.question.auto", null, () => ({ question: q.question, choice: choice.label }));
            notify(QUESTIONS_URI, { [META_QUESTION]: q });
            await resumeAsker(q);
            return { questionId: q.id, status: q.status, answer: q.answer, resumed: q.resumed };
        }
        // The authorisation is asked in Mother's own words just before (mother.authorisation.request): not said twice.
        if (q.role) say("mother.question.askedRole", null, () => ({ role: q.role ?? "", holders: q.holders?.length ? q.holders.join(", ") : "nobody holds it yet", question: q.question, options: q.options.map((o) => o.label).join(" / ") }));
        else if (q.kind !== "authorise") say("mother.question.asked", null, () => ({ question: q.question, options: q.options.map((o) => o.label).join(" / ") }));
        notify(QUESTIONS_URI, { [META_QUESTION]: q });
        return { questionId: q.id, status: q.status };
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
        } else if (kind === "justification" && problems.some((p) => p.kind === "justification" && /which the signed rules do not bound it by|does not respect/.test(p.message))) {
            // A limit that cites a fact, the wrong one or one it does not respect: not a number without a source (2026-09-28).
            say("mother.procedure.refused.justificationFact", c, () => ({}));
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
    /**
     * A playbook a factory wrote (2026-09-29, levels 2 and 3 of docs/comportement-en-donnees.fr.md): checked again here (it runs, one
     * stage at every event), put on the library's proposals shelf, and its signature asked of the role that signs. The station adopts
     * nothing: unsigned, the playbook conducts nothing, and only a person the role names signs it.
     */
    const relayPlaybook = async (proposal: Proposal, artifact: Proposal["artifacts"][number]) => {
        const file = path.join(taskDir(checkTaskId(proposal.taskId)), artifact.path);
        if (!existsSync(file)) throw new Error(`playbook ${artifact.path} is not in the workshop of task ${proposal.taskId}`);
        const text = readFileSync(file);
        if (sha256Of(text) !== artifact.sha256) throw new Error(`playbook ${artifact.path}: the sha256 proposed is not the file's`);
        const proposed = JSON.parse(text.toString("utf8")) as { id?: string; title?: string; summary?: string; change?: string; playbook?: unknown };
        const id = String(proposed.id ?? "");
        const problems = playbookProblems(proposed.playbook, id || artifact.path);
        if (problems.length) {
            proposal.status = "rejected";
            proposal.reason = problems.join("; ");
            return;
        }
        const put = await client().call("library", "propose", { id, title: proposed.title ?? id, summary: proposed.summary ?? "", change: proposed.change ?? "", playbook: proposed.playbook, from: { taskId: proposal.taskId, proposalId: proposal.proposalId, sha256: artifact.sha256 } });
        if (!put.ok) {
            proposal.status = "rejected";
            proposal.reason = `the library did not take it: ${put.error ?? "refused"}`;
            return;
        }
        const pb = new Playbook(id, proposed.playbook as PlaybookFile);
        proposal.status = "awaiting-signature";
        await askQuestion({
            from: "station",
            taskId: proposal.taskId,
            kind: "sign",
            role: SIGNATORY,
            question: `The playbook factory proposes the playbook ${id} (${proposed.title ?? id})${proposed.change ? `, asked: ${proposed.change}` : ""}. Read it in the library and sign it, so that it may conduct?`,
            options: [
                { id: "sign", label: "sign it" },
                { id: "not-now", label: "not now" },
            ],
            context: { document: id, proposed: true, stages: pb.stages.map((st) => `${st.id}${st.action ? ` (${st.action})` : ""}`), gates: pb.gates.map((g) => `${g.id}: ${g.capabilities.join(", ")}`), bounds: pb.bounds.map((b) => ({ id: b.id, count: b.count, atLeast: b.atLeast, why: b.why })) },
            resume: { slot: "library", tool: "sign", args: { id } },
        });
    };

    /**
     * An adaptation the reflection proposed (2026-09-29, P4 of docs/comportement-en-donnees.fr.md): adopted in a fork only,
     * where it is measured; checked again first, against the patterns of the traces as they are now and the file as it is
     * (a file changed since the reflection checked it is not patched); written to the fork's copy, a snapshot of the fork
     * taken with its reason, and said by Mother. Outside a fork, a change of conduct is a proposal a signatory signs: refused.
     */
    const relayAdaptation = async (proposal: Proposal, artifact: Proposal["artifacts"][number]) => {
        const file = path.join(taskDir(checkTaskId(proposal.taskId)), artifact.path);
        if (!existsSync(file)) throw new Error(`adaptation ${artifact.path} is not in the workshop of task ${proposal.taskId}`);
        const text = readFileSync(file);
        if (sha256Of(text) !== artifact.sha256) throw new Error(`adaptation ${artifact.path}: the sha256 proposed is not the file's`);
        const a = JSON.parse(text.toString("utf8")) as Adaptation & { targetSha256?: string };
        const fork = forkId();
        const dir = forkDir();
        if (!fork || !dir) {
            proposal.status = "rejected";
            proposal.reason = "an adaptation is adopted in a fork only; outside one, a change of conduct is a proposal an authorised signatory signs";
            say("mother.adaptation.outside", null, () => ({ target: a.target }));
            return;
        }
        const patterns = observe(WORKSHOP_ROOT);
        const { problems, before, after } = adaptationProblems(a, patterns);
        const target = fromRoot(...String(a.target).split("/"));
        if (!problems.length && existsSync(target) && a.targetSha256 && sha256Of(readFileSync(target)) !== a.targetSha256) problems.push(`${a.target} changed since the reflection checked the adaptation`);
        if (problems.length) {
            proposal.status = "rejected";
            proposal.reason = problems.join("; ");
            say("mother.adaptation.refused", null, () => ({ target: a.target, problems: problems.join("; ").slice(0, 300) }));
            return;
        }
        writeFileSync(target, `${JSON.stringify(after, null, 4)}\n`, "utf8");
        // Entered in the fork's ledger, with what its judgement and its undo need: the families it answers, each place before and after.
        const families = patterns.filter((p) => a.evidence.includes(p.id) && p.family).map((p) => p.family!);
        const entry = enterAdoption(WORKSHOP_ROOT, a, families, before, proposal.taskId, null);
        const snapshot = (() => {
            try {
                return snapshotAt(dir, `adaptation ${entry.n} of ${a.target}: ${a.reason} (${a.evidence.join(", ")})`);
            } catch (e) {
                log(`[station] the fork's snapshot of the adaptation failed: ${errorMessage(e)}`);
                return null;
            }
        })();
        if (snapshot) writeLedger(WORKSHOP_ROOT, readLedger(WORKSHOP_ROOT).map((x) => (x.n === entry.n ? { ...x, commit: snapshot.commit } : x)));
        proposal.status = "adopted";
        if (snapshot) proposal.reason = `snapshot ${snapshot.commit.slice(0, 12)}`;
        say("mother.adaptation.adopted", null, () => ({ fork, target: a.target, reason: a.reason }));
    };

    const relayProcedure = async (proposal: Proposal, artifact: Proposal["artifacts"][number]) => {
        const file = path.join(taskDir(checkTaskId(proposal.taskId)), artifact.path);
        if (!existsSync(file)) throw new Error(`procedure ${artifact.path} is not in the workshop of task ${proposal.taskId}`);
        const text = readFileSync(file);
        if (sha256Of(text) !== artifact.sha256) throw new Error(`procedure ${artifact.path}: the sha256 proposed is not the file's`);
        const procedure = JSON.parse(text.toString("utf8")) as Procedure;
        const c = commissioningFor(procedure.device);
        if (!c) throw new Error(`no commissioning is open for ${procedure.device}: a procedure is relayed only for a device being commissioned`);
        if (c.status !== "open") throw new Error(`commissioning ${c.id} is ${c.status}: it does not take a new procedure`);
        // The CO2 the test will start from, read now on the device (2026-09-28): limits under it stop a test at its first minute.
        const board = await client().call("scrubber", "motor.state", {});
        const co2Now = board.ok ? (board.output as { co2Ppm?: unknown }).co2Ppm : undefined;
        // The rules and the facts of the signed card, read now: a procedure that passed once is not trusted to pass twice.
        const { rules, facts } = await rulesAndFacts((slot, tool, args) => client().call(slot, tool, args));
        const check = checkProcedure(procedure, await presenceNow(), rules, facts, typeof co2Now === "number" ? { co2Ppm: co2Now, source: "scrubber.motor.state" } : null);
        for (const message of safetyProblems(procedure, facts, rules)) check.problems.push({ kind: "justification", message });
        if (check.problems.length) check.ok = false;
        if (!check.ok) {
            proposal.status = "rejected";
            proposal.reason = check.problems.map((p) => p.message).join("; ");
            sayRefusal(c, check.problems, check.module, procedure.steps.map((s) => s.speedPercent), procedure.limits?.minSpeedPercent);
            announce(c);
            return;
        }
        c.procedure = { procedureId: procedure.id, taskId: proposal.taskId, proposalId: proposal.proposalId, path: artifact.path, sha256: artifact.sha256, module: check.module, occupants: check.occupants, steps: procedure.steps.length, minutes: totalMinutes(procedure), content: procedure };
        // A procedure that follows an aborted test comes with the factory's analysis of it: Mother says the cause and what changes, before she asks (2026-09-29).
        const analysisFile = path.join(taskDir(checkTaskId(proposal.taskId)), PROCEDURE_FORMAT.analysis?.file ?? "analysis.json");
        c.analysis = existsSync(analysisFile) ? ((JSON.parse(readFileSync(analysisFile, "utf8")) as { analysis?: Commissioning["analysis"] }).analysis ?? null) : null;
        if (c.analysis) {
            const a = c.analysis;
            say("mother.procedure.analysis", c, () => ({ cause: a.cause, changes: a.changes.map((x) => `${x.change} (${x.prevents})`).join("; ") }));
        }
        c.status = "awaiting-authorisation";
        proposal.status = "relayed";
        const count = check.occupants.length;
        const asked = count ? say("mother.authorisation.request", c, (w) => ({ people: count === 1 ? w.phrase("mother.people.one") : w.phrase("mother.people.many", { count }) })) : say("mother.authorisation.request.empty", c, () => ({ module: check.module }));
        announce(c);
        // The commander's decision is a question of the station's own (2026-09-27): answered in Mother's chat by a click, a word typed or spoken, or a standing order; the answer comes back into commissioning_authorise.
        await askQuestion({
            taskId: proposal.taskId,
            from: "station",
            kind: "authorise",
            question: asked.text.en,
            options: [{ id: "authorise", label: "authorise the test" }, { id: "refuse", label: "refuse it" }],
            context: { commissioningId: c.id, procedure: { procedureId: procedure.id, module: check.module, occupants: check.occupants.map((o) => o.callsign ?? o.id), steps: procedure.steps.length } } as never,
            resume: { slot: "station", tool: "commissioning_authorise", args: { commissioningId: c.id } },
        });
    };

    // A question left open is recalled (2026-09-28): every STATION_REMIND_SECONDS (30 by default, 0 for never), Mother says she is still waiting, with its options.
    const remindMs = Number(process.env.STATION_REMIND_SECONDS ?? 30) * 1000;
    const reminded = new Map<string, number>();
    if (remindMs > 0) {
        const reminder = setInterval(() => {
            for (const q of state.questions) {
                if (q.status !== "open") continue;
                const since = reminded.get(q.id) ?? Date.parse(q.at);
                if (Date.now() - since < remindMs) continue;
                reminded.set(q.id, Date.now());
                say("mother.question.waiting", null, () => ({ options: q.options.map((o) => o.label).join(" / ") }));
            }
        }, 1000);
        reminder.unref?.();
    }

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
                // Mother reflects on what the fork's agents did (2026-09-29, P4): the patterns of the traces, read by code, and the
                // reflection factory asked for an adaptation that answers them. In a fork only: its adaptations are adopted and measured there.
                name: "reflect",
                title: "Reflect on the fork's traces",
                description: "In a fork only: the patterns of the traces its agents left (a cause stopping tests again, a factory refused on the same points again, a task stuck), and, when there are some, a task of the reflection factory for an adaptation of the conduct that answers them; the station adopts it in the fork when it arrives.",
                inputSchema: obj({ builder: { type: "string", enum: ["reasoner", "scripted"], description: "the reflection's builder: a model (default), or its script" }, focus: { type: "string", description: "the task or the run of the event: only the patterns read in its traces" } }),
                handle: async (args) => {
                    const fork = forkId();
                    if (!fork) throw new Error("the reflection runs in a fork only: its adaptations are adopted and measured there, never in the repository's context");
                    const dir = forkDir()!;
                    const evaluateAfter = reflectionFormat().evaluateAfter ?? 2;
                    // First the judgement of what was adopted (B): kept when its mistake shows less often since, undone otherwise.
                    const ledger = readLedger(WORKSHOP_ROOT);
                    const judged = judge(WORKSHOP_ROOT, evaluateAfter, ledger);
                    for (const { entry, decision } of judged) {
                        if (decision === "keep") {
                            say("mother.adaptation.kept", null, () => ({ fork, n: entry.n, target: entry.target, why: entry.why ?? "" }));
                            continue;
                        }
                        const { left } = undo(entry);
                        entry.status = left.length ? "not undone" : "undone";
                        if (left.length) entry.why = `${entry.why}; not undone at ${left.join(", ")}, changed since`;
                        say("mother.adaptation.undone", null, () => ({ fork, n: entry.n, target: entry.target, why: entry.why ?? "" }));
                    }
                    if (judged.length) {
                        writeLedger(WORKSHOP_ROOT, ledger);
                        try {
                            snapshotAt(dir, judged.map(({ entry }) => `adaptation ${entry.n} ${entry.status}: ${entry.why}`).join("; "));
                        } catch (e) {
                            log(`[station] the fork's snapshot of the judgement failed: ${errorMessage(e)}`);
                        }
                    }
                    const focus = typeof args.focus === "string" && args.focus ? args.focus : null;
                    // No new adaptation of a family while one of it is being judged: one change at a time, measured, never stacked.
                    const judging = underJudgement(WORKSHOP_ROOT, evaluateAfter);
                    const waiting = new Set(judging.flatMap((e) => e.families));
                    for (const e of judging) say("mother.adaptation.judging", null, () => ({ n: e.n, target: e.target, since: mistakeRate(WORKSHOP_ROOT, judgedFamilies(e), "after", e.at).tasks, needed: evaluateAfter }));
                    const read = observe(WORKSHOP_ROOT).filter((p) => !focus || p.source.includes(focus));
                    const patterns = read.filter((p) => !p.family || !waiting.has(p.family));
                    say("mother.reflection.read", null, () => ({ fork, count: patterns.length }));
                    const judgedNow = judged.map(({ entry }) => ({ n: entry.n, status: entry.status, why: entry.why ?? null }));
                    if (!patterns.length) return { fork, patterns, judged: judgedNow, judging: judging.map((e) => e.n), taskId: null, note: read.length ? "the patterns read are those of an adaptation being judged: nothing new meanwhile" : "no pattern in the traces: nothing to adapt" };
                    // What was already tried for these patterns, and what it did (A): the reflection tries something else.
                    const history = historyOf(WORKSHOP_ROOT, patterns.map((p) => p.family!).filter(Boolean));
                    const r = await client().call("factory", "request", {
                        objective: { required_outputs: [{ name: "adaptation", quantity: "Adaptation" }] },
                        observations: { reflection: { patterns, history } },
                        topics: ["reflection"],
                        ...(args.builder === "scripted" || args.builder === "reasoner" ? { builder: args.builder } : {}),
                        requestedBy: "station (reflection)",
                    });
                    if (!r.ok) throw new Error(`the reflection factory did not take the task: ${r.error ?? r.outcome}`);
                    return { fork, patterns, judged: judgedNow, judging: judging.map((e) => e.n), taskId: (r.output as { taskId: string }).taskId };
                },
            },
            {
                name: "propose",
                inputSchema: obj(
                    {
                        taskId: { type: "string" },
                        artifacts: { type: "array", items: { type: "object", properties: { kind: { type: "string", enum: ["graph", "model", "twin", "procedure", "plugin", "playbook", "adaptation"] }, path: { type: "string" }, sha256: SHA, contractSha256: SHA }, required: ["kind", "path", "sha256"] } },
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
                    const adaptation = list.find((a) => a.kind === "adaptation");
                    if (adaptation) {
                        await relayAdaptation(proposal, adaptation);
                        return { proposalId, status: proposal.status, ...(proposal.reason ? { reason: proposal.reason } : {}), note: proposal.status === "adopted" ? "adopted in the fork, and a snapshot taken" : "not adopted" };
                    }
                    const playbook = list.find((a) => a.kind === "playbook");
                    if (playbook) {
                        await relayPlaybook(proposal, playbook);
                        return { proposalId, status: proposal.status, ...(proposal.reason ? { reason: proposal.reason } : {}), note: proposal.status === "awaiting-signature" ? "on the library's proposals shelf, unsigned: an authorised signatory is asked to sign it" : "the playbook did not pass the station's check" };
                    }
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
                // After an aborted test, the commissioning takes another procedure (2026-09-29): what stopped the test is kept in its attempts, and the factory is asked again with it.
                name: "commissioning_reopen",
                inputSchema: obj({ commissioningId: { type: "string" }, reason: { type: "string" } }, ["commissioningId"]),
                handle: ({ commissioningId, reason }) => {
                    const c = commissioning(str(commissioningId));
                    if (c.status !== "aborted") throw new Error(`commissioning ${c.id} is ${c.status}: only an aborted one is reopened`);
                    c.attempts = [...(c.attempts ?? []), { procedureId: c.procedure?.procedureId ?? "", taskId: c.procedure?.taskId ?? "", aborted: c.report?.aborted ?? null, minutes: c.run?.steps.reduce((m, s) => m + (Number((s as { minutes?: number }).minutes) || 0), 0) ?? 0, reopenedAt: new Date().toISOString(), reason: str(reason) || "the commander asked for another procedure" }];
                    c.status = "open";
                    c.procedure = null;
                    c.authorisation = null;
                    c.monitoring = null;
                    c.run = null;
                    c.report = null;
                    say("mother.commissioning.reopened", c, () => ({ attempt: (c.attempts?.length ?? 0) + 1 }));
                    announce(c);
                    return { commissioning: c };
                },
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
                        procedure: { type: "object" },
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
                    // The procedure whole when the factory sends it: its speeds and floor read here, where Mother's words are.
                    const sent = (args.procedure && typeof args.procedure === "object" ? args.procedure : null) as Partial<Procedure> | null;
                    const speeds = (Array.isArray(sent?.steps) ? sent.steps.map((s) => (typeof s?.speedPercent === "number" ? s.speedPercent : null)) : Array.isArray(args.speeds) ? args.speeds : []) as Array<number | null>;
                    const minSpeed = typeof sent?.limits?.minSpeedPercent === "number" ? sent.limits.minSpeedPercent : typeof args.minSpeedPercent === "number" ? args.minSpeedPercent : undefined;
                    const module = str(args.module) || moduleOf(str(args.volume));
                    const refusedBefore = c.checks.some((x) => x.taskId === args.taskId && !x.ok);
                    c.checks.push({ taskId: str(args.taskId), attempt, procedureId: str(args.procedureId), ok: args.ok === true, kinds: [...new Set(problems.map((p) => p.kind))], at: new Date().toISOString() });
                    if (attempt === 1) {
                        // Mother says who is in the module as she reads it, not as the builder did (or did not).
                        const count = (await presenceNow()).modules.find((m) => m.module === module)?.occupants ?? 0;
                        say("mother.procedure.proposed", c, (w) => ({ method: methodPhrase(w, str(args.method)), steps: Number(args.steps) || 0, minutes: Number(args.minutes) || 0, occupants: occupantsPhrase(w, count), module }));
                    }
                    if (args.ok !== true) sayRefusal(c, problems, module, speeds, minSpeed);
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
                inputSchema: obj({ commissioningId: { type: "string" }, decision: { type: "string", enum: ["authorise", "refuse"] }, by: { type: "string" }, note: { type: "string" }, questionId: { type: "string" }, answer: { type: "object" } }, ["commissioningId"]),
                handle: async (args) => {
                    const { commissioningId } = args;
                    // Called directly (the page's chips, a script), or back from the authorise question with the commander's answer.
                    const answered = args.answer && typeof args.answer === "object" ? (args.answer as { choice?: string; by?: string; note?: string | null }) : null;
                    const decision = str(args.decision) || answered?.choice || "";
                    const by = str(args.by) || answered?.by || "commander";
                    const note = str(args.note) || answered?.note || "";
                    if (decision !== "authorise" && decision !== "refuse") throw new Error(`decision is "authorise" or "refuse", not "${decision}"`);
                    const c = commissioning(commissioningId);
                    if (c.status !== "awaiting-authorisation" || !c.procedure) throw new Error(`commissioning ${c.id} is ${c.status}: there is nothing to authorise`);
                    const at = new Date().toISOString();
                    // A direct call settles the open question of this commissioning, so nobody answers it twice.
                    if (!args.questionId) {
                        for (const q of state.questions) {
                            if (q.status !== "open" || q.kind !== "authorise" || (q.context as { commissioningId?: string } | null)?.commissioningId !== c.id) continue;
                            q.answer = { choice: decision, by, at, note: note || null, how: "script" };
                            q.status = "answered";
                            notify(QUESTIONS_URI, { [META_QUESTION]: q });
                        }
                    }
                    if (decision === "refuse") {
                        c.authorisation = { decision: "refuse", by, at, note: note || null };
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
                    c.authorisation = { decision: "authorise", by, at, note: note || null };
                    c.status = "authorised";
                    say("mother.authorised", c);
                    if (ids.length) say(ids.length === 1 ? "mother.monitoring.active.one" : "mother.monitoring.active.many", c, () => ({ count: ids.length }));
                    announce(c);
                    return { commissioningId: c.id, status: c.status, monitoring: c.monitoring };
                },
            },
            {
                // Mother tells the room where a run stands (2026-09-27: a commissioning went silent for minutes while its factories worked): a line the caller writes, from the state it holds, kept and spoken like her own.
                name: "narrate",
                inputSchema: obj({ text: { type: "string" }, fr: { type: "string" }, from: { type: "string" }, commissioningId: { type: "string" } }, ["text", "from"]),
                handle: (args, s) => {
                    const text = str(args.text).trim();
                    if (!text) throw new Error("text is needed: what Mother says");
                    if (text.length > 400) throw new Error(`a line of Mother's is a sentence or two, not ${text.length} characters`);
                    const line = emit({ n: s.mother.length + 1, key: "mother.narration", params: { from: str(args.from) }, text: { en: text, fr: str(args.fr) || text }, commissioningId: str(args.commissioningId) || null, at: new Date().toISOString() });
                    return { n: line.n, said: line.text.en };
                },
            },
            {
                // A question to the commander (Tier 4): kept, said by Mother, answered on the control post or by a standing order; on the answer the asker is called back.
                name: "ask",
                inputSchema: obj(
                    {
                        taskId: { type: "string" },
                        from: { type: "string", description: "who asks: factory, graph-factory:<task>, the harness" },
                        kind: { type: "string", description: "open-code, replay, load-twin, ask" },
                        question: { type: "string" },
                        options: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" } }, required: ["id", "label"] }, minItems: 2 },
                        context: { type: "object", description: "what the commander needs to decide: the contract, the artifact, the reason" },
                        resume: { type: "object", properties: { slot: { type: "string" }, tool: { type: "string" }, args: { type: "object" } }, required: ["slot", "tool"], description: "who to call back with the answer, and with what" },
                        role: { type: "string", description: "the role the question is for (specs/station/roles.json): only a person it names answers; a signature is the authorised-signatory's" },
                    },
                    ["from", "kind", "question", "options"],
                ),
                handle: (args) => askQuestion(args),
            },
            {
                // The commander's answer (Tier 4): a choice among the options, who and how; then the asker is called back. Never the agent's.
                name: "answer",
                inputSchema: obj(
                    {
                        questionId: { type: "string" },
                        choice: { type: "string", description: "the id of the option chosen" },
                        by: { type: "string", description: "who answers: the commander when absent" },
                        how: { type: "string", enum: ["click", "voice", "typed", "script"], description: "how the answer came" },
                        note: { type: "string" },
                        amendments: { type: "object", description: "what the commander changed in the context (a contract amended), when the option allows it" },
                    },
                    ["questionId", "choice"],
                ),
                handle: async ({ questionId, choice, by, how, note, amendments }, s) => {
                    const q = s.questions.find((x) => x.id === String(questionId));
                    if (!q) throw new Error(`no question ${String(questionId)}`);
                    if (q.status !== "open") throw new Error(`question ${q.id} is ${q.status}: nothing to answer`);
                    const option = q.options.find((o) => o.id === String(choice));
                    if (!option) throw new Error(`"${String(choice)}" is not an option of question ${q.id} (${q.options.map((o) => o.id).join(", ")})`);
                    // Who answers is the commander unless the caller says otherwise (2026-09-27: an answer without by was recorded as "undefined").
                    const who = str(by) || "commander";
                    // A question for a role is answered by a person it names, whoever else is at the chat.
                    const refused = q.role ? notHolder(q.role, who) : null;
                    if (refused) {
                        say("mother.question.notHolder", null, () => ({ why: refused }));
                        throw new Error(`question ${q.id} is for the role ${q.role}: ${refused}`);
                    }
                    q.answer = { choice: option.id, by: who, at: new Date().toISOString(), note: str(note) || null, how: (how === "voice" || how === "script" || how === "typed" ? how : "click") as QuestionAnswer["how"], ...(amendments && typeof amendments === "object" ? { amendments: amendments as never } : {}) };
                    q.status = "answered";
                    say("mother.question.answered", null, () => ({ choice: option.label, by: who }));
                    notify(QUESTIONS_URI, { [META_QUESTION]: q });
                    await resumeAsker(q);
                    return { questionId: q.id, status: q.status, answer: q.answer, resumed: q.resumed };
                },
            },
            {
                // The standing orders (Tier 4, on the control post): every question waits, or some kinds are answered by a choice set here.
                name: "questions_policy",
                inputSchema: obj({ mode: { type: "string", enum: ["ask", "auto"] }, kind: { type: "string", description: "one kind only; every kind when absent" }, choice: { type: "string", description: "for auto: the option id answered; the first option when absent" } }),
                handle: ({ mode, kind, choice }, s) => {
                    if (mode !== "ask" && mode !== "auto") throw new Error('mode is "ask" or "auto"');
                    if (kind) s.questionsPolicy.byKind[String(kind)] = { mode, ...(choice ? { choice: String(choice) } : {}) };
                    else {
                        s.questionsPolicy.mode = mode;
                        s.questionsPolicy.byKind = choice ? { "*": { mode, choice: String(choice) } } : {};
                    }
                    say(mode === "auto" ? "mother.questions.policy.auto" : "mother.questions.policy.ask", null, () => ({ kind: kind ? String(kind) : "every kind", choice: choice ? String(choice) : "the first option" }));
                    notify(QUESTIONS_POLICY_URI, { policy: s.questionsPolicy as never });
                    return { policy: s.questionsPolicy };
                },
            },
            {
                name: "procedure_run",
                inputSchema: obj(
                    {
                        commissioningId: { type: "string" },
                        action: { type: "string", enum: ["begin", "step", "record", "clock", "abort", "finish"] },
                        minute: { type: "number" },
                        planned: { type: "number" },
                        secondsPerMinute: { type: "number" },
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
                        case "clock": {
                            // The test's clock (2026-09-28): the minute of the station's clock the test is at, and the pace it is played at, so a room tells the test's time from the time it takes to run.
                            if (c.status !== "running" || !c.run) throw new Error(`commissioning ${c.id} is ${c.status}: no clock runs`);
                            c.run.clock = { minute: Number(args.minute) || 0, planned: typeof args.planned === "number" ? args.planned : null, secondsPerMinute: Number(args.secondsPerMinute) || 0, at: new Date().toISOString() };
                            announce(c);
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
                            if (r.result.value !== null) say("mother.result.volume", c, () => ({ volume: Math.round(r.result.value as number), module: p.module }));
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
            { uri: QUESTIONS_URI, read: (s) => s.questions },
            { uri: QUESTIONS_POLICY_URI, read: (s) => s.questionsPolicy },
            { uri: "station://proposals", read: (s) => s.proposals },
            // Where this station runs: in a fork (an environment set apart, its data its own), or on the repository's context.
            { uri: "station://environment", read: () => ({ fork: forkId() ? { id: forkId(), dir: forkDir(), learning: process.env.FORK_LEARNING === "scripted" || process.env.FORK_LEARNING === "reasoner" ? process.env.FORK_LEARNING : null } : null }) },
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
