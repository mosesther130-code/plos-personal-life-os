// PLOS Career — Connect Job Sources: fully editable + deletable per-user config.
import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Alert, TextInput, Modal, Pressable, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ChevronLeft, CheckCircle2, XCircle, Plus, Trash2, Pause, Play, Edit3,
  RotateCcw, X, Clock, Link as LinkIcon,
} from "lucide-react-native";
import { careerPrefsApi, JobSourceConfig } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";

const FREQ_OPTIONS = [30, 60, 120, 240, 720, 1440]; // minutes
const fmtFreq = (m: number) =>
  m < 60 ? `${m} min` : m === 60 ? "1 hr" : m < 1440 ? `${m / 60} hr` : `${m / 1440} d`;

export default function JobSourcesScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [sources, setSources] = useState<JobSourceConfig[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await careerPrefsApi.listSourceConfigs();
      setSources(r.sources || []);
    } catch (e: any) {
      Alert.alert("Load failed", String(e?.message || e));
    }
  }, []);

  useEffect(() => {
    (async () => { setLoading(true); await load(); setLoading(false); })();
  }, [load]);

  async function togglePause(s: JobSourceConfig) {
    try {
      await careerPrefsApi.updateSource(s.source_id, { paused: !s.paused });
      await load();
    } catch (e: any) { Alert.alert("Failed", String(e?.message || e)); }
  }

  async function setFreq(s: JobSourceConfig, freq: number) {
    try {
      await careerPrefsApi.updateSource(s.source_id, { update_frequency_min: freq });
      await load();
    } catch (e: any) { Alert.alert("Failed", String(e?.message || e)); }
  }

  async function rename(s: JobSourceConfig) {
    const doRename = async (name: string) => {
      const nm = name.trim();
      if (!nm) return;
      try {
        await careerPrefsApi.updateSource(s.source_id, { label: nm });
        await load();
      } catch (e: any) { Alert.alert("Rename failed", String(e?.message || e)); }
    };
    if (Platform.OS === "ios" && (Alert as any).prompt) {
      (Alert as any).prompt("Rename source", "", (v: string) => v && doRename(v),
        "plain-text", s.label);
    } else if (Platform.OS === "web") {
      const v = typeof window !== "undefined" ? window.prompt("Rename source", s.label) : null;
      if (v) doRename(v);
    } else {
      setEditingId(s.source_id);
    }
  }

  function confirmDelete(s: JobSourceConfig) {
    Alert.alert(
      "Delete source?",
      `Remove "${s.label}"? You can restore built-in sources anytime via "Restore Defaults".`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete", style: "destructive",
          onPress: async () => {
            try {
              await careerPrefsApi.deleteSource(s.source_id);
              await load();
            } catch (e: any) { Alert.alert("Delete failed", String(e?.message || e)); }
          },
        },
      ],
    );
  }

  async function restoreDefaults() {
    try {
      const r = await careerPrefsApi.restoreDefaultSources();
      Alert.alert("Restored", r.restored > 0
        ? `${r.restored} default source(s) added back.`
        : "All defaults already present.");
      await load();
    } catch (e: any) { Alert.alert("Failed", String(e?.message || e)); }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loader}><ActivityIndicator color={colors.primaryGlow} /></View>
      </SafeAreaView>
    );
  }

  const operational = sources.filter((s) => s.operational && !s.paused).length;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ChevronLeft size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Connect Job Sources</Text>
        <TouchableOpacity onPress={() => setAddOpen(true)} style={styles.backBtn} testID="add-source-btn">
          <Plus size={20} color={colors.primaryGlow} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.statusPill}>
          <Text style={styles.statusPillText}>
            {operational} active · {sources.length} total
          </Text>
          <TouchableOpacity style={styles.restoreBtn} onPress={restoreDefaults} testID="restore-defaults">
            <RotateCcw size={12} color={colors.primaryGlow} />
            <Text style={styles.restoreBtnText}>Restore defaults</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.hint}>
          Tap a source to pause/resume, rename, change refresh frequency, or delete.
          Add custom RSS/URL sources via the “+” button above.
        </Text>

        {sources.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No sources yet.</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={restoreDefaults}>
              <Text style={styles.emptyBtnText}>Restore built-in sources</Text>
            </TouchableOpacity>
          </View>
        )}

        {sources.map((s) => (
          <SourceCard
            key={s.source_id}
            source={s}
            onTogglePause={() => togglePause(s)}
            onSetFreq={(f) => setFreq(s, f)}
            onRename={() => rename(s)}
            onDelete={() => confirmDelete(s)}
            editingInline={editingId === s.source_id}
            onCommitRename={async (v) => {
              setEditingId(null);
              if (v && v.trim() && v.trim() !== s.label) {
                try {
                  await careerPrefsApi.updateSource(s.source_id, { label: v.trim() });
                  await load();
                } catch (e: any) { Alert.alert("Rename failed", String(e?.message || e)); }
              }
            }}
            onCancelRename={() => setEditingId(null)}
          />
        ))}

        <View style={{ height: 60 }} />
      </ScrollView>

      <AddSourceModal
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={async () => { setAddOpen(false); await load(); }}
      />
    </SafeAreaView>
  );
}

function SourceCard({
  source: s, onTogglePause, onSetFreq, onRename, onDelete,
  editingInline, onCommitRename, onCancelRename,
}: {
  source: JobSourceConfig;
  onTogglePause: () => void;
  onSetFreq: (f: number) => void;
  onRename: () => void;
  onDelete: () => void;
  editingInline: boolean;
  onCommitRename: (v: string) => void;
  onCancelRename: () => void;
}) {
  const [name, setName] = useState(s.label);
  const [freqOpen, setFreqOpen] = useState(false);
  const statusColor = s.paused
    ? colors.textTertiary
    : s.operational ? colors.success : colors.textTertiary;
  const statusLabel = s.paused ? "Paused" : s.operational ? "Active" : "Needs setup";

  return (
    <View style={[styles.card, s.paused && { opacity: 0.6 }]}>
      <View style={styles.cardHead}>
        {s.paused ? (
          <Pause size={14} color={statusColor} />
        ) : s.operational ? (
          <CheckCircle2 size={14} color={statusColor} />
        ) : (
          <XCircle size={14} color={statusColor} />
        )}
        <View style={{ flex: 1 }}>
          {editingInline ? (
            <View style={styles.inlineEditRow}>
              <TextInput
                style={styles.inlineEditInput}
                value={name}
                onChangeText={setName}
                autoFocus
                placeholderTextColor={colors.textTertiary}
                testID={`rename-input-${s.source_id}`}
              />
              <TouchableOpacity onPress={() => onCommitRename(name)} testID={`rename-save-${s.source_id}`}>
                <CheckCircle2 size={16} color={colors.success} />
              </TouchableOpacity>
              <TouchableOpacity onPress={onCancelRename}>
                <X size={16} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={onRename}>
              <Text style={styles.cardLabel} numberOfLines={1}>{s.label}</Text>
            </TouchableOpacity>
          )}
          <Text style={[styles.cardStatus, { color: statusColor }]}>
            {statusLabel} · {s.kind}
          </Text>
        </View>
        <View style={styles.cardActions}>
          <TouchableOpacity onPress={onRename} hitSlop={8} testID={`edit-${s.source_id}`}>
            <Edit3 size={14} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onTogglePause} hitSlop={8} testID={`pause-${s.source_id}`}>
            {s.paused ? <Play size={14} color={colors.primaryGlow} />
                     : <Pause size={14} color={colors.textSecondary} />}
          </TouchableOpacity>
          <TouchableOpacity onPress={onDelete} hitSlop={8} testID={`delete-${s.source_id}`}>
            <Trash2 size={14} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>

      {typeof s.contribution_count === "number" && (
        <Text style={styles.contribText}>
          {s.contribution_count} verified job{s.contribution_count === 1 ? "" : "s"} contributed
        </Text>
      )}
      {!!(s as any).note && (
        <Text style={styles.noteText}>{(s as any).note}</Text>
      )}

      {/* Frequency picker row */}
      <TouchableOpacity
        style={styles.freqBtn}
        onPress={() => setFreqOpen((v) => !v)}
        testID={`freq-toggle-${s.source_id}`}
      >
        <Clock size={12} color={colors.primaryGlow} />
        <Text style={styles.freqBtnText}>Refresh every {fmtFreq(s.update_frequency_min)}</Text>
      </TouchableOpacity>
      {freqOpen && (
        <View style={styles.freqRow}>
          {FREQ_OPTIONS.map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.freqChip, s.update_frequency_min === f && styles.freqChipOn]}
              onPress={() => { setFreqOpen(false); onSetFreq(f); }}
              testID={`freq-${s.source_id}-${f}`}
            >
              <Text style={[styles.freqChipText, s.update_frequency_min === f && { color: "#fff" }]}>
                {fmtFreq(f)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

function AddSourceModal({ visible, onClose, onSaved }: {
  visible: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState<"custom_url" | "rss">("custom_url");
  const [freq, setFreq] = useState(240);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) { setLabel(""); setUrl(""); setKind("custom_url"); setFreq(240); }
  }, [visible]);

  async function save() {
    if (!label.trim()) return;
    setSaving(true);
    try {
      await careerPrefsApi.createSource({
        label: label.trim(),
        kind,
        url: url.trim() || undefined,
        update_frequency_min: freq,
      });
      onSaved();
    } catch (e: any) {
      Alert.alert("Create failed", String(e?.message || e));
    } finally { setSaving(false); }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <Pressable style={modal.backdrop} onPress={onClose}>
        <Pressable style={modal.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={modal.head}>
            <Text style={modal.title}>Add custom job source</Text>
            <TouchableOpacity onPress={onClose}><X size={18} color={colors.textTertiary} /></TouchableOpacity>
          </View>
          <Text style={styles.hint}>
            Provide a display name and optional URL. Custom sources start paused-off and can be activated in Phase-2 scrapers.
          </Text>

          <Text style={modal.lbl}>Source name</Text>
          <TextInput
            style={modal.input}
            placeholder="e.g. Idealist Nonprofit Jobs"
            placeholderTextColor={colors.textTertiary}
            value={label}
            onChangeText={setLabel}
            testID="add-source-label"
          />

          <Text style={modal.lbl}>URL (optional)</Text>
          <View style={modal.urlRow}>
            <LinkIcon size={12} color={colors.textTertiary} />
            <TextInput
              style={[modal.input, { flex: 1, marginTop: 0, borderWidth: 0, paddingHorizontal: 4 }]}
              placeholder="https://example.com/jobs.rss"
              placeholderTextColor={colors.textTertiary}
              value={url}
              onChangeText={setUrl}
              autoCapitalize="none"
              autoCorrect={false}
              testID="add-source-url"
            />
          </View>

          <Text style={modal.lbl}>Kind</Text>
          <View style={modal.pillRow}>
            {[{ k: "custom_url", l: "Web URL" }, { k: "rss", l: "RSS Feed" }].map((k) => (
              <TouchableOpacity
                key={k.k}
                style={[modal.pill, kind === k.k && modal.pillOn]}
                onPress={() => setKind(k.k as any)}
              >
                <Text style={[modal.pillText, kind === k.k && { color: "#fff" }]}>{k.l}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={modal.lbl}>Refresh frequency</Text>
          <View style={modal.pillRow}>
            {FREQ_OPTIONS.map((f) => (
              <TouchableOpacity
                key={f}
                style={[modal.pill, freq === f && modal.pillOn]}
                onPress={() => setFreq(f)}
              >
                <Text style={[modal.pillText, freq === f && { color: "#fff" }]}>{fmtFreq(f)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[modal.saveBtn, (!label.trim() || saving) && { opacity: 0.5 }]}
            onPress={save}
            disabled={!label.trim() || saving}
            testID="add-source-save"
          >
            {saving ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={modal.saveBtnText}>Add source</Text>}
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
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
  headerTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: "700", flex: 1, textAlign: "center" },
  scroll: { padding: spacing.lg, paddingBottom: 40 },
  statusPill: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: colors.surface, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.borderSubtle,
    paddingVertical: 8, paddingHorizontal: 12, marginBottom: 6,
  },
  statusPillText: { color: colors.textPrimary, fontSize: 12, fontWeight: "700" },
  restoreBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: colors.primaryMuted, paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: radius.sm,
  },
  restoreBtnText: { color: colors.primaryGlow, fontSize: 10, fontWeight: "800" },
  hint: { color: colors.textTertiary, fontSize: 10, fontStyle: "italic", marginBottom: 8, lineHeight: 14 },
  card: {
    backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1,
    borderRadius: radius.md, padding: spacing.md, marginBottom: 8, gap: 6,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardLabel: { color: colors.textPrimary, fontSize: 13, fontWeight: "700" },
  cardStatus: { fontSize: 10, marginTop: 1, fontWeight: "600" },
  cardActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  inlineEditRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  inlineEditInput: {
    flex: 1, color: colors.textPrimary, fontSize: 13, fontWeight: "700",
    backgroundColor: colors.surfaceElevated, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.primaryGlow,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  contribText: { color: colors.textTertiary, fontSize: 10 },
  noteText: {
    color: colors.textTertiary, fontSize: 10, fontStyle: "italic",
    backgroundColor: colors.surfaceElevated, borderRadius: radius.sm, padding: 6, lineHeight: 14,
  },
  freqBtn: {
    flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start",
    backgroundColor: colors.primaryMuted, paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: radius.sm,
  },
  freqBtnText: { color: colors.primaryGlow, fontSize: 10, fontWeight: "700" },
  freqRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 2 },
  freqChip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
    backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.borderSubtle,
  },
  freqChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  freqChipText: { color: colors.textSecondary, fontSize: 10, fontWeight: "700" },
  emptyCard: {
    backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1,
    borderRadius: radius.md, padding: spacing.lg, alignItems: "center", gap: 8, marginTop: 8,
  },
  emptyText: { color: colors.textSecondary, fontSize: 12 },
  emptyBtn: {
    backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.sm,
  },
  emptyBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },
});

const modal = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.bg, borderTopLeftRadius: 16, borderTopRightRadius: 16,
    padding: 16, gap: 6,
  },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  title: { color: colors.textPrimary, fontSize: 15, fontWeight: "800" },
  lbl: { color: colors.textTertiary, fontSize: 11, fontWeight: "700", marginTop: 8 },
  input: {
    backgroundColor: colors.surface, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.borderSubtle, color: colors.textPrimary,
    paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, marginTop: 4,
  },
  urlRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: colors.surface, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.borderSubtle,
    paddingHorizontal: 10, paddingVertical: 4, marginTop: 4,
  },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  pill: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderSubtle,
  },
  pillOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { color: colors.textSecondary, fontSize: 11, fontWeight: "700" },
  saveBtn: {
    marginTop: 16, backgroundColor: colors.primary, borderRadius: radius.sm,
    paddingVertical: 12, alignItems: "center",
  },
  saveBtnText: { color: "#fff", fontSize: 13, fontWeight: "800" },
});
