// AI Platform Connections + Usage Dashboard.
// Env-only storage: keys never leave the backend .env file.  Screen shows
// only Connected/Not Connected + hint fragment (first 4 / last 4 chars).
import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Alert, Modal, TextInput, RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ChevronLeft, CheckCircle2, Circle, KeyRound, RefreshCw, Cpu,
  X, Save, Trash2, Sparkles,
} from "lucide-react-native";
import { request } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";

type Platform = {
  key: string;
  label: string;
  provider: string;
  model: string;
  env_var: string;
  connected: boolean;
  hint: string;
  always_connected: boolean;
};

type Dashboard = {
  summary: {
    total_calls: number;
    total_cost_usd: number;
    total_tokens: number;
    cache_hits: number;
    fallback_hits: number;
    avg_latency_ms: number;
    since: string;
    days: number;
  };
  by_platform: {
    platform: string;
    calls: number;
    tokens: number;
    cost_usd: number;
    avg_latency_ms: number;
  }[];
  by_task_type: { task_type: string; calls: number }[];
  recent: any[];
  platforms: Platform[];
};

export default function AIPlatformsScreen() {
  const router = useRouter();
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<Platform | null>(null);
  const [editingMode, setEditingMode] = useState<"set" | "rotate">("set");
  const [keyInput, setKeyInput] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    console.log("[AIPlat] load starting");
    try {
      const d = await request<Dashboard>("/ai-router/dashboard");
      console.log("[AIPlat] dash loaded:", d?.summary?.total_calls, "calls; platforms:", d?.platforms?.length);
      setDash(d);
    } catch (e: any) {
      console.log("[AIPlat] load ERROR:", String(e?.message || e));
      Alert.alert("Failed to load", String(e?.message || e));
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openEdit(p: Platform, mode: "set" | "rotate") {
    if (p.always_connected) return;
    setEditing(p);
    setEditingMode(mode);
    setKeyInput("");
  }

  async function submitKey() {
    if (!editing) return;
    const val = keyInput.trim();
    if (val.length < 8) {
      Alert.alert("Key too short", "Paste the full API key (at least 8 chars).");
      return;
    }
    setSaving(true);
    try {
      const endpoint = editingMode === "rotate" ? "rotate-key" : "set-key";
      await request(`/ai-router/platforms/${editing.key}/${endpoint}`, {
        method: "PUT", body: { api_key: val },
      });
      setEditing(null); setKeyInput("");
      await load();
      Alert.alert("Success", `${editing.label} key ${editingMode === "rotate" ? "rotated" : "saved"}.`);
    } catch (e: any) {
      Alert.alert("Failed", String(e?.message || e));
    } finally { setSaving(false); }
  }

  async function clearKey(p: Platform) {
    if (p.always_connected) return;
    Alert.alert("Disconnect?", `Remove the ${p.label} key? Tasks routed here will fall back to PLOS AI.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect", style: "destructive",
          onPress: async () => {
            try {
              await request(`/ai-router/platforms/${p.key}/key`, { method: "DELETE" });
              await load();
            } catch (e: any) { Alert.alert("Failed", String(e?.message || e)); }
          },
        },
      ]);
  }

  const s = dash?.summary;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ChevronLeft size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>AI Router</Text>
        <TouchableOpacity onPress={() => load()} style={styles.backBtn}>
          <RefreshCw size={16} color={colors.primaryGlow} />
        </TouchableOpacity>
      </View>
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primaryGlow} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primaryGlow} />}
        >
          {/* -------- Usage summary -------- */}
          <View style={styles.summaryGrid}>
            <SummaryCard label="AI calls (30d)" value={String(s?.total_calls ?? 0)} />
            <SummaryCard label="Cost (USD)" value={`$${(s?.total_cost_usd ?? 0).toFixed(4)}`} />
            <SummaryCard label="Cache hits" value={String(s?.cache_hits ?? 0)} />
            <SummaryCard label="Avg latency" value={`${s?.avg_latency_ms ?? 0} ms`} />
          </View>

          {/* -------- By platform -------- */}
          <Text style={styles.section}>Usage by platform</Text>
          {(dash?.by_platform || []).length === 0 ? (
            <View style={styles.empty}><Text style={styles.emptyText}>No AI calls yet — trigger any AI feature (Financial Snapshot, Deal Search, Translator) to populate.</Text></View>
          ) : (
            (dash?.by_platform || []).map((p) => (
              <View key={p.platform} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{p.platform.toUpperCase()}</Text>
                  <Text style={styles.rowSub}>{p.calls} calls · {p.tokens} tokens · avg {p.avg_latency_ms} ms</Text>
                </View>
                <Text style={styles.rowCost}>${p.cost_usd.toFixed(4)}</Text>
              </View>
            ))
          )}

          {/* -------- By task type -------- */}
          <Text style={styles.section}>Task types routed</Text>
          <View style={styles.tagWrap}>
            {(dash?.by_task_type || []).map((t) => (
              <View key={t.task_type} style={styles.tag}>
                <Sparkles size={10} color={colors.primaryGlow} />
                <Text style={styles.tagText}>{t.task_type}</Text>
                <View style={styles.tagBadge}><Text style={styles.tagBadgeText}>{t.calls}</Text></View>
              </View>
            ))}
            {(dash?.by_task_type || []).length === 0 && (
              <Text style={styles.emptyText}>No task types logged yet.</Text>
            )}
          </View>

          {/* -------- AI Platform Connections -------- */}
          <Text style={styles.section}>AI Platform Connections</Text>
          {(dash?.platforms || []).map((p) => (
            <View key={p.key} style={styles.platformCard} testID={`platform-${p.key}`}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Cpu size={16} color={p.connected ? colors.success : colors.textTertiary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.platformLabel}>{p.label}</Text>
                  <Text style={styles.platformModel}>{p.model} · {p.env_var}</Text>
                  {!!p.hint && <Text style={styles.platformHint}>••••{p.hint.split("…")[1] || ""}</Text>}
                </View>
                <View style={[styles.statusPill, p.connected ? styles.statusOn : styles.statusOff]}>
                  <Text style={[styles.statusText, p.connected ? { color: colors.success } : { color: colors.textTertiary }]}>
                    {p.connected ? "CONNECTED" : "NOT CONNECTED"}
                  </Text>
                </View>
              </View>
              {!p.always_connected && (
                <View style={styles.platformActions}>
                  {p.connected ? (
                    <>
                      <TouchableOpacity style={styles.actBtn} onPress={() => openEdit(p, "rotate")}>
                        <RefreshCw size={11} color={colors.primaryGlow} />
                        <Text style={styles.actBtnText}>Rotate Key</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.actBtnDanger} onPress={() => clearKey(p)}>
                        <Trash2 size={11} color="#EF4444" />
                        <Text style={styles.actBtnDangerText}>Disconnect</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <TouchableOpacity style={styles.actBtnPrimary} onPress={() => openEdit(p, "set")}>
                      <KeyRound size={11} color="#fff" />
                      <Text style={styles.actBtnPrimaryText}>Add API Key</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
              {p.always_connected && (
                <Text style={styles.alwaysNote}>Managed by Emergent — always connected.</Text>
              )}
            </View>
          ))}

          {/* -------- Recent calls -------- */}
          <Text style={styles.section}>Recent AI calls</Text>
          {(dash?.recent || []).slice(0, 12).map((r, i) => (
            <View key={r.log_id || i} style={styles.recentRow}>
              <View style={[styles.dot, {
                backgroundColor: r.cached ? colors.warning : (r.fallback_used ? "#a855f7" : colors.success),
              }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.recentTitle} numberOfLines={1}>
                  {r.task_type} → {r.platform}{r.cached ? " · CACHED" : ""}
                  {r.fallback_used ? " · FALLBACK" : ""}
                </Text>
                <Text style={styles.recentSub}>
                  {r.model || "n/a"} · {r.tokens_used || 0}t · {r.latency_ms || 0}ms · ${(r.est_cost_usd || 0).toFixed(4)}
                </Text>
              </View>
            </View>
          ))}
          {(dash?.recent || []).length === 0 && (
            <Text style={styles.emptyText}>No calls yet.</Text>
          )}
        </ScrollView>
      )}

      {/* -------- Edit Key Modal -------- */}
      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <KeyRound size={14} color={colors.primaryGlow} />
              <Text style={styles.modalTitle}>{editingMode === "rotate" ? "Rotate" : "Add"} {editing?.label} key</Text>
              <TouchableOpacity onPress={() => setEditing(null)}><X size={16} color={colors.textTertiary} /></TouchableOpacity>
            </View>
            <Text style={styles.modalHint}>
              Key is written to /app/backend/.env and hot-loaded. It is never stored in the database and never returned to the client.
            </Text>
            <TextInput
              style={styles.keyInput}
              value={keyInput}
              onChangeText={setKeyInput}
              placeholder={`Paste ${editing?.env_var} value`}
              placeholderTextColor={colors.textTertiary}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              testID="key-input"
            />
            <TouchableOpacity
              style={[styles.modalSave, (saving || keyInput.length < 8) && { opacity: 0.4 }]}
              onPress={submitKey}
              disabled={saving || keyInput.length < 8}
              testID="save-key"
            >
              {saving ? <ActivityIndicator size="small" color="#fff" /> : <Save size={12} color="#fff" />}
              <Text style={styles.modalSaveText}>{editingMode === "rotate" ? "Rotate key" : "Save key"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.sumCard}>
      <Text style={styles.sumVal}>{value}</Text>
      <Text style={styles.sumLbl}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.surface, borderBottomColor: colors.borderSubtle, borderBottomWidth: 1,
  },
  backBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.surfaceElevated, alignItems: "center", justifyContent: "center",
  },
  headerTitle: { flex: 1, textAlign: "center", color: colors.textPrimary, fontSize: 15, fontWeight: "800" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 4 },
  sumCard: {
    flexBasis: "48%", flexGrow: 1,
    backgroundColor: colors.surfaceElevated, borderRadius: radius.md,
    padding: spacing.md, borderWidth: 1, borderColor: colors.borderSubtle,
  },
  sumVal: { color: colors.primaryGlow, fontSize: 22, fontWeight: "800" },
  sumLbl: { color: colors.textTertiary, fontSize: 10, marginTop: 2, letterSpacing: 0.4, textTransform: "uppercase" },
  section: { color: colors.textPrimary, fontSize: 12, fontWeight: "800", marginTop: 14, marginBottom: 6, letterSpacing: 0.4, textTransform: "uppercase" },
  row: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1,
    borderRadius: radius.sm, padding: spacing.md, marginBottom: 6,
  },
  rowTitle: { color: colors.textPrimary, fontSize: 12, fontWeight: "800", letterSpacing: 0.4 },
  rowSub: { color: colors.textTertiary, fontSize: 10, marginTop: 1 },
  rowCost: { color: colors.primaryGlow, fontSize: 12, fontWeight: "700" },
  tagWrap: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  tag: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: colors.primaryMuted, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12,
  },
  tagText: { color: colors.primaryGlow, fontSize: 10, fontWeight: "700" },
  tagBadge: { backgroundColor: colors.primary, paddingHorizontal: 5, borderRadius: 8 },
  tagBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },
  empty: { padding: spacing.md, backgroundColor: colors.surface, borderRadius: radius.sm },
  emptyText: { color: colors.textTertiary, fontSize: 11 },
  platformCard: {
    backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1,
    borderRadius: radius.sm, padding: spacing.md, gap: 6, marginBottom: 6,
  },
  platformLabel: { color: colors.textPrimary, fontSize: 12, fontWeight: "700" },
  platformModel: { color: colors.textTertiary, fontSize: 10, marginTop: 1 },
  platformHint: { color: colors.primaryGlow, fontSize: 9, fontFamily: "monospace" },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1 },
  statusOn: { backgroundColor: "rgba(16,185,129,0.15)", borderColor: colors.success },
  statusOff: { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle },
  statusText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.4 },
  platformActions: { flexDirection: "row", gap: 4 },
  actBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: colors.primaryMuted, paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 10,
  },
  actBtnText: { color: colors.primaryGlow, fontSize: 10, fontWeight: "800" },
  actBtnPrimary: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: colors.primary, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10,
  },
  actBtnPrimaryText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  actBtnDanger: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(239,68,68,0.14)", paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 10,
  },
  actBtnDangerText: { color: "#EF4444", fontSize: 10, fontWeight: "800" },
  alwaysNote: { color: colors.textTertiary, fontSize: 10, fontStyle: "italic" },
  recentRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingVertical: 5, paddingHorizontal: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.borderSubtle,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  recentTitle: { color: colors.textPrimary, fontSize: 11, fontWeight: "700" },
  recentSub: { color: colors.textTertiary, fontSize: 9, marginTop: 1 },
  modalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "center", padding: spacing.md,
  },
  modalBox: {
    backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: 8,
    borderWidth: 1, borderColor: colors.borderSubtle,
  },
  modalTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: "800", flex: 1 },
  modalHint: { color: colors.textTertiary, fontSize: 10 },
  keyInput: {
    backgroundColor: colors.surfaceElevated, borderRadius: radius.sm,
    padding: spacing.sm, color: colors.textPrimary, fontSize: 12,
    borderWidth: 1, borderColor: colors.borderSubtle, fontFamily: "monospace",
  },
  modalSave: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: colors.primary, paddingVertical: 10, borderRadius: radius.sm,
  },
  modalSaveText: { color: "#fff", fontSize: 12, fontWeight: "800" },
});
