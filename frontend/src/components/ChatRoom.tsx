"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { attachReplyPreviews } from "@/lib/messages";
import { useOnlineUsers } from "@/lib/presence";
import { getNotificationPrefs } from "@/lib/notificationPrefs";
import { sharedRinger } from "@/lib/ringtone";
import { formatLastSeen } from "@/lib/lastSeen";
import MessageBubble from "./MessageBubble";
import CallManager from "./CallManager";
import Avatar from "./Avatar";
import type { Conversation, ConversationMember, Message, MessageReaction, MessageRead, Profile } from "@/lib/types";
import type { RealtimeChannel } from "@supabase/supabase-js";

type MemberRow = ConversationMember & { profile: Profile };

const TYPING_BROADCAST_THROTTLE_MS = 2000;
const TYPING_EXPIRY_MS = 3000;

export default function ChatRoom({
  conversation,
  initialMessages,
  members,
  currentUserId,
  currentUserName,
}: {
  conversation: Conversation;
  initialMessages: Message[];
  members: MemberRow[];
  currentUserId: string;
  currentUserName: string;
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [typingName, setTypingName] = useState<string | null>(null);
  const [reads, setReads] = useState<Record<string, string>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastTypingSentAtRef = useRef(0);
  const typingExpiryRef = useRef<number | null>(null);
  const supabase = createClient();

  const otherMember = members.find((m) => m.user_id !== currentUserId);
  const onlineUsers = useOnlineUsers();
  const otherIsOnline = otherMember ? onlineUsers.has(otherMember.user_id) : false;
  const title =
    conversation.name ??
    (conversation.type === "direct" ? otherMember?.profile.display_name : "Groupe") ??
    "Discussion";

  useEffect(() => {
    async function fetchMessageWithRelations(id: string): Promise<Message | null> {
      const { data } = await supabase
        .from("messages")
        .select("*, sender:profiles(*), reactions:message_reactions(*)")
        .eq("id", id)
        .single();
      if (!data) return null;
      const [withReply] = await attachReplyPreviews(supabase, [data as Message]);
      return withReply;
    }

    const channel = supabase
      .channel(`messages:${conversation.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversation.id}`,
        },
        async (payload) => {
          const full = await fetchMessageWithRelations(payload.new.id as string);
          if (!full) return;
          setMessages((prev) => [...prev, full]);

          if (full.sender_id !== currentUserId) {
            const prefs = getNotificationPrefs();
            if (prefs.sound) sharedRinger.ping();
            if (prefs.desktop && document.hidden && Notification.permission === "granted") {
              new Notification(full.sender?.display_name ?? "Nouveau message", {
                body: full.content ?? "📎 Média",
                icon: full.sender?.avatar_url ?? undefined,
              });
            }
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversation.id}`,
        },
        async (payload) => {
          const full = await fetchMessageWithRelations(payload.new.id as string);
          if (full) setMessages((prev) => prev.map((m) => (m.id === full.id ? full : m)));
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversation.id}`,
        },
        (payload) => {
          setMessages((prev) => prev.filter((m) => m.id !== payload.old.id));
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "message_reactions",
          filter: `conversation_id=eq.${conversation.id}`,
        },
        (payload) => {
          setMessages((prev) =>
            prev.map((m) => {
              const messageId =
                (payload.new as MessageReaction | undefined)?.message_id ??
                (payload.old as MessageReaction | undefined)?.message_id;
              if (m.id !== messageId) return m;

              const reactions = m.reactions ?? [];
              if (payload.eventType === "INSERT") {
                return { ...m, reactions: [...reactions, payload.new as MessageReaction] };
              }
              if (payload.eventType === "UPDATE") {
                return {
                  ...m,
                  reactions: reactions.map((r) =>
                    r.id === (payload.new as MessageReaction).id ? (payload.new as MessageReaction) : r
                  ),
                };
              }
              return { ...m, reactions: reactions.filter((r) => r.id !== (payload.old as MessageReaction).id) };
            })
          );
        }
      )
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (payload.userId === currentUserId) return;
        setTypingName(payload.name);
        if (typingExpiryRef.current) window.clearTimeout(typingExpiryRef.current);
        typingExpiryRef.current = window.setTimeout(() => setTypingName(null), TYPING_EXPIRY_MS);
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    async function loadReads() {
      const { data } = await supabase
        .from("message_reads")
        .select("*")
        .eq("conversation_id", conversation.id);
      if (data) {
        setReads(Object.fromEntries((data as MessageRead[]).map((r) => [r.user_id, r.last_read_at])));
      }
    }
    loadReads();

    const channel = supabase
      .channel(`reads:${conversation.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_reads", filter: `conversation_id=eq.${conversation.id}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as MessageRead;
          setReads((prev) => ({ ...prev, [row.user_id]: (payload.new as MessageRead)?.last_read_at ?? prev[row.user_id] }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id]);

  // Viewing the conversation counts as reading it — push our own read
  // receipt forward whenever a message arrives (or the room first opens).
  useEffect(() => {
    if (messages.length === 0) return;
    supabase
      .from("message_reads")
      .upsert({ conversation_id: conversation.id, user_id: currentUserId, last_read_at: new Date().toISOString() })
      .then(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id, messages.length]);

  async function moderate(content: string): Promise<boolean> {
    try {
      const res = await fetch("/api/py/moderate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      return Boolean(data.flagged);
    } catch {
      return false;
    }
  }

  function handleTextChange(value: string) {
    setText(value);
    const now = Date.now();
    if (now - lastTypingSentAtRef.current > TYPING_BROADCAST_THROTTLE_MS) {
      lastTypingSentAtRef.current = now;
      channelRef.current?.send({
        type: "broadcast",
        event: "typing",
        payload: { userId: currentUserId, name: currentUserName },
      });
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const content = text.trim();
    if (!content || sending) return;

    setSending(true);
    setText("");
    const replyId = replyingTo?.id ?? null;
    setReplyingTo(null);

    const flagged = await moderate(content);

    await supabase.from("messages").insert({
      conversation_id: conversation.id,
      sender_id: currentUserId,
      content,
      flagged,
      reply_to: replyId,
    });

    setSending(false);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const path = `${conversation.id}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from("media").upload(path, file);
    if (uploadError) {
      alert("Échec de l'envoi du fichier : " + uploadError.message);
      return;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("media").getPublicUrl(path);

    const mediaType = file.type.startsWith("image/")
      ? "image"
      : file.type.startsWith("video/")
        ? "video"
        : file.type.startsWith("audio/")
          ? "audio"
          : "file";

    await supabase.from("messages").insert({
      conversation_id: conversation.id,
      sender_id: currentUserId,
      media_url: publicUrl,
      media_type: mediaType,
    });

    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleEdit(messageId: string, newContent: string) {
    await supabase
      .from("messages")
      .update({ content: newContent, edited_at: new Date().toISOString() })
      .eq("id", messageId);
  }

  async function handleDelete(messageId: string) {
    await supabase.from("messages").delete().eq("id", messageId);
  }

  async function handleReact(messageId: string, emoji: string) {
    const message = messages.find((m) => m.id === messageId);
    const mine = message?.reactions?.find((r) => r.user_id === currentUserId);

    if (mine && mine.emoji === emoji) {
      await supabase.from("message_reactions").delete().eq("id", mine.id);
    } else if (mine) {
      await supabase.from("message_reactions").update({ emoji }).eq("id", mine.id);
    } else {
      await supabase.from("message_reactions").insert({
        message_id: messageId,
        conversation_id: conversation.id,
        user_id: currentUserId,
        emoji,
      });
    }
  }

  const otherLastReadAt = otherMember ? reads[otherMember.user_id] : undefined;

  const subtitle = typingName
    ? `${typingName} est en train d'écrire...`
    : conversation.type === "direct"
      ? otherIsOnline
        ? "en ligne"
        : otherMember?.profile.show_online_status
          ? formatLastSeen(otherMember.profile.last_seen_at)
          : "dernière connexion récemment"
      : `${members.length} membre${members.length > 1 ? "s" : ""}`;

  return (
    <div className="flex flex-1 flex-col bg-tg-chat-bg">
      <header className="flex items-center gap-2 border-b border-tg-sidebar-border bg-tg-sidebar-bg px-3 py-2.5 md:gap-3 md:px-4">
        <Link
          href="/chat"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg text-tg-blue transition-colors hover:bg-tg-row-hover active:scale-95 md:hidden"
          title="Retour"
        >
          ←
        </Link>
        <Avatar
          name={title}
          url={conversation.type === "direct" ? otherMember?.profile.avatar_url : conversation.avatar_url}
          size={40}
        />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold text-[15px] leading-tight">{title}</h1>
          <p
            className={`truncate text-xs ${typingName ? "text-tg-blue" : "text-tg-muted"}`}
            suppressHydrationWarning
          >
            {subtitle}
          </p>
        </div>
        {conversation.type === "direct" && otherMember && (
          <CallManager
            conversationId={conversation.id}
            myUserId={currentUserId}
            peerName={otherMember.profile.display_name}
            peerAvatarUrl={otherMember.profile.avatar_url}
          />
        )}
      </header>

      <div className="flex-1 space-y-1.5 overflow-y-auto overscroll-contain px-4 py-4">
        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            isMine={m.sender_id === currentUserId}
            isRead={Boolean(otherLastReadAt && otherLastReadAt >= m.created_at)}
            currentUserId={currentUserId}
            onReply={setReplyingTo}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onReact={handleReact}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {replyingTo && (
        <div className="flex items-center gap-2 border-t border-tg-sidebar-border bg-tg-sidebar-bg px-4 py-2">
          <div className="min-w-0 flex-1 border-l-2 border-tg-blue pl-2">
            <p className="truncate text-xs font-medium text-tg-blue">
              {replyingTo.sender?.display_name ?? "Message"}
            </p>
            <p className="truncate text-xs text-tg-muted">
              {replyingTo.content ?? "Média"}
            </p>
          </div>
          <button
            onClick={() => setReplyingTo(null)}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-tg-muted transition-colors hover:bg-tg-row-hover active:scale-95"
            title="Annuler la réponse"
          >
            ✕
          </button>
        </div>
      )}

      <form
        onSubmit={handleSend}
        className="flex items-center gap-2 border-t border-tg-sidebar-border bg-tg-sidebar-bg px-3 py-2.5"
      >
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileUpload}
          className="hidden"
          id="file-upload"
        />
        <label
          htmlFor="file-upload"
          className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-lg text-tg-muted transition-colors hover:bg-tg-row-hover active:scale-95"
          title="Joindre un fichier"
        >
          📎
        </label>
        <input
          type="text"
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          placeholder="Écris un message..."
          className="flex-1 rounded-full bg-tg-row-hover px-4 py-2.5 text-sm outline-none transition-shadow focus:ring-2 focus:ring-tg-blue/30"
        />
        <button
          type="submit"
          disabled={sending || !text.trim()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-tg-blue text-white shadow-sm transition-all hover:bg-tg-blue-dark active:scale-95 disabled:opacity-40"
        >
          ➤
        </button>
      </form>
    </div>
  );
}
