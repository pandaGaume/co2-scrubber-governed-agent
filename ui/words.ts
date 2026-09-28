/**
 * The words a page reads from a slot: the `phrases` of the slot's wording
 * for this page's session (mcp-core 1.2.0, `grammar://phrases`), in the
 * language the session announced (`capabilities.locale`), as an
 * `McpGrammar` whose `phrase(key, values)` fills the holes. A key the
 * wording lacks reads as the key, so a missing sentence is seen where it
 * should have been read; a value the page lacks reads "?". No sentence and
 * no loader of the demo's own: the slot's grammar files hold the sentences,
 * mcp-core serves them.
 */
import { GRAMMAR_PHRASES_URI, McpGrammar } from "@cyanmycelium/mcp-core";

export type Words = McpGrammar;

/** An MCP session with the slot whose phrases are read: the board's client and the harness's both answer `request`. */
export interface PhrasesSession {
    request(method: string, params: Record<string, unknown>): Promise<unknown>;
}

/** The phrases of the slot's wording for this session, as `grammar://phrases` gives them, with the key of that wording. */
export async function loadWords(session: PhrasesSession): Promise<{ words: Words; grammar: string | null }> {
    const r = (await session.request("resources/read", { uri: GRAMMAR_PHRASES_URI })) as { contents?: Array<{ text?: string }> } | undefined;
    const text = r?.contents?.[0]?.text;
    if (!text) throw new Error(`${GRAMMAR_PHRASES_URI}: the slot gave this session no phrases`);
    const body = JSON.parse(text) as { grammar?: string; phrases?: Record<string, string> };
    return { words: McpGrammar.fromJSON({ phrases: body.phrases ?? {} }), grammar: body.grammar ?? null };
}

/** Words with nothing in them: what a page uses before it has read a slot, so every key shows as itself. */
export const NO_WORDS: Words = McpGrammar.fromJSON({ phrases: {} });
