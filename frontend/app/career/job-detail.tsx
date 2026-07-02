// PLOS Career — Full job detail with Keyword Intelligence Panel + sticky Apply.
import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Alert, Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as Clipboard from "expo-clipboard";
import {
  ChevronLeft, ShieldCheck, CheckCircle2, TriangleAlert, Copy,
  ExternalLink, Lock, Wand2, Bookmark, Zap,
} from "lucide-react-native";
import { jobIntelApi, FeedJob } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";

function resumeContains(text: string, kw: string): "match" | "partial" | "missing" {
  const t = text.toLowerCase();
  const k = kw.trim().toLowerCase();
  if (!k) return "missing";
  if (t.includes(k)) return "match";
  const parts = k.split(/\s+/).filter((w) => w.length > 3);
  const hit = parts.some((p) => t.includes(p));
  return hit ? "partial" : "missing";
}

function ApplyButton({ url, quality, small }: { url: string; quality: string; small?: boolean }) {
  const cfg: Record<string, { bg: string; label: string; icon: any }> = {
    direct_apply:    { bg: colors.success, label: "Apply Now",           icon: ExternalLink },
    posting_page:    { bg: colors.primary, label: "View & Apply",         icon: ExternalLink },
    requires_login:  { bg: colors.primary, label: "Apply (Login Req.)",   icon: Lock },
    unverified:      { bg: colors.warning, label: "Apply (Unverified)",   icon: TriangleAlert },
    general_careers: { bg: "#4B5563",      label: "Careers Page",         icon: ExternalLink },
  };
  const c = cfg[quality] || cfg.posting_page;
  const Icon = c.icon;
  return (
    <TouchableOpacity
      style={[styles.applyBtn, { backgroundColor: c.bg }, small && { paddingVertical: 8 }]}
      onPress={() => Linking.openURL(url)}
      testID={small ? "apply-header" : "apply-sticky"}
    >
      <Icon size={14} color="#fff" />
      <Text style={styles.applyBtnText}>{c.label}</Text>
    </TouchableOpacity>
  );
}

export default function JobDetailScreen() {
  const router = useRouter();
  const { job_id } = useLocalSearchParams<{ job_id: string }>();
  const [loading, setLoading] = useState(true);
  const [job, setJob] = useState<FeedJob | null>(null);
  const [resumeText, setResumeText] = useState("");

  const load = useCallback(async () => {
    if (!job_id) return;
    try {
      const doc = await jobIntelApi.detail(String(job_id));
      setJob(doc);
    } catch (e: any) {
      Alert.alert("Load failed", String(e?.message || e));
    } finally { setLoading(false); }
  }, [job_id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    // Pull default resume text for keyword coloring
    import("@/src/lib/api").then(({ careerLibraryApi }) => {
      careerLibraryApi.listResumes().then((r) => {
        const def = r.resumes.find((x) => x.is_default);
        if (def) setResumeText(def.extracted_text || "");
      }).catch(() => {});
    });
  }, []);

  if (loading || !job) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loader}><ActivityIndicator color={colors.primaryGlow} /></View>
      </SafeAreaView>
    );
  }

  const rid = Object.keys(job.match_scores || {})[0] || "";
  const score: any = ((job.match_scores || {})[rid]) || {};
  const spotlight: string[] = score.keyword_spotlight || [];
  const skillsMatched: string[] = score.skills_matched || [];

  const power: string[] = [];
  const missing: string[] = [];
  spotlight.forEach((kw) => {
    const s = resumeContains(resumeText, kw);
    if (s === "match") power.push(kw);
    else if (s === "missing") missing.push(kw);
  });

  // Keyword frequency map
  const freqMap: Record<string, number> = {};
  const bigWords = new Set([
    ...spotlight.map((k) => k.toLowerCase()),
    ...(skillsMatched || []).map((k) => k.toLowerCase()),
  ]);
  const lower = (job.job_description_text || "").toLowerCase();
  bigWords.forEach((w) => {
    if (!w) return;
    const re = new RegExp("\\b" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "g");
    const m = lower.match(re);
    if (m) freqMap[w] = m.length;
  });
  const freqEntries = Object.entries(freqMap).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxFreq = freqEntries[0]?.[1] || 1;

  // Industry-specific terminology guess
  const et = job.employer_type || "private_sector";
  const jargonMap: Record<string, string[]> = {
    federal_government: ["GS pay scale", "GPRA", "OMB Circular A-123", "FFMIA", "CFO Act", "USAJobs", "OF-306"],
    international_org: ["results-based management", "IPSAS", "disbursement", "sovereign operations", "project completion report", "ODA"],
    higher_education: ["academic administration", "faculty affairs", "student services", "accreditation", "SACSCOC"],
    nonprofit: ["program impact", "grant reporting", "donor cultivation", "501(c)(3)", "logic model"],
    ngo: ["program impact", "grant reporting", "donor cultivation", "logic model"],
    private_sector: ["KPIs", "OKRs", "P&L ownership", "stakeholder alignment"],
  };
  const jargon = jargonMap[et] || [];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ChevronLeft size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{job.employer}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{job.job_title}</Text>
        <View style={{ flexDirection: "row", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
          <View style={styles.verifiedBadge}>
            <ShieldCheck size={11} color={colors.success} />
            <Text style={styles.verifiedText}>Verified</Text>
          </View>
          {job.early_posting_flag && (
            <View style={styles.earlyBadge}>
              <Zap size={10} color="#F59E0B" fill="#F59E0B" />
              <Text style={styles.earlyText}>NEW · Posted {job.days_since_posted === 0 ? "today" : `${job.days_since_posted}d ago`}</Text>
            </View>
          )}
        </View>
        <Text style={styles.meta}>
          {job.location || "Remote"} · {job.location_type.replace("_", "-")} · via {job.source}
        </Text>
        {job.salary_text ? <Text style={styles.salary}>{job.salary_text}</Text> : null}

        {/* Header apply button */}
        <View style={{ marginTop: 8 }}>
          <ApplyButton url={job.apply_url} quality={job.link_quality} small />
        </View>

        {/* Keyword Intelligence Panel */}
        <Text style={styles.section}>Keyword Intelligence — What to Emphasize for This Role</Text>

        {/* A: Your Power Keywords */}
        <View style={[styles.kwPanel, styles.kwPanelGreen]}>
          <View style={styles.kwHead}>
            <CheckCircle2 size={14} color={colors.success} />
            <Text style={[styles.kwTitle, { color: colors.success }]}>Your Power Keywords</Text>
          </View>
          <Text style={styles.kwSub}>Lead with these in your cover letter and tailored resume.</Text>
          {power.length === 0 ? (
            <Text style={styles.kwEmpty}>None detected — upload a resume or refresh insights.</Text>
          ) : (
            <View style={styles.chipRow}>
              {power.map((k, i) => (
                <View key={i} style={styles.chipGreen}>
                  <Text style={styles.chipGreenText}>{k}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* B: High Priority Missing */}
        <View style={[styles.kwPanel, styles.kwPanelRed]}>
          <View style={styles.kwHead}>
            <TriangleAlert size={14} color="#EF4444" />
            <Text style={[styles.kwTitle, { color: "#EF4444" }]}>High Priority Missing Keywords</Text>
          </View>
          <Text style={styles.kwSub}>Required for this role. Add to resume if you have the experience, or address in cover letter.</Text>
          {missing.length === 0 ? (
            <Text style={styles.kwEmpty}>No critical gaps detected.</Text>
          ) : (
            missing.map((k, i) => (
              <View key={i} style={styles.missingRow}>
                <Text style={styles.missingKw}>• {k}</Text>
                <Text style={styles.missingNote}>Required — add if you have experience, or address in cover letter.</Text>
              </View>
            ))
          )}
        </View>

        {/* C: Keyword Frequency Map */}
        {freqEntries.length > 0 && (
          <View style={styles.kwPanel}>
            <Text style={styles.kwTitle}>Keyword Frequency Map</Text>
            <Text style={styles.kwSub}>Longer bars = mentioned more times in this JD = higher priority to the hiring manager and ATS.</Text>
            {freqEntries.map(([w, n]) => (
              <View key={w} style={styles.freqRow}>
                <Text style={styles.freqLabel} numberOfLines={1}>{w}</Text>
                <View style={styles.freqBar}>
                  <View style={[styles.freqFill, { width: `${(n / maxFreq) * 100}%` }]} />
                </View>
                <Text style={styles.freqCount}>{n}x</Text>
              </View>
            ))}
          </View>
        )}

        {/* D: Industry Terminology */}
        <View style={styles.kwPanel}>
          <Text style={styles.kwTitle}>Industry-Specific Terminology</Text>
          <Text style={styles.kwSub}>Sector jargon and acronyms to sprinkle in your application.</Text>
          <View style={styles.chipRow}>
            {jargon.map((k, i) => (
              <View key={i} style={styles.chipPurple}>
                <Text style={styles.chipPurpleText}>{k}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Job description */}
        <Text style={styles.section}>Full Job Description</Text>
        <View style={styles.descBox}>
          <Text style={styles.descText}>{job.job_description_text}</Text>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Sticky bottom action bar */}
      <View style={styles.stickyBar}>
        <TouchableOpacity
          style={styles.stickySecondary}
          onPress={() => router.push(`/career/tailor-modal?job_id=${job.job_id}` as any)}
          testID="tailor-here"
        >
          <Wand2 size={12} color={colors.primaryGlow} />
          <Text style={styles.stickySecondaryText}>Tailor</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.stickySecondary}
          onPress={async () => {
            await Clipboard.setStringAsync(job.apply_url);
            Alert.alert("Copied", "Link copied to clipboard.");
          }}
        >
          <Copy size={12} color={colors.primaryGlow} />
          <Text style={styles.stickySecondaryText}>Copy Link</Text>
        </TouchableOpacity>
        <View style={{ flex: 2 }}>
          <ApplyButton url={job.apply_url} quality={job.link_quality} />
        </View>
      </View>
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
  headerTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: "700", flex: 1, textAlign: "center" },
  scroll: { padding: spacing.lg, gap: 6, paddingBottom: 100 },
  title: { color: colors.textPrimary, fontSize: 20, fontWeight: "800", lineHeight: 26 },
  verifiedBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: "rgba(16,185,129,0.15)", paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4,
  },
  verifiedText: { color: colors.success, fontSize: 10, fontWeight: "800" },
  earlyBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(245,158,11,0.15)", paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4,
  },
  earlyText: { color: "#F59E0B", fontSize: 10, fontWeight: "800" },
  meta: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  salary: { color: colors.success, fontSize: 13, fontWeight: "800", marginTop: 2 },
  section: {
    color: colors.textPrimary, fontSize: 14, fontWeight: "800",
    marginTop: spacing.lg, marginBottom: 6,
  },
  kwPanel: {
    backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1,
    borderRadius: radius.md, padding: spacing.md, gap: 6, marginTop: 8,
  },
  kwPanelGreen: { borderColor: "rgba(16,185,129,0.35)" },
  kwPanelRed: { borderColor: "rgba(239,68,68,0.35)" },
  kwHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  kwTitle: { color: colors.textPrimary, fontSize: 12, fontWeight: "800", letterSpacing: 0.3 },
  kwSub: { color: colors.textTertiary, fontSize: 10, lineHeight: 14, fontStyle: "italic" },
  kwEmpty: { color: colors.textTertiary, fontSize: 11, fontStyle: "italic" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 4 },
  chipGreen: {
    backgroundColor: "rgba(16,185,129,0.15)", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12,
  },
  chipGreenText: { color: colors.success, fontSize: 10, fontWeight: "700" },
  chipPurple: {
    backgroundColor: "rgba(168,85,247,0.15)", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12,
  },
  chipPurpleText: { color: "#A855F7", fontSize: 10, fontWeight: "700" },
  missingRow: {
    borderRadius: radius.sm, padding: 6, backgroundColor: "rgba(239,68,68,0.06)",
    marginTop: 4,
  },
  missingKw: { color: "#EF4444", fontSize: 11, fontWeight: "800" },
  missingNote: { color: colors.textTertiary, fontSize: 9, marginTop: 2 },
  freqRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  freqLabel: { color: colors.textSecondary, fontSize: 10, fontWeight: "600", flex: 1 },
  freqBar: { flex: 1.5, height: 6, backgroundColor: colors.surfaceElevated, borderRadius: 3, overflow: "hidden" },
  freqFill: { height: 6, backgroundColor: colors.primaryGlow, borderRadius: 3 },
  freqCount: { color: colors.textPrimary, fontSize: 10, fontWeight: "800", minWidth: 22, textAlign: "right" },
  descBox: {
    backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1,
    borderRadius: radius.md, padding: spacing.md,
  },
  descText: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
  stickyBar: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    flexDirection: "row", gap: 6, paddingHorizontal: 10, paddingVertical: 10,
    backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.borderSubtle,
  },
  stickySecondary: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3,
    borderWidth: 1, borderColor: colors.borderSubtle, backgroundColor: colors.surfaceElevated,
    borderRadius: radius.sm, paddingVertical: 10,
  },
  stickySecondaryText: { color: colors.primaryGlow, fontSize: 10, fontWeight: "800" },
  applyBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 12, borderRadius: radius.sm,
  },
  applyBtnText: { color: "#fff", fontSize: 12, fontWeight: "800" },
});
