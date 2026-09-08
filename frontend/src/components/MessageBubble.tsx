"use client";

import { useState } from "react";
import type { Message } from "@/lib/types";

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

export default function MessageBubble({
  message,
  isMine,
  isRead,
  currentUserId,
  onReply,
  onEdit,
  onDelete,
  onReact,
}: {
  message: Message;
  isMine: boolean;
  isRead?: boolean;
  currentUserId: string;
  onReply: (message: Message) => void;
  onEdit: (messageId: string, content: string) => void;
  onDelete: (messageId: string) => void;
  onReact: (messageId: string, emoji: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content ?? "");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const reactionGroups = Object.entries(
    (message.reactions ?? []).reduce<Record<string, number>>((acc, r) => {
      acc[r.emoji] = (acc[r.emoji] ?? 0) + 1;
      return acc;
    }, {})
  );
  const myReaction = message.reactions?.find((r) => r.user_id === currentUserId)?.emoji;

  function closeMenu() {
    setMenuOpen(false);
    setConfirmingDelete(false);
  }

  function handleQuickReact(emoji: string) {
    onReact(message.id, emoji);
    closeMenu();
  }

  function handleReplyClick() {
    onReply(message);
    closeMenu();
  }

  function startEditing() {
    setDraft(message.content ?? "");
    setEditing(true);
    closeMenu();
  }

  function saveEdit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== message.content) onEdit(message.id, trimmed);
    setEditing(false);
  }

  function handleDeleteClick() {
    if (confirmingDelete) {
      onDelete(message.id);
      closeMenu();
    } else {
      setConfirmingDelete(true);
    }
  }

  return (
    // `relative` lives here, on the full-width row, not on the small "⋮"
    // button — anchoring the dropdown to the row's own edge keeps it on
    // screen regardless of how wide the bubble itself happens to be (a short
    // message's button can sit anywhere across the row).
    <div className={`relative flex items-start gap-1 ${isMine ? "justify-end" : "justify-start"}`}>
      {isMine && (
        <MenuTrigger open={menuOpen} onToggle={() => setMenuOpen((v) => !v)} />
      )}

      <div className="flex max-w-md flex-col">
        <div
          className={`rounded-2xl px-3 py-1.5 shadow-sm ${
            isMine
              ? "rounded-br-sm bg-tg-bubble-out text-tg-bubble-out-text"
              : "rounded-bl-sm bg-tg-bubble-in text-tg-bubble-in-text"
          }`}
        >
          {!isMine && (
            <p className="mb-0.5 text-xs font-semibold text-tg-blue">{message.sender?.display_name}</p>
          )}

          {message.reply_to_message && (
            <div
              className={`mb-1 rounded-lg border-l-2 px-2 py-1 text-xs ${
                isMine ? "border-white/60 bg-white/10" : "border-tg-blue bg-tg-row-hover"
              }`}
            >
              <p className={`font-medium ${isMine ? "text-white" : "text-tg-blue"}`}>
                {message.reply_to_message.sender?.display_name ?? "Message"}
              </p>
              <p className={`truncate ${isMine ? "text-white/80" : "text-tg-muted"}`}>
                {message.reply_to_message.content ?? "Média"}
              </p>
            </div>
          )}

          {message.media_url && message.media_type === "image" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={message.media_url} alt="media" className="mb-1 max-h-64 rounded-lg" />
          )}
          {message.media_url && message.media_type === "video" && (
            <video src={message.media_url} controls className="mb-1 max-h-64 rounded-lg" />
          )}
          {message.media_url && message.media_type === "audio" && (
            <audio src={message.media_url} controls className="mb-1" />
          )}
          {message.media_url && message.media_type === "file" && (
            <a href={message.media_url} target="_blank" rel="noreferrer" className="mb-1 block underline">
              📎 Fichier joint
            </a>
          )}

          {editing ? (
            <div className="flex flex-col gap-1">
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveEdit();
                  if (e.key === "Escape") setEditing(false);
                }}
                className={`rounded-md px-2 py-1 text-[14.5px] outline-none ${
                  isMine ? "bg-white/20 text-white placeholder-white/60" : "bg-white text-tg-bubble-in-text"
                }`}
              />
              <div className="flex justify-end gap-2 text-xs">
                <button onClick={() => setEditing(false)} className="opacity-80 transition-opacity hover:opacity-100">
                  Annuler
                </button>
                <button onClick={saveEdit} className="font-medium opacity-80 transition-opacity hover:opacity-100">
                  Enregistrer
                </button>
              </div>
            </div>
          ) : (
            message.content && (
              <p className="whitespace-pre-wrap break-words text-[14.5px] leading-snug">{message.content}</p>
            )
          )}

          {message.flagged && (
            <p className={`mt-1 text-xs italic ${isMine ? "text-white/70" : "text-tg-muted"}`}>
              ⚠️ signalé par la modération
            </p>
          )}

          <p
            className={`mt-0.5 flex items-center justify-end gap-1 text-right text-[10.5px] ${isMine ? "text-white/70" : "text-tg-muted"}`}
          >
            {message.edited_at && "modifié · "}
            {new Date(message.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            {isMine && <ReadTicks read={Boolean(isRead)} />}
          </p>
        </div>

        {reactionGroups.length > 0 && (
          <div className={`mt-1 flex flex-wrap gap-1 ${isMine ? "justify-end" : "justify-start"}`}>
            {reactionGroups.map(([emoji, count]) => (
              <button
                key={emoji}
                onClick={() => onReact(message.id, emoji)}
                className={`rounded-full border px-1.5 py-0.5 text-xs transition-colors active:scale-95 ${
                  myReaction === emoji
                    ? "border-tg-blue bg-tg-row-active"
                    : "border-tg-sidebar-border bg-tg-sidebar-bg hover:bg-tg-row-hover"
                }`}
              >
                {emoji} {count}
              </button>
            ))}
          </div>
        )}
      </div>

      {!isMine && <MenuTrigger open={menuOpen} onToggle={() => setMenuOpen((v) => !v)} />}

      {menuOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={closeMenu} />
          <div
            className={`animate-modal-in absolute top-8 z-20 w-44 rounded-xl bg-white p-1.5 shadow-lg ${
              isMine ? "right-0" : "left-0"
            }`}
          >
            <QuickReactions onPick={handleQuickReact} />
            <MenuItem onClick={handleReplyClick}>↩ Répondre</MenuItem>
            {isMine && message.content && <MenuItem onClick={startEditing}>✏️ Modifier</MenuItem>}
            {isMine && (
              <MenuItem onClick={handleDeleteClick} danger>
                {confirmingDelete ? "Confirmer la suppression ?" : "🗑 Supprimer"}
              </MenuItem>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ReadTicks({ read }: { read: boolean }) {
  return (
    <svg
      viewBox="0 0 16 10"
      className={`h-[10px] w-4 shrink-0 ${read ? "text-cyan-300" : "text-white/70"}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1 5.5 4.5 9 10 2" />
      {read && <path d="M6 5.5 9.5 9 15 2" />}
    </svg>
  );
}

function MenuTrigger({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={`flex h-7 w-7 shrink-0 items-center justify-center self-center rounded-full text-tg-muted opacity-50 transition-opacity hover:bg-tg-row-hover hover:opacity-100 active:opacity-100 ${
        open ? "opacity-100" : ""
      }`}
      title="Options"
    >
      ⋮
    </button>
  );
}

function QuickReactions({ onPick }: { onPick: (emoji: string) => void }) {
  return (
    <div className="mb-1 flex justify-between border-b border-tg-sidebar-border px-1 pb-1.5">
      {QUICK_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => onPick(emoji)}
          className="rounded-full p-1 text-lg transition-transform hover:scale-125 hover:bg-tg-row-hover active:scale-95"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

function MenuItem({
  onClick,
  danger,
  children,
}: {
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`block w-full rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-tg-row-hover ${
        danger ? "text-red-600 hover:bg-red-50" : "text-tg-bubble-in-text"
      }`}
    >
      {children}
    </button>
  );
}
