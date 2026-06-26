import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Wallet, CreditCard, Receipt } from "lucide-react-native";

import { financeApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";
import { Card } from "@/src/components/Card";

const fmtUSD = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export default function Finance() {
  const [income, setIncome] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [debts, setDebts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [i, e, d] = await Promise.all([
        financeApi.listIncome(),
        financeApi.listExpenses(),
        financeApi.listDebts(),
      ]);
      setIncome(i);
      setExpenses(e);
      setDebts(d);
    } catch (_e) {}
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.loader}>
          <ActivityIndicator color={colors.primaryGlow} />
        </View>
      </SafeAreaView>
    );
  }

  const totalIncome = income.reduce(
    (s, i) => s + (i.is_active ? i.net_monthly : 0),
    0
  );
  const totalExpenses = expenses.reduce((s, e) => s + e.monthly_amount, 0);
  const totalDebt = debts.reduce((s, d) => s + d.balance, 0);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
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
        <Text style={styles.h1}>Finance</Text>

        {/* Income */}
        <Section
          icon={<Wallet color={colors.success} size={18} />}
          title="Income"
          subtitle={`${fmtUSD(totalIncome)} / month`}
          testID="finance-income-section"
        >
          {income.length === 0 ? (
            <Text style={styles.empty}>No income sources yet</Text>
          ) : (
            income.map((i) => (
              <Row
                key={i.income_id}
                title={i.source_name}
                sub={i.type.toUpperCase()}
                amount={fmtUSD(i.net_monthly)}
                color={colors.success}
              />
            ))
          )}
        </Section>

        {/* Expenses */}
        <Section
          icon={<Receipt color={colors.warning} size={18} />}
          title="Expenses"
          subtitle={`${fmtUSD(totalExpenses)} / month`}
          testID="finance-expenses-section"
        >
          {expenses.length === 0 ? (
            <Text style={styles.empty}>No expenses tracked</Text>
          ) : (
            expenses.map((e) => (
              <Row
                key={e.expense_id}
                title={e.vendor}
                sub={`${e.category} · Day ${e.due_day_of_month}`}
                amount={fmtUSD(e.monthly_amount)}
                color={colors.danger}
              />
            ))
          )}
        </Section>

        {/* Debts */}
        <Section
          icon={<CreditCard color={colors.danger} size={18} />}
          title="Debts"
          subtitle={`${fmtUSD(totalDebt)} total balance`}
          testID="finance-debts-section"
        >
          {debts.length === 0 ? (
            <Text style={styles.empty}>No debts tracked</Text>
          ) : (
            debts.map((d) => (
              <Row
                key={d.debt_id}
                title={d.lender}
                sub={`${d.debt_type.replace("_", " ")} · ${d.apr}% APR`}
                amount={fmtUSD(d.balance)}
                color={colors.danger}
              />
            ))
          )}
        </Section>

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({
  icon,
  title,
  subtitle,
  children,
  testID,
}: any) {
  return (
    <View style={{ marginTop: spacing.xxl }} testID={testID}>
      <View style={styles.secHeader}>
        <View style={styles.iconBox}>{icon}</View>
        <View style={{ flex: 1 }}>
          <Text style={styles.secTitle}>{title}</Text>
          <Text style={styles.secSub}>{subtitle}</Text>
        </View>
      </View>
      <Card style={{ padding: 0 }}>{children}</Card>
    </View>
  );
}

function Row({
  title,
  sub,
  amount,
  color,
}: {
  title: string;
  sub: string;
  amount: string;
  color: string;
}) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSub}>{sub}</Text>
      </View>
      <Text style={[styles.rowAmount, { color }]}>{amount}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: spacing.xl, paddingTop: spacing.lg },
  h1: {
    color: colors.textPrimary,
    fontSize: 30,
    fontWeight: "300",
    letterSpacing: -0.5,
    marginBottom: spacing.md,
  },
  secHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  secTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "600" },
  secSub: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  rowTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: "500" },
  rowSub: {
    color: colors.textTertiary,
    fontSize: 12,
    marginTop: 2,
    textTransform: "capitalize",
  },
  rowAmount: { fontSize: 16, fontWeight: "700" },
  empty: {
    color: colors.textTertiary,
    padding: spacing.xl,
    textAlign: "center",
  },
});
