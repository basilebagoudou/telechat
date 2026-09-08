import type { SupabaseClient } from "@supabase/supabase-js";
import type { Message } from "./types";

type ReplyPreviewRow = {
  id: string;
  content: string | null;
  media_type: Message["media_type"];
  sender: { display_name: string } | { display_name: string }[] | null;
};

// PostgREST's embedded-resource syntax is ambiguous for a self-referencing
// FK like messages.reply_to -> messages.id: hinting by the constraint name
// fails to resolve at all, and hinting by the column name resolves to the
// reverse (child) relationship instead of the parent message being replied
// to. A separate lookup query sidesteps the ambiguity entirely.
export async function attachReplyPreviews(
  supabase: SupabaseClient,
  messages: Message[]
): Promise<Message[]> {
  const replyIds = Array.from(
    new Set(messages.map((m) => m.reply_to).filter((id): id is string => Boolean(id)))
  );
  if (!replyIds.length) return messages;

  const { data: replies } = await supabase
    .from("messages")
    .select("id, content, media_type, sender:profiles(display_name)")
    .in("id", replyIds);

  const byId = new Map<string, NonNullable<Message["reply_to_message"]>>(
    ((replies ?? []) as ReplyPreviewRow[]).map((r) => [
      r.id,
      {
        id: r.id,
        content: r.content,
        media_type: r.media_type,
        sender: Array.isArray(r.sender) ? r.sender[0] : (r.sender ?? undefined),
      },
    ])
  );

  return messages.map((m) =>
    m.reply_to ? { ...m, reply_to_message: byId.get(m.reply_to) ?? null } : m
  );
}
