"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { PresenceProvider } from "@/lib/presence";
import { sharedRinger } from "@/lib/ringtone";

export default function ChatShell({
  userId,
  showOnlineStatus,
  sidebar,
  children,
}: {
  userId: string;
  showOnlineStatus: boolean;
  sidebar: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const hasOpenConversation = pathname !== "/chat";

  useEffect(() => {
    const unlock = () => sharedRinger.warm();
    document.addEventListener("pointerdown", unlock, { once: true });
    document.addEventListener("keydown", unlock, { once: true });
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
    };
  }, []);

  return (
    <PresenceProvider userId={userId} showOnlineStatus={showOnlineStatus}>
      <div className="flex h-dvh w-full overflow-hidden">
        <div className={`${hasOpenConversation ? "hidden md:flex" : "flex"} w-full shrink-0 md:w-80`}>
          {sidebar}
        </div>
        <div className={`${hasOpenConversation ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col`}>
          {children}
        </div>
      </div>
    </PresenceProvider>
  );
}
