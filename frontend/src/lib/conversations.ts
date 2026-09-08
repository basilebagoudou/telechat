import { createClient } from "@/lib/supabase/client";

export async function createDirectConversation(otherUserId: string, myUserId: string) {
  const supabase = createClient();

  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .insert({ type: "direct", created_by: myUserId })
    .select()
    .single();

  if (convError || !conversation) throw convError;

  // Two separate statements: the RLS check for the second row depends on the
  // first row already being visible, which a single multi-row insert can't guarantee.
  const { error: ownerError } = await supabase
    .from("conversation_members")
    .insert({ conversation_id: conversation.id, user_id: myUserId, role: "owner" });

  if (ownerError) throw ownerError;

  const { error: memberError } = await supabase
    .from("conversation_members")
    .insert({ conversation_id: conversation.id, user_id: otherUserId, role: "member" });

  if (memberError) throw memberError;

  return conversation;
}

export async function createGroupConversation(
  name: string,
  myUserId: string,
  memberIds: string[]
) {
  const supabase = createClient();

  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .insert({ type: "group", name, created_by: myUserId })
    .select()
    .single();

  if (convError || !conversation) throw convError;

  const { error: ownerError } = await supabase
    .from("conversation_members")
    .insert({ conversation_id: conversation.id, user_id: myUserId, role: "owner" });

  if (ownerError) throw ownerError;

  if (memberIds.length) {
    const { error: membersError } = await supabase.from("conversation_members").insert(
      memberIds.map((id) => ({ conversation_id: conversation.id, user_id: id, role: "member" }))
    );
    if (membersError) throw membersError;
  }

  return conversation;
}
