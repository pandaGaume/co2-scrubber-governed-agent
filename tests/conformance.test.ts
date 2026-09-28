/**
 * Every factory against the socle (2026-09-28): what we kept checking by
 * hand each time a rule was added to one factory and forgotten in another
 * (the conversions between quantities, the web, the replays), checked here
 * for every topic of `TOPIC_DEFINITIONS`, through the broker the factories
 * use:
 *
 *   base       the topic reaches every capability of the socle (`base.ts`)
 *   tools      each of its tool patterns names a capability that exists (a
 *              published tool, a task's own, the topic's own)
 *   model      a topic a model builds on has its prompt, its brief, its state,
 *              and the prompt it reads (the topic's, then the socle's) names
 *              every capability it may call, and says each of the socle's
 *              rules once: the topic's own prompt does not say them again
 *   replay     each capability it allows is a read, or classed by the topic
 *              once: never replayed, or a replayed action (`replay.ts`)
 *   declared   each pattern it classes names a capability it allows
 *   justify    it says where its constants are (`justify.ts`), on a call it
 *              allows, and that call accepts their justifications
 *   script     it has its script (`stand-ins/builders/index.ts`), on the
 *              scripts' base, on the reasoning state as the models are
 *   words      what it says to a model is its spec's (2026-09-28, zero domain
 *              in the harness): its prompt under specs/, its words file
 *              holding every template the topic asks for
 *
 * A deviation known and not yet closed is in KNOWN, with why. A new one
 * fails; one that is closed fails too until it leaves KNOWN, so the ledger
 * says what is true.
 *
 *     node --test dist/tests/conformance.test.js
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import type { LocalBroker } from "../slots/lib/local-broker.js";
import type { PublishedSlot } from "../slots/lib/slot-server.js";
import { startAllOrFail } from "./lib/start.js";
import { Broker } from "../harness/lib/broker.js";
import { fromRoot } from "../lib/paths.js";
import { TOPIC_DEFINITIONS } from "../harness/core/runner.js";
import { BASE_CAPABILITIES, promptWithSocle } from "../harness/core/base.js";
import { SOCLE_RULES } from "../harness/core/brief.js";
import { NEVER_REPLAYED, READ_CAPABILITIES } from "../harness/core/replay.js";
import { JUSTIFICATIONS_SCHEMA } from "../harness/core/justify.js";
import { taskCapabilities } from "../harness/core/task-capabilities.js";
import { newProgress } from "../harness/core/workspace-observer.js";
import type { TaskFile } from "../harness/core/task.js";
import type { TopicDefinition } from "../harness/core/topic.js";
import { SCRIPTED_BUILDERS } from "../stand-ins/builders/index.js";
import { ScriptedBuilderBase } from "../harness/core/scripted-base.js";
import { missingWords } from "../harness/core/words.js";
import { noteRefusal } from "../harness/core/problems.js";
import { briefWithNotes } from "../harness/core/workspace-observer.js";
import { reasoningStateOf } from "../harness/core/reasoning-state.js";
import type { JsonValue } from "@spiky-panda/harness";

const PORT = 3146;

type Check = "base" | "tools" | "model" | "replay" | "declared" | "justify" | "script" | "words";

/** The deviations known and not yet closed: topic, check, the capability or pattern, and why it stands. */
const KNOWN: Array<{ topic: string; check: Check; what: string; why: string }> = [];

const TASK = { objective: { required_outputs: [{ name: "x", quantity: "Volume", unit: "m3" }], constraints: {} }, data: [] } as unknown as TaskFile["task"];

describe("every factory against the socle", () => {
    let local: LocalBroker;
    let slots: PublishedSlot<object>[];
    let broker: Broker;
    /** Every capability a factory's task can reach: the published tools, the task's own. */
    let published: string[] = [];
    /** The input schema of every published tool, by id. */
    const schemas = new Map<string, unknown>();

    before(async () => {
        process.env.SPEECH_PROVIDER = "silent";
        ({ broker: local, slots } = await startAllOrFail(PORT));
        broker = new Broker(local.httpBase, { name: "conformance", version: "0", locale: "en" });
        for (const slot of await broker.slots())
            for (const t of await broker.tools(slot)) {
                published.push(`${slot}.${t.name}`);
                schemas.set(`${slot}.${t.name}`, t.inputSchema);
            }
        published = [...new Set(published)].sort();
    });
    after(async () => {
        delete process.env.SPEECH_PROVIDER;
        await broker?.close();
        for (const s of slots ?? []) await s.close().catch(() => undefined);
        await local?.stop();
    });

    /** The deviations of one topic, as `check|what`. */
    const deviations = (topic: TopicDefinition): string[] => {
        const found: string[] = [];
        const context = { broker, taskId: "t-conformance", task: TASK, progress: newProgress(), runtimeSlot: "twin" };
        const locals = [...taskCapabilities(broker, context.taskId, context.progress, topic.name, TASK), ...(topic.local?.(context) ?? [])];
        const own = locals.map((c) => c.id);
        const schemaOf = (id: string) => (locals.find((c) => c.id === id)?.inputSchema ?? schemas.get(id)) as { properties?: Record<string, unknown> } | undefined;
        const reachable = [...new Set([...published, ...own])];
        const allows = (id: string) => topic.tools.some((r) => r.test(id));
        const allowed = reachable.filter(allows);

        for (const id of BASE_CAPABILITIES) if (!allows(id)) found.push(`base|${id}`);
        for (const r of topic.tools) if (!reachable.some((id) => r.test(id))) found.push(`tools|${String(r)}`);
        if (!topic.prompt) found.push("model|prompt");
        else {
            if (!existsSync(fromRoot(topic.prompt)) || !readFileSync(fromRoot(topic.prompt), "utf8").trim()) found.push(`model|${topic.prompt}`);
            if (!topic.brief) found.push("model|brief");
            if (!topic.state) found.push("model|state");
            const text = existsSync(fromRoot(topic.prompt)) ? promptWithSocle(readFileSync(fromRoot(topic.prompt), "utf8")) : "";
            for (const id of allowed) if (!own.includes(id) || id.startsWith("task.")) if (!text.includes(`\`${id}\``)) found.push(`model|unnamed ${id}`);
            for (const rule of SOCLE_RULES) if (text.split(rule).length - 1 !== 1) found.push(`model|says "${rule}" ${text.split(rule).length - 1} times`);
        }
        const never = [...NEVER_REPLAYED, ...(topic.neverReplayed ?? [])];
        const replayed = topic.replayedActions ?? [];
        for (const id of allowed) {
            if (READ_CAPABILITIES.some((r) => r.test(id))) continue;
            const n = never.some((r) => r.test(id));
            const a = replayed.some((r) => r.test(id));
            if (n === a) found.push(`replay|${id}`);
        }
        for (const r of [...(topic.neverReplayed ?? []), ...replayed]) if (!allowed.some((id) => r.test(id))) found.push(`declared|${String(r)}`);
        if (!topic.justified) found.push("justify|none");
        else {
            const carriers = allowed.filter((id) => topic.justified!.capability.test(id));
            if (!carriers.length) found.push(`justify|${String(topic.justified.capability)}`);
            // The socle's schema, whatever the words each slot gives it (2026-09-28: the procedure's own schema refused the [min, max] the socle allows).
            const shape = (v: unknown): string => JSON.stringify(v, (k, x) => (k === "description" ? undefined : x));
            for (const id of carriers) {
                const given = schemaOf(id)?.properties?.justifications;
                if (!given) found.push(`justify|${id} takes no justifications`);
                else if (shape(given) !== shape(JUSTIFICATIONS_SCHEMA)) found.push(`justify|${id} takes justifications of another shape than the socle's`);
            }
        }
        if (topic.prompt && !/^specs\/[a-z0-9-]+\/prompt\.md$/.test(topic.prompt)) found.push(`words|prompt ${topic.prompt}`);
        if (!topic.words) found.push("words|none");
        else for (const key of missingWords(topic.words.words, topic.words.keys)) found.push(`words|missing ${key}`);
        const script = SCRIPTED_BUILDERS[topic.name]?.({ taskId: context.taskId, task: TASK, topic: topic.name, lastCall: () => null, read: () => null });
        if (!script) found.push("script|none");
        else if (!(script instanceof ScriptedBuilderBase) || script.contextMode !== "state" || script.name !== `scripted:${topic.name}`) found.push(`script|${script.name}`);
        return found.sort();
    };

    for (const [name, topic] of Object.entries(TOPIC_DEFINITIONS)) {
        it(`the ${name} factory: its deviations from the socle are the known ones, each with why`, () => {
            const found = deviations(topic!);
            const known = KNOWN.filter((k) => k.topic === name).map((k) => `${k.check}|${k.what}`).sort();
            const fresh = found.filter((f) => !known.includes(f));
            const closed = known.filter((k) => !found.includes(k));
            assert.deepEqual(fresh, [], `the ${name} factory departs from the socle: ${fresh.join("; ")} (bring it back, or say why in KNOWN)`);
            assert.deepEqual(closed, [], `the ${name} factory no longer departs on: ${closed.join("; ")} (take it out of KNOWN)`);
        });
    }

    // A refusal of any factory's guard, whatever it says, is in the next prompt (2026-09-28: the reinjection had been written refusal
    // kind by refusal kind, and a kind it did not know looped nineteen times with the same text): the brief opens on its problems,
    // and the state holds them with their points. When the guard lets an empty call through, the schema's refusal stands for it.
    for (const [name, topic] of Object.entries(TOPIC_DEFINITIONS)) {
        it(`the ${name} factory: a refusal of its guard is in the next prompt, whatever it says`, async () => {
            const progress = newProgress();
            const context = { broker, taskId: "t-conformance", task: TASK, progress, runtimeSlot: "twin" };
            const locals = [...taskCapabilities(broker, context.taskId, progress, topic!.name, TASK), ...(topic!.local?.(context) ?? [])];
            const capability = locals.map((c) => c.id).find((id) => topic!.justified?.capability.test(id)) ?? locals.find((c) => !c.id.startsWith("task."))?.id ?? "task.plan";
            const said = topic!.guard ? await topic!.guard(capability, {} as JsonValue, context) : [];
            const reason = said.length ? said.join("; ") : `Invalid capability arguments: data/label must be string`;
            progress.lastRefusal = { capability, reason, input: {} as JsonValue };
            const streak = noteRefusal(progress, capability, reason);
            assert.ok(streak.problems.length > 0, `${name}: the refusal "${reason.slice(0, 120)}" gives no problem`);
            const brief = briefWithNotes(progress, topic!.brief ? topic!.brief(progress, TASK) : "");
            assert.ok(brief.startsWith(`Your last ${capability} was refused, on ${streak.problems.length} point(s):`), `${name}: the brief does not open on the refusal: ${brief.slice(0, 200)}`);
            // The first ten said whole, the rest counted.
            for (const p of streak.problems.slice(0, 10)) assert.ok(brief.includes(p.says.slice(0, 80)), `${name}: the brief does not say "${p.says.slice(0, 80)}"`);
            if (streak.problems.length > 10) assert.ok(brief.includes(`And ${streak.problems.length - 10} more.`), `${name}: the brief does not count the problems it does not show`);
            const state = reasoningStateOf({ task: TASK, progress, budget: { iterations: 10, minutes: 5 }, nextActions: [], shelf: [], telemetry: null });
            assert.equal((state.lastRefusal as { problems?: unknown[] } | null)?.problems?.length, streak.problems.length, `${name}: the state does not hold the refusal's problems`);
        });
    }

    it("the ledger names only topics and checks that exist, and says why for each", () => {
        for (const k of KNOWN) {
            assert.ok(k.topic in TOPIC_DEFINITIONS, `KNOWN names a topic "${k.topic}" that is not a factory`);
            assert.ok(k.why.trim().length > 10, `KNOWN ${k.topic} ${k.check} ${k.what}: say why`);
        }
    });
});
