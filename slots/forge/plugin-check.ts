/**
 * The deterministic guard of the forge (docs/observateur-et-usines.fr.md,
 * section 6.1): what a generated plugin must satisfy before it is compiled,
 * before it is loaded, and what code alone can say about it. No model here.
 *
 *   the layout      src/index.ts exporting `register(registry, doc)`, at
 *                   least one node file, a documentation card per node type
 *                   under docs/, a test file; nothing outside src/, docs/
 *   the imports     `@spiky-panda/core` and the plugin's own files, nothing
 *                   else; a test file may also import node:test and
 *                   node:assert; no eval, no Function constructor, no dynamic
 *                   import of a computed name
 *   the types       a generated type is named under `Generated.` so that
 *                   every catalogue, plan and candidate says it is generated
 *                   without a metadata the substrate does not carry; a type
 *                   the registry already holds is never overridden
 *   the signature   present (the substrate accepts its absence, the forge
 *                   does not), valid for the substrate's own checker
 *                   (`validateSignature`: ports that exist, units that agree),
 *                   and every unit it writes resolved by the units service
 *                   against its quantity (`harness/lib/units.ts`)
 *   the card        the documentation file the meta points to exists and
 *                   says something
 *
 * What is not checked here, and said so: the conservation of a quantity
 * over one simulation step (a later check, on a document the runtime
 * builds), and anything a model could only argue about.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import * as path from "node:path";
import { validateSignature, type INodeMeta, type NodeRegistry } from "@spiky-panda/core";
import { canonicalQuantity, resolveUnitRef } from "../../harness/lib/units.js";

/** The prefix every generated type carries. */
export const GENERATED_PREFIX = "Generated.";

/** What a source file of a plugin may import: the substrate's core and the plugin's own files; a test file, the test runner and the assertions too. */
export const ALLOWED_IMPORTS = ["@spiky-panda/core"] as const;
export const ALLOWED_TEST_IMPORTS = ["node:test", "node:assert", "node:assert/strict"] as const;

export interface PluginFile {
    /** Relative to the plugin's directory: `src/index.ts`, `src/leak.node.ts`, `src/leak.test.ts`, `docs/leak.md`. */
    path: string;
    content: string;
}

export interface Problem {
    where: string;
    what: string;
}

const SOURCE = /^src\/[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*\.ts$/;
const DOC = /^docs\/[A-Za-z0-9_-]+\.md$/;
const IMPORT = /(?:^|\n)\s*(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g;
const SIDE_IMPORT = /(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g;
const DYNAMIC = /\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g;
const DYNAMIC_COMPUTED = /\bimport\s*\(\s*[^'")]/;
const REQUIRE = /\brequire\s*\(\s*(['"])([^'"]+)\1\s*\)/g;
const REQUIRE_COMPUTED = /\brequire\s*\(\s*[^'")]/;
const EVAL = /\beval\s*\(|\bnew\s+Function\s*\(/;

export const isTestFile = (p: string): boolean => /\.test\.ts$/.test(p);

/** Where a file may be written: a source under src/, a card under docs/; nothing else, nothing above. */
export function checkPath(p: string): string | null {
    if (SOURCE.test(p) || DOC.test(p)) return null;
    return `"${p}" is not a file of a plugin: sources are src/<name>.ts (tests src/<name>.test.ts), cards docs/<name>.md`;
}

/** The import specifiers of a source, as written. */
export function importsOf(content: string): string[] {
    const out: string[] = [];
    for (const re of [IMPORT, SIDE_IMPORT]) for (const m of content.matchAll(re)) out.push(m[1]);
    for (const m of content.matchAll(DYNAMIC)) out.push(m[2]);
    for (const m of content.matchAll(REQUIRE)) out.push(m[2]);
    return [...new Set(out)];
}

/** The problems of one source's imports: a module outside the allow-list, a relative import that leaves src/, a computed import, an eval. */
export function checkImports(file: PluginFile): Problem[] {
    const problems: Problem[] = [];
    const allowed: readonly string[] = isTestFile(file.path) ? [...ALLOWED_IMPORTS, ...ALLOWED_TEST_IMPORTS] : ALLOWED_IMPORTS;
    for (const spec of importsOf(file.content)) {
        if (spec.startsWith("./") || spec.startsWith("../")) {
            const target = path.posix.normalize(path.posix.join(path.posix.dirname(file.path), spec));
            if (!target.startsWith("src/")) problems.push({ where: file.path, what: `imports "${spec}", which leaves the plugin's sources` });
            continue;
        }
        if (!allowed.includes(spec)) problems.push({ where: file.path, what: `imports "${spec}"; a generated plugin imports ${allowed.map((a) => `"${a}"`).join(", ")} and its own files, nothing else` });
    }
    if (DYNAMIC_COMPUTED.test(file.content)) problems.push({ where: file.path, what: "imports a computed name (import(expr)); an import names its module" });
    if (REQUIRE_COMPUTED.test(file.content)) problems.push({ where: file.path, what: "requires a computed name; an import names its module" });
    if (EVAL.test(file.content)) problems.push({ where: file.path, what: "uses eval or the Function constructor; generated code is written, not evaluated" });
    return problems;
}

/** The problems of a plugin's layout and imports, before any compilation. */
export function checkSources(files: PluginFile[]): Problem[] {
    const problems: Problem[] = [];
    const paths = files.map((f) => f.path);
    for (const p of paths) {
        const bad = checkPath(p);
        if (bad) problems.push({ where: p, what: bad });
    }
    if (!paths.includes("src/index.ts")) problems.push({ where: "src/index.ts", what: "missing: the plugin's entry, exporting register(registry, doc)" });
    else {
        const index = files.find((f) => f.path === "src/index.ts")!;
        if (!/export\s+(?:async\s+)?function\s+register\s*\(/.test(index.content) && !/export\s*\{[^}]*\bregister\b[^}]*\}/.test(index.content) && !/export\s+const\s+register\s*=/.test(index.content)) problems.push({ where: "src/index.ts", what: "does not export register(registry, doc): the function that registers the plugin's node types" });
    }
    if (!paths.some((p) => SOURCE.test(p) && !isTestFile(p) && p !== "src/index.ts")) problems.push({ where: "src/", what: "no node file: a plugin has at least one source besides its entry (src/<name>.node.ts)" });
    if (!paths.some((p) => isTestFile(p))) problems.push({ where: "src/", what: "no test file (src/<name>.test.ts): a node's tests are written before it is loaded" });
    if (!paths.some((p) => DOC.test(p))) problems.push({ where: "docs/", what: "no documentation card (docs/<name>.md): a node says what it is for" });
    for (const f of files) {
        if (!SOURCE.test(f.path)) continue;
        problems.push(...checkImports(f));
    }
    return problems;
}

export interface TypeCheck {
    type: string;
    ok: boolean;
    problems: string[];
}

/**
 * The problems of the types a plugin added to a registry: the name under
 * `Generated.`, a signature present and valid for the substrate, every unit
 * resolved by the units service, the card on disk. `before` is what the
 * registry held before the plugin registered; a type it already held and
 * the plugin registered again is a problem of its own.
 */
export function checkTypes(registry: NodeRegistry, before: ReadonlySet<string>, registered: string[]): TypeCheck[] {
    const out: TypeCheck[] = [];
    for (const type of registered) {
        const problems: string[] = [];
        if (before.has(type)) problems.push(`the registry already holds "${type}": a generated plugin never overrides a type`);
        if (!type.startsWith(GENERATED_PREFIX)) problems.push(`the type is not named under "${GENERATED_PREFIX}" (as in "${GENERATED_PREFIX}Habitat:leak"): every catalogue must say it is generated`);
        const meta = registry.meta(type) as INodeMeta | undefined;
        if (!meta) {
            problems.push("the registry has no meta for it");
            out.push({ type, ok: false, problems });
            continue;
        }
        if (!meta.signature) problems.push("no signature: the forge needs the purpose, the ports with quantity and unit, the capabilities");
        else {
            for (const p of validateSignature(meta)) problems.push(`signature, ${p.where}: ${p.what}`);
            const ports = { ...(meta.signature.inputs ?? {}), ...(meta.signature.outputs ?? {}) } as Record<string, { quantity?: string; unit?: string }>;
            for (const [port, s] of Object.entries(ports)) {
                if (s.unit) {
                    const r = resolveUnitRef({ unit: s.unit, ...(s.quantity ? { quantity: s.quantity } : {}) });
                    if (!r.ok) problems.push(`signature, port "${port}": ${r.reason}`);
                } else if (s.quantity && canonicalQuantity(s.quantity) === null && !["Category", "Count", "Particulate", "State"].includes(s.quantity)) problems.push(`signature, port "${port}": "${s.quantity}" is not a quantity the units service knows`);
            }
        }
        const doc = typeof meta.docPath === "string" ? meta.docPath : "";
        if (!doc) problems.push("no documentation card (docPath)");
        else if (!existsSync(doc) || !statSync(doc).isFile()) problems.push(`the documentation card ${doc} does not exist`);
        else if (!readFileSync(doc, "utf8").trim()) problems.push(`the documentation card ${doc} is empty`);
        out.push({ type, ok: problems.length === 0, problems });
    }
    if (!registered.length) out.push({ type: "(none)", ok: false, problems: ["the plugin registered no node type"] });
    return out;
}
