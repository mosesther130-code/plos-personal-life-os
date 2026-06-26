// Full month-by-month payoff schedule.
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";

import { financeApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";

const fmtUSD = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export default function PayoffPlan() {
  const router = useRouter();
  const { strategy = "avalanche", extra = "0" } = useLocalSearchParams<{
    strategy: string;
    extra: string;
  }>();
  const [plan, setPlan] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await financeApi.payoffPlan(strategy as string, Number(extra));
        setPlan(r);
      } catch (_e) {}
      setLoading(false);
    })();
  }, [strategy, extra]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          testID="payoff-back"
        >
          <ArrowLeft color={colors.textPrimary} size={20} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Full Payoff Plan</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator color={colors.primaryGlow} />
        </View>
      ) : !plan || plan.months === 0 ? (
        <View style={styles.loader}>
          <Text style={styles.empty}>No debts to plan</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.summary} testID="payoff-summary">
            <Text style={styles.summarySub}>
              {strategy === "avalanche" ? "Avalanche" : "Snowball"} · +
              {fmtUSD(Number(extra))}/mo extra
            </Text>
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Months</Text>
                <Text style={styles.statValue}>{plan.months}</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Interest</Text>
                <Text style={[styles.statValue, { color: colors.danger }]}>
                  {fmtUSD(plan.total_interest)}
                </Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Saved</Text>
                <Text style={[styles.statValue, { color: colors.success }]}>
                  {fmtUSD(plan.interest_saved)}
                </Text>
              </View>
            </View>
          </View>

          <Text style={styles.section}>Month-by-Month Focus</Text>
          <View style={styles.timeline}>
            {plan.schedule.map((s: any, i: number) => {
              const isPayoff = s.focus_balance_after <= 0.01;
              return (
                <View
                  key={s.month}
                  style={[styles.row, isPayoff && styles.rowPayoff]}
                  testID={`payoff-month-${s.month}`}
                >
                  <Text style={styles.month}>M{s.month}</Text>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.focusName,
                        isPayoff && { color: colors.success },
                      ]}
                    >
                      {s.focus_debt}
                      {isPayoff ? " · PAID OFF 🎉" : ""}
                    </Text>
                    <Text style={styles.remaining}>
                      Remaining: {fmtUSD(s.total_remaining)}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
          <View style={{ height: 60 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
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
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceElevated,
  },
  headerTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  scroll: { padding: spacing.xl, gap: spacing.lg },
  empty: { color: colors.textTertiary },
  summary: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  summarySub: {
    color: colors.textSecondary,
    fontSize: 12,
    marginBottom: spacing.md,
  },
  statsRow: { flexDirection: "row", gap: spacing.md },
  statBox: { flex: 1 },
  statLabel: {
    color: colors.textTertiary,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  statValue: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: "700",
    marginTop: 4,
  },
  section: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  timeline: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  rowPayoff: { backgroundColor: "rgba(16,185,129,0.06)" },
  month: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: "700",
    width: 40,
  },
  focusName: { color: colors.textPrimary, fontWeight: "600", fontSize: 13 },
  remaining: { color: colors.textTertiary, fontSize: 11, marginTop: 2 },
});
