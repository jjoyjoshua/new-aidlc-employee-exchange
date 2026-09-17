# components

Shared UI. **The props and events of anything in here are a contract** — changing one is
Complex, because every screen using it can break (`ai/standards/task-surfaces.md`).

Components consume design tokens, never literals. A component private to one screen belongs
in that screen's folder, not here.
