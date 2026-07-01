// Career Resume Vault — list, upload, set-default, delete
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import {
  ArrowLeft, Upload, Trash2, Star, StarOff, FileText, ClipboardPaste, CheckCircle2,
} from "lucide-react-native";

import { careerResumesApi, type ResumeFileType } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";

type Resume = {
  resume_id: string;
  name: string;
  file_type: ResumeFileType;
  is_default: boolean;
  size_bytes: number;
  uploaded_at: string;
};

const TYPE_META: Record<ResumeFileType, { label: string; bg: string; fg: string }> = {
  pdf:   { label: "PDF",   bg: "rgba(239,68,68,0.15)",  fg: "#EF4444" },
  docx:  { label: "DOCX",  bg: "rgba(59,130,246,0.15)", fg: "#3B82F6" },
  doc:   { label: "DOC",   bg: "rgba(59,130,246,0.15)", fg: "#3B82F6" },
  txt:   { label: "TXT",   bg: "rgba(148,163,184,0.15)", fg: "#94A3B8" },
  paste: { label: "PASTE", bg: "rgba(168,85,247,0.15)", fg: "#A855F7" },
};

function humanBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function humanDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch { return "—"; }
}

export default function ResumeVault() {
  const router = useRouter();
  const [items, setItems] = useState<Resume[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteName, setPasteName] = useState("");
  const [pasteText, setPasteText] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await careerResumesApi.list();
      setItems(r.resumes || []);
    } catch (e: any) {
      Alert.alert("Failed to load resumes", String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const pickFile = useCallback(async () => {
    setBusy("pick");
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          "application/pdf",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/msword",
          "text/plain",
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled) return;
      const asset = res.assets?.[0];
      if (!asset) return;
      const name = asset.name || "Resume";
      const ext = (name.split(".").pop() || "").toLowerCase() as ResumeFileType;
      const validExt: ResumeFileType[] = ["pdf", "docx", "doc", "txt"];
      if (!validExt.includes(ext)) {
        Alert.alert("Unsupported file", "Please upload a PDF, DOCX, DOC, or TXT file.");
        return;
      }
      // Read as base64
      let b64: string;
      if (Platform.OS === "web") {
        // Fetch the URI (blob:) and read as base64
        const r = await fetch(asset.uri);
        const blob = await r.blob();
        b64 = await new Promise<string>((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => {
            const s = String(fr.result || "");
            const idx = s.indexOf("base64,");
            resolve(idx >= 0 ? s.slice(idx + 7) : s);
          };
          fr.onerror = reject;
          fr.readAsDataURL(blob);
        });
      } else {
        b64 = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: "base64" as any,
        });
      }
      await careerResumesApi.create({ name, file_type: ext, content_b64: b64 });
      await load();
    } catch (e: any) {
      Alert.alert("Upload failed", String(e?.message || e));
    } finally {
      setBusy(null);
    }
  }, [load]);

  const savePaste = useCallback(async () => {
    if (!pasteName.trim() || !pasteText.trim()) {
      Alert.alert("Missing fields", "Give the resume a name and paste the content.");
      return;
    }
    setBusy("paste");
    try {
      await careerResumesApi.create({
        name: pasteName.trim(),
        file_type: "paste",
        text: pasteText.trim(),
      });
      setPasteOpen(false); setPasteName(""); setPasteText("");
      await load();
    } catch (e: any) {
      Alert.alert("Save failed", String(e?.message || e));
    } finally { setBusy(null); }
  }, [pasteName, pasteText, load]);

  const setDefault = useCallback(async (r: Resume) => {
    if (r.is_default) return;
    setBusy(r.resume_id);
    try {
      await careerResumesApi.setDefault(r.resume_id);
      await load();
    } catch (e: any) {
      Alert.alert("Update failed", String(e?.message || e));
    } finally { setBusy(null); }
  }, [load]);

  const remove = useCallback((r: Resume) => {
    Alert.alert(
      "Delete resume?",
      `${r.name} will be permanently removed. This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete", style: "destructive",
          onPress: async () => {
            setBusy(r.resume_id);
            try {
              await careerResumesApi.remove(r.resume_id);
              await load();
            } catch (e: any) {
              Alert.alert("Delete failed", String(e?.message || e));
            } finally { setBusy(null); }
          },
        },
      ]
    );
  }, [load]);

  const renderItem = ({ item }: { item: Resume }) => {
    const meta = TYPE_META[item.file_type];
    const busyThis = busy === item.resume_id;
    return (
      <View style={styles.card} testID={`resume-${item.resume_id}`}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <View style={[styles.typeBadge, { backgroundColor: meta.bg }]}>
            <Text style={[styles.typeBadgeText, { color: meta.fg }]}>{meta.label}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.sub}>
              {humanBytes(item.size_bytes)} · {humanDate(item.uploaded_at)}
            </Text>
          </View>
          {item.is_default && (
            <View style={styles.defaultChip}>
              <CheckCircle2 size={11} color={colors.success} />
              <Text style={styles.defaultChipText}>Default</Text>
            </View>
          )}
        </View>
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, item.is_default && { opacity: 0.4 }]}
            onPress={() => setDefault(item)}
            disabled={item.is_default || busyThis}
            testID={`resume-default-${item.resume_id}`}
          >
            {item.is_default ? <Star size={13} color={colors.warning} /> : <StarOff size={13} color={colors.textSecondary} />}
            <Text style={styles.actionText}>
              {item.is_default ? "Base resume" : "Set as base"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => remove(item)}
            testID={`resume-delete-${item.resume_id}`}
            disabled={busyThis}
          >
            <Trash2 size={13} color={colors.danger} />
            <Text style={[styles.actionText, { color: colors.danger }]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="vault-back">
          <ArrowLeft size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Resume Vault</Text>
        <View style={{ width: 22 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
        <Text style={styles.helper}>
          Store multiple resumes. Pick one as your <Text style={{ color: colors.primaryGlow, fontWeight: "700" }}>base</Text> — that is the one Claude will tailor when you use Tailor Resume for a Job.
        </Text>

        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={pickFile}
            disabled={busy === "pick"}
            testID="vault-upload"
          >
            {busy === "pick" ? <ActivityIndicator color="#fff" size="small" /> : <Upload size={14} color="#fff" />}
            <Text style={styles.primaryBtnText}>Upload PDF / DOCX / TXT</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => setPasteOpen((v) => !v)}
            testID="vault-paste-toggle"
          >
            <ClipboardPaste size={14} color={colors.primaryGlow} />
            <Text style={styles.secondaryBtnText}>Paste</Text>
          </TouchableOpacity>
        </View>

        {pasteOpen && (
          <View style={styles.pasteCard}>
            <TextInput
              value={pasteName}
              onChangeText={setPasteName}
              placeholder="Resume name (e.g. Master Resume 2026)"
              placeholderTextColor={colors.textTertiary}
              style={styles.input}
            />
            <TextInput
              value={pasteText}
              onChangeText={setPasteText}
              placeholder="Paste your resume content here…"
              placeholderTextColor={colors.textTertiary}
              multiline
              numberOfLines={10}
              style={[styles.input, { minHeight: 180, textAlignVertical: "top" }]}
            />
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={savePaste}
              disabled={busy === "paste"}
              testID="vault-paste-save"
            >
              {busy === "paste" ? <ActivityIndicator color="#fff" size="small" /> : null}
              <Text style={styles.primaryBtnText}>Save Resume</Text>
            </TouchableOpacity>
          </View>
        )}

        {loading ? (
          <View style={{ padding: spacing.xl, alignItems: "center" }}>
            <ActivityIndicator color={colors.primaryGlow} />
          </View>
        ) : items.length === 0 ? (
          <View style={styles.emptyCard}>
            <FileText size={28} color={colors.textTertiary} />
            <Text style={styles.emptyTitle}>No resumes yet</Text>
            <Text style={styles.emptyText}>
              Upload your master resume so PLOS Career can tailor it for each job.
            </Text>
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(x) => x.resume_id}
            renderItem={renderItem}
            scrollEnabled={false}
            contentContainerStyle={{ gap: spacing.sm }}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.borderSubtle,
  },
  title: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  helper: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  primaryBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, backgroundColor: colors.primary, paddingVertical: 12,
    borderRadius: radius.md,
  },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  secondaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    paddingVertical: 12, paddingHorizontal: spacing.md, borderRadius: radius.md,
  },
  secondaryBtnText: { color: colors.primaryGlow, fontWeight: "700", fontSize: 13 },
  pasteCard: {
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.md, padding: spacing.md, gap: spacing.sm,
  },
  input: {
    backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle, borderWidth: 1,
    borderRadius: radius.sm, padding: spacing.sm, color: colors.textPrimary, fontSize: 13,
  },
  card: {
    backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1,
    borderRadius: radius.md, padding: spacing.md, gap: spacing.sm,
  },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.sm },
  typeBadgeText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
  name: { color: colors.textPrimary, fontWeight: "700", fontSize: 14 },
  sub: { color: colors.textTertiary, fontSize: 11, marginTop: 2 },
  defaultChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(16,185,129,0.10)", borderColor: "rgba(16,185,129,0.30)",
    borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 3,
  },
  defaultChipText: { color: colors.success, fontSize: 9, fontWeight: "800", letterSpacing: 0.4 },
  actions: { flexDirection: "row", gap: spacing.sm },
  actionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 8, borderRadius: radius.sm,
    backgroundColor: colors.surfaceElevated,
  },
  actionText: { color: colors.textSecondary, fontSize: 12, fontWeight: "600" },
  emptyCard: {
    alignItems: "center", padding: spacing.xl, gap: spacing.sm,
    backgroundColor: colors.surface, borderColor: colors.borderSubtle,
    borderWidth: 1, borderRadius: radius.md,
  },
  emptyTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
  emptyText: { color: colors.textTertiary, fontSize: 12, textAlign: "center", lineHeight: 18 },
});
