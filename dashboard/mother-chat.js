/**
 * The commander in Mother's chat (Tier 4), for the control room.
 *
 * Mother's lines are drawn by board.js. Her open questions to the commander
 * (station://questions: the authorisation of a test, the hand-off's
 * questions, a factory's task.ask) hang under them as chips. The commander
 * answers by a click on a chip or by sending an editable written reply.
 * Browser speech recognition fills the draft only; a standing order answers in
 * the commander's stead when set. Every answer is `station.answer`, signed
 * commander, and the station calls back whoever asked. The page decides
 * nothing.
 *
 * A question for a role (2026-09-29: a signature is asked of an authorised
 * signatory, not of the commander) says the role and its holders, and is
 * answered in the name of the holder chosen under it: the station refuses
 * anyone else, and no standing order answers it.
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
import { createDictation, dictationKey } from "./mother-dictation.js";
import { pendingModelActivity, missionActivity } from "./runtime-activity.js";

const POLL_MS = 2000;

const esc = (v) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** Agent questions receive verbatim text. Protected operations require an exact option. */
export function answerOptionOf(text, question) {
    const t = String(text).trim();
    if (!t) return null;
    if (question.kind === "ask") return { id: "text", label: "Written reply" };
    return question.options.find((o) => [o.id, o.label].some((s) => s.toLowerCase() === t.toLowerCase())) ?? null;
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
            // The voice already said it and the board wrote it where it was said (board.js, data-voiced): that line becomes Mother's,
            // in its place, rather than the same words written again above newer lines (2026-10-08: the log read out of order, twice).
            const voiced = [...log.querySelectorAll(".line[data-voiced]")].reverse().find((v) => v.dataset.voiced === (l.text?.en ?? ""));
            if (voiced) {
                delete voiced.dataset.voiced;
                voiced.dataset.said = l.text?.en ?? "";
                voiced.classList.add("said");
                const who = voiced.querySelector(".who");
                if (who) who.textContent = "mother";
                continue;
            }
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
    let recording = null;
    const micIcon = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>`;
    /** The holder a question for a role is answered as, by question. */
    const chosenAs = new Map();
    const drafts = new Map();
    const notes = [];
    const expandedQuestions = new Set();
    let visibleQuestions = "";
    /** Reads of the questions that failed in a row (2026-10-08): one lost poll (a server restarting, a request cut) says nothing in
        the commander's panel and keeps the questions shown; only a station that stays silent is said, once, in plain words. */
    let missed = 0;
    const MISSED_BEFORE_SAYING = 3;
    let open = [];
    let awaiting = [];
    /** What is at work now: the scenario's loop, the factory's tasks (2026-09-28: a room that sees nothing move does not know it must wait). */
    let busy = [];
    let scenarioSession = null;
    let factorySession = null;
    let agentSession = null;
    let eventSession = null;

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
    /** A failure said to the room: a lost connection in plain words, the station's own refusal as it gave it. */
    const plain = (e) => (/failed to fetch|networkerror|load failed/i.test(e.message) ? "the station did not answer, try again" : e.message);
    const note = (text) => {
        notes.push({ text, at: Date.now() });
        while (notes.length > 3) notes.shift();
        render();
    };

    function render() {
        // A signature asked: the card's values under the question, each with its safe side, its kind and its origin, so the commander signs what they read.
        const card = (q) => {
            if ((q.kind === "authorise" || q.kind === "procedure-review") && q.context?.procedure) {
                const p = q.context.procedure;
                const points = Array.isArray(p.operatingPoints) ? p.operatingPoints.map((s) => `<div class="line dim">Step ${esc(s.n)}: ${esc(s.speedPercent)}%, ${esc(s.minutes)} min, hatch ${esc(s.hatch)}</div>`).join("") : "";
                return `<div class="card"><div class="line"><b>${esc(p.procedureId)}</b>: ${esc(p.device ?? p.module)}, ${esc(p.minutes ?? "?")} min</div>${points}${p.sha256 ? `<div class="line dim">Artifact SHA-256: ${esc(p.sha256)}</div>` : ""}</div>`;
            }
            if (q.kind !== "sign") return "";
            // A playbook proposed by a factory: its bounds, each with why; the whole on the library page.
            if (!Array.isArray(q.context?.facts)) {
                const bounds = Array.isArray(q.context?.bounds) ? q.context.bounds.map((b) => `<div class="line dim"><b>${esc(b.id)}</b> ${esc(b.count)} at least ${esc(b.atLeast)}: ${esc(b.why)}</div>`).join("") : "";
                return q.context?.document ? `<div class="card">${bounds}<div class="line"><a class="badge link" href="./library.html#${encodeURIComponent(q.context.document)}" target="library">read it whole, with its graph</a></div></div>` : "";
            }
            const side = (b) => (b === "upper" ? "at most" : b === "lower" ? "at least" : "exactly");
            // The whole document, its facts and its rules on the library page, where it can be read before the answer.
            const page = q.context.document ? `<div class="line"><a class="badge link" href="./library.html#${encodeURIComponent(q.context.document)}" target="library">read it whole, with its rules</a></div>` : "";
            return `<div class="card">${q.context.facts.map((f) => `<div class="line dim"><b>${esc(f.id)}</b> ${esc(side(f.bound))} ${esc(f.value)} ${esc(f.unit)}${f.kind ? ` <span class="t">${esc(f.kind)}</span>` : ""}${f.reference ? `: ${esc(f.reference)}` : ""}</div>`).join("")}${page}</div>`;
        };
        const chips = open.map((q) => {
            const options = q.options.map((o) => `<button class="badge link" data-q="${esc(q.id)}" data-choice="${esc(o.id)}" type="button" title="${esc(o.label)}" aria-label="${esc(o.label)}">${esc(String(o.label).length > 48 ? String(o.label).slice(0, 45) + "..." : o.label)}</button>`).join(" ");
            const prompt = String(q.question ?? "");
            const text = `<div class="line ask">${esc(prompt.length > 160 ? prompt.slice(0, 157) + "..." : prompt)}</div>`;
            const full = prompt.length > 160 ? `<div class="line ask">${esc(prompt)}</div>` : "";
            const supporting = full + (q.context?.why ? `<div class="line dim">${esc(q.context.why)}</div>` : "") + card(q);
            const extra = supporting ? `<details class="question-details" data-question-details="${esc(q.id)}"${expandedQuestions.has(q.id) ? " open" : ""}><summary>Full question and supporting details</summary><div class="question-detail-body">${supporting}</div></details>` : "";
            // A question for a role: answered as one of its holders, chosen here; a role nobody holds is said, and its chips wait.
            const as = q.role
                ? `<div class="line dim">for the role <b>${esc(q.role)}</b>: ${q.holders?.length ? `answer as <select data-as="${esc(q.id)}">${q.holders.map((n) => `<option${chosenAs.get(q.id) === n ? " selected" : ""}>${esc(n)}</option>`).join("")}</select>` : "nobody holds it yet (specs/station/roles.json)"}</div>`
                : "";
            const details = `<div class="answer-composer"><textarea data-answer-note="${esc(q.id)}" rows="2" aria-label="Reply to ${esc(q.id)}" placeholder="${q.kind === "ask" ? "Write a reply, or dictate with Ctrl+M" : "Write a note, then choose an explicit decision above"}">${esc(drafts.get(q.id) ?? "")}</textarea><div class="answer-actions"><span class="dim">${recording === q.id ? "Listening. Enter stops dictation." : "Ctrl+M: dictate"}</span><button class="dictation-button${recording === q.id ? " on" : ""}" data-voice="${esc(q.id)}" type="button" aria-label="Dictate reply" aria-pressed="${recording === q.id}" title="Ctrl+M: microphone. Enter: stop">${micIcon}</button>${q.kind === "ask" ? `<button class="badge link" data-send="${esc(q.id)}" type="button">Send</button>` : ""}</div></div>`;
            return `<section class="question-card"><div class="question-controls">${as}<div class="chips"><span class="t">${esc(q.id)}</span>${options}</div></div>${text}${details}${extra}</section>`;
        });
        const direct = awaiting.map((c) => `<div class="chips"><span class="t">${esc(c.id)}</span><button class="badge link" data-authorise="${esc(c.id)}" data-decision="authorise" type="button">authorise the test</button><button class="badge link" data-authorise="${esc(c.id)}" data-decision="refuse" type="button">refuse it</button></div>`);
        const said = notes.filter((n) => Date.now() - n.at < 15000).map((n) => `<div class="line dim">${esc(n.text)}</div>`);
        const turning = busy.map((b) => `<div class="line busy">${b.startsWith("Mission paused:") || b.startsWith("Mission closed:") || b === "Mission waiting for your reply" ? "" : '<i class="spin"></i>'}${esc(b)}</div>`);
        const editing = document.activeElement?.dataset?.answerNote;
        const selection = editing ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;
        box.innerHTML = chips.join("") + direct.join("") + said.join("") + turning.join("");
        const showing = open.map((q) => q.id).join(",");
        if (showing !== visibleQuestions) { box.scrollTop = 0; visibleQuestions = showing; }
        if (editing) {
            const field = [...box.querySelectorAll("textarea[data-answer-note]")].find((e) => e.dataset.answerNote === editing);
            field?.focus();
            if (field && selection) field.setSelectionRange(...selection);
        }
        box.hidden = !box.innerHTML;
        // The prompt blinks while Mother waits for the commander.
        const waiting = open.length > 0 || awaiting.length > 0;
        form?.classList.toggle("awaiting", waiting);
        if (input) input.placeholder = waiting ? "Mother is waiting: write a reply, or Ctrl+M to dictate" : "Write a reply, or Ctrl+M to dictate";
    }

    const clockOf = (iso) => {
        const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
        return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    };
    async function readBusy() {
        const lines = [];
        try {
            agentSession ??= await connectMcp(location.origin, "agent", { headers: {} });
            const response = await agentSession.callTool("state", {});
            const body = JSON.parse(toolText(response));
            const state = body.result ?? body;
            const status = missionActivity(state.mission);
            if (status) lines.push(status);
            for (const run of state.procedureExecutions ?? []) {
                lines.push(`Procedure recording scrubber telemetry (motor speed observed, cabin CO2 simulated): minute ${run.minute}/${run.plannedMinutes ?? "?"}, ${run.samples} samples${run.observedSpeedPercent !== null ? `, observed motor speed ${run.observedSpeedPercent}%` : ""}`);
            }
        } catch {
            agentSession = null;
        }
        try {
            eventSession ??= await connectMcp(location.origin, "twin", { headers: {} });
            const response = await eventSession.request("resources/read", { uri: "spk://events" });
            const body = JSON.parse(response.contents[0].text);
            lines.push(...pendingModelActivity(Array.isArray(body) ? body : body.events ?? []));
        } catch {
            eventSession = null;
        }
        try {
            scenarioSession ??= await connectMcp(location.origin, "scenario", { headers: {} });
            const run = JSON.parse((await scenarioSession.request("resources/read", { uri: "scenario://run" })).contents[0].text);
            const l = run && run.status === "running" ? run.loops.find((x) => x.status === "running") : null;
            if (l) lines.push(`${l.name}: at work${l.note ? `, ${l.note}` : ""}${l.startedAt ? ` (${clockOf(l.startedAt)})` : ""}`);
        } catch {
            scenarioSession = null;
        }
        try {
            factorySession ??= await connectMcp(location.origin, "factory", { headers: {} });
            const running = JSON.parse((await factorySession.request("resources/read", { uri: "factory://running" })).contents[0].text);
            // The stage under way, from the last one completed: after "request" the model is writing its next step, the long wait of a step (2026-09-28: the room read "request" and thought it stuck).
            const under = (s) => (s === "request" ? "the model is writing its next step" : s === "reason" || s === "merge" ? "the harness checks the step" : s === "guard" ? "the step runs" : s ? `after ${s}` : "starting");
            for (const t of running) if (!t.waiting) lines.push(t.delivery === "waiting" ? `factory task ${t.taskId}: result ready, awaiting earlier task delivery` : `factory task ${t.taskId}: step ${t.steps + 1}, ${under(t.lastStage)} (${clockOf(t.startedAt)})`);
        } catch {
            factorySession = null;
        }
        busy = lines;
    }
    /** The fork this station runs in, said once in the header: what is done here stays in it. */
    let environmentRead = false;
    async function readEnvironment() {
        if (environmentRead) return;
        try {
            const env = await read("station://environment");
            environmentRead = true;
            const badge = document.getElementById("top-fork");
            if (badge && env?.fork) {
                badge.textContent = env.fork.learning ? `fork ${env.fork.id} · learning` : `fork ${env.fork.id}`;
                if (env.fork.learning) badge.title += `; learning: at every abort Mother reflects and the fork adapts itself (the reflection by ${env.fork.learning === "reasoner" ? "a model" : "its script"})`;
                badge.hidden = false;
            }
        } catch {
            // an older station says nothing of where it runs: read again next time
        }
    }
    async function refresh() {
        await readEnvironment();
        await readBusy();
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
            awaiting = commissionings.filter((c) => c.status === "awaiting-authorisation" && !questions.some((q) => (q.status === "open" || q.status === "queued") && q.kind === "authorise" && q.context?.commissioningId === c.id));
            if (missed >= MISSED_BEFORE_SAYING) note("The station answers again.");
            missed = 0;
        } catch (e) {
            // A new session at the next poll; the questions already shown stay, so an authorisation waiting is never hidden by a
            // lost request. The cause goes to the console, not to the room.
            station = null;
            missed++;
            console.warn(`mother-chat: station://questions not read (${missed} in a row): ${e.message}`);
            if (missed === MISSED_BEFORE_SAYING) note("The station does not answer; trying again.");
        }
        try {
            const p = await read("station://questions-policy");
            if (policy && document.activeElement !== policy) policy.value = p.mode === "auto" ? "auto" : "ask";
        } catch {
            // the standing order select keeps what it shows
        }
        render();
    }

    /** Who answers a question: the holder chosen under it when it is for a role, the commander otherwise. */
    const answererOf = (questionId) => {
        const q = open.find((x) => x.id === questionId);
        if (!q?.role) return "commander";
        return chosenAs.get(questionId) ?? q.holders?.[0] ?? "";
    };
    const answer = async (questionId, choice, how, text) => {
        try {
            const question = open.find((q) => q.id === questionId);
            if (question?.context?.responseType === "information" && choice === "provide" && !String(text ?? "").trim()) return note("Write the information before sending, or choose Information unavailable.");
            await call("answer", { questionId, choice, by: answererOf(questionId), how, ...(text ? { note: text } : {}) });
            drafts.delete(questionId);
        } catch (e) {
            note(`not recorded: ${plain(e)}`);
        }
        await refresh();
    };
    const authorise = async (commissioningId, decision, how) => {
        try {
            await call("commissioning_authorise", { commissioningId, decision, by: "commander", note: `${how} in Mother's chat` });
        } catch (e) {
            note(`not recorded: ${plain(e)}`);
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
        const matched = open.map((q) => ({ q, option: answerOptionOf(t, q) })).filter((m) => m.option);
        if (matched.length !== 1) return note(`"${t}" answers ${matched.length ? "more than one question" : "no open question"}: use the field under the intended question, or click an explicit option`);
        await answer(matched[0].q.id, matched[0].option.id, how, t);
    };

    const dictation = createDictation({
        recognition: () => {
            const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            return Recognition ? new Recognition() : null;
        },
        language: () => lang?.value ?? "fr-FR",
        onText: (target, text) => {
            if (target === "prompt") { if (input) input.value = text; return; }
            drafts.set(target, text);
            const field = [...box.querySelectorAll("textarea[data-answer-note]")].find((e) => e.dataset.answerNote === target);
            if (field) field.value = text;
        },
        onState: (target) => {
            recording = target;
            mic?.classList.toggle("on", target === "prompt");
            mic?.setAttribute("aria-pressed", String(target === "prompt"));
            render();
        },
        onError: note,
    });
    const listen = (questionId = null) => {
        const target = questionId ?? "prompt";
        dictation.start(target, questionId ? drafts.get(questionId) ?? "" : input?.value ?? "");
    };
    const sendDraft = async (id) => {
        if (dictation.active) { dictation.stop(); return; }
        const q = open.find((x) => x.id === id);
        const text = drafts.get(id) ?? "";
        if (!q || !text.trim()) return;
        const option = answerOptionOf(text, q);
        if (!option) return note("Choose an explicit decision below. Your note will accompany it.");
        await answer(id, option.id, "typed", text);
    };
    document.addEventListener("keydown", (event) => dictationKey(event, dictation, () => {
        const id = document.activeElement?.dataset?.answerNote;
        listen(document.activeElement === input ? null : id ?? (open.length === 1 ? open[0].id : null));
    }), true);
    box.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey && !event.isComposing && !event.defaultPrevented) {
            const id = event.target.dataset?.answerNote;
            if (id) { event.preventDefault(); void sendDraft(id); }
        }
    });

    box.addEventListener("toggle", (ev) => {
        const element = ev.target;
        const id = element.dataset?.questionDetails;
        if (id) { if (element.open) expandedQuestions.add(id); else expandedQuestions.delete(id); }
    }, true);
    box.addEventListener("input", (ev) => {
        const field = ev.target.closest("textarea[data-answer-note]");
        if (field) drafts.set(field.dataset.answerNote, field.value);
    });
    box.addEventListener("change", (ev) => {
        const s = ev.target.closest("select[data-as]");
        if (s) chosenAs.set(s.dataset.as, s.value);
    });
    box.addEventListener("click", async (ev) => {
        const b = ev.target.closest("button");
        if (!b) return;
        if (b.dataset.voice) return listen(b.dataset.voice);
        if (b.dataset.send) return sendDraft(b.dataset.send);
        if (dictation.active) { dictation.stop(); return; }
        if (b.dataset.authorise) return authorise(b.dataset.authorise, b.dataset.decision, "click");
        if (b.dataset.q && b.dataset.choice) {
            await answer(b.dataset.q, b.dataset.choice, "click", drafts.get(b.dataset.q));
        }
    });
    form?.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        if (dictation.active) { dictation.stop(); return; }
        const text = input.value;
        input.value = "";
        await byText(text, "typed");
    });
    mic?.setAttribute("title", "Ctrl+M: microphone. Enter: stop dictation");
    mic?.addEventListener("click", () => listen());
    policy?.addEventListener("change", async (ev) => {
        try {
            await call("questions_policy", { mode: ev.target.value });
        } catch (e) {
            note(`standing order not set: ${plain(e)}`);
        }
        await refresh();
    });
    void refresh();
    setInterval(() => void refresh(), POLL_MS);
}
