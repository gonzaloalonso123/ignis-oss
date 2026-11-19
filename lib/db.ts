import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { UIMessage } from "ai";

let cachedMainRepoRoot: string | null = null;

export function resolveMainRepoRoot(): string {
  if (process.env.IGNIS_REPO_ROOT) return path.resolve(process.env.IGNIS_REPO_ROOT);
  if (cachedMainRepoRoot) return cachedMainRepoRoot;
  try {
    const commonGit = execSync("git rev-parse --git-common-dir", {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (commonGit) {
      cachedMainRepoRoot = path.resolve(process.cwd(), commonGit, "..");
      return cachedMainRepoRoot;
    }
  } catch {
    // fallback to process.cwd()
  }
  cachedMainRepoRoot = process.cwd();
  return cachedMainRepoRoot;
}

export function resolveDefaultDbPath(): string {
  if (process.env.IGNIS_DB_PATH) return path.resolve(process.env.IGNIS_DB_PATH);
  return path.join(resolveMainRepoRoot(), "data", "ignis.db");
}

const globalForDb = globalThis as typeof globalThis & {
  ignisDb?: DatabaseSync;
  ignisDbPath?: string;
};

export type ConversationSummary = {
  id: string;
  title: string | null;
  slug?: string | null;
  parent_id?: string | null;
  worktree?: string | null;
  ephemeral?: boolean;
  running?: boolean;
  created_at: string;
  updated_at: string;
};

export type ConversationRecord = ConversationSummary & {
  messages: UIMessage[];
};

export type TreeNodeKind = "root" | "branch" | "leaf";

export type ConversationTreeLineage = {
  node: ConversationSummary | null;
  depth: number;
  nodeKind: TreeNodeKind;
  treePath: string | null;
  ancestorChain: ConversationSummary[];
  children: ConversationSummary[];
};

function openDatabase(targetDbPath: string) {
  mkdirSync(path.dirname(targetDbPath), { recursive: true });
  const db = new DatabaseSync(targetDbPath, { timeout: 5000 });
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT,
      slug TEXT,
      parent_id TEXT,
      worktree TEXT,
      ephemeral INTEGER NOT NULL DEFAULT 0,
      running INTEGER NOT NULL DEFAULT 0,
      messages TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);
  db.exec(
    "CREATE INDEX IF NOT EXISTS conversations_updated_at ON conversations (updated_at)",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS conversations_parent_id ON conversations (parent_id)",
  );

  db.prepare("SELECT count(*) FROM conversations").get();
  return db;
}

export function database() {
  const currentDbPath = resolveDefaultDbPath();
  if (globalForDb.ignisDb) {
    const pathChanged = globalForDb.ignisDbPath !== currentDbPath;
    const shmMissing = existsSync(currentDbPath) && !existsSync(`${currentDbPath}-shm`);
    if (pathChanged || shmMissing) {
      try {
        globalForDb.ignisDb.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      } catch {
        // ignore
      }
      try {
        (globalForDb.ignisDb as unknown as { close?: () => void }).close?.();
      } catch {
        // ignore
      }
      globalForDb.ignisDb = undefined;
      globalForDb.ignisDbPath = undefined;
    }
  }
  if (!globalForDb.ignisDb) {
    globalForDb.ignisDb = openDatabase(currentDbPath);
    globalForDb.ignisDbPath = currentDbPath;
  }
  return globalForDb.ignisDb;
}

export function extractAssistantTexts(messages: UIMessage[]): string[] {
  const texts: string[] = [];
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (part.type === "text" && part.text?.trim()) {
        texts.push(part.text.trim());
      }
    }
  }
  return texts;
}

export function firstUserPromptFrom(messages: UIMessage[]): string | null {
  for (const message of messages) {
    if (message.role !== "user") continue;
    if (message.id?.startsWith("compact_")) continue;
    for (const part of message.parts) {
      if (part.type === "text" && part.text.trim()) {
        if (part.text.trim().startsWith("[Compacted Session Checkpoint")) continue;
        return part.text.trim();
      }
    }
  }
  return null;
}

export function titleFrom(messages: UIMessage[]) {
  const prompt = firstUserPromptFrom(messages);
  return prompt ? prompt.slice(0, 120) : null;
}

function mergeMessages(rawExisting: UIMessage[], incoming: UIMessage[]): UIMessage[] {
  const existing = rawExisting.filter(
    (m) => !(m.role === "assistant" && (!m.parts || m.parts.length === 0)),
  );
  if (existing.length === 0) return incoming;

  // If SQLite was compacted (starts with a checkpoint_ message) and incoming still carries
  // the uncompacted historical prefix (e.g. from an in-flight turn closure or stale browser tab),
  // anchor incoming to the compacted tail so pre-compaction messages are never restored.
  let alignedIncoming = incoming;
  const existingCheckpoint = existing[0]?.id?.startsWith("compact_") ? existing[0] : null;
  if (existingCheckpoint && incoming[0]?.id !== existingCheckpoint.id) {
    let matchExistingIdx = -1;
    let matchIncomingIdx = -1;
    for (let i = 1; i < existing.length; i++) {
      const idx = incoming.findIndex((m) => m.id === existing[i].id);
      if (idx !== -1) {
        matchExistingIdx = i;
        matchIncomingIdx = idx;
        break;
      }
    }
    if (matchIncomingIdx !== -1) {
      alignedIncoming = [
        ...existing.slice(0, matchExistingIdx),
        ...incoming.slice(matchIncomingIdx),
      ];
    } else {
      const existingIds = new Set(existing.map((m) => m.id));
      alignedIncoming = [
        ...existing,
        ...incoming.filter((m) => !existingIds.has(m.id)),
      ];
    }
  }

  const merged = alignedIncoming.map((msg, idx) => {
    const prev = existing[idx];
    if (
      prev &&
      prev.role === "assistant" &&
      msg.role === "assistant" &&
      (prev.parts?.length ?? 0) > (msg.parts?.length ?? 0)
    ) {
      return prev;
    }
    return msg;
  });
  if (existing.length > merged.length && merged.at(-1)?.role !== "user") {
    return existing;
  }
  return merged;
}

let inSaveTransaction = false;

function resolveRunningFlag(
  id: string,
  runningVal: number | null | undefined,
  updatedAt: string,
): boolean {
  if (!runningVal) return false;
  const updatedMs = Date.parse(updatedAt);
  // Allow up to 11 minutes (above LONG_AGENT_TIMEOUT_MS = 600_000) before self-healing stale running flag
  if (!Number.isNaN(updatedMs) && Date.now() - updatedMs > 660_000) {
    if (!inSaveTransaction) {
      try {
        database().prepare("UPDATE conversations SET running = 0 WHERE id = ?").run(id);
      } catch {
        // ignore
      }
    }
    return false;
  }
  return true;
}

export function updateConversationTitle(id: string, title: string): boolean {
  const clean = title.trim();
  if (!clean) return false;
  try {
    const res = database()
      .prepare("UPDATE conversations SET title = ? WHERE id = ?")
      .run(clean, id) as { changes?: number | bigint };
    return Number(res.changes ?? 0) > 0;
  } catch {
    return false;
  }
}

export function setConversationRunning(id: string, running: boolean) {
  try {
    database()
      .prepare(
        `UPDATE conversations
         SET running = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?`,
      )
      .run(running ? 1 : 0, id);
  } catch {
    // ignore
  }
}

export function saveConversation(
  id: string,
  messages: UIMessage[],
  options?: {
    parentId?: string | null;
    slug?: string | null;
    worktree?: string | null;
    ephemeral?: boolean;
    running?: boolean;
    replaceMessages?: boolean;
  },
) {
  const db = database();
  let startedTx = false;
  if (!inSaveTransaction) {
    try {
      db.exec("BEGIN IMMEDIATE");
      inSaveTransaction = true;
      startedTx = true;
    } catch {
      startedTx = false;
    }
  }
  try {
    const existing = getConversation(id);
    const toSave =
      options?.replaceMessages || !existing
        ? messages
        : mergeMessages(existing.messages, messages);
    const title = existing?.title ?? titleFrom(toSave);
    const parentId = options?.parentId ?? existing?.parent_id ?? null;
    const slug = options?.slug ?? existing?.slug ?? null;
    const worktree = options?.worktree ?? existing?.worktree ?? null;
    const ephemeralInt =
      options?.ephemeral !== undefined
        ? options.ephemeral
          ? 1
          : 0
        : existing?.ephemeral
          ? 1
          : 0;
    const runningInt =
      options?.running !== undefined
        ? options.running
          ? 1
          : 0
        : existing?.running
          ? 1
          : 0;

    db.prepare(
      `INSERT INTO conversations (id, title, slug, parent_id, worktree, ephemeral, running, messages)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         messages = excluded.messages,
         title = COALESCE(conversations.title, excluded.title),
         slug = COALESCE(excluded.slug, conversations.slug),
         parent_id = COALESCE(conversations.parent_id, excluded.parent_id),
         worktree = COALESCE(excluded.worktree, conversations.worktree),
         ephemeral = excluded.ephemeral,
         running = excluded.running,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    ).run(
      id,
      title,
      slug,
      parentId,
      worktree,
      ephemeralInt,
      runningInt,
      JSON.stringify(toSave),
    );
    if (startedTx && inSaveTransaction) {
      db.exec("COMMIT");
      inSaveTransaction = false;
    }
    return toSave;
  } catch (err) {
    if (startedTx && inSaveTransaction) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // ignore
      }
      inSaveTransaction = false;
    }
    throw err;
  }
}

type RawSummaryRow = {
  id: string;
  title: string | null;
  slug: string | null;
  parent_id: string | null;
  worktree: string | null;
  ephemeral: number;
  running: number;
  created_at: string;
  updated_at: string;
};

function mapSummaryRow(r: RawSummaryRow): ConversationSummary {
  return {
    id: r.id,
    title: r.title,
    slug: r.slug,
    parent_id: r.parent_id,
    worktree: r.worktree,
    ephemeral: Boolean(r.ephemeral),
    running: resolveRunningFlag(r.id, r.running, r.updated_at),
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export function getConversationSummaryByIdOrSlug(idOrSlug: string): ConversationSummary | null {
  const clean = idOrSlug.trim().replace(/^\/+/, "");
  if (!clean) return null;
  const byId = getConversationSummary(clean);
  if (byId) return byId;
  try {
    const row = database()
      .prepare(
        `SELECT id, title, slug, parent_id, worktree, ephemeral, running, created_at, updated_at
         FROM conversations
         WHERE slug = ?
         ORDER BY updated_at DESC
         LIMIT 1`,
      )
      .get(sanitizeSlug(clean)) as RawSummaryRow | undefined;
    return row ? mapSummaryRow(row) : null;
  } catch {
    return null;
  }
}

export function getConversationByIdOrSlug(idOrSlug: string): ConversationRecord | null {
  const summary = getConversationSummaryByIdOrSlug(idOrSlug);
  return summary ? getConversation(summary.id) : null;
}

export function getConversationSummary(id: string): ConversationSummary | null {
  try {
    const row = database()
      .prepare(
        `SELECT id, title, slug, parent_id, worktree, ephemeral, running, created_at, updated_at
         FROM conversations
         WHERE id = ?`,
      )
      .get(id) as RawSummaryRow | undefined;
    return row ? mapSummaryRow(row) : null;
  } catch {
    return null;
  }
}

export function sanitizeSlug(raw?: string | null): string {
  if (!raw) return "";
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function computeTreePathFromChain(
  ancestorChain: Array<{ id: string; slug?: string | null; parent_id?: string | null }>,
  ownSlug: string,
  ownId?: string | null,
  depth = 0,
): string | null {
  const segs: string[] = [];
  for (let i = 0; i < ancestorChain.length; i++) {
    const anc = ancestorChain[i];
    if (i === 0 && !anc.parent_id && !anc.slug) continue;
    segs.push(sanitizeSlug(anc.slug) || anc.id.slice(0, 8));
  }
  if (depth > 0) {
    const ownSeg = ownSlug || (ownId ? ownId.slice(0, 8) : "node");
    if (segs.at(-1) !== ownSeg) segs.push(ownSeg);
  }
  return segs.length > 0 ? segs.join("/") : null;
}

export function getConversationTreeLineage(
  id?: string | null,
  fallbackParentId?: string | null,
  fallbackSlug?: string | null,
): ConversationTreeLineage {
  const db = database();
  const node = id ? getConversationSummary(id) : null;
  const ancestorsReversed: ConversationSummary[] = [];
  const visited = new Set<string>();
  if (id) visited.add(id);

  let cursorParentId = node?.parent_id ?? fallbackParentId ?? null;
  while (cursorParentId && !visited.has(cursorParentId) && ancestorsReversed.length < 16) {
    visited.add(cursorParentId);
    const parentSummary = getConversationSummary(cursorParentId);
    if (!parentSummary) break;
    ancestorsReversed.push(parentSummary);
    cursorParentId = parentSummary.parent_id ?? null;
  }

  const ancestorChain = ancestorsReversed.reverse();
  const effectiveOwnSlug = sanitizeSlug(node?.slug ?? fallbackSlug);
  const depth =
    ancestorChain.length > 0
      ? ancestorChain.length + (ancestorChain[0]?.slug && !ancestorChain[0]?.parent_id ? 1 : 0)
      : !node && fallbackParentId
        ? 1
        : effectiveOwnSlug
          ? 1
          : 0;

  let children: ConversationSummary[] = [];
  if (id) {
    try {
      const childRows = db
        .prepare(
          `SELECT id, title, slug, parent_id, worktree, ephemeral, running, created_at, updated_at
           FROM conversations
           WHERE parent_id = ?
           ORDER BY created_at ASC`,
        )
        .all(id) as RawSummaryRow[];
      children = childRows.map(mapSummaryRow);
    } catch {
      children = [];
    }
  }

  const nodeKind: TreeNodeKind =
    depth === 0 ? "root" : children.length > 0 ? "branch" : "leaf";

  const treePath = computeTreePathFromChain(ancestorChain, effectiveOwnSlug, id, depth);

  return {
    node,
    depth,
    nodeKind,
    treePath,
    ancestorChain,
    children,
  };
}

export function listConversations(limit = 35): ConversationSummary[] {
  const db = database();
  const rows = db
    .prepare(
      `SELECT id, title, slug, parent_id, worktree, ephemeral, running, created_at, updated_at
       FROM conversations
       WHERE ephemeral = 0 OR running = 1
       ORDER BY updated_at DESC
       LIMIT ?`,
    )
    .all(limit) as Array<RawSummaryRow>;

  const byId = new Map<string, ConversationSummary>();
  for (const r of rows) {
    const mapped = mapSummaryRow(r);
    if (!mapped.ephemeral || mapped.running) {
      byId.set(mapped.id, mapped);
    }
  }

  try {
    const initialIds = Array.from(byId.keys());
    if (initialIds.length > 0) {
      const initPlaceholders = initialIds.map(() => "?").join(", ");
      const ancestorRows = db
        .prepare(
          `WITH RECURSIVE anc(id, title, slug, parent_id, worktree, ephemeral, running, created_at, updated_at, depth) AS (
             SELECT c.id, c.title, c.slug, c.parent_id, c.worktree, c.ephemeral, c.running, c.created_at, c.updated_at, 1
             FROM conversations c
             WHERE c.id IN (SELECT parent_id FROM conversations WHERE id IN (${initPlaceholders}) AND parent_id IS NOT NULL)
             UNION ALL
             SELECT p.id, p.title, p.slug, p.parent_id, p.worktree, p.ephemeral, p.running, p.created_at, p.updated_at, anc.depth + 1
             FROM conversations p
             JOIN anc ON p.id = anc.parent_id
             WHERE anc.depth < 12
           )
           SELECT DISTINCT id, title, slug, parent_id, worktree, ephemeral, running, created_at, updated_at FROM anc`,
        )
        .all(...initialIds) as RawSummaryRow[];
      for (const ar of ancestorRows) {
        if (!byId.has(ar.id)) {
          byId.set(ar.id, mapSummaryRow(ar));
        }
      }

      const allParentIds = Array.from(byId.keys());
      const placeholders = allParentIds.map(() => "?").join(", ");
      const childRows = db
        .prepare(
          `SELECT id, title, slug, parent_id, worktree, ephemeral, running, created_at, updated_at
           FROM conversations
           WHERE parent_id IN (${placeholders})
           ORDER BY created_at ASC`,
        )
        .all(...allParentIds) as RawSummaryRow[];
      for (const cr of childRows) {
        const mapped = mapSummaryRow(cr);
        if (!byId.has(mapped.id)) {
          byId.set(mapped.id, mapped);
        }
      }
    }
  } catch {
    // ignore
  }

  return Array.from(byId.values()).sort((a, b) =>
    b.updated_at.localeCompare(a.updated_at),
  );
}

export function searchConversations(query: string, limit = 15): ConversationSummary[] {
  const pattern = `%${query.trim()}%`;
  const rows = database()
    .prepare(
      `SELECT id, title, slug, parent_id, worktree, ephemeral, running, created_at, updated_at
       FROM conversations
       WHERE (ephemeral = 0 OR running = 1) AND (title LIKE ? OR messages LIKE ?)
       ORDER BY updated_at DESC
       LIMIT ?`,
    )
    .all(pattern, pattern, limit) as Array<RawSummaryRow>;
  return rows.map(mapSummaryRow);
}

export function getConversation(id: string): ConversationRecord | null {
  const row = database()
    .prepare(
      `SELECT id, title, slug, parent_id, worktree, ephemeral, running, messages, created_at, updated_at
       FROM conversations
       WHERE id = ?`,
    )
    .get(id) as
    | {
        id: string;
        title: string | null;
        slug: string | null;
        parent_id: string | null;
        worktree: string | null;
        ephemeral: number;
        running: number;
        messages: string;
        created_at: string;
        updated_at: string;
      }
    | undefined;
  if (!row) return null;
  try {
    const messages = JSON.parse(row.messages) as UIMessage[];
    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      parent_id: row.parent_id,
      worktree: row.worktree,
      ephemeral: Boolean(row.ephemeral),
      running: resolveRunningFlag(row.id, row.running, row.updated_at),
      messages,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  } catch {
    return null;
  }
}

/**
 * Deletes a conversation node (by ID or slug) and all of its descendant child conversations,
 * and cleans up any corresponding `memory/tree/<treePath>` folders on disk if no other
 * persistent conversation references them.
 */
export function deleteConversationSubtree(
  idOrSlug: string,
  repoRoot = process.cwd(),
): {
  ok: boolean;
  deletedIds: string[];
  removedPaths: string[];
} {
  const db = database();
  const cleanTarget = idOrSlug.trim().replace(/^\/+/, "");
  if (!cleanTarget) {
    return { ok: false, deletedIds: [], removedPaths: [] };
  }

  const rootNode = getConversationSummaryByIdOrSlug(cleanTarget);
  const deletedIds: string[] = [];
  const candidateTreePaths = new Set<string>();

  if (rootNode) {
    const queue = [rootNode.id];
    const visited = new Set<string>();
    while (queue.length > 0) {
      const currId = queue.shift()!;
      if (visited.has(currId)) continue;
      visited.add(currId);
      deletedIds.push(currId);

      const lineage = getConversationTreeLineage(currId);
      if (lineage.treePath) {
        candidateTreePaths.add(lineage.treePath);
      }

      const childRows = db
        .prepare("SELECT id FROM conversations WHERE parent_id = ?")
        .all(currId) as Array<{ id: string }>;
      for (const ch of childRows) {
        if (!visited.has(ch.id)) queue.push(ch.id);
      }
    }

    const delStmt = db.prepare("DELETE FROM conversations WHERE id = ?");
    for (const delId of deletedIds) {
      delStmt.run(delId);
    }
  } else {
    candidateTreePaths.add(cleanTarget);
  }

  const activePaths = new Set<string>();
  if (candidateTreePaths.size > 0) {
    const remainingRows = db
      .prepare("SELECT id FROM conversations WHERE ephemeral = 0 AND (parent_id IS NOT NULL OR slug IS NOT NULL)")
      .all() as Array<{ id: string }>;
    for (const r of remainingRows) {
      const tp = getConversationTreeLineage(r.id).treePath;
      if (tp) activePaths.add(tp);
    }
  }

  const removedPaths: string[] = [];
  const sortedPaths = Array.from(candidateTreePaths).sort((a, b) => b.length - a.length);
  for (const relTreePath of sortedPaths) {
    if (!relTreePath || relTreePath.includes("..")) continue;
    if (activePaths.has(relTreePath)) continue;
    const absMemDir = path.join(repoRoot, "memory", "tree", relTreePath);
    if (existsSync(absMemDir)) {
      rmSync(absMemDir, { recursive: true, force: true });
      removedPaths.push(`memory/tree/${relTreePath}`);
    }
  }

  return {
    ok: deletedIds.length > 0 || removedPaths.length > 0,
    deletedIds,
    removedPaths,
  };
}

/**
 * Compacts bulky tool outputs and older turns for model context hygiene while keeping
 * recent working turns intact.
 */
export function compactMessagesForModel(
  messages: UIMessage[],
  options?: {
    recentTurnsToKeepFull?: number;
    maxOldToolOutputChars?: number;
    quantizeCutoff?: boolean;
  },
): UIMessage[] {
  const recentFull = options?.recentTurnsToKeepFull ?? 8;
  const maxToolChars = options?.maxOldToolOutputChars ?? 500;

  if (messages.length <= recentFull) {
    return messages;
  }

  const rawCutoff = messages.length - recentFull;
  // Quantize cutoff in 8-message blocks by default so historical prefix hashes remain
  // immutable across consecutive turns and preserve Gemini implicit prefix caching.
  const cutoff =
    options?.quantizeCutoff === false
      ? rawCutoff
      : Math.floor(rawCutoff / 8) * 8;
  if (cutoff <= 0) {
    return messages;
  }
  return messages.map((msg, idx) => {
    if (idx >= cutoff || msg.role !== "assistant" || !Array.isArray(msg.parts)) {
      return msg;
    }
    const compactedParts = msg.parts.map((part) => {
      const anyPart = part as Record<string, unknown>;
      if (
        typeof anyPart.type === "string" &&
        anyPart.type.startsWith("tool-") &&
        anyPart.state === "output-available" &&
        anyPart.output &&
        typeof anyPart.output === "object"
      ) {
        const out = anyPart.output as Record<string, unknown>;
        const trimText = (s: string) =>
          s.length > maxToolChars
            ? `${s.slice(0, Math.floor(maxToolChars * 0.65))}\n...[compacted ${s.length - maxToolChars} chars]...\n${s.slice(-Math.floor(maxToolChars * 0.35))}`
            : s;
        let mutated = false;
        const nextOut: Record<string, unknown> = { ...out };
        for (const key of ["stdout", "stderr", "text", "assistantText"]) {
          const val = out[key];
          if (typeof val === "string" && val.length > maxToolChars) {
            nextOut[key] = trimText(val);
            mutated = true;
          }
        }
        if (!mutated) {
          return part;
        }
        return {
          ...anyPart,
          output: nextOut,
        } as unknown as UIMessage["parts"][number];
      }
      return part;
    });
    return { ...msg, parts: compactedParts };
  });
}

/**
 * Distills older turns of a living conversation into its node `context.md` (when summary is provided
 * or for persistent persistent nodes) and compacts the conversation's stored `messages` array down to a
 * checkpoint + the last `keepLast` messages so a persistent conversation can run indefinitely without bloating.
 */
export function compactConversation(
  id: string,
  options?: {
    keepLast?: number;
    summary?: string;
    repoRoot?: string;
  },
): {
  ok: boolean;
  conversationId: string;
  treePath: string | null;
  contextFile: string;
  previousMessageCount: number;
  newMessageCount: number;
  compactedCount: number;
  summaryWritten: string;
} {
  const conv = getConversation(id);
  if (!conv) {
    throw new Error(`Conversation not found: ${id}`);
  }

  const repoRoot = options?.repoRoot ?? process.cwd();
  const keepLast = Math.max(2, options?.keepLast ?? 6);
  const lineage = getConversationTreeLineage(id, conv.parent_id, conv.slug);
  const treePath = lineage.treePath;
  const contextFile = treePath
    ? `memory/tree/${treePath}/context.md`
    : "memory/tree/context.md";

  const previousMessageCount = conv.messages.length;
  const splitIndex = Math.max(0, previousMessageCount - keepLast);
  const olderMessages = conv.messages.slice(0, splitIndex);
  const recentMessages = compactMessagesForModel(conv.messages.slice(splitIndex), {
    recentTurnsToKeepFull: keepLast,
  });

  // Build a deterministic digest of the older messages if no explicit summary was supplied
  const digestBullets: string[] = [];
  for (const m of olderMessages) {
    const textParts = (m.parts || [])
      .filter((p): p is { type: "text"; text: string } => p.type === "text" && Boolean(p.text?.trim()))
      .map((p) => p.text.trim().replace(/\s+/g, " "));
    if (textParts.length > 0) {
      const joined = textParts.join(" ").slice(0, 220);
      digestBullets.push(`- [${m.role}] ${joined}${joined.length >= 220 ? "…" : ""}`);
    }
  }

  const effectiveSummary =
    options?.summary?.trim() ||
    (digestBullets.length > 0
      ? digestBullets.slice(-8).join("\n")
      : `Compacted ${olderMessages.length} earlier messages.`);

  // Persist explicit summary into the node's context.md if provided (or if this is a persistent child node)
  if (options?.summary?.trim() || (treePath && !conv.ephemeral)) {
    const absContext = path.join(repoRoot, contextFile);
    mkdirSync(path.dirname(absContext), { recursive: true });
    const stamp = new Date().toISOString().slice(0, 19).replace("T", " ");
    const existingMd = existsSync(absContext) ? readFileSync(absContext, "utf8") : "";
    const entry = `\n### Compacted Session Checkpoint (${stamp} UTC)\n${effectiveSummary}\n`;
    if (existingMd.includes("## Distilled Checkpoints")) {
      writeFileSync(absContext, `${existingMd.trimEnd()}\n${entry}`, "utf8");
    } else {
      writeFileSync(
        absContext,
        `${existingMd.trimEnd()}\n\n## Distilled Checkpoints\n${entry}`,
        "utf8",
      );
    }
  }

  let nextMessages: UIMessage[];
  if (olderMessages.length > 0) {
    const checkpointMessage: UIMessage = {
      id: `compact_${Date.now().toString(36)}`,
      role: "user",
      parts: [
        {
          type: "text",
          text: `[Compacted Session Checkpoint — ${olderMessages.length} earlier messages distilled into ${contextFile}]\n${effectiveSummary}`,
        },
      ],
    };
    nextMessages = [checkpointMessage, ...recentMessages];
  } else {
    nextMessages = recentMessages;
  }

  saveConversation(id, nextMessages, {
    parentId: conv.parent_id,
    slug: conv.slug,
    worktree: conv.worktree,
    ephemeral: conv.ephemeral,
    running: conv.running,
    replaceMessages: true,
  });

  return {
    ok: true,
    conversationId: id,
    treePath,
    contextFile,
    previousMessageCount,
    newMessageCount: nextMessages.length,
    compactedCount: olderMessages.length,
    summaryWritten: effectiveSummary,
  };
}
