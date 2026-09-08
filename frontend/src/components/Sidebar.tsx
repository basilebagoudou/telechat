"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import NewConversationModal from "./NewConversationModal";
import Avatar from "./Avatar";
import { formatConversationTime, messagePreview } from "@/lib/format";
import type { ConversationListItem, Profile } from "@/lib/types";

function conversationTitle(c: ConversationListItem) {
  if (c.name) return c.name;
  if (c.type === "direct") return c.otherProfile?.display_name ?? "Discussion privée";
  return "Groupe";
}

export default function Sidebar({
  profile,
  conversations,
}: {
  profile: Profile | null;
  conversations: ConversationListItem[];
}) {
  const [showModal, setShowModal] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();
  const params = useParams<{ conversationId?: string }>();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const sorted = useMemo(
    () =>
      [...conversations].sort((a, b) => {
        const at = a.lastMessage?.created_at ?? a.created_at;
        const bt = b.lastMessage?.created_at ?? b.created_at;
        return new Date(bt).getTime() - new Date(at).getTime();
      }),
    [conversations]
  );

  const filtered = query.trim()
    ? sorted.filter((c) => conversationTitle(c).toLowerCase().includes(query.trim().toLowerCase()))
    : sorted;

  return (
    <aside className="flex w-full shrink-0 flex-col bg-tg-sidebar-bg border-r border-tg-sidebar-border md:w-80">
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <Link
          href="/settings"
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left hover:bg-tg-row-hover"
          title="Paramètres"
        >
          <Avatar name={profile?.display_name ?? "?"} url={profile?.avatar_url} size={40} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-[15px] leading-tight">{profile?.display_name}</p>
            <p className="truncate text-xs text-tg-muted">@{profile?.username}</p>
          </div>
        </Link>
        <button
          onClick={handleLogout}
          title="Déconnexion"
          className="shrink-0 rounded-full p-2 text-tg-muted transition-colors hover:bg-tg-row-hover hover:text-tg-blue active:scale-95"
        >
          ⏻
        </button>
      </div>

      <div className="flex items-center gap-2 px-3 pb-2">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tg-muted">
            🔍
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher"
            className="w-full rounded-full bg-tg-row-hover px-9 py-2 text-sm outline-none placeholder:text-tg-muted transition-shadow focus:ring-2 focus:ring-tg-blue/30"
          />
        </div>
        <button
          onClick={() => setShowModal(true)}
          title="Nouvelle discussion"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-tg-blue text-lg text-white shadow-sm transition-transform hover:bg-tg-blue-dark active:scale-95"
        >
          ✎
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto overscroll-contain">
        {filtered.map((c) => {
          const isActive = params?.conversationId === c.id;
          const title = conversationTitle(c);
          const preview = messagePreview(c.lastMessage);
          const time = c.lastMessage?.created_at ?? c.created_at;

          return (
            <Link
              key={c.id}
              href={`/chat/${c.id}`}
              className={`flex items-center gap-3 border-l-[3px] py-2.5 pr-4 pl-[13px] transition-colors ${
                isActive
                  ? "border-tg-blue bg-tg-row-active"
                  : "border-transparent hover:bg-tg-row-hover"
              }`}
            >
              <Avatar
                name={title}
                url={c.type === "direct" ? c.otherProfile?.avatar_url : c.avatar_url}
                size={48}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate font-medium text-[15px] leading-tight">{title}</p>
                  <span className="shrink-0 text-[11px] text-tg-muted" suppressHydrationWarning>
                    {formatConversationTime(time)}
                  </span>
                </div>
                <p className="truncate text-sm text-tg-muted">{preview}</p>
              </div>
            </Link>
          );
        })}

        {filtered.length === 0 && conversations.length > 0 && (
          <p className="p-4 text-center text-sm text-tg-muted">Aucun résultat.</p>
        )}

        {conversations.length === 0 && (
          <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-tg-muted">
            <span className="text-3xl">💬</span>
            <p>Aucune discussion pour l&apos;instant.</p>
            <p>Clique sur ✎ pour en démarrer une.</p>
          </div>
        )}
      </nav>

      {showModal && profile && (
        <NewConversationModal myUserId={profile.id} onClose={() => setShowModal(false)} />
      )}
    </aside>
  );
}
