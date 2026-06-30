// Cross-platform share helper.
// - Native: uses React Native Share.share()
// - Web: tries navigator.share (works only with user activation in some hosts);
//        falls back to clipboard copy + alert. This avoids the
//        "Permission denied" thrown from inside iframe-embedded previews.
import { Platform, Share, Alert } from "react-native";
import * as Clipboard from "expo-clipboard";

export type ShareResult = "shared" | "copied" | "cancelled" | "failed";

export async function safeShare(opts: {
  message: string;
  url?: string;
  title?: string;
  /** Optional human-friendly label shown in the web fallback alert */
  label?: string;
}): Promise<ShareResult> {
  const { message, url, title, label } = opts;

  // ---------- NATIVE ----------
  if (Platform.OS !== "web") {
    try {
      const r = await Share.share({ message, url, title } as any);
      // React Native's Share.share returns an action string; treat any
      // non-throw as success.
      const action = (r as any)?.action;
      if (action === "dismissedAction") return "cancelled";
      return "shared";
    } catch (_e) {
      // Fall through to clipboard fallback even on native, just in case
    }
  }

  // ---------- WEB ----------
  // Try navigator.share first (needs HTTPS + user activation + not blocked
  // by Permissions-Policy on the iframe host). Wrap in try/catch because
  // many embeds throw "Permission denied" synchronously.
  if (Platform.OS === "web" && typeof navigator !== "undefined") {
    const nav: any = navigator;
    if (typeof nav.share === "function") {
      try {
        await nav.share({ title, text: message, url });
        return "shared";
      } catch (e: any) {
        const name = e?.name || "";
        // AbortError = user dismissed. Treat as cancellation, not failure.
        if (name === "AbortError") return "cancelled";
        // NotAllowedError, SecurityError, TypeError → fall through to copy
      }
    }
  }

  // ---------- CLIPBOARD FALLBACK ----------
  const payload = url ? `${message}\n${url}` : message;
  try {
    await Clipboard.setStringAsync(payload);
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.alert(`${label || "Copied to clipboard"}\n\n${payload}`);
    } else {
      Alert.alert(label || "Copied to clipboard", payload);
    }
    return "copied";
  } catch (_e) {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.alert(`${label || "Share"}\n\n${payload}`);
    } else {
      Alert.alert(label || "Share", payload);
    }
    return "failed";
  }
}
