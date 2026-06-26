// Eden Heights Tracker — 4 hectares / $12,000 USD eco-resort property in Bulacan.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Svg, { Polyline, Line, Text as SvgText, Circle } from "react-native-svg";
import {
  ArrowLeft,
  MapPin,
  TreePine,
  CheckCircle2,
  Circle as CircleIcon,
  Pencil,
  X,
  Save,
} from "lucide-react-native";
import { businessApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";

const fmtUSD = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

const phaseColor = (status: string) => {
  if (status === "complete") return colors.success;
  if (status === "in_progress") return colors.warning;
  return colors.textTertiary;
};
const phaseLabel = (status: string) => {
  if (status === "complete") return "Complete";
  if (status === "in_progress") return "In Progress";
  return "Not Started";
};

export default function EdenHeights() {
  const router = useRouter();
  const [eden, setEden] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [editMun, setEditMun] = useState("");
  const [editVal, setEditVal] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await businessApi.edenHeights();
      setEden(r);
      setEditMun(r?.municipality || "");
      setEditVal(String(r?.current_value_usd ?? 12000));
    } catch (_e) {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const toggleChecklist = async (idx: number) => {
    if (!eden) return;
    const next = [...(eden.checklist || [])];
    next[idx] = { ...next[idx], checked: !next[idx].checked };
    setEden({ ...eden, checklist: next });
    try { await businessApi.updateEdenHeights({ checklist: next }); } catch (_e) {}
  };

  const advancePhase = async (idx: number) => {
    if (!eden) return;
    const order = ["not_started", "in_progress", "complete"];
    const phases = [...(eden.phases || [])];
    const cur = phases[idx].status;
    const nextStatus = order[(order.indexOf(cur) + 1) % order.length];
    phases[idx] = { ...phases[idx], status: nextStatus };
    setEden({ ...eden, phases });
    try { await businessApi.updateEdenHeights({ phases }); } catch (_e) {}
  };

  const saveDetails = async () => {
    setSaving(true);
    try {
      const val = parseFloat(editVal) || 0;
      await businessApi.updateEdenHeights({ municipality: editMun.trim(), current_value_usd: val });
      setEden({ ...eden, municipality: editMun.trim(), current_value_usd: val });
      setEditVisible(false);
    } catch (_e) {
      Alert.alert("Save failed", "Could not save changes.");
    }
    setSaving(false);
  };

  const chart = useMemo(() => {
    if (!eden?.roi_series) return null;
    const W = 320, H = 160, P = 28;
    const xs = eden.roi_series.map((p: any) => p.year);
    const maxY = Math.max(...eden.roi_series.flatMap((p: any) => [p.investment_cum, p.revenue]), 1);
    const xScale = (x: number) => P + ((x - Math.min(...xs)) / Math.max(1, Math.max(...xs) - Math.min(...xs))) * (W - 2 * P);
    const yScale = (y: number) => H - P - (y / maxY) * (H - 2 * P);
    const invPts = eden.roi_series.map((p: any) => `${xScale(p.year)},${yScale(p.investment_cum)}`).join(" ");
    const revPts = eden.roi_series.map((p: any) => `${xScale(p.year)},${yScale(p.revenue)}`).join(" ");
    return { W, H, P, invPts, revPts, xScale, yScale, series: eden.roi_series };
  }, [eden]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <ActivityIndicator color={colors.primaryGlow} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} testID="eden-back">
          <ArrowLeft color={colors.textPrimary} size={20} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Eden Heights Tracker</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => setEditVisible(true)} testID="eden-edit">
          <Pencil color={colors.textPrimary} size={18} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primaryGlow} />}
      >
        {/* Property overview */}
        <View style={styles.heroCard} testID="eden-hero">
          <View style={styles.heroHeader}>
            <View style={[styles.iconBox, { backgroundColor: "rgba(16,185,129,0.15)" }]}>
              <TreePine color={colors.success} size={22} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroTitle}>{eden?.name}</Text>
              <View style={styles.locRow}>
                <MapPin size={11} color={colors.textTertiary} />
                <Text style={styles.locText}>
                  {eden?.municipality ? `${eden.municipality}, ` : ""}{eden?.location}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statCol}>
              <Text style={styles.statLabel}>SIZE</Text>
              <Text style={styles.statValue}>{eden?.size_hectares} ha</Text>
              <Text style={styles.statSub}>{(eden?.size_sqm || 0).toLocaleString()} sqm</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statCol}>
              <Text style={styles.statLabel}>CURRENT VALUE</Text>
              <Text style={[styles.statValue, { color: colors.success }]}>{fmtUSD(eden?.current_value_usd || 0)}</Text>
              <Text style={styles.statSub}>USD est.</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statCol}>
              <Text style={styles.statLabel}>BREAKEVEN</Text>
              <Text style={styles.statValue}>Year {eden?.breakeven_year}</Text>
              <Text style={styles.statSub}>Projected</Text>
            </View>
          </View>

          <Text style={styles.conceptText}>{eden?.concept}</Text>
        </View>

        {/* ROI chart */}
        {chart && (
          <View style={styles.card} testID="eden-roi-chart">
            <Text style={styles.cardLabel}>5-YEAR ROI PROJECTION</Text>
            <Text style={styles.cardTitle}>Investment vs Revenue</Text>
            <Svg width={chart.W} height={chart.H} style={{ marginTop: spacing.sm }}>
              <Line x1={chart.P} y1={chart.H - chart.P} x2={chart.W - chart.P} y2={chart.H - chart.P} stroke={colors.borderSubtle} strokeWidth={1} />
              <Polyline points={chart.invPts} fill="none" stroke={colors.warning} strokeWidth={2} />
              <Polyline points={chart.revPts} fill="none" stroke={colors.success} strokeWidth={2} />
              {chart.series.map((p: any, i: number) => (
                <React.Fragment key={i}>
                  <Circle cx={chart.xScale(p.year)} cy={chart.yScale(p.investment_cum)} r={3} fill={colors.warning} />
                  <Circle cx={chart.xScale(p.year)} cy={chart.yScale(p.revenue)} r={3} fill={colors.success} />
                  <SvgText x={chart.xScale(p.year)} y={chart.H - 8} fontSize={10} fill={colors.textTertiary} textAnchor="middle">Y{p.year}</SvgText>
                </React.Fragment>
              ))}
            </Svg>
            <View style={styles.legendRow}>
              <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: colors.warning }]} /><Text style={styles.legendText}>Cumulative Investment</Text></View>
              <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: colors.success }]} /><Text style={styles.legendText}>Annual Revenue</Text></View>
            </View>
          </View>
        )}

        {/* Phases */}
        <View style={styles.card} testID="eden-phases">
          <Text style={styles.cardLabel}>BUILD PHASES</Text>
          <Text style={styles.cardTitle}>3-Phase Development Plan</Text>
          <Text style={styles.cardHint}>Tap a phase to advance: Not Started → In Progress → Complete</Text>
          {(eden?.phases || []).map((ph: any, i: number) => (
            <TouchableOpacity key={ph.id} style={styles.phaseRow} onPress={() => advancePhase(i)} testID={`phase-${ph.id}`} activeOpacity={0.7}>
              <View style={[styles.phaseDot, { backgroundColor: phaseColor(ph.status) }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.phaseName}>{ph.name}</Text>
                <Text style={styles.phaseSummary}>{ph.summary}</Text>
                <View style={styles.phaseMetaRow}>
                  <Text style={styles.phaseMeta}>~{ph.target_months}mo</Text>
                  <Text style={styles.phaseDot2}>•</Text>
                  <Text style={styles.phaseMeta}>{ph.cost_range}</Text>
                </View>
              </View>
              <View style={[styles.statusPill, { backgroundColor: phaseColor(ph.status) + "22", borderColor: phaseColor(ph.status) }]}>
                <Text style={[styles.statusPillText, { color: phaseColor(ph.status) }]}>{phaseLabel(ph.status)}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* DOT / DENR / BIR Checklist */}
        <View style={styles.card} testID="eden-checklist">
          <Text style={styles.cardLabel}>PHILIPPINES COMPLIANCE</Text>
          <Text style={styles.cardTitle}>DOT · DENR · BIR · LGU Checklist</Text>
          {(eden?.checklist || []).map((item: any, i: number) => (
            <TouchableOpacity
              key={i}
              style={styles.checkRow}
              onPress={() => toggleChecklist(i)}
              testID={`check-${i}`}
              activeOpacity={0.7}
            >
              {item.checked ? (
                <CheckCircle2 size={18} color={colors.success} />
              ) : (
                <CircleIcon size={18} color={colors.textTertiary} />
              )}
              <Text style={[styles.checkText, item.checked && { color: colors.textTertiary, textDecorationLine: "line-through" }]}>
                {item.item}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Edit modal */}
      <Modal visible={editVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditVisible(false)}>
        <SafeAreaView style={styles.container} edges={["top"]}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardLabel}>EDIT PROPERTY</Text>
              <Text style={styles.cardTitle}>Eden Heights</Text>
            </View>
            <TouchableOpacity style={styles.backBtn} onPress={() => setEditVisible(false)} testID="edit-close">
              <X color={colors.textPrimary} size={20} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.scroll}>
            <Text style={styles.fieldLabel}>Municipality</Text>
            <TextInput
              style={styles.input}
              value={editMun}
              onChangeText={setEditMun}
              placeholder="e.g. Sta. Maria, Norzagaray"
              placeholderTextColor={colors.textTertiary}
              testID="edit-municipality"
            />
            <Text style={styles.fieldLabel}>Current Value (USD)</Text>
            <TextInput
              style={styles.input}
              value={editVal}
              onChangeText={setEditVal}
              keyboardType="decimal-pad"
              placeholder="12000"
              placeholderTextColor={colors.textTertiary}
              testID="edit-value"
            />
            <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={saveDetails} disabled={saving} testID="edit-save">
              {saving ? <ActivityIndicator color="#fff" /> : <><Save color="#fff" size={14} /><Text style={styles.saveBtnText}>Save Changes</Text></>}
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  backBtn: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.surfaceElevated, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  scroll: { padding: spacing.xl, gap: spacing.md },
  heroCard: { backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  heroHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconBox: { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  heroTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  locRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  locText: { color: colors.textTertiary, fontSize: 11 },
  statsRow: { flexDirection: "row", alignItems: "stretch", backgroundColor: colors.bg, borderRadius: radius.md, paddingVertical: spacing.md },
  statCol: { flex: 1, alignItems: "center", gap: 2 },
  statDivider: { width: 1, backgroundColor: colors.borderSubtle },
  statLabel: { color: colors.textTertiary, fontSize: 9, fontWeight: "700", letterSpacing: 1 },
  statValue: { color: colors.textPrimary, fontSize: 16, fontWeight: "700", marginTop: 4 },
  statSub: { color: colors.textTertiary, fontSize: 10, marginTop: 2 },
  conceptText: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  card: { backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  cardLabel: { color: colors.textTertiary, fontSize: 10, fontWeight: "700", letterSpacing: 1.2 },
  cardTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700", marginTop: 2 },
  cardHint: { color: colors.textTertiary, fontSize: 11, marginTop: 2 },
  legendRow: { flexDirection: "row", justifyContent: "center", gap: spacing.lg, marginTop: 6 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: colors.textSecondary, fontSize: 11 },
  phaseRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  phaseDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  phaseName: { color: colors.textPrimary, fontSize: 13, fontWeight: "600" },
  phaseSummary: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  phaseMetaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  phaseMeta: { color: colors.textTertiary, fontSize: 11 },
  phaseDot2: { color: colors.textTertiary, fontSize: 11 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm, borderWidth: 1 },
  statusPillText: { fontSize: 9, fontWeight: "700", letterSpacing: 0.5 },
  checkRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  checkText: { color: colors.textPrimary, fontSize: 13, flex: 1, lineHeight: 19 },
  modalHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  fieldLabel: { color: colors.textTertiary, fontSize: 11, fontWeight: "700", letterSpacing: 1, marginTop: spacing.md },
  input: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, color: colors.textPrimary, fontSize: 15, borderWidth: 1, borderColor: colors.borderSubtle, marginTop: 6 },
  saveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.primary, paddingVertical: 14, borderRadius: radius.lg, marginTop: spacing.xl },
  saveBtnText: { color: "#fff", fontWeight: "700" },
});
