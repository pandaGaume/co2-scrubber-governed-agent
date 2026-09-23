/**
 * The factory in the studio: an extension of SpikyPanda's node editor v2
 * (`?ext=/agent/factory.js`) on the factory's document
 * (`graphs/factory-agent.spikypanda`, the same twelve stages as the agent's),
 * opened in its own window when the server starts. The loop itself runs in
 * Node (the `factory` slot steps it, `harness/core/runner.ts`); this page
 * reads what it did and shows it: it is told of every change of a task (the
 * slot pushes `resources/updated` on `factory://tasks` with the task's answer
 * in `_meta`, `pushes.ts`; it reads the list when it opens and while the
 * stream is down), and for
 * every step of the manifest it walks the twelve stages on the canvas, one
 * at a time, the way the agent's page does while it decides. It replays
 * nothing on its own when it opens: a task already ended is only named
 * (choosing it in the list replays it); what it follows is a task running,
 * or asked after the page opened. The run
 * monitor tile carries the task, the step's sentence, the call and its
 * answer, the reward. Nothing is typed: every number comes from the
 * manifest, every sentence from the factory slot's wording for this page's
 * session (`grammar://phrases`, `factory-voice.ts`). The page does not
 * speak: the Control Board is the audio output and says the same sentences.
 *
 * URL: `?mcp=0&ext=/agent/factory.js` (the loader, `factory-loader.ts`)
 *      `&broker=<origin>` (default: the page's) `&slow=15000` (ms between two looks at the tasks while the push stream is down)
 *      `&locale=fr` the words (default en-US: the demo's language)
 *      `&task=<id>` follows one task instead of the latest
 *      `&view=follow|fit&threshold=120&zoom=1` as on the agent's page (follow by default).
 */
import { Broker } from "../lib/broker.js";
import { createBar, createStageLights, disableStudioPlayer, findMonitor, hideMonitorNode, installLoopStyle, stageNodes, viewControls, type MonitorTile, type Studio, type ViewMode } from "./studio-loop.js";
import { ROOM_COLORS } from "./room-skin.js";
import { watchSlot } from "./pushes.js";

/** What the factory slot pushes on its task list (`slots/factory/provider.ts`). */
const TASKS_URI = "factory://tasks";
const META_TASK = "spikypanda/task";
import { endSentence, loadWords, stageSentence, stepSentence, type ManifestStepLike, type TaskStatusLike } from "./factory-voice.js";

const SOURCE = "factory";

/** What `factory.task` answers, the part this page reads. */
interface TaskStatus extends TaskStatusLike {
    taskId: string;
    state: string;
    files?: number;
    manifest: {
        topic?: string;
        signature?: { id?: string; outputs?: Array<{ quantity: string; unit: string | null }> };
        provider?: { name?: string; model?: string };
        tools?: { count?: number };
        budget?: { iterations?: number; minutes?: number };
        recipes?: { loaded?: boolean; experiencesBefore?: number; replayedSteps?: number };
        steps?: ManifestStepLike[];
        artifacts?: unknown[];
        proposal?: { proposalId?: string } | null;
        ended?: string | null;
        startedAt?: string;
    } | null;
    run?: { builder?: string; lastStage?: string | null; steps?: number } | null;
}

/** The stages a step went through, from what the manifest says of it: the branch, and where it stopped. */
function stagesOf(step: ManifestStepLike): Array<{ stage: string; error?: string }> {
    const before = ["observe", "context", "lookup", "gate"];
    const after = ["merge", "guard", "execute", "observe-after", "evaluate", "record"];
    const reason = step.reason ?? "refused";
    switch (step.source) {
        case "policy":
            return [...before, ...after].map((stage) => ({ stage }));
        case "fallback":
            return [...before, "request", "reason", ...after].map((stage) => ({ stage }));
        case "refused": {
            // A capability outside the list is caught as the reasoner answers; anything else (the schema, the guard) at the guard.
            const atReason = /outside the allowlist|Invalid decision/i.test(reason);
            const walked = atReason ? [...before, "request"] : [...before, "request", "reason", "merge"];
            return [...walked.map((stage) => ({ stage })), { stage: atReason ? "reason" : "guard", error: reason }];
        }
        default:
            return [...before.map((stage) => ({ stage })), { stage: "request" }, { stage: "reason", error: reason }];
    }
}

const ended = (state: string | undefined) => state !== undefined && state !== "created" && state !== "running";
const num = (v: unknown): string => (typeof v === "number" && Number.isFinite(v) ? String(v) : "?");

export default async function activate(studio: Studio): Promise<void> {
    const params = new URLSearchParams(location.search);
    const brokerUrl = params.get("broker") ?? location.origin;
    const slowMs = Math.max(2000, Number(params.get("slow") ?? 15000));
    const pinned = params.get("task");
    const locale = params.get("locale") ?? "en-US";
    const broker = new Broker(brokerUrl, { name: "studio-factory", version: "0.1.0", locale });
    const { words, grammar } = await loadWords(await broker.session("factory"));
    const p = (key: string, values: Record<string, unknown> = {}) => words.phrase(key, values);
    const initialView = { mode: (params.get("view") === "fit" ? "fit" : "follow") as ViewMode, threshold: Number(params.get("threshold") ?? 120), zoom: Number(params.get("zoom") ?? 1) };

    installLoopStyle();
    const viewer = studio.getViewer();
    studio.setLayout({ palette: false, properties: false, console: false, dashboardHeight: 300 });
    disableStudioPlayer("This graph is the factory's loop: it is run by the factory slot on its tasks, not by the studio's player.");
    const byStage = stageNodes(viewer);
    const monitor: MonitorTile | null = findMonitor(viewer);
    hideMonitorNode(viewer);
    // The strip draws what this page observes of each step (`showStep`), not the agent's cabin.
    if (monitor) monitor.series = [
        { key: "reward", label: "reward", color: ROOM_COLORS.teal, min: -1, max: 1 },
        { key: "ms", label: "ms", color: ROOM_COLORS.amber },
    ];
    const log = (level: "info" | "warn" | "error", message: string) => studio.log(level, SOURCE, message);
    const narrate = (stage: string, text: string, now?: string, level: "info" | "warn" | "error" = "info") => monitor?.push({ kind: "narrate", stage, text, now, level });

    // ── Toolbar: the task followed, the builder, the state ─────────────────
    const toolbar = createBar("FACTORY");
    const { bar, badge, select, button } = toolbar;
    const taskSel = select("The factory's tasks, newest first; the page follows the newest unless one is chosen here", [["latest", "latest task"]], "latest");
    const { view, frame } = viewControls(toolbar, initialView, studio, () => lights.lit(), () => byStage.get("observe"));
    const boardBtn = button("control board", "the Control Board, in this window", () => {
        location.href = "/";
    });
    boardBtn.title = "open the Control Board";
    bar.appendChild(badge);
    studio.addBar(bar);
    // Laid out and skinned: the studio can show itself (an extension's page starts hidden, so its default look never flashes).
    studio.reveal?.();
    const setStatus = (text: string, short?: string, warn = false) => {
        badge.textContent = short ?? text;
        badge.title = text;
        badge.classList.toggle("warn", warn);
    };

    // ── The highlight, one stage at a time, and the sentence of each stage for the step being replayed ──
    let step: ManifestStepLike | null = null;
    let status: TaskStatus | null = null;
    // The values the stage sentences may name (`stage.*` in the words file), from the step being replayed and its task.
    const sentenceFor = (stage: string, next: string | undefined): [string, string] => {
        const s = step;
        const m = status?.manifest;
        const builder = m?.provider?.name ?? "?";
        return stageSentence(
            words,
            stage,
            {
                n: num(s?.n),
                taskId: status?.taskId ?? "?",
                files: num(status?.files),
                kind: m?.signature?.id ?? "?",
                topic: m?.topic ?? "?",
                experiences: num(m?.recipes?.experiencesBefore),
                tools: num(m?.tools?.count),
                builder,
                tokens: s?.tokens?.total ? p("stage.reason.tokens", { tokens: s.tokens.total }) : "",
                capability: s?.capability ?? "?",
                outcome: s?.outcome ?? "?",
                ms: num(s?.ms),
                reward: num(s?.reward),
                reason: s?.reason ?? "",
            },
            next,
        );
    };
    const lights = createStageLights({ studio, viewer, byStage: () => byStage, view, sentenceFor, narrate, stopped: (stage, message) => [p("stage.stopped", { stage, message }), p("stage.stopped.now", { message })] });

    /** Replays one step of the manifest on the canvas and in the tile, at the highlight's pace. */
    async function showStep(s: ManifestStepLike): Promise<void> {
        step = s;
        const walk = stagesOf(s);
        for (const { stage, error } of walk) {
            monitor?.push({ kind: "stage", stage, status: error ? "error" : "start", message: error });
            lights.cue(error ? { stage, status: "error", message: error } : { stage, status: "start" });
            if (stage === "execute") {
                const summary = s.summary && typeof s.summary === "object" ? (s.summary as { value?: unknown }).value : s.summary;
                monitor?.push({ kind: "decision", capabilityId: s.capability ?? "?", input: s.input, source: s.source === "policy" ? "policy" : "fallback" });
                monitor?.push({ kind: "call", capabilityId: s.capability ?? "?", input: s.input, output: summary, outcome: s.outcome ?? "?", latencyMs: s.ms });
            }
        }
        await lights.settled();
        const sentence = stepSentence(words, s);
        const refused = s.source === "refused" || s.source === "failed" || s.reward === -1;
        monitor?.push({ kind: "outcome", outcome: s.outcome ?? s.source ?? "?", error: refused ? (s.reason ?? undefined) : undefined, reward: typeof s.reward === "number" ? s.reward : undefined });
        monitor?.push({ kind: "console", level: refused ? "refusal" : "info", message: sentence });
        if (typeof s.reward === "number") monitor?.push({ kind: "observation", values: { step: s.n ?? 0, reward: s.reward, ms: s.ms ?? 0 } });
        narrate("decision", sentence, sentence, refused ? "warn" : "info");
        log(refused ? "warn" : "info", `step ${num(s.n)}: ${sentence}`);
    }

    // ── Following the tasks ────────────────────────────────────────────────
    log("info", `words: wording ${grammar ?? "?"}, ${words.listPhrases().length} phrases`);
    const readTasks = async (): Promise<Array<{ taskId: string; state: string }>> => {
        const s = await broker.session("factory");
        const r = await s.request<{ contents: Array<{ text?: string }> }>("resources/read", { uri: TASKS_URI });
        const list = JSON.parse(r.contents[0]?.text ?? "[]") as Array<{ taskId: string; state: string }>;
        return list.filter((t) => typeof t.taskId === "string").sort((a, b) => b.taskId.localeCompare(a.taskId));
    };
    const readTask = async (taskId: string): Promise<TaskStatus | null> => {
        const r = await broker.call("factory", "task", { taskId });
        return r.ok ? (r.output as TaskStatus) : null;
    };

    let followed: string | null = null;
    let shown = 0;
    let finished = false;
    let busy = false;
    /** The tasks and their state, from the list read when the page opens and from every push since. */
    const known = new Map<string, string>();
    /** The newest answer the slot pushed for each task: a push always carries the task as it stands, so the page reads nothing back. */
    const pushed = new Map<string, TaskStatus>();
    /** Something arrived while a replay held the page: it is looked at as soon as the replay ends (`full`: read the list again). */
    let again: { full: boolean } | null = null;
    const newestTask = () => [...known.keys()].sort((a, b) => b.localeCompare(a))[0];
    /** The page has not chosen a task yet: the one it finds already ended is named, not replayed (no start on its own when the page opens). */
    let firstLook = true;

    const beginTask = (t: TaskStatus) => {
        const quiet = firstLook && !pinned && taskSel.value === "latest" && ended(t.state);
        firstLook = false;
        followed = t.taskId;
        shown = 0;
        finished = false;
        lights.clear();
        monitor?.push({ kind: "reset" });
        const m = t.manifest;
        if (quiet) {
            // Named only: the steps stay as they are on the canvas, the badge says where it ended; the list replays it on request.
            shown = (m?.steps ?? []).length;
            finished = true;
            const values = { taskId: t.taskId, state: t.state, steps: shown };
            monitor?.push({ kind: "console", level: "info", message: p("page.lastTask", values) });
            narrate("idle", p("page.lastTask", values), p("page.lastTask.now", values));
            log("info", `last task ${t.taskId} (${t.state}, ${shown} steps): not replayed; waiting for the next one`);
            return;
        }
        const outputs = (m?.signature?.outputs ?? []).map((o) => `${o.quantity}${o.unit ? ` (${o.unit})` : ""}`).join(", ");
        const values = { taskId: t.taskId, outputs: outputs || "?", topic: m?.topic ?? "?", builder: t.run?.builder ?? m?.provider?.name ?? "?", iterations: num(m?.budget?.iterations), minutes: num(m?.budget?.minutes), files: num(t.files), recipes: m?.recipes?.loaded ? p("page.recipes.loaded", { experiences: num(m.recipes.experiencesBefore) }) : p("page.recipes.none") };
        monitor?.push({ kind: "intention", id: t.taskId, description: p("page.task.description", values), guard: p("page.builderGuard"), reasoner: values.builder });
        monitor?.push({ kind: "console", level: "info", message: p("page.task.console", values) });
        narrate("task", p("page.task", values), p("page.task.now", values));
        log("info", `following task ${t.taskId} (${t.state})`);
    };

    const tick = async (full = false) => {
        if (busy) {
            again = { full: full || (again?.full ?? false) };
            return;
        }
        busy = true;
        try {
            if (full || !known.size) {
                // The list as the slot has it: the pushes missed while the stream was down are behind it, and so are the answers kept.
                pushed.clear();
                known.clear();
                for (const t of await readTasks()) known.set(t.taskId, t.state);
            }
            const tasks = [...known].map(([taskId, state]) => ({ taskId, state })).sort((a, b) => b.taskId.localeCompare(a.taskId));
            const options: Array<[string, string]> = [["latest", "latest task"], ...tasks.map((t) => [t.taskId, `${t.taskId} · ${t.state}`] as [string, string])];
            if (taskSel.options.length !== options.length) {
                const chosen = taskSel.value;
                taskSel.replaceChildren(...options.map(([value, label]) => Object.assign(document.createElement("option"), { value, textContent: label })));
                taskSel.value = options.some(([v]) => v === chosen) ? chosen : "latest";
            }
            const wanted = pinned ?? (taskSel.value !== "latest" ? taskSel.value : tasks[0]?.taskId);
            if (!wanted) {
                setStatus(p("page.noTask"), p("page.noTask.now"), true);
                return;
            }
            const t = pushed.get(wanted) ?? (await readTask(wanted));
            if (!t) return;
            status = t;
            if (followed !== t.taskId) beginTask(t);
            const steps = t.manifest?.steps ?? [];
            const builder = t.run?.builder ?? t.manifest?.provider?.name ?? "?";
            setStatus(`${t.taskId} | ${builder} | ${t.state} | ${steps.length} step(s)${t.manifest?.recipes?.replayedSteps ? `, ${t.manifest.recipes.replayedSteps} replayed` : ""}${t.manifest?.proposal?.proposalId ? ` | proposal ${t.manifest.proposal.proposalId}` : ""}`, `${t.taskId} | ${builder} | ${t.state} | ${steps.length} steps`, t.state === "failed");
            for (; shown < steps.length; shown++) {
                await showStep(steps[shown]);
                // A newer task while an old one is still being replayed: the page moves on at the next look (a failed task of twenty steps takes over a minute to replay).
                if (!pinned && taskSel.value === "latest" && shown + 1 < steps.length) {
                    const newest = newestTask();
                    if (newest && newest !== followed) return;
                }
            }
            if (ended(t.state) && !finished) {
                finished = true;
                const sentence = endSentence(words, t);
                monitor?.push({ kind: "console", level: t.state === "failed" ? "error" : "info", message: sentence });
                narrate("end", sentence, sentence, t.state === "failed" ? "error" : "info");
                log(t.state === "failed" ? "warn" : "info", sentence);
            }
        } catch (e) {
            setStatus(`${p("page.notReachable")}: ${e instanceof Error ? e.message : String(e)}`, p("page.notReachable"), true);
        } finally {
            busy = false;
            if (again) {
                const { full } = again;
                again = null;
                void tick(full);
            }
        }
    };
    taskSel.addEventListener("change", () => void tick());

    if (view().mode === "fit") {
        frame();
        setTimeout(frame, 300);
    } else {
        const first = byStage.get("observe");
        if (first) setTimeout(() => studio.centerOnNode(first, { threshold: 0, scale: view().zoom, animateMs: 0 }), 300);
    }
    monitor?.push({ kind: "console", level: "info", message: p("page.intro") });
    narrate("idle", p("page.waiting"), p("page.waiting.now"));
    await tick(true);
    // The slot says when a task changes (created, one more step, ended), with the task's answer in the notification.
    const stream = watchSlot(
        brokerUrl,
        "factory",
        (update) => {
            if (update.uri !== TASKS_URI) return;
            const t = update.meta[META_TASK] as TaskStatus | undefined;
            if (t?.taskId) {
                known.set(t.taskId, t.state);
                pushed.set(t.taskId, t);
                void tick();
            } else void tick(true);
        },
        (open) => {
            log(open ? "info" : "warn", open ? "tasks: following them as the factory pushes them" : `tasks: the push stream dropped; looking every ${slowMs / 1000} s until it is back`);
            if (open) void tick(true);
        },
    );
    setInterval(() => {
        if (!stream.open) void tick(true);
    }, slowMs);
}
