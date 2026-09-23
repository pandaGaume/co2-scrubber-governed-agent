/**
 * The QR codes the control room shows, checked by reading them back.
 *
 * A QR that does not scan is worse than no QR: on a filming day nobody debugs
 * a phone camera. So this does not check that the drawing looks plausible, it
 * decodes it: the format bits give the mask, the mask comes off, the zigzag is
 * walked again and the bytes must be the ones that went in. The walk is
 * written here from the specification rather than imported from the encoder,
 * so a placement mistake has to be made twice to pass.
 *
 * It also checks the error correction as mathematics rather than as output: a
 * valid Reed-Solomon codeword is divisible by the generator polynomial, and
 * the remainder of that division must be zero.
 *
 * The encoder lives in `lib/qr.ts` and is served by the `qr` slot, which is
 * what a page asks rather than drawing its own: only this process knows the
 * address a phone has to reach.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as qr from "../lib/qr.js";

const SIZE = qr.SIZE;
const DATA_CODEWORDS = 80;
const EC_CODEWORDS = 20;
const ALIGN = 26;

/** The modules the skeleton owns, worked out here from the geometry. */
function reserved(): boolean[][] {
    const taken = Array.from({ length: SIZE }, () => new Array<boolean>(SIZE).fill(false));
    const block = (r0: number, c0: number, rows: number, cols: number) => {
        for (let r = r0; r < r0 + rows; r++) for (let c = c0; c < c0 + cols; c++) if (r >= 0 && r < SIZE && c >= 0 && c < SIZE) taken[r][c] = true;
    };
    block(0, 0, 9, 9);                 // finder, separator and format, top left
    block(0, SIZE - 8, 9, 8);          // top right
    block(SIZE - 8, 0, 8, 9);          // bottom left
    for (let i = 0; i < SIZE; i++) {
        taken[6][i] = true;
        taken[i][6] = true;
    }
    block(ALIGN - 2, ALIGN - 2, 5, 5); // the one alignment pattern of version 4
    return taken;
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

/** Reads the mask back out of the format information, the way a reader does. */
function maskOf(g: number[][]): number {
    let bits = 0;
    for (let i = 0; i <= 5; i++) bits |= g[8][i] << i;
    bits |= g[8][7] << 6;
    bits |= g[8][8] << 7;
    bits |= g[7][8] << 8;
    for (let i = 9; i <= 14; i++) bits |= g[14 - i][8] << i;
    const unmasked = bits ^ 0b101010000010010;
    const level = (unmasked >> 13) & 0b11;
    assert.equal(level, 0b01, "the format says error correction level L");
    return (unmasked >> 10) & 0b111;
}

/** Walks the zigzag and returns the codewords, mask removed. */
function readCodewords(g: number[][]): Uint8Array {
    const mask = maskOf(g);
    const taken = reserved();
    const bits: number[] = [];
    let upward = true;
    for (let right = SIZE - 1; right > 0; right -= 2) {
        if (right === 6) right = 5;
        for (let step = 0; step < SIZE; step++) {
            const r = upward ? SIZE - 1 - step : step;
            for (const c of [right, right - 1]) {
                if (taken[r][c]) continue;
                bits.push(g[r][c] ^ (MASKS[mask](r, c) ? 1 : 0));
            }
        }
        upward = !upward;
    }
    const out = new Uint8Array(Math.floor(bits.length / 8));
    for (let i = 0; i < out.length; i++) {
        let byte = 0;
        for (let k = 0; k < 8; k++) byte = (byte << 1) | bits[i * 8 + k];
        out[i] = byte;
    }
    return out;
}

/** The payload a reader would take from the codewords. */
function payload(words: Uint8Array): string {
    const mode = words[0] >> 4;
    assert.equal(mode, 0b0100, "byte mode");
    const length = ((words[0] & 0x0f) << 4) | (words[1] >> 4);
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i++) bytes[i] = ((words[1 + i] & 0x0f) << 4) | (words[2 + i] >> 4);
    return new TextDecoder().decode(bytes);
}

const ADDRESSES = [
    "http://192.168.5.32:3001/simulation.html",
    "http://192.168.5.32:3001/biomed.html",
    "http://192.168.100.200:3001/simulation.html", // the longest a home network gives
    "http://10.0.0.1:3001/biomed.html",
];

describe("the QR codes the control room shows", () => {
    it("reads back exactly what went in, for every address a local network produces", () => {
        for (const url of ADDRESSES) {
            const g = qr.matrix(url);
            assert.equal(g.length, SIZE, `${url}: a version 4 code is ${SIZE} modules`);
            assert.equal(payload(readCodewords(g)), url, `${url}: decoded to something else`);
        }
    });

    it("carries the patterns a reader looks for first", () => {
        const g = qr.matrix(ADDRESSES[0]);
        for (const [r0, c0] of [[0, 0], [0, SIZE - 7], [SIZE - 7, 0]] as const) {
            for (let r = 0; r < 7; r++) {
                for (let c = 0; c < 7; c++) {
                    const ring = r === 0 || r === 6 || c === 0 || c === 6;
                    const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
                    assert.equal(g[r0 + r][c0 + c], ring || core ? 1 : 0, `finder at ${r0},${c0}`);
                }
            }
        }
        for (let i = 8; i < SIZE - 8; i++) {
            assert.equal(g[6][i], i % 2 === 0 ? 1 : 0, "the horizontal timing pattern alternates");
            assert.equal(g[i][6], i % 2 === 0 ? 1 : 0, "the vertical timing pattern alternates");
        }
        assert.equal(g[4 * 4 + 9][8], 1, "the dark module is dark");
    });

    it("the error correction is a valid codeword: the generator divides it exactly", () => {
        const data = qr.codewords(ADDRESSES[0]);
        assert.equal(data.length, DATA_CODEWORDS);
        const parity = qr.ecc(data);
        assert.equal(parity.length, EC_CODEWORDS);
        // Dividing the whole codeword by the generator must leave nothing: that
        // is what makes it correctable, and it fails on an ordering or
        // off-by-one mistake that reading the bytes back would not catch.
        const whole = new Uint8Array(DATA_CODEWORDS + EC_CODEWORDS);
        whole.set(data, 0);
        whole.set(parity, DATA_CODEWORDS);
        assert.deepEqual([...qr.ecc(whole, EC_CODEWORDS).slice(0, EC_CODEWORDS)].filter((v) => v !== 0), [], "a remainder that is not zero is not a Reed-Solomon codeword");
    });

    it("refuses a payload it cannot hold rather than truncating it", () => {
        assert.throws(() => qr.matrix("x".repeat(200)), /will not fit/);
    });
});
