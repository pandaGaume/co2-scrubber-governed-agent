/**
 * The template of a generated plugin, as the forge hands it to whoever
 * writes one (`forge.plugin_template`): a complete minimal plugin exactly
 * as the substrate accepts it, a gain (output = gain times input), so that
 * the shape is read off a working example and not guessed: the entry and
 * its `register(registry, doc)`, the node class on `RuntimeNode` with its
 * ports declared on the instance, an editable parameter, a viewable, the
 * reading of an input from the session's signals and the publishing of an
 * output, the test on node's runner, the card. Imports end in `.js`
 * (NodeNext); the type is named under `Generated.`.
 *
 * The first passage of the code topic on Haiku (2026-09-26) invented a
 * registry API (`registerNodeType`, `factory:`, `ports:`) and imports
 * without extension: the compiler would have refused it all. A template
 * costs a read; a guessed API costs a loop.
 */
export interface TemplateFile {
    path: string;
    content: string;
}

const INDEX = `import type { NodeRegistry } from "@spiky-panda/core";
import { createGainNode, GainNode } from "./gain.node.js";

/** The type, named under Generated. so that every catalogue says it is generated. */
export const GAIN_TYPE = "Generated.Example:gain";

/** The entry the forge calls: register every type of the plugin on the registry; \`doc\` turns a card's file name into the path the catalogue hands out. */
export function register(registry: NodeRegistry, doc: (file: string) => string): void {
    const reg = registry as unknown as { register: (type: string, factory: () => unknown, meta: Record<string, unknown>) => void };
    // The ports are the class's own declarations, read off one instance: never retyped here.
    const node = new GainNode();
    reg.register(GAIN_TYPE, () => createGainNode(), {
        label: "Gain",
        category: "Generated.Example",
        docPath: doc("gain.md"),
        inputPorts: [...node.inputPorts],
        outputPorts: [...node.outputPorts],
        signature: {
            purpose: "multiplies a signal by an editable gain: one input in, the product out",
            inputs: { input: { quantity: "Dimensionless", unit: "ratio", description: "the signal to scale; 0 when unwired" } },
            outputs: { output: { quantity: "Dimensionless", unit: "ratio", description: "gain times the input" } },
            capabilities: ["gain", "scaling"],
        },
    });
}
`;

const NODE = `import { cloneable, editable, viewable, inSlotOf, RuntimeNode } from "@spiky-panda/core";
import type { ICartesian, IChannel, IDeclaresPorts, IOlink, IPortDescriptor, ISession, Nullable } from "@spiky-panda/core";

/** A gain: the input times an editable factor. A node with a state integrated over time extends IntegrableRuntimeNode instead (stateSize, gatherState, writeState, rhs). */
export class GainNode extends RuntimeNode implements IDeclaresPorts {
    @cloneable private _gain: number = 1;
    @cloneable private _output: number = 0;

    // The ports, on the instance: a signal input (optional when the node has a default without it), a signal output.
    public readonly inputPorts: ReadonlyArray<IPortDescriptor> = [{ slot: "input", optional: true, type: "float", kind: "signal" }];
    public readonly outputPorts: ReadonlyArray<IPortDescriptor> = [{ slot: "output", optional: false, type: "float", kind: "signal" }];

    public constructor(onsc: Nullable<IOlink[]> = null, opsc: Nullable<IOlink[]> = null, position?: ICartesian) {
        super(onsc, opsc, position);
    }

    /** An editable parameter: a getter with @editable, a setter through setField (the studio and the documents set it by this name). */
    @editable("number") public get gain(): number {
        return this._gain;
    }
    public set gain(v: number) {
        this.setField("gain", this._gain, Number.isFinite(v) ? v : this._gain, (n) => (this._gain = n));
    }

    /** A viewable: what the node computed on the last tick (a probe of session_run reads it by this name). */
    @viewable("number") public get lastOutput(): number {
        return this._output;
    }

    public override reset(_session: ISession): void {
        this._output = 0;
    }

    /** One tick: read the inputs from the session's signals (the links into this node's slots), compute, publish on the links leaving the output slots. */
    public override fire(session: ISession, _t: number): void {
        const links = session.graph.links as ReadonlyArray<IChannel>;
        let input = 0;
        for (const link of this.opsc<IChannel>()) {
            if (!link.enabled) continue;
            const idx = links.indexOf(link);
            if (idx < 0 || String(inSlotOf(link)) !== "input") continue;
            const v = session.readSignal(idx);
            if (typeof v === "number" && Number.isFinite(v)) input = v;
        }
        const output = this._gain * input;
        this.setField("lastOutput", this._output, output, (n) => (this._output = n));
        for (const link of this.onsc<IChannel>()) {
            if (!link.enabled) continue;
            const idx = links.indexOf(link);
            if (idx >= 0 && String(link.slot) === "output") session.publish(idx, output);
        }
    }
}

export function createGainNode(): GainNode {
    return new GainNode();
}
`;

const TEST = `import { test } from "node:test";
import assert from "node:assert/strict";
import { GainNode } from "./gain.node.js";

test("the gain is editable and its ports are declared", () => {
    const node = new GainNode();
    node.gain = 2.5;
    assert.equal(node.gain, 2.5);
    assert.deepEqual(node.inputPorts.map((p) => p.slot), ["input"]);
    assert.deepEqual(node.outputPorts.map((p) => p.slot), ["output"]);
});
`;

const CARD = `# Gain (generated)

Multiplies its input by an editable gain. The output is published on every tick; \`lastOutput\` is what it computed last. Generated in the forge; not a hand-written node.
`;

/** The template's four files, as a plugin named "gain-template" would hold them. */
export const TEMPLATE_FILES: ReadonlyArray<TemplateFile> = [
    { path: "src/index.ts", content: INDEX },
    { path: "src/gain.node.ts", content: NODE },
    { path: "src/gain.test.ts", content: TEST },
    { path: "docs/gain.md", content: CARD },
];

export const TEMPLATE_NOTE =
    "A complete minimal plugin exactly as the substrate accepts it. Write yours on its shape: the same entry (register(registry, doc), reg.register(type, factory, meta) with the ports read off one instance and a signature), a class on RuntimeNode (IntegrableRuntimeNode for a state integrated over time) with its ports on the instance, @editable parameters set through setField, @viewable values, fire() reading the session's signals and publishing on the links; imports from \"@spiky-panda/core\" and the plugin's own files with the .js extension; a test on node:test; a card. The type is named under Generated.";
