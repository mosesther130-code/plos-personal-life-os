// Investment Overview — portfolio, readiness gauge, accounts CRUD, optimizer entry.
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
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Shield,
  Briefcase,
  Heart,
  PiggyBank,
  LineChart,
  Banknote,
  Wallet,
  ChevronRight,
  Plus,
} from "lucide-react-native";

import { investmentsApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";
import { ScoreRing } from "@/src/components/ScoreRing";
import { EditModal, Field } from "@/src/components/EditModal";

const fmtUSD = (n: number, compact = false) => {
  if (compact && Math.abs(n) >= 1_000_000)
    return `$${(n / 1_000_000).toFixed(2)}M`;
  if (compact && Math.abs(n) >= 1000)
    return `$${(n / 1000).toFixed(n / 1000 < 10 ? 1 : 0)}K`;
  return `$${Math.round(n).toLocaleString("en-US")}`;
};

const ACCOUNT_ICON: Record<string, any> = {
  TSP: Shield,
  IRA: PiggyBank,
  brokerage: LineChart,
  social_security: Briefcase,
  life_insurance: Heart,
  pension: Briefcase,
  cash: Wallet,
  savings: Banknote,
};

const ACCOUNT_NAMES: Record<string, string> = {
  TSP: "Thrift Savings Plan",
  IRA: "Individual Retirement",
  brokerage: "Brokerage",
  social_security: "Social Security",
  life_insurance: "Life Insurance",
  pension: "Pension",
  cash: "Cash",
  savings: "Savings",
};

// Default growth rate (decimal) by account type — matches PLOS PRD.
const DEFAULT_GROWTH_RATE_PCT: Record<string, number> = {
  TSP: 7,
  IRA: 7,
  brokerage: 7,
  social_security: 0,
  life_insurance: 0,
  pension: 0,
  cash: 4.5,
  savings: 4.5,
};

const TYPE_OPTIONS = [
  { value: "TSP", label: "TSP" },
  { value: "IRA", label: "IRA" },
  { value: "brokerage", label: "Brokerage" },
  { value: "social_security", label: "Social Security" },
  { value: "life_insurance", label: "Life Insurance" },
  { value: "pension", label: "Pension" },
  { value: "cash", label: "Cash" },
  { value: "savings", label: "Savings" },
];

function projectAt65(
  balance: number,
  monthlyContribution: number,
  growthRateDecimal: number,
  yearsTo65: number
): number {
  const years = Math.max(0, yearsTo65);
  const months = years * 12;
  const r = growthRateDecimal / 12;
  if (r === 0) return balance + monthlyContribution * months;
  const fvBalance = balance * Math.pow(1 + r, months);
  const fvContrib =
    monthlyContribution * ((Math.pow(1 + r, months) - 1) / r);
  return fvBalance + fvContrib;
}

type ModalState = { open: boolean; item?: any };

export default function InvestmentOverview() {
  const router = useRouter();
  const [portfolio, setPortfolio] = useState<any | null>(null);
  const [optimizer, setOptimizer] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [optLoading, setOptLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState<ModalState>({ open: false });

  const load = useCallback(async () => {
    const p = await investmentsApi.portfolio();
    setPortfolio(p);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await load();
      } catch (_e) {}
      setLoading(false);
    })();
  }, [load]);

  const runOptimizer = async () => {
    setOptLoading(true);
    try {
      const r = await investmentsApi.contributionOptimizer();
      setOptimizer(r);
    } catch (_e) {
      setOptimizer({ recommendation: "Failed. Try again." });
    }
    setOptLoading(false);
  };

  const yearsTo65 = portfolio?.years_to_65 ?? 30;

  const fields: Field[] = useMemo(
    () => [
      {
        key: "type",
        label: "Type",
        kind: "select",
        options: TYPE_OPTIONS,
      },
      {
        key: "nickname",
        label: "Account Nickname (optional)",
        kind: "text",
        placeholder: "e.g. My TSP, Roth IRA at Fidelity",
      },
      {
        key: "institution",
        label: "Institution / Provider (optional)",
        kind: "text",
        placeholder: "e.g. TSP / FRTIB, Wells Fargo",
      },
      { key: "balance", label: "Current Balance ($)", kind: "number" },
      {
        key: "contribution_monthly",
        label: "Monthly Contribution ($)",
        kind: "number",
      },
      {
        key: "employer_match_pct",
        label: "Employer Match (%)",
        kind: "number",
      },
      {
        key: "growth_rate_pct",
        label: "Annual Growth Rate (%)",
        kind: "number",
      },
      {
        key: "projected_at_65_display",
        label: "Projected Value at Age 65",
        kind: "readonly",
        compute: (v) => {
          const bal = Number(v.balance) || 0;
          const ctr = Number(v.contribution_monthly) || 0;
          const ratePct = Number(v.growth_rate_pct);
          const rate = Number.isFinite(ratePct) ? ratePct / 100 : 0;
          const proj = projectAt65(bal, ctr, rate, yearsTo65);
          return fmtUSD(proj, true);
        },
        hint: `Based on ${yearsTo65} years until age 65 (auto-computed).`,
      },
      {
        key: "beneficiary_name",
        label: "Beneficiary Name (optional)",
        kind: "text",
        placeholder: "e.g. Jane Doe, spouse",
      },
      {
        key: "notes",
        label: "Notes (optional, max 300 chars)",
        kind: "textarea",
        placeholder: "Policy #, vesting date, match details…",
        maxLength: 300,
      },
    ],
    [yearsTo65]
  );

  const onSaveAccount = async (vals: any) => {
    const ratePct = Number(vals.growth_rate_pct);
    const rateDecimal = Number.isFinite(ratePct) && ratePct !== 0 ? ratePct / 100 : null;
    const payload: any = {
      type: vals.type,
      balance: Number(vals.balance) || 0,
      contribution_monthly: Number(vals.contribution_monthly) || 0,
      employer_match_pct: Number(vals.employer_match_pct) || 0,
      nickname: vals.nickname || null,
      institution: vals.institution || null,
      beneficiary_name: vals.beneficiary_name || null,
      notes: vals.notes || null,
      growth_rate_override: rateDecimal,
    };
    if (modal.item?.investment_id) {
      await investmentsApi.update(modal.item.investment_id, payload);
    } else {
      await investmentsApi.create(payload);
    }
    await load();
  };

  const onDeleteAccount = async () => {
    if (!modal.item?.investment_id) return;
    await investmentsApi.delete(modal.item.investment_id);
    await load();
  };

  // Cascade: when user picks a type, prefill growth_rate_pct if it's empty.
  const onFieldChange = (
    key: string,
    value: any,
    current: Record<string, any>
  ) => {
    if (key === "type") {
      const cur = current.growth_rate_pct;
      const isEmpty = cur === "" || cur === undefined || cur === null || Number(cur) === 0;
      if (isEmpty && DEFAULT_GROWTH_RATE_PCT[value] !== undefined) {
        return { growth_rate_pct: DEFAULT_GROWTH_RATE_PCT[value] };
      }
    }
    return undefined;
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

  const investments = portfolio?.investments || [];

  // Build initial values for the modal (convert override decimal → pct).
  const modalInitial = modal.item
    ? {
        type: modal.item.type,
        nickname: modal.item.nickname ?? "",
        institution: modal.item.institution ?? "",
        balance: modal.item.balance ?? 0,
        contribution_monthly: modal.item.contribution_monthly ?? 0,
        employer_match_pct: modal.item.employer_match_pct ?? 0,
        growth_rate_pct:
          modal.item.growth_rate_override != null
            ? Math.round(modal.item.growth_rate_override * 1000) / 10
            : DEFAULT_GROWTH_RATE_PCT[modal.item.type] ?? 7,
        beneficiary_name: modal.item.beneficiary_name ?? "",
        notes: modal.item.notes ?? "",
      }
    : {
        type: "TSP",
        nickname: "",
        institution: "",
        balance: 0,
        contribution_monthly: 0,
        employer_match_pct: 0,
        growth_rate_pct: DEFAULT_GROWTH_RATE_PCT.TSP,
        beneficiary_name: "",
        notes: "",
      };

  const deleteSubject =
    modal.item?.nickname ||
    ACCOUNT_NAMES[modal.item?.type] ||
    modal.item?.type ||
    "this account";

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          testID="inv-back"
        >
          <ArrowLeft color={colors.textPrimary} size={20} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Investments</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
            tintColor={colors.primaryGlow}
          />
        }
      >
        {/* Total Portfolio */}
        <View style={styles.portfolioCard} testID="portfolio-card">
          <Text style={styles.label}>Total Portfolio</Text>
          <Text style={styles.portfolioValue}>
            {fmtUSD(portfolio?.total_balance ?? 0)}
          </Text>
          <View style={styles.portfolioMeta}>
            <View>
              <Text style={styles.metaLabel}>At age 65</Text>
              <Text style={styles.metaValue}>
                {fmtUSD(portfolio?.total_projected_at_65 ?? 0, true)}
              </Text>
            </View>
            <View>
              <Text style={styles.metaLabel}>Contributing</Text>
              <Text style={styles.metaValue}>
                {fmtUSD(portfolio?.total_monthly_contribution ?? 0)}/mo
              </Text>
            </View>
            <View>
              <Text style={styles.metaLabel}>Years to 65</Text>
              <Text style={styles.metaValue}>{portfolio?.years_to_65 ?? "—"}</Text>
            </View>
          </View>
        </View>

        {/* Retirement Readiness */}
        <View style={styles.readinessCard} testID="retirement-readiness-card">
          <ScoreRing
            score={portfolio?.retirement_readiness_score ?? 0}
            size={120}
            strokeWidth={9}
            label="Readiness"
            testID="retirement-readiness-ring"
          />
          <View style={{ flex: 1, paddingLeft: spacing.lg }}>
            <Text style={styles.readinessTitle}>Retirement Readiness</Text>
            <Text style={styles.readinessSub}>
              {portfolio?.on_track
                ? `You're on track for 80% income replacement at 67.`
                : `You need to save ${fmtUSD(portfolio?.monthly_gap ?? 0)} more/month to hit your target.`}
            </Text>
            <Text style={styles.readinessNeed}>
              Target nest egg: {fmtUSD(portfolio?.needed_corpus ?? 0, true)}
            </Text>
          </View>
        </View>

        {/* Contribution Optimizer */}
        <View style={styles.optCard} testID="contribution-optimizer-card">
          <View style={styles.optHeader}>
            <Sparkles color={colors.primaryGlow} size={16} />
            <Text style={styles.optTitle}>Contribution Optimizer</Text>
            <TouchableOpacity
              style={styles.optBtn}
              onPress={runOptimizer}
              disabled={optLoading}
              testID="optimizer-generate"
            >
              {optLoading ? (
                <ActivityIndicator color={colors.primaryGlow} size="small" />
              ) : (
                <Text style={styles.optBtnText}>
                  {optimizer ? "Refresh" : "Analyze"}
                </Text>
              )}
            </TouchableOpacity>
          </View>
          {optimizer ? (
            <View style={{ gap: spacing.sm }}>
              <Text style={styles.optRec}>{optimizer.recommendation}</Text>
              {optimizer.target_account && (
                <Row label="Target" value={optimizer.target_account} />
              )}
              {optimizer.suggested_extra_monthly !== undefined && (
                <Row
                  label="Add"
                  value={`${fmtUSD(optimizer.suggested_extra_monthly)}/mo`}
                />
              )}
              {optimizer.allocation_advice && (
                <Text style={styles.optAlloc}>{optimizer.allocation_advice}</Text>
              )}
              {optimizer.employer_match_status && (
                <Text style={styles.optAlloc}>
                  ✓ {optimizer.employer_match_status}
                </Text>
              )}
            </View>
          ) : (
            <Text style={styles.optEmpty}>
              Tap Analyze for Claude&apos;s personalized contribution plan.
            </Text>
          )}
        </View>

        {/* Quick links */}
        <View style={styles.linksRow}>
          <QuickLink
            icon={<Shield color={colors.success} size={18} />}
            title="Readiness Gate"
            sub="What you can invest in"
            onPress={() => router.push("/investments/readiness")}
            testID="open-readiness-gate"
          />
          <QuickLink
            icon={<LineChart color={colors.primaryGlow} size={18} />}
            title="Opportunities"
            sub="Safe ranked ops"
            onPress={() => router.push("/investments/opportunities")}
            testID="open-opportunities"
          />
        </View>
        <View style={styles.linksRow}>
          <QuickLink
            icon={<TrendingUp color={colors.warning} size={18} />}
            title="Market Readiness"
            sub="Stocks / crypto?"
            onPress={() => router.push("/investments/market-readiness")}
            testID="open-market-readiness"
          />
          <QuickLink
            icon={<Briefcase color="#A855F7" size={18} />}
            title="Social Security"
            sub="62 / 67 / 70 estimate"
            onPress={() => router.push("/investments/social-security")}
            testID="open-social-security"
          />
        </View>

        {/* Account list header with Add button */}
        <View style={styles.accountsHeader}>
          <Text style={styles.sectionLabel}>Your Accounts</Text>
          <TouchableOpacity
            onPress={() => setModal({ open: true })}
            style={styles.addBtn}
            testID="add-account-button"
            activeOpacity={0.85}
          >
            <Plus size={14} color={colors.primaryGlow} />
            <Text style={styles.addBtnText}>Add Account</Text>
          </TouchableOpacity>
        </View>

        <View style={{ gap: spacing.md }}>
          {investments.length === 0 ? (
            <View style={styles.emptyState} testID="empty-accounts">
              <Text style={styles.empty}>
                No accounts on file. Tap Add Account to get started.
              </Text>
            </View>
          ) : (
            investments.map((inv: any) => {
              const Icon = ACCOUNT_ICON[inv.type] || LineChart;
              const isPositive = (inv.trend_pct ?? 0) >= 0;
              const TrendIcon = isPositive ? TrendingUp : TrendingDown;
              return (
                <TouchableOpacity
                  key={inv.investment_id}
                  style={styles.accountCard}
                  testID={`account-${inv.investment_id}`}
                  onPress={() => setModal({ open: true, item: inv })}
                  activeOpacity={0.85}
                >
                  <View style={styles.accountHead}>
                    <View style={styles.accIcon}>
                      <Icon color={colors.primaryGlow} size={18} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.accName} numberOfLines={1}>
                        {inv.nickname || ACCOUNT_NAMES[inv.type] || inv.type}
                      </Text>
                      <Text style={styles.accType}>
                        {(inv.type || "").replace("_", " ").toUpperCase()}
                        {inv.institution ? `  ·  ${inv.institution}` : ""}
                      </Text>
                    </View>
                    <View style={styles.trendBox}>
                      <TrendIcon
                        size={12}
                        color={isPositive ? colors.success : colors.danger}
                      />
                      <Text
                        style={[
                          styles.trendText,
                          {
                            color: isPositive ? colors.success : colors.danger,
                          },
                        ]}
                      >
                        {isPositive ? "+" : ""}
                        {inv.trend_pct}%
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.accBalance}>
                    {fmtUSD(inv.balance || 0)}
                  </Text>
                  <View style={styles.accFooter}>
                    <View>
                      <Text style={styles.accLabel}>Contributing</Text>
                      <Text style={styles.accValue}>
                        {fmtUSD(inv.contribution_monthly || 0)}/mo
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={styles.accLabel}>At 65</Text>
                      <Text
                        style={[styles.accValue, { color: colors.success }]}
                      >
                        {fmtUSD(inv.projected_at_65 || 0, true)}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        <View style={{ height: 60 }} />
      </ScrollView>

      <EditModal
        visible={modal.open}
        title={modal.item ? "Edit Account" : "Add Account"}
        fields={fields}
        initial={modalInitial}
        onClose={() => setModal({ open: false })}
        onSubmit={onSaveAccount}
        onDelete={modal.item ? onDeleteAccount : undefined}
        deleteSubject={deleteSubject}
        onFieldChange={onFieldChange}
        testID="account-modal"
      />
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function QuickLink({
  icon,
  title,
  sub,
  onPress,
  testID,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  onPress: () => void;
  testID: string;
}) {
  return (
    <TouchableOpacity
      style={styles.linkCard}
      onPress={onPress}
      testID={testID}
      activeOpacity={0.85}
    >
      <View style={styles.linkTop}>
        {icon}
        <ChevronRight color={colors.textTertiary} size={14} />
      </View>
      <Text style={styles.linkTitle}>{title}</Text>
      <Text style={styles.linkSub}>{sub}</Text>
    </TouchableOpacity>
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
    backgroundColor: colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  scroll: { padding: spacing.xl, paddingTop: spacing.md, gap: spacing.lg },

  portfolioCard: {
    backgroundColor: colors.surface,
    borderColor: colors.primaryMuted,
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.xl,
  },
  label: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  portfolioValue: {
    color: colors.textPrimary,
    fontSize: 40,
    fontWeight: "300",
    letterSpacing: -1.5,
    marginTop: 6,
  },
  portfolioMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  metaLabel: {
    color: colors.textTertiary,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  metaValue: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "700",
    marginTop: 2,
  },

  readinessCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  readinessTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  readinessSub: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 4,
    lineHeight: 19,
  },
  readinessNeed: { color: colors.textTertiary, fontSize: 11, marginTop: 6 },

  optCard: {
    backgroundColor: colors.surface,
    borderColor: colors.primaryMuted,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  optHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: spacing.md,
  },
  optTitle: { color: colors.textPrimary, fontWeight: "700", flex: 1 },
  optBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryMuted,
  },
  optBtnText: { color: colors.primaryGlow, fontWeight: "700", fontSize: 12 },
  optRec: { color: colors.textPrimary, fontSize: 13, lineHeight: 20 },
  optAlloc: { color: colors.textSecondary, fontSize: 13, lineHeight: 20 },
  optEmpty: { color: colors.textTertiary, fontSize: 13 },
  row: { flexDirection: "row", justifyContent: "space-between" },
  rowLabel: { color: colors.textTertiary, fontSize: 12 },
  rowValue: { color: colors.textPrimary, fontWeight: "700", fontSize: 13 },

  linksRow: { flexDirection: "row", gap: spacing.md },
  linkCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 4,
  },
  linkTop: { flexDirection: "row", justifyContent: "space-between" },
  linkTitle: {
    color: colors.textPrimary,
    fontWeight: "700",
    fontSize: 13,
    marginTop: 6,
  },
  linkSub: { color: colors.textSecondary, fontSize: 11 },

  accountsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionLabel: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.md,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: "rgba(96,165,250,0.25)",
  },
  addBtnText: { color: colors.primaryGlow, fontWeight: "700", fontSize: 12 },

  empty: {
    color: colors.textTertiary,
    textAlign: "center",
    padding: spacing.xl,
  },
  emptyState: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.lg,
  },
  accountCard: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  accountHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  accIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.primaryMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  accName: { color: colors.textPrimary, fontWeight: "700", fontSize: 14 },
  accType: {
    color: colors.textTertiary,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    marginTop: 2,
  },
  trendBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  trendText: { fontSize: 12, fontWeight: "700" },
  accBalance: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: "300",
    letterSpacing: -0.5,
  },
  accFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  accLabel: {
    color: colors.textTertiary,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
  },
  accValue: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "700",
    marginTop: 2,
  },
});
