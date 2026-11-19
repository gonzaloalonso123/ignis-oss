import { getToolName, isToolUIPart, type UIMessage } from "ai";

export type SpawnedSubagentInfo = {
  conversationId: string;
  label: string;
  worktree?: string | null;
  strategy?: string;
  score?: number;
  ok?: boolean;
};

export type ToolCall = {
  id: string;
  name: string;
  state: string;
  label: string;
  command: string;
  cwd?: string;
  timeoutMs?: number;
  stdout: string;
  stderr: string;
  error?: string;
  exitCode: number | null;
  timedOut: boolean;
  truncated: boolean;
  running: boolean;
  failed: boolean;
  spawnedSubagents: SpawnedSubagentInfo[];
};

export type ReasoningStep = {
  id: string;
  kind: "thought" | "action" | "response";
  title: string;
  detail?: string;
  running?: boolean;
  failed?: boolean;
};

export type ConversationUsage = {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  steps: number;
  costUsd: number;
  formattedTokens: string;
  formattedCost: string;
};

const READ_BINS = new Set(["cat", "head", "tail", "less", "more", "bat", "nl", "sed"]);

function shortPath(raw: string): string {
  const clean = raw.replace(/^['"]|['"]$/g, "").trim();
  const parts = clean.split("/").filter(Boolean);
  if (parts.length <= 2) return clean;
  return parts.slice(-2).join("/");
}

export function describeCommand(command: string, explicitTitle?: string): string {
  if (explicitTitle && explicitTitle.trim()) {
    return explicitTitle.trim();
  }
  const text = command.trim();
  if (!text) return "Running command…";

  // Worktree lifecycle commands
  const wtLand = text.match(/\.\/bin\/wt\s+(?:land|merge)\s+([a-zA-Z0-9_-]+)/);
  if (wtLand) return `Verify & land worktree ${wtLand[1]}`;

  const wtNew = text.match(/\.\/bin\/wt\s+(?:new|create)\s+([a-zA-Z0-9_-]+)/);
  if (wtNew) return `Create worktree ${wtNew[1]}`;

  const wtVerify = text.match(/\.\/bin\/wt\s+(?:verify|check)\s+([a-zA-Z0-9_-]+)/);
  if (wtVerify) return `Verify worktree ${wtVerify[1]}`;

  if (/\.\/bin\/wt\s+(?:list|ls)\b/.test(text)) return "List git worktrees";

  // Ignis CLI primitives (schedule, browse, subagent, smoke)
  if (/\.\/bin\/schedule\s+(?:add|create)\b/.test(text)) return "Schedule autonomous task / watchdog";
  if (/\.\/bin\/schedule\s+(?:run|trigger|tick)\b/.test(text)) return "Trigger scheduled task";
  if (/\.\/bin\/schedule\b/.test(text)) return "Inspect autonomous scheduler";
  if (/\.\/bin\/browse\s+(?:screenshot|shot)\b/.test(text)) return "Capture headless browser screenshot";
  if (/\.\/bin\/browse\s+eval\b/.test(text)) return "Evaluate JS in headless browser";
  if (/\.\/bin\/browse\b/.test(text)) return "Inspect live browser DOM & layout";
  if (/\.\/bin\/subagent\s+(?:tournament|tourney)\b/.test(text)) return "Run sub-agent tournament";
  if (/\.\/bin\/subagent\s+parallel\b/.test(text)) return "Run parallel sub-agents";
  if (/\.\/bin\/subagent\s+(?:inspect|logs|show)\b/.test(text)) return "Inspect sub-agent output";
  if (/\.\/bin\/subagent\s+(?:list|ls)\b/.test(text)) return "List sub-agent nodes";
  if (/\.\/bin\/subagent\s+(?:prune|remove|delete)\b/.test(text)) return "Prune sub-agent node";
  if (/\.\/bin\/subagent\b/.test(text)) return "Run sub-agent task";
  if (/\.\/bin\/smoke\b/.test(text)) return "Run smoke verification";

  // File writes via heredoc / redirection
  const writes = [...text.matchAll(/(?:cat\s+<<\s*['"]?\w+['"]?\s*>\s*|>\s*)([^\s;&|]+)/g)]
    .map((m) => m[1])
    .filter((target) => target && !target.startsWith("/dev/") && !target.startsWith("&"));
  if (writes.length > 0) {
    const names = [...new Set(writes.map(shortPath))];
    if (names.length === 1) return `Write ${names[0]}`;
    if (names.length === 2) return `Write ${names[0]} & ${names[1]}`;
    return `Write ${names[0]}, ${names[1]} (+${names.length - 2} more)`;
  }

  const appends = [...text.matchAll(/>>\s*([^\s;&|]+)/g)].map((m) => m[1]).filter(Boolean);
  if (appends.length > 0) {
    return `Update ${shortPath(appends[0])}`;
  }

  // GitHub & Git operations
  const ghCreate = text.match(/\bgh\s+repo\s+create\s+([^\s]+)/);
  if (ghCreate) return `Create GitHub repo ${ghCreate[1]}`;
  if (/\bgh\s+auth\b/.test(text)) return "Check GitHub authentication";
  if (/\bgh\s+repo\s+view\b/.test(text)) return "Check GitHub repository";

  const gitCommit = text.match(/\bgit\b[^\n]*?\bcommit\b[^\n]*?-m\s+["']([^"']+)["']/);
  if (gitCommit) {
    const msg = gitCommit[1].length > 44 ? `${gitCommit[1].slice(0, 42)}…` : gitCommit[1];
    return `Commit: ${msg}`;
  }
  if (/\bgit\s+push\b/.test(text)) return "Push commits to GitHub";
  if (/\bgit\s+show\b/.test(text)) return "Inspect git commit diff";
  if (/\bgit\s+diff\b/.test(text)) return "Inspect git diff";
  if (/\bgit\s+status\b/.test(text)) {
    if (/\btsc\b/.test(text)) return "Check git status & TypeScript types";
    return "Inspect git working tree status";
  }
  if (/\bgit\s+log\b/.test(text)) return "Inspect recent git commits";

  // Typecheck / Build
  if (/\bnext\s+typegen\b/.test(text) || /\btsc\b.*--noEmit/.test(text)) {
    return "Run TypeScript verification";
  }

  // SQLite & Node inspection
  if (/\bsqlite3\b/.test(text) || /DatabaseSync/.test(text)) {
    if (/writeFileSync/.test(text)) return "Update source file via Node";
    return "Query SQLite database";
  }
  if (/\bnode\s+-e\b/.test(text)) {
    if (/writeFileSync/.test(text)) return "Patch file with Node script";
    return "Run Node inspection script";
  }

  // HTTP / Network
  const curlMatch = text.match(/\bcurl\b(?:-[a-zA-Z]+\s+)*\s*(https?:\/\/[^\s"']+)/);
  if (curlMatch) {
    try {
      const u = new URL(curlMatch[1]);
      return `Request ${u.pathname || u.host}`;
    } catch {
      return "Fetch HTTP endpoint";
    }
  }

  // Search / Grep
  const grepMatch = text.match(/\b(?:grep|rg)\b(?:-[a-zA-Z0-9]+\s+|\s+\d+\s+)*["']?([^"'\s]+)["']?\s+([^\s|;&]+)/);
  if (grepMatch) {
    return `Search "${grepMatch[1]}" in ${shortPath(grepMatch[2])}`;
  }

  // File reads (cat / head / tail / sed)
  const firstSegment = text.split(/\s*(?:&&|;|\|)\s*/)[0] ?? text;
  const tokens = firstSegment.trim().split(/\s+/);
  const bin = tokens[0]?.split("/").pop()?.toLowerCase() ?? "";

  if (READ_BINS.has(bin)) {
    const fileArgs = tokens
      .slice(1)
      .filter((t) => !t.startsWith("-") && !/^\d/.test(t) && !t.startsWith("'") && !t.startsWith('"'))
      .map(shortPath);
    if (fileArgs.length === 1) return `Read ${fileArgs[0]}`;
    if (fileArgs.length === 2) return `Read ${fileArgs[0]} & ${fileArgs[1]}`;
    if (fileArgs.length > 2) return `Read ${fileArgs[0]}, ${fileArgs[1]} (+${fileArgs.length - 2})`;
    return "Read source files";
  }

  if (bin === "pwd" || bin === "ls" || bin === "find") {
    return "Explore workspace files & structure";
  }

  if (bin === "ps") {
    return "Inspect running processes";
  }

  const singleLine = text.replace(/\s+/g, " ");
  return singleLine.length > 56 ? `${singleLine.slice(0, 54)}…` : singleLine;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function stringField(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return typeof value === "string" ? value : "";
}

export function describeSubagentCall(input: Record<string, unknown> | null): string {
  const explicitTitle = stringField(input, "title").trim();
  if (explicitTitle) return explicitTitle;
  const action = stringField(input, "action") || "run";
  const labelSlug = (stringField(input, "label") || stringField(input, "target")).trim();
  if (action === "tournament") return "Run sub-agent tournament";
  if (action === "parallel") return "Run parallel sub-agents";
  if (action === "inspect") return labelSlug ? `Inspect sub-agent ${labelSlug}` : "Inspect sub-agent output";
  if (action === "list") return "List sub-agent nodes";
  if (action === "prune") return labelSlug ? `Prune sub-agent ${labelSlug}` : "Prune sub-agent node";
  return labelSlug ? `Spawn sub-agent (${labelSlug})` : "Spawn sub-agent";
}

function formatSubagentCommand(input: Record<string, unknown> | null): string {
  const action = stringField(input, "action") || "run";
  const labelSlug = (stringField(input, "label") || stringField(input, "target")).trim();
  const worktree = stringField(input, "worktree").trim();
  const promptText = stringField(input, "prompt").trim();
  if (action === "parallel" && Array.isArray(input?.tasks)) {
    const tasks = input.tasks as Array<Record<string, unknown>>;
    const labels = tasks.map((t, i) => (typeof t?.label === "string" && t.label.trim() ? t.label.trim() : `parallel-${i + 1}`));
    return `subagent parallel [${labels.join(", ")}]`;
  }
  const head = [
    `subagent ${action}`,
    labelSlug ? `--label ${labelSlug}` : "",
    worktree ? `--wt ${worktree}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return promptText ? `${head}\n${promptText}` : head;
}

export function isSubagentSpawnCall(call: { name?: string; command: string }): boolean {
  if (call.name === "subagent") {
    return !/^subagent\s+(?:inspect|list|prune)\b/.test(call.command);
  }
  return (
    /\.\/bin\/(?:subagent\s+(?:run|spawn|parallel|tournament|tourney)|chat\s+(?:spawn|start))\b/.test(
      call.command,
    ) && !/--help\b|-h\b/.test(call.command)
  );
}

export function extractSpawnedSubagents(
  command: string,
  stdout: string,
  toolName?: string,
  input?: Record<string, unknown> | null,
  output?: Record<string, unknown> | null,
): SpawnedSubagentInfo[] {
  const list: SpawnedSubagentInfo[] = [];
  const seen = new Set<string>();

  function addItem(raw: unknown) {
    const rec = asRecord(raw);
    if (!rec) return;
    if (Array.isArray(rec.results)) {
      for (const r of rec.results) addItem(r);
      return;
    }
    if (Array.isArray(rec.candidates)) {
      for (const c of rec.candidates) addItem(c);
      return;
    }
    const convId = typeof rec.conversationId === "string" ? rec.conversationId.trim() : "";
    if (!convId || seen.has(convId)) return;
    seen.add(convId);
    const label =
      typeof rec.label === "string" && rec.label.trim()
        ? rec.label.trim()
        : typeof rec.slug === "string" && rec.slug.trim()
          ? rec.slug.trim()
          : "subagent";
    const worktree = typeof rec.worktree === "string" && rec.worktree.trim() ? rec.worktree.trim() : null;
    const strategy = typeof rec.strategy === "string" ? rec.strategy.split(":")[0]?.trim() : undefined;
    const score = typeof rec.compositeScore === "number" ? rec.compositeScore : undefined;
    const ok = typeof rec.ok === "boolean" ? rec.ok : typeof rec.agentOk === "boolean" ? rec.agentOk : true;
    list.push({ conversationId: convId, label, worktree, strategy, score, ok });
  }

  if (toolName === "subagent") {
    const action = stringField(input ?? null, "action") || "run";
    if (action === "inspect" || action === "list" || action === "prune") {
      return [];
    }
    if (output) {
      addItem(output);
    }
    return list;
  }

  if (!isSubagentSpawnCall({ name: toolName, command })) {
    return [];
  }

  if (stdout.trim()) {
    try {
      const parsed = JSON.parse(stdout.trim()) as unknown;
      if (Array.isArray(parsed)) {
        for (const item of parsed) addItem(item);
      } else {
        addItem(parsed);
      }
    } catch {
      const matches = stdout.matchAll(
        /"conversationId"\s*:\s*"([a-zA-Z0-9_-]{8,})"[\s\S]{0,180}?"label"\s*:\s*"([^"]+)"/g,
      );
      for (const m of matches) {
        const cid = m[1];
        if (cid && !seen.has(cid)) {
          seen.add(cid);
          list.push({ conversationId: cid, label: m[2] || "subagent", ok: true });
        }
      }
    }
  }

  return list;
}

export function collectCalls(messages: UIMessage[]): ToolCall[] {
  const calls: ToolCall[] = [];
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (!isToolUIPart(part)) continue;
      const toolName = getToolName(part);
      const input = asRecord(part.input);
      const output = asRecord(part.state === "output-available" ? part.output : undefined);
      const streamingInput = part.state === "input-streaming";
      const preliminary = part.state === "output-available" && part.preliminary === true;
      const running =
        streamingInput ||
        part.state === "input-available" ||
        part.state === "approval-requested" ||
        preliminary;

      const isSubagentTool = toolName === "subagent";
      const command = isSubagentTool
        ? formatSubagentCommand(input)
        : stringField(input, "command");
      const title = stringField(input, "title");
      const label = isSubagentTool
        ? describeSubagentCall(input)
        : describeCommand(command, title);
      const stdout = isSubagentTool
        ? stringField(output, "text") ||
          stringField(output, "assistantText") ||
          (output ? JSON.stringify(output, null, 2) : "")
        : stringField(output, "stdout");
      const stderr = stringField(output, "stderr");
      const errorText = "errorText" in part && typeof part.errorText === "string" ? part.errorText : "";
      const outputError = stringField(output, "error");
      const exitCode =
        typeof output?.exitCode === "number"
          ? output.exitCode
          : isSubagentTool && output
            ? output.ok === false
              ? 1
              : 0
            : null;
      const failed =
        part.state === "output-error" ||
        part.state === "output-denied" ||
        output?.ok === false ||
        Boolean(errorText || outputError);
      calls.push({
        id: part.toolCallId,
        name: toolName,
        state: part.state,
        label,
        command,
        cwd: stringField(input, "cwd") || undefined,
        timeoutMs: typeof input?.timeoutMs === "number" ? input.timeoutMs : undefined,
        stdout,
        stderr,
        error: errorText || outputError || undefined,
        exitCode,
        timedOut: output?.timedOut === true,
        truncated: output?.truncated === true,
        running,
        failed,
        spawnedSubagents: extractSpawnedSubagents(command, stdout, toolName, input, output),
      });
    }
  }
  return calls;
}

export function collectLiveReasoning(
  messages: UIMessage[],
  calls: ToolCall[],
  busy: boolean,
): {
  headline: string;
  activeThought: string | null;
  steps: ReasoningStep[];
} {
  const steps: ReasoningStep[] = [];
  let activeThought = "";

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  if (lastAssistant) {
    lastAssistant.parts.forEach((part, idx) => {
      const anyPart = part as Record<string, unknown>;
      if (anyPart.type === "reasoning" && typeof anyPart.text === "string" && anyPart.text.trim()) {
        const text = anyPart.text.trim();
        activeThought = text;
        const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
        steps.push({
          id: `reason-${lastAssistant.id}-${idx}`,
          kind: "thought",
          title: lines[0]?.slice(0, 90) || "Reasoning…",
          detail: text.slice(-420),
          running: busy && idx === lastAssistant.parts.length - 1,
        });
      } else if (isToolUIPart(part)) {
        const call = calls.find((c) => c.id === part.toolCallId);
        if (call) {
          steps.push({
            id: `call-${call.id}`,
            kind: "action",
            title: call.label || call.command || "Executing command…",
            detail: call.command ? `$ ${call.command}` : undefined,
            running: call.running,
            failed: call.failed,
          });
        }
      } else if (part.type === "text" && part.text.trim()) {
        const snippet = part.text.trim().replace(/\s+/g, " ");
        steps.push({
          id: `text-${lastAssistant.id}-${idx}`,
          kind: "response",
          title:
            busy && idx === lastAssistant.parts.length - 1
              ? "Synthesizing response…"
              : "Response synthesized",
          detail: snippet.length > 140 ? `${snippet.slice(0, 140)}…` : snippet,
          running: busy && idx === lastAssistant.parts.length - 1,
        });
      }
    });
  }

  const runningCall = calls.findLast((c) => c.running);
  let headline = "Idle · Ready";
  if (runningCall) {
    headline = runningCall.label || runningCall.command || "Running command…";
  } else if (busy) {
    if (activeThought) {
      const lastLine = activeThought.split("\n").map((l) => l.trim()).filter(Boolean).at(-1);
      headline = lastLine ? lastLine.slice(0, 72) : "Reasoning…";
    } else if (steps.at(-1)?.kind === "response") {
      headline = "Streaming response…";
    } else {
      headline = "Thinking & planning next step…";
    }
  } else if (steps.length > 0) {
    const lastAction = [...steps].reverse().find((s) => s.kind === "action");
    headline = lastAction ? `Completed · ${lastAction.title}` : "Turn complete";
  }

  return {
    headline,
    activeThought: activeThought || null,
    steps: steps.slice(-8),
  };
}

function estimatePartChars(part: unknown): number {
  const rec = asRecord(part);
  if (!rec) return 0;
  if (rec.type === "text" && typeof rec.text === "string") return rec.text.length;
  if (rec.type === "reasoning" && typeof rec.text === "string") return rec.text.length;
  let chars = 0;
  const input = asRecord(rec.input);
  if (input) chars += JSON.stringify(input).length;
  const output = asRecord(rec.output);
  if (output) chars += JSON.stringify(output).length;
  return chars;
}

export function formatTokenCount(tokens: number): string {
  if (tokens < 1000) return `${tokens}`;
  if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(tokens >= 100_000 ? 0 : 1)}k`;
  return `${(tokens / 1_000_000).toFixed(2)}M`;
}

export function formatUsd(cost: number): string {
  if (cost === 0) return "$0.00";
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

const SYSTEM_PROMPT_BASE_TOKENS = 950;
const INPUT_COST_PER_M = 1.25;
const CACHED_INPUT_COST_PER_M = 0.3125;
const OUTPUT_COST_PER_M = 5.0;

export function computeConversationUsage(messages: UIMessage[]): ConversationUsage {
  let totalInput = 0;
  let totalOutput = 0;
  let totalCached = 0;
  let totalReasoning = 0;
  let totalSteps = 0;

  let rollingContextTokens = SYSTEM_PROMPT_BASE_TOKENS;

  for (const message of messages) {
    const msgChars = message.parts.reduce((acc, part) => acc + estimatePartChars(part), 0);
    const msgTokens = Math.max(1, Math.ceil(msgChars / 4));

    if (message.role === "user") {
      rollingContextTokens += msgTokens;
      continue;
    }

    const meta = asRecord(message.metadata);
    const usage = asRecord(meta?.usage);

    if (usage && typeof usage.inputTokens === "number" && usage.inputTokens > 0) {
      const inTok = usage.inputTokens;
      const outTok = typeof usage.outputTokens === "number" ? usage.outputTokens : msgTokens;
      const cachedTok = typeof usage.cachedInputTokens === "number" ? usage.cachedInputTokens : 0;
      const reasonTok = typeof usage.reasoningTokens === "number" ? usage.reasoningTokens : 0;
      const steps = typeof usage.steps === "number" ? usage.steps : 1;

      totalInput += inTok;
      totalOutput += outTok;
      totalCached += cachedTok;
      totalReasoning += reasonTok;
      totalSteps += steps;
      rollingContextTokens += msgTokens;
    } else {
      let stepCount = 0;
      let stepContext = rollingContextTokens;
      for (const part of message.parts) {
        const partTok = Math.ceil(estimatePartChars(part) / 4);
        if (isToolUIPart(part) || (part.type === "text" && part.text.trim())) {
          stepCount += 1;
          totalInput += stepContext;
          totalOutput += Math.max(12, Math.min(partTok, 1800));
          stepContext += partTok;
        }
      }
      totalSteps += Math.max(1, stepCount);
      rollingContextTokens = stepContext;
    }
  }

  const uncachedInput = Math.max(0, totalInput - totalCached);
  const costUsd =
    (uncachedInput / 1_000_000) * INPUT_COST_PER_M +
    (totalCached / 1_000_000) * CACHED_INPUT_COST_PER_M +
    (totalOutput / 1_000_000) * OUTPUT_COST_PER_M;

  const totalTokens = totalInput + totalOutput;

  return {
    inputTokens: totalInput,
    outputTokens: totalOutput,
    cachedInputTokens: totalCached,
    reasoningTokens: totalReasoning,
    totalTokens,
    steps: totalSteps,
    costUsd,
    formattedTokens: `${formatTokenCount(totalTokens)} tok`,
    formattedCost: formatUsd(costUsd),
  };
}

export function presenceFor(
  status: string,
  calls: ToolCall[],
  messages: UIMessage[],
  selectedId?: string | null,
): { caption: string; usage: ConversationUsage } {
  const usage = computeConversationUsage(messages);
  const lastCall = calls.at(-1);

  if (selectedId && selectedId !== lastCall?.id) {
    const picked = calls.find((c) => c.id === selectedId);
    if (picked) {
      return {
        caption: picked.label,
        usage,
      };
    }
  }

  const live = calls.findLast((call) => call.running);
  if (live) {
    return {
      caption: live.label,
      usage,
    };
  }

  const lastMsg = messages.at(-1);
  const lastPart = lastMsg?.parts.at(-1);

  if (status === "submitted" || status === "streaming") {
    if (lastMsg?.role === "assistant") {
      if (lastPart?.type === "text" && lastPart.text.trim()) {
        return {
          caption: "Writing response…",
          usage,
        };
      }
      if (lastCall) {
        return {
          caption: lastCall.label,
          usage,
        };
      }
    }
    return {
      caption: "Thinking…",
      usage,
    };
  }

  return {
    caption: "Ready",
    usage,
  };
}

export function liveAnchor(messages: UIMessage[], calls: ToolCall[], busy: boolean) {
  if (messages.length === 0) return null;
  const running = calls.findLast((call) => call.running);
  if (running) return `call:${running.id}`;
  const last = messages.at(-1);
  if (!last || last.role === "user") return "pending";
  for (let index = last.parts.length - 1; index >= 0; index--) {
    const part = last.parts[index];
    if (isToolUIPart(part)) return `call:${part.toolCallId}`;
    if (part.type === "text" && part.text.trim()) return `msg:${last.id}`;
  }
  return busy ? "pending" : `msg:${last.id}`;
}

import type { ConversationSummary } from "@/lib/db";
export type { ConversationSummary };

export type ParsedConversationMeta = {
  kind: "user" | "pulse" | "subagent";
  title: string;
  subagentLabel?: string;
  worktree?: string;
  parentId?: string | null;
};

export function parseConversationMeta(
  conversation: Pick<ConversationSummary, "title" | "slug" | "parent_id" | "worktree">,
): ParsedConversationMeta {
  const text = conversation.title?.trim() || "Untitled";
  if (conversation.parent_id || conversation.slug) {
    return {
      kind: "subagent",
      subagentLabel: conversation.slug || "subagent",
      worktree: conversation.worktree || undefined,
      parentId: conversation.parent_id ?? null,
      title: text.split("\n")[0]?.trim() || text,
    };
  }
  return {
    kind: "user",
    title: text.split("\n")[0]?.trim() || text,
    parentId: null,
  };
}
