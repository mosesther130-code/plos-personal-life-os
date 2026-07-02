// PLOS Career — Job Intelligence: Redesigned Job Search Results screen.
import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Alert, Linking, RefreshControl, Modal, Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import {
  ChevronLeft, RefreshCw, Filter, ShieldCheck, Wand2, Bookmark,
  Copy, ExternalLink, Lock, TriangleAlert, Building2, Zap,
} from "lucide-react-native";
import { jobIntelApi, FeedJob } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";
import Svg, { Circle } from "react-native-svg";

const EMPLOYER_TYPE_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  federal_government: { bg: "rgba(30,64,175,0.20)", fg: "#3B82F6", label: "Federal" },
  international_org: { bg: "rgba(6,95,70,0.20)", fg: "#10B981", label: "Intl Org" },
  nonprofit: { bg: "rgba(6,95,70,0.20)", fg: "#10B981", label: "NGO" },
  ngo: { bg: "rgba(6,95,70,0.20)", fg: "#10B981", label: "NGO" },
  higher_education: { bg: "rgba(168,85,247,0.20)", fg: "#A855F7", label: "Higher Ed" },
  private_sector: { bg: "rgba(107,114,128,0.20)", fg: "#9CA3AF", label: "Private" },
};

function ScoreGauge({ score, size = 52 }: { score: number; size?: number }) {
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, score)) / 100) * c;
  const color = score >= 85 ? colors.success : score >= 70 ? colors.warning : score >= 50 ? "#9CA3AF" : "#EF4444";
  return (
    <View style={{ alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke}
          fill="none" strokeDasharray={`${dash} ${c - dash}`}
          strokeDashoffset={c / 4} strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={{ position: "absolute", alignItems: "center" }}>
        <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "800" }}>{Math.round(score)}</Text>
      </View>
    </View>
  );
}

function ApplyBtn({ url, quality, onCopy }: {
  url: string; quality: string; onCopy: () => void;
}) {
  const cfg: Record<string, { bg: string; fg: string; label: string; icon: string }> = {
    direct_apply:    { bg: colors.success, fg: "#fff", label: "Apply Now",         icon: "ext" },
    posting_page:    { bg: colors.primary, fg: "#fff", label: "View & Apply",      icon: "ext" },
    requires_login:  { bg: colors.primary, fg: "#fff", label: "Apply (Login Req.)",icon: "lock" },
    unverified:      { bg: colors.warning, fg: "#fff", label: "Apply (Unverified)",icon: "warn" },
    general_careers: { bg: "#4B5563",      fg: "#fff", label: "Careers Page",      icon: "ext" },
  };
  const c = cfg[quality] || cfg.posting_page;
  return (
    <View style={{ flexDirection: "row", gap: 6, flex: 1.6 }}>
      <TouchableOpacity
        style={[styles.applyBtn, { backgroundColor: c.bg }]}
        onPress={() => Linking.openURL(url)}
        testID="apply-btn"
      >
        {c.icon === "lock" ? <Lock size={12} color="#fff" /> :
         c.icon === "warn" ? <TriangleAlert size={12} color="#fff" /> :
         <ExternalLink size={12} color="#fff" />}
        <Text style={[styles.applyBtnText, { color: c.fg }]} numberOfLines={1}>{c.label}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.copyBtn} onPress={onCopy} testID="copy-link">
        <Copy size={12} color={colors.primaryGlow} />
      </TouchableOpacity>
    </View>
  );
}

function JobCard({ job, onOpen, onTailor, onSave }: {
  job: FeedJob; onOpen: () => void; onTailor: () => void; onSave: () => void;
}) {
  const score = job.display_score || 0;
  const scoreData: any = (job.match_scores || {})[Object.keys(job.match_scores || {})[0] || ""] || {};
  const spotlight: string[] = scoreData.keyword_spotlight || [];
  const strengths: string[] = scoreData.top_strengths || [];
  const et = EMPLOYER_TYPE_COLORS[job.employer_type] || EMPLOYER_TYPE_COLORS.private_sector;
  const bd = scoreData.score_breakdown || {};

  const copyLink = async () => {
    await Clipboard.setStringAsync(job.apply_url);
    Alert.alert("Copied", "Application link copied — paste anywhere to share or save.");
  };

  return (
    <View style={styles.card} testID={`job-${job.job_id}`}>
      {/* Header row */}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <TouchableOpacity style={{ flex: 1 }} onPress={onOpen} activeOpacity={0.7}>
          <Text style={styles.title} numberOfLines={2}>{job.job_title}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
            <Text style={styles.employer} numberOfLines={1}>{job.employer}</Text>
            <View style={[styles.badge, { backgroundColor: et.bg }]}>
              <Text style={[styles.badgeText, { color: et.fg }]}>{et.label}</Text>
            </View>
            {job.early_posting_flag && (
              <View style={styles.earlyBadge}>
                <Zap size={9} color="#F59E0B" fill="#F59E0B" />
                <Text style={styles.earlyBadgeText}>NEW</Text>
              </View>
            )}
            <View style={styles.verifiedBadge}>
              <ShieldCheck size={9} color={colors.success} />
              <Text style={styles.verifiedBadgeText}>Verified</Text>
            </View>
          </View>
          <Text style={styles.meta} numberOfLines={1}>
            {job.location || "Remote"} · {job.location_type.replace("_", "-")} · via {job.source}
            {job.salary_text ? ` · ${job.salary_text}` : ""}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {job.days_since_posted === 0 ? "Posted today" : `${job.days_since_posted}d ago`}
          </Text>
        </TouchableOpacity>
        {/* Score gauge */}
        {score > 0 && (
          <View style={{ alignItems: "center" }}>
            <ScoreGauge score={score} />
            <Text style={styles.tier}>{scoreData.match_tier || "—"}</Text>
          </View>
        )}
      </View>

      {/* 6-cell breakdown */}
      {bd && Object.keys(bd).length > 0 && (
        <View style={styles.bdGrid}>
          {(
            [["skills_match", "Skills"], ["experience_match", "Exp"],
             ["education_match", "Educ"], ["industry_match", "Industry"],
             ["location_match", "Loc"], ["clearance_match", "Clear"]] as [string, string][]
          ).map(([k, lbl]) => (
            <View key={k} style={styles.bdCell}>
              <Text style={styles.bdLabel}>{lbl}</Text>
              <View style={styles.bdBar}>
                <View style={[styles.bdFill, {
                  width: `${Math.min(100, bd[k] || 0)}%`,
                  backgroundColor: (bd[k] || 0) >= 70 ? colors.success : (bd[k] || 0) >= 50 ? colors.warning : "#6B7280",
                }]} />
              </View>
              <Text style={styles.bdVal}>{bd[k] || 0}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Keyword spotlight */}
      {spotlight.length > 0 && (
        <View>
          <Text style={styles.spotlightLabel}>Key skills for this role</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
            {spotlight.slice(0, 8).map((k, i) => (
              <View key={i} style={styles.chipBlue}>
                <Text style={styles.chipBlueText}>{k}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Top strength */}
      {strengths.length > 0 && (
        <Text style={styles.strengthText} numberOfLines={2}>{strengths[0]}</Text>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.secondaryBtn} onPress={onOpen} testID="view-details">
          <Text style={styles.secondaryBtnText}>Details</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} onPress={onTailor} testID="tailor-cta">
          <Wand2 size={11} color={colors.primaryGlow} />
          <Text style={styles.secondaryBtnText}>Tailor</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.saveBtn} onPress={onSave} testID="save-job">
          <Bookmark size={11} color={colors.primaryGlow} />
        </TouchableOpacity>
        <ApplyBtn url={job.apply_url} quality={job.link_quality} onCopy={copyLink} />
      </View>
    </View>
  );
}

export default function JobsFeedScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [aggregating, setAggregating] = useState(false);
  const [jobs, setJobs] = useState<FeedJob[]>([]);
  const [counters, setCounters] = useState<any>({});
  const [sort, setSort] = useState<"best_match" | "most_recent" | "highest_salary">("best_match");
  const [minScore, setMinScore] = useState<number>(0);
  const [applyWarning, setApplyWarning] = useState<FeedJob | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await jobIntelApi.feed(minScore, sort, 80);
      setJobs(d.jobs || []);
      setCounters(d.counters || {});
    } catch (e: any) {
      Alert.alert("Feed load failed", String(e?.message || e));
    }
  }, [minScore, sort]);

  useEffect(() => { (async () => { setLoading(true); await load(); setLoading(false); })(); }, [load]);

  async function triggerRefresh() {
    Alert.alert(
      "Refresh Now",
      "This aggregates 3 job sources and scores against your default resume via Claude. Takes 2–4 minutes. Continue?",
      [
        { text: "Cancel" },
        {
          text: "Refresh",
          onPress: async () => {
            setAggregating(true);
            try {
              await jobIntelApi.refresh();
              await load();
              Alert.alert("Done", "Feed refreshed with latest verified jobs.");
            } catch (e: any) {
              Alert.alert("Refresh failed", String(e?.message || e));
            } finally { setAggregating(false); }
          },
        },
      ]
    );
  }

  async function onSaveJob(j: FeedJob) {
    try {
      await jobIntelApi.saveJob(j.job_id);
      Alert.alert("Saved", `${j.job_title} added to saved jobs.`);
    } catch (e: any) { Alert.alert("Failed", String(e?.message || e)); }
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ChevronLeft size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Job Feed</Text>
        <TouchableOpacity onPress={triggerRefresh} style={styles.backBtn} disabled={aggregating}>
          {aggregating ? <ActivityIndicator size="small" color={colors.primaryGlow} /> : <RefreshCw size={18} color={colors.primaryGlow} />}
        </TouchableOpacity>
      </View>

      {/* Counter strip */}
      <View style={styles.counterStrip}>
        <Text style={styles.counterText}>
          Scanned <Text style={styles.counterVal}>{counters.scanned_today || 0}</Text> · Filtered{" "}
          <Text style={styles.counterVal}>{counters.filtered_today || 0}</Text> · Verified{" "}
          <Text style={[styles.counterVal, { color: colors.success }]}>{counters.verified_shown || jobs.length}</Text>
        </Text>
      </View>

      {/* Sort chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sortRow}>
        {[
          { k: "best_match", l: "Best Match" },
          { k: "most_recent", l: "Most Recent" },
          { k: "highest_salary", l: "Highest Salary" },
        ].map((s) => (
          <TouchableOpacity
            key={s.k}
            style={[styles.sortChip, sort === s.k && styles.sortChipOn]}
            onPress={() => setSort(s.k as any)}
            testID={`sort-${s.k}`}
          >
            <Text style={[styles.sortChipText, sort === s.k && { color: "#fff" }]}>{s.l}</Text>
          </TouchableOpacity>
        ))}
        <View style={{ width: 6 }} />
        <TouchableOpacity
          style={[styles.sortChip, minScore >= 70 && styles.sortChipOn]}
          onPress={() => setMinScore(minScore >= 70 ? 0 : 70)}
        >
          <Text style={[styles.sortChipText, minScore >= 70 && { color: "#fff" }]}>Match ≥ 70</Text>
        </TouchableOpacity>
      </ScrollView>

      {loading ? (
        <View style={styles.loader}><ActivityIndicator color={colors.primaryGlow} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.primaryGlow} />}
        >
          {jobs.length === 0 ? (
            <View style={styles.emptyCard}>
              <Building2 size={28} color={colors.textTertiary} />
              <Text style={styles.emptyText}>No verified jobs yet.</Text>
              <Text style={styles.emptyHint}>Tap the refresh icon to run the first aggregation.</Text>
            </View>
          ) : (
            jobs.map((j) => (
              <JobCard
                key={j.job_id}
                job={j}
                onOpen={() => router.push(`/career/job-detail?job_id=${encodeURIComponent(j.job_id)}` as any)}
                onTailor={() => router.push(`/career/tailor-modal?jd_id=` as any)}
                onSave={() => onSaveJob(j)}
              />
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
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
  counterStrip: {
    paddingHorizontal: spacing.lg, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: colors.borderSubtle,
  },
  counterText: { color: colors.textSecondary, fontSize: 11 },
  counterVal: { color: colors.textPrimary, fontWeight: "800" },
  sortRow: { paddingHorizontal: spacing.lg, paddingVertical: 8, gap: 6 },
  sortChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
    borderWidth: 1, borderColor: colors.borderSubtle, backgroundColor: colors.surface,
  },
  sortChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  sortChipText: { color: colors.textSecondary, fontSize: 11, fontWeight: "700" },
  list: { padding: spacing.md, gap: 10, paddingBottom: 40 },
  emptyCard: {
    backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1,
    borderRadius: radius.md, padding: spacing.xl, alignItems: "center", gap: 6,
  },
  emptyText: { color: colors.textSecondary, fontSize: 13, fontWeight: "600" },
  emptyHint: { color: colors.textTertiary, fontSize: 11 },
  card: {
    backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1,
    borderRadius: radius.md, padding: spacing.md, gap: 8,
  },
  title: { color: colors.textPrimary, fontSize: 14, fontWeight: "800", lineHeight: 18 },
  employer: { color: colors.textSecondary, fontSize: 12, fontWeight: "700", flexShrink: 1 },
  meta: { color: colors.textTertiary, fontSize: 10, marginTop: 3 },
  badge: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3 },
  badgeText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.3 },
  earlyBadge: {
    flexDirection: "row", alignItems: "center", gap: 2,
    backgroundColor: "rgba(245,158,11,0.20)", paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3,
  },
  earlyBadgeText: { color: "#F59E0B", fontSize: 8, fontWeight: "800", letterSpacing: 0.4 },
  verifiedBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: "rgba(16,185,129,0.15)", paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3,
  },
  verifiedBadgeText: { color: colors.success, fontSize: 8, fontWeight: "800", letterSpacing: 0.3 },
  tier: { color: colors.textTertiary, fontSize: 8, fontWeight: "800", marginTop: 2, textTransform: "uppercase" },
  bdGrid: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  bdCell: { flexBasis: "31%", flexGrow: 1, gap: 2 },
  bdLabel: { color: colors.textTertiary, fontSize: 9, fontWeight: "700" },
  bdBar: {
    height: 3, backgroundColor: colors.surfaceElevated, borderRadius: 2, overflow: "hidden",
  },
  bdFill: { height: 3 },
  bdVal: { color: colors.textSecondary, fontSize: 9, fontWeight: "700", alignSelf: "flex-end" },
  spotlightLabel: {
    color: colors.textTertiary, fontSize: 9, fontWeight: "800",
    letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 4,
  },
  chipBlue: {
    backgroundColor: colors.primaryMuted, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10,
  },
  chipBlueText: { color: colors.primaryGlow, fontSize: 10, fontWeight: "700" },
  strengthText: { color: colors.textSecondary, fontSize: 11, fontStyle: "italic", lineHeight: 15 },
  actions: { flexDirection: "row", gap: 5, marginTop: 4 },
  secondaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3,
    borderWidth: 1, borderColor: colors.borderSubtle, backgroundColor: colors.surfaceElevated,
    borderRadius: radius.sm, paddingVertical: 8, paddingHorizontal: 8, flex: 1,
  },
  secondaryBtnText: { color: colors.primaryGlow, fontSize: 10, fontWeight: "700" },
  saveBtn: {
    borderWidth: 1, borderColor: colors.borderSubtle, backgroundColor: colors.surfaceElevated,
    borderRadius: radius.sm, paddingVertical: 8, paddingHorizontal: 10, alignItems: "center", justifyContent: "center",
  },
  applyBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4,
    borderRadius: radius.sm, paddingVertical: 8, paddingHorizontal: 8, flex: 1,
  },
  applyBtnText: { fontSize: 10.5, fontWeight: "800" },
  copyBtn: {
    borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8,
    borderWidth: 1, borderColor: colors.borderSubtle, alignItems: "center", justifyContent: "center",
  },
});
