// World Clock + Time Zone Converter + Best Meeting Time (Enhancement 8)
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  Clock,
  Plus,
  Pencil,
  Star,
  ArrowRightLeft,
  Sparkles,
} from "lucide-react-native";

import { worldClockApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";
import { EditModal, type Field } from "@/src/components/EditModal";

type WCItem = {
  id: string;
  label: string;
  tz: string;
  is_home: boolean;
  notes?: string;
  local_time?: string;
  local_date?: string;
  utc_offset_hours?: number;
};

export default function WorldClockScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [clocks, setClocks] = useState<WCItem[]>([]);
  const [now, setNow] = useState(new Date());
  const [directory, setDirectory] = useState<{ label: string; tz: string }[]>([]);
  const [clockModal, setClockModal] = useState<{ open: boolean; item?: any }>({
    open: false,
  });

  // Converter state
  const [convertSrc, setConvertSrc] = useState<string>("America/New_York");
  const [convertTime, setConvertTime] = useState<string>("14:00");
  const [convertResults, setConvertResults] = useState<any[]>([]);

  // AI Best Meeting state
  const [aiParticipantsTz, setAiParticipantsTz] = useState<string[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<any | null>(null);
  const [aiDuration, setAiDuration] = useState("60");
  const [aiEarliest, setAiEarliest] = useState("8");
  const [aiLatest, setAiLatest] = useState("19");

  const loadAll = useCallback(async () => {
    try {
      const [c, d] = await Promise.all([
        worldClockApi.listClocks(),
        worldClockApi.directory(),
      ]);
      setClocks(c.clocks || []);
      setDirectory(d.timezones || []);
    } catch (_e) {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Re-render every 30s to keep local times fresh
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  // Helper: compute current local time for a clock dynamically
  const computeLocal = useCallback(
    (tz: string) => {
      try {
        const f = new Intl.DateTimeFormat("en-US", {
          timeZone: tz,
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
        const df = new Intl.DateTimeFormat("en-US", {
          timeZone: tz,
          weekday: "short",
          month: "short",
          day: "numeric",
        });
        return { time: f.format(now), date: df.format(now) };
      } catch (_e) {
        return { time: "--:--", date: "" };
      }
    },
    [now]
  );

  const CLOCK_FIELDS = useMemo<Field[]>(
    () => [
      { key: "label", label: "City / Label", kind: "text", placeholder: "e.g. Tokyo" },
      {
        key: "tz",
        label: "Timezone",
        kind: "select",
        options: directory.map((d) => ({ label: `${d.label}  ·  ${d.tz}`, value: d.tz })),
      },
      { key: "is_home", label: "Set as Home", kind: "boolean" },
      { key: "notes", label: "Notes (optional)", kind: "text" },
    ],
    [directory]
  );

  // CRUD handlers
  const saveClock = async (vals: any) => {
    const body = {
      label: vals.label,
      tz: vals.tz,
      is_home: !!vals.is_home,
      notes: vals.notes || "",
    };
    if (clockModal.item) {
      await worldClockApi.updateClock(clockModal.item.id, body);
    } else {
      await worldClockApi.createClock(body);
    }
    await loadAll();
  };
  const deleteClock = async () => {
    if (!clockModal.item) return;
    await worldClockApi.deleteClock(clockModal.item.id);
    await loadAll();
  };

  // Converter handler
  const runConvert = useCallback(async () => {
    if (!convertSrc || !convertTime || !/^\d{1,2}:\d{2}$/.test(convertTime)) {
      Alert.alert("Invalid time", "Use HH:MM 24-hour format.");
      return;
    }
    const targets = clocks
      .map((c) => c.tz)
      .filter((tz, i, a) => tz !== convertSrc && a.indexOf(tz) === i);
    if (targets.length === 0) {
      Alert.alert("Add clocks", "Add at least one world clock to convert to.");
      return;
    }
    // Use today's date in source tz
    const today = new Date().toISOString().slice(0, 10);
    const src_dt = `${today}T${convertTime.padStart(5, "0")}`;
    try {
      const r = await worldClockApi.convert({
        source_tz: convertSrc,
        source_datetime: src_dt,
        targets,
      });
      setConvertResults(r.results || []);
    } catch (e: any) {
      Alert.alert("Convert failed", e?.message || "Try again.");
    }
  }, [convertSrc, convertTime, clocks]);

  // AI Best Meeting handler
  const runBestMeeting = async () => {
    const participants = (aiParticipantsTz.length > 0
      ? aiParticipantsTz
      : clocks.map((c) => c.tz)
    )
      .filter((tz, i, a) => a.indexOf(tz) === i)
      .map((tz) => {
        const found = directory.find((d) => d.tz === tz);
        return { label: found?.label || tz, tz };
      });
    if (participants.length < 2) {
      Alert.alert("Pick participants", "Select at least 2 timezones for a meeting.");
      return;
    }
    setAiLoading(true);
    setAiResult(null);
    try {
      const r = await worldClockApi.bestMeetingTime({
        participants,
        duration_minutes: Number(aiDuration) || 60,
        earliest_local_hour: Number(aiEarliest) || 8,
        latest_local_hour: Number(aiLatest) || 19,
      });
      setAiResult(r);
    } catch (e: any) {
      Alert.alert("AI failed", e?.message || "Could not compute best time.");
    } finally {
      setAiLoading(false);
    }
  };

  const toggleParticipant = (tz: string) => {
    setAiParticipantsTz((prev) =>
      prev.includes(tz) ? prev.filter((t) => t !== tz) : [...prev, tz]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primaryGlow} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} testID="wc-back">
          <ArrowLeft color={colors.textPrimary} size={20} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>World Clock</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* CLOCKS */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionLabel}>YOUR CLOCKS</Text>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => setClockModal({ open: true })}
            testID="add-clock"
          >
            <Plus size={14} color="#fff" />
            <Text style={styles.addBtnText}>Add</Text>
          </TouchableOpacity>
        </View>

        {clocks.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.empty}>No clocks yet. Tap “Add” to start.</Text>
          </View>
        ) : (
          clocks.map((c) => {
            const local = computeLocal(c.tz);
            return (
              <TouchableOpacity
                key={c.id}
                style={[styles.clockCard, c.is_home && styles.clockHome]}
                onPress={() => setClockModal({ open: true, item: c })}
                testID={`clock-${c.id}`}
                activeOpacity={0.85}
              >
                <View style={styles.clockLeft}>
                  <Clock size={18} color={colors.primaryGlow} />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={styles.clockLabel}>{c.label}</Text>
                      {c.is_home && <Star size={11} color={colors.warning} fill={colors.warning} />}
                    </View>
                    <Text style={styles.clockTz}>{c.tz}</Text>
                  </View>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.clockTime}>{local.time}</Text>
                  <Text style={styles.clockDate}>{local.date}</Text>
                </View>
                <Pencil size={13} color={colors.textTertiary} style={{ marginLeft: spacing.sm }} />
              </TouchableOpacity>
            );
          })
        )}

        {/* CONVERTER */}
        <View style={[styles.sectionHead, { marginTop: spacing.xl }]}>
          <Text style={styles.sectionLabel}>TIME ZONE CONVERTER</Text>
        </View>
        <View style={styles.converterCard}>
          <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
            <View style={{ flex: 1.2 }}>
              <Text style={styles.fieldLabel}>From</Text>
              <View style={styles.pillRow}>
                {clocks.slice(0, 5).map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    onPress={() => setConvertSrc(c.tz)}
                    style={[
                      styles.pill,
                      convertSrc === c.tz && styles.pillActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.pillText,
                        convertSrc === c.tz && styles.pillTextActive,
                      ]}
                    >
                      {c.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={{ width: 90 }}>
              <Text style={styles.fieldLabel}>Time</Text>
              <TextInput
                value={convertTime}
                onChangeText={setConvertTime}
                placeholder="14:00"
                placeholderTextColor={colors.textTertiary}
                style={styles.timeInput}
                testID="convert-time-input"
              />
            </View>
          </View>
          <TouchableOpacity
            style={styles.convertBtn}
            onPress={runConvert}
            testID="convert-btn"
          >
            <ArrowRightLeft size={14} color="#fff" />
            <Text style={styles.convertBtnText}>Convert</Text>
          </TouchableOpacity>
          {convertResults.length > 0 && (
            <View style={{ marginTop: spacing.md, gap: spacing.xs }}>
              {convertResults.map((r) => (
                <View key={r.tz} style={styles.resultRow}>
                  <Text style={styles.resultLabel}>{r.label}</Text>
                  <Text style={styles.resultTime}>{r.local_time}</Text>
                  <Text style={styles.resultDate}>{r.local_date}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* BEST MEETING TIME (AI) */}
        <View style={[styles.sectionHead, { marginTop: spacing.xl }]}>
          <Text style={styles.sectionLabel}>BEST MEETING TIME · AI</Text>
        </View>
        <View style={styles.aiCard}>
          <Text style={styles.aiHelp}>
            Pick participant timezones below. Claude will find the best slot tomorrow.
          </Text>
          <View style={styles.pillRow}>
            {clocks.map((c) => {
              const active = aiParticipantsTz.includes(c.tz);
              return (
                <TouchableOpacity
                  key={c.id}
                  onPress={() => toggleParticipant(c.tz)}
                  style={[styles.pill, active && styles.pillActive]}
                  testID={`ai-participant-${c.tz}`}
                >
                  <Text style={[styles.pillText, active && styles.pillTextActive]}>
                    {c.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.aiSettingsRow}>
            <View style={styles.aiSettingCol}>
              <Text style={styles.fieldLabel}>Duration (min)</Text>
              <TextInput
                value={aiDuration}
                onChangeText={setAiDuration}
                keyboardType="number-pad"
                style={styles.timeInput}
              />
            </View>
            <View style={styles.aiSettingCol}>
              <Text style={styles.fieldLabel}>Earliest hour</Text>
              <TextInput
                value={aiEarliest}
                onChangeText={setAiEarliest}
                keyboardType="number-pad"
                style={styles.timeInput}
              />
            </View>
            <View style={styles.aiSettingCol}>
              <Text style={styles.fieldLabel}>Latest hour</Text>
              <TextInput
                value={aiLatest}
                onChangeText={setAiLatest}
                keyboardType="number-pad"
                style={styles.timeInput}
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.aiBtn, aiLoading && { opacity: 0.7 }]}
            onPress={runBestMeeting}
            disabled={aiLoading}
            testID="run-best-meeting"
          >
            <Sparkles size={14} color="#fff" />
            <Text style={styles.aiBtnText}>
              {aiLoading ? "Finding best time…" : "Find Best Meeting Time"}
            </Text>
          </TouchableOpacity>

          {aiResult?.chosen_slot && (
            <View style={styles.aiResultCard} testID="ai-result">
              <Text style={styles.aiResultLabel}>RECOMMENDED SLOT</Text>
              <Text style={styles.aiResultTime}>
                {aiResult.chosen_slot.utc_time.slice(11, 16)} UTC ·{" "}
                <Text style={{ color: colors.primaryGlow }}>
                  {aiResult.chosen_slot.color === "green"
                    ? "✓ All in hours"
                    : "Mixed hours"}
                </Text>
              </Text>
              <View style={{ gap: 4, marginTop: spacing.sm }}>
                {(aiResult.chosen_slot.participants || []).map((p: any) => (
                  <View key={p.tz} style={styles.aiParticipantRow}>
                    <Text style={styles.aiParticipantLabel}>{p.label}</Text>
                    <Text
                      style={[
                        styles.aiParticipantTime,
                        { color: p.in_hours ? colors.success : colors.warning },
                      ]}
                    >
                      {p.local_time}
                      {p.in_hours ? "" : " ⚠"}
                    </Text>
                  </View>
                ))}
              </View>
              <Text style={styles.aiReasoning}>{aiResult.reasoning}</Text>
              {!!aiResult.tradeoffs && (
                <Text style={styles.aiTradeoffs}>
                  <Text style={{ fontWeight: "700" }}>Trade-offs: </Text>
                  {aiResult.tradeoffs}
                </Text>
              )}
            </View>
          )}
        </View>

        <View style={{ height: 60 }} />
      </ScrollView>

      <EditModal
        visible={clockModal.open}
        title={clockModal.item ? "Edit Clock" : "Add Clock"}
        fields={CLOCK_FIELDS}
        initial={clockModal.item}
        onClose={() => setClockModal({ open: false })}
        onSubmit={saveClock}
        onDelete={clockModal.item ? deleteClock : undefined}
        deleteSubject={clockModal.item?.label}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
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
  scroll: { padding: spacing.lg, gap: spacing.sm },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  sectionLabel: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.sm,
  },
  addBtnText: { color: "#fff", fontSize: 11, fontWeight: "700", letterSpacing: 0.3 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  empty: { color: colors.textTertiary, fontSize: 12 },
  clockCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.xs,
  },
  clockHome: { borderColor: colors.warning },
  clockLeft: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1 },
  clockLabel: { color: colors.textPrimary, fontWeight: "700", fontSize: 14 },
  clockTz: { color: colors.textTertiary, fontSize: 10, marginTop: 2 },
  clockTime: { color: colors.textPrimary, fontWeight: "800", fontSize: 18, letterSpacing: 0.5 },
  clockDate: { color: colors.textSecondary, fontSize: 10, marginTop: 1 },
  // Converter
  converterCard: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  fieldLabel: {
    color: colors.textTertiary,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 4,
  },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pill: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
  },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { color: colors.textSecondary, fontSize: 11, fontWeight: "600" },
  pillTextActive: { color: "#fff" },
  timeInput: {
    backgroundColor: colors.surfaceElevated,
    color: colors.textPrimary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    borderRadius: radius.sm,
    fontSize: 14,
    fontFamily: "monospace" as any,
  },
  convertBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.primary,
    paddingVertical: 10,
    borderRadius: radius.md,
    marginTop: spacing.md,
  },
  convertBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceElevated,
    padding: spacing.sm,
    borderRadius: radius.sm,
    gap: spacing.sm,
  },
  resultLabel: { color: colors.textPrimary, fontWeight: "600", fontSize: 12, flex: 1 },
  resultTime: { color: colors.primaryGlow, fontWeight: "700", fontSize: 14, fontFamily: "monospace" as any },
  resultDate: { color: colors.textTertiary, fontSize: 10, width: 75, textAlign: "right" },
  // AI
  aiCard: {
    backgroundColor: colors.surface,
    borderColor: colors.primaryMuted,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  aiHelp: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
  aiSettingsRow: { flexDirection: "row", gap: spacing.sm, marginTop: 4 },
  aiSettingCol: { flex: 1 },
  aiBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.primary,
    paddingVertical: 11,
    borderRadius: radius.md,
    marginTop: spacing.xs,
  },
  aiBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  aiResultCard: {
    backgroundColor: colors.surfaceElevated,
    padding: spacing.md,
    borderRadius: radius.md,
    borderColor: colors.success,
    borderWidth: 1,
    marginTop: spacing.sm,
  },
  aiResultLabel: {
    color: colors.success,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  aiResultTime: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  aiParticipantRow: { flexDirection: "row", justifyContent: "space-between" },
  aiParticipantLabel: { color: colors.textSecondary, fontSize: 12 },
  aiParticipantTime: { fontSize: 12, fontWeight: "700", fontFamily: "monospace" as any },
  aiReasoning: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: spacing.sm,
  },
  aiTradeoffs: { color: colors.textTertiary, fontSize: 11, lineHeight: 16, marginTop: 4 },
});
