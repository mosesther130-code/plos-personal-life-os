// PLOS — cross-platform external URL opener.
// On web the Emergent preview runs inside an iframe. Sites like
// google.com/maps refuse to be embedded (X-Frame-Options: SAMEORIGIN)
// which causes ERR_BLOCKED_BY_RESPONSE when we use the default
// Linking.openURL (which becomes window.location on web).
// This helper forces new-tab open on web while keeping native behavior.
import { Platform, Linking } from "react-native";

export function openExternalUrl(url: string): void {
  if (!url) return;
  if (Platform.OS === "web") {
    try {
      // @ts-ignore
      const w = window.open(url, "_blank", "noopener,noreferrer");
      if (!w) {
        // Popup blocker — try anchor fallback
        // @ts-ignore
        const a = window.document.createElement("a");
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        // @ts-ignore
        window.document.body.appendChild(a);
        a.click();
        a.remove();
      }
    } catch (_e) {
      Linking.openURL(url).catch(() => {});
    }
    return;
  }
  Linking.openURL(url).catch(() => {});
}
