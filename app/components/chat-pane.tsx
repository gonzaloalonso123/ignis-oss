"use client";

import { isToolUIPart, type UIMessage } from "ai";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CozyAvatar, getFlamePalette, type FlameVariant } from "@/app/avatar";
import type {
  ConversationSummary,
  ConversationUsage,
  ParsedConversationMeta,
  SpawnedSubagentInfo,
  ToolCall,
} from "./activity";
import { MessageMarkdown } from "./markdown";
import { StarterBlueprintsGrid, type CodebaseVariant } from "./starter-blueprints";
import { ArrowDownIcon, ArrowUpIcon, PaletteDot } from "./ui";

export function ChatPane({
  conversationId,
  messages,
  calls,
  conversations,
  busy,
  error,
  caption,
  anchor,
  selectedCallId,
  narrow,
  activeMeta,
  parentTitle,
  activeFlameVariant,
  activeAgentSeed,
  codebaseVariant = "full",
  onSend,
  onStop,
  onOpenConversation,
  onSelectCall,
}: {
  conversationId: string | null;
  messages: UIMessage[];
  calls: ToolCall[];
  conversations: ConversationSummary[];
  busy: boolean;
  error: Error | undefined;
  caption: string;
  usage: ConversationUsage;
  anchor: string | null;
  selectedCallId: string | null;
  narrow: boolean;
  activeMeta: ParsedConversationMeta;
  parentTitle: string | null;
  activeFlameVariant?: FlameVariant;
  activeAgentSeed: string;
  codebaseVariant?: CodebaseVariant;
  onSend: (text: string) => void;
  onStop: () => void;
  onCompact?: () => void;
  onStartNew?: () => void;
  onOpenConversation: (id: string) => void;
  onInspectSubagent?: (sub: SpawnedSubagentInfo) => void;
  onSelectCall: (id: string) => void;
}) {
  const [input, setInput] = useState("");
  const [stuck, setStuck] = useState(true);
  const [avatarTop, setAvatarTop] = useState(0);
  const [avatarMoves, setAvatarMoves] = useState(false);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const laneRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const stickRef = useRef(true);
  const lockRef = useRef(false);
  const lockTimer = useRef<number | null>(null);
  const prevConvIdRef = useRef<string | null>(null);

  const empty = messages.length === 0;
  const activePalette = getFlamePalette(activeFlameVariant, activeAgentSeed);

  useLayoutEffect(() => {
    if (prevConvIdRef.current !== conversationId) {
      prevConvIdRef.current = conversationId;
      stickRef.current = true;
      setStuck(true);
      setAvatarMoves(false);
      setAvatarTop(0);
      setInput("");
    }
    const el = scrollerRef.current;
    const frame = frameRef.current;
    if (!el || !frame) return;
    const pin = () => {
      if (!stickRef.current) return;
      el.scrollTop = el.scrollHeight;
    };
    const observer = new ResizeObserver(pin);
    observer.observe(frame);
    pin();
    const raf = requestAnimationFrame(() => {
      pin();
      setAvatarMoves(true);
    });
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [empty, conversationId]);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const lane = laneRef.current;
    if (!frame || !lane) return;
    const measure = () => {
      const target =
        frame.querySelector<HTMLElement>("[data-live-anchor]") ??
        frame.querySelector<HTMLElement>("article:last-of-type");
      const face = lane.querySelector("svg")?.getBoundingClientRect().height ?? 96;
      const laneHeight = lane.getBoundingClientRect().height;
      const maxTop = Math.max(0, laneHeight - face - 8);
      if (!target) {
        setAvatarTop((current) => Math.min(current, maxTop));
        return;
      }
      const box = target.getBoundingClientRect();
      const raw = box.top - lane.getBoundingClientRect().top;
      const focus = Math.min(box.height / 2, 40);
      const unclamped = Math.max(0, raw + focus - face * 0.67);
      const next = Math.min(unclamped, maxTop);
      setAvatarTop((current) => (Math.abs(current - next) < 0.5 ? current : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [anchor, empty, messages]);

  useLayoutEffect(() => {
    if (empty) return;
    const frameId = requestAnimationFrame(() => setAvatarMoves(true));
    return () => cancelAnimationFrame(frameId);
  }, [empty]);

  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    field.style.height = "0px";
    field.style.height = `${Math.min(field.scrollHeight, 180)}px`;
  }, [input]);

  function noteScroll() {
    const el = scrollerRef.current;
    if (!el || lockRef.current) return;
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
    const near = gap < 56;
    stickRef.current = near;
    setStuck((current) => (current === near ? current : near));
  }

  function holdScrollLock() {
    lockRef.current = true;
    if (lockTimer.current !== null) window.clearTimeout(lockTimer.current);
    lockTimer.current = window.setTimeout(() => {
      lockRef.current = false;
      lockTimer.current = null;
      noteScroll();
    }, 700);
  }

  function jumpToLatest() {
    const el = scrollerRef.current;
    if (!el) return;
    stickRef.current = true;
    setStuck(true);
    holdScrollLock();
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }

  function resizeField(field: HTMLTextAreaElement) {
    field.style.height = "0px";
    field.style.height = `${Math.min(field.scrollHeight, 180)}px`;
  }

  function submit() {
    const text = input.trim();
    if (!text) return;
    if (busy || !conversationId || conversationId === "pending") return;
    stickRef.current = true;
    setStuck(true);
    onSend(text);
    setInput("");
  }

  function runBlueprintPrompt(prompt: string) {
    const text = prompt.trim();
    if (!text) return;
    if (busy || !conversationId || conversationId === "pending") {
      setInput(text);
      return;
    }
    stickRef.current = true;
    setStuck(true);
    onSend(text);
    setInput("");
  }

  function loadBlueprintToInput(prompt: string) {
    setInput(prompt);
    window.setTimeout(() => {
      fieldRef.current?.focus();
    }, 40);
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col pt-[env(safe-area-inset-top)]">
      <p className="sr-only" aria-live="polite">
        {caption}
      </p>

      {/* Minimal return bar ONLY when viewing a spawned subagent thread */}
      {activeMeta.kind === "subagent" ? (
        <div className="flex items-center justify-between gap-2 border-b border-line bg-paper-raised/80 px-5 py-2.5 text-sm backdrop-blur-md">
          <div className="flex min-w-0 items-center gap-2">
            <PaletteDot palette={activePalette} size="md" live={busy} />
            <span className="font-semibold text-ink">
              Subagent · {activeMeta.subagentLabel}
            </span>
          </div>
          {activeMeta.parentId ? (
            <button
              type="button"
              onClick={() => onOpenConversation(activeMeta.parentId!)}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-3 py-1 text-xs font-medium text-ink transition-colors hover:border-ember"
            >
              <span>
                ← Back to {parentTitle ? `"${parentTitle.slice(0, 28)}"` : "main chat"}
              </span>
            </button>
          ) : null}
        </div>
      ) : null}

      {/* V1 FACTORY EMPTY STATE: Avatar + Variant-Aware 1-Click Starter Blueprints */}
      {empty ? (
        <div className="thread flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-4">
          <div className="relative w-[min(10.5rem,38vw)] shrink-0 sm:w-[min(12.5rem,44vw)]">
            <div
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-1/2 aspect-square w-[115%] -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                background: `radial-gradient(closest-side, ${activePalette.glow} 0%, transparent 100%)`,
              }}
            />
            <CozyAvatar variant={activeFlameVariant} seed={activeAgentSeed} size="100%" decorative />
          </div>

          <StarterBlueprintsGrid
            variant={codebaseVariant}
            busy={busy}
            onRunBlueprint={runBlueprintPrompt}
            onCustomizeBlueprint={loadBlueprintToInput}
          />
        </div>
      ) : (
        <div
          ref={scrollerRef}
          className="thread min-h-0 flex-1 overflow-y-auto"
          tabIndex={0}
          aria-label="Conversation"
          onScroll={noteScroll}
          onPointerDown={() => {
            lockRef.current = false;
          }}
          onWheel={() => {
            lockRef.current = false;
          }}
          onTouchMove={() => {
            lockRef.current = false;
          }}
          onScrollEnd={() => {
            lockRef.current = false;
            noteScroll();
          }}
        >
          <div
            ref={frameRef}
            className="mx-auto grid w-full max-w-[50rem] grid-cols-1 px-4 pt-6 pb-20 sm:grid-cols-[8.75rem_minmax(0,1fr)] sm:gap-x-4 sm:px-6 sm:pt-8 sm:pb-28"
          >
            <div ref={laneRef} className="relative hidden min-h-[7.5rem] overflow-visible sm:block">
              <div
                className={`absolute right-0 left-0 z-20 ${
                  avatarMoves
                    ? "transition-[top] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
                    : ""
                }`}
                style={{ top: avatarTop }}
              >
                <div className="relative block w-full rounded-2xl p-1">
                  <div
                    aria-hidden
                    className="pointer-events-none absolute top-1/2 left-1/2 aspect-square w-[125%] -translate-x-1/2 -translate-y-1/2 rounded-full"
                    style={{
                      background: `radial-gradient(closest-side, ${activePalette.glow} 0%, transparent 100%)`,
                    }}
                  />
                  <CozyAvatar variant={activeFlameVariant} seed={activeAgentSeed} size="100%" decorative />
                </div>
              </div>
            </div>

            <div className="flex min-w-0 flex-col gap-5 sm:gap-6">
              {messages.map((message, index) => {
                if (message.role === "assistant") {
                  const hasVisiblePart = message.parts.some(
                    (p) => (p.type === "text" && Boolean(p.text?.trim())) || isToolUIPart(p),
                  );
                  if (!hasVisiblePart) return null;
                }
                const streamingTail =
                  busy && index === messages.length - 1 && message.role === "assistant";
                const textIndexes = message.parts.flatMap((part, partIndex) =>
                  part.type === "text" && part.text ? [partIndex] : [],
                );
                const liveText = textIndexes.at(-1);
                return (
                  <article
                    key={message.id}
                    className="settle"
                    style={{ animationDelay: `${Math.min(index, 6) * 36}ms` }}
                  >
                    {message.role === "user" ? (
                      <div className="ml-auto max-w-[88%] rounded-2xl bg-recess px-4 py-2.5 sm:max-w-[32rem]">
                        {message.parts.map((part, partIndex) =>
                          part.type === "text" ? (
                            <MessageMarkdown key={partIndex} text={part.text} breaks />
                          ) : null,
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2.5 sm:gap-3">
                        {message.parts.map((part, partIndex) => {
                          if (part.type === "text" && part.text) {
                            const live =
                              anchor === `msg:${message.id}` && partIndex === liveText;
                            const caret = streamingTail && partIndex === liveText;
                            return (
                              <div key={partIndex} data-live-anchor={live ? "" : undefined}>
                                <MessageMarkdown
                                  text={part.text}
                                  streaming={caret}
                                  copyable={!caret}
                                />
                              </div>
                            );
                          }
                          if (!isToolUIPart(part)) return null;
                          const call = calls.find((item) => item.id === part.toolCallId);
                          if (!call) return null;
                          const picked = call.id === selectedCallId;
                          const live = anchor === `call:${call.id}`;
                          const liveChildForRunningCall = call.spawnedSubagents;

                          return (
                            <div
                              key={part.toolCallId}
                              className="flex flex-col items-start gap-2"
                            >
                              <button
                                id={`call-${part.toolCallId}`}
                                type="button"
                                data-live-anchor={live ? "" : undefined}
                                aria-pressed={picked}
                                onClick={() => onSelectCall(call.id)}
                                className={`inline-flex max-w-full items-center gap-2 self-start truncate rounded-full border border-line bg-paper-raised px-3.5 py-1.5 text-left text-xs font-medium shadow-2xs transition-colors ${
                                  call.running
                                    ? "border-ember/40 text-ember"
                                    : call.failed
                                      ? "text-bad"
                                      : "text-muted hover:text-ink"
                                }`}
                              >
                                <span
                                  className={`size-1.5 shrink-0 rounded-full ${
                                    call.running
                                      ? "bg-ember dot-live"
                                      : call.failed
                                        ? "bg-bad"
                                        : "bg-ok"
                                  }`}
                                />
                                <span className="truncate">
                                  {call.label || "Working…"}
                                </span>
                              </button>

                                                          </div>
                          );
                        })}
                      </div>
                    )}
                  </article>
                );
              })}
              {anchor === "pending" ? <div data-live-anchor="" className="h-8" /> : null}
            </div>
          </div>
        </div>
      )}

      {!stuck && !empty ? (
        <button
          type="button"
          onClick={jumpToLatest}
          aria-label="Latest"
          className="settle absolute bottom-24 left-1/2 z-10 grid size-9 -translate-x-1/2 place-items-center rounded-full border border-line bg-paper-raised text-ink shadow-elevated sm:size-8"
        >
          <ArrowDownIcon />
        </button>
      ) : null}

      {/* SINGLE BOTTOM INPUT BAR */}
      <form
        className={narrow ? "pt-1.5 pb-4" : "pt-2 pb-[max(1.5rem,env(safe-area-inset-bottom))]"}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div
          className={
            empty
              ? "mx-auto w-full max-w-xl px-4"
              : "mx-auto grid w-full max-w-[50rem] grid-cols-1 px-4 sm:grid-cols-[8.75rem_minmax(0,1fr)] sm:gap-x-4 sm:px-6"
          }
        >
          {empty ? null : <div aria-hidden className="hidden sm:block" />}
          <div>
            {error ? (
              (() => {
                let cleanMsg = error.message || "Request failed";
                try {
                  const parsed = JSON.parse(cleanMsg) as { error?: string };
                  if (parsed.error) cleanMsg = parsed.error;
                } catch {
                  // keep raw error message
                }
                return (
                  <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-ember/40 bg-paper-raised px-4 py-2.5 text-sm text-ink shadow-2xs">
                    <span className="text-bad">{cleanMsg}</span>
                    <button
                      type="button"
                      onClick={() =>
                        window.dispatchEvent(
                          new CustomEvent("ignis:open-control-panel", {
                            detail: { tab: "keys" },
                          }),
                        )
                      }
                      className="shrink-0 rounded-full bg-ember px-3.5 py-1 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                    >
                      Configure AI Brain (⌘.) →
                    </button>
                  </div>
                );
              })()
            ) : null}
            <div
              className="flex w-full items-end gap-2 rounded-[1.5rem] border border-line bg-paper-raised py-1.5 pr-2 pl-3 shadow-elevated transition-colors focus-within:border-ember/60"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) fieldRef.current?.focus();
              }}
            >
              <textarea
                ref={fieldRef}
                rows={1}
                value={input}
                placeholder="Ask Ignis to build anything…"
                aria-label="Message Ignis"
                className="max-h-36 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-base leading-6 outline-none placeholder:text-muted sm:max-h-44"
                onChange={(event) => {
                  setInput(event.currentTarget.value);
                  resizeField(event.currentTarget);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    submit();
                  }
                }}
              />
              {busy ? (
                <button
                  type="button"
                  aria-label="Stop"
                  onClick={onStop}
                  className="mb-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-ink text-ink-inverse"
                >
                  <span className="size-2.5 rounded-[3px] bg-current" />
                </button>
              ) : (
                <button
                  type="submit"
                  aria-label="Send"
                  disabled={input.trim() === ""}
                  className="mb-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-ink text-ink-inverse transition-opacity disabled:opacity-30"
                >
                  <ArrowUpIcon />
                </button>
              )}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
