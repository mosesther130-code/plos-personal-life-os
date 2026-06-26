// Breach Monitoring screen
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, AlertOctagon, KeyRound, CheckCircle, ShieldCheck } from "lucide-react-native";

import { securityApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";

export default function Breach() {
  const router = useRouter();
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [keyBusy, setKeyBusy] = useState(false);
  const [resolveBusy, setResolveBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await securityApi.breaches();
    setData(r);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await load();
      } catch (_e) {}
      setLoading(false);
    })();
  }, [load]);

  const saveKey = async () => {
    setKeyBusy(true);
    try {
      await securityApi.setHibpKey(keyInput.trim());
      setKeyInput("");
      await load();
    } catch (_e) {}
    setKeyBusy(false);
  };

  const resolveOne = async (id: string) => {
    setResolveBusy(id);
    try {
      await securityApi.resolveBreach(id);
      await load();
    } catch (_e) {}
    setResolveBusy(null);
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

  const breaches: any[] = data?.breaches || [];
  const active = breaches.filter((b) => b.status === "active");
  const resolved = breaches.filter((b) => b.status !== "active");

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} testID="breach-back">
          <ArrowLeft color={colors.textPrimary} size={20} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Breach Monitor</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }} tintColor={colors.primaryGlow} />
        }
      >
        {data?.is_demo && (
          <View style={styles.demoBanner} testID="breach-demo-banner">
            <Text style={styles.demoText}>
              DEMO MODE · Breach data is simulated. Add your HaveIBeenPwned API key below to enable live monitoring.
            </Text>
          </View>
        )}

        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>Monitoring</Text>
          <Text style={styles.heroEmail} numberOfLines={1}>
            {data?.checked_email || "—"}
          </Text>
          <Text style={styles.heroSub}>
            {active.length} active · {resolved.length} resolved
          </Text>
        </View>

        {/* HIBP Key */}
        <View style={styles.keyCard} testID="hibp-key-card">
          <View style={styles.keyHead}>
            <KeyRound size={14} color={colors.primaryGlow} />
            <Text style={styles.keyTitle}>HaveIBeenPwned API Key</Text>
          </View>
          <Text style={styles.keyDesc}>
            {data?.has_hibp_key
              ? "Live monitoring enabled. Replace key:"
              : "Without a key, breach data is seeded for demo only."}
          </Text>
          <View style={styles.keyRow}>
            <TextInput
              value={keyInput}
              onChangeText={setKeyInput}
              placeholder={data?.has_hibp_key ? "•••• (currently set)" : "hibp-..."}
              placeholderTextColor={colors.textTertiary}
              style={styles.keyInput}
              autoCapitalize="none"
              testID="hibp-key-input"
            />
            <TouchableOpacity
              onPress={saveKey}
              disabled={keyBusy || !keyInput.trim()}
              style={[styles.keyBtn, !keyInput.trim() && { opacity: 0.5 }]}
              testID="hibp-save"
            >
              {keyBusy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.keyBtnText}>Save</Text>}
            </TouchableOpacity>
          </View>
        </View>

        {/* Active breaches */}
        {active.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Active Exposures</Text>
            {active.map((b: any) => (
              <View key={b.breach_id} style={styles.breachCard} testID={`breach-${b.breach_id}`}>
                <View style={styles.breachHead}>
                  <AlertOctagon color={colors.danger} size={18} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.breachName}>{b.breach_name}</Text>
                    <Text style={styles.breachDate}>Breached {b.breach_date}</Text>
                  </View>
                </View>
                <View style={styles.tagsRow}>
                  {b.data_types_exposed.map((t: string) => (
                    <View key={t} style={styles.tag}>
                      <Text style={styles.tagText}>{t}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.recAction}>{b.recommended_action}</Text>
                <TouchableOpacity
                  onPress={() => resolveOne(b.breach_id)}
                  disabled={resolveBusy === b.breach_id}
                  style={styles.resolveBtn}
                  testID={`resolve-${b.breach_id}`}
                >
                  {resolveBusy === b.breach_id ? (
                    <ActivityIndicator size="small" color={colors.success} />
                  ) : (
                    <>
                      <CheckCircle size={12} color={colors.success} />
                      <Text style={styles.resolveText}>I&apos;ve updated the password</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}

        {/* Resolved */}
        {resolved.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Resolved</Text>
            {resolved.map((b: any) => (
              <View key={b.breach_id} style={styles.resolvedCard}>
                <ShieldCheck size={14} color={colors.success} />
                <Text style={styles.resolvedName}>{b.breach_name}</Text>
                <Text style={styles.resolvedDate}>{b.breach_date}</Text>
              </View>
            ))}
          </>
        )}

        {/* 2FA recommendations */}
        <Text style={styles.sectionLabel}>2FA Checklist</Text>
        <View style={styles.tfaCard}>
          <Text style={styles.tfaText}>Enable 2-factor authentication on every account that appeared in a breach:</Text>
          <Text style={styles.tfaItem}>• Primary email (Gmail / iCloud)</Text>
          <Text style={styles.tfaItem}>• LinkedIn, Canva, Adobe (all breached accounts)</Text>
          <Text style={styles.tfaItem}>• Banking + brokerage logins (Wells Fargo, Chase, Vanguard)</Text>
          <Text style={styles.tfaItem}>• Password manager master account</Text>
        </View>

        <View style={{ height: 80 }} />
      </ScrollView>
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
    width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.surfaceElevated,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  scroll: { padding: spacing.xl, paddingTop: spacing.md, gap: spacing.md },
  demoBanner: {
    backgroundColor: "rgba(245,158,11,0.12)",
    borderColor: "rgba(245,158,11,0.35)",
    borderWidth: 1,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  demoText: { color: colors.warning, fontSize: 12, lineHeight: 17 },
  heroCard: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: 4,
  },
  heroLabel: { color: colors.textTertiary, fontSize: 10, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase" },
  heroEmail: { color: colors.textPrimary, fontSize: 18, fontWeight: "700" },
  heroSub: { color: colors.textSecondary, fontSize: 12 },
  keyCard: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  keyHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  keyTitle: { color: colors.textPrimary, fontWeight: "700", fontSize: 13 },
  keyDesc: { color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  keyRow: { flexDirection: "row", gap: spacing.sm },
  keyInput: {
    flex: 1,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.sm,
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 13,
  },
  keyBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 64,
  },
  keyBtnText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  sectionLabel: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginTop: spacing.lg,
  },
  breachCard: {
    backgroundColor: colors.surface,
    borderColor: "rgba(239,68,68,0.25)",
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  breachHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  breachName: { color: colors.textPrimary, fontWeight: "700", fontSize: 14 },
  breachDate: { color: colors.textTertiary, fontSize: 11, marginTop: 2 },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm, backgroundColor: colors.surfaceElevated },
  tagText: { color: colors.textPrimary, fontSize: 10, fontWeight: "700" },
  recAction: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
  resolveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(16,185,129,0.10)",
    paddingVertical: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.25)",
  },
  resolveText: { color: colors.success, fontWeight: "700", fontSize: 12 },
  resolvedCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  resolvedName: { color: colors.textPrimary, fontWeight: "700", fontSize: 13, flex: 1 },
  resolvedDate: { color: colors.textTertiary, fontSize: 11 },
  tfaCard: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: 6,
  },
  tfaText: { color: colors.textPrimary, fontSize: 13, lineHeight: 19, marginBottom: 4 },
  tfaItem: { color: colors.textSecondary, fontSize: 13, lineHeight: 20 },
});
