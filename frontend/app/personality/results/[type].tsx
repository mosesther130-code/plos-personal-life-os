// PLOS — Assessment Results screen
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ArrowLeft, Sparkles, Star, TrendingUp, Users, Lightbulb, Target, Wallet, CheckCircle2 } from "lucide-react-native";
import { colors, spacing, radius } from "@/src/lib/theme";
import { personalityApi } from "@/src/lib/api";
import RadarChart from "@/src/components/RadarChart";

export default function AssessmentResults() {
  const router = useRouter();
  const { type } = useLocalSearchParams<{ type: string }>();
  const assessment_type = String(type || "");
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<any>(null);
  const [framework, setFramework] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await personalityApi.results(assessment_type);
      setResult(r.result);
      setFramework(r.framework);
    } catch (_e) {}
    setLoading(false);
  }, [assessment_type]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <SafeAreaView style={styles.container}><ActivityIndicator style={{ marginTop: 60 }} color={colors.primaryGlow} /></SafeAreaView>;
  }
  if (!result) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Header title="Results" onBack={() => router.back()} />
        <View style={{ padding: 20 }}><Text style={styles.body}>No completed result yet.</Text></View>
      </SafeAreaView>
    );
  }

  const scored = result.scored || {};
  const interp = result.plos_ai_interpretation || {};
  const color = framework?.color || colors.primaryGlow;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Header title={framework?.name || "Results"} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Headline card */}
        <View style={[styles.heroCard, { borderTopColor: color, borderTopWidth: 4 }]}>
          <Text style={styles.heroLabel}>PLOS AI SUMMARY</Text>
          <Text style={styles.heroText}>{interp.headline_summary || "Assessment complete."}</Text>
          {interp.one_word_essence && (
            <View style={styles.essencePill}><Text style={styles.essencePillText}>Essence · {interp.one_word_essence}</Text></View>
          )}
        </View>

        {/* Per-framework score visual */}
        {assessment_type === "big_five" && scored.dimensions && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Your Big Five Profile — {scored.profile_code}</Text>
            {Object.entries(scored.dimensions).map(([dim, v]: any) => {
              const level = v.level;
              const barColor = level === "High" ? colors.primaryGlow : level === "Low" ? colors.warning : colors.textSecondary;
              return (
                <View key={dim} style={styles.barRow}>
                  <View style={styles.barTop}>
                    <Text style={styles.barLabel}>{framework?.dimension_names?.[dim] || dim}</Text>
                    <Text style={[styles.barValue, { color: barColor }]}>{v.percentile} · {level}</Text>
                  </View>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: `${v.percentile}%`, backgroundColor: barColor }]} />
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {assessment_type === "mbti" && scored.type_code && (
          <View style={styles.card}>
            <Text style={styles.mbtiCode}>{scored.type_code}</Text>
            <Text style={styles.body}>Your dimension splits</Text>
            {Object.entries(scored.splits || {}).map(([dim, v]: any) => (
              <View key={dim} style={styles.barRow}>
                <View style={styles.barTop}>
                  <Text style={styles.barLabel}>{Object.keys(v)[0]} {v[Object.keys(v)[0]]}% / {Object.keys(v)[1]} {v[Object.keys(v)[1]]}%</Text>
                </View>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${v[Object.keys(v)[0]]}%`, backgroundColor: color }]} />
                </View>
              </View>
            ))}
          </View>
        )}

        {assessment_type === "enneagram" && scored.primary_type && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Type {scored.primary_type} — {scored.primary_name}</Text>
            <Text style={styles.body}>Wing: {scored.wing_code} · Centre: {scored.center}</Text>
            <View style={styles.divider} />
            <Row label="Core motivation" val={scored.info?.motivation} />
            <Row label="Core fear" val={scored.info?.fear} />
            <Row label="Core desire" val={scored.info?.desire} />
            <Row label="Under stress → " val={`Type ${scored.stress_direction}`} />
            <Row label="In growth → " val={`Type ${scored.growth_direction}`} />
          </View>
        )}

        {assessment_type === "via_strengths" && scored.signature_strengths && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Your Top 5 Signature Strengths</Text>
            {scored.signature_strengths.map((s: any, i: number) => (
              <View key={s.strength} style={styles.strengthRow}>
                <View style={[styles.strengthNum, { backgroundColor: color }]}><Text style={styles.strengthNumText}>{i + 1}</Text></View>
                <Text style={styles.strengthName}>{framework?.dimension_names?.[s.strength] || s.strength}</Text>
                <Text style={styles.strengthScore}>{s.score}</Text>
              </View>
            ))}
          </View>
        )}

        {assessment_type === "eq" && scored.overall !== undefined && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Overall EQ: {scored.overall} — {scored.level}</Text>
            <View style={{ alignItems: "center", marginVertical: 12 }}>
              <RadarChart
                data={Object.entries(scored.dimensions || {}).map(([k, v]: any) => ({ label: framework?.dimension_names?.[k] || k, value: v.score || 0 }))}
                size={260}
                color={color}
              />
            </View>
            {Object.entries(scored.dimensions || {}).map(([dim, v]: any) => (
              <View key={dim} style={styles.barRow}>
                <View style={styles.barTop}>
                  <Text style={styles.barLabel}>{framework?.dimension_names?.[dim] || dim}</Text>
                  <Text style={[styles.barValue, { color }]}>{v.score}</Text>
                </View>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${v.score}%`, backgroundColor: color }]} />
                </View>
              </View>
            ))}
          </View>
        )}

        {assessment_type === "disc" && scored.primary && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>DISC Profile — {scored.profile_code}</Text>
            <Text style={styles.body}>Primary: {framework?.dimension_names?.[scored.primary] || scored.primary}   ·   Secondary: {framework?.dimension_names?.[scored.secondary] || scored.secondary}</Text>
            {(scored.ranked || []).map((r: any) => (
              <View key={r.style} style={styles.barRow}>
                <View style={styles.barTop}>
                  <Text style={styles.barLabel}>{framework?.dimension_names?.[r.style] || r.style}</Text>
                  <Text style={[styles.barValue, { color }]}>{r.score}</Text>
                </View>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${Math.max(5, (r.score + 28) * 100 / 56)}%`, backgroundColor: color }]} />
                </View>
              </View>
            ))}
          </View>
        )}

        {/* AI Narrative */}
        {interp.detailed_narrative && (
          <Section icon={<Sparkles size={14} color={color} />} title="Personalised Interpretation">
            <Text style={styles.narrative}>{interp.detailed_narrative}</Text>
          </Section>
        )}

        {/* Structured lists */}
        <ListSection icon={<Target size={14} color={color} />} title="Career Insights" items={interp.career_insights} />
        <ListSection icon={<Wallet size={14} color={color} />} title="Financial Behaviour" items={interp.financial_behavior_insights} />
        <ListSection icon={<Users size={14} color={color} />} title="Relationships & Team" items={interp.relationship_insights} />
        <ListSection icon={<Star size={14} color={color} />} title="Strengths to Leverage" items={interp.strengths_to_leverage} />
        <ListSection icon={<TrendingUp size={14} color={color} />} title="Growth Opportunities" items={interp.growth_opportunities} />
        <ListSection icon={<Lightbulb size={14} color={color} />} title="Try Today" items={interp.daily_life_applications} />

        {(interp.compatible_personality_types?.length || interp.famous_people_similar?.length) ? (
          <View style={styles.card}>
            {interp.compatible_personality_types?.length ? (
              <>
                <Text style={styles.cardTitle}>Compatible personalities</Text>
                <View style={styles.pillWrap}>
                  {interp.compatible_personality_types.map((t: string, i: number) => (
                    <View key={i} style={styles.pill}><Text style={styles.pillText}>{t}</Text></View>
                  ))}
                </View>
              </>
            ) : null}
            {interp.famous_people_similar?.length ? (
              <>
                <Text style={[styles.cardTitle, { marginTop: 12 }]}>Famous people with similar profile</Text>
                <View style={styles.pillWrap}>
                  {interp.famous_people_similar.map((t: string, i: number) => (
                    <View key={i} style={[styles.pill, { backgroundColor: color + "22", borderColor: color + "66" }]}><Text style={[styles.pillText, { color: color }]}>{t}</Text></View>
                  ))}
                </View>
              </>
            ) : null}
          </View>
        ) : null}

        <TouchableOpacity style={[styles.doneBtn, { backgroundColor: color }]} onPress={() => router.replace("/personality")}>
          <CheckCircle2 color="#fff" size={16} />
          <Text style={styles.doneBtnText}>Back to Personality Hub</Text>
        </TouchableOpacity>
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity style={styles.backBtn} onPress={onBack}><ArrowLeft color={colors.textPrimary} size={20} /></TouchableOpacity>
      <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
      <View style={{ width: 36 }} />
    </View>
  );
}

function Row({ label, val }: { label: string; val?: string }) {
  if (!val) return null;
  return <Text style={styles.rowLine}><Text style={{ color: colors.textTertiary }}>{label}: </Text>{val}</Text>;
}

function Section({ title, icon, children }: any) {
  return (
    <View style={styles.card}>
      <View style={styles.sectionTitle}>{icon}<Text style={styles.sectionTitleText}>{title}</Text></View>
      {children}
    </View>
  );
}

function ListSection({ title, icon, items }: any) {
  if (!items || items.length === 0) return null;
  return (
    <Section title={title} icon={icon}>
      {items.map((t: string, i: number) => (
        <View key={i} style={styles.bullet}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}>{t}</Text>
        </View>
      ))}
    </Section>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: 10 },
  backBtn: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.surfaceElevated, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700", flex: 1 },
  scroll: { padding: spacing.lg, gap: 12, paddingBottom: 40 },
  heroCard: { padding: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderSubtle },
  heroLabel: { color: colors.textTertiary, fontSize: 10, fontWeight: "800", letterSpacing: 0.5, marginBottom: 6 },
  heroText: { color: colors.textPrimary, fontSize: 16, fontWeight: "700", lineHeight: 23 },
  essencePill: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: "rgba(59,130,246,0.15)", borderWidth: 1, borderColor: colors.primaryGlow, marginTop: 10 },
  essencePillText: { color: colors.primaryGlow, fontSize: 11, fontWeight: "700" },
  card: { padding: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderSubtle, gap: 8 },
  cardTitle: { color: colors.textPrimary, fontWeight: "800", fontSize: 14 },
  body: { color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  divider: { height: 1, backgroundColor: colors.borderSubtle, marginVertical: 6 },
  rowLine: { color: colors.textPrimary, fontSize: 12, lineHeight: 17, marginTop: 3 },
  mbtiCode: { color: colors.textPrimary, fontSize: 42, fontWeight: "900", textAlign: "center", letterSpacing: 4 },
  barRow: { marginTop: 8 },
  barTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 },
  barLabel: { color: colors.textPrimary, fontSize: 12, fontWeight: "600" },
  barValue: { fontSize: 11, fontWeight: "700" },
  barTrack: { height: 8, backgroundColor: colors.surfaceElevated, borderRadius: 4, overflow: "hidden" },
  barFill: { height: 8, borderRadius: 4 },
  strengthRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 6 },
  strengthNum: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  strengthNumText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  strengthName: { flex: 1, color: colors.textPrimary, fontWeight: "700", fontSize: 13 },
  strengthScore: { color: colors.textSecondary, fontSize: 11 },
  sectionTitle: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  sectionTitleText: { color: colors.textPrimary, fontWeight: "800", fontSize: 13, letterSpacing: 0.3 },
  narrative: { color: colors.textPrimary, fontSize: 13, lineHeight: 20 },
  bullet: { flexDirection: "row", gap: 8, marginTop: 4 },
  bulletDot: { color: colors.primaryGlow, fontSize: 14, lineHeight: 18 },
  bulletText: { flex: 1, color: colors.textPrimary, fontSize: 12, lineHeight: 18 },
  pillWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.borderSubtle },
  pillText: { color: colors.textPrimary, fontSize: 11, fontWeight: "700" },
  doneBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 10, marginTop: 8 },
  doneBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
});
