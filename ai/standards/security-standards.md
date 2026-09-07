# Security standards

Checked by the Architect persona in design notes and PR review (Gate 2); scanned by the release pipeline (Gate 3).

## Non-negotiables

- **Secrets:** never in code, commits, logs, or docs. Env via `.env` (gitignored); `.env.example` documents key _names_; CI uses GitHub Secrets
- **Input:** every external input validated at the boundary (class-validator DTOs, param pipes); reject by default (whitelist)
- **Injection:** DB access through TypeORM parameterized queries only, no string-built SQL; no `eval`/dynamic `Function`
- **AuthZ:** admin endpoints behind `x-admin-key` guard; new protected surfaces need a security design note in the story PR (an ADR in `knowledge/decisions/` when the trade-offs are real)
- **Data exposure:** response DTOs are explicit allowlists (class-serializer); no entity dumping; errors leak no internals
- **Dependencies:** additions need Architect + human approval; CI security scan (audit) must be clean of high/critical or the risk is human-accepted and logged
- **CORS:** explicit origins per environment, no `*` outside local dev

## Review prompts (Gate 2 review)

Where does user input enter? Is anything trusted because "it comes from our UI"? What would a hostile CSV upload do to `/api/admin/upload-csv`? What does this endpoint return that it doesn't need to?
