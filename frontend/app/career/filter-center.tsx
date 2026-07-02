// PLOS Career — Filter Center. 7 sections — target roles, sectors, locations,
// salary, experience, ranking weights, alerts.
import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Alert, TextInput, Modal, Pressable, Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  ChevronLeft, Save, Wand2, Plus, X, Star, RefreshCw,
} from "lucide-react-native";
import { careerPrefsApi, FilterProfile } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";

const PRIORITY_OPTS = ["critical", "high", "medium", "low"];
const RANK_LABELS: Record<string, string> = {
  match_score: "Match Score", salary: "Salary Level",
  employer_reputation: "Employer Reputation", posted_date: "Posted Date",
  location_match: "Location Match", work_type: "Work Type Match",
  sector_priority: "Sector Priority", watch_list: "Target Employer Watch List",
  deadline_urgency: "Deadline Urgency", early_posting: "Early Posting Advantage",
};

export default function FilterCenterScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ profile_id?: string }>();
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<FilterProfile[]>([]);
  const [active, setActive] = useState<FilterProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [newRoleTag, setNewRoleTag] = useState("");

  const load = useCallback(async () => {
    try {
      const p = await careerPrefsApi.listProfiles();
      setProfiles(p.profiles);
      const picked = params.profile_id
        ? p.profiles.find((x) => x.profile_id === params.profile_id)
        : p.profiles.find((x) => x.is_active) || p.profiles[0];
      setActive(picked || null);
    } catch (e: any) {
      Alert.alert("Load failed", String(e?.message || e));
    } finally { setLoading(false); }
  }, [params.profile_id]);

  useEffect(() => { (async () => { setLoading(true); await load(); })(); }, [load]);

  function update<K extends keyof FilterProfile>(k: K, v: FilterProfile[K]) {
    if (!active) return;
    setActive({ ...active, [k]: v });
  }

  async function applyProfile() {
    if (!active) return;
    setSaving(true);
    try {
      await careerPrefsApi.updateProfile(active.profile_id, active);
      const res = await careerPrefsApi.applyProfile(active.profile_id);
      Alert.alert("Applied", `"${res.profile_name}" active. ${res.ranked_count} jobs re-ranked.`);
      router.back();
    } catch (e: any) {
      Alert.alert("Failed", String(e?.message || e));
    } finally { setSaving(false); }
  }

  function resetWeights() {
    if (!active) return;
    update("ranking_weights", {
      match_score: 10, salary: 8, employer_reputation: 8, posted_date: 7,
      location_match: 7, work_type: 6, sector_priority: 9,
      watch_list: 10, deadline_urgency: 5, early_posting: 6,
    });
  }

  async function switchProfile(pid: string) {
    try {
      const r = await careerPrefsApi.applyProfile(pid);
      Alert.alert("Switched", `"${r.profile_name}" is now active.`);
      await load();
    } catch (e: any) {
      Alert.alert("Failed", String(e?.message || e));
    }
  }

  if (loading || !active) {
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
        <Text style={styles.headerTitle} numberOfLines={1}>{active.profile_name}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Named profile row */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.profileRow}>
          {profiles.map((p) => (
            <TouchableOpacity
              key={p.profile_id}
              style={[styles.profileChip, active.profile_id === p.profile_id && styles.profileChipOn,
                     p.is_active && styles.profileChipActive]}
              onPress={() => switchProfile(p.profile_id)}
              testID={`profile-${p.profile_id}`}
            >
              {p.is_active && <Star size={10} color="#fff" fill="#fff" />}
              <Text style={[styles.profileChipText, p.is_active && { color: "#fff" }]}>{p.profile_name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ===== Section 1: Target Roles ===== */}
        <Text style={styles.section}>1. Target Roles & Keywords</Text>
        <View style={styles.tagBox}>
          <View style={styles.tagRow}>
            {active.target_roles.map((t, i) => (
              <View key={i} style={styles.tag}>
                <Text style={styles.tagText}>{t}</Text>
                <TouchableOpacity onPress={() => update("target_roles", active.target_roles.filter((_, j) => j !== i))}>
                  <X size={12} color={colors.textTertiary} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
          <View style={styles.addTagRow}>
            <TextInput
              style={styles.tagInput}
              placeholder="Add role or keyword…"
              placeholderTextColor={colors.textTertiary}
              value={newRoleTag}
              onChangeText={setNewRoleTag}
              onSubmitEditing={() => {
                if (newRoleTag.trim()) {
                  update("target_roles", [...active.target_roles, newRoleTag.trim()]);
                  setNewRoleTag("");
                }
              }}
              testID="add-role-input"
            />
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => {
                if (newRoleTag.trim()) {
                  update("target_roles", [...active.target_roles, newRoleTag.trim()]);
                  setNewRoleTag("");
                }
              }}
            >
              <Plus size={14} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.subHead}>Keywords to Exclude</Text>
        <View style={styles.tagBox}>
          <View style={styles.tagRow}>
            {active.excluded_keywords.map((t, i) => (
              <View key={i} style={[styles.tag, { borderColor: "rgba(239,68,68,0.4)" }]}>
                <Text style={[styles.tagText, { color: "#EF4444" }]}>{t}</Text>
                <TouchableOpacity onPress={() => update("excluded_keywords", active.excluded_keywords.filter((_, j) => j !== i))}>
                  <X size={12} color="#EF4444" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>

        {/* ===== Section 2: Sectors ===== */}
        <Text style={styles.section}>2. Industries & Employer Types</Text>
        {active.sectors.map((s, i) => (
          <View key={s.id} style={styles.sectorRow}>
            <Switch
              value={s.enabled}
              onValueChange={(v) => {
                const next = [...active.sectors];
                next[i] = { ...s, enabled: v };
                update("sectors", next);
              }}
              trackColor={{ true: colors.primary, false: colors.surfaceElevated }}
              testID={`sector-toggle-${s.id}`}
            />
            <Text style={styles.sectorLabel}>{s.name}</Text>
            <View style={styles.priorityPicker}>
              {["high", "medium", "low"].map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[styles.prioChip, s.priority === p && styles.prioChipOn]}
                  onPress={() => {
                    const next = [...active.sectors];
                    next[i] = { ...s, priority: p };
                    update("sectors", next);
                  }}
                >
                  <Text style={[styles.prioChipText, s.priority === p && { color: "#fff" }]}>{p[0].toUpperCase()}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        {/* ===== Section 3: Locations ===== */}
        <Text style={styles.section}>3. Where You Want to Work</Text>
        {active.locations.map((loc, i) => (
          <View key={i} style={styles.locRow}>
            <Text style={styles.locLabel}>{loc.label}</Text>
            <View style={styles.priorityPicker}>
              {["high", "medium", "low"].map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[styles.prioChip, loc.priority === p && styles.prioChipOn]}
                  onPress={() => {
                    const next = [...active.locations];
                    next[i] = { ...loc, priority: p };
                    update("locations", next);
                  }}
                >
                  <Text style={[styles.prioChipText, loc.priority === p && { color: "#fff" }]}>{p[0].toUpperCase()}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}
        <Text style={styles.subHead}>Work types</Text>
        <View style={styles.wtRow}>
          {["remote", "hybrid", "on_site", "international"].map((wt) => {
            const on = active.work_types.includes(wt);
            return (
              <TouchableOpacity
                key={wt}
                style={[styles.wtChip, on && styles.wtChipOn]}
                onPress={() => update("work_types", on ? active.work_types.filter((x) => x !== wt) : [...active.work_types, wt])}
              >
                <Text style={[styles.wtChipText, on && { color: "#fff" }]}>{wt.replace("_", "-")}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ===== Section 4: Salary ===== */}
        <Text style={styles.section}>4. Compensation</Text>
        <View style={styles.salaryCard}>
          <Text style={styles.subHead}>Minimum salary</Text>
          <TextInput
            style={styles.salaryInput}
            value={String(active.min_salary)}
            onChangeText={(t) => update("min_salary", parseInt(t.replace(/[^0-9]/g, "") || "0", 10))}
            keyboardType="number-pad"
            testID="min-salary"
          />
          <Text style={styles.hint}>${active.min_salary.toLocaleString()} minimum</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }}>
            <Switch
              value={active.include_no_salary}
              onValueChange={(v) => update("include_no_salary", v)}
              trackColor={{ true: colors.primary, false: colors.surfaceElevated }}
            />
            <Text style={styles.hint}>Include roles with no salary listed</Text>
          </View>
        </View>

        {/* ===== Section 5: Experience ===== */}
        <Text style={styles.section}>5. Role Level</Text>
        <View style={styles.wtRow}>
          {["entry", "mid", "senior", "executive"].map((lvl) => {
            const on = active.experience_levels.includes(lvl);
            return (
              <TouchableOpacity
                key={lvl}
                style={[styles.wtChip, on && styles.wtChipOn]}
                onPress={() => update("experience_levels", on ? active.experience_levels.filter((x) => x !== lvl) : [...active.experience_levels, lvl])}
              >
                <Text style={[styles.wtChipText, on && { color: "#fff" }]}>{lvl}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ===== Section 6: Ranking Weights ===== */}
        <View style={styles.rankHead}>
          <Text style={styles.section}>6. Ranking Weights</Text>
          <TouchableOpacity onPress={resetWeights} style={styles.resetBtn}>
            <RefreshCw size={11} color={colors.primaryGlow} />
            <Text style={styles.resetBtnText}>Reset</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.hint}>0 = ignore, 10 = maximum weight. Tap to adjust.</Text>
        {Object.entries(RANK_LABELS).map(([k, lbl]) => {
          const w = active.ranking_weights[k] || 0;
          return (
            <View key={k} style={styles.weightRow}>
              <Text style={styles.weightLabel}>{lbl}</Text>
              <View style={styles.weightPickerRow}>
                {[0, 2, 4, 6, 8, 10].map((v) => (
                  <TouchableOpacity
                    key={v}
                    style={[styles.wDot, w >= v && { backgroundColor: colors.primary }]}
                    onPress={() => update("ranking_weights", { ...active.ranking_weights, [k]: v })}
                    testID={`w-${k}-${v}`}
                  />
                ))}
                <Text style={styles.weightValue}>{w}</Text>
              </View>
            </View>
          );
        })}

        {/* ===== Section 7: Alerts ===== */}
        <Text style={styles.section}>7. Alerts</Text>
        <View style={styles.salaryCard}>
          <Text style={styles.subHead}>Minimum match score for alerts</Text>
          <View style={styles.weightPickerRow}>
            {[60, 70, 75, 80, 85, 90, 95].map((v) => (
              <TouchableOpacity
                key={v}
                style={[styles.scoreDot, active.alert_min_match_score === v && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                onPress={() => update("alert_min_match_score", v)}
              >
                <Text style={[styles.scoreDotText, active.alert_min_match_score === v && { color: "#fff" }]}>{v}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[styles.subHead, { marginTop: 12 }]}>Daily alert cap</Text>
          <View style={styles.wtRow}>
            {[1, 3, 5, 99].map((n) => (
              <TouchableOpacity
                key={n}
                style={[styles.wtChip, active.alert_frequency_cap === n && styles.wtChipOn]}
                onPress={() => update("alert_frequency_cap", n)}
              >
                <Text style={[styles.wtChipText, active.alert_frequency_cap === n && { color: "#fff" }]}>{n === 99 ? "Unlimited" : `${n}/day`}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      <View style={styles.stickyBar}>
        <TouchableOpacity
          style={styles.applyBtn}
          onPress={applyProfile}
          disabled={saving}
          testID="apply-filters"
        >
          {saving ? <ActivityIndicator color="#fff" size="small" /> : (
            <>
              <Save size={14} color="#fff" />
              <Text style={styles.applyBtnText}>Apply Filters & Re-Rank</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
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
  scroll: { padding: spacing.lg, paddingBottom: 100 },
  profileRow: { gap: 6, paddingBottom: 8 },
  profileChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
    borderWidth: 1, borderColor: colors.borderSubtle, backgroundColor: colors.surface,
  },
  profileChipOn: { borderColor: colors.primaryGlow },
  profileChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  profileChipText: { color: colors.textSecondary, fontSize: 11, fontWeight: "700" },
  section: { color: colors.textPrimary, fontSize: 14, fontWeight: "800", marginTop: spacing.lg, marginBottom: 6 },
  subHead: { color: colors.textTertiary, fontSize: 11, fontWeight: "700", marginTop: 8 },
  hint: { color: colors.textTertiary, fontSize: 10, fontStyle: "italic" },
  tagBox: {
    backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1,
    borderRadius: radius.sm, padding: spacing.md, gap: 6,
  },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  tag: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: colors.surfaceElevated, borderRadius: 12,
    paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: colors.borderSubtle,
  },
  tagText: { color: colors.textPrimary, fontSize: 11, fontWeight: "600" },
  addTagRow: { flexDirection: "row", gap: 6, marginTop: 4 },
  tagInput: {
    flex: 1, backgroundColor: colors.surfaceElevated, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.borderSubtle, color: colors.textPrimary,
    paddingHorizontal: 10, paddingVertical: 8, fontSize: 12,
  },
  addBtn: {
    backgroundColor: colors.primary, borderRadius: radius.sm,
    paddingHorizontal: 12, alignItems: "center", justifyContent: "center",
  },
  sectorRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1,
    borderRadius: radius.sm, padding: spacing.sm, marginBottom: 4,
  },
  sectorLabel: { color: colors.textPrimary, fontSize: 12, fontWeight: "600", flex: 1 },
  priorityPicker: { flexDirection: "row", gap: 3 },
  prioChip: {
    width: 26, height: 26, borderRadius: 4, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.borderSubtle,
  },
  prioChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  prioChipText: { color: colors.textSecondary, fontSize: 10, fontWeight: "800" },
  locRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1,
    borderRadius: radius.sm, padding: spacing.sm, marginBottom: 4,
  },
  locLabel: { color: colors.textPrimary, fontSize: 12, fontWeight: "600", flex: 1 },
  wtRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  wtChip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderSubtle,
  },
  wtChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  wtChipText: { color: colors.textSecondary, fontSize: 10, fontWeight: "700" },
  salaryCard: {
    backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1,
    borderRadius: radius.sm, padding: spacing.md, gap: 4,
  },
  salaryInput: {
    backgroundColor: colors.surfaceElevated, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.borderSubtle, color: colors.textPrimary,
    paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, fontWeight: "700", marginTop: 4,
  },
  rankHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  resetBtn: {
    flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing.lg,
    backgroundColor: colors.primaryMuted, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.sm,
  },
  resetBtnText: { color: colors.primaryGlow, fontSize: 11, fontWeight: "800" },
  weightRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1,
    borderRadius: radius.sm, padding: spacing.sm, marginTop: 4,
  },
  weightLabel: { color: colors.textPrimary, fontSize: 11, fontWeight: "700", flex: 1 },
  weightPickerRow: { flexDirection: "row", gap: 4, alignItems: "center" },
  wDot: {
    width: 14, height: 14, borderRadius: 7, backgroundColor: colors.surfaceElevated,
    borderWidth: 1, borderColor: colors.borderSubtle,
  },
  weightValue: {
    color: colors.textPrimary, fontSize: 12, fontWeight: "800", marginLeft: 6, minWidth: 20,
  },
  scoreDot: {
    paddingHorizontal: 8, paddingVertical: 6, borderRadius: 12,
    borderWidth: 1, borderColor: colors.borderSubtle, backgroundColor: colors.surfaceElevated,
  },
  scoreDotText: { color: colors.textSecondary, fontSize: 11, fontWeight: "700" },
  stickyBar: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    padding: 10, backgroundColor: colors.surface,
    borderTopWidth: 1, borderTopColor: colors.borderSubtle,
  },
  applyBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: colors.primary, borderRadius: radius.sm, paddingVertical: 13,
  },
  applyBtnText: { color: "#fff", fontSize: 13, fontWeight: "800", letterSpacing: 0.3 },
});
