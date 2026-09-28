/**
 * The script of every factory, by topic (2026-09-28): a factory runs whole
 * without a key on its script, asked for by name (`builder: "scripted"`).
 * Each is a `ScriptedBuilderBase`; `tests/conformance.test.ts` checks that
 * every topic has one.
 */
import type { BuilderContext } from "../../harness/core/runner.js";
import type { Topic } from "../../harness/core/task.js";
import type { ScriptedBuilderBase } from "../../harness/core/scripted-base.js";
import { ScriptedCodeBuilder } from "./code.js";
import { ScriptedGraphBuilder } from "./graph.js";
import { ScriptedBuilder } from "./onnx.js";
import { ScriptedProcedureBuilder } from "./procedure.js";

export const SCRIPTED_BUILDERS: Partial<Record<Topic, (context: BuilderContext) => ScriptedBuilderBase>> = {
    onnx: (context) => new ScriptedBuilder(context),
    procedure: (context) => new ScriptedProcedureBuilder(context),
    graph: (context) => new ScriptedGraphBuilder(context),
    code: (context) => new ScriptedCodeBuilder(context),
};
