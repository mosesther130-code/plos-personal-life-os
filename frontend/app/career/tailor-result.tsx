// Career — Tailor Results (ATS score, keyword analysis, resume + cover
// letter preview, download/email, save-to-application, thank-you + follow-up)
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft, Download, Mail, CheckCircle2, AlertTriangle,
  Star, FileText, Save, MessageCircle, Clock,
} from "lucide-react-native";

import { careerTailorApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";
import { downloadBase64Pdf } from "@/src/lib/pdf-download";

type Version = {
  version_id: string;
  job_title: string;
  company: string;
  ats_score: number;
  keywords_matched: string[];
  keywords_missing: string[];
  summary: string;
  tailored_resume_md: string;
  cover_letter_md: string;
  interview_questions: string[];
  thank_you_letter_md: string;
  follow_up_letter_md: string;
  saved_to_application_id: string | null;
  generated_date: string;
  resume_name: string;
};

export default function TailorResult() {
  const router = useRouter();
  const { version_id } = useLocalSearchParams<{ version_id: string }>();
  const [ver, setVer] = useState<Version | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"resume" | "cover" | "interview">("resume");
  const [busy, setBusy] = useState<string | null>(null);
  const [thankYou, setThankYou] = useState<{ open: boolean; name: string; topic: string }>({
    open: false, name: "", topic: "",
  });
  const [followUp, setFollowUp] = useState<{ open: boolean; days: string }>({
    open: false, days: "7",
  });

  const load = useCallback(async () => {
    if (!version_id) return;
    try {
      const doc = await careerTailorApi.getVersion(String(version_id));
      setVer(doc);
    } catch (e: any) {
      Alert.alert("Failed to load", String(e?.message || e));
    } finally { setLoading(false); }
  }, [version_id]);

  useEffect(() => { load(); }, [load]);

  const doDownload = useCallback(async (
    kind: "resume" | "cover" | "thankyou" | "followup"
  ) => {
    if (!ver) return;
    setBusy(`download-${kind}`);
    try {
      const r = await careerTailorApi.download(ver.version_id, kind);
      const res = await downloadBase64Pdf(r.content_b64, r.filename, r.mime);
      if (!res.ok) throw new Error(res.error || "Download failed");
    } catch (e: any) {
      Alert.alert("Download failed", String(e?.message || e));
    } finally { setBusy(null); }
  }, [ver]);

  const saveApplication = useCallback(async () => {
    if (!ver) return;
    setBusy("save");
    try {
      const r = await careerTailorApi.saveApplication(ver.version_id);
      Alert.alert("Saved to Applications", `New application created (id: ${r.application_id.slice(-6)}). Status: Applied.`);
      await load();
    } catch (e: any) {
      Alert.alert("Save failed", String(e?.message || e));
    } finally { setBusy(null); }
  }, [ver, load]);

  const genThankYou = useCallback(async () => {
    if (!ver || !thankYou.name.trim() || !thankYou.topic.trim()) {
      Alert.alert("Missing info", "Interviewer name and topic discussed are both required.");
      return;
    }
    setBusy("thankyou");
    try {
      await careerTailorApi.thankYou({
        version_id: ver.version_id,
        interviewer_name: thankYou.name.trim(),
        topic_discussed: thankYou.topic.trim(),
      });
      setThankYou({ open: false, name: "", topic: "" });
      await load();
      Alert.alert("Thank-you letter generated", "Tap Download to save the PDF.");
    } catch (e: any) {
      Alert.alert("Generation failed", String(e?.message || e));
    } finally { setBusy(null); }
  }, [ver, thankYou, load]);

  const genFollowUp = useCallback(async () => {
    if (!ver) return;
    const days = parseInt(followUp.days, 10);
    if (!Number.isFinite(days) || days < 0) {
      Alert.alert("Invalid", "Enter a number of days since applied.");
      return;
    }
    setBusy("followup");
    try {
      await careerTailorApi.followUp({
        version_id: ver.version_id,
        days_since_applied: days,
      });
      setFollowUp({ open: false, days: "7" });
      await load();
      Alert.alert("Follow-up letter generated", "Tap Download to save the PDF.");
    } catch (e: any) {
      Alert.alert("Generation failed", String(e?.message || e));
    } finally { setBusy(null); }
  }, [ver, followUp, load]);

  if (loading || !ver) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.primaryGlow} />
        </View>
      </SafeAreaView>
    );
  }

  const scoreColor =
    ver.ats_score >= 80 ? colors.success :
    ver.ats_score >= 60 ? colors.warning : colors.danger;
  const scoreLabel =
    ver.ats_score >= 80 ? "Excellent" :
    ver.ats_score >= 60 ? "Good" :
    ver.ats_score >= 40 ? "Fair" : "Weak";

  const activeContent =
    tab === "resume" ? ver.tailored_resume_md :
    tab === "cover" ? ver.cover_letter_md :
    (ver.interview_questions || []).map((q, i) => `${i + 1}. ${q}`).join("\n\n");

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="result-back">
          <ArrowLeft size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>
          {ver.job_title} · {ver.company}
        </Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {/* ATS score */}
        <View style={styles.scoreCard} testID="ats-score-card">
          <View>
            <Text style={styles.scoreTiny}>ATS MATCH SCORE</Text>
            <Text style={[styles.scoreBig, { color: scoreColor }]}>{ver.ats_score}<Text style={styles.scoreMax}>/100</Text></Text>
            <Text style={[styles.scoreLabel, { color: scoreColor }]}>{scoreLabel}</Text>
          </View>
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Text style={styles.scoreSummary} numberOfLines={5}>{ver.summary}</Text>
          </View>
        </View>

        {/* Keyword analysis */}
        <Text style={styles.sectionLabel}>Keyword Analysis</Text>
        <View style={styles.kwGrid} testID="keyword-analysis">
          <View style={styles.kwCol}>
            <View style={styles.kwHead}>
              <CheckCircle2 size={14} color={colors.success} />
              <Text style={[styles.kwHeadText, { color: colors.success }]}>Found ({ver.keywords_matched.length})</Text>
            </View>
            {ver.keywords_matched.map((k, i) => (
              <View key={`m-${i}`} style={[styles.kwChip, { borderColor: "rgba(16,185,129,0.3)" }]}>
                <Text style={styles.kwText}>{k}</Text>
              </View>
            ))}
          </View>
          <View style={styles.kwCol}>
            <View style={styles.kwHead}>
              <AlertTriangle size={14} color={colors.warning} />
              <Text style={[styles.kwHeadText, { color: colors.warning }]}>Missing ({ver.keywords_missing.length})</Text>
            </View>
            {ver.keywords_missing.map((k, i) => (
              <View key={`x-${i}`} style={[styles.kwChip, { borderColor: "rgba(245,158,11,0.3)" }]}>
                <Text style={styles.kwText}>{k}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Preview tabs */}
        <Text style={styles.sectionLabel}>Preview</Text>
        <View style={styles.tabs}>
          {(["resume", "cover", "interview"] as const).map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.tab, tab === t && styles.tabActive]}
              onPress={() => setTab(t)}
              testID={`preview-tab-${t}`}
            >
              <Text style={[styles.tabText, tab === t && { color: colors.primaryGlow }]}>
                {t === "resume" ? "Resume" : t === "cover" ? "Cover Letter" : "Interview Qs"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.previewCard} testID="preview-body">
          <Text style={styles.previewText}>{activeContent || "—"}</Text>
        </View>

        {/* Download / Save actions */}
        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
          <TouchableOpacity
            style={styles.actionPrimary}
            onPress={() => doDownload(tab === "cover" ? "cover" : "resume")}
            disabled={busy?.startsWith("download")}
            testID="download-pdf"
          >
            {busy?.startsWith("download") ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Download size={14} color="#fff" />
            )}
            <Text style={styles.actionPrimaryText}>
              Download {tab === "cover" ? "Cover Letter" : "Resume"} PDF
            </Text>
          </TouchableOpacity>
        </View>
        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
          <TouchableOpacity
            style={styles.actionSecondary}
            onPress={saveApplication}
            disabled={busy === "save" || !!ver.saved_to_application_id}
            testID="save-application"
          >
            {ver.saved_to_application_id ? (
              <CheckCircle2 size={13} color={colors.success} />
            ) : (
              <Save size={13} color={colors.primaryGlow} />
            )}
            <Text style={styles.actionSecondaryText}>
              {ver.saved_to_application_id ? "Saved to Applications" : "Save to Applications"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Extras: Thank-you + follow-up */}
        <Text style={styles.sectionLabel}>Additional Letters</Text>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <TouchableOpacity
            style={styles.extraBtn}
            onPress={() => setThankYou({ open: true, name: "", topic: "" })}
            testID="thankyou-open"
          >
            <MessageCircle size={13} color={colors.primaryGlow} />
            <Text style={styles.extraBtnText}>Thank-you letter</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.extraBtn}
            onPress={() => setFollowUp({ open: true, days: "7" })}
            testID="followup-open"
          >
            <Clock size={13} color={colors.primaryGlow} />
            <Text style={styles.extraBtnText}>Follow-up letter</Text>
          </TouchableOpacity>
        </View>
        {ver.thank_you_letter_md ? (
          <TouchableOpacity
            style={styles.doneRow}
            onPress={() => doDownload("thankyou")}
            testID="thankyou-download"
          >
            <FileText size={13} color={colors.success} />
            <Text style={styles.doneRowText}>Thank-you letter ready · Tap to download</Text>
          </TouchableOpacity>
        ) : null}
        {ver.follow_up_letter_md ? (
          <TouchableOpacity
            style={styles.doneRow}
            onPress={() => doDownload("followup")}
            testID="followup-download"
          >
            <FileText size={13} color={colors.success} />
            <Text style={styles.doneRowText}>Follow-up letter ready · Tap to download</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>

      {/* Thank-you modal */}
      <Modal visible={thankYou.open} transparent animationType="fade" onRequestClose={() => setThankYou({ open: false, name: "", topic: "" })}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Thank-You Letter</Text>
            <TextInput
              placeholder="Interviewer name (e.g. Jane Doe)"
              placeholderTextColor={colors.textTertiary}
              value={thankYou.name}
              onChangeText={(v) => setThankYou((s) => ({ ...s, name: v }))}
              style={styles.modalInput}
            />
            <TextInput
              placeholder="One topic discussed during interview…"
              placeholderTextColor={colors.textTertiary}
              value={thankYou.topic}
              onChangeText={(v) => setThankYou((s) => ({ ...s, topic: v }))}
              multiline
              style={[styles.modalInput, { minHeight: 80, textAlignVertical: "top" }]}
            />
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setThankYou({ open: false, name: "", topic: "" })}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={genThankYou} disabled={busy === "thankyou"} testID="thankyou-generate">
                {busy === "thankyou" ? <ActivityIndicator size="small" color="#fff" /> : <Star size={13} color="#fff" />}
                <Text style={styles.modalConfirmText}>Generate</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Follow-up modal */}
      <Modal visible={followUp.open} transparent animationType="fade" onRequestClose={() => setFollowUp({ open: false, days: "7" })}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Follow-Up Letter</Text>
            <TextInput
              placeholder="Days since applied (e.g. 7)"
              placeholderTextColor={colors.textTertiary}
              value={followUp.days}
              onChangeText={(v) => setFollowUp((s) => ({ ...s, days: v.replace(/[^\d]/g, "") }))}
              keyboardType="numeric"
              style={styles.modalInput}
            />
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setFollowUp({ open: false, days: "7" })}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={genFollowUp} disabled={busy === "followup"} testID="followup-generate">
                {busy === "followup" ? <ActivityIndicator size="small" color="#fff" /> : <Clock size={13} color="#fff" />}
                <Text style={styles.modalConfirmText}>Generate</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.borderSubtle, gap: spacing.sm,
  },
  title: { color: colors.textPrimary, fontSize: 14, fontWeight: "700", flex: 1, textAlign: "center" },
  body: { padding: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },
  scoreCard: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1,
    borderRadius: radius.md, padding: spacing.md,
  },
  scoreTiny: { color: colors.textTertiary, fontSize: 10, fontWeight: "700", letterSpacing: 0.8 },
  scoreBig: { fontSize: 44, fontWeight: "800", lineHeight: 46, marginTop: 2 },
  scoreMax: { color: colors.textTertiary, fontSize: 15, fontWeight: "600" },
  scoreLabel: { fontSize: 12, fontWeight: "800", letterSpacing: 0.5, marginTop: 2 },
  scoreSummary: { color: colors.textSecondary, fontSize: 11, lineHeight: 16 },
  sectionLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 0.6, marginTop: spacing.sm, textTransform: "uppercase" },
  kwGrid: { flexDirection: "row", gap: spacing.sm },
  kwCol: { flex: 1, gap: 4 },
  kwHead: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 },
  kwHeadText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.3 },
  kwChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm, borderWidth: 1, backgroundColor: colors.surface },
  kwText: { color: colors.textPrimary, fontSize: 11, fontWeight: "600" },
  tabs: {
    flexDirection: "row", backgroundColor: colors.surface,
    borderColor: colors.borderSubtle, borderWidth: 1, borderRadius: radius.md,
    padding: 3,
  },
  tab: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: radius.sm },
  tabActive: { backgroundColor: colors.primaryMuted },
  tabText: { color: colors.textSecondary, fontSize: 12, fontWeight: "700" },
  previewCard: {
    backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1,
    borderRadius: radius.md, padding: spacing.md,
  },
  previewText: { color: colors.textPrimary, fontSize: 12, lineHeight: 19, fontFamily: undefined },
  actionPrimary: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, backgroundColor: colors.primary, paddingVertical: 12, borderRadius: radius.md,
  },
  actionPrimaryText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  actionSecondary: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    paddingVertical: 12, borderRadius: radius.md,
  },
  actionSecondaryText: { color: colors.primaryGlow, fontSize: 12, fontWeight: "700" },
  extraBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1,
    paddingVertical: 10, borderRadius: radius.md,
  },
  extraBtnText: { color: colors.primaryGlow, fontSize: 12, fontWeight: "700" },
  doneRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(16,185,129,0.10)", borderColor: "rgba(16,185,129,0.30)",
    borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 8,
    marginTop: 6,
  },
  doneRowText: { color: colors.success, fontSize: 12, fontWeight: "700" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: spacing.md },
  modalCard: {
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.md, padding: spacing.md, gap: spacing.sm,
  },
  modalTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: "700" },
  modalInput: {
    backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle, borderWidth: 1,
    borderRadius: radius.sm, padding: spacing.sm, color: colors.textPrimary, fontSize: 13,
  },
  modalCancel: {
    flex: 1, paddingVertical: 10, borderRadius: radius.sm,
    backgroundColor: colors.surfaceElevated, alignItems: "center",
  },
  modalCancelText: { color: colors.textSecondary, fontWeight: "700", fontSize: 12 },
  modalConfirm: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 10, borderRadius: radius.sm, backgroundColor: colors.primary,
  },
  modalConfirmText: { color: "#fff", fontWeight: "800", fontSize: 12 },
});
