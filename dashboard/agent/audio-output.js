// tier3/browser/audio-output.ts
var POLL_MS = 700;
function startClock(ms, onTick) {
  try {
    const worker = new Worker(URL.createObjectURL(new Blob([`setInterval(() => postMessage(0), ${ms});`], { type: "text/javascript" })));
    worker.onmessage = onTick;
    return () => worker.terminate();
  } catch {
    const timer = window.setInterval(onTick, ms);
    return () => window.clearInterval(timer);
  }
}
var AudioOutput = class {
  constructor(broker, outputId, events = {}) {
    this.broker = broker;
    this.outputId = outputId;
    this.events = events;
  }
  el = new Audio();
  stopClock = null;
  playing = null;
  played = /* @__PURE__ */ new Set();
  busy = false;
  lastPending = 0;
  get enabled() {
    return this.stopClock !== null;
  }
  /** Called from a click: unlocks the element, starts polling. */
  enable() {
    if (this.stopClock !== null) return;
    this.el.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
    void this.el.play().catch(() => void 0);
    this.stopClock = startClock(POLL_MS, () => void this.tick());
  }
  disable() {
    this.stopClock?.();
    this.stopClock = null;
    this.cut();
  }
  /** Resolves when nothing is queued for this output and nothing is playing: what the page waits for before its next decision. */
  async idle() {
    if (this.stopClock === null) return;
    for (; ; ) {
      if (!this.busy) await this.tick();
      if (!this.playing && this.lastPending === 0 && !this.busy) return;
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  cut() {
    if (!this.playing) return;
    this.el.pause();
    this.el.removeAttribute("src");
    this.playing = null;
  }
  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      const session = await this.broker.session("speech");
      const r = await session.request("resources/read", { uri: "speech://queue" });
      const q = JSON.parse(r.contents[0]?.text ?? "{}");
      this.lastPending = q.pending.filter((p) => p.seq > q.stopMark && !this.played.has(p.utteranceId)).length;
      if (this.playing && this.playing.seq <= q.stopMark) this.cut();
      if (this.playing) return;
      if (document.hidden) return;
      const next = q.pending.find((p) => p.seq > q.stopMark && !this.played.has(p.utteranceId));
      if (next) await this.play(next, session);
    } catch (e) {
      this.events.onError?.(e instanceof Error ? e.message : String(e));
    } finally {
      this.busy = false;
    }
  }
  async play(item, session) {
    this.played.add(item.utteranceId);
    const taken = await this.broker.call("speech", "take", { utteranceId: item.utteranceId, output: this.outputId });
    if (!taken.ok) {
      this.events.onTakenElsewhere?.(item);
      return;
    }
    const r = await session.request("resources/read", { uri: `speech://utterances/${item.utteranceId}` });
    const c = r.contents[0];
    if (!c?.blob) throw new Error(`no audio for ${item.utteranceId}`);
    const bytes = Uint8Array.from(atob(c.blob), (ch) => ch.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: c.mimeType ?? item.mimeType }));
    this.playing = item;
    this.events.onPlay?.(item);
    const started = performance.now();
    await new Promise((resolve) => {
      const finish = () => {
        this.el.onended = null;
        this.el.onerror = null;
        URL.revokeObjectURL(url);
        resolve();
      };
      this.el.onended = finish;
      this.el.onerror = () => {
        this.events.onError?.(`could not play ${item.utteranceId} (${c.mimeType ?? item.mimeType})`);
        finish();
      };
      this.el.src = url;
      this.el.play().catch((e) => {
        this.events.onError?.(e instanceof Error ? e.message : String(e));
        finish();
      });
    });
    const durationMs = Math.round(performance.now() - started);
    const wasCut = this.playing !== item;
    this.playing = null;
    if (!wasCut) {
      this.events.onDone?.(item, durationMs);
      await this.broker.call("speech", "played", { utteranceId: item.utteranceId, output: this.outputId, durationMs });
    }
  }
};
export {
  AudioOutput
};
//# sourceMappingURL=audio-output.js.map
