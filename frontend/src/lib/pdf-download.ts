// PLOS — base64 file download helper (cross-platform).
// On web: creates a Blob and triggers a download link.
// On native (iOS/Android): writes to app cache and opens the system share sheet.
import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

export async function downloadBase64Pdf(
  content_b64: string,
  filename: string,
  mime: string = "application/pdf"
): Promise<{ ok: boolean; where: "web-download" | "native-share" | "native-saved" | "error"; path?: string; error?: string }> {
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
      a.download = filename || "download.bin";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      return { ok: true, where: "web-download" };
    }

    // Native: write to cache and open share sheet
    const dir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
    if (!dir) throw new Error("No writable cache directory available");
    const safeName = (filename || "download.bin").replace(/[^\w.\- ]/g, "_");
    const path = `${dir}${safeName}`;
    await FileSystem.writeAsStringAsync(path, content_b64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(path, { mimeType: mime, dialogTitle: safeName });
      return { ok: true, where: "native-share", path };
    }
    return { ok: true, where: "native-saved", path };
  } catch (err: any) {
    return { ok: false, where: "error", error: String(err?.message || err) };
  }
}
