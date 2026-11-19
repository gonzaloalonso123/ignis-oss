# Ignis OSS 🔥

**The Open-Source Self-Building Personal AI Workspace**  
*Next.js 16 · React 19 · Tailwind CSS v4 · Node 24 Native SQLite · Git Worktree Time Machine*

[![License: MIT](https://img.shields.io/badge/License-MIT-orange.svg)](./LICENSE)
[![Node: >=24](https://img.shields.io/badge/Node-%3E%3D24.0-brightgreen.svg)](https://nodejs.org)
[![Next.js: 16.4](https://img.shields.io/badge/Next.js-16.4-black.svg)](https://nextjs.org)

**Ignis OSS** is the standalone, MIT-licensed open-source basic edition of **Ignis AI**. Unlike traditional chat wrappers where the interface is static and frozen, Ignis lives inside its own full-stack Next.js repository and has direct agency (`runCommand`) to inspect, extend, and hot-reload its own React UI, API routes, CLI tools, and SQLite tables while you chat with it.

---

## ✨ Key Features

- **🛠️ Full Shell & Codebase Agency (`runCommand`)**: Ignis executes real shell commands, writes TypeScript/React components, queries SQLite databases, and builds new `/api/*` endpoints directly inside its workspace.
- **🌿 Git Worktree Self-Building UI (`./bin/wt`)**: Instead of mutating live files blindly, Ignis spins up isolated Git worktrees (`./bin/wt new <slug>`), verifies TypeScript & smoke tests (`./bin/wt check <slug>`), and atomically lands changes onto `main` (`./bin/wt land <slug>`) with instant Next.js hot-reload.
- **🛡️ Protected Core & Time Machine (`⌘.`)**:
  - **`<CoreErrorBoundary>`**: Wraps the workspace so even if a custom UI edit throws a React render error, the Protected Core remains alive.
  - **`<ImmutableControlPanel />` (`Core Control · ⌘.`)**: An indestructible floating drawer with 4 built-in self-hosting tools:
    1. **Time Machine**: Browse live Git commit history of every UI self-modification, 1-click **Restore** to any checkpoint, or **Reset to Factory Default**.
    2. **Emergency Chat**: Recovery chat wired directly to `/api/chat` that works even if the main workspace UI is broken.
    3. **AI Brain**: Switch between **Anthropic (Claude)**, **OpenAI**, and **Google (Gemini)**, configure API keys, and override the default model ID.
    4. **Env Vault**: Manage local `KEY=VALUE` secrets in `data/.env` (`0600` permissions) with automatic secret redaction in command outputs.
- **🌐 Headless Browser Automation (`./bin/browse`)**: Built-in headless Chrome/Chromium CLI for scraping live pages, inspecting DOM text, and capturing screenshots.
- **🗄️ Zero-Dependency Node 24 Native SQLite**: Uses Node's built-in `node:sqlite` (`DatabaseSync`) stored in `./data/ignis.db` for conversation history, tool traces, and user-created tables—zero native C++ addon compilation headaches.

---

## 🚀 Quickstart

### Option A: Local Development (Node 24+ & `pnpm`)

1. **Prerequisites**:
   - **Node.js 24+** (required for built-in `node:sqlite`)
   - **pnpm 11+** (`corepack enable`)
   - **Git**

2. **Install & Configure**:
   ```bash
   git clone https://github.com/ignis-ai/ignis-oss.git
   cd ignis-oss

   # Install dependencies
   pnpm install

   # (Optional) Copy .env.example to .env and add an API key,
   # OR configure your API key in the web UI via Core Control (⌘. -> AI Brain)
   cp .env.example .env
   ```

3. **Run Verification & Start the Workspace**:
   ```bash
   # Run TypeScript & smoke checks
   pnpm smoke

   # Start Ignis OSS on http://localhost:3400
   pnpm dev
   ```

4. Open **`http://localhost:3400`**. Press **`⌘.`** (or click **Core Control** in the bottom-left corner) -> **AI Brain** to paste your Anthropic, OpenAI, or Gemini API key and choose your model.

---

### Option B: Docker Compose (1-Command Self-Hosting)

Ignis OSS includes a production-ready `Dockerfile` (with Node 24, Git, SQLite, and headless Chromium pre-installed) and `docker-compose.yml` with persistent `./data` volume mounting:

```bash
cp .env.example .env
# Edit .env with your API key (or configure it later in the UI via ⌘.)

docker compose up --build
```

Then visit **`http://localhost:3400`**. All conversations, custom SQLite tables, onboarding settings, and `data/.env` secrets persist across container restarts in `./data/`.

---

## 🏗️ Architecture & Directory Layout

```text
ignis-oss/
├── app/
│   ├── api/
│   │   ├── chat/route.ts                  # Protected Core: Streaming AI agent loop + runCommand
│   │   ├── conversations/                 # Conversation history & branching REST endpoints
│   │   └── system/route.ts                # Protected Core: Time Machine, AI Brain & Env Vault API
│   ├── components/
│   │   ├── workspace.tsx                  # 🎨 MUTABLE CANVAS: The self-building UI region Ignis evolves!
│   │   ├── starter-blueprints.tsx         # 1-Click Starter Blueprints for Turn-1 self-building
│   │   ├── chat-pane.tsx                  # Main chat stream, tool activity cards & composer
│   │   ├── core-error-boundary.tsx        # 🛡️ Protected Core: Catches UI crashes gracefully
│   │   └── immutable-control-panel.tsx    # 🛡️ Protected Core: Time Machine, Emergency Chat, AI Brain, Env Vault
│   ├── globals.css                        # Tailwind v4 design tokens (Paper / Ink / Ember theme)
│   ├── layout.tsx                         # Protected Core root layout
│   └── page.tsx                           # Entry workspace page
├── bin/
│   ├── wt                                 # Git worktree manager (new, check, land, remove, list)
│   ├── smoke                              # TypeScript + runtime smoke verifier
│   └── browse                             # Headless Chrome/Chromium inspection & screenshot CLI
├── lib/
│   ├── db.ts                              # Node 24 native SQLite (data/ignis.db) schema & queries
│   └── agent/
│       ├── core.ts                        # Tool definitions (runCommand) & system prompt loader
│       ├── model.ts                       # Multi-provider AI SDK model resolver (Anthropic/OpenAI/Google)
│       ├── conversation-runner.ts         # Streaming turn execution & persistence
│       └── vault-env.ts                   # Merges .env + data/.env and redacts secrets from logs
└── memory/
    ├── philosophy.md                      # Empirical grounding & self-building principles
    └── tree/context.md                    # Active workspace architecture & operational notes
```

---

## 🔄 How Self-Building UI Works

When you ask Ignis to build a new dashboard, widget, or tool into your workspace:

1. **Worktree Isolation**: Ignis runs `./bin/wt new <feature-slug>` to create a clean Git worktree under `.worktrees/<feature-slug>` without disrupting your active session.
2. **Full-Stack Implementation**: Inside the worktree, Ignis edits `app/components/workspace.tsx` (or creates new sub-components and `/api/*` routes backed by `data/ignis.db`).
3. **Pre-Flight Verification**: Ignis runs `./bin/wt check <feature-slug>` (which executes `tsc --noEmit` and `./bin/smoke`) to ensure zero TypeScript or build regressions.
4. **Atomic Landing & Hot-Reload**: Ignis commits the change and runs `./bin/wt land <feature-slug>`, merging the commit onto `main`, creating a **Time Machine** checkpoint, and triggering an immediate UI hot-reload.

If you ever want to undo a UI change, press **`⌘.`** -> **Time Machine** and click **Restore** on any previous commit (or **Reset to Factory Default**).

---

## 📊 Comparison: Ignis OSS (Basic) vs. Ignis Cloud / Full Stack

| Capability | **Ignis OSS (Basic Edition)** | **Ignis Cloud / Full Stack** |
| :--- | :---: | :---: |
| **License & Hosting** | **MIT Open Source** (Self-Hosted / Local / Docker) | Managed Cloud Containers + Dedicated Subdomains |
| **Self-Building React UI (`workspace.tsx`)** | ✅ Included | ✅ Included |
| **`runCommand` Shell & Full-Stack Agency** | ✅ Included | ✅ Included |
| **Git Worktree Time Machine (`./bin/wt` + `⌘.`)** | ✅ Included | ✅ Included |
| **Protected Core (`<CoreErrorBoundary>` & Emergency Chat)** | ✅ Included | ✅ Included |
| **Headless Chrome (`./bin/browse`) & Native SQLite** | ✅ Included | ✅ Included |
| **Bring Your Own Key (Claude / OpenAI / Gemini)** | ✅ Included (`.env` & UI Env Vault) | ✅ Included + Managed Trial Sandbox |
| **Parallel Subagent Swarms (`subagent: parallel`)** | — | ✅ Multi-Agent Concurrent Fan-Out |
| **Competing Worktree Tournaments (`subagent: tournament`)** | — | ✅ Auto-Refereed Multi-Worktree Arena |
| **24/7 Wake-on-Schedule Cron Daemon (`./bin/schedule`)** | — | ✅ Autonomous Recurring Background Jobs |
| **Managed Multi-Tenant Auth & Cloud Snapshots** | — | ✅ Zero-Config Cloud Provisioning |

---

## 📜 License

Released under the [MIT License](./LICENSE).
