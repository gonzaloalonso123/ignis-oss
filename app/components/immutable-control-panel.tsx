"use client";

import { useChat } from "@ai-sdk/react";
import { useCallback, useEffect, useState } from "react";
import { CozyAvatar } from "@/app/avatar";
import { ArrowUpIcon } from "./ui";

type VersionItem = {
  sha: string;
  shortSha: string;
  message: string;
  relativeTime: string;
  isoDate: string;
  isCurrent: boolean;
  isFactory: boolean;
};

type OnboardingStatus = {
  onboarded: boolean;
  defaultProvider: "anthropic" | "openai" | "google";
  defaultModel: string;
  enableSubagents?: boolean;
  enableScheduler?: boolean;
  codebaseVariant?: "raw" | "subagents" | "scheduler" | "full";
  providers: {
    anthropic: boolean;
    openai: boolean;
    google: boolean;
  };
};

type VaultEnvKeyItem = {
  key: string;
  maskedValue: string;
  sensitive: boolean;
  length: number;
};

type ControlTab = "rollback" | "emergency" | "keys" | "env";

const PROVIDER_INFO = {
  anthropic: {
    badge: "Claude",
    placeholder: "Paste your Anthropic API key (sk-ant-...)",
    defaultModel: "claude-opus-5-5",
  },
  openai: {
    badge: "OpenAI",
    placeholder: "Paste your OpenAI API key (sk-proj-...)",
    defaultModel: "gpt-6-astra",
  },
  google: {
    badge: "Gemini",
    placeholder: "Paste your Google Gemini API key (AIzaSy...)",
    defaultModel: "gemini-4-argon",
  },
} as const;

export function ImmutableControlPanel() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<ControlTab>("rollback");
  const [versions, setVersions] = useState<VersionItem[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [rollingBackSha, setRollingBackSha] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // AI Brain (keys & model) state
  const [activeProvider, setActiveProvider] = useState<"anthropic" | "openai" | "google">("anthropic");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [defaultModelInput, setDefaultModelInput] = useState<string>(
    PROVIDER_INFO.anthropic.defaultModel,
  );
  const [savingKey, setSavingKey] = useState(false);
  const [onboarding, setOnboarding] = useState<OnboardingStatus | null>(null);

  // Env Vault state
  const [envKeys, setEnvKeys] = useState<VaultEnvKeyItem[]>([]);
  const [envDisplayPath, setEnvDisplayPath] = useState("data/.env");
  const [envKeyInput, setEnvKeyInput] = useState("");
  const [envValueInput, setEnvValueInput] = useState("");
  const [savingEnv, setSavingEnv] = useState(false);

  // Emergency Recovery Chat (Indestructible, wired directly to /api/chat)
  const [emergencyInput, setEmergencyInput] = useState("");
  const {
    messages: emergencyMessages,
    sendMessage: sendEmergencyMessage,
    status: emergencyStatus,
  } = useChat({
    id: "ignis-emergency-recovery",
  });
  const emergencyBusy =
    emergencyStatus === "submitted" || emergencyStatus === "streaming";

  const fetchControlState = useCallback(async () => {
    setLoadingVersions(true);
    try {
      const [sysRes, envRes] = await Promise.all([
        fetch("/api/system?versionHistory=1"),
        fetch("/api/system?vaultEnv=root"),
      ]);
      if (sysRes.ok) {
        const data = (await sysRes.json()) as {
          versions?: VersionItem[];
          onboarding?: OnboardingStatus;
        };
        if (data.versions) setVersions(data.versions);
        if (data.onboarding) {
          setOnboarding(data.onboarding);
          setActiveProvider(data.onboarding.defaultProvider);
          setDefaultModelInput(
            data.onboarding.defaultModel ||
              PROVIDER_INFO[data.onboarding.defaultProvider].defaultModel,
          );
        }
      }
      if (envRes.ok) {
        const envData = (await envRes.json()) as {
          displayPath?: string;
          keys?: VaultEnvKeyItem[];
        };
        if (envData.displayPath) setEnvDisplayPath(envData.displayPath);
        if (envData.keys) setEnvKeys(envData.keys);
      }
    } catch {
      // ignore transient errors
    } finally {
      setLoadingVersions(false);
    }
  }, []);

  useEffect(() => {
    void fetchControlState();
  }, [fetchControlState]);

  useEffect(() => {
    if (open) {
      void fetchControlState();
    }
  }, [open, fetchControlState]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === ".") {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
      if (event.key === "Escape" && open) {
        setOpen(false);
      }
    }
    function onOpenEvent(event: Event) {
      const custom = event as CustomEvent<{ tab?: ControlTab }>;
      if (custom.detail?.tab) {
        setTab(custom.detail.tab);
      }
      setOpen(true);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("ignis:open-control-panel", onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("ignis:open-control-panel", onOpenEvent);
    };
  }, [open]);

  async function handleRollback(sha: string, isFactory = false) {
    setRollingBackSha(sha);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/system", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "rollback-version",
          sha,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        rolledBackTo?: string;
        versions?: VersionItem[];
      };
      if (!res.ok || data.error) {
        throw new Error(data.error || "Rollback failed");
      }
      if (data.versions) setVersions(data.versions);
      setNotice(
        isFactory
          ? "Restored workspace to Factory Default. Reloading UI…"
          : `Rolled back workspace to commit ${data.rolledBackTo || sha.slice(0, 7)}. Reloading UI…`,
      );
      setTimeout(() => {
        window.location.reload();
      }, 650);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rollback version");
    } finally {
      setRollingBackSha(null);
    }
  }

  async function handleSaveBrain(event: React.FormEvent) {
    event.preventDefault();
    setSavingKey(true);
    setError(null);
    setNotice(null);
    try {
      const modelToSave =
        defaultModelInput.trim() || PROVIDER_INFO[activeProvider].defaultModel;
      const payload: Record<string, unknown> = {
        action: "save-onboarding",
        defaultProvider: activeProvider,
        defaultModel: modelToSave,
      };
      if (apiKeyInput.trim()) {
        if (activeProvider === "anthropic") payload.anthropicKey = apiKeyInput.trim();
        if (activeProvider === "openai") payload.openaiKey = apiKeyInput.trim();
        if (activeProvider === "google") payload.googleKey = apiKeyInput.trim();
      }
      const res = await fetch("/api/system", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        onboarding?: OnboardingStatus;
      };
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to save AI configuration");
      }
      if (data.onboarding) setOnboarding(data.onboarding);
      setApiKeyInput("");
      setNotice(
        `Saved ${PROVIDER_INFO[activeProvider].badge} (${modelToSave}) as default AI Brain.`,
      );
      await fetchControlState();
      window.dispatchEvent(new CustomEvent("ignis:onboarding-updated"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save AI Brain settings");
    } finally {
      setSavingKey(false);
    }
  }

  async function handleUpsertEnv(event: React.FormEvent) {
    event.preventDefault();
    if (!envKeyInput.trim()) return;
    setSavingEnv(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/system", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "vault-env-upsert",
          scope: "root",
          key: envKeyInput.trim(),
          value: envValueInput,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        keys?: VaultEnvKeyItem[];
      };
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to save environment variable");
      }
      if (data.keys) setEnvKeys(data.keys);
      setNotice(`Saved ${envKeyInput.trim()} to ${envDisplayPath}.`);
      setEnvKeyInput("");
      setEnvValueInput("");
      await fetchControlState();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update environment vault");
    } finally {
      setSavingEnv(false);
    }
  }

  async function handleDeleteEnv(keyToDelete: string) {
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/system", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "vault-env-delete",
          scope: "root",
          key: keyToDelete,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        keys?: VaultEnvKeyItem[];
      };
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to delete environment variable");
      }
      if (data.keys) setEnvKeys(data.keys);
      setNotice(`Removed ${keyToDelete} from ${envDisplayPath}.`);
      await fetchControlState();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove key");
    }
  }

  function submitEmergencyChat(event: React.FormEvent) {
    event.preventDefault();
    const text = emergencyInput.trim();
    if (!text || emergencyBusy) return;
    setEmergencyInput("");
    sendEmergencyMessage({ text });
  }

  const factoryVersion = versions.find((v) => v.isFactory) || versions[versions.length - 1];
  const activeProviderBadge = onboarding
    ? PROVIDER_INFO[onboarding.defaultProvider]?.badge ?? "Local"
    : "Local";
  const hasAnyProviderKey = Boolean(
    onboarding?.providers?.anthropic ||
      onboarding?.providers?.openai ||
      onboarding?.providers?.google,
  );

  return (
    <>
      {/* FLOATING PROTECTED CORE CONTROL CAPSULE */}
      <div className="fixed bottom-3.5 left-3.5 z-[9990] flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Protected Core Control Panel (⌘.) — Time Machine, Emergency Chat, AI Brain & Env Vault"
          className="group flex items-center gap-2 rounded-full border border-line bg-paper-raised/95 px-3 py-1.5 text-xs font-medium text-ink shadow-elevated backdrop-blur-md transition-all hover:border-ember/60"
        >
          <span
            className={`size-2 rounded-full ${
              hasAnyProviderKey
                ? "bg-ok shadow-[0_0_8px_var(--ok)]"
                : "bg-ember shadow-[0_0_8px_var(--ember)]"
            }`}
          />
          <span className="font-semibold tracking-tight">Core Control</span>
          <span className="rounded-full bg-recess px-2 py-0.5 font-mono text-2xs text-muted">
            Ignis OSS · {activeProviderBadge}
          </span>
          <kbd className="hidden rounded bg-recess px-1.5 py-0.5 font-mono text-2xs text-muted sm:inline">
            ⌘.
          </kbd>
        </button>
      </div>

      {/* MODAL DRAWER */}
      {open ? (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Ignis OSS Protected Core Control Panel"
            className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-line bg-paper-raised text-ink shadow-elevated"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <div className="flex items-center gap-3">
                <CozyAvatar size={28} />
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold tracking-tight">
                      Protected Core Control
                    </h2>
                    <span className="rounded-full border border-ember/40 bg-ember/10 px-2 py-0.5 font-mono text-2xs font-semibold text-ember">
                      Ignis OSS · MIT
                    </span>
                  </div>
                  <p className="text-xs text-muted">
                    Immutable recovery shell · Always reachable via <kbd className="font-mono">⌘.</kbd> even if workspace UI breaks
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full border border-line bg-paper px-3 py-1 text-xs font-medium text-muted transition-colors hover:text-ink"
              >
                Close (Esc)
              </button>
            </div>

            {/* Navigation Tabs */}
            <div className="flex flex-wrap gap-1.5 border-b border-line bg-recess/40 px-6 py-2.5">
              {(
                [
                  { id: "rollback", label: "Time Machine" },
                  { id: "emergency", label: "Emergency Chat" },
                  { id: "keys", label: "AI Brain" },
                  { id: "env", label: `Env Vault (${envKeys.length})` },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setTab(item.id);
                    setError(null);
                    setNotice(null);
                  }}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                    tab === item.id
                      ? "bg-ember text-white shadow-2xs"
                      : "text-muted hover:bg-paper hover:text-ink"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {/* Notice / Error Banners */}
            {notice ? (
              <div className="mx-6 mt-4 rounded-2xl border border-ok/40 bg-ok/10 px-4 py-2.5 text-xs font-medium text-ok">
                {notice}
              </div>
            ) : null}
            {error ? (
              <div className="mx-6 mt-4 rounded-2xl border border-bad/40 bg-bad/10 px-4 py-2.5 text-xs font-medium text-bad">
                {error}
              </div>
            ) : null}

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* TAB 1: TIME MACHINE */}
              {tab === "rollback" ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-paper p-4">
                    <div>
                      <h3 className="text-sm font-semibold text-ink">
                        Git Worktree Time Machine
                      </h3>
                      <p className="mt-0.5 text-xs text-muted">
                        Every UI self-modification landed via <code className="font-mono">./bin/wt land</code> creates a Git checkpoint. Roll back anytime while preserving Protected Core.
                      </p>
                    </div>
                    {factoryVersion && !factoryVersion.isCurrent ? (
                      <button
                        type="button"
                        disabled={Boolean(rollingBackSha)}
                        onClick={() => handleRollback(factoryVersion.sha, true)}
                        className="rounded-full border border-ember/50 bg-ember/10 px-3.5 py-1.5 text-xs font-semibold text-ember transition-colors hover:bg-ember hover:text-white disabled:opacity-50"
                      >
                        {rollingBackSha === factoryVersion.sha
                          ? "Restoring…"
                          : "Reset to Factory Default"}
                      </button>
                    ) : null}
                  </div>

                  {loadingVersions && versions.length === 0 ? (
                    <div className="py-8 text-center text-xs text-muted">
                      Loading Git version history…
                    </div>
                  ) : versions.length === 0 ? (
                    <div className="rounded-2xl border border-line bg-paper p-6 text-center text-xs text-muted">
                      No Git commits found yet. Run <code className="font-mono">git init</code> and create an initial commit to enable Time Machine checkpoints.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {versions.map((ver) => (
                        <div
                          key={ver.sha}
                          className={`flex items-center justify-between gap-3 rounded-2xl border p-3.5 transition-colors ${
                            ver.isCurrent
                              ? "border-ember/50 bg-paper"
                              : "border-line bg-paper/60 hover:border-line"
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded bg-recess px-2 py-0.5 font-mono text-2xs font-semibold text-ink">
                                {ver.shortSha}
                              </span>
                              {ver.isCurrent ? (
                                <span className="rounded-full bg-ok/15 px-2 py-0.5 font-mono text-2xs font-semibold text-ok">
                                  HEAD · Active
                                </span>
                              ) : null}
                              {ver.isFactory ? (
                                <span className="rounded-full bg-ember/15 px-2 py-0.5 font-mono text-2xs font-semibold text-ember">
                                  Initial / Factory
                                </span>
                              ) : null}
                              <span className="text-2xs text-muted">
                                {ver.relativeTime}
                              </span>
                            </div>
                            <p className="mt-1 truncate text-xs font-medium text-ink">
                              {ver.message}
                            </p>
                          </div>
                          {!ver.isCurrent ? (
                            <button
                              type="button"
                              disabled={Boolean(rollingBackSha)}
                              onClick={() => handleRollback(ver.sha, ver.isFactory)}
                              className="shrink-0 rounded-full border border-line bg-paper-raised px-3 py-1 text-xs font-semibold text-ink transition-colors hover:border-ember hover:text-ember disabled:opacity-50"
                            >
                              {rollingBackSha === ver.sha ? "Restoring…" : "Restore"}
                            </button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}

              {/* TAB 2: EMERGENCY RECOVERY CHAT */}
              {tab === "emergency" ? (
                <div className="flex h-[26rem] flex-col rounded-2xl border border-line bg-paper">
                  <div className="border-b border-line px-4 py-3">
                    <h3 className="text-xs font-semibold text-ink">
                      Indestructible Recovery Chat
                    </h3>
                    <p className="text-2xs text-muted">
                      Wired directly to <code className="font-mono">/api/chat</code> inside Protected Core. If an edit in <code className="font-mono">app/components/workspace.tsx</code> breaks the screen, ask Ignis here to fix or revert it.
                    </p>
                  </div>

                  <div className="flex-1 space-y-3 overflow-y-auto p-4">
                    {emergencyMessages.length === 0 ? (
                      <div className="py-10 text-center text-xs text-muted">
                        Ask Ignis to inspect <code className="font-mono">git status</code>, fix a broken component, or run <code className="font-mono">./bin/smoke</code>.
                      </div>
                    ) : (
                      emergencyMessages.map((m) => {
                        const text = m.parts
                          .filter(
                            (p): p is { type: "text"; text: string } =>
                              p.type === "text",
                          )
                          .map((p) => p.text)
                          .join("");
                        return (
                          <div
                            key={m.id}
                            className={`rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                              m.role === "user"
                                ? "ml-auto max-w-[80%] bg-ember text-white"
                                : "mr-auto max-w-[90%] border border-line bg-paper-raised text-ink"
                            }`}
                          >
                            {text || (m.role === "assistant" ? "Running tools…" : "")}
                          </div>
                        );
                      })
                    )}
                  </div>

                  <form
                    onSubmit={submitEmergencyChat}
                    className="flex items-center gap-2 border-t border-line p-3"
                  >
                    <input
                      type="text"
                      value={emergencyInput}
                      onChange={(e) => setEmergencyInput(e.target.value)}
                      placeholder="Ask Emergency Recovery Agent to fix the workspace…"
                      className="flex-1 rounded-full border border-line bg-paper-raised px-4 py-2 text-xs text-ink outline-none focus:border-ember"
                    />
                    <button
                      type="submit"
                      disabled={emergencyBusy || !emergencyInput.trim()}
                      className="flex size-8 items-center justify-center rounded-full bg-ember text-white disabled:opacity-40"
                    >
                      <ArrowUpIcon />
                    </button>
                  </form>
                </div>
              ) : null}

              {/* TAB 3: AI BRAIN (PROVIDER, API KEY, MODEL ID) */}
              {tab === "keys" ? (
                <form onSubmit={handleSaveBrain} className="space-y-4">
                  <div className="rounded-2xl border border-line bg-paper p-4">
                    <h3 className="text-sm font-semibold text-ink">
                      AI Brain & Model Configuration
                    </h3>
                    <p className="mt-0.5 text-xs text-muted">
                      Select your default provider, paste an API key (saved locally to <code className="font-mono">data/.env</code> with <code className="font-mono">0600</code> permissions, or read from root <code className="font-mono">.env</code>), and customize the model ID.
                    </p>

                    {/* Provider Selector */}
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      {(["anthropic", "openai", "google"] as const).map((prov) => {
                        const info = PROVIDER_INFO[prov];
                        const configured = onboarding?.providers?.[prov];
                        const selected = activeProvider === prov;
                        return (
                          <button
                            key={prov}
                            type="button"
                            onClick={() => {
                              setActiveProvider(prov);
                              setDefaultModelInput(
                                onboarding?.defaultProvider === prov && onboarding?.defaultModel
                                  ? onboarding.defaultModel
                                  : info.defaultModel,
                              );
                            }}
                            className={`flex flex-col items-start rounded-2xl border p-3 text-left transition-all ${
                              selected
                                ? "border-ember bg-ember/10"
                                : "border-line bg-paper-raised hover:border-ember/40"
                            }`}
                          >
                            <div className="flex w-full items-center justify-between">
                              <span className="text-xs font-semibold text-ink">
                                {info.badge}
                              </span>
                              <span
                                className={`rounded-full px-1.5 py-0.5 font-mono text-2xs ${
                                  configured
                                    ? "bg-ok/15 text-ok"
                                    : "bg-recess text-muted"
                                }`}
                              >
                                {configured ? "Ready" : "No Key"}
                              </span>
                            </div>
                            <span className="mt-1 font-mono text-2xs text-muted">
                              {info.defaultModel}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* API Key Input */}
                    <div className="mt-4">
                      <label className="block text-xs font-medium text-ink">
                        {PROVIDER_INFO[activeProvider].badge} API Key{" "}
                        {onboarding?.providers?.[activeProvider] ? (
                          <span className="font-normal text-ok">
                            (Configured — leave blank to keep existing key)
                          </span>
                        ) : null}
                      </label>
                      <input
                        type="password"
                        value={apiKeyInput}
                        onChange={(e) => setApiKeyInput(e.target.value)}
                        placeholder={PROVIDER_INFO[activeProvider].placeholder}
                        className="mt-1.5 w-full rounded-xl border border-line bg-paper-raised px-3.5 py-2 font-mono text-xs text-ink outline-none focus:border-ember"
                      />
                    </div>

                    {/* Model ID Override */}
                    <div className="mt-4">
                      <label className="block text-xs font-medium text-ink">
                        Default Model ID
                      </label>
                      <input
                        type="text"
                        value={defaultModelInput}
                        onChange={(e) => setDefaultModelInput(e.target.value)}
                        placeholder={PROVIDER_INFO[activeProvider].defaultModel}
                        className="mt-1.5 w-full rounded-xl border border-line bg-paper-raised px-3.5 py-2 font-mono text-xs text-ink outline-none focus:border-ember"
                      />
                      <p className="mt-1 text-2xs text-muted">
                        Override with any model ID supported by your provider key (e.g.{" "}
                        <code className="font-mono">claude-sonnet-4-5</code>,{" "}
                        <code className="font-mono">gpt-4.1</code>,{" "}
                        <code className="font-mono">gemini-2.5-pro</code>).
                      </p>
                    </div>

                    <div className="mt-5 flex justify-end">
                      <button
                        type="submit"
                        disabled={savingKey}
                        className="rounded-full bg-ember px-5 py-2 text-xs font-semibold text-white shadow-2xs transition-opacity hover:opacity-95 disabled:opacity-50"
                      >
                        {savingKey ? "Saving…" : "Save AI Brain Settings"}
                      </button>
                    </div>
                  </div>
                </form>
              ) : null}

              {/* TAB 4: ENV VAULT */}
              {tab === "env" ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-line bg-paper p-4">
                    <h3 className="text-sm font-semibold text-ink">
                      Local Environment Vault (<code className="font-mono">{envDisplayPath}</code>)
                    </h3>
                    <p className="mt-0.5 text-xs text-muted">
                      Secrets stored here and in root <code className="font-mono">.env</code> are automatically injected into <code className="font-mono">runCommand</code> shell executions and redacted from command outputs.
                    </p>

                    <form onSubmit={handleUpsertEnv} className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
                      <input
                        type="text"
                        value={envKeyInput}
                        onChange={(e) => setEnvKeyInput(e.target.value)}
                        placeholder="ENV_KEY_NAME"
                        className="rounded-xl border border-line bg-paper-raised px-3 py-2 font-mono text-xs text-ink outline-none focus:border-ember"
                      />
                      <input
                        type="password"
                        value={envValueInput}
                        onChange={(e) => setEnvValueInput(e.target.value)}
                        placeholder="Secret value…"
                        className="rounded-xl border border-line bg-paper-raised px-3 py-2 font-mono text-xs text-ink outline-none focus:border-ember"
                      />
                      <button
                        type="submit"
                        disabled={savingEnv || !envKeyInput.trim()}
                        className="rounded-xl bg-ember px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-95 disabled:opacity-40"
                      >
                        {savingEnv ? "Saving…" : "Add / Update"}
                      </button>
                    </form>
                  </div>

                  {/* Masked Keys List */}
                  <div className="space-y-2">
                    {envKeys.length === 0 ? (
                      <div className="rounded-2xl border border-line bg-paper p-6 text-center text-xs text-muted">
                        No environment variables configured yet in <code className="font-mono">.env</code> or <code className="font-mono">data/.env</code>.
                      </div>
                    ) : (
                      envKeys.map((item) => (
                        <div
                          key={item.key}
                          className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-paper px-4 py-2.5"
                        >
                          <div className="min-w-0">
                            <div className="font-mono text-xs font-semibold text-ink">
                              {item.key}
                            </div>
                            <div className="font-mono text-2xs text-muted">
                              {item.maskedValue} ({item.length} chars)
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteEnv(item.key)}
                            className="rounded-full border border-line bg-paper-raised px-3 py-1 text-2xs font-medium text-muted transition-colors hover:border-bad hover:text-bad"
                          >
                            Remove
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
