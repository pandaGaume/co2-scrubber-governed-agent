# What the causes say that no prediction tests (2026-10-03)

The question: should every factual claim of a diagnosis's cause be a prediction the harness runs (`docs/evaluateur.fr.md`, after E5.4)? In E5.4 the confidence measured the predictions only, and on `D2:8cba` both models wrote claims no prediction tested. Measured here on the 40 causes of E5.4 (`datasets/diagnosis/`), with no model called.

- `causes.md`: the 40 causes and their predictions, numbered.
- `claims.mjs`: the claims of each cause that its own predictions do not test, read by hand by one reader (Claude), each of a kind: C checkable with today's predicates (encoded, with what the cause asserts), N a fact of the sources no predicate says, I an interpretation. `fixed` says what the first reading of a claim got wrong.
- `run-claims.mjs`: runs the C claims on the labelled corpora; `claims-result.json`, what it found.

    node docs/experiments/2026-10-03-cause-claims/run-claims.mjs

## What it found

| | Claims |
|---|---|
| Not tested by the cause's predictions | 81, about two a cause |
| Checkable with today's predicates | 56 |
| ... that hold | 49 |
| ... false | **2** |
| ... unknown (what was sent not kept; a signature made after the task) | 5 |
| A fact no predicate says (tokens, fingerprints, counts, a file's length) | 16 |
| An interpretation ("misleading", "the model read it as") | 9 |

The two false claims each carried the diagnosis's conclusion:

- Sonnet on `D2:dc0bc69a9ef4`: "the path-keying rule is already in what the model reads". The convention was stated in no text at the task's version. It supports its class, model-error.
- GPT on `D5:8d5e2be35eb0`: "not exhaustion of the model's output-token limit". The step was cut at the limit, which GPT had predicted itself. It supports its verdict, wrong.

What went wrong on `D2:8cba` would not have been caught. "Replaced the value 100 with 30" holds under `steps.1`: the error is of meaning (a renumbering, the decay keeping 100 under `steps.2`), and only a claim about the right path would have been refuted. "The refusal's words were true" is arguable rather than false: the whole string is indeed no fact of the library.

## What it costs

The first reading encoded eight of the claims as false; six of them held, and the encoding was wrong: the wrong step or task, words paraphrased ("knots" for "[kn_i] (knot)", a reference without the backquotes the card puts around it), rates counted over the whole corpus where the lead compared the same cases. A model asked to turn every claim into a prediction would make the same mistakes, and the guard would refuse right diagnoses on their wording: more refusals, more calls, for two false claims in forty diagnoses.

## What it says

Requiring every claim to be a prediction is not worth it on these data. A narrower rule stays arguable: the claim the class rests on, or the verdict wrong, made a prediction; that is where both false claims were. Two cases make it a lead, not a finding. The disagreements of E5.4 point elsewhere: the leads of the harness's artefacts and rates (D4, D5), and the labels in dispute.

Limits: one reader, forty causes, the encodings are the reader's, and six of its first eight "false" were its own.
