#!/usr/bin/env node
/**
 * Turns the broker's authorization on for this machine (2026-10-08): writes
 * into `.env` (ignored by git) one token per role of `broker/security.json`
 * and `MCP_BROKER_SECURITY_FILE`, which `npm run server` reads. A token already
 * there is kept, so pages that hold it keep working.
 *
 *     npm run broker:tokens          on: the tokens, then the security file
 *     npm run broker:tokens -- --off off: the security file line commented out, the tokens kept
 *
 * At start the server prints the dashboard's and the tablet's links with
 * their tokens (`#token=...`): open each once on its device.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const ROLES = ["operator", "station", "agent", "factory", "monitor"];
// The providers' secrets (broker/security.json, providers): the server's slots, and the board's, which
// node scripts/board-broker.mjs writes into the board.
const PROVIDERS = ["BROKER_PROVIDER_SECRET_SLOTS", "BROKER_PROVIDER_SECRET_BOARD"];
const SECURITY = "MCP_BROKER_SECURITY_FILE";
const off = process.argv.includes("--off");

const path = ".env";
const lines = existsSync(path) ? readFileSync(path, "utf8").split(/\r?\n/) : [];
const has = (name) => lines.some((l) => new RegExp(`^\\s*${name}=.+`).test(l));
const added = [];

if (!off) {
    for (const name of [...ROLES.map((role) => `BROKER_TOKEN_${role.toUpperCase()}`), ...PROVIDERS]) {
        if (has(name)) continue;
        lines.push(`${name}=${randomBytes(24).toString("base64url")}`);
        added.push(name);
    }
}
const at = lines.findIndex((l) => new RegExp(`^\\s*#?\\s*${SECURITY}=`).test(l));
const line = `${off ? "# " : ""}${SECURITY}=broker/security.json`;
if (at >= 0) lines[at] = line;
else lines.push(line);

writeFileSync(path, `${lines.join("\n").replace(/\n+$/, "")}\n`);
console.log(off ? "broker authorization OFF in .env (tokens kept)" : `broker authorization ON in .env; ${added.length ? `new tokens: ${added.join(", ")}` : "the tokens were already there"}`);
console.log("restart the server (npm run server); it prints each page's link with its token");
