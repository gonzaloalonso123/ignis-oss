import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI, google } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseDotEnvContent } from "./vault-env.ts";

function resolveActiveLanguageModel() {
  const root = process.cwd();
  const envPath = existsSync(path.join(root, "data", ".env")) ? path.join(root, "data", ".env") : path.join(root, ".env");
  const configPath = path.join(root, "data", "ignis-onboarding.json");
  let fileEnv: Record<string, string> = {};
  if (existsSync(envPath)) {
    try {
      fileEnv = parseDotEnvContent(readFileSync(envPath, "utf8"));
    } catch {
      fileEnv = {};
    }
  }
  let savedCfg: { defaultProvider?: string; defaultModel?: string } = {};
  if (existsSync(configPath)) {
    try {
      savedCfg = JSON.parse(readFileSync(configPath, "utf8"));
    } catch {
      savedCfg = {};
    }
  }

  const anthropicKey = fileEnv.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || "";
  const openaiKey = fileEnv.OPENAI_API_KEY || process.env.OPENAI_API_KEY || "";
  const googleKey =
    fileEnv.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || "";

  let provider =
    savedCfg.defaultProvider ||
    fileEnv.IGNIS_DEFAULT_PROVIDER ||
    process.env.IGNIS_DEFAULT_PROVIDER ||
    "";

  if (provider === "anthropic" && !anthropicKey) provider = "";
  if (provider === "openai" && !openaiKey) provider = "";
  if (provider === "google" && !googleKey) provider = "";

  if (!provider) {
    if (anthropicKey) provider = "anthropic";
    else if (openaiKey) provider = "openai";
    else provider = "google";
  }

  const configuredModel =
    savedCfg.defaultModel ||
    fileEnv.IGNIS_DEFAULT_MODEL ||
    process.env.IGNIS_DEFAULT_MODEL ||
    "";

  if (provider === "anthropic" && anthropicKey) {
    const anthropic = createAnthropic({ apiKey: anthropicKey });
    const modelId = configuredModel.startsWith("claude-")
      ? configuredModel
      : "claude-opus-5-5";
    return { provider: "anthropic" as const, model: anthropic(modelId) };
  }

  if (provider === "openai" && openaiKey) {
    const openai = createOpenAI({ apiKey: openaiKey });
    const modelId =
      configuredModel.startsWith("gpt-") || configuredModel.startsWith("o")
        ? configuredModel
        : "gpt-6-astra";
    return { provider: "openai" as const, model: openai(modelId) };
  }

  const gModelId = configuredModel.startsWith("gemini-")
    ? configuredModel
    : "gemini-4-argon";
  if (googleKey) {
    const googleProvider = createGoogleGenerativeAI({ apiKey: googleKey });
    return { provider: "google" as const, model: googleProvider(gModelId) };
  }
  return { provider: "google" as const, model: google("gemini-4-argon") };
}
import {
  convertToModelMessages,
  generateId,
  isStepCount,
  readUIMessageStream,
  streamText,
  toUIMessageStream,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import {
  compactMessagesForModel,
  firstUserPromptFrom,
  getConversation,
  getConversationSummary,
  sanitizeSlug,
  saveConversation,
  setConversationRunning,
  titleFrom,
  updateConversationTitle,
} from "../db.ts";
import {
  buildInstructions,
  ensurePersistentNodeWorkspace,
} from "./instructions.ts";
import { createAgentTools } from "./tools.ts";

export type RunSource = "chat" | "pulse" | "subagent" | "cli";

export type ActiveRun = {
  conversationId: string;
  source: RunSource;
  parentId: string | null;
  slug: string | null;
  startedAt: string;
  updatedAt: string;
  steps: number;
  messages: UIMessage[];
  abortController: AbortController;
};

const globalForRuns = globalThis as typeof globalThis & {
  ignisActiveRuns?: Map<string, ActiveRun>;
  ignisTitlingIds?: Set<string>;
};

function getRunsMap(): Map<string, ActiveRun> {
  globalForRuns.ignisActiveRuns ??= new Map<string, ActiveRun>();
  return globalForRuns.ignisActiveRuns;
}

function getTitlingSet(): Set<string> {
  globalForRuns.ignisTitlingIds ??= new Set<string>();
  return globalForRuns.ignisTitlingIds;
}

function scheduleLocalTitleGeneration(
  conversationId: string,
  messages: UIMessage[],
  priorTitle: string | null,
) {
  const titling = getTitlingSet();
  if (titling.has(conversationId)) return;

  const rawPrompt = firstUserPromptFrom(messages);
  if (!rawPrompt) return;

  const defaultSlice = titleFrom(messages);
  if (priorTitle && priorTitle !== defaultSlice) {
    return;
  }

  titling.add(conversationId);
  void (async () => {
    try {

    } catch {
      // keep fallback titleFrom(messages)
    } finally {
      titling.delete(conversationId);
    }
  })();
}

/**
 * Heals any interrupted tool calls or empty assistant shells from earlier turns
 * so resuming an interrupted conversation never fails model message conversion.
 */
export function sanitizeMessagesForModel(messages: UIMessage[]): UIMessage[] {
  const sanitized: UIMessage[] = [];
  for (const msg of messages) {
    if (msg.role === "assistant" && (!msg.parts || msg.parts.length === 0)) {
      continue;
    }
    if (msg.role === "assistant" && Array.isArray(msg.parts)) {
      const healedParts = msg.parts.map((part) => {
        const anyPart = part as Record<string, unknown>;
        if (
          typeof anyPart.type === "string" &&
          anyPart.type.startsWith("tool-") &&
          anyPart.state !== "output-available" &&
          anyPart.state !== "output-error"
        ) {
          return {
            ...anyPart,
            state: "output-available",
            output: {
              ok: true,
              exitCode: 0,
              stdout: "[Command interrupted or completed during server reload]",
              stderr: "",
              timedOut: false,
              truncated: false,
            },
          } as unknown as UIMessage["parts"][number];
        }
        return part;
      });
      sanitized.push({ ...msg, parts: healedParts });
    } else {
      sanitized.push(msg);
    }
  }
  return sanitized;
}

export function getActiveRun(conversationId: string): ActiveRun | undefined {
  return getRunsMap().get(conversationId);
}

export function listActiveRuns(): ActiveRun[] {
  return Array.from(getRunsMap().values());
}

export function listActiveRunIds(): Set<string> {
  return new Set(getRunsMap().keys());
}

export function syncActiveRunMessages(conversationId: string, messages: UIMessage[]): void {
  const run = getRunsMap().get(conversationId);
  if (run) {
    run.messages = messages;
    run.updatedAt = new Date().toISOString();
  }
}

export function stopConversationRun(conversationId: string): boolean {
  const map = getRunsMap();
  const run = map.get(conversationId);
  setConversationRunning(conversationId, false);
  if (!run) return false;
  try {
    run.abortController.abort("Stopped by user");
  } catch {
    // ignore abort error
  }
  if (run.messages.length > 0) {
    saveConversation(conversationId, run.messages, {
      parentId: run.parentId,
      slug: run.slug,
      running: false,
    });
  }
  map.delete(conversationId);
  return true;
}

function combineStreamedMessage(baseMessages: UIMessage[], liveMessage: UIMessage): UIMessage[] {
  if (!liveMessage.parts || liveMessage.parts.length === 0) {
    return baseMessages;
  }
  const existingIdx = baseMessages.findIndex((m) => m.id === liveMessage.id);
  if (existingIdx !== -1) {
    const next = [...baseMessages];
    next[existingIdx] = liveMessage;
    return next;
  }
  if (baseMessages.at(-1)?.role === "assistant") {
    const next = [...baseMessages];
    next[next.length - 1] = liveMessage;
    return next;
  }
  return [...baseMessages, liveMessage];
}

function partSignature(msg: UIMessage): string {
  if (!Array.isArray(msg.parts)) return "0";
  return msg.parts
    .map((p) => {
      const anyP = p as Record<string, unknown>;
      return `${String(anyP.type)}:${String(anyP.state ?? "")}`;
    })
    .join("|");
}

export type StartTurnOptions = {
  conversationId: string | null;
  messages: UIMessage[];
  source?: RunSource;
  maxSteps?: number;
  cwd?: string;
  parentId?: string | null;
  slug?: string | null;
  worktree?: string | null;
  taskPrompt?: string;
  ephemeral?: boolean;
  onStepEnd?: (messages: UIMessage[], step: number) => void;
  onFinish?: (messages: UIMessage[]) => void;
  onError?: (error: unknown) => void;
};

export async function startServerConversationTurn(options: StartTurnOptions): Promise<{
  conversationId: string;
  clientStream: ReadableStream<UIMessageChunk>;
  completionPromise: Promise<UIMessage[]>;
  stop: () => boolean;
}> {
  const conversationId =
    options.conversationId && options.conversationId.trim()
      ? options.conversationId.trim()
      : generateId();
  const source: RunSource = options.source ?? "chat";
  const maxSteps = options.maxSteps ?? 50;
  const parentId = options.parentId ?? null;
  const slug = sanitizeSlug(options.slug) || null;
  const worktree = options.worktree ?? null;
  const ephemeral = options.ephemeral;

  // If a prior turn on this exact conversationId was still marked active, stop it cleanly first
  const existingRun = getRunsMap().get(conversationId);
  if (existingRun) {
    try {
      existingRun.abortController.abort("Superseded by new turn");
    } catch {
      // ignore
    }
    getRunsMap().delete(conversationId);
  }

  const existingSummary = getConversationSummary(conversationId);
  const cleanMessages = sanitizeMessagesForModel(
    saveConversation(conversationId, sanitizeMessagesForModel(options.messages), {
      parentId,
      slug,
      worktree,
      ephemeral,
      running: true,
    }),
  );
  scheduleLocalTitleGeneration(conversationId, cleanMessages, existingSummary?.title ?? null);

  const abortController = new AbortController();
  const nowIso = new Date().toISOString();
  const activeRun: ActiveRun = {
    conversationId,
    source,
    parentId,
    slug,
    startedAt: nowIso,
    updatedAt: nowIso,
    steps: 0,
    messages: cleanMessages,
    abortController,
  };
  getRunsMap().set(conversationId, activeRun);

  const tools = createAgentTools(options.cwd, conversationId);
  const modelInputMessages = compactMessagesForModel(cleanMessages);

  const resolved = resolveActiveLanguageModel();
  const result = streamText({
    model: resolved.model,
    system: buildInstructions(conversationId, {
      parentId,
      slug,
      taskPrompt: options.taskPrompt,
      cwd: options.cwd,
      ephemeral,
    }),
    messages: await convertToModelMessages(modelInputMessages, { tools }),
    tools,
    stopWhen: isStepCount(maxSteps),
    toolCallConcurrency: 1,
    abortSignal: abortController.signal,
    providerOptions:
      resolved.provider === "google"
        ? {
            google: {
              thinkingConfig: {
                includeThoughts: true,
              },
            },
          }
        : undefined,
  });

  let inputTokens = 0;
  let outputTokens = 0;
  let cachedInputTokens = 0;
  let reasoningTokens = 0;
  let steps = 0;
  let baseMessages = cleanMessages;

  const uiStream = toUIMessageStream({
    stream: result.stream,
    originalMessages: cleanMessages,
    generateMessageId: generateId,
    messageMetadata({ part }) {
      if (part.type === "finish-step") {
        steps += 1;
        activeRun.steps = steps;
        inputTokens += part.usage?.inputTokens ?? 0;
        outputTokens += part.usage?.outputTokens ?? 0;
        cachedInputTokens += part.usage?.inputTokenDetails?.cacheReadTokens ?? 0;
        reasoningTokens += part.usage?.outputTokenDetails?.reasoningTokens ?? 0;
        return {
          usage: {
            inputTokens,
            outputTokens,
            cachedInputTokens,
            reasoningTokens,
            totalTokens: inputTokens + outputTokens,
            steps,
          },
        };
      }
      if (part.type === "finish") {
        const totalIn = part.totalUsage?.inputTokens ?? inputTokens;
        const totalOut = part.totalUsage?.outputTokens ?? outputTokens;
        const totalCached =
          part.totalUsage?.inputTokenDetails?.cacheReadTokens ?? cachedInputTokens;
        const totalReasoning =
          part.totalUsage?.outputTokenDetails?.reasoningTokens ?? reasoningTokens;
        return {
          usage: {
            inputTokens: totalIn,
            outputTokens: totalOut,
            cachedInputTokens: totalCached,
            reasoningTokens: totalReasoning,
            totalTokens: totalIn + totalOut,
            steps: Math.max(1, steps),
          },
        };
      }
      return undefined;
    },
    onError(error) {
      options.onError?.(error);
      if (error instanceof Error) return error.message;
      return "The agent hit an error.";
    },
    onStepEnd({ messages: stepMessages }) {
      const reconciled = saveConversation(conversationId, stepMessages, {
        parentId,
        slug,
        worktree,
        ephemeral,
        running: true,
      });
      baseMessages = reconciled;
      activeRun.messages = reconciled;
      activeRun.updatedAt = new Date().toISOString();
      options.onStepEnd?.(reconciled, steps);
    },
    onEnd({ messages: finished }) {
      const reconciled = saveConversation(conversationId, finished, {
        parentId,
        slug,
        worktree,
        ephemeral,
        running: false,
      });
      endedCleanly = true;
      activeRun.messages = reconciled;
      activeRun.updatedAt = new Date().toISOString();
      options.onFinish?.(reconciled);
    },
  });

  let endedCleanly = false;
  // Split stream: clientStream goes to any attached HTTP caller; serverStream drives execution to completion on the server
  const [clientStream, serverStream] = uiStream.tee();

  const lastInputMsg = cleanMessages.at(-1);
  const initialContinuationMsg =
    lastInputMsg?.role === "assistant" ? structuredClone(lastInputMsg) : undefined;

  const completionPromise = (async (): Promise<UIMessage[]> => {
    let lastSaveMs = Date.now();
    let lastSig = "";

    try {
      const messageStream = readUIMessageStream({
        stream: serverStream,
        message: initialContinuationMsg,
      });

      for await (const liveMsg of messageStream) {
        const combined = combineStreamedMessage(baseMessages, liveMsg);
        activeRun.messages = combined;
        activeRun.updatedAt = new Date().toISOString();

        const sig = partSignature(liveMsg);
        const now = Date.now();
        // Save immediately whenever a tool call starts/completes or part structure changes, or every 450ms while streaming tokens
        if (sig !== lastSig || now - lastSaveMs >= 450) {
          lastSig = sig;
          lastSaveMs = now;
          const saved = saveConversation(conversationId, combined, {
            parentId,
            slug,
            worktree,
            ephemeral,
            running: true,
          });
          baseMessages = saved;
          activeRun.messages = saved;
        }
      }
    } catch (error) {
      options.onError?.(error);
    } finally {
      if (getRunsMap().get(conversationId) === activeRun) {
        getRunsMap().delete(conversationId);
      }
      if (!endedCleanly) {
        activeRun.messages = saveConversation(conversationId, activeRun.messages, {
          parentId,
          slug,
          worktree,
          ephemeral,
          running: false,
        });
      }
    }

    return activeRun.messages;
  })();

  return {
    conversationId,
    clientStream,
    completionPromise,
    stop: () => stopConversationRun(conversationId),
  };
}

export async function spawnServerConversation(options: {
  prompt: string;
  conversationId?: string;
  source?: RunSource;
  maxSteps?: number;
  cwd?: string;
  parentId?: string | null;
  slug?: string | null;
  name?: string | null;
  worktree?: string | null;
  taskPrompt?: string;
  persist?: boolean;
  abortSignal?: AbortSignal;
  onError?: (error: unknown) => void;
}) {
  const id = options.conversationId?.trim() || generateId();
  const existing = getConversation(id);
  const cleanPrompt = options.prompt.trim();
  const effectiveParentId = options.parentId ?? existing?.parent_id ?? null;
  const effectiveSlug = sanitizeSlug(options.slug ?? existing?.slug) || null;
  const isPersistent = options.persist !== undefined ? options.persist : !existing?.ephemeral;

  if (isPersistent) {
    ensurePersistentNodeWorkspace({
      conversationId: id,
      parentId: effectiveParentId,
      slug: effectiveSlug,
      name: options.name ?? effectiveSlug,
      description: cleanPrompt,
    });
  }

  const userMessage: UIMessage = {
    id: generateId(),
    role: "user",
    parts: [{ type: "text", text: cleanPrompt }],
  };
  const messages = existing ? [...existing.messages, userMessage] : [userMessage];

  const turn = await startServerConversationTurn({
    conversationId: id,
    messages,
    source: options.source ?? "cli",
    maxSteps: options.maxSteps ?? 50,
    cwd: options.cwd,
    parentId: effectiveParentId,
    slug: effectiveSlug,
    worktree: options.worktree ?? existing?.worktree ?? null,
    taskPrompt: options.taskPrompt ?? cleanPrompt,
    ephemeral: !isPersistent,
    onError: options.onError,
  });

  void turn.clientStream.cancel("Headless server spawn");

  if (options.abortSignal) {
    if (options.abortSignal.aborted) {
      turn.stop();
    } else {
      const onAbort = () => {
        turn.stop();
      };
      options.abortSignal.addEventListener("abort", onAbort, { once: true });
      void turn.completionPromise.finally(() => {
        options.abortSignal?.removeEventListener("abort", onAbort);
      });
    }
  }

  return {
    conversationId: turn.conversationId,
    parentId: effectiveParentId,
    slug: effectiveSlug,
    ephemeral: !isPersistent,
    completionPromise: turn.completionPromise,
    stop: turn.stop,
  };
}
