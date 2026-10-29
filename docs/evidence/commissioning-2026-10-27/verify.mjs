/** Offline evidence verification. Reads this dossier only; no model, network or hardware calls. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

const root = path.dirname(fileURLToPath(import.meta.url));
const read = (name) => fs.readFileSync(path.join(root, name));
const json = (name) => JSON.parse(read(name).toString('utf8'));
const hash = (value) => createHash('sha256').update(value).digest('hex');
const provenance = json('provenance.json');
for (const file of provenance.files) {
    const resolved = path.resolve(root, file.destination);
    assert.ok(resolved.startsWith(root + path.sep), 'exported file stays inside the dossier');
    const content = file.compression === 'gzip' ? gunzipSync(read(file.destination)) : read(file.destination);
    assert.equal(hash(content), file.exportedContentSha256, `exported digest: ${file.destination}`);
    if (file.redactions === 0) assert.equal(hash(content), file.originalSha256, `unaltered source: ${file.destination}`);
}

const saved = json('reference/execution.json');
const execution = saved.record;
assert.equal(hash(JSON.stringify(execution)), saved.sha256, 'execution record integrity');
assert.equal(execution.status, 'done');
assert.equal(execution.report.aborted, null);
assert.equal(hash(read('reference/procedure.json')), execution.report.procedureSha256, 'executed procedure hash');
const mission = json('reference/final-mission-state.json');
assert.equal(mission.status, 'completed');
assert.equal(mission.outcome, 'success');
assert.ok(mission.observations.some((o) => o.runId === execution.runId && o.status === 'done'), 'mission observed this execution');

const approvals = json('reference/approvals.json');
assert.equal(approvals.scientificApproval.decision, 'approve');
assert.equal(approvals.scientificApproval.procedureSha256, execution.report.procedureSha256);
assert.equal(approvals.launchAuthorisation.decision, 'authorise');
assert.equal(approvals.launchAuthorisation.by, execution.report.authorisedBy);
assert.equal(approvals.launchAuthorisation.at, execution.report.authorisedAt);
assert.ok(Date.parse(approvals.scientificApproval.at) <= Date.parse(approvals.launchAuthorisation.at));
assert.ok(Date.parse(approvals.launchAuthorisation.at) <= Date.parse(execution.report.startedAt));

const requirement = json('reference/initial-observation.json').completion.procedure;
const reconstructed = [];
let cursor = 0;
for (const speed of requirement.requiredSpeedsPercent) {
    let start = null;
    let observed = null;
    for (; cursor < execution.speedObservations.length; cursor++) {
        const sample = execution.speedObservations[cursor];
        if (!Number.isFinite(sample.at) || !Number.isFinite(sample.speedPercent) || Math.abs(sample.speedPercent - speed) > requirement.speedTolerancePercent) {
            start = null;
            continue;
        }
        start ??= sample.at;
        if (sample.at - start >= requirement.minimumObservedSeconds * 1000) {
            observed = { speedPercent: speed, startAt: new Date(start).toISOString(), verifiedThrough: new Date(sample.at).toISOString(), observedSeconds: (sample.at - start) / 1000 };
            cursor++;
            break;
        }
    }
    assert.ok(observed, `recorded plateau at ${speed}%`);
    reconstructed.push(observed);
}
assert.deepEqual(reconstructed, json('reference/plateau-check.json').plateaus, 'published plateau summary');
assert.equal(execution.rows.length, 49);
assert.equal(execution.speedObservations.length, 49);

const hatch = json('essais/2026-10-28-sas/excerpts.json');
assert.ok(hatch.some((b) => b.title === 'Supervisor tool call and result' && b.data.id === 'agent.procedure_execute' && b.data.result.ok === false), 'hatch case retains the refusal');
assert.ok(hatch.some((b) => b.title === 'Supervisor decision exchange' && b.data.proposedCapabilityId === 'mission.wait' && /hatch closure/i.test(b.data.mother)), 'hatch response comes from a recorded model exchange');
assert.ok(json('essais/2026-10-28-sas/procedure.json').steps.every((s) => s.hatch === 'open'), 'refused procedure specifies an open hatch');
assert.ok(hatch.some((b) => b.title === 'Mission state' && b.data.status === 'waiting' && b.data.waitingFor === 'event'));

console.log(JSON.stringify({ result: 'pass', sourceFiles: provenance.files.length, execution: execution.runId, missionOutcome: mission.outcome, recordedSamples: execution.rows.length, orderedPlateaus: reconstructed.length, approvalsInOrder: true, hatchCase: 'refusal and model response preserved; no resumed execution claimed' }, null, 2));
