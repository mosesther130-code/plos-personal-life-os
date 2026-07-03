import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from "react-native";
import { RefreshCw, Sparkles, ChevronDown, ChevronUp } from "lucide-react-native";
import { plaidApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";

export function MonthlySummaryCard() {
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const r = await plaidApi.monthlySummary(undefined, refresh);
      setSummary(r);
    } catch (_e) {}
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(false); }, [load]);

  if (loading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color={colors.primaryGlow} />
      </View>
    );
  }

  if (!summary || !summary.aggregates) return null;

  const agg = summary.aggregates;
  const prev = summary.previous_month_aggregates || {};
  const delta = agg.total_expenses - (prev.total_expenses || 0);
  const deltaPct = prev.total_expenses > 0 ? Math.round((delta / prev.total_expenses) * 100) : 0;

  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.header} onPress={() => setExpanded(!expanded)} activeOpacity={0.85}>
        <Sparkles size={13} color="#A78BFA" />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Monthly Summary</Text>
          <Text style={styles.subtitle}>{summary.month_label}</Text>
        </View>
        <TouchableOpacity style={styles.regenBtn} onPress={(e) => { (e as any)?.stopPropagation?.(); load(true); }} disabled={refreshing} testID="monthly-refresh">
          {refreshing ? <ActivityIndicator size="small" color="#fff" /> : <RefreshCw size={10} color="#fff" />}
        </TouchableOpacity>
        {expanded ? <ChevronUp size={14} color={colors.textSecondary} /> : <ChevronDown size={14} color={colors.textSecondary} />}
      </TouchableOpacity>

      {expanded ? (
        <>
          <View style={styles.metricsRow}>
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>SPENT</Text>
              <Text style={styles.metricValue}>${agg.total_expenses.toLocaleString("en-US", { maximumFractionDigits: 0 })}</Text>
              {deltaPct !== 0 ? (
                <Text style={[styles.metricDelta, { color: delta > 0 ? colors.danger : colors.success }]}>{delta > 0 ? "+" : ""}{deltaPct}% vs last</Text>
              ) : null}
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>EARNED</Text>
              <Text style={[styles.metricValue, { color: colors.success }]}>${agg.total_income.toLocaleString("en-US", { maximumFractionDigits: 0 })}</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>NET</Text>
              <Text style={[styles.metricValue, { color: agg.net >= 0 ? colors.success : colors.danger }]}>
                {agg.net >= 0 ? "+" : ""}${agg.net.toLocaleString("en-US", { maximumFractionDigits: 0 })}
              </Text>
            </View>
          </View>

          <Text style={styles.narrative}>{summary.narrative}</Text>

          <Text style={styles.sectionLabel}>TOP MERCHANTS</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {(agg.top_merchants || []).slice(0, 5).map((m: any, i: number) => (
              <View key={i} style={styles.merchantChip}>
                <Text style={styles.merchantName} numberOfLines={1}>{m.merchant}</Text>
                <Text style={styles.merchantAmount}>${m.amount.toFixed(0)}</Text>
              </View>
            ))}
          </ScrollView>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: "#A78BFA", padding: spacing.md, marginTop: spacing.md },
  header: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { color: colors.textPrimary, fontSize: 13, fontWeight: "700" },
  subtitle: { color: "#A78BFA", fontSize: 10, fontWeight: "600", letterSpacing: 0.5, marginTop: 1 },
  regenBtn: { backgroundColor: colors.primary, width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  metricsRow: { flexDirection: "row", marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderSubtle, paddingTop: spacing.sm },
  metric: { flex: 1, alignItems: "center" },
  metricDivider: { width: 1, backgroundColor: colors.borderSubtle },
  metricLabel: { color: colors.textTertiary, fontSize: 9, fontWeight: "700", letterSpacing: 0.5 },
  metricValue: { color: colors.textPrimary, fontSize: 15, fontWeight: "700", marginTop: 3 },
  metricDelta: { fontSize: 9, marginTop: 2 },
  narrative: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: spacing.md },
  sectionLabel: { color: colors.textTertiary, fontSize: 9, fontWeight: "700", letterSpacing: 0.6, marginTop: spacing.md, marginBottom: 6 },
  merchantChip: { backgroundColor: colors.bg, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.borderSubtle, marginRight: 6, minWidth: 90 },
  merchantName: { color: colors.textPrimary, fontSize: 11, fontWeight: "600" },
  merchantAmount: { color: colors.textTertiary, fontSize: 10, marginTop: 2 },
});
