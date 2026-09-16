# slot `factory`

The offline means of production, never in the loop. Tools `run_sweep`, `run_fit`, `run_evaluate` (the job spec in, a job id and a plan out), `job_status`, `get_artifact` (small files inline, large ones by location plus sha256), resources `factory://jobs/<id>/...`, a plain MCP notification at job end. The runner is bound by the profile: Nebius Serverless Jobs, Qualcomm AI Hub, or local.

Status on 2026-09-16: the three jobs run from the command line (`npm run chain`); the slot that wraps them is to build.
