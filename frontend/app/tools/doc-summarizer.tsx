// AI Document Summarizer (Enhancement 12)
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  Upload,
  Sparkles,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Info,
  Trash2,
  History,
  ChevronRight,
} from "lucide-react-native";
import * as DocumentPicker from "expo-document-picker";

import { docSummarizerApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";

type Focus = { value: string; label: string; instruction: string };

const sevColor = (sev?: string) =>
  sev === "critical" ? colors.danger : sev === "warn" ? colors.warning : colors.primaryGlow;
const sevIcon = (sev?: string) =>
  sev === "critical" ? AlertTriangle : sev === "warn" ? AlertTriangle : Info;
const prColor = (p?: string) =>
  p === "high" ? colors.danger : p === "med" ? colors.warning : colors.success;

const fmtBytes = (n?: number) => {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

export default function DocSummarizer() {
  const router = useRouter();

  const [focuses, setFocuses] = useState<Focus[]>([]);
  const [focus, setFocus] = useState<string>("general");
  const [save, setSave] = useState(true);

  const [pickedFile, setPickedFile] = useState<{ name: string; size?: number; blob?: any } | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any | null>(null);

  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const loadAll = useCallback(async () => {
    try {
      const [f, h] = await Promise.all([
        docSummarizerApi.focuses(),
        docSummarizerApi.history(),
      ]);
      setFocuses(f.focuses || []);
      setHistory(h.history || []);
    } catch (_e) {
      // ignore
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const pickFile = async () => {
    try {
      const r = await DocumentPicker.getDocumentAsync({
        type: [
          "application/pdf",
          "image/*",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "text/plain",
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (r.canceled || !r.assets?.[0]) return;
      const asset = r.assets[0];
      let blob: Blob | File;
      if (Platform.OS === "web" && (asset as any).file) {
        blob = (asset as any).file as File;
      } else {
        const resp = await fetch(asset.uri);
        blob = await resp.blob();
      }
      setPickedFile({ name: asset.name, size: asset.size as number | undefined, blob });
      setResult(null);
    } catch (e: any) {
      Alert.alert("Pick failed", e?.message || "Try again.");
    }
  };

  const runSummarize = async () => {
    if (!pickedFile?.blob) {
      Alert.alert("Pick a file", "Select a PDF, image, DOCX, or TXT to summarize.");
      return;
    }
    setRunning(true);
    setResult(null);
    try {
      const r = await docSummarizerApi.summarize(pickedFile.blob, {
        focus,
        save,
        filename: pickedFile.name,
      });
      setResult(r);
      if (save) {
        // refresh history list
        const h = await docSummarizerApi.history();
        setHistory(h.history || []);
      }
    } catch (e: any) {
      Alert.alert("Summarize failed", e?.message || "Try again.");
    } finally {
      setRunning(false);
    }
  };

  const openHistoryItem = async (id: string) => {
    try {
      const r = await docSummarizerApi.get(id);
      setResult(r);
    } catch (e: any) {
      Alert.alert("Load failed", e?.message || "Try again.");
    }
  };

  const deleteHistoryItem = async (id: string, name: string) => {
    const go = async () => {
      try {
        await docSummarizerApi.delete(id);
        setHistory((prev) => prev.filter((h) => h.summary_id !== id));
        if (result?.summary_id === id) setResult(null);
      } catch (e: any) {
        Alert.alert("Delete failed", e?.message || "Try again.");
      }
    };
    if (Platform.OS === "web") {
      if (window.confirm(`Delete summary for "${name}"?`)) await go();
      return;
    }
    Alert.alert("Delete?", `"${name}" will be removed.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: go },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} testID="ds-back">
          <ArrowLeft color={colors.textPrimary} size={20} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Document Summarizer · AI</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Picker + focus */}
        <View style={styles.card}>
          <TouchableOpacity style={styles.uploadDrop} onPress={pickFile} testID="ds-pick">
            <Upload size={22} color={colors.primaryGlow} />
            <Text style={styles.uploadDropTitle}>
              {pickedFile ? pickedFile.name : "Pick a PDF, image, DOCX, or TXT"}
            </Text>
            <Text style={styles.uploadDropSub}>
              {pickedFile
                ? `${fmtBytes(pickedFile.size)} · tap to change`
                : "Up to 12 MB. Images use PLOS AI vision."}
            </Text>
          </TouchableOpacity>

          <Text style={styles.fieldLabel}>FOCUS</Text>
          <View style={styles.pillRow}>
            {focuses.map((f) => (
              <TouchableOpacity
                key={f.value}
                onPress={() => setFocus(f.value)}
                style={[styles.pill, focus === f.value && styles.pillActive]}
                testID={`ds-focus-${f.value}`}
              >
                <Text style={[styles.pillText, focus === f.value && styles.pillTextActive]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {focus && (
            <Text style={styles.focusHint} numberOfLines={3}>
              {focuses.find((f) => f.value === focus)?.instruction}
            </Text>
          )}

          <View style={styles.saveRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.saveTitle}>Save to history</Text>
              <Text style={styles.saveSub}>Persist this summary so you can revisit later.</Text>
            </View>
            <Switch
              value={save}
              onValueChange={setSave}
              trackColor={{ false: colors.surfaceElevated, true: colors.primary }}
              thumbColor="#fff"
              testID="ds-save-toggle"
            />
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, (running || !pickedFile) && { opacity: 0.6 }]}
            onPress={runSummarize}
            disabled={running || !pickedFile}
            testID="ds-summarize"
          >
            <Sparkles size={14} color="#fff" />
            <Text style={styles.primaryBtnText}>
              {running ? "Reading & summarizing…" : "Summarize Document"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* RESULT */}
        {result && (
          <View testID="ds-result" style={{ gap: spacing.sm }}>
            <Text style={styles.sectionLabel}>SUMMARY</Text>
            <View style={styles.card}>
              <View style={styles.resultHead}>
                <View style={styles.fileBadge}>
                  <FileText size={14} color={colors.primaryGlow} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.resultTitle} numberOfLines={1}>{result.file_name}</Text>
                  <Text style={styles.resultMeta}>
                    {result.focus_label} · {fmtBytes(result.size_bytes)}
                    {result.saved ? " · saved" : ""}
                  </Text>
                </View>
              </View>
              {!!result.tldr && <Text style={styles.tldr}>{result.tldr}</Text>}
              {!!result.summary && (
                <Text style={styles.summaryText}>{result.summary}</Text>
              )}
              {Array.isArray(result.topics) && result.topics.length > 0 && (
                <View style={[styles.pillRow, { marginTop: spacing.sm }]}>
                  {result.topics.map((t: string) => (
                    <View key={t} style={[styles.pill, { backgroundColor: colors.primaryMuted, borderColor: colors.primaryMuted }]}>
                      <Text style={[styles.pillText, { color: colors.primaryGlow }]}>{t}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {Array.isArray(result.key_points) && result.key_points.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>KEY POINTS</Text>
                <View style={styles.card}>
                  {result.key_points.map((p: string, i: number) => (
                    <View key={i} style={styles.bulletRow}>
                      <CheckCircle2 size={12} color={colors.success} />
                      <Text style={styles.bulletText}>{p}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            {Array.isArray(result.action_items) && result.action_items.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>ACTION ITEMS</Text>
                {result.action_items.map((a: any, i: number) => (
                  <View key={i} style={styles.actionCard}>
                    <View style={[styles.priorityPip, { backgroundColor: prColor(a.priority) }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.actionTitle}>{a.action}</Text>
                      <Text style={styles.actionMeta}>
                        {a.owner ? `owner: ${a.owner} · ` : ""}
                        {a.deadline ? `due: ${a.deadline} · ` : ""}
                        {(a.priority || "med").toUpperCase()}
                      </Text>
                    </View>
                  </View>
                ))}
              </>
            )}

            {Array.isArray(result.flags) && result.flags.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>FLAGS</Text>
                {result.flags.map((f: any, i: number) => {
                  const Icon = sevIcon(f.severity);
                  return (
                    <View
                      key={i}
                      style={[styles.flagCard, { borderColor: sevColor(f.severity) }]}
                    >
                      <Icon size={14} color={sevColor(f.severity)} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.flagLabel, { color: sevColor(f.severity) }]}>
                          {f.label}
                        </Text>
                        <Text style={styles.flagDetail}>{f.detail}</Text>
                      </View>
                    </View>
                  );
                })}
              </>
            )}
          </View>
        )}

        {/* HISTORY */}
        <View style={[styles.sectionHead, { marginTop: spacing.xl }]}>
          <History size={14} color={colors.textTertiary} />
          <Text style={styles.sectionLabel}>HISTORY</Text>
        </View>
        {loadingHistory ? (
          <ActivityIndicator color={colors.primaryGlow} />
        ) : history.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.empty}>
              Saved summaries will appear here. Turn on “Save to history” before summarizing.
            </Text>
          </View>
        ) : (
          history.map((h) => (
            <View key={h.summary_id} style={styles.historyRow} testID={`ds-hist-${h.summary_id}`}>
              <TouchableOpacity
                style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm }}
                onPress={() => openHistoryItem(h.summary_id)}
                testID={`ds-hist-open-${h.summary_id}`}
              >
                <FileText size={14} color={colors.primaryGlow} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.historyTitle} numberOfLines={1}>{h.file_name}</Text>
                  <Text style={styles.historyMeta} numberOfLines={2}>
                    {h.focus_label} · {h.tldr || "—"}
                  </Text>
                </View>
                <ChevronRight size={14} color={colors.textTertiary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.smallIconBtn}
                onPress={() => deleteHistoryItem(h.summary_id, h.file_name)}
                testID={`ds-hist-delete-${h.summary_id}`}
              >
                <Trash2 size={13} color={colors.danger} />
              </TouchableOpacity>
            </View>
          ))
        )}

        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.surfaceElevated,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  scroll: { padding: spacing.lg, gap: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  uploadDrop: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.primaryMuted,
    borderWidth: 1,
    borderStyle: "dashed" as any,
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: "center",
    gap: 6,
  },
  uploadDropTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: "700", textAlign: "center" },
  uploadDropSub: { color: colors.textTertiary, fontSize: 11, textAlign: "center" },
  fieldLabel: {
    color: colors.textTertiary, fontSize: 10, fontWeight: "700", letterSpacing: 1, marginTop: 4,
  },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pill: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14,
    borderColor: colors.borderSubtle, borderWidth: 1,
  },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { color: colors.textSecondary, fontSize: 11, fontWeight: "600" },
  pillTextActive: { color: "#fff" },
  focusHint: { color: colors.textTertiary, fontSize: 11, lineHeight: 16, fontStyle: "italic" },
  saveRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  saveTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: "600" },
  saveSub: { color: colors.textTertiary, fontSize: 11, marginTop: 2 },
  primaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: colors.primary, paddingVertical: 12, borderRadius: radius.md,
    marginTop: 4,
  },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },

  sectionHead: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing.md, marginBottom: 4 },
  sectionLabel: { color: colors.textTertiary, fontSize: 11, fontWeight: "700", letterSpacing: 1.2 },

  resultHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  fileBadge: {
    width: 28, height: 28, borderRadius: radius.sm, backgroundColor: colors.primaryMuted,
    alignItems: "center", justifyContent: "center",
  },
  resultTitle: { color: colors.textPrimary, fontWeight: "700", fontSize: 14 },
  resultMeta: { color: colors.textTertiary, fontSize: 11, marginTop: 2 },
  tldr: {
    color: colors.primaryGlow, fontSize: 13, fontStyle: "italic",
    backgroundColor: colors.primaryMuted, padding: spacing.sm, borderRadius: radius.sm, lineHeight: 19,
  },
  summaryText: { color: colors.textPrimary, fontSize: 13, lineHeight: 19 },
  bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  bulletText: { color: colors.textPrimary, fontSize: 12, lineHeight: 18, flex: 1 },
  actionCard: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1,
    borderRadius: radius.md, padding: spacing.md,
  },
  priorityPip: { width: 4, height: 36, borderRadius: 2 },
  actionTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: "600" },
  actionMeta: { color: colors.textTertiary, fontSize: 11, marginTop: 2 },
  flagCard: {
    flexDirection: "row", alignItems: "flex-start", gap: spacing.sm,
    backgroundColor: colors.surface, borderWidth: 1,
    borderRadius: radius.md, padding: spacing.md,
  },
  flagLabel: { fontSize: 12, fontWeight: "700" },
  flagDetail: { color: colors.textSecondary, fontSize: 11, marginTop: 2, lineHeight: 16 },

  empty: { color: colors.textTertiary, fontSize: 12 },
  historyRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1,
    borderRadius: radius.md, padding: spacing.md,
  },
  historyTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: "700" },
  historyMeta: { color: colors.textTertiary, fontSize: 11, marginTop: 2 },
  smallIconBtn: {
    width: 30, height: 30, borderRadius: radius.sm,
    backgroundColor: colors.surfaceElevated, alignItems: "center", justifyContent: "center",
  },
});
