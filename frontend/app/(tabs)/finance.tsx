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
  Plus,
  Briefcase,
  Coins,
  HandCoins,
  CreditCard,
  ChevronRight,
  Edit3,
  Download,
} from "lucide-react-native";

import { financeApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";
import { EditModal, Field } from "@/src/components/EditModal";
import { ReportsModal } from "@/src/components/ReportsModal";
import { PlaidSection } from "@/src/components/PlaidSection";
import { CashFlowForecast } from "@/src/components/CashFlowForecast";
import { categoryMeta } from "@/src/lib/categories";

const fmtUSD = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

const INCOME_TYPE_ICON: Record<string, any> = {
  salary: Briefcase,
  benefits: HandCoins,
  side: Coins,
};

const incomeFields: Field[] = [
  { key: "source_name", label: "Source", kind: "text", placeholder: "e.g. Primary Salary" },
  {
    key: "type",
    label: "Type",
    kind: "select",
    options: [
      { value: "salary", label: "Salary" },
      { value: "side", label: "Side" },
      { value: "benefits", label: "Benefits" },
    ],
  },
  { key: "gross_monthly", label: "Gross Monthly ($)", kind: "number" },
  { key: "net_monthly", label: "Net Monthly ($)", kind: "number" },
  { key: "is_active", label: "Active", kind: "boolean" },
];

const expenseFields: Field[] = [
  { key: "vendor", label: "Vendor", kind: "text", placeholder: "e.g. Netflix" },
  {
    key: "category",
    label: "Category",
    kind: "select",
    options: [
      { value: "Housing", label: "Housing" },
      { value: "Utilities", label: "Utilities" },
      { value: "Insurance", label: "Insurance" },
      { value: "Transport", label: "Transport" },
      { value: "Groceries", label: "Groceries" },
      { value: "Phone", label: "Phone" },
      { value: "Streaming", label: "Streaming" },
      { value: "Debt", label: "Debt Payment" },
      { value: "Health", label: "Health" },
      { value: "Other", label: "Other" },
    ],
  },
  { key: "monthly_amount", label: "Monthly Amount ($)", kind: "number" },
  { key: "due_day_of_month", label: "Due Day (1-28)", kind: "number" },
  { key: "auto_pay", label: "Auto-pay", kind: "boolean" },
];

export default function Finance() {
  const router = useRouter();
  const [income, setIncome] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [incomeModal, setIncomeModal] = useState<{ open: boolean; item?: any }>({
    open: false,
  });
  const [expenseModal, setExpenseModal] = useState<{ open: boolean; item?: any }>({
    open: false,
  });
  const [reportsOpen, setReportsOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [i, e] = await Promise.all([
        financeApi.listIncome(),
        financeApi.listExpenses(),
      ]);
      setIncome(i);
      setExpenses(e);
    } catch (_e) {}
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  const totals = useMemo(() => {
    const inc = income.reduce(
      (s, i) => s + (i.is_active ? i.net_monthly : 0),
      0
    );
    const exp = expenses.reduce((s, e) => s + e.monthly_amount, 0);
    return { income: inc, expenses: exp, surplus: inc - exp };
  }, [income, expenses]);

  const maxExpense = useMemo(
    () => Math.max(1, ...expenses.map((e) => e.monthly_amount)),
    [expenses]
  );

  const onSaveIncome = async (vals: any) => {
    if (incomeModal.item) {
      await financeApi.updateIncome(incomeModal.item.income_id, vals);
    } else {
      await financeApi.createIncome(vals);
    }
    await load();
  };

  const onDeleteIncome = async () => {
    if (!incomeModal.item) return;
    await financeApi.deleteIncome(incomeModal.item.income_id);
    await load();
  };

  const onSaveExpense = async (vals: any) => {
    if (expenseModal.item) {
      await financeApi.updateExpense(expenseModal.item.expense_id, vals);
    } else {
      await financeApi.createExpense(vals);
    }
    await load();
  };

  const onDeleteExpense = async () => {
    if (!expenseModal.item) return;
    await financeApi.deleteExpense(expenseModal.item.expense_id);
    await load();
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

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
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
        <View style={styles.titleRow}>
          <Text style={styles.h1}>Financial Snapshot</Text>
          <TouchableOpacity
            style={styles.reportBtn}
            onPress={() => setReportsOpen(true)}
            testID="open-reports"
            activeOpacity={0.85}
          >
            <Download size={14} color={colors.primaryGlow} />
            <Text style={styles.reportBtnText}>Reports</Text>
          </TouchableOpacity>
        </View>

        {/* 1. Summary row */}
        <View style={styles.summaryRow} testID="snapshot-summary-row">
          <SummaryCard
            label="Income"
            value={fmtUSD(totals.income)}
            color={colors.success}
            testID="summary-income"
          />
          <SummaryCard
            label="Outflow"
            value={fmtUSD(totals.expenses)}
            color={colors.danger}
            testID="summary-outflow"
          />
          <SummaryCard
            label="Surplus"
            value={`${totals.surplus >= 0 ? "+" : ""}${fmtUSD(totals.surplus)}`}
            color={totals.surplus >= 0 ? colors.success : colors.danger}
            highlight
            testID="summary-surplus"
          />
        </View>

        {/* Plaid — connect banks + connected institutions */}
        <PlaidSection />

        {/* 90-day Cash Flow Forecast */}
        <CashFlowForecast />

        {/* Fraud review entry */}
        <TouchableOpacity
          style={styles.debtMgrBtn}
          onPress={() => router.push("/finance/fraud-review")}
          testID="open-fraud-review"
          activeOpacity={0.85}
        >
          <View style={[styles.debtMgrIcon, { backgroundColor: "rgba(239,68,68,0.15)" }]}>
            <CreditCard size={18} color={colors.danger} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.debtMgrTitle}>Fraud Review</Text>
            <Text style={styles.debtMgrSub}>7-signal fraud detection · trusted list</Text>
          </View>
          <ChevronRight color={colors.textSecondary} size={18} />
        </TouchableOpacity>

        {/* Debt manager entry */}
        <TouchableOpacity
          style={styles.debtMgrBtn}
          onPress={() => router.push("/finance/debt-manager")}
          testID="open-debt-manager"
          activeOpacity={0.85}
        >
          <View style={styles.debtMgrIcon}>
            <CreditCard size={18} color={colors.danger} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.debtMgrTitle}>Debt Manager</Text>
            <Text style={styles.debtMgrSub}>
              Avalanche vs snowball · AI payoff plan
            </Text>
          </View>
          <ChevronRight color={colors.textSecondary} size={18} />
        </TouchableOpacity>

        {/* 2. Income Sources */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Income Sources</Text>
          <TouchableOpacity
            onPress={() => setIncomeModal({ open: true })}
            style={styles.addBtn}
            testID="add-income-button"
          >
            <Plus size={14} color={colors.primaryGlow} />
            <Text style={styles.addBtnText}>Add</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.list}>
          {income.length === 0 ? (
            <Text style={styles.empty}>No income sources yet</Text>
          ) : (
            income.map((i) => {
              const Icon = INCOME_TYPE_ICON[i.type] || Briefcase;
              return (
                <TouchableOpacity
                  key={i.income_id}
                  style={styles.incomeRow}
                  onPress={() => setIncomeModal({ open: true, item: i })}
                  testID={`income-row-${i.income_id}`}
                  activeOpacity={0.7}
                >
                  <View style={[styles.iconWrap, { backgroundColor: "rgba(16,185,129,0.15)" }]}>
                    <Icon color={colors.success} size={18} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{i.source_name}</Text>
                    <Text style={styles.rowSub}>
                      {i.type} {i.is_active ? "" : "· inactive"}
                    </Text>
                  </View>
                  <Text style={styles.incomeAmount}>
                    +{fmtUSD(i.net_monthly)}
                  </Text>
                  <Edit3 color={colors.textTertiary} size={14} style={{ marginLeft: 6 }} />
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {/* 3. Monthly Expenses */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Monthly Expenses</Text>
          <TouchableOpacity
            onPress={() => setExpenseModal({ open: true })}
            style={styles.addBtn}
            testID="add-expense-button"
          >
            <Plus size={14} color={colors.primaryGlow} />
            <Text style={styles.addBtnText}>Add</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.list}>
          {expenses.length === 0 ? (
            <Text style={styles.empty}>No expenses yet</Text>
          ) : (
            expenses.map((e) => {
              const meta = categoryMeta(e.category);
              const Icon = meta.icon;
              const proportion = e.monthly_amount / maxExpense;
              return (
                <TouchableOpacity
                  key={e.expense_id}
                  style={styles.expenseRow}
                  onPress={() => setExpenseModal({ open: true, item: e })}
                  testID={`expense-row-${e.expense_id}`}
                  activeOpacity={0.7}
                >
                  <View style={styles.expenseTop}>
                    <View
                      style={[
                        styles.iconWrap,
                        { backgroundColor: `${meta.color}26` },
                      ]}
                    >
                      <Icon color={meta.color} size={18} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{e.vendor}</Text>
                      <Text style={styles.rowSub}>
                        {e.category} · day {e.due_day_of_month}
                        {e.auto_pay ? " · auto" : ""}
                      </Text>
                    </View>
                    <Text style={styles.expenseAmount}>
                      {fmtUSD(e.monthly_amount)}
                    </Text>
                  </View>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        {
                          width: `${Math.max(4, proportion * 100)}%`,
                          backgroundColor: meta.color,
                        },
                      ]}
                    />
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      <EditModal
        visible={incomeModal.open}
        title={incomeModal.item ? "Edit Income" : "Add Income"}
        fields={incomeFields}
        initial={
          incomeModal.item || {
            source_name: "",
            type: "salary",
            gross_monthly: 0,
            net_monthly: 0,
            is_active: true,
          }
        }
        onClose={() => setIncomeModal({ open: false })}
        onSubmit={onSaveIncome}
        onDelete={incomeModal.item ? onDeleteIncome : undefined}
        testID="income-modal"
      />

      <EditModal
        visible={expenseModal.open}
        title={expenseModal.item ? "Edit Expense" : "Add Expense"}
        fields={expenseFields}
        initial={
          expenseModal.item || {
            vendor: "",
            category: "Other",
            monthly_amount: 0,
            due_day_of_month: 1,
            auto_pay: false,
          }
        }
        onClose={() => setExpenseModal({ open: false })}
        onSubmit={onSaveExpense}
        onDelete={expenseModal.item ? onDeleteExpense : undefined}
        testID="expense-modal"
      />

      <ReportsModal visible={reportsOpen} onClose={() => setReportsOpen(false)} />
    </SafeAreaView>
  );
}

function SummaryCard({
  label,
  value,
  color,
  highlight,
  testID,
}: {
  label: string;
  value: string;
  color: string;
  highlight?: boolean;
  testID?: string;
}) {
  return (
    <View
      style={[
        styles.summaryCard,
        highlight && {
          borderColor: color,
          backgroundColor: "rgba(16, 185, 129, 0.08)",
        },
      ]}
      testID={testID}
    >
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, { color }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: spacing.xl, paddingTop: spacing.lg },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  reportBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.primaryMuted,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primaryGlow,
  },
  reportBtnText: { color: colors.primaryGlow, fontSize: 12, fontWeight: "700" },
  h1: {
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: "300",
    letterSpacing: -0.5,
    marginBottom: 0,
  },

  // Summary row
  summaryRow: { flexDirection: "row", gap: spacing.sm },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  summaryLabel: {
    color: colors.textTertiary,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  summaryValue: { fontSize: 16, fontWeight: "700", letterSpacing: -0.3 },

  // Debt manager button
  debtMgrBtn: {
    marginTop: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderColor: "rgba(239, 68, 68, 0.25)",
    borderWidth: 1,
    borderRadius: radius.lg,
  },
  debtMgrIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  debtMgrTitle: { color: colors.textPrimary, fontWeight: "700", fontSize: 14 },
  debtMgrSub: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },

  // Sections
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.xxl,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
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
  list: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  empty: {
    color: colors.textTertiary,
    padding: spacing.xl,
    textAlign: "center",
  },

  // Rows
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: "600" },
  rowSub: { color: colors.textSecondary, fontSize: 12, marginTop: 2, textTransform: "capitalize" },

  // Income rows
  incomeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  incomeAmount: {
    color: colors.success,
    fontWeight: "700",
    fontSize: 15,
  },

  // Expense rows
  expenseRow: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    gap: spacing.sm,
  },
  expenseTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  expenseAmount: {
    color: colors.textPrimary,
    fontWeight: "700",
    fontSize: 15,
  },
  barTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderSubtle,
    overflow: "hidden",
  },
  barFill: { height: "100%", borderRadius: 2 },
});
