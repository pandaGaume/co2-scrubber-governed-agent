/**
 * The register of the procedure guard's rules held to the contract as it is (2026-09-30, docs/evaluateur.fr.md, E2): every rule has a
 * text that states it, whose phrase the text holds now, or is marked tacit or a gap with why; every rule of the signed document is
 * in it; each code's example is recognised as that code alone; every problem the guard refused the corpus's tasks for (the real
 * tasks of 29 and 30 September) is recognised by exactly one code. A rule the guard enforces can no longer be said nowhere in silence.
 *
 *     node --test dist/tests/
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { codesOf, loadRegister, stated, type TextVersion } from "../lib/rules-register.js";
import { episodesOf } from "../lib/working-memory.js";
import { fromRepository } from "../lib/paths.js";
import { PROCEDURE_TOPIC } from "../harness/topics/procedure/index.js";

const register = loadRegister("procedure")!;
const now: TextVersion = { cwd: fromRepository(), commit: null };
const everyDocument = new Set(readdirSync(fromRepository("docs", "library")).filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, "")));

describe("the register of the procedure guard's rules, held to the contract as it is", () => {
    it("every code once; every rule stated by a text that says it now, or tacit or a gap with why", () => {
        const codes = register.rules.map((r) => r.code);
        assert.equal(new Set(codes).size, codes.length, "a code is given once");
        for (const r of register.rules) {
            if (r.status === "stated") {
                assert.ok(r.states.length, `${r.code} is stated by no text`);
                for (const s of r.states) assert.equal(stated(s, now, everyDocument), true, `${r.code}: ${s.library ?? s.file}${s.pointer ?? ""} no longer says "${s.phrase}"`);
            } else assert.ok(r.note, `${r.code} is ${r.status}: say why`);
            for (const c of r.applies) assert.ok(register.conventions[c], `${r.code} applies ${c}, which the register does not hold`);
        }
        for (const [name, c] of Object.entries(register.conventions)) for (const s of c.states) assert.equal(stated(s, now, everyDocument), true, `the convention ${name}: ${s.file}${s.pointer ?? ""} no longer says "${s.phrase}"`);
    });

    it("every rule of the signed document is in the register by its id, stated or marked", () => {
        const spec = JSON.parse(readFileSync(fromRepository("specs", "procedure", "rules.contract.json"), "utf8")) as { signed: Record<string, unknown> };
        const signed = register.rules.filter((r) => r.signed).map((r) => r.code);
        assert.ok(signed.includes("floor.stop") && signed.includes("monitoring.occupied.unread"));
        assert.deepEqual(signed.filter((c) => !(c in spec.signed)), [], "a rule of the signed document the register does not say");
        assert.deepEqual(Object.keys(spec.signed).filter((c) => !signed.includes(c)), [], "a signed rule the document no longer has");
    });

    it("each code's example, and a signed rule's older wordings, recognised as that code, and as no other", () => {
        for (const r of register.rules) for (const ex of [...(r.example ? [r.example] : []), ...(r.examples ?? [])]) assert.deepEqual(codesOf(register, ex), [r.code], ex);
    });

    it("every problem the guard refused the corpus's tasks for is recognised by exactly one code", () => {
        const corpus = fromRepository("tests", "fixtures", "evaluator");
        const seen: string[] = [];
        const wrong: string[] = [];
        for (const fork of readdirSync(corpus, { withFileTypes: true }).filter((d) => d.isDirectory()))
            for (const e of episodesOf(path.join(corpus, fork.name), "procedure", { judges: PROCEDURE_TOPIC.judges ?? [], digest: PROCEDURE_TOPIC.digest }))
                for (const a of e.attempts.filter((x) => x.outcome === "GUARD_REJECTED"))
                    for (const p of a.problems.filter((x) => x.kind)) {
                        seen.push(p.says);
                        const codes = codesOf(register, p.says);
                        if (codes.length !== 1) wrong.push(`${codes.join(",") || "none"}: ${p.says.slice(0, 160)}`);
                    }
        assert.ok(seen.length >= 60, `${seen.length} problems read`);
        assert.deepEqual(wrong, []);
    });
});
