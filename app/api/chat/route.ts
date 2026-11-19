import { createUIMessageStreamResponse, type UIMessage } from "ai";
import { NextResponse } from "next/server";
import {
  startServerConversationTurn,
  stopConversationRun,
} from "@/lib/agent/conversation-runner";

export const maxDuration = 800;

export async function POST(req: Request) {
  const {
    messages,
    id,
    slug,
  }: { messages: UIMessage[]; id?: string; slug?: string | null } = await req.json();
  const conversationId = typeof id === "string" && id.trim() ? id.trim() : null;
  const nodeSlug = typeof slug === "string" && slug.trim() ? slug.trim() : null;

  const { clientStream } = await startServerConversationTurn({
    conversationId,
    messages,
    slug: nodeSlug,
    source: "chat",
  });

  return createUIMessageStreamResponse({
    stream: clientStream,
  });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  let id = searchParams.get("id")?.trim();
  if (!id) {
    try {
      const body = (await req.json()) as { id?: string };
      id = body.id?.trim();
    } catch {
      // ignore empty body
    }
  }
  if (!id) {
    return NextResponse.json({ error: "Missing conversation id" }, { status: 400 });
  }
  const stopped = stopConversationRun(id);
  return NextResponse.json({ ok: true, id, stopped });
}
