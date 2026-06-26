// Business Ideas Advisor — 5 personalized ideas with Claude-generated plans.
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  Sparkles,
  Clock,
  TrendingUp,
  DollarSign,
  RefreshCw,
  FileText,
  X,
  ChevronRight,
  CheckCircle2,
} from "lucide-react-native";
import { businessApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";

const timelineColor = (t: string) => {
  if (t === "Start Now") return colors.success;
  if (t === "3-6 Months") return colors.warning;
  return colors.primaryGlow;
};

const riskColor = (r: string) => {
  if (r === "Low") return colors.success;
  if (r === "Moderate") return colors.warning;
  return colors.danger;
};

export default function BusinessIdeas() {
  const router = useRouter();
  const [ideas, setIdeas] = useState<any[]>([]);
  const [isSeed, setIsSeed] = useState(true);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [planLoading, setPlanLoading] = useState<string | null>(null);
  const [planText, setPlanText] = useState<string | null>(null);
  const [planTitle, setPlanTitle] = useState<string>("");
  const [planVisible, setPlanVisible] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await businessApi.listIdeas();
      setIdeas(r?.ideas || []);
      setIsSeed(!!r?.is_seed);
    } catch (_e) {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const generate = async () => {
    setGenerating(true);
    try {
      const r = await businessApi.generateIdeas();
      if (r?.ideas) {
        setIdeas(r.ideas);
        setIsSeed(false);
      }
    } catch (_e) {
      Alert.alert("Generation failed", "Could not reach Claude. Please retry.");
    }
    setGenerating(false);
  };

  const openPlan = async (idea: any) => {
    setPlanTitle(idea.business_name);
    setPlanText(null);
    setPlanLoading(idea.idea_id);
    setPlanVisible(true);
    try {
      const r = await businessApi.buildPlan(idea.idea_id);
      setPlanText(r?.plan || "No plan returned.");
    } catch (_e) {
      setPlanText("Could not generate plan. Please retry.");
    }
    setPlanLoading(null);
  };

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} testID="ideas-back">
          <ArrowLeft color={colors.textPrimary} size={20} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Business Ideas Advisor</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primaryGlow} />}
      >
        <Text style={styles.intro}>
          {isSeed
            ? "Starter ideas leveraging your USAID + GSU + LearnWise background. Tap Generate to get fresh AI ideas tuned to your latest financials."
            : "Personalized by Claude 4.5 based on your career, debts, surplus, and Bulacan property."}
        </Text>

        <TouchableOpacity
          style={[styles.generateBtn, generating && { opacity: 0.6 }]}
          onPress={generate}
          disabled={generating}
          testID="generate-ideas"
          activeOpacity={0.85}
        >
          {generating ? <ActivityIndicator color="#fff" /> : <RefreshCw color="#fff" size={16} />}
          <Text style={styles.generateText}>{generating ? "Generating with Claude 4.5…" : "Generate Fresh Ideas"}</Text>
        </TouchableOpacity>

        {loading ? (
          <ActivityIndicator color={colors.primaryGlow} style={{ marginTop: 40 }} />
        ) : (
          ideas.map((idea, i) => {
            const isOpen = expanded === idea.idea_id;
            return (
              <View key={idea.idea_id || i} style={styles.card} testID={`idea-${i}`}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>{idea.business_name}</Text>
                </View>
                <View style={styles.tagsRow}>
                  <View style={[styles.tag, { backgroundColor: timelineColor(idea.timeline_tag) + "22", borderColor: timelineColor(idea.timeline_tag) }]}>
                    <Clock size={11} color={timelineColor(idea.timeline_tag)} />
                    <Text style={[styles.tagText, { color: timelineColor(idea.timeline_tag) }]}>{idea.timeline_tag}</Text>
                  </View>
                  <View style={[styles.tag, { backgroundColor: riskColor(idea.risk_level) + "22", borderColor: riskColor(idea.risk_level) }]}>
                    <TrendingUp size={11} color={riskColor(idea.risk_level)} />
                    <Text style={[styles.tagText, { color: riskColor(idea.risk_level) }]}>{idea.risk_level} risk</Text>
                  </View>
                </View>
                <Text style={styles.cardDesc}>{idea.description}</Text>

                <View style={styles.metricsRow}>
                  <View style={styles.metric}>
                    <Text style={styles.metricLabel}>STARTUP</Text>
                    <Text style={styles.metricValue}>{idea.startup_cost_range}</Text>
                  </View>
                  <View style={styles.metric}>
                    <Text style={styles.metricLabel}>MONTHLY</Text>
                    <Text style={styles.metricValue}>{idea.estimated_monthly_revenue_range}</Text>
                  </View>
                </View>
                <View style={styles.metricRowFull}>
                  <DollarSign size={12} color={colors.textTertiary} />
                  <Text style={styles.metricRowText}>First revenue: {idea.time_to_first_revenue}</Text>
                </View>

                <TouchableOpacity
                  style={styles.collapseBtn}
                  onPress={() => setExpanded(isOpen ? null : idea.idea_id)}
                  testID={`expand-${i}`}
                >
                  <Text style={styles.collapseText}>{isOpen ? "Hide next steps" : "Show next steps"}</Text>
                  <ChevronRight size={14} color={colors.primaryGlow} style={{ transform: [{ rotate: isOpen ? "90deg" : "0deg" }] }} />
                </TouchableOpacity>

                {isOpen && (
                  <View style={styles.stepsBox}>
                    {(idea.next_steps || []).map((s: string, j: number) => (
                      <View key={j} style={styles.stepRow}>
                        <CheckCircle2 size={14} color={colors.primaryGlow} />
                        <Text style={styles.stepText}>{s}</Text>
                      </View>
                    ))}
                  </View>
                )}

                <TouchableOpacity
                  style={styles.planBtn}
                  onPress={() => openPlan(idea)}
                  disabled={planLoading === idea.idea_id}
                  testID={`plan-${i}`}
                  activeOpacity={0.85}
                >
                  {planLoading === idea.idea_id ? (
                    <ActivityIndicator color={colors.primaryGlow} />
                  ) : (
                    <>
                      <FileText size={14} color={colors.primaryGlow} />
                      <Text style={styles.planBtnText}>View Full Business Plan</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            );
          })
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal visible={planVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPlanVisible(false)}>
        <SafeAreaView style={styles.modalContainer} edges={["top"]}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalLabel}>BUSINESS PLAN · CLAUDE 4.5</Text>
              <Text style={styles.modalTitle} numberOfLines={2}>{planTitle}</Text>
            </View>
            <TouchableOpacity style={styles.backBtn} onPress={() => setPlanVisible(false)} testID="plan-close">
              <X color={colors.textPrimary} size={20} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalScroll}>
            {planLoading ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator color={colors.primaryGlow} size="large" />
                <Text style={styles.modalLoadingText}>Drafting plan with Claude 4.5…</Text>
              </View>
            ) : (
              <Text style={styles.planText}>{planText}</Text>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  backBtn: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.surfaceElevated, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  scroll: { padding: spacing.xl, gap: spacing.md },
  intro: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  generateBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.primary, paddingVertical: 14, borderRadius: radius.lg, marginBottom: spacing.md },
  generateText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  card: { backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  cardHeader: { flexDirection: "row", justifyContent: "space-between" },
  cardTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700", flex: 1 },
  tagsRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  tag: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm, borderWidth: 1 },
  tagText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  cardDesc: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 2 },
  metricsRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  metric: { flex: 1, backgroundColor: colors.bg, borderRadius: radius.md, padding: spacing.sm },
  metricLabel: { color: colors.textTertiary, fontSize: 9, fontWeight: "700", letterSpacing: 1 },
  metricValue: { color: colors.textPrimary, fontSize: 12, fontWeight: "600", marginTop: 4 },
  metricRowFull: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.xs },
  metricRowText: { color: colors.textSecondary, fontSize: 12 },
  collapseBtn: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm, paddingVertical: 4 },
  collapseText: { color: colors.primaryGlow, fontSize: 12, fontWeight: "600" },
  stepsBox: { marginTop: spacing.xs, gap: 8 },
  stepRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  stepText: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, flex: 1 },
  planBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: spacing.sm, paddingVertical: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.primaryGlow, backgroundColor: colors.primaryMuted },
  planBtnText: { color: colors.primaryGlow, fontSize: 13, fontWeight: "700" },
  modalContainer: { flex: 1, backgroundColor: colors.bg },
  modalHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  modalLabel: { color: colors.textTertiary, fontSize: 10, fontWeight: "700", letterSpacing: 1.2 },
  modalTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700", marginTop: 2 },
  modalScroll: { padding: spacing.xl, paddingBottom: 60 },
  modalLoading: { paddingTop: 60, alignItems: "center", gap: spacing.md },
  modalLoadingText: { color: colors.textSecondary, fontSize: 13 },
  planText: { color: colors.textPrimary, fontSize: 14, lineHeight: 22 },
});
