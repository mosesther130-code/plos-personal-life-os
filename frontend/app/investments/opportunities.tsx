// Safe Investment Opportunities — ranked by match score with step instructions.
import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, ChevronDown, ChevronUp, Lock } from "lucide-react-native";
import { investmentsApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";

const RISK_COLOR: Record<string, string> = {
  "minimal": colors.success,
  "very low": colors.success,
  "low": colors.success,
  "low-medium": colors.warning,
  "medium": colors.warning,
  "high": colors.danger,
};

export default function Opportunities() {
  const router = useRouter();
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await investmentsApi.opportunities();
        setData(r);
      } catch (_e) {}
      setLoading(false);
    })();
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} testID="opps-back">
          <ArrowLeft color={colors.textPrimary} size={20} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Opportunities</Text>
        <View style={{ width: 36 }} />
      </View>
      {loading ? (
        <View style={styles.loader}><ActivityIndicator color={colors.primaryGlow} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.intro}>
            Ranked safe investment opportunities matched to your current profile.
          </Text>
          {data?.opportunities.map((o: any, i: number) => {
            const open = expanded === i;
            const riskColor = RISK_COLOR[o.risk] || colors.textSecondary;
            return (
              <View key={o.name} style={styles.oppCard} testID={`opportunity-${i}`}>
                <View style={styles.oppHead}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.oppName}>{o.name}</Text>
                    <View style={styles.oppMeta}>
                      <View style={[styles.riskPill, { backgroundColor: `${riskColor}25` }]}>
                        <Text style={[styles.riskText, { color: riskColor }]}>{o.risk}</Text>
                      </View>
                      <Text style={styles.oppMetric}>~{o.est_return_annual_pct}% /yr</Text>
                      <Text style={styles.oppMetric}>min ${o.min_to_start}</Text>
                    </View>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <Text style={[styles.match, { color: o.match_score >= 85 ? colors.success : o.match_score >= 70 ? colors.warning : colors.textSecondary }]}>{o.match_score}%</Text>
                    {!o.prereqs_met && <Lock size={12} color={colors.warning} />}
                  </View>
                </View>
                <View style={styles.matchBar}>
                  <View style={[styles.matchFill, { width: `${o.match_score}%`, backgroundColor: o.match_score >= 85 ? colors.success : o.match_score >= 70 ? colors.warning : colors.textTertiary }]} />
                </View>
                <TouchableOpacity
                  style={[styles.startBtn, !o.prereqs_met && { opacity: 0.55 }]}
                  onPress={() => setExpanded(open ? null : i)}
                  disabled={!o.prereqs_met}
                  testID={`start-${i}`}
                >
                  <Text style={styles.startBtnText}>
                    {open ? "Hide steps" : !o.prereqs_met ? "Prereqs not met" : "Start This Investment"}
                  </Text>
                  {open ? <ChevronUp color="#fff" size={14} /> : <ChevronDown color="#fff" size={14} />}
                </TouchableOpacity>
                {open && (
                  <View style={styles.steps} testID={`steps-${i}`}>
                    {o.instructions.map((step: string, j: number) => (
                      <View key={j} style={styles.stepRow}>
                        <View style={styles.stepNum}><Text style={styles.stepNumText}>{j + 1}</Text></View>
                        <Text style={styles.stepText}>{step}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
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
  scroll: { padding: spacing.xl, gap: spacing.md },
  intro: { color: colors.textSecondary, fontSize: 13, marginBottom: spacing.md },
  oppCard: { backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  oppHead: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  oppName: { color: colors.textPrimary, fontSize: 15, fontWeight: "700" },
  oppMeta: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6, alignItems: "center" },
  riskPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  riskText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
  oppMetric: { color: colors.textTertiary, fontSize: 12, fontWeight: "600" },
  match: { fontSize: 20, fontWeight: "700", letterSpacing: -0.5 },
  matchBar: { height: 4, borderRadius: 2, backgroundColor: colors.borderSubtle, overflow: "hidden" },
  matchFill: { height: "100%" },
  startBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.primary, paddingVertical: 10, borderRadius: radius.md },
  startBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  steps: { gap: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  stepRow: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  stepNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.primaryMuted, alignItems: "center", justifyContent: "center" },
  stepNumText: { color: colors.primaryGlow, fontSize: 11, fontWeight: "700" },
  stepText: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, flex: 1 },
});
