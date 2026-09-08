export function formatLastSeen(lastSeenAt: string): string {
  const then = new Date(lastSeenAt);
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - then.getTime()) / 60000);

  if (diffMin < 1) return "vu à l'instant";
  if (diffMin < 60) return `vu il y a ${diffMin} min`;

  const diffHours = Math.floor(diffMin / 60);
  const time = then.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  if (then.toDateString() === now.toDateString()) {
    return diffHours < 24 ? `vu il y a ${diffHours} h` : `vu aujourd'hui à ${time}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (then.toDateString() === yesterday.toDateString()) return `vu hier à ${time}`;

  return `vu le ${then.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}`;
}
