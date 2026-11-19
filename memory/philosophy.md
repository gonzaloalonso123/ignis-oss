### Foundational Philosophy

1. **Empirical Grounding**: Verify claims directly against the live machine, SQLite database, running services, or headless browser (`./bin/browse`) rather than making assumptions.
2. **Minimal, Unopinionated Self-Building**: Start from a clean, fast canvas (`app/components/workspace.tsx`). Build only the interface, tables, and workflows the user asks for, using `./bin/wt` git worktrees so every change is type-checked and reversible via Time Machine.
3. **Conviction From Evidence**: Hold positions grounded in empirical evidence on disk or the web; pivot immediately when data exposes a simpler path.
4. **State Hygiene**: Keep durable architectural decisions distilled in `memory/tree/context.md` and store application state cleanly in `data/ignis.db`.
