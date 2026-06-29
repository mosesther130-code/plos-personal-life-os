// PLOS — Career Intelligence (4c Interview Prep + 4d Letters + 4e Job Search)
import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  TextInput, Alert, Platform, Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import {
  ArrowLeft, Sparkles, MessageSquare, Mail, Search, ChevronDown, ChevronRight,
  Copy, Download, ExternalLink, Play, Filter, RefreshCw,
} from "lucide-react-native";

import { careerIntelApi, careerApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";

type Tab = "interview" | "letters" | "jobs";

export default function CareerIntel() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("interview");
  const [applications, setApplications] = useState<any[]>([]);
  const [appId, setAppId] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        const apps = await careerApi.listApplications();
        setApplications(apps || []);
        if (apps?.length) setAppId(apps[0].application_id);
      } catch {}
    })();
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} testID="ci-back">
          <ArrowLeft color={colors.textPrimary} size={20} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Career Intelligence</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {([
          ["interview", "Interview", MessageSquare],
          ["letters", "Letters", Mail],
          ["jobs", "Jobs", Search],
        ] as const).map(([k, label, Icon]) => (
          <TouchableOpacity
            key={k}
            style={[styles.tab, tab === k && styles.tabActive]}
            onPress={() => setTab(k as Tab)}
            testID={`tab-${k}`}
            activeOpacity={0.7}
          >
            <Icon size={14} color={tab === k ? colors.primaryGlow : colors.textSecondary} />
            <Text style={[styles.tabLabel, tab === k && { color: colors.primaryGlow }]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Application picker (shared across Interview + Letters) */}
      {tab !== "jobs" && applications.length > 0 ? (
        <View style={styles.appPicker}>
          <Text style={styles.appPickerLabel}>FOR APPLICATION</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingRight: 16 }}>
            {applications.map((a) => (
              <TouchableOpacity
                key={a.application_id}
                style={[styles.appChip, appId === a.application_id && styles.appChipActive]}
                onPress={() => setAppId(a.application_id)}
                testID={`app-${a.application_id}`}
                activeOpacity={0.7}
              >
                <Text style={[styles.appChipText, appId === a.application_id && { color: colors.primaryGlow }]} numberOfLines={1}>
                  {a.role_title} · {a.employer}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View style={{ flex: 1 }}>
        {tab === "interview" ? <InterviewTab appId={appId} /> : null}
        {tab === "letters" ? <LettersTab appId={appId} /> : null}
        {tab === "jobs" ? <JobsTab /> : null}
      </View>
    </SafeAreaView>
  );
}

// ----------------- Interview Tab -----------------
function InterviewTab({ appId }: { appId: string }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [practiceMode, setPracticeMode] = useState<number | null>(null);

  const load = async () => {
    if (!appId) {
      Alert.alert("Pick an application", "Select an application above first.");
      return;
    }
    setLoading(true);
    try {
      const r = await careerIntelApi.interviewPrep({ application_id: appId });
      setData(r);
    } catch (e: any) {
      Alert.alert("Failed", e?.message);
    }
    setLoading(false);
  };

  if (practiceMode != null && data?.questions) {
    const q = data.questions[practiceMode];
    return (
      <View style={styles.practiceMode}>
        <Text style={styles.practiceCount}>Question {practiceMode + 1} of {data.questions.length}</Text>
        <Text style={styles.practiceQ}>{q.question}</Text>
        <TouchableOpacity style={styles.practiceReveal} onPress={() => Alert.alert("Suggested Response", q.suggested_response)}>
          <Text style={styles.practiceRevealText}>Tap to reveal suggested response</Text>
        </TouchableOpacity>
        <View style={styles.practiceNav}>
          <TouchableOpacity
            style={[styles.practiceBtn, practiceMode === 0 && { opacity: 0.4 }]}
            disabled={practiceMode === 0}
            onPress={() => setPracticeMode(practiceMode - 1)}
          >
            <Text style={styles.practiceBtnText}>← Prev</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.practiceBtn} onPress={() => setPracticeMode(null)}>
            <Text style={styles.practiceBtnText}>Exit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.practiceBtn, practiceMode === data.questions.length - 1 && { opacity: 0.4 }]}
            disabled={practiceMode === data.questions.length - 1}
            onPress={() => setPracticeMode(practiceMode + 1)}
          >
            <Text style={styles.practiceBtnText}>Next →</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
      <TouchableOpacity style={styles.bigBtn} onPress={load} disabled={loading} testID="gen-interview" activeOpacity={0.85}>
        {loading ? <ActivityIndicator color="#fff" /> : <Sparkles size={14} color="#fff" />}
        <Text style={styles.bigBtnText}>{data ? "Refresh Prep" : "Generate Interview Prep"}</Text>
      </TouchableOpacity>

      {data?.questions ? (
        <>
          <View style={styles.row}>
            <Text style={styles.h2}>10 Likely Questions</Text>
            <TouchableOpacity style={styles.smallBtn} onPress={() => setPracticeMode(0)} testID="practice-mode">
              <Play size={12} color={colors.primaryGlow} />
              <Text style={styles.smallBtnText}>Practice Mode</Text>
            </TouchableOpacity>
          </View>
          {data.questions.map((q: any, i: number) => (
            <TouchableOpacity
              key={i}
              style={styles.qaCard}
              onPress={() => setExpandedIdx(expandedIdx === i ? null : i)}
              activeOpacity={0.8}
              testID={`q-${i}`}
            >
              <View style={styles.qaHead}>
                <Text style={styles.qaNum}>{i + 1}</Text>
                <Text style={styles.qaQ}>{q.question}</Text>
                {expandedIdx === i ? <ChevronDown size={14} color={colors.textTertiary} /> : <ChevronRight size={14} color={colors.textTertiary} />}
              </View>
              {q.category ? <Text style={styles.qaCategory}>{q.category}</Text> : null}
              {expandedIdx === i ? (
                <Text style={styles.qaResp}>{q.suggested_response}</Text>
              ) : null}
            </TouchableOpacity>
          ))}

          {data.reverse_questions?.length ? (
            <>
              <Text style={styles.h2}>Ask the Interviewer</Text>
              {data.reverse_questions.map((rq: string, i: number) => (
                <View key={i} style={styles.bulletCard}>
                  <Text style={styles.bulletText}>• {rq}</Text>
                </View>
              ))}
            </>
          ) : null}

          {data.plan_30_60_90 ? (
            <>
              <Text style={styles.h2}>30-60-90 Day Plan</Text>
              {[
                ["First 30 Days", data.plan_30_60_90.first_30_days],
                ["Days 31-60", data.plan_30_60_90.days_31_60],
                ["Days 61-90", data.plan_30_60_90.days_61_90],
              ].map(([label, items]: any, i) => (
                <View key={i} style={styles.planSection}>
                  <Text style={styles.planLabel}>{label}</Text>
                  {(items || []).map((it: string, j: number) => (
                    <Text key={j} style={styles.bulletText}>• {it}</Text>
                  ))}
                </View>
              ))}
            </>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

// ----------------- Letters Tab -----------------
function LettersTab({ appId }: { appId: string }) {
  const [type, setType] = useState<"cover" | "thank_you" | "follow_up">("cover");
  const [loading, setLoading] = useState(false);
  const [letter, setLetter] = useState<any>(null);
  const [interviewerName, setInterviewerName] = useState("");
  const [interviewerTitle, setInterviewerTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [days, setDays] = useState("14");

  const generate = async () => {
    if (!appId) {
      Alert.alert("Pick an application", "Select an application above first.");
      return;
    }
    setLoading(true);
    try {
      const r = await careerIntelApi.letter({
        letter_type: type,
        application_id: appId,
        interviewer_name: interviewerName || undefined,
        interviewer_title: interviewerTitle || undefined,
        discussion_topic: topic || undefined,
        days_since_applied: type === "follow_up" ? parseInt(days, 10) || 14 : undefined,
      });
      setLetter(r);
    } catch (e: any) {
      Alert.alert("Failed", e?.message);
    }
    setLoading(false);
  };

  const onCopy = async () => {
    if (!letter?.body) return;
    await Clipboard.setStringAsync(letter.body);
    Alert.alert("Copied", "Letter copied to clipboard.");
  };

  const onDownload = async (format: "pdf" | "docx") => {
    if (!letter?.body) return;
    try {
      const r = await careerIntelApi.letterDownload({
        subject: letter.subject || "Letter", body: letter.body, format,
      });
      if (Platform.OS === "web") {
        const dataUrl = `data:${r.mime_type};base64,${r.content_base64}`;
        // @ts-ignore
        const a = document.createElement("a");
        a.href = dataUrl; a.download = r.filename; a.target = "_blank"; a.rel = "noopener";
        // @ts-ignore
        document.body.appendChild(a); a.click();
        // @ts-ignore
        document.body.removeChild(a);
      } else {
        const Legacy: any = (FileSystem as any).legacy || FileSystem;
        const dir = Legacy.cacheDirectory || Legacy.documentDirectory;
        const path = `${dir}${r.filename}`;
        await Legacy.writeAsStringAsync(path, r.content_base64, { encoding: "base64" });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(path, { mimeType: r.mime_type, dialogTitle: r.filename });
        }
      }
    } catch (e: any) {
      Alert.alert("Download failed", e?.message);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
      <View style={styles.typeRow}>
        {[
          ["cover", "Cover Letter"], ["thank_you", "Thank You"], ["follow_up", "Follow-Up"],
        ].map(([k, label]) => (
          <TouchableOpacity
            key={k}
            style={[styles.typeBtn, type === k && styles.typeBtnActive]}
            onPress={() => { setType(k as any); setLetter(null); }}
            testID={`letter-type-${k}`}
            activeOpacity={0.7}
          >
            <Text style={[styles.typeBtnText, type === k && { color: "#fff" }]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {type === "thank_you" ? (
        <>
          <TextInput style={styles.input} placeholder="Interviewer Name" placeholderTextColor={colors.textTertiary} value={interviewerName} onChangeText={setInterviewerName} testID="iv-name" />
          <TextInput style={styles.input} placeholder="Interviewer Title" placeholderTextColor={colors.textTertiary} value={interviewerTitle} onChangeText={setInterviewerTitle} testID="iv-title" />
          <TextInput style={[styles.input, { minHeight: 60 }]} placeholder="Specific topic discussed" placeholderTextColor={colors.textTertiary} value={topic} onChangeText={setTopic} multiline testID="iv-topic" />
        </>
      ) : null}
      {type === "follow_up" ? (
        <TextInput
          style={styles.input} placeholder="Days since applied (default 14)" placeholderTextColor={colors.textTertiary}
          keyboardType="number-pad" value={days} onChangeText={setDays} testID="days-input"
        />
      ) : null}

      <TouchableOpacity style={styles.bigBtn} onPress={generate} disabled={loading} testID="gen-letter" activeOpacity={0.85}>
        {loading ? <ActivityIndicator color="#fff" /> : <Sparkles size={14} color="#fff" />}
        <Text style={styles.bigBtnText}>{letter ? "Regenerate" : "Generate Letter"}</Text>
      </TouchableOpacity>

      {letter ? (
        <View style={styles.letterCard}>
          {letter.subject ? <Text style={styles.letterSubject}>{letter.subject}</Text> : null}
          <Text style={styles.letterBody}>{letter.body}</Text>
          <View style={styles.letterActions}>
            <TouchableOpacity style={styles.actionBtn} onPress={onCopy} testID="copy-letter">
              <Copy size={12} color={colors.primaryGlow} />
              <Text style={styles.actionBtnText}>Copy</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={() => onDownload("pdf")} testID="dl-letter-pdf">
              <Download size={12} color={colors.primaryGlow} />
              <Text style={styles.actionBtnText}>PDF</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={() => onDownload("docx")} testID="dl-letter-docx">
              <Download size={12} color={colors.primaryGlow} />
              <Text style={styles.actionBtnText}>DOCX</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

// ----------------- Jobs Tab -----------------
function JobsTab() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({ date_posted: "30d", work_type: "any", salary_min: 0, source: "all" });

  const search = useCallback(async (refresh = false) => {
    setLoading(true);
    try {
      const r = await careerIntelApi.jobSearch({ refresh, filters });
      setResults(r.results || []);
    } catch (e: any) {
      Alert.alert("Failed", e?.message);
    }
    setLoading(false);
  }, [filters]);

  useEffect(() => { search(false); }, [search]);

  const openUrl = (url: string) => {
    if (!url) return;
    Linking.openURL(url.startsWith("http") ? url : `https://${url}`).catch(() => {});
  };

  return (
    <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
      <View style={styles.row}>
        <TouchableOpacity style={styles.smallBtn} onPress={() => setShowFilters(!showFilters)} testID="toggle-filters">
          <Filter size={12} color={colors.textSecondary} />
          <Text style={styles.smallBtnText}>Filters</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.smallBtn} onPress={() => search(true)} testID="refresh-jobs" disabled={loading}>
          <RefreshCw size={12} color={colors.primaryGlow} />
          <Text style={styles.smallBtnText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {showFilters ? (
        <View style={styles.filtersBox}>
          <ChipSelect label="DATE POSTED" options={[
            ["1d", "24h"], ["7d", "7 days"], ["30d", "30 days"],
          ]} value={filters.date_posted} onChange={(v) => setFilters({ ...filters, date_posted: v })} />
          <ChipSelect label="WORK TYPE" options={[
            ["any", "Any"], ["remote", "Remote"], ["hybrid", "Hybrid"], ["on-site", "On-site"],
          ]} value={filters.work_type} onChange={(v) => setFilters({ ...filters, work_type: v })} />
          <ChipSelect label="SOURCE" options={[
            ["all", "All"], ["USAJobs", "USAJobs"], ["LinkedIn", "LinkedIn"], ["Indeed", "Indeed"], ["Devex", "Devex"],
          ]} value={filters.source} onChange={(v) => setFilters({ ...filters, source: v })} />
          <TouchableOpacity style={[styles.bigBtn, { marginTop: 8 }]} onPress={() => search(true)}>
            <Search size={14} color="#fff" />
            <Text style={styles.bigBtnText}>Apply Filters</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator color={colors.primaryGlow} style={{ marginTop: 40 }} />
      ) : results.length === 0 ? (
        <Text style={styles.emptyText}>No results. Pull to refresh or adjust filters.</Text>
      ) : (
        results.map((j, i) => (
          <View key={j.job_id || i} style={styles.jobCard} testID={`job-${i}`}>
            <View style={styles.jobHead}>
              <View style={{ flex: 1 }}>
                <Text style={styles.jobTitle}>{j.title}</Text>
                <Text style={styles.jobCompany}>{j.company} · {j.location}</Text>
              </View>
              <View style={styles.matchPill}>
                <Text style={styles.matchPillText}>{j.match_score}</Text>
              </View>
            </View>
            <View style={styles.jobMetaRow}>
              {j.salary_range ? <Text style={styles.jobMeta}>{j.salary_range}</Text> : null}
              {j.work_type ? <Text style={styles.jobMeta}>· {j.work_type}</Text> : null}
              {j.posted_days_ago != null ? <Text style={styles.jobMeta}>· {j.posted_days_ago}d ago</Text> : null}
            </View>
            <View style={styles.sourceRow}>
              <Text style={styles.sourcePill}>{j.source}</Text>
              {j.match_reasoning ? <Text style={styles.jobReason}>{j.match_reasoning}</Text> : null}
            </View>
            {j.url ? (
              <TouchableOpacity style={styles.viewBtn} onPress={() => openUrl(j.url)} testID={`view-${i}`}>
                <ExternalLink size={12} color={colors.primaryGlow} />
                <Text style={styles.viewBtnText}>View Job</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ))
      )}
    </ScrollView>
  );
}

function ChipSelect({ label, options, value, onChange }: any) {
  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={styles.filterLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {options.map(([v, l]: any) => (
          <TouchableOpacity
            key={v}
            style={[styles.chip, value === v && styles.chipActive]}
            onPress={() => onChange(v)}
            activeOpacity={0.7}
          >
            <Text style={[styles.chipText, value === v && { color: colors.primaryGlow }]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  backBtn: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.surfaceElevated, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },

  tabBar: { flexDirection: "row", paddingHorizontal: spacing.lg, gap: 4, marginBottom: spacing.sm },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 10, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.borderSubtle, backgroundColor: colors.surface },
  tabActive: { borderColor: colors.primaryGlow, backgroundColor: colors.primaryMuted },
  tabLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: "700" },

  appPicker: { paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  appPickerLabel: { color: colors.textTertiary, fontSize: 9, fontWeight: "700", letterSpacing: 1.2, marginBottom: 4 },
  appChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.borderSubtle, backgroundColor: colors.surface, maxWidth: 200 },
  appChipActive: { borderColor: colors.primaryGlow, backgroundColor: colors.primaryMuted },
  appChipText: { color: colors.textSecondary, fontSize: 11, fontWeight: "600" },

  tabContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: 80, gap: spacing.sm },
  bigBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: radius.md, backgroundColor: colors.primary, marginVertical: 4 },
  bigBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },

  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  h2: { color: colors.textPrimary, fontSize: 14, fontWeight: "700", marginTop: spacing.md },
  smallBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.sm, backgroundColor: colors.primaryMuted },
  smallBtnText: { color: colors.primaryGlow, fontSize: 11, fontWeight: "700" },

  qaCard: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.borderSubtle, gap: 4 },
  qaHead: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  qaNum: { color: colors.primaryGlow, fontSize: 11, fontWeight: "700", width: 20 },
  qaQ: { color: colors.textPrimary, fontSize: 12, fontWeight: "700", flex: 1, lineHeight: 17 },
  qaCategory: { color: colors.textTertiary, fontSize: 9, fontWeight: "700", letterSpacing: 1, marginLeft: 28 },
  qaResp: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 8, marginLeft: 28, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderSubtle },

  bulletCard: { backgroundColor: colors.surface, borderRadius: radius.sm, padding: spacing.sm, borderWidth: 1, borderColor: colors.borderSubtle },
  bulletText: { color: colors.textPrimary, fontSize: 12, lineHeight: 17 },
  planSection: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.borderSubtle, gap: 4 },
  planLabel: { color: colors.primaryGlow, fontSize: 12, fontWeight: "700" },

  practiceMode: { flex: 1, padding: spacing.xl, justifyContent: "center", gap: spacing.lg },
  practiceCount: { color: colors.textTertiary, fontSize: 11, fontWeight: "700", letterSpacing: 1, textAlign: "center" },
  practiceQ: { color: colors.textPrimary, fontSize: 20, fontWeight: "700", textAlign: "center", lineHeight: 28 },
  practiceReveal: { padding: 16, borderRadius: radius.md, borderWidth: 2, borderColor: colors.primaryGlow, borderStyle: "dashed" },
  practiceRevealText: { color: colors.primaryGlow, fontSize: 12, fontWeight: "700", textAlign: "center" },
  practiceNav: { flexDirection: "row", gap: spacing.sm },
  practiceBtn: { flex: 1, paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: "center", borderWidth: 1, borderColor: colors.borderSubtle },
  practiceBtnText: { color: colors.textPrimary, fontSize: 12, fontWeight: "700" },

  typeRow: { flexDirection: "row", gap: 6 },
  typeBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.borderSubtle, backgroundColor: colors.surface, alignItems: "center" },
  typeBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeBtnText: { color: colors.textSecondary, fontSize: 12, fontWeight: "700" },
  input: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, color: colors.textPrimary, fontSize: 12, borderWidth: 1, borderColor: colors.borderSubtle },
  letterCard: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.borderSubtle },
  letterSubject: { color: colors.textPrimary, fontSize: 13, fontWeight: "700", marginBottom: 8 },
  letterBody: { color: colors.textPrimary, fontSize: 12, lineHeight: 18 },
  letterActions: { flexDirection: "row", gap: 6, marginTop: 12 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.sm, backgroundColor: colors.primaryMuted },
  actionBtnText: { color: colors.primaryGlow, fontSize: 11, fontWeight: "700" },

  filtersBox: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.borderSubtle, gap: 6 },
  filterLabel: { color: colors.textTertiary, fontSize: 9, fontWeight: "700", letterSpacing: 1.2, marginBottom: 4 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.borderSubtle, backgroundColor: colors.bg },
  chipActive: { borderColor: colors.primaryGlow, backgroundColor: colors.primaryMuted },
  chipText: { color: colors.textSecondary, fontSize: 11, fontWeight: "600" },

  jobCard: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.borderSubtle, gap: 6 },
  jobHead: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  jobTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: "700" },
  jobCompany: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  matchPill: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primaryMuted, borderWidth: 1, borderColor: colors.primaryGlow, alignItems: "center", justifyContent: "center" },
  matchPillText: { color: colors.primaryGlow, fontSize: 11, fontWeight: "700" },
  jobMetaRow: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  jobMeta: { color: colors.textTertiary, fontSize: 11 },
  sourceRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  sourcePill: { color: colors.warning, fontSize: 9, fontWeight: "700", letterSpacing: 0.5, backgroundColor: "rgba(245,158,11,0.15)", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  jobReason: { color: colors.textSecondary, fontSize: 10, fontStyle: "italic", flex: 1 },
  viewBtn: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  viewBtnText: { color: colors.primaryGlow, fontSize: 11, fontWeight: "700" },

  emptyText: { color: colors.textTertiary, fontSize: 12, fontStyle: "italic", textAlign: "center", marginTop: 40 },
});
