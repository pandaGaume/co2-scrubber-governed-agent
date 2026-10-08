#!/usr/bin/env node
/**
 * Points the scrubber board at this machine's broker (2026-10-08). The board
 * dials out to the broker as the provider of the `scrubber` slot
 * (ws://<host>:<port>/provider/scrubber); where to dial is its `Device/Broker`
 * configuration section, written over the board's own WebSocket (the phone
 * page's, ws://<board>/ws) by `config.set`, read again at its next start.
 *
 *     node scripts/board-broker.mjs <board address> [this machine's address] [port]
 *     node scripts/board-broker.mjs 192.168.0.42                 the address and port guessed here
 *     node scripts/board-broker.mjs 192.168.0.42 --status        what the board's link says, nothing written
 *
 * The board's address is on its phone page (NETWORK panel). After writing,
 * restart the board (power or reset button): the section is read at start.
 */
import { networkInterfaces } from "node:os";

const [board, second, third] = process.argv.slice(2);
if (!board) {
    console.log("usage: node scripts/board-broker.mjs <board address> [this machine's address] [port] | <board address> --status");
    process.exit(1);
}
const statusOnly = second === "--status";
const lan = Object.values(networkInterfaces()).flat().filter((n) => n && n.family === "IPv4" && !n.internal).map((n) => n.address);
// The address on the board's network: the one sharing its first three numbers, or the first one.
const sameNet = lan.find((a) => a.split(".").slice(0, 3).join(".") === board.split(".").slice(0, 3).join("."));
const host = statusOnly ? null : (second ?? sameNet ?? lan[0]);
const port = Number(third ?? process.env.MCP_BROKER_PORT ?? 3001);

const ws = new WebSocket(`ws://${board}/ws`);
let id = 0;
const pending = new Map();
const rpc = (method, params) =>
    new Promise((resolve, reject) => {
        const n = ++id;
        pending.set(n, { resolve, reject });
        ws.send(JSON.stringify({ jsonrpc: "2.0", id: n, method, ...(params ? { params } : {}) }));
        setTimeout(() => pending.has(n) && (pending.delete(n), reject(new Error(`${method}: no answer in 5 s`))), 5000);
    });
ws.onmessage = (event) => {
    let m;
    try {
        m = JSON.parse(String(event.data));
    } catch {
        return;
    }
    const p = m.id !== undefined ? pending.get(m.id) : undefined;
    if (!p) return;
    pending.delete(m.id);
    if (m.error) p.reject(new Error(m.error.message ?? JSON.stringify(m.error)));
    else p.resolve(m.result);
};
ws.onerror = () => {
    console.log(`the board does not answer at ws://${board}/ws: is it on this network, and is ${board} its address (its phone page, NETWORK panel)?`);
    process.exit(1);
};
ws.onopen = async () => {
    try {
        if (!statusOnly) {
            const doc = JSON.stringify({ version: 1, host, port, tls: false, slot: "scrubber", token: "" });
            await rpc("config.set", { section: "Device/Broker", doc });
            console.log(`written on the board: Device/Broker ${doc}`);
        }
        const s = await rpc("broker.getStatus");
        console.log(`the board's link: ${JSON.stringify(s)}`);
        if (!statusOnly) console.log(`restart the board (power or reset): it reads the section at start and dials ws://${host}:${port}/provider/scrubber; the server must run with --board`);
    } catch (e) {
        console.log(`the board refused: ${e.message}`);
        process.exitCode = 1;
    } finally {
        ws.close();
    }
};
