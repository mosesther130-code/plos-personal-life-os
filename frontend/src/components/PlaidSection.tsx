import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import {
  Landmark,
  RefreshCw,
  Trash2,
  Link2,
  ChevronRight,
  ShieldCheck,
} from "lucide-react-native";
import { useRouter } from "expo-router";
import { plaidApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";

const fmtUSD = (n?: number | null) =>
  typeof n === "number" && !isNaN(n) ? `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";

const typeColor: Record<string, string> = {
  depository: colors.primaryGlow,
  credit: colors.danger,
  investment: "#F59E0B",
  loan: "#A78BFA",
};

const subtypeLabel: Record<string, string> = {
  checking: "Checking",
  savings: "Savings",
  "credit card": "Credit Card",
  brokerage: "Brokerage",
  ira: "IRA",
  "401k": "401(k)",
};

export function PlaidSection() {
  const router = useRouter();
  const [status, setStatus] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [busy, setBusy] = useState<{ id: string; kind: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, it, sum] = await Promise.all([
        plaidApi.status(),
        plaidApi.listItems(),
        plaidApi.summary().catch(() => null),
      ]);
      setStatus(s);
      setItems(it.items || []);
      setSummary(sum);
    } catch (_e) {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const connect = async () => {
    setConnecting(true);
    try {
      const tok = await plaidApi.createLinkToken();
      if (tok.sandbox_fallback) {
        // No real Plaid credentials → seed sandbox data
        await plaidApi.sandboxSimulate();
        await load();
        Alert.alert(
          "Sandbox Bank Connected",
          "Plaid credentials not configured yet. A sandbox institution (First Platypus Bank) with 9 realistic seed transactions has been added so you can test the UI. Once you paste your Plaid keys, this button will open the real Plaid Link flow.",
        );
      } else if (Platform.OS === "web") {
        // Real Plaid Link SDK is native-only; guide user to open on device build
        Alert.alert(
          "Native Build Required",
          "Plaid Link opens a secure bank-login screen that only works on iOS/Android device builds. Publish PLOS (right-top Publish) and open on your device to complete a real bank connection. Web preview uses the sandbox seed data.",
          [
            { text: "OK" },
            { text: "Use Sandbox Instead", onPress: async () => {
              await plaidApi.sandboxSimulate(); await load();
            }},
          ],
        );
      } else {
        // Native: dynamically load the Plaid SDK to avoid web bundle errors
        try {
          // Dynamic require to prevent Metro from bundling this on web
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const modName = "react-native-plaid-link-sdk";
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const plaidLink = require(modName);
          plaidLink.create({ token: tok.link_token });
          plaidLink.open({
            onSuccess: async (success: any) => {
              try {
                await plaidApi.exchangeToken(success.publicToken);
                await load();
                Alert.alert("Bank Connected", "Your accounts are syncing now.");
              } catch (e: any) {
                Alert.alert("Connection failed", e?.message || "Unknown error");
              }
            },
            onExit: (exit: any) => {
              if (exit?.error) console.log("Plaid exit error:", exit.error);
            },
          });
        } catch (_e) {
          Alert.alert(
            "SDK not installed",
            "react-native-plaid-link-sdk is not bundled in this build. Publish PLOS to generate a native build with Plaid included.",
          );
        }
      }
    } catch (e: any) {
      Alert.alert("Could not start", e?.message || "Failed to create link token");
    }
    setConnecting(false);
  };

  const refresh = async (it: any) => {
    setBusy({ id: it.item_id, kind: "refresh" });
    try {
      await plaidApi.refresh(it.item_id);
      await load();
    } catch (_e) {}
    setBusy(null);
  };

  const disconnect = async (it: any) => {
    const proceed = async () => {
      setBusy({ id: it.item_id, kind: "delete" });
      try { await plaidApi.disconnect(it.item_id); await load(); } catch (_e) {}
      setBusy(null);
    };
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm(`Disconnect ${it.institution_name}? All transaction history will be removed.`)) proceed();
      return;
    }
    Alert.alert(
      "Disconnect bank?",
      `${it.institution_name} — all transaction history will be removed.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Disconnect", style: "destructive", onPress: proceed },
      ],
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color={colors.primaryGlow} />
      </View>
    );
  }

  const noItems = items.length === 0;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Landmark size={16} color={colors.primaryGlow} />
          <Text style={styles.headerTitle}>Bank Accounts</Text>
          {status && !status.has_real_keys ? (
            <View style={styles.sandboxPill}>
              <Text style={styles.sandboxPillText}>SANDBOX</Text>
            </View>
          ) : (
            <View style={[styles.sandboxPill, { backgroundColor: "rgba(16,185,129,0.15)", borderColor: colors.success }]}>
              <Text style={[styles.sandboxPillText, { color: colors.success }]}>LIVE · {String(status?.env || "").toUpperCase()}</Text>
            </View>
          )}
        </View>
        <TouchableOpacity onPress={() => router.push("/finance/transactions")} testID="view-transactions" hitSlop={8}>
          <Text style={styles.viewAllLink}>View Transactions →</Text>
        </TouchableOpacity>
      </View>

      {noItems ? (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIcon}><Link2 size={22} color={colors.primaryGlow} /></View>
          <Text style={styles.emptyTitle}>Connect a Bank Account</Text>
          <Text style={styles.emptySub}>
            Link your bank via Plaid to auto-sync real balances, transactions, and investments.
            Encrypted end-to-end. Read-only access.
          </Text>
          <TouchableOpacity
            style={styles.connectBtn}
            onPress={connect}
            disabled={connecting}
            testID="plaid-connect"
            activeOpacity={0.85}
          >
            {connecting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Link2 size={14} color="#fff" />
                <Text style={styles.connectBtnText}>Connect Bank Account</Text>
              </>
            )}
          </TouchableOpacity>
          <View style={styles.trustRow}>
            <ShieldCheck size={11} color={colors.success} />
            <Text style={styles.trustText}>Powered by Plaid · used by Chase, Venmo, Robinhood</Text>
          </View>
        </View>
      ) : (
        <>
          {summary && summary.items_connected > 0 ? (
            <View style={styles.summaryCard}>
              <View style={styles.summaryHeader}>
                <ShieldCheck size={11} color={colors.success} />
                <Text style={styles.summaryTitle}>Live from Plaid · last 30 days</Text>
              </View>
              <View style={styles.summaryGrid}>
                <View style={styles.summaryCell}>
                  <Text style={styles.summaryCellLabel}>BALANCE</Text>
                  <Text style={styles.summaryCellValue}>{fmtUSD(summary.total_balance)}</Text>
                </View>
                <View style={styles.summaryCell}>
                  <Text style={styles.summaryCellLabel}>INCOME</Text>
                  <Text style={[styles.summaryCellValue, { color: colors.success }]}>+{fmtUSD(summary.income_30d)}</Text>
                </View>
                <View style={styles.summaryCell}>
                  <Text style={styles.summaryCellLabel}>SPENT</Text>
                  <Text style={[styles.summaryCellValue, { color: colors.danger }]}>-{fmtUSD(summary.expenses_30d)}</Text>
                </View>
                <View style={styles.summaryCell}>
                  <Text style={styles.summaryCellLabel}>SURPLUS</Text>
                  <Text style={[styles.summaryCellValue, {
                    color: summary.monthly_surplus >= 0 ? colors.success : colors.danger,
                  }]}>
                    {summary.monthly_surplus >= 0 ? "+" : ""}{fmtUSD(summary.monthly_surplus)}
                  </Text>
                </View>
              </View>
            </View>
          ) : null}
          {items.map((it) => {
            const b = busy?.id === it.item_id ? busy.kind : null;
            const accts: any[] = it.accounts || [];
            return (
              <View key={it.item_id} style={styles.itemCard} testID={`plaid-item-${it.item_id}`}>
                <View style={styles.itemHeader}>
                  <View style={styles.instIcon}><Landmark size={16} color={colors.primaryGlow} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.instName}>{it.institution_name}</Text>
                    <Text style={styles.instMeta}>
                      {accts.length} account{accts.length === 1 ? "" : "s"}
                      {it.last_synced ? ` · synced ${new Date(it.last_synced).toLocaleString()}` : ""}
                    </Text>
                  </View>
                  <View style={[styles.statusDot, {
                    backgroundColor:
                      it.status === "healthy" ? colors.success :
                      it.status === "login_required" ? colors.danger : "#F59E0B",
                  }]} />
                </View>

                {accts.map((a: any) => {
                  const bal = a.balances || {};
                  const curr = bal.current;
                  const badgeColor = typeColor[a.type] || colors.textTertiary;
                  const label = subtypeLabel[a.subtype] || (a.subtype || a.type || "").toUpperCase();
                  return (
                    <View key={a.account_id} style={styles.acctRow}>
                      <View style={[styles.acctBadge, { borderColor: badgeColor, backgroundColor: badgeColor + "22" }]}>
                        <Text style={[styles.acctBadgeText, { color: badgeColor }]}>{label}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.acctName}>{a.name}</Text>
                        {a.mask ? <Text style={styles.acctMask}>····{a.mask}</Text> : null}
                      </View>
                      <Text style={[styles.acctBal, a.type === "credit" && { color: colors.danger }]}>
                        {fmtUSD(curr)}
                      </Text>
                    </View>
                  );
                })}

                <View style={styles.itemActions}>
                  <TouchableOpacity
                    style={styles.itemActionBtn}
                    onPress={() => refresh(it)}
                    disabled={!!b}
                    hitSlop={8}
                    testID={`plaid-refresh-${it.item_id}`}
                  >
                    {b === "refresh" ? <ActivityIndicator size="small" color={colors.primaryGlow} /> :
                      <RefreshCw size={13} color={colors.primaryGlow} />}
                    <Text style={styles.itemActionText}>{b === "refresh" ? "Syncing…" : "Refresh"}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.itemActionBtn}
                    onPress={() => router.push("/finance/transactions")}
                    hitSlop={8}
                  >
                    <ChevronRight size={13} color={colors.textSecondary} />
                    <Text style={styles.itemActionText}>Transactions</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.itemActionBtn}
                    onPress={() => disconnect(it)}
                    disabled={!!b}
                    hitSlop={8}
                    testID={`plaid-disconnect-${it.item_id}`}
                  >
                    {b === "delete" ? <ActivityIndicator size="small" color={colors.danger} /> :
                      <Trash2 size={13} color={colors.danger} />}
                    <Text style={[styles.itemActionText, { color: colors.danger }]}>Disconnect</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}

          <TouchableOpacity
            style={styles.addAnotherBtn}
            onPress={connect}
            disabled={connecting}
            testID="plaid-connect-another"
            activeOpacity={0.85}
          >
            {connecting ? <ActivityIndicator color={colors.primaryGlow} size="small" /> : (
              <>
                <Link2 size={13} color={colors.primaryGlow} />
                <Text style={styles.addAnotherText}>Connect Another Bank</Text>
              </>
            )}
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: spacing.md },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1 },
  headerTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: "700" },
  sandboxPill: { backgroundColor: "rgba(245,158,11,0.15)", borderColor: "#F59E0B", borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm },
  sandboxPillText: { color: "#F59E0B", fontSize: 8, fontWeight: "700", letterSpacing: 0.8 },
  viewAllLink: { color: colors.primaryGlow, fontSize: 11, fontWeight: "600" },

  emptyCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderSubtle, padding: spacing.lg, alignItems: "center" },
  emptyIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primaryMuted, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  emptyTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: "700", marginBottom: 4 },
  emptySub: { color: colors.textTertiary, fontSize: 12, textAlign: "center", lineHeight: 17, marginBottom: spacing.md },
  connectBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.primary, paddingVertical: 12, paddingHorizontal: 20, borderRadius: radius.md, minWidth: 220 },
  connectBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  trustRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: spacing.sm },
  trustText: { color: colors.textTertiary, fontSize: 10 },

  itemCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderSubtle, overflow: "hidden", marginBottom: spacing.sm },
  summaryCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.success, padding: spacing.md, marginBottom: spacing.sm },
  summaryHeader: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: spacing.sm },
  summaryTitle: { color: colors.success, fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap" },
  summaryCell: { width: "50%", paddingVertical: 6 },
  summaryCellLabel: { color: colors.textTertiary, fontSize: 9, fontWeight: "700", letterSpacing: 0.6 },
  summaryCellValue: { color: colors.textPrimary, fontSize: 15, fontWeight: "700", marginTop: 2 },
  itemHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  instIcon: { width: 32, height: 32, borderRadius: radius.md, backgroundColor: colors.primaryMuted, alignItems: "center", justifyContent: "center" },
  instName: { color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
  instMeta: { color: colors.textTertiary, fontSize: 10, marginTop: 2 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },

  acctRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: spacing.md, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  acctBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm, borderWidth: 1 },
  acctBadgeText: { fontSize: 9, fontWeight: "700", letterSpacing: 0.5 },
  acctName: { color: colors.textPrimary, fontSize: 12, fontWeight: "600" },
  acctMask: { color: colors.textTertiary, fontSize: 10, marginTop: 1 },
  acctBal: { color: colors.success, fontSize: 14, fontWeight: "700" },

  itemActions: { flexDirection: "row" },
  itemActionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 10, borderRightWidth: 1, borderRightColor: colors.borderSubtle },
  itemActionText: { color: colors.primaryGlow, fontSize: 11, fontWeight: "600" },

  addAnotherBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderWidth: 1, borderStyle: "dashed", borderColor: colors.primary, borderRadius: radius.md, backgroundColor: colors.primaryMuted },
  addAnotherText: { color: colors.primaryGlow, fontSize: 12, fontWeight: "600" },
});
