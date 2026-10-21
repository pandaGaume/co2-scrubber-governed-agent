/** Presentation filtering only: never changes a tool call or its outcome. */
export function similarAnnouncement(a: string, b: string): boolean {
    const normalize = (text: string) => text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[’']/g, " ");
    const left = normalize(a);
    const right = normalize(b);
    // Preserve changed measurements, identifiers, negation and explicit outcome words.
    const numbers = (text: string) => text.match(/[-+]?\d+(?:[.,]\d+)?/g) ?? [];
    if (JSON.stringify(numbers(left)) !== JSON.stringify(numbers(right))) return false;
    const important = /\b(?:no|not|never|without|missing|failed|failure|refused|rejected|denied|approved|authorised|authorized|validated|installed|completed|aborted|blocked|unavailable|available|pending|waiting|success|successful|non|ne|pas|jamais|sans|manquant|manquante|echec|refuse|refusee|autorise|autorisee|valide|validee|installe|installee|termine|terminee|interrompu|interrompue|indisponible|disponible)\b/g;
    const meaning = (text: string) => [...new Set(text.match(important) ?? [])].sort();
    if (JSON.stringify(meaning(left)) !== JSON.stringify(meaning(right))) return false;
    const filler = new Set("i am the a an is are be to of for in on and now currently still please we my our je j nous le la les un une de des du au aux et en pour actuellement encore".split(" "));
    const words = (text: string) => (text.match(/[\p{L}\p{N}_]+/gu) ?? []).filter((word) => !filler.has(word));
    const x = words(left);
    const y = words(right);
    if (!x.length || !y.length) return left.trim() === right.trim();
    if (x.join(" ") === y.join(" ")) return true;
    const xs = new Set(x);
    const ys = new Set(y);
    const shared = [...xs].filter((word) => ys.has(word)).length;
    // Conservative near-duplicate filtering; the model handles broader paraphrases.
    return Math.min(xs.size, ys.size) >= 4 && 2 * shared / (xs.size + ys.size) >= 0.9;
}
