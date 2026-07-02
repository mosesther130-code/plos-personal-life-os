// PLOS Career — Career Insights Dashboard (Skills Matrix + Industry Match).
import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Alert, RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ChevronLeft, RefreshCw, TrendingUp, CheckCircle2, ArrowUpRight,
  TriangleAlert,
} from "lucide-react-native";
import { jobIntelApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";
import Svg, { Circle } from "react-native-svg";

function HealthGauge({ score }: { score: number }) {
  const size = 140, stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, score)) / 100) * c;
  const col = score >= 75 ? colors.success : score >= 50 ? colors.warning : "#EF4444";
  return (
    <View style={{ alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2} cy={size / 2} r={r} stroke={col} strokeWidth={stroke}
          fill="none" strokeDasharray={`${dash} ${c - dash}`}
          strokeDashoffset={c / 4} strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={{ position: "absolute", alignItems: "center" }}>
        <Text style={{ color: colors.textPrimary, fontSize: 38, fontWeight: "800" }}>{score}</Text>
        <Text style={{ color: colors.textTertiary, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 }}>HEALTH</Text>
      </View>
    </View>
  );
}

export default function CareerInsightsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      const d = await jobIntelApi.insights();
      setData(d);
    } catch (e: any) {
      Alert.alert("Load failed", String(e?.message || e));
    }
  }, []);

  useEffect(() => { (async () => { setLoading(true); await load(); setLoading(false); })(); }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loader}><ActivityIndicator color={colors.primaryGlow} /></View>
      </SafeAreaView>
    );
  }

  if (!data?.has_default_resume) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ChevronLeft size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Career Insights</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={{ padding: 40, alignItems: "center", gap: 8 }}>
          <TriangleAlert size={28} color={colors.warning} />
          <Text style={{ color: colors.textSecondary, textAlign: "center" }}>
            Upload and set a default resume in the Career Library to see personalized insights.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ChevronLeft size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Career Insights</Text>
        <TouchableOpacity onPress={async () => { setRefreshing(true); await load(); setRefreshing(false); }} style={styles.backBtn}>
          {refreshing ? <ActivityIndicator size="small" color={colors.primaryGlow} /> : <RefreshCw size={18} color={colors.primaryGlow} />}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.primaryGlow} />}
      >
        {/* Panel 1: Health Score */}
        <View style={styles.card}>
          <HealthGauge score={data.career_health_score || 0} />
          <Text style={styles.basis}>{data.health_basis}</Text>
          <Text style={styles.resumeLabel}>Analysis based on: <Text style={{ color: colors.primaryGlow, fontWeight: "700" }}>{data.resume_label}</Text></Text>
        </View>

        {/* Panel 2: Skills Strength Matrix */}
        <Text style={styles.section}>Skills Strength Matrix</Text>
        <View style={styles.card}>
          <View style={styles.skillCol}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <CheckCircle2 size={14} color={colors.success} />
              <Text style={[styles.skillTitle, { color: colors.success }]}>Your Strong Skills</Text>
            </View>
            <Text style={styles.skillSub}>Appear in ≥ 40% of matching listings.</Text>
            {(data.skills_strong || []).length === 0 ? (
              <Text style={styles.emptyText}>None yet — run the job aggregation.</Text>
            ) : (
              (data.skills_strong || []).map((s: any, i: number) => (
                <View key={i} style={styles.skillRow}>
                  <Text style={styles.skillName}>• {s.skill}</Text>
                  <Text style={styles.skillMeta}>{s.job_count} jobs · {s.share}%</Text>
                </View>
              ))
            )}
          </View>
          <View style={styles.divider} />
          <View style={styles.skillCol}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <ArrowUpRight size={14} color={colors.warning} />
              <Text style={[styles.skillTitle, { color: colors.warning }]}>Growing Skills</Text>
            </View>
            <Text style={styles.skillSub}>Present in resume, moderate market demand.</Text>
            {(data.skills_growing || []).length === 0 ? (
              <Text style={styles.emptyText}>None detected.</Text>
            ) : (
              (data.skills_growing || []).map((s: any, i: number) => (
                <View key={i} style={styles.skillRow}>
                  <Text style={styles.skillName}>• {s.skill}</Text>
                  <Text style={styles.skillMeta}>{s.job_count} jobs · {s.share}%</Text>
                </View>
              ))
            )}
          </View>
          <View style={styles.divider} />
          <View style={styles.skillCol}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <TriangleAlert size={14} color="#EF4444" />
              <Text style={[styles.skillTitle, { color: "#EF4444" }]}>Skills Gaps</Text>
            </View>
            <Text style={styles.skillSub}>Common in listings but not in your resume — highest-value skills to develop.</Text>
            {(data.skills_gaps || []).length === 0 ? (
              <Text style={styles.emptyText}>No significant gaps — excellent alignment.</Text>
            ) : (
              (data.skills_gaps || []).map((s: any, i: number) => (
                <View key={i} style={styles.skillRow}>
                  <Text style={styles.skillName}>• {s.skill}</Text>
                  <Text style={styles.skillMeta}>{s.job_count} jobs · {s.share}%</Text>
                </View>
              ))
            )}
          </View>
        </View>

        {/* Panel 3: Industry Match Analysis */}
        <Text style={styles.section}>Industry Match Analysis</Text>
        <View style={styles.card}>
          {(data.industry_match || []).length === 0 ? (
            <Text style={styles.emptyText}>Run the job aggregation to compute industry match.</Text>
          ) : (
            (data.industry_match || []).map((row: any, i: number) => {
              const col = row.average_match >= 80 ? colors.success :
                          row.average_match >= 60 ? colors.warning : "#6B7280";
              return (
                <View key={i} style={{ marginTop: 8 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={styles.industryLabel}>{row.label}</Text>
                    <Text style={{ color: col, fontWeight: "800", fontSize: 14 }}>{row.average_match}%</Text>
                  </View>
                  <View style={styles.industryBarBg}>
                    <View style={[styles.industryBarFill, {
                      width: `${Math.min(100, row.average_match)}%`,
                      backgroundColor: col,
                    }]} />
                  </View>
                  <Text style={styles.industryCount}>{row.job_count} verified open role{row.job_count === 1 ? "" : "s"}</Text>
                </View>
              );
            })
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: colors.borderSubtle,
  },
  backBtn: { padding: 4, width: 36, alignItems: "center" },
  headerTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: "700" },
  scroll: { padding: spacing.lg, gap: 8 },
  card: {
    backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1,
    borderRadius: radius.md, padding: spacing.md, alignItems: "center", gap: 6,
  },
  basis: { color: colors.textTertiary, fontSize: 11, textAlign: "center", marginTop: 8 },
  resumeLabel: { color: colors.textSecondary, fontSize: 11, marginTop: 4 },
  section: { color: colors.textPrimary, fontSize: 14, fontWeight: "800", marginTop: spacing.md },
  skillCol: { alignSelf: "stretch", gap: 4 },
  skillTitle: { fontSize: 12, fontWeight: "800", letterSpacing: 0.4 },
  skillSub: { color: colors.textTertiary, fontSize: 10, fontStyle: "italic", marginBottom: 4 },
  skillRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  skillName: { color: colors.textPrimary, fontSize: 12, fontWeight: "600", flex: 1 },
  skillMeta: { color: colors.textTertiary, fontSize: 10, fontWeight: "700" },
  divider: { height: 1, backgroundColor: colors.borderSubtle, alignSelf: "stretch", marginVertical: 8 },
  emptyText: { color: colors.textTertiary, fontSize: 11, fontStyle: "italic" },
  industryLabel: { color: colors.textPrimary, fontSize: 12, fontWeight: "700" },
  industryBarBg: {
    height: 8, backgroundColor: colors.surfaceElevated, borderRadius: 4, overflow: "hidden", marginTop: 4,
  },
  industryBarFill: { height: 8, borderRadius: 4 },
  industryCount: { color: colors.textTertiary, fontSize: 10, marginTop: 2 },
});
