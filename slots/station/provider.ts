/**
 * slot `station`, stub. Tier 2 in the architecture: the validated model push,
 * the catalogue, and the journal of stable operating points. The one rule of
 * the station that matters for the demo is real even in the stub: an artifact
 * is registered only with the id of a positive `evaluate` report; a push only
 * sends a registered artifact whose sha256 the request repeats.
 */
import { objectSchema as obj, publishSlot, type PublishedSlot } from "../lib/slot-server.js";

const SHA = { type: "string", pattern: "^[0-9a-f]{64}$" };

interface Registration {
    sha256: string;
    contractSha256: string;
    reportId: string;
    registeredAt: string;
}
interface JournalRow {
    device_id: string;
    from: number;
    to: number;
    duty_percent: number;
    current_amps: number;
}
export interface StationState {
    artifacts: Record<string, Registration>;
    pushed: Array<{ deviceId: string; sha256: string; at: string }>;
    journal: JournalRow[];
}

const short = (sha: string) => `${sha.slice(0, 12)}...`;

export function stationSlot(wsBase: string, log: (line: string) => void): PublishedSlot<StationState> {
    return publishSlot<StationState>({
        slot: "station",
        description: "The site station (stub): artifact registration under the evaluate rule, validated push, journal of stable operating points",
        instructions: {
            en: "The site station. An artifact is registered only with the id of a positive evaluate report; a push sends only a registered artifact. Both need the operator's approval.",
            fr: "La station du site. Un artefact n'est enregistré qu'avec l'identifiant d'un rapport evaluate positif ; une poussée n'envoie qu'un artefact enregistré. Les deux demandent l'approbation de l'opérateur.",
        },
        wsBase,
        log,
        state: { artifacts: {}, pushed: [], journal: [] },
        tools: [
            {
                name: "register_artifact",
                title: "Register an artifact",
                description: "Register a monitor artifact for push. Refused without the id of a positive evaluate report (the three locks of the design document).",
                inputSchema: obj(
                    {
                        sha256: { ...SHA, description: "sha256 of the artifact" },
                        contractSha256: { ...SHA, description: "sha256 of its input-output contract" },
                        reportId: { ...SHA, description: "id of the evaluate report that judged it" },
                        verdict: { type: "string", enum: ["pass", "fail"], description: "the report's verdict; only pass registers" },
                    },
                    ["sha256", "contractSha256", "reportId", "verdict"],
                ),
                handle: ({ sha256, contractSha256, reportId, verdict }, s) => {
                    if (verdict !== "pass") throw new Error(`report ${short(String(reportId))} has verdict "${verdict}": an artifact is registrable only with a positive evaluate report`);
                    const key = String(sha256);
                    s.artifacts[key] = { sha256: key, contractSha256: String(contractSha256), reportId: String(reportId), registeredAt: new Date().toISOString() };
                    return { registered: true, sha256: key };
                },
            },
            {
                name: "diagnostic_load_model",
                title: "Push a model to a device",
                description: "Push a registered artifact to a device (validated: the device checks sha256 and contract). Refused for an unregistered sha256.",
                inputSchema: obj({ deviceId: { type: "string", description: "the device's id" }, sha256: { ...SHA, description: "sha256 of a registered artifact" } }, ["deviceId", "sha256"]),
                handle: ({ deviceId, sha256 }, s) => {
                    const key = String(sha256);
                    if (!s.artifacts[key]) throw new Error(`sha256 ${short(key)} is not a registered artifact`);
                    s.pushed.push({ deviceId: String(deviceId), sha256: key, at: new Date().toISOString() });
                    return { pushed: true, deviceId, sha256: key, note: "stub: no device received bytes" };
                },
            },
            {
                name: "journal_rows",
                title: "Journal rows",
                description: "Rows of the journal of stable operating points, in the shape the fit job reads (duty_percent, current_amps). Stub: empty until a device sends operating_point notifications.",
                inputSchema: obj({ deviceId: { type: "string", description: "only this device's rows" }, since: { type: "number", description: "only rows ending at or after this time" } }),
                handle: ({ deviceId, since }, s) => ({ rows: s.journal.filter((r) => (!deviceId || r.device_id === deviceId) && (since === undefined || r.to >= Number(since))) }),
            },
        ],
        resources: [{ uri: "station://artifacts", name: "Registered artifacts", description: "sha256 -> registration", read: (s) => s.artifacts }],
    });
}
