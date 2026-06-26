// Market Readiness — stock + crypto gate with conditions & allocation guidance.
import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Check, X as XIcon, TrendingUp, Bitcoin } from "lucide-react-native";
import { investmentsApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";

export default function MarketReadiness() {
  const router = useRouter();
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingRisk, setSavingRisk] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await investmentsApi.marketReadiness();
      setData(r);
    } catch (_e) {}
  }, []);

  useEffect(() => {
    (async () => {
      await load();
      setLoading(false);
    })();
  }, [load]);

  const updateRisk = async (val: number) => {
    setSavingRisk(true);
    try {
      await investmentsApi.setRiskTolerance(val);
      await load();
    } catch (_e) {}
    setSavingRisk(false);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} testID="mkt-back">
          <ArrowLeft color={colors.textPrimary} size={20} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Market Readiness</Text>
        <View style={{ width: 36 }} />
      </View>
      {loading || !data ? (
        <View style={styles.loader}><ActivityIndicator color={colors.primaryGlow} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Risk tolerance setter */}
          <View style={styles.riskCard} testID="risk-card">
            <Text style={styles.cardTitle}>Risk Tolerance</Text>
            <Text style={styles.cardSub}>Currently {data.risk_tolerance}/10</Text>
            <View style={styles.riskRow}>
              {[1, 3, 5, 7, 9].map((v) => (
                <TouchableOpacity
                  key={v}
                  onPress={() => updateRisk(v)}
                  disabled={savingRisk}
                  style={[styles.riskChip, data.risk_tolerance === v && styles.riskChipActive]}
                  testID={`risk-${v}`}
                >
                  <Text style={[styles.riskChipText, data.risk_tolerance === v && { color: colors.primaryGlow }]}>
                    {v}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Stock readiness */}
          <View
            style={[styles.marketCard, { borderColor: data.stock_ready ? "rgba(16,185,129,0.4)" : "rgba(239,68,68,0.3)" }]}
            testID="stock-readiness-card"
          >
            <View style={styles.marketHead}>
              <TrendingUp color={data.stock_ready ? colors.success : colors.danger} size={20} />
              <Text style={styles.marketTitle}>Stock Index ETFs</Text>
              <View style={[styles.statusBadge, { backgroundColor: data.stock_ready ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)" }]}>
                <Text style={[styles.statusText, { color: data.stock_ready ? colors.success : colors.danger }]}>
                  {data.stock_ready ? "READY" : "NOT YET"}
                </Text>
              </View>
            </View>
            {data.stock_ready ? (
              <Text style={styles.readyText}>
                You can invest in low-cost index ETFs (VTI, VOO, etc.). Stay diversified.
              </Text>
            ) : (
              <View style={{ gap: 6 }}>
                <Text style={styles.condLabel}>Conditions to meet:</Text>
                {data.stock_conditions_to_meet.map((c: string, i: number) => (
                  <View key={i} style={styles.condRow}>
                    <XIcon size={12} color={colors.danger} />
                    <Text style={styles.condText}>{c}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Crypto readiness */}
          <View
            style={[styles.marketCard, { borderColor: data.crypto_ready ? "rgba(16,185,129,0.4)" : "rgba(239,68,68,0.3)" }]}
            testID="crypto-readiness-card"
          >
            <View style={styles.marketHead}>
              <Bitcoin color={data.crypto_ready ? colors.success : colors.danger} size={20} />
              <Text style={styles.marketTitle}>Crypto</Text>
              <View style={[styles.statusBadge, { backgroundColor: data.crypto_ready ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)" }]}>
                <Text style={[styles.statusText, { color: data.crypto_ready ? colors.success : colors.danger }]}>
                  {data.crypto_ready ? "READY" : "NOT YET"}
                </Text>
              </View>
            </View>
            {data.crypto_ready ? (
              <Text style={styles.readyText}>
                Crypto is OK at ≤ 5% of portfolio. Stick to BTC/ETH only.
              </Text>
            ) : (
              <View style={{ gap: 6 }}>
                <Text style={styles.condLabel}>Conditions to meet:</Text>
                {data.crypto_conditions_to_meet.map((c: string, i: number) => (
                  <View key={i} style={styles.condRow}>
                    <XIcon size={12} color={colors.danger} />
                    <Text style={styles.condText}>{c}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Allocation */}
          {data.allocation && (
            <View style={styles.allocCard} testID="allocation-card">
              <Text style={styles.cardTitle}>Suggested Allocation</Text>
              <View style={styles.allocRow}>
                <View style={[styles.allocBar, { flex: data.allocation.equity_pct, backgroundColor: colors.primaryGlow }]}>
                  <Text style={styles.allocBarText}>{data.allocation.equity_pct}% Equity</Text>
                </View>
                <View style={[styles.allocBar, { flex: Math.max(0, data.allocation.bonds_pct), backgroundColor: colors.warning }]}>
                  <Text style={styles.allocBarText}>{data.allocation.bonds_pct}% Bonds</Text>
                </View>
                {data.allocation.crypto_pct > 0 && (
                  <View style={[styles.allocBar, { flex: data.allocation.crypto_pct, backgroundColor: "#F59E0B" }]}>
                    <Text style={styles.allocBarText}>{data.allocation.crypto_pct}%</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          <View style={{ height: 60 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  backBtn: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.surfaceElevated, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  scroll: { padding: spacing.xl, gap: spacing.lg },
  riskCard: { backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg },
  cardTitle: { color: colors.textPrimary, fontWeight: "700" },
  cardSub: { color: colors.textSecondary, fontSize: 12, marginTop: 2, marginBottom: spacing.md },
  riskRow: { flexDirection: "row", gap: spacing.sm },
  riskChip: { flex: 1, paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.surfaceElevated, alignItems: "center", borderWidth: 1, borderColor: "transparent" },
  riskChipActive: { borderColor: colors.primaryGlow, backgroundColor: colors.primaryMuted },
  riskChipText: { color: colors.textSecondary, fontWeight: "700" },
  marketCard: { backgroundColor: colors.surface, borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  marketHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  marketTitle: { color: colors.textPrimary, fontWeight: "700", flex: 1 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  statusText: { fontSize: 10, fontWeight: "700", letterSpacing: 1 },
  readyText: { color: colors.textPrimary, fontSize: 13, lineHeight: 20 },
  condLabel: { color: colors.textTertiary, fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  condRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  condText: { color: colors.textSecondary, fontSize: 13 },
  allocCard: { backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg },
  allocRow: { flexDirection: "row", gap: 2, marginTop: spacing.md, height: 40, borderRadius: radius.md, overflow: "hidden" },
  allocBar: { alignItems: "center", justifyContent: "center" },
  allocBarText: { color: "#fff", fontWeight: "700", fontSize: 11 },
});
