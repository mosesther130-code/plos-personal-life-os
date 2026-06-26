// Resume + cover letter generator (Claude).
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Sparkles, Check, X as XIcon } from "lucide-react-native";

import { careerApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";

export default function ResumeGenerator() {
  const router = useRouter();
  const { application_id } = useLocalSearchParams<{ application_id?: string }>();
  const [roleTitle, setRoleTitle] = useState("");
  const [employer, setEmployer] = useState("");
  const [jobDesc, setJobDesc] = useState("");
  const [loading, setLoading] = useState(false);
  const [appLoading, setAppLoading] = useState(!!application_id);
  const [result, setResult] = useState<any | null>(null);
  const [tab, setTab] = useState<"resume" | "cover">("resume");

  const prefill = useCallback(async () => {
    if (!application_id) return;
    try {
      const apps = await careerApi.listApplications();
      const a = apps.find((x: any) => x.application_id === application_id);
      if (a) {
        setRoleTitle(a.role_title || "");
        setEmployer(a.employer || "");
        setJobDesc(a.job_description || "");
        if (a.generated_resume || a.generated_cover_letter) {
          setResult({
            resume: a.generated_resume || "",
            cover_letter: a.generated_cover_letter || "",
            keywords_present: [],
            keywords_missing: [],
            match_score: a.match_score || 0,
          });
        }
      }
    } catch (_e) {}
    setAppLoading(false);
  }, [application_id]);

  useEffect(() => {
    prefill();
  }, [prefill]);

  const generate = async () => {
    if (!roleTitle || !employer || !jobDesc) return;
    setLoading(true);
    setResult(null);
    try {
      const r = await careerApi.generate({
        application_id: application_id || undefined,
        role_title: roleTitle,
        employer,
        job_description: jobDesc,
      });
      setResult(r);
    } catch (_e) {
      setResult({
        resume: "Generation failed. Try again.",
        cover_letter: "",
        keywords_present: [],
        keywords_missing: [],
        match_score: 0,
      });
    }
    setLoading(false);
  };

  if (appLoading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.loader}>
          <ActivityIndicator color={colors.primaryGlow} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          testID="gen-back"
        >
          <ArrowLeft color={colors.textPrimary} size={20} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Resume Generator</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.inputs} testID="gen-inputs">
            <Text style={styles.label}>Role Title</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Senior Product Engineer"
              placeholderTextColor={colors.textTertiary}
              value={roleTitle}
              onChangeText={setRoleTitle}
              testID="gen-role"
            />

            <Text style={styles.label}>Employer</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Anthropic"
              placeholderTextColor={colors.textTertiary}
              value={employer}
              onChangeText={setEmployer}
              testID="gen-employer"
            />

            <Text style={styles.label}>Job Description</Text>
            <TextInput
              style={[styles.input, styles.textarea]}
              placeholder="Paste the full job description here..."
              placeholderTextColor={colors.textTertiary}
              value={jobDesc}
              onChangeText={setJobDesc}
              multiline
              textAlignVertical="top"
              testID="gen-jd"
            />

            <TouchableOpacity
              style={[
                styles.generateBtn,
                (!roleTitle || !employer || !jobDesc) && { opacity: 0.4 },
              ]}
              onPress={generate}
              disabled={loading || !roleTitle || !employer || !jobDesc}
              testID="gen-button"
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Sparkles size={16} color="#fff" />
                  <Text style={styles.generateBtnText}>
                    {result ? "Regenerate" : "Generate Resume + Cover"}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {result && (
            <>
              {/* Keyword analysis */}
              <View style={styles.keywordCard} testID="keyword-analysis">
                <View style={styles.kwHeader}>
                  <Text style={styles.kwTitle}>ATS Keyword Match</Text>
                  {result.match_score ? (
                    <Text style={styles.kwScore}>{result.match_score}%</Text>
                  ) : null}
                </View>
                {result.keywords_present?.length > 0 && (
                  <View style={styles.kwRow}>
                    {result.keywords_present.map((k: string) => (
                      <View key={k} style={[styles.kwPill, { backgroundColor: "rgba(16,185,129,0.15)" }]}>
                        <Check size={11} color={colors.success} />
                        <Text style={[styles.kwText, { color: colors.success }]}>{k}</Text>
                      </View>
                    ))}
                  </View>
                )}
                {result.keywords_missing?.length > 0 && (
                  <>
                    <Text style={styles.missingLabel}>Missing:</Text>
                    <View style={styles.kwRow}>
                      {result.keywords_missing.map((k: string) => (
                        <View key={k} style={[styles.kwPill, { backgroundColor: "rgba(239,68,68,0.15)" }]}>
                          <XIcon size={11} color={colors.danger} />
                          <Text style={[styles.kwText, { color: colors.danger }]}>{k}</Text>
                        </View>
                      ))}
                    </View>
                  </>
                )}
              </View>

              {/* Tab toggle */}
              <View style={styles.tabRow}>
                <TouchableOpacity
                  onPress={() => setTab("resume")}
                  style={[styles.tab, tab === "resume" && styles.tabActive]}
                  testID="tab-resume"
                >
                  <Text
                    style={[
                      styles.tabText,
                      tab === "resume" && { color: colors.primaryGlow },
                    ]}
                  >
                    Resume
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setTab("cover")}
                  style={[styles.tab, tab === "cover" && styles.tabActive]}
                  testID="tab-cover"
                >
                  <Text
                    style={[
                      styles.tabText,
                      tab === "cover" && { color: colors.primaryGlow },
                    ]}
                  >
                    Cover Letter
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.outputCard} testID="gen-output">
                <Text style={styles.outputText} selectable>
                  {tab === "resume" ? result.resume : result.cover_letter}
                </Text>
              </View>
            </>
          )}

          <View style={{ height: 80 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
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
  headerTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  scroll: { padding: spacing.xl, gap: spacing.lg },

  inputs: { gap: 8 },
  label: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginTop: spacing.sm,
  },
  input: {
    backgroundColor: colors.surfaceElevated,
    color: colors.textPrimary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    fontSize: 14,
  },
  textarea: { minHeight: 140, textAlignVertical: "top" },

  generateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: radius.lg,
    marginTop: spacing.md,
  },
  generateBtnText: { color: "#fff", fontWeight: "700" },

  keywordCard: {
    backgroundColor: colors.surface,
    borderColor: colors.primaryMuted,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  kwHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  kwTitle: { color: colors.textPrimary, fontWeight: "700" },
  kwScore: { color: colors.success, fontWeight: "700", fontSize: 18 },
  kwRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  kwPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  kwText: { fontSize: 11, fontWeight: "600" },
  missingLabel: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: "700",
    marginTop: spacing.md,
    marginBottom: 6,
    letterSpacing: 1.2,
  },

  tabRow: { flexDirection: "row", gap: spacing.sm },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  tabActive: {
    borderColor: colors.primaryGlow,
    backgroundColor: colors.primaryMuted,
  },
  tabText: { color: colors.textSecondary, fontWeight: "700", fontSize: 13 },

  outputCard: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  outputText: {
    color: colors.textPrimary,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
});
