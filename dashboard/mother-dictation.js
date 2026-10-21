/** Speech is an editable draft only. This module has no answer or tool callback. */
export function createDictation({ recognition, onText, onState, onError, language }) {
    let current = null;
    let active = false;
    const stop = () => {
        if (!active) return;
        active = false;
        onState(null);
        try { current?.stop(); } catch { /* recognition already ended */ }
    };
    return {
        get active() { return active; },
        stop,
        start(target, initial = "") {
            if (active) { stop(); return; }
            const rec = recognition();
            if (!rec) { onError("This browser has no speech recognition. Type your answer."); return; }
            current = rec;
            rec.lang = language();
            rec.continuous = true;
            rec.interimResults = true;
            rec.onresult = (event) => {
                if (current !== rec) return;
                const transcript = Array.from(event.results, (result) => result[0]?.transcript ?? "").join(" ");
                onText(target, initial + (initial && transcript ? " " : "") + transcript);
            };
            rec.onend = () => {
                if (current !== rec) return;
                active = false;
                onState(null);
            };
            rec.onerror = (event) => {
                if (current !== rec) return;
                stop();
                if (event.error !== "aborted") onError(`Recognition error: ${event.error}`);
            };
            active = true;
            onState(target);
            try { rec.start(); } catch (error) { stop(); onError(error.message); }
        },
    };
}

/** Enter stops dictation without submitting; Ctrl+M toggles the focused composer. */
export function dictationKey(event, dictation, start) {
    if (event.isComposing || event.repeat) return;
    if (event.ctrlKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === "m") {
        event.preventDefault();
        event.stopPropagation();
        if (dictation.active) dictation.stop(); else start();
    } else if (event.key === "Enter" && dictation.active) {
        event.preventDefault();
        event.stopPropagation();
        dictation.stop();
    }
}
