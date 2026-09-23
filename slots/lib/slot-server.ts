/**
 * A slot provider on mcp-core: the slot's tools and resources are one
 * `McpBehaviorBase`, served by `McpServerBuilder` over the broker's shared
 * tunnel (`MultiplexTransport` on `ws://<broker>/providers`, see
 * mcp-broker's docs/endpoints.md: never `/provider/<name>` with this
 * transport).
 *
 * The words are mcp-core's business (1.0.2): the grammar files of
 * `slots/<slot>/grammars/<agent>/<locale>.json` are loaded and checked by
 * `loadGrammarDirectory`, composed over `default/<locale>`, and resolved per
 * session by the demo's policy (`grammars.ts`: families, locale); the
 * server's own words (`server.description`, `server.instructions`) come from
 * the same files; `withWordingRule` refuses at start a tool or a resource
 * described in two places or in none. A slot's code declares structure. The
 * older slots still carry their English inline, which the rule accepts as
 * the one place.
 *
 * `McpGrammarBehavior` is registered too: the operator can rewrite a wording
 * for one family during a session (`grammar_set` on the key in use) and the
 * server tells connected clients to re-read (`tools/list_changed`). Those
 * tools are for the operator role; the broker's policy keeps them from
 * tier3.
 *
 * Wire shapes are kept from the first version of the slots: a completed
 * call answers `{ slot, tool, arguments, result, stub, at }`, a refusal is a
 * tool error (`isError: true`) whose text is `{ slot, tool, refused, stub }`.
 * `stub: true` marks a slot with no body behind it (the board, until the
 * ESP32-S3 publishes itself), so the trace never mistakes a rehearsal for
 * the real thing.
 */
import * as path from "node:path";
import { McpBehaviorBase, McpGrammarBehavior, McpGrammarStore, McpToolResults, grammarResolverFromOptions } from "@cyanmycelium/mcp-core";
import type { IMcpInitializer, IMcpServer, McpClientCapabilities, McpClientInfo, McpResource, McpResourceContent, McpResourceTemplate, McpServerIdentity, McpTool, McpToolResult } from "@cyanmycelium/mcp-core";
import { McpServerBuilder } from "@cyanmycelium/mcp-core/server";
import { loadGrammarDirectory, type GrammarDirectoryFile } from "@cyanmycelium/mcp-core/node";
import { MultiplexTransport } from "@cyanmycelium/mcp-broker-provider";
import { fromRoot } from "../../lib/paths.js";
import { errorMessage } from "../../lib/files.js";
import { BASELINE_KEY, DEFAULT_LOCALE, localeOfKey, resolverOptions } from "./grammars.js";

export type JsonObject = Record<string, unknown>;

export interface SlotTool<S> {
    name: string;
    /**
     * The English baseline. Written once: either here, next to the schema, or
     * in `grammars/default/en.json` (the tool's `description`, `title` and
     * `properties`), never both. A tool with neither is refused at start.
     */
    description?: string;
    title?: string;
    inputSchema: object;
    /** Computes a result from the arguments and the slot state; may mutate the state; throws to refuse. Without it, the tool echoes its arguments. */
    handle?: (args: JsonObject, state: S) => unknown | Promise<unknown>;
}

/** Binary content a resource may return instead of JSON: base64 bytes and their type (audio, an image, a model). */
export interface SlotBlob {
    kind: "blob";
    mimeType: string;
    base64: string;
}

export const isBlob = (v: unknown): v is SlotBlob => typeof v === "object" && v !== null && (v as SlotBlob).kind === "blob" && typeof (v as SlotBlob).base64 === "string";

export interface SlotResource<S> {
    /** A fixed URI, or, with `template: true`, an RFC 6570 template (`speech://utterances/{id}`): every URI under its prefix is read by `read`. */
    uri: string;
    /** Wording: here or in `grammars/default/en.json` under `resources[uri]`, never both. */
    name?: string;
    description?: string;
    template?: boolean;
    /** Announced type; JSON unless the resource returns blobs. */
    mimeType?: string;
    /** JSON (serialized here) or a `SlotBlob`; `undefined` for a template URI that names nothing. */
    read: (state: S, uri: string) => unknown;
}

export interface SlotOptions<S extends object> {
    /** Slot name on the broker. */
    slot: string;
    /** One line, shown by `_broker` and by the dashboard. Here or in `grammars/default/en.json` under `slot.description`, never both. */
    description?: string;
    /** The usage note handed to a session in `initialize.instructions`, per locale. Here or in `grammars/default/<locale>.json` under `slot.instructions`, never both for one locale. */
    instructions?: Record<string, string>;
    tools: SlotTool<S>[];
    resources?: SlotResource<S>[];
    state: S;
    /** e.g. "ws://localhost:3000" */
    wsBase: string;
    log?: (line: string) => void;
    /** true for a slot with no body behind it (the default of the first version); false for a real one. */
    stub?: boolean;
    /** serverInfo.version; defaults to "0.1.0-stub" or "0.1.0". */
    version?: string;
    /** Where the grammar files are; defaults to `slots/<slot>/grammars` under the repository. */
    grammarsDir?: string;
    /** Other behaviors served on the same slot, next to the slot's own tools: the runtime's surface (`RuntimeBehavior`), for one. */
    behaviors?: McpBehaviorBase[];
}

export interface PublishedSlot<S extends object> {
    slot: string;
    state: S;
    /** The resolver keys this slot loaded from files. */
    grammarKeys: string[];
    grammarFiles: GrammarDirectoryFile[];
    store: McpGrammarStore;
    server: IMcpServer;
    /**
     * Sends a JSON-RPC notification to the broker, which hands it to every
     * client connected to this slot (WebSocket, SSE, Streamable HTTP): how a
     * slot tells its readers that something changed instead of waiting to be
     * asked. Dropped while the slot is not open.
     */
    notify(method: string, params: Record<string, unknown>): void;
    open(): Promise<void>;
    close(): Promise<void>;
    readonly isOpen: boolean;
}

/** The slot's own tools and resources, as one behavior. */
class SlotBehavior<S extends object> extends McpBehaviorBase {
    constructor(
        private readonly slot: string,
        private readonly tools: SlotTool<S>[],
        private readonly resources: SlotResource<S>[],
        private readonly state: S,
        private readonly stub: boolean,
        private readonly log: (line: string) => void,
        description: string,
    ) {
        super({ domain: "habitat", namespace: slot, name: slot, description, mimeType: "application/json" });
    }

    override getTools(): McpTool[] {
        return this.tools.map(({ name, title, description, inputSchema }) => (title ? { name, title, description: description ?? "", inputSchema } : { name, description: description ?? "", inputSchema }));
    }

    override getResources(): McpResource[] {
        return this.resources.filter((r) => !r.template).map(({ uri, name, description, mimeType }) => ({ uri, name: name ?? uri, description: description ?? "", mimeType: mimeType ?? "application/json" }));
    }

    override getResourceTemplates(): McpResourceTemplate[] {
        return this.resources.filter((r) => r.template).map(({ uri, name, description, mimeType }) => ({ uriTemplate: uri, name: name ?? uri, description: description ?? "", mimeType: mimeType ?? "application/json" }));
    }

    override async readResourceAsync(uri: string): Promise<McpResourceContent | undefined> {
        const res = this.resources.find((r) => (r.template ? uri.startsWith(r.uri.slice(0, r.uri.indexOf("{"))) : r.uri === uri));
        if (!res) return undefined;
        const value = await res.read(this.state, uri);
        if (value === undefined) return undefined;
        if (isBlob(value)) return { uri, mimeType: value.mimeType, blob: value.base64 };
        return { uri, mimeType: "application/json", text: JSON.stringify(value) };
    }

    override async executeToolAsync(_uri: string, toolName: string, args: Record<string, unknown>): Promise<McpToolResult> {
        const tool = this.tools.find((t) => t.name === toolName);
        if (!tool) return McpToolResults.error(`unknown tool "${toolName}" on slot "${this.slot}"`);
        const { slot, stub } = this;
        let result: unknown;
        try {
            result = tool.handle ? await tool.handle(args ?? {}, this.state) : { echo: args };
        } catch (e) {
            const refused = errorMessage(e);
            this.log(`[${slot}] ${toolName} refused: ${refused}`);
            return { isError: true, content: [{ type: "text", text: JSON.stringify({ slot, tool: toolName, refused, stub }) }] };
        }
        this.log(`[${slot}] ${toolName} ${JSON.stringify(args ?? {})}`);
        return McpToolResults.json({ slot, tool: toolName, arguments: args ?? {}, result, stub, at: new Date().toISOString() });
    }
}

/**
 * Answers `initialize` with the slot's identity. The usage note is given
 * here only when the slot carries one inline (the older slots); otherwise
 * it is left to mcp-core, which takes it from the session grammar's
 * `server.instructions`, as it takes the description and puts the matched
 * key in `_meta.grammar`.
 */
class SlotInitializer implements IMcpInitializer {
    private readonly resolve = grammarResolverFromOptions(resolverOptions());

    constructor(
        private readonly slot: string,
        private readonly version: string,
        private readonly description: string | undefined,
        private readonly instructions: Record<string, string>,
        private readonly hasGrammar: (key: string) => boolean,
        private readonly log: (line: string) => void,
    ) {}

    /** The key the server will pick: the first candidate of the chain some layer holds. */
    resolvedKey(clientInfo: McpClientInfo, capabilities?: McpClientCapabilities): { chain: string[]; key: string | undefined } {
        const raw = this.resolve(clientInfo, capabilities);
        const chain = !raw ? [] : typeof raw === "string" ? [raw] : [...raw];
        return { chain, key: chain.find((k) => this.hasGrammar(k)) };
    }

    initialize(clientInfo: McpClientInfo, capabilities: McpClientCapabilities): McpServerIdentity {
        const { key } = this.resolvedKey(clientInfo, capabilities);
        const locale = (key && localeOfKey(key)) ?? DEFAULT_LOCALE;
        const language = locale.split("-")[0];
        const note = this.instructions[locale] ?? this.instructions[language] ?? this.instructions[DEFAULT_LOCALE];
        this.log(`[${this.slot}] session for ${clientInfo.name ?? "unknown"} ${clientInfo.version ?? ""}: grammar ${key ?? "none (inline descriptions)"}`);
        const serverInfo = { name: this.slot, version: this.version, ...(this.description ? { description: this.description } : {}) } as McpServerIdentity["serverInfo"];
        return note ? { serverInfo, instructions: note } : { serverInfo };
    }
}

export function publishSlot<S extends object>(options: SlotOptions<S>): PublishedSlot<S> {
    const { slot, tools, resources = [], state, wsBase, stub = true } = options;
    const log = options.log ?? console.log;
    const version = options.version ?? (stub ? "0.1.0-stub" : "0.1.0");
    const grammarsDir = options.grammarsDir ?? fromRoot("slots", slot, "grammars");

    // The words: the grammar files, checked against this slot's tools and resources, composed over the default.
    const surfaceTools: McpTool[] = tools.map(({ name, title, description, inputSchema }) => ({ name, ...(title ? { title } : {}), description: description ?? "", inputSchema }));
    const surfaceResources = [...resources.map((r) => ({ uri: r.uri })), { uri: `${slot}://grammars` }];
    // The words, and since mcp-core 1.2.0 the phrases a page or a voice reads (`grammar://phrases`): every locale carries the English keys and holes (a slot with no phrase is not asked for the English file).
    const loaded = loadGrammarDirectory(grammarsDir, { surface: { tools: surfaceTools, resources: surfaceResources }, referenceLocale: DEFAULT_LOCALE });
    const baseline = loaded.grammars.get(BASELINE_KEY);
    const description = options.description ?? baseline?.getServerDescription();
    if (options.description && baseline?.getServerDescription()) throw new Error(`[${slot}] the slot is described both inline and in grammars/default/en.json: keep one`);
    if (!description) throw new Error(`[${slot}] no description: write it inline or in grammars/default/en.json under server.description`);
    const store = new McpGrammarStore();
    const hasGrammar = (key: string) => loaded.grammars.has(key) || store.has(key);
    const behavior = new SlotBehavior(slot, tools, resources, state, stub, log, description);

    // The audit resource: which wordings this slot holds and where they came from.
    resources.push({
        uri: `${slot}://grammars`,
        name: "Grammars",
        description: "The grammar files this slot loaded (resolver key, file, sha256) and the keys edited at runtime",
        read: () => ({ files: loaded.files.map((f) => ({ key: f.key, file: path.relative(fromRoot(), f.file).split(path.sep).join("/"), sha256: f.sha256 })), runtime: store.list() }),
    });

    let server: IMcpServer;
    const transport = MultiplexTransport.create(slot, `${wsBase}/providers`, { aggregate: true });
    try {
        server = new McpServerBuilder()
        .withName(slot)
        .withInitializer(new SlotInitializer(slot, version, options.description, options.instructions ?? {}, hasGrammar, log))
        .withTransport(transport)
        .withGrammarResolver(resolverOptions())
        .withGrammarStore(store)
        .withGrammars(loaded.grammars)
        .withWordingRule(BASELINE_KEY)
        .register(behavior, new McpGrammarBehavior(store, { domain: "habitat", namespace: `${slot}-grammar`, name: `${slot} grammars` }), ...(options.behaviors ?? []))
        .build();
    } catch (e) {
        // Named, so a start that fails says which slot and what to write where, instead of a stack in a hook.
        throw new Error(`slot "${slot}" cannot be published: ${errorMessage(e)} (its words: ${path.relative(fromRoot(), grammarsDir).split(path.sep).join("/")}/default/en.json)`);
    }

    const keys = [...loaded.grammars.keys()].sort();
    log(`[${slot}] grammars: ${keys.length ? keys.join(", ") : "none (inline English only)"}`);

    return {
        slot,
        state,
        grammarKeys: keys,
        grammarFiles: loaded.files,
        store,
        server,
        notify(method, params) {
            if (transport.isOpen) transport.send(JSON.stringify({ jsonrpc: "2.0", method, params }));
        },
        async open() {
            await server.start();
            log(`[${slot}] published on ${wsBase}/providers`);
        },
        async close() {
            await server.stop();
        },
        get isOpen() {
            return server.isRunning;
        },
    };
}

/** A JSON schema for an object with the given properties, nothing else. */
export const objectSchema = (properties: Record<string, unknown>, required: string[] = []): object => ({ type: "object", properties, required, additionalProperties: false });
