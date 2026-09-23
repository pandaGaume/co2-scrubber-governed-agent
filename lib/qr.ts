/**
 * A QR code, computed here rather than fetched.
 *
 * The control room shows two of them so a phone can reach the pages meant for
 * a hand: the night and the medical monitoring. Nothing is loaded from a third
 * party, which the design brief forbids and which would also mean a filmed
 * demo depending on someone else's CDN being up.
 *
 * One configuration, chosen so the code stays short and checkable:
 *
 *   version 4 (33 x 33), error correction L, byte mode, one block.
 *
 * Level L at version 4 is a single block of 80 data codewords and 20 error
 * correction codewords, so there is no block interleaving to get wrong, and 78
 * bytes of payload is far more than the longest address a local network will
 * produce (`http://192.168.100.200:3001/simulation.html` is 46). L rather than
 * M because this is read from a screen at arm's length, not off a crate in a
 * warehouse.
 *
 * The parts are the standard ones: the payload becomes codewords, Reed-Solomon
 * over GF(256) adds the twenty, the modules are laid in the usual zigzag, and
 * the eight masks are scored by the four penalty rules so the least ugly wins.
 * `tests/qr.test.ts` reads its own output back and checks the round trip, which
 * is what makes this trustworthy: a QR that does not scan is worse than no QR.
 */
const VERSION = 4;
export const SIZE = 17 + VERSION * 4; // 33
const DATA_CODEWORDS = 80;
const EC_CODEWORDS = 20;
/** Where alignment patterns are centred for this version; only (26, 26) is
    used, the others fall on the finders. */
const ALIGN = 26;

// ── GF(256), the field the error correction lives in ──────────────────────

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
    let x = 1;
    for (let i = 0; i < 255; i++) {
        EXP[i] = x;
        LOG[x] = i;
        x <<= 1;
        if (x & 0x100) x ^= 0x11d; // the primitive polynomial QR uses
    }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}

const mul = (a: number, b: number): number => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

/** The generator polynomial for `count` error correction codewords. */
function generator(count: number): number[] {
    let poly = [1];
    for (let i = 0; i < count; i++) {
        const next = new Array(poly.length + 1).fill(0);
        for (let j = 0; j < poly.length; j++) {
            next[j] ^= poly[j];
            next[j + 1] ^= mul(poly[j], EXP[i]);
        }
        poly = next;
    }
    return poly;
}

/** The error correction codewords for a block of data codewords. */
export function ecc(data: Uint8Array, count = EC_CODEWORDS): Uint8Array {
    const gen = generator(count);
    const rest = new Uint8Array(count);
    for (const byte of data) {
        const factor = byte ^ rest[0];
        rest.copyWithin(0, 1);
        rest[count - 1] = 0;
        if (factor !== 0) for (let i = 0; i < count; i++) rest[i] ^= mul(gen[i + 1], factor);
    }
    return rest;
}

// ── The payload, as codewords ─────────────────────────────────────────────

/** Mode indicator, length, the bytes themselves, a terminator, then the pad
    pair the specification names, until the block is full. */
export function codewords(text: string): Uint8Array {
    const bytes = new TextEncoder().encode(text);
    if (bytes.length > DATA_CODEWORDS - 2) throw new Error(`${bytes.length} bytes will not fit a version ${VERSION} L code (${DATA_CODEWORDS - 2} at most)`);

    const bits: number[] = [];
    const push = (value: number, width: number): void => {
        for (let i = width - 1; i >= 0; i--) bits.push((value >> i) & 1);
    };
    push(0b0100, 4);      // byte mode
    push(bytes.length, 8); // the count indicator is eight bits below version 10
    for (const b of bytes) push(b, 8);
    push(0, Math.min(4, DATA_CODEWORDS * 8 - bits.length)); // terminator
    while (bits.length % 8) bits.push(0);

    const out = new Uint8Array(DATA_CODEWORDS);
    for (let i = 0; i < bits.length; i += 8) {
        let byte = 0;
        for (let k = 0; k < 8; k++) byte = (byte << 1) | bits[i + k];
        out[i / 8] = byte;
    }
    for (let i = bits.length / 8, pad = 0; i < DATA_CODEWORDS; i++, pad++) out[i] = pad % 2 === 0 ? 0xec : 0x11;
    return out;
}

// ── The matrix ────────────────────────────────────────────────────────────

const newGrid = (): number[][] => Array.from({ length: SIZE }, () => new Array<number>(SIZE).fill(-1));

/** Everything that is not data: finders, separators, timing, alignment, the
    dark module, and the areas the format bits will take. */
function skeleton(): number[][] {
    const g = newGrid();
    const set = (r: number, c: number, v: number): void => {
        if (r >= 0 && r < SIZE && c >= 0 && c < SIZE) g[r][c] = v;
    };

    const finder = (row: number, col: number): void => {
        for (let r = -1; r <= 7; r++) {
            for (let c = -1; c <= 7; c++) {
                const inside = r >= 0 && r <= 6 && c >= 0 && c <= 6;
                const ring = r === 0 || r === 6 || c === 0 || c === 6;
                const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
                set(row + r, col + c, inside && (ring || core) ? 1 : 0);
            }
        }
    };
    finder(0, 0);
    finder(0, SIZE - 7);
    finder(SIZE - 7, 0);

    for (let i = 8; i < SIZE - 8; i++) {
        const v = i % 2 === 0 ? 1 : 0;
        g[6][i] = v;
        g[i][6] = v;
    }

    for (let r = -2; r <= 2; r++) {
        for (let c = -2; c <= 2; c++) {
            const edge = Math.abs(r) === 2 || Math.abs(c) === 2;
            set(ALIGN + r, ALIGN + c, edge || (r === 0 && c === 0) ? 1 : 0);
        }
    }

    g[4 * VERSION + 9][8] = 1; // the dark module

    // reserved for the format information, filled once the mask is chosen
    for (let i = 0; i <= 8; i++) {
        if (g[8][i] === -1) g[8][i] = 0;
        if (g[i][8] === -1) g[i][8] = 0;
    }
    for (let i = 0; i < 8; i++) {
        if (g[8][SIZE - 1 - i] === -1) g[8][SIZE - 1 - i] = 0;
        if (g[SIZE - 1 - i][8] === -1) g[SIZE - 1 - i][8] = 0;
    }
    return g;
}

/** True where a module belongs to the skeleton and must not take data. */
function reserved(): boolean[][] {
    const g = skeleton();
    return g.map((row) => row.map((v) => v !== -1));
}

const MASKS: Array<(r: number, c: number) => boolean> = [
    (r, c) => (r + c) % 2 === 0,
    (r) => r % 2 === 0,
    (r, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

/** The four penalty rules, so the least ugly mask is the one that ships. */
function penalty(g: number[][]): number {
    let score = 0;

    const run = (get: (a: number, b: number) => number): void => {
        for (let a = 0; a < SIZE; a++) {
            let last = -1;
            let length = 0;
            for (let b = 0; b < SIZE; b++) {
                const v = get(a, b);
                if (v === last) {
                    length++;
                    if (length === 5) score += 3;
                    else if (length > 5) score += 1;
                } else {
                    last = v;
                    length = 1;
                }
            }
        }
    };
    run((a, b) => g[a][b]);
    run((a, b) => g[b][a]);

    for (let r = 0; r < SIZE - 1; r++) {
        for (let c = 0; c < SIZE - 1; c++) {
            const v = g[r][c];
            if (v === g[r][c + 1] && v === g[r + 1][c] && v === g[r + 1][c + 1]) score += 3;
        }
    }

    const PATTERN = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
    const looks = (get: (a: number, b: number) => number, a: number, b: number): boolean => {
        for (let i = 0; i < PATTERN.length; i++) if (get(a, b + i) !== PATTERN[i]) return false;
        return true;
    };
    for (let a = 0; a < SIZE; a++) {
        for (let b = 0; b + PATTERN.length <= SIZE; b++) {
            if (looks((x, y) => g[x][y], a, b)) score += 40;
            if (looks((x, y) => g[y][x], a, b)) score += 40;
        }
    }

    let dark = 0;
    for (const row of g) for (const v of row) dark += v;
    const percent = (dark * 100) / (SIZE * SIZE);
    score += Math.floor(Math.abs(percent - 50) / 5) * 10;
    return score;
}

/** Format information for level L and a mask: BCH(15, 5), then the fixed XOR. */
function formatBits(mask: number): number {
    const data = (0b01 << 3) | mask; // 01 is level L
    let rest = data << 10;
    for (let i = 14; i >= 10; i--) if ((rest >> i) & 1) rest ^= 0b10100110111 << (i - 10);
    return ((data << 10) | rest) ^ 0b101010000010010;
}

function placeFormat(g: number[][], mask: number): void {
    const bits = formatBits(mask);
    const bit = (i: number): number => (bits >> i) & 1;
    for (let i = 0; i <= 5; i++) g[8][i] = bit(i);
    g[8][7] = bit(6);
    g[8][8] = bit(7);
    g[7][8] = bit(8);
    for (let i = 9; i <= 14; i++) g[14 - i][8] = bit(i);

    for (let i = 0; i <= 7; i++) g[SIZE - 1 - i][8] = bit(i);
    for (let i = 8; i <= 14; i++) g[8][SIZE - 15 + i] = bit(i);
}

/**
 * The matrix for a piece of text.
 *
 * Returns a square array of 0 and 1, one per module, with no quiet zone: the
 * caller adds it, because how much margin a drawing needs depends on what it
 * is drawn into.
 */
export function matrix(text: string): number[][] {
    const data = codewords(text);
    const all = new Uint8Array(DATA_CODEWORDS + EC_CODEWORDS);
    all.set(data, 0);
    all.set(ecc(data), DATA_CODEWORDS);

    const taken = reserved();
    const base = skeleton();

    // The zigzag: two columns at a time, from the bottom right, column six
    // skipped because the vertical timing pattern lives there.
    const bits: number[] = [];
    for (const byte of all) for (let i = 7; i >= 0; i--) bits.push((byte >> i) & 1);

    const grid = base.map((row) => [...row]);
    let at = 0;
    let upward = true;
    for (let right = SIZE - 1; right > 0; right -= 2) {
        if (right === 6) right = 5;
        for (let step = 0; step < SIZE; step++) {
            const r = upward ? SIZE - 1 - step : step;
            for (const c of [right, right - 1]) {
                if (taken[r][c]) continue;
                grid[r][c] = at < bits.length ? bits[at++] : 0;
            }
        }
        upward = !upward;
    }

    let best: { score: number; g: number[][]; mask: number } | null = null;
    for (let mask = 0; mask < 8; mask++) {
        const g = grid.map((row) => Array.from(row));
        for (let r = 0; r < SIZE; r++) {
            for (let c = 0; c < SIZE; c++) if (!taken[r][c] && MASKS[mask](r, c)) g[r][c] ^= 1;
        }
        placeFormat(g, mask);
        const score = penalty(g);
        if (!best || score < best.score) best = { score, g, mask };
    }
    return best!.g;
}

/**
 * The matrix as an SVG, which is what a page actually wants.
 *
 * One path for every dark module rather than one rect each: a 33 by 33 code is
 * a thousand modules, and a page that shows two of them should not carry two
 * thousand elements. `shape-rendering: crispEdges` because a QR blurred by
 * antialiasing is a QR a camera argues with.
 */
export function svg(text: string, { quiet = 4, dark = "#04090c", light = "#d3ecea" } = {}): string {
    const g = matrix(text);
    const side = g.length + quiet * 2;
    const parts: string[] = [];
    for (let r = 0; r < g.length; r++) {
        for (let c = 0; c < g.length; c++) if (g[r][c]) parts.push(`M${c + quiet} ${r + quiet}h1v1h-1z`);
    }
    return (
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" shape-rendering="crispEdges">` +
        `<rect width="${side}" height="${side}" fill="${light}"/>` +
        `<path fill="${dark}" d="${parts.join("")}"/></svg>`
    );
}
