"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getNotificationPrefs, setNotificationPrefs, type NotificationPrefs } from "@/lib/notificationPrefs";
import { sharedRinger } from "@/lib/ringtone";
import Avatar from "@/components/Avatar";
import Spinner from "@/components/Spinner";
import type { Profile } from "@/lib/types";

type BlockedProfile = Pick<Profile, "id" | "username" | "display_name" | "avatar_url">;
type BlockedEntry = { blockId: string; profile: BlockedProfile };

export default function SettingsView({
  profile,
  email,
  initialBlockedUsers,
}: {
  profile: Profile;
  email: string;
  initialBlockedUsers: BlockedEntry[];
}) {
  const router = useRouter();

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-tg-chat-bg">
      <header className="flex shrink-0 items-center gap-3 border-b border-tg-sidebar-border bg-tg-sidebar-bg px-4 py-3">
        <button
          onClick={() => router.push("/chat")}
          className="flex h-9 w-9 items-center justify-center rounded-full text-lg text-tg-blue transition-colors hover:bg-tg-row-hover active:scale-95"
          title="Retour"
        >
          ←
        </button>
        <h1 className="text-lg font-semibold">Paramètres</h1>
      </header>

      <div className="animate-modal-in mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-4">
        <ProfileSection profile={profile} />
        <PrivacySection profile={profile} initialBlockedUsers={initialBlockedUsers} />
        <NotificationsSection />
        <AccountSection email={email} />
        <DangerZoneSection />
      </div>
    </div>
  );
}

function SectionCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-tg-muted">
        <span className="text-base">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function ProfileSection({ profile }: { profile: Profile }) {
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [username, setUsername] = useState(profile.username);
  const [bio, setBio] = useState(profile.bio ?? "");
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const supabase = createClient();

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    const ext = file.name.split(".").pop();
    const path = `avatars/${profile.id}-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("media").upload(path, file);

    if (uploadError) {
      setError("Échec de l'envoi de la photo : " + uploadError.message);
      setUploading(false);
      return;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("media").getPublicUrl(path);

    setAvatarUrl(publicUrl);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        display_name: displayName.trim(),
        username: username.trim(),
        bio: bio.trim() || null,
        avatar_url: avatarUrl,
      })
      .eq("id", profile.id);

    setSaving(false);

    if (updateError) {
      setError(
        updateError.code === "23505"
          ? "Ce nom d'utilisateur est déjà pris."
          : "Échec de l'enregistrement : " + updateError.message
      );
      return;
    }

    setSaved(true);
    router.refresh();
  }

  return (
    <SectionCard title="Profil" icon="👤">
      <div className="mb-4 flex items-center gap-4">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="relative shrink-0 transition-transform active:scale-95"
          title="Changer la photo"
        >
          <Avatar name={displayName || "?"} url={avatarUrl} size={64} />
          <span className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full bg-tg-blue text-xs text-white shadow-sm">
            {uploading ? <Spinner size={12} /> : "📷"}
          </span>
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
        <p className="text-xs text-tg-muted">Clique sur la photo pour la changer.</p>
      </div>

      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-tg-muted">
          Nom affiché
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="rounded-xl bg-tg-row-hover px-3 py-2 text-sm text-tg-bubble-in-text outline-none transition-shadow focus:ring-2 focus:ring-tg-blue/30"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-tg-muted">
          Nom d&apos;utilisateur
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value.replace(/\s/g, ""))}
            className="rounded-xl bg-tg-row-hover px-3 py-2 text-sm text-tg-bubble-in-text outline-none transition-shadow focus:ring-2 focus:ring-tg-blue/30"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-tg-muted">
          Bio
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={2}
            maxLength={200}
            placeholder="Quelques mots sur toi..."
            className="resize-none rounded-xl bg-tg-row-hover px-3 py-2 text-sm text-tg-bubble-in-text outline-none transition-shadow focus:ring-2 focus:ring-tg-blue/30"
          />
        </label>
      </div>

      {error && <p className="animate-modal-in mt-3 text-sm text-red-500">{error}</p>}
      {saved && !error && <p className="animate-modal-in mt-3 text-sm text-green-600">Profil mis à jour.</p>}

      <div className="mt-4 flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving || uploading || !displayName.trim() || !username.trim()}
          className="flex items-center gap-2 rounded-xl bg-tg-blue px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-tg-blue-dark active:scale-95 disabled:opacity-50"
        >
          {saving && <Spinner size={14} />}
          Enregistrer
        </button>
      </div>
    </SectionCard>
  );
}

function PrivacySection({
  profile,
  initialBlockedUsers,
}: {
  profile: Profile;
  initialBlockedUsers: BlockedEntry[];
}) {
  const [showOnlineStatus, setShowOnlineStatus] = useState(profile.show_online_status ?? true);
  const [blockedUsers, setBlockedUsers] = useState(initialBlockedUsers);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BlockedProfile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  async function toggleOnlineStatus() {
    const next = !showOnlineStatus;
    setShowOnlineStatus(next);
    await supabase.from("profiles").update({ show_online_status: next }).eq("id", profile.id);
    router.refresh();
  }

  async function searchUsers(q: string) {
    setQuery(q);
    if (!q.trim()) {
      setResults([]);
      return;
    }
    const { data } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .ilike("username", `%${q}%`)
      .neq("id", profile.id)
      .limit(5);
    setResults((data ?? []).filter((p) => !blockedUsers.some((b) => b.profile.id === p.id)));
  }

  async function blockUser(target: BlockedProfile) {
    setError(null);
    const { data, error: blockError } = await supabase
      .from("blocked_users")
      .insert({ blocker_id: profile.id, blocked_id: target.id })
      .select()
      .single();

    if (blockError) {
      setError("Échec du blocage : " + blockError.message);
      return;
    }

    setBlockedUsers((prev) => [...prev, { blockId: data.id, profile: target }]);
    setResults((prev) => prev.filter((p) => p.id !== target.id));
    setQuery("");
  }

  async function unblockUser(blockId: string) {
    await supabase.from("blocked_users").delete().eq("id", blockId);
    setBlockedUsers((prev) => prev.filter((b) => b.blockId !== blockId));
  }

  return (
    <SectionCard title="Confidentialité" icon="🔒">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Afficher mon statut en ligne</p>
          <p className="text-xs text-tg-muted">
            Si désactivé, les autres ne voient plus si tu es en ligne — et toi non plus pour eux.
          </p>
        </div>
        <Toggle checked={showOnlineStatus} onChange={toggleOnlineStatus} />
      </div>

      <div className="mt-4 border-t border-tg-sidebar-border pt-4">
        <p className="mb-2 text-sm font-medium">Utilisateurs bloqués</p>

        {blockedUsers.length === 0 && <p className="text-xs text-tg-muted">Aucun utilisateur bloqué.</p>}

        <ul className="mb-3 flex flex-col gap-1">
          {blockedUsers.map((b) => (
            <li key={b.blockId} className="flex items-center gap-2 rounded-xl px-2 py-1.5 transition-colors hover:bg-tg-row-hover">
              <Avatar name={b.profile.display_name} url={b.profile.avatar_url} size={32} />
              <span className="min-w-0 flex-1 truncate text-sm">{b.profile.display_name}</span>
              <button
                onClick={() => unblockUser(b.blockId)}
                className="rounded-full px-2 py-1 text-xs font-medium text-tg-blue hover:bg-tg-row-active"
              >
                Débloquer
              </button>
            </li>
          ))}
        </ul>

        <input
          value={query}
          onChange={(e) => searchUsers(e.target.value)}
          placeholder="Bloquer un utilisateur (par nom d'utilisateur)"
          className="w-full rounded-xl bg-tg-row-hover px-3 py-2 text-sm outline-none transition-shadow focus:ring-2 focus:ring-tg-blue/30"
        />
        {results.length > 0 && (
          <ul className="mt-1 flex flex-col gap-1">
            {results.map((p) => (
              <li key={p.id} className="flex items-center gap-2 rounded-xl px-2 py-1.5 transition-colors hover:bg-tg-row-hover">
                <Avatar name={p.display_name} url={p.avatar_url} size={32} />
                <span className="min-w-0 flex-1 truncate text-sm">{p.display_name}</span>
                <button
                  onClick={() => blockUser(p)}
                  className="rounded-full px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  Bloquer
                </button>
              </li>
            ))}
          </ul>
        )}
        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
      </div>
    </SectionCard>
  );
}

function NotificationsSection() {
  // Both start at the server-safe default (no `localStorage`/`Notification`
  // global exists during SSR) and only pick up the real, possibly-different
  // browser-side values after mount — reading them in the initializer would
  // make the server and client render different content (or even different
  // elements, for `permission`) on the very first paint, which breaks hydration.
  const [prefs, setPrefs] = useState<NotificationPrefs>({ sound: true, desktop: false });
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("unsupported");

  useEffect(() => {
    // Deliberate exception to react-hooks/set-state-in-effect: this syncs
    // React state with two external, browser-only sources (localStorage,
    // the Notification API) that don't exist during SSR — it can't be done
    // during render without reintroducing the hydration mismatch above.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrefs(getNotificationPrefs());
    setPermission(typeof Notification !== "undefined" ? Notification.permission : "unsupported");
  }, []);

  function update(next: Partial<NotificationPrefs>) {
    const merged = { ...prefs, ...next };
    setPrefs(merged);
    setNotificationPrefs(merged);
  }

  async function enableDesktop() {
    if (typeof Notification === "undefined") return;
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === "granted") update({ desktop: true });
  }

  return (
    <SectionCard title="Notifications" icon="🔔">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Son à la réception d&apos;un message</p>
          <p className="text-xs text-tg-muted">Joue un léger bip quand un nouveau message arrive.</p>
        </div>
        <Toggle checked={prefs.sound} onChange={(v) => update({ sound: v })} />
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-tg-sidebar-border pt-4">
        <div className="min-w-0">
          <p className="text-sm font-medium">Tester le son</p>
          <p className="text-xs text-tg-muted">
            Si aucun bip ne se joue en cliquant ici, le problème vient du navigateur ou du PC (onglet
            muet, volume, sortie audio) — pas de l&apos;application.
          </p>
        </div>
        <button
          onClick={() => sharedRinger.ping()}
          className="shrink-0 rounded-full bg-tg-row-hover px-4 py-2 text-sm font-medium transition-colors hover:bg-tg-row-active active:scale-95"
        >
          🔊 Tester
        </button>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-tg-sidebar-border pt-4">
        <div className="min-w-0">
          <p className="text-sm font-medium">Notifications du navigateur</p>
          <p className="text-xs text-tg-muted">
            {permission === "granted"
              ? "Affiche une notification quand l'onglet n'est pas actif."
              : permission === "denied"
                ? "Bloquées dans les réglages du navigateur."
                : "Demande la permission au navigateur."}
          </p>
        </div>
        {permission === "granted" ? (
          <Toggle checked={prefs.desktop} onChange={(v) => update({ desktop: v })} />
        ) : (
          <button
            onClick={enableDesktop}
            disabled={permission === "denied"}
            className="shrink-0 rounded-xl bg-tg-blue px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-tg-blue-dark disabled:opacity-50"
          >
            Activer
          </button>
        )}
      </div>
    </SectionCard>
  );
}

function AccountSection({ email }: { email: string }) {
  const [newEmail, setNewEmail] = useState(email);
  const [newPassword, setNewPassword] = useState("");
  const [emailStatus, setEmailStatus] = useState<string | null>(null);
  const [passwordStatus, setPasswordStatus] = useState<string | null>(null);
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const supabase = createClient();

  async function handleEmailSave() {
    if (newEmail.trim() === email) return;
    setSavingEmail(true);
    setEmailStatus(null);
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
    setSavingEmail(false);
    setEmailStatus(
      error ? "Échec : " + error.message : "Confirme le changement via le lien envoyé à ta nouvelle adresse."
    );
  }

  async function handlePasswordSave() {
    if (newPassword.length < 6) {
      setPasswordStatus("Le mot de passe doit faire au moins 6 caractères.");
      return;
    }
    setSavingPassword(true);
    setPasswordStatus(null);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);
    setPasswordStatus(error ? "Échec : " + error.message : "Mot de passe mis à jour.");
    if (!error) setNewPassword("");
  }

  return (
    <SectionCard title="Compte" icon="✉️">
      <div className="flex flex-col gap-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-tg-muted">
          Email
          <div className="flex gap-2">
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="flex-1 rounded-xl bg-tg-row-hover px-3 py-2 text-sm text-tg-bubble-in-text outline-none transition-shadow focus:ring-2 focus:ring-tg-blue/30"
            />
            <button
              onClick={handleEmailSave}
              disabled={savingEmail || newEmail.trim() === email}
              className="flex items-center gap-1.5 rounded-xl bg-tg-blue px-3 py-2 text-xs font-medium text-white shadow-sm transition-all hover:bg-tg-blue-dark active:scale-95 disabled:opacity-50"
            >
              {savingEmail && <Spinner size={12} />}
              Modifier
            </button>
          </div>
        </label>
        {emailStatus && <p className="animate-modal-in text-xs text-tg-muted">{emailStatus}</p>}
      </div>

      <div className="mt-4 flex flex-col gap-2 border-t border-tg-sidebar-border pt-4">
        <label className="flex flex-col gap-1 text-xs font-medium text-tg-muted">
          Nouveau mot de passe
          <div className="flex gap-2">
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Au moins 6 caractères"
              className="flex-1 rounded-xl bg-tg-row-hover px-3 py-2 text-sm text-tg-bubble-in-text outline-none transition-shadow focus:ring-2 focus:ring-tg-blue/30"
            />
            <button
              onClick={handlePasswordSave}
              disabled={savingPassword || !newPassword}
              className="flex items-center gap-1.5 rounded-xl bg-tg-blue px-3 py-2 text-xs font-medium text-white shadow-sm transition-all hover:bg-tg-blue-dark active:scale-95 disabled:opacity-50"
            >
              {savingPassword && <Spinner size={12} />}
              Modifier
            </button>
          </div>
        </label>
        {passwordStatus && <p className="animate-modal-in text-xs text-tg-muted">{passwordStatus}</p>}
      </div>
    </SectionCard>
  );
}

function DangerZoneSection() {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  async function handleDeleteAccount() {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }

    setDeleting(true);
    setError(null);

    const res = await fetch("/api/account/delete", { method: "POST" });
    const body = await res.json();

    if (!res.ok) {
      setDeleting(false);
      setConfirmingDelete(false);
      setError(body.error ?? "Échec de la suppression du compte.");
      return;
    }

    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <SectionCard title="Zone de danger" icon="⚠️">
      <button
        onClick={handleLogout}
        className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-tg-bubble-in-text transition-colors hover:bg-tg-row-hover active:scale-[0.99]"
      >
        Se déconnecter
      </button>

      <button
        onClick={handleDeleteAccount}
        disabled={deleting}
        className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-50 active:scale-[0.99] disabled:opacity-50"
      >
        {deleting && <Spinner size={14} />}
        {confirmingDelete
          ? "Cliquer à nouveau pour confirmer — action définitive"
          : "Supprimer définitivement mon compte"}
      </button>

      {error && <p className="animate-modal-in mt-2 text-sm text-red-500">{error}</p>}
    </SectionCard>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors active:scale-95 ${
        checked ? "bg-tg-blue" : "bg-tg-sidebar-border"
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
