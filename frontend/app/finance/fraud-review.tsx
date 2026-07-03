import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, ShieldAlert, ShieldCheck, AlertOctagon, Phone } from "lucide-react-native";
import { plaidApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";

export default function FraudReviewScreen() {
  const router = useRouter();
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await plaidApi.fraudAlerts();
      setAlerts(r.alerts || []);
    } catch (_e) {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const runScan = async () => {
    setScanning(true);
    try {
      const r = await plaidApi.fraudScan(30);
      Alert.alert("Scan complete", `Scanned ${r.scanned} transactions — ${r.flagged} flagged, ${r.alerts_created} new alerts.`);
      await load();
    } catch (_e) {
      Alert.alert("Scan failed", "Try again shortly.");
    }
    setScanning(false);
  };

  const resolve = async (alert_id: string, decision: "trusted" | "disputed" | "reported") => {
    setResolving(alert_id);
    try {
      await plaidApi.resolveFraud(alert_id, decision);
      await load();
    } catch (_e) {}
    setResolving(null);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} testID="fraud-back">
          <ArrowLeft color={colors.textPrimary} size={20} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Fraud Review</Text>
        <TouchableOpacity style={styles.scanBtn} onPress={runScan} disabled={scanning} testID="fraud-scan">
          {scanning ? <ActivityIndicator size="small" color="#fff" /> : <ShieldAlert size={13} color="#fff" />}
          <Text style={styles.scanBtnText}>{scanning ? "Scanning…" : "Scan Now"}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {loading ? (
          <ActivityIndicator color={colors.primaryGlow} style={{ marginTop: 30 }} />
        ) : alerts.length === 0 ? (
          <View style={styles.empty}>
            <ShieldCheck size={36} color={colors.success} />
            <Text style={styles.emptyTitle}>No fraud alerts</Text>
            <Text style={styles.emptySub}>Tap Scan Now to check the last 30 days of transactions for suspicious activity.</Text>
          </View>
        ) : (
          alerts.map((a) => {
            const isResolved = a.status === "resolved";
            return (
              <View key={a.alert_id} style={[styles.card, isResolved && { opacity: 0.55 }]} testID={`fraud-${a.alert_id}`}>
                <View style={styles.cardHeader}>
                  <AlertOctagon size={16} color={colors.danger} />
                  <Text style={styles.cardTitle} numberOfLines={2}>{a.merchant_name}</Text>
                  <Text style={styles.cardAmount}>${Number(a.amount).toFixed(2)}</Text>
                </View>
                <Text style={styles.cardMeta}>{a.date} · {a.signal_count} signal{a.signal_count === 1 ? "" : "s"} · {isResolved ? `Resolved (${a.decision})` : "OPEN"}</Text>
                {a.signals?.map((s: any, i: number) => (
                  <View key={i} style={styles.signalRow}>
                    <Text style={styles.signalCode}>{s.code}</Text>
                    <Text style={styles.signalDesc}>{s.desc}</Text>
                  </View>
                ))}
                {!isResolved ? (
                  <View style={styles.actionRow}>
                    <TouchableOpacity style={[styles.actionBtn, { borderColor: colors.success }]} onPress={() => resolve(a.alert_id, "trusted")} disabled={resolving === a.alert_id}>
                      <ShieldCheck size={12} color={colors.success} />
                      <Text style={[styles.actionText, { color: colors.success }]}>Not fraud</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionBtn, { borderColor: "#F59E0B" }]} onPress={() => resolve(a.alert_id, "disputed")} disabled={resolving === a.alert_id}>
                      <AlertOctagon size={12} color="#F59E0B" />
                      <Text style={[styles.actionText, { color: "#F59E0B" }]}>Dispute</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionBtn, { borderColor: colors.danger }]} onPress={() => resolve(a.alert_id, "reported")} disabled={resolving === a.alert_id}>
                      <Phone size={12} color={colors.danger} />
                      <Text style={[styles.actionText, { color: colors.danger }]}>Report</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle, gap: spacing.sm },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, color: colors.textPrimary, fontSize: 17, fontWeight: "700" },
  scanBtn: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.danger, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.sm },
  scanBtnText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  scroll: { padding: spacing.md },
  empty: { alignItems: "center", padding: 40, gap: 8 },
  emptyTitle: { color: colors.success, fontSize: 15, fontWeight: "700", marginTop: 8 },
  emptySub: { color: colors.textTertiary, fontSize: 12, textAlign: "center", lineHeight: 17 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.danger, padding: spacing.md, marginBottom: spacing.sm },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { flex: 1, color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
  cardAmount: { color: colors.danger, fontSize: 15, fontWeight: "700" },
  cardMeta: { color: colors.textTertiary, fontSize: 10, marginTop: 4 },
  signalRow: { flexDirection: "row", gap: 6, marginTop: 6, alignItems: "flex-start" },
  signalCode: { color: "#F59E0B", fontSize: 9, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase", minWidth: 90 },
  signalDesc: { color: colors.textSecondary, fontSize: 11, flex: 1, lineHeight: 15 },
  actionRow: { flexDirection: "row", gap: 6, marginTop: spacing.sm },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 8, borderWidth: 1, borderRadius: radius.sm },
  actionText: { fontSize: 10, fontWeight: "700" },
});
