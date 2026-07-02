// PLOS Career — Tailoring Results (v2). Full ATS-first output view.
import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as Clipboard from "expo-clipboard";
import {
  ChevronLeft, CheckCircle2, Star, TriangleAlert, Edit3, Download,
  Mail, Save, Copy, ChevronDown, ChevronRight, Sparkles, RefreshCw,
} from "lucide-react-native";
import { careerLibraryApi, TailorVersion } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";
import { downloadBase64Pdf } from "@/src/lib/pdf-download";
import Svg, { Circle } from "react-native-svg";

function GaugeRing({ score, size = 96, color, label }: { score: number; size?: number; color: string; label: string }) {
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  const dash = (pct / 100) * c;
  return (
    <View style={{ alignItems: "center" }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={color} strokeWidth={stroke} fill="none"
          strokeDasharray={`${dash} ${c - dash}`}
          strokeDashoffset={c / 4}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: colors.textPrimary, fontSize: 22, fontWeight: "800" }}>{Math.round(score)}</Text>
        <Text style={{ color: colors.textTertiary, fontSize: 9, fontWeight: "700", letterSpacing: 0.4 }}>{label}</Text>
      </View>
    </View>
  );
}

export default function TailorResultsV2() {
  const router = useRouter();
  const { version_id } = useLocalSearchParams<{ version_id: string }>();
  const [loading, setLoading] = useState(true);
  const [v, setV] = useState<TailorVersion | null>(null);
  const [editingResume, setEditingResume] = useState(false);
  const [editingCover, setEditingCover] = useState(false);
  const [resumeDraft, setResumeDraft] = useState("");
  const [coverDraft, setCoverDraft] = useState("");
  const [openQuestion, setOpenQuestion] = useState<number | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  const load = useCallback(async () => {
    if (!version_id) return;
    try {
      const doc = await careerLibraryApi.getVersion(String(version_id));
      setV(doc);
      setResumeDraft(doc.tailored_resume_text || "");
      setCoverDraft(doc.cover_letter_text || "");
    } catch (e: any) {
      Alert.alert("Load failed", String(e?.message || e));
    } finally { setLoading(false); }
  }, [version_id]);

  useEffect(() => { load(); }, [load]);

  async function saveResumeEdit() {
    if (!v) return;
    try {
      await careerLibraryApi.editVersion(v.version_id, { tailored_resume_text: resumeDraft });
      setV({ ...v, tailored_resume_text: resumeDraft, manually_edited: true });
      setEditingResume(false);
    } catch (e: any) { Alert.alert("Failed", String(e?.message || e)); }
  }

  async function saveCoverEdit() {
    if (!v) return;
    try {
      await careerLibraryApi.editVersion(v.version_id, { cover_letter_text: coverDraft });
      setV({ ...v, cover_letter_text: coverDraft, manually_edited: true });
      setEditingCover(false);
    } catch (e: any) { Alert.alert("Failed", String(e?.message || e)); }
  }

  async function download(fmt: "pdf" | "docx") {
    if (!v) return;
    try {
      const d = await careerLibraryApi.download(v.version_id, "combined", fmt);
      const res = await downloadBase64Pdf(d.content_b64, d.filename, d.mime);
      if (!res.ok) {
        Alert.alert("Download failed", res.error || "Unknown error");
      }
    } catch (e: any) { Alert.alert("Download failed", String(e?.message || e)); }
  }

  async function emailPackage() {
    if (!v) return;
    try {
      const s = await careerLibraryApi.email(v.version_id);
      if (s.status === "sent") Alert.alert("Sent", "Package emailed successfully.");
      else if (s.status === "deferred") Alert.alert("SendGrid not configured", "Set SENDGRID_API_KEY to enable email.");
      else Alert.alert("Email skipped", s.reason || "Unknown");
    } catch (e: any) { Alert.alert("Failed", String(e?.message || e)); }
  }

  async function saveApp() {
    if (!v) return;
    try {
      const r = await careerLibraryApi.saveApp(v.version_id);
      Alert.alert("Saved", `Added to Applications as "Ready to Apply".`);
      setV({ ...v, saved_to_application: true, saved_to_application_id: r.application_id });
    } catch (e: any) { Alert.alert("Failed", String(e?.message || e)); }
  }

  async function regenerate() {
    if (!v) return;
    setRegenerating(true);
    try {
      const fresh = await careerLibraryApi.regenerate(v.version_id);
      router.replace(`/career/tailor-result-v2?version_id=${fresh.version_id}` as any);
    } catch (e: any) { Alert.alert("Regenerate failed", String(e?.message || e)); }
    finally { setRegenerating(false); }
  }

  async function copy(text: string, label: string) {
    try {
      await Clipboard.setStringAsync(text);
      Alert.alert("Copied", `${label} copied to clipboard.`);
    } catch (_e) {}
  }

  if (loading || !v) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loader}><ActivityIndicator color={colors.primaryGlow} /></View>
      </SafeAreaView>
    );
  }

  const before = v.ats_score_before || 0;
  const after = v.ats_score_after || 0;
  const delta = after - before;
  const beforeColor = before >= 70 ? colors.warning : "#EF4444";
  const afterColor = after >= 85 ? colors.success : after >= 70 ? colors.warning : "#EF4444";

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="results-back">
          <ChevronLeft size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>Results</Text>
        <TouchableOpacity onPress={regenerate} style={styles.backBtn} disabled={regenerating} testID="regenerate">
          {regenerating ? <ActivityIndicator size="small" color={colors.primaryGlow} /> : <RefreshCw size={18} color={colors.primaryGlow} />}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* --- 1. ATS Score Comparison --- */}
        <View style={styles.atsCard} testID="ats-comparison">
          <View style={styles.atsRow}>
            <View style={styles.atsCol}>
              <GaugeRing score={before} color={beforeColor} label="BEFORE" />
              <Text style={styles.atsColLabel}>Before Tailoring</Text>
            </View>
            <View style={styles.atsArrow}>
              <Text style={[styles.atsArrowText, { color: delta > 0 ? colors.success : colors.textTertiary }]}>
                {delta > 0 ? "→" : "↔"}
              </Text>
              <Text style={[styles.atsDelta, { color: delta > 0 ? colors.success : colors.textTertiary }]}>
                {delta > 0 ? "+" : ""}{delta} pts
              </Text>
            </View>
            <View style={styles.atsCol}>
              <GaugeRing score={after} color={afterColor} label="AFTER" />
              <Text style={styles.atsColLabel}>After Tailoring</Text>
            </View>
          </View>
          <Text style={styles.atsBottomLine}>
            PLOS boosted your ATS match for <Text style={{ fontWeight: "800" }}>{v.job_title}</Text> at{" "}
            <Text style={{ fontWeight: "800" }}>{v.employer}</Text> by <Text style={{ color: colors.success, fontWeight: "800" }}>{delta} points</Text>.
          </Text>
        </View>

        {/* --- 2. Keyword Analysis --- */}
        <Text style={styles.sectionTitle}>Keyword Analysis</Text>
        <View style={styles.kwGrid} testID="keyword-analysis">
          <KwColumn
            title="Already in Your Resume"
            color={colors.success}
            icon="check"
            items={v.keywords_found}
          />
          <KwColumn
            title="Added by PLOS AI"
            color="#3B82F6"
            icon="star"
            items={v.keywords_added}
          />
          <KwColumn
            title="Honest Gaps"
            color={colors.warning}
            icon="warn"
            items={v.keywords_missing}
            note="These are requirements in the JD with no direct evidence in your resume. Do not fabricate — consider addressing gaps in your cover letter or preparing to discuss them in an interview."
          />
        </View>

        {/* --- 3. Why You Fit --- */}
        {v.why_you_fit ? (
          <View style={styles.fitCard} testID="why-you-fit">
            <Text style={styles.fitLabel}>WHY YOU FIT</Text>
            <Text style={styles.fitText}>{v.why_you_fit}</Text>
          </View>
        ) : null}

        {/* --- 4. Tailored Resume --- */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Tailored Resume</Text>
          <TouchableOpacity
            onPress={() => editingResume ? saveResumeEdit() : setEditingResume(true)}
            style={styles.editBtn}
            testID="edit-resume"
          >
            <Edit3 size={12} color={colors.primaryGlow} />
            <Text style={styles.editBtnText}>{editingResume ? "Save" : "Edit"}</Text>
          </TouchableOpacity>
        </View>
        {editingResume ? (
          <TextInput
            style={[styles.textBlock, styles.textInput]}
            value={resumeDraft}
            onChangeText={setResumeDraft}
            multiline
            testID="resume-edit"
          />
        ) : (
          <ScrollView style={styles.textBlock} nestedScrollEnabled>
            <Text style={styles.textBlockText}>{v.tailored_resume_text || "—"}</Text>
          </ScrollView>
        )}

        {/* --- 5. Cover Letter --- */}
        {(v.cover_letter_text || editingCover) && (
          <>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Cover Letter</Text>
              <TouchableOpacity
                onPress={() => editingCover ? saveCoverEdit() : setEditingCover(true)}
                style={styles.editBtn}
                testID="edit-cover"
              >
                <Edit3 size={12} color={colors.primaryGlow} />
                <Text style={styles.editBtnText}>{editingCover ? "Save" : "Edit"}</Text>
              </TouchableOpacity>
            </View>
            {editingCover ? (
              <TextInput
                style={[styles.textBlock, styles.textInput]}
                value={coverDraft}
                onChangeText={setCoverDraft}
                multiline
                testID="cover-edit"
              />
            ) : (
              <ScrollView style={styles.textBlock} nestedScrollEnabled>
                <Text style={styles.textBlockText}>{v.cover_letter_text}</Text>
              </ScrollView>
            )}
          </>
        )}

        {/* --- 6. ATS Tips --- */}
        {v.ats_tips?.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>ATS Tips</Text>
            <View style={styles.tipsBox}>
              {v.ats_tips.map((t, i) => (
                <View key={i} style={styles.tipRow}>
                  <Text style={styles.tipNum}>{i + 1}.</Text>
                  <Text style={styles.tipText}>{t}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* --- 7. Interview Prep --- */}
        {v.interview_questions?.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Interview Prep ({v.interview_questions.length})</Text>
            <View style={{ gap: 6 }}>
              {v.interview_questions.map((q, i) => {
                const open = openQuestion === i;
                return (
                  <View key={i} style={styles.iqCard}>
                    <TouchableOpacity
                      style={styles.iqHead}
                      onPress={() => setOpenQuestion(open ? null : i)}
                      testID={`iq-${i}`}
                    >
                      <Text style={styles.iqNum}>Q{i + 1}</Text>
                      <Text style={styles.iqText}>{q.question}</Text>
                      {open ? <ChevronDown size={14} color={colors.textSecondary} /> : <ChevronRight size={14} color={colors.textSecondary} />}
                    </TouchableOpacity>
                    {open && q.suggested_response && (
                      <Text style={styles.iqAnswer}>{q.suggested_response}</Text>
                    )}
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* --- 8. Insider Connections --- */}
        {v.insider_connections && (
          <>
            <Text style={styles.sectionTitle}>Insider Connections</Text>
            <View style={styles.insiderCard} testID="insider-connections">
              {v.insider_connections.networks_to_leverage?.length > 0 && (
                <View>
                  <Text style={styles.insiderLabel}>NETWORKS TO LEVERAGE</Text>
                  {v.insider_connections.networks_to_leverage.map((n, i) => (
                    <Text key={i} style={styles.insiderNet}>• {n}</Text>
                  ))}
                </View>
              )}
              <TemplateCard
                title="LinkedIn Connection"
                text={v.insider_connections.linkedin_connection_template}
                onCopy={() => copy(v.insider_connections.linkedin_connection_template, "LinkedIn message")}
                testID="tpl-linkedin"
              />
              <TemplateCard
                title="Warm Introduction"
                text={v.insider_connections.warm_intro_template}
                onCopy={() => copy(v.insider_connections.warm_intro_template, "Warm intro")}
                testID="tpl-warm"
              />
              <TemplateCard
                title="Recruiter Outreach"
                text={v.insider_connections.recruiter_message_template}
                onCopy={() => copy(v.insider_connections.recruiter_message_template, "Recruiter message")}
                testID="tpl-recruiter"
              />
            </View>
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Fixed action bar */}
      <View style={styles.actionBar}>
        <TouchableOpacity style={styles.abBtn} onPress={() => download("pdf")} testID="dl-pdf">
          <Download size={12} color={colors.primaryGlow} />
          <Text style={styles.abText}>PDF</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.abBtn} onPress={() => download("docx")} testID="dl-docx">
          <Download size={12} color={colors.primaryGlow} />
          <Text style={styles.abText}>DOCX</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.abBtn} onPress={emailPackage} testID="email">
          <Mail size={12} color={colors.primaryGlow} />
          <Text style={styles.abText}>Email</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.abBtn, styles.abBtnPrimary, v.saved_to_application && { opacity: 0.5 }]}
          onPress={saveApp}
          disabled={v.saved_to_application}
          testID="save-app"
        >
          <Save size={12} color="#fff" />
          <Text style={styles.abTextPrimary}>{v.saved_to_application ? "Saved" : "Save to Apps"}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function KwColumn({ title, color, icon, items, note }: {
  title: string; color: string; icon: "check" | "star" | "warn";
  items: string[]; note?: string;
}) {
  return (
    <View style={[styles.kwCol, { borderColor: color + "40" }]}>
      <Text style={[styles.kwTitle, { color }]}>{title}</Text>
      {items.length === 0 ? (
        <Text style={styles.kwEmpty}>None</Text>
      ) : (
        items.map((it, i) => (
          <View key={i} style={styles.kwRow}>
            {icon === "check" && <CheckCircle2 size={11} color={color} />}
            {icon === "star" && <Star size={11} color={color} fill={color} />}
            {icon === "warn" && <TriangleAlert size={11} color={color} />}
            <Text style={styles.kwItem}>{it}</Text>
          </View>
        ))
      )}
      {note && <Text style={styles.kwNote}>{note}</Text>}
    </View>
  );
}

function TemplateCard({ title, text, onCopy, testID }: {
  title: string; text: string; onCopy: () => void; testID?: string;
}) {
  if (!text) return null;
  return (
    <View style={styles.tplCard} testID={testID}>
      <View style={styles.tplHead}>
        <Text style={styles.tplTitle}>{title}</Text>
        <TouchableOpacity style={styles.tplCopy} onPress={onCopy}>
          <Copy size={12} color={colors.primaryGlow} />
          <Text style={styles.tplCopyText}>Copy</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.tplText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: colors.borderSubtle,
  },
  backBtn: { padding: 4, width: 36, alignItems: "center" },
  headerTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: "700" },
  scroll: { padding: spacing.lg, gap: spacing.md },
  atsCard: {
    backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1,
    borderRadius: radius.lg, padding: spacing.lg,
  },
  atsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-around" },
  atsCol: { alignItems: "center" },
  atsColLabel: { color: colors.textSecondary, fontSize: 10, fontWeight: "700", marginTop: 8 },
  atsArrow: { alignItems: "center" },
  atsArrowText: { fontSize: 30, fontWeight: "800" },
  atsDelta: { fontSize: 16, fontWeight: "800", marginTop: 2 },
  atsBottomLine: {
    color: colors.textSecondary, fontSize: 12, textAlign: "center",
    marginTop: spacing.md, lineHeight: 18,
  },
  sectionHead: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    marginTop: spacing.md,
  },
  sectionTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: "800", marginTop: spacing.md },
  kwGrid: { gap: 8 },
  kwCol: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, padding: spacing.md, gap: 6,
  },
  kwTitle: { fontSize: 11, fontWeight: "800", letterSpacing: 0.4 },
  kwEmpty: { color: colors.textTertiary, fontSize: 11, fontStyle: "italic" },
  kwRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  kwItem: { color: colors.textPrimary, fontSize: 12, flex: 1 },
  kwNote: {
    color: colors.textTertiary, fontSize: 10, marginTop: 4,
    fontStyle: "italic", lineHeight: 14,
  },
  fitCard: {
    backgroundColor: "rgba(16,185,129,0.10)", borderColor: "rgba(16,185,129,0.35)",
    borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: 4,
  },
  fitLabel: { color: colors.success, fontSize: 10, fontWeight: "800", letterSpacing: 0.6 },
  fitText: { color: colors.textPrimary, fontSize: 14, lineHeight: 20 },
  editBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: colors.primaryMuted, paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: radius.sm,
  },
  editBtnText: { color: colors.primaryGlow, fontSize: 11, fontWeight: "700" },
  textBlock: {
    backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1,
    borderRadius: radius.md, padding: spacing.md, maxHeight: 260,
  },
  textBlockText: { color: colors.textPrimary, fontSize: 12, lineHeight: 18, fontFamily: "monospace" },
  textInput: {
    color: colors.textPrimary, fontSize: 12, lineHeight: 18,
    minHeight: 260, textAlignVertical: "top",
  },
  tipsBox: {
    backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1,
    borderRadius: radius.md, padding: spacing.md, gap: 6,
  },
  tipRow: { flexDirection: "row", gap: 6 },
  tipNum: { color: colors.primaryGlow, fontSize: 12, fontWeight: "800", minWidth: 18 },
  tipText: { color: colors.textSecondary, fontSize: 12, flex: 1, lineHeight: 17 },
  iqCard: {
    backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1,
    borderRadius: radius.md, overflow: "hidden",
  },
  iqHead: {
    flexDirection: "row", alignItems: "center", gap: 8, padding: spacing.md,
  },
  iqNum: {
    backgroundColor: colors.primaryMuted, color: colors.primaryGlow,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
    fontSize: 10, fontWeight: "800", letterSpacing: 0.3,
  },
  iqText: { color: colors.textPrimary, fontSize: 12, fontWeight: "600", flex: 1 },
  iqAnswer: {
    color: colors.textSecondary, fontSize: 12, lineHeight: 17,
    paddingHorizontal: spacing.md, paddingBottom: spacing.md,
  },
  insiderCard: {
    backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1,
    borderRadius: radius.md, padding: spacing.md, gap: spacing.md,
  },
  insiderLabel: {
    color: colors.textTertiary, fontSize: 10, fontWeight: "800", letterSpacing: 0.5,
    marginBottom: 4,
  },
  insiderNet: { color: colors.textPrimary, fontSize: 12, marginTop: 2 },
  tplCard: {
    backgroundColor: colors.surfaceElevated, borderRadius: radius.sm,
    padding: spacing.md, gap: 6,
  },
  tplHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  tplTitle: { color: colors.textPrimary, fontSize: 12, fontWeight: "800" },
  tplCopy: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: colors.primaryMuted, paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: radius.sm,
  },
  tplCopyText: { color: colors.primaryGlow, fontSize: 11, fontWeight: "700" },
  tplText: { color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  actionBar: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    flexDirection: "row", gap: 6, paddingHorizontal: spacing.md, paddingVertical: 10,
    backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.borderSubtle,
  },
  abBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 4, backgroundColor: colors.surfaceElevated, borderRadius: radius.sm,
    paddingVertical: 10,
  },
  abBtnPrimary: { backgroundColor: colors.primary, flex: 1.4 },
  abText: { color: colors.primaryGlow, fontSize: 10, fontWeight: "800" },
  abTextPrimary: { color: "#fff", fontSize: 10, fontWeight: "800" },
});
