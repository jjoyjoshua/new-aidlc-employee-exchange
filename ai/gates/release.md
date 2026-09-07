# Gate 3 — Release

**Question:** is production safe?
**Persona:** [DevOps](../roles/devops.md) prepares · **Approver:** human, per promotion, in the pipeline
**Cadence:** per release/promotion

## Flow

```
Merged main (Gates 1+2 passed by construction)
→ CI: install → lint → typecheck → test → build → aidlc-check  [exists today]
→ [when environments exist] security scan → package → deploy dev → smoke test
→ human approval → deploy QA → human approval → deploy production → notify
```

POC status: the quality pipeline (`.github/workflows/ci.yml`) is live; the deploy tail activates when environments exist. This doc gains the concrete stages then.

## Gate checks

| Check                                                                                          | Enforced by                                 |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------- |
| All CI statuses green on `main`                                                                | branch protection + pipeline                |
| Security scan clean of high/critical, or risk accepted _on the release issue_ by a named human | pipeline step + issue record                |
| Smoke test green in target env                                                                 | pipeline step                               |
| Rollback procedure exists and is current                                                       | human reviewer of the release               |
| Promotion approval identity                                                                    | GitHub environment approval (authenticated) |

## Operations backlog (activates at first deploy)

The moment a real environment exists, each of these becomes a GitHub issue owned by the DevOps human — until then they are declared scope, not pretended practice:

- **Monitoring & observability** — health/latency dashboards from the API's structured logs (nestjs-pino), alert thresholds tied to NFR budgets (e.g. NFR-001 route-compute ≤ 2 s)
- **Incident management** — incidents are `bug`-labeled issues with a severity set by the human; postmortem notes land as `lessons` entries in `knowledge/traceability/manifest.json`, linked to the artifacts involved
- **Feedback loop** — production learnings that change scope become `change-request` issues (reopen Gate 1); pure improvements become stories. Operations feeds Inception; nothing is learned off the record

## Rules

- Promotion only through the pipeline — no out-of-band deploys; a needed manual step is a pipeline bug, filed as an issue
- Secrets by name only (GitHub Secrets); never in code, YAML, logs, or docs
- A red quality step is never disabled to unblock — escalate to the human, decision recorded on the release issue
- Pipeline changes are code: they ride PRs through Gate 2
