import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { resolveCombinedVaultEnv, resolveVaultEnvPath } from "./vault-env.ts";
import {
  getConversation,
  getConversationTreeLineage,
  resolveMainRepoRoot,
  sanitizeSlug,
  type TreeNodeKind,
} from "../db.ts";

export type InstructionOptions = {
  parentId?: string | null;
  slug?: string | null;
  depth?: number;
  taskPrompt?: string | null;
  cwd?: string | null;
  ephemeral?: boolean;
};

export type TreeBreadcrumbItem = {
  id: string;
  depth: number;
  label: string;
  title: string;
};

export type TreeChildNodeItem = {
  id: string;
  depth: number;
  label: string;
  title: string;
  worktree?: string | null;
  ephemeral?: boolean;
  running: boolean;
  updated_at: string;
};

export type NodeTreeContext = {
  conversationId: string | null;
  depth: number;
  nodeKind: TreeNodeKind;
  treePath: string | null;
  contextFile: string;
  contextFiles: string[];
  workspaceDir: string;
  taskPrompt: string | null;
  ancestorChain: TreeBreadcrumbItem[];
  children: TreeChildNodeItem[];
};

function readTextIfPresent(filePath: string): string {
  try {
    if (!existsSync(filePath)) return "";
    return readFileSync(filePath, "utf8")
      .trim()
      .replace(/^## /gm, "### ")
      .replace(/^# /gm, "### ");
  } catch {
    return "";
  }
}

export function defaultNodeContextMarkdown(
  treePath: string,
  objective: string,
): string {
  const contextFile = `memory/tree/${treePath}/context.md`;
  return `# Node Context (/${treePath})

- **Context File**: \`${contextFile}\` (shared across threads in \`/${treePath}\`; keep updated with verified decisions and architecture).

## Mission & Distilled State
${objective.trim()}
`;
}

export function ensureNodeTreeFolders(
  treePath: string | null | undefined,
  objective: string,
  repoRoot = resolveMainRepoRoot(),
): void {
  if (!treePath) return;
  try {
    const memDir = path.join(repoRoot, "memory", "tree", treePath);
    mkdirSync(memDir, { recursive: true });
    const ctxFile = path.join(memDir, "context.md");
    if (!existsSync(ctxFile)) {
      appendFileSync(
        ctxFile,
        defaultNodeContextMarkdown(treePath, objective),
        "utf8",
      );
    }
  } catch {
    // ignore folder init errors
  }
}

export function ensurePersistentNodeWorkspace(
  input: {
    conversationId?: string | null;
    parentId?: string | null;
    slug?: string | null;
    name?: string | null;
    description: string;
  },
  repoRoot = resolveMainRepoRoot(),
): void {
  const cleanSlug = sanitizeSlug(input.slug);
  if (!input.parentId && !cleanSlug) return;
  const lineage = getConversationTreeLineage(
    input.conversationId ?? null,
    input.parentId ?? null,
    cleanSlug || null,
  );
  ensureNodeTreeFolders(lineage.treePath || cleanSlug, input.description.trim(), repoRoot);
}

function buildContextFileList(treePath: string | null): string[] {
  if (!treePath) return ["memory/tree/context.md"];
  const parts = treePath.split("/").filter(Boolean);
  return parts.map((_, idx) => `memory/tree/${parts.slice(0, idx + 1).join("/")}/context.md`);
}

export function resolveNodeTreeContext(
  conversationId?: string | null,
  options?: InstructionOptions,
): NodeTreeContext {
  const root = resolveMainRepoRoot();
  try {
    const lineage = getConversationTreeLineage(
      conversationId,
      options?.parentId,
      options?.slug,
    );
    const conv = conversationId ? getConversation(conversationId) : null;
    const firstMsg = conv?.messages?.[0];
    const firstText =
      firstMsg?.parts
        ?.map((p) => (p.type === "text" ? p.text : ""))
        .join("\n")
        .trim() ||
      conv?.title ||
      options?.taskPrompt ||
      "";

    const effectiveDepth =
      typeof options?.depth === "number" ? options.depth : lineage.depth;
    const effectivePath =
      effectiveDepth === 0 ? null : lineage.treePath || options?.slug || "branch";
    const isEphemeral = Boolean(options?.ephemeral ?? conv?.ephemeral);

    const sharedDomainPath =
      isEphemeral && effectivePath
        ? effectivePath.includes("/")
          ? effectivePath.split("/").slice(0, -1).join("/")
          : null
        : effectivePath;

    const contextFiles = buildContextFileList(sharedDomainPath);
    const contextFile = contextFiles.at(-1) || "memory/tree/context.md";

    const firstAncIsScoped = Boolean(
      lineage.ancestorChain[0]?.slug && !lineage.ancestorChain[0]?.parent_id,
    );
    const ancestorChain: TreeBreadcrumbItem[] = lineage.ancestorChain.map((anc, idx) => {
      const ancDepth = idx + (firstAncIsScoped ? 1 : 0);
      const ancLabel = ancDepth === 0 ? "root" : anc.slug || anc.id.slice(0, 8);
      return {
        id: anc.id,
        depth: ancDepth,
        label: ancLabel,
        title: anc.title?.split("\n")[0]?.trim() || "Untitled",
      };
    });

    const children: TreeChildNodeItem[] = lineage.children.map((ch) => ({
      id: ch.id,
      depth: effectiveDepth + 1,
      label: ch.slug || ch.id.slice(0, 8),
      title: ch.title?.split("\n")[0]?.trim() || "Untitled",
      worktree: ch.worktree,
      ephemeral: ch.ephemeral,
      running: Boolean(ch.running),
      updated_at: ch.updated_at,
    }));

    const activeOrPersistentChildren = children.filter((c) => !c.ephemeral || c.running);
    const nodeKind: TreeNodeKind =
      effectiveDepth === 0 ? "root" : activeOrPersistentChildren.length > 0 ? "branch" : "leaf";

    return {
      conversationId: conversationId ?? null,
      depth: effectiveDepth,
      nodeKind,
      treePath: effectivePath,
      contextFile,
      contextFiles,
      workspaceDir: root,
      taskPrompt: options?.taskPrompt?.trim() || (effectivePath ? firstText || null : null),
      ancestorChain,
      children,
    };
  } catch {
    const fallbackDepth = options?.depth ?? (options?.parentId || options?.slug ? 1 : 0);
    const fallbackPath = fallbackDepth === 0 ? null : options?.slug || "branch";
    const contextFiles = buildContextFileList(fallbackPath);
    return {
      conversationId: conversationId ?? null,
      depth: fallbackDepth,
      nodeKind: fallbackDepth === 0 ? "root" : "leaf",
      treePath: fallbackPath,
      contextFile: contextFiles.at(-1) || "memory/tree/context.md",
      contextFiles,
      workspaceDir: root,
      taskPrompt: options?.taskPrompt?.trim() || null,
      ancestorChain: [],
      children: [],
    };
  }
}

export function buildInstructions(
  currentConversationId?: string | null,
  options?: InstructionOptions,
): string {
  const root = resolveMainRepoRoot();
  const treeCtx = resolveNodeTreeContext(currentConversationId, options);
  const { depth, nodeKind, treePath, contextFile, contextFiles, taskPrompt, ancestorChain, children } =
    treeCtx;

  const hasSubagents = existsSync(path.join(root, "lib", "agent", "subagent.ts"));
  const hasScheduler = existsSync(path.join(root, "lib", "agent", "scheduler.ts"));

  const sections: string[] = [];

  const substrateLines = [
    `- **Dedicated Machine Agency (\`runCommand\`)**: You are **Ignis AI**, running inside the user's dedicated, isolated computer (\`${root}\`) with full shell, filesystem, and network access via \`runCommand\`. Never guess when you can verify directly by running a command.`,
    `- **Self-Building Interface (\`./bin/wt\`)**: You can evolve your own Next.js 16 + React 19 + Tailwind v4 interface whenever the user asks. Edit \`app/components/workspace.tsx\` (or add new components) inside a git worktree via \`./bin/wt new <name>\`, commit, and run \`./bin/wt land <name>\` to hot-reload the screen and save a Time Machine checkpoint.`,
  ];
  if (hasSubagents) {
    substrateLines.push(
      `- **Subagent Delegation (\`subagent\` tool)**: Spawn isolated child subagents directly via the \`subagent\` tool (\`action: "run" | "parallel" | "tournament" | "inspect" | "list" | "prune"\`) so multiple tasks run concurrently with live UI streaming.`,
    );
  }
  const cliList = ["`./bin/wt` (safe UI self-modification)", "`./bin/browse` (headless Chrome)"];
  if (hasSubagents) cliList.push("`./bin/subagent` (child agent delegation)");
  if (hasScheduler) cliList.push("`./bin/schedule` (24/7 recurring schedules)");
  substrateLines.push(`- **CLI Primitives (\`./bin/*\` via \`runCommand\`)**: ${cliList.join(", ")}.`);

  const vaultEnvKeys = Object.keys(resolveCombinedVaultEnv(treePath, root)).sort();
  if (vaultEnvKeys.length > 0) {
    const { displayPath } = resolveVaultEnvPath(treePath, root);
    substrateLines.push(
      `- **Environment Keys (\`${displayPath}\`, auto-injected into \`runCommand\` & stdout-redacted)**: ${vaultEnvKeys.map((k) => `\`$${k}\``).join(", ")}.`,
    );
  }
  sections.push(`## Runtime & Hardware Substrate\n${substrateLines.join("\n")}`);

  for (const relPath of contextFiles) {
    const content =
      readTextIfPresent(path.join(root, relPath)) ||
      (relPath === contextFile && treePath
        ? defaultNodeContextMarkdown(treePath, taskPrompt || "Execute assigned node objective.")
            .replace(/^## /gm, "### ")
            .replace(/^# /gm, "### ")
        : "");
    if (content) {
      sections.push(`## Node Context (${relPath})\n${content}`);
    }
  }

  const philosophy = readTextIfPresent(path.join(root, "memory", "philosophy.md"));
  if (philosophy) {
    sections.push(`## Foundational Philosophy (memory/philosophy.md)\n${philosophy}`);
  }

  const displayPath = treePath ? `/${treePath}` : "/";
  const lineageLines: string[] = [
    `- **Position**: \`depth ${depth}\` (\`${nodeKind}\`) · path \`${displayPath}\`${options?.cwd ? ` · cwd \`${options.cwd}\`` : ""}`,
  ];
  for (const anc of ancestorChain) {
    lineageLines.push(`- **Ancestor [d${anc.depth} · ${anc.label}]** (${anc.id}): ${anc.title}`);
  }
  if (taskPrompt) {
    lineageLines.push(`- **Immediate Objective**: ${taskPrompt.split("\n")[0]}`);
  }
  sections.push(`## Tree Lineage (d${depth} · ${displayPath})\n${lineageLines.join("\n")}`);

  const promptChildren = children.filter((c) => !c.ephemeral || c.running);
  if (promptChildren.length > 0) {
    const childLines = promptChildren.map(
      (c) =>
        `- [${c.id}] (d${c.depth} · ${c.label}${c.ephemeral ? " · worker" : " · node"}) ${c.title} — ${c.running ? "RUNNING" : `updated ${c.updated_at}`}`,
    );
    sections.push(`## Child Nodes (${childLines.length})\n${childLines.join("\n")}`);
  }

  return sections.join("\n\n");
}
