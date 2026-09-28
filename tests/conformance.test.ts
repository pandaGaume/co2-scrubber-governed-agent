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
 *   model      a topic a model builds on has its prompt, its brief, its state
 *   replay     each capability it allows is a read, or classed by the topic
 *              once: never replayed, or a replayed action (`replay.ts`)
 *   declared   each pattern it classes names a capability it allows
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
import { BASE_CAPABILITIES } from "../harness/core/base.js";
import { NEVER_REPLAYED, READ_CAPABILITIES } from "../harness/core/replay.js";
import { taskCapabilities } from "../harness/core/task-capabilities.js";
import { newProgress } from "../harness/core/workspace-observer.js";
import type { TaskFile } from "../harness/core/task.js";
import type { TopicDefinition } from "../harness/core/topic.js";

const PORT = 3146;

type Check = "base" | "tools" | "model" | "replay" | "declared";

/** The deviations known and not yet closed: topic, check, the capability or pattern, and why it stands. */
const KNOWN: Array<{ topic: string; check: Check; what: string; why: string }> = [
    // The conversions between quantities were given to the graph factory alone (2026-09-28); the socle's tools (point 1) carry them to the others.
    ...["physics.units_relations", "physics.units_relate"].map((what) => ({ topic: "procedure", check: "base" as const, what, why: "the conversions were added to the graph factory only; the socle's tools will carry them here" })),
    ...["physics.units_relations", "physics.units_relate"].map((what) => ({ topic: "code", check: "base" as const, what, why: "the conversions were added to the graph factory only; the socle's tools will carry them here" })),
    { topic: "code", check: "base", what: "web.search", why: "the web was given to the procedure and graph factories, never to the code factory; the socle's tools will carry it here" },
    // The onnx topic is the first factory, scripted only: no model builds on it, so nothing there reads the library or the units, and it has no prompt.
    ...["library.list", "library.methods", "library.search", "library.read", "library.facts"].map((what) => ({ topic: "onnx", check: "base" as const, what, why: "the onnx fit is scripted only, older than the library; the socle's tools will reach it" })),
    ...["physics.units_normalize", "physics.units_convert", "physics.units_compatible", "physics.units_validate_connection", "physics.units_relations", "physics.units_relate"].map((what) => ({ topic: "onnx", check: "base" as const, what, why: "the onnx fit is scripted only, older than the unit system; the socle's tools will reach it" })),
    { topic: "onnx", check: "model", what: "prompt", why: "the onnx fit is scripted only: no model has been asked to build on it, so it has no prompt, brief nor state" },
];

const TASK = { objective: { required_outputs: [{ name: "x", quantity: "Volume", unit: "m3" }], constraints: {} }, data: [] } as unknown as TaskFile["task"];

describe("every factory against the socle", () => {
    let local: LocalBroker;
    let slots: PublishedSlot<object>[];
    let broker: Broker;
    /** Every capability a factory's task can reach: the published tools, the task's own. */
    let published: string[] = [];

    before(async () => {
        process.env.SPEECH_PROVIDER = "silent";
        ({ broker: local, slots } = await startAllOrFail(PORT));
        broker = new Broker(local.httpBase, { name: "conformance", version: "0", locale: "en" });
        for (const slot of await broker.slots()) for (const t of await broker.tools(slot)) published.push(`${slot}.${t.name}`);
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
        const own = [...taskCapabilities(broker, context.taskId, context.progress, topic.name, TASK), ...(topic.local?.(context) ?? [])].map((c) => c.id);
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

    it("the ledger names only topics and checks that exist, and says why for each", () => {
        for (const k of KNOWN) {
            assert.ok(k.topic in TOPIC_DEFINITIONS, `KNOWN names a topic "${k.topic}" that is not a factory`);
            assert.ok(k.why.trim().length > 10, `KNOWN ${k.topic} ${k.check} ${k.what}: say why`);
        }
    });
});
