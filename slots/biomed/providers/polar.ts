/**
 * A real chest strap, read by a Python sidecar, one process per person.
 *
 * `scripts/polar-h10-bridge.py` holds the Bluetooth connection and prints one
 * JSON reading per line; this class spawns it, reads its stdout, and hands
 * each reading to the service as if it had read it itself. Why Python and not
 * Node is argued at the top of that file: on Windows the usual Node BLE
 * packages want a WinUSB driver swapped under the Bluetooth adapter, which
 * takes the adapter away from everything else on the machine.
 *
 * `live` is true because there is a real heart on the other end. It stays
 * true when the strap goes quiet: silence is a signal loss, which the service
 * already treats as a reason to abort, not as a rehearsal. The one thing this
 * class must never do is invent a reading to cover a gap.
 *
 * A sidecar that dies is reported and not restarted in a loop: a strap that
 * has slipped off, or a Python without `bleak`, is a thing for a person to
 * fix, and the service will say `signal-lost` in the meantime, which is the
 * truth.
 */
import { spawn, spawnSync, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import { createInterface, type Interface } from "node:readline";
import { fromRoot } from "../../../lib/paths.js";
import type { HeartRateProvider, HeartRateSample, SampleSink } from "../heart-rate-provider.js";

export interface StrapBinding {
    /** The subject this strap is worn by. */
    subjectId: string;
    /** The strap's Bluetooth address; the sidecar scans when absent. */
    address?: string;
}

export interface PolarOptions {
    straps?: StrapBinding[];
    /** Only consider straps whose advertised name starts with this. */
    namePrefix?: string;
    /** The interpreter to run the sidecar with; `BIOMED_PYTHON`, else `python`. */
    python?: string;
    /** Seconds the sidecar looks for a strap before giving up. */
    timeoutSeconds?: number;
    log?: (line: string) => void;
}

const SCRIPT = "scripts/polar-h10-bridge.py";

/**
 * Why the sidecar could not run on this interpreter, or null when it could.
 * Asked once, when the slot comes up: a missing `bleak` otherwise shows only
 * as a signal lost a few seconds into a session, which reads like a strap
 * that slipped off rather than a package nobody installed.
 */
export function sidecarProblem(python: string = process.env.BIOMED_PYTHON ?? "python"): string | null {
    const probe = spawnSync(python, ["-c", "import bleak"], { encoding: "utf8", timeout: 15000 });
    if (probe.error) return `${python} cannot be run (${probe.error.message}); set BIOMED_PYTHON to the interpreter that has bleak`;
    if (probe.status !== 0) return `bleak is not installed for ${python}: run npm run biomed:setup, then restart the server`;
    return null;
}

/** stdin is closed: the sidecar is a source, it takes no orders. */
type Sidecar = ChildProcessByStdio<null, Readable, Readable>;

interface Running {
    subjectId: string;
    child: Sidecar;
    lines: Interface;
}

export class PolarProvider implements HeartRateProvider {
    readonly id = "polar";
    readonly live = true;

    private running: Running[] = [];

    constructor(private readonly options: PolarOptions = {}) {}

    private get python(): string {
        return this.options.python ?? process.env.BIOMED_PYTHON ?? "python";
    }

    private say(line: string): void {
        (this.options.log ?? ((l: string) => console.log(l)))(`[biomed] ${line}`);
    }

    async start(subjectIds: string[], onSample: SampleSink): Promise<void> {
        await this.stop();
        const script = fromRoot(SCRIPT);

        for (const subjectId of subjectIds) {
            const strap = this.options.straps?.find((s) => s.subjectId === subjectId);
            const args = [script, "--subject", subjectId, "--timeout", String(this.options.timeoutSeconds ?? 12)];
            if (strap?.address) args.push("--address", strap.address);
            if (this.options.namePrefix) args.push("--name-prefix", this.options.namePrefix);

            let child: Sidecar;
            try {
                child = spawn(this.python, args, { stdio: ["ignore", "pipe", "pipe"] });
            } catch (e) {
                throw new Error(`cannot run ${this.python}: ${e instanceof Error ? e.message : String(e)} (set BIOMED_PYTHON to the interpreter that has bleak)`);
            }

            child.on("error", (e) => this.say(`${subjectId}: the strap reader could not start: ${e.message} (is ${this.python} on the path, with bleak installed?)`));
            child.stderr.setEncoding("utf8");
            child.stderr.on("data", (chunk: string) => {
                for (const line of chunk.split(/\r?\n/)) if (line.trim()) this.say(`${subjectId}: ${line.trim()}`);
            });
            child.on("exit", (code) => this.say(`${subjectId}: the strap reader stopped (code ${code ?? "signal"}); readings stop here and the monitor will say the signal is lost`));

            const lines = createInterface({ input: child.stdout });
            lines.on("line", (line: string) => {
                const text = line.trim();
                if (!text) return;
                let sample: HeartRateSample;
                try {
                    sample = JSON.parse(text) as HeartRateSample;
                } catch {
                    this.say(`${subjectId}: unreadable line from the strap reader: ${text.slice(0, 120)}`);
                    return;
                }
                // The sidecar is trusted for the wire format and nothing else: a
                // reading no heart produces is dropped rather than shown.
                if (!Number.isFinite(sample.bpm) || sample.bpm < 20 || sample.bpm > 240) {
                    this.say(`${subjectId}: dropped a reading of ${String(sample.bpm)} bpm, outside what this slot accepts`);
                    return;
                }
                onSample({ ...sample, subjectId, at: sample.at ?? new Date().toISOString(), source: sample.source ?? "polar-h10" });
            });

            this.running.push({ subjectId, child, lines });
            this.say(`${subjectId}: strap reader started${strap?.address ? ` on ${strap.address}` : " (scanning)"}`);
        }
    }

    async stop(): Promise<void> {
        for (const r of this.running) {
            r.lines.close();
            if (!r.child.killed) r.child.kill();
        }
        this.running = [];
    }
}
