// PLOS Career — Filter Center. 7 sections — target roles, sectors, locations,
// salary, experience, ranking weights, alerts.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Alert, TextInput, Modal, Pressable, Switch, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  ChevronLeft, Save, Wand2, Plus, X, Star, RefreshCw, Search,
  ChevronDown, ChevronUp, Globe, MapPin, Building2, Hash,
  ShieldCheck, SlidersHorizontal, Trash2, Edit3,
} from "lucide-react-native";
import { careerPrefsApi, FilterProfile, LocationEntry } from "@/src/lib/api";
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
  const [newExcludeTag, setNewExcludeTag] = useState("");
  const [newSectorName, setNewSectorName] = useState("");

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

  const promptText = (title: string, initial: string, onDone: (v: string) => void) => {
    if (Platform.OS === "ios" && (Alert as any).prompt) {
      (Alert as any).prompt(title, undefined, (v: string) => { if (v && v.trim()) onDone(v.trim()); }, "plain-text", initial);
    } else if (Platform.OS === "web") {
      const v = typeof window !== "undefined" ? window.prompt(title, initial) : null;
      if (v && v.trim()) onDone(v.trim());
    } else {
      onDone(initial + " (renamed)");
    }
  };

  const onProfileRename = (p: FilterProfile) => {
    promptText("New name", p.profile_name, async (newName) => {
      try {
        await careerPrefsApi.updateProfile(p.profile_id, { profile_name: newName });
        await load();
      } catch (e: any) { Alert.alert("Rename failed", String(e?.message || e)); }
    });
  };

  const onProfileDelete = (p: FilterProfile) => {
    if (profiles.length <= 1) {
      Alert.alert("Cannot delete", "At least one track must remain.");
      return;
    }
    Alert.alert(
      `Delete "${p.profile_name}"?`,
      "This track's filters and criteria will be removed. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete", style: "destructive",
          onPress: async () => {
            try {
              await careerPrefsApi.deleteProfile(p.profile_id);
              if (p.profile_id === active?.profile_id) {
                const remaining = profiles.filter((x) => x.profile_id !== p.profile_id);
                if (remaining[0]) await careerPrefsApi.applyProfile(remaining[0].profile_id);
              }
              await load();
            } catch (e: any) { Alert.alert("Delete failed", String(e?.message || e)); }
          },
        },
      ],
    );
  };

  const onProfileLongPress = (p: FilterProfile) => {
    Alert.alert(p.profile_name, "What would you like to do with this track?", [
      { text: "Cancel", style: "cancel" },
      { text: "Rename", onPress: () => onProfileRename(p) },
      { text: "Delete", style: "destructive", onPress: () => onProfileDelete(p) },
    ]);
  };

  const onAddProfile = () => {
    promptText("Name for the new track", "New Track", async (name) => {
      try {
        const cloned: any = { ...(active || {}), profile_name: name };
        delete cloned.profile_id;
        delete cloned._id;
        cloned.is_active = false;
        const created = await careerPrefsApi.createProfile(cloned);
        await careerPrefsApi.applyProfile(created.profile_id);
        await load();
      } catch (e: any) { Alert.alert("Create failed", String(e?.message || e)); }
    });
  };

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
        <Text style={styles.headerTitle}>Jobs Center</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Jobs Center tab pill */}
      <View style={styles.centerTabs}>
        <TouchableOpacity
          style={styles.centerTab}
          onPress={() => router.push("/career/jobs" as any)}
          testID="tab-verified"
        >
          <ShieldCheck size={12} color={colors.primaryGlow} />
          <Text style={styles.centerTabText}>Verified Jobs</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.centerTab, styles.centerTabActive]} testID="tab-filters">
          <SlidersHorizontal size={12} color="#fff" />
          <Text style={styles.centerTabTextActive}>Filter & Criteria</Text>
        </TouchableOpacity>
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
              onLongPress={() => onProfileLongPress(p)}
              testID={`profile-${p.profile_id}`}
            >
              {p.is_active && <Star size={10} color="#fff" fill="#fff" />}
              <Text style={[styles.profileChipText, p.is_active && { color: "#fff" }]}>{p.profile_name}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[styles.profileChip, { borderStyle: "dashed" }]}
            onPress={onAddProfile}
            testID="profile-add"
          >
            <Plus size={11} color={colors.primaryGlow} />
            <Text style={styles.profileChipText}>New Track</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Track manage bar — always-visible Rename / Delete for the selected track */}
        <View style={styles.manageBar} testID="track-manage-bar">
          <View style={styles.manageLabelWrap}>
            <Text style={styles.manageLabel} numberOfLines={1}>
              Editing: <Text style={styles.manageLabelStrong}>{active.profile_name}</Text>
            </Text>
          </View>
          <TouchableOpacity
            style={styles.manageBtn}
            onPress={() => onProfileRename(active)}
            testID="track-rename-btn"
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Edit3 size={12} color={colors.primaryGlow} />
            <Text style={styles.manageBtnText}>Rename</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.manageBtn, styles.manageBtnDanger,
                    profiles.length <= 1 && { opacity: 0.4 }]}
            onPress={() => onProfileDelete(active)}
            disabled={profiles.length <= 1}
            testID="track-delete-btn"
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Trash2 size={12} color="#EF4444" />
            <Text style={styles.manageBtnTextDanger}>Delete</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.hint}>
          Tap a chip to switch tracks · Rename or Delete the current track above · long-press also works on mobile.
        </Text>

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
          <View style={styles.addTagRow}>
            <TextInput
              style={styles.tagInput}
              placeholder="Add keyword to exclude…"
              placeholderTextColor={colors.textTertiary}
              value={newExcludeTag}
              onChangeText={setNewExcludeTag}
              onSubmitEditing={() => {
                if (newExcludeTag.trim()) {
                  update("excluded_keywords", [...active.excluded_keywords, newExcludeTag.trim()]);
                  setNewExcludeTag("");
                }
              }}
              testID="add-exclude-input"
            />
            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: "#EF4444" }]}
              onPress={() => {
                if (newExcludeTag.trim()) {
                  update("excluded_keywords", [...active.excluded_keywords, newExcludeTag.trim()]);
                  setNewExcludeTag("");
                }
              }}
            >
              <Plus size={14} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ===== Section 2: Sectors ===== */}
        <Text style={styles.section}>2. Industries & Employer Types</Text>
        <Text style={styles.hint}>Toggle on/off, set priority, or tap the trash to delete. Add custom sectors below.</Text>
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
            <TouchableOpacity
              onPress={() => update("sectors", active.sectors.filter((_, j) => j !== i))}
              hitSlop={8}
              testID={`sector-delete-${s.id}`}
              style={{ padding: 4 }}
            >
              <Trash2 size={14} color={colors.danger} />
            </TouchableOpacity>
          </View>
        ))}
        <View style={styles.addTagRow}>
          <TextInput
            style={styles.tagInput}
            placeholder="Add industry / employer type…"
            placeholderTextColor={colors.textTertiary}
            value={newSectorName}
            onChangeText={setNewSectorName}
            onSubmitEditing={() => {
              const nm = newSectorName.trim();
              if (nm) {
                const nid = `sector_${Date.now()}`;
                update("sectors", [...active.sectors, { id: nid, name: nm, enabled: true, priority: "medium" }]);
                setNewSectorName("");
              }
            }}
            testID="add-sector-input"
          />
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => {
              const nm = newSectorName.trim();
              if (nm) {
                const nid = `sector_${Date.now()}`;
                update("sectors", [...active.sectors, { id: nid, name: nm, enabled: true, priority: "medium" }]);
                setNewSectorName("");
              }
            }}
          >
            <Plus size={14} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* ===== Section 3: Locations ===== */}
        <Text style={styles.section}>3. Where You Want to Work</Text>
        <Text style={styles.hint}>
          Search any country, state, city, or ZIP. Add via search or the country panel below.
        </Text>
        <LocationSearchBar
          existingIds={active.locations.map((l) => l.id)}
          onAdd={(entry) => update("locations", [...active.locations, entry])}
        />
        {active.locations.map((loc, i) => (
          <LocationRow
            key={loc.id || i}
            loc={loc}
            onChange={(next) => {
              const arr = [...active.locations];
              arr[i] = next;
              update("locations", arr);
            }}
            onDelete={() => {
              if (loc.can_delete === false) {
                Alert.alert("Cannot delete", "This special entry can be toggled off but not deleted.");
                return;
              }
              update("locations", active.locations.filter((_, j) => j !== i));
            }}
          />
        ))}
        <CountryQuickAdd
          existingCountryCodes={active.locations
            .filter((l) => l.type === "country")
            .map((l) => l.country_code)}
          onAddCountry={(code, name, regionLabel) => {
            const exists = active.locations.some((l) => l.type === "country" && l.country_code === code);
            if (exists) return;
            const newEntry: LocationEntry = {
              id: `loc_c_${code}_${Date.now()}`,
              label: name,
              type: "country",
              priority: "low",
              work_type_override: "any",
              radius_miles: 0,
              country_code: code,
              admin1: "",
              city: "",
              zip: "",
              lat: 0,
              lng: 0,
              is_special: false,
              special_kind: null,
              enabled: true,
              can_delete: true,
            };
            update("locations", [...active.locations, newEntry]);
          }}
          onAddRegion={(regionKey, countries) => {
            const existing = new Set(active.locations
              .filter((l) => l.type === "country")
              .map((l) => l.country_code));
            const newEntries: LocationEntry[] = countries
              .filter((c) => !existing.has(c.code))
              .map((c) => ({
                id: `loc_c_${c.code}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                label: c.name,
                type: "country",
                priority: "low",
                work_type_override: "any",
                radius_miles: 0,
                country_code: c.code,
                admin1: "",
                city: "",
                zip: "",
                lat: 0,
                lng: 0,
                is_special: false,
                special_kind: null,
                enabled: true,
                can_delete: true,
              }));
            if (newEntries.length === 0) return;
            update("locations", [...active.locations, ...newEntries]);
          }}
        />
        <Text style={styles.subHead}>Work types (global default)</Text>
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

        {/* ===== Section 6: Alerts ===== */}
        <Text style={styles.section}>6. Alerts</Text>
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
  centerTabs: { flexDirection: "row", paddingHorizontal: spacing.lg, paddingVertical: 8, gap: 8 },
  centerTab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 9, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderSubtle },
  centerTabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  centerTabText: { color: colors.primaryGlow, fontSize: 12, fontWeight: "700" },
  centerTabTextActive: { color: "#fff", fontSize: 12, fontWeight: "700" },
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
  manageBar: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginTop: 6,
    backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1,
    borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 6,
  },
  manageLabelWrap: { flex: 1, minWidth: 0 },
  manageLabel: { color: colors.textTertiary, fontSize: 10, fontWeight: "700" },
  manageLabelStrong: { color: colors.textPrimary, fontSize: 11, fontWeight: "800" },
  manageBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12,
    backgroundColor: colors.primaryMuted,
  },
  manageBtnDanger: { backgroundColor: "rgba(239,68,68,0.14)" },
  manageBtnText: { color: colors.primaryGlow, fontSize: 10, fontWeight: "800" },
  manageBtnTextDanger: { color: "#EF4444", fontSize: 10, fontWeight: "800" },
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

// ================================================================
// Location Search Bar — global fuzzy search with dropdown
// ================================================================
const TYPE_COLORS: Record<string, { bg: string; fg: string }> = {
  country: { bg: "rgba(59,130,246,0.20)", fg: "#3B82F6" },
  state: { bg: "rgba(16,185,129,0.20)", fg: "#10B981" },
  city: { bg: "rgba(245,158,11,0.20)", fg: "#F59E0B" },
  zip: { bg: "rgba(168,85,247,0.20)", fg: "#A855F7" },
  region: { bg: "rgba(236,72,153,0.20)", fg: "#EC4899" },
  special: { bg: "rgba(6,182,212,0.20)", fg: "#06B6D4" },
};

function TypeBadge({ type }: { type: string }) {
  const c = TYPE_COLORS[type] || TYPE_COLORS.city;
  return (
    <View style={[locStyles.typeBadge, { backgroundColor: c.bg }]}>
      <Text style={[locStyles.typeBadgeText, { color: c.fg }]}>{type.toUpperCase()}</Text>
    </View>
  );
}

function LocationSearchBar({ existingIds, onAdd }: {
  existingIds: string[];
  onAdd: (entry: LocationEntry) => void;
}) {
  const [q, setQ] = useState("");
  const [preds, setPreds] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!q.trim() || q.trim().length < 2) { setPreds([]); return; }
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await careerPrefsApi.autocomplete(q.trim());
        setPreds(res.predictions || []);
      } catch (e: any) {
        console.warn("autocomplete err", e);
      } finally { setLoading(false); }
    }, 350);
    return () => timerRef.current && clearTimeout(timerRef.current);
  }, [q]);

  async function pick(pred: any) {
    // Prefer inline structured data (local source); fallback to /place-details.
    let details = pred;
    if (!pred.lat && !pred.city && !pred.country_code && pred.source !== "local") {
      try {
        details = await careerPrefsApi.placeDetails(pred.place_id);
      } catch (e) { /* keep pred */ }
    }
    const isZip = pred.entry_type === "zip";
    const isCity = pred.entry_type === "city";
    const cityLabel = isZip
      ? `${pred.main_text}${details.city ? " — " + details.city : ""}, ${details.admin1 || "US"}`
      : pred.text || pred.main_text;
    const entry: LocationEntry = {
      id: `loc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      label: cityLabel,
      type: pred.entry_type as any,
      priority: "medium",
      work_type_override: "any",
      radius_miles: isCity ? 25 : (isZip ? 15 : 0),
      country_code: details.country_code || pred.country_code || "",
      admin1: details.admin1 || pred.admin1 || "",
      city: details.city || pred.city || "",
      zip: details.zip || pred.zip || (isZip ? pred.main_text.replace(/^ZIP\s*/, "") : ""),
      lat: details.lat || pred.lat || 0,
      lng: details.lng || pred.lng || 0,
      is_special: false, special_kind: null,
      enabled: true, can_delete: true,
    };
    onAdd(entry);
    setQ(""); setPreds([]);
  }

  return (
    <View style={locStyles.searchWrap}>
      <View style={locStyles.searchRow}>
        <Search size={14} color={colors.textTertiary} />
        <TextInput
          style={locStyles.searchInput}
          placeholder="Search any country, state, city, or ZIP"
          placeholderTextColor={colors.textTertiary}
          value={q}
          onChangeText={setQ}
          autoCorrect={false}
          autoCapitalize="words"
          testID="loc-search-input"
        />
        {loading && <ActivityIndicator size="small" color={colors.primaryGlow} />}
        {!!q && !loading && (
          <TouchableOpacity onPress={() => { setQ(""); setPreds([]); }}>
            <X size={14} color={colors.textTertiary} />
          </TouchableOpacity>
        )}
      </View>
      {preds.length > 0 && (
        <View style={locStyles.dropdown}>
          {preds.map((p) => (
            <TouchableOpacity
              key={p.place_id}
              style={locStyles.dropdownRow}
              onPress={() => pick(p)}
              testID={`loc-pred-${p.entry_type}-${p.main_text}`}
            >
              <TypeBadge type={p.entry_type} />
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={locStyles.dropMain} numberOfLines={1}>{p.main_text}</Text>
                {!!p.secondary_text && (
                  <Text style={locStyles.dropSec} numberOfLines={1}>{p.secondary_text}</Text>
                )}
              </View>
              <Plus size={14} color={colors.primaryGlow} />
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

// ================================================================
// Location Row — priority, work_type, radius, delete, toggle
// ================================================================
const WORK_TYPE_OPTS: { key: string; label: string }[] = [
  { key: "any", label: "Any" },
  { key: "on_site", label: "On-site" },
  { key: "hybrid", label: "Hybrid" },
  { key: "remote", label: "Remote" },
  { key: "on_site_hybrid", label: "On-site + Hybrid" },
  { key: "hybrid_remote", label: "Hybrid + Remote" },
];

function LocationRow({ loc, onChange, onDelete }: {
  loc: LocationEntry;
  onChange: (next: LocationEntry) => void;
  onDelete: () => void;
}) {
  const showRadius = loc.type === "city" || loc.type === "zip";
  const iconFor = () => {
    if (loc.is_special) return <Star size={12} color={TYPE_COLORS.special.fg} />;
    if (loc.type === "country") return <Globe size={12} color={TYPE_COLORS.country.fg} />;
    if (loc.type === "state") return <MapPin size={12} color={TYPE_COLORS.state.fg} />;
    if (loc.type === "city") return <Building2 size={12} color={TYPE_COLORS.city.fg} />;
    if (loc.type === "zip") return <Hash size={12} color={TYPE_COLORS.zip.fg} />;
    return <MapPin size={12} color={TYPE_COLORS.region.fg} />;
  };
  return (
    <View style={[locStyles.locCard, !loc.enabled && { opacity: 0.5 }]} testID={`loc-${loc.id}`}>
      <View style={locStyles.locHead}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
          {iconFor()}
          <TypeBadge type={loc.type} />
          <Text style={locStyles.locLabelNew} numberOfLines={2}>{loc.label}</Text>
        </View>
        {loc.is_special ? (
          <Switch
            value={loc.enabled}
            onValueChange={(v) => onChange({ ...loc, enabled: v })}
            trackColor={{ true: colors.primary, false: colors.surfaceElevated }}
          />
        ) : (
          <TouchableOpacity onPress={onDelete} testID={`loc-del-${loc.id}`}>
            <X size={16} color="#EF4444" />
          </TouchableOpacity>
        )}
      </View>
      {/* Priority */}
      <View style={locStyles.pillRow}>
        {(["high", "medium", "low"] as const).map((p) => {
          const on = loc.priority === p;
          const bg = p === "high" ? "#EF4444" : p === "medium" ? "#F59E0B" : "#6B7280";
          return (
            <TouchableOpacity
              key={p}
              style={[locStyles.prioPill, on && { backgroundColor: bg, borderColor: bg }]}
              onPress={() => onChange({ ...loc, priority: p })}
              testID={`loc-prio-${loc.id}-${p}`}
            >
              <Text style={[locStyles.prioPillText, on && { color: "#fff" }]}>{p.toUpperCase()}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {/* Work type override */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
        {WORK_TYPE_OPTS.map((wt) => {
          const on = loc.work_type_override === wt.key;
          return (
            <TouchableOpacity
              key={wt.key}
              style={[locStyles.wtChip2, on && locStyles.wtChip2On]}
              onPress={() => onChange({ ...loc, work_type_override: wt.key as any })}
            >
              <Text style={[locStyles.wtChip2Text, on && { color: "#fff" }]}>{wt.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      {/* Radius (city/zip only) */}
      {showRadius && (
        <View style={locStyles.radiusRow}>
          <Text style={locStyles.radiusLbl}>Within</Text>
          {[5, 10, 15, 25, 40, 75, 100].map((r) => {
            const on = loc.radius_miles === r;
            return (
              <TouchableOpacity
                key={r}
                style={[locStyles.radChip, on && locStyles.radChipOn]}
                onPress={() => onChange({ ...loc, radius_miles: r })}
              >
                <Text style={[locStyles.radChipText, on && { color: "#fff" }]}>{r}mi</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ================================================================
// Country Quick-Add Panel — 13 regional groups, expand/collapse, bulk add
// ================================================================
function CountryQuickAdd({ existingCountryCodes, onAddCountry, onAddRegion }: {
  existingCountryCodes: string[];
  onAddCountry: (code: string, name: string, regionLabel: string) => void;
  onAddRegion: (regionKey: string, countries: { code: string; name: string }[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [data, setData] = useState<{
    regions: string[];
    region_labels: Record<string, string>;
    groups: Record<string, { code: string; name: string; region: string }[]>;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || data) return;
    (async () => {
      setLoading(true);
      try {
        const res = await careerPrefsApi.countries();
        setData({
          regions: res.regions,
          region_labels: res.region_labels,
          groups: res.groups,
        });
      } catch (e: any) {
        Alert.alert("Failed", String(e?.message || e));
      } finally { setLoading(false); }
    })();
  }, [open, data]);

  const existingSet = useMemo(() => new Set(existingCountryCodes), [existingCountryCodes]);

  return (
    <View style={locStyles.qaCard}>
      <TouchableOpacity style={locStyles.qaHead} onPress={() => setOpen((v) => !v)} testID="country-quick-add-toggle">
        <Globe size={14} color={colors.primaryGlow} />
        <Text style={locStyles.qaHeadText}>Add Countries Quickly</Text>
        {open ? <ChevronUp size={14} color={colors.primaryGlow} /> : <ChevronDown size={14} color={colors.primaryGlow} />}
      </TouchableOpacity>
      {open && (
        <View style={{ marginTop: 6, gap: 6 }}>
          {loading && <ActivityIndicator size="small" color={colors.primaryGlow} />}
          {data?.regions.map((rk) => {
            const items = data.groups[rk] || [];
            const isExp = !!expanded[rk];
            return (
              <View key={rk} style={locStyles.regionBlock}>
                <View style={locStyles.regionHead}>
                  <TouchableOpacity
                    style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}
                    onPress={() => setExpanded({ ...expanded, [rk]: !isExp })}
                  >
                    {isExp ? <ChevronUp size={12} color={colors.primaryGlow} /> : <ChevronDown size={12} color={colors.primaryGlow} />}
                    <Text style={locStyles.regionText}>{data.region_labels[rk] || rk}</Text>
                    <Text style={locStyles.regionCount}>{items.length}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={locStyles.regionBulkBtn}
                    onPress={() => onAddRegion(rk, items)}
                    testID={`add-region-${rk}`}
                  >
                    <Plus size={10} color="#fff" />
                    <Text style={locStyles.regionBulkText}>Add All</Text>
                  </TouchableOpacity>
                </View>
                {isExp && (
                  <View style={locStyles.chipWrap}>
                    {items.map((c) => {
                      const on = existingSet.has(c.code);
                      return (
                        <TouchableOpacity
                          key={c.code}
                          style={[locStyles.cChip, on && locStyles.cChipOn]}
                          onPress={() => !on && onAddCountry(c.code, c.name, data.region_labels[rk] || rk)}
                          disabled={on}
                          testID={`add-country-${c.code}`}
                        >
                          <Text style={[locStyles.cChipText, on && { color: colors.primaryGlow }]}>
                            {on ? "✓ " : ""}{c.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const locStyles = StyleSheet.create({
  searchWrap: { marginTop: 6 },
  searchRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: colors.surfaceElevated, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.borderSubtle,
    paddingHorizontal: 10, paddingVertical: 8,
  },
  searchInput: { flex: 1, color: colors.textPrimary, fontSize: 13, paddingVertical: 2 },
  dropdown: {
    backgroundColor: colors.surface, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.borderSubtle,
    marginTop: 4, overflow: "hidden",
  },
  dropdownRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 10, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: colors.borderSubtle,
  },
  dropMain: { color: colors.textPrimary, fontSize: 12, fontWeight: "700" },
  dropSec: { color: colors.textTertiary, fontSize: 10, marginTop: 1 },
  typeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  typeBadgeText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.4 },
  locCard: {
    backgroundColor: colors.surface, borderColor: colors.borderSubtle,
    borderWidth: 1, borderRadius: radius.sm, padding: 10, gap: 6, marginTop: 6,
  },
  locHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  locLabelNew: { color: colors.textPrimary, fontSize: 12, fontWeight: "700", flexShrink: 1 },
  pillRow: { flexDirection: "row", gap: 4 },
  prioPill: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
    borderWidth: 1, borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceElevated,
  },
  prioPillText: { color: colors.textSecondary, fontSize: 10, fontWeight: "800", letterSpacing: 0.4 },
  wtChip2: {
    paddingHorizontal: 8, paddingVertical: 5, borderRadius: 12,
    borderWidth: 1, borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceElevated,
  },
  wtChip2On: { backgroundColor: colors.primary, borderColor: colors.primary },
  wtChip2Text: { color: colors.textSecondary, fontSize: 10, fontWeight: "700" },
  radiusRow: { flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "wrap" },
  radiusLbl: { color: colors.textTertiary, fontSize: 10, fontWeight: "700" },
  radChip: {
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10,
    borderWidth: 1, borderColor: colors.borderSubtle, backgroundColor: colors.surfaceElevated,
  },
  radChipOn: { backgroundColor: colors.primaryGlow, borderColor: colors.primaryGlow },
  radChipText: { color: colors.textSecondary, fontSize: 10, fontWeight: "700" },
  qaCard: {
    marginTop: 10, backgroundColor: colors.primaryMuted,
    borderRadius: radius.sm, padding: 10,
  },
  qaHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  qaHeadText: { color: colors.primaryGlow, fontSize: 12, fontWeight: "800", flex: 1 },
  regionBlock: {
    backgroundColor: colors.surface, borderRadius: radius.sm,
    padding: 8, borderWidth: 1, borderColor: colors.borderSubtle,
  },
  regionHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  regionText: { color: colors.textPrimary, fontSize: 11, fontWeight: "700" },
  regionCount: {
    color: colors.textTertiary, fontSize: 9, fontWeight: "700",
    backgroundColor: colors.surfaceElevated, paddingHorizontal: 5, borderRadius: 8,
  },
  regionBulkBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10,
  },
  regionBulkText: { color: "#fff", fontSize: 9, fontWeight: "800" },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 6 },
  cChip: {
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1, borderColor: colors.borderSubtle,
  },
  cChipOn: { backgroundColor: colors.primaryMuted, borderColor: colors.primaryGlow },
  cChipText: { color: colors.textSecondary, fontSize: 10, fontWeight: "700" },
});

