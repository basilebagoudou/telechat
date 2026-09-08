export type Profile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  show_online_status: boolean;
  status: string;
  last_seen_at: string;
  created_at: string;
};

export type Conversation = {
  id: string;
  type: "direct" | "group" | "channel";
  name: string | null;
  avatar_url: string | null;
  created_by: string;
  created_at: string;
};

export type ConversationMember = {
  conversation_id: string;
  user_id: string;
  role: "owner" | "admin" | "member";
  joined_at: string;
};

export type ConversationListItem = Conversation & {
  otherProfile?: Profile;
  lastMessage?: {
    content: string | null;
    media_type: Message["media_type"];
    created_at: string;
  };
};

export type MessageRead = {
  conversation_id: string;
  user_id: string;
  last_read_at: string;
};

export type MessageReaction = {
  id: string;
  message_id: string;
  conversation_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  media_url: string | null;
  media_type: "image" | "video" | "audio" | "file" | null;
  reply_to: string | null;
  edited_at: string | null;
  flagged: boolean;
  created_at: string;
  sender?: Profile;
  reply_to_message?: {
    id: string;
    content: string | null;
    media_type: Message["media_type"];
    sender?: Pick<Profile, "display_name">;
  } | null;
  reactions?: MessageReaction[];
};
