// Identity & Security overview — threat score, alerts feed, broker scan, quick links.
import React, { useCallback, useEffect, useState } from "react";
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
  AlertTriangle,
  Info,
  CheckCircle,
  AlertCircle,
  ShieldAlert,
  Database,
  CreditCard,
  AlertOctagon,
  LifeBuoy,
  ChevronRight,
  RefreshCw,
} from "lucide-react-native";

import { securityApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";
import { ScoreRing } from "@/src/components/ScoreRing";

function threatColor(score: number) {
  if (score >= 6) return colors.danger;
  if (score >= 3) return colors.warning;
  return colors.success;
}

function sevIcon(sev: string) {
  if (sev === "critical") return <AlertTriangle color={colors.danger} size={16} />;
  if (sev === "warning") return <AlertCircle color={colors.warning} size={16} />;
  if (sev === "resolved") return <CheckCircle color={colors.success} size={16} />;
  return <Info color={colors.primaryGlow} size={16} />;
}

function statusPill(status: string) {
  switch (status) {
    case "pii_found":
      return { label: "PII FOUND", color: colors.danger, bg: "rgba(239,68,68,0.12)" };
    case "opt_out_pending":
      return { label: "OPT-OUT PENDING", color: colors.warning, bg: "rgba(245,158,11,0.12)" };
    case "removed":
      return { label: "REMOVED", color: colors.success, bg: "rgba(16,185,129,0.12)" };
    case "scanning":
      return { label: "SCANNING", color: colors.textTertiary, bg: "rgba(255,255,255,0.06)" };
    default:
      return { label: "CLEAR", color: colors.success, bg: "rgba(16,185,129,0.10)" };
  }
}

function timeAgo(iso?: string) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  const mins = Math.max(1, Math.floor((Date.now() - t) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function SecurityOverview() {
  const router = useRouter();
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [optOutBusy, setOptOutBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const o = await securityApi.overview();
    setData(o);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await load();
      } catch (_e) {}
      setLoading(false);
    })();
  }, [load]);

  const sendOptOut = async (broker_id: string) => {
    setOptOutBusy(broker_id);
    try {
      await securityApi.optOut(broker_id);
      await load();
    } catch (_e) {}
    setOptOutBusy(null);
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

  const threat = data?.threat_score ?? 0;
  const health = data?.security_health_score ?? 0;
  const stats = data?.stats || {};
  const alerts: any[] = data?.alerts || [];
  const brokers: any[] = data?.top_brokers || [];
  const tColor = threatColor(threat);

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
        <Text style={styles.h1}>Identity & Security</Text>
        <Text style={styles.h1Sub}>Real-time monitoring of your digital footprint</Text>

        {/* Threat + Health rings */}
        <View style={styles.heroRow} testID="security-hero">
          <View style={[styles.heroCard, { borderColor: `${tColor}55` }]}>
            <View style={styles.ringWrap}>
              <View style={[styles.threatRing, { borderColor: tColor }]}>
                <Text style={[styles.threatScore, { color: tColor }]}>{threat}</Text>
                <Text style={styles.threatScoreMax}>/10</Text>
              </View>
            </View>
            <Text style={styles.heroLabel}>Threat Score</Text>
            <View style={styles.threatChip}>
              <ShieldAlert size={11} color={tColor} />
              <Text style={[styles.threatChipText, { color: tColor }]}>
                {data?.active_threats_count || 0} active
              </Text>
            </View>
          </View>
          <View style={styles.heroCard}>
            <ScoreRing score={health} size={86} strokeWidth={7} testID="security-health-ring" />
            <Text style={styles.heroLabel}>Security Health</Text>
            <Text style={styles.heroSub}>0—100</Text>
          </View>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow} testID="security-stats">
          <Stat label="Brokers w/ data" value={stats.brokers_with_data ?? 0} accent={colors.danger} />
          <Stat label="Opt-outs sent" value={stats.opt_outs_pending ?? 0} accent={colors.warning} />
          <Stat label="Confirmed removed" value={stats.confirmed_removals ?? 0} accent={colors.success} />
        </View>

        {/* Quick links */}
        <Text style={styles.sectionLabel}>Modules</Text>
        <View style={styles.linksGrid}>
          <LinkTile
            icon={<Database color={colors.danger} size={18} />}
            title="Data Brokers"
            sub={`${stats.brokers_with_data ?? 0} PII listings`}
            onPress={() => router.push("/security/brokers")}
            testID="link-brokers"
          />
          <LinkTile
            icon={<CreditCard color={colors.primaryGlow} size={18} />}
            title="Credit Monitoring"
            sub="3 bureaus tracked"
            onPress={() => router.push("/security/credit")}
            testID="link-credit"
          />
          <LinkTile
            icon={<AlertOctagon color={colors.warning} size={18} />}
            title="Breach Monitor"
            sub={`${stats.active_breaches ?? 0} active`}
            onPress={() => router.push("/security/breach")}
            testID="link-breach"
          />
          <LinkTile
            icon={<LifeBuoy color="#A855F7" size={18} />}
            title="Identity Theft"
            sub="6-step guide"
            onPress={() => router.push("/security/identity-theft-guide")}
            testID="link-guide"
          />
        </View>

        {/* Alerts feed */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionLabel}>Live Security Alerts</Text>
          <TouchableOpacity onPress={load} style={styles.refreshIcon} testID="refresh-alerts">
            <RefreshCw size={14} color={colors.primaryGlow} />
          </TouchableOpacity>
        </View>
        {alerts.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No alerts. You're in the clear.</Text>
          </View>
        ) : (
          alerts.slice(0, 6).map((a: any) => (
            <View key={a.alert_id} style={styles.alertRow} testID={`alert-${a.alert_id}`}>
              <View style={styles.alertHead}>
                {sevIcon(a.severity)}
                <Text style={styles.alertTitle} numberOfLines={1}>
                  {a.title}
                </Text>
                <Text style={styles.alertTime}>{timeAgo(a.created_at)}</Text>
              </View>
              <Text style={styles.alertDesc} numberOfLines={3}>
                {a.description}
              </Text>
            </View>
          ))
        )}

        {/* Broker mini-table */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionLabel}>Top Brokers</Text>
          <TouchableOpacity onPress={() => router.push("/security/brokers")}>
            <Text style={styles.viewAll}>View all</Text>
          </TouchableOpacity>
        </View>
        {brokers.map((b: any) => {
          const p = statusPill(b.status);
          return (
            <View key={b.broker_id} style={styles.brokerRow} testID={`broker-row-${b.broker_id}`}>
              <View style={{ flex: 1 }}>
                <Text style={styles.brokerName}>{b.name}</Text>
                <Text style={styles.brokerSub} numberOfLines={1}>
                  {b.data_exposed && b.data_exposed.length > 0
                    ? b.data_exposed.slice(0, 3).join(" · ")
                    : "No PII found"}
                </Text>
              </View>
              <View style={[styles.pill, { backgroundColor: p.bg }]}>
                <Text style={[styles.pillText, { color: p.color }]}>{p.label}</Text>
              </View>
              {b.status === "pii_found" && (
                <TouchableOpacity
                  onPress={() => sendOptOut(b.broker_id)}
                  disabled={optOutBusy === b.broker_id}
                  style={styles.optOutBtn}
                  testID={`opt-out-${b.broker_id}`}
                >
                  {optOutBusy === b.broker_id ? (
                    <ActivityIndicator size="small" color={colors.primaryGlow} />
                  ) : (
                    <Text style={styles.optOutText}>Opt-out</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          );
        })}

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <View style={[styles.statCard, { borderColor: `${accent}33` }]}>
      <Text style={[styles.statValue, { color: accent }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function LinkTile({
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
    <TouchableOpacity style={styles.linkTile} onPress={onPress} testID={testID} activeOpacity={0.85}>
      <View style={styles.linkHead}>
        {icon}
        <ChevronRight size={14} color={colors.textTertiary} />
      </View>
      <Text style={styles.linkTitle}>{title}</Text>
      <Text style={styles.linkSub}>{sub}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: spacing.xl, paddingTop: spacing.lg },
  h1: { color: colors.textPrimary, fontSize: 30, fontWeight: "300", letterSpacing: -0.5 },
  h1Sub: { color: colors.textSecondary, fontSize: 13, marginTop: 4, marginBottom: spacing.lg },

  heroRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.sm },
  heroCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: "center",
    gap: 4,
  },
  ringWrap: { alignItems: "center", justifyContent: "center", marginBottom: 4 },
  threatRing: {
    width: 86,
    height: 86,
    borderRadius: 43,
    borderWidth: 8,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  threatScore: { fontSize: 28, fontWeight: "700", letterSpacing: -1 },
  threatScoreMax: { color: colors.textTertiary, fontSize: 12, fontWeight: "700", marginLeft: 2 },
  heroLabel: {
    color: colors.textTertiary,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginTop: 6,
  },
  heroSub: { color: colors.textTertiary, fontSize: 10 },
  threatChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
    backgroundColor: "rgba(239,68,68,0.10)",
    marginTop: 4,
  },
  threatChipText: { fontSize: 10, fontWeight: "700" },

  statsRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "flex-start",
  },
  statValue: { fontSize: 22, fontWeight: "700", letterSpacing: -0.5 },
  statLabel: {
    color: colors.textTertiary,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1,
    marginTop: 4,
  },

  sectionLabel: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginTop: spacing.xxl,
    marginBottom: spacing.md,
  },
  sectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.xxl,
    marginBottom: spacing.md,
  },
  refreshIcon: { padding: 6, borderRadius: radius.sm },
  viewAll: { color: colors.primaryGlow, fontSize: 12, fontWeight: "700" },

  linksGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.sm },
  linkTile: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 4,
  },
  linkHead: { flexDirection: "row", justifyContent: "space-between" },
  linkTitle: { color: colors.textPrimary, fontWeight: "700", fontSize: 14, marginTop: 6 },
  linkSub: { color: colors.textSecondary, fontSize: 11 },

  empty: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.xl,
  },
  emptyText: { color: colors.textTertiary, textAlign: "center" },
  alertRow: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: 6,
  },
  alertHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  alertTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: "700", flex: 1 },
  alertTime: { color: colors.textTertiary, fontSize: 10 },
  alertDesc: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },

  brokerRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  brokerName: { color: colors.textPrimary, fontWeight: "700", fontSize: 13 },
  brokerSub: { color: colors.textTertiary, fontSize: 11, marginTop: 2 },
  pill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm },
  pillText: { fontSize: 9, fontWeight: "700", letterSpacing: 1 },
  optOutBtn: {
    backgroundColor: colors.primaryMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.sm,
  },
  optOutText: { color: colors.primaryGlow, fontWeight: "700", fontSize: 11 },
});
