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
  Linking,
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
  RefreshCw,
  ExternalLink,
  Copy,
  Wand2,
} from "lucide-react-native";
import * as Clipboard from "expo-clipboard";

import { careerApi, careerIntelApi } from "@/src/lib/api";
import { resolveJobApplyUrl } from "@/src/lib/job-urls";
import { colors, spacing, radius } from "@/src/lib/theme";
import { ScoreRing } from "@/src/components/ScoreRing";
import { EditModal, Field } from "@/src/components/EditModal";

const STAGES = [
  { key: "matched", label: "Matches", color: colors.primaryGlow },
  { key: "applied", label: "Applied", color: "#A855F7" },
  { key: "screening", label: "Screen", color: colors.warning },
  { key: "interview", label: "Intrvw", color: "#EC4899" },
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
  {
    key: "target_roles",
    label: "Target Roles (comma-separated)",
    kind: "text",
    placeholder: "Senior Engineer, Tech Lead, Staff Engineer",
  },
  {
    key: "target_locations",
    label: "Target Locations (comma-separated)",
    kind: "text",
    placeholder: "Atlanta, Remote, NYC",
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
  const [liveJobs, setLiveJobs] = useState<any[]>([]);
  const [liveJobsLoading, setLiveJobsLoading] = useState(false);

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

  const loadLiveJobs = useCallback(async (refresh = false) => {
    setLiveJobsLoading(true);
    try {
      const r = await careerIntelApi.jobSearch({ refresh });
      setLiveJobs(r?.results || []);
    } catch (_e) {
      setLiveJobs([]);
    } finally {
      setLiveJobsLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await load();
      } catch (_e) {}
      setLoading(false);
    })();
    // Fetch live jobs in parallel (does its own loading state)
    loadLiveJobs(false);
  }, [load, loadLiveJobs]);

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
    const csvToArray = (v: any): string[] => {
      if (Array.isArray(v)) return v;
      if (typeof v === "string") {
        return v
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      }
      return [];
    };
    const payload: any = { ...vals };
    payload.target_roles = csvToArray(vals.target_roles);
    payload.target_locations = csvToArray(vals.target_locations);
    if (vals.min_salary !== undefined && vals.min_salary !== "") {
      payload.min_salary = Number(vals.min_salary) || 0;
    }
    await careerApi.update(payload);
    await load();
    // Re-run live job search with the updated criteria
    loadLiveJobs(true);
  };

  const criteriaInitial = career
    ? {
        ...career,
        target_roles: Array.isArray(career.target_roles)
          ? career.target_roles.join(", ")
          : career.target_roles || "",
        target_locations: Array.isArray(career.target_locations)
          ? career.target_locations.join(", ")
          : career.target_locations || "",
      }
    : {};

  // "Top Job Matches" reflects the LIVE Career Intelligence job search
  // (driven by the user's Auto Job Search Criteria). Falls back to
  // application-pipeline matches if no live results yet.
  const topMatches =
    liveJobs.length > 0
      ? [...liveJobs]
          .sort((a: any, b: any) => (b.match_score || 0) - (a.match_score || 0))
          .slice(0, 4)
          .map((j: any) => ({
            id: j.job_id || `${j.company}-${j.title}`,
            role_title: j.title,
            employer: j.company,
            location: j.location,
            work_type: j.work_type,
            match_score: j.match_score,
            salary_range: j.salary_range,
            badges: [j.source].filter(Boolean),
            url: j.url,
            reasoning: j.match_reasoning,
            isLive: true,
          }))
      : [...apps]
          .filter((a) => a.match_score)
          .sort((a, b) => b.match_score - a.match_score)
          .slice(0, 4)
          .map((j: any) => ({
            id: j.application_id,
            role_title: j.role_title,
            employer: j.employer,
            location: j.location,
            work_type: j.work_type,
            match_score: j.match_score,
            salary_range: j.salary_range,
            badges: j.badges,
            url: undefined,
            reasoning: undefined,
            isLive: false,
          }));

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

        {/* Prominent AI Tailor CTA */}
        <TouchableOpacity
          style={styles.tailorCta}
          onPress={() => router.push("/career/tailor" as any)}
          testID="open-tailor"
          activeOpacity={0.85}
        >
          <Wand2 size={16} color="#fff" />
          <Text style={styles.tailorCtaText}>Tailor Resume for a Job</Text>
          <Sparkles size={12} color="rgba(255,255,255,0.85)" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.vaultLink}
          onPress={() => router.push("/career/resume-vault" as any)}
          testID="open-vault"
          activeOpacity={0.7}
        >
          <FileText size={12} color={colors.primaryGlow} />
          <Text style={styles.vaultLinkText}>Manage Resume Vault</Text>
          <ChevronRight size={12} color={colors.primaryGlow} />
        </TouchableOpacity>

        {/* Path advisor + Resume Generator quick links */}
        <View style={styles.quickRow}>
          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => router.push("/career/path-advisor")}
            testID="open-path-advisor"
            activeOpacity={0.85}
          >
            <Compass color="#A855F7" size={20} />
            <Text style={styles.quickTitle} numberOfLines={1}>Career Path</Text>
            <Text style={styles.quickSub} numberOfLines={2}>3 AI-mapped paths</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => router.push("/resume-hub" as any)}
            testID="open-resume-hub"
            activeOpacity={0.85}
          >
            <FileText color={colors.success} size={20} />
            <Text style={styles.quickTitle} numberOfLines={1}>Resume Hub</Text>
            <Text style={styles.quickSub} numberOfLines={2}>Upload, build, download</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => router.push("/career/resume-generator")}
            testID="open-resume-generator"
            activeOpacity={0.85}
          >
            <FileText color={colors.primaryGlow} size={20} />
            <Text style={styles.quickTitle} numberOfLines={1}>Resume Gen</Text>
            <Text style={styles.quickSub} numberOfLines={2}>Tailored ATS</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => router.push("/career-intel" as any)}
            testID="open-career-intel"
            activeOpacity={0.85}
          >
            <Sparkles color={colors.warning} size={20} />
            <Text style={styles.quickTitle} numberOfLines={1}>Career Intel</Text>
            <Text style={styles.quickSub} numberOfLines={2}>Interview · Letters · Jobs</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.matchHeadRow}>
          <Text style={styles.sectionLabel}>Top Job Matches</Text>
          <TouchableOpacity
            style={styles.refreshBtn}
            onPress={() => loadLiveJobs(true)}
            disabled={liveJobsLoading}
            testID="refresh-top-matches"
          >
            {liveJobsLoading ? (
              <ActivityIndicator size="small" color={colors.primaryGlow} />
            ) : (
              <RefreshCw size={12} color={colors.primaryGlow} />
            )}
            <Text style={styles.refreshBtnText}>
              {liveJobsLoading ? "Searching…" : "Refresh"}
            </Text>
          </TouchableOpacity>
        </View>
        <View style={{ gap: spacing.md }}>
          {topMatches.length === 0 && (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                {liveJobsLoading
                  ? "Searching for matches…"
                  : "No matches yet. Update your Auto Job Search Criteria below or tap Refresh."}
              </Text>
            </View>
          )}
          {topMatches.map((j) => (
            <TouchableOpacity
              key={j.id}
              style={styles.matchCard}
              onPress={() => {
                if (j.isLive && j.url) {
                  Linking.openURL(j.url).catch(() => {});
                } else if (!j.isLive) {
                  router.push(`/career/resume-generator?application_id=${j.id}`);
                } else {
                  router.push("/career-intel");
                }
              }}
              activeOpacity={0.85}
              testID={`match-card-${j.id}`}
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
              {j.reasoning && (
                <Text style={styles.matchReasoning} numberOfLines={2}>
                  {j.reasoning}
                </Text>
              )}
              <View style={styles.matchActions}>
                <TouchableOpacity
                  style={styles.matchActionBtn}
                  onPress={(e) => {
                    e.stopPropagation();
                    const url = resolveJobApplyUrl(j);
                    Linking.openURL(url).catch(() => {});
                  }}
                  testID={`view-posting-${j.id}`}
                >
                  <ExternalLink size={12} color={colors.primaryGlow} />
                  <Text style={styles.matchActionText}>View Posting</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.matchActionIcon}
                  onPress={async (e) => {
                    e.stopPropagation();
                    try {
                      await Clipboard.setStringAsync(resolveJobApplyUrl(j));
                    } catch (_e) {}
                  }}
                  testID={`copy-link-${j.id}`}
                  accessibilityLabel="Copy job posting link"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Copy size={12} color={colors.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.matchActionBtn, styles.matchActionBtnPrimary]}
                  onPress={(e) => {
                    e.stopPropagation();
                    router.push({
                      pathname: "/career/tailor",
                      params: {
                        job_title: j.role_title,
                        company: j.employer,
                        job_url: resolveJobApplyUrl(j),
                      },
                    } as any);
                  }}
                  testID={`tailor-for-${j.id}`}
                >
                  <Wand2 size={12} color="#fff" />
                  <Text style={styles.matchActionTextPrimary}>Tailor</Text>
                </TouchableOpacity>
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
        title="Edit Auto Job Search Criteria"
        fields={criteriaFields}
        initial={criteriaInitial}
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
      <Text style={styles.statLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{label}</Text>
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
    letterSpacing: 0.5,
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
  matchHeadRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.primaryMuted,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  refreshBtnText: { color: colors.primaryGlow, fontSize: 11, fontWeight: "700" },
  matchReasoning: {
    color: colors.textTertiary,
    fontSize: 11,
    fontStyle: "italic",
    marginTop: 4,
    lineHeight: 16,
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

  // Quick row (2x2 grid for better readability on 375px screens)
  quickRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  tailorCta: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: colors.primary, paddingVertical: 14,
    borderRadius: radius.md, marginTop: spacing.md,
  },
  tailorCtaText: { color: "#fff", fontSize: 14, fontWeight: "800", letterSpacing: 0.4 },
  vaultLink: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4,
    paddingVertical: 8,
  },
  vaultLinkText: { color: colors.primaryGlow, fontSize: 11, fontWeight: "700" },
  matchActions: {
    flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm,
  },
  matchActionBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4,
    paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.sm,
    backgroundColor: colors.surfaceElevated, flex: 1,
  },
  matchActionBtnPrimary: { backgroundColor: colors.primary, flex: 0.8 },
  matchActionText: { color: colors.primaryGlow, fontSize: 11, fontWeight: "700" },
  matchActionTextPrimary: { color: "#fff", fontSize: 11, fontWeight: "800" },
  matchActionIcon: {
    width: 32, height: 32, borderRadius: radius.sm, alignItems: "center",
    justifyContent: "center", backgroundColor: colors.surfaceElevated,
  },
  quickCard: {
    width: "47.5%",
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: 4,
    minHeight: 92,
  },
  quickTitle: { color: colors.textPrimary, fontWeight: "700", fontSize: 14, marginTop: 6 },
  quickSub: { color: colors.textSecondary, fontSize: 11, lineHeight: 14 },

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
