// PLOS Jobs Center — Deep Search Engine feed with verified apply links.
import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Alert, RefreshControl, Linking, Modal, Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import {
  ChevronLeft, RefreshCw, Filter, Shield, ShieldCheck, ExternalLink,
  Copy, X, Sparkles, MapPin, Clock, DollarSign, Building2, ArrowUpRight,
  Zap,
} from "lucide-react-native";
import { jobsDeepApi, careerPrefsApi, type DeepSearchJob } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";

const FRESHNESS = [
  { k: "24h", label: "Today" },
  { k: "3d", label: "3 days" },
  { k: "7d", label: "7 days" },
  { k: "30d", label: "30 days" },
  { k: "any", label: "Any time" },
];

const SORT_OPTIONS = [
  { k: "best_match", label: "Best Match" },
  { k: "most_recent", label: "Most Recent" },
  { k: "highest_salary", label: "Highest Salary" },
];

const QUICK_CHIPS = [
  { k: "all", label: "All Jobs" },
  { k: "remote", label: "Remote", filter: "remote" as const },
  { k: "new", label: "Posted Today", filter: "new" as const },
  { k: "high", label: "High Match 85%+", filter: "high" as const },
  { k: "federal", label: "USAJobs", filter: "usajobs" as const },
];

function fmtRel(iso?: string | null) {
  if (!iso) return "—";
  try {
    const diff = (Date.now() - new Date(iso).getTime()) / 60000;
    if (diff < 1) return "just now";
    if (diff < 60) return `${Math.floor(diff)} min ago`;
    if (diff < 60 * 24) return `${Math.floor(diff / 60)}h ago`;
    return `${Math.floor(diff / 60 / 24)}d ago`;
  } catch { return "recently"; }
}

function fmtSalary(min?: number | null, max?: number | null, disp?: string) {
  if (disp) return disp;
  if (min && max) return `$${(min / 1000).toFixed(0)}K–$${(max / 1000).toFixed(0)}K`;
  if (min) return `$${(min / 1000).toFixed(0)}K+`;
  return "";
}

export default function JobsCenterScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [feed, setFeed] = useState<any>({ jobs: [], counts_by_source: {}, new_today: 0 });
  const [freshness, setFreshness] = useState("7d");
  const [sort, setSort] = useState("best_match");
  const [quickFilter, setQuickFilter] = useState("all");
  const [applyJob, setApplyJob] = useState<DeepSearchJob | null>(null);
  const [meta, setMeta] = useState<any>(null); // last deep-search response

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const opts: any = { freshness, sort, limit: 60 };
      if (quickFilter === "new") opts.filter_new = true;
      if (quickFilter === "remote") { /* client-side filter */ }
      if (quickFilter === "high") opts.min_score = 85;
      if (quickFilter === "federal") opts.source = "USAJobs";
      const r = await jobsDeepApi.verifiedFeed(opts);
      setFeed(r);
    } catch (e: any) {
      Alert.alert("Load failed", String(e?.message || e));
    } finally { setLoading(false); }
  }, [freshness, sort, quickFilter]);

  useEffect(() => { load(); }, [load]);

  const runDeepSearch = useCallback(async () => {
    setSearching(true);
    try {
      // Pull active profile criteria
      const prof = await careerPrefsApi.listProfiles().catch(() => ({ profiles: [] }));
      const active = prof.profiles?.find((p: any) => p.is_active) || prof.profiles?.[0] || {};
      const industries = (await jobsDeepApi.listIndustries()).industries
        .filter((i) => i.enabled).map((i) => i.label);
      const locations = (active.locations || []).map((l: any) => l.label || l.city || "").filter(Boolean);
      const result = await jobsDeepApi.deepSearch({
        target_roles: active.target_roles || ["Financial Management"],
        excluded_keywords: active.excluded_keywords || [],
        industries,
        locations: locations.length ? locations : ["Atlanta, GA", "Washington DC"],
        min_salary: active.min_salary || 0,
        freshness,
        priority_employers: [],
      });
      setMeta(result);
      await load();
      Alert.alert(
        "Search complete",
        `Found ${result.total_verified_active} verified jobs across ${Object.keys(result.counts || {}).filter((k) => (result.counts as any)[k] > 0).length} sources`,
      );
    } catch (e: any) {
      Alert.alert("Search failed", String(e?.message || e));
    } finally { setSearching(false); }
  }, [freshness, load]);

  const displayed = (feed.jobs || []).filter((j: DeepSearchJob) => {
    if (quickFilter === "remote") return j.location_type === "remote";
    return true;
  });

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loader}>
          <ActivityIndicator color={colors.primaryGlow} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ChevronLeft size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Jobs Center</Text>
        <TouchableOpacity
          onPress={() => router.push("/career/filter-center" as any)}
          style={styles.backBtn}
        >
          <Filter size={18} color={colors.primaryGlow} />
        </TouchableOpacity>
      </View>

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load}
            tintColor={colors.primaryGlow} />
        }
        contentContainerStyle={styles.scroll}
      >
        {/* Summary row */}
        <View style={styles.summary}>
          <Text style={styles.summaryText}>
            <Text style={styles.summaryStrong}>{feed.count} verified jobs</Text>
            {" · "}{feed.new_today} new today
          </Text>
          <Text style={styles.summarySub}>
            Sources active: {Object.entries(feed.counts_by_source || {}).map(([k, v]: any) => `${k} ${v}`).join(" · ") || "none yet"}
          </Text>
          <Text style={styles.summarySub}>
            Last search: {fmtRel(feed.last_fetched_at)}
          </Text>
        </View>

        {/* Deep search button */}
        <TouchableOpacity
          style={styles.deepBtn}
          onPress={runDeepSearch}
          disabled={searching}
          testID="run-deep-search"
        >
          {searching ? <ActivityIndicator size="small" color="#fff" /> :
            <Sparkles size={14} color="#fff" />}
          <Text style={styles.deepBtnText}>
            {searching ? "Searching every source…" : "Run Deep Search Now"}
          </Text>
        </TouchableOpacity>

        {/* Quick filter chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}>
          {QUICK_CHIPS.map((c) => (
            <TouchableOpacity
              key={c.k}
              style={[styles.chip, quickFilter === c.k && styles.chipOn]}
              onPress={() => setQuickFilter(c.k)}
            >
              <Text style={[styles.chipText, quickFilter === c.k && { color: "#fff" }]}>
                {c.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Sort + Freshness row */}
        <View style={styles.controlsRow}>
          <View style={styles.controlsGroup}>
            <Text style={styles.controlsLabel}>Sort</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.miniChips}>
              {SORT_OPTIONS.map((s) => (
                <TouchableOpacity
                  key={s.k}
                  style={[styles.miniChip, sort === s.k && styles.miniChipOn]}
                  onPress={() => setSort(s.k)}
                >
                  <Text style={[styles.miniChipText, sort === s.k && { color: "#fff" }]}>
                    {s.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>

        <View style={styles.controlsRow}>
          <Text style={styles.controlsLabel}>Freshness</Text>
          <View style={styles.miniChipsRow}>
            {FRESHNESS.map((f) => (
              <TouchableOpacity
                key={f.k}
                style={[styles.miniChip, freshness === f.k && styles.miniChipOn]}
                onPress={() => setFreshness(f.k)}
              >
                <Text style={[styles.miniChipText, freshness === f.k && { color: "#fff" }]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Job cards */}
        {displayed.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              No jobs in the feed yet. Tap {"\u201C"}Run Deep Search Now{"\u201D"} to fetch fresh listings.
            </Text>
          </View>
        ) : displayed.map((j: DeepSearchJob) => (
          <JobCard key={j.job_id} job={j} onApply={() => setApplyJob(j)} />
        ))}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Apply Now confirmation sheet */}
      <ApplyNowSheet job={applyJob} onClose={() => setApplyJob(null)} />
    </SafeAreaView>
  );
}

// ================================================================
// Job Card
// ================================================================
function JobCard({ job, onApply }: { job: DeepSearchJob; onApply: () => void }) {
  const verified = job.is_verified;
  const applyBtnColor = verified ? "#10B981"
    : job.apply_url_status >= 400 ? "#EF4444"
    : "#F59E0B";
  const applyBtnLabel = verified ? "Apply Now"
    : job.apply_url_status >= 400 ? "Link Broken"
    : "Apply — Verifying";
  const worktypeLabel = ({
    remote: "Remote", hybrid: "Hybrid", on_site: "On-site",
    international: "International",
  } as any)[job.location_type] || "";
  return (
    <View style={cardStyles.card}>
      <View style={cardStyles.topRow}>
        {job.rank_position && (
          <View style={cardStyles.rankPill}>
            <Text style={cardStyles.rankText}>#{job.rank_position}</Text>
          </View>
        )}
        {job.is_new && (
          <View style={cardStyles.newBadge}>
            <Zap size={9} color="#fff" />
            <Text style={cardStyles.newBadgeText}>NEW</Text>
          </View>
        )}
        {!job.is_new && job.is_early && (
          <View style={cardStyles.earlyBadge}>
            <Text style={cardStyles.earlyBadgeText}>EARLY · 72h</Text>
          </View>
        )}
        {verified ? (
          <ShieldCheck size={14} color="#10B981" />
        ) : (
          <Shield size={14} color="#F59E0B" />
        )}
        <View style={{ flex: 1 }} />
        <View style={cardStyles.sourcePill}>
          <Text style={cardStyles.sourceText}>{job.source_platform}</Text>
        </View>
      </View>

      <Text style={cardStyles.title} numberOfLines={2}>{job.title}</Text>
      <View style={cardStyles.employerRow}>
        <Building2 size={12} color={colors.textSecondary} />
        <Text style={cardStyles.employer} numberOfLines={1}>{job.employer}</Text>
      </View>

      <View style={cardStyles.metaRow}>
        {!!job.location && (
          <View style={cardStyles.metaChip}>
            <MapPin size={10} color={colors.textTertiary} />
            <Text style={cardStyles.metaText} numberOfLines={1}>{job.location}</Text>
          </View>
        )}
        {!!worktypeLabel && (
          <View style={[cardStyles.metaChip, job.location_type === "remote" && cardStyles.metaChipRemote]}>
            <Text style={[cardStyles.metaText,
              job.location_type === "remote" && { color: "#10B981", fontWeight: "800" }]}>
              {worktypeLabel}
            </Text>
          </View>
        )}
        {!!fmtSalary(job.salary_min, job.salary_max, job.salary_display) && (
          <View style={cardStyles.metaChip}>
            <DollarSign size={10} color="#10B981" />
            <Text style={[cardStyles.metaText, { color: "#10B981", fontWeight: "800" }]}>
              {fmtSalary(job.salary_min, job.salary_max, job.salary_display)}
            </Text>
          </View>
        )}
        {(!!job.posted_at || !!job.posted_display) && (
          <View style={cardStyles.metaChip}>
            <Clock size={10} color={colors.textTertiary} />
            <Text style={cardStyles.metaText}>
              {job.posted_display || fmtRel(job.posted_at)}
            </Text>
          </View>
        )}
      </View>

      <View style={cardStyles.scoreRow}>
        <View style={[cardStyles.scoreGauge,
          job.match_score >= 85 ? { backgroundColor: "#10B981" }
          : job.match_score >= 70 ? { backgroundColor: colors.primary }
          : { backgroundColor: colors.textTertiary }]}>
          <Text style={cardStyles.scoreText}>{Math.round(job.match_score)}%</Text>
        </View>
        <Text style={cardStyles.scoreExplain} numberOfLines={2}>
          {job.match_score >= 85 ? "Strong match — most criteria align"
          : job.match_score >= 70 ? "Good match — several qualifications overlap"
          : "Partial match — some criteria met"}
          {job.watch_list_employer ? " · Priority employer" : ""}
        </Text>
      </View>

      <TouchableOpacity
        style={[cardStyles.applyBtn, { backgroundColor: applyBtnColor }]}
        onPress={onApply}
        disabled={job.apply_url_status >= 400}
        testID={`apply-${job.job_id}`}
      >
        <ExternalLink size={13} color="#fff" />
        <Text style={cardStyles.applyBtnText}>{applyBtnLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ================================================================
// Apply Now sheet — confirmation before launching browser
// ================================================================
function ApplyNowSheet({ job, onClose }: {
  job: DeepSearchJob | null; onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [launched, setLaunched] = useState(false);

  useEffect(() => {
    if (!job) { setCopied(false); setLaunched(false); return; }
    const t = setTimeout(async () => {
      if (!launched) {
        setLaunched(true);
        try {
          await Linking.openURL(job.apply_url_final || job.apply_url);
        } catch {
          Alert.alert("Could not open link");
        }
        setTimeout(onClose, 400);
      }
    }, 1600);
    return () => clearTimeout(t);
  }, [job, launched, onClose]);

  if (!job) return null;

  const url = job.apply_url_final || job.apply_url;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={sheetStyles.backdrop} onPress={onClose}>
        <Pressable style={sheetStyles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={sheetStyles.head}>
            <View style={{ flex: 1 }}>
              <Text style={sheetStyles.title} numberOfLines={2}>{job.title}</Text>
              <Text style={sheetStyles.sub}>{job.employer}</Text>
            </View>
            <TouchableOpacity onPress={onClose}><X size={16} color={colors.textTertiary} /></TouchableOpacity>
          </View>
          <View style={sheetStyles.sourceRow}>
            <View style={sheetStyles.sourceBadge}>
              <Text style={sheetStyles.sourceBadgeText}>{job.source_platform}</Text>
            </View>
            <ArrowUpRight size={12} color={colors.primaryGlow} />
          </View>
          <Text style={sheetStyles.body}>
            Opening the official job posting on <Text style={{ fontWeight: "700", color: colors.textPrimary }}>{job.source_platform}</Text>.
            You{"\u2019"}ll complete your application there.
          </Text>
          <TouchableOpacity
            style={sheetStyles.copyBtn}
            onPress={async () => {
              await Clipboard.setStringAsync(url);
              setCopied(true);
            }}
          >
            <Copy size={12} color={colors.primaryGlow} />
            <Text style={sheetStyles.copyBtnText}>{copied ? "Copied!" : "Copy link"}</Text>
          </TouchableOpacity>
          <View style={sheetStyles.loadingRow}>
            <ActivityIndicator size="small" color={colors.primaryGlow} />
            <Text style={sheetStyles.loadingText}>Launching…</Text>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
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
  headerTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: "800", flex: 1, textAlign: "center" },
  scroll: { padding: spacing.lg, paddingBottom: 40 },

  summary: {
    backgroundColor: colors.surface, borderRadius: radius.sm, padding: 10,
    borderWidth: 1, borderColor: colors.borderSubtle,
    marginBottom: 10,
  },
  summaryText: { color: colors.textPrimary, fontSize: 12, fontWeight: "700" },
  summaryStrong: { color: colors.primaryGlow, fontWeight: "900" },
  summarySub: { color: colors.textTertiary, fontSize: 10, marginTop: 2 },

  deepBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: colors.primary, paddingVertical: 12,
    borderRadius: radius.sm, marginBottom: 10,
  },
  deepBtnText: { color: "#fff", fontSize: 13, fontWeight: "900" },

  chipsRow: { gap: 6, paddingRight: 20, marginBottom: 4 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
    backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textSecondary, fontSize: 10, fontWeight: "700" },

  controlsRow: { marginTop: 6 },
  controlsGroup: { gap: 4 },
  controlsLabel: { color: colors.textTertiary, fontSize: 9, fontWeight: "800", letterSpacing: 0.5, marginBottom: 4 },
  miniChips: { gap: 5, paddingRight: 20 },
  miniChipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  miniChip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
    backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1,
  },
  miniChipOn: { backgroundColor: colors.primaryGlow, borderColor: colors.primaryGlow },
  miniChipText: { color: colors.textSecondary, fontSize: 10, fontWeight: "700" },

  emptyCard: {
    backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1,
    borderRadius: radius.md, padding: spacing.lg, alignItems: "center", marginTop: 10,
  },
  emptyText: { color: colors.textSecondary, fontSize: 12, textAlign: "center" },
});

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1,
    borderRadius: radius.md, padding: spacing.md, marginTop: 10, gap: 8,
  },
  topRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  rankPill: {
    backgroundColor: colors.primaryMuted, paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 999,
  },
  rankText: { color: colors.primaryGlow, fontSize: 10, fontWeight: "900" },
  newBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: "#EF4444", paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 999,
  },
  newBadgeText: { color: "#fff", fontSize: 8, fontWeight: "900", letterSpacing: 0.5 },
  earlyBadge: {
    backgroundColor: "rgba(245,158,11,0.20)", paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 999,
  },
  earlyBadgeText: { color: "#F59E0B", fontSize: 8, fontWeight: "900", letterSpacing: 0.5 },
  sourcePill: {
    backgroundColor: colors.surfaceElevated, paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6,
  },
  sourceText: { color: colors.textSecondary, fontSize: 9, fontWeight: "800", letterSpacing: 0.3 },

  title: { color: colors.textPrimary, fontSize: 14, fontWeight: "800", lineHeight: 18 },
  employerRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  employer: { color: colors.textSecondary, fontSize: 12, fontWeight: "700", flex: 1 },

  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  metaChip: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: colors.surfaceElevated, paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: 6,
  },
  metaChipRemote: { backgroundColor: "rgba(16,185,129,0.15)" },
  metaText: { color: colors.textSecondary, fontSize: 10, fontWeight: "600" },

  scoreRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  scoreGauge: {
    width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center",
  },
  scoreText: { color: "#fff", fontSize: 11, fontWeight: "900" },
  scoreExplain: { color: colors.textSecondary, fontSize: 10, flex: 1, lineHeight: 14 },

  applyBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 10, borderRadius: radius.sm,
  },
  applyBtnText: { color: "#fff", fontSize: 13, fontWeight: "900" },
});

const sheetStyles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 18, gap: 10,
  },
  head: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  title: { color: colors.textPrimary, fontSize: 15, fontWeight: "800", lineHeight: 20 },
  sub: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  sourceRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  sourceBadge: {
    backgroundColor: colors.primaryMuted, paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 6,
  },
  sourceBadgeText: { color: colors.primaryGlow, fontSize: 11, fontWeight: "800" },
  body: { color: colors.textSecondary, fontSize: 12, lineHeight: 16 },
  copyBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5,
    backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1,
    paddingVertical: 10, borderRadius: radius.sm,
  },
  copyBtnText: { color: colors.primaryGlow, fontSize: 12, fontWeight: "800" },
  loadingRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 4,
  },
  loadingText: { color: colors.textTertiary, fontSize: 11 },
});
