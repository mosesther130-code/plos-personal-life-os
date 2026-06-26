// Passport + Digital Documents screen.
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  ShieldCheck,
  ShieldAlert,
  ExternalLink,
  Save,
} from "lucide-react-native";
import { travelApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";

const statusBg = {
  ok: { bg: "rgba(16,185,129,0.15)", border: colors.success, fg: colors.success },
  warning: { bg: "rgba(245,158,11,0.15)", border: colors.warning, fg: colors.warning },
  danger: { bg: "rgba(239,68,68,0.15)", border: colors.danger, fg: colors.danger },
  neutral: { bg: colors.surfaceElevated, border: colors.borderSubtle, fg: colors.textSecondary },
} as any;

export default function PassportScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<any>(null);
  const [form, setForm] = useState<any>({
    passport_number: "",
    issuing_country: "United States",
    issue_date: "",
    expiry_date: "",
    nationality: "United States",
    global_entry_number: "",
    global_entry_expiry: "",
    nexus_number: "",
    other_visa: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await travelApi.passport();
      setForm((f: any) => ({ ...f, ...Object.fromEntries(Object.entries(r?.passport || {}).map(([k, v]) => [k, v ?? ""])) }));
      setStatus(r?.status);
    } catch (_e) {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const setField = (k: string, v: string) => setForm((p: any) => ({ ...p, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const r = await travelApi.updatePassport(form);
      setStatus(r?.status);
      if (Platform.OS !== "web") Alert.alert("Saved", "Passport details updated.");
    } catch (_e) {
      Alert.alert("Save failed", "Could not save passport details.");
    }
    setSaving(false);
  };

  const renew = () => Linking.openURL("https://travel.state.gov/content/travel/en/passports/have-passport/renew.html").catch(() => {});

  if (loading) {
    return <SafeAreaView style={styles.container} edges={["top"]}><ActivityIndicator color={colors.primaryGlow} style={{ marginTop: 60 }} /></SafeAreaView>;
  }

  const colorKey: keyof typeof statusBg = status?.color === "success" ? "ok" : status?.color === "warning" ? "warning" : status?.color === "danger" ? "danger" : "neutral";
  const sb = statusBg[colorKey];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} testID="passport-back">
          <ArrowLeft color={colors.textPrimary} size={20} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Passport & Documents</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Status banner */}
        {status && (
          <View style={[styles.statusBanner, { backgroundColor: sb.bg, borderColor: sb.border }]} testID="passport-status">
            <View style={[styles.statusIcon, { backgroundColor: sb.border + "33" }]}>
              {colorKey === "ok" ? <ShieldCheck size={20} color={sb.fg} /> : <ShieldAlert size={20} color={sb.fg} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.statusText, { color: sb.fg }]}>{status.label}</Text>
              {typeof status.months === "number" && status.months >= 0 ? (
                <Text style={styles.statusSub}>{status.months} months until expiry</Text>
              ) : null}
            </View>
            {(colorKey === "danger" || colorKey === "warning") && (
              <TouchableOpacity style={styles.renewBtn} onPress={renew} testID="passport-renew">
                <Text style={styles.renewBtnText}>Renew</Text>
                <ExternalLink size={11} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        )}

        <Text style={styles.section}>PASSPORT</Text>

        <Text style={styles.fieldLabel}>Passport Number</Text>
        <TextInput style={styles.input} value={form.passport_number} onChangeText={(v) => setField("passport_number", v)} placeholder="Optional — stored locally" placeholderTextColor={colors.textTertiary} testID="passport-number" />

        <Text style={styles.fieldLabel}>Issuing Country</Text>
        <TextInput style={styles.input} value={form.issuing_country} onChangeText={(v) => setField("issuing_country", v)} testID="issuing-country" />

        <Text style={styles.fieldLabel}>Issue Date (YYYY-MM-DD)</Text>
        <TextInput style={styles.input} value={form.issue_date} onChangeText={(v) => setField("issue_date", v)} placeholder="2018-05-23" placeholderTextColor={colors.textTertiary} testID="issue-date" />

        <Text style={styles.fieldLabel}>Expiry Date (YYYY-MM-DD)</Text>
        <TextInput style={styles.input} value={form.expiry_date} onChangeText={(v) => setField("expiry_date", v)} placeholder="Enter your passport expiry date" placeholderTextColor={colors.textTertiary} testID="expiry-date" />

        <Text style={styles.fieldLabel}>Nationality</Text>
        <TextInput style={styles.input} value={form.nationality} onChangeText={(v) => setField("nationality", v)} testID="nationality" />

        <Text style={styles.section}>DIGITAL DOCUMENTS</Text>
        <Text style={styles.sectionHint}>Optional storage for travel programs and other documents.</Text>

        <Text style={styles.fieldLabel}>Global Entry / TSA PreCheck #</Text>
        <TextInput style={styles.input} value={form.global_entry_number} onChangeText={(v) => setField("global_entry_number", v)} placeholder="9-digit Known Traveler #" placeholderTextColor={colors.textTertiary} testID="ge-number" />

        <Text style={styles.fieldLabel}>Global Entry Expiry</Text>
        <TextInput style={styles.input} value={form.global_entry_expiry} onChangeText={(v) => setField("global_entry_expiry", v)} placeholder="2028-12-31" placeholderTextColor={colors.textTertiary} testID="ge-expiry" />

        <Text style={styles.fieldLabel}>NEXUS Card #</Text>
        <TextInput style={styles.input} value={form.nexus_number} onChangeText={(v) => setField("nexus_number", v)} placeholder="If applicable" placeholderTextColor={colors.textTertiary} testID="nexus-number" />

        <Text style={styles.fieldLabel}>Other Visa (country, type, expiry)</Text>
        <TextInput style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]} value={form.other_visa} onChangeText={(v) => setField("other_visa", v)} multiline placeholder="e.g. Japan multi-entry, expires 2027-06-30" placeholderTextColor={colors.textTertiary} testID="other-visa" />

        <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving} testID="passport-save">
          {saving ? <ActivityIndicator color="#fff" /> : <><Save color="#fff" size={14} /><Text style={styles.saveBtnText}>Save</Text></>}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  iconBtn: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.surfaceElevated, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  scroll: { padding: spacing.xl, gap: spacing.sm },
  statusBanner: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, marginBottom: spacing.md },
  statusIcon: { width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  statusText: { fontSize: 13, fontWeight: "700", lineHeight: 19 },
  statusSub: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  renewBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.primary, paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.md },
  renewBtnText: { color: "#fff", fontWeight: "700", fontSize: 11 },
  section: { color: colors.textTertiary, fontSize: 10, fontWeight: "700", letterSpacing: 1.2, marginTop: spacing.lg },
  sectionHint: { color: colors.textTertiary, fontSize: 11 },
  fieldLabel: { color: colors.textTertiary, fontSize: 11, fontWeight: "700", letterSpacing: 1, marginTop: spacing.md },
  input: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, color: colors.textPrimary, fontSize: 15, borderWidth: 1, borderColor: colors.borderSubtle, marginTop: 6 },
  saveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.primary, paddingVertical: 14, borderRadius: radius.lg, marginTop: spacing.xl },
  saveBtnText: { color: "#fff", fontWeight: "700" },
});
