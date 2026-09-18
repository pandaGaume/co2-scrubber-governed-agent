/**
 * slot `station`, stub. Tier 2 in the architecture: the validated model push,
 * the catalogue, and the journal of stable operating points. The one rule of
 * the station that matters for the demo is real even in the stub: an artifact
 * is registered only with the id of a positive `evaluate` report; a push only
 * sends a registered artifact whose sha256 the request repeats.
 */
import { publishStub } from "../lib/stub-provider.mjs";

const obj = (properties, required = []) => ({ type: "object", properties, required, additionalProperties: false });
const SHA = { type: "string", pattern: "^[0-9a-f]{64}$" };

export function stationSlot(wsBase, log) {
    return publishStub({
        slot: "station",
        description: "The site station (stub): artifact registration under the evaluate rule, validated push, journal of stable operating points",
        wsBase,
        log,
        state: { artifacts: {}, pushed: [], journal: [] },
        tools: [
            {
                name: "register_artifact",
                description: "Register a monitor artifact for push. Refused without the id of a positive evaluate report (the three locks of the design document).",
                inputSchema: obj({ sha256: SHA, contractSha256: SHA, reportId: SHA, verdict: { type: "string", enum: ["pass", "fail"] } }, ["sha256", "contractSha256", "reportId", "verdict"]),
                handle: ({ sha256, contractSha256, reportId, verdict }, s) => {
                    if (verdict !== "pass") throw new Error(`report ${reportId.slice(0, 12)}... has verdict "${verdict}": an artifact is registrable only with a positive evaluate report`);
                    s.artifacts[sha256] = { sha256, contractSha256, reportId, registeredAt: new Date().toISOString() };
                    return { registered: true, sha256 };
                },
            },
            {
                name: "diagnostic_load_model",
                description: "Push a registered artifact to a device (validated: the device checks sha256 and contract). Refused for an unregistered sha256.",
                inputSchema: obj({ deviceId: { type: "string" }, sha256: SHA }, ["deviceId", "sha256"]),
                handle: ({ deviceId, sha256 }, s) => {
                    if (!s.artifacts[sha256]) throw new Error(`sha256 ${sha256.slice(0, 12)}... is not a registered artifact`);
                    s.pushed.push({ deviceId, sha256, at: new Date().toISOString() });
                    return { pushed: true, deviceId, sha256, note: "stub: no device received bytes" };
                },
            },
            {
                name: "journal_rows",
                description: "Rows of the journal of stable operating points, in the shape the fit job reads (duty_percent, current_amps). Stub: empty until a device sends operating_point notifications.",
                inputSchema: obj({ deviceId: { type: "string" }, since: { type: "number" } }),
                handle: ({ deviceId, since }, s) => ({ rows: s.journal.filter((r) => (!deviceId || r.device_id === deviceId) && (since === undefined || r.to >= since)) }),
            },
        ],
        resources: [{ uri: "station://artifacts", name: "Registered artifacts", description: "sha256 -> registration", read: (s) => s.artifacts }],
    });
}
