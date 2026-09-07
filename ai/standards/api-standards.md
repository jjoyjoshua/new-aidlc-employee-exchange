# API standards

- All routes under `/api`; resources plural nouns (`/api/shipments`); actions as sub-resources when unavoidable (`/api/routing/optimize`)
- Versioning: none for POC; breaking changes need an ADR
- Requests/responses are DTO classes — introspected by the swagger plugin; the OpenAPI spec at `/api-docs-json` **is** the contract, and `libs/api/client` is generated from it (never hand-edited)
- Validation at the edge: class-validator on every input DTO; whitelist + forbidNonWhitelisted (global pipe)
- Status codes: `200` read, `201` create, `400` validation, `401/403` auth, `404` missing, `409` conflict, `422` domain rejection (e.g., no feasible route), `500` never intentional
- Error body: global exception filter shape — consistent `{ statusCode, message, error }`; no stack traces or internals leaked
- Pagination for unbounded collections: `?page&limit` with a documented max
- Admin surface (`/api/admin/*`) always behind `x-admin-key` guard
- Every endpoint change regenerates the OpenAPI snapshot and typed client (`npm run generate-client`). `libs/api/client` is never hand-edited
