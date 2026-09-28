/**
 * The relations between quantities (harness/lib/relations.ts): the documented
 * figures come back, the parameters are said given or defaulted, a missing
 * volume is refused, and a plan maps an output through a declared conversion.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { relate as relateWith, relationBetween } from "../harness/lib/relations.js";
import { relationDefaults } from "../slots/physics/provider.js";

// The defaults are the library's facts, as the physics slot reads them.
const DEFAULTS = relationDefaults();
const relate = (...a: [Parameters<typeof relateWith>[0], Parameters<typeof relateWith>[1], Parameters<typeof relateWith>[2], Parameters<typeof relateWith>[3]?]) => relateWith(a[0], a[1], a[2], a[3] ?? {}, DEFAULTS);

const close = (a: number, b: number, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${a} is not ${b}`);

describe("the relations between quantities", () => {
    it("a person's CO2 in g/min is the NASA card's L/min, and back", () => {
        const r = relate(0.69, { quantity: "MassFlow", unit: "g/min" }, { quantity: "VolumetricFlow", unit: "L/min" });
        close(r.value, 0.377);
        assert.equal(r.relation, "gas-volume-flow-to-mass-flow");
        assert.equal(r.direction, "inverse");
        assert.deepEqual(Object.fromEntries(Object.entries(r.parameters).map(([k, v]) => [k, v.given])), { P: false, T: false, M: false });
        assert.deepEqual(Object.fromEntries(Object.entries(r.parameters).map(([k, v]) => [k, v.fact])), { P: "cabin.air.pressurePa", T: "cabin.air.temperatureK", M: "co2.molarMass" }, "each default names its fact");
        assert.throws(() => relateWith(0.69, { quantity: "MassFlow", unit: "g/min" }, { quantity: "VolumetricFlow", unit: "L/min" }), /needs P .*T .*M /, "no default in the code");
        close(relate(r.value, { quantity: "VolumetricFlow", unit: "L/min" }, { quantity: "MassFlow", unit: "g/min" }).value, 0.69);
    });
    it("1000 ppm of CO2 is about 1830 mg/m3 at the cabin's conditions, and the conditions can be given", () => {
        close(relate(1000, { quantity: "Concentration", unit: "ppm" }, { quantity: "MassConcentration", unit: "mg/m3" }).value, 1829.8);
        const warm = relate(1000, { quantity: "Concentration", unit: "ppm" }, { quantity: "MassConcentration", unit: "mg/m3" }, { T: { value: 298.15, unit: "K" } });
        close(warm.value, 1799.1);
        assert.equal(warm.parameters.T.given, true);
    });
    it("a scrubber's mass flow from a volume of air reads as ppm per minute; without the volume it is refused", () => {
        const r = relate(1e-4, { quantity: "MassFlow", unit: "kg/s" }, { quantity: "ConcentrationRate", unit: "ppm/min" }, { V: 30 });
        close(r.value, 109.3);
        assert.equal(r.derived, true);
        assert.throws(() => relate(1e-4, { quantity: "MassFlow", unit: "kg/s" }, { quantity: "ConcentrationRate", unit: "ppm/min" }), /needs V \(the volume of air the gas flows into, in m3\)/);
        assert.throws(() => relate(1, { quantity: "MassFlow", unit: "kg/s" }, { quantity: "Pressure", unit: "Pa" }), /no relation ties MassFlow to Pressure/);
        assert.equal(relationBetween("VolumetricFlow", "MassFlow")?.relation.id, "gas-volume-flow-to-mass-flow");
    });
});
