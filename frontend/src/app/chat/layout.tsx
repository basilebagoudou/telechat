import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/Sidebar";
import ChatShell from "@/components/ChatShell";
import type { ConversationListItem, Profile } from "@/lib/types";

export default async function ChatLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const { data: memberRows } = await supabase
    .from("conversation_members")
    .select("conversation_id")
    .eq("user_id", user.id);

  const conversationIds = (memberRows ?? []).map((r) => r.conversation_id);

  const { data: conversations } = conversationIds.length
    ? await supabase
        .from("conversations")
        .select("*")
        .in("id", conversationIds)
        .order("created_at", { ascending: false })
    : { data: [] };

  let conversationList: ConversationListItem[] = conversations ?? [];

  if (conversationIds.length) {
    const [{ data: allMembers }, { data: recentMessages }] = await Promise.all([
      supabase
        .from("conversation_members")
        .select("conversation_id, user_id, profile:profiles(*)")
        .in("conversation_id", conversationIds),
      supabase
        .from("messages")
        .select("conversation_id, content, media_type, created_at")
        .in("conversation_id", conversationIds)
        .order("created_at", { ascending: false })
        .limit(300),
    ]);

    const lastMessageByConversation = new Map<string, ConversationListItem["lastMessage"]>();
    for (const m of recentMessages ?? []) {
      if (!lastMessageByConversation.has(m.conversation_id)) {
        lastMessageByConversation.set(m.conversation_id, {
          content: m.content,
          media_type: m.media_type,
          created_at: m.created_at,
        });
      }
    }

    const otherProfileByConversation = new Map<string, Profile>();
    for (const row of allMembers ?? []) {
      if (row.user_id !== user.id && row.profile) {
        otherProfileByConversation.set(row.conversation_id, row.profile as unknown as Profile);
      }
    }

    conversationList = (conversations ?? []).map((c) => ({
      ...c,
      otherProfile: otherProfileByConversation.get(c.id),
      lastMessage: lastMessageByConversation.get(c.id),
    }));
  }

  return (
    <ChatShell
      userId={user.id}
      showOnlineStatus={profile?.show_online_status ?? true}
      sidebar={<Sidebar profile={profile} conversations={conversationList} />}
    >
      {children}
    </ChatShell>
  );
}
