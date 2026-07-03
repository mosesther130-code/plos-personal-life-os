import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from "react-native";
import Svg, { Path, Line, Circle, Rect } from "react-native-svg";
import { RefreshCw, TrendingUp, AlertTriangle, CheckCircle } from "lucide-react-native";
import { plaidApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";

const CHART_WIDTH = 340;
const CHART_HEIGHT = 160;
const PAD_L = 30;
const PAD_R = 8;
const PAD_T = 8;
const PAD_B = 20;
const PLOT_W = CHART_WIDTH - PAD_L - PAD_R;
const PLOT_H = CHART_HEIGHT - PAD_T - PAD_B;

const fmtUSD = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export function CashFlowForecast() {
  const [forecast, setForecast] = useState<any>(null);
  const [range, setRange] = useState<30 | 60 | 90>(90);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);

  const load = useCallback(async (regenerate = false) => {
    if (regenerate) setRegenerating(true); else setLoading(true);
    try {
      const r = await plaidApi.cashflowForecast(90, 500, regenerate);
      setForecast(r);
    } catch (_e) {}
    setLoading(false);
    setRegenerating(false);
  }, []);

  useEffect(() => { load(false); }, [load]);

  if (loading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color={colors.primaryGlow} />
      </View>
    );
  }

  if (!forecast || !forecast.days || forecast.days.length === 0) {
    return (
      <View style={styles.card}>
        <View style={styles.header}>
          <TrendingUp size={14} color={colors.primaryGlow} />
          <Text style={styles.title}>90-Day Cash Flow Forecast</Text>
        </View>
        <Text style={styles.emptyText}>
          Connect a bank account and add income sources to see your projected balance.
        </Text>
        <TouchableOpacity style={styles.regenBtn} onPress={() => load(true)} disabled={regenerating}>
          {regenerating ? <ActivityIndicator size="small" color="#fff" /> : <RefreshCw size={12} color="#fff" />}
          <Text style={styles.regenBtnText}>Generate</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const daysWindow = forecast.days.slice(0, range);
  const threshold = forecast.low_balance_threshold || 500;
  const balances = daysWindow.map((d: any) => d.closing_balance);
  const minY = Math.min(0, Math.min(...balances) - 200);
  const maxY = Math.max(...balances) + 200;
  const spanY = Math.max(1, maxY - minY);
  const scaleX = (i: number) => PAD_L + (i / Math.max(1, daysWindow.length - 1)) * PLOT_W;
  const scaleY = (v: number) => PAD_T + PLOT_H - ((v - minY) / spanY) * PLOT_H;

  // Build path
  let pathD = "";
  daysWindow.forEach((d: any, i: number) => {
    const x = scaleX(i);
    const y = scaleY(d.closing_balance);
    pathD += (i === 0 ? "M" : " L") + x.toFixed(1) + "," + y.toFixed(1);
  });

  // Filled area under line
  const areaD = pathD +
    ` L${scaleX(daysWindow.length - 1).toFixed(1)},${(PAD_T + PLOT_H).toFixed(1)}` +
    ` L${scaleX(0).toFixed(1)},${(PAD_T + PLOT_H).toFixed(1)} Z`;

  const thresholdY = scaleY(threshold);

  const yTicks = [minY, minY + spanY * 0.5, maxY].map((v) => ({
    v: Math.round(v),
    y: scaleY(v),
  }));

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <TrendingUp size={14} color={colors.primaryGlow} />
        <Text style={styles.title}>90-Day Cash Flow Forecast</Text>
        <TouchableOpacity style={styles.regenBtn} onPress={() => load(true)} disabled={regenerating} testID="cashflow-regenerate">
          {regenerating ? <ActivityIndicator size="small" color="#fff" /> : <RefreshCw size={11} color="#fff" />}
          <Text style={styles.regenBtnText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {/* Range toggles */}
      <View style={styles.rangeRow}>
        {[30, 60, 90].map((d) => (
          <TouchableOpacity
            key={d}
            style={[styles.rangeBtn, range === d && styles.rangeBtnActive]}
            onPress={() => setRange(d as any)}
            testID={`range-${d}`}
          >
            <Text style={[styles.rangeBtnText, range === d && styles.rangeBtnTextActive]}>{d}d</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* SVG Chart */}
      <View style={styles.chartWrap}>
        <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
          {/* Y-axis grid + labels */}
          {yTicks.map((t, i) => (
            <React.Fragment key={i}>
              <Line x1={PAD_L} y1={t.y} x2={PAD_L + PLOT_W} y2={t.y} stroke="#333" strokeWidth={0.5} strokeDasharray="2,3" />
            </React.Fragment>
          ))}
          {/* Threshold line */}
          <Line x1={PAD_L} y1={thresholdY} x2={PAD_L + PLOT_W} y2={thresholdY} stroke="#F59E0B" strokeWidth={1} strokeDasharray="4,3" />
          {/* Area fill */}
          <Path d={areaD} fill="rgba(20,184,166,0.15)" />
          {/* Balance line */}
          <Path d={pathD} stroke={colors.success} strokeWidth={2} fill="none" />
          {/* Income markers */}
          {daysWindow.map((d: any, i: number) =>
            d.has_income ? (
              <Circle key={`in-${i}`} cx={scaleX(i)} cy={scaleY(d.closing_balance)} r={3} fill={colors.success} />
            ) : null,
          )}
          {/* Large-outflow markers */}
          {daysWindow.map((d: any, i: number) =>
            d.has_large_outflow ? (
              <Rect key={`out-${i}`} x={scaleX(i) - 1} y={PAD_T + PLOT_H - 6} width={2} height={6} fill={colors.danger} />
            ) : null,
          )}
        </Svg>
        {yTicks.map((t, i) => (
          <Text key={i} style={[styles.axisLabel, { top: t.y - 6 }]}>{fmtUSD(t.v)}</Text>
        ))}
      </View>

      <View style={styles.legendRow}>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: colors.success }]} /><Text style={styles.legendText}>Income</Text></View>
        <View style={styles.legendItem}><View style={[styles.legendBar, { backgroundColor: colors.danger }]} /><Text style={styles.legendText}>Large bill</Text></View>
        <View style={styles.legendItem}><View style={[styles.legendBar, { backgroundColor: "#F59E0B" }]} /><Text style={styles.legendText}>Low threshold ${threshold}</Text></View>
      </View>

      {/* Summary numbers */}
      <View style={styles.summaryGrid}>
        <View style={styles.summaryCell}>
          <Text style={styles.summaryLabel}>MIN</Text>
          <Text style={[styles.summaryValue, { color: forecast.summary.min_balance < threshold ? colors.danger : colors.textPrimary }]}>{fmtUSD(forecast.summary.min_balance)}</Text>
        </View>
        <View style={styles.summaryCell}>
          <Text style={styles.summaryLabel}>MAX</Text>
          <Text style={styles.summaryValue}>{fmtUSD(forecast.summary.max_balance)}</Text>
        </View>
        <View style={styles.summaryCell}>
          <Text style={styles.summaryLabel}>END</Text>
          <Text style={[styles.summaryValue, { color: colors.success }]}>{fmtUSD(forecast.summary.ending_balance)}</Text>
        </View>
        <View style={styles.summaryCell}>
          <Text style={styles.summaryLabel}>LOW DAYS</Text>
          <Text style={[styles.summaryValue, { color: forecast.summary.low_balance_days > 0 ? colors.danger : colors.textPrimary }]}>{forecast.summary.low_balance_days}</Text>
        </View>
      </View>

      {/* Alerts */}
      {forecast.alerts && forecast.alerts.length > 0 ? (
        <ScrollView style={styles.alertsWrap} horizontal showsHorizontalScrollIndicator={false}>
          {forecast.alerts.map((a: any, i: number) => (
            <View key={i} style={[styles.alertCard, {
              backgroundColor:
                a.severity === "warning" ? "rgba(245,158,11,0.15)" :
                a.severity === "info" ? "rgba(59,130,246,0.15)" :
                "rgba(16,185,129,0.15)",
              borderColor:
                a.severity === "warning" ? "#F59E0B" :
                a.severity === "info" ? "#3B82F6" : colors.success,
            }]}>
              {a.severity === "success" ? <CheckCircle size={12} color={colors.success} /> : <AlertTriangle size={12} color={a.severity === "warning" ? "#F59E0B" : "#3B82F6"} />}
              <Text style={styles.alertText} numberOfLines={3}>{a.message}</Text>
            </View>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderSubtle, padding: spacing.md, marginTop: spacing.md },
  header: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: { color: colors.textPrimary, fontSize: 13, fontWeight: "700", flex: 1 },
  regenBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.primary, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.sm },
  regenBtnText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  rangeRow: { flexDirection: "row", gap: 6, marginTop: spacing.sm },
  rangeBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.borderSubtle, backgroundColor: colors.bg },
  rangeBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  rangeBtnText: { color: colors.textSecondary, fontSize: 10, fontWeight: "600" },
  rangeBtnTextActive: { color: "#fff" },
  chartWrap: { position: "relative", marginTop: spacing.sm, alignSelf: "center" },
  axisLabel: { position: "absolute", left: 0, width: PAD_L - 3, fontSize: 8, color: colors.textTertiary, textAlign: "right" },
  legendRow: { flexDirection: "row", justifyContent: "space-around", marginTop: 4 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 3 },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  legendBar: { width: 6, height: 2 },
  legendText: { color: colors.textTertiary, fontSize: 9 },
  summaryGrid: { flexDirection: "row", marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderSubtle, paddingTop: spacing.sm },
  summaryCell: { flex: 1, alignItems: "center" },
  summaryLabel: { color: colors.textTertiary, fontSize: 8, fontWeight: "700", letterSpacing: 0.6 },
  summaryValue: { color: colors.textPrimary, fontSize: 12, fontWeight: "700", marginTop: 2 },
  alertsWrap: { marginTop: spacing.sm },
  alertCard: { flexDirection: "row", alignItems: "flex-start", gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.sm, borderWidth: 1, marginRight: 6, width: 240 },
  alertText: { color: colors.textSecondary, fontSize: 10, flex: 1, lineHeight: 14 },
  emptyText: { color: colors.textTertiary, fontSize: 11, marginTop: 8, marginBottom: 10 },
});
