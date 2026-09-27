/**
 * The commander in Mother's chat (Tier 4), for the control room.
 *
 * Mother's lines are drawn by board.js. Her open questions to the commander
 * (station://questions: the authorisation of a test, the hand-off's
 * questions, a factory's task.ask) hang under them as chips. The commander
 * answers by a click on a chip, by a word typed at the prompt, or by voice
 * (the browser's speech recognition, no server); a standing order answers in
 * the commander's stead when set. Every answer is `station.answer`, signed
 * commander, and the station calls back whoever asked. The page decides
 * nothing.
 *
 * Mother's own lines (station://mother: a device registered, a procedure
 * refused and corrected, the request for authorisation) are the station's,
 * kept by the station and never sent to the speech slot, so the panel would
 * not show them: this module draws them in Mother's log, the newest on top as
 * board.js draws what the voice says (2026-09-27: a commissioning played from
 * the scenarios page went unseen in the control room).
 *
 * A station older than the authorise question leaves a commissioning
 * awaiting its authorisation with no question: the chips then call
 * `station.commissioning_authorise` directly.
 */
import { connectMcp, toolText } from "./vendor/mcp-http-client.js";

const POLL_MS = 2000;

const esc = (v) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** The option a word names: exact first, then a word of one label alone. */
export function optionOf(text, options) {
    const t = String(text).trim().toLowerCase();
    if (!t) return null;
    const exact = options.find((o) => o.id.toLowerCase() === t || o.label.toLowerCase() === t);
    if (exact) return exact;
    const hits = options.filter((o) => t.includes(o.id.toLowerCase()) || o.label.toLowerCase().split(/\W+/).some((w) => w.length > 2 && t.includes(w)));
    return hits.length === 1 ? hits[0] : null;
}

export function mountMotherChat({ box, form, input, mic, policy, lang, log }) {
    if (!box) return;
    let station = null;
    /** The last of Mother's lines drawn in the log; -1 until the first read, which draws the last few only. */
    let lastLine = -1;
    const locale = (document.documentElement.lang || "en").toLowerCase().startsWith("fr") ? "fr" : "en";
    const drawLines = (lines) => {
        if (!log || !Array.isArray(lines)) return;
        const fresh = lastLine < 0 ? lines.slice(-6) : lines.filter((l) => l.n > lastLine);
        for (const l of fresh) {
            const el = document.createElement("div");
            el.className = "line";
            // The English text is what the station sends the voice: board.js finds the line by it when the voice plays it.
            el.dataset.said = l.text?.en ?? "";
            el.innerHTML = `<span class="who">mother</span>`;
            el.appendChild(document.createTextNode(l.text?.[locale] ?? l.text?.en ?? ""));
            log.prepend(el);
        }
        while (log.children.length > 40) log.lastChild.remove();
        if (lines.length) lastLine = Math.max(lastLine, ...lines.map((l) => l.n));
        else if (lastLine < 0) lastLine = 0;
    };
    const heard = new Map();
    const notes = [];
    let open = [];
    let awaiting = [];

    const session = async () => (station ??= await connectMcp(location.origin, "station", { headers: {} }));
    const read = async (uri) => {
        const s = await session();
        const r = await s.request("resources/read", { uri });
        return JSON.parse(r.contents[0].text);
    };
    const call = async (tool, args) => {
        const s = await session();
        const r = await s.callTool(tool, args);
        const text = toolText(r);
        let body = null;
        try {
            body = JSON.parse(text);
        } catch {
            body = null;
        }
        if (r?.isError || body?.refused) throw new Error(body?.refused ?? text);
        return body?.result ?? body;
    };
    const note = (text) => {
        notes.push({ text, at: Date.now() });
        while (notes.length > 3) notes.shift();
        render();
    };

    function render() {
        const chips = open.map((q) => {
            const h = heard.get(q.id);
            const options = q.options.map((o) => `<button class="badge link" data-q="${esc(q.id)}" data-choice="${esc(o.id)}" type="button">${esc(o.label)}</button>`).join(" ");
            const text = q.from === "station" ? "" : `<div class="line ask"><span class="dim">${esc(q.from)}${q.taskId ? `, ${esc(q.taskId)}` : ""}: </span>${esc(q.question)}</div>`;
            const said = h ? `<div class="line dim">heard: "${esc(h.text)}"${h.option ? ` : ${esc(h.option.label)}` : ", no option matches: say one of the words above, or click"}</div>` : "";
            return `${text}<div class="chips"><span class="t">${esc(q.id)}</span>${options}<button class="badge link" data-voice="${esc(q.id)}" type="button" title="answer by voice">mic</button></div>${said}`;
        });
        const direct = awaiting.map((c) => `<div class="chips"><span class="t">${esc(c.id)}</span><button class="badge link" data-authorise="${esc(c.id)}" data-decision="authorise" type="button">authorise the test</button><button class="badge link" data-authorise="${esc(c.id)}" data-decision="refuse" type="button">refuse it</button></div>`);
        const said = notes.filter((n) => Date.now() - n.at < 15000).map((n) => `<div class="line dim">${esc(n.text)}</div>`);
        box.innerHTML = chips.join("") + direct.join("") + said.join("");
        box.hidden = !box.innerHTML;
    }

    async function refresh() {
        // Each read stands alone: one the station does not serve must not empty the others.
        try {
            drawLines(await read("station://mother"));
        } catch {
            // no lines to draw
        }
        try {
            const questions = await read("station://questions");
            open = questions.filter((q) => q.status === "open");
            const commissionings = await read("station://commissionings").catch(() => []);
            awaiting = commissionings.filter((c) => c.status === "awaiting-authorisation" && !open.some((q) => q.kind === "authorise" && q.context?.commissioningId === c.id));
        } catch (e) {
            station = null;
            open = [];
            awaiting = [];
            note(`no questions from the station: ${e.message}`);
        }
        try {
            const p = await read("station://questions-policy");
            if (policy && document.activeElement !== policy) policy.value = p.mode === "auto" ? "auto" : "ask";
        } catch {
            // the standing order select keeps what it shows
        }
        render();
    }

    const answer = async (questionId, choice, how, text) => {
        try {
            await call("answer", { questionId, choice, by: "commander", how, ...(text ? { note: text } : {}) });
        } catch (e) {
            note(`not recorded: ${e.message}`);
        }
        heard.delete(questionId);
        await refresh();
    };
    const authorise = async (commissioningId, decision, how) => {
        try {
            await call("commissioning_authorise", { commissioningId, decision, by: "commander", note: `${how} in Mother's chat` });
        } catch (e) {
            note(`not recorded: ${e.message}`);
        }
        await refresh();
    };

    /** A word typed or spoken: the open question it answers is the one whose options it names; none, or two, and the chat says so. */
    const byText = async (raw, how) => {
        const t = String(raw ?? "").trim();
        if (!t) return;
        await refresh();
        if (!open.length && awaiting.length === 1 && /^(authorise|authorize|autoriser?|refuse|refuser)$/i.test(t)) return authorise(awaiting[0].id, /^refus/i.test(t) ? "refuse" : "authorise", how);
        if (!open.length) return note(`nothing to answer: no question is open ("${t}")`);
        const matched = open.map((q) => ({ q, option: optionOf(t, q.options) })).filter((m) => m.option);
        if (matched.length !== 1) return note(`"${t}" answers ${matched.length ? "more than one question" : "no open question"}: say one of the options' words, or click a chip`);
        heard.set(matched[0].q.id, { text: t, option: matched[0].option });
        await answer(matched[0].q.id, matched[0].option.id, how, t);
    };

    /** The browser's speech recognition, once: on one question's mic, or on the prompt's. */
    const listen = (questionId = null) => {
        const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!Recognition) return note("this browser has no speech recognition: type the answer");
        const rec = new Recognition();
        rec.lang = lang?.value ?? "fr-FR";
        rec.interimResults = false;
        rec.maxAlternatives = 3;
        const q = questionId ? open.find((x) => x.id === questionId) : null;
        rec.onresult = async (e) => {
            const alternatives = Array.from(e.results[0]).map((r) => r.transcript);
            if (q) {
                const option = alternatives.map((t) => optionOf(t, q.options)).find(Boolean) ?? null;
                heard.set(q.id, { text: alternatives[0] ?? "", option });
                if (option) await answer(q.id, option.id, "voice", alternatives[0]);
                else render();
                return;
            }
            await byText(alternatives[0] ?? "", "voice");
        };
        rec.onerror = (e) => note(`recognition error: ${e.error}`);
        if (q) heard.set(q.id, { text: "listening...", option: null });
        else note("listening...");
        render();
        rec.start();
    };

    box.addEventListener("click", async (ev) => {
        const b = ev.target.closest("button");
        if (!b) return;
        if (b.dataset.voice) return listen(b.dataset.voice);
        if (b.dataset.authorise) return authorise(b.dataset.authorise, b.dataset.decision, "click");
        if (b.dataset.q && b.dataset.choice) await answer(b.dataset.q, b.dataset.choice, "click", heard.get(b.dataset.q)?.text);
    });
    form?.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const text = input.value;
        input.value = "";
        await byText(text, "typed");
    });
    mic?.addEventListener("click", () => listen());
    policy?.addEventListener("change", async (ev) => {
        try {
            await call("questions_policy", { mode: ev.target.value });
        } catch (e) {
            note(`standing order not set: ${e.message}`);
        }
        await refresh();
    });
    void refresh();
    setInterval(() => void refresh(), POLL_MS);
}
