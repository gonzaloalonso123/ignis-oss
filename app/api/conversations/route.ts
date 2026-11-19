import { NextResponse } from "next/server";
import {
  getActiveRun,
  listActiveRunIds,
  spawnServerConversation,
  stopConversationRun,
  syncActiveRunMessages,
} from "@/lib/agent/conversation-runner";
import {
  compactConversation,
  deleteConversationSubtree,
  getConversation,
  listConversations,
  searchConversations,
  updateConversationTitle,
} from "@/lib/db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id")?.trim();
  const activeIds = listActiveRunIds();

  if (id) {
    const liveRun = getActiveRun(id);
    const conversation = getConversation(id);
    if (!conversation && !liveRun) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (liveRun) {
      return NextResponse.json({
        id,
        title: conversation?.title ?? null,
        slug: liveRun.slug ?? conversation?.slug ?? null,
        parent_id: liveRun.parentId ?? conversation?.parent_id ?? null,
        worktree: conversation?.worktree ?? null,
        ephemeral: conversation?.ephemeral ?? false,
        running: true,
        messages: liveRun.messages,
        created_at: conversation?.created_at ?? liveRun.startedAt,
        updated_at: liveRun.updatedAt,
      });
    }
    return NextResponse.json(conversation);
  }

  const query = searchParams.get("q")?.trim();
  const limitParam = Number(searchParams.get("limit") ?? "35");
  const limit = Number.isFinite(limitParam) ? Math.min(100, Math.max(1, limitParam)) : 35;
  const rawList = query
    ? searchConversations(query, limit)
    : listConversations(limit);

  const conversations = rawList.map((conv) => ({
    ...conv,
    running: Boolean(conv.running || activeIds.has(conv.id)),
  }));
  const runningIds = conversations.filter((c) => c.running).map((c) => c.id);

  return NextResponse.json({ conversations, runningIds });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      prompt?: string;
      id?: string;
      parentId?: string | null;
      slug?: string | null;
      label?: string | null;
      persist?: boolean;
      maxSteps?: number;
      wait?: boolean;
    };

    const prompt = body.prompt?.trim();
    if (!prompt) {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
    }

    const spawned = await spawnServerConversation({
      prompt,
      conversationId: body.id,
      parentId: body.parentId ?? null,
      slug: body.slug ?? body.label ?? null,
      persist: body.persist,
      maxSteps: body.maxSteps,
      source: "cli",
    });

    if (body.wait) {
      const messages = await spawned.completionPromise;
      return NextResponse.json({
        ok: true,
        conversationId: spawned.conversationId,
        parentId: spawned.parentId,
        slug: spawned.slug,
        label: spawned.slug || "node",
        ephemeral: spawned.ephemeral,
        running: false,
        messageCount: messages.length,
      });
    }

    return NextResponse.json({
      ok: true,
      conversationId: spawned.conversationId,
      parentId: spawned.parentId,
      slug: spawned.slug,
      label: spawned.slug || "node",
      ephemeral: spawned.ephemeral,
      running: true,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const body = (await req.json()) as {
      id?: string;
      title?: string;
      retitle?: boolean;
      keepLast?: number;
      summary?: string;
    };
    const id = body.id?.trim();
    if (!id) {
      return NextResponse.json({ error: "Missing conversation id" }, { status: 400 });
    }
    if (typeof body.title === "string" && body.title.trim()) {
      const updated = updateConversationTitle(id, body.title.trim());
      return NextResponse.json({ ok: updated, id, title: body.title.trim() });
    }
    if (body.retitle) {
      const conv = getConversation(id);
      if (!conv) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json({ ok: true, id, title: conv.title });
    }
    const res = compactConversation(id, {
      keepLast: body.keepLast,
      summary: body.summary,
    });
    const updated = getConversation(id);
    if (updated) {
      syncActiveRunMessages(id, updated.messages);
    }
    return NextResponse.json(res);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    let target = searchParams.get("id")?.trim();
    if (!target) {
      try {
        const body = (await req.json()) as { id?: string };
        target = body.id?.trim();
      } catch {
        // ignore
      }
    }
    if (!target) {
      return NextResponse.json({ error: "Missing conversation id" }, { status: 400 });
    }
    stopConversationRun(target);
    const res = deleteConversationSubtree(target);
    return NextResponse.json(res);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
