// Career Home — stats, pipeline, resume health, top matches, criteria.
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  Briefcase,
  Sparkles,
  ChevronRight,
  Settings as SettingsIcon,
  TrendingUp,
  ListChecks,
  Compass,
  FileText,
} from "lucide-react-native";

import { careerApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";
import { ScoreRing } from "@/src/components/ScoreRing";
import { EditModal, Field } from "@/src/components/EditModal";

const STAGES = [
  { key: "matched", label: "Matches", color: colors.primaryGlow },
  { key: "applied", label: "Applied", color: "#A855F7" },
  { key: "screening", label: "Screening", color: colors.warning },
  { key: "interview", label: "Interview", color: "#EC4899" },
  { key: "offer", label: "Offer", color: colors.success },
];

function matchScoreColor(score: number) {
  if (score >= 85) return colors.success;
  if (score >= 70) return colors.warning;
  return colors.textTertiary;
}

const criteriaFields: Field[] = [
  { key: "current_title", label: "Current Title", kind: "text", placeholder: "e.g. Senior Software Engineer" },
  { key: "current_employer", label: "Current Employer", kind: "text" },
  { key: "min_salary", label: "Minimum Salary ($)", kind: "number" },
  {
    key: "work_type_pref",
    label: "Work Type",
    kind: "select",
    options: [
      { value: "remote", label: "Remote" },
      { value: "hybrid", label: "Hybrid" },
      { value: "onsite", label: "On-site" },
      { value: "any", label: "Any" },
    ],
  },
  { key: "auto_apply_review_first", label: "Review Before Auto-apply", kind: "boolean" },
  { key: "auto_cover_letter", label: "Auto-generate Cover Letter", kind: "boolean" },
];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";

export default function CareerHome() {
  const router = useRouter();
  const [career, setCareer] = useState<any>(null);
  const [pipeline, setPipeline] = useState<any>(null);
  const [apps, setApps] = useState<any[]>([]);
  const [analysis, setAnalysis] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [criteriaOpen, setCriteriaOpen] = useState(false);

  const load = useCallback(async () => {
    const [c, p, a] = await Promise.all([
      careerApi.get(),
      careerApi.pipeline(),
      careerApi.listApplications(),
    ]);
    setCareer(c);
    setPipeline(p);
    setApps(a);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await load();
      } catch (_e) {}
      setLoading(false);
    })();
  }, [load]);

  const onAnalyze = async () => {
    setAnalysisLoading(true);
    try {
      const r = await careerApi.resumeAnalyze();
      setAnalysis(r);
      await load();
    } catch (_e) {
      setAnalysis({ strengths: [], gaps: ["AI failed. Try again."], improvements: [] });
    }
    setAnalysisLoading(false);
  };

  const onSaveCriteria = async (vals: any) => {
    await careerApi.update(vals);
    await load();
  };

  const topMatches = [...apps]
    .filter((a) => a.match_score)
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, 4);

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.loader}>
          <ActivityIndicator color={colors.primaryGlow} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
            tintColor={colors.primaryGlow}
          />
        }
      >
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.h1}>Career</Text>
            <Text style={styles.subtitle}>
              {career?.current_title || "Set your title"} ·{" "}
              {career?.current_employer || "—"}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.gearBtn}
            onPress={() => setCriteriaOpen(true)}
            testID="open-criteria"
          >
            <SettingsIcon color={colors.primaryGlow} size={18} />
          </TouchableOpacity>
        </View>

        {/* 1. Stats row */}
        <View style={styles.statsRow} testID="career-stats-row">
          <StatBox
            label="New Matches"
            value={pipeline?.new_matches ?? 0}
            color={colors.primaryGlow}
            testID="stat-new-matches"
          />
          <StatBox
            label="Sent"
            value={pipeline?.applications_sent ?? 0}
            color="#A855F7"
            testID="stat-applications-sent"
          />
          <StatBox
            label="Interviews"
            value={pipeline?.interviews_pending ?? 0}
            color="#EC4899"
            testID="stat-interviews-pending"
          />
        </View>

        {/* 2. Pipeline Funnel */}
        <Text style={styles.sectionLabel}>Application Pipeline</Text>
        <View style={styles.funnel} testID="application-funnel">
          {STAGES.map((s, i) => {
            const count = pipeline?.counts?.[s.key] ?? 0;
            const isLast = i === STAGES.length - 1;
            return (
              <React.Fragment key={s.key}>
                <TouchableOpacity
                  style={[styles.stage, { borderColor: `${s.color}55` }]}
                  onPress={() => router.push(`/career/applications?stage=${s.key}`)}
                  testID={`stage-${s.key}`}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.stageCount, { color: s.color }]}>{count}</Text>
                  <Text style={styles.stageLabel}>{s.label}</Text>
                </TouchableOpacity>
                {!isLast && <View style={styles.stageArrow} />}
              </React.Fragment>
            );
          })}
        </View>
        <TouchableOpacity
          style={styles.allAppsBtn}
          onPress={() => router.push("/career/applications")}
          testID="view-all-applications"
        >
          <ListChecks size={14} color={colors.primaryGlow} />
          <Text style={styles.allAppsText}>View all applications</Text>
          <ChevronRight size={14} color={colors.primaryGlow} />
        </TouchableOpacity>

        {/* 3. Resume Health */}
        <View style={styles.resumeCard} testID="resume-health-card">
          <View style={styles.resumeTop}>
            <ScoreRing
              score={career?.ats_score ?? 0}
              size={84}
              strokeWidth={7}
              label="ATS"
              testID="ats-score-ring"
            />
            <View style={{ flex: 1, paddingLeft: spacing.lg }}>
              <Text style={styles.resumeTitle}>Resume Health</Text>
              <Text style={styles.resumeSub}>
                {career?.ats_score >= 80
                  ? "Strong — minor tweaks recommended"
                  : career?.ats_score >= 60
                  ? "Solid base — needs ATS optimization"
                  : "Needs work — let PLOS help"}
              </Text>
              <TouchableOpacity
                style={styles.improveBtn}
                onPress={onAnalyze}
                disabled={analysisLoading}
                testID="improve-resume-button"
              >
                {analysisLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Sparkles size={14} color="#fff" />
                    <Text style={styles.improveBtnText}>
                      {analysis ? "Re-analyze" : "Improve Resume"}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {analysis && (
            <View style={styles.analysisWrap}>
              {analysis.strengths?.length > 0 && (
                <View style={{ marginBottom: spacing.md }}>
                  <Text style={[styles.analysisHeader, { color: colors.success }]}>
                    STRENGTHS
                  </Text>
                  {analysis.strengths.slice(0, 3).map((s: string, i: number) => (
                    <Text
                      key={i}
                      style={styles.analysisItem}
                      testID={`strength-${i}`}
                    >
                      • {s}
                    </Text>
                  ))}
                </View>
              )}
              {analysis.gaps?.length > 0 && (
                <View style={{ marginBottom: spacing.md }}>
                  <Text style={[styles.analysisHeader, { color: colors.warning }]}>
                    GAPS
                  </Text>
                  {analysis.gaps.slice(0, 3).map((s: string, i: number) => (
                    <Text key={i} style={styles.analysisItem} testID={`gap-${i}`}>
                      • {s}
                    </Text>
                  ))}
                </View>
              )}
              {analysis.improvements?.length > 0 && (
                <View>
                  <Text
                    style={[styles.analysisHeader, { color: colors.primaryGlow }]}
                  >
                    IMPROVEMENTS
                  </Text>
                  {analysis.improvements.slice(0, 4).map((s: string, i: number) => (
                    <Text
                      key={i}
                      style={styles.analysisItem}
                      testID={`improvement-${i}`}
                    >
                      • {s}
                    </Text>
                  ))}
                </View>
              )}
            </View>
          )}
        </View>

        {/* Path advisor + Resume Generator quick links */}
        <View style={styles.quickRow}>
          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => router.push("/career/path-advisor")}
            testID="open-path-advisor"
            activeOpacity={0.85}
          >
            <Compass color="#A855F7" size={20} />
            <Text style={styles.quickTitle}>Career Path</Text>
            <Text style={styles.quickSub}>3 AI-mapped paths</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => router.push("/career/resume-generator")}
            testID="open-resume-generator"
            activeOpacity={0.85}
          >
            <FileText color={colors.primaryGlow} size={20} />
            <Text style={styles.quickTitle}>Resume Gen</Text>
            <Text style={styles.quickSub}>Tailored ATS</Text>
          </TouchableOpacity>
        </View>

        {/* 4. Top Job Matches */}
        <Text style={styles.sectionLabel}>Top Job Matches</Text>
        <View style={{ gap: spacing.md }}>
          {topMatches.length === 0 && (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No matches yet.</Text>
            </View>
          )}
          {topMatches.map((j) => (
            <TouchableOpacity
              key={j.application_id}
              style={styles.matchCard}
              onPress={() =>
                router.push(`/career/resume-generator?application_id=${j.application_id}`)
              }
              activeOpacity={0.85}
              testID={`match-card-${j.application_id}`}
            >
              <View style={styles.matchHead}>
                <View style={styles.logoBox}>
                  <Text style={styles.logoText}>{initials(j.employer)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.matchTitle} numberOfLines={1}>
                    {j.role_title}
                  </Text>
                  <Text style={styles.matchSub} numberOfLines={1}>
                    {j.employer} · {j.location || "—"} ·{" "}
                    {(j.work_type || "remote").toUpperCase()}
                  </Text>
                </View>
                <View style={styles.matchScore}>
                  <Text
                    style={[
                      styles.matchScoreText,
                      { color: matchScoreColor(j.match_score) },
                    ]}
                  >
                    {j.match_score}%
                  </Text>
                </View>
              </View>
              <View style={styles.badgeRow}>
                {j.salary_range && (
                  <View style={[styles.badge, { backgroundColor: "rgba(16,185,129,0.15)" }]}>
                    <Text style={[styles.badgeText, { color: colors.success }]}>
                      {j.salary_range}
                    </Text>
                  </View>
                )}
                {(j.badges || []).map((b: string) => (
                  <View
                    key={b}
                    style={[
                      styles.badge,
                      { backgroundColor: colors.primaryMuted },
                    ]}
                  >
                    <Text style={[styles.badgeText, { color: colors.primaryGlow }]}>
                      {b}
                    </Text>
                  </View>
                ))}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* 5. Criteria summary card */}
        <View style={styles.criteriaCard} testID="auto-criteria-card">
          <View style={styles.criteriaHead}>
            <Text style={styles.criteriaTitle}>Auto Job Search Criteria</Text>
            <TouchableOpacity
              onPress={() => setCriteriaOpen(true)}
              testID="edit-criteria-button"
              style={styles.editChip}
            >
              <Text style={styles.editChipText}>Edit</Text>
            </TouchableOpacity>
          </View>
          <CriteriaRow label="Min salary" value={`$${(career?.min_salary ?? 0).toLocaleString()}`} />
          <CriteriaRow
            label="Work type"
            value={(career?.work_type_pref || "remote").toUpperCase()}
          />
          <CriteriaRow
            label="Target roles"
            value={(career?.target_roles || []).join(", ") || "—"}
          />
          <CriteriaRow
            label="Locations"
            value={(career?.target_locations || []).join(", ") || "—"}
          />
          <CriteriaRow
            label="Auto cover letter"
            value={career?.auto_cover_letter ? "On" : "Off"}
          />
          <CriteriaRow
            label="Review before send"
            value={career?.auto_apply_review_first ? "On" : "Off"}
          />
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      <EditModal
        visible={criteriaOpen}
        title="Job Search Criteria"
        fields={criteriaFields}
        initial={career || {}}
        onClose={() => setCriteriaOpen(false)}
        onSubmit={onSaveCriteria}
        testID="criteria-modal"
      />
    </SafeAreaView>
  );
}

function StatBox({
  label,
  value,
  color,
  testID,
}: {
  label: string;
  value: number;
  color: string;
  testID: string;
}) {
  return (
    <View style={styles.statBox} testID={testID}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </View>
  );
}

function CriteriaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.crRow}>
      <Text style={styles.crLabel}>{label}</Text>
      <Text style={styles.crValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, gap: spacing.lg },

  headerRow: { flexDirection: "row", alignItems: "center" },
  h1: {
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: "300",
    letterSpacing: -0.5,
  },
  subtitle: { color: colors.textSecondary, fontSize: 13, marginTop: 4 },
  gearBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primaryMuted,
    alignItems: "center",
    justifyContent: "center",
  },

  // Stats
  statsRow: { flexDirection: "row", gap: spacing.sm },
  statBox: {
    flex: 1,
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  statLabel: {
    color: colors.textTertiary,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  statValue: { fontSize: 26, fontWeight: "700", marginTop: 4 },

  sectionLabel: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },

  // Funnel
  funnel: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.sm,
  },
  stage: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: 4,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  stageCount: { fontSize: 18, fontWeight: "700" },
  stageLabel: {
    color: colors.textTertiary,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginTop: 2,
  },
  stageArrow: {
    width: 4,
    height: 1,
    backgroundColor: colors.borderStrong,
    marginHorizontal: 2,
  },
  allAppsBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
  },
  allAppsText: { color: colors.primaryGlow, fontSize: 13, fontWeight: "600" },

  // Resume health
  resumeCard: {
    backgroundColor: colors.surface,
    borderColor: colors.primaryMuted,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  resumeTop: { flexDirection: "row", alignItems: "center" },
  resumeTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  resumeSub: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 4,
    marginBottom: spacing.md,
  },
  improveBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  improveBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  analysisWrap: {
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  analysisHeader: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  analysisItem: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 4,
  },

  // Quick row
  quickRow: { flexDirection: "row", gap: spacing.md },
  quickCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: 6,
  },
  quickTitle: { color: colors.textPrimary, fontWeight: "700", marginTop: 4 },
  quickSub: { color: colors.textSecondary, fontSize: 12 },

  // Match cards
  emptyCard: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: "center",
  },
  emptyText: { color: colors.textTertiary },
  matchCard: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  matchHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  logoBox: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primaryMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: { color: colors.primaryGlow, fontWeight: "700" },
  matchTitle: { color: colors.textPrimary, fontWeight: "700", fontSize: 14 },
  matchSub: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  matchScore: {},
  matchScoreText: { fontSize: 22, fontWeight: "700", letterSpacing: -0.5 },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: spacing.md,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  badgeText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },

  // Criteria
  criteriaCard: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  criteriaHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  criteriaTitle: { color: colors.textPrimary, fontWeight: "700" },
  editChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryMuted,
  },
  editChipText: { color: colors.primaryGlow, fontWeight: "700", fontSize: 11 },
  crRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    gap: spacing.md,
  },
  crLabel: { color: colors.textTertiary, fontSize: 12, fontWeight: "600" },
  crValue: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
    textAlign: "right",
  },
});
