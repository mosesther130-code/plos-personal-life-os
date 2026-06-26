// Mortgage Analyzer — 3-scenario comparison + AI recommendation.
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Home, Sparkles, Crown } from "lucide-react-native";

import { financeApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";

const fmtUSD = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export default function MortgageAnalyzer() {
  const router = useRouter();
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await financeApi.mortgageScenarios(200);
      setData(r);
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          testID="mortgage-back"
        >
          <ArrowLeft color={colors.textPrimary} size={20} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mortgage Analyzer</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator color={colors.primaryGlow} />
        </View>
      ) : error || !data ? (
        <View style={styles.loader}>
          <Text style={styles.empty}>{error || "No mortgage found"}</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {/* Mortgage summary */}
          <View style={styles.mortgageCard} testID="mortgage-summary">
            <View style={styles.mortgageHead}>
              <View style={styles.mortgageIcon}>
                <Home color={colors.primaryGlow} size={18} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.mortgageLender}>{data.mortgage.lender}</Text>
                <Text style={styles.mortgageMeta}>
                  {data.mortgage.apr}% APR · {fmtUSD(data.mortgage.monthly_payment)}/mo
                </Text>
              </View>
            </View>
            <Text style={styles.balanceLabel}>Current Balance</Text>
            <Text style={styles.balance}>{fmtUSD(data.mortgage.balance)}</Text>
          </View>

          {/* Scenarios */}
          <Text style={styles.section}>3 Scenarios</Text>
          <View style={{ gap: spacing.md }}>
            {data.scenarios.map((s: any) => {
              const isBest = s.name === data.ai_best_scenario;
              return (
                <View
                  key={s.name}
                  style={[styles.scenarioCard, isBest && styles.scenarioBest]}
                  testID={`scenario-${s.name.replace(/\s+/g, "-").toLowerCase()}`}
                >
                  <View style={styles.scenarioHead}>
                    <Text style={styles.scenarioName}>{s.name}</Text>
                    {isBest && (
                      <View style={styles.bestBadge}>
                        <Crown color={colors.primaryGlow} size={12} />
                        <Text style={styles.bestText}>AI PICK</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.scenarioGrid}>
                    <View style={styles.scenarioStat}>
                      <Text style={styles.statLabel}>Monthly</Text>
                      <Text style={styles.statValue}>
                        {fmtUSD(s.monthly_payment)}
                      </Text>
                    </View>
                    <View style={styles.scenarioStat}>
                      <Text style={styles.statLabel}>Payoff</Text>
                      <Text style={styles.statValue}>
                        {Math.round(s.months / 12)}y{" "}
                        {s.months % 12 ? `${s.months % 12}m` : ""}
                      </Text>
                    </View>
                    <View style={styles.scenarioStat}>
                      <Text style={styles.statLabel}>Total Interest</Text>
                      <Text
                        style={[styles.statValue, { color: colors.danger }]}
                      >
                        {fmtUSD(s.total_interest)}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>

          {/* AI Recommendation */}
          <View style={styles.aiCard} testID="mortgage-ai-card">
            <View style={styles.aiHeader}>
              <Sparkles color={colors.primaryGlow} size={16} />
              <Text style={styles.aiTitle}>AI Recommendation</Text>
            </View>
            <Text style={styles.aiBest}>
              Best path: <Text style={styles.aiBestName}>{data.ai_best_scenario}</Text>
            </Text>
            <Text style={styles.aiReason}>{data.ai_reasoning}</Text>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { color: colors.textTertiary },
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

  mortgageCard: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  mortgageHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  mortgageIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.primaryMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  mortgageLender: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
  },
  mortgageMeta: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  balanceLabel: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  balance: {
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: "300",
    letterSpacing: -1,
    marginTop: 4,
  },

  section: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },

  scenarioCard: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  scenarioBest: {
    borderColor: colors.primaryGlow,
    backgroundColor: colors.primaryMuted,
  },
  scenarioHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  scenarioName: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
  },
  bestBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.bg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  bestText: {
    color: colors.primaryGlow,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
  },
  scenarioGrid: { flexDirection: "row", gap: spacing.md },
  scenarioStat: { flex: 1 },
  statLabel: {
    color: colors.textTertiary,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  statValue: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
    marginTop: 4,
  },

  aiCard: {
    backgroundColor: colors.surface,
    borderColor: colors.primaryMuted,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  aiHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: spacing.md,
  },
  aiTitle: { color: colors.textPrimary, fontWeight: "700", fontSize: 14 },
  aiBest: {
    color: colors.textSecondary,
    fontSize: 13,
    marginBottom: spacing.sm,
  },
  aiBestName: { color: colors.primaryGlow, fontWeight: "700" },
  aiReason: { color: colors.textPrimary, fontSize: 14, lineHeight: 21 },
});
