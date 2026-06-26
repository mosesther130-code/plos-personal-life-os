// Investment Readiness Gate.
import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Check, X as XIcon, Clock } from "lucide-react-native";
import { investmentsApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";

export default function Readiness() {
  const router = useRouter();
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await investmentsApi.readinessGate();
        setData(r);
      } catch (_e) {}
      setLoading(false);
    })();
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} testID="readiness-back">
          <ArrowLeft color={colors.textPrimary} size={20} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Investment Readiness</Text>
        <View style={{ width: 36 }} />
      </View>
      {loading ? (
        <View style={styles.loader}><ActivityIndicator color={colors.primaryGlow} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Checklist */}
          <Text style={styles.sectionLabel}>Prerequisites</Text>
          <View style={styles.checklist} testID="readiness-checklist">
            {data?.checklist.map((c: any) => (
              <View key={c.key} style={styles.checkRow} testID={`check-${c.key}`}>
                <View style={[styles.checkIcon, { backgroundColor: c.ready ? "rgba(16,185,129,0.18)" : "rgba(239,68,68,0.18)" }]}>
                  {c.ready ? <Check size={14} color={colors.success} /> : <XIcon size={14} color={colors.danger} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.checkLabel}>{c.label}</Text>
                  <Text style={styles.checkDetail}>{c.detail}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Ready now */}
          <Text style={styles.sectionLabel}>Ready Now</Text>
          <View style={styles.list}>
            {data?.ready_now.map((r: any, i: number) => (
              <View key={i} style={styles.readyRow} testID={`ready-${i}`}>
                <View style={[styles.dot, { backgroundColor: colors.success }]} />
                <Text style={styles.readyText}>{r.name}</Text>
              </View>
            ))}
          </View>

          {/* Blocked */}
          {data?.blocked?.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>Not Yet — Need to Meet</Text>
              <View style={{ gap: spacing.md }}>
                {data.blocked.map((b: any, i: number) => (
                  <View key={i} style={styles.blockedCard} testID={`blocked-${i}`}>
                    <View style={styles.blockedHead}>
                      <View style={[styles.dot, { backgroundColor: colors.danger }]} />
                      <Text style={styles.blockedName}>{b.name}</Text>
                    </View>
                    {b.prerequisites.map((p: string, j: number) => (
                      <View key={j} style={styles.preReq}>
                        <XIcon size={12} color={colors.danger} />
                        <Text style={styles.preReqText}>{p}</Text>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            </>
          )}

          <View style={styles.reassessCard}>
            <Clock color={colors.warning} size={16} />
            <Text style={styles.reassessText}>
              Re-assess in ~{data?.reassessment_in_months ?? 12} months based on your current debt payoff trajectory.
            </Text>
          </View>

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
  sectionLabel: { color: colors.textTertiary, fontSize: 11, fontWeight: "700", letterSpacing: 1.5, textTransform: "uppercase" },
  checklist: { backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1, borderRadius: radius.lg, overflow: "hidden" },
  checkRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  checkIcon: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  checkLabel: { color: colors.textPrimary, fontSize: 14, fontWeight: "600" },
  checkDetail: { color: colors.textTertiary, fontSize: 12, marginTop: 2 },
  list: { backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1, borderRadius: radius.lg, overflow: "hidden" },
  readyRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  dot: { width: 8, height: 8, borderRadius: 4 },
  readyText: { color: colors.textPrimary, fontSize: 14, fontWeight: "600" },
  blockedCard: { backgroundColor: colors.surface, borderColor: "rgba(239,68,68,0.25)", borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: 6 },
  blockedHead: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: 6 },
  blockedName: { color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
  preReq: { flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: 20 },
  preReqText: { color: colors.textSecondary, fontSize: 12 },
  reassessCard: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.warningBg, borderWidth: 1, borderColor: "rgba(245,158,11,0.25)" },
  reassessText: { color: colors.textPrimary, fontSize: 13, flex: 1, lineHeight: 19 },
});
