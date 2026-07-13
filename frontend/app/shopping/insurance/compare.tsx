// PLOS — Compare All Insurers
// Route: /shopping/insurance/compare?insurance_type=auto|home|bundle
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ArrowLeft, Trophy, Award, TrendingUp, ExternalLink } from "lucide-react-native";
import { colors, spacing, radius } from "@/src/lib/theme";
import { insuranceApi } from "@/src/lib/api";

export default function CompareAllScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ insurance_type?: string }>();
  const insType = (params.insurance_type === "home" || params.insurance_type === "bundle") ? params.insurance_type : "auto";
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [completeness, setCompleteness] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await insuranceApi.compareAll(insType as any);
      setRows(res.results || []);
      setSummary(res.summary || {});
      setCompleteness(res.profile_completeness || 0);
    } catch (e: any) {
      Alert.alert("Compare failed", String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, [insType]);

  useEffect(() => { load(); }, [load]);

  const openTop3 = () => {
    const top3 = rows.slice(0, 3);
    top3.forEach((r) => {
      if (r.quote_url) Linking.openURL(r.quote_url).catch(() => {});
    });
  };

  const badge = (row: any) => {
    if (row.quote_id === summary.best_price_id) return { label: "BEST PRICE", color: colors.success };
    if (row.quote_id === summary.best_value_id) return { label: "BEST VALUE", color: "#A855F7" };
    if (row.quote_id === summary.best_rated_id) return { label: "BEST RATED", color: colors.primaryGlow };
    return null;
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft color={colors.textPrimary} size={20} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Compare All Insurers</Text>
          <Text style={styles.headerSub}>{insType.toUpperCase()} · profile {completeness}% complete</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.primaryGlow} size="large" />
          <Text style={styles.loadingText}>Running Claude 4.5 quotes for all insurers...</Text>
          <Text style={styles.loadingSub}>This may take 30-60 seconds</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.tableHead}>
            <Text style={[styles.tableHeadCell, { flex: 2 }]}>Insurer</Text>
            <Text style={[styles.tableHeadCell, { flex: 1.4, textAlign: "right" }]}>Monthly</Text>
            <Text style={[styles.tableHeadCell, { flex: 0.6, textAlign: "right" }]}>AM</Text>
            <Text style={[styles.tableHeadCell, { flex: 0.6, textAlign: "right" }]}>Trust</Text>
          </View>
          {rows.map((r) => {
            const b = badge(r);
            return (
              <TouchableOpacity
                key={r.quote_id}
                style={[
                  styles.row,
                  b?.label === "BEST PRICE" && { borderColor: colors.success, backgroundColor: "rgba(16,185,129,0.08)" },
                  b?.label === "BEST RATED" && { borderColor: colors.primaryGlow, backgroundColor: "rgba(59,130,246,0.08)" },
                  b?.label === "BEST VALUE" && { borderColor: "#A855F7", backgroundColor: "rgba(168,85,247,0.08)" },
                ]}
                onPress={() => router.push({ pathname: "/shopping/insurance/quote/[qid]", params: { qid: r.quote_id } } as any)}
                testID={`compare-row-${r.quote_id}`}
              >
                <View style={{ flex: 2 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <View style={[styles.avatar, { backgroundColor: r.logo_color }]}><Text style={styles.avatarText}>{r.company_short}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.insurerName} numberOfLines={1}>{r.insurer_name}</Text>
                      {b && (
                        <View style={[styles.badge, { backgroundColor: b.color }]}>
                          <Text style={styles.badgeText}>{b.label}</Text>
                        </View>
                      )}
                      {r.military_only && !b && (
                        <View style={[styles.badge, { backgroundColor: "#003C71" }]}><Text style={styles.badgeText}>MIL/VET</Text></View>
                      )}
                    </View>
                  </View>
                </View>
                <View style={{ flex: 1.4, alignItems: "flex-end" }}>
                  <Text style={styles.monthlyText}>${r.monthly_low}–${r.monthly_high}</Text>
                  <Text style={styles.annualText}>${(r.annual_low || 0).toLocaleString()}–${(r.annual_high || 0).toLocaleString()}/yr</Text>
                </View>
                <View style={{ flex: 0.6, alignItems: "flex-end" }}>
                  <Text style={styles.amText}>{r.am_best_rating || "–"}</Text>
                </View>
                <View style={{ flex: 0.6, alignItems: "flex-end" }}>
                  <Text style={styles.trustText}>{r.trust_score}</Text>
                </View>
              </TouchableOpacity>
            );
          })}

          {rows.length >= 3 && (
            <TouchableOpacity style={styles.top3Btn} onPress={openTop3} testID="open-top3">
              <ExternalLink color="#fff" size={14} />
              <Text style={styles.top3BtnText}>Request Official Quotes from Top 3</Text>
            </TouchableOpacity>
          )}

          <View style={styles.disclaimer}>
            <Text style={styles.disclaimerText}>
              All estimates are AI-generated based on your profile. Actual quotes from each insurer may vary. Tap any row to see the full quote breakdown.
            </Text>
          </View>
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  backBtn: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.surfaceElevated, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700", textAlign: "center" },
  headerSub: { color: colors.textSecondary, fontSize: 11, textAlign: "center", marginTop: 2 },
  loadingBox: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 40 },
  loadingText: { color: colors.textPrimary, fontSize: 14, fontWeight: "600", textAlign: "center" },
  loadingSub: { color: colors.textSecondary, fontSize: 11 },
  scroll: { padding: spacing.lg, gap: 8 },
  tableHead: { flexDirection: "row", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle, gap: 6 },
  tableHeadCell: { color: colors.textSecondary, fontSize: 10, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
  row: { flexDirection: "row", padding: 10, backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.borderSubtle, gap: 6, alignItems: "center" },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontWeight: "800", fontSize: 11 },
  insurerName: { color: colors.textPrimary, fontWeight: "700", fontSize: 13 },
  badge: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3, marginTop: 3, alignSelf: "flex-start" },
  badgeText: { color: "#fff", fontSize: 8, fontWeight: "800", letterSpacing: 0.5 },
  monthlyText: { color: colors.success, fontWeight: "800", fontSize: 14 },
  annualText: { color: colors.textTertiary, fontSize: 9 },
  amText: { color: colors.textPrimary, fontWeight: "700", fontSize: 12 },
  trustText: { color: colors.primaryGlow, fontWeight: "800", fontSize: 12 },
  top3Btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 16, backgroundColor: colors.primaryGlow, paddingVertical: 12, borderRadius: 10 },
  top3BtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  disclaimer: { padding: 12, backgroundColor: colors.surfaceElevated, borderRadius: 8, marginTop: 12 },
  disclaimerText: { color: colors.textTertiary, fontSize: 10, lineHeight: 14 },
});
