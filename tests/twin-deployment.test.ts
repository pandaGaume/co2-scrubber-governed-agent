/** Genuine graph execution, held-out replay, station approval and durable activation. No cloud or hardware. */
import { it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { startAllOrFail } from "./lib/start.js";
import { Broker } from "../harness/lib/broker.js";
import { taskDir, WORKSHOP_ROOT, sha256Of } from "../slots/tools/lib/workshop.js";
import { evaluateCandidate } from "../harness/topics/graph/evaluate.js";
import type { TaskFile } from "../harness/core/task.js";
import type { DeviceDescriptor } from "../slots/station/registry.js";
import type { Question } from "../slots/station/questions.js";
import { TwinDeployments, type TwinEvaluation } from "../slots/twin/deployments.js";

it("validates a real candidate independently, requires a genuine commander answer, installs exact bytes durably and executes them", { timeout: 60000 }, async () => {
    const root = mkdtempSync(path.join(tmpdir(), "twin-deployment-"));
    const saved = process.env.TWIN_DEPLOYMENT_DIR;
    const savedRoles = process.env.STATION_ROLES_FILE;
    process.env.TWIN_DEPLOYMENT_DIR = root;
    process.env.STATION_ROLES_FILE = path.join(root, "roles.json");
    const roles = JSON.stringify({ roles: { "authorised-signatory": { does: "signs test documents", holders: ["signatory-test"] }, commander: { does: "authorises test installation", holders: ["commander-test"] } } });
    writeFileSync(process.env.STATION_ROLES_FILE, roles);
    let started: Awaited<ReturnType<typeof startAllOrFail>> | undefined;
    let broker: Broker | undefined;
    const tasks: string[] = [];
    const deviceId = "/habitat/lab/eclss/deployment-test";
    const descriptor: DeviceDescriptor = { "@type": "CO2Scrubber", title: "Deployment test scrubber", properties: { speed: { quantity: "Ratio", unit: "%" } }, actions: ["set_speed"] };
    const devices = [{ path: deviceId, descriptor }];
    try {
        started = await startAllOrFail(3172);
        broker = new Broker(started.broker.httpBase, { name: "deployment-test", version: "1" }, "station");
        const call = async <T>(slot: string, tool: string, input: Record<string, unknown> = {}): Promise<T> => {
            const r = await broker!.call(slot, tool, input);
            assert.equal(r.ok, true, r.error);
            return r.output as T;
        };
        const request = async (values: number[]) => {
            const result = await call<{ taskId: string }>("factory", "request", { objective: { required_outputs: [{ name: "co2", quantity: "Concentration", unit: "ppm" }], constraints: { residualPpmMax: 1, absoluteResidualPpmMax: 2 } }, topics: ["graph"], observations: { devices, source: "simulated test fixture" }, data: [{ file: "telemetry.json", rows: values.map((co2, minute) => ({ minute, co2 })) }], run: false, requestedBy: "twin-deployment-test" });
            tasks.push(result.taskId);
            return result.taskId;
        };
        const questions = async () => {
            const result = await (await broker!.session("station")).request<{ contents: Array<{ text: string }> }>("resources/read", { uri: "station://questions" });
            return JSON.parse(result.contents[0].text) as Question[];
        };
        const mother = async () => {
            const result = await (await broker!.session("station")).request<{ contents: Array<{ text: string }> }>("resources/read", { uri: "station://mother" });
            return result.contents[0].text;
        };
        await call("station", "registry_register", { path: deviceId, descriptor });
        const capabilities = await call<{ available: boolean }>("station", "twin_services");
        assert.equal(capabilities.available, true);
        writeFileSync(process.env.STATION_ROLES_FILE, JSON.stringify({ roles: { commander: { does: "authorises installation", holders: [] } } }));
        const noCommander = await call<{ installationAuthority: { available: boolean } }>("station", "twin_services");
        assert.equal(noCommander.installationAuthority.available, false);
        assert.match(await mother(), /no authorised commander/);
        writeFileSync(process.env.STATION_ROLES_FILE, roles);
        assert.equal((await call<{ installed: boolean }>("station", "twin_state", { deviceId })).installed, false);
        const absent = await broker.call("station", "twin_run", { deviceId });
        assert.equal(absent.ok, false);
        assert.match(await mother(), /no current validated twin installed/);

        const taskId = await request([1000, 1000, 1000]);
        const task = JSON.parse(readFileSync(path.join(taskDir(taskId), "task.json"), "utf8")) as TaskFile;
        const candidate = (await evaluateCandidate({ label: "constant CO2 graph fixture", spec: { nodes: [{ id: "co2", typeId: "Logic.Input:constant", params: { value: 1000 } }], connections: [] }, compare: [{ node: "co2", property: "value", column: "co2" }] }, { broker, taskId, task: task.task, rows: [0, 1, 2].map((minute) => ({ minute, co2: 1000 })), remaining: 5, n: 1 })).candidate;
        assert.equal(candidate.pass, true);
        // This file is a factory fixture; admission still recomputes numerical validation in the actual runtime.
        writeFileSync(path.join(taskDir(taskId), "candidates.json"), JSON.stringify([candidate]));
        const artifacts = [{ kind: "graph", path: candidate.path, sha256: candidate.sha256 }];
        const manifest = JSON.stringify({ state: "proposed", taskId, artifacts, task: { file: "task.json", sha256: sha256Of(readFileSync(path.join(taskDir(taskId), "task.json"))) } });
        writeFileSync(path.join(taskDir(taskId), "manifest.json"), manifest);
        const proposal = await call<{ proposalId: string }>("station", "propose", { taskId, artifacts, manifestSha256: sha256Of(manifest), claims: { summary: "test fixture handover" } });
        const validationTaskId = await request([1000.1, 999.9, 1000.2]);
        const validation = { proposalId: proposal.proposalId, deviceId, validationTaskId, validationFile: "telemetry.json" };

        const reused = await broker.call("station", "twin_validate", { ...validation, validationTaskId: taskId });
        assert.equal(reused.ok, false);
        assert.match(reused.error ?? "", /separate held-out/);
        const duplicateTask = await request([1000, 1000, 1000]);
        const duplicate = await broker.call("station", "twin_validate", { ...validation, validationTaskId: duplicateTask });
        assert.equal(duplicate.ok, false);
        assert.match(duplicate.error ?? "", /duplicates calibration/);
        const failedTask = await request([2000, 2001, 2002]);
        const failed = await call<{ report: TwinEvaluation }>("station", "twin_validate", { ...validation, validationTaskId: failedTask });
        assert.equal(failed.report.verdict, "fail");
        assert.equal((await broker.call("station", "twin_admit", { proposalId: proposal.proposalId, deviceId, reportId: failed.report.reportId })).ok, false);

        const result = await call<{ report: TwinEvaluation; installed: boolean }>("station", "twin_validate", validation);
        assert.equal(result.report.verdict, "pass");
        assert.equal(result.installed, false);
        assert.ok(result.report.residuals[0].rmse > 0, "the independent held-out values are actually compared");
        const admission = { proposalId: proposal.proposalId, deviceId, reportId: result.report.reportId };
        await call("station", "questions_policy", { mode: "auto", choice: "install" });
        const ask = await call<{ questionId: string }>("station", "twin_admit", admission);
        assert.equal((await questions()).find((q) => q.id === ask.questionId)?.status, "open", "a standing order cannot install a twin");
        const repeatAsk = await call<{ questionId: string }>("station", "twin_admit", admission);
        assert.equal(repeatAsk.questionId, ask.questionId, "no duplicate approval question");
        const question = (await questions()).find((q) => q.id === ask.questionId)!;
        const token = (question.context as { token: string }).token;
        const forged = await broker.call("station", "twin_install", { token, questionId: question.id, answer: { choice: "install", by: "commander-test" } });
        assert.equal(forged.ok, false, "supplied answer is not an authoritative answer");
        assert.equal((await broker.call("station", "answer", { questionId: ask.questionId, choice: "install", by: "intruder" })).ok, false);
        await call("station", "answer", { questionId: ask.questionId, choice: "refuse", by: "commander-test", how: "typed" });
        assert.equal((await call<{ installed: boolean }>("station", "twin_state", { deviceId })).installed, false);
        const askAgain = await call<{ questionId: string }>("station", "twin_admit", admission);
        const answer = await call<{ resumed: { installed?: boolean } }>("station", "answer", { questionId: askAgain.questionId, choice: "install", by: "commander-test", how: "typed" });
        assert.equal(answer.resumed.installed, true, JSON.stringify(answer));
        const state = await call<{ installed: boolean; installation: { sha256: string } }>("station", "twin_state", { deviceId });
        assert.equal(state.installed, true);
        assert.equal(state.installation.sha256, candidate.sha256);
        const replay = await call<{ installation: { sha256: string }; result: { series: Record<string, number[]> } }>("station", "twin_run", { deviceId, minutes: 2 });
        assert.equal(replay.installation.sha256, candidate.sha256);
        assert.deepEqual(replay.result.series["co2.value"], [1000, 1000, 1000]);
        assert.equal((await broker.call("station", "twin_run", { deviceId, minutes: 3 })).ok, false, "queries cannot silently exceed the validated horizon");
        assert.match(await mother(), /Twin installed for/);
        assert.equal(new TwinDeployments().active(deviceId)[0].sha256, candidate.sha256, "activation survives a new service instance");
        const bytesFile = path.join(root, "artifacts", `${candidate.sha256}.json`);
        const original = readFileSync(bytesFile);
        writeFileSync(bytesFile, "{}");
        assert.equal((await broker.call("station", "twin_run", { deviceId })).ok, false, "tampered deployed bytes cannot run");
        writeFileSync(bytesFile, original);
        const sourceFile = path.join(taskDir(taskId), candidate.path);
        const source = readFileSync(sourceFile);
        writeFileSync(sourceFile, "{}");
        assert.equal((await broker.call("station", "twin_admit", admission)).ok, false, "a changed proposal cannot obtain a new approval");
        writeFileSync(sourceFile, source);
        await started.slots.find((s) => s.slot === "twin")!.close();
        const missing = await call<{ available: boolean; missing: string[] }>("station", "twin_services");
        assert.equal(missing.available, false);
        assert.ok(missing.missing.includes("twin.install"));
        assert.match(await mother(), /Twin services missing/);
    } finally {
        await broker?.close();
        if (started) { for (const slot of started.slots) await slot.close(); await started.broker.stop(); }
        for (const id of tasks) {
            const target = path.resolve(taskDir(id));
            if (path.dirname(target) === path.resolve(WORKSHOP_ROOT) && existsSync(target)) rmSync(target, { recursive: true, force: true });
        }
        rmSync(root, { recursive: true, force: true });
        if (saved === undefined) delete process.env.TWIN_DEPLOYMENT_DIR; else process.env.TWIN_DEPLOYMENT_DIR = saved;
        if (savedRoles === undefined) delete process.env.STATION_ROLES_FILE; else process.env.STATION_ROLES_FILE = savedRoles;
    }
});


