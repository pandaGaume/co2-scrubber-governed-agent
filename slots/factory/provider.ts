/**
 * slot `factory`, stub. The offline means of production (usine-jobs.fr.md, 4.1):
 * `run_sweep`, `run_fit`, `run_evaluate` take the job spec itself and answer
 * with a job id and a plan; `job_status`; `get_artifact`. The stub validates
 * nothing and runs nothing: it mints an id, remembers the spec, and reports
 * the job as completed at once. The real slot wraps `spikypanda-job` and the
 * runner the profile binds (Nebius Serverless Jobs, Qualcomm AI Hub, local).
 */
import { randomUUID } from "node:crypto";
import { objectSchema as obj, publishSlot, type PublishedSlot, type SlotTool } from "../lib/slot-server.js";

type JobKind = "sweep" | "fit" | "evaluate";
interface JobSpecLike {
    job?: string;
    name?: string;
    [key: string]: unknown;
}
interface Job {
    kind: JobKind;
    name: string | undefined;
    state: "queued" | "running" | "completed" | "failed" | "refused";
    exit: number;
    startedAt: string;
    finishedAt: string;
    spec: JobSpecLike;
    files: string[];
}
export interface FactoryState {
    runner: string;
    jobs: Record<string, Job>;
}

const SPEC = { type: "object", description: "A job specification, identical to the file spikypanda-job reads" };

function runTool(kind: JobKind): SlotTool<FactoryState> {
    return {
        name: `run_${kind}`,
        title: `Run a ${kind} job`,
        description: `Start a ${kind} job from its specification; returns a job id and the plan. Stub: nothing runs, the job completes at once.`,
        inputSchema: obj({ spec: SPEC }, ["spec"]),
        handle: ({ spec }, s) => {
            const given = (spec ?? {}) as JobSpecLike;
            if (given.job !== kind) throw new Error(`spec.job is "${given.job}", this tool runs "${kind}" jobs`);
            const jobId = randomUUID();
            const now = new Date().toISOString();
            s.jobs[jobId] = { kind, name: given.name, state: "completed", exit: 0, startedAt: now, finishedAt: now, spec: given, files: ["manifest.json"] };
            return { jobId, accepted: true, plan: { kind, name: given.name, note: "stub: no plan computed, nothing ran" } };
        },
    };
}

export function factorySlot(wsBase: string, log: (line: string) => void): PublishedSlot<FactoryState> {
    return publishSlot<FactoryState>({
        slot: "factory",
        description: "The factory (stub): sweep, fit and evaluate jobs by specification, job status, artifacts by location",
        instructions: {
            en: "The factory runs long studies as jobs (sweep, fit, evaluate) from a specification. Starting a job needs the operator's approval; ask the twin for a quick what-if instead.",
            fr: "L'usine exécute les études longues comme des jobs (sweep, fit, evaluate) à partir d'une spécification. Lancer un job demande l'approbation de l'opérateur ; pour une question rapide, interroger le jumeau.",
        },
        wsBase,
        log,
        state: { runner: "stub", jobs: {} },
        tools: [
            runTool("sweep"),
            runTool("fit"),
            runTool("evaluate"),
            {
                name: "job_status",
                title: "Job status",
                description: "State of a job: queued, running, completed, failed or refused, with its exit code and times.",
                inputSchema: obj({ jobId: { type: "string", description: "the id run_* returned" } }, ["jobId"]),
                handle: ({ jobId }, s) => {
                    const j = s.jobs[String(jobId)];
                    if (!j) throw new Error(`unknown job ${jobId}`);
                    const { spec, ...rest } = j;
                    return { jobId, ...rest, specName: spec.name };
                },
            },
            {
                name: "get_artifact",
                title: "Get a job's file",
                description: "A job's file: small files inline with their sha256, large ones by location and sha256, never the bytes. Stub: a placeholder manifest.",
                inputSchema: obj({ jobId: { type: "string", description: "the id run_* returned" }, path: { type: "string", description: "file path inside the job's outputs" } }, ["jobId", "path"]),
                handle: ({ jobId, path }, s) => {
                    const j = s.jobs[String(jobId)];
                    if (!j) throw new Error(`unknown job ${jobId}`);
                    if (path !== "manifest.json") throw new Error(`job ${jobId} has no file "${path}" (stub jobs write only manifest.json)`);
                    return { path, inline: { name: j.name, job: j.kind, stub: true }, sha256: null, location: null };
                },
            },
        ],
        resources: [{ uri: "factory://jobs", name: "Jobs", description: "Every job this slot accepted", read: (s) => Object.fromEntries(Object.entries(s.jobs).map(([id, j]) => [id, { kind: j.kind, name: j.name, state: j.state }])) }],
    });
}
