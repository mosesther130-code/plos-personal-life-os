// PLOS — base64 PDF download helper (cross-platform).
// On web: creates a Blob and triggers a download link.
// On native (iOS/Android): writes to app cache and opens the system share sheet.
import { Platform } from "react-native";

export async function downloadBase64Pdf(
  content_b64: string,
  filename: string,
  mime: string = "application/pdf"
): Promise<{ ok: boolean; where: "web-download" | "native-share" | "error"; error?: string }> {
  try {
    if (Platform.OS === "web") {
      // Convert base64 → Blob and trigger a download link.
      const byteChars = atob(content_b64);
      const byteNums = new Array<number>(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) {
        byteNums[i] = byteChars.charCodeAt(i);
      }
      const bytes = new Uint8Array(byteNums);
      const blob = new Blob([bytes], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      return { ok: true, where: "web-download" };
    }

    // Native: write to cache and open share sheet
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const FS = require("expo-file-system");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sharing = require("expo-sharing");
    const dir = FS.cacheDirectory || FS.documentDirectory;
    if (!dir) throw new Error("No writable cache directory available");
    const path = `${dir}${filename.replace(/[^\w.\- ]/g, "_")}`;
    await FS.writeAsStringAsync(path, content_b64, {
      encoding: "base64",
    });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(path, { mimeType: mime, dialogTitle: filename });
      return { ok: true, where: "native-share" };
    }
    return { ok: true, where: "native-share" }; // saved to cache
  } catch (err: any) {
    return { ok: false, where: "error", error: String(err?.message || err) };
  }
}
