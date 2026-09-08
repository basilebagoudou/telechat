import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { attachReplyPreviews } from "@/lib/messages";
import ChatRoom from "@/components/ChatRoom";
import type { Message } from "@/lib/types";

export default async function ConversationPage(props: PageProps<"/chat/[conversationId]">) {
  const { conversationId } = await props.params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: conversation } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", conversationId)
    .single();

  if (!conversation) notFound();

  const { data: members } = await supabase
    .from("conversation_members")
    .select("*, profile:profiles(*)")
    .eq("conversation_id", conversationId);

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();

  const { data: rawMessages } = await supabase
    .from("messages")
    .select("*, sender:profiles(*), reactions:message_reactions(*)")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(200);

  const messages = await attachReplyPreviews(supabase, (rawMessages ?? []) as Message[]);

  return (
    <ChatRoom
      conversation={conversation}
      initialMessages={messages}
      members={members ?? []}
      currentUserId={user.id}
      currentUserName={profile?.display_name ?? "Toi"}
    />
  );
}
