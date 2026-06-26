// Data Broker Monitoring screen
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  RefreshControl,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  RefreshCw,
  AlertTriangle,
  Clock,
  CheckCircle,
  Loader,
  ExternalLink,
  X,
  Copy,
} from "lucide-react-native";

import { securityApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";

const STATUS_META: Record<
  string,
  { label: string; color: string; bg: string; Icon: any }
> = {
  pii_found: { label: "PII FOUND", color: colors.danger, bg: "rgba(239,68,68,0.12)", Icon: AlertTriangle },
  opt_out_pending: { label: "OPT-OUT PENDING", color: colors.warning, bg: "rgba(245,158,11,0.12)", Icon: Clock },
  removed: { label: "REMOVED", color: colors.success, bg: "rgba(16,185,129,0.12)", Icon: CheckCircle },
  scanning: { label: "SCANNING", color: colors.textTertiary, bg: "rgba(255,255,255,0.06)", Icon: Loader },
  clear: { label: "CLEAR", color: colors.success, bg: "rgba(16,185,129,0.10)", Icon: CheckCircle },
};

function agoDate(iso?: string) {
  if (!iso) return "—";
  const dt = new Date(iso);
  const days = Math.round((Date.now() - dt.getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

export default function Brokers() {
  const router = useRouter();
  const [brokers, setBrokers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [letterModal, setLetterModal] = useState<{ open: boolean; letter?: string; broker?: string }>({ open: false });

  const load = useCallback(async () => {
    const r = await securityApi.listBrokers();
    setBrokers(r.brokers || []);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await load();
      } catch (_e) {}
      setLoading(false);
    })();
  }, [load]);

  const rescan = async () => {
    setBusy("rescan");
    try {
      await securityApi.rescanBrokers();
      await load();
    } catch (_e) {}
    setBusy(null);
  };

  const optOut = async (b: any) => {
    setBusy(b.broker_id);
    try {
      const r = await securityApi.optOut(b.broker_id);
      setLetterModal({ open: true, letter: r.letter, broker: b.name });
      await load();
    } catch (_e) {}
    setBusy(null);
  };

  const viewLetter = async (b: any) => {
    setBusy(b.broker_id);
    try {
      const r = await securityApi.optOutLetter(b.broker_id);
      setLetterModal({ open: true, letter: r.letter, broker: r.broker });
    } catch (_e) {}
    setBusy(null);
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
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} testID="brokers-back">
          <ArrowLeft color={colors.textPrimary} size={20} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Data Brokers</Text>
        <TouchableOpacity onPress={rescan} disabled={busy === "rescan"} style={styles.rescanBtn} testID="rescan-button">
          {busy === "rescan" ? <ActivityIndicator size="small" color={colors.primaryGlow} /> : <RefreshCw color={colors.primaryGlow} size={16} />}
        </TouchableOpacity>
      </View>

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
        <View style={styles.banner} testID="mocked-banner">
          <Text style={styles.bannerText}>
            DEMO MODE · Scan results are seeded. Live broker scanning requires an Optery / DeleteMe integration (TODO).
          </Text>
        </View>

        <Text style={styles.intro}>
          {brokers.length} brokers tracked. Opt-out letters are generated automatically with your name and address.
        </Text>

        {brokers.map((b) => {
          const meta = STATUS_META[b.status] || STATUS_META.clear;
          const Icon = meta.Icon;
          return (
            <View key={b.broker_id} style={styles.card} testID={`broker-${b.broker_id}`}>
              <View style={styles.cardHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.brokerName}>{b.name}</Text>
                  <Text style={styles.brokerDomain}>{b.domain}</Text>
                </View>
                <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
                  <Icon color={meta.color} size={11} />
                  <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
                </View>
              </View>
              {b.data_exposed?.length > 0 && (
                <View style={styles.exposedRow}>
                  <Text style={styles.exposedLabel}>Found:</Text>
                  <Text style={styles.exposedValue}>{b.data_exposed.join(" · ")}</Text>
                </View>
              )}
              <View style={styles.meta}>
                {b.status === "opt_out_pending" && (
                  <Text style={styles.metaItem}>Submitted {agoDate(b.opt_out_submitted_at)} · ETA 3-10 business days</Text>
                )}
                {b.status === "removed" && (
                  <Text style={[styles.metaItem, { color: colors.success }]}>Removed {agoDate(b.removal_confirmed_at)}</Text>
                )}
                {(b.status === "scanning" || b.status === "clear" || b.status === "pii_found") && (
                  <Text style={styles.metaItem}>Last checked {agoDate(b.last_scanned_at)}</Text>
                )}
              </View>
              <View style={styles.actions}>
                {b.status === "pii_found" && (
                  <TouchableOpacity
                    onPress={() => optOut(b)}
                    disabled={busy === b.broker_id}
                    style={styles.btnPrimary}
                    testID={`broker-opt-out-${b.broker_id}`}
                  >
                    {busy === b.broker_id ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.btnPrimaryText}>Send Opt-Out</Text>
                    )}
                  </TouchableOpacity>
                )}
                {(b.status === "opt_out_pending" || b.status === "pii_found") && (
                  <TouchableOpacity onPress={() => viewLetter(b)} style={styles.btnGhost}>
                    <Text style={styles.btnGhostText}>View Letter</Text>
                  </TouchableOpacity>
                )}
                {b.opt_out_url && (
                  <TouchableOpacity onPress={() => Linking.openURL(b.opt_out_url)} style={styles.btnGhost}>
                    <ExternalLink size={11} color={colors.primaryGlow} />
                    <Text style={styles.btnGhostText}>Broker form</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}
        <View style={{ height: 60 }} />
      </ScrollView>

      {/* Opt-Out Letter Modal */}
      <Modal visible={letterModal.open} animationType="slide" transparent>
        <View style={styles.modalBg}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Opt-Out Letter · {letterModal.broker}</Text>
              <TouchableOpacity onPress={() => setLetterModal({ open: false })}>
                <X color={colors.textSecondary} size={18} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 400 }}>
              <Text style={styles.letterText}>{letterModal.letter}</Text>
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.btnPrimary}
                onPress={() => setLetterModal({ open: false })}
              >
                <Copy color="#fff" size={14} />
                <Text style={styles.btnPrimaryText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  rescanBtn: {
    width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.primaryMuted,
    alignItems: "center", justifyContent: "center",
  },
  scroll: { padding: spacing.xl, paddingTop: spacing.md, gap: spacing.md },
  banner: {
    backgroundColor: "rgba(245,158,11,0.12)",
    borderColor: "rgba(245,158,11,0.35)",
    borderWidth: 1,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  bannerText: { color: colors.warning, fontSize: 12, lineHeight: 17 },
  intro: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  brokerName: { color: colors.textPrimary, fontWeight: "700", fontSize: 14 },
  brokerDomain: { color: colors.textTertiary, fontSize: 11, marginTop: 2 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm },
  statusText: { fontSize: 9, fontWeight: "700", letterSpacing: 1 },
  exposedRow: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  exposedLabel: { color: colors.textTertiary, fontSize: 11, fontWeight: "700" },
  exposedValue: { color: colors.textPrimary, fontSize: 11, flex: 1 },
  meta: { gap: 2 },
  metaItem: { color: colors.textTertiary, fontSize: 11 },
  actions: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  btnPrimary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.sm,
  },
  btnPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  btnGhost: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.sm,
  },
  btnGhostText: { color: colors.primaryGlow, fontWeight: "700", fontSize: 12 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.lg,
    gap: spacing.md,
    maxHeight: "85%",
  },
  modalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  modalTitle: { color: colors.textPrimary, fontWeight: "700", fontSize: 14, flex: 1 },
  letterText: { color: colors.textPrimary, fontSize: 12, lineHeight: 19, fontFamily: "monospace" as any },
  modalActions: { flexDirection: "row", justifyContent: "flex-end" },
});
