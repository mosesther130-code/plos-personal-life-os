// PLOS — Quote Result Screen
// Route: /shopping/insurance/quote/[qid]
// When qid == "new", generates a fresh quote using params.insurer_name + insurance_type + deal_id.
// Otherwise, loads a saved quote from history.
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  Share,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  ArrowLeft,
  ExternalLink,
  Save,
  Share2,
  GitCompare,
  Info,
  ArrowUp,
  ArrowDown,
  DollarSign,
  Sparkles,
  MapPin,
  Award,
  ShieldCheck,
} from "lucide-react-native";
import { colors, spacing, radius } from "@/src/lib/theme";
import { insuranceApi } from "@/src/lib/api";

const GA_AUTO_AVG = 142;
const GA_HOME_AVG = 167;
const GA_BUNDLE_AVG = 276;

export default function QuoteResultScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ qid: string; insurer_name?: string; insurance_type?: string; deal_id?: string }>();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (params.qid && params.qid !== "new") {
        // Load saved quote
        const doc = await insuranceApi.getQuote(String(params.qid));
        setData({
          insurer_name: doc.insurer_name,
          insurance_type: doc.insurance_type,
          quote: doc.quote_data,
          deal: doc.deal_snapshot,
          profile_completeness: doc.profile_completeness,
          generated_at: doc.generated_at,
          quote_id: doc.id,
          missing_important: [],
        });
        setSaved(true);
      } else {
        // Generate fresh quote
        const insurer = String(params.insurer_name || "");
        const ins_type = String(params.insurance_type || "auto");
        const deal_id = params.deal_id ? String(params.deal_id) : undefined;
        if (!insurer) {
          throw new Error("Missing insurer name");
        }
        const res = await insuranceApi.generateQuote(insurer, ins_type, deal_id);
        setData(res);
        setSaved(true); // auto-persisted server-side
      }
    } catch (e: any) {
      Alert.alert("Quote failed", String(e?.message || e));
      router.back();
    } finally {
      setLoading(false);
    }
  }, [params.qid, params.insurer_name, params.insurance_type, params.deal_id, router]);

  useEffect(() => { load(); }, [load]);

  if (loading || !data) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Header title="Generating quote..." onBack={() => router.back()} />
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.primaryGlow} size="large" />
          <Text style={styles.loadingText}>Claude 4.5 is analyzing your profile...</Text>
          <Text style={styles.loadingSub}>Applying Georgia-specific rating factors</Text>
        </View>
      </SafeAreaView>
    );
  }

  const q = data.quote;
  const deal = data.deal || {};
  const isMulti = false;
  const avg = data.insurance_type === "auto" ? GA_AUTO_AVG : data.insurance_type === "home" ? GA_HOME_AVG : GA_BUNDLE_AVG;
  const midpoint = (q.estimated_monthly_low + q.estimated_monthly_high) / 2;
  const gaPct = Math.round(((midpoint - avg) / avg) * 100);
  const confidenceColor = q.confidence_level === "high" ? colors.success : q.confidence_level === "medium" ? colors.warning : "#F97316";

  const openOfficialQuote = () => {
    const url = deal?.quote_url;
    if (!url) return Alert.alert("Missing URL", "No quote URL for this insurer");
    Linking.openURL(url).catch(() => {});
  };

  const shareEstimate = async () => {
    try {
      await Share.share({
        message: `PLOS Quote Estimate — ${data.insurer_name} (${data.insurance_type})\n\nEstimated: $${q.estimated_monthly_low} – $${q.estimated_monthly_high}/month\nAnnual: $${q.estimated_annual_low} – $${q.estimated_annual_high}\nConfidence: ${q.confidence_level}\n\nThis is an AI estimate — official quote may vary. Verified insurer info via PLOS.`,
      });
    } catch (_e) {}
  };

  const openCompareBundle = () => {
    router.push({ pathname: "/shopping/insurance/compare" as any, params: { insurance_type: "bundle" } });
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Header title={data.insurer_name} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* AI-Estimated badge */}
        <View style={styles.aiBadgeRow}>
          <View style={styles.aiBadge}>
            <Sparkles color="#000" size={11} />
            <Text style={styles.aiBadgeText}>AI-ESTIMATED QUOTE</Text>
          </View>
          <Text style={styles.timestamp}>Generated just now</Text>
        </View>

        {/* Premium card */}
        <View style={styles.premiumCard}>
          <Text style={styles.premiumLabel}>Estimated monthly premium</Text>
          <Text style={styles.premiumBig}>
            ${q.estimated_monthly_low} – ${q.estimated_monthly_high}<Text style={styles.premiumUnit}>/mo</Text>
          </Text>
          <Text style={styles.premiumAnnual}>
            (${q.estimated_annual_low.toLocaleString()} – ${q.estimated_annual_high.toLocaleString()}/year)
          </Text>
          <View style={styles.confidenceRow}>
            <View style={[styles.confidencePill, { backgroundColor: confidenceColor + "30", borderColor: confidenceColor }]}>
              <Text style={[styles.confidenceText, { color: confidenceColor }]}>
                {q.confidence_level.toUpperCase()} CONFIDENCE
              </Text>
            </View>
            <Text style={styles.gaCompare}>
              {gaPct > 0 ? `${gaPct}% above` : `${Math.abs(gaPct)}% below`} GA avg (${avg}/mo)
            </Text>
          </View>
        </View>

        {/* Profile completeness nudge */}
        {data.profile_completeness < 80 && (
          <TouchableOpacity
            style={styles.nudge}
            onPress={() => router.push("/shopping/insurance/profile" as any)}
            testID="profile-nudge"
          >
            <Info color={colors.warning} size={14} />
            <Text style={styles.nudgeText}>
              Profile is <Text style={{ fontWeight: "700" }}>{data.profile_completeness}% complete</Text> — add{" "}
              {data.missing_important?.[0]?.label ? (
                <Text style={{ fontWeight: "700" }}>{data.missing_important[0].label.toLowerCase()}</Text>
              ) : (
                "more details"
              )}{" "}
              to improve accuracy
            </Text>
          </TouchableOpacity>
        )}

        {/* Factors */}
        <Text style={styles.h2}>What affects your rate</Text>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={styles.factorsCol}>
            <View style={styles.factorsHead}>
              <ArrowUp color={colors.danger} size={12} />
              <Text style={[styles.factorsHeadText, { color: colors.danger }]}>Increasing rate</Text>
            </View>
            {(q.key_factors_increasing_premium || []).map((f: string, i: number) => (
              <Text key={i} style={styles.factorItem}>• {f}</Text>
            ))}
          </View>
          <View style={styles.factorsCol}>
            <View style={styles.factorsHead}>
              <ArrowDown color={colors.success} size={12} />
              <Text style={[styles.factorsHeadText, { color: colors.success }]}>Lowering rate</Text>
            </View>
            {(q.key_factors_decreasing_premium || []).map((f: string, i: number) => (
              <Text key={i} style={styles.factorItem}>• {f}</Text>
            ))}
          </View>
        </View>

        {/* Discounts */}
        {q.potential_discounts_available?.length > 0 && (
          <>
            <Text style={styles.h2}>Discounts you may qualify for</Text>
            <View style={styles.discountsBox}>
              {q.potential_discounts_available.map((d: any, i: number) => (
                <View key={i} style={styles.discountRow}>
                  <DollarSign color={colors.success} size={13} />
                  <Text style={styles.discountName}>{d.name}</Text>
                  <Text style={styles.discountSave}>Save ~${d.estimated_monthly_savings}/mo</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Coverage summary */}
        {q.coverage_summary?.length > 0 && (
          <>
            <Text style={styles.h2}>What&apos;s included at this rate</Text>
            <View style={styles.coverageBox}>
              {q.coverage_summary.map((c: string, i: number) => (
                <Text key={i} style={styles.coverageItem}>• {c}</Text>
              ))}
            </View>
          </>
        )}

        {/* Georgia specific */}
        {q.georgia_specific_factors?.length > 0 && (
          <>
            <View style={styles.gaTitleRow}>
              <MapPin color={colors.warning} size={14} />
              <Text style={styles.h2Inline}>Georgia rate factors</Text>
            </View>
            <View style={styles.gaBox}>
              {q.georgia_specific_factors.map((f: string, i: number) => (
                <Text key={i} style={styles.gaItem}>🏛 {f}</Text>
              ))}
            </View>
          </>
        )}

        {/* Recommendation */}
        {q.recommendation && (
          <View style={styles.recBox}>
            <Award color={colors.primaryGlow} size={14} />
            <Text style={styles.recText}>{q.recommendation}</Text>
          </View>
        )}

        {/* Bundle cross-sell (auto only) */}
        {data.insurance_type === "auto" && (
          <TouchableOpacity style={styles.bundleCross} onPress={openCompareBundle} testID="bundle-cross-sell">
            <Text style={styles.bundleCrossTitle}>💰 Add home insurance to save more</Text>
            <Text style={styles.bundleCrossSub}>
              Adding a home policy with {data.insurer_name} could save you an estimated $
              {Math.round(q.estimated_monthly_high * 0.15)}/month on your auto policy. Tap to see bundle estimates.
            </Text>
          </TouchableOpacity>
        )}

        {/* Action buttons */}
        <TouchableOpacity style={styles.primaryBtn} onPress={openOfficialQuote} testID="official-quote-btn">
          <ExternalLink color="#fff" size={14} />
          <Text style={styles.primaryBtnText}>Get Official Quote from {data.insurer_name}</Text>
        </TouchableOpacity>
        <Text style={styles.actionNote}>
          Your estimated range is ${q.estimated_monthly_low}–${q.estimated_monthly_high}/month. The official quote will give you an exact binding price.
        </Text>

        <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => router.push({ pathname: "/shopping/insurance/compare" as any, params: { insurance_type: data.insurance_type } })}
            testID="compare-btn"
          >
            <GitCompare color={colors.primaryGlow} size={14} />
            <Text style={styles.secondaryBtnText}>Compare Insurers</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={shareEstimate} testID="share-btn">
            <Share2 color={colors.primaryGlow} size={14} />
            <Text style={styles.secondaryBtnText}>Share Estimate</Text>
          </TouchableOpacity>
        </View>

        {saved && (
          <View style={styles.savedRow}>
            <Save color={colors.success} size={12} />
            <Text style={styles.savedText}>Estimate saved to My Quotes</Text>
          </View>
        )}

        {/* Disclaimer */}
        <View style={styles.disclaimer}>
          <Text style={styles.disclaimerText}>
            This is an AI-generated estimate based on publicly available rate information and your provided details. It is <Text style={{ fontWeight: "700" }}>not a binding insurance quote</Text>. Actual premiums from {data.insurer_name} may vary based on additional underwriting factors, your specific driving record, credit report, and other information the insurer collects directly. Always get an official quote from the insurer before making any insurance decision.
          </Text>
          {q.accuracy_note && (
            <Text style={[styles.disclaimerText, { marginTop: 8 }]}>
              <Text style={{ fontWeight: "700" }}>Accuracy note: </Text>{q.accuracy_note}
            </Text>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity style={styles.backBtn} onPress={onBack}>
        <ArrowLeft color={colors.textPrimary} size={20} />
      </TouchableOpacity>
      <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
      <View style={{ width: 36 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  backBtn: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.surfaceElevated, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700", flex: 1, textAlign: "center" },
  scroll: { padding: spacing.lg, gap: 10 },
  loadingBox: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 40 },
  loadingText: { color: colors.textPrimary, fontSize: 14, fontWeight: "600" },
  loadingSub: { color: colors.textSecondary, fontSize: 12 },
  aiBadgeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  aiBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.warning, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  aiBadgeText: { color: "#000", fontSize: 9, fontWeight: "800", letterSpacing: 0.6 },
  timestamp: { color: colors.textTertiary, fontSize: 11 },
  premiumCard: { padding: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: radius.lg, gap: 4 },
  premiumLabel: { color: colors.textSecondary, fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase" },
  premiumBig: { color: colors.success, fontSize: 30, fontWeight: "800" },
  premiumUnit: { fontSize: 16, color: colors.textSecondary, fontWeight: "600" },
  premiumAnnual: { color: colors.textSecondary, fontSize: 13 },
  confidenceRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" },
  confidencePill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, borderWidth: 1 },
  confidenceText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  gaCompare: { color: colors.textSecondary, fontSize: 11 },
  nudge: { flexDirection: "row", alignItems: "flex-start", gap: 6, padding: 10, backgroundColor: "rgba(245,158,11,0.1)", borderRadius: 8, borderWidth: 1, borderColor: "rgba(245,158,11,0.3)" },
  nudgeText: { color: colors.textPrimary, fontSize: 11, flex: 1, lineHeight: 15 },
  h2: { color: colors.textPrimary, fontSize: 13, fontWeight: "700", marginTop: 8, letterSpacing: 0.3 },
  h2Inline: { color: colors.textPrimary, fontSize: 13, fontWeight: "700" },
  factorsCol: { flex: 1, padding: 10, backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.borderSubtle, gap: 4 },
  factorsHead: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 },
  factorsHeadText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.4 },
  factorItem: { color: colors.textSecondary, fontSize: 11, lineHeight: 15 },
  discountsBox: { padding: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: 8, gap: 6 },
  discountRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  discountName: { color: colors.textPrimary, fontSize: 12, flex: 1 },
  discountSave: { color: colors.success, fontSize: 11, fontWeight: "700" },
  coverageBox: { padding: 10, backgroundColor: colors.surfaceElevated, borderRadius: 8, gap: 3 },
  coverageItem: { color: colors.textSecondary, fontSize: 11 },
  gaTitleRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  gaBox: { padding: 10, backgroundColor: "rgba(245,158,11,0.06)", borderRadius: 8, borderWidth: 1, borderColor: "rgba(245,158,11,0.2)", gap: 4 },
  gaItem: { color: colors.textPrimary, fontSize: 11, lineHeight: 15 },
  recBox: { flexDirection: "row", gap: 8, padding: 12, backgroundColor: "rgba(59,130,246,0.08)", borderRadius: 8, borderWidth: 1, borderColor: "rgba(59,130,246,0.25)" },
  recText: { color: colors.textPrimary, fontSize: 12, flex: 1, lineHeight: 16, fontStyle: "italic" },
  bundleCross: { padding: 12, backgroundColor: "rgba(168,85,247,0.1)", borderRadius: 8, borderWidth: 1, borderColor: "rgba(168,85,247,0.3)", marginTop: 4 },
  bundleCrossTitle: { color: "#A855F7", fontWeight: "700", fontSize: 13 },
  bundleCrossSub: { color: colors.textSecondary, fontSize: 11, marginTop: 4, lineHeight: 15 },
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.primaryGlow, paddingVertical: 14, borderRadius: 10, marginTop: 10 },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  actionNote: { color: colors.textTertiary, fontSize: 11, textAlign: "center", marginTop: 4 },
  secondaryBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.surfaceElevated, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.borderSubtle },
  secondaryBtnText: { color: colors.textPrimary, fontWeight: "700", fontSize: 12 },
  savedRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, marginTop: 8 },
  savedText: { color: colors.success, fontSize: 11 },
  disclaimer: { padding: 12, backgroundColor: colors.surfaceElevated, borderRadius: 8, marginTop: 16 },
  disclaimerText: { color: colors.textTertiary, fontSize: 10, lineHeight: 14 },
});
