// Career — Tailor Resume for a Job (5-section flow)
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Sparkles, CheckCircle2, Plus, FileText } from "lucide-react-native";

import { careerResumesApi, careerTailorApi, type ResumeFileType } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";
import { useAuth } from "@/src/lib/auth-context";

type Resume = {
  resume_id: string;
  name: string;
  file_type: ResumeFileType;
  is_default: boolean;
  uploaded_at: string;
};

const TYPE_BADGE_COLOR: Record<ResumeFileType, { bg: string; fg: string }> = {
  pdf: { bg: "rgba(239,68,68,0.15)", fg: "#EF4444" },
  docx: { bg: "rgba(59,130,246,0.15)", fg: "#3B82F6" },
  doc: { bg: "rgba(59,130,246,0.15)", fg: "#3B82F6" },
  txt: { bg: "rgba(148,163,184,0.15)", fg: "#94A3B8" },
  paste: { bg: "rgba(168,85,247,0.15)", fg: "#A855F7" },
};

const LOADING_STEPS = [
  "Analyzing job description…",
  "Identifying ATS keywords…",
  "Tailoring your resume…",
  "Writing cover letter…",
  "Generating interview questions…",
  "Creating PDF…",
];

export default function CareerTailor() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    job_title?: string; company?: string; job_url?: string;
  }>();
  const { user } = useAuth();

  const [resumes, setResumes] = useState<Resume[]>([]);
  const [resumesLoading, setResumesLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [jobTitle, setJobTitle] = useState(params.job_title || "");
  const [company, setCompany] = useState(params.company || "");
  const [jobUrl, setJobUrl] = useState(params.job_url || "");
  const [jobDescription, setJobDescription] = useState("");

  const [tailorResume, setTailorResume] = useState(true);
  const [genCover, setGenCover] = useState(true);
  const [genInterview, setGenInterview] = useState(true);
  const [downloadPdf, setDownloadPdf] = useState(true);
  const [emailToMe, setEmailToMe] = useState(true);
  const [sendGridReady, setSendGridReady] = useState<boolean | null>(null);

  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);

  // load resumes
  useEffect(() => {
    (async () => {
      try {
        const [r, es] = await Promise.all([
          careerResumesApi.list(),
          careerTailorApi.emailStatus(),
        ]);
        setResumes(r.resumes || []);
        const def = (r.resumes || []).find((x: any) => x.is_default) || (r.resumes || [])[0];
        if (def) setSelectedId(def.resume_id);
        setSendGridReady(!!es?.sendgrid_ready);
        if (!es?.sendgrid_ready) setEmailToMe(false);
      } catch (e: any) {
        console.warn("load resumes error:", e);
      } finally {
        setResumesLoading(false);
      }
    })();
  }, []);

  // rotate loading step message every 5s while busy
  useEffect(() => {
    if (!busy) { setStep(0); return; }
    const id = setInterval(() => setStep((s) => (s + 1) % LOADING_STEPS.length), 5000);
    return () => clearInterval(id);
  }, [busy]);

  const jdLen = jobDescription.length;
  const jdQuality = useMemo(() => {
    if (jdLen < 300) return { color: colors.danger, label: "Too short — add more detail" };
    if (jdLen < 800) return { color: colors.warning, label: "OK — more detail = better results" };
    return { color: colors.success, label: "Great — full JD provided" };
  }, [jdLen]);

  const canGenerate = !!selectedId && jobTitle.trim() && company.trim() && jdLen >= 20;

  const generate = useCallback(async () => {
    if (!canGenerate || !selectedId) {
      Alert.alert("Missing info", "Pick a resume and fill in the job title, company, and job description.");
      return;
    }
    setBusy(true);
    try {
      const res = await careerTailorApi.tailor({
        resume_id: selectedId,
        job_title: jobTitle.trim(),
        company: company.trim(),
        job_description: jobDescription.trim(),
        job_url: jobUrl.trim() || undefined,
        tailor_resume: tailorResume,
        generate_cover_letter: genCover,
        generate_interview_questions: genInterview,
        email_to_me: emailToMe,
        send_pdf: downloadPdf,
      });
      router.replace({
        pathname: "/career/tailor-result",
        params: { version_id: res.version_id },
      } as any);
    } catch (e: any) {
      Alert.alert("Tailoring failed", String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }, [
    canGenerate, selectedId, jobTitle, company, jobDescription, jobUrl,
    tailorResume, genCover, genInterview, emailToMe, downloadPdf, router,
  ]);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="tailor-back">
          <ArrowLeft size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Tailor Resume for a Job</Text>
        <View style={{ width: 22 }} />
      </View>

      {busy ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.primaryGlow} size="large" />
          <Text style={styles.loadingStep}>{LOADING_STEPS[step]}</Text>
          <Text style={styles.loadingMeta}>This usually takes 30–45 seconds. Powered by Claude Sonnet 4.5.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          {/* SECTION 1 — Select base resume */}
          <SectionHead n={1} label="Select your base resume" />
          {resumesLoading ? (
            <ActivityIndicator color={colors.primaryGlow} />
          ) : resumes.length === 0 ? (
            <TouchableOpacity
              style={styles.emptyCard}
              onPress={() => router.push("/resume-hub" as any)}
              testID="tailor-goto-vault"
            >
              <FileText size={22} color={colors.textTertiary} />
              <Text style={styles.emptyTitle}>No resumes on file</Text>
              <Text style={styles.emptyText}>Upload one first so Claude has something to tailor.</Text>
              <View style={styles.linkBtn}>
                <Plus size={13} color={colors.primaryGlow} />
                <Text style={styles.linkBtnText}>Open Resume Hub</Text>
              </View>
            </TouchableOpacity>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
              {resumes.map((r) => {
                const active = r.resume_id === selectedId;
                const c = TYPE_BADGE_COLOR[r.file_type];
                return (
                  <TouchableOpacity
                    key={r.resume_id}
                    style={[styles.resumeCard, active && styles.resumeCardActive]}
                    onPress={() => setSelectedId(r.resume_id)}
                    testID={`tailor-select-${r.resume_id}`}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <View style={[styles.typeBadge, { backgroundColor: c.bg }]}>
                        <Text style={[styles.typeBadgeText, { color: c.fg }]}>
                          {r.file_type.toUpperCase()}
                        </Text>
                      </View>
                      {active && <CheckCircle2 size={14} color={colors.primaryGlow} />}
                    </View>
                    <Text style={styles.resumeName} numberOfLines={2}>{r.name}</Text>
                    <Text style={styles.resumeMeta}>
                      {new Date(r.uploaded_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                style={styles.addCard}
                onPress={() => router.push("/resume-hub" as any)}
                testID="tailor-add-resume"
              >
                <Plus size={22} color={colors.primaryGlow} />
                <Text style={styles.addCardText}>Manage Vault</Text>
              </TouchableOpacity>
            </ScrollView>
          )}

          {/* SECTION 2 — Job details */}
          <SectionHead n={2} label="Job details" />
          <Field label="Job Title *">
            <TextInput
              value={jobTitle}
              onChangeText={setJobTitle}
              placeholder="e.g. Financial Control Specialist"
              placeholderTextColor={colors.textTertiary}
              style={styles.input}
              testID="tailor-job-title"
            />
          </Field>
          <Field label="Company or Organization *">
            <TextInput
              value={company}
              onChangeText={setCompany}
              placeholder="e.g. Asian Development Bank"
              placeholderTextColor={colors.textTertiary}
              style={styles.input}
              testID="tailor-company"
            />
          </Field>
          <Field label="Job Posting URL (optional)">
            <TextInput
              value={jobUrl}
              onChangeText={setJobUrl}
              placeholder="Paste the job posting URL"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
              keyboardType="url"
              style={styles.input}
              testID="tailor-job-url"
            />
          </Field>

          {/* SECTION 3 — Job description */}
          <SectionHead n={3} label="Job description" />
          <Field
            label="Paste the full job description here *"
            hint={`${jdLen} chars · ${jdQuality.label}`}
            hintColor={jdQuality.color}
          >
            <TextInput
              value={jobDescription}
              onChangeText={setJobDescription}
              placeholder="Paste the complete job posting text including all requirements, qualifications, and responsibilities. The more detail you provide, the better Claude can tailor your resume and identify ATS keywords."
              placeholderTextColor={colors.textTertiary}
              multiline
              style={[styles.input, { minHeight: 160, textAlignVertical: "top" }]}
              testID="tailor-jd"
            />
          </Field>

          {/* SECTION 4 — Tailoring options */}
          <SectionHead n={4} label="Tailoring options" />
          <ToggleRow label="Tailor resume" value={tailorResume} onChange={setTailorResume} />
          <ToggleRow label="Generate cover letter" value={genCover} onChange={setGenCover} />
          <ToggleRow label="Generate interview questions" value={genInterview} onChange={setGenInterview} />

          {/* SECTION 5 — Output preferences */}
          <SectionHead n={5} label="Output preferences" />
          <ToggleRow label="Download PDF" value={downloadPdf} onChange={setDownloadPdf} />
          <ToggleRow
            label={
              sendGridReady === false
                ? "Email to me · (SendGrid key pending)"
                : `Email to ${user?.email || "your inbox"}`
            }
            value={emailToMe}
            onChange={setEmailToMe}
            disabled={sendGridReady === false}
          />

          <TouchableOpacity
            style={[styles.generateBtn, !canGenerate && { opacity: 0.45 }]}
            onPress={generate}
            disabled={!canGenerate}
            testID="tailor-generate"
          >
            <Sparkles size={16} color="#fff" />
            <Text style={styles.generateBtnText}>Generate with AI</Text>
          </TouchableOpacity>
          <Text style={styles.disclaimer}>
            Uses Claude Sonnet 4.5. Claude will only reorder and rephrase content that already appears in your resume — it will not fabricate experience.
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function SectionHead({ n, label }: { n: number; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: spacing.md, marginBottom: spacing.xs }}>
      <View style={styles.sectionNum}>
        <Text style={styles.sectionNumText}>{n}</Text>
      </View>
      <Text style={styles.sectionLabel}>{label}</Text>
    </View>
  );
}

function Field({ label, children, hint, hintColor }: { label: string; children: React.ReactNode; hint?: string; hintColor?: string }) {
  return (
    <View style={{ marginBottom: spacing.sm }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
      {hint ? <Text style={[styles.fieldHint, { color: hintColor || colors.textTertiary }]}>{hint}</Text> : null}
    </View>
  );
}

function ToggleRow({ label, value, onChange, disabled }: { label: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <View style={[styles.toggleRow, disabled && { opacity: 0.5 }]}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch
        value={value && !disabled}
        onValueChange={(v) => !disabled && onChange(v)}
        trackColor={{ true: colors.primary, false: colors.borderSubtle }}
        thumbColor={Platform.OS === "android" ? (value ? colors.primaryGlow : "#f4f4f4") : undefined}
        disabled={disabled}
      />
    </View>
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
  body: { padding: spacing.md, paddingBottom: spacing.xxl },
  sectionNum: {
    width: 20, height: 20, borderRadius: 10, backgroundColor: colors.primary,
    alignItems: "center", justifyContent: "center",
  },
  sectionNumText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  sectionLabel: { color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
  fieldLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 0.4, marginBottom: 4, textTransform: "uppercase" },
  fieldHint: { fontSize: 10, marginTop: 4, textAlign: "right" },
  input: {
    backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1,
    borderRadius: radius.md, padding: spacing.sm, color: colors.textPrimary, fontSize: 13,
  },
  resumeCard: {
    width: 140, backgroundColor: colors.surface,
    borderColor: colors.borderSubtle, borderWidth: 1, borderRadius: radius.md,
    padding: spacing.sm, gap: 6,
  },
  resumeCardActive: { borderColor: colors.primaryGlow, backgroundColor: colors.primaryMuted },
  resumeName: { color: colors.textPrimary, fontSize: 12, fontWeight: "700", lineHeight: 15 },
  resumeMeta: { color: colors.textTertiary, fontSize: 10 },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm },
  typeBadgeText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.6 },
  addCard: {
    width: 100, alignItems: "center", justifyContent: "center",
    borderStyle: "dashed", borderWidth: 1.5, borderColor: colors.borderSubtle,
    borderRadius: radius.md, padding: spacing.sm, gap: 4,
  },
  addCardText: { color: colors.primaryGlow, fontSize: 11, fontWeight: "600", textAlign: "center" },
  emptyCard: {
    alignItems: "center", gap: 6, padding: spacing.lg,
    backgroundColor: colors.surface, borderColor: colors.borderSubtle,
    borderWidth: 1, borderRadius: radius.md,
  },
  emptyTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: "700" },
  emptyText: { color: colors.textTertiary, fontSize: 11, textAlign: "center" },
  linkBtn: {
    flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing.xs,
    paddingHorizontal: spacing.sm, paddingVertical: 6,
    backgroundColor: colors.primaryMuted, borderRadius: radius.sm,
  },
  linkBtnText: { color: colors.primaryGlow, fontSize: 11, fontWeight: "700" },
  toggleRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1,
    borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10,
    marginBottom: 8,
  },
  toggleLabel: { color: colors.textPrimary, fontSize: 13, flex: 1, marginRight: spacing.sm },
  generateBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: colors.primary, paddingVertical: 14, borderRadius: radius.md,
    marginTop: spacing.md,
  },
  generateBtnText: { color: "#fff", fontSize: 14, fontWeight: "800", letterSpacing: 0.3 },
  disclaimer: { color: colors.textTertiary, fontSize: 10, textAlign: "center", marginTop: spacing.sm, lineHeight: 15 },
  loadingBox: {
    flex: 1, alignItems: "center", justifyContent: "center",
    padding: spacing.xl, gap: spacing.md,
  },
  loadingStep: { color: colors.textPrimary, fontSize: 14, fontWeight: "700", textAlign: "center" },
  loadingMeta: { color: colors.textTertiary, fontSize: 12, textAlign: "center" },
});
