// Active Deals — wireless, groceries, gas, auto, utilities.
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  X as XIcon,
  ShoppingCart,
  Fuel,
  Wifi,
  Wrench,
  Zap,
  Tag,
  MapPin,
  Clock,
  Info,
} from "lucide-react-native";
import { shoppingApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";
import { CountrySelectorChip } from "@/src/components/CountrySelector";
import { useCountry } from "@/src/lib/country-context";

const currencySymbol = (cur: string) =>
  cur === "USD" ? "$" : cur === "EUR" ? "€" : cur === "GBP" ? "£" : cur === "PHP" ? "₱" : cur === "CAD" ? "C$" : cur === "AUD" ? "A$" : "$";
const fmtMoney = (n: number, cur: string) => `${currencySymbol(cur)}${Math.round(n).toLocaleString("en-US")}`;

const categoryMeta = (c: string) => {
  switch (c) {
    case "wireless": return { icon: Wifi, color: "#A855F7" };
    case "gas": return { icon: Fuel, color: colors.warning };
    case "groceries": return { icon: ShoppingCart, color: colors.success };
    case "auto_service": return { icon: Wrench, color: colors.primaryGlow };
    case "utility": return { icon: Zap, color: "#F59E0B" };
    default: return { icon: Tag, color: colors.textSecondary };
  }
};

const categoryLabel = (c: string) => {
  if (c === "auto_service") return "Auto Service";
  return (c || "").charAt(0).toUpperCase() + (c || "").slice(1);
};

export default function Deals() {
  const router = useRouter();
  const { country, countryCode } = useCountry();
  const [deals, setDeals] = useState<any[]>([]);
  const [totalSavings, setTotalSavings] = useState(0);
  const [notice, setNotice] = useState<string>("");
  const [currency, setCurrency] = useState<string>(country.currency);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await shoppingApi.deals(countryCode);
      setDeals(r?.deals || []);
      setTotalSavings(r?.total_savings_this_month || 0);
      setNotice(r?.notice || "");
      setCurrency(r?.currency || country.currency);
    } catch (_e) {}
    setLoading(false);
  }, [countryCode, country.currency]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const dismiss = (id: string) => {
    const performDismiss = async () => {
      try {
        await shoppingApi.dismissDeal(id);
        const next = deals.filter(d => d.deal_id !== id);
        setDeals(next);
        setTotalSavings(next.reduce((s, d) => s + (d.savings_usd || 0), 0));
      } catch (_e) {}
    };
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm("Dismiss this deal? You won’t see it again unless you reset preferences.")) {
        performDismiss();
      }
      return;
    }
    Alert.alert("Dismiss this deal?", "You won’t see it again unless you reset preferences.", [
      { text: "Cancel", style: "cancel" },
      { text: "Dismiss", style: "destructive", onPress: performDismiss },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} testID="deals-back">
          <ArrowLeft color={colors.textPrimary} size={20} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Active Deals</Text>
        <CountrySelectorChip />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primaryGlow} />}
      >
        <View style={styles.savingsCard} testID="deals-savings">
          <Text style={styles.savingsLabel}>POTENTIAL MONTHLY SAVINGS · {country.flag} {country.name}</Text>
          <Text style={styles.savingsValue}>{fmtMoney(totalSavings, currency)}</Text>
          <Text style={styles.savingsSub}>across {deals.length} active deal{deals.length === 1 ? "" : "s"} · {currency}</Text>
        </View>

        {notice ? (
          <View style={[styles.noteRow, { alignItems: "flex-start" }]}>
            <Info size={12} color={colors.primaryGlow} />
            <Text style={[styles.noteText, { color: colors.textPrimary }]}>{notice}</Text>
          </View>
        ) : (
          <View style={styles.noteRow}>
            <Info size={12} color={colors.textTertiary} />
            <Text style={styles.noteText}>Curated demo set. Live deals pipeline will require Kroger/Costco affiliate keys.</Text>
          </View>
        )}

        {loading ? (
          <ActivityIndicator color={colors.primaryGlow} style={{ marginTop: 40 }} />
        ) : deals.length === 0 ? (
          <View style={styles.empty}><Text style={styles.emptyText}>No active deals — pull to refresh.</Text></View>
        ) : (
          deals.map((d) => {
            const m = categoryMeta(d.category);
            const Icon = m.icon;
            return (
              <View key={d.deal_id} style={styles.dealCard} testID={`deal-${d.deal_id}`}>
                <View style={styles.dealHeader}>
                  <View style={[styles.dealIcon, { backgroundColor: m.color + "22" }]}>
                    <Icon size={18} color={m.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dealTitle}>{d.title}</Text>
                    <Text style={styles.dealProvider}>{d.provider} · {categoryLabel(d.category)}</Text>
                  </View>
                  <TouchableOpacity onPress={() => dismiss(d.deal_id)} style={styles.dismissBtn} testID={`dismiss-${d.deal_id}`}>
                    <XIcon size={14} color={colors.textTertiary} />
                  </TouchableOpacity>
                </View>
                <Text style={styles.dealDesc}>{d.description}</Text>
                <View style={styles.dealFooter}>
                  <View style={styles.savingsPill}>
                    <Text style={styles.savingsPillText}>{d.savings_label}</Text>
                  </View>
                  {d.expires_in_days ? (
                    <View style={styles.metaInline}>
                      <Clock size={11} color={colors.warning} />
                      <Text style={[styles.metaInlineText, { color: colors.warning }]}>{d.expires_in_days}d left</Text>
                    </View>
                  ) : null}
                  {d.distance_miles ? (
                    <View style={styles.metaInline}>
                      <MapPin size={11} color={colors.textTertiary} />
                      <Text style={styles.metaInlineText}>{d.distance_miles} mi</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })
        )}
        <View style={{ height: 40 }} />
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
  savingsCard: { backgroundColor: colors.surface, borderColor: "rgba(16,185,129,0.3)", borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg },
  savingsLabel: { color: colors.textTertiary, fontSize: 10, fontWeight: "700", letterSpacing: 1.2 },
  savingsValue: { color: colors.success, fontSize: 28, fontWeight: "700", marginTop: 4 },
  savingsSub: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  noteRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: -4 },
  noteText: { color: colors.textTertiary, fontSize: 11, flex: 1, lineHeight: 16 },
  empty: { padding: spacing.xl, alignItems: "center" },
  emptyText: { color: colors.textTertiary, fontSize: 13 },
  dealCard: { backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  dealHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  dealIcon: { width: 36, height: 36, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  dealTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
  dealProvider: { color: colors.textTertiary, fontSize: 11, marginTop: 2 },
  dismissBtn: { padding: 6, borderRadius: radius.sm, backgroundColor: colors.bg },
  dealDesc: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
  dealFooter: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  savingsPill: { backgroundColor: "rgba(16,185,129,0.15)", borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 4 },
  savingsPillText: { color: colors.success, fontSize: 11, fontWeight: "600" },
  metaInline: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaInlineText: { color: colors.textTertiary, fontSize: 11, fontWeight: "600" },
});
