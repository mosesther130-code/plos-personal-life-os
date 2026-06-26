import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Sparkles, MessageCircle, TrendingUp, TrendingDown } from "lucide-react-native";

import { useAuth } from "@/src/lib/auth-context";
import { dashboardApi, aiApi, seedDemo } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";
import { Card, StatCard } from "@/src/components/Card";
import { AdviceCard } from "@/src/components/AdviceCard";

const fmtUSD = (n: number) =>
  `$${Math.round(n).toLocaleString("en-US")}`;

export default function Home() {
  const router = useRouter();
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState<any>(null);
  const [decisions, setDecisions] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [genLoading, setGenLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, dec] = await Promise.all([
        dashboardApi.get(),
        aiApi.decisions(),
      ]);
      setDashboard(d);
      setDecisions(dec);
    } catch (_e) {}
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const generateAdvice = async () => {
    setGenLoading(true);
    try {
      await aiApi.advice("dashboard", "Give me one sharp action for today.");
      await load();
    } catch (_e) {}
    setGenLoading(false);
  };

  const onSeed = async () => {
    setGenLoading(true);
    try {
      await seedDemo();
      await load();
    } catch (_e) {}
    setGenLoading(false);
  };

  const onAck = async (id: string) => {
    await aiApi.ackDecision(id);
    setDecisions((prev) =>
      prev.map((d) => (d.decision_id === id ? { ...d, was_acted_on: true } : d))
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.loader}>
          <ActivityIndicator color={colors.primaryGlow} />
        </View>
      </SafeAreaView>
    );
  }

  const cashflow = dashboard?.monthly_cashflow ?? 0;
  const score = dashboard?.financial_health_score ?? 0;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primaryGlow}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Good morning</Text>
            <Text style={styles.userName}>{user?.full_name || "Welcome"}</Text>
          </View>
          <TouchableOpacity
            onPress={() => router.push("/chatbot")}
            style={styles.chatBtn}
            testID="open-chatbot"
          >
            <MessageCircle size={20} color={colors.primaryGlow} />
          </TouchableOpacity>
        </View>

        {/* Hero score */}
        <View style={styles.heroCard} testID="financial-health-hero">
          <Text style={styles.overline}>Financial Health Score</Text>
          <Text style={styles.heroValue}>{score}</Text>
          <View style={styles.scoreBar}>
            <View style={[styles.scoreBarFill, { width: `${score}%` }]} />
          </View>
          <View style={styles.netWorthRow}>
            <Text style={styles.heroLabel}>Net Worth</Text>
            <Text style={styles.heroAmount}>
              {fmtUSD(dashboard?.net_worth ?? 0)}
            </Text>
          </View>
        </View>

        {/* Stats grid */}
        <View style={styles.grid}>
          <View style={styles.gridItem}>
            <StatCard
              testID="stat-income"
              label="Monthly In"
              value={fmtUSD(dashboard?.monthly_income ?? 0)}
              accent={colors.success}
            />
          </View>
          <View style={styles.gridItem}>
            <StatCard
              testID="stat-expenses"
              label="Monthly Out"
              value={fmtUSD(dashboard?.monthly_expenses ?? 0)}
              accent={colors.danger}
            />
          </View>
        </View>

        <Card style={{ marginTop: spacing.lg }} testID="cashflow-card">
          <View style={styles.cashflowRow}>
            <View>
              <Text style={styles.cardLabel}>Monthly Cashflow</Text>
              <Text
                style={[
                  styles.cashflowValue,
                  { color: cashflow >= 0 ? colors.success : colors.danger },
                ]}
              >
                {cashflow >= 0 ? "+" : ""}
                {fmtUSD(cashflow)}
              </Text>
            </View>
            {cashflow >= 0 ? (
              <TrendingUp size={28} color={colors.success} />
            ) : (
              <TrendingDown size={28} color={colors.danger} />
            )}
          </View>
        </Card>

        {/* AI Section */}
        <View style={styles.aiHeader}>
          <Text style={styles.sectionTitle}>AI Decisions</Text>
          <TouchableOpacity
            onPress={generateAdvice}
            disabled={genLoading}
            style={styles.aiBtn}
            testID="generate-ai-advice"
          >
            {genLoading ? (
              <ActivityIndicator color={colors.primaryGlow} size="small" />
            ) : (
              <>
                <Sparkles size={14} color={colors.primaryGlow} />
                <Text style={styles.aiBtnText}>Generate</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {decisions.length === 0 ? (
          <Card testID="empty-advice">
            <Text style={styles.emptyText}>
              No AI decisions yet. Tap Generate to get personalized guidance.
            </Text>
            <TouchableOpacity
              onPress={onSeed}
              style={styles.seedBtn}
              testID="seed-demo-button"
            >
              <Text style={styles.seedText}>or load demo data →</Text>
            </TouchableOpacity>
          </Card>
        ) : (
          <View style={{ gap: spacing.md }}>
            {decisions.slice(0, 5).map((d) => (
              <AdviceCard
                key={d.decision_id}
                testID={`advice-${d.decision_id}`}
                module={d.module}
                advice={d.advice_text}
                priority={d.priority}
                acted={d.was_acted_on}
                onAck={() => onAck(d.decision_id)}
              />
            ))}
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xxl,
  },
  greeting: {
    color: colors.textTertiary,
    fontSize: 13,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  userName: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: "600",
    marginTop: 4,
  },
  chatBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primaryMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xxl,
    borderColor: colors.primaryMuted,
    borderWidth: 1,
    alignItems: "center",
  },
  overline: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.8,
    marginBottom: spacing.md,
  },
  heroValue: {
    color: colors.textPrimary,
    fontSize: 64,
    fontWeight: "300",
    letterSpacing: -3,
  },
  scoreBar: {
    width: "100%",
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.borderSubtle,
    marginTop: spacing.lg,
    overflow: "hidden",
  },
  scoreBarFill: {
    height: "100%",
    backgroundColor: colors.primaryGlow,
  },
  netWorthRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  heroLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  heroAmount: { color: colors.textPrimary, fontSize: 20, fontWeight: "600" },
  grid: {
    flexDirection: "row",
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  gridItem: { flex: 1 },
  cardLabel: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  cashflowRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cashflowValue: {
    fontSize: 26,
    fontWeight: "700",
    marginTop: 4,
  },
  aiHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.xxxl,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "600",
  },
  aiBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primaryMuted,
    backgroundColor: colors.primaryMuted,
  },
  aiBtnText: { color: colors.primaryGlow, fontWeight: "700", fontSize: 12 },
  emptyText: { color: colors.textSecondary, lineHeight: 22 },
  seedBtn: { marginTop: spacing.lg },
  seedText: { color: colors.primaryGlow, fontWeight: "600" },
});
