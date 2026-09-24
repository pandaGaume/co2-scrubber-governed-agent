/**
 * Builds the habitat reference document, `graphs/habitat.spikypanda`, from
 * `specs/habitat-parameters.json` (every physical constant) through the real
 * node registry (the substrate's plugins and the repository's habitat
 * plugin): the headless equivalent of building the graph in the editor and
 * saving. Alongside it, `graphs/habitat.manifest.json` records the sha256 of
 * the parameter file and of the document, and the flows the graph delivers
 * at rest (the ventilation with the file's filter, and with a clean one),
 * so the document names the assumptions it was built with and what they
 * imply.
 *
 *     node dist/scripts/build-habitat-graph.js [graphs/habitat.spikypanda]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { sha256File } from "../lib/files.js";
import { fromRoot, isMain, relativeToRoot } from "../lib/paths.js";
import { buildRegistry } from "../lib/registry.js";
import { buildHabitatDocument, HABITAT_DOCUMENT_FILE, HABITAT_MANIFEST_FILE, HABITAT_PARAMETERS_FILE, readHabitatParameters, runHabitat } from "../lib/habitat.js";

export function buildHabitatGraph(outFile = HABITAT_DOCUMENT_FILE): { document: string; manifest: string } {
    const parameters = readHabitatParameters();
    const registry = buildRegistry();
    const { json, spec } = buildHabitatDocument({}, parameters, registry);
    mkdirSync(path.dirname(outFile), { recursive: true });
    writeFileSync(outFile, json);
    // What the graph delivers: five minutes at rest, the fan at its command, with the file's filter and with a clean one.
    const rest = { speedSteps: [{ from: 0, to: 5, value: 0 }], minutes: 5 };
    const delivered = runHabitat(buildHabitatDocument(rest, parameters, registry).json, 5, rest.speedSteps, registry).at(-1)!;
    const clean = runHabitat(buildHabitatDocument({ ...rest, filterLoadingKg: 0 }, parameters, registry).json, 5, rest.speedSteps, registry).at(-1)!;
    const manifest = {
        document: { file: relativeToRoot(outFile), sha256: sha256File(outFile), nodes: spec.nodes.length, connections: spec.connections.length },
        parameters: { file: relativeToRoot(HABITAT_PARAMETERS_FILE), sha256: sha256File(HABITAT_PARAMETERS_FILE), status: parameters.status },
        ventilation: {
            deliveredM3PerMinute: Number(delivered.fan_m3_per_min.toFixed(3)),
            withCleanFilterM3PerMinute: Number(clean.fan_m3_per_min.toFixed(3)),
            filterClogging: Number(delivered.filter_clogging.toFixed(3)),
        },
        builtAt: new Date().toISOString(),
    };
    const manifestFile = outFile === HABITAT_DOCUMENT_FILE ? HABITAT_MANIFEST_FILE : outFile.replace(/\.spikypanda$/, ".manifest.json");
    writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
    console.log(`${relativeToRoot(outFile)}: ${spec.nodes.length} nodes, ${spec.connections.length} connections; the ventilation delivers ${manifest.ventilation.deliveredM3PerMinute} m3/min (${manifest.ventilation.withCleanFilterM3PerMinute} with a clean filter)`);
    return { document: outFile, manifest: manifestFile };
}

if (isMain(import.meta.url)) {
    buildHabitatGraph(process.argv[2] ? fromRoot(process.argv[2]) : HABITAT_DOCUMENT_FILE);
}
