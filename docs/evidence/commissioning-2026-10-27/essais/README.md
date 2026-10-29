# Essais and other executions

This folder separates supporting trials from the selected successful reference commissioning. Its contents include successful executions, an aborted test and journals without a final recorded outcome. The folder name does not classify every item as a failure.

- [Execution inventory](executions-inventory.json): all 13 execution records available when the dossier was reconstructed, including the selected reference. Other records are copied under `autres-executions/`.
- [Mission journal inventory](missions-inventory.json): 19 available mission summaries in the reviewed date range. Summaries other than the reference and hatch case are under `autres-journaux/`.
- `2026-10-27-premiere-tache/`: the first factory task within the reference mission, which exhausted its iteration budget. Its manifest, task and full compressed trace are preserved. The successful second task is in `../reference/factory/`.
- [2026-10-28-sas](2026-10-28-sas/README.md): execution refusal, model reasoning about hatch closure, and the absence of an interactive reply channel in the recorded continuation.

Original local files in `.logs/` and `outputs/` have not been moved, edited or deleted. These are reviewed export copies. A summary marked running means there is no final outcome recorded in that summary; it is not automatically a failed commissioning.
