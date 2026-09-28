/**
 * The relations between quantities (harness/lib/relations.ts): the documented
 * figures come back, the parameters are said given or defaulted, a missing
 * volume is refused, and a plan maps an output through a declared conversion.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { relate as relateWith, relationBetween } from "../slots/physics/relations.js";
import { relationDefaults } from "../slots/physics/provider.js";
import { physicsKnowledge } from "../slots/physics/knowledge.js";
import { ONTOLOGY, quantityNames, quantityUnits } from "@spiky-panda/core";
import { canonicalQuantity } from "../slots/physics/units.js";

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

    it("the relations are a SpikyPanda graph: typed nodes and links, walked to a relation's sides, its law's constants, a unit's factor, a chain of relations (2026-09-28)", () => {
        const k = physicsKnowledge();
        // Every item is typed by the ontology, the types generalise.
        assert.ok(k.graph.nodes.length > 0 && k.graph.links.length > 0);
        assert.ok(k.graph.nodes.every((n) => ONTOLOGY.isA(n.type, "physics.item")) && k.graph.links.every((l) => ONTOLOGY.isA(l.type, "physics.link")));
        assert.deepEqual(k.nodesOf("physics.relation").map((n) => n.id).sort(), ["gas-volume-flow-to-mass-flow", "mass-flow-to-fraction-rate", "volume-fraction-to-mass-concentration"]);
        // A relation's sides and parameters are its typed links; R is the ideal gas law's constant, reached through follows and uses.
        const rel = k.node("mass-flow-to-fraction-rate")!;
        const sides = k.sidesOf(rel);
        assert.deepEqual([sides.from.id, sides.to.id, sides.parameters.map((p) => `${p.name}:${String(p.quantity.id)}`).sort()], ["MassFlow", "ConcentrationRate", ["M:MolarMass", "P:Pressure", "T:Temperature", "V:Volume"]]);
        assert.deepEqual(k.constantsOf(rel), { R: 8.314462618 });
        // Which relations need the pressure: the parameter links leaving the quantity.
        assert.equal(k.out(k.quantity("Pressure")!, "physics.parameter").length, 3);
        // A derived reading's units measure it, with their factor.
        close(k.unitsOf(k.quantity("ConcentrationRate")!)["ppm/min"], 1e-6 / 60, 1e-12);
        // Two relations chained: a volume flow of gas into a volume reads as a fraction rate.
        assert.deepEqual(k.pathBetween("VolumetricFlow", "ConcentrationRate")?.map((p) => `${String(p.relation.id)}:${p.direction}`), ["gas-volume-flow-to-mass-flow:forward", "mass-flow-to-fraction-rate:forward"]);
        assert.deepEqual(k.pathBetween("MassConcentration", "Dimensionless")?.map((p) => p.direction), ["inverse"]);
        assert.equal(k.pathBetween("MassFlow", "Pressure"), null);
    });

    it("every unit of the core's unit system is a node of the graph, measuring its quantity with the core's factor; a name a person writes names a quantity by its link (2026-09-28)", () => {
        const k = physicsKnowledge();
        let units = 0;
        for (const q of quantityNames()) {
            const quantity = k.quantity(q);
            assert.ok(quantity, `the quantity ${q} is a node`);
            for (const [key, u] of Object.entries(quantityUnits(q) ?? {})) {
                units++;
                const node = k.node(`unit:${q}:${key}`);
                assert.ok(node && node.type === "physics.unit", `the unit ${key} of ${q} is a node`);
                const measures = k.out(node!, "physics.measures");
                assert.equal(measures.length, 1);
                assert.equal(measures[0].ofin, quantity, `${key} measures ${q}`);
                assert.equal(measures[0].bag?.factor, u.value, `${key}: the core's factor`);
                if (u.ucum) assert.equal(node!.bag?.ucum, u.ucum);
            }
        }
        assert.ok(units > 100, String(units));
        assert.equal(k.nodesOf("physics.unit").length, units + 4, "the core's units, and the four of the derived reading");
        // From a unit to its quantity, and on to the relations that read it: the walk a model does with units_knowledge.
        const litres = k.node("unit:VolumetricFlow:Lpmin");
        assert.ok(litres, "L/min is a node");
        const flow = k.out(litres!, "physics.measures")[0].ofin as typeof litres;
        assert.deepEqual(k.out(flow!, "physics.from").map((l) => l.ofin?.id), ["gas-volume-flow-to-mass-flow"]);
        // The names: "airflow" names the volumetric flow, by its link, and canonicalQuantity reads them there.
        assert.equal(k.named("Airflow")?.id, "VolumetricFlow");
        assert.equal(k.named("mass flow rate")?.id, "MassFlow");
        assert.equal(canonicalQuantity("efficiency"), "Dimensionless");
        assert.equal(canonicalQuantity("no such thing"), null);
    });
});
