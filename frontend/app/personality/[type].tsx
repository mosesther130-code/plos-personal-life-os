// PLOS — Assessment-taking screen. Handles Likert 5/6, forced-choice, DISC.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ArrowLeft, ArrowRight, Check, X, Save, Play, Info, Sparkles } from "lucide-react-native";
import { colors, spacing, radius } from "@/src/lib/theme";
import { personalityApi } from "@/src/lib/api";

const LIKERT_5 = [
  { v: 1, label: "Strongly Disagree" },
  { v: 2, label: "Disagree" },
  { v: 3, label: "Neutral" },
  { v: 4, label: "Agree" },
  { v: 5, label: "Strongly Agree" },
];

const LIKERT_6 = [
  { v: 1, label: "Never" },
  { v: 2, label: "Rarely" },
  { v: 3, label: "Sometimes" },
  { v: 4, label: "Often" },
  { v: 5, label: "Very Often" },
  { v: 6, label: "Always" },
];

export default function AssessmentTake() {
  const router = useRouter();
  const { type } = useLocalSearchParams<{ type: string }>();
  const assessment_type = String(type || "");

  const [phase, setPhase] = useState<"intro" | "question" | "submitting">("intro");
  const [framework, setFramework] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [sessionId, setSessionId] = useState<string>("");
  const [responses, setResponses] = useState<Record<string, any>>({});
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const startTimeRef = useRef<number>(Date.now());
  const saveTimer = useRef<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = await personalityApi.questions(assessment_type);
      setFramework(q.framework);
      setQuestions(q.questions);
    } catch (e: any) {
      setError(e?.message || "Failed to load questions");
    }
    setLoading(false);
  }, [assessment_type]);

  useEffect(() => { load(); }, [load]);

  const beginOrResume = async () => {
    try {
      const s = await personalityApi.start(assessment_type);
      setSessionId(s.session_id);
      setResponses(s.responses || {});
      // resume at first unanswered question
      const firstUnanswered = questions.findIndex((q) => !(q.question_id in (s.responses || {})));
      setIdx(firstUnanswered === -1 ? questions.length - 1 : firstUnanswered);
      setPhase("question");
      startTimeRef.current = Date.now();
    } catch (e: any) {
      Alert.alert("Could not start", e?.message || "Please retry.");
    }
  };

  // Debounced auto-save
  const queueSave = useCallback((next: Record<string, any>) => {
    if (!sessionId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      personalityApi.save(sessionId, assessment_type, next).catch(() => {});
    }, 500);
  }, [sessionId, assessment_type]);

  const answerLikert = (val: number) => {
    const q = questions[idx];
    const next = { ...responses, [q.question_id]: val };
    setResponses(next);
    queueSave(next);
  };

  const answerForcedChoice = (letter: string) => {
    const q = questions[idx];
    const next = { ...responses, [q.question_id]: letter };
    setResponses(next);
    queueSave(next);
  };

  const answerDisc = (which: "most" | "least", letter: string) => {
    const q = questions[idx];
    const prev = (responses[q.question_id] as any) || {};
    const other = which === "most" ? "least" : "most";
    let updated: any = { ...prev, [which]: letter };
    if (updated[other] === letter) updated[other] = null;
    const next = { ...responses, [q.question_id]: updated };
    setResponses(next);
    queueSave(next);
  };

  const goNext = () => {
    if (idx < questions.length - 1) setIdx(idx + 1);
  };
  const goBack = () => {
    if (idx > 0) setIdx(idx - 1);
    else router.back();
  };
  const saveAndExit = async () => {
    try {
      await personalityApi.save(sessionId, assessment_type, responses);
    } catch (_e) {}
    router.replace("/personality");
  };

  const submit = async () => {
    if (!allAnswered) {
      Alert.alert("Almost done", `You still have ${questions.length - answeredCount} unanswered items.`);
      return;
    }
    setPhase("submitting");
    try {
      const timeSec = Math.round((Date.now() - startTimeRef.current) / 1000);
      await personalityApi.submit(sessionId, assessment_type, responses, timeSec);
      router.replace({ pathname: "/personality/results/[type]", params: { type: assessment_type } } as any);
    } catch (e: any) {
      Alert.alert("Submission failed", e?.message || "Please retry.");
      setPhase("question");
    }
  };

  const answeredCount = useMemo(() => {
    let n = 0;
    for (const q of questions) {
      const r = responses[q.question_id];
      if (q.response_type === "disc_group") {
        if (r && r.most && r.least) n++;
      } else if (r !== undefined && r !== null) {
        n++;
      }
    }
    return n;
  }, [responses, questions]);

  const allAnswered = answeredCount === questions.length && questions.length > 0;
  const progressPct = questions.length ? Math.round(answeredCount * 100 / questions.length) : 0;
  const q = questions[idx];
  const currentAnswered = q && (q.response_type === "disc_group"
    ? !!(responses[q.question_id]?.most && responses[q.question_id]?.least)
    : responses[q.question_id] !== undefined && responses[q.question_id] !== null);

  if (loading) {
    return <SafeAreaView style={styles.container}><ActivityIndicator style={{ marginTop: 60 }} color={colors.primaryGlow} /></SafeAreaView>;
  }
  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.ctaBtn} onPress={() => router.back()}><Text style={styles.ctaText}>Go back</Text></TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ------------------------- INTRO screen -------------------------
  if (phase === "intro") {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}><ArrowLeft color={colors.textPrimary} size={20} /></TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{framework?.name}</Text>
          <View style={{ width: 36 }} />
        </View>
        <ScrollView contentContainerStyle={styles.introScroll}>
          <View style={[styles.introCard, { borderTopColor: framework?.color || colors.primaryGlow, borderTopWidth: 4 }]}>
            <Text style={styles.introTitle}>{framework?.name}</Text>
            <Text style={styles.introShort}>{framework?.short}</Text>
            <View style={styles.introStatsRow}>
              <View style={styles.introStat}>
                <Text style={styles.introStatValue}>{framework?.question_count}</Text>
                <Text style={styles.introStatLabel}>Questions</Text>
              </View>
              <View style={styles.introStat}>
                <Text style={styles.introStatValue}>~{framework?.estimated_minutes}</Text>
                <Text style={styles.introStatLabel}>Minutes</Text>
              </View>
              <View style={styles.introStat}>
                <Text style={styles.introStatValue}>{framework?.dimensions?.length}</Text>
                <Text style={styles.introStatLabel}>Dimensions</Text>
              </View>
            </View>
            <View style={styles.scienceBox}>
              <Info size={12} color={colors.primaryGlow} />
              <Text style={styles.scienceText}>{framework?.science}</Text>
            </View>
            <View style={styles.instructionBox}>
              <Text style={styles.instructionTitle}>How to answer</Text>
              <Text style={styles.instructionText}>
                Answer based on who you <Text style={{ fontWeight: "800" }}>are naturally</Text>, not who you think you should be. There are no right or wrong answers. Your responses auto-save every step.
              </Text>
            </View>
            <TouchableOpacity style={[styles.ctaBtn, { backgroundColor: framework?.color || colors.primaryGlow }]} onPress={beginOrResume}>
              <Play color="#fff" size={16} />
              <Text style={[styles.ctaText, { color: "#fff" }]}>Start Assessment</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ------------------------- SUBMITTING screen -------------------------
  if (phase === "submitting") {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.submitBox}>
          <Sparkles size={40} color={framework?.color || colors.primaryGlow} />
          <Text style={styles.submitTitle}>Assessment complete!</Text>
          <Text style={styles.submitText}>PLOS AI is analysing your responses and generating personalised insights…</Text>
          <ActivityIndicator style={{ marginTop: 12 }} color={framework?.color || colors.primaryGlow} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  // ------------------------- QUESTION screen -------------------------
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => Alert.alert("Exit?", "Your progress is saved. You can resume anytime.", [
          { text: "Keep going", style: "cancel" },
          { text: "Save & Exit", onPress: saveAndExit },
        ])} testID="q-exit">
          <ArrowLeft color={colors.textPrimary} size={20} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.qCount}>Question {idx + 1} of {questions.length}</Text>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progressPct}%`, backgroundColor: framework?.color || colors.primaryGlow }]} />
          </View>
        </View>
        <TouchableOpacity style={styles.saveBtn} onPress={saveAndExit} testID="q-save-exit">
          <Save color={colors.textSecondary} size={14} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.qScroll} keyboardShouldPersistTaps="handled">
        {/* Question text */}
        <View style={styles.qCard}>
          {q.response_type === "disc_group" ? (
            <Text style={styles.qText}>Pick the word <Text style={{ color: colors.success, fontWeight: "800" }}>MOST</Text> like you and the word <Text style={{ color: colors.warning, fontWeight: "800" }}>LEAST</Text> like you.</Text>
          ) : q.response_type === "forced_choice" ? (
            <Text style={styles.qText}>Which describes you better?</Text>
          ) : (
            <Text style={styles.qText}>{q.question_text}</Text>
          )}
        </View>

        {/* Response options */}
        {q.response_type === "likert_5" && (
          <View style={{ gap: 8 }}>
            {LIKERT_5.map((o) => {
              const sel = responses[q.question_id] === o.v;
              return (
                <TouchableOpacity key={o.v} style={[styles.optCard, sel && styles.optCardSel]} onPress={() => answerLikert(o.v)} testID={`opt-${o.v}`}>
                  <View style={[styles.optDot, sel && { backgroundColor: framework?.color || colors.primaryGlow, borderColor: framework?.color || colors.primaryGlow }]}>{sel && <Check color="#fff" size={12} />}</View>
                  <Text style={[styles.optText, sel && { color: colors.textPrimary, fontWeight: "700" }]}>{o.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {q.response_type === "likert_6" && (
          <View style={{ gap: 8 }}>
            {LIKERT_6.map((o) => {
              const sel = responses[q.question_id] === o.v;
              return (
                <TouchableOpacity key={o.v} style={[styles.optCard, sel && styles.optCardSel]} onPress={() => answerLikert(o.v)} testID={`opt-${o.v}`}>
                  <View style={[styles.optDot, sel && { backgroundColor: framework?.color || colors.primaryGlow, borderColor: framework?.color || colors.primaryGlow }]}>{sel && <Check color="#fff" size={12} />}</View>
                  <Text style={[styles.optText, sel && { color: colors.textPrimary, fontWeight: "700" }]}>{o.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {q.response_type === "forced_choice" && (
          <View style={{ gap: 8 }}>
            {(q.options || []).map((o: any) => {
              const sel = responses[q.question_id] === o.value;
              return (
                <TouchableOpacity key={o.value} style={[styles.optCard, sel && styles.optCardSel, { minHeight: 60 }]} onPress={() => answerForcedChoice(o.value)} testID={`opt-${o.value}`}>
                  <View style={[styles.optDot, sel && { backgroundColor: framework?.color || colors.primaryGlow, borderColor: framework?.color || colors.primaryGlow }]}>{sel && <Check color="#fff" size={12} />}</View>
                  <Text style={[styles.optText, sel && { color: colors.textPrimary, fontWeight: "700" }, { flex: 1, lineHeight: 20 }]}>{o.text}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {q.response_type === "disc_group" && (
          <View style={{ gap: 12 }}>
            {(q.options || []).map((o: any) => {
              const sel = responses[q.question_id] || {};
              const isMost = sel.most === o.letter;
              const isLeast = sel.least === o.letter;
              return (
                <View key={o.letter} style={styles.discRow}>
                  <Text style={styles.discWord}>{o.text}</Text>
                  <View style={styles.discBtns}>
                    <TouchableOpacity style={[styles.discBtn, isMost && { backgroundColor: colors.success, borderColor: colors.success }]} onPress={() => answerDisc("most", o.letter)}>
                      <Text style={[styles.discBtnText, isMost && { color: "#fff" }]}>MOST</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.discBtn, isLeast && { backgroundColor: colors.warning, borderColor: colors.warning }]} onPress={() => answerDisc("least", o.letter)}>
                      <Text style={[styles.discBtnText, isLeast && { color: "#fff" }]}>LEAST</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <View style={{ height: 20 }} />

        {/* Nav */}
        <View style={styles.navRow}>
          <TouchableOpacity style={[styles.navBtn, styles.navBack]} onPress={goBack} testID="nav-back">
            <ArrowLeft color={colors.textPrimary} size={14} />
            <Text style={styles.navBtnText}>Back</Text>
          </TouchableOpacity>
          {idx < questions.length - 1 ? (
            <TouchableOpacity
              style={[styles.navBtn, styles.navNext, !currentAnswered && { opacity: 0.4 }]}
              onPress={goNext}
              disabled={!currentAnswered}
              testID="nav-next"
            >
              <Text style={[styles.navBtnText, { color: "#fff" }]}>Next</Text>
              <ArrowRight color="#fff" size={14} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.navBtn, styles.navNext, { backgroundColor: colors.success }, !allAnswered && { opacity: 0.4 }]}
              onPress={submit}
              disabled={!allAnswered}
              testID="nav-submit"
            >
              <Text style={[styles.navBtnText, { color: "#fff" }]}>Submit</Text>
              <Check color="#fff" size={14} />
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: 10 },
  backBtn: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.surfaceElevated, alignItems: "center", justifyContent: "center" },
  saveBtn: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.surfaceElevated, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700", flex: 1 },
  qCount: { color: colors.textSecondary, fontSize: 11, fontWeight: "700", marginBottom: 4 },
  progressBar: { height: 4, backgroundColor: colors.surfaceElevated, borderRadius: 2, overflow: "hidden" },
  progressFill: { height: 4, borderRadius: 2 },
  introScroll: { padding: spacing.lg },
  introCard: { padding: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderSubtle, gap: 12 },
  introTitle: { color: colors.textPrimary, fontSize: 22, fontWeight: "800" },
  introShort: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  introStatsRow: { flexDirection: "row", gap: 10 },
  introStat: { flex: 1, padding: 12, backgroundColor: colors.surfaceElevated, borderRadius: 10, alignItems: "center" },
  introStatValue: { color: colors.textPrimary, fontSize: 20, fontWeight: "800" },
  introStatLabel: { color: colors.textTertiary, fontSize: 10, fontWeight: "600", marginTop: 2, letterSpacing: 0.4 },
  scienceBox: { flexDirection: "row", gap: 6, backgroundColor: "rgba(59,130,246,0.08)", borderColor: "rgba(59,130,246,0.25)", borderWidth: 1, padding: 10, borderRadius: 8, alignItems: "flex-start" },
  scienceText: { flex: 1, color: colors.textPrimary, fontSize: 11, lineHeight: 15 },
  instructionBox: { padding: 12, backgroundColor: colors.surfaceElevated, borderRadius: 8 },
  instructionTitle: { color: colors.textPrimary, fontWeight: "700", fontSize: 12, marginBottom: 4 },
  instructionText: { color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  ctaBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.primaryGlow, borderRadius: 10, paddingVertical: 14, marginTop: 8 },
  ctaText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  qScroll: { padding: spacing.lg, paddingBottom: 60 },
  qCard: { padding: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderSubtle, marginBottom: 16 },
  qText: { color: colors.textPrimary, fontSize: 18, lineHeight: 26, fontWeight: "600" },
  optCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.borderSubtle, minHeight: 48 },
  optCardSel: { backgroundColor: "rgba(59,130,246,0.08)", borderColor: colors.primaryGlow },
  optDot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.borderSubtle, alignItems: "center", justifyContent: "center" },
  optText: { color: colors.textSecondary, fontSize: 14 },
  discRow: { flexDirection: "row", alignItems: "center", padding: 12, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.borderSubtle, gap: 10 },
  discWord: { flex: 1, color: colors.textPrimary, fontWeight: "700", fontSize: 15 },
  discBtns: { flexDirection: "row", gap: 6 },
  discBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: colors.borderSubtle },
  discBtnText: { color: colors.textSecondary, fontSize: 10, fontWeight: "800", letterSpacing: 0.4 },
  navRow: { flexDirection: "row", gap: 10, marginTop: 20 },
  navBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14, borderRadius: 10 },
  navBack: { backgroundColor: colors.surfaceElevated },
  navNext: { backgroundColor: colors.primaryGlow },
  navBtnText: { color: colors.textPrimary, fontWeight: "700", fontSize: 14 },
  errorBox: { padding: 20, gap: 12 },
  errorText: { color: colors.warning, fontSize: 14 },
  submitBox: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg, gap: 12 },
  submitTitle: { color: colors.textPrimary, fontSize: 20, fontWeight: "800" },
  submitText: { color: colors.textSecondary, fontSize: 13, textAlign: "center", lineHeight: 18 },
});
