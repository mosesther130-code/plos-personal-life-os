// Career Path Advisor — 3 AI paths with certs, timeline, salary.
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Compass, Award, Sparkles } from "lucide-react-native";

import { careerApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";

const PATH_COLORS = ["#A855F7", colors.primaryGlow, "#EC4899"];

export default function PathAdvisor() {
  const router = useRouter();
  const [paths, setPaths] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await careerApi.pathAdvisor();
      setPaths(r.paths || []);
    } catch (_e) {
      setPaths([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          testID="path-back"
        >
          <ArrowLeft color={colors.textPrimary} size={20} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Career Path Advisor</Text>
        <TouchableOpacity
          style={styles.refreshBtn}
          onPress={load}
          disabled={loading}
          testID="path-refresh"
        >
          <Sparkles color={colors.primaryGlow} size={14} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator color={colors.primaryGlow} />
          <Text style={styles.loadingText}>
            PLOS AI is mapping your paths…
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.intro}>
            <Compass color={colors.primaryGlow} size={24} />
            <Text style={styles.introTitle}>3 Paths Forward</Text>
            <Text style={styles.introSub}>
              Based on your current role, skills, and goals.
            </Text>
          </View>

          {paths.length === 0 ? (
            <Text style={styles.empty}>
              No paths generated. Tap the sparkle to retry.
            </Text>
          ) : (
            paths.slice(0, 3).map((p, idx) => {
              const color = PATH_COLORS[idx % PATH_COLORS.length];
              return (
                <View
                  key={p.name + idx}
                  style={[styles.pathCard, { borderColor: `${color}55` }]}
                  testID={`path-card-${idx}`}
                >
                  <View style={styles.pathHead}>
                    <View
                      style={[styles.pathBadge, { backgroundColor: `${color}25` }]}
                    >
                      <Text style={[styles.pathBadgeText, { color }]}>
                        PATH {idx + 1}
                      </Text>
                    </View>
                    <Text style={styles.pathTimeline}>{p.timeline}</Text>
                  </View>
                  <Text style={styles.pathName}>{p.name}</Text>
                  <Text style={styles.pathDesc}>{p.description}</Text>

                  <View style={styles.pathStats}>
                    <View>
                      <Text style={styles.statLabel}>Target Salary</Text>
                      <Text style={[styles.statValue, { color: colors.success }]}>
                        {p.target_salary_range}
                      </Text>
                    </View>
                  </View>

                  {p.required_skills?.length > 0 && (
                    <>
                      <Text style={styles.subheader}>Skills to Develop</Text>
                      <View style={styles.skillRow}>
                        {p.required_skills.map((s: string) => (
                          <View key={s} style={styles.skillPill}>
                            <Text style={styles.skillText}>{s}</Text>
                          </View>
                        ))}
                      </View>
                    </>
                  )}

                  {p.certifications?.length > 0 && (
                    <>
                      <Text style={styles.subheader}>Certifications</Text>
                      {p.certifications.map((c: any, i: number) => (
                        <View key={i} style={styles.certRow}>
                          <Award size={14} color={color} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.certName}>{c.name}</Text>
                            <Text style={styles.certProvider}>{c.provider}</Text>
                          </View>
                        </View>
                      ))}
                    </>
                  )}

                  {p.next_action && (
                    <View style={[styles.actionBox, { backgroundColor: `${color}15` }]}>
                      <Text style={[styles.actionLabel, { color }]}>NEXT ACTION</Text>
                      <Text style={styles.actionText}>{p.next_action}</Text>
                    </View>
                  )}
                </View>
              );
            })
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  loadingText: { color: colors.textSecondary, fontSize: 13 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.primaryMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },

  scroll: { padding: spacing.xl, gap: spacing.lg },
  intro: { alignItems: "center", padding: spacing.lg, gap: 6 },
  introTitle: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: "700",
    marginTop: spacing.sm,
  },
  introSub: { color: colors.textSecondary, fontSize: 13, textAlign: "center" },
  empty: { color: colors.textTertiary, textAlign: "center" },

  pathCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  pathHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pathBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  pathBadgeText: { fontSize: 10, fontWeight: "700", letterSpacing: 1 },
  pathTimeline: { color: colors.textSecondary, fontSize: 12, fontWeight: "700" },
  pathName: { color: colors.textPrimary, fontSize: 18, fontWeight: "700" },
  pathDesc: { color: colors.textSecondary, fontSize: 13, lineHeight: 20 },
  pathStats: {
    backgroundColor: colors.surfaceElevated,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  statLabel: {
    color: colors.textTertiary,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  statValue: { fontSize: 18, fontWeight: "700", marginTop: 4 },

  subheader: {
    color: colors.textTertiary,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginTop: 4,
  },
  skillRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  skillPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.surfaceElevated,
  },
  skillText: { color: colors.textSecondary, fontSize: 11, fontWeight: "600" },

  certRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 4,
  },
  certName: { color: colors.textPrimary, fontSize: 13, fontWeight: "600" },
  certProvider: { color: colors.textTertiary, fontSize: 11 },

  actionBox: {
    padding: spacing.md,
    borderRadius: radius.md,
    gap: 4,
  },
  actionLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 1.5 },
  actionText: { color: colors.textPrimary, fontSize: 13, lineHeight: 19 },
});
