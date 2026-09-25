/**
 * The generated plugin the tests and the scripted code builder write: a CO2
 * leak, `Generated.Habitat:leak`, a constant mass flow out of a volume
 * scaled by a command. Small enough to compile in a second, complete
 * enough to go through every check of the forge (a signature with units the
 * units service resolves, a card, a test). `type` and `unit` are
 * parameters so a test can make the forge refuse it.
 */
export interface FixtureFile {
    path: string;
    content: string;
}

const INDEX = `import type { NodeRegistry } from "@spiky-panda/core";
import { createLeakNode, LeakNode } from "./leak.node.js";

export const LEAK_TYPE = "TYPE_NAME";

export function register(registry: NodeRegistry, doc: (file: string) => string): void {
    const reg = registry as unknown as { register: (type: string, factory: () => unknown, meta: Record<string, unknown>) => void };
    const node = new LeakNode();
    reg.register(LEAK_TYPE, () => createLeakNode(), {
        label: "CO2 leak",
        category: "Generated.Habitat",
        docPath: doc("leak.md"),
        inputPorts: [...node.inputPorts],
        outputPorts: [...node.outputPorts],
        signature: {
            purpose: "a leak of CO2 out of a volume: a constant mass flow scaled by a command, for an atmosphere's delta_CO2 input",
            inputs: { command: { quantity: "Dimensionless", unit: "ratio", description: "0 to 1, how open the leak is; 1 when unwired" } },
            outputs: { co2Delta: { quantity: "MassFlow", unit: "UNIT_NAME", description: "minus the mass leaking per second" } },
            capabilities: ["sink", "co2", "leak"],
        },
    });
}
`;

const NODE = `import { cloneable, editable, viewable, inSlotOf, RuntimeNode } from "@spiky-panda/core";
import type { ICartesian, IChannel, IDeclaresPorts, IOlink, IPortDescriptor, ISession, Nullable } from "@spiky-panda/core";

/** A leak: CO2 leaves the volume at a constant rate, scaled by a command. */
export class LeakNode extends RuntimeNode implements IDeclaresPorts {
    @cloneable private _rate: number = 1e-5;
    @cloneable private _delta: number = 0;

    public readonly inputPorts: ReadonlyArray<IPortDescriptor> = [{ slot: "command", optional: true, type: "float", kind: "signal" }];
    public readonly outputPorts: ReadonlyArray<IPortDescriptor> = [{ slot: "co2Delta", optional: false, type: "float", kind: "signal" }];

    public constructor(onsc: Nullable<IOlink[]> = null, opsc: Nullable<IOlink[]> = null, position?: ICartesian) {
        super(onsc, opsc, position);
    }

    /** The mass leaking per second at full opening, kg/s. */
    @editable("number") public get rateKgps(): number {
        return this._rate;
    }
    public set rateKgps(v: number) {
        this.setField("rateKgps", this._rate, Math.max(0, v), (n) => (this._rate = n));
    }
    /** What left on the last tick, kg/s (negative). */
    @viewable("number") public get co2DeltaKgps(): number {
        return this._delta;
    }

    public override reset(_session: ISession): void {
        this._delta = 0;
    }

    public override fire(session: ISession, _t: number): void {
        const links = session.graph.links as ReadonlyArray<IChannel>;
        let command = 1;
        for (const link of this.opsc<IChannel>()) {
            if (!link.enabled) continue;
            const idx = links.indexOf(link);
            if (idx < 0 || String(inSlotOf(link)) !== "command") continue;
            const v = session.readSignal(idx);
            if (typeof v === "number" && Number.isFinite(v)) command = Math.max(0, Math.min(1, v));
        }
        const delta = -this._rate * command;
        this.setField("co2DeltaKgps", this._delta, delta, (n) => (this._delta = n));
        for (const link of this.onsc<IChannel>()) {
            if (!link.enabled) continue;
            const idx = links.indexOf(link);
            if (idx >= 0 && String(link.slot) === "co2Delta") session.publish(idx, delta);
        }
    }
}

export function createLeakNode(): LeakNode {
    return new LeakNode();
}
`;

const TEST = `import { test } from "node:test";
import assert from "node:assert/strict";
import { LeakNode } from "./leak.node.js";

test("the leak's rate is editable and never negative; its ports are declared", () => {
    const node = new LeakNode();
    node.rateKgps = 2e-5;
    assert.equal(node.rateKgps, 2e-5);
    node.rateKgps = -1;
    assert.equal(node.rateKgps, 0);
    assert.deepEqual(node.outputPorts.map((p) => p.slot), ["co2Delta"]);
    assert.deepEqual(node.inputPorts.map((p) => p.slot), ["command"]);
});
`;

const CARD = `# CO2 leak (generated)

A leak out of a volume: a constant mass flow of CO2, in kg/s, scaled by a command between 0 and 1 (1 when nothing is wired). Wire \`co2Delta\` into an atmosphere's \`delta_CO2\` input. Generated in the forge; not a hand-written node.
`;

export const LEAK_TYPE = "Generated.Habitat:leak";

/** The four files of the leak plugin, with the type name and the output unit asked for. */
export function leakFixture(type = LEAK_TYPE, unit = "kg/s"): FixtureFile[] {
    return [
        { path: "src/index.ts", content: INDEX.replace("TYPE_NAME", type).replace("UNIT_NAME", unit) },
        { path: "src/leak.node.ts", content: NODE },
        { path: "src/leak.test.ts", content: TEST },
        { path: "docs/leak.md", content: CARD },
    ];
}

/** A document that wires a timeline into the leak's command, for a run in the forge. */
export function leakSpec(command = 0.5, rateKgps = 2e-5): { nodes: unknown[]; connections: unknown[] } {
    return {
        nodes: [
            { id: "command", typeId: "Logic.Time:timeline", params: { segments: JSON.stringify([{ from: 0, to: 1e9, value: command }]), defaultValue: command } },
            { id: "leak", typeId: LEAK_TYPE, params: { rateKgps } },
        ],
        connections: [{ from: ["command", "value"], to: ["leak", "command"] }],
    };
}
