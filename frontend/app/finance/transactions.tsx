import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, ArrowUpRight, ArrowDownLeft, Filter, Landmark } from "lucide-react-native";
import { plaidApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "income", label: "Income" },
  { key: "housing", label: "Housing" },
  { key: "utilities", label: "Utilities" },
  { key: "food", label: "Food" },
  { key: "transport", label: "Transport" },
  { key: "subscriptions", label: "Subscriptions" },
  { key: "debt", label: "Debt" },
  { key: "other", label: "Other" },
];

const fmt = (n: number, sign = false) => {
  const abs = Math.abs(n);
  const s = `$${abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (!sign) return s;
  return n < 0 ? `+${s}` : `-${s}`;
};

const guessFilter = (tx: any): string => {
  const cats = (tx.category_plaid || []).join(" ").toLowerCase();
  const name = (tx.name || "").toLowerCase();
  const amt = Number(tx.amount || 0);
  if (amt < 0 || cats.includes("payroll") || cats.includes("benefits") || name.includes("payroll") || name.includes("deposit")) return "income";
  if (name.includes("mortgage") || name.includes("hoa") || name.includes("rent")) return "housing";
  if (cats.includes("utilities") || name.includes("power") || name.includes("at&t") || name.includes("water")) return "utilities";
  if (cats.includes("food") || cats.includes("groceries") || name.includes("kroger") || name.includes("publix") || name.includes("aldi") || name.includes("walmart") || name.includes("whole foods")) return "food";
  if (cats.includes("gas") || cats.includes("transportation") || name.includes("uber") || name.includes("lyft") || name.includes("shell") || name.includes("murphy")) return "transport";
  if (name.includes("netflix") || name.includes("spotify") || name.includes("hulu") || name.includes("apple") || name.includes("prime")) return "subscriptions";
  if (cats.includes("payment") || name.includes("chase") || name.includes("wells fargo") || name.includes("credit card")) return "debt";
  return "other";
};

const groupByDate = (txs: any[]) => {
  const groups: Record<string, any[]> = {};
  txs.forEach((t) => {
    const d = t.date || "unknown";
    groups[d] = groups[d] || [];
    groups[d].push(t);
  });
  return Object.entries(groups)
    .sort(([a], [b]) => (b > a ? 1 : -1))
    .map(([date, items]) => ({ date, items }));
};

const humanDate = (d: string): string => {
  if (!d || d === "unknown") return "Unknown";
  const today = new Date().toISOString().slice(0, 10);
  const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (d === today) return "Today";
  if (d === yest) return "Yesterday";
  try {
    return new Date(d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  } catch {
    return d;
  }
};

export default function TransactionsScreen() {
  const router = useRouter();
  const [txs, setTxs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await plaidApi.transactions(200);
      setTxs(r.transactions || []);
    } catch (_e) {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (filter === "all") return txs;
    return txs.filter((t) => guessFilter(t) === filter);
  }, [txs, filter]);

  const grouped = useMemo(() => groupByDate(filtered), [filtered]);

  const totals = useMemo(() => {
    let inc = 0, out = 0;
    filtered.forEach((t) => {
      const a = Number(t.amount || 0);
      // Plaid convention: positive = debit (out), negative = credit (in)
      if (a < 0) inc += -a;
      else out += a;
    });
    return { income: inc, out };
  }, [filtered]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} testID="tx-back">
          <ArrowLeft color={colors.textPrimary} size={20} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Transactions</Text>
        <View style={styles.iconBtn} />
      </View>

      {/* Summary strip */}
      <View style={styles.summaryStrip}>
        <View style={styles.sumCell}>
          <ArrowDownLeft size={11} color={colors.success} />
          <Text style={styles.sumLabel}>IN</Text>
          <Text style={[styles.sumValue, { color: colors.success }]}>+{fmt(totals.income)}</Text>
        </View>
        <View style={styles.sumDivider} />
        <View style={styles.sumCell}>
          <ArrowUpRight size={11} color={colors.danger} />
          <Text style={styles.sumLabel}>OUT</Text>
          <Text style={[styles.sumValue, { color: colors.danger }]}>-{fmt(totals.out)}</Text>
        </View>
        <View style={styles.sumDivider} />
        <View style={styles.sumCell}>
          <Filter size={11} color={colors.textTertiary} />
          <Text style={styles.sumLabel}>COUNT</Text>
          <Text style={styles.sumValue}>{filtered.length}</Text>
        </View>
      </View>

      {/* Filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chipsRow}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setFilter(f.key)}
              testID={`filter-${f.key}`}
              activeOpacity={0.85}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.primaryGlow} />}
      >
        {loading ? (
          <ActivityIndicator color={colors.primaryGlow} style={{ marginTop: 40 }} />
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <Landmark size={30} color={colors.textTertiary} />
            <Text style={styles.emptyText}>No transactions</Text>
            <Text style={styles.emptySub}>
              Connect a bank account or use the Sandbox to seed test transactions.
            </Text>
          </View>
        ) : (
          grouped.map((g) => (
            <View key={g.date}>
              <Text style={styles.dateLabel}>{humanDate(g.date)}</Text>
              {g.items.map((t) => {
                const a = Number(t.amount || 0);
                const isIncome = a < 0;
                return (
                  <View key={t.plaid_transaction_id} style={styles.txRow} testID={`tx-${t.plaid_transaction_id}`}>
                    <View style={[styles.txIcon, { backgroundColor: (isIncome ? colors.success : colors.danger) + "22" }]}>
                      {isIncome ? <ArrowDownLeft size={14} color={colors.success} /> : <ArrowUpRight size={14} color={colors.danger} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.txName} numberOfLines={1}>{t.merchant_name || t.name}</Text>
                      <View style={styles.txMetaRow}>
                        <Text style={styles.txMeta}>{t.institution_name || "Bank"}</Text>
                        {t.pending ? <View style={styles.pendingPill}><Text style={styles.pendingText}>PENDING</Text></View> : null}
                        {t.category_plaid && t.category_plaid.length ? (
                          <Text style={styles.txMeta}>· {t.category_plaid[0]}</Text>
                        ) : null}
                      </View>
                    </View>
                    <Text style={[styles.txAmount, { color: isIncome ? colors.success : colors.textPrimary }]}>
                      {isIncome ? "+" : "-"}{fmt(a)}
                    </Text>
                  </View>
                );
              })}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, color: colors.textPrimary, fontSize: 17, fontWeight: "700", textAlign: "center" },
  summaryStrip: { flexDirection: "row", backgroundColor: colors.surface, marginHorizontal: spacing.md, marginTop: spacing.md, borderRadius: radius.md, paddingVertical: 10, borderWidth: 1, borderColor: colors.borderSubtle },
  sumCell: { flex: 1, alignItems: "center", gap: 2 },
  sumDivider: { width: 1, backgroundColor: colors.borderSubtle },
  sumLabel: { color: colors.textTertiary, fontSize: 9, fontWeight: "700", letterSpacing: 0.6 },
  sumValue: { color: colors.textPrimary, fontSize: 13, fontWeight: "700" },
  chipsScroll: { maxHeight: 46, marginTop: spacing.sm },
  chipsRow: { paddingHorizontal: spacing.md, gap: 6, alignItems: "center" },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderSubtle },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textSecondary, fontSize: 11, fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  scroll: { padding: spacing.md, paddingBottom: 60 },
  dateLabel: { color: colors.textTertiary, fontSize: 10, fontWeight: "700", letterSpacing: 0.6, marginTop: spacing.md, marginBottom: 6 },
  txRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: colors.borderSubtle, marginBottom: 6 },
  txIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  txName: { color: colors.textPrimary, fontSize: 13, fontWeight: "600" },
  txMetaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  txMeta: { color: colors.textTertiary, fontSize: 10 },
  pendingPill: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3, backgroundColor: "rgba(245,158,11,0.2)", borderWidth: 1, borderColor: "#F59E0B" },
  pendingText: { color: "#F59E0B", fontSize: 8, fontWeight: "700", letterSpacing: 0.5 },
  txAmount: { fontSize: 13, fontWeight: "700" },
  empty: { alignItems: "center", padding: 40, gap: 8 },
  emptyText: { color: colors.textSecondary, fontSize: 14, fontWeight: "700", marginTop: spacing.sm },
  emptySub: { color: colors.textTertiary, fontSize: 11, textAlign: "center", lineHeight: 16 },
});
