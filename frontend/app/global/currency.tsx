// Currency Exchange screen
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Svg, { Polyline, Line, Circle, Polygon } from "react-native-svg";
import {
  ArrowLeft,
  ArrowRightLeft,
  RefreshCw,
  Bell,
  WifiOff,
  Sparkles,
  PlusCircle,
  CheckCircle2,
  Trash2,
} from "lucide-react-native";

import { globalApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";

const CURRENCIES = [
  { code: "USD", name: "US Dollar", flag: "🇺🇸" },
  { code: "PHP", name: "Philippine Peso", flag: "🇵🇭" },
  { code: "EUR", name: "Euro", flag: "🇪🇺" },
  { code: "GBP", name: "British Pound", flag: "🇬🇧" },
  { code: "JPY", name: "Japanese Yen", flag: "🇯🇵" },
  { code: "CAD", name: "Canadian Dollar", flag: "🇨🇦" },
  { code: "AUD", name: "Australian Dollar", flag: "🇦🇺" },
  { code: "CHF", name: "Swiss Franc", flag: "🇨🇭" },
  { code: "CNY", name: "Chinese Yuan", flag: "🇨🇳" },
  { code: "KRW", name: "South Korean Won", flag: "🇰🇷" },
  { code: "NGN", name: "Nigerian Naira", flag: "🇳🇬" },
  { code: "XAF", name: "CFA Franc", flag: "🌍" },
  { code: "SGD", name: "Singapore Dollar", flag: "🇸🇬" },
];

function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const update = () => setOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    update();
    if (typeof window !== "undefined") {
      window.addEventListener("online", update);
      window.addEventListener("offline", update);
      return () => {
        window.removeEventListener("online", update);
        window.removeEventListener("offline", update);
      };
    }
  }, []);
  return online;
}

function convert(amount: number, from: string, to: string, rates: Record<string, number>) {
  if (!rates) return 0;
  // rates are USD-based
  const usd = from === "USD" ? amount : amount / (rates[from] || 1);
  return to === "USD" ? usd : usd * (rates[to] || 1);
}

function fmt(n: number, code: string) {
  if (!Number.isFinite(n)) return "0";
  if (code === "JPY" || code === "KRW") return Math.round(n).toLocaleString("en-US");
  return n.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function TrendChart({ series, low, high, avg, current }: { series: any[]; low: number; high: number; avg: number; current: number }) {
  if (!series?.length) return null;
  const W = 340;
  const H = 100;
  const padX = 18;
  const padY = 12;
  const min = Math.min(...series.map((p) => p.rate)) - 0.05;
  const max = Math.max(...series.map((p) => p.rate)) + 0.05;
  const xStep = (W - 2 * padX) / Math.max(1, series.length - 1);
  const yScale = (H - 2 * padY) / Math.max(0.0001, max - min);
  const pts = series.map((p, i) => ({ x: padX + i * xStep, y: H - padY - (p.rate - min) * yScale }));
  const lineStr = pts.map((p) => `${p.x},${p.y}`).join(" ");
  const fillStr = `${pts[0].x},${H - padY} ${lineStr} ${pts[pts.length - 1].x},${H - padY}`;
  const avgY = H - padY - (avg - min) * yScale;
  const last = pts[pts.length - 1];
  return (
    <View style={styles.chartCard} testID="currency-chart">
      <Svg width={W} height={H}>
        <Polygon points={fillStr} fill={colors.primaryGlow + "20"} />
        <Line x1={padX} y1={avgY} x2={W - padX} y2={avgY} stroke={colors.textTertiary} strokeWidth={1} strokeDasharray="3,3" />
        <Polyline points={lineStr} fill="none" stroke={colors.primaryGlow} strokeWidth={2} />
        {pts.map((p, i) => i % 5 === 0 && <Circle key={i} cx={p.x} cy={p.y} r={2} fill={colors.primaryGlow} />)}
        {/* Current marker triangle */}
        <Polygon
          points={`${last.x - 5},${last.y - 8} ${last.x + 5},${last.y - 8} ${last.x},${last.y}`}
          fill={colors.success}
        />
      </Svg>
      <Text style={styles.chartStats}>
        Low: <Text style={{ color: colors.danger }}>{low.toFixed(2)}</Text>  ·  High: <Text style={{ color: colors.success }}>{high.toFixed(2)}</Text>  ·  Avg: {avg.toFixed(2)}  ·  Now: <Text style={{ color: colors.primaryGlow }}>{current.toFixed(2)}</Text>
      </Text>
    </View>
  );
}

export default function Currency() {
  const router = useRouter();
  const online = useOnline();
  const [from, setFrom] = useState("USD");
  const [to, setTo] = useState("PHP");
  const [amount, setAmount] = useState("1000");
  const [rates, setRates] = useState<Record<string, number>>({});
  const [ratesMeta, setRatesMeta] = useState<{ last_updated?: string; is_live?: boolean; is_cached?: boolean }>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [history, setHistory] = useState<any>({ series: [], low: 0, high: 0, avg: 0, current: 0 });
  const [alerts, setAlerts] = useState<any[]>([]);
  const [tips, setTips] = useState<{ tips: string[]; is_custom: boolean }>({ tips: [], is_custom: false });
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  const [triggeredAlerts, setTriggeredAlerts] = useState<any[]>([]);
  const [newAlertOpen, setNewAlertOpen] = useState(false);
  const [newAlert, setNewAlert] = useState({ base: "USD", target: "PHP", rate_target: "58", direction: "above" as "above" | "below", label: "" });

  const load = useCallback(async () => {
    const [r, h, a, t, c] = await Promise.all([
      globalApi.rates().catch(() => ({ rates: {} })),
      globalApi.rateHistory("USD", "PHP").catch(() => ({})),
      globalApi.listAlerts().catch(() => ({ alerts: [] })),
      globalApi.moneyTips().catch(() => ({ tips: [] })),
      globalApi.checkAlerts().catch(() => ({ triggered: [] })),
    ]);
    setRates(r.rates || {});
    setRatesMeta({ last_updated: r.last_updated, is_live: r.is_live, is_cached: r.is_cached });
    setHistory(h);
    setAlerts(a.alerts || []);
    setTips(t);
    setTriggeredAlerts(c.triggered || []);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await load();
      } catch (_e) {}
      setLoading(false);
    })();
  }, [load]);

  const loadHistoryFor = async (base: string, target: string) => {
    try {
      const h = await globalApi.rateHistory(base, target);
      setHistory(h);
    } catch (_e) {}
  };

  useEffect(() => {
    loadHistoryFor(from, to);
  }, [from, to]);

  const result = useMemo(() => {
    const a = parseFloat(amount) || 0;
    return convert(a, from, to, rates);
  }, [amount, from, to, rates]);

  const swap = () => {
    const a = from;
    setFrom(to);
    setTo(a);
  };

  const refreshTips = async () => {
    setBusy("tips");
    try {
      const r = await globalApi.refreshMoneyTips();
      setTips({ tips: r.tips, is_custom: true });
    } catch (_e) {}
    setBusy(null);
  };

  const createAlert = async () => {
    const rate_target = parseFloat(newAlert.rate_target);
    if (!rate_target) {
      Alert.alert("Invalid", "Enter a target rate");
      return;
    }
    setBusy("alert");
    try {
      await globalApi.createAlert({
        base: newAlert.base,
        target: newAlert.target,
        rate_target,
        direction: newAlert.direction,
        label: newAlert.label || null,
      });
      const a = await globalApi.listAlerts();
      setAlerts(a.alerts || []);
      setNewAlertOpen(false);
      setNewAlert({ base: "USD", target: "PHP", rate_target: "58", direction: "above", label: "" });
    } catch (_e) {}
    setBusy(null);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.loader}><ActivityIndicator color={colors.primaryGlow} /></View>
      </SafeAreaView>
    );
  }

  const fromObj = CURRENCIES.find((c) => c.code === from) || CURRENCIES[0];
  const toObj = CURRENCIES.find((c) => c.code === to) || CURRENCIES[1];
  const rate = rates[to] && rates[from] ? rates[to] / rates[from] : 0;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} testID="cur-back">
          <ArrowLeft color={colors.textPrimary} size={20} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Currency Exchange</Text>
        <TouchableOpacity onPress={load} style={styles.refreshBtn} testID="cur-refresh">
          <RefreshCw color={colors.primaryGlow} size={16} />
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        {!online && (
          <View style={styles.offlineBanner} testID="cur-offline-banner">
            <WifiOff size={12} color={colors.warning} />
            <Text style={styles.offlineText}>
              Offline — showing rates from {ratesMeta.last_updated || "last cache"}. Connect to internet to refresh.
            </Text>
          </View>
        )}

        {triggeredAlerts.length > 0 && (
          <View style={styles.triggerBanner} testID="trigger-banner">
            <Bell size={14} color={colors.success} />
            <Text style={styles.triggerText}>
              Rate Alert: {triggeredAlerts[0].base}/{triggeredAlerts[0].target} has reached {triggeredAlerts[0].current_rate} — {triggeredAlerts[0].label || "good time to transfer"}.
            </Text>
          </View>
        )}

        {/* Converter */}
        <View style={styles.converter} testID="converter-card">
          <TouchableOpacity onPress={() => setShowFromPicker((s) => !s)} style={styles.fromTopRow} testID="from-select">
            <Text style={styles.flagBig}>{fromObj.flag}</Text>
            <Text style={styles.codeBig}>{fromObj.code}</Text>
          </TouchableOpacity>
          <TextInput
            value={amount}
            onChangeText={(t) => setAmount(t.replace(/[^\d.]/g, ""))}
            keyboardType="decimal-pad"
            style={styles.amountInput}
            testID="from-amount"
          />
          {showFromPicker && (
            <View style={styles.picker}>
              {CURRENCIES.map((c) => (
                <TouchableOpacity key={c.code} onPress={() => { setFrom(c.code); setShowFromPicker(false); }} style={styles.pickerItem} testID={`from-${c.code}`}>
                  <Text style={styles.pickerText}>{c.flag}  {c.code} · {c.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <TouchableOpacity onPress={swap} style={styles.swapBtnRow} testID="cur-swap">
            <ArrowRightLeft color={colors.primaryGlow} size={18} />
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setShowToPicker((s) => !s)} style={styles.fromTopRow} testID="to-select">
            <Text style={styles.flagBig}>{toObj.flag}</Text>
            <Text style={styles.codeBig}>{toObj.code}</Text>
          </TouchableOpacity>
          <Text style={styles.resultText} testID="conv-result">{fmt(result, to)}</Text>
          {showToPicker && (
            <View style={styles.picker}>
              {CURRENCIES.map((c) => (
                <TouchableOpacity key={c.code} onPress={() => { setTo(c.code); setShowToPicker(false); }} style={styles.pickerItem} testID={`to-${c.code}`}>
                  <Text style={styles.pickerText}>{c.flag}  {c.code} · {c.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Rate detail card */}
        <View style={styles.detailCard}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Mid-market rate</Text>
            <Text style={styles.detailValue}>1 {from} = {rate.toFixed(4)} {to}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Last updated</Text>
            <Text style={styles.detailValue}>{ratesMeta.last_updated ? new Date(ratesMeta.last_updated).toLocaleString() : "—"}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Bank rate (est.)</Text>
            <Text style={[styles.detailValue, { color: colors.danger }]}>{(rate * 0.965).toFixed(4)} <Text style={styles.detailSub}>(~3.5% spread)</Text></Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Wise / Remitly fee</Text>
            <Text style={styles.detailValue}>~$4.50 for $1,000</Text>
          </View>
          <Text style={styles.disclaimer}>Rates may be delayed up to 1 hour.</Text>
        </View>

        {/* Multi-currency grid */}
        <Text style={styles.sectionLabel}>$1,000 USD equals…</Text>
        <View style={styles.gridWrap}>
          {CURRENCIES.filter((c) => c.code !== "USD").map((c) => (
            <View key={c.code} style={styles.gridCard} testID={`grid-${c.code}`}>
              <Text style={styles.gridFlag}>{c.flag}</Text>
              <Text style={styles.gridCode}>{c.code}</Text>
              <Text style={styles.gridValue}>{fmt((rates[c.code] || 0) * 1000, c.code)}</Text>
            </View>
          ))}
        </View>

        {/* 30-day chart */}
        <Text style={styles.sectionLabel}>30-Day {from}/{to} Trend</Text>
        {history?.series?.length > 0 ? (
          <TrendChart
            series={history.series}
            low={history.low}
            high={history.high}
            avg={history.avg}
            current={history.current}
          />
        ) : (
          <View style={styles.card}><Text style={styles.empty}>No history seeded for this pair yet. USD/PHP, USD/EUR, USD/NGN available.</Text></View>
        )}

        {/* Alerts */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionLabel}>Rate Alerts</Text>
          <TouchableOpacity onPress={() => setNewAlertOpen((s) => !s)} testID="add-alert">
            <PlusCircle size={16} color={colors.primaryGlow} />
          </TouchableOpacity>
        </View>
        {newAlertOpen && (
          <View style={styles.alertForm}>
            <View style={{ flexDirection: "row", gap: 6 }}>
              <TextInput placeholder="Base" placeholderTextColor={colors.textTertiary} value={newAlert.base} onChangeText={(t) => setNewAlert((s) => ({ ...s, base: t.toUpperCase() }))} style={styles.alertInput} maxLength={3} />
              <TextInput placeholder="Target" placeholderTextColor={colors.textTertiary} value={newAlert.target} onChangeText={(t) => setNewAlert((s) => ({ ...s, target: t.toUpperCase() }))} style={styles.alertInput} maxLength={3} />
              <TextInput placeholder="Rate" placeholderTextColor={colors.textTertiary} value={newAlert.rate_target} onChangeText={(t) => setNewAlert((s) => ({ ...s, rate_target: t }))} style={styles.alertInput} keyboardType="decimal-pad" />
            </View>
            <View style={styles.dirRow}>
              {(["above", "below"] as const).map((d) => (
                <TouchableOpacity key={d} onPress={() => setNewAlert((s) => ({ ...s, direction: d }))} style={[styles.dirPill, newAlert.direction === d && styles.dirPillActive]} testID={`dir-${d}`}>
                  <Text style={[styles.dirText, newAlert.direction === d && { color: colors.primaryGlow }]}>{d}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput placeholder="Label (optional)" placeholderTextColor={colors.textTertiary} value={newAlert.label} onChangeText={(t) => setNewAlert((s) => ({ ...s, label: t }))} style={[styles.alertInput, { width: "100%" }]} />
            <TouchableOpacity onPress={createAlert} style={styles.createBtn} disabled={busy === "alert"} testID="alert-save">
              {busy === "alert" ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.createBtnText}>Create Alert</Text>}
            </TouchableOpacity>
          </View>
        )}
        {alerts.length === 0 && !newAlertOpen ? (
          <View style={styles.card}><Text style={styles.empty}>No alerts yet. Tap + to create one.</Text></View>
        ) : (
          alerts.map((a) => (
            <View key={a.alert_id} style={styles.alertCard} testID={`alert-${a.alert_id}`}>
              <View style={{ flex: 1 }}>
                <Text style={styles.alertPair}>{a.base} / {a.target}</Text>
                <Text style={styles.alertLabel}>{a.label || "Watching"}</Text>
                <Text style={styles.alertRule}>{a.direction === "above" ? "≥" : "≤"} {a.rate_target}</Text>
              </View>
              {a.status === "triggered" ? (
                <View style={[styles.statusPill, { backgroundColor: "rgba(16,185,129,0.15)" }]}>
                  <CheckCircle2 size={11} color={colors.success} />
                  <Text style={[styles.statusText, { color: colors.success }]}>TRIGGERED</Text>
                </View>
              ) : (
                <View style={[styles.statusPill, { backgroundColor: "rgba(96,165,250,0.12)" }]}>
                  <Bell size={11} color={colors.primaryGlow} />
                  <Text style={[styles.statusText, { color: colors.primaryGlow }]}>WATCHING</Text>
                </View>
              )}
              <TouchableOpacity onPress={async () => { await globalApi.deleteAlert(a.alert_id); load(); }} testID={`alert-del-${a.alert_id}`}>
                <Trash2 size={14} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>
          ))
        )}

        {/* Money tips */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionLabel}>Smart Money Tips</Text>
          <TouchableOpacity onPress={refreshTips} disabled={busy === "tips"} style={styles.refreshTipsBtn} testID="refresh-tips">
            {busy === "tips" ? <ActivityIndicator size="small" color={colors.primaryGlow} /> : <Sparkles size={12} color={colors.primaryGlow} />}
            <Text style={styles.refreshTipsText}>{tips.is_custom ? "Refresh" : "Personalize"}</Text>
          </TouchableOpacity>
        </View>
        {tips.tips.map((t, i) => (
          <View key={i} style={styles.tipCard} testID={`tip-${i}`}>
            <Text style={styles.tipNum}>{i + 1}</Text>
            <Text style={styles.tipText}>{t}</Text>
          </View>
        ))}

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  backBtn: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.surfaceElevated, alignItems: "center", justifyContent: "center" },
  refreshBtn: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.primaryMuted, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  scroll: { padding: spacing.xl, gap: spacing.md, paddingTop: spacing.md },

  offlineBanner: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(245,158,11,0.10)", borderColor: "rgba(245,158,11,0.30)", borderWidth: 1, padding: spacing.sm, borderRadius: radius.sm },
  offlineText: { color: colors.warning, fontSize: 11, flex: 1 },

  triggerBanner: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(16,185,129,0.12)", borderColor: "rgba(16,185,129,0.35)", borderWidth: 1, padding: spacing.md, borderRadius: radius.md },
  triggerText: { color: colors.success, fontSize: 12, flex: 1, lineHeight: 17, fontWeight: "600" },

  converter: { backgroundColor: colors.surface, borderColor: colors.primaryMuted, borderWidth: 1, borderRadius: radius.xl, padding: spacing.lg, gap: spacing.sm },
  fromTopRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  flagBig: { fontSize: 24 },
  codeBig: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  amountInput: { color: colors.textPrimary, fontSize: 32, fontWeight: "300", letterSpacing: -1, padding: 0 },
  picker: { backgroundColor: colors.surfaceElevated, borderRadius: radius.md, paddingVertical: 4, maxHeight: 200 },
  pickerItem: { paddingHorizontal: spacing.md, paddingVertical: 8 },
  pickerText: { color: colors.textPrimary, fontSize: 13 },
  swapBtnRow: { alignSelf: "center", width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primaryMuted, alignItems: "center", justifyContent: "center" },
  resultText: { color: colors.success, fontSize: 32, fontWeight: "300", letterSpacing: -1 },

  detailCard: { backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: 6 },
  detailRow: { flexDirection: "row", justifyContent: "space-between" },
  detailLabel: { color: colors.textTertiary, fontSize: 12 },
  detailValue: { color: colors.textPrimary, fontWeight: "700", fontSize: 13 },
  detailSub: { color: colors.textTertiary, fontSize: 10, fontWeight: "400" },
  disclaimer: { color: colors.textTertiary, fontSize: 10, fontStyle: "italic", marginTop: 4 },

  sectionLabel: { color: colors.textTertiary, fontSize: 11, fontWeight: "700", letterSpacing: 1.5, textTransform: "uppercase" },
  sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },

  gridWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  gridCard: { width: "31.5%", backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1, borderRadius: radius.sm, padding: 8, alignItems: "center" },
  gridFlag: { fontSize: 18 },
  gridCode: { color: colors.textTertiary, fontSize: 9, fontWeight: "700", letterSpacing: 1, marginTop: 2 },
  gridValue: { color: colors.textPrimary, fontSize: 13, fontWeight: "700", marginTop: 2 },

  chartCard: { backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, alignItems: "center" },
  chartStats: { color: colors.textSecondary, fontSize: 11, marginTop: 4 },

  card: { backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  empty: { color: colors.textTertiary, textAlign: "center" },

  alertForm: { backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: 6 },
  alertInput: { flex: 1, backgroundColor: colors.surfaceElevated, color: colors.textPrimary, padding: 8, borderRadius: radius.sm, fontSize: 12 },
  dirRow: { flexDirection: "row", gap: 6 },
  dirPill: { flex: 1, padding: 8, borderRadius: radius.sm, backgroundColor: colors.surfaceElevated, alignItems: "center" },
  dirPillActive: { backgroundColor: colors.primaryMuted },
  dirText: { color: colors.textSecondary, fontWeight: "700", fontSize: 12, textTransform: "uppercase" },
  createBtn: { backgroundColor: colors.primary, padding: 10, borderRadius: radius.sm, alignItems: "center" },
  createBtnText: { color: "#fff", fontWeight: "700" },

  alertCard: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  alertPair: { color: colors.textPrimary, fontWeight: "700", fontSize: 14 },
  alertLabel: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  alertRule: { color: colors.textTertiary, fontSize: 11, marginTop: 1 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm },
  statusText: { fontSize: 9, fontWeight: "700", letterSpacing: 1 },

  refreshTipsBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.sm, backgroundColor: colors.primaryMuted },
  refreshTipsText: { color: colors.primaryGlow, fontWeight: "700", fontSize: 11 },
  tipCard: { flexDirection: "row", gap: spacing.sm, backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  tipNum: { color: colors.primaryGlow, fontSize: 14, fontWeight: "700", width: 18 },
  tipText: { color: colors.textPrimary, fontSize: 12, lineHeight: 18, flex: 1 },
});
