// PLOS — Insurance Deals Shop
// Route: /shopping/insurance  (deep-linkable: ?tab=auto|home|bundle, ?type=bundle)
// Verified auto/home/bundle deals — no personal info collected.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Modal,
  Linking,
  Alert,
  Share,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  ArrowLeft,
  ShieldCheck,
  Shield,
  Phone,
  Globe,
  ExternalLink,
  MapPin,
  Filter as FilterIcon,
  RefreshCw,
  Info,
  Check,
  X,
  ChevronDown,
  Share2,
  Award,
  CircleDollarSign,
  ArrowDownRight,
  Minus,
  Sparkles,
  Calculator,
  UserCog,
  GitCompare,
  History,
} from "lucide-react-native";
import { colors, spacing, radius } from "@/src/lib/theme";
import { insuranceApi } from "@/src/lib/api";
import { openExternalUrl } from "@/src/lib/open-url";

// ------------------------- Types -------------------------
type InsType = "auto" | "home" | "bundle";
type SortKey = "best_deal" | "lowest_rate" | "highest_rated" | "most_recent";

interface Deal {
  id: string;
  company_name: string;
  company_short: string;
  logo_color: string;
  insurance_type: InsType;
  naic_number: string;
  georgia_license_number: string;
  am_best_rating?: string | null;
  bbb_rating?: string | null;
  trust_score: number;
  is_verified: boolean;
  physical_address: string;
  headquarters_address: string;
  georgia_office_address?: string | null;
  phone_number: string;
  phone_display: string;
  website_url: string;
  quote_url: string;
  find_agent_url?: string | null;
  monthly_rate_from: number;
  rate_description: string;
  coverage_highlights: string[];
  special_offer?: string | null;
  special_offer_type?: string | null;
  special_offer_expiry?: string | null;
  discounts_available?: string[];
  military_only?: boolean;
  rate_source?: string;
  last_verified: string;
  last_rate_update: string;
  georgia_avg_comparison: number;
  georgia_avg_label: string;
  bundle_partner?: string | null;
  bundle_savings_percent?: number | null;
  bundle_auto_from?: number | null;
  bundle_home_from?: number | null;
}

const DISCOUNT_OPTIONS = [
  "Good driver",
  "Multi-car",
  "Bundle discount",
  "Military",
  "Good student",
  "Home security",
  "Loyalty",
  "New customer offer",
];

const COVERAGE_OPTIONS = ["Basic", "Standard", "Comprehensive", "Premium"];

const AM_BEST_OPTIONS: { label: string; value: string }[] = [
  { label: "Any rating", value: "" },
  { label: "A- or better", value: "A-" },
  { label: "A or better", value: "A" },
  { label: "A+ or better", value: "A+" },
];

const SORT_OPTIONS: { label: string; value: SortKey }[] = [
  { label: "Best Deal", value: "best_deal" },
  { label: "Lowest Rate", value: "lowest_rate" },
  { label: "Highest Rated", value: "highest_rated" },
  { label: "Most Recent", value: "most_recent" },
];

// ------------------------- Helpers -------------------------
function daysAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!then || isNaN(then)) return "recently";
  const diff = Date.now() - then;
  const d = Math.max(0, Math.floor(diff / 86400000));
  if (d === 0) return "today";
  if (d === 1) return "1 day ago";
  return `${d} days ago`;
}

function formatUSDDecimal(n: number): string {
  return `$${(Math.round(n * 100) / 100).toFixed(0)}`;
}

// ------------------------- Screen -------------------------
export default function InsuranceDealsShop() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string; type?: string }>();

  // Initial tab from ?tab= or ?type=
  const initialTab = (() => {
    const t = String(params.tab || params.type || "").toLowerCase();
    if (t === "home" || t === "bundle" || t === "auto") return t as InsType;
    return "auto" as InsType;
  })();

  const [activeTab, setActiveTab] = useState<InsType>(initialTab);
  const [sort, setSort] = useState<SortKey>("best_deal");
  const [deals, setDeals] = useState<Deal[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [filterOpen, setFilterOpen] = useState(false);
  const [amBestMin, setAmBestMin] = useState<string>("");
  const [selDiscounts, setSelDiscounts] = useState<string[]>([]);
  const [minRate, setMinRate] = useState<number>(50);
  const [maxRate, setMaxRate] = useState<number>(400);
  const [nationwideMode, setNationwideMode] = useState<boolean>(false);

  // Sort dropdown
  const [sortOpen, setSortOpen] = useState(false);

  // Compare feature
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);

  // USAA modal
  const [usaaModal, setUsaaModal] = useState<{ open: boolean; deal?: Deal }>({ open: false });

  const load = useCallback(async () => {
    try {
      const type = activeTab;
      const res = await insuranceApi.list({
        insurance_type: type,
        sort,
        am_best_min: amBestMin || undefined,
        discounts: selDiscounts.length ? selDiscounts.join(",") : undefined,
        min_rate: minRate,
        max_rate: maxRate,
      });
      setDeals(res.deals || []);
      setLastUpdated(res.last_updated || "");
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.warn("[insurance] load failed:", e?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab, sort, amBestMin, selDiscounts, minRate, maxRate]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await insuranceApi.refresh();
    } catch (_e) {}
    await load();
  }, [load]);

  const applyFilters = () => setFilterOpen(false);

  const resetFilters = () => {
    setAmBestMin("");
    setSelDiscounts([]);
    setMinRate(50);
    setMaxRate(400);
    setNationwideMode(false);
    setFilterOpen(false);
  };

  const toggleDiscount = (d: string) => {
    setSelDiscounts((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  };

  const toggleCompare = (id: string) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) {
        Alert.alert("Compare limit", "You can compare up to 3 deals. Remove one first.");
        return prev;
      }
      return [...prev, id];
    });
  };

  const compareDeals = useMemo(() => deals.filter((d) => compareIds.includes(d.id)), [deals, compareIds]);

  // Actions
  const callInsurer = (deal: Deal) => {
    const url = `tel:${deal.phone_number}`;
    Linking.openURL(url).catch(() => Alert.alert("Unable to call", deal.phone_display));
  };

  const openWebsite = (deal: Deal) => {
    Linking.openURL(deal.website_url).catch(() => {});
  };

  const openQuote = (deal: Deal, target?: "auto" | "home") => {
    if (deal.military_only && !usaaModal.open) {
      setUsaaModal({ open: true, deal });
      return;
    }
    let url = deal.quote_url;
    if (target === "auto" && deal.insurance_type === "bundle") {
      // Bundle: use auto quote link based on company
      url = deal.website_url;
    } else if (target === "home" && deal.insurance_type === "bundle") {
      url = deal.quote_url;
    }
    Linking.openURL(url).catch(() => Alert.alert("Unable to open", url));
  };

  // Get My Quote — in-app quote generation
  const getMyQuote = (deal: Deal) => {
    router.push({
      pathname: "/shopping/insurance/quote/[qid]",
      params: {
        qid: "new",
        insurer_name: deal.company_name,
        insurance_type: deal.insurance_type,
        deal_id: deal.id,
      },
    } as any);
  };

  const openAgentMap = (deal: Deal) => {
    if (deal.find_agent_url) openExternalUrl(deal.find_agent_url);
  };

  const openGeneralAgentSearch = () => {
    openExternalUrl("https://www.google.com/maps/search/insurance+agent+near+Stone+Mountain+GA+30083");
  };

  const shareDeal = async (deal: Deal) => {
    try {
      await Share.share({
        message:
          `${deal.company_name} — from $${deal.monthly_rate_from}/mo (${deal.insurance_type}) — verified via PLOS\n` +
          `AM Best: ${deal.am_best_rating || "N/A"} · NAIC #${deal.naic_number}\n` +
          `Get a quote: ${deal.quote_url}`,
      });
    } catch (_e) {}
  };

  const shareComparison = async () => {
    if (!compareDeals.length) return;
    const lines = compareDeals.map(
      (d) => `${d.company_name}: $${d.monthly_rate_from}/mo · AM Best ${d.am_best_rating || "N/A"} · trust ${d.trust_score}`
    );
    try {
      await Share.share({
        message: `PLOS Insurance Comparison\n\n${lines.join("\n")}\n\nAll deals verified — no personal info required.`,
      });
    } catch (_e) {}
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} testID="insurance-back">
          <ArrowLeft color={colors.textPrimary} size={20} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={styles.headerTitle}>Insurance Deals Shop</Text>
          <Text style={styles.headerSub}>Verified rates from licensed insurers — updated {daysAgo(lastUpdated)}</Text>
        </View>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={onRefresh}
          testID="insurance-refresh"
          disabled={refreshing}
        >
          {refreshing ? (
            <ActivityIndicator color={colors.primaryGlow} size="small" />
          ) : (
            <RefreshCw color={colors.textSecondary} size={18} />
          )}
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabsRow}>
        {(["auto", "home", "bundle"] as InsType[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={styles.tabBtn}
            onPress={() => setActiveTab(t)}
            testID={`tab-${t}`}
          >
            <Text style={[styles.tabText, activeTab === t && styles.tabTextActive]}>
              {t === "auto" ? "Auto" : t === "home" ? "Home" : "Bundle"}
            </Text>
            {activeTab === t && <View style={styles.tabUnderline} />}
          </TouchableOpacity>
        ))}
      </View>

      {/* Sort + Filter row */}
      <View style={styles.controlsRow}>
        <TouchableOpacity style={styles.sortBtn} onPress={() => setSortOpen(true)} testID="sort-btn">
          <Text style={styles.controlText}>{SORT_OPTIONS.find((s) => s.value === sort)?.label}</Text>
          <ChevronDown color={colors.textSecondary} size={14} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterBtn, (selDiscounts.length > 0 || amBestMin) && styles.filterBtnActive]}
          onPress={() => setFilterOpen(true)}
          testID="filter-btn"
        >
          <FilterIcon color={colors.textSecondary} size={14} />
          <Text style={styles.controlText}>
            Filters{selDiscounts.length + (amBestMin ? 1 : 0) > 0 ? ` · ${selDiscounts.length + (amBestMin ? 1 : 0)}` : ""}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.filterBtn} onPress={openGeneralAgentSearch} testID="find-agent-general">
          <MapPin color={colors.success} size={14} />
          <Text style={[styles.controlText, { color: colors.success }]}>Find Agent</Text>
        </TouchableOpacity>
      </View>

      {/* Quote engine controls */}
      <View style={styles.controlsRow}>
        <TouchableOpacity
          style={[styles.filterBtn, { borderWidth: 1, borderColor: colors.primaryGlow, backgroundColor: "rgba(59,130,246,0.12)" }]}
          onPress={() => router.push("/shopping/insurance/profile" as any)}
          testID="profile-btn"
        >
          <UserCog color={colors.primaryGlow} size={14} />
          <Text style={[styles.controlText, { color: colors.primaryGlow }]}>My Quote Profile</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterBtn, { borderWidth: 1, borderColor: colors.success, backgroundColor: "rgba(16,185,129,0.12)" }]}
          onPress={() => router.push({ pathname: "/shopping/insurance/compare" as any, params: { insurance_type: activeTab } })}
          testID="compare-all-btn"
        >
          <GitCompare color={colors.success} size={14} />
          <Text style={[styles.controlText, { color: colors.success }]}>Compare All</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.filterBtn}
          onPress={() => router.push("/shopping/insurance/history" as any)}
          testID="history-btn"
        >
          <History color={colors.textSecondary} size={14} />
          <Text style={styles.controlText}>My Quotes</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primaryGlow} />}
        testID="insurance-scroll"
      >
        {/* Info banner — NO personal info */}
        <View style={styles.infoBanner} testID="info-banner">
          <Info color={colors.primaryGlow} size={16} />
          <Text style={styles.infoText}>
            <Text style={{ fontWeight: "700" }}>How this works: </Text>
            We find and verify the best insurance deals for you.{" "}
            <Text style={{ fontWeight: "700" }}>No personal information required here.</Text> Tap Get Quote to go directly to the insurer&apos;s secure website.
          </Text>
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.primaryGlow} />
            <Text style={styles.loadingText}>Loading verified deals…</Text>
          </View>
        ) : deals.length === 0 ? (
          <View style={styles.emptyBox}>
            <ShieldCheck color={colors.textTertiary} size={32} />
            <Text style={styles.emptyText}>No deals match your filters</Text>
            <TouchableOpacity onPress={resetFilters}>
              <Text style={styles.resetLink}>Reset filters</Text>
            </TouchableOpacity>
          </View>
        ) : (
          deals.map((deal) => (
            <DealCard
              key={deal.id}
              deal={deal}
              onCall={() => callInsurer(deal)}
              onWebsite={() => openWebsite(deal)}
              onQuote={() => openQuote(deal)}
              onQuoteAuto={() => openQuote(deal, "auto")}
              onQuoteHome={() => openQuote(deal, "home")}
              onGetMyQuote={() => getMyQuote(deal)}
              onAgent={() => openAgentMap(deal)}
              onShare={() => shareDeal(deal)}
              compared={compareIds.includes(deal.id)}
              onToggleCompare={() => toggleCompare(deal.id)}
            />
          ))
        )}

        {/* Footer disclaimer */}
        <View style={styles.disclaimer} testID="footer-disclaimer">
          <Text style={styles.disclaimerText}>
            Insurance rates vary by location, driving record, credit score, and other factors. Rates shown are
            advertised starting rates from verified licensed insurers. Contact the insurer directly for a
            personalized quote. PLOS does not sell insurance and receives no commission from any insurer.
          </Text>
        </View>
      </ScrollView>

      {/* Compare sticky bar */}
      {compareIds.length > 0 && (
        <View style={styles.compareBar} testID="compare-bar">
          <View style={styles.compareBadge}>
            <Text style={styles.compareBadgeText}>{compareIds.length}</Text>
          </View>
          <Text style={styles.compareBarText}>
            Comparing {compareIds.length} plan{compareIds.length > 1 ? "s" : ""}
          </Text>
          <TouchableOpacity style={styles.compareViewBtn} onPress={() => setCompareOpen(true)} testID="compare-view">
            <Text style={styles.compareViewText}>View comparison</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setCompareIds([])} style={styles.compareClearBtn}>
            <X color={colors.textSecondary} size={16} />
          </TouchableOpacity>
        </View>
      )}

      {/* Sort dropdown modal */}
      <Modal visible={sortOpen} transparent animationType="fade" onRequestClose={() => setSortOpen(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setSortOpen(false)}>
          <View style={styles.sortSheet}>
            <Text style={styles.sheetTitle}>Sort by</Text>
            {SORT_OPTIONS.map((o) => (
              <TouchableOpacity
                key={o.value}
                style={styles.sortOption}
                onPress={() => {
                  setSort(o.value);
                  setSortOpen(false);
                }}
              >
                <Text style={[styles.sortOptionText, sort === o.value && { color: colors.primaryGlow, fontWeight: "700" }]}>
                  {o.label}
                </Text>
                {sort === o.value && <Check color={colors.primaryGlow} size={16} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Filter bottom sheet */}
      <Modal visible={filterOpen} transparent animationType="slide" onRequestClose={() => setFilterOpen(false)}>
        <View style={styles.sheetOverlay}>
          <View style={styles.filterSheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Filters</Text>
              <TouchableOpacity onPress={() => setFilterOpen(false)}>
                <X color={colors.textSecondary} size={20} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 480 }}>
              <Text style={styles.filterLabel}>Company rating</Text>
              <View style={styles.pillRow}>
                {AM_BEST_OPTIONS.map((o) => (
                  <TouchableOpacity
                    key={o.value || "any"}
                    style={[styles.pill, amBestMin === o.value && styles.pillActive]}
                    onPress={() => setAmBestMin(o.value)}
                  >
                    <Text style={[styles.pillText, amBestMin === o.value && { color: "#fff" }]}>{o.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.filterLabel}>Special discounts</Text>
              <View style={styles.pillRow}>
                {DISCOUNT_OPTIONS.map((d) => (
                  <TouchableOpacity
                    key={d}
                    style={[styles.pill, selDiscounts.includes(d) && styles.pillActive]}
                    onPress={() => toggleDiscount(d)}
                  >
                    <Text style={[styles.pillText, selDiscounts.includes(d) && { color: "#fff" }]}>{d}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.filterLabel}>Coverage level (typical inclusions)</Text>
              <View style={styles.pillRow}>
                {COVERAGE_OPTIONS.map((c) => (
                  <View key={c} style={[styles.pill, { opacity: 0.75 }]}>
                    <Text style={styles.pillText}>{c}</Text>
                  </View>
                ))}
              </View>

              <Text style={styles.filterLabel}>
                Rate range ${minRate} – ${maxRate}/mo
              </Text>
              <View style={styles.rangeRow}>
                {[50, 75, 100, 150, 200, 300, 400].map((v) => (
                  <TouchableOpacity
                    key={`min-${v}`}
                    style={[styles.pill, minRate === v && styles.pillActive]}
                    onPress={() => setMinRate(v)}
                  >
                    <Text style={[styles.pillText, minRate === v && { color: "#fff" }]}>Min ${v}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.rangeRow}>
                {[100, 150, 200, 250, 300, 350, 400].map((v) => (
                  <TouchableOpacity
                    key={`max-${v}`}
                    style={[styles.pill, maxRate === v && styles.pillActive]}
                    onPress={() => setMaxRate(v)}
                  >
                    <Text style={[styles.pillText, maxRate === v && { color: "#fff" }]}>Max ${v}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.filterLabel}>Location</Text>
              <View style={styles.pillRow}>
                <TouchableOpacity
                  style={[styles.pill, !nationwideMode && styles.pillActive]}
                  onPress={() => setNationwideMode(false)}
                >
                  <Text style={[styles.pillText, !nationwideMode && { color: "#fff" }]}>Georgia (default)</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.pill, nationwideMode && styles.pillActive]}
                  onPress={() => setNationwideMode(true)}
                >
                  <Text style={[styles.pillText, nationwideMode && { color: "#fff" }]}>Nationwide</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>

            <View style={styles.sheetFooter}>
              <TouchableOpacity style={styles.resetBtn} onPress={resetFilters} testID="filter-reset">
                <Text style={styles.resetBtnText}>Reset All</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.applyBtn} onPress={applyFilters} testID="filter-apply">
                <Text style={styles.applyBtnText}>Apply Filters</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* USAA eligibility modal */}
      <Modal
        visible={usaaModal.open}
        transparent
        animationType="fade"
        onRequestClose={() => setUsaaModal({ open: false })}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.usaaSheet}>
            <Award color={colors.primaryGlow} size={28} />
            <Text style={styles.usaaTitle}>USAA — Military & Veteran Eligibility</Text>
            <Text style={styles.usaaText}>
              USAA is exclusively available to active military, veterans, National Guard, Reserve members, and their
              families. If you qualify, USAA consistently offers the lowest rates in Georgia.
            </Text>
            <TouchableOpacity
              style={[styles.usaaBtn, { backgroundColor: colors.primaryGlow }]}
              onPress={() => {
                const url = usaaModal.deal?.quote_url || "https://www.usaa.com";
                setUsaaModal({ open: false });
                Linking.openURL(url).catch(() => {});
              }}
              testID="usaa-qualify"
            >
              <Text style={styles.usaaBtnText}>I Qualify — Get Quote</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.usaaBtn, { backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.borderSubtle }]}
              onPress={() => setUsaaModal({ open: false })}
              testID="usaa-no-qualify"
            >
              <Text style={[styles.usaaBtnText, { color: colors.textPrimary }]}>I Don&apos;t Qualify — See Other Options</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Comparison modal */}
      <Modal visible={compareOpen} transparent animationType="slide" onRequestClose={() => setCompareOpen(false)}>
        <View style={styles.sheetOverlay}>
          <View style={styles.compareSheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Compare {compareDeals.length} plans</Text>
              <TouchableOpacity onPress={() => setCompareOpen(false)}>
                <X color={colors.textSecondary} size={20} />
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: "row", gap: 12, paddingRight: 16 }}>
                {compareDeals.map((d) => (
                  <View key={d.id} style={styles.compareCol}>
                    <View style={[styles.avatar, { backgroundColor: d.logo_color, marginBottom: 8 }]}>
                      <Text style={styles.avatarText}>{d.company_short}</Text>
                    </View>
                    <Text style={styles.compareName}>{d.company_name}</Text>
                    <Text style={styles.compareRate}>{formatUSDDecimal(d.monthly_rate_from)}/mo</Text>
                    <CompareRow label="AM Best" value={d.am_best_rating || "N/A"} />
                    <CompareRow label="BBB" value={d.bbb_rating || "N/A"} />
                    <CompareRow label="Trust score" value={String(d.trust_score)} />
                    <CompareRow label="NAIC" value={`#${d.naic_number}`} />
                    <CompareRow label="GA license" value={d.georgia_license_number} />
                    <CompareRow label="Phone" value={d.phone_display} />
                    <View style={styles.compareCoverage}>
                      {d.coverage_highlights.slice(0, 4).map((c) => (
                        <Text key={c} style={styles.compareCoverageItem}>
                          • {c}
                        </Text>
                      ))}
                    </View>
                    <TouchableOpacity style={styles.compareQuoteBtn} onPress={() => { setCompareOpen(false); openQuote(d); }}>
                      <Text style={styles.compareQuoteText}>Get Quote</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </ScrollView>
            <TouchableOpacity style={styles.shareCompareBtn} onPress={shareComparison}>
              <Share2 color={colors.textPrimary} size={16} />
              <Text style={styles.shareCompareText}>Share Comparison</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ------------------------- Sub-components -------------------------
function DealCard({
  deal,
  onCall,
  onWebsite,
  onQuote,
  onQuoteAuto,
  onQuoteHome,
  onGetMyQuote,
  onAgent,
  onShare,
  compared,
  onToggleCompare,
}: {
  deal: Deal;
  onCall: () => void;
  onWebsite: () => void;
  onQuote: () => void;
  onQuoteAuto: () => void;
  onQuoteHome: () => void;
  onGetMyQuote: () => void;
  onAgent: () => void;
  onShare: () => void;
  compared: boolean;
  onToggleCompare: () => void;
}) {
  const isBundle = deal.insurance_type === "bundle";
  const typeBadgeColor = isBundle ? "#A855F7" : deal.insurance_type === "auto" ? colors.primaryGlow : colors.success;

  return (
    <View style={styles.card} testID={`deal-card-${deal.id}`}>
      {/* Top row */}
      <View style={styles.topRow}>
        <View style={[styles.avatar, { backgroundColor: deal.logo_color }]}>
          <Text style={styles.avatarText}>{deal.company_short}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <Text style={styles.companyName}>{deal.company_name}</Text>
            {deal.is_verified && (
              <View style={styles.verifiedShield}>
                <ShieldCheck color="#fff" size={10} />
                <Text style={styles.verifiedShieldText}>VERIFIED</Text>
              </View>
            )}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
            <View style={[styles.typeBadge, { backgroundColor: typeBadgeColor + "30", borderColor: typeBadgeColor }]}>
              <Text style={[styles.typeBadgeText, { color: typeBadgeColor }]}>
                {isBundle ? "AUTO + HOME BUNDLE" : deal.insurance_type.toUpperCase()}
              </Text>
            </View>
            {deal.am_best_rating && (
              <View style={styles.amBestBadge}>
                <Award color={colors.warning} size={10} />
                <Text style={styles.amBestText}>AM Best {deal.am_best_rating}</Text>
              </View>
            )}
            {deal.military_only && (
              <View style={[styles.milBadge]}>
                <Text style={styles.milBadgeText}>MILITARY / VET</Text>
              </View>
            )}
          </View>
        </View>
        {/* Trust shield */}
        <View style={[
          styles.trustShield,
          { backgroundColor: deal.trust_score >= 90 ? "rgba(16,185,129,0.18)" : "rgba(59,130,246,0.18)",
            borderColor: deal.trust_score >= 90 ? colors.success : colors.primaryGlow,
          },
        ]}>
          <Shield color={deal.trust_score >= 90 ? colors.success : colors.primaryGlow} size={14} />
          <Text style={[styles.trustText, { color: deal.trust_score >= 90 ? colors.success : colors.primaryGlow }]}>
            {deal.trust_score}
          </Text>
        </View>
      </View>

      {/* Rate row */}
      <View style={styles.rateRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rateBig}>From {formatUSDDecimal(deal.monthly_rate_from)}/mo</Text>
          <Text style={styles.rateSub}>{deal.rate_description}</Text>
          <View style={styles.gaCompareRow}>
            {deal.georgia_avg_comparison < -5 ? (
              <ArrowDownRight color={colors.success} size={12} />
            ) : (
              <Minus color={colors.textTertiary} size={12} />
            )}
            <Text style={[
              styles.gaCompareText,
              { color: deal.georgia_avg_comparison < -5 ? colors.success : colors.textSecondary },
            ]}>
              {deal.georgia_avg_label}
            </Text>
          </View>
        </View>
        {isBundle && deal.bundle_auto_from && deal.bundle_home_from ? (
          <View style={styles.bundleBreakdown}>
            <Text style={styles.bundleBreakdownLbl}>Individual</Text>
            <Text style={styles.bundleBreakdownVal}>Auto: ${deal.bundle_auto_from}/mo</Text>
            <Text style={styles.bundleBreakdownVal}>Home: ${deal.bundle_home_from}/mo</Text>
            {deal.bundle_savings_percent && (
              <View style={styles.savingsBadge}>
                <Text style={styles.savingsBadgeText}>SAVE {deal.bundle_savings_percent}%</Text>
              </View>
            )}
          </View>
        ) : null}
      </View>

      {/* Coverage highlights */}
      <View style={styles.coverageBox}>
        {deal.coverage_highlights.map((c) => (
          <View key={c} style={styles.coverageItem}>
            <Check color={colors.success} size={12} />
            <Text style={styles.coverageText}>{c}</Text>
          </View>
        ))}
      </View>

      {/* Special offer */}
      {deal.special_offer && (
        <View style={styles.offerBox}>
          {deal.special_offer_type && (
            <View style={styles.offerBadge}>
              <Sparkles color={colors.warning} size={10} />
              <Text style={styles.offerBadgeText}>{deal.special_offer_type}</Text>
            </View>
          )}
          <Text style={styles.offerText}>{deal.special_offer}</Text>
        </View>
      )}

      {/* Verification row */}
      <View style={styles.verifBox}>
        <View style={styles.verifRow}>
          <MapPin color={colors.textTertiary} size={11} />
          <Text style={styles.verifText}>{deal.georgia_office_address || deal.headquarters_address}</Text>
        </View>
        <View style={styles.verifRow}>
          <Shield color={colors.textTertiary} size={11} />
          <Text style={styles.verifText}>
            Licensed in GA · #{deal.georgia_license_number} · NAIC #{deal.naic_number}
          </Text>
        </View>
        {deal.bbb_rating && (
          <View style={styles.verifRow}>
            <Award color={colors.textTertiary} size={11} />
            <Text style={styles.verifText}>BBB rating: {deal.bbb_rating}</Text>
          </View>
        )}
      </View>

      {/* Contact row */}
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.smallBtn} onPress={onCall} testID={`call-${deal.id}`}>
          <Phone color={colors.success} size={14} />
          <Text style={styles.smallBtnText}>{deal.phone_display}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.smallBtn} onPress={onWebsite} testID={`website-${deal.id}`}>
          <Globe color={colors.primaryGlow} size={14} />
          <Text style={styles.smallBtnText}>Website</Text>
        </TouchableOpacity>
      </View>

      {isBundle ? (
        <>
          <TouchableOpacity style={[styles.quoteBtn, { backgroundColor: colors.primaryGlow }]} onPress={onGetMyQuote} testID={`get-my-quote-${deal.id}`}>
            <Calculator color="#fff" size={14} />
            <Text style={styles.quoteBtnText}>Get My Quote</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity style={[styles.smallBtn, { flex: 1 }]} onPress={onQuoteAuto} testID={`quote-auto-${deal.id}`}>
              <ExternalLink color={colors.primaryGlow} size={14} />
              <Text style={styles.smallBtnText}>Auto Website</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.smallBtn, { flex: 1 }]} onPress={onQuoteHome} testID={`quote-home-${deal.id}`}>
              <ExternalLink color={colors.success} size={14} />
              <Text style={styles.smallBtnText}>Home Website</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <>
          <TouchableOpacity style={styles.quoteBtn} onPress={onGetMyQuote} testID={`get-my-quote-${deal.id}`}>
            <Calculator color="#fff" size={14} />
            <Text style={styles.quoteBtnText}>Get My Quote</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.smallBtn} onPress={onQuote} testID={`visit-website-${deal.id}`}>
            <ExternalLink color={colors.textPrimary} size={12} />
            <Text style={styles.smallBtnText}>Visit Website for Direct Quote</Text>
          </TouchableOpacity>
        </>
      )}

      <View style={styles.secondaryRow}>
        <TouchableOpacity style={styles.linkBtn} onPress={onAgent} testID={`agent-${deal.id}`}>
          <MapPin color={colors.textSecondary} size={12} />
          <Text style={styles.linkBtnText}>Find Local Agent</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.linkBtn, compared && { backgroundColor: "rgba(59,130,246,0.18)" }]}
          onPress={onToggleCompare}
          testID={`compare-${deal.id}`}
        >
          <CircleDollarSign color={compared ? colors.primaryGlow : colors.textSecondary} size={12} />
          <Text style={[styles.linkBtnText, compared && { color: colors.primaryGlow, fontWeight: "700" }]}>
            {compared ? "Comparing" : "Compare"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkBtn} onPress={onShare}>
          <Share2 color={colors.textSecondary} size={12} />
          <Text style={styles.linkBtnText}>Share</Text>
        </TouchableOpacity>
      </View>

      {/* Footer meta */}
      <View style={styles.metaRow}>
        <Text style={styles.metaText}>Last verified {daysAgo(deal.last_verified)}</Text>
        <Text style={styles.metaText}>Source: {deal.rate_source || "Insurer rates"}</Text>
      </View>
    </View>
  );
}

function CompareRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.compareRow}>
      <Text style={styles.compareRowLbl}>{label}</Text>
      <Text style={styles.compareRowVal}>{value}</Text>
    </View>
  );
}

// ------------------------- Styles -------------------------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: 8,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: "700" },
  headerSub: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  tabsRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    paddingHorizontal: spacing.lg,
  },
  tabBtn: { paddingVertical: 12, paddingHorizontal: 16, marginRight: 8, alignItems: "center" },
  tabText: { color: colors.textSecondary, fontSize: 14, fontWeight: "600" },
  tabTextActive: { color: colors.textPrimary, fontWeight: "700" },
  tabUnderline: { height: 3, backgroundColor: colors.primaryGlow, marginTop: 8, width: "100%", borderRadius: 2 },
  controlsRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  sortBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.surfaceElevated,
  },
  filterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.surfaceElevated,
  },
  filterBtnActive: { borderWidth: 1, borderColor: colors.primaryGlow },
  controlText: { color: colors.textPrimary, fontSize: 12, fontWeight: "600" },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: 120 },
  infoBanner: {
    flexDirection: "row",
    gap: 8,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: "rgba(59,130,246,0.08)",
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.25)",
    alignItems: "flex-start",
  },
  infoText: { color: colors.textPrimary, fontSize: 12, flex: 1, lineHeight: 17 },
  loadingBox: { alignItems: "center", padding: 40, gap: 12 },
  loadingText: { color: colors.textSecondary, fontSize: 13 },
  emptyBox: { alignItems: "center", padding: 40, gap: 10 },
  emptyText: { color: colors.textSecondary, fontSize: 14 },
  resetLink: { color: colors.primaryGlow, fontSize: 13, fontWeight: "600" },
  // -------- Deal Card --------
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 10,
  },
  topRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  companyName: { color: colors.textPrimary, fontSize: 15, fontWeight: "700" },
  verifiedShield: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: colors.success,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  verifiedShieldText: { color: "#fff", fontSize: 8, fontWeight: "800", letterSpacing: 0.5 },
  typeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1 },
  typeBadgeText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.6 },
  amBestBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(245,158,11,0.15)",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  amBestText: { color: colors.warning, fontSize: 9, fontWeight: "700" },
  milBadge: {
    backgroundColor: "rgba(0,60,113,0.5)",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  milBadgeText: { color: "#fff", fontSize: 9, fontWeight: "700" },
  trustShield: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  trustText: { fontSize: 12, fontWeight: "800" },
  rateRow: { flexDirection: "row", gap: 10 },
  rateBig: { color: colors.success, fontSize: 22, fontWeight: "800" },
  rateSub: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  gaCompareRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  gaCompareText: { fontSize: 11, fontWeight: "600" },
  bundleBreakdown: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: "rgba(168,85,247,0.12)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.35)",
    minWidth: 130,
  },
  bundleBreakdownLbl: { color: "#A855F7", fontSize: 9, fontWeight: "800", letterSpacing: 0.6 },
  bundleBreakdownVal: { color: colors.textPrimary, fontSize: 11, fontWeight: "600", marginTop: 2 },
  savingsBadge: { backgroundColor: colors.warning, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, marginTop: 6, alignSelf: "flex-start" },
  savingsBadgeText: { color: "#000", fontSize: 9, fontWeight: "800" },
  coverageBox: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    padding: 8,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 8,
  },
  coverageItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  coverageText: { color: colors.textSecondary, fontSize: 11 },
  offerBox: {
    padding: 10,
    backgroundColor: "rgba(245,158,11,0.08)",
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.3)",
    borderRadius: 8,
    gap: 6,
  },
  offerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: colors.warning,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: "flex-start",
  },
  offerBadgeText: { color: "#000", fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  offerText: { color: colors.textPrimary, fontSize: 12 },
  verifBox: {
    padding: 10,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 8,
    gap: 5,
  },
  verifRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  verifText: { color: colors.textSecondary, fontSize: 10, flex: 1, lineHeight: 14 },
  actionRow: { flexDirection: "row", gap: 8 },
  smallBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  smallBtnText: { color: colors.textPrimary, fontSize: 12, fontWeight: "600" },
  quoteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: colors.primaryGlow,
  },
  quoteBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  secondaryRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  linkBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: colors.surfaceElevated,
  },
  linkBtnText: { color: colors.textSecondary, fontSize: 11 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  metaText: { color: colors.textTertiary, fontSize: 10 },
  // -------- Footer disclaimer --------
  disclaimer: { padding: 12, backgroundColor: colors.surfaceElevated, borderRadius: 8, marginTop: 10 },
  disclaimerText: { color: colors.textTertiary, fontSize: 10, lineHeight: 14 },
  // -------- Compare sticky bar --------
  compareBar: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surfaceElevated,
    padding: 10,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primaryGlow,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  compareBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primaryGlow,
    alignItems: "center",
    justifyContent: "center",
  },
  compareBadgeText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  compareBarText: { color: colors.textPrimary, fontSize: 12, flex: 1 },
  compareViewBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: colors.primaryGlow,
  },
  compareViewText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  compareClearBtn: { padding: 4 },
  // -------- Sort/Filter modals --------
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "center", padding: 24 },
  sheetOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sortSheet: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sheetTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  sortOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  sortOptionText: { color: colors.textPrimary, fontSize: 14 },
  filterSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.lg,
    maxHeight: "88%",
  },
  filterLabel: { color: colors.textPrimary, fontSize: 12, fontWeight: "700", marginTop: 14, marginBottom: 6, letterSpacing: 0.4, textTransform: "uppercase" },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  rangeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  pillActive: { backgroundColor: colors.primaryGlow, borderColor: colors.primaryGlow },
  pillText: { color: colors.textSecondary, fontSize: 11, fontWeight: "600" },
  sheetFooter: { flexDirection: "row", gap: 10, marginTop: 16 },
  resetBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: colors.surfaceElevated,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  resetBtnText: { color: colors.textPrimary, fontWeight: "600" },
  applyBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: colors.primaryGlow,
    alignItems: "center",
  },
  applyBtnText: { color: "#fff", fontWeight: "700" },
  // -------- USAA modal --------
  usaaSheet: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  usaaTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  usaaText: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  usaaBtn: { paddingVertical: 12, borderRadius: 8, alignItems: "center", marginTop: 4 },
  usaaBtnText: { color: "#fff", fontWeight: "700" },
  // -------- Compare sheet --------
  compareSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.lg,
    maxHeight: "80%",
  },
  compareCol: {
    width: 180,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  compareName: { color: colors.textPrimary, fontSize: 13, fontWeight: "700" },
  compareRate: { color: colors.success, fontSize: 18, fontWeight: "800", marginTop: 4, marginBottom: 8 },
  compareRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  compareRowLbl: { color: colors.textTertiary, fontSize: 10 },
  compareRowVal: { color: colors.textPrimary, fontSize: 10, fontWeight: "600", maxWidth: 100, textAlign: "right" },
  compareCoverage: { marginTop: 8, gap: 3 },
  compareCoverageItem: { color: colors.textSecondary, fontSize: 10 },
  compareQuoteBtn: { marginTop: 10, paddingVertical: 8, backgroundColor: colors.primaryGlow, borderRadius: 6, alignItems: "center" },
  compareQuoteText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  shareCompareBtn: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6, marginTop: 16, paddingVertical: 12, borderRadius: 8, backgroundColor: colors.surfaceElevated },
  shareCompareText: { color: colors.textPrimary, fontWeight: "700" },
});
