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
var FLOOR_BUSY = "speech:floor-busy";
var AudioOutput = class {
  constructor(broker, outputId, events = {}) {
    this.broker = broker;
    this.outputId = outputId;
    this.events = events;
  }
  el = new Audio();
  /** Used only to decode the bytes of an utterance, never connected. */
  decoder;
  /** The shape of the utterance being said. See `wave`. */
  envelope;
  stopClock = null;
  playing = null;
  played = /* @__PURE__ */ new Set();
  busy = false;
  lastPending = 0;
  /** The last poll failure reported, so the same one is not repeated every tick. */
  pollFailure = null;
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
  /**
   * The shape of the sentence being said, and how far through it we are.
   *
   * The bytes are the ones already fetched to play it, decoded in a context
   * of their own that is never connected to anything: **the playback path is
   * not touched**. An earlier version tapped the element with
   * `createMediaElementSource`, which permanently reroutes its output
   * through the Web Audio graph; a context that fails to leave `suspended`
   * then costs the sound itself, not just the meter. No indicator is worth
   * that.
   *
   * `envelope` is the peak of each slice of the whole utterance, so the
   * drawing is the sentence, and `progress` is where the element actually
   * is in it.
   */
  wave() {
    if (!this.playing || !this.envelope) return null;
    const d = this.el.duration;
    const progress = Number.isFinite(d) && d > 0 ? Math.min(1, this.el.currentTime / d) : 0;
    return { envelope: this.envelope, progress };
  }
  /**
   * The peak of each slice of an utterance, for the meter. Decoding only:
   * nothing here is connected to an output.
   *
   * Fine on purpose. A coarse envelope makes the running trace climb in
   * steps, because several frames in a row read the same slice and the
   * signal turns into a staircase; at this resolution a frame advances one
   * or two slices and the trace has the grain of a voice.
   */
  async shapeOf(bytes, slices = 1600) {
    if (typeof AudioContext === "undefined") return null;
    try {
      this.decoder ??= new AudioContext();
      const copy = bytes.slice().buffer;
      const buffer = await this.decoder.decodeAudioData(copy);
      const channel = buffer.getChannelData(0);
      const per = Math.max(1, Math.floor(channel.length / slices));
      const out = [];
      let loudest = 0;
      for (let i = 0; i < slices; i++) {
        let peak = 0;
        for (let k = i * per, end = Math.min(channel.length, k + per); k < end; k++) peak = Math.max(peak, Math.abs(channel[k]));
        out.push(peak);
        loudest = Math.max(loudest, peak);
      }
      return loudest > 0 ? out.map((v) => v / loudest) : out;
    } catch {
      return null;
    }
  }
  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      const session = await this.broker.session("speech");
      const r = await session.request("resources/read", { uri: "speech://queue" });
      const q = JSON.parse(r.contents[0]?.text ?? "{}");
      if (this.pollFailure !== null) {
        this.pollFailure = null;
        this.events.onRecovered?.();
      }
      this.lastPending = q.pending.filter((p) => p.seq > q.stopMark && !this.played.has(p.utteranceId)).length;
      if (this.playing && this.playing.seq <= q.stopMark) this.cut();
      if (this.playing) return;
      if (document.hidden) return;
      const next = q.pending.find((p) => p.seq > q.stopMark && !this.played.has(p.utteranceId));
      if (next) await this.play(next, session);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message !== this.pollFailure) {
        this.pollFailure = message;
        this.events.onError?.(message);
      }
    } finally {
      this.busy = false;
    }
  }
  async play(item, session) {
    this.played.add(item.utteranceId);
    const taken = await this.broker.call("speech", "take", { utteranceId: item.utteranceId, output: this.outputId });
    if (!taken.ok) {
      if (String(taken.error ?? "").includes(FLOOR_BUSY)) {
        this.played.delete(item.utteranceId);
        return;
      }
      this.events.onTakenElsewhere?.(item);
      return;
    }
    const r = await session.request("resources/read", { uri: `speech://utterances/${item.utteranceId}` });
    const c = r.contents[0];
    if (!c?.blob) throw new Error(`no audio for ${item.utteranceId}`);
    const bytes = Uint8Array.from(atob(c.blob), (ch) => ch.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: c.mimeType ?? item.mimeType }));
    this.envelope = await this.shapeOf(bytes);
    this.playing = item;
    this.events.onPlay?.(item);
    const started = performance.now();
    await new Promise((resolve) => {
      const finish = () => {
        this.el.onended = null;
        this.el.onerror = null;
        URL.revokeObjectURL(url);
        this.envelope = null;
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
