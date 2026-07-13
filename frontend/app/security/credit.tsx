// Credit Monitoring screen
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
import Svg, { Polyline, Line, Circle } from "react-native-svg";
import {
  ArrowLeft,
  Sparkles,
  ArrowUp,
  ArrowDown,
  Minus,
  Pencil,
} from "lucide-react-native";

import { securityApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";
import { EditModal, Field } from "@/src/components/EditModal";

const BUREAU_LABEL: Record<string, string> = {
  equifax: "Equifax",
  transunion: "TransUnion",
  experian: "Experian",
};

function scoreColor(s: number) {
  if (s >= 740) return colors.success;
  if (s >= 670) return colors.primaryGlow;
  if (s >= 600) return colors.warning;
  return colors.danger;
}

function scoreLabel(s: number) {
  if (s >= 800) return "Exceptional";
  if (s >= 740) return "Very Good";
  if (s >= 670) return "Good";
  if (s >= 580) return "Fair";
  return "Poor";
}

function ChangeChip({ delta }: { delta: number }) {
  const positive = delta > 0;
  const negative = delta < 0;
  const color = positive ? colors.success : negative ? colors.danger : colors.textTertiary;
  const Icon = positive ? ArrowUp : negative ? ArrowDown : Minus;
  return (
    <View style={[styles.chip, { backgroundColor: `${color}1A` }]}>
      <Icon size={10} color={color} />
      <Text style={[styles.chipText, { color }]}>
        {positive ? "+" : ""}
        {delta}
      </Text>
    </View>
  );
}

function HistoryChart({ history }: { history: any[] }) {
  // history: [{bureau, score, month}]
  if (!history?.length) return null;
  // group by month, average across bureaus for chart line
  const map: Record<string, number[]> = {};
  for (const h of history) {
    map[h.month] = map[h.month] || [];
    map[h.month].push(h.score);
  }
  const months = Object.keys(map).sort();
  const points = months.map((m) => {
    const arr = map[m];
    return { month: m, score: Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) };
  });
  if (!points.length) return null;
  const W = 320;
  const H = 120;
  const padX = 28;
  const padY = 18;
  const minS = Math.min(...points.map((p) => p.score)) - 10;
  const maxS = Math.max(...points.map((p) => p.score)) + 10;
  const xStep = (W - 2 * padX) / Math.max(1, points.length - 1);
  const yScale = (H - 2 * padY) / Math.max(1, maxS - minS);
  const poly = points
    .map((p, i) => `${padX + i * xStep},${H - padY - (p.score - minS) * yScale}`)
    .join(" ");
  return (
    <View style={styles.chartCard} testID="credit-history-chart">
      <Text style={styles.chartTitle}>6-Month Trend</Text>
      <Svg width={W} height={H}>
        <Line x1={padX} y1={H - padY} x2={W - padX} y2={H - padY} stroke={colors.borderSubtle} />
        <Polyline points={poly} fill="none" stroke={colors.primaryGlow} strokeWidth={2} />
        {points.map((p, i) => (
          <Circle
            key={p.month}
            cx={padX + i * xStep}
            cy={H - padY - (p.score - minS) * yScale}
            r={3}
            fill={colors.primaryGlow}
          />
        ))}
      </Svg>
      <View style={styles.axis}>
        {points.map((p) => (
          <Text key={p.month} style={styles.axisLabel}>
            {p.month.slice(-2)}
          </Text>
        ))}
      </View>
    </View>
  );
}

export default function Credit() {
  const router = useRouter();
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [tipBusy, setTipBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const load = useCallback(async () => {
    const r = await securityApi.credit();
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

  const refreshTip = async () => {
    setTipBusy(true);
    try {
      await securityApi.refreshCreditTip();
      await load();
    } catch (_e) {}
    setTipBusy(false);
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

  const scoreByBureau: Record<string, any> = {};
  (data?.scores || []).forEach((s: any) => (scoreByBureau[s.bureau] = s));
  const ordered = ["equifax", "transunion", "experian"];
  const tip = data?.tip;

  const fields: Field[] = [
    { key: "equifax", label: "Equifax Score (300-850)", kind: "number" },
    { key: "transunion", label: "TransUnion Score (300-850)", kind: "number" },
    { key: "experian", label: "Experian Score (300-850)", kind: "number" },
  ];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} testID="credit-back">
          <ArrowLeft color={colors.textPrimary} size={20} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Credit Monitoring</Text>
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
          <View style={styles.demoBanner} testID="credit-demo-banner">
            <Text style={styles.demoText}>
              DEMO MODE · Scores are seeded. Tap “Update My Real Scores” to replace with live data.
            </Text>
          </View>
        )}

        <TouchableOpacity
          onPress={() => setEditOpen(true)}
          style={styles.updateBtn}
          testID="update-scores"
          activeOpacity={0.85}
        >
          <Pencil size={14} color="#fff" />
          <Text style={styles.updateBtnText}>Update My Real Scores</Text>
        </TouchableOpacity>

        {ordered.map((bureau) => {
          const s = scoreByBureau[bureau];
          if (!s) return null;
          const delta = s.current_score - s.previous_score;
          const col = scoreColor(s.current_score);
          return (
            <View key={bureau} style={styles.bureauCard} testID={`bureau-${bureau}`}>
              <View style={{ flex: 1 }}>
                <Text style={styles.bureauName}>{BUREAU_LABEL[bureau]}</Text>
                <Text style={[styles.bureauBand, { color: col }]}>{scoreLabel(s.current_score)}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[styles.bureauScore, { color: col }]}>{s.current_score}</Text>
                <ChangeChip delta={delta} />
              </View>
            </View>
          );
        })}

        {/* Hard inquiries */}
        {data?.hard_inquiries?.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Hard Inquiries (last 30 days)</Text>
            {data.hard_inquiries.map((q: any) => (
              <View key={q.inquiry_id} style={styles.inquiryCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inquiryName}>{q.creditor}</Text>
                  <Text style={styles.inquirySub}>{BUREAU_LABEL[q.bureau]} · {new Date(q.inquired_at).toLocaleDateString()}</Text>
                </View>
                <Text style={styles.inquiryDrop}>~24 mo on report</Text>
              </View>
            ))}
          </>
        )}

        {/* History */}
        <HistoryChart history={data?.history || []} />

        {/* Tip */}
        <Text style={styles.sectionLabel}>This Month&apos;s Improvement Tip</Text>
        <View style={styles.tipCard} testID="credit-tip-card">
          <View style={styles.tipHead}>
            <Sparkles size={14} color={colors.primaryGlow} />
            <Text style={styles.tipHeadText}>Powered by PLOS AI</Text>
            <TouchableOpacity onPress={refreshTip} disabled={tipBusy} style={styles.tipBtn} testID="refresh-tip">
              {tipBusy ? <ActivityIndicator size="small" color={colors.primaryGlow} /> : <Text style={styles.tipBtnText}>{tip ? "Refresh" : "Generate"}</Text>}
            </TouchableOpacity>
          </View>
          {tip ? (
            <View style={{ gap: 6 }}>
              <Text style={styles.tipText}>{tip.tip}</Text>
              {tip.expected_gain_points && (
                <Text style={styles.tipMeta}>Expected gain: <Text style={{ color: colors.success }}>+{tip.expected_gain_points} pts</Text></Text>
              )}
            </View>
          ) : (
            <Text style={styles.tipEmpty}>Tap Generate for a specific, data-grounded action you can take this month.</Text>
          )}
        </View>

        <View style={{ height: 80 }} />
      </ScrollView>

      <EditModal
        visible={editOpen}
        title="Update Credit Scores"
        fields={fields}
        initial={{
          equifax: scoreByBureau.equifax?.current_score || "",
          transunion: scoreByBureau.transunion?.current_score || "",
          experian: scoreByBureau.experian?.current_score || "",
        }}
        onClose={() => setEditOpen(false)}
        onSubmit={async (vals: any) => {
          await securityApi.updateCredit({
            equifax: vals.equifax || undefined,
            transunion: vals.transunion || undefined,
            experian: vals.experian || undefined,
          });
          await load();
        }}
        testID="credit-edit-modal"
      />
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
  updateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: radius.md,
  },
  updateBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  bureauCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  bureauName: { color: colors.textPrimary, fontWeight: "700", fontSize: 15 },
  bureauBand: { fontSize: 11, fontWeight: "700", marginTop: 2, letterSpacing: 0.5 },
  bureauScore: { fontSize: 32, fontWeight: "300", letterSpacing: -1 },
  chip: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm, marginTop: 4 },
  chipText: { fontSize: 11, fontWeight: "700" },
  sectionLabel: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginTop: spacing.lg,
  },
  inquiryCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: "rgba(239,68,68,0.25)",
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  inquiryName: { color: colors.textPrimary, fontWeight: "700", fontSize: 13 },
  inquirySub: { color: colors.textTertiary, fontSize: 11, marginTop: 2 },
  inquiryDrop: { color: colors.warning, fontSize: 10, fontWeight: "700" },
  chartCard: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: "center",
  },
  chartTitle: { color: colors.textSecondary, fontSize: 12, fontWeight: "700", marginBottom: 4, alignSelf: "flex-start" },
  axis: { flexDirection: "row", width: "100%", justifyContent: "space-between", paddingHorizontal: 18, marginTop: 4 },
  axisLabel: { color: colors.textTertiary, fontSize: 9 },
  tipCard: {
    backgroundColor: colors.surface,
    borderColor: colors.primaryMuted,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  tipHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  tipHeadText: { color: colors.textTertiary, fontSize: 11, fontWeight: "700", letterSpacing: 1, flex: 1 },
  tipBtn: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.sm, backgroundColor: colors.primaryMuted },
  tipBtnText: { color: colors.primaryGlow, fontWeight: "700", fontSize: 12 },
  tipText: { color: colors.textPrimary, fontSize: 13, lineHeight: 20 },
  tipMeta: { color: colors.textSecondary, fontSize: 12 },
  tipEmpty: { color: colors.textTertiary, fontSize: 13 },
});
