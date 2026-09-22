/**
 * Open and close a monitoring session from the command line.
 *
 * The monitoring page is a display: it shows a session, it does not start one.
 * Who starts one, in the scenario, is Mother, once the commander has
 * authorised a test on a module with people in it. That path runs through the
 * `procedure` topic and is not built yet, so until it is, this script stands
 * in for the commander's click and lets the page be rehearsed and filmed.
 *
 *   npm run biomed:start                         watch whoever is in the Lab
 *   npm run biomed:start -- --modules lab,hab-b  several modules
 *   npm run biomed:start -- --procedure decay-2026-10-14-01
 *   npm run biomed:state                         who is watched, and how they are
 *   npm run biomed:stop                          close it, print the record
 *
 * `--port` follows a broker on another port. Nothing here is a capability of
 * any agent: it is an operator at a keyboard, which is exactly what it stands
 * in for.
 */
import { Broker } from "../harness/lib/broker.js";
import { isMain } from "../lib/paths.js";

const DEFAULT_PORT = 3001;

/**
 * A slot wraps a completed call in `{ slot, tool, result, ... }` and a refusal
 * in `{ slot, tool, refused, ... }`. A refusal is not a crash: it is the slot
 * saying no for a reason, and the reason is what the operator needs to read.
 */
function value(result: { content?: ReadonlyArray<unknown>; isError?: boolean }): unknown {
    const text = (result.content ?? []).map((c) => (typeof c === "object" && c !== null && "text" in c ? String((c as { text?: unknown }).text ?? "") : "")).join("");
    let parsed: Record<string, unknown>;
    try {
        parsed = JSON.parse(text || "{}") as Record<string, unknown>;
    } catch {
        throw new Error(text || "the slot answered nothing");
    }
    if (typeof parsed.refused === "string") throw new Error(`refused: ${parsed.refused}`);
    if (result.isError) throw new Error(text);
    return "result" in parsed && "tool" in parsed ? parsed.result : parsed;
}

export async function main(argv: string[]): Promise<void> {
    const action = argv[0] ?? "state";
    const option = (name: string, fallback?: string) => {
        const i = argv.indexOf(`--${name}`);
        return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
    };
    const port = Number(option("port", String(DEFAULT_PORT)));
    const broker = new Broker(`http://localhost:${port}`, { name: "operator", version: "0.1.0", locale: "en" });

    try {
        const session = await broker.session("biomed");
        switch (action) {
            case "start": {
                const modules = (option("modules", "lab") as string).split(",").map((m) => m.trim()).filter(Boolean);
                const args: Record<string, unknown> = { reason: option("reason", "rehearsal") as string, modules };
                const procedure = option("procedure");
                if (procedure) args.procedureId = procedure;
                const started = value(await session.callTool("monitor_start", args)) as { session: { sessionId: string; subjectIds: string[]; provider: string; live: boolean } };
                const s = started.session;
                console.log(`monitoring ${s.subjectIds.join(", ")} in ${modules.join(", ")}`);
                console.log(`session ${s.sessionId}, source ${s.provider}${s.live ? "" : " (simulated: the page says so)"}`);
                console.log(`the page switches by itself within a second: http://localhost:${port}/biomed.html`);
                break;
            }
            case "stop": {
                const ended = value(await session.callTool("monitor_stop", { reason: option("reason", "rehearsal over") as string })) as { session: { sessionId: string; events: unknown[] } };
                console.log(`closed ${ended.session.sessionId}, ${ended.session.events.length} event(s) that were not nominal`);
                break;
            }
            case "state": {
                const state = value(await session.callTool("state", {})) as { session: string | null; subjects: Array<{ callsign: string; bpm: number | null; status: string }> };
                if (!state.session) {
                    const presence = value(await session.callTool("presence", {})) as { modules: Array<{ module: string; occupants: number }> };
                    console.log("no session open; the page is in standby");
                    for (const m of presence.modules) console.log(`  ${m.module}: ${m.occupants} occupant(s)`);
                } else {
                    console.log(`session ${state.session}`);
                    for (const s of state.subjects) console.log(`  ${s.callsign}: ${s.bpm ?? "--"} bpm, ${s.status}`);
                }
                break;
            }
            default:
                throw new Error(`unknown action "${action}" (start, stop, state)`);
        }
    } finally {
        await broker.close();
    }
}

if (isMain(import.meta.url)) {
    main(process.argv.slice(2)).catch((e: unknown) => {
        console.error(e instanceof Error ? e.message : String(e));
        process.exit(1);
    });
}
