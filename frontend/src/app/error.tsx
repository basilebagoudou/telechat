"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-lg font-semibold">Une erreur est survenue</p>
      <p className="text-sm text-tg-muted">Réessaie, ou recharge la page si le problème persiste.</p>
      <button
        onClick={reset}
        className="mt-2 rounded-full bg-tg-blue px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-tg-blue-dark active:scale-95"
      >
        Réessayer
      </button>
    </div>
  );
}
