"use client";

import { useState } from "react";

export type CodebaseVariant = "raw" | "subagents" | "scheduler" | "full";

export type StarterBlueprint = {
  id: string;
  tag: string;
  title: string;
  description: string;
  prompt: string;
  highlights: string[];
};

export type ArchitectureModeMeta = {
  variant: CodebaseVariant;
  badgeLabel: string;
  shortTitle: string;
  subtitle: string;
  capabilities: string[];
  blueprints: StarterBlueprint[];
};

export const VARIANT_BLUEPRINTS: Record<CodebaseVariant, ArchitectureModeMeta> = {
  raw: {
    variant: "raw",
    badgeLabel: "Ignis OSS · Self-Building Core",
    shortTitle: "Raw Self-Evolving Software",
    subtitle:
      "Pure self-modifying Next.js workspace with runCommand, SQLite & headless ./bin/browse.",
    capabilities: ["Self-Building React UI", "runCommand Shell", "Headless ./bin/browse", "SQLite Persistence"],
    blueprints: [
      {
        id: "raw-tech-radar",
        tag: "Live Scraper + UI Panel",
        title: "Live HackerNews & Tech Radar Dashboard",
        description:
          "Build a live tech radar panel right into your workspace UI using ./bin/browse and a local SQLite cache.",
        prompt:
          "Build a Live HackerNews & Tech Radar Dashboard right into my UI using `./bin/browse` and a SQLite cache",
        highlights: ["./bin/browse", "SQLite Cache", "Live UI Panel"],
      },
      {
        id: "raw-personal-crm",
        tag: "Interactive App + SQLite",
        title: "Personal CRM & Deal Pipeline Table",
        description:
          "Turn your workspace into an interactive deal pipeline with inline editing, stage filters, and SQLite persistence.",
        prompt:
          "Turn my workspace into a Personal CRM & Deal Pipeline table with inline editing and SQLite persistence",
        highlights: ["Inline Editing", "SQLite Table", "Custom Views"],
      },
      {
        id: "raw-webhook-inspector",
        tag: "Developer Tooling UI",
        title: "Interactive API & Webhook Inspector Panel",
        description:
          "Create a collapsible request tester and payload inspector directly inside your workspace header.",
        prompt:
          "Create an Interactive API & Webhook Inspector Panel in my workspace header",
        highlights: ["Header Mount", "Live cURL / Fetch", "JSON Inspector"],
      },
    ],
  },
  subagents: {
    variant: "subagents",
    badgeLabel: "Architecture: + Parallel Subagents",
    shortTitle: "Parallel Subagent War-Rooms & Tournaments",
    subtitle:
      "Fan out concurrent child subagents or run competing git worktree tournaments alongside live UI self-modification.",
    capabilities: ["Parallel Subagents", "Worktree Tournaments", "Self-Building React UI", "Headless ./bin/browse"],
    blueprints: [
      {
        id: "subagents-comparison-matrix",
        tag: "3x Parallel Fan-Out + UI",
        title: "AI Code Editors Parallel Research Matrix",
        description:
          "Spawn 3 parallel subagents to research top AI code editors concurrently, then synthesize a visual comparison matrix in your UI.",
        prompt:
          "Spawn 3 parallel subagents to research and compare top AI code editors, then build a visual comparison matrix component into my UI",
        highlights: ["subagent: parallel", "3 Child Minds", "Visual Matrix UI"],
      },
      {
        id: "subagents-research-bar",
        tag: "Multi-Agent UI Widget",
        title: "Multi-Agent Deep Research Bar",
        description:
          "Add a permanent 'Multi-Agent Deep Research' bar to your workspace that fans out 3 parallel subagents on any topic.",
        prompt:
          "Add a 'Multi-Agent Deep Research' bar to my workspace that fans out 3 parallel subagents on any topic",
        highlights: ["Workspace Toolbar", "3-Agent Fan-Out", "Live Synthesis"],
      },
      {
        id: "subagents-worktree-tournament",
        tag: "2-Candidate Git Tournament",
        title: "Worktree UI Redesign Tournament",
        description:
          "Run a 2-candidate worktree tournament to redesign your chat header with live system metrics and judge the winner.",
        prompt:
          "Run a 2-candidate worktree tournament to redesign my chat header with live system metrics",
        highlights: ["subagent: tournament", "Isolated Worktrees", "Auto-Judge"],
      },
    ],
  },
  scheduler: {
    variant: "scheduler",
    badgeLabel: "Architecture: + 24/7 Scheduler",
    shortTitle: "24/7 Autonomous Scheduled Monitors",
    subtitle:
      "Recurring autonomous jobs that wake your machine on schedule and stream live intelligence into custom UI dashboards.",
    capabilities: ["24/7 Cron & Intervals", "Wake-on-Schedule", "Self-Building React UI", "SQLite History"],
    blueprints: [
      {
        id: "scheduler-intel-feed",
        tag: "Every 30m Cron + Live Feed",
        title: "Scheduled Competitor & News Intelligence Feed",
        description:
          "Schedule a recurring 30-minute monitor and build a live 'Scheduled Intelligence Feed' panel directly into your UI.",
        prompt:
          "Schedule a recurring 30-minute competitor & news monitor and build a live 'Scheduled Intelligence Feed' panel into my UI",
        highlights: ["./bin/schedule", "30m Interval", "Live Feed Panel"],
      },
      {
        id: "scheduler-morning-briefing",
        tag: "Daily 8:00 AM Job + Archive",
        title: "Automated Daily Morning Briefing & Archive Tab",
        description:
          "Create an automated daily morning briefing job at 8:00 AM with a dedicated archive viewer tab in your workspace.",
        prompt:
          "Create an automated daily morning briefing job at 8:00 AM with a dedicated archive viewer tab in my workspace",
        highlights: ["Daily 08:00 Cron", "Wake-on-Schedule", "Archive Viewer UI"],
      },
      {
        id: "scheduler-uptime-tracker",
        tag: "Scheduled Probe + Top Bar Badge",
        title: "Website Uptime & Latency Status Tracker",
        description:
          "Set up a scheduled website uptime & latency tracker with a live status badge mounted in your top bar.",
        prompt:
          "Set up a scheduled website uptime & latency tracker with a live status badge in my top bar",
        highlights: ["Latency Probe", "SQLite Time-Series", "Top Bar Badge"],
      },
    ],
  },
  full: {
    variant: "full",
    badgeLabel: "Architecture: Full Ignis Stack",
    shortTitle: "Self-Modifying UI + Parallel Subagents + 24/7 Automation",
    subtitle:
      "The complete Ignis powerhouse: parallel subagent swarms, 24/7 wake-on-schedule jobs, and live React UI evolution.",
    capabilities: ["Parallel Subagents", "24/7 Wake-on-Schedule", "Worktree Tournaments", "Self-Building React UI"],
    blueprints: [
      {
        id: "full-launch-radar",
        tag: "3x Subagents + 6h Schedule + UI",
        title: "Autonomous AI Launch Radar & 6-Hour Refresh",
        description:
          "Spawn 3 parallel subagents to scrape top AI launches, build a 'Launch Radar' UI panel, and schedule it to refresh every 6 hours.",
        prompt:
          "Spawn 3 parallel subagents to scrape top AI launches, build a 'Launch Radar' UI panel, and schedule it to refresh every 6 hours",
        highlights: ["3 Parallel Subagents", "Launch Radar UI", "Every 6h Schedule"],
      },
      {
        id: "full-market-war-room",
        tag: "Subagent Swarm + Daily 8am Digest",
        title: "Autonomous Market & Competitor War-Room",
        description:
          "Build an Autonomous Market & Competitor War-Room with parallel subagent fact-checking and a daily 8am scheduled digest.",
        prompt:
          "Build an Autonomous Market & Competitor War-Room with parallel subagent fact-checking and a daily 8am scheduled digest",
        highlights: ["Fact-Check Swarm", "War-Room Dashboard", "Daily 8am Digest"],
      },
      {
        id: "full-lead-crm",
        tag: "SQLite CRM + Enrichment + Reminders",
        title: "Self-Evolving Lead Discovery & Enrichment CRM",
        description:
          "Create a Self-Evolving Lead Discovery CRM tab backed by SQLite, parallel enrichment subagents, and automated follow-up reminders.",
        prompt:
          "Create a Self-Evolving Lead Discovery CRM tab backed by SQLite, parallel enrichment subagents, and automated follow-up reminders",
        highlights: ["SQLite CRM Tab", "Parallel Enrichment", "Scheduled Follow-Ups"],
      },
    ],
  },
};

export function resolveActiveVariant(_input?: {
  codebaseVariant?: CodebaseVariant | null;
  enableSubagents?: boolean;
  enableScheduler?: boolean;
} | null): CodebaseVariant {
  return "raw";
}

export function StarterBlueprintsGrid({
  variant,
  busy,
  onRunBlueprint,
  onCustomizeBlueprint,
}: {
  variant: CodebaseVariant;
  busy: boolean;
  onRunBlueprint: (prompt: string) => void;
  onCustomizeBlueprint: (prompt: string) => void;
}) {
  const mode = VARIANT_BLUEPRINTS[variant] ?? VARIANT_BLUEPRINTS.raw;
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [customDraft, setCustomDraft] = useState<string>("");

  function handleTogglePreview(bp: StarterBlueprint) {
    if (previewId === bp.id) {
      setPreviewId(null);
      return;
    }
    setPreviewId(bp.id);
    setCustomDraft(bp.prompt);
  }

  return (
    <section
      aria-label="1-Click Self-Building Starter Blueprints"
      className="mx-auto w-full max-w-4xl px-4 pt-3 pb-2"
    >
      {/* Architecture Badge & Header */}
      <div className="flex flex-col items-center text-center">
        <div className="inline-flex flex-wrap items-center justify-center gap-2 rounded-full border border-ember/35 bg-paper-raised px-3.5 py-1 shadow-2xs">
          <span className="size-2 rounded-full bg-ember shadow-[0_0_8px_var(--ember)]" />
          <span
            data-testid="active-architecture-badge"
            className="font-mono text-xs font-semibold tracking-tight text-ember"
          >
            {mode.badgeLabel}
          </span>
          <span className="hidden text-xs text-muted sm:inline">·</span>
          <span className="hidden text-xs font-medium text-ink sm:inline">
            {mode.shortTitle}
          </span>
        </div>

        <h2 className="mt-2.5 text-base font-semibold tracking-tight text-ink sm:text-lg">
          1-Click Self-Building Starter Blueprints{" "}
          <span className="font-normal text-muted">— Aha! Moment in Turn 1</span>
        </h2>
        <p className="mt-0.5 max-w-xl text-xs text-muted">
          {mode.subtitle}
        </p>
      </div>

      {/* 3 Variant-Aware Blueprint Cards */}
      <div className="mt-3.5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {mode.blueprints.map((bp, idx) => {
          const isPreviewing = previewId === bp.id;
          return (
            <div
              key={bp.id}
              data-testid={`blueprint-card-${bp.id}`}
              className={`group relative flex flex-col justify-between rounded-2xl border p-3.5 text-left transition-all ${
                isPreviewing
                  ? "border-ember bg-paper-raised shadow-elevated"
                  : "border-line bg-paper-raised/90 shadow-2xs hover:border-ember/50 hover:bg-paper-raised"
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-full bg-ember/15 px-2 py-0.5 font-mono text-2xs font-semibold text-ember">
                    <span>0{idx + 1}</span>
                    <span>·</span>
                    <span>{bp.tag}</span>
                  </span>
                </div>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onRunBlueprint(bp.prompt)}
                  className="mt-2 block w-full text-left focus:outline-none disabled:opacity-50"
                >
                  <h3 className="text-sm font-semibold leading-snug text-ink transition-colors group-hover:text-ember">
                    {bp.title}
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    {bp.description}
                  </p>
                </button>

                {/* Capability Highlight Pills */}
                <div className="mt-2.5 flex flex-wrap gap-1">
                  {bp.highlights.map((h) => (
                    <span
                      key={h}
                      className="rounded-md bg-recess px-1.5 py-0.5 font-mono text-2xs text-muted"
                    >
                      {h}
                    </span>
                  ))}
                </div>
              </div>

              {/* Preview / Customize Drawer */}
              {isPreviewing ? (
                <div className="mt-3 border-t border-line pt-2.5">
                  <label className="block font-mono text-2xs font-medium text-muted">
                    Customize prompt before running:
                  </label>
                  <textarea
                    rows={3}
                    value={customDraft}
                    onChange={(e) => setCustomDraft(e.target.value)}
                    className="mt-1 w-full resize-none rounded-xl border border-line bg-paper px-2.5 py-1.5 text-xs leading-relaxed text-ink outline-none focus:border-ember"
                  />
                  <div className="mt-2 flex items-center justify-between gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        onCustomizeBlueprint(customDraft.trim() || bp.prompt);
                        setPreviewId(null);
                      }}
                      className="rounded-lg border border-line bg-paper px-2.5 py-1 text-2xs font-medium text-muted transition-colors hover:border-ember/40 hover:text-ink"
                    >
                      Load into input
                    </button>
                    <button
                      type="button"
                      disabled={busy || !customDraft.trim()}
                      onClick={() => onRunBlueprint(customDraft.trim() || bp.prompt)}
                      className="rounded-lg bg-ember px-3 py-1 text-2xs font-semibold text-white shadow-2xs transition-opacity hover:opacity-95 disabled:opacity-40"
                    >
                      ⚡ Run Now →
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-line/70 pt-2.5">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onRunBlueprint(bp.prompt)}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-ember/15 px-3 py-1.5 text-xs font-semibold text-ember transition-all hover:bg-ember hover:text-white disabled:opacity-40"
                  >
                    <span>⚡ Run 1-Click Blueprint</span>
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleTogglePreview(bp)}
                    title="Preview or customize prompt before running"
                    className="rounded-xl border border-line bg-paper px-2.5 py-1.5 text-2xs font-medium text-muted transition-colors hover:border-ember/40 hover:text-ink"
                  >
                    Edit
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
