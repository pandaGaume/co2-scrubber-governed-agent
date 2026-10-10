/**
 * What the graph factory knows of the application, read from its spec
 * (`specs/graph/format.json`, 2026-09-28, zero domain in the harness): the
 * library graph a candidate starts from and is compared with, the saved twin
 * kept for comparison, where a generated node is wired into that graph, who
 * is told of each candidate, the slope under which a first minute reads
 * flat, the node types that frame a document; and its words.
 */
import { readFileSync } from "node:fs";
import { fromRoot } from "../../../lib/paths.js";
import { loadWords, say } from "../../core/words.js";

export interface GraphFormat {
    words: string;
    prompt: string;
    evaluateSchema: string;
    /** The library graph a candidate starts from, and is compared with. */
    reference: string;
    /** A saved twin kept for comparison, relative to the repository. */
    comparison: string;
    /** Where a generated node's output enters the reference graph: the node type that sums the sources, the prefix of its numbered inputs. */
    sink: { type: string; port: string; quantities?: string[] };
    notify?: { slot: string; tool: string };
    /** Below this slope, in the residual's unit per minute, a first minute reads flat: noise, not a trend. */
    flatSlope: number;
    /** Node types that frame a saved document (a scene preset, a solver), and those outside the balance a twin is about. */
    frame: string;
    outside: string;
}

export const GRAPH_FORMAT_FILE = "specs/graph/format.json";
export const GRAPH_FORMAT: GraphFormat = JSON.parse(readFileSync(fromRoot(...GRAPH_FORMAT_FILE.split("/")), "utf8")) as GraphFormat;
export const GRAPH_WORDS = loadWords(GRAPH_FORMAT.words);
export const gw = (key: string, vars?: Record<string, string | number>): string => say(GRAPH_WORDS, key, vars);
