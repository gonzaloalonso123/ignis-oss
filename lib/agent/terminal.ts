import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { redactVaultSecrets } from "./vault-env.ts";

const MAX_OUTPUT = 100_000;
const DEFAULT_TIMEOUT_MS = 120_000;
const LONG_AGENT_TIMEOUT_MS = 600_000;

export type CommandResult = {
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  truncated: boolean;
  error?: string;
};

function clip(current: string, chunk: Buffer, truncated: { value: boolean }): string {
  if (current.length >= MAX_OUTPUT) {
    truncated.value = true;
    return current;
  }
  const next = current + chunk.toString("utf8");
  if (next.length <= MAX_OUTPUT) return next;
  truncated.value = true;
  return next.slice(0, MAX_OUTPUT);
}

function resolveShell(): string {
  const candidates = [process.env.SHELL, "/bin/zsh", "/usr/bin/zsh", "/bin/bash", "/bin/sh"];
  for (const c of candidates) {
    if (c && existsSync(c)) return c;
  }
  return "/bin/sh";
}

export function buildShellEnv(cwd = process.cwd(), extraEnv?: Record<string, string>): NodeJS.ProcessEnv {
  const home = os.homedir();
  const extraPaths = [
    path.join(home, ".local", "bin"),
    path.join(home, "Library", "pnpm", "bin"),
    path.join(home, "Library", "pnpm"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
  ];
  const currentPath = process.env.PATH || "/usr/bin:/bin:/usr/sbin:/sbin";
  return {
    ...process.env,
    HOME: process.env.HOME || home,
    PWD: cwd,
    SHELL: resolveShell(),
    PATH: `${extraPaths.join(":")}:${currentPath}`,
    ...extraEnv,
  };
}

function signalProcessGroup(pid: number | undefined, signal: NodeJS.Signals = "SIGKILL") {
  if (!pid) return;
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      // already exited
    }
  }
}

export async function runCommand(
  command: string,
  options?: {
    cwd?: string;
    timeoutMs?: number;
    env?: Record<string, string>;
    vaultEnv?: Record<string, string>;
    abortSignal?: AbortSignal;
  },
): Promise<CommandResult> {
  if (options?.abortSignal?.aborted) {
    return {
      ok: false,
      exitCode: null,
      stdout: "",
      stderr: "",
      timedOut: false,
      truncated: false,
      error: "Command aborted before execution.",
    };
  }

  const cwd = options?.cwd?.trim() ? options.cwd : process.cwd();
  const isLongAgentCommand = /\.\/bin\/(?:subagent|chat)\b/.test(command);
  const effectiveTimeoutMs =
    options?.timeoutMs && options.timeoutMs > 0
      ? options.timeoutMs
      : isLongAgentCommand
        ? LONG_AGENT_TIMEOUT_MS
        : DEFAULT_TIMEOUT_MS;
  const combinedExtraEnv = {
    ...(options?.vaultEnv ?? {}),
    ...(options?.env ?? {}),
  };
  const env = buildShellEnv(cwd, combinedExtraEnv);

  return new Promise((resolve) => {
    const child = spawn(command, {
      shell: env.SHELL || resolveShell(),
      cwd,
      env,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    const truncated = { value: false };
    let timedOut = false;
    let aborted = false;

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout = clip(stdout, chunk, truncated);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = clip(stderr, chunk, truncated);
    });

    const onAbort = () => {
      aborted = true;
      signalProcessGroup(child.pid, "SIGTERM");
      setTimeout(() => {
        signalProcessGroup(child.pid, "SIGKILL");
        finish(null, "Command aborted.");
      }, 250);
    };

    const finish = (exitCode: number | null, error?: string) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      options?.abortSignal?.removeEventListener("abort", onAbort);
      child.stdout?.destroy();
      child.stderr?.destroy();
      const safeStdout = redactVaultSecrets(stdout, options?.vaultEnv);
      const safeStderr = redactVaultSecrets(stderr, options?.vaultEnv);
      resolve({
        ok: exitCode === 0 && !timedOut && !aborted && !error,
        exitCode,
        stdout: safeStdout,
        stderr: safeStderr,
        timedOut,
        truncated: truncated.value,
        ...(timedOut ? { error: `Command timed out after ${effectiveTimeoutMs}ms.` } : {}),
        ...(aborted && !error ? { error: "Command aborted." } : {}),
        ...(error ? { error } : {}),
      });
    };

    options?.abortSignal?.addEventListener("abort", onAbort, { once: true });

    const timer = setTimeout(() => {
      timedOut = true;
      signalProcessGroup(child.pid, "SIGTERM");
      setTimeout(() => {
        signalProcessGroup(child.pid, "SIGKILL");
        finish(null);
      }, 350);
    }, effectiveTimeoutMs);

    child.on("error", (error) => finish(null, error.message));
    child.on("exit", (code) => {
      // Allow up to 150ms for any buffered stdout/stderr chunks to flush, then resolve
      // even if a backgrounded sub-process inherited the pipe FDs.
      setTimeout(() => finish(code), 150);
    });
    child.on("close", (code) => finish(code));
  });
}
