import Link from "next/link";
import AuthForm from "@/components/AuthForm";

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-tg-chat-bg p-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-6 animate-modal-in rounded-3xl bg-white p-8 shadow-lg">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-tg-blue text-3xl text-white">
          ✈️
        </div>
        <div className="text-center">
          <h1 className="text-xl font-semibold">Connexion à TeleChat</h1>
          <p className="mt-1 text-sm text-tg-muted">Content de te revoir</p>
        </div>
        <AuthForm mode="login" />
        <p className="text-sm text-tg-muted">
          Pas de compte ?{" "}
          <Link href="/signup" className="font-medium text-tg-blue hover:underline">
            Inscris-toi
          </Link>
        </p>
      </div>
    </main>
  );
}
