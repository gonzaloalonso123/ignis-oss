import { tool } from "ai";
import { z } from "zod";
import { resolveNodeTreeContext } from "./instructions.ts";
import { runCommand } from "./terminal.ts";
import { resolveCombinedVaultEnv } from "./vault-env.ts";

export function createAgentTools(defaultCwd?: string, conversationId?: string | null) {
  return {
    runCommand: tool({
      description:
        "Run a shell command on this machine as the server user. The shell is not sandboxed: use ordinary unix tools and ./bin/* CLI primitives to read, edit, install, build, and inspect anything you need. Always provide a concise human-readable `title` describing what the command does.",
      inputSchema: z.object({
        title: z
          .string()
          .optional()
          .describe(
            "Concise human-readable name for this command (e.g. 'Inspect git status', 'Verify worktree', 'Read workspace.tsx').",
          ),
        command: z.string().describe("Shell command to run."),
        cwd: z
          .string()
          .optional()
          .describe("Working directory. Defaults to the dev server's current directory. Any path is allowed."),
        timeoutMs: z
          .number()
          .optional()
          .describe("Optional kill timeout in milliseconds. Omit it to wait until the command exits."),
      }),
      execute: async ({ command, cwd, timeoutMs }, { abortSignal }) => {
        const treeCtx = conversationId ? resolveNodeTreeContext(conversationId) : null;
        const vaultEnv = resolveCombinedVaultEnv(treeCtx?.treePath);
        return runCommand(command, {
          cwd: cwd?.trim() ? cwd : defaultCwd,
          timeoutMs,
          abortSignal,
          vaultEnv,
          env: conversationId ? { IGNIS_CONVERSATION_ID: conversationId } : undefined,
        });
      },
    }),
  };
}
