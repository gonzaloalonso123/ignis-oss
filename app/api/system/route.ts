import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { listActiveRuns } from "@/lib/agent/conversation-runner";
import {
  deleteVaultEnvKey,
  listVaultEnvKeys,
  parseDotEnvContent,
  readVaultEnvMap,
  upsertVaultEnvEntries,
} from "@/lib/agent/vault-env";

export type CodebaseVariant = "raw" | "subagents" | "scheduler" | "full";

export type OnboardingConfig = {
  onboarded: boolean;
  defaultProvider: "anthropic" | "openai" | "google";
  defaultModel: string;
  enableSubagents: boolean;
  enableScheduler: boolean;
  codebaseVariant: CodebaseVariant;
  providers: {
    anthropic: boolean;
    openai: boolean;
    google: boolean;
  };
  updatedAt: string | null;
};

export type VersionHistoryItem = {
  sha: string;
  shortSha: string;
  message: string;
  relativeTime: string;
  isoDate: string;
  isCurrent: boolean;
  isFactory: boolean;
};

function getOnboardingPaths(root: string) {
  const dataDir = path.join(root, "data");
  const configPath = path.join(dataDir, "ignis-onboarding.json");
  const envPath = path.join(dataDir, ".env");
  return { dataDir, configPath, envPath };
}

function readLocalDotEnv(envPath: string): Record<string, string> {
  if (!existsSync(envPath)) return {};
  try {
    return parseDotEnvContent(readFileSync(envPath, "utf8"));
  } catch {
    return {};
  }
}

function writeLocalDotEnv(envPath: string, updates: Record<string, string>) {
  const current = readLocalDotEnv(envPath);
  for (const [k, v] of Object.entries(updates)) {
    if (v && v.trim()) {
      current[k] = v.trim();
      process.env[k] = v.trim();
    }
  }
  const lines = Object.entries(current).map(
    ([k, v]) => `${k}=${JSON.stringify(v)}`,
  );
  writeFileSync(envPath, `${lines.join("\n")}\n`, { encoding: "utf8", mode: 0o600 });
}

function loadOnboardingStatus(root: string): OnboardingConfig {
  const { configPath } = getOnboardingPaths(root);
  const envVars = readVaultEnvMap(null, root);

  let saved: Partial<OnboardingConfig> = {};
  if (existsSync(configPath)) {
    try {
      saved = JSON.parse(readFileSync(configPath, "utf8")) as Partial<OnboardingConfig>;
    } catch {
      saved = {};
    }
  }

  const providers = {
    anthropic: Boolean(envVars.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY),
    openai: Boolean(envVars.OPENAI_API_KEY || process.env.OPENAI_API_KEY),
    google: Boolean(
      envVars.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    ),
  };

  const envProvider = (envVars.IGNIS_DEFAULT_PROVIDER || process.env.IGNIS_DEFAULT_PROVIDER || "").trim();
  const validEnvProvider =
    envProvider === "anthropic" || envProvider === "openai" || envProvider === "google"
      ? envProvider
      : undefined;

  const defaultProvider =
    saved.defaultProvider ||
    validEnvProvider ||
    (providers.anthropic
      ? "anthropic"
      : providers.openai
        ? "openai"
        : "google");

  const envModel = (envVars.IGNIS_DEFAULT_MODEL || process.env.IGNIS_DEFAULT_MODEL || "").trim();
  const defaultModel =
    saved.defaultModel ||
    envModel ||
    (defaultProvider === "anthropic"
      ? "claude-opus-5-5"
      : defaultProvider === "openai"
        ? "gpt-6-astra"
        : "gemini-4-argon");

  return {
    onboarded: Boolean(
      saved.onboarded ||
        providers.anthropic ||
        providers.openai ||
        providers.google,
    ),
    defaultProvider,
    defaultModel,
    enableSubagents: false,
    enableScheduler: false,
    codebaseVariant: "raw",
    providers,
    updatedAt: saved.updatedAt || null,
  };
}

function getVersionHistory(root: string): {
  versions: VersionHistoryItem[];
  remoteVaultRepo: string;
} {
  try {
    const rawLog = execFileSync(
      "git",
      [
        "-C",
        root,
        "log",
        "-n",
        "25",
        "--pretty=format:%H\t%h\t%s\t%cr\t%cI",
      ],
      { encoding: "utf8" },
    ).trim();

    const lines = rawLog ? rawLog.split("\n") : [];
    const versions: VersionHistoryItem[] = lines.map((line, idx) => {
      const [sha = "", shortSha = "", message = "", relativeTime = "", isoDate = ""] =
        line.split("\t");
      return {
        sha,
        shortSha,
        message: message || "Interface update",
        relativeTime: relativeTime || "just now",
        isoDate,
        isCurrent: idx === 0,
        isFactory: idx === lines.length - 1,
      };
    });
    return { versions, remoteVaultRepo: "Local Git Time Machine" };
  } catch {
    return { versions: [], remoteVaultRepo: "Local Git Time Machine" };
  }
}

export async function GET(request: Request) {
  const root = process.cwd();
  const { searchParams } = new URL(request.url);

  if (searchParams.has("onboardingStatus")) {
    return NextResponse.json(loadOnboardingStatus(root));
  }

  if (searchParams.has("versionHistory")) {
    return NextResponse.json({
      ...getVersionHistory(root),
      onboarding: loadOnboardingStatus(root),
    });
  }

  if (searchParams.has("vaultEnv")) {
    const scopeParam = searchParams.get("vaultEnv")?.trim() || null;
    const envInfo = listVaultEnvKeys(scopeParam, root);
    return NextResponse.json({
      scope: envInfo.scope,
      displayPath: envInfo.displayPath,
      keys: envInfo.keys,
    });
  }

  const activeSchedules: never[] = [];
  const nextScheduleAt = null;

  const activeRuns = listActiveRuns().map((r) => ({
    conversationId: r.conversationId,
    source: r.source,
    startedAt: r.startedAt,
  }));

  return NextResponse.json({
    schedules: activeSchedules.slice(0, 6),
    nextScheduleAt,
    activeRuns,
    onboarding: loadOnboardingStatus(root),
    versionControl: getVersionHistory(root),
  });
}

export async function POST(request: Request) {
  const root = process.cwd();
  try {
    const body = (await request.json()) as {
      action?: string;
      id?: string;
      enabled?: boolean;
      force?: boolean;
      scope?: string | null;
      key?: string;
      value?: string;
      rawDotEnv?: string;
      defaultProvider?: "anthropic" | "openai" | "google";
      defaultModel?: string;
      anthropicKey?: string;
      openaiKey?: string;
      googleKey?: string;
      sha?: string;
      message?: string;
    };

    if (body.action === "save-onboarding") {
      const { dataDir, configPath, envPath } = getOnboardingPaths(root);
      mkdirSync(dataDir, { recursive: true });

      const envUpdates: Record<string, string> = {};
      if (body.anthropicKey?.trim()) {
        envUpdates.ANTHROPIC_API_KEY = body.anthropicKey.trim();
      }
      if (body.openaiKey?.trim()) {
        envUpdates.OPENAI_API_KEY = body.openaiKey.trim();
      }
      if (body.googleKey?.trim()) {
        envUpdates.GOOGLE_GENERATIVE_AI_API_KEY = body.googleKey.trim();
      }
      if (body.defaultProvider) {
        envUpdates.IGNIS_DEFAULT_PROVIDER = body.defaultProvider;
      }
      if (body.defaultModel) {
        envUpdates.IGNIS_DEFAULT_MODEL = body.defaultModel;
      }

      if (Object.keys(envUpdates).length > 0) {
        writeLocalDotEnv(envPath, envUpdates);
      }

      const currentStatus = loadOnboardingStatus(root);
      const nextConfig: OnboardingConfig = {
        ...currentStatus,
        onboarded: true,
        defaultProvider: body.defaultProvider || currentStatus.defaultProvider,
        defaultModel: body.defaultModel || currentStatus.defaultModel,
        enableSubagents: false,
        enableScheduler: false,
        codebaseVariant: "raw",
        updatedAt: new Date().toISOString(),
      };
      writeFileSync(configPath, JSON.stringify(nextConfig, null, 2), "utf8");
      return NextResponse.json({
        ok: true,
        onboarding: loadOnboardingStatus(root),
      });
    }

    if (body.action === "rollback-version" && body.sha?.trim()) {
      const targetSha = body.sha.trim();
      if (!/^[a-f0-9]{7,40}$/i.test(targetSha)) {
        return NextResponse.json({ error: "Invalid version SHA" }, { status: 400 });
      }
      const shortSha = targetSha.slice(0, 7);

      // Restore full app/ and lib/ tree from targetSha, while preserving Protected Core files
      const protectedCore = [
        "app/layout.tsx",
        "app/components/core-error-boundary.tsx",
        "app/components/immutable-control-panel.tsx",
        "app/api/system/route.ts",
        "app/api/chat/route.ts",
        "bin/wt",
      ];
      execFileSync("git", ["-C", root, "checkout", targetSha, "--", "app/", "lib/"]);
      execFileSync("git", ["-C", root, "checkout", "HEAD", "--", ...protectedCore]);
      execFileSync("git", ["-C", root, "clean", "-fd", "app/components/"]);

      const statusOut = execFileSync(
        "git",
        ["-C", root, "status", "--porcelain", "app/", "lib/"],
        { encoding: "utf8" },
      ).trim();

      if (statusOut) {
        execFileSync("git", ["-C", root, "add", "-A", "app/", "lib/"]);
        execFileSync("git", [
          "-C",
          root,
          "commit",
          "-m",
          `Rollback workspace UI to version ${shortSha}`,
        ]);
      }

      const cssPath = path.join(root, "app", "globals.css");
      if (existsSync(cssPath)) {
        const now = new Date();
        utimesSync(cssPath, now, now);
      }

      return NextResponse.json({
        ok: true,
        rolledBackTo: shortSha,
        ...getVersionHistory(root),
      });
    }

    if (body.action === "vault-env-upsert") {
      const updates: Record<string, string> = {};
      if (body.rawDotEnv?.trim()) {
        Object.assign(updates, parseDotEnvContent(body.rawDotEnv));
      }
      if (body.key?.trim()) {
        const k = body.key.trim();
        if (k.includes("=") && !body.value) {
          Object.assign(updates, parseDotEnvContent(k));
        } else {
          updates[k] = body.value ?? "";
        }
      }
      const updated = upsertVaultEnvEntries(body.scope, updates, root);
      return NextResponse.json({ ok: true, ...updated });
    }
    if (body.action === "vault-env-delete" && body.key?.trim()) {
      const updated = deleteVaultEnvKey(body.scope, body.key.trim(), root);
      return NextResponse.json({ ok: true, ...updated });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed system action" },
      { status: 500 },
    );
  }
}
