import { RuntimeNode, InputPort, OutputPort, Session } from '@spiky-panda/core';

export class LeakCO2 extends RuntimeNode {
  private _rateKgPerS: number = 0.001; // editable: kg/s at full opening
  private _lastLeaked: number = 0; // kg leaked on last tick

  inputPorts: InputPort[] = [
    {
      slot: 'command',
      optional: true,
      type: 'float',
      unit: null,
      kind: 'signal',
      multiplicity: 'single',
    },
  ];

  outputPorts: OutputPort[] = [
    {
      slot: 'co2Delta',
      optional: false,
      type: 'float',
      unit: null,
      kind: 'signal',
      multiplicity: 'single',
    },
    {
      slot: 'lastLeaked',
      optional: false,
      type: 'float',
      unit: null,
      kind: 'signal',
      multiplicity: 'single',
    },
  ];

  @editable
  get rateKgPerS(): number {
    return this._rateKgPerS;
  }

  set rateKgPerS(value: number) {
    this._rateKgPerS = Math.max(0, value);
  }

  @viewable
  get lastLeaked(): number {
    return this._lastLeaked;
  }

  fire(session: Session, t: number): void {
    // Read command input (0 to 1); default to 1 if unwired
    const command = session.readSignal(this, 'command') ?? 1.0;
    const clampedCommand = Math.max(0, Math.min(1, command));

    // Calculate CO2 mass flow leaving (negative: outflow from atmosphere)
    const co2DeltaKgPerS = -clampedCommand * this._rateKgPerS;

    // Calculate mass that left in this tick
    const dt = session.dt ?? 1.0;
    this._lastLeaked = Math.abs(co2DeltaKgPerS) * dt;

    // Publish outputs
    session.writeSignal(this, 'co2Delta', co2DeltaKgPerS);
    session.writeSignal(this, 'lastLeaked', this._lastLeaked);
  }
}
