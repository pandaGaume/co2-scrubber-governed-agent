/**
 * The machine in the control room, drawn as a 3D wireframe on a canvas.
 *
 * This module knows nothing about MCP. It is handed a reading and it draws it:
 * `app.js` owns the broker, this owns the geometry. The design and the reasons
 * behind it are in DESIGN_BRIEF.md.
 *
 * There is no library and no build step, as the repository asks. The model is
 * a list of 3D polylines; a rotation, a perspective divide and a fit to the
 * canvas project them.
 *
 * What is modelled is what the tools act on, and nothing else: the cabin
 * module with the crew in it and a CO2 field whose density is the measured
 * ppm, the duct out of it, the scrubber column holding the impeller, the motor
 * under it and the sorbent bed under that, and the return duct back into the
 * cabin floor.
 *
 * What moves, and why it is allowed to:
 *   - the impeller turns at the measured flow, and stops dead when the power
 *     is off. One turn of the blades is one turn of the real thing;
 *   - the bright dashes in the ducts travel at that same flow.
 * Nothing else moves. The camera is fixed. An animation that encodes nothing
 * tells an engineering jury "this is a mockup" louder than any sentence the
 * narrator can say.
 *
 * Behind it all, the view out of the window: the lunar surface in wireframe,
 * the Earth over the horizon. It is the one thing here that measures nothing.
 * It is allowed because it is the view, because it never moves, and because it
 * is held far below the legibility of anything that carries a value. Night 9
 * of 14 means the sun is down and the Earth is up, which is why the Earth is
 * drawn and the sun is not.
 */

const TAU = Math.PI * 2;

export const HUE = { NOMINAL: "#2fe0c8", ELEVATED: "#ffb648", CRITICAL: "#ff5064" };

// ── The model, in its own units. Right-handed, Y up; one unit is about half a
// metre. These are proportions of a machine, not measurements of one: no
// dimension of the real scrubber is published, so none is claimed here.

const CABIN = { x0: -4.3, x1: -1.25, r: 1.25 };
const COL = { x: 1.85, top: 1.45, bottom: -1.75, r: 0.84 };
const IMP = { y: 0.88, r: 0.7 };
const MOTOR = { y0: 0.08, y1: 0.55, r: 0.34 };
const BED = { y0: -1.6, y1: -0.6, r: 0.76 };

/** Where each callout's leader line touches the machine. */
export const ANCHOR = {
    impeller: [COL.x + IMP.r * 0.6, IMP.y, 0],
    motor: [COL.x, (MOTOR.y0 + MOTOR.y1) / 2, 0],
    bed: [COL.x, (BED.y0 + BED.y1) / 2, 0],
};

/** A ring of `n` points in the plane normal to `axis`, centred on `c`. */
function ring(c, r, axis, n = 30) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
        const a = (i / n) * TAU;
        const u = Math.cos(a) * r;
        const v = Math.sin(a) * r;
        if (axis === "x") pts.push([c[0], c[1] + u, c[2] + v]);
        else if (axis === "y") pts.push([c[0] + u, c[1], c[2] + v]);
        else pts.push([c[0] + u, c[1] + v, c[2]]);
    }
    return pts;
}

/** A cylinder as rings plus longitudinal rails. */
function cylinder(from, to, r, axis, rings = 5, rails = 12) {
    const out = [];
    for (let i = 0; i < rings; i++) {
        const t = rings === 1 ? 0 : i / (rings - 1);
        const c = [0, 0, 0];
        c[axis === "x" ? 0 : axis === "y" ? 1 : 2] = from + (to - from) * t;
        out.push(ring(c, r, axis, 30));
    }
    for (let i = 0; i < rails; i++) {
        const a = (i / rails) * TAU;
        const u = Math.cos(a) * r;
        const v = Math.sin(a) * r;
        if (axis === "x") out.push([[from, u, v], [to, u, v]]);
        else if (axis === "y") out.push([[u, from, v], [u, to, v]]);
        else out.push([[u, v, from], [u, v, to]]);
    }
    return out;
}

const at = (lines, dx, dy, dz) => lines.map((l) => l.map(([x, y, z]) => [x + dx, y + dy, z + dz]));

/** A duct: a polyline of axis-aligned segments, as rings along it plus rails,
    so it reads as a tube and not as a stack of hoops. */
function duct(path, r) {
    const out = [];
    for (let s = 0; s < path.length - 1; s++) {
        const a = path[s];
        const b = path[s + 1];
        const axis = a[0] !== b[0] ? "x" : a[1] !== b[1] ? "y" : "z";
        const k = axis === "x" ? 0 : axis === "y" ? 1 : 2;
        const steps = Math.max(2, Math.round(Math.abs(b[k] - a[k]) / 0.55));
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            out.push(ring([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t], r, axis, 14));
        }
        for (let i = 0; i < 4; i++) {
            const ang = (i / 4) * TAU;
            const u = Math.cos(ang) * r;
            const v = Math.sin(ang) * r;
            const off = axis === "x" ? [0, u, v] : axis === "y" ? [u, 0, v] : [u, v, 0];
            out.push([[a[0] + off[0], a[1] + off[1], a[2] + off[2]], [b[0] + off[0], b[1] + off[1], b[2] + off[2]]]);
        }
    }
    return out;
}

const DUCT_OUT = [[-2.1, 1.25, 0], [-2.1, 2.05, 0], [COL.x, 2.05, 0], [COL.x, COL.top, 0]];
const DUCT_BACK = [[COL.x, COL.bottom, 0], [COL.x, -2.35, 0], [-3.2, -2.35, 0], [-3.2, -1.25, 0]];

/** Everything that does not change with a reading. */
const STATIC = [
    ...cylinder(CABIN.x0, CABIN.x1, CABIN.r, "x", 7, 14).map((pts) => ({ pts, kind: "hull" })),
    { pts: ring([CABIN.x0 - 0.22, 0, 0], CABIN.r * 0.62, "x", 24), kind: "hull" },
    { pts: ring([CABIN.x1 + 0.22, 0, 0], CABIN.r * 0.62, "x", 24), kind: "hull" },
    ...cylinder(COL.bottom, COL.top, COL.r, "y", 6, 12).map((pts) => ({ pts, kind: "hull" })),
    ...duct(DUCT_OUT, 0.24).map((pts) => ({ pts, kind: "duct" })),
    ...duct(DUCT_BACK, 0.24).map((pts) => ({ pts, kind: "duct" })),
    ...at(cylinder(MOTOR.y0, MOTOR.y1, MOTOR.r, "y", 3, 8), COL.x, 0, 0).map((pts) => ({ pts, kind: "part" })),
    { pts: [[COL.x, MOTOR.y1, 0], [COL.x, IMP.y - 0.16, 0]], kind: "part" },
    ...at(cylinder(BED.y0, BED.y1, BED.r, "y", 3, 10), COL.x, 0, 0).map((pts) => ({ pts, kind: "part" })),
];

/** The crew, in the module. Four, because the mission is four. */
const CREW = [-3.7, -3.1, -2.5, -1.9]
    .map((x) => [
        { pts: ring([x, -0.72, 0.15], 0.17, "z", 14), kind: "crew" },
        { pts: [[x, -0.89, 0.15], [x, -1.18, 0.15]], kind: "crew" },
    ])
    .flat();

/** The impeller, rebuilt each frame at its own angle. */
function impeller(angle) {
    const out = [{ pts: ring([COL.x, IMP.y, 0], IMP.r, "y", 36), kind: "imp" }];
    const p = (rad, dy, a) => [COL.x + Math.cos(a) * rad, IMP.y + dy, Math.sin(a) * rad];
    for (let i = 0; i < 6; i++) {
        const a = angle + (i / 6) * TAU;
        const b = a + 0.42;
        out.push({ pts: [p(0.2, -0.07, a), p(IMP.r, -0.16, a), p(IMP.r, 0.16, b), p(0.2, 0.07, b), p(0.2, -0.07, a)], kind: "imp" });
    }
    out.push({ pts: ring([COL.x, IMP.y - 0.1, 0], 0.2, "y", 16), kind: "imp" });
    out.push({ pts: ring([COL.x, IMP.y + 0.1, 0], 0.2, "y", 16), kind: "imp" });
    return out;
}

/** The CO2 in the cabin: a fixed lattice of motes, as many of them lit as the
    reading is worth. A fixed seed, so the field never dances between two
    readings; only how many are drawn changes. */
const MOTES = (() => {
    let seed = 11;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    return Array.from({ length: 260 }, () => {
        const a = rnd() * TAU;
        const rr = Math.sqrt(rnd()) * (CABIN.r - 0.12);
        return [CABIN.x0 + 0.15 + rnd() * (CABIN.x1 - CABIN.x0 - 0.3), Math.sin(a) * rr, Math.cos(a) * rr];
    });
})();

/** The stars, fixed, in fractions of the canvas. */
const STARS = (() => {
    let seed = 3;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    return Array.from({ length: 34 }, () => [rnd(), rnd() * 0.56, 0.4 + rnd() * 0.9]);
})();

const STYLE = {
    hull: { w: 1, c: "47, 224, 200", a: 0.34 },
    duct: { w: 1.1, c: "47, 224, 200", a: 0.42 },
    part: { w: 1.1, c: "47, 224, 200", a: 0.5 },
    crew: { w: 1.6, c: "122, 214, 204", a: 0.85 },
    imp: { w: 1.6, c: "47, 224, 200", a: 1 },
};

// ── The camera. Fixed: only the impeller turns.
const YAW = -0.58;
const PITCH = 0.30;
const DIST = 15;

/**
 * Creates the scene on a canvas.
 *
 * `leaders` is a list of `{ el, anchor }`: the callout card, and which part of
 * the machine its line touches. The line is drawn to where the browser
 * actually laid the card out, so the two can never drift apart.
 */
export function createScene(canvas, sceneEl, leaders = []) {
    const ctx = canvas.getContext("2d");
    const cam = { cx: 0, cy: 0, scale: 60 };
    let box = { w: 0, h: 0 };
    let angle = 0;
    let phase = 0;
    let raf = 0;
    let lastT = 0;

    /** The reading being drawn. `reading` false means the page has none, and
        the machine is drawn with nothing in it rather than with a guess. */
    let view = { reading: false, power: false, speed: 0, state: "NOMINAL", ppm: 0, residual: 0, hotBed: false };

    function project(p) {
        const cy = Math.cos(YAW);
        const sy = Math.sin(YAW);
        const x = p[0] * cy - p[2] * sy;
        const z = p[0] * sy + p[2] * cy;
        const cp = Math.cos(PITCH);
        const sp = Math.sin(PITCH);
        const y2 = p[1] * cp - z * sp;
        const z2 = p[1] * sp + z * cp;
        const f = DIST / (DIST + z2);
        return [cam.cx + x * f * cam.scale, cam.cy - y2 * f * cam.scale, z2];
    }

    /** Depth to opacity. The far side of a wireframe being fainter is what
        makes it read as a solid and not as a tangle. */
    const fade = (z) => Math.max(0.22, Math.min(1, 0.66 - z * 0.2));

    function fit() {
        const dpr = devicePixelRatio || 1;
        box = { w: canvas.clientWidth, h: canvas.clientHeight };
        if (!box.w || !box.h) return;
        canvas.width = box.w * dpr;
        canvas.height = box.h * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Fit the model into the left of the scene, leaving the callout column
        // free. Measured from the model itself, so moving a part can never
        // push the drawing off the canvas.
        cam.cx = 0;
        cam.cy = 0;
        cam.scale = 1;
        let x0 = 1e9;
        let x1 = -1e9;
        let y0 = 1e9;
        let y1 = -1e9;
        for (const { pts } of STATIC) {
            for (const p of pts) {
                const [x, y] = project(p);
                if (x < x0) x0 = x;
                if (x > x1) x1 = x;
                if (y < y0) y0 = y;
                if (y > y1) y1 = y;
            }
        }
        cam.scale = Math.min((box.w * 0.63) / (x1 - x0), (box.h * 0.94) / (y1 - y0));
        cam.cx = box.w * 0.335 - ((x0 + x1) / 2) * cam.scale;
        cam.cy = box.h * 0.5 + ((y0 + y1) / 2) * cam.scale;
    }

    function stroke(pts, style, alphaScale = 1) {
        const proj = pts.map(project);
        let zsum = 0;
        for (const p of proj) zsum += p[2];
        const a = style.a * fade(zsum / proj.length) * alphaScale;
        ctx.strokeStyle = `rgba(${style.c}, ${a.toFixed(3)})`;
        ctx.lineWidth = style.w;
        ctx.beginPath();
        proj.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
    }

    function label(text, p, dx, dy, colour = "rgba(109, 144, 142, 0.9)") {
        const [x, y] = project(p);
        ctx.fillStyle = colour;
        ctx.font = "9px ui-monospace, monospace";
        ctx.fillText(text.toUpperCase(), x + dx, y + dy);
    }

    /** A few bright dashes running along a duct's centre line, at the flow. */
    function flow(path, ph, hue) {
        const segs = [];
        let total = 0;
        for (let i = 0; i < path.length - 1; i++) {
            const a = path[i];
            const b = path[i + 1];
            const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
            segs.push({ a, b, len, from: total });
            total += len;
        }
        const point = (d) => {
            for (const s of segs) {
                if (d <= s.from + s.len) {
                    const t = (d - s.from) / s.len;
                    return [s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t, s.a[2] + (s.b[2] - s.a[2]) * t];
                }
            }
            return path[path.length - 1];
        };
        const n = 7;
        for (let i = 0; i < n; i++) {
            const d = ((i / n + ph) % 1) * total;
            const [x0, y0, z0] = project(point(d));
            const [x1, y1] = project(point(Math.min(total, d + 0.34)));
            ctx.strokeStyle = hue;
            ctx.globalAlpha = 0.28 + fade(z0) * 0.5;
            ctx.lineWidth = 2.2;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y1);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }

    /** A dot on the projected part, and a line to the card as laid out. */
    function leader(p3, el, hot) {
        if (!el) return;
        const cb = el.getBoundingClientRect();
        const sb = sceneEl.getBoundingClientRect();
        const tx = cb.left - sb.left;
        const ty = cb.top - sb.top + cb.height / 2;
        const [x, y] = project(p3);
        const colour = hot ? "255, 182, 72" : "47, 224, 200";
        ctx.strokeStyle = `rgba(${colour}, 0.42)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (tx - x) * 0.45, y);
        ctx.lineTo(tx - 6, ty);
        ctx.stroke();
        ctx.fillStyle = `rgba(${colour}, 0.95)`;
        ctx.beginPath();
        ctx.arc(x, y, 2.6, 0, TAU);
        ctx.fill();
    }

    function drawMoon() {
        const w = box.w;
        const h = box.h;
        const hy = h * 0.70;
        const vx = w * 0.42;

        ctx.save();
        ctx.lineWidth = 1;

        for (const [sx, sy, r] of STARS) {
            ctx.fillStyle = `rgba(122, 214, 204, ${(0.1 + r * 0.1).toFixed(3)})`;
            ctx.beginPath();
            ctx.arc(sx * w, sy * h, r * 0.8, 0, TAU);
            ctx.fill();
        }

        const ex = w * 0.11;
        const ey = h * 0.18;
        const er = Math.min(w, h) * 0.075;
        ctx.strokeStyle = "rgba(122, 214, 204, 0.17)";
        ctx.beginPath();
        ctx.arc(ex, ey, er, 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = "rgba(122, 214, 204, 0.1)";
        for (let i = 1; i <= 3; i++) {
            const t = (i / 4) * 2 - 1;
            ctx.beginPath();
            ctx.ellipse(ex, ey + t * er, er * Math.sqrt(1 - t * t), er * 0.12, 0, 0, TAU);
            ctx.stroke();
        }
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.ellipse(ex, ey, er * (0.34 + i * 0.33), er, 0, 0, TAU);
            ctx.stroke();
        }

        // the horizon. The Moon is small, so it curves.
        ctx.strokeStyle = "rgba(64, 214, 200, 0.28)";
        ctx.beginPath();
        ctx.moveTo(-20, hy + 26);
        ctx.quadraticCurveTo(w * 0.5, hy - 30, w + 20, hy + 26);
        ctx.stroke();

        ctx.strokeStyle = "rgba(64, 214, 200, 0.1)";
        for (let i = 1; i <= 6; i++) {
            const t = i / 6;
            ctx.beginPath();
            ctx.ellipse(vx, hy + t * t * (h - hy) * 1.5, w * (0.16 + t * 1.1), (h - hy) * t * t * 0.62 + 4, 0, 0, Math.PI);
            ctx.stroke();
        }
        for (let i = -6; i <= 6; i++) {
            ctx.beginPath();
            ctx.moveTo(vx, hy);
            ctx.lineTo(vx + i * w * 0.34, h + 30);
            ctx.stroke();
        }

        ctx.strokeStyle = "rgba(64, 214, 200, 0.14)";
        for (const [cx, cy, rx, ry] of [[w * 0.16, h * 0.87, w * 0.13, h * 0.034], [w * 0.63, h * 0.79, w * 0.075, h * 0.019], [w * 0.88, h * 0.94, w * 0.1, h * 0.027]]) {
            ctx.beginPath();
            ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
            ctx.stroke();
            ctx.beginPath();
            ctx.ellipse(cx, cy, rx * 0.6, ry * 0.6, 0, 0, TAU);
            ctx.stroke();
        }
        ctx.restore();

        // the machine stands in front of the window, so the view is cleared
        const g = ctx.createRadialGradient(w * 0.335, h * 0.5, 8, w * 0.335, h * 0.5, Math.max(w, h) * 0.34);
        g.addColorStop(0, "rgba(4, 11, 14, 0.84)");
        g.addColorStop(1, "rgba(4, 11, 14, 0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);

        // the window aperture: four corner brackets, nothing more
        ctx.strokeStyle = "rgba(64, 214, 200, 0.22)";
        ctx.lineWidth = 1;
        const m = 2;
        const L = 16;
        for (const [cx, cy, sx, sy] of [[m, m, 1, 1], [w - m, m, -1, 1], [m, h - m, 1, -1], [w - m, h - m, -1, -1]]) {
            ctx.beginPath();
            ctx.moveTo(cx, cy + sy * L);
            ctx.lineTo(cx, cy);
            ctx.lineTo(cx + sx * L, cy);
            ctx.stroke();
        }
    }

    function draw() {
        if (!box.w) return;
        ctx.clearRect(0, 0, box.w, box.h);
        drawMoon();

        const hue = HUE[view.state] ?? HUE.NOMINAL;

        for (const { pts, kind } of STATIC) stroke(pts, STYLE[kind]);

        if (view.reading) {
            const lit = Math.round(Math.max(0, Math.min(1, (view.ppm - 400) / 4600)) * MOTES.length);
            for (let i = 0; i < lit; i++) {
                const [x, y, z] = project(MOTES[i]);
                ctx.fillStyle = hue;
                ctx.globalAlpha = 0.1 + fade(z) * 0.3;
                ctx.beginPath();
                ctx.arc(x, y, 1.5, 0, TAU);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        }

        for (const { pts, kind } of CREW) stroke(pts, STYLE[kind]);

        // the bed, filled to the residual
        if (view.reading && view.residual > 0) {
            const load = Math.max(0, Math.min(1, view.residual / 0.1));
            const top = BED.y0 + (BED.y1 - BED.y0) * load;
            const colour = view.hotBed ? "255, 182, 72" : "47, 224, 200";
            for (let i = 0; i < 7; i++) {
                stroke(ring([COL.x, BED.y0 + ((top - BED.y0) * i) / 6, 0], BED.r - 0.04, "y", 24), { w: 1, c: colour, a: 0.5 });
            }
        }

        const spinning = view.reading && view.power && view.speed > 0;
        if (spinning) for (const path of [DUCT_OUT, DUCT_BACK]) flow(path, phase, hue);

        for (const { pts, kind } of impeller(angle)) stroke(pts, STYLE[kind], view.power ? 1 : 0.35);

        label("cabin", [CABIN.x0, CABIN.r, 0], -6, -12);
        label("crew 4", [-2.8, -1.3, 0.15], -14, 16);
        label("scrubber", [COL.x, COL.top, 0], -26, -16, "rgba(122, 214, 204, 0.95)");
        label("impeller", [COL.x - COL.r, IMP.y, 0], -74, 4);
        label("motor", [COL.x - COL.r, MOTOR.y1 - 0.2, 0], -56, 4);
        label("sorbent bed", [COL.x - COL.r, (BED.y0 + BED.y1) / 2, 0], -92, 4);

        for (const { el, anchor } of leaders) leader(ANCHOR[anchor], el, anchor === "bed" && view.hotBed);
    }

    function frame(t) {
        const dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0;
        lastT = t;
        if (view.reading && view.power && view.speed > 0) {
            angle += dt * (view.speed / 100) * 3.4;
            phase = (phase + dt * (view.speed / 100) * 0.9) % 1;
        }
        draw();
        raf = requestAnimationFrame(frame);
    }

    fit();
    new ResizeObserver(() => {
        fit();
        draw();
    }).observe(sceneEl);
    raf = requestAnimationFrame(frame);

    return {
        /** Hands the scene a reading. Anything absent is drawn as absent. */
        set(next) {
            view = { ...view, ...next };
        },
        /** Forgets the reading: the machine keeps its shape, loses its values. */
        clear() {
            view = { reading: false, power: false, speed: 0, state: "NOMINAL", ppm: 0, residual: 0, hotBed: false };
        },
        redraw: draw,
        stop() {
            cancelAnimationFrame(raf);
        },
    };
}
