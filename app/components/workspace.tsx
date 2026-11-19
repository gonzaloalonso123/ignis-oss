"use client";

import { useIgnisWorkspace } from "@/lib/client/use-ignis-workspace";
import { ChatPane } from "./chat-pane";

export function Workspace() {
  const workspace = useIgnisWorkspace();

  return (
    <div className="h-dvh w-full overflow-hidden bg-paper text-ink">
      <ChatPane {...workspace} />
    </div>
  );
}
