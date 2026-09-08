import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SettingsView from "@/components/settings/SettingsView";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!profile) redirect("/login");

  const { data: blockedRows } = await supabase
    .from("blocked_users")
    .select("id, blocked_id")
    .eq("blocker_id", user.id);

  const blockedIds = (blockedRows ?? []).map((r) => r.blocked_id);

  const { data: blockedProfiles } = blockedIds.length
    ? await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", blockedIds)
    : { data: [] };

  const blockedUsers = (blockedRows ?? [])
    .map((row) => ({
      blockId: row.id,
      profile: (blockedProfiles ?? []).find((p) => p.id === row.blocked_id),
    }))
    .filter((b): b is { blockId: string; profile: NonNullable<typeof b.profile> } => Boolean(b.profile));

  return <SettingsView profile={profile} email={user.email ?? ""} initialBlockedUsers={blockedUsers} />;
}
