import {
    RuntimeNode,
    InputPort,
    OutputPort,
    editable,
    viewable
} from "@spiky-panda/core";

/**
 * A CO2 leak or controlled vent: outputs a negative mass flow (CO2 leaving)
 * scaled by a command signal (0 to 1) and an editable maximum rate.
 */
export class LeakCo2Node extends RuntimeNode {
    private _maxRateKgPerS: number = 0.001; // kg/s at full opening
    private _lastLeakRate: number = 0; // kg/s on last tick

    readonly inputPorts = [
        new InputPort("command", "Dimensionless", "ratio")
    ];

    readonly outputPorts = [
        new OutputPort("co2Delta", "MassFlow", "kg/s"),
        new OutputPort("lastLeakRate", "MassFlow", "kg/s")
    ];

    @editable()
    get maxRateKgPerS(): number {
        return this._maxRateKgPerS;
    }

    set maxRateKgPerS(value: number) {
        this._maxRateKgPerS = Math.max(0, value);
    }

    @viewable()
    get lastLeakRate(): number {
        return this._lastLeakRate;
    }

    fire(session: any, t: number): void {
        // Read command input (0 to 1), default to 0 if unwired
        const command = session.readSignal(this, "command") ?? 0;
        const clampedCommand = Math.max(0, Math.min(1, command));

        // Calculate leak rate: negative because CO2 leaves the system
        this._lastLeakRate = -clampedCommand * this._maxRateKgPerS;

        // Publish outputs
        session.writeSignal(this, "co2Delta", this._lastLeakRate);
        session.writeSignal(this, "lastLeakRate", this._lastLeakRate);
    }
}

/** Factory function to create a new LeakCo2Node instance. */
export function createLeakCo2Node(): LeakCo2Node {
    return new LeakCo2Node();
}
