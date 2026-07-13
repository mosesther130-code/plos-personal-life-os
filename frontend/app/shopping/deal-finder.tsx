// Deal Finder — AI-powered Product Deal Finder + saved searches (Enhancement 9)
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  Sparkles,
  Save,
  RefreshCw,
  ChevronRight,
  Tag,
  Bookmark,
  Trash2,
  ShoppingBag,
} from "lucide-react-native";

import { dealFinderApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";
import { CountrySelectorChip } from "@/src/components/CountrySelector";
import { useCountry } from "@/src/lib/country-context";

const URGENCY = [
  { label: "Today", value: "today" },
  { label: "This Week", value: "this_week" },
  { label: "This Month", value: "this_month" },
  { label: "Anytime", value: "anytime" },
];
const QUALITY = [
  { label: "Budget", value: "budget" },
  { label: "Balanced", value: "balanced" },
  { label: "Premium", value: "premium" },
];

const fmtMoney = (n: number | undefined, symbol: string) =>
  n == null ? "—" : `${symbol}${Math.round(n).toLocaleString("en-US")}`;
const confColor = (c?: string) =>
  c === "high" ? colors.success : c === "low" ? colors.warning : colors.primaryGlow;

export default function DealFinder() {
  const router = useRouter();
  const { country, countryCode } = useCountry();
  const currencySymbol = country.currency === "USD" ? "$" : country.currency === "EUR" ? "€" : country.currency === "GBP" ? "£" : country.currency === "PHP" ? "₱" : country.currency === "CAD" ? "C$" : country.currency === "AUD" ? "A$" : "$";

  // Form state
  const [product, setProduct] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [urgency, setUrgency] = useState("this_month");
  const [quality, setQuality] = useState("balanced");
  const [retailers, setRetailers] = useState<string[]>([]);
  const [selRetailers, setSelRetailers] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  // Result state
  const [running, setRunning] = useState(false);
  const [resultDeals, setResultDeals] = useState<any[]>([]);
  const [resultSummary, setResultSummary] = useState<string>("");
  const [resultCurrencySymbol, setResultCurrencySymbol] = useState<string>(currencySymbol);
  const [resultCurrency, setResultCurrency] = useState<string>(country.currency);

  // Saved searches
  const [searches, setSearches] = useState<any[]>([]);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [r, s] = await Promise.all([
        dealFinderApi.retailers(),
        dealFinderApi.listSearches(),
      ]);
      setRetailers(r.retailers || []);
      setSearches(s.searches || []);
    } catch (_e) {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleRetailer = (r: string) => {
    setSelRetailers((prev) =>
      prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]
    );
  };

  const buildBody = () => ({
    product: product.trim(),
    max_price_usd: maxPrice ? Number(maxPrice) : undefined,
    target_price_usd: targetPrice ? Number(targetPrice) : undefined,
    preferred_retailers: selRetailers,
    urgency,
    quality_preference: quality,
    notes: notes.trim() || undefined,
    country: countryCode,
  });

  const runFind = async () => {
    if (product.trim().length < 3) {
      Alert.alert("Add a product", "Please enter at least 3 characters.");
      return;
    }
    setRunning(true);
    setResultDeals([]);
    setResultSummary("");
    try {
      const r = await dealFinderApi.find(buildBody());
      setResultDeals(r.deals || []);
      setResultSummary(r.summary || "");
      setResultCurrency(r.currency || country.currency);
      setResultCurrencySymbol(r.currency_symbol || currencySymbol);
    } catch (e: any) {
      Alert.alert("Search failed", e?.message || "Try again.");
    } finally {
      setRunning(false);
    }
  };

  const saveSearch = async () => {
    if (product.trim().length < 3) {
      Alert.alert("Add a product", "Enter the product first.");
      return;
    }
    try {
      await dealFinderApi.createSearch(buildBody());
      await load();
      if (Platform.OS === "web") {
        // soft toast equivalent
        // eslint-disable-next-line no-alert
        // @ts-ignore
        window?.alert?.("Search saved");
      } else {
        Alert.alert("Saved", "You can re-run this search anytime from below.");
      }
    } catch (e: any) {
      Alert.alert("Save failed", e?.message || "Try again.");
    }
  };

  const runSaved = async (id: string) => {
    setRefreshingId(id);
    try {
      const r = await dealFinderApi.refresh(id);
      const updated = (await dealFinderApi.listSearches()).searches || [];
      setSearches(updated);
      // also surface results inline
      setResultDeals(r.deals || []);
      setResultSummary(r.summary || "");
      setResultCurrency(r.currency || country.currency);
      setResultCurrencySymbol(r.currency_symbol || currencySymbol);
    } catch (e: any) {
      Alert.alert("Refresh failed", e?.message || "Try again.");
    } finally {
      setRefreshingId(null);
    }
  };

  const deleteSaved = (id: string, label: string) => {
    const doDelete = async () => {
      try {
        await dealFinderApi.deleteSearch(id);
        setSearches((prev) => prev.filter((s) => s.id !== id));
      } catch (e: any) {
        Alert.alert("Delete failed", e?.message || "Try again.");
      }
    };
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm(`Delete saved search "${label}"?`)) {
        doDelete();
      }
      return;
    }
    Alert.alert(
      "Delete saved search?",
      `"${label}" will be removed.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: doDelete },
      ],
    );
  };

  const openHint = (hint?: string) => {
    if (!hint) return;
    const url = hint.startsWith("http") ? hint : `https://${hint}`;
    Linking.openURL(url).catch(() => {});
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primaryGlow} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} testID="df-back">
          <ArrowLeft color={colors.textPrimary} size={20} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Deal Finder · AI</Text>
        <CountrySelectorChip />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* FORM */}
        <View style={styles.formCard}>
          <Text style={styles.fieldLabel}>WHAT ARE YOU LOOKING FOR?</Text>
          <TextInput
            value={product}
            onChangeText={setProduct}
            placeholder='e.g. "55" Sony OLED TV 2025 model"'
            placeholderTextColor={colors.textTertiary}
            style={[styles.input, { fontSize: 14 }]}
            testID="df-product"
          />

          <View style={styles.row2}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>MAX PRICE ({country.currency})</Text>
              <TextInput
                value={maxPrice}
                onChangeText={setMaxPrice}
                placeholder="2000"
                placeholderTextColor={colors.textTertiary}
                keyboardType="number-pad"
                style={styles.input}
                testID="df-max-price"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>TARGET PRICE ({country.currency})</Text>
              <TextInput
                value={targetPrice}
                onChangeText={setTargetPrice}
                placeholder="1500"
                placeholderTextColor={colors.textTertiary}
                keyboardType="number-pad"
                style={styles.input}
                testID="df-target-price"
              />
            </View>
          </View>

          <Text style={styles.fieldLabel}>URGENCY</Text>
          <View style={styles.pillRow}>
            {URGENCY.map((u) => (
              <TouchableOpacity
                key={u.value}
                onPress={() => setUrgency(u.value)}
                style={[styles.pill, urgency === u.value && styles.pillActive]}
              >
                <Text style={[styles.pillText, urgency === u.value && styles.pillTextActive]}>
                  {u.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.fieldLabel}>QUALITY PREFERENCE</Text>
          <View style={styles.pillRow}>
            {QUALITY.map((q) => (
              <TouchableOpacity
                key={q.value}
                onPress={() => setQuality(q.value)}
                style={[styles.pill, quality === q.value && styles.pillActive]}
              >
                <Text style={[styles.pillText, quality === q.value && styles.pillTextActive]}>
                  {q.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.fieldLabel}>PREFERRED RETAILERS (OPTIONAL)</Text>
          <View style={styles.pillRow}>
            {retailers.map((r) => {
              const active = selRetailers.includes(r);
              return (
                <TouchableOpacity
                  key={r}
                  onPress={() => toggleRetailer(r)}
                  style={[styles.pill, active && styles.pillActive]}
                >
                  <Text style={[styles.pillText, active && styles.pillTextActive]}>{r}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.fieldLabel}>NOTES (OPTIONAL)</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="e.g. wall-mounted, daytime brightness, must include 5-year warranty"
            placeholderTextColor={colors.textTertiary}
            style={[styles.input, { height: 60 }]}
            multiline
            testID="df-notes"
          />

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.primaryBtn, running && { opacity: 0.7 }]}
              onPress={runFind}
              disabled={running}
              testID="df-find"
            >
              <Sparkles size={14} color="#fff" />
              <Text style={styles.primaryBtnText}>
                {running ? "Searching…" : "Find Deals Now"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={saveSearch}
              testID="df-save"
            >
              <Save size={14} color={colors.primaryGlow} />
              <Text style={styles.secondaryBtnText}>Save Search</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* RESULTS */}
        {(resultSummary || resultDeals.length > 0) && (
          <View style={styles.resultBlock} testID="df-results">
            <Text style={styles.sectionLabel}>AI RECOMMENDATIONS</Text>
            {!!resultSummary && (
              <View style={styles.summaryCard}>
                <Text style={styles.summaryText}>{resultSummary}</Text>
              </View>
            )}
            {resultDeals.map((d, i) => (
              <TouchableOpacity
                key={`${d.retailer}-${i}`}
                style={styles.dealCard}
                onPress={() => openHint(d.buy_url_hint)}
                activeOpacity={0.85}
                testID={`df-deal-${i}`}
              >
                <View style={styles.dealHead}>
                  <View style={styles.dealIcon}>
                    <ShoppingBag size={16} color={colors.primaryGlow} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dealRetailer}>{d.retailer}</Text>
                    <Text style={styles.dealModel} numberOfLines={2}>
                      {d.model || "Recommended option"}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.dealPrice}>{fmtMoney(d.est_price_usd, resultCurrencySymbol)}</Text>
                    {d.original_price_usd && d.original_price_usd > (d.est_price_usd || 0) && (
                      <Text style={styles.dealOrig}>{fmtMoney(d.original_price_usd, resultCurrencySymbol)}</Text>
                    )}
                  </View>
                </View>
                <View style={styles.dealMeta}>
                  {d.savings_pct ? (
                    <View style={styles.savingsPill}>
                      <Text style={styles.savingsPillText}>{Math.round(d.savings_pct)}% off</Text>
                    </View>
                  ) : null}
                  <View style={[styles.confPill, { backgroundColor: confColor(d.confidence) + "22" }]}>
                    <Text style={[styles.confText, { color: confColor(d.confidence) }]}>
                      {(d.confidence || "medium").toUpperCase()} CONFIDENCE
                    </Text>
                  </View>
                </View>
                {!!d.pros && <Text style={styles.dealPro}>+ {d.pros}</Text>}
                {!!d.cons && <Text style={styles.dealCon}>– {d.cons}</Text>}
                {!!d.buy_url_hint && (
                  <Text style={styles.dealLink}>tap to open · {d.buy_url_hint}</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* SAVED SEARCHES */}
        <Text style={[styles.sectionLabel, { marginTop: spacing.xl }]}>SAVED SEARCHES</Text>
        {searches.length === 0 ? (
          <View style={styles.savedEmpty}>
            <Text style={styles.empty}>No saved searches yet. Use the Save Search button above.</Text>
          </View>
        ) : (
          searches.map((s) => (
            <View key={s.id} style={styles.savedCard} testID={`saved-${s.id}`}>
              <Bookmark size={14} color={colors.primaryGlow} />
              <View style={{ flex: 1 }}>
                <Text style={styles.savedTitle} numberOfLines={2}>{s.product}</Text>
                <Text style={styles.savedSub}>
                  {s.urgency} · {s.quality_preference}
                  {s.max_price_usd ? ` · max ${fmtMoney(s.max_price_usd, currencySymbol)}` : ""}
                </Text>
                {s.last_run_at && (
                  <Text style={styles.savedLast}>
                    last run: {new Date(s.last_run_at).toLocaleString()}
                  </Text>
                )}
              </View>
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => runSaved(s.id)}
                disabled={refreshingId === s.id}
                testID={`saved-run-${s.id}`}
              >
                {refreshingId === s.id ? (
                  <ActivityIndicator color={colors.primaryGlow} size="small" />
                ) : (
                  <RefreshCw size={14} color={colors.primaryGlow} />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => deleteSaved(s.id, s.product)}
                testID={`saved-delete-${s.id}`}
              >
                <Trash2 size={14} color={colors.danger} />
              </TouchableOpacity>
            </View>
          ))
        )}

        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  scroll: { padding: spacing.lg, gap: spacing.sm },

  formCard: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  fieldLabel: {
    color: colors.textTertiary,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    marginTop: 6,
  },
  input: {
    backgroundColor: colors.surfaceElevated,
    color: colors.textPrimary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 9,
    borderRadius: radius.sm,
    fontSize: 13,
  },
  row2: { flexDirection: "row", gap: spacing.sm },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  pill: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
  },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { color: colors.textSecondary, fontSize: 11, fontWeight: "600" },
  pillTextActive: { color: "#fff" },
  actionRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  primaryBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: radius.md,
  },
  primaryBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  secondaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.primaryMuted,
    borderWidth: 1,
    paddingVertical: 12,
    borderRadius: radius.md,
  },
  secondaryBtnText: { color: colors.primaryGlow, fontSize: 13, fontWeight: "700" },

  resultBlock: { gap: spacing.sm, marginTop: spacing.md },
  sectionLabel: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderColor: colors.primaryMuted,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  summaryText: { color: colors.textPrimary, fontSize: 13, lineHeight: 19 },
  dealCard: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  dealHead: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  dealIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  dealRetailer: { color: colors.textPrimary, fontWeight: "700", fontSize: 13 },
  dealModel: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  dealPrice: { color: colors.success, fontSize: 16, fontWeight: "700" },
  dealOrig: {
    color: colors.textTertiary,
    fontSize: 11,
    textDecorationLine: "line-through",
  },
  dealMeta: { flexDirection: "row", gap: spacing.xs, marginTop: 4, flexWrap: "wrap" },
  savingsPill: {
    backgroundColor: "rgba(16,185,129,0.15)",
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  savingsPillText: { color: colors.success, fontSize: 10, fontWeight: "700" },
  confPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm },
  confText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  dealPro: { color: colors.success, fontSize: 12 },
  dealCon: { color: colors.warning, fontSize: 12 },
  dealLink: { color: colors.primaryGlow, fontSize: 10, marginTop: 4 },

  savedEmpty: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  empty: { color: colors.textTertiary, fontSize: 12 },
  savedCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  savedTitle: { color: colors.textPrimary, fontWeight: "700", fontSize: 13 },
  savedSub: { color: colors.textTertiary, fontSize: 10, marginTop: 2 },
  savedLast: { color: colors.textTertiary, fontSize: 9, marginTop: 2, fontStyle: "italic" },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
  },
});
