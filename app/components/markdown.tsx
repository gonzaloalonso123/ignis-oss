"use client";

import { useState, type ComponentProps } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { CheckIcon, CopyIcon } from "./ui";

const LATEX_SYMBOLS: Record<string, string> = {
  rightarrow: "→",
  to: "→",
  longrightarrow: "→",
  leftarrow: "←",
  gets: "←",
  longleftarrow: "←",
  leftrightarrow: "↔",
  longleftrightarrow: "↔",
  Rightarrow: "⇒",
  implies: "⇒",
  Longrightarrow: "⇒",
  Leftarrow: "⇐",
  Longleftarrow: "⇐",
  Leftrightarrow: "⇔",
  iff: "⇔",
  Longleftrightarrow: "⇔",
  uparrow: "↑",
  downarrow: "↓",
  mapsto: "↦",
  le: "≤",
  leq: "≤",
  ge: "≥",
  geq: "≥",
  ne: "≠",
  neq: "≠",
  approx: "≈",
  equiv: "≡",
  sim: "∼",
  propto: "∝",
  times: "×",
  div: "÷",
  cdot: "·",
  pm: "±",
  mp: "∓",
  infty: "∞",
  partial: "∂",
  nabla: "∇",
  forall: "∀",
  exists: "∃",
  in: "∈",
  notin: "∉",
  subset: "⊂",
  subseteq: "⊆",
  cup: "∪",
  cap: "∩",
  emptyset: "∅",
  varnothing: "∅",
  checkmark: "✓",
  dots: "…",
  ldots: "…",
  cdots: "…",
  quad: " ",
  qquad: "  ",
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  Delta: "Δ",
  epsilon: "ε",
  varepsilon: "ε",
  zeta: "ζ",
  eta: "η",
  theta: "θ",
  Theta: "Θ",
  lambda: "λ",
  Lambda: "Λ",
  mu: "μ",
  nu: "ν",
  xi: "ξ",
  pi: "π",
  Pi: "Π",
  rho: "ρ",
  sigma: "σ",
  Sigma: "Σ",
  tau: "τ",
  phi: "φ",
  Phi: "Φ",
  chi: "χ",
  psi: "ψ",
  Psi: "Ψ",
  omega: "ω",
  Omega: "Ω",
};

const SUBSCRIPTS: Record<string, string> = {
  "0": "₀",
  "1": "₁",
  "2": "₂",
  "3": "₃",
  "4": "₄",
  "5": "₅",
  "6": "₆",
  "7": "₇",
  "8": "₈",
  "9": "₉",
  n: "ₙ",
  i: "ᵢ",
  k: "ₖ",
};

const SUPERSCRIPTS: Record<string, string> = {
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
  n: "ⁿ",
};

function renderLatexInner(expr: string): string {
  return expr
    .replace(/\\(?:text|textbf|mathrm|mathbf|mathit|texttt)\{([^{}]*)\}/g, "$1")
    .replace(/\\([a-zA-Z]+)/g, (full, cmd: string) => LATEX_SYMBOLS[cmd] ?? full)
    .replace(/\\%/g, "%")
    .replace(/\\,/g, " ")
    .replace(/\\;/g, " ")
    .replace(/\\_\{?([0-9nik])\}?/g, "_$1")
    .replace(/_\{([0-9nik]+)\}/g, (_, chars: string) =>
      chars
        .split("")
        .map((c) => SUBSCRIPTS[c] ?? c)
        .join(""),
    )
    .replace(/_([0-9nik])\b/g, (_, c: string) => SUBSCRIPTS[c] ?? `_${c}`)
    .replace(/\^\{([0-9n]+)\}/g, (_, chars: string) =>
      chars
        .split("")
        .map((c) => SUPERSCRIPTS[c] ?? c)
        .join(""),
    )
    .replace(/\^([0-9n])\b/g, (_, c: string) => SUPERSCRIPTS[c] ?? `^${c}`)
    .trim();
}

export function normalizeInlineLatex(source: string): string {
  const segments = source.split(/(```[\s\S]*?```|`[^`\n]+`)/g);
  return segments
    .map((segment, index) => {
      if (index % 2 === 1) return segment;
      return (
        segment
          .replace(/\$(\s*\\[a-zA-Z]+[^$\n]{0,80}?)\$/g, (_, inner: string) =>
            renderLatexInner(inner),
          )
          .replace(/\$(\d+(?:\.\d+)?\s*\\[a-zA-Z]+[^$\n]{0,40}?)\$/g, (_, inner: string) =>
            renderLatexInner(inner),
          )
          .replace(
            /\$([a-zA-Z][a-zA-Z0-9_^{}\s\\+\-=<>(),./:%-]{0,80}?)\$/g,
            (full, inner: string) => {
              if (!/\\[a-zA-Z]+|_[0-9nik]|\^[0-9n]/.test(inner)) return full;
              return renderLatexInner(inner);
            },
          )
          .replace(
            /\\(rightarrow|leftarrow|leftrightarrow|Rightarrow|Leftarrow|Leftrightarrow|implies|iff|times|approx|neq|leq|geq)\b/g,
            (full, cmd: string) => LATEX_SYMBOLS[cmd] ?? full,
          )
      );
    })
    .join("");
}

function CopySnippetButton({
  text,
  className = "",
  label = "Copy",
}: {
  text: string;
  className?: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    if (!text) return;
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? "Copied to clipboard" : label}
      title={copied ? "Copied" : label}
      className={`inline-flex items-center gap-1 rounded-md border border-line bg-paper-raised px-2 py-0.5 font-mono text-xs text-muted transition-colors hover:text-ink ${className}`}
    >
      {copied ? (
        <>
          <CheckIcon size={11} />
          <span>Copied</span>
        </>
      ) : (
        <>
          <CopyIcon size={11} />
          <span>{label}</span>
        </>
      )}
    </button>
  );
}

function extractNodeText(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractNodeText).join("");
  if (node && typeof node === "object" && "props" in node) {
    const props = (node as { props?: { children?: unknown } }).props;
    return extractNodeText(props?.children);
  }
  return "";
}

const components: Components = {
  a({ href, children }) {
    const external = href?.startsWith("http://") || href?.startsWith("https://");
    return (
      <a href={href} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined}>
        {children}
      </a>
    );
  },
  table({ children }) {
    return (
      <div className="markdown-table">
        <table>{children}</table>
      </div>
    );
  },
  input({ type, checked, ...props }: ComponentProps<"input">) {
    if (type === "checkbox") {
      return (
        <input
          type="checkbox"
          checked={checked}
          readOnly
          className="mr-1.5 inline-block size-3.5 translate-y-px rounded accent-ember"
          {...props}
        />
      );
    }
    return <input type={type} checked={checked} {...props} />;
  },
  img({ src, alt }: ComponentProps<"img">) {
    if (!src) return null;
    const srcStr = typeof src === "string" ? src : undefined;
    return (
      <a href={srcStr} target="_blank" rel="noreferrer" className="my-2 block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={srcStr}
          alt={alt || "Snapshot"}
          className="max-h-96 w-auto rounded-lg border border-line bg-recess object-contain shadow-xs"
        />
      </a>
    );
  },
  pre({ children, ...props }: ComponentProps<"pre">) {
    const rawCode = extractNodeText(children).replace(/\n$/, "");
    return (
      <div className="group/code relative my-3">
        <CopySnippetButton
          text={rawCode}
          className="absolute top-2 right-2 z-10 opacity-85 shadow-2xs transition-opacity group-hover/code:opacity-100"
        />
        <pre {...props}>{children}</pre>
      </div>
    );
  },
  code({ className, children, ...props }: ComponentProps<"code">) {
    const isDiff = typeof className === "string" && className.includes("language-diff");
    if (isDiff) {
      const raw = String(children ?? "").replace(/\n$/, "");
      const lines = raw.split("\n");
      return (
        <code className={className} {...props}>
          {lines.map((line, i) => {
            let color = "text-ink";
            let bg = "";
            if (line.startsWith("+") && !line.startsWith("+++")) {
              color = "text-ok";
              bg = "bg-ok/10";
            } else if (line.startsWith("-") && !line.startsWith("---")) {
              color = "text-bad";
              bg = "bg-bad/10";
            } else if (line.startsWith("@@")) {
              color = "text-info";
            }
            return (
              <span key={i} className={`block px-1.5 -mx-1.5 rounded-xs ${color} ${bg}`}>
                {line}
              </span>
            );
          })}
        </code>
      );
    }
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
};

function closeOpenFence(source: string) {
  let fences = 0;
  const marks = /```/g;
  while (marks.exec(source)) fences += 1;
  if (fences % 2 === 1) return `${source}\n\`\`\``;
  return source;
}

export function MessageMarkdown({
  text,
  streaming = false,
  breaks = false,
  copyable = false,
}: {
  text: string;
  streaming?: boolean;
  breaks?: boolean;
  copyable?: boolean;
}) {
  const closed = streaming ? closeOpenFence(text) : text;
  const source = normalizeInlineLatex(closed);
  return (
    <div className="group/msg relative">
      <div className={`markdown${breaks ? " markdown-plain" : ""}${streaming ? " streaming" : ""}`}>
        <Markdown remarkPlugins={breaks ? [remarkGfm, remarkBreaks] : [remarkGfm]} components={components}>
          {source}
        </Markdown>
      </div>
      {copyable && !streaming && text.trim().length > 0 ? (
        <div className="mt-1.5 flex justify-end opacity-0 transition-opacity focus-within:opacity-100 group-hover/msg:opacity-100">
          <CopySnippetButton text={text} label="Copy message" />
        </div>
      ) : null}
    </div>
  );
}
