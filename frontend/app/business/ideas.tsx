// Business Ideas Advisor — full CRUD via EditModal bottom-sheet.
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
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  Clock,
  TrendingUp,
  DollarSign,
  RefreshCw,
  FileText,
  X,
  ChevronRight,
  CheckCircle2,
  Plus,
  Pencil,
} from "lucide-react-native";
import { businessApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";
import { EditModal, type Field } from "@/src/components/EditModal";

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

// Fields used by the EditModal bottom-sheet
const IDEA_FIELDS: Field[] = [
  { key: "business_name", label: "Business Name", kind: "text", placeholder: "e.g. Curriculum Audit Service" },
  {
    key: "timeline_tag", label: "Timeline", kind: "select",
    options: [
      { value: "Start Now", label: "Start Now" },
      { value: "3-6 Months", label: "3-6 Months" },
      { value: "Long-Term", label: "Long-Term" },
    ],
  },
  {
    key: "risk_level", label: "Risk Level", kind: "select",
    options: [
      { value: "Low", label: "Low" },
      { value: "Moderate", label: "Moderate" },
      { value: "High", label: "High" },
    ],
  },
  { key: "description", label: "Description", kind: "textarea", placeholder: "2-3 sentence summary", maxLength: 400 },
  { key: "startup_cost_range", label: "Startup Cost Range", kind: "text", placeholder: "$0 – $500" },
  { key: "estimated_monthly_revenue_range", label: "Monthly Revenue Range", kind: "text", placeholder: "$800 – $3,000" },
  { key: "time_to_first_revenue", label: "Time to First Revenue", kind: "text", placeholder: "30 – 60 days" },
  { key: "next_steps_text", label: "Next Steps (one per line)", kind: "textarea", placeholder: "List up to 6 actions, one per line", maxLength: 600 },
];

const stepsArrToText = (arr?: string[]) => (Array.isArray(arr) ? arr.join("\n") : "");
const stepsTextToArr = (txt?: string) =>
  (txt || "").split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 8);

export default function BusinessIdeas() {
  const router = useRouter();
  const [ideas, setIdeas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Plan modal
  const [planLoading, setPlanLoading] = useState<string | null>(null);
  const [planText, setPlanText] = useState<string | null>(null);
  const [planTitle, setPlanTitle] = useState<string>("");
  const [planVisible, setPlanVisible] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  // EditModal state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorInitial, setEditorInitial] = useState<any | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await businessApi.listIdeas();
      setIdeas(r?.ideas || []);
    } catch (_e) {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const generate = async () => {
    const proceed = async () => {
      setGenerating(true);
      try {
        const r = await businessApi.generateIdeas();
        if (r?.ideas) setIdeas(r.ideas);
      } catch (_e) {
        if (Platform.OS !== "web") Alert.alert("Generation failed", "Could not reach PLOS AI. Please retry.");
      }
      setGenerating(false);
    };
    const msg = "Generating fresh ideas will replace your current list (5 new AI ideas). Continue?";
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm(msg)) await proceed();
      return;
    }
    Alert.alert("Replace current ideas?", msg, [
      { text: "Cancel", style: "cancel" },
      { text: "Generate", onPress: proceed },
    ]);
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

  const openCreate = () => {
    setEditingId(null);
    setEditorInitial({
      business_name: "",
      timeline_tag: "Start Now",
      risk_level: "Low",
      description: "",
      startup_cost_range: "",
      estimated_monthly_revenue_range: "",
      time_to_first_revenue: "",
      next_steps_text: "",
    });
    setEditorOpen(true);
  };

  const openEdit = (idea: any) => {
    setEditingId(idea.idea_id);
    setEditorInitial({
      business_name: idea.business_name || "",
      timeline_tag: idea.timeline_tag || "Start Now",
      risk_level: idea.risk_level || "Moderate",
      description: idea.description || "",
      startup_cost_range: idea.startup_cost_range || "",
      estimated_monthly_revenue_range: idea.estimated_monthly_revenue_range || "",
      time_to_first_revenue: idea.time_to_first_revenue || "",
      next_steps_text: stepsArrToText(idea.next_steps),
    });
    setEditorOpen(true);
  };

  const submitIdea = async (values: any) => {
    const payload = {
      business_name: (values.business_name || "").trim(),
      timeline_tag: values.timeline_tag || "Start Now",
      risk_level: values.risk_level || "Moderate",
      description: values.description || "",
      startup_cost_range: values.startup_cost_range || "",
      estimated_monthly_revenue_range: values.estimated_monthly_revenue_range || "",
      time_to_first_revenue: values.time_to_first_revenue || "",
      next_steps: stepsTextToArr(values.next_steps_text),
    };
    if (!payload.business_name) throw new Error("Business name is required");
    if (editingId) {
      const updated = await businessApi.updateIdea(editingId, payload);
      setIdeas((prev) => prev.map((i) => (i.idea_id === editingId ? { ...i, ...updated } : i)));
    } else {
      const created = await businessApi.createIdea(payload);
      setIdeas((prev) => [...prev, created]);
    }
  };

  const removeIdea = async () => {
    if (!editingId) return;
    await businessApi.deleteIdea(editingId);
    setIdeas((prev) => prev.filter((i) => i.idea_id !== editingId));
  };

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} testID="ideas-back">
          <ArrowLeft color={colors.textPrimary} size={20} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Business Ideas Advisor</Text>
        <TouchableOpacity style={styles.iconBtn} onPress={openCreate} testID="ideas-add">
          <Plus color={colors.textPrimary} size={20} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primaryGlow} />}
      >
        <Text style={styles.intro}>
          Tap a card to edit or delete. Add your own via the + button. Generate Fresh Ideas replaces the list with 5 personalized picks from PLOS AI.
        </Text>

        <TouchableOpacity
          style={[styles.generateBtn, generating && { opacity: 0.6 }]}
          onPress={generate}
          disabled={generating}
          testID="generate-ideas"
          activeOpacity={0.85}
        >
          {generating ? <ActivityIndicator color="#fff" /> : <RefreshCw color="#fff" size={16} />}
          <Text style={styles.generateText}>{generating ? "Generating with PLOS AI…" : "Generate Fresh Ideas"}</Text>
        </TouchableOpacity>

        {loading ? (
          <ActivityIndicator color={colors.primaryGlow} style={{ marginTop: 40 }} />
        ) : ideas.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No ideas yet</Text>
            <Text style={styles.emptySub}>Tap + to add one, or Generate Fresh Ideas above</Text>
          </View>
        ) : (
          ideas.map((idea, i) => {
            const isOpen = expanded === idea.idea_id;
            return (
              <TouchableOpacity
                key={idea.idea_id || i}
                style={styles.card}
                onPress={() => openEdit(idea)}
                onLongPress={() => openEdit(idea)}
                testID={`idea-${i}`}
                activeOpacity={0.85}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>{idea.business_name}</Text>
                  <View style={styles.editBadge}>
                    <Pencil size={11} color={colors.textTertiary} />
                  </View>
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
                  {idea.source ? (
                    <View style={styles.sourceTag}>
                      <Text style={styles.sourceText}>{idea.source === "ai" ? "AI" : idea.source === "custom" ? "Custom" : "Seed"}</Text>
                    </View>
                  ) : null}
                </View>
                {idea.description ? <Text style={styles.cardDesc}>{idea.description}</Text> : null}

                <View style={styles.metricsRow}>
                  <View style={styles.metric}>
                    <Text style={styles.metricLabel}>STARTUP</Text>
                    <Text style={styles.metricValue}>{idea.startup_cost_range || "—"}</Text>
                  </View>
                  <View style={styles.metric}>
                    <Text style={styles.metricLabel}>MONTHLY</Text>
                    <Text style={styles.metricValue}>{idea.estimated_monthly_revenue_range || "—"}</Text>
                  </View>
                </View>
                {idea.time_to_first_revenue ? (
                  <View style={styles.metricRowFull}>
                    <DollarSign size={12} color={colors.textTertiary} />
                    <Text style={styles.metricRowText}>First revenue: {idea.time_to_first_revenue}</Text>
                  </View>
                ) : null}

                {(idea.next_steps || []).length > 0 && (
                  <TouchableOpacity
                    style={styles.collapseBtn}
                    onPress={(e) => { e.stopPropagation?.(); setExpanded(isOpen ? null : idea.idea_id); }}
                    testID={`expand-${i}`}
                  >
                    <Text style={styles.collapseText}>{isOpen ? "Hide next steps" : "Show next steps"}</Text>
                    <ChevronRight size={14} color={colors.primaryGlow} style={{ transform: [{ rotate: isOpen ? "90deg" : "0deg" }] }} />
                  </TouchableOpacity>
                )}

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
                  onPress={(e) => { e.stopPropagation?.(); openPlan(idea); }}
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
              </TouchableOpacity>
            );
          })
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Edit / Create bottom sheet */}
      <EditModal
        visible={editorOpen}
        title={editingId ? "Edit Business Idea" : "New Business Idea"}
        fields={IDEA_FIELDS}
        initial={editorInitial || {}}
        onClose={() => setEditorOpen(false)}
        onSubmit={submitIdea}
        onDelete={editingId ? removeIdea : undefined}
        deleteSubject={editorInitial?.business_name || "this idea"}
        testID="idea-editor"
      />

      {/* Full plan modal */}
      <Modal visible={planVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPlanVisible(false)}>
        <SafeAreaView style={styles.modalContainer} edges={["top"]}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalLabel}>BUSINESS PLAN · CLAUDE 4.5</Text>
              <Text style={styles.modalTitle} numberOfLines={2}>{planTitle}</Text>
            </View>
            <TouchableOpacity style={styles.iconBtn} onPress={() => setPlanVisible(false)} testID="plan-close">
              <X color={colors.textPrimary} size={20} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalScroll}>
            {planLoading ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator color={colors.primaryGlow} size="large" />
                <Text style={styles.modalLoadingText}>Drafting plan with PLOS AI…</Text>
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
  iconBtn: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.surfaceElevated, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  scroll: { padding: spacing.xl, gap: spacing.md },
  intro: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  generateBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.primary, paddingVertical: 14, borderRadius: radius.lg, marginBottom: spacing.md },
  generateText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  empty: { alignItems: "center", padding: spacing.xxxl, gap: spacing.sm },
  emptyText: { color: colors.textSecondary, fontSize: 14 },
  emptySub: { color: colors.textTertiary, fontSize: 12 },
  card: { backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700", flex: 1, paddingRight: spacing.sm },
  editBadge: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  tagsRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  tag: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm, borderWidth: 1 },
  tagText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  sourceTag: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm, backgroundColor: colors.bg },
  sourceText: { color: colors.textTertiary, fontSize: 9, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
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
