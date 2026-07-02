// PLOS Career — Target Employer Watch List (fully editable, 16 pre-seeded).
import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Alert, Linking, Modal, Pressable, TextInput, Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ChevronLeft, Star, Plus, Trash2, Edit3, ExternalLink, X,
} from "lucide-react-native";
import { careerPrefsApi, WatchEmployer } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";

const PRIO_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  critical: { bg: "rgba(239,68,68,0.20)", fg: "#EF4444", label: "CRITICAL" },
  high:     { bg: "rgba(245,158,11,0.20)", fg: "#F59E0B", label: "HIGH" },
  medium:   { bg: "rgba(234,179,8,0.20)",  fg: "#EAB308", label: "MED" },
  low:      { bg: "rgba(107,114,128,0.20)",fg: "#9CA3AF", label: "LOW" },
};
const TYPES = [
  { id: "federal_government", label: "Federal Government" },
  { id: "international_org", label: "International Organization" },
  { id: "nonprofit", label: "NGO / Nonprofit" },
  { id: "higher_education", label: "Higher Education" },
  { id: "international_dev_consulting", label: "Intl Dev Consulting" },
  { id: "private_sector", label: "Private Sector" },
];

export default function WatchListScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [employers, setEmployers] = useState<WatchEmployer[]>([]);
  const [modal, setModal] = useState<{ mode: "add" | "edit"; emp: Partial<WatchEmployer> } | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await careerPrefsApi.listWatch();
      setEmployers(d.employers || []);
    } catch (e: any) {
      Alert.alert("Load failed", String(e?.message || e));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function abbr(name: string) {
    return name.split(/\s+/).map((w) => w[0]).slice(0, 3).join("").toUpperCase();
  }

  async function saveEmployer() {
    if (!modal) return;
    try {
      if (modal.mode === "add") {
        await careerPrefsApi.addWatch(modal.emp);
      } else {
        await careerPrefsApi.updateWatch(modal.emp.employer_id!, modal.emp);
      }
      setModal(null);
      await load();
    } catch (e: any) {
      Alert.alert("Save failed", String(e?.message || e));
    }
  }

  async function deleteEmployer(e: WatchEmployer) {
    Alert.alert("Remove from watch list?", `${e.name} will no longer appear as a priority employer.`,
      [
        { text: "Cancel" },
        {
          text: "Remove", style: "destructive", onPress: async () => {
            try { await careerPrefsApi.deleteWatch(e.employer_id); await load(); }
            catch (err: any) { Alert.alert("Failed", String(err?.message || err)); }
          }
        },
      ]);
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loader}><ActivityIndicator color={colors.primaryGlow} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ChevronLeft size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Target Employer Watch List</Text>
        <TouchableOpacity onPress={() => setModal({ mode: "add", emp: { priority: "high", type: "international_org", keywords: [], alert_on_any: true, alert_high_match_only: false, careers_url: "", name: "", notes: "" } })} style={styles.backBtn}>
          <Plus size={22} color={colors.primaryGlow} />
        </TouchableOpacity>
      </View>

      <Text style={styles.sub}>16 employers pre-seeded. Every job from a Watch List employer is ranked higher in the feed and triggers an instant alert if enabled.</Text>

      <ScrollView contentContainerStyle={styles.scroll}>
        {employers.map((e) => {
          const pc = PRIO_COLORS[e.priority] || PRIO_COLORS.low;
          return (
            <View key={e.employer_id} style={styles.card} testID={`emp-${e.employer_id}`}>
              <View style={styles.cardTop}>
                <View style={[styles.avatar, { backgroundColor: pc.bg }]}>
                  <Text style={[styles.avatarText, { color: pc.fg }]}>{abbr(e.name)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={2}>{e.name}</Text>
                  <View style={{ flexDirection: "row", gap: 4, marginTop: 3, flexWrap: "wrap" }}>
                    <View style={[styles.badge, { backgroundColor: pc.bg }]}>
                      <Star size={9} color={pc.fg} fill={pc.fg} />
                      <Text style={[styles.badgeText, { color: pc.fg }]}>{pc.label}</Text>
                    </View>
                    <View style={styles.typeBadge}>
                      <Text style={styles.typeBadgeText}>{TYPES.find((t) => t.id === e.type)?.label || e.type}</Text>
                    </View>
                    {e.active_jobs_count !== undefined && e.active_jobs_count > 0 && (
                      <View style={styles.jobsBadge}>
                        <Text style={styles.jobsBadgeText}>{e.active_jobs_count} open</Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
              <TouchableOpacity onPress={() => Linking.openURL(e.careers_url)} style={styles.urlRow}>
                <ExternalLink size={11} color={colors.primaryGlow} />
                <Text style={styles.urlText} numberOfLines={1}>{e.careers_url}</Text>
              </TouchableOpacity>
              {e.keywords.length > 0 && (
                <View style={styles.kwRow}>
                  {e.keywords.slice(0, 5).map((k, i) => (
                    <View key={i} style={styles.kwChip}>
                      <Text style={styles.kwChipText}>{k}</Text>
                    </View>
                  ))}
                </View>
              )}
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.actBtn}
                  onPress={() => setModal({ mode: "edit", emp: { ...e } })}
                  testID={`edit-${e.employer_id}`}
                >
                  <Edit3 size={11} color={colors.primaryGlow} />
                  <Text style={styles.actText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actBtnDanger}
                  onPress={() => deleteEmployer(e)}
                  testID={`del-${e.employer_id}`}
                >
                  <Trash2 size={11} color="#EF4444" />
                  <Text style={styles.actTextDanger}>Delete</Text>
                </TouchableOpacity>
                <View style={{ flex: 1, alignItems: "flex-end" }}>
                  {e.alert_on_any && <Text style={styles.alertOn}>● Alerts ON</Text>}
                </View>
              </View>
            </View>
          );
        })}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Add / Edit modal */}
      {modal && (
        <Modal visible transparent animationType="slide" onRequestClose={() => setModal(null)}>
          <Pressable style={styles.modalBackdrop} onPress={() => setModal(null)}>
            <Pressable style={styles.modalSheet} onPress={(ev) => ev.stopPropagation()}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={styles.modalTitle}>{modal.mode === "add" ? "Add Employer" : "Edit Employer"}</Text>
                <TouchableOpacity onPress={() => setModal(null)}><X size={18} color={colors.textSecondary} /></TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: 480 }}>
                <Text style={styles.fieldLabel}>Employer Name</Text>
                <TextInput
                  style={styles.input}
                  value={modal.emp.name}
                  onChangeText={(t) => setModal({ ...modal, emp: { ...modal.emp, name: t } })}
                  placeholder="e.g. Asian Development Bank"
                  placeholderTextColor={colors.textTertiary}
                  testID="emp-name-input"
                />
                <Text style={styles.fieldLabel}>Priority</Text>
                <View style={{ flexDirection: "row", gap: 4 }}>
                  {["critical", "high", "medium", "low"].map((p) => (
                    <TouchableOpacity
                      key={p}
                      style={[styles.prioBtn, modal.emp.priority === p && styles.prioBtnOn]}
                      onPress={() => setModal({ ...modal, emp: { ...modal.emp, priority: p as any } })}
                    >
                      <Text style={[styles.prioBtnText, modal.emp.priority === p && { color: "#fff" }]}>{p.toUpperCase()}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.fieldLabel}>Type</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
                  {TYPES.map((t) => (
                    <TouchableOpacity
                      key={t.id}
                      style={[styles.typeSelect, modal.emp.type === t.id && styles.typeSelectOn]}
                      onPress={() => setModal({ ...modal, emp: { ...modal.emp, type: t.id } })}
                    >
                      <Text style={[styles.typeSelectText, modal.emp.type === t.id && { color: "#fff" }]}>{t.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <Text style={styles.fieldLabel}>Careers Page URL</Text>
                <TextInput
                  style={styles.input}
                  value={modal.emp.careers_url}
                  onChangeText={(t) => setModal({ ...modal, emp: { ...modal.emp, careers_url: t } })}
                  placeholder="https://…"
                  placeholderTextColor={colors.textTertiary}
                  autoCapitalize="none"
                  testID="emp-url-input"
                />
                <Text style={styles.fieldLabel}>Keywords (comma-separated)</Text>
                <TextInput
                  style={styles.input}
                  value={(modal.emp.keywords || []).join(", ")}
                  onChangeText={(t) => setModal({ ...modal, emp: { ...modal.emp, keywords: t.split(",").map((x) => x.trim()).filter(Boolean) } })}
                  placeholder="e.g. financial management, budget"
                  placeholderTextColor={colors.textTertiary}
                />
                <Text style={styles.fieldLabel}>Notes</Text>
                <TextInput
                  style={[styles.input, { minHeight: 60, textAlignVertical: "top" }]}
                  value={modal.emp.notes}
                  onChangeText={(t) => setModal({ ...modal, emp: { ...modal.emp, notes: t } })}
                  multiline
                  placeholder="Context, contacts, or history with this employer"
                  placeholderTextColor={colors.textTertiary}
                />
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 }}>
                  <Switch
                    value={modal.emp.alert_on_any}
                    onValueChange={(v) => setModal({ ...modal, emp: { ...modal.emp, alert_on_any: v } })}
                    trackColor={{ true: colors.primary, false: colors.surfaceElevated }}
                  />
                  <Text style={styles.fieldLabel}>Alert on ANY new job</Text>
                </View>
              </ScrollView>
              <TouchableOpacity style={styles.saveBtn} onPress={saveEmployer} testID="save-employer">
                <Text style={styles.saveBtnText}>{modal.mode === "add" ? "Add to Watch List" : "Save Changes"}</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>
      )}
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
  headerTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: "700", flex: 1, textAlign: "center" },
  sub: { color: colors.textTertiary, fontSize: 11, paddingHorizontal: spacing.lg, paddingVertical: 8, lineHeight: 15 },
  scroll: { padding: spacing.md, gap: 8 },
  card: {
    backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1,
    borderRadius: radius.md, padding: spacing.md, gap: 6,
  },
  cardTop: { flexDirection: "row", gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 12, fontWeight: "800", letterSpacing: 0.4 },
  name: { color: colors.textPrimary, fontSize: 14, fontWeight: "800" },
  badge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3 },
  badgeText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.4 },
  typeBadge: {
    backgroundColor: colors.surfaceElevated, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3,
  },
  typeBadgeText: { color: colors.textSecondary, fontSize: 9, fontWeight: "700" },
  jobsBadge: {
    backgroundColor: "rgba(16,185,129,0.15)", paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3,
  },
  jobsBadgeText: { color: colors.success, fontSize: 9, fontWeight: "800" },
  urlRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  urlText: { color: colors.primaryGlow, fontSize: 11, flexShrink: 1 },
  kwRow: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  kwChip: {
    backgroundColor: colors.primaryMuted, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8,
  },
  kwChipText: { color: colors.primaryGlow, fontSize: 9, fontWeight: "700" },
  actionRow: { flexDirection: "row", gap: 6, alignItems: "center", marginTop: 4 },
  actBtn: {
    flexDirection: "row", alignItems: "center", gap: 3,
    borderWidth: 1, borderColor: colors.borderSubtle, backgroundColor: colors.surfaceElevated,
    borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 5,
  },
  actText: { color: colors.primaryGlow, fontSize: 10, fontWeight: "700" },
  actBtnDanger: {
    flexDirection: "row", alignItems: "center", gap: 3,
    borderWidth: 1, borderColor: "rgba(239,68,68,0.35)",
    borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 5,
  },
  actTextDanger: { color: "#EF4444", fontSize: 10, fontWeight: "700" },
  alertOn: { color: colors.success, fontSize: 9, fontWeight: "800" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22,
    padding: spacing.lg, maxHeight: "90%",
  },
  modalTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "800" },
  fieldLabel: {
    color: colors.textTertiary, fontSize: 10, fontWeight: "800",
    letterSpacing: 0.5, textTransform: "uppercase", marginTop: 10,
  },
  input: {
    backgroundColor: colors.surfaceElevated, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.borderSubtle, color: colors.textPrimary,
    paddingHorizontal: 10, paddingVertical: 8, fontSize: 12, marginTop: 4,
  },
  prioBtn: {
    flex: 1, paddingVertical: 6, borderRadius: 4, alignItems: "center",
    backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.borderSubtle,
  },
  prioBtnOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  prioBtnText: { color: colors.textSecondary, fontSize: 10, fontWeight: "800" },
  typeSelect: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12,
    backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.borderSubtle,
  },
  typeSelectOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeSelectText: { color: colors.textSecondary, fontSize: 10, fontWeight: "700" },
  saveBtn: {
    backgroundColor: colors.primary, borderRadius: radius.sm, paddingVertical: 12,
    alignItems: "center", marginTop: 12,
  },
  saveBtnText: { color: "#fff", fontSize: 13, fontWeight: "800" },
});
