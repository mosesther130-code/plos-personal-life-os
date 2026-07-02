// PLOS Career — Resume + JD Library + Tailoring History (Career Module v2).
// This is the new primary Career screen. Old builder form & holder removed.
import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, TextInput, Modal, Pressable, RefreshControl,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import {
  Upload, FileText, Star, Trash2, Download, Sparkles, ChevronRight,
  Briefcase, Edit3, ClipboardPaste, Wand2, TriangleAlert, Plus,
} from "lucide-react-native";
import { careerLibraryApi, LibResume, LibJd, TailorVersion } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";

// Cross-platform confirm dialog.  react-native-web's Alert.alert does not
// render buttons in a functional way — pressing Delete simply no-ops.  Use
// window.confirm on web, native Alert on iOS/Android.
function confirmAsync(title: string, message: string, destructive = false): Promise<boolean> {
  if (Platform.OS === "web") {
    const ok = typeof window !== "undefined" && typeof window.confirm === "function"
      ? window.confirm(`${title}\n\n${message}`)
      : false;
    return Promise.resolve(ok);
  }
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: destructive ? "Delete" : "OK", style: destructive ? "destructive" : "default", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}

const MAX_MB = 5;

function mimeFor(ft: string): string {
  const k = (ft || "").toLowerCase();
  if (k === "pdf") return "application/pdf";
  if (k === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (k === "doc") return "application/msword";
  if (k === "txt") return "text/plain";
  return "application/octet-stream";
}

// Cross-platform download of a base64 payload.
// - Web: builds a Blob and triggers <a download>.
// - Native: writes to cache dir and opens Share sheet via expo-sharing.
async function saveBase64ToDevice(fileName: string, fileType: string, b64: string): Promise<void> {
  const mime = mimeFor(fileType);
  if (Platform.OS === "web") {
    // Decode base64 → bytes → Blob
    const bin = atob(b64);
    const len = bin.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName || `download.${fileType || "bin"}`;
    document.body.appendChild(a);
    a.click();
    // Cleanup
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 500);
    return;
  }
  // Native: write to cache dir, then share
  const safeName = (fileName || `download.${fileType || "bin"}`).replace(/[^\w.\-]/g, "_");
  const path = `${FileSystem.cacheDirectory}${safeName}`;
  await FileSystem.writeAsStringAsync(path, b64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(path, { mimeType: mime, dialogTitle: `Save ${safeName}` });
  } else {
    Alert.alert("Saved", `Saved to ${path}`);
  }
}

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const now = Date.now();
    const diff = (now - d.getTime()) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return d.toLocaleDateString();
  } catch { return iso; }
}

function ftBadgeColor(ft: string): { bg: string; fg: string } {
  const k = (ft || "").toLowerCase();
  if (k === "pdf") return { bg: "rgba(239,68,68,0.15)", fg: "#EF4444" };
  if (k === "docx" || k === "doc") return { bg: "rgba(59,130,246,0.15)", fg: "#3B82F6" };
  if (k === "txt") return { bg: "rgba(107,114,128,0.15)", fg: "#9CA3AF" };
  if (k === "manual") return { bg: "rgba(168,85,247,0.15)", fg: "#A855F7" };
  return { bg: colors.surfaceElevated, fg: colors.textSecondary };
}

export default function CareerLibraryScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [resumes, setResumes] = useState<LibResume[]>([]);
  const [jds, setJds] = useState<LibJd[]>([]);
  const [history, setHistory] = useState<TailorVersion[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadingJd, setUploadingJd] = useState(false);
  const [manualJdOpen, setManualJdOpen] = useState(false);
  const [labelEditing, setLabelEditing] = useState<{ id: string; value: string } | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [r, j, h] = await Promise.all([
        careerLibraryApi.listResumes(),
        careerLibraryApi.listJds(),
        careerLibraryApi.history(),
      ]);
      setResumes(r.resumes || []);
      setJds(j.jds || []);
      setHistory(h.history || []);
    } catch (e: any) {
      console.warn("Load library failed", e);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadAll();
      setLoading(false);
    })();
  }, [loadAll]);

  async function readAsBase64(uri: string, webFile?: File | null): Promise<string> {
    // Web: DocumentPicker gives us the File in asset.file — use FileReader
    if (webFile) {
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // strip "data:...;base64," prefix
          const idx = result.indexOf(",");
          resolve(idx >= 0 ? result.slice(idx + 1) : result);
        };
        reader.onerror = () => reject(new Error("FileReader failed"));
        reader.readAsDataURL(webFile);
      });
    }
    // Native: read directly by URI
    try {
      return await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    } catch {
      // Fallback: fetch → blob → base64 (works on both web and native)
      const resp = await fetch(uri);
      const blob = await resp.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const idx = result.indexOf(",");
          resolve(idx >= 0 ? result.slice(idx + 1) : result);
        };
        reader.onerror = () => reject(new Error("blob FileReader failed"));
        reader.readAsDataURL(blob);
      });
    }
  }

  async function pickAndUpload(kind: "resume" | "jd") {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          "application/pdf",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/msword",
          "text/plain",
        ],
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      const name = asset.name || "upload";
      const ext = name.split(".").pop()?.toLowerCase() || "";
      if (!["pdf", "docx", "doc", "txt"].includes(ext)) {
        Alert.alert("Unsupported", "Please upload PDF, DOCX, DOC, or TXT.");
        return;
      }
      const sizeMb = (asset.size || 0) / (1024 * 1024);
      if (sizeMb > MAX_MB) {
        Alert.alert("Too large", `Max ${MAX_MB} MB.`);
        return;
      }
      // Cross-platform base64 read (works on iOS/Android/Web)
      const webFile: File | null = (asset as any).file || null;
      const b64 = await readAsBase64(asset.uri, webFile);
      if (kind === "resume") {
        setUploading(true);
        await careerLibraryApi.uploadResume({
          file_name: name, file_type: ext, file_data_b64: b64,
        });
      } else {
        setUploadingJd(true);
        await careerLibraryApi.uploadJd({
          file_name: name, file_type: ext, file_data_b64: b64,
        });
      }
      await loadAll();
    } catch (e: any) {
      Alert.alert("Upload failed", String(e?.message || e));
      console.warn("Upload error:", e);
    } finally {
      setUploading(false); setUploadingJd(false);
    }
  }

  async function setDefault(id: string) {
    try {
      await careerLibraryApi.updateResume(id, { is_default: true });
      await loadAll();
    } catch (e: any) {
      Alert.alert("Failed", String(e?.message || e));
    }
  }

  async function deleteResume(id: string, name: string) {
    const ok = await confirmAsync("Delete resume?", `Remove "${name}" from your library?`, true);
    if (!ok) return;
    try {
      await careerLibraryApi.deleteResume(id);
      await loadAll();
    } catch (e: any) {
      Alert.alert("Failed", String(e?.message || e));
    }
  }

  async function deleteJd(id: string, title: string) {
    const ok = await confirmAsync(
      "Delete job description?",
      `Remove "${title}" from your library?\n\nTailoring history for this JD will be preserved.`,
      true,
    );
    if (!ok) return;
    try {
      await careerLibraryApi.deleteJd(id);
      await loadAll();
    } catch (e: any) {
      Alert.alert("Failed", String(e?.message || e));
    }
  }

  async function saveLabel() {
    if (!labelEditing) return;
    try {
      await careerLibraryApi.updateResume(labelEditing.id, {
        label: labelEditing.value.trim(),
      });
      setLabelEditing(null);
      await loadAll();
    } catch (e: any) {
      Alert.alert("Failed", String(e?.message || e));
    }
  }

  async function downloadOrigResume(r: LibResume) {
    try {
      const d = await careerLibraryApi.downloadResume(r.resume_id);
      await saveBase64ToDevice(d.file_name || r.file_name, d.file_type || r.file_type, d.content_b64);
      if (Platform.OS === "web") {
        // Web triggers a native browser download automatically — no alert needed.
      } else {
        // On native the share sheet already opens; nothing more to do.
      }
    } catch (e: any) {
      Alert.alert("Download failed", String(e?.message || e));
    }
  }

  async function downloadOrigJd(j: LibJd) {
    try {
      const d = await careerLibraryApi.downloadJd(j.jd_id);
      await saveBase64ToDevice(d.file_name, d.file_type, d.content_b64);
    } catch (e: any) {
      Alert.alert("Download failed", String(e?.message || e));
    }
  }

  function openTailor(prefill?: { resume_id?: string; jd_id?: string }) {
    const q: string[] = [];
    if (prefill?.resume_id) q.push(`resume_id=${prefill.resume_id}`);
    if (prefill?.jd_id) q.push(`jd_id=${prefill.jd_id}`);
    router.push(("/career/tailor-modal" + (q.length ? `?${q.join("&")}` : "")) as any);
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.loader}><ActivityIndicator color={colors.primaryGlow} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await loadAll(); setRefreshing(false); }} tintColor={colors.primaryGlow} />}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.h1}>Career</Text>
            <Text style={styles.subtitle}>Resume library, tailoring, applications</Text>
          </View>
        </View>

        {/* Main tailor CTA */}
        <TouchableOpacity
          style={styles.tailorCta}
          onPress={() => openTailor()}
          testID="open-tailor"
          activeOpacity={0.85}
        >
          <Wand2 size={16} color="#fff" />
          <Text style={styles.tailorCtaText}>Tailor Resume for a Job</Text>
          <Sparkles size={12} color="rgba(255,255,255,0.85)" />
        </TouchableOpacity>

        {/* ============ RESUME LIBRARY ============ */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>My Resumes</Text>
          <TouchableOpacity
            style={styles.uploadBtn}
            onPress={() => pickAndUpload("resume")}
            disabled={uploading}
            testID="upload-resume-btn"
          >
            {uploading ? <ActivityIndicator size="small" color="#fff" /> : <Upload size={12} color="#fff" />}
            <Text style={styles.uploadBtnText}>Upload Resume</Text>
          </TouchableOpacity>
        </View>
        {resumes.length === 0 ? (
          <View style={styles.emptyCard} testID="empty-resumes">
            <FileText size={28} color={colors.textTertiary} />
            <Text style={styles.emptyText}>No resumes uploaded yet.</Text>
            <Text style={styles.emptyHint}>Upload PDF, DOCX, DOC or TXT (max 5MB).</Text>
          </View>
        ) : (
          resumes.map((r) => {
            const bc = ftBadgeColor(r.file_type);
            const isEditing = labelEditing?.id === r.resume_id;
            return (
              <View key={r.resume_id} style={styles.card} testID={`resume-${r.resume_id}`}>
                <View style={styles.cardHead}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <Text style={styles.cardName} numberOfLines={1}>{r.file_name}</Text>
                      <View style={[styles.ftBadge, { backgroundColor: bc.bg }]}>
                        <Text style={[styles.ftBadgeText, { color: bc.fg }]}>{(r.file_type || "?").toUpperCase()}</Text>
                      </View>
                      {r.is_default && (
                        <View style={styles.defaultBadge}>
                          <Star size={10} color="#fff" fill="#fff" />
                          <Text style={styles.defaultBadgeText}>DEFAULT</Text>
                        </View>
                      )}
                      {r.low_text_warning && (
                        <View style={styles.warnBadge}>
                          <TriangleAlert size={10} color="#F59E0B" />
                          <Text style={styles.warnBadgeText}>Text incomplete</Text>
                        </View>
                      )}
                    </View>
                    {/* Label edit */}
                    {isEditing ? (
                      <View style={styles.labelEditRow}>
                        <TextInput
                          style={styles.labelInput}
                          value={labelEditing.value}
                          onChangeText={(t) => setLabelEditing({ id: r.resume_id, value: t })}
                          placeholder="e.g. Federal Resume — USAJobs"
                          placeholderTextColor={colors.textTertiary}
                          autoFocus
                          onBlur={saveLabel}
                          onSubmitEditing={saveLabel}
                          testID={`label-input-${r.resume_id}`}
                        />
                      </View>
                    ) : (
                      <TouchableOpacity
                        onPress={() => setLabelEditing({ id: r.resume_id, value: r.label || "" })}
                        testID={`label-edit-${r.resume_id}`}
                      >
                        <Text style={styles.labelText}>
                          {r.label ? r.label : <Text style={styles.labelPlaceholder}>+ Add label (e.g. Federal Resume)</Text>}
                        </Text>
                      </TouchableOpacity>
                    )}
                    <Text style={styles.cardMeta}>
                      {r.word_count} words · Uploaded {fmtDate(r.upload_date)}
                      {r.last_tailored ? ` · Tailored ${fmtDate(r.last_tailored)}` : ""}
                    </Text>
                  </View>
                </View>
                {/* Actions */}
                <View style={styles.actions}>
                  <TouchableOpacity
                    style={[styles.actBtn, r.is_default && styles.actBtnDisabled]}
                    onPress={() => !r.is_default && setDefault(r.resume_id)}
                    disabled={r.is_default}
                    testID={`set-default-${r.resume_id}`}
                  >
                    <Star size={12} color={r.is_default ? colors.textTertiary : colors.primaryGlow} fill={r.is_default ? colors.textTertiary : "none"} />
                    <Text style={[styles.actText, r.is_default && { color: colors.textTertiary }]}>{r.is_default ? "Default" : "Set Default"}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actBtn}
                    onPress={() => downloadOrigResume(r)}
                    testID={`download-${r.resume_id}`}
                  >
                    <Download size={12} color={colors.primaryGlow} />
                    <Text style={styles.actText}>Download</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actBtnDanger}
                    onPress={() => deleteResume(r.resume_id, r.file_name)}
                    testID={`delete-${r.resume_id}`}
                  >
                    <Trash2 size={12} color="#EF4444" />
                    <Text style={styles.actTextDanger}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}

        {/* ============ JD LIBRARY ============ */}
        <View style={[styles.sectionHead, { marginTop: spacing.xl }]}>
          <Text style={styles.sectionTitle}>My Job Descriptions</Text>
          <View style={{ flexDirection: "row", gap: 6 }}>
            <TouchableOpacity
              style={styles.uploadBtn}
              onPress={() => pickAndUpload("jd")}
              disabled={uploadingJd}
              testID="upload-jd-btn"
            >
              {uploadingJd ? <ActivityIndicator size="small" color="#fff" /> : <Upload size={12} color="#fff" />}
              <Text style={styles.uploadBtnText}>Upload JD</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.uploadBtnAlt}
              onPress={() => setManualJdOpen(true)}
              testID="add-jd-manual-btn"
            >
              <Plus size={12} color={colors.primaryGlow} />
              <Text style={styles.uploadBtnAltText}>Add Manually</Text>
            </TouchableOpacity>
          </View>
        </View>
        {jds.length === 0 ? (
          <View style={styles.emptyCard} testID="empty-jds">
            <Briefcase size={28} color={colors.textTertiary} />
            <Text style={styles.emptyText}>No job descriptions saved yet.</Text>
            <Text style={styles.emptyHint}>Upload a JD file or paste one manually.</Text>
          </View>
        ) : (
          jds.map((j) => {
            const bc = ftBadgeColor(j.file_type);
            const defaultResume = resumes.find((r) => r.is_default);
            const ms = defaultResume ? (j.match_scores || {})[defaultResume.resume_id] : undefined;
            return (
              <View key={j.jd_id} style={styles.card} testID={`jd-${j.jd_id}`}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <Text style={styles.cardName} numberOfLines={2}>{j.job_title || "Untitled"}</Text>
                      <View style={[styles.ftBadge, { backgroundColor: bc.bg }]}>
                        <Text style={[styles.ftBadgeText, { color: bc.fg }]}>{(j.file_type || "?").toUpperCase()}</Text>
                      </View>
                    </View>
                    {!!j.employer && <Text style={styles.jdEmployer}>{j.employer}</Text>}
                    <Text style={styles.cardMeta}>
                      {j.word_count} words · Added {fmtDate(j.upload_date)}
                    </Text>
                  </View>
                  {ms !== undefined && (
                    <View style={[
                      styles.matchBadge,
                      { backgroundColor: ms >= 85 ? "rgba(16,185,129,0.20)" : ms >= 70 ? "rgba(245,158,11,0.20)" : "rgba(107,114,128,0.20)" }
                    ]}>
                      <Text style={[
                        styles.matchBadgeText,
                        { color: ms >= 85 ? colors.success : ms >= 70 ? colors.warning : colors.textTertiary }
                      ]}>{ms}</Text>
                      <Text style={styles.matchBadgeSub}>{ms >= 85 ? "Strong" : ms >= 70 ? "Good" : "Reach"}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.actions}>
                  <TouchableOpacity
                    style={styles.actBtnPrimary}
                    onPress={() => openTailor({ jd_id: j.jd_id })}
                    testID={`tailor-jd-${j.jd_id}`}
                  >
                    <Wand2 size={12} color="#fff" />
                    <Text style={styles.actTextPrimary}>Tailor Resume</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actBtn}
                    onPress={() => downloadOrigJd(j)}
                    testID={`download-jd-${j.jd_id}`}
                  >
                    <Download size={12} color={colors.primaryGlow} />
                    <Text style={styles.actText}>Download</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actBtnDanger}
                    onPress={() => deleteJd(j.jd_id, j.job_title)}
                    testID={`delete-jd-${j.jd_id}`}
                  >
                    <Trash2 size={12} color="#EF4444" />
                    <Text style={styles.actTextDanger}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}

        {/* ============ TAILORING HISTORY ============ */}
        <View style={[styles.sectionHead, { marginTop: spacing.xl }]}>
          <Text style={styles.sectionTitle}>Tailoring History</Text>
        </View>
        {history.length === 0 ? (
          <View style={styles.emptyCard}>
            <Sparkles size={22} color={colors.textTertiary} />
            <Text style={styles.emptyText}>No tailored versions yet.</Text>
          </View>
        ) : (
          history.map((v) => {
            const delta = (v.ats_score_after || 0) - (v.ats_score_before || 0);
            return (
              <TouchableOpacity
                key={v.version_id}
                style={styles.histCard}
                onPress={() => router.push(`/career/tailor-result-v2?version_id=${v.version_id}` as any)}
                testID={`hist-${v.version_id}`}
                activeOpacity={0.8}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.histTitle} numberOfLines={1}>{v.job_title} · {v.employer}</Text>
                  <Text style={styles.histSub} numberOfLines={1}>Base: {v.base_resume_label || "—"}</Text>
                  <Text style={styles.cardMeta}>{fmtDate(v.generated_date)}</Text>
                </View>
                <View style={styles.histRight}>
                  <Text style={[styles.histDelta, { color: delta > 0 ? colors.success : colors.textTertiary }]}>
                    {delta > 0 ? "+" : ""}{delta} pts
                  </Text>
                  <ChevronRight size={14} color={colors.textTertiary} />
                </View>
              </TouchableOpacity>
            );
          })
        )}

        {/* Job Intelligence quick links */}
        <View style={[styles.sectionHead, { marginTop: spacing.xl }]}>
          <Text style={styles.sectionTitle}>Job Intelligence</Text>
        </View>
        <TouchableOpacity
          style={styles.linkCard}
          onPress={() => router.push("/career/jobs" as any)}
          testID="open-jobs"
        >
          <Sparkles size={16} color={colors.primaryGlow} />
          <Text style={styles.linkText}>Verified Jobs Feed</Text>
          <ChevronRight size={14} color={colors.primaryGlow} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.linkCard}
          onPress={() => router.push("/career/insights" as any)}
          testID="open-insights"
        >
          <Wand2 size={16} color={colors.primaryGlow} />
          <Text style={styles.linkText}>Career Insights Dashboard</Text>
          <ChevronRight size={14} color={colors.primaryGlow} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.linkCard}
          onPress={() => router.push("/career/filter-center" as any)}
          testID="open-filter-center"
        >
          <Wand2 size={16} color={colors.primaryGlow} />
          <Text style={styles.linkText}>Filter & Criteria Center</Text>
          <ChevronRight size={14} color={colors.primaryGlow} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.linkCard}
          onPress={() => router.push("/career/watch-list" as any)}
          testID="open-watch-list"
        >
          <Sparkles size={16} color={colors.primaryGlow} />
          <Text style={styles.linkText}>Target Employer Watch List</Text>
          <ChevronRight size={14} color={colors.primaryGlow} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.linkCard}
          onPress={() => router.push("/career/job-sources" as any)}
          testID="open-job-sources"
        >
          <FileText size={16} color={colors.primaryGlow} />
          <Text style={styles.linkText}>Connect Job Sources</Text>
          <ChevronRight size={14} color={colors.primaryGlow} />
        </TouchableOpacity>

        {/* Applications quick link */}
        <TouchableOpacity
          style={styles.linkCard}
          onPress={() => router.push("/career/applications" as any)}
          testID="open-applications"
        >
          <Briefcase size={16} color={colors.primaryGlow} />
          <Text style={styles.linkText}>Application Pipeline</Text>
          <ChevronRight size={14} color={colors.primaryGlow} />
        </TouchableOpacity>

        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Manual JD modal */}
      <ManualJdModal
        visible={manualJdOpen}
        onClose={() => setManualJdOpen(false)}
        onSaved={async () => { setManualJdOpen(false); await loadAll(); }}
      />
    </SafeAreaView>
  );
}

function ManualJdModal({ visible, onClose, onSaved }: {
  visible: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [employer, setEmployer] = useState("");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  const canSave = title.trim().length > 0 && text.trim().length >= 20;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      await careerLibraryApi.addJdManual({
        job_title: title.trim(),
        employer: employer.trim(),
        posting_url: url.trim(),
        extracted_text: text.trim(),
      });
      setTitle(""); setEmployer(""); setUrl(""); setText("");
      onSaved();
    } catch (e: any) {
      Alert.alert("Save failed", String(e?.message || e));
    } finally { setSaving(false); }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.modalTitle}>Add Job Description</Text>
          <Text style={styles.modalHint}>Paste the full JD text. AI will not auto-extract when adding manually.</Text>

          <Text style={styles.fieldLabel}>Job Title *</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Financial Control Specialist"
            placeholderTextColor={colors.textTertiary}
            testID="manual-jd-title"
          />

          <Text style={styles.fieldLabel}>Employer</Text>
          <TextInput
            style={styles.input}
            value={employer}
            onChangeText={setEmployer}
            placeholder="e.g. Asian Development Bank"
            placeholderTextColor={colors.textTertiary}
            testID="manual-jd-employer"
          />

          <Text style={styles.fieldLabel}>Posting URL (optional)</Text>
          <TextInput
            style={styles.input}
            value={url}
            onChangeText={setUrl}
            placeholder="https://…"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            testID="manual-jd-url"
          />

          <Text style={styles.fieldLabel}>Job Description Text *</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={text}
            onChangeText={setText}
            placeholder="Paste the full job description here including all requirements, responsibilities, and qualifications"
            placeholderTextColor={colors.textTertiary}
            multiline
            testID="manual-jd-text"
          />

          <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.md }}>
            <TouchableOpacity style={styles.modalCancel} onPress={onClose}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalSave, !canSave && { opacity: 0.5 }]}
              onPress={save}
              disabled={!canSave || saving}
              testID="manual-jd-save"
            >
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalSaveText}>Save JD</Text>}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, gap: spacing.md, paddingBottom: 40 },
  headerRow: { flexDirection: "row", alignItems: "center" },
  h1: { color: colors.textPrimary, fontSize: 28, fontWeight: "300", letterSpacing: -0.5 },
  subtitle: { color: colors.textSecondary, fontSize: 13, marginTop: 4 },
  tailorCta: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: colors.primary, paddingVertical: 14, borderRadius: radius.md,
  },
  tailorCtaText: { color: "#fff", fontSize: 14, fontWeight: "800", letterSpacing: 0.4 },
  sectionHead: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    marginTop: spacing.md, marginBottom: 4,
  },
  sectionTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  uploadBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: colors.primary, paddingHorizontal: 10, paddingVertical: 7,
    borderRadius: radius.sm,
  },
  uploadBtnText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  uploadBtnAlt: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderColor: colors.primaryGlow, borderWidth: 1,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.sm,
  },
  uploadBtnAltText: { color: colors.primaryGlow, fontSize: 11, fontWeight: "700" },
  emptyCard: {
    backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1,
    borderRadius: radius.lg, padding: spacing.xl, alignItems: "center", gap: 6,
  },
  emptyText: { color: colors.textSecondary, fontSize: 13, fontWeight: "600" },
  emptyHint: { color: colors.textTertiary, fontSize: 11 },
  card: {
    backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1,
    borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm,
  },
  cardHead: { flexDirection: "row", alignItems: "flex-start" },
  cardName: { color: colors.textPrimary, fontSize: 14, fontWeight: "700", flexShrink: 1 },
  cardMeta: { color: colors.textTertiary, fontSize: 10, marginTop: 4 },
  ftBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  ftBadgeText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.4 },
  defaultBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: colors.primary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  defaultBadgeText: { color: "#fff", fontSize: 8, fontWeight: "800", letterSpacing: 0.6 },
  warnBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: "rgba(245,158,11,0.15)", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  warnBadgeText: { color: "#F59E0B", fontSize: 8, fontWeight: "700" },
  labelText: { color: colors.primaryGlow, fontSize: 12, fontWeight: "600", marginTop: 4 },
  labelPlaceholder: { color: colors.textTertiary, fontStyle: "italic", fontWeight: "400" },
  labelEditRow: { marginTop: 4 },
  labelInput: {
    backgroundColor: colors.surfaceElevated, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.borderSubtle, color: colors.textPrimary,
    paddingHorizontal: 8, paddingVertical: 6, fontSize: 12,
  },
  actions: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  actBtn: {
    flexDirection: "row", alignItems: "center", gap: 4, flexGrow: 1,
    justifyContent: "center", backgroundColor: colors.surfaceElevated,
    borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8,
  },
  actBtnDisabled: { opacity: 0.5 },
  actBtnPrimary: {
    flexDirection: "row", alignItems: "center", gap: 4, flexGrow: 1,
    justifyContent: "center", backgroundColor: colors.primary,
    borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8,
  },
  actBtnDanger: {
    flexDirection: "row", alignItems: "center", gap: 4,
    justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(239,68,68,0.35)",
    borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8,
  },
  actText: { color: colors.primaryGlow, fontSize: 11, fontWeight: "700" },
  actTextPrimary: { color: "#fff", fontSize: 11, fontWeight: "800" },
  actTextDanger: { color: "#EF4444", fontSize: 11, fontWeight: "700" },
  jdEmployer: { color: colors.textSecondary, fontSize: 12, marginTop: 2, fontWeight: "600" },
  matchBadge: {
    alignItems: "center", justifyContent: "center",
    width: 54, height: 54, borderRadius: 27,
  },
  matchBadgeText: { fontSize: 18, fontWeight: "800" },
  matchBadgeSub: { fontSize: 8, fontWeight: "700", opacity: 0.9 },
  histCard: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1,
    borderRadius: radius.md, padding: spacing.md,
  },
  histTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: "700" },
  histSub: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  histRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  histDelta: { fontSize: 14, fontWeight: "800" },
  linkCard: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: colors.primaryMuted, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: 12,
  },
  linkText: { color: colors.primaryGlow, fontSize: 13, fontWeight: "700", flex: 1 },
  modalBackdrop: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22,
    padding: spacing.lg, gap: 6, maxHeight: "85%",
  },
  modalTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: "800" },
  modalHint: { color: colors.textTertiary, fontSize: 11, marginBottom: 4 },
  fieldLabel: {
    color: colors.textTertiary, fontSize: 10, fontWeight: "800",
    letterSpacing: 0.6, textTransform: "uppercase", marginTop: 8,
  },
  input: {
    backgroundColor: colors.surfaceElevated, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.borderSubtle, color: colors.textPrimary,
    paddingHorizontal: 10, paddingVertical: 10, fontSize: 13, marginTop: 4,
  },
  textArea: { minHeight: 160, textAlignVertical: "top" },
  modalCancel: {
    flex: 1, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.borderSubtle,
    paddingVertical: 12, alignItems: "center",
  },
  modalCancelText: { color: colors.textSecondary, fontWeight: "700" },
  modalSave: {
    flex: 2, borderRadius: radius.sm, backgroundColor: colors.primary,
    paddingVertical: 12, alignItems: "center",
  },
  modalSaveText: { color: "#fff", fontWeight: "800" },
});
