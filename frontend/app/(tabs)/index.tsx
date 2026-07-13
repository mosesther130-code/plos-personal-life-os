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
import {
  MessageCircle,
  Brain,
  ChevronRight,
  Wallet,
  Briefcase,
  TrendingUp,
  CreditCard,
  Tag,
  Plane,
  Scale,
  HeartPulse,
  Shield,
  Compass,
} from "lucide-react-native";

import { useAuth } from "@/src/lib/auth-context";
import { dashboardApi, aiApi, alertsApi, seedDemo, personalityApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";
import { ScoreRing } from "@/src/components/ScoreRing";
import { AlertRow } from "@/src/components/AlertRow";

const fmtUSD = (n: number, compact = false) => {
  if (compact && Math.abs(n) >= 1000) {
    const v = n / 1000;
    return `$${v.toFixed(v < 10 ? 1 : 0)}K`;
  }
  return `$${Math.round(n).toLocaleString("en-US")}`;
};

const MODULES = [
  { key: "finance", title: "Finances", icon: Wallet, color: colors.success, route: "/(tabs)/finance" },
  { key: "career", title: "Career", icon: Briefcase, color: colors.primaryGlow, route: "/(tabs)/career" },
  { key: "navigation", title: "Navigation", icon: Compass, color: "#0EA5E9", route: "/navigation" },
  { key: "investments", title: "Investments", icon: TrendingUp, color: "#10B981", route: "/investments" },
  { key: "debt", title: "Debt", icon: CreditCard, color: colors.warning, route: "/(tabs)/finance" },
  { key: "deals", title: "Deals", icon: Tag, color: "#EC4899", route: "/shopping" },
  { key: "travel", title: "Travel", icon: Plane, color: "#A855F7", route: "/travel" },
  { key: "legal", title: "Legal", icon: Scale, color: "#F59E0B", route: "/legal" },
  { key: "personality", title: "Personality", icon: Brain, color: "#3B82F6", route: "/personality" },
  { key: "health", title: "Health", icon: HeartPulse, color: colors.danger, route: "/health" },
];

function greetingFor(date: Date) {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function fmtDate(date: Date) {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export default function Home() {
  const router = useRouter();
  const { user } = useAuth();

  const [dashboard, setDashboard] = useState<any>(null);
  const [advice, setAdvice] = useState<any>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [personalityDna, setPersonalityDna] = useState<any>(null);
  const [personalityStatus, setPersonalityStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [showDeep, setShowDeep] = useState(false);

  const loadDashboard = useCallback(async () => {
    const [d, a] = await Promise.all([
      dashboardApi.get(),
      alertsApi.list(),
    ]);
    setDashboard(d);
    setAlerts(a.alerts);
  }, []);

  const loadPersonality = useCallback(async () => {
    try {
      const [dna, status] = await Promise.all([personalityApi.dna(), personalityApi.status()]);
      setPersonalityDna(dna?.dna || null);
      setPersonalityStatus(status || null);
    } catch (_e) {}
  }, []);

  const loadAdvice = useCallback(async (force = false) => {
    setAdviceLoading(true);
    try {
      const r = await aiApi.dailyAdvice(force, false);
      setAdvice(r);
    } catch (_e) {
      setAdvice({ summary: "Couldn't generate advice. Try again.", items: [] });
    }
    setAdviceLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await Promise.all([loadDashboard(), loadAdvice(false), loadPersonality()]);
      } catch (_e) {}
      setLoading(false);
    })();
  }, [loadDashboard, loadAdvice, loadPersonality]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadDashboard(), loadAdvice(true), loadPersonality()]);
    setRefreshing(false);
  };

  const onSeed = async () => {
    setSeeding(true);
    try {
      await seedDemo();
      await Promise.all([loadDashboard(), loadAdvice(true)]);
    } catch (_e) {}
    setSeeding(false);
  };

  const onDeeper = async () => {
    setAdviceLoading(true);
    try {
      const r = await aiApi.dailyAdvice(true, true);
      setAdvice(r);
      setShowDeep(true);
    } catch (_e) {}
    setAdviceLoading(false);
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

  const score = dashboard?.financial_health_score ?? 0;
  const surplus = dashboard?.monthly_surplus ?? 0;
  const months = dashboard?.emergency_months ?? 0;
  const target = dashboard?.emergency_target_months ?? 6;
  const fundProgress = Math.min(1, months / target);

  // empty-state hint
  const hasData =
    (dashboard?.income_count ?? 0) +
      (dashboard?.expense_count ?? 0) +
      (dashboard?.debt_count ?? 0) >
    0;

  const today = new Date();

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
        {/* 1. Header */}
        <View style={styles.header} testID="dashboard-header">
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>
              {greetingFor(today)},
            </Text>
            <Text style={styles.userName} numberOfLines={1}>
              {user?.full_name?.split(" ")[0] || "Friend"}
            </Text>
            <Text style={styles.todayDate}>{fmtDate(today)}</Text>
          </View>
          <View style={styles.headerRight}>
            <ScoreRing
              score={score}
              size={96}
              strokeWidth={8}
              label="Health"
              testID="financial-health-ring"
            />
            <TouchableOpacity
              onPress={() => router.push("/chatbot")}
              style={styles.chatBtn}
              testID="open-chatbot"
            >
              <MessageCircle size={18} color={colors.primaryGlow} />
            </TouchableOpacity>
          </View>
        </View>

        {!hasData && (
          <TouchableOpacity
            style={styles.seedBanner}
            onPress={onSeed}
            disabled={seeding}
            testID="seed-demo-banner"
          >
            {seeding ? (
              <ActivityIndicator color={colors.primaryGlow} />
            ) : (
              <Text style={styles.seedText}>
                No data yet — tap to load demo data ✨
              </Text>
            )}
          </TouchableOpacity>
        )}

        {/* 2. Today's Snapshot — 2x2 grid */}
        <Text style={styles.sectionLabel}>Today&apos;s Snapshot</Text>
        <View style={styles.grid} testID="snapshot-grid">
          <MetricCard
            testID="metric-income"
            label="Monthly Income"
            value={fmtUSD(dashboard?.monthly_income ?? 0, true)}
            accent={colors.success}
          />
          <MetricCard
            testID="metric-expenses"
            label="Monthly Expenses"
            value={fmtUSD(dashboard?.monthly_expenses ?? 0, true)}
            accent={colors.danger}
          />
          <MetricCard
            testID="metric-surplus"
            label="Monthly Surplus"
            value={`${surplus >= 0 ? "+" : ""}${fmtUSD(surplus, true)}`}
            accent={surplus >= 0 ? colors.success : colors.danger}
          />
          <MetricCard
            testID="metric-networth"
            label="Net Worth"
            value={fmtUSD(dashboard?.net_worth ?? 0, true)}
            accent={colors.primaryGlow}
          />
        </View>

        {/* 3. Emergency Fund Runway */}
        <View style={styles.runwayCard} testID="emergency-fund-card">
          <View style={styles.runwayHeader}>
            <View style={styles.runwayTitleRow}>
              <Shield size={16} color={colors.primaryGlow} />
              <Text style={styles.runwayTitle}>Emergency Fund Runway</Text>
            </View>
            <Text style={styles.runwayMonths}>
              {months.toFixed(1)} / {target} mo
            </Text>
          </View>
          <View style={styles.runwayBar}>
            <View
              style={[
                styles.runwayFill,
                {
                  width: `${fundProgress * 100}%`,
                  backgroundColor:
                    fundProgress >= 1
                      ? colors.success
                      : fundProgress >= 0.5
                      ? colors.warning
                      : colors.danger,
                },
              ]}
            />
          </View>
          <Text style={styles.runwaySub}>
            {fundProgress >= 1
              ? `Fully funded — ${fmtUSD(dashboard?.emergency_fund ?? 0)} in liquid savings`
              : `${fmtUSD(dashboard?.emergency_fund ?? 0)} saved · target ${fmtUSD(
                  (dashboard?.monthly_expenses ?? 0) * target
                )}`}
          </Text>
        </View>

        {/* 4. AI Daily Advice */}
        <View style={styles.aiCard} testID="ai-daily-advice-card">
          <View style={styles.aiHeader}>
            <View style={styles.aiIconWrap}>
              <Brain size={18} color={colors.primaryGlow} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.aiTitle}>AI Daily Advice</Text>
              <Text style={styles.aiDate}>
                {advice?.date ? `Updated ${advice.date}` : "Today"}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => loadAdvice(true)}
              disabled={adviceLoading}
              testID="ai-advice-refresh"
              style={styles.refreshChip}
            >
              <Text style={styles.refreshChipText}>Refresh</Text>
            </TouchableOpacity>
          </View>

          {adviceLoading ? (
            <View style={{ paddingVertical: spacing.xl }}>
              <ActivityIndicator color={colors.primaryGlow} />
            </View>
          ) : (
            <>
              {advice?.summary && (
                <Text style={styles.aiSummary}>{advice.summary}</Text>
              )}
              <View style={{ gap: spacing.md, marginTop: spacing.md }}>
                {(advice?.items || []).slice(0, 3).map((item: string, i: number) => (
                  <View key={i} style={styles.aiItem} testID={`ai-advice-item-${i}`}>
                    <View style={styles.aiBullet}>
                      <Text style={styles.aiBulletText}>{i + 1}</Text>
                    </View>
                    <Text style={styles.aiItemText}>{item}</Text>
                  </View>
                ))}
              </View>
              {showDeep && advice?.deep_analysis && (
                <View style={styles.deepWrap} testID="deep-analysis-text">
                  <Text style={styles.deepLabel}>DEEP ANALYSIS</Text>
                  <Text style={styles.deepText}>{advice.deep_analysis}</Text>
                </View>
              )}
              <TouchableOpacity
                onPress={onDeeper}
                style={styles.deeperBtn}
                disabled={adviceLoading}
                testID="deeper-analysis-button"
              >
                <Text style={styles.deeperBtnText}>
                  {showDeep ? "Refresh deeper analysis" : "Deeper Analysis"}
                </Text>
                <ChevronRight color={colors.primaryGlow} size={16} />
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Know Yourself — Personality DNA card */}
        <TouchableOpacity
          style={styles.knowYourselfCard}
          onPress={() => router.push("/personality")}
          testID="know-yourself-card"
        >
          <View style={styles.knowLeft}>
            <Brain color="#3B82F6" size={22} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.knowLabel}>KNOW YOURSELF</Text>
            {personalityDna?.headline_summary ? (
              <>
                <Text style={styles.knowTitle} numberOfLines={2}>{personalityDna.headline_summary}</Text>
                <Text style={styles.knowSub}>{(personalityStatus?.completed?.length || 0)} / 6 assessments · Tap to view your Personality DNA</Text>
              </>
            ) : (
              <>
                <Text style={styles.knowTitle}>Discover your Personality DNA</Text>
                <Text style={styles.knowSub}>6 scientifically validated assessments — Big Five, MBTI, Enneagram, EQ, VIA, DISC.</Text>
              </>
            )}
          </View>
          <ChevronRight color={colors.textSecondary} size={16} />
        </TouchableOpacity>

        {/* 5. Alerts */}
        <View style={styles.alertsCard}>
          <View style={styles.alertsHeader}>
            <Text style={styles.sectionLabelInline}>Alerts</Text>
            {alerts.length > 0 && (
              <Text style={styles.alertsCount}>{alerts.length}</Text>
            )}
          </View>
          {alerts.length === 0 ? (
            <Text style={styles.emptyAlerts}>
              You&apos;re all caught up. No alerts right now.
            </Text>
          ) : (
            alerts.map((alert) => (
              <AlertRow
                key={alert.id}
                alert={alert}
                testID={`alert-${alert.id}`}
                onPress={() => {
                  if (alert.route) router.push(alert.route);
                }}
              />
            ))
          )}
        </View>

        {/* 6. Module Navigation Grid */}
        <Text style={styles.sectionLabel}>Modules</Text>
        <View style={styles.modulesGrid} testID="modules-grid">
          {MODULES.map((m) => {
            const Icon = m.icon;
            return (
              <TouchableOpacity
                key={m.key}
                style={styles.moduleTile}
                onPress={() => router.push(m.route)}
                activeOpacity={0.7}
                testID={`module-tile-${m.key}`}
              >
                <View
                  style={[styles.moduleIcon, { backgroundColor: `${m.color}1F` }]}
                >
                  <Icon color={m.color} size={20} />
                </View>
                <Text style={styles.moduleTitle}>{m.title}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function MetricCard({
  label,
  value,
  accent,
  testID,
}: {
  label: string;
  value: string;
  accent: string;
  testID?: string;
}) {
  return (
    <View style={styles.metric} testID={testID}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color: accent }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.xl,
    gap: spacing.lg,
  },
  greeting: {
    color: colors.textTertiary,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  userName: {
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: "600",
    letterSpacing: -0.5,
    marginTop: 2,
  },
  todayDate: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 4,
  },
  headerRight: { alignItems: "center", gap: spacing.sm },
  chatBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primaryMuted,
    alignItems: "center",
    justifyContent: "center",
  },

  // Seed banner
  seedBanner: {
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primaryMuted,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    alignItems: "center",
  },
  seedText: { color: colors.primaryGlow, fontWeight: "600" },

  // Sections
  sectionLabel: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginTop: spacing.xxl,
    marginBottom: spacing.md,
  },
  sectionLabelInline: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
  },

  // 2x2 grid metric cards
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  metric: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  metricLabel: {
    color: colors.textTertiary,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: spacing.sm,
  },
  metricValue: { fontSize: 22, fontWeight: "700", letterSpacing: -0.5 },

  // Runway
  runwayCard: {
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  runwayHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  runwayTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  runwayTitle: { color: colors.textPrimary, fontWeight: "600", fontSize: 14 },
  runwayMonths: { color: colors.textSecondary, fontSize: 13, fontWeight: "700" },
  runwayBar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.borderSubtle,
    overflow: "hidden",
  },
  runwayFill: { height: "100%" },
  runwaySub: {
    color: colors.textTertiary,
    fontSize: 12,
    marginTop: spacing.sm,
  },

  // AI Daily Advice
  aiCard: {
    marginTop: spacing.xxl,
    backgroundColor: colors.surface,
    borderColor: colors.primaryMuted,
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.xl,
  },
  aiHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  aiIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.primaryMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  aiTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: "700" },
  aiDate: { color: colors.textTertiary, fontSize: 11, marginTop: 2 },
  refreshChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryMuted,
  },
  refreshChipText: {
    color: colors.primaryGlow,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  aiSummary: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 22,
  },
  aiItem: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "flex-start",
  },
  aiBullet: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primaryMuted,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  aiBulletText: {
    color: colors.primaryGlow,
    fontSize: 10,
    fontWeight: "700",
  },
  aiItemText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    flex: 1,
  },
  deepWrap: {
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  deepLabel: {
    color: colors.textTertiary,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginBottom: spacing.sm,
  },
  deepText: { color: colors.textSecondary, fontSize: 13, lineHeight: 20 },
  deeperBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginTop: spacing.lg,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primaryMuted,
  },
  deeperBtnText: {
    color: colors.primaryGlow,
    fontWeight: "700",
    fontSize: 13,
  },


  // Know Yourself (Personality DNA card)
  knowYourselfCard: {
    marginTop: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: spacing.md,
    backgroundColor: "rgba(59,130,246,0.06)",
    borderColor: "rgba(59,130,246,0.35)",
    borderWidth: 1,
    borderRadius: radius.lg,
  },
  knowLeft: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: "rgba(59,130,246,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  knowLabel: { color: "#3B82F6", fontSize: 10, fontWeight: "800", letterSpacing: 0.6 },
  knowTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: "700", marginTop: 3, lineHeight: 19 },
  knowSub: { color: colors.textSecondary, fontSize: 11, marginTop: 4, lineHeight: 15 },

  // Alerts
  alertsCard: {
    marginTop: spacing.xxl,
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.xl,
    overflow: "hidden",
  },
  alertsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  alertsCount: {
    color: colors.primaryGlow,
    fontSize: 12,
    fontWeight: "700",
    backgroundColor: colors.primaryMuted,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: "hidden",
  },
  emptyAlerts: {
    color: colors.textTertiary,
    fontSize: 13,
    padding: spacing.lg,
    textAlign: "center",
  },

  // Module grid
  modulesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  moduleTile: {
    flexBasis: "22%",
    flexGrow: 1,
    aspectRatio: 1,
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  moduleIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  moduleTitle: {
    color: colors.textPrimary,
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
  },
});
