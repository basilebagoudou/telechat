import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TeleChat",
  description: "Messagerie temps réel façon Telegram",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
