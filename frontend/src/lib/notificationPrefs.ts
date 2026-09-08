const STORAGE_KEY = "telechat:notification-prefs";

export type NotificationPrefs = {
  sound: boolean;
  desktop: boolean;
};

const DEFAULT_PREFS: NotificationPrefs = { sound: true, desktop: false };

export function getNotificationPrefs(): NotificationPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

export function setNotificationPrefs(prefs: NotificationPrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore storage errors (private browsing, quota, etc.)
  }
}
