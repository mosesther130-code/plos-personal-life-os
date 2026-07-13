// PLOS Career — Tailoring Modal (v2). Select Resume + JD, configure options,
// then generate the full ATS-first tailored package.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  ChevronLeft, Sparkles, FileText, Briefcase, Circle, CheckCircle2, Star,
  Wand2, Loader,
} from "lucide-react-native";
import { careerLibraryApi, jobIntelApi, LibResume, LibJd } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";

const LOADING_MESSAGES = [
  "Reading your resume…",
  "Analyzing job requirements…",
  "Identifying ATS keywords…",
  "Tailoring your experience…",
  "Writing cover letter…",
  "Generating interview questions…",
  "Building your insider connection templates…",
  "Calculating ATS score improvement…",
  "Finalizing your package…",
];

export default function TailorModal() {
  const router = useRouter();
  const params = useLocalSearchParams<{ resume_id?: string; jd_id?: string; job_id?: string }>();
  const [loading, setLoading] = useState(true);
  const [resumes, setResumes] = useState<LibResume[]>([]);
  const [jds, setJds] = useState<LibJd[]>([]);
  const [selectedResumeId, setSelectedResumeId] = useState<string | null>(null);
  const [selectedJdId, setSelectedJdId] = useState<string | null>(null);
  // Verified job direct from the feed (skips JD library requirement)
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [verifiedJob, setVerifiedJob] = useState<any | null>(null);

  // Toggles
  const [genCover, setGenCover] = useState(true);
  const [genInterview, setGenInterview] = useState(true);
  const [genThankYou, setGenThankYou] = useState(false);
  const [emailMe, setEmailMe] = useState(true);
  const [downloadPdf, setDownloadPdf] = useState(true);

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [step, setStep] = useState(0);
  const [sendGridReady, setSendGridReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const preJobId = (params.job_id as string) || null;
        const [r, j, s, jobDetail] = await Promise.all([
          careerLibraryApi.listResumes(),
          careerLibraryApi.listJds(),
          careerLibraryApi.emailStatus(),
          preJobId ? jobIntelApi.detail(preJobId).catch(() => null) : Promise.resolve(null),
        ]);
        setResumes(r.resumes || []);
        setJds(j.jds || []);
        setSendGridReady(!!s.sendgrid_ready);
        // Pre-selects
        const preRes = (params.resume_id as string) ||
          r.resumes.find((x) => x.is_default)?.resume_id ||
          r.resumes[0]?.resume_id;
        setSelectedResumeId(preRes || null);
        if (jobDetail) {
          setSelectedJobId(preJobId);
          setVerifiedJob(jobDetail);
          setSelectedJdId(null);
        } else {
          const preJd = (params.jd_id as string) || j.jds[0]?.jd_id;
          setSelectedJdId(preJd || null);
        }
        if (!s.sendgrid_ready) setEmailMe(false);
      } catch (e: any) {
        console.warn("Load tailor prerequisites failed", e);
      } finally { setLoading(false); }
    })();
  }, [params.resume_id, params.jd_id, params.job_id]);

  // Rotating status messages during generation
  useEffect(() => {
    if (!generating) return;
    const id = setInterval(() => setStep((s) => (s + 1) % LOADING_MESSAGES.length), 4500);
    return () => clearInterval(id);
  }, [generating]);

  const hasJobSource = !!(selectedJobId || selectedJdId);
  const canGenerate = !!selectedResumeId && hasJobSource && !generating;

  const generate = useCallback(async () => {
    if (!canGenerate) return;
    setGenerating(true); setStep(0);
    try {
      const result = await careerLibraryApi.generate({
        resume_id: selectedResumeId!,
        ...(selectedJobId ? { job_id: selectedJobId } : { jd_id: selectedJdId! }),
        ats_optimize: true,
        generate_cover_letter: genCover,
        generate_interview_questions: genInterview,
        generate_thankyou: genThankYou,
        email_to_me: emailMe,
        send_pdf: downloadPdf,
      });
      // Navigate to results
      router.replace(`/career/tailor-result-v2?version_id=${result.version_id}` as any);
    } catch (e: any) {
      Alert.alert(
        "Tailoring failed",
        String(e?.message || e) +
          "\n\nThis sometimes happens with very long job descriptions. Try again or shorten the JD.",
        [{ text: "OK" }, { text: "Retry", onPress: () => generate() }]
      );
    } finally { setGenerating(false); }
  }, [selectedResumeId, selectedJdId, selectedJobId, genCover, genInterview, genThankYou, emailMe, downloadPdf, canGenerate, router]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loader}><ActivityIndicator color={colors.primaryGlow} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="tailor-back">
          <ChevronLeft size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Tailor Resume</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* ==== 1. RESUME PICKER ==== */}
        <Text style={styles.sectionLabel}>Select base resume</Text>
        {resumes.length === 0 ? (
          <View style={styles.emptyPrompt}>
            <FileText size={22} color={colors.textTertiary} />
            <Text style={styles.emptyPromptText}>Upload a resume first to enable tailoring</Text>
            <TouchableOpacity style={styles.emptyPromptBtn} onPress={() => router.replace("/(tabs)/career" as any)}>
              <Text style={styles.emptyPromptBtnText}>Go to Resume Library</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizRow}>
            {resumes.map((r) => {
              const selected = selectedResumeId === r.resume_id;
              return (
                <TouchableOpacity
                  key={r.resume_id}
                  style={[styles.picker, selected && styles.pickerSelected]}
                  onPress={() => setSelectedResumeId(r.resume_id)}
                  activeOpacity={0.8}
                  testID={`pick-resume-${r.resume_id}`}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    {selected ? <CheckCircle2 size={14} color={colors.primaryGlow} /> : <Circle size={14} color={colors.textTertiary} />}
                    {r.is_default && <Star size={11} color="#3B82F6" fill="#3B82F6" />}
                    <Text style={styles.pickerFileType}>{(r.file_type || "?").toUpperCase()}</Text>
                  </View>
                  <Text style={styles.pickerTitle} numberOfLines={2}>{r.label || r.file_name}</Text>
                  <Text style={styles.pickerMeta}>{r.word_count} words</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* ==== 2. JOB SOURCE — Verified job OR JD library ==== */}
        {verifiedJob ? (
          <>
            <Text style={[styles.sectionLabel, { marginTop: spacing.lg }]}>
              Verified job from feed
            </Text>
            <Text style={styles.subhint}>
              Tailoring uses the requirements from this job announcement directly — no separate JD needed.
            </Text>
            <View style={styles.verifiedJobCard} testID="verified-job-card">
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <CheckCircle2 size={14} color={colors.success} />
                <Text style={styles.verifiedBadge}>VERIFIED · {verifiedJob.source || verifiedJob.source_platform || "Feed"}</Text>
              </View>
              <Text style={styles.verifiedTitle} numberOfLines={2}>{verifiedJob.job_title || verifiedJob.title}</Text>
              <Text style={styles.verifiedSub} numberOfLines={1}>{verifiedJob.employer}</Text>
              {!!verifiedJob.location && (
                <Text style={styles.verifiedMeta} numberOfLines={1}>📍 {verifiedJob.location}</Text>
              )}
              <TouchableOpacity
                onPress={() => {
                  setSelectedJobId(null);
                  setVerifiedJob(null);
                }}
                style={styles.swapBtn}
                testID="use-jd-library-instead"
              >
                <Text style={styles.swapBtnText}>Use a Job Description from library instead →</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <Text style={[styles.sectionLabel, { marginTop: spacing.lg }]}>
              Select job description
            </Text>
            <Text style={styles.subhint}>
              {`For verified jobs from the feed, tap "Tailor" from the job detail — you won't need a JD from the library.`}
            </Text>
            {jds.length === 0 ? (
          <View style={styles.emptyPrompt}>
            <Briefcase size={22} color={colors.textTertiary} />
            <Text style={styles.emptyPromptText}>Upload or add a job description first</Text>
            <TouchableOpacity style={styles.emptyPromptBtn} onPress={() => router.replace("/(tabs)/career" as any)}>
              <Text style={styles.emptyPromptBtnText}>Go to Job Description Library</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizRow}>
            {jds.map((j) => {
              const selected = selectedJdId === j.jd_id;
              const ms = selectedResumeId ? (j.match_scores || {})[selectedResumeId] : undefined;
              return (
                <TouchableOpacity
                  key={j.jd_id}
                  style={[styles.picker, selected && styles.pickerSelected]}
                  onPress={() => setSelectedJdId(j.jd_id)}
                  activeOpacity={0.8}
                  testID={`pick-jd-${j.jd_id}`}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4, justifyContent: "space-between" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      {selected ? <CheckCircle2 size={14} color={colors.primaryGlow} /> : <Circle size={14} color={colors.textTertiary} />}
                      <Text style={styles.pickerFileType}>{(j.file_type || "?").toUpperCase()}</Text>
                    </View>
                    {ms !== undefined && (
                      <View style={styles.pickerScore}>
                        <Text style={styles.pickerScoreText}>{ms}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.pickerTitle} numberOfLines={2}>{j.job_title}</Text>
                  <Text style={styles.pickerMeta} numberOfLines={1}>{j.employer || "—"}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
          </>
        )}

        {/* ==== 3. TAILORING OPTIONS ==== */}
        <Text style={[styles.sectionLabel, { marginTop: spacing.lg }]}>Tailoring options</Text>
        <View style={styles.toggleGrid}>
          <Toggle label="ATS Optimization" value={true} disabled onChange={() => {}} sub="Always on" testID="toggle-ats" />
          <Toggle label="Generate Cover Letter" value={genCover} onChange={setGenCover} testID="toggle-cover" />
          <Toggle label="Interview Questions" value={genInterview} onChange={setGenInterview} testID="toggle-iq" />
          <Toggle label="Thank You Letter" value={genThankYou} onChange={setGenThankYou} testID="toggle-thanks" sub="Post-interview draft" />
        </View>

        {/* ==== 4. OUTPUT & DELIVERY ==== */}
        <Text style={[styles.sectionLabel, { marginTop: spacing.lg }]}>Output & delivery</Text>
        <View style={styles.toggleGrid}>
          <Toggle label="Download PDF" value={downloadPdf} onChange={setDownloadPdf} testID="toggle-pdf" />
          <Toggle
            label="Email to me"
            value={emailMe}
            onChange={setEmailMe}
            disabled={!sendGridReady}
            sub={sendGridReady ? "via SendGrid" : "Connect SendGrid in Settings"}
            testID="toggle-email"
          />
        </View>

        {/* Generate */}
        <TouchableOpacity
          style={[styles.generateBtn, !canGenerate && { opacity: 0.4 }]}
          onPress={generate}
          disabled={!canGenerate}
          activeOpacity={0.85}
          testID="generate-btn"
        >
          <Wand2 size={16} color="#fff" />
          <Text style={styles.generateBtnText}>Generate Tailored Package</Text>
          <Sparkles size={14} color="rgba(255,255,255,0.85)" />
        </TouchableOpacity>
      </ScrollView>

      {/* Loading overlay */}
      {generating && (
        <Modal visible transparent animationType="fade">
          <View style={styles.overlay}>
            <View style={styles.overlayCard} testID="tailor-loading">
              <ActivityIndicator size="large" color={colors.primaryGlow} />
              <Text style={styles.overlayTitle}>{LOADING_MESSAGES[step]}</Text>
              <Text style={styles.overlayMeta}>PLOS AI · 20–45s typical</Text>
              <View style={styles.overlayDots}>
                {LOADING_MESSAGES.map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.overlayDot,
                      i <= step && { backgroundColor: colors.primaryGlow, opacity: 1 },
                    ]}
                  />
                ))}
              </View>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

function Toggle({ label, value, onChange, disabled, sub, testID }: {
  label: string; value: boolean; onChange: (v: boolean) => void;
  disabled?: boolean; sub?: string; testID?: string;
}) {
  return (
    <TouchableOpacity
      style={[styles.toggle, value && styles.toggleOn, disabled && styles.toggleDisabled]}
      onPress={() => !disabled && onChange(!value)}
      disabled={disabled}
      activeOpacity={0.8}
      testID={testID}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.toggleLabel, value && { color: "#fff" }]}>{label}</Text>
        {sub && <Text style={[styles.toggleSub, value && { color: "rgba(255,255,255,0.75)" }]}>{sub}</Text>}
      </View>
      <View style={[styles.toggleSwitch, value && styles.toggleSwitchOn]}>
        <View style={[styles.toggleThumb, value && { marginLeft: 16 }]} />
      </View>
    </TouchableOpacity>
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
  backBtn: { padding: 4 },
  headerTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: "700" },
  scroll: { padding: spacing.lg, gap: 6, paddingBottom: 60 },
  sectionLabel: {
    color: colors.textPrimary, fontSize: 14, fontWeight: "700", marginBottom: 8,
  },
  emptyPrompt: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderSubtle,
    borderRadius: radius.md, padding: spacing.lg, alignItems: "center", gap: 8,
  },
  emptyPromptText: { color: colors.textSecondary, fontSize: 12, textAlign: "center" },
  emptyPromptBtn: {
    backgroundColor: colors.primary, paddingHorizontal: spacing.md,
    paddingVertical: 8, borderRadius: radius.sm, marginTop: 4,
  },
  emptyPromptBtnText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  horizRow: { gap: 10, paddingRight: 20 },
  picker: {
    width: 180, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: radius.md,
    padding: spacing.md, gap: 4,
  },
  pickerSelected: { borderColor: colors.primaryGlow, backgroundColor: "rgba(59,130,246,0.06)" },
  pickerFileType: { color: colors.textTertiary, fontSize: 9, fontWeight: "800", letterSpacing: 0.4 },
  pickerTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: "700", marginTop: 4 },
  pickerMeta: { color: colors.textTertiary, fontSize: 10, marginTop: 2 },
  pickerScore: {
    backgroundColor: colors.primaryMuted, borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  pickerScoreText: { color: colors.primaryGlow, fontSize: 10, fontWeight: "800" },
  toggleGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  toggle: {
    flexBasis: "48%", flexGrow: 1, flexDirection: "row", alignItems: "center",
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.borderSubtle,
    paddingVertical: 12, paddingHorizontal: 12, gap: 8, minHeight: 52,
  },
  toggleOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  toggleDisabled: { opacity: 0.5 },
  toggleLabel: { color: colors.textPrimary, fontSize: 12, fontWeight: "700" },
  toggleSub: { color: colors.textTertiary, fontSize: 9, marginTop: 2 },
  toggleSwitch: {
    width: 34, height: 20, borderRadius: 10, backgroundColor: colors.surfaceElevated,
    justifyContent: "center", paddingHorizontal: 2,
  },
  toggleSwitchOn: { backgroundColor: "rgba(255,255,255,0.35)" },
  toggleThumb: { width: 16, height: 16, borderRadius: 8, backgroundColor: "#fff" },
  generateBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: colors.primary, borderRadius: radius.md,
    paddingVertical: 16, marginTop: spacing.xl,
  },
  generateBtnText: { color: "#fff", fontWeight: "800", fontSize: 14, letterSpacing: 0.3 },
  overlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.85)", alignItems: "center", justifyContent: "center",
    padding: spacing.xl,
  },
  overlayCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.xl, gap: 12, alignItems: "center", width: "100%", maxWidth: 320,
  },
  overlayTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: "700", textAlign: "center" },
  overlayMeta: { color: colors.textTertiary, fontSize: 11 },
  overlayDots: { flexDirection: "row", gap: 4, marginTop: 4 },
  overlayDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: colors.borderStrong, opacity: 0.4,
  },
  subhint: { color: colors.textTertiary, fontSize: 11, marginTop: 2, marginBottom: 4 },
  verifiedJobCard: {
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primaryGlow, borderWidth: 1,
    borderRadius: radius.md, padding: spacing.md, gap: 3, marginTop: 4,
  },
  verifiedBadge: {
    color: colors.success, fontSize: 10, fontWeight: "800", letterSpacing: 0.5,
  },
  verifiedTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: "800" },
  verifiedSub: { color: colors.textSecondary, fontSize: 12, fontWeight: "600" },
  verifiedMeta: { color: colors.textTertiary, fontSize: 11 },
  swapBtn: {
    marginTop: 6, alignSelf: "flex-start",
    paddingVertical: 4, paddingHorizontal: 6,
  },
  swapBtnText: {
    color: colors.primaryGlow, fontSize: 10, fontWeight: "700",
    textDecorationLine: "underline",
  },
});
