// node_modules/@cyanmycelium/mcp-core/dist/index.js
var JsonRpcMimeType = "application/json";
var GRAMMAR_PHRASES_URI = "grammar://phrases";
var HOLE = /\{([a-zA-Z0-9_.-]+)\}/g;
function phraseHoles(template) {
  return [...new Set([...template.matchAll(HOLE)].map((m) => m[1]))].sort();
}
function fillPhrase(template, values = {}) {
  return template.replace(HOLE, (_, name) => name in values && values[name] !== void 0 ? String(values[name]) : "?");
}
var McpGrammar = class _McpGrammar {
  // ── Construction ─────────────────────────────────────────────────────────
  constructor(data) {
    this._server = {};
    this._tools = /* @__PURE__ */ new Map();
    this._resources = /* @__PURE__ */ new Map();
    this._templates = /* @__PURE__ */ new Map();
    this._phrases = /* @__PURE__ */ new Map();
    if (!data) return;
    if (_McpGrammar._isModernShape(data)) {
      const m = data;
      if (m.server) this._server = { ...m.server };
      if (m.tools) {
        for (const [k, v] of Object.entries(m.tools)) this._tools.set(k, _McpGrammar._cloneToolEntry(v));
      }
      if (m.resources) {
        for (const [k, v] of Object.entries(m.resources)) this._resources.set(k, _McpGrammar._cloneResourceEntry(v));
      }
      if (m.templates) {
        for (const [k, v] of Object.entries(m.templates)) this._templates.set(k, _McpGrammar._cloneTemplateEntry(v));
      }
      if (m.phrases) {
        for (const [k, v] of Object.entries(m.phrases)) if (typeof v === "string") this._phrases.set(k, v);
      }
    } else {
      for (const [k, v] of Object.entries(data)) {
        this._tools.set(k, _McpGrammar._cloneToolEntry(v));
      }
    }
  }
  static _isModernShape(data) {
    const d = data;
    return typeof d.server === "object" && d.server !== null || typeof d.tools === "object" && d.tools !== null || typeof d.resources === "object" && d.resources !== null || typeof d.templates === "object" && d.templates !== null || typeof d.phrases === "object" && d.phrases !== null;
  }
  // ── Phrases ──────────────────────────────────────────────────────────────
  /** The phrase under a key, its holes unfilled; `undefined` when the grammar has none. */
  getPhrase(key) {
    return this._phrases.get(key);
  }
  setPhrase(key, template) {
    this._phrases.set(key, template);
  }
  /** The keys of every phrase this grammar carries, in insertion order. */
  listPhrases() {
    return [...this._phrases.keys()];
  }
  /** True when the grammar carries at least one phrase. */
  hasPhrases() {
    return this._phrases.size > 0;
  }
  /** The phrases as plain data, for a resource or a file. */
  getPhrases() {
    return Object.fromEntries(this._phrases);
  }
  /**
   * A phrase filled with `values`. A key the grammar lacks comes back as
   * the key itself, so a missing sentence is seen where it should have
   * been read; a hole with no value reads `?`, never an invented value.
   */
  phrase(key, values = {}) {
    const template = this._phrases.get(key);
    return template === void 0 ? key : fillPhrase(template, values);
  }
  /**
   * How `other`'s phrases differ from this grammar's, taken as the
   * reference wording: a key this grammar has that `other` lacks, a key
   * `other` has that this grammar lacks, a phrase whose holes differ. Two
   * locale files of one server should differ in nothing here.
   */
  comparePhrases(other, options = {}) {
    const problems = [];
    for (const [key, template] of this._phrases) {
      const theirs = other._phrases.get(key);
      if (theirs === void 0) {
        if (!options.subset) problems.push({ kind: "phrase", name: key, message: `phrase "${key}" is missing` });
        continue;
      }
      const mine = phraseHoles(template).join(",");
      const holes = phraseHoles(theirs).join(",");
      if (mine !== holes) problems.push({ kind: "phrase", name: key, message: `phrase "${key}" names the holes {${holes}} where the reference names {${mine}}` });
    }
    for (const key of other._phrases.keys())
      if (!this._phrases.has(key)) problems.push({ kind: "phrase", name: key, message: `phrase "${key}" is not in the reference wording` });
    return problems;
  }
  // ── Server words ─────────────────────────────────────────────────────────
  /** The one-line description of the server in this wording, if the grammar carries one. */
  getServerDescription() {
    return this._server.description;
  }
  setServerDescription(description) {
    this._server.description = description;
  }
  /** The usage note a session receives in `initialize.instructions`, in this wording, if the grammar carries one. */
  getServerInstructions() {
    return this._server.instructions;
  }
  setServerInstructions(instructions) {
    this._server.instructions = instructions;
  }
  // ── Check against a surface ──────────────────────────────────────────────
  /**
   * What this grammar names that the given surface does not have: a tool,
   * a property (dotted for nested objects and array items, as
   * `properties` keys are written), a resource URI, a template. A grammar
   * with no problem describes only things that exist; the server applies
   * it without surprise.
   */
  check(surface) {
    const problems = [];
    if (surface.phrases) {
      const keys = new Set(surface.phrases);
      for (const key of this._phrases.keys()) if (!keys.has(key)) problems.push({ kind: "phrase", name: key, message: `phrase "${key}" is not one the host reads` });
    }
    const tools = new Map((surface.tools ?? []).map((t) => [t.name, t]));
    for (const [name, entry] of this._tools) {
      const tool = tools.get(name);
      if (!tool) {
        problems.push({ kind: "tool", name, message: `tool "${name}" does not exist on this surface` });
        continue;
      }
      const paths = new Set(_McpGrammar._schemaPaths(tool.inputSchema));
      for (const prop of Object.keys(entry.properties ?? {})) {
        if (!paths.has(prop))
          problems.push({
            kind: "property",
            name: `${name}.${prop}`,
            message: `tool "${name}" has no property "${prop}" (properties: ${[...paths].join(", ") || "none"})`
          });
      }
    }
    if (surface.resources) {
      const uris = new Set(surface.resources.map((r) => r.uri));
      for (const uri of this._resources.keys())
        if (!uris.has(uri)) problems.push({ kind: "resource", name: uri, message: `resource "${uri}" does not exist on this surface` });
    }
    if (surface.templates) {
      const uris = new Set(surface.templates.map((t) => t.uriTemplate));
      for (const uri of this._templates.keys())
        if (!uris.has(uri)) problems.push({ kind: "template", name: uri, message: `template "${uri}" does not exist on this surface` });
    }
    return problems;
  }
  /** The property names a schema declares, dotted for nested objects and array items. */
  static _schemaPaths(schema, prefix = "") {
    const props = schema?.properties;
    if (!props) return [];
    const out = [];
    for (const [name, sub] of Object.entries(props)) {
      out.push(`${prefix}${name}`);
      out.push(..._McpGrammar._schemaPaths(sub, `${prefix}${name}.`));
      const items = sub?.items;
      if (items) out.push(..._McpGrammar._schemaPaths(items, `${prefix}${name}.`));
    }
    return out;
  }
  // ── Tool title / description ─────────────────────────────────────────────
  getToolTitle(toolName) {
    return this._tools.get(toolName)?.title;
  }
  setToolTitle(toolName, title) {
    const entry = this._ensureToolEntry(toolName);
    entry.title = title;
  }
  getToolDescription(toolName) {
    return this._tools.get(toolName)?.description;
  }
  setToolDescription(toolName, description) {
    const entry = this._ensureToolEntry(toolName);
    entry.description = description;
  }
  // ── Tool property description ────────────────────────────────────────────
  getPropertyDescription(toolName, propertyName) {
    return this._tools.get(toolName)?.properties?.[propertyName];
  }
  setPropertyDescription(toolName, propertyName, description) {
    const entry = this._ensureToolEntry(toolName);
    if (!entry.properties) entry.properties = {};
    entry.properties[propertyName] = description;
  }
  // ── Resource name / title / description ──────────────────────────────────
  getResourceName(uri) {
    return this._resources.get(uri)?.name;
  }
  setResourceName(uri, name) {
    const entry = this._ensureResourceEntry(uri);
    entry.name = name;
  }
  getResourceTitle(uri) {
    return this._resources.get(uri)?.title;
  }
  setResourceTitle(uri, title) {
    const entry = this._ensureResourceEntry(uri);
    entry.title = title;
  }
  getResourceDescription(uri) {
    return this._resources.get(uri)?.description;
  }
  setResourceDescription(uri, description) {
    const entry = this._ensureResourceEntry(uri);
    entry.description = description;
  }
  // ── Resource template name / title / description ─────────────────────────
  getResourceTemplateName(uriTemplate) {
    return this._templates.get(uriTemplate)?.name;
  }
  setResourceTemplateName(uriTemplate, name) {
    const entry = this._ensureTemplateEntry(uriTemplate);
    entry.name = name;
  }
  getResourceTemplateTitle(uriTemplate) {
    return this._templates.get(uriTemplate)?.title;
  }
  setResourceTemplateTitle(uriTemplate, title) {
    const entry = this._ensureTemplateEntry(uriTemplate);
    entry.title = title;
  }
  getResourceTemplateDescription(uriTemplate) {
    return this._templates.get(uriTemplate)?.description;
  }
  setResourceTemplateDescription(uriTemplate, description) {
    const entry = this._ensureTemplateEntry(uriTemplate);
    entry.description = description;
  }
  // ── Serialisation ────────────────────────────────────────────────────────
  /** Returns a plain JSON-safe snapshot of this grammar in the modern shape. */
  toJSON() {
    const out = {};
    if (this._server.description !== void 0 || this._server.instructions !== void 0) out.server = { ...this._server };
    if (this._tools.size > 0) {
      out.tools = {};
      for (const [k, v] of this._tools) out.tools[k] = _McpGrammar._cloneToolEntry(v);
    }
    if (this._resources.size > 0) {
      out.resources = {};
      for (const [k, v] of this._resources) out.resources[k] = _McpGrammar._cloneResourceEntry(v);
    }
    if (this._templates.size > 0) {
      out.templates = {};
      for (const [k, v] of this._templates) out.templates[k] = _McpGrammar._cloneTemplateEntry(v);
    }
    if (this._phrases.size > 0) out.phrases = Object.fromEntries(this._phrases);
    return out;
  }
  /**
   * Constructs a grammar from a plain JSON object. Accepts both the modern
   * shape (`{ tools, resources, templates }`) and the legacy tools-only flat
   * shape (`{ "<toolName>": { description, properties } }`).
   */
  static fromJSON(data) {
    return new _McpGrammar(data);
  }
  // ── Merge ────────────────────────────────────────────────────────────────
  /**
   * Creates a new grammar by overlaying entries from left to right.
   * Later grammars win. `undefined` entries in a later grammar do NOT erase
   * entries from earlier grammars, only explicit strings override.
   */
  static merge(...grammars) {
    const result = new _McpGrammar();
    for (const g of grammars) {
      if (!g) continue;
      if (g._server.description !== void 0) result._server.description = g._server.description;
      if (g._server.instructions !== void 0) result._server.instructions = g._server.instructions;
      for (const [toolName, src] of g._tools) {
        const dest = result._ensureToolEntry(toolName);
        if (src.title !== void 0) dest.title = src.title;
        if (src.description !== void 0) dest.description = src.description;
        if (src.properties) {
          if (!dest.properties) dest.properties = {};
          for (const [prop, desc] of Object.entries(src.properties)) {
            dest.properties[prop] = desc;
          }
        }
      }
      for (const [uri, src] of g._resources) {
        const dest = result._ensureResourceEntry(uri);
        if (src.name !== void 0) dest.name = src.name;
        if (src.title !== void 0) dest.title = src.title;
        if (src.description !== void 0) dest.description = src.description;
      }
      for (const [tpl, src] of g._templates) {
        const dest = result._ensureTemplateEntry(tpl);
        if (src.name !== void 0) dest.name = src.name;
        if (src.title !== void 0) dest.title = src.title;
        if (src.description !== void 0) dest.description = src.description;
      }
      for (const [key, template] of g._phrases) result._phrases.set(key, template);
    }
    return result;
  }
  // ── Clone ────────────────────────────────────────────────────────────────
  clone() {
    return new _McpGrammar(this.toJSON());
  }
  // ── Internals ────────────────────────────────────────────────────────────
  _ensureToolEntry(toolName) {
    let entry = this._tools.get(toolName);
    if (!entry) {
      entry = {};
      this._tools.set(toolName, entry);
    }
    return entry;
  }
  _ensureResourceEntry(uri) {
    let entry = this._resources.get(uri);
    if (!entry) {
      entry = {};
      this._resources.set(uri, entry);
    }
    return entry;
  }
  _ensureTemplateEntry(uriTemplate) {
    let entry = this._templates.get(uriTemplate);
    if (!entry) {
      entry = {};
      this._templates.set(uriTemplate, entry);
    }
    return entry;
  }
  static _cloneToolEntry(entry) {
    const clone = {};
    if (entry.title !== void 0) clone.title = entry.title;
    if (entry.description !== void 0) clone.description = entry.description;
    if (entry.properties) clone.properties = { ...entry.properties };
    return clone;
  }
  static _cloneResourceEntry(entry) {
    const clone = {};
    if (entry.name !== void 0) clone.name = entry.name;
    if (entry.title !== void 0) clone.title = entry.title;
    if (entry.description !== void 0) clone.description = entry.description;
    return clone;
  }
  static _cloneTemplateEntry(entry) {
    const clone = {};
    if (entry.name !== void 0) clone.name = entry.name;
    if (entry.title !== void 0) clone.title = entry.title;
    if (entry.description !== void 0) clone.description = entry.description;
    return clone;
  }
};
var McpToolResults = {
  /** Plain text confirmation or message. */
  text: (text) => ({ content: [{ type: "text", text }] }),
  /**
   * Serialized JSON, convenience over `text(JSON.stringify(...))`.
   *
   * Emits the payload as a JSON `text` block (backward-compatible) and, when
   * `data` is a plain object, also as `structuredContent` (MCP 2025-06-18) so
   * modern clients receive it structured without re-parsing the text block.
   * Arrays and primitives are not valid `structuredContent`, so they are
   * emitted as the `text` block only.
   */
  json: (data) => {
    const result = { content: [{ type: "text", text: JSON.stringify(data) }] };
    if (typeof data === "object" && data !== null && !Array.isArray(data)) {
      result.structuredContent = data;
    }
    return result;
  },
  /** Embeds an updated resource inline, avoids a round-trip `resources/read`. */
  resource: (resource) => ({ content: [{ type: "resource", resource }] }),
  /**
   * Points at a resource instead of inlining it.
   *
   * Prefer this over {@link resource} when the payload is large or changes on
   * its own: the client reads or subscribes to the URI when it needs the data.
   */
  link: (uri, name, options) => ({
    content: [{ type: "resource_link", uri, name, ...options }]
  }),
  /** Base64 image. */
  image: (data, mimeType) => ({ content: [{ type: "image", data, mimeType }] }),
  /** Base64 audio. */
  audio: (data, mimeType) => ({ content: [{ type: "audio", data, mimeType }] }),
  /**
   * Tool-level error, `isError: true` signals failure to the client without throwing.
   *
   * This is the form the spec wants for execution and input-validation
   * failures: unlike a JSON-RPC error, it reaches the model, which can read
   * the message and retry with corrected arguments.
   */
  error: (message) => ({ content: [{ type: "text", text: message }], isError: true })
};
var McpBehaviorBase = class {
  constructor(options) {
    this._domain = options.domain;
    this._namespace = options.namespace;
    this._name = options.name;
    this._description = options.description;
    this._mimeType = options.mimeType;
  }
  get baseUri() {
    if (!this._baseUri) {
      this._baseUri = this._buildBaseUri();
    }
    return this._baseUri;
  }
  get domain() {
    return this._domain || "mcp";
  }
  get namespace() {
    return this._namespace || "";
  }
  get name() {
    return this._name;
  }
  get description() {
    return this._description;
  }
  get mimeType() {
    return this._mimeType;
  }
  readResourceAsync(_uri) {
    return Promise.resolve(void 0);
  }
  executeToolAsync(_uri, _toolName, _args) {
    return Promise.resolve(McpToolResults.error(`Tool not implemented: ${_toolName}`));
  }
  getResources() {
    throw new Error("Method not implemented.");
  }
  getResourceTemplates() {
    throw new Error("Method not implemented.");
  }
  getTools() {
    throw new Error("Method not implemented.");
  }
  _buildBaseUri() {
    return `${this.domain}://${this.namespace}`;
  }
};
var McpGrammarBehavior = class _McpGrammarBehavior extends McpBehaviorBase {
  static {
    this.GrammarListFn = "grammar_list";
  }
  static {
    this.GrammarReadFn = "grammar_read";
  }
  static {
    this.GrammarSetFn = "grammar_set";
  }
  static {
    this.GrammarDeleteFn = "grammar_delete";
  }
  static {
    this.GrammarImportFn = "grammar_import";
  }
  static {
    this.GrammarExportFn = "grammar_export";
  }
  constructor(store, options = {}) {
    super({
      ...options,
      domain: options.domain ?? "mcp",
      namespace: options.namespace ?? "grammar"
    });
    this._store = store;
  }
  // ── Design-time (schema) ────────────────────────────────────────────────
  getTools() {
    return [
      {
        name: _McpGrammarBehavior.GrammarListFn,
        description: "Lists every grammar profile currently registered in the store. Each profile tailors how tools and their parameters are described for a specific device, process, or audience, enabling an LLM to reason about the same capability in domain-specific terms.",
        inputSchema: {
          type: "object",
          properties: {
            uri: {
              type: "string",
              description: "Grammar namespace URI (mcp://grammar)."
            }
          },
          required: ["uri"],
          additionalProperties: false
        }
      },
      {
        name: _McpGrammarBehavior.GrammarReadFn,
        description: "Returns the full grammar profile for a given profile ID: every tool-level and property-level description override that shapes how an LLM perceives the device's capabilities.",
        inputSchema: {
          type: "object",
          properties: {
            uri: {
              type: "string",
              description: "Grammar namespace URI (mcp://grammar)."
            },
            profileId: {
              type: "string",
              description: "Profile identifier to read (e.g. 'welding-robot-3A')."
            }
          },
          required: ["uri", "profileId"],
          additionalProperties: false
        }
      },
      {
        name: _McpGrammarBehavior.GrammarSetFn,
        description: "Creates or replaces a grammar profile. The data object maps tool names to description overrides: { toolName: { description?, properties?: { propName: description } } }. Supports dot-notation for nested properties (e.g. 'patch.position'). After saving, every connected session bound to this profile receives a tools/list_changed notification and sees updated tool descriptions on the next tools/list call.",
        inputSchema: {
          type: "object",
          properties: {
            uri: {
              type: "string",
              description: "Grammar namespace URI (mcp://grammar)."
            },
            profileId: {
              type: "string",
              description: "Profile identifier to create or replace."
            },
            data: {
              type: "object",
              description: "Grammar data keyed by tool name. Each value is { description?: string, properties?: Record<string, string> }.",
              additionalProperties: {
                type: "object",
                properties: {
                  description: {
                    type: "string",
                    description: "Override for the tool-level description."
                  },
                  properties: {
                    type: "object",
                    description: "Map of property names to description overrides. Supports dot-notation for nested properties.",
                    additionalProperties: { type: "string" }
                  }
                },
                additionalProperties: false
              }
            }
          },
          required: ["uri", "profileId", "data"],
          additionalProperties: false
        }
      },
      {
        name: _McpGrammarBehavior.GrammarDeleteFn,
        description: "Removes a grammar profile by ID. Sessions bound to this profile revert to baseline tool descriptions and receive a tools/list_changed notification.",
        inputSchema: {
          type: "object",
          properties: {
            uri: {
              type: "string",
              description: "Grammar namespace URI (mcp://grammar)."
            },
            profileId: {
              type: "string",
              description: "Profile identifier to delete."
            }
          },
          required: ["uri", "profileId"],
          additionalProperties: false
        }
      },
      {
        name: _McpGrammarBehavior.GrammarImportFn,
        description: "Bulk-imports grammar profiles from a single JSON object. Each key is a profile ID and each value is grammar data. Existing profiles with the same ID are replaced. Useful for restoring a previously exported configuration or deploying a fleet of device grammars.",
        inputSchema: {
          type: "object",
          properties: {
            uri: {
              type: "string",
              description: "Grammar namespace URI (mcp://grammar)."
            },
            profiles: {
              type: "object",
              description: "Map of profile IDs to grammar data objects.",
              additionalProperties: {
                type: "object",
                additionalProperties: {
                  type: "object",
                  properties: {
                    description: { type: "string" },
                    properties: {
                      type: "object",
                      additionalProperties: { type: "string" }
                    }
                  },
                  additionalProperties: false
                }
              }
            }
          },
          required: ["uri", "profiles"],
          additionalProperties: false
        }
      },
      {
        name: _McpGrammarBehavior.GrammarExportFn,
        description: "Exports every grammar profile as a single JSON snapshot. The result can be saved to a file and later re-imported with grammar_import to restore the full grammar configuration.",
        inputSchema: {
          type: "object",
          properties: {
            uri: {
              type: "string",
              description: "Grammar namespace URI (mcp://grammar)."
            }
          },
          required: ["uri"],
          additionalProperties: false
        }
      }
    ];
  }
  getResources() {
    return [
      {
        uri: this.baseUri,
        name: "Grammar profiles",
        description: "All grammar profiles currently registered in the store.",
        mimeType: JsonRpcMimeType
      }
    ];
  }
  getResourceTemplates() {
    return [
      {
        uriTemplate: `${this.baseUri}/{profileId}`,
        name: "Grammar profile",
        description: "A single grammar profile identified by its profile ID.",
        mimeType: JsonRpcMimeType
      }
    ];
  }
  // ── Runtime ─────���───────────────────────────────────────────────────────
  async readResourceAsync(uri) {
    if (uri === this.baseUri) {
      return {
        uri,
        mimeType: JsonRpcMimeType,
        text: JSON.stringify({ profiles: this._store.list() })
      };
    }
    const prefix = `${this.baseUri}/`;
    if (uri.startsWith(prefix)) {
      const profileId = uri.substring(prefix.length);
      const grammar = this._store.get(profileId);
      if (!grammar) return void 0;
      return {
        uri,
        mimeType: JsonRpcMimeType,
        text: JSON.stringify(grammar.toJSON())
      };
    }
    return void 0;
  }
  async executeToolAsync(_uri, toolName, args) {
    switch (toolName) {
      case _McpGrammarBehavior.GrammarListFn:
        return McpToolResults.json({ profiles: this._store.list() });
      case _McpGrammarBehavior.GrammarReadFn: {
        const profileId = args["profileId"];
        if (!profileId) return McpToolResults.error("Missing required argument: profileId");
        const grammar = this._store.get(profileId);
        if (!grammar) return McpToolResults.error(`Grammar profile not found: "${profileId}"`);
        return McpToolResults.json(grammar.toJSON());
      }
      case _McpGrammarBehavior.GrammarSetFn: {
        const profileId = args["profileId"];
        const data = args["data"];
        if (!profileId) return McpToolResults.error("Missing required argument: profileId");
        if (!data) return McpToolResults.error("Missing required argument: data");
        this._store.set(profileId, McpGrammar.fromJSON(data));
        return McpToolResults.text(`Grammar profile "${profileId}" saved.`);
      }
      case _McpGrammarBehavior.GrammarDeleteFn: {
        const profileId = args["profileId"];
        if (!profileId) return McpToolResults.error("Missing required argument: profileId");
        if (!this._store.delete(profileId)) return McpToolResults.error(`Grammar profile not found: "${profileId}"`);
        return McpToolResults.text(`Grammar profile "${profileId}" deleted.`);
      }
      case _McpGrammarBehavior.GrammarImportFn: {
        const profiles = args["profiles"];
        if (!profiles) return McpToolResults.error("Missing required argument: profiles");
        this._store.importAll(profiles);
        return McpToolResults.text(`Imported ${Object.keys(profiles).length} grammar profile(s).`);
      }
      case _McpGrammarBehavior.GrammarExportFn:
        return McpToolResults.json(this._store.exportAll());
      default:
        return McpToolResults.error(`Unknown tool: "${toolName}"`);
    }
  }
};

// harness/browser/words.ts
async function loadWords(session) {
  const r = await session.request("resources/read", { uri: GRAMMAR_PHRASES_URI });
  const text = r?.contents?.[0]?.text;
  if (!text) throw new Error(`${GRAMMAR_PHRASES_URI}: the slot gave this session no phrases`);
  const body = JSON.parse(text);
  return { words: McpGrammar.fromJSON({ phrases: body.phrases ?? {} }), grammar: body.grammar ?? null };
}
var NO_WORDS = McpGrammar.fromJSON({ phrases: {} });

// harness/browser/factory-voice.ts
var num = (v, digits = 4) => typeof v === "number" && Number.isFinite(v) ? Number.isInteger(v) ? String(v) : v.toFixed(digits).replace(/\.?0+$/, "") : "?";
var count = (v) => {
  if (Array.isArray(v)) return String(v.length);
  const m = typeof v === "string" ? /^\[(\d+) items\]$/.exec(v) : null;
  return m ? m[1] : "?";
};
var list = (v) => Array.isArray(v) ? v : [];
var record = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
var valueOf = (step) => record(record(step.summary).value);
var plainReason = (reason, fallback) => typeof reason === "string" && reason ? reason.replace(/^(device refused|policy deny|error):\s*/i, "") : fallback;
function stepSentence(words, step) {
  if (!step) return "";
  const p = (key, values = {}) => words.phrase(key, values);
  const noReason = p("noReason");
  const capability = step.capability ?? p("aCall");
  const replayed = step.source === "policy" ? p("replayed") : "";
  if (step.source === "refused") return p("step.refused", { capability, reason: plainReason(step.reason, noReason) });
  if (step.source === "failed") return p("step.failed", { reason: plainReason(step.reason, noReason) });
  if (step.outcome !== "completed") return p("step.notCompleted", { capability, outcome: step.outcome ?? "?", reason: plainReason(step.reason, noReason) });
  const v = valueOf(step);
  const input = record(step.input);
  switch (step.capability) {
    case "twin.registry_search":
      return p("step.twin.registry_search", { matches: count(v.matches), signed: num(v.signed), total: num(v.total), replayed });
    case "task.plan": {
      const selected = list(input.selected_nodes).map(String);
      const missing = list(input.missing_capabilities).map((m) => String(record(m).required_output ?? "?"));
      return p("step.task.plan", {
        selectedCount: selected.length,
        selectedList: selected.length ? p("step.task.plan.selectedList", { selected: selected.join(", ") }) : "",
        missing: missing.length ? p("step.task.plan.missing", { missing: missing.join(", ") }) : p("step.task.plan.nothingMissing"),
        recipe: replayed ? p("step.task.plan.recipe") : ""
      });
    }
    case "workspace.list":
      return p("step.workspace.list", { files: count(v.files), replayed });
    case "workspace.read":
      return p("step.workspace.read", { path: input.path ?? p("aFile"), replayed });
    case "workspace.write":
      return p("step.workspace.write", { path: input.path ?? p("aFile"), replayed });
    case "model.fit": {
      const q = record(v.quality);
      return p("step.model.fit", { rows: num(q.rows), kept: num(q.kept), rmse: num(q.rmse), worst: num(q.worstCaseError), parity: record(v.parity).ok ? p("parity.ok") : p("parity.notOk"), replayed });
    }
    case "model.inspect":
      return p("step.model.inspect", { inputs: count(v.inputs), outputs: count(v.outputs), bytes: num(v.bytes), replayed });
    case "model.contract":
      return v.ok ? p("step.model.contract.ok", { replayed }) : p("step.model.contract.refused", { error: v.error ?? noReason });
    case "task.fail":
      return p("step.task.fail");
    case "task.done":
      if (step.reward === -1) return p("step.task.done.disputed", { problems: String(step.reason ?? "").replace(/^contract not held:\s*/, "") || noReason });
      return p("step.task.done", { replayed, summary: input.summary ?? "" });
    default:
      return p("step.default", { capability, replayed });
  }
}
function endSentence(words, status) {
  const m = status?.manifest ?? {};
  const p = (key, values = {}) => words.phrase(key, values);
  switch (status?.state) {
    case "proposed":
      return p("end.proposed", { proposalId: m.proposal?.proposalId ?? "?", artifacts: count(m.artifacts), steps: count(m.steps) });
    case "done":
      return p("end.done", { steps: count(m.steps) });
    case "failed": {
      const steps = Array.isArray(m.steps) ? m.steps : [];
      if (steps.at(-1)?.capability === "task.fail") return p("end.failed.gaveUp");
      return p("end.failed", { ended: m.ended ?? p("noReason") });
    }
    default:
      return p("end.other", { state: status?.state ?? "?" });
  }
}
function stageSentence(words, stage, values, next) {
  const key = stage === "gate" ? next === "merge" ? "stage.gate.replayed" : "stage.gate.ask" : `stage.${stage}`;
  if (words.getPhrase(key) === void 0) return [stage, stage];
  return [words.phrase(key, values), words.phrase(`${key}.now`, values)];
}
export {
  NO_WORDS,
  endSentence,
  loadWords,
  stageSentence,
  stepSentence
};
//# sourceMappingURL=factory-voice.js.map
