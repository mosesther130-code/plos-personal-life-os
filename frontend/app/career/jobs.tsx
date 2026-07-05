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

// ---------- Profile → Deep Search normalizer -----------------------------
// Convert profile locations/sectors into search-ready primitives, respecting
// priority and per-location work_type_override.
const US_STATE_TO_ABBR: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS",
  missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH",
  "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC",
  "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA",
  "rhode island": "RI", "south carolina": "SC", "south dakota": "SD",
  tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA",
  washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
  "district of columbia": "DC",
};

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

function normalizeLocationEntry(loc: any): string | null {
  if (!loc || loc.enabled === false) return null;
  const kind = (loc.type || "").toLowerCase();
  // Drop pure specials — those signal work_type_filter instead of a location
  if (kind === "special" || loc.is_special) return null;
  // Skip region entries with no city (too vague for SerpApi)
  if (kind === "region" && !loc.city) return null;

  const city = (loc.city || "").trim();
  const admin1 = (loc.admin1 || "").trim();
  const cc = (loc.country_code || "US").toUpperCase();

  // Non-US: prefer "City, Country" or just "Country"
  if (cc && cc !== "US") {
    if (city) {
      // Try to get country full-name from label as fallback
      const country = (loc.label || "").split(",").pop()?.trim() || cc;
      return `${city}, ${country}`;
    }
    // Country-only entry
    const country = (loc.label || "").trim();
    return country || null;
  }

  // US: build "City, ST"
  if (city && admin1) {
    // Normalize state to 2-letter abbr
    const abbr = admin1.length === 2 ? admin1.toUpperCase() :
                 US_STATE_TO_ABBR[admin1.toLowerCase()] || admin1;
    return `${city}, ${abbr}`;
  }
  // State-only entry (kind='state')
  if (!city && admin1) {
    const abbr = admin1.length === 2 ? admin1.toUpperCase() :
                 US_STATE_TO_ABBR[admin1.toLowerCase()];
    if (abbr) return abbr; // Google Jobs treats bare state code as the state
  }
  // Zip fallback: if label like "Stone Mountain, GA 30083" — take first two parts
  const label = (loc.label || "").trim();
  if (label) {
    const parts = label.split(",").map((p: string) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      // Strip trailing " USA" / " United States" and zip codes from parts[1]
      let p1 = parts[1].replace(/\bUSA\b|\bUnited States\b/gi, "").trim();
      p1 = p1.replace(/\s*\d{5}(-\d{4})?\s*$/, "").trim();
      // Convert full state name to abbr
      const abbr = p1.length === 2 ? p1.toUpperCase() :
                   US_STATE_TO_ABBR[p1.toLowerCase()] || p1;
      if (parts[0] && abbr) return `${parts[0]}, ${abbr}`;
    }
    return parts[0];
  }
  return null;
}

function deriveDeepSearchParams(active: any, industriesFallback: string[]) {
  const locsRaw: any[] = Array.isArray(active?.locations) ? active.locations : [];

  // Enabled locations sorted by priority (high → low)
  const enabled = locsRaw.filter((l) => l && l.enabled !== false);
  enabled.sort((a, b) =>
    (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3));

  const locations: string[] = [];
  const seen = new Set<string>();
  for (const l of enabled) {
    const norm = normalizeLocationEntry(l);
    if (norm && !seen.has(norm.toLowerCase())) {
      seen.add(norm.toLowerCase());
      locations.push(norm);
    }
  }

  // Sectors → industries. Enabled sectors, sorted by priority.
  const sectorsRaw: any[] = Array.isArray(active?.sectors) ? active.sectors : [];
  const enabledSectors = sectorsRaw
    .filter((s) => s && s.enabled !== false)
    .sort((a, b) =>
      (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3));
  const industries = enabledSectors.map((s) => s.name).filter(Boolean);
  const finalIndustries = industries.length ? industries : industriesFallback;

  // Determine effective work_type_filter
  // Priority: explicit root value > majority high-priority override > "any"
  let wtf = (active?.work_type_filter || "").toLowerCase();
  if (!wtf) {
    const overrides = enabled
      .filter((l) => l.priority === "high")
      .map((l) => (l.work_type_override || "any").toLowerCase())
      .filter((v) => v && v !== "any");
    // If ALL high-priority overrides agree, use it. Else fall back to "any".
    if (overrides.length && overrides.every((v) => v === overrides[0])) {
      wtf = overrides[0];
    } else if (overrides.length) {
      // Mixed: if any is remote-only + any is on_site → use hybrid_remote (widest sensible)
      wtf = "any";
    } else {
      wtf = "any";
    }
  }

  return {
    target_roles: active?.target_roles || [],
    excluded_keywords: active?.excluded_keywords || [],
    industries: finalIndustries,
    locations,
    min_salary: active?.min_salary || 0,
    work_type_filter: wtf,
  };
}

export default function JobsCenterScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [feed, setFeed] = useState<any>({ jobs: [], counts_by_source: {}, new_today: 0 });
  const [freshness, setFreshness] = useState("7d");
  const [sort, setSort] = useState("best_match");
  const [applyJob, setApplyJob] = useState<DeepSearchJob | null>(null);
  const [meta, setMeta] = useState<any>(null); // last deep-search response
  const [tailoringJobId, setTailoringJobId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Read active work_type_filter from user's active profile — the profile
      // is the single source of truth. No overlay quick filters.
      const prof = await careerPrefsApi.listProfiles().catch(() => ({ profiles: [] }));
      const active: any = prof.profiles?.find((p: any) => p.is_active) || prof.profiles?.[0] || {};
      const wtf = active.work_type_filter || "any";
      const opts: any = {
        freshness, sort, limit: 60,
        work_type_filter: wtf,
      } as any;
      const r = await jobsDeepApi.verifiedFeed(opts);
      setFeed(r);
    } catch (e: any) {
      Alert.alert("Load failed", String(e?.message || e));
    } finally { setLoading(false); }
  }, [freshness, sort]);

  useEffect(() => { load(); }, [load]);

  const runDeepSearch = useCallback(async () => {
    setSearching(true);
    try {
      // Pull active profile criteria
      const prof = await careerPrefsApi.listProfiles().catch(() => ({ profiles: [] }));
      const active: any = prof.profiles?.find((p: any) => p.is_active) || prof.profiles?.[0] || {};

      // Guard: user must have at least ONE target role and ONE usable location
      if (!Array.isArray(active.target_roles) || active.target_roles.length === 0) {
        Alert.alert(
          "No target roles",
          "Add at least one Target Role in the Filter Center before running Deep Search.",
        );
        setSearching(false);
        return;
      }

      // Industries fallback = enabled entries from the industries table
      const industriesFallback = (await jobsDeepApi.listIndustries()).industries
        .filter((i) => i.enabled).map((i) => i.label);

      const params = deriveDeepSearchParams(active, industriesFallback);

      if (!params.locations.length) {
        Alert.alert(
          "No searchable locations",
          "Add at least one City/State or Country location in the Filter Center. Pure 'Remote' or 'International Assignment' specials aren't searchable on their own — pair them with a real location or a work-type filter.",
        );
        setSearching(false);
        return;
      }

      // Priority employers = enabled Watch List names (if available)
      let priorityEmployers: string[] = [];
      try {
        const wl = await careerPrefsApi.listWatch();
        priorityEmployers = (wl.employers || [])
          .filter((e) => e && (e as any).priority !== "low")
          .map((e) => e.name).filter(Boolean).slice(0, 12);
      } catch {}

      console.log("[deep-search] filter criteria in use", {
        roles: params.target_roles,
        locations: params.locations,
        industries: params.industries.slice(0, 6),
        work_type_filter: params.work_type_filter,
        min_salary: params.min_salary,
      });

      const result = await jobsDeepApi.deepSearch({
        target_roles: params.target_roles,
        excluded_keywords: params.excluded_keywords,
        industries: params.industries,
        locations: params.locations,
        min_salary: params.min_salary,
        freshness,
        priority_employers: priorityEmployers,
        work_type_filter: params.work_type_filter,
      } as any);
      setMeta(result);
      await load();
      const sourceCount = Object.keys(result.counts || {}).filter((k) => (result.counts as any)[k] > 0).length;
      Alert.alert(
        "Search complete",
        `Filter: ${params.target_roles.length} roles · ${params.locations.length} locations · ${params.industries.length} sectors\n\nFound ${result.total_verified_active} verified jobs across ${sourceCount} sources.`,
      );
    } catch (e: any) {
      Alert.alert("Search failed", String(e?.message || e));
    } finally { setSearching(false); }
  }, [freshness, load]);

  const displayed: DeepSearchJob[] = feed.jobs || [];

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
          <JobCard
            key={j.job_id}
            job={j}
            onApply={() => setApplyJob(j)}
            onTailor={async () => {
              setTailoringJobId(j.job_id);
              try {
                // Live-fetch full JD from source URL (cached to DB)
                await jobsDeepApi.fetchFullDescription(j.job_id);
              } catch { /* silent — tailor-modal will still load via job_id */ }
              setTailoringJobId(null);
              // Pass job_id (snake_case) so tailor-modal picks it up correctly
              router.push({
                pathname: "/career/tailor-modal" as any,
                params: { job_id: j.job_id },
              });
            }}
            tailoringLoading={tailoringJobId === j.job_id}
          />
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
function JobCard({ job, onApply, onTailor, tailoringLoading }: {
  job: DeepSearchJob;
  onApply: () => void;
  onTailor: () => void;
  tailoringLoading?: boolean;
}) {
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
        {job.employer_verified && (
          <View style={cardStyles.employerVerifiedPill}>
            <ShieldCheck size={9} color="#10B981" />
            <Text style={cardStyles.employerVerifiedText}>VERIFIED</Text>
          </View>
        )}
      </View>
      {!!job.employer_address && (
        <View style={cardStyles.employerAddrRow}>
          <MapPin size={10} color={colors.textTertiary} />
          <Text style={cardStyles.employerAddrText} numberOfLines={2}>
            {job.employer_address}
          </Text>
        </View>
      )}

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

      <View style={cardStyles.actionRow}>
        <TouchableOpacity
          style={[cardStyles.applyBtn, cardStyles.applyBtnPrimary, { backgroundColor: applyBtnColor }]}
          onPress={onApply}
          disabled={job.apply_url_status >= 400}
          testID={`apply-${job.job_id}`}
        >
          <ExternalLink size={12} color="#fff" />
          <Text style={cardStyles.applyBtnText}>{applyBtnLabel}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[cardStyles.tailorBtn,
            (job as any).has_tailored_resume && cardStyles.tailorBtnDone]}
          onPress={onTailor}
          testID={`tailor-${job.job_id}`}
        >
          <Sparkles size={11} color={(job as any).has_tailored_resume ? "#10B981" : "#8B5CF6"} />
          <Text style={[cardStyles.tailorBtnText,
            (job as any).has_tailored_resume && { color: "#10B981" }]}>
            {(job as any).has_tailored_resume ? "Tailored ✓" : "Tailor Resume"}
          </Text>
        </TouchableOpacity>
      </View>
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
  employerVerifiedPill: {
    flexDirection: "row", alignItems: "center", gap: 2,
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    borderColor: "rgba(16, 185, 129, 0.5)",
    borderWidth: 1, borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  employerVerifiedText: {
    color: "#10B981", fontSize: 8, fontWeight: "800", letterSpacing: 0.4,
  },
  employerAddrRow: {
    flexDirection: "row", alignItems: "flex-start", gap: 4,
    marginTop: 3, marginLeft: 17, // aligns under employer name
  },
  employerAddrText: {
    color: colors.textTertiary, fontSize: 10, flex: 1, lineHeight: 13,
  },

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
  applyBtnPrimary: { flex: 1.4 },
  applyBtnText: { color: "#fff", fontSize: 12, fontWeight: "900" },
  actionRow: { flexDirection: "row", gap: 6 },
  tailorBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5,
    paddingVertical: 10, borderRadius: radius.sm,
    borderWidth: 1.5, borderColor: "#8B5CF6", backgroundColor: colors.surface,
  },
  tailorBtnDone: {
    borderColor: "#10B981", backgroundColor: "rgba(16,185,129,0.10)",
  },
  tailorBtnText: { color: "#8B5CF6", fontSize: 11, fontWeight: "800" },
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
