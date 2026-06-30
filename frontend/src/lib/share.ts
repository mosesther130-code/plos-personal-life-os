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
  let clipboardOk = false;
  try {
    await Clipboard.setStringAsync(payload);
    clipboardOk = true;
  } catch {
    clipboardOk = false;
  }

  // On web, prefer dispatching to a custom in-app modal listener if registered.
  // Otherwise fall back to window.prompt (which lets the user manually copy
  // the pre-selected text — reliable in iframes where window.alert may be
  // dismissable and clipboard may silently fail).
  if (Platform.OS === "web" && typeof window !== "undefined") {
    try {
      // Dispatch a custom event so any in-app <ShareFallbackHost /> can
      // present a nicer dialog. If no listener exists, fall through.
      const ev = new CustomEvent("plos:share-fallback", {
        detail: { title: label || title || "Share", payload, copied: clipboardOk },
      });
      window.dispatchEvent(ev);
      // Also use window.prompt as a guaranteed-visible fallback. prompt()
      // lets the user CMD/CTRL+C the selected text — works in every iframe.
      try {
        (window as any).prompt(
          `${label || "Share"} — copy with ⌘/Ctrl+C or paste from clipboard:`,
          payload
        );
      } catch {
        // some browsers block prompt in iframes; ignore
      }
    } catch {
      // ignore
    }
    return clipboardOk ? "copied" : "failed";
  }

  // Native fallback
  Alert.alert(label || "Share", payload);
  return clipboardOk ? "copied" : "failed";
}
