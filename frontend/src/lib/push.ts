// PLOS push notification registration helper (native only).
// Web is a no-op — Emergent's relay handles FCM/APNs server-side.
import { Platform } from "react-native";
import { pushApi } from "@/src/lib/api";

let _registered = false;

/**
 * Request notification permission and register the device token with the
 * PLOS backend (which relays to Emergent). Safe to call multiple times —
 * subsequent calls are no-ops in the same session unless `force` is true.
 *
 * Permission strategy follows the handle_permissions_contract:
 *  - call when the user shows intent (i.e. has just logged in)
 *  - if canAskAgain=false and status!=granted, return without throwing
 *  - never block the calling flow on registration failure
 */
export async function registerForPushIfNeeded(opts: { force?: boolean } = {}) {
  if (Platform.OS === "web") return { status: "skipped", reason: "web" };
  if (_registered && !opts.force) return { status: "cached" };
  try {
    // Lazy-import so web bundle never pulls in expo-notifications native modules.
    const Notifications = await import("expo-notifications");
    const perm = await Notifications.getPermissionsAsync();
    let granted = perm.status === "granted";
    if (!granted) {
      if (!perm.canAskAgain) {
        return { status: "denied_permanently" };
      }
      const ask = await Notifications.requestPermissionsAsync();
      granted = ask.status === "granted";
    }
    if (!granted) return { status: "denied" };

    const tokenResp = await Notifications.getDevicePushTokenAsync();
    const result = await pushApi.register(Platform.OS, tokenResp.data);
    _registered = true;
    return { status: "ok", platform: Platform.OS, result };
  } catch (err) {
    // Non-blocking — log only.
    // eslint-disable-next-line no-console
    console.warn("Push registration failed (non-blocking):", err);
    return { status: "error", error: String(err) };
  }
}

/** Forget the cached registration state (e.g. on logout). */
export function resetPushRegistration() {
  _registered = false;
}
