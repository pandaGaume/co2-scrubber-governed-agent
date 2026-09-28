/**
 * A formula over named variables, evaluated without `eval`: numbers, the
 * variables given, + - * / ^, parentheses and a few functions (sqrt, abs,
 * exp, log, ln, log10, min, max, pow). Shared by the graph factory's
 * parametric candidates, the forge's contract behaviors and the physics
 * slot's relations (2026-09-28: a relation of the knowledge graph is a
 * formula written as data, read here).
 */

export type Variables = Record<string, number>;

/** The functions a formula may call (2026-09-27: a contract's physics has square roots and exponentials). */
const FUNCTIONS: Record<string, (...args: number[]) => number> = {
    sqrt: (x) => Math.sqrt(x),
    abs: (x) => Math.abs(x),
    exp: (x) => Math.exp(x),
    log: (x) => Math.log(x),
    ln: (x) => Math.log(x),
    log10: (x) => Math.log10(x),
    min: (...xs) => Math.min(...xs),
    max: (...xs) => Math.max(...xs),
    pow: (x, y) => Math.pow(x, y),
};

export function evaluateExpression(source: string, vars: Variables): number {
    const tokens = source.match(/\d+(\.\d+)?([eE][-+]?\d+)?|\.\d+([eE][-+]?\d+)?|[A-Za-z_][A-Za-z0-9_]*|[-+*/^(),]|\S/g) ?? [];
    let i = 0;
    const peek = () => tokens[i];
    const take = () => tokens[i++];
    const primary = (): number => {
        const t = take();
        if (t === undefined) throw new Error(`"${source}": the formula ends too early`);
        if (t === "(") {
            const v = sum();
            if (take() !== ")") throw new Error(`"${source}": a parenthesis is not closed`);
            return v;
        }
        if (t === "-") return -primary();
        if (t === "+") return primary();
        if (/^[\d.]/.test(t)) return Number(t);
        if (/^[A-Za-z_]/.test(t)) {
            if (peek() === "(" && t in FUNCTIONS) {
                take();
                const args: number[] = [];
                if (peek() !== ")") {
                    args.push(sum());
                    while (peek() === ",") {
                        take();
                        args.push(sum());
                    }
                }
                if (take() !== ")") throw new Error(`"${source}": the call of ${t} is not closed`);
                return FUNCTIONS[t](...args);
            }
            if (!(t in vars)) throw new Error(`"${source}": no variable "${t}" (${Object.keys(vars).join(", ") || "none given"}; functions: ${Object.keys(FUNCTIONS).join(", ")})`);
            return vars[t];
        }
        throw new Error(`"${source}": unexpected "${t}"`);
    };
    const power = (): number => {
        const base = primary();
        if (peek() === "^") {
            take();
            return Math.pow(base, power());
        }
        return base;
    };
    const product = (): number => {
        let v = power();
        while (peek() === "*" || peek() === "/") v = take() === "*" ? v * power() : v / power();
        return v;
    };
    const sum = (): number => {
        let v = product();
        while (peek() === "+" || peek() === "-") v = take() === "+" ? v + product() : v - product();
        return v;
    };
    const value = sum();
    if (i < tokens.length) throw new Error(`"${source}": unexpected "${tokens[i]}"`);
    if (!Number.isFinite(value)) throw new Error(`"${source}" is not a finite number with ${JSON.stringify(vars)}`);
    return value;
}

