/**
 * The grammars, through the broker: the same tools, described per audience
 * and per language. A broker and the four slots are started on a port of
 * their own; a session is opened on each slot for each family and locale
 * and the descriptions received are compared to the grammar files; then an
 * operator rewrites one wording at runtime (`grammar_set`) and the agent's
 * next `tools/list` carries it.
 *
 *     node --test dist/tests/
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { fromRoot } from "../lib/paths.js";
import type { LocalBroker } from "../slots/lib/local-broker.js";
import { startAllOrFail } from "./lib/start.js";
import type { PublishedSlot } from "../slots/lib/slot-server.js";
import { connectMcp, grammarOf, toolText, type McpSession } from "../harness/lib/mcp-http.js";

const PORT = 3107;
const quiet = () => undefined;

interface GrammarFileJson {
    tools?: Record<string, { title?: string; description?: string; properties?: Record<string, string> }>;
}
const grammarFile = (slot: string, agent: string, locale: string): GrammarFileJson => JSON.parse(readFileSync(fromRoot("slots", slot, "grammars", agent, `${locale}.json`), "utf8")) as GrammarFileJson;

function propertyDescription(schema: unknown, dotted: string): string | undefined {
    let node = schema as { properties?: Record<string, unknown>; items?: unknown } | undefined;
    const parts = dotted.split(".");
    for (const [i, key] of parts.entries()) {
        const props = node?.properties ?? (node?.items as { properties?: Record<string, unknown> } | undefined)?.properties;
        const next = props?.[key] as { description?: string; properties?: Record<string, unknown>; items?: unknown } | undefined;
        if (!next) return undefined;
        if (i === parts.length - 1) return next.description;
        node = next;
    }
    return undefined;
}

describe("slot grammars through the broker", () => {
    let broker: LocalBroker;
    let slots: PublishedSlot<object>[];
    const open: McpSession[] = [];
    const session = async (slot: string, name: string, locale?: string) => {
        const s = await connectMcp(broker.httpBase, slot, { name, version: "0", locale });
        open.push(s);
        return s;
    };

    before(async () => {
        ({ broker, slots } = await startAllOrFail(PORT));
    });
    after(async () => {
        for (const s of open) await s.close();
        for (const s of slots) await s.close().catch(quiet);
        broker.stop();
    });

    it("every habitat slot loaded the same five families in English and the French default; the workshop tools carry the English and French defaults", () => {
        const workshop = ["workspace", "model"];
        // `reasoner` and `agent` carry no per-family wording, and should not:
        // the families exist so a model reads a tool's description in its own
        // dialect, and neither of these is a tool any model may call. Both are
        // excluded from the agent's catalogue (`tier3/lib/capabilities.ts`),
        // so a wording for them would be a file nothing ever reads.
        const notTools = ["reasoner", "agent", "scenario", "qr"];
        for (const s of slots.filter((s) => !notTools.includes(s.slot) && !workshop.includes(s.slot))) {
            for (const key of ["nemotron:en", "gpt:en", "claude:en", "gemini:en", "default:fr"]) assert.ok(s.grammarKeys.includes(key), `${s.slot} lacks ${key}`);
        }
        for (const s of slots.filter((s) => workshop.includes(s.slot))) {
            for (const key of ["default:en", "default:fr"]) assert.ok(s.grammarKeys.includes(key), `${s.slot} lacks ${key}`);
        }
    });

    for (const [name, locale, agent, fileLocale] of [
        ["nemotron-nano-3", "en", "nemotron", "en"],
        ["gpt-5", "en", "gpt", "en"],
        ["claude-sonnet", "en", "claude", "en"],
        ["gemini-2.5-pro", undefined, "gemini", "en"],
        ["mistral-large", "fr", "default", "fr"],
    ] as const) {
        it(`${name} (${locale ?? "no locale"}) gets ${agent}:${fileLocale} on every slot, with the file's wording`, async () => {
            for (const slot of ["scrubber", "twin", "station", "factory"]) {
                const s = await session(slot, name, locale);
                assert.equal(grammarOf(s), `${agent}:${fileLocale}`, `${slot}: ${s.instructions}`);
                const tools = await s.listTools();
                const file = grammarFile(slot, agent, fileLocale);
                for (const [toolName, entry] of Object.entries(file.tools ?? {})) {
                    const tool = tools.find((t) => t.name === toolName);
                    assert.ok(tool, `${slot}: tool ${toolName} named by the file is missing`);
                    if (entry.description) assert.equal(tool.description, entry.description, `${slot}.${toolName} description`);
                    if (entry.title) assert.equal(tool.title, entry.title, `${slot}.${toolName} title`);
                    for (const [prop, text] of Object.entries(entry.properties ?? {})) assert.equal(propertyDescription(tool.inputSchema, prop), text, `${slot}.${toolName}.${prop}`);
                }
            }
        });
    }

    it("an agent file sits on the French default: claude in fr-CA gets claude:fr with the default's untouched entries", async () => {
        const s = await session("twin", "claude-opus", "fr-CA");
        assert.equal(grammarOf(s), "claude:fr");
        const tools = await s.listTools();
        const claudeFr = grammarFile("twin", "claude", "fr");
        const defaultFr = grammarFile("twin", "default", "fr");
        assert.equal(tools.find((t) => t.name === "time_to_critical")?.description, claudeFr.tools?.time_to_critical?.description);
        assert.equal(tools.find((t) => t.name === "sweep")?.description, defaultFr.tools?.sweep?.description);
        assert.ok(s.instructions?.startsWith("Le jumeau"), "the usage note is in French");
    });

    it("an unknown client in English gets the inline descriptions and no grammar", async () => {
        const s = await session("scrubber", "curl", undefined);
        assert.equal(grammarOf(s), null);
        const tools = await s.listTools();
        assert.equal(tools.find((t) => t.name === "motor.set_speed")?.description, "Set the speed command, in percent of full speed. Refused outside [0, 100], and below the minimum flow while CO2 is not NOMINAL.");
    });

    it("the operator rewrites one wording at runtime and the agent's next tools/list carries it", async () => {
        // The operator's session opens first: mcp-core keeps one session grammar per server, resolved at the last initialize.
        const operator = await session("twin", "operator-console", "en");
        const agent = await session("twin", "nemotron-nano-3", "en");
        assert.equal(grammarOf(agent), "nemotron:en");
        const before = (await agent.listTools()).find((t) => t.name === "sweep")?.description;
        const set = await operator.callTool("grammar_set", { uri: "habitat://twin-grammar", profileId: "nemotron:en", data: { sweep: { description: "Operating map, rewritten live for Nemotron." } } });
        assert.ok(!set.isError, `grammar_set refused: ${toolText(set)}`);
        const after = (await agent.listTools()).find((t) => t.name === "sweep")?.description;
        assert.notEqual(after, before);
        assert.equal(after, "Operating map, rewritten live for Nemotron.");
        // The audit resource lists the runtime key next to the files.
        const audit = await operator.request<{ contents: Array<{ text: string }> }>("resources/read", { uri: "twin://grammars" });
        const listed = JSON.parse(audit.contents[0].text) as { files: Array<{ key: string; file: string; sha256: string }>; runtime: string[] };
        assert.ok(listed.runtime.includes("nemotron:en"));
        assert.ok(listed.files.some((f) => f.key === "nemotron:en" && f.file === path.posix.join("slots", "twin", "grammars", "nemotron", "en.json") && /^[0-9a-f]{64}$/.test(f.sha256)));
    });
});
