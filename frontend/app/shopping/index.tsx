// Shopping hub — routes to Deals, Utilities, Registered Products.
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { ArrowLeft, Tag, Zap, Package, ChevronRight, Wallet, Sparkles, ShieldCheck } from "lucide-react-native";
import { colors, spacing, radius } from "@/src/lib/theme";
import { shoppingApi } from "@/src/lib/api";

const fmtUSD = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export default function ShoppingHub() {
  const router = useRouter();
  const [summary, setSummary] = useState<{ deals: number; savings: number; products: number }>({ deals: 0, savings: 0, products: 0 });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, p] = await Promise.all([shoppingApi.deals(), shoppingApi.registered()]);
      setSummary({
        deals: d?.deals?.length || 0,
        savings: d?.total_savings_this_month || 0,
        products: p?.products?.length || 0,
      });
    } catch (_e) {}
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} testID="shopping-back">
          <ArrowLeft color={colors.textPrimary} size={20} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Shopping & Deals</Text>
        <View style={{ width: 36 }} />
      </View>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primaryGlow} />}
      >
        <View style={styles.savingsCard} testID="shopping-savings-card">
          <View style={styles.savingsIcon}><Wallet color={colors.success} size={22} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.savingsLabel}>POTENTIAL SAVINGS THIS MONTH</Text>
            <Text style={styles.savingsValue}>{fmtUSD(summary.savings)}</Text>
            <Text style={styles.savingsSub}>Across {summary.deals} active deal{summary.deals === 1 ? "" : "s"}</Text>
          </View>
        </View>

        <TouchableOpacity style={[styles.tile, { borderColor: colors.primaryMuted }]} onPress={() => router.push("/shopping/deal-finder")} testID="hub-deal-finder" activeOpacity={0.85}>
          <View style={[styles.tileIcon, { backgroundColor: "rgba(59,130,246,0.15)" }]}><Sparkles color={colors.primaryGlow} size={22} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.tileTitle}>AI Deal Finder</Text>
            <Text style={styles.tileSub}>Find the best price across retailers · Claude 4.5</Text>
          </View>
          <ChevronRight size={16} color={colors.textTertiary} />
        </TouchableOpacity>

        <TouchableOpacity style={[styles.tile, { borderColor: "rgba(16,185,129,0.35)" }]} onPress={() => router.push("/shopping/insurance")} testID="hub-insurance" activeOpacity={0.85}>
          <View style={[styles.tileIcon, { backgroundColor: "rgba(16,185,129,0.15)" }]}><ShieldCheck color={colors.success} size={22} /></View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={styles.tileTitle}>Insurance Deals</Text>
              <View style={styles.newDot} />
              <View style={styles.verifiedPill}>
                <Text style={styles.verifiedPillText}>VERIFIED ONLY</Text>
              </View>
            </View>
            <Text style={styles.tileSub}>Best verified rates for auto, home, and bundles — no personal info required</Text>
            <View style={styles.chipsRow}>
              <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); router.push("/shopping/insurance?tab=auto"); }} style={styles.miniChip} testID="hub-insurance-auto">
                <Text style={styles.miniChipText}>Auto</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); router.push("/shopping/insurance?tab=home"); }} style={styles.miniChip} testID="hub-insurance-home">
                <Text style={styles.miniChipText}>Home</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); router.push("/shopping/insurance?tab=bundle"); }} style={styles.miniChip} testID="hub-insurance-bundle">
                <Text style={styles.miniChipText}>Bundle</Text>
              </TouchableOpacity>
            </View>
          </View>
          <ChevronRight size={16} color={colors.textTertiary} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.tile} onPress={() => router.push("/shopping/deals")} testID="hub-deals" activeOpacity={0.85}>
          <View style={[styles.tileIcon, { backgroundColor: "rgba(236,72,153,0.15)" }]}><Tag color="#EC4899" size={22} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.tileTitle}>Active Deals</Text>
            <Text style={styles.tileSub}>{summary.deals} curated · wireless, groceries, gas, auto</Text>
          </View>
          <ChevronRight size={16} color={colors.textTertiary} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.tile} onPress={() => router.push("/shopping/utilities")} testID="hub-utilities" activeOpacity={0.85}>
          <View style={[styles.tileIcon, { backgroundColor: "rgba(59,130,246,0.15)" }]}><Zap color={colors.primaryGlow} size={22} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.tileTitle}>Utilities Review</Text>
            <Text style={styles.tileSub}>Power · wireless · internet · water · Claude 4.5</Text>
          </View>
          <ChevronRight size={16} color={colors.textTertiary} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.tile} onPress={() => router.push("/shopping/products")} testID="hub-products" activeOpacity={0.85}>
          <View style={[styles.tileIcon, { backgroundColor: "rgba(245,158,11,0.15)" }]}><Package color={colors.warning} size={22} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.tileTitle}>Registered Products</Text>
            <Text style={styles.tileSub}>{summary.products} tracked · auto-monitored for recalls</Text>
          </View>
          <ChevronRight size={16} color={colors.textTertiary} />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  backBtn: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.surfaceElevated, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  scroll: { padding: spacing.xl, gap: spacing.md },
  savingsCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surface, borderColor: "rgba(16,185,129,0.3)", borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg },
  savingsIcon: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: "rgba(16,185,129,0.15)", alignItems: "center", justifyContent: "center" },
  savingsLabel: { color: colors.textTertiary, fontSize: 10, fontWeight: "700", letterSpacing: 1.2 },
  savingsValue: { color: colors.success, fontSize: 24, fontWeight: "700", marginTop: 2 },
  savingsSub: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  tile: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg },
  tileIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  tileTitle: { color: colors.textPrimary, fontWeight: "700", fontSize: 15 },
  tileSub: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  newDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  verifiedPill: { backgroundColor: "rgba(16,185,129,0.18)", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  verifiedPillText: { color: colors.success, fontSize: 9, fontWeight: "800", letterSpacing: 0.6 },
  chipsRow: { flexDirection: "row", gap: 6, marginTop: 8 },
  miniChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: "rgba(16,185,129,0.3)", backgroundColor: "rgba(16,185,129,0.08)" },
  miniChipText: { color: colors.success, fontSize: 11, fontWeight: "700" },
});
