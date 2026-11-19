import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { resolveMainRepoRoot } from "../db.ts";

export type VaultEnvKeySummary = {
  key: string;
  maskedValue: string;
  sensitive: boolean;
  length: number;
};

export function normalizeVaultScope(scope?: string | null): string | null {
  if (!scope) return null;
  const trimmed = scope.trim().replace(/^\/+|\/+$/g, "");
  if (!trimmed || trimmed === "root" || trimmed === "core") return null;
  const topSlug = trimmed.split("/")[0]?.trim() || "";
  if (!/^[a-zA-Z0-9_-]+$/.test(topSlug)) {
    throw new Error(`Invalid scope: ${scope}`);
  }
  return topSlug;
}

export function resolveVaultEnvPath(scope?: string | null, repoRoot = resolveMainRepoRoot()): {
  scope: string | null;
  displayPath: string;
  envFilePath: string;
  vaultDir: string;
} {
  const normScope = normalizeVaultScope(scope);
  const envFilePath = path.join(repoRoot, "data", ".env");
  return {
    scope: normScope,
    displayPath: "data/.env",
    envFilePath,
    vaultDir: repoRoot,
  };
}

export function parseDotEnvContent(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const cleaned = line.startsWith("export ") ? line.slice(7).trim() : line;
    const eqIdx = cleaned.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = cleaned.slice(0, eqIdx).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let val = cleaned.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

export function readVaultEnvMap(scope?: string | null, repoRoot = resolveMainRepoRoot()): Record<string, string> {
  const rootEnvPath = path.join(repoRoot, ".env");
  const { envFilePath } = resolveVaultEnvPath(scope, repoRoot);

  const merged: Record<string, string> = {};
  if (existsSync(rootEnvPath)) {
    try {
      Object.assign(merged, parseDotEnvContent(readFileSync(rootEnvPath, "utf8")));
    } catch {
      // ignore
    }
  }
  if (existsSync(envFilePath)) {
    try {
      Object.assign(merged, parseDotEnvContent(readFileSync(envFilePath, "utf8")));
    } catch {
      // ignore
    }
  }
  return merged;
}

export function resolveCombinedVaultEnv(scope?: string | null, repoRoot = resolveMainRepoRoot()): Record<string, string> {
  return readVaultEnvMap(scope, repoRoot);
}

function maskEnvValue(value: string): string {
  if (!value) return "";
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

export function listVaultEnvKeys(scope?: string | null, repoRoot = resolveMainRepoRoot()): {
  scope: string | null;
  displayPath: string;
  keys: VaultEnvKeySummary[];
} {
  const { scope: normScope, displayPath } = resolveVaultEnvPath(scope, repoRoot);
  const map = readVaultEnvMap(normScope, repoRoot);
  const keys = Object.entries(map).map(([key, val]) => ({
    key,
    maskedValue: maskEnvValue(val),
    sensitive: /key|token|secret|password|credential/i.test(key),
    length: val.length,
  }));
  return { scope: normScope, displayPath, keys };
}

export function upsertVaultEnvEntries(
  scope: string | null | undefined,
  entries: Record<string, string>,
  repoRoot = resolveMainRepoRoot(),
) {
  const { envFilePath } = resolveVaultEnvPath(scope, repoRoot);
  mkdirSync(path.dirname(envFilePath), { recursive: true });
  const current = readVaultEnvMap(scope, repoRoot);
  for (const [k, v] of Object.entries(entries)) {
    const cleanKey = k.trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(cleanKey)) continue;
    current[cleanKey] = v;
    process.env[cleanKey] = v;
  }
  const serialized = Object.entries(current)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join("\n");
  writeFileSync(envFilePath, serialized ? `${serialized}\n` : "", { encoding: "utf8", mode: 0o600 });
  try {
    chmodSync(envFilePath, 0o600);
  } catch {
    // ignore
  }
  return listVaultEnvKeys(scope, repoRoot);
}

export function deleteVaultEnvKey(
  scope: string | null | undefined,
  keyToRemove: string,
  repoRoot = resolveMainRepoRoot(),
) {
  const { envFilePath } = resolveVaultEnvPath(scope, repoRoot);
  const current = readVaultEnvMap(scope, repoRoot);
  delete current[keyToRemove];
  delete process.env[keyToRemove];
  const serialized = Object.entries(current)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join("\n");
  if (existsSync(envFilePath)) {
    writeFileSync(envFilePath, serialized ? `${serialized}\n` : "", { encoding: "utf8", mode: 0o600 });
  }
  return listVaultEnvKeys(scope, repoRoot);
}

export function redactVaultSecrets(
  text: string,
  extraEnv?: Record<string, string>,
): string {
  if (!text) return "";
  const map = { ...readVaultEnvMap(), ...(extraEnv ?? {}) };
  let out = text;
  for (const [key, val] of Object.entries(map)) {
    if (!val || val.length < 8) continue;
    if (!/key|token|secret|password|credential/i.test(key)) continue;
    if (out.includes(val)) {
      out = out.split(val).join(`[REDACTED:${key}]`);
    }
  }
  return out;
}
