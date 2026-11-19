# Contributing to Ignis OSS

Thank you for contributing to **Ignis OSS** — the open-source self-building personal AI workspace!

Because Ignis OSS is software that modifies its own source code at runtime, maintaining a strict boundary between the **Protected Core** and the **Mutable Workspace Canvas** is essential.

---

## 1. Protected Core vs. Mutable Workspace

### Protected Core (Do Not Break Recovery Invariants)
These files guarantee that even if a user (or the AI agent) introduces a syntax or runtime error while modifying the UI, the user can always open **Core Control (`⌘.`)**, chat with the Emergency Recovery Agent, or roll back to a working Git commit:

- `app/layout.tsx` — Mounts `<CoreErrorBoundary>` around `{children}` and renders `<ImmutableControlPanel />` outside the mutable tree.
- `app/components/core-error-boundary.tsx` — Catches runtime React render errors in the workspace and surfaces a 1-click recovery panel.
- `app/components/immutable-control-panel.tsx` — The floating `Core Control (⌘.)` drawer providing **Time Machine**, **Emergency Chat**, **AI Brain**, and **Env Vault**.
- `app/api/chat/route.ts` & `app/api/system/route.ts` — Core agent streaming loop and Time Machine / Environment endpoints.
- `bin/wt` & `bin/smoke` — Git worktree transaction manager and pre-merge verification suite.

When rolling back via Time Machine (`action: "rollback-version"`), Ignis restores `app/` and `lib/` to the target commit while preserving `HEAD` on these Protected Core files.

### Mutable Workspace Canvas (`app/components/workspace.tsx`)
- `app/components/workspace.tsx` is the default user-customizable canvas mounted inside `app/components/chat-pane.tsx`.
- Users and the AI agent are encouraged to build custom dashboards, SQLite-backed tables, scrapers, and tools inside `app/components/workspace.tsx` (or new components imported by it) and new API routes under `app/api/`.

---

## 2. Safe Self-Modification Workflow (`./bin/wt`)

Never edit live application files recklessly on `main` without verification. Use the built-in Git worktree manager (`./bin/wt`):

```bash
# 1. Create an isolated worktree off main (with node_modules symlinked)
./bin/wt new my-feature

# 2. Make your edits inside .worktrees/my-feature/
# ...

# 3. Verify TypeScript compilation and smoke checks inside the worktree
./bin/wt check my-feature

# 4. Commit inside the worktree and land onto main
git -C .worktrees/my-feature add -A
git -C .worktrees/my-feature commit -m "feat: add custom workspace panel"
./bin/wt land my-feature
```

`./bin/wt land` automatically runs `./bin/smoke`, merges the worktree branch onto `main`, cleans up the worktree, and touches `app/globals.css` so Next.js hot-reloads the updated UI immediately.

---

## 3. Running Verification Checks Locally

Before opening a Pull Request:

```bash
# TypeScript strict check
pnpm typecheck

# Full smoke verification (TypeScript + SQLite + Core routes)
pnpm smoke
```

## 4. License

By contributing to Ignis OSS, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
