// PLOS — Personality Assessment Hub
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { ArrowLeft, Brain, Compass, CircleDot, Star, HeartHandshake, LayoutGrid, Sparkles, RefreshCw, CheckCircle2, ChevronRight, Clock } from "lucide-react-native";
import { colors, spacing, radius } from "@/src/lib/theme";
import { personalityApi } from "@/src/lib/api";
import RadarChart from "@/src/components/RadarChart";

const ICON: Record<string, any> = {
  brain: Brain, compass: Compass, "circle-dot": CircleDot, star: Star,
  "heart-handshake": HeartHandshake, "layout-grid": LayoutGrid,
};

export default function PersonalityHub() {
  const router = useRouter();
  const [frameworks, setFrameworks] = useState<any[]>([]);
  const [status, setStatus] = useState<any>({ summary: {}, completed: [] });
  const [dna, setDna] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshingDna, setRefreshingDna] = useState(false);

  const load = useCallback(async () => {
    try {
      const [f, s, d] = await Promise.all([
        personalityApi.frameworks(),
        personalityApi.status(),
        personalityApi.dna(),
      ]);
      setFrameworks(f.frameworks || []);
      setStatus(s || { summary: {}, completed: [] });
      setDna(d?.dna || null);
    } catch (e: any) {
      console.warn("[personality] load", e?.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const refreshDna = async () => {
    setRefreshingDna(true);
    try {
      const d = await personalityApi.refreshDna();
      setDna(d?.dna || null);
    } catch (e: any) {
      console.warn("[personality] refreshDna", e?.message);
    }
    setRefreshingDna(false);
  };

  const completedCount = frameworks.filter(f => status.summary?.[f.id]?.status === "completed").length;

  const radarData = dna?.radar_dimensions
    ? Object.entries(dna.radar_dimensions).map(([label, v]) => ({ label, value: Number(v) || 0 }))
    : [];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} testID="personality-back">
          <ArrowLeft color={colors.textPrimary} size={20} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Personality Assessment</Text>
          <Text style={styles.headerSub}>Know yourself deeply · Powered by PLOS AI</Text>
        </View>
        <View style={styles.progressBadge}>
          <Text style={styles.progressBadgeText}>{completedCount}/6</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primaryGlow} />}
      >
        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.primaryGlow} />
        ) : (
          <>
            {/* Hero DNA card */}
            {dna && dna.headline_summary ? (
              <View style={styles.heroCard} testID="dna-hero">
                <View style={styles.heroTop}>
                  <Sparkles size={14} color={colors.primaryGlow} />
                  <Text style={styles.heroLabel}>YOUR PERSONALITY DNA</Text>
                  <TouchableOpacity onPress={refreshDna} disabled={refreshingDna} style={{ padding: 4 }}>
                    {refreshingDna ? <ActivityIndicator size="small" color={colors.primaryGlow} /> : <RefreshCw size={12} color={colors.textSecondary} />}
                  </TouchableOpacity>
                </View>
                <Text style={styles.heroTitle}>{dna.headline_summary}</Text>
                {dna.one_word_essence ? <Text style={styles.heroEssence}>Essence: <Text style={{ color: colors.primaryGlow, fontWeight: "700" }}>{dna.one_word_essence}</Text></Text> : null}
                {radarData.length >= 3 ? (
                  <View style={{ alignItems: "center", marginTop: 8 }}>
                    <RadarChart data={radarData} size={280} color={colors.primaryGlow} />
                  </View>
                ) : null}
                {dna.superpower ? (
                  <View style={styles.dnaRow}>
                    <Text style={styles.dnaRowLabel}>SUPERPOWER</Text>
                    <Text style={styles.dnaRowText}>{dna.superpower}</Text>
                  </View>
                ) : null}
                {dna.blind_spot ? (
                  <View style={styles.dnaRow}>
                    <Text style={styles.dnaRowLabel}>BLIND SPOT</Text>
                    <Text style={styles.dnaRowText}>{dna.blind_spot}</Text>
                  </View>
                ) : null}
                {dna.growth_edge ? (
                  <View style={styles.dnaRow}>
                    <Text style={styles.dnaRowLabel}>GROWTH EDGE</Text>
                    <Text style={styles.dnaRowText}>{dna.growth_edge}</Text>
                  </View>
                ) : null}
              </View>
            ) : (
              <View style={styles.emptyHero}>
                <Brain color={colors.primaryGlow} size={28} />
                <Text style={styles.emptyTitle}>Discover your Personality DNA</Text>
                <Text style={styles.emptyText}>Take one of the six scientifically-validated assessments below. PLOS AI will generate a deeply personal interpretation tied to your career goals and life situation.</Text>
              </View>
            )}

            {/* Assessment cards */}
            <Text style={styles.h2}>ASSESSMENTS</Text>
            <View style={{ gap: 10 }}>
              {frameworks.map((f) => {
                const st = status.summary?.[f.id] || { status: "not_started", progress_pct: 0 };
                const Icon = ICON[f.icon] || Brain;
                const isDone = st.status === "completed";
                const isProg = st.status === "in_progress";
                return (
                  <TouchableOpacity
                    key={f.id}
                    style={[styles.assessCard, { borderLeftColor: f.color }]}
                    onPress={() => router.push(`/personality/${f.id}` as any)}
                    testID={`assess-${f.id}`}
                  >
                    <View style={[styles.assessIcon, { backgroundColor: f.color + "22" }]}>
                      <Icon color={f.color} size={20} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.assessTitleRow}>
                        <Text style={styles.assessTitle}>{f.name}</Text>
                        {isDone && <CheckCircle2 color={colors.success} size={14} />}
                      </View>
                      <Text style={styles.assessDesc} numberOfLines={2}>{f.short}</Text>
                      <View style={styles.assessMeta}>
                        <Clock size={10} color={colors.textTertiary} />
                        <Text style={styles.assessMetaText}>{f.question_count} Q · ~{f.estimated_minutes} min</Text>
                        {isProg && (
                          <View style={styles.progPill}><Text style={styles.progPillText}>{st.progress_pct}% saved</Text></View>
                        )}
                        {isDone && (
                          <Text style={[styles.assessMetaText, { color: colors.success }]}>· Completed</Text>
                        )}
                      </View>
                    </View>
                    <ChevronRight color={colors.textSecondary} size={16} />
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Completed insights list */}
            {(status.completed || []).length > 0 ? (
              <>
                <Text style={[styles.h2, { marginTop: 20 }]}>COMPLETED RESULTS</Text>
                {(status.completed || []).map((c: any) => (
                  <TouchableOpacity key={c.assessment_id} style={styles.resultRow} onPress={() => router.push(`/personality/results/${c.assessment_type}` as any)}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.resultTitle}>{frameworks.find(f => f.id === c.assessment_type)?.name || c.assessment_type}</Text>
                      <Text style={styles.resultSub} numberOfLines={2}>{c.plos_ai_interpretation?.headline_summary || "View detailed results →"}</Text>
                    </View>
                    <ChevronRight color={colors.textSecondary} size={16} />
                  </TouchableOpacity>
                ))}
              </>
            ) : null}

            <View style={{ height: 40 }} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: 10 },
  backBtn: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.surfaceElevated, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: "700" },
  headerSub: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  progressBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: "rgba(59,130,246,0.15)", borderWidth: 1, borderColor: colors.primaryGlow },
  progressBadgeText: { color: colors.primaryGlow, fontWeight: "800", fontSize: 12 },
  scroll: { padding: spacing.lg, paddingBottom: 60, gap: 12 },
  heroCard: { padding: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderSubtle, gap: 8 },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  heroLabel: { color: colors.textTertiary, fontSize: 10, fontWeight: "700", letterSpacing: 0.6, flex: 1 },
  heroTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700", lineHeight: 22 },
  heroEssence: { color: colors.textSecondary, fontSize: 12, marginBottom: 4 },
  dnaRow: { padding: 10, backgroundColor: colors.surfaceElevated, borderRadius: 8, marginTop: 6 },
  dnaRowLabel: { color: colors.primaryGlow, fontSize: 10, fontWeight: "800", letterSpacing: 0.5, marginBottom: 4 },
  dnaRowText: { color: colors.textPrimary, fontSize: 12, lineHeight: 17 },
  emptyHero: { padding: 24, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderSubtle, alignItems: "center", gap: 8 },
  emptyTitle: { color: colors.textPrimary, fontWeight: "700", fontSize: 15 },
  emptyText: { color: colors.textSecondary, fontSize: 12, textAlign: "center", lineHeight: 17 },
  h2: { color: colors.textPrimary, fontSize: 12, fontWeight: "800", letterSpacing: 0.6, marginTop: 8, marginBottom: 4 },
  assessCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderSubtle, borderLeftWidth: 4 },
  assessIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  assessTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  assessTitle: { color: colors.textPrimary, fontWeight: "700", fontSize: 14 },
  assessDesc: { color: colors.textSecondary, fontSize: 11, marginTop: 2, lineHeight: 15 },
  assessMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  assessMetaText: { color: colors.textTertiary, fontSize: 10 },
  progPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, backgroundColor: "rgba(245,158,11,0.15)" },
  progPillText: { color: colors.warning, fontSize: 9, fontWeight: "700" },
  resultRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderSubtle, marginTop: 6 },
  resultTitle: { color: colors.textPrimary, fontWeight: "700", fontSize: 13 },
  resultSub: { color: colors.textSecondary, fontSize: 11, marginTop: 3, lineHeight: 15 },
});
