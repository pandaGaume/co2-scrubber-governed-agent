/**
 * The `qr` slot, through the broker.
 *
 * What is worth testing here is the slot's own judgement, not the codes: those
 * come from `qrcode`, an ordinary dependency, and re-testing a library is how
 * a repository grows tests that only break when it is upgraded.
 *
 * What belongs to this slot, and what this checks:
 *   - it answers with the machine's address on the local network rather than
 *     the loopback a page would have offered, which is the whole reason the
 *     slot exists: a phone pointed at loopback reaches itself;
 *   - it refuses a page that climbs out of the dashboard, and a caller that
 *     has decided for itself which host to point at;
 *   - what comes back is an SVG a page can show as it is, in the room's
 *     colours.
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LocalBroker } from "../slots/lib/local-broker.js";
import { startAllOrFail } from "./lib/start.js";
import type { PublishedSlot } from "../slots/lib/slot-server.js";
import { connectMcp, toolText, type McpSession } from "../harness/lib/mcp-http.js";

const PORT = 3111;
const quiet = (): undefined => undefined;

describe("the qr slot", () => {
    let broker: LocalBroker;
    let slots: PublishedSlot<object>[];
    let qr: McpSession;

    before(async () => {
        ({ broker, slots } = await startAllOrFail(PORT));
        qr = await connectMcp(broker.httpBase, "qr", { name: "qr-test", version: "0" });
    });
    after(async () => {
        await qr.close().catch(quiet);
        for (const s of slots) await s.close().catch(quiet);
        broker.stop();
    });

    /** A slot wraps a completed call in `{ slot, tool, result, stub, at }`, so
        the answer is one level down. */
    const result = async <T>(tool: string, args: Record<string, unknown> = {}): Promise<T> => {
        const r = await qr.callTool(tool, args);
        const text = toolText(r);
        if (r.isError) throw new Error(text);
        const body = JSON.parse(text) as { result?: T };
        return (body.result ?? body) as T;
    };

    it("answers with the address a phone must reach, not the one this process sees", async () => {
        const { url, addresses } = await result<{ url: string; addresses: string[] }>("page", { page: "simulation.html" });
        assert.match(url, /^http:\/\/[^/]+:\d+\/simulation\.html$/u, "an address of this machine, and the page asked for");
        assert.ok(addresses.length >= 1, "at least one address");
        const loopback = addresses.filter((a) => a.includes("localhost") || a.includes("127.0.0.1"));
        // On a machine with no network card there is only loopback and nothing
        // better can be offered; where there is one, it must be the one drawn.
        if (addresses.length > loopback.length) {
            assert.ok(!url.includes("localhost"), `the drawn address is a network one, not ${url}`);
            assert.ok(String(addresses.at(-1)).includes("localhost"), "loopback comes last");
        }
    });

    it("refuses a page that climbs out, and a caller that picks its own host", async () => {
        await assert.rejects(result("page", { page: "../../etc/passwd" }), /climbs out/u);
        await assert.rejects(result("page", { page: "http://example.com/" }), /a page, not a full address/u);
        await assert.rejects(result("page", { page: "" }), /a page is needed/u);
    });

    it("returns an SVG a page can show as it is, in the room's colours", async () => {
        const { svg } = await result<{ svg: string }>("page", { page: "biomed.html" });
        assert.match(svg, /^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/u);
        assert.match(svg, /viewBox="0 0 \d+ \d+"/u, "square, and sized in modules so a page can scale it");
        assert.ok(svg.includes("</svg>"), "closed");
        assert.ok(svg.includes("#04090c") && svg.includes("#d3ecea"), "the room's near-black on its pale face, by default");
    });

    it("refuses to make a code of nothing", async () => {
        await assert.rejects(result("encode", { text: "" }), /nothing/u);
    });
});
