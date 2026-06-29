// PLOS — Market Readiness with Editable Market List (Enhancement 5)
import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  RefreshControl, Modal, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import {
  ArrowLeft, Plus, Pencil, CheckCircle2, AlertTriangle, XCircle, X, ChevronRight,
} from "lucide-react-native";

import { investmentMarketsApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";
import { EditModal, type Field } from "@/src/components/EditModal";

const TYPE_OPTS = ["Stock", "Stock Index", "Bond", "Cryptocurrency", "Real Estate", "Commodity", "Cash Equivalent", "Retirement", "Other"];
const RISK_OPTS = ["None", "Very Low", "Low", "Moderate", "High", "Very High"];

const MARKET_FIELDS: Field[] = [
  { key: "name", label: "Market Name", kind: "text" },
  { key: "type", label: "Type", kind: "select", options: TYPE_OPTS.map((t) => ({ label: t, value: t })) },
  { key: "risk_level", label: "Risk Level", kind: "select", options: RISK_OPTS.map((r) => ({ label: r, value: r })) },
  { key: "minimum_investment", label: "Minimum Investment ($)", kind: "number" },
  { key: "notes", label: "Notes / Reason for Interest", kind: "textarea", maxLength: 300 },
];

const STATUS_META: Record<string, { color: string; icon: any; bg: string }> = {
  "Ready to Invest": { color: colors.success, icon: CheckCircle2, bg: "rgba(16,185,129,0.12)" },
  "Not Yet Ready": { color: colors.warning, icon: AlertTriangle, bg: "rgba(245,158,11,0.12)" },
  "Do Not Recommend": { color: colors.danger, icon: XCircle, bg: "rgba(239,68,68,0.12)" },
};

const RISK_COLORS: Record<string, string> = {
  "None": colors.success,
  "Very Low": colors.success,
  "Low": colors.primaryGlow,
  "Moderate": colors.warning,
  "High": colors.warning,
  "Very High": colors.danger,
};

export default function MarketReadinessEditable() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [markets, setMarkets] = useState<any[]>([]);
  const [editModal, setEditModal] = useState<{ open: boolean; item?: any }>({ open: false });
  const [detailMarket, setDetailMarket] = useState<any | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await investmentMarketsApi.list();
      setMarkets(r.markets || []);
    } catch (_e) {}
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const onSave = async (vals: any) => {
    if (editModal.item) {
      await investmentMarketsApi.update(editModal.item.market_id, vals);
    } else {
      await investmentMarketsApi.create(vals);
    }
    await load();
  };
  const onDelete = async () => {
    if (!editModal.item) return;
    await investmentMarketsApi.delete(editModal.item.market_id);
    await load();
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} testID="mr-back">
          <ArrowLeft color={colors.textPrimary} size={20} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Market Readiness</Text>
        <TouchableOpacity style={styles.addBtnTop} onPress={() => setEditModal({ open: true })} testID="add-market">
          <Plus size={16} color={colors.primaryGlow} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primaryGlow} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primaryGlow} />}
        >
          <Text style={styles.intro}>
            Your watchlist of investment markets. Tap any market to see your readiness status and prerequisites.
          </Text>

          {markets.map((m) => {
            const meta = STATUS_META[m.status] || STATUS_META["Not Yet Ready"];
            const Icon = meta.icon;
            const riskColor = RISK_COLORS[m.risk_level] || colors.textSecondary;
            return (
              <TouchableOpacity
                key={m.market_id}
                style={[styles.marketCard, { borderColor: meta.color, backgroundColor: meta.bg }]}
                onPress={() => setDetailMarket(m)}
                activeOpacity={0.85}
                testID={`market-${m.market_id}`}
              >
                <View style={styles.marketHead}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.marketName}>{m.name}</Text>
                    <View style={styles.metaRow}>
                      <Text style={styles.marketType}>{m.type}</Text>
                      <Text style={[styles.riskDot, { color: riskColor }]}>●</Text>
                      <Text style={[styles.riskLabel, { color: riskColor }]}>{m.risk_level}</Text>
                      <Text style={styles.marketMin}>· Min ${m.minimum_investment}</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.pencilBtn}
                    onPress={(e) => { e.stopPropagation(); setEditModal({ open: true, item: m }); }}
                    testID={`edit-${m.market_id}`}
                  >
                    <Pencil size={12} color={colors.textTertiary} />
                  </TouchableOpacity>
                </View>
                <View style={styles.statusRow}>
                  <Icon size={14} color={meta.color} />
                  <Text style={[styles.statusText, { color: meta.color }]}>{m.status}</Text>
                  <ChevronRight size={14} color={colors.textTertiary} style={{ marginLeft: "auto" }} />
                </View>
              </TouchableOpacity>
            );
          })}

          <View style={{ height: 60 }} />
        </ScrollView>
      )}

      {/* Edit Modal */}
      <EditModal
        visible={editModal.open}
        title={editModal.item ? "Edit Market" : "Add Market"}
        fields={MARKET_FIELDS}
        initial={editModal.item || { name: "", type: "Stock Index", risk_level: "Moderate", minimum_investment: 1, notes: "" }}
        onClose={() => setEditModal({ open: false })}
        onSubmit={onSave}
        onDelete={editModal.item ? onDelete : undefined}
        deleteSubject={editModal.item?.name || "this market"}
        testID="market-modal"
      />

      {/* Detail Modal */}
      <Modal visible={!!detailMarket} transparent animationType="slide" onRequestClose={() => setDetailMarket(null)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            {detailMarket && (() => {
              const meta = STATUS_META[detailMarket.status] || STATUS_META["Not Yet Ready"];
              const Icon = meta.icon;
              return (
                <>
                  <View style={styles.sheetHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sheetTitle}>{detailMarket.name}</Text>
                      <Text style={styles.sheetSub}>{detailMarket.type} · {detailMarket.risk_level} risk · Min ${detailMarket.minimum_investment}</Text>
                    </View>
                    <TouchableOpacity onPress={() => setDetailMarket(null)} style={styles.closeBtn} testID="close-detail">
                      <X size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                  <View style={[styles.statusBig, { backgroundColor: meta.bg, borderColor: meta.color }]}>
                    <Icon size={20} color={meta.color} />
                    <Text style={[styles.statusBigText, { color: meta.color }]}>{detailMarket.status}</Text>
                  </View>
                  {detailMarket.notes ? (
                    <Text style={styles.notes}>{detailMarket.notes}</Text>
                  ) : null}
                  {detailMarket.prerequisites?.length > 0 ? (
                    <>
                      <Text style={styles.prereqLabel}>PREREQUISITES TO MEET</Text>
                      {detailMarket.prerequisites.map((p: string, i: number) => (
                        <View key={i} style={styles.prereqRow}>
                          <AlertTriangle size={12} color={colors.warning} />
                          <Text style={styles.prereqText}>{p}</Text>
                        </View>
                      ))}
                    </>
                  ) : (
                    <Text style={styles.readyText}>
                      You meet all the financial prerequisites for this market. Consider your personal goals and risk tolerance before investing.
                    </Text>
                  )}
                </>
              );
            })()}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  backBtn: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.surfaceElevated, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  addBtnTop: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.primaryMuted, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.primaryGlow },
  scroll: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, gap: spacing.sm },
  intro: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginBottom: spacing.sm },

  marketCard: { borderRadius: radius.lg, padding: spacing.md, borderWidth: 1.5, gap: 8 },
  marketHead: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  marketName: { color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
  metaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", marginTop: 4, gap: 4 },
  marketType: { color: colors.textSecondary, fontSize: 11, fontWeight: "600" },
  riskDot: { fontSize: 10 },
  riskLabel: { fontSize: 10, fontWeight: "700" },
  marketMin: { color: colors.textTertiary, fontSize: 10 },
  pencilBtn: { padding: 6, borderRadius: 6, backgroundColor: "rgba(255,255,255,0.05)" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusText: { fontSize: 12, fontWeight: "700" },

  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.xl, maxHeight: "85%", borderTopWidth: 1, borderTopColor: colors.borderSubtle, gap: spacing.md },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  sheetTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  sheetSub: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },

  statusBig: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: radius.md, borderWidth: 1.5 },
  statusBigText: { fontSize: 14, fontWeight: "700" },
  notes: { color: colors.textPrimary, fontSize: 12, lineHeight: 17, fontStyle: "italic" },

  prereqLabel: { color: colors.textTertiary, fontSize: 10, fontWeight: "700", letterSpacing: 1, marginTop: 4 },
  prereqRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 6 },
  prereqText: { color: colors.textPrimary, fontSize: 12, flex: 1, lineHeight: 17 },
  readyText: { color: colors.success, fontSize: 12, lineHeight: 17, fontStyle: "italic" },
});
