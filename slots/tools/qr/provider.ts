/**
 * The `qr` slot: a page's address on this network, as a code a phone can read.
 *
 * It exists because of one thing a browser cannot know. The control room is
 * usually opened at `http://localhost:3001`, so `location.origin` is
 * `localhost`, and a phone pointed at a code of that reaches its own loopback
 * and finds nothing. The address a phone needs is the machine's address on the
 * local network, and only this process knows it: `lanAddresses()` is what the
 * broker already uses to decide which origins to allow.
 *
 * So the page asks for a code rather than drawing one, and gets an address
 * that is true from where the phone is standing.
 *
 * The codes themselves come from `qrcode`, an ordinary dependency of this
 * repository like `@cyanmycelium/*`. An earlier version of this slot carried a
 * hand-written encoder, on the grounds that the design brief forbids loading
 * anything from a third party at runtime. That conflated two different things:
 * fetching a library from a CDN while the demo runs, which would break the
 * moment the room's network did, and installing one, which is offline, pinned
 * and reviewable like every other dependency here. The hand-written one also
 * shipped a real defect straight to a phone camera, a second copy of the
 * format information written one module long, and no test that reads its own
 * output back can catch a mistake it makes twice. A library thousands of
 * cameras have already argued with is the better answer.
 *
 * Kept out of the agent's catalogue with the rest of the workshop's tools: a
 * picture of a link is an operator's business, not a cabin capability.
 */
import QRCode from "qrcode";
import { lanAddresses } from "../../lib/local-broker.js";
import { objectSchema as obj, publishSlot, type PublishedSlot, type SlotTool } from "../../lib/slot-server.js";

export interface QrState {
    /** What was asked for, so the log shows which addresses went out. */
    made: Array<{ text: string; at: string }>;
}

/** The port the broker serves on; the slot is published by the same process. */
const PORT = Number(process.env.MCP_BROKER_PORT ?? 3001);

/** The room's near-black on its pale face, so a code sits in the page rather
    than punching a white hole through it. The contrast is about seventeen to
    one, far past what a camera needs. */
const DARK = "#04090c";
const LIGHT = "#d3ecea";

/** Four modules of quiet zone, which is what the specification asks for and
    what a camera needs to find the code against a busy background. */
const MARGIN = 4;

/** A path under the dashboard, with nothing that could climb out of it. */
function safePath(value: unknown): string {
    const raw = String(value ?? "").trim();
    if (!raw) throw new Error("a page is needed, for instance simulation.html");
    if (/^[a-z][a-z0-9+.-]*:/iu.test(raw)) throw new Error("a page, not a full address: the host is this machine's, and this slot is what knows it");
    const path = raw.replace(/^\/+/u, "");
    if (path.includes("..")) throw new Error(`"${raw}" climbs out of the dashboard`);
    return `/${path}`;
}

export function qrSlot(wsBase: string, log: (line: string) => void): PublishedSlot<QrState> {
    const state: QrState = { made: [] };

    /** Every address this machine answers on, the LAN ones first: a phone
        cannot use loopback, so it is offered last and only as a fallback. */
    const addresses = (): string[] => {
        const lan = lanAddresses().map((ip) => `http://${ip}:${PORT}`);
        return [...lan, `http://localhost:${PORT}`];
    };

    const remember = (text: string): void => {
        state.made.push({ text, at: new Date().toISOString() });
        while (state.made.length > 20) state.made.shift();
    };

    const render = async (text: string, dark: unknown, light: unknown): Promise<string> =>
        QRCode.toString(text, {
            type: "svg",
            margin: MARGIN,
            // L is plenty for a screen read at arm's length, and it keeps the
            // code coarse, which matters more than redundancy at this size.
            errorCorrectionLevel: "L",
            color: { dark: typeof dark === "string" ? dark : DARK, light: typeof light === "string" ? light : LIGHT },
        });

    const tools: SlotTool<QrState>[] = [
        {
            name: "encode",
            title: "A QR code for a text",
            description: "The text as a QR code, returned as an SVG a page can show as it is.",
            inputSchema: obj(
                {
                    text: { type: "string", description: "what the code carries" },
                    dark: { type: "string", description: "colour of the modules; the room's near-black by default" },
                    light: { type: "string", description: "colour behind them; a quiet zone in this colour is part of the code and cannot be removed" },
                },
                ["text"],
            ),
            handle: async (args, s) => {
                const text = String(args.text ?? "");
                if (!text) throw new Error("a code of nothing is nothing");
                const svg = await render(text, args.dark, args.light);
                remember(text);
                s.made = state.made;
                return { text, svg };
            },
        },
        {
            name: "page",
            title: "A QR code for a page of this dashboard",
            description: "The address of a page as a phone on this network must reach it, and its QR code. This is the tool to use rather than encode: a page served at localhost cannot know the address a phone needs, and this process does.",
            inputSchema: obj(
                {
                    page: { type: "string", description: "a page of the dashboard, for instance simulation.html or biomed.html" },
                    dark: { type: "string" },
                    light: { type: "string" },
                },
                ["page"],
            ),
            handle: async (args, s) => {
                const path = safePath(args.page);
                const bases = addresses();
                const url = `${bases[0]}${path}`;
                const svg = await render(url, args.dark, args.light);
                remember(url);
                s.made = state.made;
                log(`[qr] ${path} -> ${url}`);
                // Every address is returned, not only the one drawn: a machine
                // with two network cards answers on both, and the operator is
                // the one who knows which one the phone is on.
                return { url, page: path, addresses: bases.map((b) => `${b}${path}`), svg };
            },
        },
        {
            name: "addresses",
            title: "Where this machine answers",
            description: "Every address this machine serves the dashboard on, the local network ones first and loopback last.",
            inputSchema: obj({}),
            handle: () => ({ addresses: addresses(), port: PORT }),
        },
    ];

    return publishSlot<QrState>({
        slot: "qr",
        description: "A page's address on this network, as a code a phone can read",
        instructions: {
            en: "Makes QR codes. `page` is the one to use for a page of this dashboard: it resolves the address a phone must reach, which a page opened at localhost cannot know. `encode` takes any text.",
            fr: "Fabrique des QR codes. `page` est l'outil à utiliser pour une page de ce tableau de bord : il résout l'adresse que le téléphone doit atteindre, ce qu'une page ouverte sur localhost ne peut pas savoir. `encode` prend n'importe quel texte.",
        },
        stub: false,
        version: "0.2.0",
        wsBase,
        log,
        state,
        tools,
        resources: [
            {
                uri: "qr://addresses",
                name: "Addresses",
                description: "Every address this machine serves the dashboard on, the local network ones first",
                read: () => ({ addresses: addresses(), port: PORT }),
            },
        ],
    });
}
