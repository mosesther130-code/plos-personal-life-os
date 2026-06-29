// Debt Manager — strategy toggle, debt list with payoff pills, AI rec, payoff plan navigation
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
  CreditCard,
  GraduationCap,
  Home as HomeIcon,
  Car,
  Mountain,
  Snowflake,
  Sparkles,
  Calendar,
  Plus,
  Edit3,
} from "lucide-react-native";

import { financeApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";
import { EditModal, Field } from "@/src/components/EditModal";

const fmtUSD = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

const DEBT_ICON: Record<string, any> = {
  credit_card: CreditCard,
  student_loan: GraduationCap,
  mortgage: HomeIcon,
  auto: Car,
};

const debtFields: Field[] = [
  { key: "lender", label: "Lender", kind: "text", placeholder: "e.g. Chase Sapphire" },
  {
    key: "debt_type",
    label: "Type",
    kind: "select",
    options: [
      { value: "credit_card", label: "Credit Card" },
      { value: "student_loan", label: "Student Loan" },
      { value: "mortgage", label: "Mortgage" },
      { value: "auto", label: "Auto" },
    ],
  },
  { key: "balance", label: "Current Balance ($)", kind: "number" },
  { key: "apr", label: "APR (%)", kind: "number" },
  { key: "minimum_payment", label: "Min Payment / month ($)", kind: "number" },
  {
    key: "payoff_strategy",
    label: "Default Strategy",
    kind: "select",
    options: [
      { value: "avalanche", label: "Avalanche" },
      { value: "snowball", label: "Snowball" },
    ],
  },
];

function timelineColor(months: number | null | undefined) {
  if (months == null) return { bg: "rgba(239, 68, 68, 0.18)", text: colors.danger, label: "—" };
  if (months <= 12) return { bg: "rgba(16,185,129,0.18)", text: colors.success, label: `${months}mo` };
  if (months <= 36) return { bg: "rgba(245,158,11,0.18)", text: colors.warning, label: `${months}mo` };
  return { bg: "rgba(239,68,68,0.18)", text: colors.danger, label: `${months}mo` };
}

export default function DebtManager() {
  const router = useRouter();
  const [strategy, setStrategy] = useState<"avalanche" | "snowball">("avalanche");
  const [extraMonthly, setExtraMonthly] = useState<number>(250);
  const [debts, setDebts] = useState<any[]>([]);
  const [plan, setPlan] = useState<any | null>(null);
  const [aiRec, setAiRec] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [debtModal, setDebtModal] = useState<{ open: boolean; item?: any }>({
    open: false,
  });

  const load = useCallback(async (strat: "avalanche" | "snowball", extra: number) => {
    const [d, p] = await Promise.all([
      financeApi.listDebts(),
      financeApi.payoffPlan(strat, extra),
    ]);
    setDebts(d);
    setPlan(p);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await load(strategy, extraMonthly);
      } catch (_e) {}
      setLoading(false);
    })();
  }, [load, strategy, extraMonthly]);

  const generateAI = async () => {
    setAiLoading(true);
    try {
      const r = await financeApi.debtStrategy(strategy, extraMonthly);
      setAiRec(r);
    } catch (_e) {
      setAiRec({ recommendation: "Unable to generate. Try again." });
    }
    setAiLoading(false);
  };

  const onSaveDebt = async (vals: any) => {
    if (debtModal.item) {
      await financeApi.updateDebt(debtModal.item.debt_id, vals);
    } else {
      await financeApi.createDebt(vals);
    }
    await load(strategy, extraMonthly);
    setAiRec(null); // invalidate AI rec — debt set changed
  };

  const onDeleteDebt = async () => {
    if (!debtModal.item) return;
    await financeApi.deleteDebt(debtModal.item.debt_id);
    await load(strategy, extraMonthly);
    setAiRec(null);
  };

  const sortedDebts = useMemo(() => {
    const copy = [...debts];
    if (strategy === "avalanche") copy.sort((a, b) => b.apr - a.apr);
    else copy.sort((a, b) => a.balance - b.balance);
    return copy;
  }, [debts, strategy]);

  const totalBalance = useMemo(
    () => debts.reduce((s, d) => s + d.balance, 0),
    [debts]
  );
  const totalMin = useMemo(
    () => debts.reduce((s, d) => s + d.minimum_payment, 0),
    [debts]
  );

  const hasMortgage = debts.some((d) => d.debt_type === "mortgage");
  const hasStudentLoan = debts.some((d) => d.debt_type === "student_loan");

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.loader}>
          <ActivityIndicator color={colors.primaryGlow} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          testID="debt-back"
        >
          <ArrowLeft color={colors.textPrimary} size={20} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Debt Manager</Text>
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
              await load(strategy, extraMonthly);
              setRefreshing(false);
            }}
            tintColor={colors.primaryGlow}
          />
        }
      >
        {/* Strategy toggle */}
        <View style={styles.strategyRow} testID="strategy-toggle">
          <TouchableOpacity
            onPress={() => setStrategy("avalanche")}
            style={[
              styles.strategyBtn,
              strategy === "avalanche" && styles.strategyActive,
            ]}
            testID="strategy-avalanche"
            activeOpacity={0.8}
          >
            <Mountain
              size={16}
              color={strategy === "avalanche" ? colors.primaryGlow : colors.textSecondary}
            />
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  styles.strategyTitle,
                  strategy === "avalanche" && { color: colors.primaryGlow },
                ]}
              >
                Avalanche
              </Text>
              <Text style={styles.strategySub}>Highest rate first</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setStrategy("snowball")}
            style={[
              styles.strategyBtn,
              strategy === "snowball" && styles.strategyActive,
            ]}
            testID="strategy-snowball"
            activeOpacity={0.8}
          >
            <Snowflake
              size={16}
              color={strategy === "snowball" ? colors.primaryGlow : colors.textSecondary}
            />
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  styles.strategyTitle,
                  strategy === "snowball" && { color: colors.primaryGlow },
                ]}
              >
                Snowball
              </Text>
              <Text style={styles.strategySub}>Smallest balance first</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Totals */}
        <View style={styles.totalsRow}>
          <View style={styles.totalBox}>
            <Text style={styles.totalLabel}>Total Balance</Text>
            <Text style={[styles.totalValue, { color: colors.danger }]}>
              {fmtUSD(totalBalance)}
            </Text>
          </View>
          <View style={styles.totalBox}>
            <Text style={styles.totalLabel}>Min / month</Text>
            <Text style={styles.totalValue}>{fmtUSD(totalMin)}</Text>
          </View>
          <View style={styles.totalBox}>
            <Text style={styles.totalLabel}>Free in</Text>
            <Text style={[styles.totalValue, { color: colors.primaryGlow }]}>
              {plan?.months ?? "—"}mo
            </Text>
          </View>
        </View>

        {/* Debt list */}
        <View style={styles.debtListHeader}>
          <Text style={styles.sectionLabel}>Your Debts</Text>
          <TouchableOpacity
            onPress={() => setDebtModal({ open: true })}
            style={styles.addBtn}
            testID="add-debt-button"
          >
            <Plus size={14} color={colors.primaryGlow} />
            <Text style={styles.addBtnText}>Add Debt</Text>
          </TouchableOpacity>
        </View>
        <View style={{ gap: spacing.md }}>
          {sortedDebts.length === 0 && (
            <View style={styles.emptyDebts} testID="empty-debts">
              <Text style={styles.emptyDebtsText}>
                No debts on file. Tap Add Debt to get started.
              </Text>
            </View>
          )}
          {sortedDebts.map((d, idx) => {
            const Icon = DEBT_ICON[d.debt_type] || CreditCard;
            const perDebt = plan?.per_debt?.find(
              (p: any) => p.debt_id === d.debt_id
            );
            const months = perDebt?.payoff_months_min_only;
            const pill = timelineColor(months);
            return (
              <TouchableOpacity
                key={d.debt_id}
                style={styles.debtCard}
                onPress={() => setDebtModal({ open: true, item: d })}
                activeOpacity={0.8}
                testID={`debt-card-${d.debt_id}`}
              >
                <View style={styles.debtTop}>
                  <View
                    style={[
                      styles.debtIcon,
                      { backgroundColor: "rgba(239, 68, 68, 0.18)" },
                    ]}
                  >
                    <Icon color={colors.danger} size={18} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.debtLender}>{d.lender}</Text>
                    <Text style={styles.debtType}>
                      {d.debt_type.replace("_", " ")} · {d.apr}% APR
                    </Text>
                  </View>
                  <View
                    style={[styles.pill, { backgroundColor: pill.bg }]}
                    testID={`debt-pill-${d.debt_id}`}
                  >
                    <Text style={[styles.pillText, { color: pill.text }]}>
                      {pill.label}
                    </Text>
                  </View>
                  <Edit3
                    color={colors.textTertiary}
                    size={14}
                    style={{ marginLeft: 6 }}
                  />
                </View>
                <View style={styles.debtBottom}>
                  <View>
                    <Text style={styles.debtLabel}>Balance</Text>
                    <Text style={styles.debtBalance}>{fmtUSD(d.balance)}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.debtLabel}>Min/month</Text>
                    <Text style={styles.debtMinPay}>
                      {fmtUSD(d.minimum_payment)}
                    </Text>
                  </View>
                </View>
                {idx === 0 && (
                  <View style={styles.focusBadge}>
                    <Text style={styles.focusText}>
                      Focus debt · {strategy === "avalanche" ? "highest APR" : "smallest balance"}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Extra payment slider */}
        <View style={styles.extraCard} testID="extra-payment-card">
          <Text style={styles.sectionLabel}>Extra Payment / Month</Text>
          <View style={styles.extraRow}>
            {[0, 100, 250, 500, 1000].map((amt) => (
              <TouchableOpacity
                key={amt}
                onPress={() => setExtraMonthly(amt)}
                style={[
                  styles.extraChip,
                  extraMonthly === amt && styles.extraChipActive,
                ]}
                testID={`extra-chip-${amt}`}
              >
                <Text
                  style={[
                    styles.extraChipText,
                    extraMonthly === amt && { color: colors.primaryGlow },
                  ]}
                >
                  ${amt}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {plan && extraMonthly > 0 && (
            <Text style={styles.extraSavings} testID="extra-savings">
              Saves {fmtUSD(plan.interest_saved)} in interest · debt-free{" "}
              {plan.months}mo
            </Text>
          )}
        </View>

        {/* AI Strategy Rec */}
        <View style={styles.aiCard} testID="ai-strategy-card">
          <View style={styles.aiHeader}>
            <Sparkles color={colors.primaryGlow} size={16} />
            <Text style={styles.aiTitle}>AI Strategy Recommendation</Text>
            <TouchableOpacity
              onPress={generateAI}
              disabled={aiLoading}
              style={styles.aiBtn}
              testID="ai-strategy-generate"
            >
              {aiLoading ? (
                <ActivityIndicator color={colors.primaryGlow} size="small" />
              ) : (
                <Text style={styles.aiBtnText}>
                  {aiRec ? "Refresh" : "Generate"}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {aiRec ? (
            <View style={{ gap: spacing.md }}>
              <Text style={styles.aiRecText}>{aiRec.recommendation}</Text>
              <View style={styles.aiStatsRow}>
                <View style={styles.aiStat}>
                  <Text style={styles.aiStatLabel}>Interest saved</Text>
                  <Text style={[styles.aiStatValue, { color: colors.success }]}>
                    {fmtUSD(aiRec.interest_saved || 0)}
                  </Text>
                </View>
                <View style={styles.aiStat}>
                  <Text style={styles.aiStatLabel}>Debt-free in</Text>
                  <Text style={styles.aiStatValue}>
                    {aiRec.months_to_debt_free}mo
                  </Text>
                </View>
                <View style={styles.aiStat}>
                  <Text style={styles.aiStatLabel}>Suggest extra</Text>
                  <Text
                    style={[styles.aiStatValue, { color: colors.primaryGlow }]}
                  >
                    {fmtUSD(aiRec.recommended_extra || extraMonthly)}
                  </Text>
                </View>
              </View>
              {aiRec.payment_order && aiRec.payment_order.length > 0 && (
                <View>
                  <Text style={styles.aiStatLabel}>Kill order</Text>
                  <View style={styles.orderList}>
                    {aiRec.payment_order.map((p: string, i: number) => (
                      <View key={p + i} style={styles.orderPill}>
                        <Text style={styles.orderPillText}>
                          {i + 1}. {p}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>
          ) : (
            <Text style={styles.aiEmpty}>
              Tap Generate to get Claude&apos;s personalized recommendation.
            </Text>
          )}
        </View>

        {/* Build Full Payoff Plan */}
        <TouchableOpacity
          style={styles.payoffBtn}
          onPress={() =>
            router.push(
              `/finance/payoff-plan?strategy=${strategy}&extra=${extraMonthly}`
            )
          }
          testID="build-payoff-plan-button"
          activeOpacity={0.85}
        >
          <Calendar color="#fff" size={18} />
          <Text style={styles.payoffBtnText}>Build Full Payoff Plan</Text>
        </TouchableOpacity>

        {hasStudentLoan && (
          <TouchableOpacity
            style={styles.mortgageBtn}
            onPress={() => router.push("/student-loans" as any)}
            testID="open-student-loans"
            activeOpacity={0.85}
          >
            <GraduationCap color={colors.primaryGlow} size={18} />
            <Text style={styles.mortgageBtnText}>Open Student Loans Center</Text>
          </TouchableOpacity>
        )}

        {hasMortgage && (
          <>
            <TouchableOpacity
              style={styles.mortgageBtn}
              onPress={() => router.push("/mortgage" as any)}
              testID="open-mortgage-advisor"
              activeOpacity={0.85}
            >
              <HomeIcon color={colors.primaryGlow} size={18} />
              <Text style={styles.mortgageBtnText}>Open Mortgage Advisor</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.mortgageBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderSubtle }]}
              onPress={() => router.push("/finance/mortgage-analyzer")}
              testID="open-mortgage-analyzer"
              activeOpacity={0.85}
            >
              <HomeIcon color={colors.textSecondary} size={18} />
              <Text style={[styles.mortgageBtnText, { color: colors.textSecondary }]}>Open Mortgage Scenarios</Text>
            </TouchableOpacity>
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      <EditModal
        visible={debtModal.open}
        title={debtModal.item ? "Edit Debt" : "Add Debt"}
        fields={debtFields}
        initial={
          debtModal.item || {
            lender: "",
            debt_type: "credit_card",
            balance: 0,
            apr: 0,
            minimum_payment: 0,
            payoff_strategy: "avalanche",
          }
        }
        onClose={() => setDebtModal({ open: false })}
        onSubmit={onSaveDebt}
        onDelete={debtModal.item ? onDeleteDebt : undefined}
        testID="debt-modal"
      />
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
  scroll: { padding: spacing.xl, paddingTop: spacing.md, gap: spacing.lg },

  strategyRow: { flexDirection: "row", gap: spacing.sm },
  strategyBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  strategyActive: {
    borderColor: colors.primaryGlow,
    backgroundColor: colors.primaryMuted,
  },
  strategyTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
  strategySub: { color: colors.textTertiary, fontSize: 11, marginTop: 2 },

  totalsRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  totalBox: {
    flex: 1,
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  totalLabel: {
    color: colors.textTertiary,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  totalValue: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
    marginTop: 4,
  },

  sectionLabel: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },

  debtListHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryMuted,
  },
  addBtnText: {
    color: colors.primaryGlow,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  emptyDebts: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: "center",
  },
  emptyDebtsText: { color: colors.textTertiary, fontSize: 13 },

  // Debt card
  debtCard: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  debtTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  debtIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  debtLender: { color: colors.textPrimary, fontWeight: "700", fontSize: 14 },
  debtType: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
    textTransform: "capitalize",
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  pillText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  debtBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  debtLabel: {
    color: colors.textTertiary,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  debtBalance: {
    color: colors.danger,
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.5,
    marginTop: 2,
  },
  debtMinPay: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
    marginTop: 2,
  },
  focusBadge: {
    alignSelf: "flex-start",
    backgroundColor: colors.primaryMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: 999,
  },
  focusText: {
    color: colors.primaryGlow,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },

  // Extra payment
  extraCard: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  extraRow: {
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  extraChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: "transparent",
  },
  extraChipActive: {
    borderColor: colors.primaryGlow,
    backgroundColor: colors.primaryMuted,
  },
  extraChipText: { color: colors.textSecondary, fontWeight: "700", fontSize: 13 },
  extraSavings: {
    color: colors.success,
    fontSize: 13,
    fontWeight: "600",
    marginTop: spacing.md,
  },

  // AI card
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
  aiTitle: { color: colors.textPrimary, fontWeight: "700", flex: 1 },
  aiBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryMuted,
  },
  aiBtnText: { color: colors.primaryGlow, fontWeight: "700", fontSize: 12 },
  aiRecText: { color: colors.textPrimary, fontSize: 14, lineHeight: 21 },
  aiEmpty: { color: colors.textTertiary, fontSize: 13 },
  aiStatsRow: { flexDirection: "row", gap: spacing.md },
  aiStat: {
    flex: 1,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  aiStatLabel: {
    color: colors.textTertiary,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  aiStatValue: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
    marginTop: 4,
  },
  orderList: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  orderPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.surfaceElevated,
  },
  orderPillText: { color: colors.textSecondary, fontSize: 11, fontWeight: "600" },

  // Buttons
  payoffBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: radius.lg,
  },
  payoffBtnText: { color: "#fff", fontWeight: "700" },
  mortgageBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: "transparent",
    borderColor: colors.primaryGlow,
    borderWidth: 1,
    paddingVertical: 14,
    borderRadius: radius.lg,
  },
  mortgageBtnText: { color: colors.primaryGlow, fontWeight: "700" },
});
