/**
 * Builds the harness map, `graphs/harness-map.spikypanda` (2026-10-09): the whole harness as the studio shows it, to analyse it.
 * The twelve stages are the harness's own nodes (the catalogue's types, the edges the runner wires, on one line with the
 * reasoner's branch one step below, as in the agent's graph); around them, as labelled nodes of the Logic plugin (the factory's
 * document draws its scientific loop the same way), what the stages lean on: the runner, the reasoning state, the decisions
 * learned, the provider and the models, the interpreter, the guard and its parts, the refusal and its dependents, the
 * sub-agents, the factories, the broker and its slots, the people, the board. Below, marked PROPOSÉ, the ideas not built yet:
 * the frame brief, model, harness, submission; the prompt made by a sub-agent through a dialogue loop; the cognitive loop of
 * the model's turn; each part of the first and the third with what exists of it today and what is missing.
 *
 * Next to the document, `graphs/harness-map.zones.json`: the zones (the labels of their nodes) the page frames one at a time,
 * and the tint of each proposed node. The studio's page is `ui/map-loader.ts`.
 *
 *     node dist/scripts/build-harness-map.js
 *
 * Opened in the studio: /studio/node-editor-v2/index.html?mcp=0&ext=/agent/map.js
 */
import { mkdirSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import type { DocumentConnectionSpec, DocumentNodeSpec } from "@spiky-panda/factory";
import { HARNESS_NODES, V1_HARNESS_NODES, createHarnessNode } from "@spiky-panda/harness";
import { loadFactory } from "../lib/factory.js";
import { fromRoot, isMain, relativeToRoot } from "../lib/paths.js";
import { buildRegistry } from "../lib/registry.js";
import { V1_EDGES } from "../harness/lib/flow.js";

/** A part of the map is a Sequence of the Logic plugin: one way in, one way out, no control port, so it stays low. */
const PART_TYPE = "Logic.Flow:sequence";

/** The sizes the studio gives a node, estimated here to lay the map out (the title holds on one line); `overlaps` holds the layout to them. */
const ROW = 146;
const GAP = 44;
const PART_H = 128;
const STAGE_H = 132;
const widthOf = (label: string): number => Math.ceil(44 + 6.1 * [...label].length);

/** What each stage does, said for the map. */
const STAGE_LABELS: Readonly<Record<string, string>> = {
    observe: "1  observe : l'état reconstruit",
    context: "2  context : la clé de mémoire",
    lookup: "3  lookup : les décisions apprises",
    gate: "4  gate : rejouer ou demander",
    request: "5  request : ce qui part au modèle",
    reason: "6  reason : le modèle décide",
    merge: "7  merge : politique ou modèle",
    guard: "8  guard : le jugement",
    execute: "9  execute : l'outil tourne",
    "observe-after": "10  observe-after : l'atelier relu",
    evaluate: "11  evaluate : la récompense",
    record: "12  record : l'expérience gardée",
};

/** The stages on one line, the reasoner's branch (5, 6) one step below, wider apart than in the agent's graph for the French labels. */
const PITCH = 262;
const STAGE_AT: Readonly<Record<string, readonly [number, number]>> = {
    observe: [0, 0],
    context: [PITCH, 0],
    lookup: [2 * PITCH, 0],
    gate: [3 * PITCH, 0],
    request: [4 * PITCH, 150],
    reason: [5 * PITCH, 150],
    merge: [6 * PITCH, 0],
    guard: [7 * PITCH, 0],
    execute: [8 * PITCH, 0],
    "observe-after": [9 * PITCH, 0],
    evaluate: [10 * PITCH, 0],
    record: [11 * PITCH, 0],
};

/** How a proposed node is drawn: the idea, what exists of it today, what exists in part, what is missing, a question still open. */
type Tint = "proposed" | "today" | "partial" | "missing" | "question";
interface Part {
    id: string;
    label: string;
    x: number;
    y: number;
    zone: string;
    tint?: Tint;
}
type Item = readonly [id: string, label: string, tint?: Tint];
type Noted = readonly [id: string, label: string, noteId: string, note: string, tint: Tint];

const parts: Part[] = [];
const put = (zone: string, id: string, label: string, x: number, y: number, tint?: Tint): void => void parts.push({ id, label, x, y, zone, tint });
const rowWidth = (items: ReadonlyArray<Item>): number => items.reduce((w, [, label]) => w + widthOf(label) + GAP, -GAP);
/** Parts left to right from (x, y). */
function row(zone: string, x: number, y: number, items: ReadonlyArray<Item>): void {
    for (const [id, label, tint] of items) {
        put(zone, id, label, x, y, tint);
        x += widthOf(label) + GAP;
    }
}
/** Rows of parts, one under the other from (x, y). */
function grid(zone: string, x: number, y: number, rows: ReadonlyArray<ReadonlyArray<Item>>): void {
    rows.forEach((items, i) => row(zone, x, y + i * ROW, items));
}
/** Parts top to bottom from (x, y), or bottom to top for a negative step. */
function column(zone: string, x: number, y: number, items: ReadonlyArray<Item>, step = ROW): void {
    for (const [id, label, tint] of items) {
        put(zone, id, label, x, y, tint);
        y += step;
    }
}
/** An idea: its head, then its parts one under the other, each with what exists of it on its right. */
function idea(zone: string, x: number, y: number, head: Item, items: ReadonlyArray<Noted>): void {
    put(zone, head[0], head[1], x, y, "proposed");
    const xNote = x + Math.max(...items.map(([, label]) => widthOf(label))) + GAP;
    items.forEach(([id, label, noteId, note, tint], i) => {
        put(zone, id, label, x, y + (i + 1) * ROW, "proposed");
        put(zone, noteId, note, xNote, y + (i + 1) * ROW, tint);
    });
}

// The map is a grid of zones, each small enough to be framed at a size where its labels read: the system on top, the loop
// with its runner, then the sub-agents and the frame, then the prompt builder and the cognitive loop.
const Y_SYSTEM = -1560;
const X_SLOTS = 1300;
const Y_LOWER = 1250;
const Y_LOWEST = 2350;
const X_RIGHT = 1800;

// The people, the pages, the station, the broker.
grid("acteurs", 0, Y_SYSTEM, [
    [
        ["commander", "HUMAIN  commandant : autorise chaque test, répond dans le panneau de Mother"],
        ["signatory", "HUMAIN  signataire autorisé : signe normes, règles, faits, playbooks"],
    ],
    [
        ["station", "STATION · MOTHER  registre, mises en service, questions, relais des procédures"],
        ["pages", "PAGES  salle de contrôle, scénarios, moniteur médical, cette carte"],
    ],
    [["broker", "BROKER MCP  rôles, jetons, politique ; chaque slot est un fournisseur d'outils"]],
]);

// The broker's slots, the world behind the board, the models behind the reasoner.
const SLOT_ROWS: ReadonlyArray<ReadonlyArray<Item>> = [
    [
        ["s-library", "SLOT library  normes, faits, règles signés ; justify"],
        ["s-physics", "SLOT physics  unités, relations ; cite"],
        ["s-workspace", "SLOT workspace  fichiers des tâches"],
    ],
    [
        ["s-twin", "SLOT twin · forge  catalogue, bac à sable, code"],
        ["s-biomed", "SLOT biomed  présence, moniteur"],
        ["s-factory", "SLOT factory  demandes, tâches, inventaire"],
    ],
    [
        ["s-scenario", "SLOT scenario  joue les mises en service"],
        ["s-scrubber", "SLOT scrubber  carte ESP32, Modbus : dernière autorité"],
        ["s-reasoner", "SLOT reasoner  un modèle par usage (routing.json)"],
    ],
];
const SLOTS = SLOT_ROWS.flat();
grid("slots", X_SLOTS, Y_SYSTEM, SLOT_ROWS);
const [scenario] = SLOT_ROWS[2];
put("slots", "world", "MONDE RÉEL  turbine, capteurs de CO2", X_SLOTS + widthOf(scenario[1]) + GAP, Y_SYSTEM + 3 * ROW);
column("slots", X_SLOTS + Math.max(...SLOT_ROWS.map(rowWidth)) + 2 * GAP, Y_SYSTEM, [
    ["m-super", "MODÈLE  Nemotron 3 Super : agent, procédure, graphe, code, Observer, Superviseur, compose, sens"],
    ["m-nano", "MODÈLE  Nemotron 3 Nano, profil du serveur : diagnostic, playbook, réflexion, recommandation, onnx, forme"],
    ["m-ultra", "MODÈLE  Nemotron 3 Ultra : essayé le 8 octobre, écarté"],
]);

// The runner around the loop, on its left.
const RUNNER: ReadonlyArray<Item> = [
    ["r-context", "RUNNER  contexte lu une fois : étagère, télémétrie, rapport de contrats"],
    ["r-supervisor", "RUNNER  Superviseur de contrats appelé quand plusieurs producteurs donnent des faits"],
    ["r-catalogue", "RUNNER  catalogue : outils du broker et locaux, moins ceux que la conduite ferme"],
    ["r-loop", "RUNNER  un pas par appel, jusqu'à task.done accepté par le validateur ou le budget épuisé"],
    ["r-ends", "RUNNER  fins anticipées : SOURCE_CONFLICT, STUCK, MISSING_CAPABILITY, WAITING"],
    ["r-end", "RUNNER  fin : trace, manifeste, proposition à la station, recettes, journal .logs"],
];
column("runner", -80 - Math.max(...RUNNER.map(([, label]) => widthOf(label))), -300, RUNNER);

// What the stages lean on, above the line and below it, next to the stage each serves: stages 1 to 6 ...
const [xRequest] = STAGE_AT.request;
const [xMerge] = STAGE_AT.merge;
const [xGuard] = STAGE_AT.guard;
const [xExecute] = STAGE_AT.execute;
const [xEvaluate] = STAGE_AT.evaluate;
const [xRecord] = STAGE_AT.record;
put("loop-a", "decisions", "DÉCISIONS APPRISES  recettes par signature de tâche ; une décision promue est rejouée sans modèle", PITCH, -150);
column("etat", 0, 170, [
    ["st-order", "ÉTAT  ordre de marche : étapes, allowedNow, closedNow, doneWhen"],
    ["st-invariants", "ÉTAT  invariants : objectif, constantes connues (statut, source), inconnues, hypothèses, observé"],
    ["st-where", "ÉTAT  où : phase, itération, budget ; nextActions"],
    ["st-evidence", "ÉTAT  preuves compactes, sources citables, hypothèse courante, évaluation"],
    ["st-last", "ÉTAT  lastAction ; lastRefusal : chaque point, attendu, envoyé, dependentPaths"],
    ["st-memory", "ÉTAT  exigences, questions ouvertes ; mémoire en conseil, jamais en autorité"],
]);
column("loop-a", xRequest, 320, [
    ["provider", "FOURNISSEUR  slot reasoner : profil, protocole, modèle par usage ; l'état, pas la conversation"],
    ["batch", "LOT D'APPELS  jusqu'à 4 appels par réponse, passés un à un, rendus ensemble"],
    ["retry", "RÉPONSE COUPÉE  relance sans réflexion ; appels écrits en texte relus"],
    ["runlog", "JOURNAL DE TEST  chaque appel au modèle : entrées, parties en cache, sorties (.logs)"],
]);
// Where the proposals would plug into the loop: the prompt into request, the cognitive loop into the model's turn.
put("loop-a", "p-here", "PROPOSÉ · ICI  request recevrait le prompt du fabricant (plus bas)", xRequest, 0, "proposed");
put("loop-a", "c-here", "PROPOSÉ · ICI  le tour du modèle suivrait la boucle cognitive (plus bas)", xRequest, -150, "proposed");
// ... and stages 7 to 12: the interpreter, the execution and the evaluator on one row above the line, each as near its stage
// as the row lets it; the guard's parts above the guard; the refusal and what follows it below.
const INTERPRETER = "INTERPRÈTE DE FORME  schéma tenu : rien ; sinon coercition, puis extraction (Nano)";
const EXECUTION = "EXÉCUTION  l'outil d'un slot par le broker, ou une capacité locale";
const EVALUATOR = "ÉVALUATEUR  récompense du pas ; à task.done, le validateur du sujet";
const xExecution = Math.max(xExecute, xMerge + widthOf(INTERPRETER) + GAP);
put("garde", "interpreter", INTERPRETER, xMerge, -150);
put("loop-b", "execution", EXECUTION, xExecution, -150);
put("loop-b", "evaluator", EVALUATOR, Math.max(xEvaluate, xExecution + widthOf(EXECUTION) + GAP), -150);
put("loop-b", "memory", "MÉMOIRE  épisodes, règles apprises : candidate, essai, consolidée", xRecord, -150 - ROW);
column("garde", xGuard, -150 - ROW, [
    ["g-schema", "GARDE 1  schéma de l'outil (Ajv)"],
    ["g-builder", "GARDE 2  constructeur : outil du sujet, chemins, appel répété, task.plan conforme"],
    ["g-topic", "GARDE 3  sujet : portes de la conduite, règles signées, justifications"],
], -ROW);
column("garde", xGuard, 170, [
    ["refusal", "REFUS NOTÉ  chaque point : chemin, attendu, envoyé, dependentPaths ; revient dans l'état"],
    ["meaning", "LECTEUR DE SENS  même point, même valeur : Super lit l'intention, rejouée au pas suivant"],
    ["stuck", "STUCK  trois refus de suite sur les mêmes points : la tâche s'arrête"],
]);

// The sub-agents and the factories.
grid("agents", 0, Y_LOWER, [
    [
        ["a-observer", "SOUS-AGENT  Observer : description et télémétrie vers la demande de jumeau ; un outil, son garde, 3 essais"],
        ["a-supervisor", "SOUS-AGENT  Superviseur de contrats : faits typés et rapport déterministe vers un verdict typé ; ne corrige rien"],
    ],
    [
        ["a-compose", "SOUS-AGENT  compose : un texte sans outil ni conversation, les phrases de Mother"],
        ["a-night", "SOUS-AGENT  agent de nuit : décisions sur l'épurateur, la même boucle à douze étapes"],
    ],
    [
        ["f-task", "USINE  une tâche = runTask(sujet) : mission, outils, garde, conduite, validateur"],
        ["f-conduct", "USINES AVEC ORDRE DE MARCHE  procédure, diagnostic, playbook, recommandation, réflexion"],
    ],
    [
        ["f-noconduct", "USINES SANS GRAPHE DE CONDUITE  graphe, code, onnx : étapes dites une à une"],
        ["handoff", "PASSAGE DE RELAIS  un besoin de code ouvre l'usine de code, la demande est rejouée ensuite"],
    ],
]);

// PROPOSED: the frame of the second image, each part with what exists of it.
idea("cadre", X_RIGHT, Y_LOWER, ["p-frame", "PROPOSÉ · CADRE  la deuxième image : un brief court, le reste découvert"], [
    ["p-brief", "CADRE 1  brief initial : mission + contraintes + succès", "n-brief", "AUJOURD'HUI  mission, noyau, politique ; le succès est doneWhen, dans l'état", "today"],
    ["p-model", "CADRE 2  modèle : choisit la prochaine action", "n-model", "AUJOURD'HUI  étape 6 reason ; un modèle par usage", "today"],
    ["p-harness", "CADRE 3  harnais / broker : découverte, outils, validation, état, preuves, mémoire", "n-harness", "MANQUE  la découverte : chaque appel porte tous les outils ouverts (26 à 27, trv7)", "missing"],
    ["p-submit", "CADRE 4  soumission : garde + correction éventuelle", "n-submit", "AUJOURD'HUI  étape 8 ; refus avec dependentPaths ; lecteur de sens", "today"],
    ["p-done", "CADRE 5  terminé", "n-done", "AUJOURD'HUI  task.done, jugé par le validateur du sujet", "today"],
]);

// PROPOSED: the prompt made by a sub-agent through a dialogue loop: its steps, then beside them the recipes, what it answers
// today and the kinds the same loop runs over; under them the questions still open.
const BUILDER: ReadonlyArray<Item> = [
    ["p-builder", "PROPOSÉ · FABRICANT DE PROMPT  un sous-agent, à l'entrée d'une étape et après un refus", "proposed"],
    ["p-expose", "1 EXPOSER  les outils utiles de l'étape par nom et titre, les références, les points refusés", "proposed"],
    ["p-choose", "2 FAIRE CHOISIR  appel contraint : une enum des noms exposés", "proposed"],
    ["p-explain", "3 EXPLIQUER  définition des choisis ; faits par library.justify ; dépendants", "proposed"],
    ["p-stop", "4 ARRÊTER  la liste finale, deux tours au plus", "proposed"],
    ["p-assemble", "5 ASSEMBLER  mission + noyau + politique + le choisi + l'état, vers request", "proposed"],
];
column("prompt", 0, Y_LOWEST, BUILDER);
const xBeside = Math.max(...BUILDER.map(([, label]) => widthOf(label))) + GAP;
column("prompt", xBeside, Y_LOWEST, [
    ["p-recipes", "RECETTES DE CONTEXTE  la sélection qui a mené à une acceptation, rejouée sans dialogue", "proposed"],
    ["n-builder", "AUJOURD'HUI  26 à 27 outils entiers à chaque appel ; 21 700 jetons de prompt par appel en moyenne (trv7, Nano)", "today"],
]);
column("prompt", xBeside, Y_LOWEST + 2 * ROW, [
    ["p-tools", "MÊME BOUCLE  outils (point 2 de la revue)", "proposed"],
    ["p-refs", "MÊME BOUCLE  références (point 4)", "proposed"],
    ["p-fix", "MÊME BOUCLE  corrections (point 5)", "proposed"],
    ["p-out", "MÊME BOUCLE  règles de sortie (point 8)", "proposed"],
]);
row("prompt", 0, Y_LOWEST + BUILDER.length * ROW, [
    ["q-who", "QUESTION  qui choisit : le modèle de l'usine, ou un autre plus petit ?", "question"],
    ["q-when", "QUESTION  quand dialoguer : à chaque étape, à chaque refus, ou faute de recette ?", "question"],
    ["q-cache", "QUESTION  un prompt qui change perd le préfixe en cache (67 % servi du cache, trv7)", "question"],
]);

// PROPOSED: the cognitive loop of the first image, each part with what exists of it.
idea("cognitif", X_RIGHT, Y_LOWEST, ["c-head", "PROPOSÉ · BOUCLE COGNITIVE  la première image : le tour du modèle"], [
    ["c-observe", "COGNITIF 1  observer : acquérir des faits", "n-observe", "AUJOURD'HUI  noyau, tours 1 et 2 : brief, ordre de marche, refus, état", "today"],
    ["c-infer", "COGNITIF 2  inférer : inconnues et hypothèses", "n-infer", "MANQUE  aucun tour ne le demande ; l'état porte missingInformation, hypotheses, openQuestions", "missing"],
    ["c-investigate", "COGNITIF 3  enquêter : choisir et utiliser les outils", "n-investigate", "AUJOURD'HUI  noyau, tours 3 et 4 : appeler pour ce qui manque ; allowedNow ; lot d'appels", "today"],
    ["c-evaluate", "COGNITIF 4  évaluer : preuves et alternatives", "n-evaluate", "EN PARTIE  tour 5, après un refus ; ni preuves ni alternatives pesées", "partial"],
    ["c-decide", "COGNITIF 5  décider : conclure, poursuivre ou soumettre", "n-decide", "AUJOURD'HUI  tour 6 : remettre quand doneWhen est tenu ; sinon task.ask ou task.fail", "today"],
]);

/** The flows between labelled parts, from one to the next. */
const FLOWS: ReadonlyArray<readonly [string, string]> = [
    ["commander", "station"],
    ["signatory", "s-library"],
    ["pages", "broker"],
    ["station", "broker"],
    ...SLOTS.map(([id]) => ["broker", id] as const),
    ["s-scrubber", "world"],
    ["s-reasoner", "m-super"],
    ["s-reasoner", "m-nano"],
    ["r-context", "r-supervisor"],
    ["r-supervisor", "r-catalogue"],
    ["r-catalogue", "r-loop"],
    ["r-loop", "r-ends"],
    ["r-loop", "r-end"],
    ["r-supervisor", "a-supervisor"],
    ["provider", "batch"],
    ["batch", "retry"],
    ["provider", "s-reasoner"],
    ["interpreter", "g-schema"],
    ["g-schema", "g-builder"],
    ["g-builder", "g-topic"],
    ["refusal", "meaning"],
    ["meaning", "stuck"],
    ["refusal", "st-last"],
    ["execution", "broker"],
    ["memory", "st-memory"],
    ["a-observer", "f-noconduct"],
    ["f-task", "f-conduct"],
    ["f-task", "f-noconduct"],
    ["f-noconduct", "handoff"],
    ["p-frame", "p-brief"],
    ["p-brief", "p-model"],
    ["p-model", "p-harness"],
    ["p-harness", "p-submit"],
    ["p-submit", "p-done"],
    ["p-harness", "p-model"],
    ["p-submit", "p-model"],
    ["p-builder", "p-expose"],
    ["p-expose", "p-choose"],
    ["p-choose", "p-explain"],
    ["p-explain", "p-stop"],
    ["p-stop", "p-assemble"],
    ["p-stop", "p-choose"],
    ["p-builder", "p-recipes"],
    ["p-recipes", "p-assemble"],
    ["p-expose", "p-tools"],
    ["p-tools", "p-refs"],
    ["p-refs", "p-fix"],
    ["p-fix", "p-out"],
    ["p-assemble", "p-here"],
    ["c-here", "c-head"],
    ["c-head", "c-observe"],
    ["c-observe", "c-infer"],
    ["c-infer", "c-investigate"],
    ["c-investigate", "c-evaluate"],
    ["c-evaluate", "c-decide"],
    ["c-decide", "c-observe"],
];

/** The zones the page frames, in the order of its buttons: a zone is the nodes of its parts, and the stages it holds. */
const ZONES: ReadonlyArray<{ id: string; label: string; of: ReadonlyArray<string> }> = [
    { id: "acteurs", label: "personnes, station, broker", of: ["acteurs"] },
    { id: "slots", label: "slots, modèles", of: ["slots"] },
    { id: "runner", label: "runner", of: ["runner"] },
    { id: "loop-a", label: "étapes 1 à 6", of: ["stages-a", "loop-a"] },
    { id: "etat", label: "état", of: ["etat"] },
    { id: "loop-b", label: "étapes 7 à 12", of: ["stages-b", "loop-b", "garde"] },
    { id: "agents", label: "sous-agents, usines", of: ["agents"] },
    { id: "cadre", label: "cadre", of: ["cadre"] },
    { id: "prompt", label: "fabricant de prompt", of: ["prompt"] },
    { id: "cognitif", label: "boucle cognitive", of: ["cognitif"] },
];
/** The stages of each half of the loop, as the zones name them. */
const STAGES_A = new Set(["observe", "context", "lookup", "gate", "request", "reason"]);

interface Box {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
}
/** Every pair of nodes whose estimated boxes come nearer than `margin`. */
function overlaps(boxes: ReadonlyArray<Box>, margin = 10): string[] {
    const found: string[] = [];
    for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i], b = boxes[j];
            if (a.x < b.x + b.w + margin && b.x < a.x + a.w + margin && a.y < b.y + b.h + margin && b.y < a.y + a.h + margin) found.push(`${a.id} / ${b.id}`);
        }
    return found;
}

export function buildHarnessMap(outFile: string): void {
    const factory = loadFactory();
    const registry = buildRegistry();
    for (const entry of HARNESS_NODES) {
        const sample = createHarnessNode(entry.type);
        registry.register(entry.type, () => createHarnessNode(entry.type) as never, { label: entry.label, category: entry.type.split(":")[0], inputPorts: sample.inputPorts, outputPorts: sample.outputPorts });
    }
    const stages: DocumentNodeSpec[] = V1_HARNESS_NODES.map((entry) => {
        const stage = new entry.ctor().stage;
        const [x, y] = STAGE_AT[stage] ?? [0, 0];
        return { id: stage, typeId: entry.type, x, y, label: STAGE_LABELS[stage] ?? entry.label };
    });
    const labels = [...stages.map((n) => n.label!), ...parts.map((p) => p.label)];
    const repeated = labels.filter((l, i) => labels.indexOf(l) !== i);
    if (repeated.length) throw new Error(`the map's labels name its zones and tints, each once: ${repeated.join("; ")}`);
    const boxes: Box[] = [...stages.map((n) => ({ id: n.id, x: n.x, y: n.y, w: widthOf(n.label!), h: STAGE_H })), ...parts.map((p) => ({ id: p.id, x: p.x, y: p.y, w: widthOf(p.label), h: PART_H }))];
    const crowded = overlaps(boxes);
    if (crowded.length) throw new Error(`the map's nodes overlap: ${crowded.join(", ")}`);

    const nodes: DocumentNodeSpec[] = [...stages, ...parts.map((p) => ({ id: p.id, typeId: PART_TYPE, x: p.x, y: p.y, label: p.label }))];
    const connections: DocumentConnectionSpec[] = V1_EDGES.map(([from, output, to, input]) => ({ from: [from, output], to: [to, input] }));
    for (const [from, to] of FLOWS) connections.push({ from: [from, "then_0"], to: [to, "in"] });
    const json = factory.buildDocumentJson(registry, nodes, connections, []);
    mkdirSync(path.dirname(outFile), { recursive: true });
    writeFileSync(outFile, json + "\n");

    const members = (of: ReadonlyArray<string>): string[] => [...stages.filter((n) => of.includes(STAGES_A.has(n.id) ? "stages-a" : "stages-b")).map((n) => n.label!), ...parts.filter((p) => of.includes(p.zone)).map((p) => p.label)];
    const legend = {
        note: "The zones the harness map's page frames, by the labels of their nodes, and the tint of each proposed node (scripts/build-harness-map.ts).",
        zones: ZONES.map((z) => ({ id: z.id, label: z.label, members: members(z.of) })),
        tints: Object.fromEntries(parts.filter((p) => p.tint).map((p) => [p.label, p.tint])),
    };
    const legendFile = outFile.replace(/\.spikypanda$/, ".zones.json");
    writeFileSync(legendFile, JSON.stringify(legend, null, 2) + "\n");
    console.log(`${relativeToRoot(outFile)}: ${nodes.length} nodes, ${connections.length} connections; ${relativeToRoot(legendFile)}: ${legend.zones.length} zones`);
}

if (isMain(import.meta.url)) buildHarnessMap(fromRoot(process.argv[2] ?? "graphs/harness-map.spikypanda"));
