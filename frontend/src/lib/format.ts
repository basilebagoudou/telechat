export function formatConversationTime(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Hier";
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

export function messagePreview(message?: {
  content: string | null;
  media_type: "image" | "video" | "audio" | "file" | null;
}) {
  if (!message) return "Aucun message";
  if (message.media_type === "image") return "📷 Photo";
  if (message.media_type === "video") return "🎥 Vidéo";
  if (message.media_type === "audio") return "🎵 Audio";
  if (message.media_type === "file") return "📎 Fichier";
  return message.content ?? "";
}
