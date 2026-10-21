/** Station admission: requests are the supervisor's, installation authority remains the commander's. */
import { randomUUID } from "node:crypto";
import type { Broker } from "../../harness/lib/broker.js";
import { connectMcpAt, type McpSession } from "../../harness/lib/mcp-http.js";
import { brokerAuth } from "../../harness/lib/broker-auth.js";
import type { SlotTool } from "../lib/slot-server.js";
import { objectSchema as obj } from "../lib/slot-server.js";
import { runtimeEvents } from "../lib/events.js";
import type { StationState, Proposal } from "./provider.js";
import type { Question, QuestionAnswer } from "./questions.js";
import { fingerprint, workshopBytes, type TwinEvaluation, type TwinInstallation } from "../twin/deployments.js";
import { sha256Of } from "../tools/lib/workshop.js";

interface Admission {
    token: string;
    questionId: string | null;
    proposalId: string;
    deviceId: string;
    descriptorSha256: string;
    reportId: string;
    artifactSha256: string;
}

export function stationTwinTools(options: {
    state: StationState;
    client: () => Broker;
    say: (text: string, fr: string) => void;
    ask: (args: Record<string, unknown>) => Promise<{ questionId: string; status: Question["status"]; answer?: QuestionAnswer | null }>;
    commanderHolders: () => string[];
}): SlotTool<StationState>[] {
    const { state, client, say, ask } = options;
    const admissions = new Map<string, Admission>();
    const validating = new Set<string>();
    const call = async <T>(tool: string, args: Record<string, unknown>): Promise<T> => {
        const r = await client().call("twin", tool, args);
        if (!r.ok) throw new Error(`twin.${tool} unavailable or refused: ${r.error ?? r.outcome}`);
        return r.output as T;
    };
    const blocked = (phase: string, error: unknown): never => {
        const why = error instanceof Error ? error.message : String(error);
        say(`Twin ${phase} blocked: ${why}`, `Jumeau : ${phase} bloqué : ${why}`);
        runtimeEvents.append("station.twin-blocked", { phase, reason: why });
        throw error;
    };
    const device = (id: string) => {
        const d = state.devices[id];
        if (!d) throw new Error(`device ${id} is not registered`);
        return d;
    };
    const proposal = (id: string): Proposal => {
        const p = state.proposals.find((p) => p.proposalId === id);
        if (!p) throw new Error(`proposal ${id} was not received by the station`);
        return p;
    };
    const artifact = (p: Proposal) => {
        const graphs = p.artifacts.filter((a) => ["graph", "twin"].includes(a.kind));
        if (graphs.length !== 1) throw new Error("admission needs a proposal with exactly one graph or twin artifact");
        return graphs[0];
    };
    const checkReport = (p: Proposal, deviceId: string, report: TwinEvaluation) => {
        const a = artifact(p);
        if (p.status !== "accepted" || p.reportId !== report.reportId || report.verdict !== "pass" || report.taskId !== p.taskId || report.manifestSha256 !== p.manifestSha256 || report.artifactSha256 !== a.sha256 || report.artifactPath !== a.path || report.deviceId !== deviceId || report.descriptorSha256 !== fingerprint(device(deviceId).descriptor)) throw new Error("no current passing independent validation for this exact proposal and registered device");
        if (sha256Of(workshopBytes(p.taskId, a.path)) !== a.sha256 || sha256Of(workshopBytes(p.taskId, "manifest.json")) !== p.manifestSha256) throw new Error("proposal bytes changed after validation");
    };
    return [
        {
            name: "twin_services", description: "Check required validation, admission and installed-twin services. Mother explicitly reports missing capabilities or missing commander holders; this does not finish a mission.", inputSchema: obj({}),
            handle: async () => {
                const required = ["evaluate", "evaluation", "install", "active", "run_installed", "session_run"];
                let tools: string[] = [];
                let failure: string | null = null;
                let probe: McpSession | undefined;
                try {
                    probe = await connectMcpAt(`${client().base}/twin/mcp`, "twin", { name: "station-twin-services", version: "1" }, brokerAuth("station"), { timeoutMs: 2000 });
                    tools = (await probe.listTools()).map((t) => t.name);
                }
                catch (e) { failure = e instanceof Error ? e.message : String(e); }
                finally { await probe?.close(); }
                const missing = required.filter((t) => !tools.includes(t)).map((t) => `twin.${t}`);
                const holders = options.commanderHolders();
                if (missing.length) say(`Twin services missing: ${missing.join(", ")}. The mission cannot claim validation or installation.`, `Services du jumeau absents : ${missing.join(", ")}. Aucune validation ou installation ne peut être déclarée.`);
                if (!holders.length) say("Twin installation has no authorised commander. Assign a commander before approving installation.", "Aucun commandant habilité pour l'installation du jumeau. Désignez-en un avant l'autorisation.");
                return { available: missing.length === 0, missing, failure, installationAuthority: { available: holders.length > 0, role: "commander", holders } };
            },
        },
        {
            name: "twin_validate", description: "Request independent validation of a received graph proposal for a registered device. Requires telemetry in a separate hashed validation task, bound to the same device. Replays the exact candidate without fitting; Mother reports failures. This does not install anything.",
            inputSchema: obj({ proposalId: { type: "string" }, deviceId: { type: "string" }, validationTaskId: { type: "string" }, validationFile: { type: "string" } }, ["proposalId", "deviceId", "validationTaskId", "validationFile"]),
            handle: async (args) => {
                const proposalId = String(args.proposalId);
                if (validating.has(proposalId)) throw new Error("validation of this proposal is already running");
                validating.add(proposalId);
                let p: Proposal | undefined;
                try {
                    p = proposal(proposalId);
                    const d = device(String(args.deviceId));
                    const a = artifact(p);
                    p.status = "judging";
                    say("Replaying the proposed twin against held-out measurements. Installation remains pending.", "Validation du jumeau proposé sur des mesures distinctes. Installation en attente.");
                    const report = await call<TwinEvaluation>("evaluate", { taskId: p.taskId, artifactPath: a.path, artifactSha256: a.sha256, manifestSha256: p.manifestSha256, deviceId: d.path, descriptor: d.descriptor, validationTaskId: String(args.validationTaskId), validationFile: String(args.validationFile) });
                    p.reportId = report.reportId;
                    p.status = report.verdict === "pass" ? "accepted" : "rejected";
                    p.reason = report.verdict === "pass" ? "Independent held-out replay passed. Not installed." : "Independent held-out replay failed. Installation refused.";
                    say(p.reason, report.verdict === "pass" ? "Validation indépendante réussie. Le jumeau n'est pas installé." : "Validation indépendante échouée. Installation refusée.");
                    runtimeEvents.append("station.twin-validated", { taskId: p.taskId, proposalId, report });
                    return { taskId: p.taskId, proposalId, report, installed: false };
                } catch (e) { if (p) { p.status = "rejected"; p.reason = e instanceof Error ? e.message : String(e); } return blocked("validation", e); }
                finally { validating.delete(proposalId); }
            },
        },
        {
            name: "twin_admit", description: "Ask the authorised commander to install an independently validated twin for its exact device. Opens a real question in Mother's chat. The station installs only after the answer; the supervisor cannot approve its own request.",
            inputSchema: obj({ proposalId: { type: "string" }, deviceId: { type: "string" }, reportId: { type: "string" } }, ["proposalId", "deviceId", "reportId"]),
            handle: async (args) => {
                try {
                    const p = proposal(String(args.proposalId));
                    const d = device(String(args.deviceId));
                    const report = await call<TwinEvaluation>("evaluation", { reportId: String(args.reportId) });
                    checkReport(p, d.path, report);
                    const existing = [...admissions.values()].find((a) => a.proposalId === p.proposalId && a.reportId === report.reportId && a.deviceId === d.path && state.questions.some((q) => q.id === a.questionId && (q.status === "open" || q.status === "queued")));
                    if (existing) return { taskId: p.taskId, questionId: existing.questionId, status: "awaiting-authorisation", installed: false };
                    if (!options.commanderHolders().length) throw new Error("no holder of the commander role can authorise twin installation");
                    const admission: Admission = { token: randomUUID(), questionId: null, proposalId: p.proposalId, deviceId: d.path, descriptorSha256: fingerprint(d.descriptor), reportId: report.reportId, artifactSha256: report.artifactSha256 };
                    admissions.set(admission.token, admission);
                    const q = await ask({ from: "station twin admission", kind: "twin-install", role: "commander", taskId: p.taskId, question: `Install twin ${report.artifactSha256} for ${d.path}? Independent validation ${report.reportId} passed on ${report.validation.samples} held-out samples from task ${report.validation.taskId}. Data origin is task-supplied, not attested as physical measurement. Scope: replay of the encoded operating profile. This activates the station simulator and sends no hardware command.`, options: [{ id: "install", label: "Authorise installation" }, { id: "refuse", label: "Refuse installation" }], context: { ...admission }, resume: { slot: "station", tool: "twin_install", args: { token: admission.token } } });
                    admission.questionId = q.questionId;
                    return { taskId: p.taskId, questionId: q.questionId, status: "awaiting-authorisation", installed: false, reportId: report.reportId };
                } catch (e) { return blocked("admission", e); }
            },
        },
        {
            name: "twin_install", description: "Protected station callback for a genuine commander answer to a station-created twin admission. Rechecks the question, device, proposal and independent report before activation; arbitrary or self-authorised callbacks are refused.",
            inputSchema: obj({ token: { type: "string" }, questionId: { type: "string" }, answer: { type: "object" } }, ["token", "questionId"]),
            handle: async (args) => {
                try {
                    const admission = admissions.get(String(args.token));
                    const q = state.questions.find((q) => q.id === String(args.questionId));
                    if (!admission || admission.questionId !== q?.id || q.kind !== "twin-install" || q.role !== "commander" || q.status !== "answered" || !q.answer || q.answer.how === "policy" || !options.commanderHolders().some((h) => h.trim().toLowerCase() === q.answer!.by.trim().toLowerCase())) throw new Error("no genuine authorised commander answer for this admission");
                    // Read the station's recorded answer, never the callback's supplied answer object.
                    if (q.answer.choice !== "install") {
                        admissions.delete(admission.token);
                        say("The commander refused twin installation. No installation was performed.", "Le commandant a refusé l'installation du jumeau. Aucune installation effectuée.");
                        runtimeEvents.append("station.twin-installation", { taskId: proposal(admission.proposalId).taskId, proposalId: admission.proposalId, deviceId: admission.deviceId, status: "refused" });
                        return { installed: false, status: "refused" };
                    }
                    const p = proposal(admission.proposalId);
                    const report = await call<TwinEvaluation>("evaluation", { reportId: admission.reportId });
                    checkReport(p, admission.deviceId, report);
                    if (fingerprint(device(admission.deviceId).descriptor) !== admission.descriptorSha256) throw new Error("device descriptor changed since installation was requested");
                    const installation = await call<TwinInstallation>("install", { deviceId: admission.deviceId, descriptorSha256: admission.descriptorSha256, reportId: admission.reportId, approvedBy: q.answer.by, questionId: q.id });
                    const active = await call<{ installations: TwinInstallation[] }>("active", { deviceId: admission.deviceId });
                    if (!active.installations.some((a) => a.sha256 === admission.artifactSha256 && a.reportId === admission.reportId)) throw new Error("runtime did not confirm the expected active installation");
                    device(admission.deviceId).simulator = { sha256: installation.sha256, reportId: installation.reportId };
                    state.artifacts[installation.sha256] = { sha256: installation.sha256, contractSha256: fingerprint({ compare: report.compare, thresholds: report.thresholds }), reportId: installation.reportId, registeredAt: installation.installedAt };
                    admissions.delete(admission.token);
                    say(`Twin installed for ${admission.deviceId}. The validated graph is active in the station.`, `Jumeau installé pour ${admission.deviceId}. Le graphe validé est actif dans la station.`);
                    runtimeEvents.append("station.twin-installation", { taskId: p.taskId, proposalId: p.proposalId, deviceId: admission.deviceId, status: "installed", installation });
                    return { installed: true, installation };
                } catch (e) {
                    const admission = admissions.get(String(args.token));
                    const p = admission ? state.proposals.find((p) => p.proposalId === admission.proposalId) : null;
                    if (p && admission) runtimeEvents.append("station.twin-installation", { taskId: p.taskId, proposalId: p.proposalId, deviceId: admission.deviceId, status: "failed", reason: e instanceof Error ? e.message : String(e) });
                    return blocked("installation", e);
                }
            },
        },
        {
            name: "twin_state", description: "Read the real active installation for a registered device, its independent report and whether its descriptor still matches. Empty means not installed, even if a reference simulation runs.", inputSchema: obj({ deviceId: { type: "string" } }, ["deviceId"]),
            handle: async (args) => {
                try {
                    const d = device(String(args.deviceId));
                    const active = await call<{ installations: TwinInstallation[] }>("active", { deviceId: d.path });
                    const installation = active.installations[0] ?? null;
                    const matches = installation !== null && installation.descriptorSha256 === fingerprint(d.descriptor);
                    d.simulator = matches ? { sha256: installation!.sha256, reportId: installation!.reportId } : null;
                    return { deviceId: d.path, installed: matches, installation, report: installation ? await call<TwinEvaluation>("evaluation", { reportId: installation.reportId }) : null };
                } catch (e) { return blocked("state read", e); }
            },
        },
        {
            name: "twin_run", description: "Consult the twin actually installed for a registered device. Refuses missing or stale installation, executes its exact graph and returns provenance with the result. This is distinct from the reference habitat twin.", inputSchema: obj({ deviceId: { type: "string" }, minutes: { type: "integer", minimum: 1, maximum: 1440 } }, ["deviceId"]),
            handle: async (args) => {
                try {
                    const d = device(String(args.deviceId));
                    const active = await call<{ installations: TwinInstallation[] }>("active", { deviceId: d.path });
                    if (!active.installations.some((a) => a.descriptorSha256 === fingerprint(d.descriptor))) throw new Error(`no current validated twin installed for ${d.path}`);
                    return await call<unknown>("run_installed", { deviceId: d.path, ...(args.minutes === undefined ? {} : { minutes: args.minutes }) });
                } catch (e) { return blocked("execution", e); }
            },
        },
    ];
}
