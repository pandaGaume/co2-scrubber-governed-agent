"use strict";
var SpkPluginHabitat = (() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
  var __decorateClass = (decorators, target, key, kind) => {
    var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
    for (var i = decorators.length - 1, decorator; i >= 0; i--)
      if (decorator = decorators[i])
        result = (kind ? decorator(target, key, result) : decorator(result)) || result;
    if (kind && result) __defProp(target, key, result);
    return result;
  };

  // studio:core
  var require_core = __commonJS({
    "studio:core"(exports, module) {
      if (!globalThis.SpikypandaCore) throw new Error("the studio did not load spikypanda-core.js");
      module.exports = globalThis.SpikypandaCore;
    }
  });

  // plugins/habitat/studio.ts
  var studio_exports = {};
  __export(studio_exports, {
    default: () => studio_default
  });

  // plugins/habitat/person.node.ts
  var import_core3 = __toESM(require_core(), 1);

  // plugins/habitat/activity.ts
  var HABITAT_ACTIVITIES = ["sleep", "rest", "light_work", "heavy_work"];
  var REFERENCE_RATES = { sleep: 0.24, rest: 0.3, lightWork: 0.38, heavyWork: 1 };
  function activityOf(value, fallback) {
    if (typeof value === "number" && Number.isFinite(value)) return HABITAT_ACTIVITIES[Math.max(0, Math.min(HABITAT_ACTIVITIES.length - 1, Math.round(value)))];
    if (typeof value === "string" && HABITAT_ACTIVITIES.includes(value)) return value;
    return fallback;
  }
  var activityLevel = (activity) => HABITAT_ACTIVITIES.indexOf(activity);
  function rateOf(rates, activity) {
    switch (activity) {
      case "sleep":
        return rates.sleep;
      case "rest":
        return rates.rest;
      case "heavy_work":
        return rates.heavyWork;
      default:
        return rates.lightWork;
    }
  }
  var litresPerMinuteToKgps = (litres, co2DensityKgPerM3) => litres * 1e-3 * co2DensityKgPerM3 / 60;
  var kgpsToLitresPerMinute = (kgps, co2DensityKgPerM3) => co2DensityKgPerM3 > 0 ? kgps * 60 * 1e3 / co2DensityKgPerM3 : 0;

  // plugins/habitat/signals.ts
  var import_core = __toESM(require_core(), 1);
  var import_core2 = __toESM(require_core(), 1);
  function readInputs(node, session) {
    const links = session.graph.links;
    const out = /* @__PURE__ */ new Map();
    for (const link of node.opsc()) {
      if (!link.enabled) continue;
      const idx = links.indexOf(link);
      if (idx < 0) continue;
      out.set(String((0, import_core.inSlotOf)(link)), session.readSignal(idx));
    }
    return out;
  }
  var numberOr = (value, fallback) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
  function publishOutputs(node, session, values) {
    const links = session.graph.links;
    for (const link of node.onsc()) {
      if (!link.enabled) continue;
      const idx = links.indexOf(link);
      if (idx < 0) continue;
      const value = values[String(link.slot)];
      if (typeof value === "number") session.publish(idx, value);
    }
  }
  var CO2_MOLAR_MASS = 0.0440095;
  function co2Density(pressurePa, temperatureK) {
    return pressurePa * CO2_MOLAR_MASS / (8.314462618 * Math.max(1e-9, temperatureK));
  }
  function co2MassPerM3(ppm, pressurePa, temperatureK) {
    return Math.max(0, ppm) * 1e-6 * co2Density(pressurePa, temperatureK);
  }

  // plugins/habitat/person.node.ts
  var HabitatPersonNode = class extends import_core3.RuntimeNode {
    _name = "";
    _callsign = "";
    _activity = "rest";
    _sleep = REFERENCE_RATES.sleep;
    _rest = REFERENCE_RATES.rest;
    _lightWork = REFERENCE_RATES.lightWork;
    _heavyWork = REFERENCE_RATES.heavyWork;
    _co2Density = 1.8176;
    _co2Delta = 0;
    _litresPerMinute = 0;
    _current = "rest";
    inputPorts = [{ slot: "activity", optional: true, type: "any", kind: "signal" }];
    outputPorts = [
      { slot: "co2Delta", optional: false, type: "float", kind: "signal" },
      { slot: "litresPerMinute", optional: false, type: "float", kind: "signal" },
      { slot: "activityLevel", optional: false, type: "float", kind: "signal" }
    ];
    constructor(onsc = null, opsc = null, position) {
      super(onsc, opsc, position);
    }
    get name() {
      return this._name;
    }
    set name(v) {
      this.setField("name", this._name, String(v ?? ""), (n) => this._name = n);
    }
    get callsign() {
      return this._callsign;
    }
    set callsign(v) {
      this.setField("callsign", this._callsign, String(v ?? ""), (n) => this._callsign = n);
    }
    get activity() {
      return this._activity;
    }
    set activity(v) {
      this.setField("activity", this._activity, activityOf(v, this._activity), (n) => this._activity = n);
    }
    get sleepLitresPerMinute() {
      return this._sleep;
    }
    set sleepLitresPerMinute(v) {
      this.setField("sleepLitresPerMinute", this._sleep, Math.max(0, v), (n) => this._sleep = n);
    }
    get restLitresPerMinute() {
      return this._rest;
    }
    set restLitresPerMinute(v) {
      this.setField("restLitresPerMinute", this._rest, Math.max(0, v), (n) => this._rest = n);
    }
    get lightWorkLitresPerMinute() {
      return this._lightWork;
    }
    set lightWorkLitresPerMinute(v) {
      this.setField("lightWorkLitresPerMinute", this._lightWork, Math.max(0, v), (n) => this._lightWork = n);
    }
    get heavyWorkLitresPerMinute() {
      return this._heavyWork;
    }
    set heavyWorkLitresPerMinute(v) {
      this.setField("heavyWorkLitresPerMinute", this._heavyWork, Math.max(0, v), (n) => this._heavyWork = n);
    }
    get co2DensityKgPerM3() {
      return this._co2Density;
    }
    set co2DensityKgPerM3(v) {
      this.setField("co2DensityKgPerM3", this._co2Density, Math.max(0, v), (n) => this._co2Density = n);
    }
    get co2Delta() {
      return this._co2Delta;
    }
    get litresPerMinute() {
      return this._litresPerMinute;
    }
    get currentActivity() {
      return this._current;
    }
    get activityLevel() {
      return activityLevel(this._current);
    }
    get rates() {
      return { sleep: this._sleep, rest: this._rest, lightWork: this._lightWork, heavyWork: this._heavyWork };
    }
    /** Their rate at an activity, L/min. */
    rateOf(activity) {
      return rateOf(this.rates, activity);
    }
    reset(_session) {
      this._co2Delta = 0;
      this._litresPerMinute = 0;
      this._current = this._activity;
    }
    fire(session, _t) {
      const inputs = readInputs(this, session);
      const activity = inputs.has("activity") ? activityOf(inputs.get("activity"), this._activity) : this._activity;
      const litres = this.rateOf(activity);
      const delta = litresPerMinuteToKgps(litres, this._co2Density);
      this._current = activity;
      this.setField("litresPerMinute", this._litresPerMinute, litres, (n) => this._litresPerMinute = n);
      this.setField("co2Delta", this._co2Delta, delta, (n) => this._co2Delta = n);
      publishOutputs(this, session, { co2Delta: delta, litresPerMinute: litres, activityLevel: activityLevel(activity) });
    }
  };
  __decorateClass([
    import_core3.cloneable
  ], HabitatPersonNode.prototype, "_name", 2);
  __decorateClass([
    import_core3.cloneable
  ], HabitatPersonNode.prototype, "_callsign", 2);
  __decorateClass([
    import_core3.cloneable
  ], HabitatPersonNode.prototype, "_activity", 2);
  __decorateClass([
    import_core3.cloneable
  ], HabitatPersonNode.prototype, "_sleep", 2);
  __decorateClass([
    import_core3.cloneable
  ], HabitatPersonNode.prototype, "_rest", 2);
  __decorateClass([
    import_core3.cloneable
  ], HabitatPersonNode.prototype, "_lightWork", 2);
  __decorateClass([
    import_core3.cloneable
  ], HabitatPersonNode.prototype, "_heavyWork", 2);
  __decorateClass([
    import_core3.cloneable
  ], HabitatPersonNode.prototype, "_co2Density", 2);
  __decorateClass([
    import_core3.cloneable
  ], HabitatPersonNode.prototype, "_co2Delta", 2);
  __decorateClass([
    import_core3.cloneable
  ], HabitatPersonNode.prototype, "_litresPerMinute", 2);
  __decorateClass([
    import_core3.cloneable
  ], HabitatPersonNode.prototype, "_current", 2);
  __decorateClass([
    (0, import_core3.editable)("string")
  ], HabitatPersonNode.prototype, "name", 1);
  __decorateClass([
    (0, import_core3.editable)("string")
  ], HabitatPersonNode.prototype, "callsign", 1);
  __decorateClass([
    (0, import_core3.editable)("string")
  ], HabitatPersonNode.prototype, "activity", 1);
  __decorateClass([
    (0, import_core3.editable)("number")
  ], HabitatPersonNode.prototype, "sleepLitresPerMinute", 1);
  __decorateClass([
    (0, import_core3.editable)("number")
  ], HabitatPersonNode.prototype, "restLitresPerMinute", 1);
  __decorateClass([
    (0, import_core3.editable)("number")
  ], HabitatPersonNode.prototype, "lightWorkLitresPerMinute", 1);
  __decorateClass([
    (0, import_core3.editable)("number")
  ], HabitatPersonNode.prototype, "heavyWorkLitresPerMinute", 1);
  __decorateClass([
    (0, import_core3.editable)("number")
  ], HabitatPersonNode.prototype, "co2DensityKgPerM3", 1);
  __decorateClass([
    (0, import_core3.viewable)("number")
  ], HabitatPersonNode.prototype, "co2Delta", 1);
  __decorateClass([
    (0, import_core3.viewable)("number")
  ], HabitatPersonNode.prototype, "litresPerMinute", 1);
  __decorateClass([
    (0, import_core3.viewable)("string")
  ], HabitatPersonNode.prototype, "currentActivity", 1);
  __decorateClass([
    (0, import_core3.viewable)("number")
  ], HabitatPersonNode.prototype, "activityLevel", 1);
  function createHabitatPersonNode() {
    return new HabitatPersonNode();
  }

  // plugins/habitat/crew.node.ts
  var import_core4 = __toESM(require_core(), 1);
  var CREW_PERSON_PREFIX = "person_";
  var HabitatCrewNode = class extends import_core4.RuntimeNode {
    _count = 2;
    _activity = "light_work";
    _sleep = REFERENCE_RATES.sleep;
    _rest = REFERENCE_RATES.rest;
    _lightWork = REFERENCE_RATES.lightWork;
    _heavyWork = REFERENCE_RATES.heavyWork;
    _co2Density = 1.8176;
    _co2Delta = 0;
    _litresPerMinute = 0;
    _headcount = 0;
    _persons = 0;
    inputPorts = [
      { slot: "count", optional: true, type: "float", kind: "signal" },
      { slot: "activity", optional: true, type: "any", kind: "signal" },
      // The first of the persons' pool; the others (`person_1`, ...) are the variadic group the registration declares.
      { slot: `${CREW_PERSON_PREFIX}0`, optional: true, type: "float", kind: "signal" }
    ];
    outputPorts = [
      { slot: "co2Delta", optional: false, type: "float", kind: "signal" },
      { slot: "litresPerMinute", optional: false, type: "float", kind: "signal" },
      { slot: "headcount", optional: false, type: "float", kind: "signal" }
    ];
    constructor(onsc = null, opsc = null, position) {
      super(onsc, opsc, position);
    }
    get count() {
      return this._count;
    }
    set count(v) {
      this.setField("count", this._count, Math.max(0, v), (n) => this._count = n);
    }
    get activity() {
      return this._activity;
    }
    set activity(v) {
      this.setField("activity", this._activity, activityOf(v, this._activity), (n) => this._activity = n);
    }
    get sleepLitresPerMinute() {
      return this._sleep;
    }
    set sleepLitresPerMinute(v) {
      this.setField("sleepLitresPerMinute", this._sleep, Math.max(0, v), (n) => this._sleep = n);
    }
    get restLitresPerMinute() {
      return this._rest;
    }
    set restLitresPerMinute(v) {
      this.setField("restLitresPerMinute", this._rest, Math.max(0, v), (n) => this._rest = n);
    }
    get lightWorkLitresPerMinute() {
      return this._lightWork;
    }
    set lightWorkLitresPerMinute(v) {
      this.setField("lightWorkLitresPerMinute", this._lightWork, Math.max(0, v), (n) => this._lightWork = n);
    }
    get heavyWorkLitresPerMinute() {
      return this._heavyWork;
    }
    set heavyWorkLitresPerMinute(v) {
      this.setField("heavyWorkLitresPerMinute", this._heavyWork, Math.max(0, v), (n) => this._heavyWork = n);
    }
    get co2DensityKgPerM3() {
      return this._co2Density;
    }
    set co2DensityKgPerM3(v) {
      this.setField("co2DensityKgPerM3", this._co2Density, Math.max(0, v), (n) => this._co2Density = n);
    }
    get co2Delta() {
      return this._co2Delta;
    }
    get litresPerMinute() {
      return this._litresPerMinute;
    }
    get headcount() {
      return this._headcount;
    }
    get personsWired() {
      return this._persons;
    }
    get rates() {
      return { sleep: this._sleep, rest: this._rest, lightWork: this._lightWork, heavyWork: this._heavyWork };
    }
    /** The per-person rate of an activity, L/min. */
    rateOf(activity) {
      return rateOf(this.rates, activity);
    }
    reset(_session) {
      this._co2Delta = 0;
      this._litresPerMinute = 0;
      this._headcount = 0;
      this._persons = 0;
    }
    fire(session, _t) {
      const inputs = readInputs(this, session);
      const count = Math.max(0, numberOr(inputs.get("count"), this._count));
      const activity = inputs.has("activity") ? activityOf(inputs.get("activity"), this._activity) : this._activity;
      let persons = 0;
      let fromPersons = 0;
      for (const [slot, value] of inputs) {
        if (!slot.startsWith(CREW_PERSON_PREFIX)) continue;
        persons++;
        fromPersons += Math.max(0, numberOr(value, 0));
      }
      const unnamed = litresPerMinuteToKgps(count * this.rateOf(activity), this._co2Density);
      const delta = fromPersons + unnamed;
      const litres = kgpsToLitresPerMinute(delta, this._co2Density);
      const headcount = persons + count;
      this._persons = persons;
      this.setField("headcount", this._headcount, headcount, (n) => this._headcount = n);
      this.setField("litresPerMinute", this._litresPerMinute, litres, (n) => this._litresPerMinute = n);
      this.setField("co2Delta", this._co2Delta, delta, (n) => this._co2Delta = n);
      publishOutputs(this, session, { co2Delta: delta, litresPerMinute: litres, headcount });
    }
  };
  __decorateClass([
    import_core4.cloneable
  ], HabitatCrewNode.prototype, "_count", 2);
  __decorateClass([
    import_core4.cloneable
  ], HabitatCrewNode.prototype, "_activity", 2);
  __decorateClass([
    import_core4.cloneable
  ], HabitatCrewNode.prototype, "_sleep", 2);
  __decorateClass([
    import_core4.cloneable
  ], HabitatCrewNode.prototype, "_rest", 2);
  __decorateClass([
    import_core4.cloneable
  ], HabitatCrewNode.prototype, "_lightWork", 2);
  __decorateClass([
    import_core4.cloneable
  ], HabitatCrewNode.prototype, "_heavyWork", 2);
  __decorateClass([
    import_core4.cloneable
  ], HabitatCrewNode.prototype, "_co2Density", 2);
  __decorateClass([
    import_core4.cloneable
  ], HabitatCrewNode.prototype, "_co2Delta", 2);
  __decorateClass([
    import_core4.cloneable
  ], HabitatCrewNode.prototype, "_litresPerMinute", 2);
  __decorateClass([
    import_core4.cloneable
  ], HabitatCrewNode.prototype, "_headcount", 2);
  __decorateClass([
    import_core4.cloneable
  ], HabitatCrewNode.prototype, "_persons", 2);
  __decorateClass([
    (0, import_core4.editable)("number")
  ], HabitatCrewNode.prototype, "count", 1);
  __decorateClass([
    (0, import_core4.editable)("string")
  ], HabitatCrewNode.prototype, "activity", 1);
  __decorateClass([
    (0, import_core4.editable)("number")
  ], HabitatCrewNode.prototype, "sleepLitresPerMinute", 1);
  __decorateClass([
    (0, import_core4.editable)("number")
  ], HabitatCrewNode.prototype, "restLitresPerMinute", 1);
  __decorateClass([
    (0, import_core4.editable)("number")
  ], HabitatCrewNode.prototype, "lightWorkLitresPerMinute", 1);
  __decorateClass([
    (0, import_core4.editable)("number")
  ], HabitatCrewNode.prototype, "heavyWorkLitresPerMinute", 1);
  __decorateClass([
    (0, import_core4.editable)("number")
  ], HabitatCrewNode.prototype, "co2DensityKgPerM3", 1);
  __decorateClass([
    (0, import_core4.viewable)("number")
  ], HabitatCrewNode.prototype, "co2Delta", 1);
  __decorateClass([
    (0, import_core4.viewable)("number")
  ], HabitatCrewNode.prototype, "litresPerMinute", 1);
  __decorateClass([
    (0, import_core4.viewable)("number")
  ], HabitatCrewNode.prototype, "headcount", 1);
  __decorateClass([
    (0, import_core4.viewable)("number")
  ], HabitatCrewNode.prototype, "personsWired", 1);
  function createHabitatCrewNode() {
    return new HabitatCrewNode();
  }

  // plugins/habitat/scrubber.node.ts
  var import_core5 = __toESM(require_core(), 1);
  var HabitatScrubberNode = class extends import_core5.IntegrableRuntimeNode {
    stateSize = 1;
    stateNames = ["flowM3ps"];
    _flowAtFull = 0.055;
    _efficiency = 0.3;
    _lagMinutes = 3.33;
    _initialFlow = 0;
    _supplyVolts = 6;
    _interceptAmps = 0.0879;
    _slopeAmps = 0.1611;
    _habitatScale = 300;
    _defaultPressurePa = 101325;
    _defaultTemperatureK = 295.15;
    _flow = 0;
    _command = 0;
    _removal = 0;
    _power = 0;
    _inletPpm = 0;
    inputPorts = [
      { slot: "command", optional: true, type: "float", kind: "signal" },
      { slot: "ppm", optional: true, type: "float", kind: "signal" },
      { slot: "pressure", optional: true, type: "float", kind: "signal" },
      { slot: "temperature", optional: true, type: "float", kind: "signal" }
    ];
    outputPorts = [
      { slot: "co2Delta", optional: false, type: "float", kind: "signal" },
      { slot: "flow", optional: false, type: "float", kind: "signal" },
      { slot: "effectiveFlow", optional: false, type: "float", kind: "signal" },
      { slot: "power", optional: false, type: "float", kind: "signal" }
    ];
    constructor(onsc = null, opsc = null, position) {
      super(onsc, opsc, position);
    }
    /** The lag is minutes long; ten samples per time constant is plenty. */
    computeRequiredHz() {
      return Math.max(0.01, 10 / Math.max(1, this._lagMinutes * 60));
    }
    get flowAtFullM3ps() {
      return this._flowAtFull;
    }
    set flowAtFullM3ps(v) {
      this.setField("flowAtFullM3ps", this._flowAtFull, Math.max(0, v), (n) => this._flowAtFull = n);
    }
    get efficiency() {
      return this._efficiency;
    }
    set efficiency(v) {
      this.setField("efficiency", this._efficiency, Math.max(0, Math.min(1, v)), (n) => this._efficiency = n);
    }
    get lagTimeConstantMinutes() {
      return this._lagMinutes;
    }
    set lagTimeConstantMinutes(v) {
      this.setField("lagTimeConstantMinutes", this._lagMinutes, Math.max(1e-3, v), (n) => this._lagMinutes = n);
      this.notifyComputedRequiredHzMayHaveChanged();
    }
    get initialFlowM3ps() {
      return this._initialFlow;
    }
    set initialFlowM3ps(v) {
      this.setField("initialFlowM3ps", this._initialFlow, Math.max(0, v), (n) => this._initialFlow = n);
    }
    get supplyVolts() {
      return this._supplyVolts;
    }
    set supplyVolts(v) {
      this.setField("supplyVolts", this._supplyVolts, Math.max(0, v), (n) => this._supplyVolts = n);
    }
    get interceptAmps() {
      return this._interceptAmps;
    }
    set interceptAmps(v) {
      this.setField("interceptAmps", this._interceptAmps, v, (n) => this._interceptAmps = n);
    }
    get slopeAmps() {
      return this._slopeAmps;
    }
    set slopeAmps(v) {
      this.setField("slopeAmps", this._slopeAmps, v, (n) => this._slopeAmps = n);
    }
    get habitatScale() {
      return this._habitatScale;
    }
    set habitatScale(v) {
      this.setField("habitatScale", this._habitatScale, Math.max(0, v), (n) => this._habitatScale = n);
    }
    get defaultPressurePa() {
      return this._defaultPressurePa;
    }
    set defaultPressurePa(v) {
      this.setField("defaultPressurePa", this._defaultPressurePa, Math.max(0, v), (n) => this._defaultPressurePa = n);
    }
    get defaultTemperatureK() {
      return this._defaultTemperatureK;
    }
    set defaultTemperatureK(v) {
      this.setField("defaultTemperatureK", this._defaultTemperatureK, Math.max(1, v), (n) => this._defaultTemperatureK = n);
    }
    get flowM3ps() {
      return this._flow;
    }
    get effectiveFlowM3ps() {
      return this._efficiency * this._flow;
    }
    get removalKgps() {
      return this._removal;
    }
    get power() {
      return this._power;
    }
    get command() {
      return this._command;
    }
    /** The studio's live binder writes a connected source's value here when the cable is drawn; the tick reads the wire itself. */
    set command(v) {
      const n = Number(v);
      if (Number.isFinite(n)) this._command = Math.max(0, Math.min(1, n));
    }
    get inletPpm() {
      return this._inletPpm;
    }
    powerAt(command) {
      const u = Math.max(0, Math.min(1, command));
      return this._supplyVolts * (this._interceptAmps + this._slopeAmps * u) * this._habitatScale;
    }
    gatherState(y, offset) {
      y[offset] = this._flow;
    }
    writeState(y, offset) {
      this.setField("flowM3ps", this._flow, Math.max(0, y[offset]), (n) => this._flow = n);
    }
    rhs(_t, y, offset, inputs, dydt) {
      const flow = y[offset];
      const command = Math.max(0, Math.min(1, inputs.get("command") ?? 0));
      dydt[offset] = (this._flowAtFull * command - flow) / (this._lagMinutes * 60);
    }
    reset(session) {
      super.reset(session);
      this.setField("flowM3ps", this._flow, this._initialFlow, (n) => this._flow = n);
      this._command = 0;
      this._removal = 0;
      this._power = 0;
      this._inletPpm = 0;
    }
    fire(session, _t) {
      const inputs = readInputs(this, session);
      const command = Math.max(0, Math.min(1, numberOr(inputs.get("command"), 0)));
      const ppm = Math.max(0, numberOr(inputs.get("ppm"), 0));
      const pressure = numberOr(inputs.get("pressure"), this._defaultPressurePa);
      const temperature = numberOr(inputs.get("temperature"), this._defaultTemperatureK);
      const removal = this._efficiency * this._flow * co2MassPerM3(ppm, pressure, temperature);
      const power = this.powerAt(command);
      this.setField("command", this._command, command, (n) => this._command = n);
      this.setField("inletPpm", this._inletPpm, ppm, (n) => this._inletPpm = n);
      this.setField("removalKgps", this._removal, removal, (n) => this._removal = n);
      this.setField("power", this._power, power, (n) => this._power = n);
      publishOutputs(this, session, { co2Delta: -removal, flow: this._flow, effectiveFlow: this._efficiency * this._flow, power });
    }
  };
  __decorateClass([
    import_core5.cloneable
  ], HabitatScrubberNode.prototype, "_flowAtFull", 2);
  __decorateClass([
    import_core5.cloneable
  ], HabitatScrubberNode.prototype, "_efficiency", 2);
  __decorateClass([
    import_core5.cloneable
  ], HabitatScrubberNode.prototype, "_lagMinutes", 2);
  __decorateClass([
    import_core5.cloneable
  ], HabitatScrubberNode.prototype, "_initialFlow", 2);
  __decorateClass([
    import_core5.cloneable
  ], HabitatScrubberNode.prototype, "_supplyVolts", 2);
  __decorateClass([
    import_core5.cloneable
  ], HabitatScrubberNode.prototype, "_interceptAmps", 2);
  __decorateClass([
    import_core5.cloneable
  ], HabitatScrubberNode.prototype, "_slopeAmps", 2);
  __decorateClass([
    import_core5.cloneable
  ], HabitatScrubberNode.prototype, "_habitatScale", 2);
  __decorateClass([
    import_core5.cloneable
  ], HabitatScrubberNode.prototype, "_defaultPressurePa", 2);
  __decorateClass([
    import_core5.cloneable
  ], HabitatScrubberNode.prototype, "_defaultTemperatureK", 2);
  __decorateClass([
    import_core5.cloneable
  ], HabitatScrubberNode.prototype, "_flow", 2);
  __decorateClass([
    import_core5.cloneable
  ], HabitatScrubberNode.prototype, "_command", 2);
  __decorateClass([
    import_core5.cloneable
  ], HabitatScrubberNode.prototype, "_removal", 2);
  __decorateClass([
    import_core5.cloneable
  ], HabitatScrubberNode.prototype, "_power", 2);
  __decorateClass([
    import_core5.cloneable
  ], HabitatScrubberNode.prototype, "_inletPpm", 2);
  __decorateClass([
    (0, import_core5.editable)("number", { unit: { quantity: "VolumetricFlow", unit: "m3ps" } })
  ], HabitatScrubberNode.prototype, "flowAtFullM3ps", 1);
  __decorateClass([
    (0, import_core5.editable)("number")
  ], HabitatScrubberNode.prototype, "efficiency", 1);
  __decorateClass([
    (0, import_core5.editable)("number")
  ], HabitatScrubberNode.prototype, "lagTimeConstantMinutes", 1);
  __decorateClass([
    (0, import_core5.editable)("number")
  ], HabitatScrubberNode.prototype, "initialFlowM3ps", 1);
  __decorateClass([
    (0, import_core5.editable)("number", { unit: { quantity: "Voltage", unit: "V" } })
  ], HabitatScrubberNode.prototype, "supplyVolts", 1);
  __decorateClass([
    (0, import_core5.editable)("number", { unit: { quantity: "Current", unit: "A" } })
  ], HabitatScrubberNode.prototype, "interceptAmps", 1);
  __decorateClass([
    (0, import_core5.editable)("number", { unit: { quantity: "Current", unit: "A" } })
  ], HabitatScrubberNode.prototype, "slopeAmps", 1);
  __decorateClass([
    (0, import_core5.editable)("number")
  ], HabitatScrubberNode.prototype, "habitatScale", 1);
  __decorateClass([
    (0, import_core5.editable)("number")
  ], HabitatScrubberNode.prototype, "defaultPressurePa", 1);
  __decorateClass([
    (0, import_core5.editable)("number")
  ], HabitatScrubberNode.prototype, "defaultTemperatureK", 1);
  __decorateClass([
    (0, import_core5.viewable)("number", { unit: { quantity: "VolumetricFlow", unit: "m3ps" } })
  ], HabitatScrubberNode.prototype, "flowM3ps", 1);
  __decorateClass([
    (0, import_core5.viewable)("number", { unit: { quantity: "VolumetricFlow", unit: "m3ps" } })
  ], HabitatScrubberNode.prototype, "effectiveFlowM3ps", 1);
  __decorateClass([
    (0, import_core5.viewable)("number")
  ], HabitatScrubberNode.prototype, "removalKgps", 1);
  __decorateClass([
    (0, import_core5.viewable)("number", { unit: { quantity: "Power", unit: "watt" } })
  ], HabitatScrubberNode.prototype, "power", 1);
  __decorateClass([
    (0, import_core5.viewable)("number")
  ], HabitatScrubberNode.prototype, "command", 1);
  __decorateClass([
    (0, import_core5.viewable)("number")
  ], HabitatScrubberNode.prototype, "inletPpm", 1);
  function createHabitatScrubberNode() {
    return new HabitatScrubberNode();
  }

  // plugins/habitat/fan.node.ts
  var import_core6 = __toESM(require_core(), 1);
  var HabitatFanNode = class extends import_core6.IntegrableRuntimeNode {
    stateSize = 1;
    stateNames = ["speedRatio"];
    _shutoffPressurePa = 250;
    _freeDeliveryM3ps = 0.09;
    _ductResistance = 2e4;
    _spinUpSeconds = 5;
    _fanEfficiency = 0.5;
    _standbyPowerW = 2;
    _capacityFactor = 1;
    _initialSpeedRatio = 0;
    _speed = 0;
    _flow = 0;
    _pressureRise = 0;
    _power = 0;
    _command = 0;
    _systemResistance = 0;
    inputPorts = [
      { slot: "command", optional: true, type: "float", kind: "signal" },
      { slot: "resistance", optional: true, type: "float", kind: "signal" }
    ];
    outputPorts = [
      { slot: "flow", optional: false, type: "float", kind: "signal" },
      { slot: "pressureRise", optional: false, type: "float", kind: "signal" },
      { slot: "power", optional: false, type: "float", kind: "signal" },
      { slot: "speedRatio", optional: false, type: "float", kind: "signal" }
    ];
    constructor(onsc = null, opsc = null, position) {
      super(onsc, opsc, position);
    }
    computeRequiredHz() {
      return Math.max(0.01, 10 / Math.max(1, this._spinUpSeconds));
    }
    get shutoffPressurePa() {
      return this._shutoffPressurePa;
    }
    set shutoffPressurePa(v) {
      this.setField("shutoffPressurePa", this._shutoffPressurePa, Math.max(0, v), (n) => this._shutoffPressurePa = n);
    }
    get freeDeliveryM3ps() {
      return this._freeDeliveryM3ps;
    }
    set freeDeliveryM3ps(v) {
      this.setField("freeDeliveryM3ps", this._freeDeliveryM3ps, Math.max(1e-9, v), (n) => this._freeDeliveryM3ps = n);
    }
    get ductResistance() {
      return this._ductResistance;
    }
    set ductResistance(v) {
      this.setField("ductResistance", this._ductResistance, Math.max(0, v), (n) => this._ductResistance = n);
    }
    get spinUpSeconds() {
      return this._spinUpSeconds;
    }
    set spinUpSeconds(v) {
      this.setField("spinUpSeconds", this._spinUpSeconds, Math.max(1e-3, v), (n) => this._spinUpSeconds = n);
      this.notifyComputedRequiredHzMayHaveChanged();
    }
    get fanEfficiency() {
      return this._fanEfficiency;
    }
    set fanEfficiency(v) {
      this.setField("fanEfficiency", this._fanEfficiency, Math.max(0.01, Math.min(1, v)), (n) => this._fanEfficiency = n);
    }
    get standbyPowerW() {
      return this._standbyPowerW;
    }
    set standbyPowerW(v) {
      this.setField("standbyPowerW", this._standbyPowerW, Math.max(0, v), (n) => this._standbyPowerW = n);
    }
    get capacityFactor() {
      return this._capacityFactor;
    }
    set capacityFactor(v) {
      this.setField("capacityFactor", this._capacityFactor, Math.max(0, Math.min(1, v)), (n) => this._capacityFactor = n);
    }
    get initialSpeedRatio() {
      return this._initialSpeedRatio;
    }
    set initialSpeedRatio(v) {
      this.setField("initialSpeedRatio", this._initialSpeedRatio, Math.max(0, Math.min(1, v)), (n) => this._initialSpeedRatio = n);
    }
    get flowM3ps() {
      return this._flow;
    }
    get flowM3PerMinute() {
      return this._flow * 60;
    }
    get pressureRisePa() {
      return this._pressureRise;
    }
    get power() {
      return this._power;
    }
    get speedRatio() {
      return this._speed;
    }
    get command() {
      return this._command;
    }
    /** The studio's live binder writes a connected source's value here when the cable is drawn; the tick reads the wire itself. */
    set command(v) {
      const n = Number(v);
      if (Number.isFinite(n)) this._command = Math.max(0, Math.min(1, n));
    }
    get systemResistance() {
      return this._systemResistance;
    }
    /** The operating point: the flow at a speed ratio against a system resistance, m3/s. */
    flowAt(speedRatio, systemResistance) {
      const s = Math.max(0, Math.min(1, speedRatio));
      const k = this._capacityFactor * this._shutoffPressurePa;
      if (k <= 0 || s <= 0) return 0;
      const denominator = Math.max(0, systemResistance) + k / (this._freeDeliveryM3ps * this._freeDeliveryM3ps);
      return s * Math.sqrt(k / denominator);
    }
    gatherState(y, offset) {
      y[offset] = this._speed;
    }
    writeState(y, offset) {
      this.setField("speedRatio", this._speed, Math.max(0, Math.min(1, y[offset])), (n) => this._speed = n);
    }
    rhs(_t, y, offset, inputs, dydt) {
      const command = Math.max(0, Math.min(1, inputs.get("command") ?? 0));
      dydt[offset] = (command - y[offset]) / this._spinUpSeconds;
    }
    reset(session) {
      super.reset(session);
      this.setField("speedRatio", this._speed, this._initialSpeedRatio, (n) => this._speed = n);
      this._flow = 0;
      this._pressureRise = 0;
      this._power = 0;
      this._command = 0;
      this._systemResistance = 0;
    }
    fire(session, _t) {
      const inputs = readInputs(this, session);
      const command = Math.max(0, Math.min(1, numberOr(inputs.get("command"), 0)));
      const resistance = this._ductResistance + Math.max(0, numberOr(inputs.get("resistance"), 0));
      const flow = this.flowAt(this._speed, resistance);
      const pressureRise = resistance * flow * flow;
      const power = this._standbyPowerW + pressureRise * flow / this._fanEfficiency;
      this.setField("command", this._command, command, (n) => this._command = n);
      this.setField("systemResistance", this._systemResistance, resistance, (n) => this._systemResistance = n);
      this.setField("flowM3ps", this._flow, flow, (n) => this._flow = n);
      this.setField("pressureRisePa", this._pressureRise, pressureRise, (n) => this._pressureRise = n);
      this.setField("power", this._power, power, (n) => this._power = n);
      publishOutputs(this, session, { flow, pressureRise, power, speedRatio: this._speed });
    }
  };
  __decorateClass([
    import_core6.cloneable
  ], HabitatFanNode.prototype, "_shutoffPressurePa", 2);
  __decorateClass([
    import_core6.cloneable
  ], HabitatFanNode.prototype, "_freeDeliveryM3ps", 2);
  __decorateClass([
    import_core6.cloneable
  ], HabitatFanNode.prototype, "_ductResistance", 2);
  __decorateClass([
    import_core6.cloneable
  ], HabitatFanNode.prototype, "_spinUpSeconds", 2);
  __decorateClass([
    import_core6.cloneable
  ], HabitatFanNode.prototype, "_fanEfficiency", 2);
  __decorateClass([
    import_core6.cloneable
  ], HabitatFanNode.prototype, "_standbyPowerW", 2);
  __decorateClass([
    import_core6.cloneable
  ], HabitatFanNode.prototype, "_capacityFactor", 2);
  __decorateClass([
    import_core6.cloneable
  ], HabitatFanNode.prototype, "_initialSpeedRatio", 2);
  __decorateClass([
    import_core6.cloneable
  ], HabitatFanNode.prototype, "_speed", 2);
  __decorateClass([
    import_core6.cloneable
  ], HabitatFanNode.prototype, "_flow", 2);
  __decorateClass([
    import_core6.cloneable
  ], HabitatFanNode.prototype, "_pressureRise", 2);
  __decorateClass([
    import_core6.cloneable
  ], HabitatFanNode.prototype, "_power", 2);
  __decorateClass([
    import_core6.cloneable
  ], HabitatFanNode.prototype, "_command", 2);
  __decorateClass([
    import_core6.cloneable
  ], HabitatFanNode.prototype, "_systemResistance", 2);
  __decorateClass([
    (0, import_core6.editable)("number")
  ], HabitatFanNode.prototype, "shutoffPressurePa", 1);
  __decorateClass([
    (0, import_core6.editable)("number", { unit: { quantity: "VolumetricFlow", unit: "m3ps" } })
  ], HabitatFanNode.prototype, "freeDeliveryM3ps", 1);
  __decorateClass([
    (0, import_core6.editable)("number")
  ], HabitatFanNode.prototype, "ductResistance", 1);
  __decorateClass([
    (0, import_core6.editable)("number")
  ], HabitatFanNode.prototype, "spinUpSeconds", 1);
  __decorateClass([
    (0, import_core6.editable)("number")
  ], HabitatFanNode.prototype, "fanEfficiency", 1);
  __decorateClass([
    (0, import_core6.editable)("number", { unit: { quantity: "Power", unit: "watt" } })
  ], HabitatFanNode.prototype, "standbyPowerW", 1);
  __decorateClass([
    (0, import_core6.editable)("number")
  ], HabitatFanNode.prototype, "capacityFactor", 1);
  __decorateClass([
    (0, import_core6.editable)("number")
  ], HabitatFanNode.prototype, "initialSpeedRatio", 1);
  __decorateClass([
    (0, import_core6.viewable)("number", { unit: { quantity: "VolumetricFlow", unit: "m3ps" } })
  ], HabitatFanNode.prototype, "flowM3ps", 1);
  __decorateClass([
    (0, import_core6.viewable)("number")
  ], HabitatFanNode.prototype, "flowM3PerMinute", 1);
  __decorateClass([
    (0, import_core6.viewable)("number")
  ], HabitatFanNode.prototype, "pressureRisePa", 1);
  __decorateClass([
    (0, import_core6.viewable)("number", { unit: { quantity: "Power", unit: "watt" } })
  ], HabitatFanNode.prototype, "power", 1);
  __decorateClass([
    (0, import_core6.viewable)("number")
  ], HabitatFanNode.prototype, "speedRatio", 1);
  __decorateClass([
    (0, import_core6.viewable)("number")
  ], HabitatFanNode.prototype, "command", 1);
  __decorateClass([
    (0, import_core6.viewable)("number")
  ], HabitatFanNode.prototype, "systemResistance", 1);
  function createHabitatFanNode() {
    return new HabitatFanNode();
  }

  // plugins/habitat/filter.node.ts
  var import_core7 = __toESM(require_core(), 1);
  var HabitatFilterNode = class extends import_core7.IntegrableRuntimeNode {
    stateSize = 1;
    stateNames = ["loadingKg"];
    _cleanResistance = 49e3;
    _loadingDoublingKg = 0.05;
    _captureEfficiency = 0.9;
    _ambientDust = 1e-6;
    _initialLoadingKg = 0;
    _endOfLifeLoadingKg = 0.2;
    _particulateId = "lunar_dust";
    _loading = 0;
    _flow = 0;
    _resistance = 0;
    _pressureDrop = 0;
    _captureRate = 0;
    inputPorts = [
      { slot: "flow", optional: true, type: "float", kind: "signal" },
      { slot: "dustConcentration", optional: true, type: "float", kind: "signal" },
      // The dust it captures, a Physics.Particulate descriptor (a configuration link, the substrate's dashed cable): declarative in V1, the substrate's particulates carry no dynamics yet.
      { slot: "particulate_in", optional: true, type: "particulate" }
    ];
    outputPorts = [
      { slot: "resistance", optional: false, type: "float", kind: "signal" },
      { slot: "pressureDrop", optional: false, type: "float", kind: "signal" },
      { slot: "loading", optional: false, type: "float", kind: "signal" },
      { slot: "clogging", optional: false, type: "float", kind: "signal" }
    ];
    constructor(onsc = null, opsc = null, position) {
      super(onsc, opsc, position);
    }
    /** Loading moves over days: a sample a minute is plenty. */
    computeRequiredHz() {
      return 1 / 60;
    }
    get cleanResistance() {
      return this._cleanResistance;
    }
    set cleanResistance(v) {
      this.setField("cleanResistance", this._cleanResistance, Math.max(0, v), (n) => this._cleanResistance = n);
    }
    get loadingDoublingKg() {
      return this._loadingDoublingKg;
    }
    set loadingDoublingKg(v) {
      this.setField("loadingDoublingKg", this._loadingDoublingKg, Math.max(1e-9, v), (n) => this._loadingDoublingKg = n);
    }
    get captureEfficiency() {
      return this._captureEfficiency;
    }
    set captureEfficiency(v) {
      this.setField("captureEfficiency", this._captureEfficiency, Math.max(0, Math.min(1, v)), (n) => this._captureEfficiency = n);
    }
    get ambientDustKgPerM3() {
      return this._ambientDust;
    }
    set ambientDustKgPerM3(v) {
      this.setField("ambientDustKgPerM3", this._ambientDust, Math.max(0, v), (n) => this._ambientDust = n);
    }
    get initialLoadingKg() {
      return this._initialLoadingKg;
    }
    set initialLoadingKg(v) {
      this.setField("initialLoadingKg", this._initialLoadingKg, Math.max(0, v), (n) => this._initialLoadingKg = n);
    }
    get particulateId() {
      return this._particulateId;
    }
    set particulateId(v) {
      this.setField("particulateId", this._particulateId, String(v || this._particulateId), (n) => this._particulateId = n);
    }
    get endOfLifeLoadingKg() {
      return this._endOfLifeLoadingKg;
    }
    set endOfLifeLoadingKg(v) {
      this.setField("endOfLifeLoadingKg", this._endOfLifeLoadingKg, Math.max(1e-9, v), (n) => this._endOfLifeLoadingKg = n);
    }
    get loadingKg() {
      return this._loading;
    }
    get resistance() {
      return this._resistance;
    }
    get pressureDropPa() {
      return this._pressureDrop;
    }
    get clogging() {
      return this._loading / this._endOfLifeLoadingKg;
    }
    get captureRateKgps() {
      return this._captureRate;
    }
    get flowM3ps() {
      return this._flow;
    }
    /** The resistance at a loading, Pa per (m3/s)^2. */
    resistanceAt(loadingKg) {
      return this._cleanResistance * (1 + Math.max(0, loadingKg) / this._loadingDoublingKg);
    }
    gatherState(y, offset) {
      y[offset] = this._loading;
    }
    writeState(y, offset) {
      this.setField("loadingKg", this._loading, Math.max(0, y[offset]), (n) => this._loading = n);
    }
    rhs(_t, _y, offset, inputs, dydt) {
      const flow = Math.max(0, inputs.get("flow") ?? 0);
      const dust = Math.max(0, inputs.get("dustConcentration") ?? this._ambientDust);
      dydt[offset] = this._captureEfficiency * dust * flow;
    }
    reset(session) {
      super.reset(session);
      this.setField("loadingKg", this._loading, this._initialLoadingKg, (n) => this._loading = n);
      this._flow = 0;
      this._resistance = this.resistanceAt(this._loading);
      this._pressureDrop = 0;
      this._captureRate = 0;
    }
    fire(session, _t) {
      const inputs = readInputs(this, session);
      const flow = Math.max(0, numberOr(inputs.get("flow"), 0));
      const dust = Math.max(0, numberOr(inputs.get("dustConcentration"), this._ambientDust));
      const resistance = this.resistanceAt(this._loading);
      const pressureDrop = resistance * flow * flow;
      const captureRate = this._captureEfficiency * dust * flow;
      this.setField("flowM3ps", this._flow, flow, (n) => this._flow = n);
      this.setField("resistance", this._resistance, resistance, (n) => this._resistance = n);
      this.setField("pressureDropPa", this._pressureDrop, pressureDrop, (n) => this._pressureDrop = n);
      this.setField("captureRateKgps", this._captureRate, captureRate, (n) => this._captureRate = n);
      publishOutputs(this, session, { resistance, pressureDrop, loading: this._loading, clogging: this.clogging });
    }
  };
  __decorateClass([
    import_core7.cloneable
  ], HabitatFilterNode.prototype, "_cleanResistance", 2);
  __decorateClass([
    import_core7.cloneable
  ], HabitatFilterNode.prototype, "_loadingDoublingKg", 2);
  __decorateClass([
    import_core7.cloneable
  ], HabitatFilterNode.prototype, "_captureEfficiency", 2);
  __decorateClass([
    import_core7.cloneable
  ], HabitatFilterNode.prototype, "_ambientDust", 2);
  __decorateClass([
    import_core7.cloneable
  ], HabitatFilterNode.prototype, "_initialLoadingKg", 2);
  __decorateClass([
    import_core7.cloneable
  ], HabitatFilterNode.prototype, "_endOfLifeLoadingKg", 2);
  __decorateClass([
    import_core7.cloneable
  ], HabitatFilterNode.prototype, "_particulateId", 2);
  __decorateClass([
    import_core7.cloneable
  ], HabitatFilterNode.prototype, "_loading", 2);
  __decorateClass([
    import_core7.cloneable
  ], HabitatFilterNode.prototype, "_flow", 2);
  __decorateClass([
    import_core7.cloneable
  ], HabitatFilterNode.prototype, "_resistance", 2);
  __decorateClass([
    import_core7.cloneable
  ], HabitatFilterNode.prototype, "_pressureDrop", 2);
  __decorateClass([
    import_core7.cloneable
  ], HabitatFilterNode.prototype, "_captureRate", 2);
  __decorateClass([
    (0, import_core7.editable)("number")
  ], HabitatFilterNode.prototype, "cleanResistance", 1);
  __decorateClass([
    (0, import_core7.editable)("number")
  ], HabitatFilterNode.prototype, "loadingDoublingKg", 1);
  __decorateClass([
    (0, import_core7.editable)("number")
  ], HabitatFilterNode.prototype, "captureEfficiency", 1);
  __decorateClass([
    (0, import_core7.editable)("number")
  ], HabitatFilterNode.prototype, "ambientDustKgPerM3", 1);
  __decorateClass([
    (0, import_core7.editable)("number")
  ], HabitatFilterNode.prototype, "initialLoadingKg", 1);
  __decorateClass([
    (0, import_core7.editable)("string")
  ], HabitatFilterNode.prototype, "particulateId", 1);
  __decorateClass([
    (0, import_core7.editable)("number")
  ], HabitatFilterNode.prototype, "endOfLifeLoadingKg", 1);
  __decorateClass([
    (0, import_core7.viewable)("number")
  ], HabitatFilterNode.prototype, "loadingKg", 1);
  __decorateClass([
    (0, import_core7.viewable)("number")
  ], HabitatFilterNode.prototype, "resistance", 1);
  __decorateClass([
    (0, import_core7.viewable)("number")
  ], HabitatFilterNode.prototype, "pressureDropPa", 1);
  __decorateClass([
    (0, import_core7.viewable)("number")
  ], HabitatFilterNode.prototype, "clogging", 1);
  __decorateClass([
    (0, import_core7.viewable)("number")
  ], HabitatFilterNode.prototype, "captureRateKgps", 1);
  __decorateClass([
    (0, import_core7.viewable)("number")
  ], HabitatFilterNode.prototype, "flowM3ps", 1);
  function createHabitatFilterNode() {
    return new HabitatFilterNode();
  }

  // plugins/habitat/index.ts
  var KGPS = { quantity: "MassFlow", unit: "kg/s" };
  var M3PS = { quantity: "VolumetricFlow", unit: "m3ps" };
  var PPM = { quantity: "Concentration", unit: "ppm" };
  var RATIO = { quantity: "Dimensionless", unit: "ratio" };
  var WATT = { quantity: "Power", unit: "watt" };
  var PA = { quantity: "Pressure", unit: "Pa" };
  var KELVIN = { quantity: "Temperature", unit: "k" };
  var RESISTANCE = { quantity: "FlowResistance", unit: "Pa/(m3/s)^2" };
  function registerHabitatNodes(registry, doc = (file) => `plugins/habitat/docs/${file}`) {
    const reg = registry;
    const ports = (node) => ({ inputPorts: [...node.inputPorts], outputPorts: [...node.outputPorts] });
    reg.register("Physics.Habitat:person", () => createHabitatPersonNode(), {
      label: "Person (CO2 source)",
      category: "Physics.Habitat",
      docPath: doc("person.md"),
      ...ports(new HabitatPersonNode()),
      signature: {
        purpose: "one person by name as a CO2 source in kg/s, at an activity of their own (sleep, rest, light_work, heavy_work) at NASA's rate per activity in litres per minute, their own rates editable; wired into a crew's person pool or straight into an atmosphere",
        inputs: {
          activity: { quantity: "Category", description: "what they do: a word (sleep, rest, light_work, heavy_work) or a rung of that ladder as a number (0 to 3), so a timeline can schedule their day; the editable when unwired" }
        },
        outputs: {
          co2Delta: { ...KGPS, description: "their CO2, for a crew's person_<k> input or an atmosphere's delta_CO2 input" },
          litresPerMinute: { quantity: "VolumetricFlow", unit: "L/min", description: "the same, as a volume of CO2 per minute" },
          activityLevel: { ...RATIO, description: "what they are doing, as the rung of the ladder (0 asleep to 3 at heavy work)" }
        },
        capabilities: ["source", "co2", "crew", "person", "air_quality"]
      }
    });
    reg.register("Physics.Habitat:crew", () => createHabitatCrewNode(), {
      label: "Crew (CO2 source)",
      category: "Physics.Habitat",
      docPath: doc("crew.md"),
      ...ports(new HabitatCrewNode()),
      // The persons' pool: one input per person wired in, the next appearing as the last is taken.
      variadicInput: [{ prefix: CREW_PERSON_PREFIX, type: "float" }],
      signature: {
        purpose: "people as a CO2 source in kg/s: the persons wired into its pool (one person_<k> input each, the pool growing as persons are added), plus a head count at one activity for the people nobody names, each at the activity's rate in litres per minute (NASA's bands), no volume folded in",
        inputs: {
          [`${CREW_PERSON_PREFIX}0`]: { ...KGPS, description: "a person's co2Delta (Physics.Habitat:person); the pool grows (person_1, person_2, ...) as persons are wired" },
          count: { quantity: "Count", unit: "person", description: "head count of the unnamed people, on top of the persons wired; the editable when unwired" },
          activity: { quantity: "Category", description: "the unnamed people's activity: sleep, rest, light_work or heavy_work; the editable when unwired" }
        },
        outputs: {
          co2Delta: { ...KGPS, description: "the crew's CO2, persons and count together, for an atmosphere's delta_CO2 input" },
          litresPerMinute: { quantity: "VolumetricFlow", unit: "L/min", description: "the same, as a volume of CO2 per minute" },
          headcount: { quantity: "Count", unit: "person", description: "the persons wired plus the count" }
        },
        capabilities: ["source", "co2", "crew", "air_quality"]
      }
    });
    reg.register("Physics.Habitat:scrubber", () => createHabitatScrubberNode(), {
      label: "CO2 scrubber (mass)",
      category: "Physics.Habitat",
      docPath: doc("scrubber.md"),
      ...ports(new HabitatScrubberNode()),
      signature: {
        purpose: "a CO2 scrubber at a command fraction, in its datasheet's units: a flow in m3/s that follows the command with a lag, a single-pass efficiency, the CO2 removed in kg/s from the concentration it draws, and its electrical power",
        inputs: {
          command: { ...RATIO, description: "0 to 1, the commanded fraction of full speed" },
          ppm: { ...PPM, description: "the CO2 concentration of the air it draws (the volume's ppm_CO2)" },
          pressure: { ...PA, description: "the air pressure, the editable default when unwired" },
          temperature: { ...KELVIN, description: "the air temperature, the editable default when unwired" }
        },
        outputs: {
          co2Delta: { ...KGPS, description: "minus the CO2 removed, for an atmosphere's delta_CO2 input" },
          flow: { ...M3PS, description: "the air flow through the beds, after the lag" },
          effectiveFlow: { ...M3PS, description: "efficiency times the flow: the air cleaned per second" },
          power: { ...WATT, description: "electrical power drawn" }
        },
        capabilities: ["sink", "co2", "scrubber", "air_quality", "power_load"]
      }
    });
    reg.register("Physics.Habitat:fan", () => createHabitatFanNode(), {
      label: "HVAC fan",
      category: "Physics.Habitat",
      docPath: doc("fan.md"),
      ...ports(new HabitatFanNode()),
      signature: {
        purpose: "a ventilation fan: from a command to the flow it delivers against the duct's and the filter's resistance, through its fan curve (shutoff pressure, free delivery, fan laws), with a spin-up lag and its power",
        inputs: {
          command: { ...RATIO, description: "0 to 1, the commanded fraction of rated speed" },
          resistance: { ...RESISTANCE, description: "the resistance of what the fan blows through besides its own duct (a filter's)" }
        },
        outputs: {
          flow: { ...M3PS, description: "the flow delivered at the operating point" },
          pressureRise: { ...PA, description: "the pressure the fan develops at that flow" },
          power: { ...WATT, description: "electrical power drawn" },
          speedRatio: { ...RATIO, description: "the speed reached, 0 to 1, after the spin-up" }
        },
        capabilities: ["ventilation", "hvac", "fan", "flow", "power_load"]
      }
    });
    reg.register("Physics.Habitat:filter", () => createHabitatFilterNode(), {
      label: "HVAC filter",
      category: "Physics.Habitat",
      docPath: doc("filter.md"),
      ...ports(new HabitatFilterNode()),
      signature: {
        purpose: "an air filter on a duct: a resistance to the flow that grows with the dust it captures (its loading, the fault of a fouled filter), the pressure drop, and how far it stands from its end of life",
        inputs: {
          flow: { ...M3PS, description: "the air flow through the filter (a fan's)" },
          dustConcentration: { quantity: "Density", unit: "kg/m3", description: "the dust the air carries; the editable ambient value when unwired" },
          particulate_in: { quantity: "Particulate", description: "the dust it captures: a Physics.Particulate node (declarative in V1)" }
        },
        outputs: {
          resistance: { ...RESISTANCE, description: "the resistance at the current loading, for a fan's resistance input" },
          pressureDrop: { ...PA, description: "the pressure drop at the current flow" },
          loading: { quantity: "Mass", unit: "kg", description: "dust captured so far" },
          clogging: { ...RATIO, description: "loading over end-of-life loading: 0 clean, 1 to be replaced" }
        },
        capabilities: ["ventilation", "hvac", "filter", "fault", "fouling", "degradation"]
      }
    });
  }

  // plugins/habitat/studio.ts
  var plugin = {
    activate(ctx) {
      registerHabitatNodes(ctx.nodes, (file) => `/agent/habitat-docs/${file}`);
    }
  };
  var studio_default = plugin;
  return __toCommonJS(studio_exports);
})();
//# sourceMappingURL=SpkPluginHabitat.js.map
