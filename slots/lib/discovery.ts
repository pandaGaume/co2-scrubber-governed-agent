/**
 * How a machine of the room finds this server without being told its address.
 *
 * `scripts/screen.mjs`, run on a PC or a Mac on the same network, sends a
 * question in a UDP broadcast; this answers it, from the machine that runs the
 * broker, with the addresses the dashboard is served on and the page a screen
 * opens. The screen then registers with the `screens` slot like any other.
 *
 * Nothing here is part of MCP or of the broker: it is the one step before
 * them, the address, which a browser cannot find by itself. The answer names
 * only what the dashboard already shows to anyone on the network (its
 * addresses and a page path); it carries no key and grants nothing. The broker
 * still decides who may do what, as it does for a page opened by hand.
 *
 * The question and the answer are one JSON datagram each:
 *   { "type": "spikypanda.discover", "v": 1 }
 *   { "type": "spikypanda.here", "v": 1, "name": ..., "bases": [...], "screen": "/screen.html" }
 * The bases come first on the asker's own subnet, so a machine with two
 * network cards is answered with the address the asker can reach.
 */
import { createSocket, type RemoteInfo } from "node:dgram";
import { networkInterfaces } from "node:os";

export const DISCOVERY_PORT = 41234;

/** The IPv4 addresses of this machine with their masks, loopback left out. */
function lanInterfaces(): Array<{ address: string; netmask: string }> {
    const out: Array<{ address: string; netmask: string }> = [];
    for (const list of Object.values(networkInterfaces())) {
        for (const n of list ?? []) {
            const v4 = n.family === "IPv4" || (n.family as unknown as number) === 4;
            if (v4 && !n.internal) out.push({ address: n.address, netmask: n.netmask });
        }
    }
    return out;
}

const toInt = (ip: string) => ip.split(".").reduce((acc, part) => ((acc << 8) | Number(part)) >>> 0, 0);
const sameSubnet = (a: string, b: string, mask: string) => (toInt(a) & toInt(mask)) === (toInt(b) & toInt(mask));

export interface Discovery {
    close(): void;
}

/** Answers the room's machines asking where the dashboard is. A port already taken (a second server) is said and left alone. */
export function startDiscovery(httpPort: number, log: (line: string) => void, udpPort = Number(process.env.DISCOVERY_PORT ?? DISCOVERY_PORT)): Discovery {
    const socket = createSocket({ type: "udp4", reuseAddr: true });
    socket.on("error", (e) => {
        log(`discovery: not answering on UDP ${udpPort} (${e.message}); screens can still open http://<this machine>:${httpPort}/screen.html by hand`);
        socket.close();
    });
    socket.on("message", (data: Buffer, from: RemoteInfo) => {
        let question: { type?: unknown; v?: unknown };
        try {
            question = JSON.parse(data.toString("utf8"));
        } catch {
            return;
        }
        if (question.type !== "spikypanda.discover") return;
        const nets = lanInterfaces();
        const near = nets.filter((n) => sameSubnet(n.address, from.address, n.netmask));
        const ordered = [...near, ...nets.filter((n) => !near.includes(n))];
        const answer = { type: "spikypanda.here", v: 1, name: "co2-scrubber-governed-agent", bases: ordered.map((n) => `http://${n.address}:${httpPort}`), screen: "/screen.html" };
        socket.send(JSON.stringify(answer), from.port, from.address);
        log(`discovery: ${from.address} asked; answered ${answer.bases[0] ?? "no address"}`);
    });
    socket.bind(udpPort, () => log(`discovery: answering the room's screens on UDP ${udpPort} (scripts/screen.mjs)`));
    return { close: () => socket.close() };
}
