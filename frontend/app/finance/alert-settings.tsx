import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Switch, TouchableOpacity, ActivityIndicator, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Bell, Save, History } from "lucide-react-native";
import { plaidApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";

type Settings = {
  large_tx_enabled: boolean;
  large_tx_threshold_usd: number;
  budget_alerts_enabled: boolean;
  budget_threshold_pct: number;
  income_alerts_enabled: boolean;
  new_subscription_alerts_enabled: boolean;
  fraud_alerts_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
};

export default function AlertSettingsScreen() {
  const router = useRouter();
  const [s, setS] = useState<Settings | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cur, h] = await Promise.all([plaidApi.alertSettings(), plaidApi.alertHistory(90)]);
      setS(cur);
      setHistory(h.alerts || []);
    } catch (_e) {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!s) return;
    setSaving(true);
    try {
      const updated = await plaidApi.updateAlertSettings(s);
      setS(updated);
    } catch (_e) {}
    setSaving(false);
  };

  const set = <K extends keyof Settings>(key: K, val: Settings[K]) => setS((prev) => (prev ? { ...prev, [key]: val } : prev));

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} testID="alert-back">
          <ArrowLeft color={colors.textPrimary} size={20} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Alert Settings</Text>
        <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving || !s} testID="save-settings">
          {saving ? <ActivityIndicator size="small" color="#fff" /> : <Save size={13} color="#fff" />}
          <Text style={styles.saveBtnText}>Save</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {loading || !s ? (
          <ActivityIndicator color={colors.primaryGlow} style={{ marginTop: 30 }} />
        ) : (
          <>
            <Text style={styles.section}>Transaction Alerts</Text>
            <SettingRow title="Large Transaction Alerts" desc="Notify when a debit exceeds threshold" value={s.large_tx_enabled} onChange={(v) => set("large_tx_enabled", v)} testID="toggle-large-tx" />
            <View style={styles.sliderRow}>
              <Text style={styles.sliderLabel}>Threshold ($)</Text>
              <TextInput
                style={styles.numInput}
                value={String(s.large_tx_threshold_usd)}
                onChangeText={(v) => set("large_tx_threshold_usd", Number(v) || 0)}
                keyboardType="numeric"
                testID="input-large-tx-threshold"
              />
            </View>

            <SettingRow title="Budget Threshold Alerts" desc="Notify when a category budget is crossed" value={s.budget_alerts_enabled} onChange={(v) => set("budget_alerts_enabled", v)} testID="toggle-budget" />
            <View style={styles.sliderRow}>
              <Text style={styles.sliderLabel}>Alert at (%)</Text>
              <TextInput
                style={styles.numInput}
                value={String(s.budget_threshold_pct)}
                onChangeText={(v) => set("budget_threshold_pct", Number(v) || 0)}
                keyboardType="numeric"
                testID="input-budget-pct"
              />
            </View>

            <SettingRow title="Income Received Alerts" desc="Notify when payroll or SNAP hits your account" value={s.income_alerts_enabled} onChange={(v) => set("income_alerts_enabled", v)} testID="toggle-income" />
            <SettingRow title="New Subscription Detected" desc="Alert on unfamiliar recurring charges" value={s.new_subscription_alerts_enabled} onChange={(v) => set("new_subscription_alerts_enabled", v)} testID="toggle-subs" />
            <SettingRow title="Fraud Detection" desc="7-signal engine (recommended always on)" value={s.fraud_alerts_enabled} onChange={(v) => set("fraud_alerts_enabled", v)} testID="toggle-fraud" />

            <Text style={styles.section}>Quiet Hours</Text>
            <View style={styles.quietRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sliderLabel}>Start</Text>
                <TextInput style={styles.timeInput} value={s.quiet_hours_start} onChangeText={(v) => set("quiet_hours_start", v)} placeholder="22:00" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sliderLabel}>End</Text>
                <TextInput style={styles.timeInput} value={s.quiet_hours_end} onChangeText={(v) => set("quiet_hours_end", v)} placeholder="07:00" />
              </View>
            </View>
            <Text style={styles.quietNote}>Fraud alerts bypass quiet hours.</Text>

            <TouchableOpacity style={styles.historyBtn} onPress={() => setShowHistory(!showHistory)} testID="toggle-history">
              <History size={13} color={colors.primaryGlow} />
              <Text style={styles.historyBtnText}>{showHistory ? "Hide" : "Show"} Alert History ({history.length})</Text>
            </TouchableOpacity>

            {showHistory ? (
              <View style={styles.historyList}>
                {history.length === 0 ? (
                  <Text style={styles.emptyText}>No alerts in the last 90 days.</Text>
                ) : (
                  history.slice(0, 50).map((a, i) => (
                    <View key={i} style={styles.historyRow}>
                      <Bell size={11} color={colors.primaryGlow} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.historyMsg} numberOfLines={2}>{a.message}</Text>
                        <Text style={styles.historyMeta}>{a.event} · {new Date(a.created_at).toLocaleString()}</Text>
                      </View>
                    </View>
                  ))
                )}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingRow({ title, desc, value, onChange, testID }: any) {
  return (
    <View style={rowStyles.container}>
      <View style={{ flex: 1 }}>
        <Text style={rowStyles.title}>{title}</Text>
        <Text style={rowStyles.desc}>{desc}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: "#333", true: colors.primary }}
        thumbColor={value ? "#fff" : "#888"}
        testID={testID}
      />
    </View>
  );
}

const rowStyles = StyleSheet.create({
  container: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  title: { color: colors.textPrimary, fontSize: 13, fontWeight: "600" },
  desc: { color: colors.textTertiary, fontSize: 11, marginTop: 2 },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle, gap: spacing.sm },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, color: colors.textPrimary, fontSize: 17, fontWeight: "700" },
  saveBtn: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.sm },
  saveBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  scroll: { padding: spacing.md, paddingBottom: 60 },
  section: { color: colors.textTertiary, fontSize: 10, fontWeight: "700", letterSpacing: 0.6, marginTop: spacing.lg, marginBottom: 4 },
  sliderRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, gap: spacing.md, paddingLeft: spacing.md },
  sliderLabel: { color: colors.textSecondary, fontSize: 11, flex: 1 },
  numInput: { color: colors.textPrimary, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 6, minWidth: 80, textAlign: "right" },
  quietRow: { flexDirection: "row", gap: spacing.md, marginTop: 8 },
  timeInput: { color: colors.textPrimary, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 8, marginTop: 4 },
  quietNote: { color: colors.textTertiary, fontSize: 10, marginTop: 4, fontStyle: "italic" },
  historyBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: spacing.lg, paddingVertical: 12, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: radius.md, backgroundColor: colors.surface },
  historyBtnText: { color: colors.primaryGlow, fontSize: 12, fontWeight: "600" },
  historyList: { marginTop: spacing.sm },
  historyRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  historyMsg: { color: colors.textPrimary, fontSize: 12, lineHeight: 16 },
  historyMeta: { color: colors.textTertiary, fontSize: 9, marginTop: 2 },
  emptyText: { color: colors.textTertiary, fontSize: 12, textAlign: "center", padding: 20 },
});
