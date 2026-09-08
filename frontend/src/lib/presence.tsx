"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "./supabase/client";

const OnlineUsersContext = createContext<Set<string>>(new Set());

const HEARTBEAT_MS = 60_000;

export function PresenceProvider({
  userId,
  showOnlineStatus,
  children,
}: {
  userId: string;
  showOnlineStatus: boolean;
  children: React.ReactNode;
}) {
  const [online, setOnline] = useState<Set<string>>(new Set());

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel("presence:online", {
      config: { presence: { key: userId } },
    });

    let heartbeat: number | null = null;

    function touchLastSeen() {
      void supabase.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", userId);
    }

    channel
      .on("presence", { event: "sync" }, () => {
        setOnline(new Set(Object.keys(channel.presenceState())));
      })
      .subscribe(async (status) => {
        // Not tracking presence when the preference is off means this user
        // never appears in anyone's online set — the simplest way to hide
        // your status also hides everyone else's from you, matching
        // Telegram's own "Last seen & Online" privacy trade-off. The same
        // preference also gates whether we keep last_seen_at fresh, so a
        // hidden user doesn't leak a "last seen" time either.
        if (status === "SUBSCRIBED" && showOnlineStatus) {
          await channel.track({ online_at: new Date().toISOString() });
          touchLastSeen();
          heartbeat = window.setInterval(touchLastSeen, HEARTBEAT_MS);
        }
      });

    return () => {
      if (heartbeat !== null) window.clearInterval(heartbeat);
      if (showOnlineStatus) touchLastSeen();
      supabase.removeChannel(channel);
    };
  }, [userId, showOnlineStatus]);

  return <OnlineUsersContext.Provider value={online}>{children}</OnlineUsersContext.Provider>;
}

export function useOnlineUsers() {
  return useContext(OnlineUsersContext);
}
