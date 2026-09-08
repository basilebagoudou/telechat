"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createDirectConversation, createGroupConversation } from "@/lib/conversations";
import Avatar from "./Avatar";
import Spinner from "./Spinner";
import type { Profile } from "@/lib/types";

export default function NewConversationModal({
  myUserId,
  onClose,
}: {
  myUserId: string;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<Profile[]>([]);
  const [groupName, setGroupName] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function search(q: string) {
    setQuery(q);
    if (!q.trim()) {
      setResults([]);
      return;
    }
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .ilike("username", `%${q}%`)
      .neq("id", myUserId)
      .limit(10);
    setResults(data ?? []);
  }

  function toggleSelect(profile: Profile) {
    setSelected((prev) =>
      prev.some((p) => p.id === profile.id)
        ? prev.filter((p) => p.id !== profile.id)
        : [...prev, profile]
    );
  }

  async function handleCreate() {
    if (!selected.length) return;
    setLoading(true);
    try {
      const conversation =
        selected.length === 1 && !groupName.trim()
          ? await createDirectConversation(selected[0].id, myUserId)
          : await createGroupConversation(
              groupName.trim() || selected.map((p) => p.display_name).join(", "),
              myUserId,
              selected.map((p) => p.id)
            );
      onClose();
      router.push(`/chat/${conversation.id}`);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="animate-overlay-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="animate-modal-in w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold">Nouvelle discussion</h2>

        <input
          type="text"
          placeholder="Rechercher un utilisateur..."
          value={query}
          onChange={(e) => search(e.target.value)}
          className="mb-3 w-full rounded-xl bg-tg-row-hover px-3 py-2.5 text-sm outline-none transition-shadow focus:ring-2 focus:ring-tg-blue/30"
        />

        {selected.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {selected.map((p) => (
              <span
                key={p.id}
                onClick={() => toggleSelect(p)}
                className="cursor-pointer rounded-full bg-tg-row-active px-3 py-1 text-sm text-tg-blue-dark transition-colors hover:bg-tg-blue/20"
              >
                {p.display_name} ✕
              </span>
            ))}
          </div>
        )}

        {selected.length > 1 && (
          <input
            type="text"
            placeholder="Nom du groupe"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            className="mb-3 w-full rounded-xl bg-tg-row-hover px-3 py-2.5 text-sm outline-none transition-shadow focus:ring-2 focus:ring-tg-blue/30"
          />
        )}

        <ul className="mb-4 max-h-56 overflow-y-auto overscroll-contain">
          {results.map((profile) => {
            const isSelected = selected.some((p) => p.id === profile.id);
            return (
              <li
                key={profile.id}
                onClick={() => toggleSelect(profile)}
                className={`flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 transition-colors ${
                  isSelected ? "bg-tg-row-active" : "hover:bg-tg-row-hover"
                }`}
              >
                <Avatar name={profile.display_name} url={profile.avatar_url} size={36} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{profile.display_name}</p>
                  <p className="truncate text-xs text-tg-muted">@{profile.username}</p>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-sm text-tg-muted transition-colors hover:bg-tg-row-hover active:scale-95"
          >
            Annuler
          </button>
          <button
            onClick={handleCreate}
            disabled={!selected.length || loading}
            className="flex items-center gap-2 rounded-xl bg-tg-blue px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-tg-blue-dark active:scale-95 disabled:opacity-50"
          >
            {loading && <Spinner />}
            Créer
          </button>
        </div>
      </div>
    </div>
  );
}
