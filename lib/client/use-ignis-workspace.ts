"use client";

import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FlameVariant } from "@/app/avatar";
import {
  collectCalls,
  isSubagentSpawnCall,
  liveAnchor,
  parseConversationMeta,
  presenceFor,
  type ConversationSummary,
  type SpawnedSubagentInfo,
} from "@/app/components/activity";
import {
  resolveActiveVariant,
  type CodebaseVariant,
} from "@/app/components/starter-blueprints";

export type IgnisOnboardingState = {
  onboarded: boolean;
  defaultProvider: "anthropic" | "openai" | "google";
  defaultModel: string;
  enableSubagents?: boolean;
  enableScheduler?: boolean;
  codebaseVariant?: CodebaseVariant;
  providers: {
    anthropic: boolean;
    openai: boolean;
    google: boolean;
  };
  updatedAt: string | null;
};

export function useIgnisWorkspace() {
  const [viewMode, setViewMode] = useState<"landing" | "workspace">("workspace");
  const [landingShowOnboarding, setLandingShowOnboarding] = useState(false);
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("ignis:view-mode", { detail: { viewMode } }));
  }, [viewMode]);
  const [onboardingState, setOnboardingState] = useState<IgnisOnboardingState | null>(null);
  const [follow, setFollow] = useState(true);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [session, setSession] = useState<{ id: string; messages?: UIMessage[] } | null>(null);
  const [narrow, setNarrow] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const loadTicket = useRef(0);

  const { messages, setMessages, sendMessage, status, error, stop, clearError } = useChat({
    id: session?.id ?? "pending",
    messages: session?.messages,
    throttle: 32,
  });

  const activeConvSummary = conversations.find((c) => c.id === session?.id);
  const localBusy = status === "submitted" || status === "streaming";
  const serverBusy = Boolean(activeConvSummary?.running);
  const busy = localBusy || serverBusy;
  const anyServerRunning = busy || conversations.some((c) => c.running);
  const effectiveStatus = localBusy ? status : serverBusy ? "streaming" : status;

  const sessionId = session?.id ?? null;
  const childConversations = useMemo(() => {
    if (!sessionId) return [];
    return conversations.filter((c) => {
      const m = parseConversationMeta(c);
      return m.kind === "subagent" && m.parentId === sessionId;
    });
  }, [conversations, sessionId]);

  const calls = useMemo(() => {
    const raw = collectCalls(messages);
    if (childConversations.length === 0) return raw;
    const matchedIds = new Set<string>();
    for (const c of raw) {
      for (const s of c.spawnedSubagents) {
        matchedIds.add(s.conversationId);
      }
    }
    const unmatchedChildren = childConversations.filter((c) => !matchedIds.has(c.id));
    if (unmatchedChildren.length === 0) return raw;

    let lastUnmatchedSpawnIdx = -1;
    for (let i = raw.length - 1; i >= 0; i--) {
      const call = raw[i];
      if (isSubagentSpawnCall(call) && call.spawnedSubagents.length === 0) {
        lastUnmatchedSpawnIdx = i;
        break;
      }
    }
    if (lastUnmatchedSpawnIdx === -1) return raw;

    return raw.map((call, idx) => {
      if (idx !== lastUnmatchedSpawnIdx) return call;
      return {
        ...call,
        spawnedSubagents: unmatchedChildren.map((c) => {
          const m = parseConversationMeta(c);
          return {
            conversationId: c.id,
            label: m.subagentLabel || "subagent",
            worktree: m.worktree ?? null,
            ok: true,
          } satisfies SpawnedSubagentInfo;
        }),
      };
    });
  }, [messages, childConversations]);

  const anchor = liveAnchor(messages, calls, busy);
  const latestId = calls.at(-1)?.id ?? null;
  const effectiveSelectedId = follow ? latestId : selectedId;
  const presence = useMemo(
    () => presenceFor(effectiveStatus, calls, messages, effectiveSelectedId),
    [effectiveStatus, calls, messages, effectiveSelectedId],
  );

  const firstUserText =
    messages
      .find((m) => m.role === "user")
      ?.parts.find((p): p is { type: "text"; text: string } => p.type === "text")?.text ?? null;

  const activeMeta = parseConversationMeta({
    title: activeConvSummary?.title ?? firstUserText,
    slug: activeConvSummary?.slug ?? null,
    parent_id: activeConvSummary?.parent_id ?? null,
    worktree: activeConvSummary?.worktree ?? null,
  });

  const activeAgentSeed =
    activeMeta.kind === "subagent"
      ? activeMeta.subagentLabel || session?.id || "subagent"
      : "root";
  const activeFlameVariant: FlameVariant = "default";

  useEffect(() => {
    const query = window.matchMedia("(max-width: 639px)");
    const apply = () => setNarrow(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  function selectCall(id: string) {
    setFollow(id === latestId);
    setSelectedId(id);
  }

  useEffect(() => {
    const refreshOnboarding = () => {
      fetch("/api/system?onboardingStatus=1")
        .then(async (res) => {
          if (!res.ok) return;
          const data = (await res.json()) as IgnisOnboardingState;
          setOnboardingState(data);
        })
        .catch(() => {});
    };
    refreshOnboarding();
    window.addEventListener("ignis:onboarding-updated", refreshOnboarding);

    const params = new URLSearchParams(window.location.search);
    const initialId = params.get("id")?.trim();
    const initialView = params.get("view")?.trim();
    if (initialId || initialView === "workspace") {
      setViewMode("workspace");
    }
    const resolvedId = initialId || "main";
    const ticket = ++loadTicket.current;
    fetch(`/api/conversations?id=${encodeURIComponent(resolvedId)}`)
      .then(async (res) => {
        if (ticket !== loadTicket.current) return;
        if (!res.ok) {
          setSession({ id: resolvedId, messages: [] });
          return;
        }
        const data = (await res.json()) as { id: string; messages?: UIMessage[] };
        if (ticket !== loadTicket.current) return;
        setSession({ id: data.id, messages: data.messages ?? [] });
      })
      .catch(() => {
        if (ticket === loadTicket.current) {
          setSession({ id: resolvedId, messages: [] });
        }
      });

    return () => {
      window.removeEventListener("ignis:onboarding-updated", refreshOnboarding);
    };
  }, []);

  function handleSend(text: string) {
    if (!text || busy || !session || session.id === "pending") return;
    clearError();
    sendMessage({ text });
  }

  function handleStop() {
    stop();
    if (session?.id && session.id !== "pending") {
      void fetch(`/api/chat?id=${encodeURIComponent(session.id)}`, {
        method: "DELETE",
      });
    }
  }

  const messagesRef = useRef<UIMessage[]>(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const hasMessages = messages.length > 0;
  useEffect(() => {
    if (session?.id && session.id !== "pending" && hasMessages) {
      try {
        window.localStorage.setItem("ignis:last-conversation-id", session.id);
      } catch {
        // ignore storage error
      }
      const url = new URL(window.location.href);
      if (url.searchParams.get("id") !== session.id) {
        url.searchParams.set("id", session.id);
        window.history.replaceState(null, "", url.toString());
      }
    }
  }, [session?.id, hasMessages]);

  useEffect(() => {
    let active = true;
    const syncAll = () => {
      fetch("/api/conversations?limit=50")
        .then(async (res) => {
          if (!res.ok || !active) return;
          const data = (await res.json()) as {
            conversations?: ConversationSummary[];
          };
          if (active) {
            setConversations(data.conversations ?? []);
          }
        })
        .catch(() => {});

      const activeId = session?.id;
      if (!localBusy && activeId && activeId !== "pending") {
        fetch(`/api/conversations?id=${encodeURIComponent(activeId)}`)
          .then(async (res) => {
            if (!res.ok || !active) return;
            const data = (await res.json()) as { id: string; messages?: UIMessage[] };
            const incoming = data.messages ?? [];
            if (!active || incoming.length === 0) return;
            const curMessages = messagesRef.current;
            const checkpointChanged =
              Boolean(incoming[0]?.id?.startsWith("compact_")) &&
              incoming[0]?.id !== curMessages[0]?.id;
            if (
              checkpointChanged ||
              incoming.length > curMessages.length ||
              (incoming.length === curMessages.length &&
                JSON.stringify(incoming.at(-1)) !== JSON.stringify(curMessages.at(-1)))
            ) {
              setMessages(incoming);
            }
          })
          .catch(() => {});
      }
    };

    syncAll();
    const timer = window.setInterval(syncAll, anyServerRunning ? 650 : 2500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [status, localBusy, busy, anyServerRunning, session?.id, setMessages]);

  function resetThread() {
    clearError();
    setFollow(true);
    setSelectedId(null);
    setHistoryError(null);
  }

  function startNew() {
    loadTicket.current += 1;
    resetThread();
    const url = new URL(window.location.href);
    url.searchParams.delete("id");
    window.history.replaceState(null, "", url.toString());
    setSession({ id: "main", messages: [] });
  }

  async function openConversation(id: string) {
    if (session?.id === id) return;
    const ticket = ++loadTicket.current;
    setHistoryError(null);
    try {
      const res = await fetch(`/api/conversations?id=${encodeURIComponent(id)}`);
      if (ticket !== loadTicket.current) return;
      if (!res.ok) {
        setHistoryError("Couldn't open that conversation.");
        return;
      }
      const data = (await res.json()) as {
        id: string;
        messages?: UIMessage[];
      };
      if (ticket !== loadTicket.current) return;
      resetThread();
      const url = new URL(window.location.href);
      url.searchParams.set("id", data.id);
      window.history.replaceState(null, "", url.toString());
      setSession({ id: data.id, messages: data.messages ?? [] });
    } catch {
      if (ticket === loadTicket.current) setHistoryError("Couldn't open that conversation.");
    }
  }

  async function deleteConversation(id: string) {
    try {
      await fetch(`/api/conversations?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const removedSet = new Set<string>([id]);
      let added = true;
      while (added) {
        added = false;
        for (const c of conversations) {
          if (c.parent_id && removedSet.has(c.parent_id) && !removedSet.has(c.id)) {
            removedSet.add(c.id);
            added = true;
          }
        }
      }
      setConversations((prev) => prev.filter((c) => !removedSet.has(c.id)));
      if (session?.id && removedSet.has(session.id)) {
        startNew();
      }
    } catch {
      setHistoryError("Couldn't delete that conversation.");
    }
  }

  async function compactActiveConversation() {
    if (!session?.id || session.id === "pending" || busy) return;
    try {
      const res = await fetch("/api/conversations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: session.id, keepLast: 6 }),
      });
      if (!res.ok) return;
      const convRes = await fetch(`/api/conversations?id=${encodeURIComponent(session.id)}`);
      if (!convRes.ok) return;
      const data = (await convRes.json()) as { id: string; messages?: UIMessage[] };
      setSession({ id: data.id, messages: data.messages ?? [] });
      setMessages(data.messages ?? []);
    } catch {
      // ignore
    }
  }

  const parentConv = activeMeta.parentId
    ? conversations.find((c) => c.id === activeMeta.parentId)
    : undefined;
  const parentTitle = parentConv ? parseConversationMeta(parentConv).title : null;
  const codebaseVariant: CodebaseVariant = resolveActiveVariant(onboardingState);

  function enterWorkspace(starterPrompt?: string) {
    setLandingShowOnboarding(false);
    setViewMode("workspace");
    const url = new URL(window.location.href);
    url.searchParams.set("view", "workspace");
    window.history.replaceState(null, "", url.toString());
    if (starterPrompt && session && session.id !== "pending" && !busy) {
      window.setTimeout(() => {
        sendMessage({ text: starterPrompt });
      }, 120);
    }
  }

  return {
    viewMode,
    landingShowOnboarding,
    setOnboardingState,
    enterWorkspace,
    conversationId: session?.id ?? null,
    messages,
    calls,
    conversations,
    busy,
    error,
    historyError,
    caption: presence.caption,
    usage: presence.usage,
    anchor,
    selectedCallId: effectiveSelectedId,
    narrow,
    activeMeta,
    parentTitle,
    activeFlameVariant,
    activeAgentSeed,
    codebaseVariant,
    onboardingState,
    onSend: handleSend,
    onStop: handleStop,
    onCompact: compactActiveConversation,
    onStartNew: startNew,
    onOpenConversation: openConversation,
    onDeleteConversation: deleteConversation,
    onSelectCall: selectCall,
  };
}
