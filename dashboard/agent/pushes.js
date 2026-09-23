// harness/browser/pushes.ts
function watchSlot(base, slot, onUpdate, onState = () => void 0) {
  const source = new EventSource(`${base.replace(/\/+$/u, "")}/${encodeURIComponent(slot)}/sse`);
  let open = false;
  const setOpen = (value) => {
    if (value === open) return;
    open = value;
    onState(value);
  };
  source.onopen = () => setOpen(true);
  source.onerror = () => setOpen(false);
  source.onmessage = (m) => {
    let frame;
    try {
      frame = JSON.parse(m.data);
    } catch {
      return;
    }
    if (frame.method !== "notifications/resources/updated" || typeof frame.params?.uri !== "string") return;
    const meta = frame.params._meta && typeof frame.params._meta === "object" ? frame.params._meta : {};
    onUpdate({ uri: frame.params.uri, meta });
  };
  return {
    close: () => {
      source.close();
      setOpen(false);
    },
    get open() {
      return open;
    }
  };
}
function eventsAfter(update, cursor) {
  const events = update.meta["spikypanda/events"];
  if (!Array.isArray(events) || !events.length) return null;
  const first = events[0].seq;
  if (typeof first !== "number" || first > cursor + 1) return null;
  return events.filter((e) => typeof e.seq === "number" && e.seq > cursor);
}
export {
  eventsAfter,
  watchSlot
};
//# sourceMappingURL=pushes.js.map
