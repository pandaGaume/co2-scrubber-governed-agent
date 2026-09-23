#!/usr/bin/env node
/**
 * Makes this machine a screen of the demo's room, without typing an address.
 *
 * Copy this one file to a PC or a Mac on the same network as the machine that
 * runs the demo (it needs Node and nothing else), and run it:
 *
 *     node screen.mjs                   the browser opens on the screen page
 *     node screen.mjs --name "left wall"
 *     node screen.mjs --kiosk           full screen, no browser chrome (Chrome or Edge)
 *
 * It asks on the local network where the demo is (a UDP broadcast, answered by
 * the demo's server, `slots/lib/discovery.ts`), then opens the browser on
 * `screen.html` with this machine's name. The page shows a code, `A`, `B`...;
 * the control room sends a page to that code, and this screen shows it.
 *
 * Options: --name <text> (default: this machine's name), --kiosk,
 * --port <udp port> (default 41234), --timeout <seconds> (default 60),
 * --dry-run (print the address, open nothing).
 */
import { createSocket } from "node:dgram";
import { exec } from "node:child_process";
import { hostname, networkInterfaces } from "node:os";

const args = process.argv.slice(2);
const option = (name, fallback) => {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};
const flag = (name) => args.includes(name);
const name = option("--name", hostname());
const udpPort = Number(option("--port", "41234"));
const timeoutS = Number(option("--timeout", "60"));

/** This machine's IPv4 networks: where to broadcast the question, and which answer is reachable from here. */
const nets = [];
for (const list of Object.values(networkInterfaces())) {
    for (const n of list ?? []) {
        if ((n.family === "IPv4" || n.family === 4) && !n.internal) nets.push(n);
    }
}
const toInt = (ip) => ip.split(".").reduce((acc, part) => ((acc << 8) | Number(part)) >>> 0, 0);
const toIp = (x) => [24, 16, 8, 0].map((s) => (x >>> s) & 255).join(".");
const broadcasts = [...new Set([...nets.map((n) => toIp((toInt(n.address) | ~toInt(n.netmask)) >>> 0)), "255.255.255.255"])];
const reachable = (base) => {
    const host = new URL(base).hostname;
    return nets.some((n) => (toInt(n.address) & toInt(n.netmask)) === (toInt(host) & toInt(n.netmask)));
};

function open(url) {
    const kiosk = flag("--kiosk");
    let command;
    if (process.platform === "win32") command = kiosk ? `start "" msedge --kiosk "${url}" --edge-kiosk-type=fullscreen` : `start "" "${url}"`;
    else if (process.platform === "darwin") command = kiosk ? `open -a "Google Chrome" --args --kiosk "${url}"` : `open "${url}"`;
    else command = kiosk ? `google-chrome --kiosk "${url}" || chromium --kiosk "${url}"` : `xdg-open "${url}"`;
    exec(command, (error) => {
        if (error) console.log(`could not open the browser (${error.message}); open ${url} yourself`);
    });
}

const socket = createSocket({ type: "udp4", reuseAddr: true });
const question = Buffer.from(JSON.stringify({ type: "spikypanda.discover", v: 1 }));
let asked = 0;
const ask = () => {
    asked++;
    for (const address of broadcasts) socket.send(question, udpPort, address, () => undefined);
    if (asked === 1) console.log(`looking for the demo on ${broadcasts.join(", ")} (UDP ${udpPort})...`);
};
const giveUp = setTimeout(() => {
    console.log(`no answer in ${timeoutS} s. Is the demo running on this network, and does its firewall let UDP ${udpPort} in? Open http://<its address>:3001/screen.html by hand.`);
    process.exit(1);
}, timeoutS * 1000);

socket.on("message", (data) => {
    let answer;
    try {
        answer = JSON.parse(data.toString("utf8"));
    } catch {
        return;
    }
    if (answer.type !== "spikypanda.here" || !Array.isArray(answer.bases) || !answer.bases.length) return;
    clearTimeout(giveUp);
    clearInterval(again);
    const base = answer.bases.find(reachable) ?? answer.bases[0];
    const url = `${base}${answer.screen ?? "/screen.html"}?name=${encodeURIComponent(name)}`;
    console.log(`found ${answer.name ?? "the demo"} at ${base}; this screen is "${name}": ${url}`);
    if (!flag("--dry-run")) open(url);
    socket.close();
});
socket.on("error", (e) => {
    console.log(`discovery failed: ${e.message}`);
    process.exit(1);
});
socket.bind(0, () => {
    socket.setBroadcast(true);
    ask();
});
const again = setInterval(ask, 2000);
