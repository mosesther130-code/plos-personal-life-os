// Health & Wellbeing hub
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  RefreshControl, TextInput, Linking, Alert, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import Svg, { Polyline, Line as SvgLine, Circle as SvgCircle } from "react-native-svg";
import {
  ArrowLeft, Activity, Heart, ShieldCheck, ShieldAlert, Pill, Calendar,
  Sparkles, Plus, ExternalLink, Pencil, Trash2, RefreshCw, AlertTriangle,
} from "lucide-react-native";
import { healthApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";
import { EditModal, type Field } from "@/src/components/EditModal";

const fmtUSD = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

function notify(title: string, message?: string) {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.alert(message ? `${title}\n\n${message}` : title);
  } else Alert.alert(title, message);
}

function Slider10({ value, onChange, color }: { value: number; onChange: (n: number) => void; color: string }) {
  return (
    <View style={styles.sliderRow}>
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
        <TouchableOpacity
          key={n}
          style={[
            styles.sliderDot,
            { borderColor: color, backgroundColor: n <= value ? color : "transparent" },
          ]}
          onPress={() => onChange(n)}
          testID={`slider-${n}`}
        >
          <Text style={[styles.sliderDotText, { color: n <= value ? "#fff" : color }]}>{n}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const INSURANCE_FIELDS: Field[] = [
  { key: "coverage_type", label: "Coverage Type", kind: "text", placeholder: "Medicaid / Marketplace / Employer" },
  { key: "plan_name", label: "Plan Name", kind: "text" },
  { key: "provider", label: "Provider", kind: "text" },
  { key: "policy_number", label: "Policy Number", kind: "text", placeholder: "Optional" },
  { key: "renewal_date", label: "Renewal / Review Date (YYYY-MM-DD)", kind: "text", placeholder: "2026-12-31" },
  { key: "household_size", label: "Household Size", kind: "number", suffix: "ppl" },
  { key: "monthly_income_usd", label: "Monthly Income (USD)", kind: "number", suffix: "USD" },
  { key: "monthly_premium_usd", label: "Monthly Premium", kind: "number", suffix: "USD" },
  { key: "deductible_usd", label: "Deductible", kind: "number", suffix: "USD" },
  { key: "notes", label: "Notes", kind: "textarea", maxLength: 300 },
];

const MED_FIELDS: Field[] = [
  { key: "name", label: "Medication Name", kind: "text", placeholder: "e.g. Lisinopril" },
  { key: "dosage", label: "Dosage", kind: "text", placeholder: "10 mg" },
  { key: "schedule_time", label: "Schedule / Reminder Time", kind: "text", placeholder: "08:00 AM daily" },
  { key: "notes", label: "Notes", kind: "textarea", maxLength: 200 },
];

const APPT_FIELDS: Field[] = [
  { key: "title", label: "Title", kind: "text", placeholder: "Annual physical" },
  { key: "datetime", label: "Date & Time (YYYY-MM-DDTHH:MM)", kind: "text", placeholder: "2026-11-15T09:30" },
  { key: "location", label: "Location", kind: "text", placeholder: "Emory Decatur" },
  { key: "notes", label: "Notes", kind: "textarea", maxLength: 200 },
];

export default function HealthHub() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [insurance, setInsurance] = useState<any>(null);
  const [eligibility, setEligibility] = useState<any>(null);
  const [daysUntilRenewal, setDaysUntilRenewal] = useState<number | null>(null);
  const [resources, setResources] = useState<any>(null);
  const [wellness, setWellness] = useState<any[]>([]);
  const [energy, setEnergy] = useState(7);
  const [sleep, setSleep] = useState(7);
  const [stress, setStress] = useState(5);
  const [mood, setMood] = useState(7);
  const [wnotes, setWnotes] = useState("");
  const [logging, setLogging] = useState(false);
  const [meds, setMeds] = useState<any[]>([]);
  const [appts, setAppts] = useState<any[]>([]);
  const [insights, setInsights] = useState<string | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insEditOpen, setInsEditOpen] = useState(false);
  const [medEditOpen, setMedEditOpen] = useState(false);
  const [medEditing, setMedEditing] = useState<string | null>(null);
  const [medInitial, setMedInitial] = useState<any | null>(null);
  const [apptEditOpen, setApptEditOpen] = useState(false);
  const [apptEditing, setApptEditing] = useState<string | null>(null);
  const [apptInitial, setApptInitial] = useState<any | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ins, res, well, m, a] = await Promise.all([
        healthApi.insurance(),
        healthApi.resources(),
        healthApi.wellness(7),
        healthApi.medications(),
        healthApi.appointments(),
      ]);
      setInsurance(ins?.insurance);
      setEligibility(ins?.eligibility);
      setDaysUntilRenewal(ins?.days_until_renewal);
      setResources(res);
      setWellness(well?.checkins || []);
      setMeds(m?.medications || []);
      setAppts(a?.appointments || []);
    } catch (_e) {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const logWellness = async () => {
    setLogging(true);
    try {
      await healthApi.logWellness({ energy, sleep, stress, mood, notes: wnotes });
      setWnotes("");
      await load();
    } catch (_e) {
      notify("Save failed", "Could not log check-in.");
    }
    setLogging(false);
  };

  const fetchInsights = async () => {
    setInsightsLoading(true);
    try {
      const r = await healthApi.insights();
      setInsights(r?.insights || "No insights returned.");
    } catch (_e) {
      setInsights("Could not generate insights. Try again later.");
    }
    setInsightsLoading(false);
  };

  const eligColor = eligibility?.color === "danger" ? colors.danger : eligibility?.color === "warning" ? colors.warning : eligibility?.color === "success" ? colors.success : colors.textSecondary;

  const chart = useMemo(() => {
    if (wellness.length < 1) return null;
    const W = 320, H = 110, P = 16;
    const series = wellness;
    const xScale = (i: number) => P + (i / Math.max(1, series.length - 1)) * (W - 2 * P);
    const yScale = (v: number) => H - P - ((v - 1) / 9) * (H - 2 * P);
    const pts = (key: string) => series.map((p: any, i: number) => `${xScale(i)},${yScale(p[key] || 0)}`).join(" ");
    return { W, H, P, pts, series, xScale, yScale };
  }, [wellness]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} testID="health-back">
          <ArrowLeft color={colors.textPrimary} size={20} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Health & Wellbeing</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primaryGlow} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primaryGlow} />}>
          {/* Insurance card */}
          <View style={[styles.card, { borderColor: eligColor }]} testID="insurance-card">
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderLeft}>
                {eligibility?.color === "danger" ? <ShieldAlert color={eligColor} size={18} /> : <ShieldCheck color={eligColor} size={18} />}
                <Text style={styles.cardTitle}>{insurance?.coverage_type || "Insurance"}</Text>
              </View>
              <TouchableOpacity style={styles.smallIconBtn} onPress={() => setInsEditOpen(true)} testID="insurance-edit">
                <Pencil size={14} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.providerText}>{insurance?.plan_name}{insurance?.provider ? ` · ${insurance.provider}` : ""}</Text>

            <View style={styles.statsRow}>
              <View style={styles.statCol}>
                <Text style={styles.statLabel}>RENEWAL</Text>
                <Text style={styles.statValue}>{insurance?.renewal_date || "—"}</Text>
                {typeof daysUntilRenewal === "number" ? (
                  <Text style={[styles.statSub, { color: daysUntilRenewal < 30 ? colors.danger : daysUntilRenewal < 90 ? colors.warning : colors.textSecondary }]}>
                    {daysUntilRenewal < 0 ? `${Math.abs(daysUntilRenewal)}d overdue` : `${daysUntilRenewal}d to go`}
                  </Text>
                ) : null}
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statCol}>
                <Text style={styles.statLabel}>INCOME</Text>
                <Text style={styles.statValue}>{fmtUSD(eligibility?.income || 0)}</Text>
                <Text style={styles.statSub}>/ {fmtUSD(eligibility?.threshold || 0)} cap</Text>
              </View>
            </View>

            <View style={[styles.eligBar, { backgroundColor: eligColor + "22", borderColor: eligColor }]}>
              {eligibility?.color === "danger" ? <AlertTriangle size={14} color={eligColor} /> : <ShieldCheck size={14} color={eligColor} />}
              <Text style={[styles.eligText, { color: eligColor }]}>{eligibility?.label}</Text>
            </View>

            {eligibility?.level === "over" && (
              <TouchableOpacity
                style={styles.alternativeBtn}
                onPress={() => Linking.openURL("https://www.healthcare.gov/").catch(() => {})}
                testID="find-alternatives"
              >
                <ExternalLink size={14} color="#fff" />
                <Text style={styles.alternativeText}>Find Coverage Alternatives</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Wellness Check-In */}
          <View style={styles.card} testID="wellness-checkin">
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderLeft}>
                <Activity color={colors.primaryGlow} size={18} />
                <Text style={styles.cardTitle}>Daily Wellness Check-In</Text>
              </View>
            </View>
            <Text style={styles.fieldLabel}>ENERGY {energy}/10</Text>
            <Slider10 value={energy} onChange={setEnergy} color={colors.warning} />
            <Text style={styles.fieldLabel}>SLEEP QUALITY {sleep}/10</Text>
            <Slider10 value={sleep} onChange={setSleep} color={colors.primaryGlow} />
            <Text style={styles.fieldLabel}>STRESS LEVEL {stress}/10</Text>
            <Slider10 value={stress} onChange={setStress} color={colors.danger} />
            <Text style={styles.fieldLabel}>MOOD {mood}/10</Text>
            <Slider10 value={mood} onChange={setMood} color={colors.success} />
            <TextInput
              style={styles.notesInput}
              value={wnotes}
              onChangeText={setWnotes}
              placeholder="Notes (optional)"
              placeholderTextColor={colors.textTertiary}
              multiline
              testID="wellness-notes"
            />
            <TouchableOpacity style={[styles.primaryBtn, logging && { opacity: 0.5 }]} onPress={logWellness} disabled={logging} testID="log-wellness">
              {logging ? <ActivityIndicator color="#fff" /> : <><Plus color="#fff" size={14} /><Text style={styles.primaryBtnText}>Submit Check-In</Text></>}
            </TouchableOpacity>

            {chart && (
              <View style={{ marginTop: spacing.md }}>
                <Text style={styles.miniLabel}>7-DAY TREND</Text>
                <Svg width={chart.W} height={chart.H}>
                  <SvgLine x1={chart.P} y1={chart.H - chart.P} x2={chart.W - chart.P} y2={chart.H - chart.P} stroke={colors.borderSubtle} strokeWidth={1} />
                  <Polyline points={chart.pts("energy")} fill="none" stroke={colors.warning} strokeWidth={2} />
                  <Polyline points={chart.pts("sleep")} fill="none" stroke={colors.primaryGlow} strokeWidth={2} />
                  <Polyline points={chart.pts("stress")} fill="none" stroke={colors.danger} strokeWidth={2} />
                  <Polyline points={chart.pts("mood")} fill="none" stroke={colors.success} strokeWidth={2} />
                  {chart.series.map((p: any, i: number) => (
                    <SvgCircle key={i} cx={chart.xScale(i)} cy={chart.yScale(p.mood)} r={2.5} fill={colors.success} />
                  ))}
                </Svg>
                <View style={styles.legendRow}>
                  <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: colors.warning }]} /><Text style={styles.legendText}>Energy</Text></View>
                  <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: colors.primaryGlow }]} /><Text style={styles.legendText}>Sleep</Text></View>
                  <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: colors.danger }]} /><Text style={styles.legendText}>Stress</Text></View>
                  <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: colors.success }]} /><Text style={styles.legendText}>Mood</Text></View>
                </View>
              </View>
            )}
          </View>

          {/* AI Insights */}
          <View style={styles.card} testID="ai-insights">
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderLeft}><Heart color={colors.danger} size={18} /><Text style={styles.cardTitle}>AI Health Insights</Text></View>
              <TouchableOpacity onPress={fetchInsights} testID="refresh-insights" disabled={insightsLoading}>
                {insightsLoading ? <ActivityIndicator color={colors.primaryGlow} size="small" /> : <RefreshCw size={14} color={colors.textTertiary} />}
              </TouchableOpacity>
            </View>
            {insights ? (
              <Text style={styles.body}>{insights}</Text>
            ) : (
              <>
                <Text style={styles.body}>Claude 4.5 analyzes your last 7 check-ins and offers 3 evidence-based strategies.</Text>
                <TouchableOpacity style={styles.secondaryBtn} onPress={fetchInsights} disabled={insightsLoading} testID="generate-insights">
                  {insightsLoading ? <ActivityIndicator color={colors.primaryGlow} /> : <><Sparkles size={14} color={colors.primaryGlow} /><Text style={styles.secondaryBtnText}>Generate Insights</Text></>}
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* Medications */}
          <View style={styles.card} testID="medications-card">
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderLeft}><Pill color={colors.warning} size={18} /><Text style={styles.cardTitle}>Medications</Text></View>
              <TouchableOpacity style={styles.smallIconBtn} onPress={() => { setMedEditing(null); setMedInitial({ name: "", dosage: "", schedule_time: "", notes: "" }); setMedEditOpen(true); }} testID="med-add">
                <Plus size={14} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>
            {meds.length === 0 ? (
              <Text style={styles.emptyText}>No medications tracked. Tap + to add one.</Text>
            ) : meds.map((m) => (
              <TouchableOpacity key={m.med_id} style={styles.itemRow} onPress={() => { setMedEditing(m.med_id); setMedInitial({ name: m.name, dosage: m.dosage || "", schedule_time: m.schedule_time || "", notes: m.notes || "" }); setMedEditOpen(true); }} testID={`med-${m.med_id}`}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle}>{m.name}{m.dosage ? ` · ${m.dosage}` : ""}</Text>
                  {m.schedule_time ? <Text style={styles.itemSub}>⏰ {m.schedule_time}</Text> : null}
                </View>
                <Pencil size={12} color={colors.textTertiary} />
              </TouchableOpacity>
            ))}
            <Text style={styles.miniHint}>Time-based push reminders coming in a future build.</Text>
          </View>

          {/* Appointments */}
          <View style={styles.card} testID="appointments-card">
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderLeft}><Calendar color={colors.primaryGlow} size={18} /><Text style={styles.cardTitle}>Upcoming Appointments</Text></View>
              <TouchableOpacity style={styles.smallIconBtn} onPress={() => { setApptEditing(null); setApptInitial({ title: "", datetime: "", location: "", notes: "" }); setApptEditOpen(true); }} testID="appt-add">
                <Plus size={14} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>
            {appts.length === 0 ? (
              <Text style={styles.emptyText}>No appointments scheduled.</Text>
            ) : appts.map((a) => (
              <TouchableOpacity key={a.appt_id} style={styles.itemRow} onPress={() => { setApptEditing(a.appt_id); setApptInitial({ title: a.title, datetime: a.datetime, location: a.location || "", notes: a.notes || "" }); setApptEditOpen(true); }} testID={`appt-${a.appt_id}`}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle}>{a.title}</Text>
                  <Text style={styles.itemSub}>{(a.datetime || "").slice(0, 16).replace("T", " ")}{a.location ? ` · ${a.location}` : ""}</Text>
                </View>
                {typeof a.days_until === "number" && a.days_until >= 0 ? (
                  <View style={styles.daysPill}><Text style={styles.daysPillText}>{a.days_until === 0 ? "Today" : `${a.days_until}d`}</Text></View>
                ) : null}
              </TouchableOpacity>
            ))}
          </View>

          {/* Resources */}
          <View style={styles.card} testID="medicaid-resources">
            <Text style={styles.cardTitle}>Medicaid Resources (Georgia)</Text>
            {(resources?.resources || []).map((r: any, i: number) => (
              <TouchableOpacity key={i} style={styles.resourceRow} onPress={() => Linking.openURL(r.url).catch(() => {})} testID={`resource-${i}`}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.resourceTitle}>{r.label}</Text>
                  <Text style={styles.resourceDesc}>{r.description}</Text>
                </View>
                <ExternalLink size={12} color={colors.textTertiary} />
              </TouchableOpacity>
            ))}
            <Text style={[styles.miniLabel, { marginTop: spacing.md }]}>COVERED SERVICES (SUMMARY)</Text>
            {(resources?.covered_services || []).map((s: string, i: number) => (
              <Text key={i} style={styles.bulletText}>• {s}</Text>
            ))}
          </View>

          <View style={{ height: 60 }} />
        </ScrollView>
      )}

      {/* Insurance edit modal */}
      <EditModal
        visible={insEditOpen}
        title="Edit Insurance Details"
        fields={INSURANCE_FIELDS}
        initial={insurance || {}}
        onClose={() => setInsEditOpen(false)}
        onSubmit={async (values) => {
          const payload: any = { ...values };
          ["household_size", "monthly_income_usd", "monthly_premium_usd", "deductible_usd"].forEach((k) => {
            if (payload[k] !== undefined && payload[k] !== "") payload[k] = Number(payload[k]) || 0;
          });
          const r = await healthApi.updateInsurance(payload);
          setInsurance(r.insurance); setEligibility(r.eligibility); setDaysUntilRenewal(r.days_until_renewal);
          setInsEditOpen(false);
        }}
        testID="insurance-editor"
      />

      {/* Medication edit modal */}
      <EditModal
        visible={medEditOpen}
        title={medEditing ? "Edit Medication" : "New Medication"}
        fields={MED_FIELDS}
        initial={medInitial || {}}
        onClose={() => setMedEditOpen(false)}
        onSubmit={async (v) => {
          if (!v.name?.trim()) throw new Error("Name required");
          if (medEditing) await healthApi.updateMed(medEditing, v);
          else await healthApi.createMed(v);
          await load(); setMedEditOpen(false);
        }}
        onDelete={medEditing ? async () => { await healthApi.deleteMed(medEditing); await load(); } : undefined}
        deleteSubject={medInitial?.name || "this medication"}
        testID="med-editor"
      />

      {/* Appointment edit modal */}
      <EditModal
        visible={apptEditOpen}
        title={apptEditing ? "Edit Appointment" : "New Appointment"}
        fields={APPT_FIELDS}
        initial={apptInitial || {}}
        onClose={() => setApptEditOpen(false)}
        onSubmit={async (v) => {
          if (!v.title?.trim() || !v.datetime?.trim()) throw new Error("Title and date required");
          if (apptEditing) await healthApi.updateAppt(apptEditing, v);
          else await healthApi.createAppt(v);
          await load(); setApptEditOpen(false);
        }}
        onDelete={apptEditing ? async () => { await healthApi.deleteAppt(apptEditing); await load(); } : undefined}
        deleteSubject={apptInitial?.title || "this appointment"}
        testID="appt-editor"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  iconBtn: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.surfaceElevated, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  scroll: { padding: spacing.xl, gap: spacing.md },
  card: { backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: "700" },
  providerText: { color: colors.textSecondary, fontSize: 12 },
  smallIconBtn: { padding: 8, borderRadius: radius.sm, backgroundColor: colors.bg },
  statsRow: { flexDirection: "row", backgroundColor: colors.bg, borderRadius: radius.md, paddingVertical: spacing.md, marginTop: spacing.xs },
  statCol: { flex: 1, alignItems: "center" },
  statDivider: { width: 1, backgroundColor: colors.borderSubtle },
  statLabel: { color: colors.textTertiary, fontSize: 9, fontWeight: "700", letterSpacing: 1 },
  statValue: { color: colors.textPrimary, fontSize: 14, fontWeight: "700", marginTop: 4 },
  statSub: { color: colors.textTertiary, fontSize: 10, marginTop: 2 },
  eligBar: { flexDirection: "row", alignItems: "center", gap: 6, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1 },
  eligText: { fontSize: 12, fontWeight: "600", flex: 1 },
  alternativeBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.danger, marginTop: 4 },
  alternativeText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  fieldLabel: { color: colors.textTertiary, fontSize: 10, fontWeight: "700", letterSpacing: 1, marginTop: spacing.sm },
  sliderRow: { flexDirection: "row", justifyContent: "space-between", gap: 4 },
  sliderDot: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  sliderDotText: { fontSize: 10, fontWeight: "700" },
  notesInput: { backgroundColor: colors.bg, borderRadius: radius.md, padding: spacing.md, color: colors.textPrimary, fontSize: 13, borderWidth: 1, borderColor: colors.borderSubtle, minHeight: 60, marginTop: spacing.sm, textAlignVertical: "top" },
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.primary, marginTop: spacing.sm },
  primaryBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  secondaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.primaryGlow, backgroundColor: colors.primaryMuted },
  secondaryBtnText: { color: colors.primaryGlow, fontSize: 13, fontWeight: "700" },
  body: { color: colors.textPrimary, fontSize: 13, lineHeight: 19 },
  miniLabel: { color: colors.textTertiary, fontSize: 9, fontWeight: "700", letterSpacing: 1, marginTop: 4 },
  miniHint: { color: colors.textTertiary, fontSize: 10, fontStyle: "italic", marginTop: 4 },
  legendRow: { flexDirection: "row", justifyContent: "center", gap: spacing.md, marginTop: 4 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  legendText: { color: colors.textSecondary, fontSize: 10 },
  itemRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  itemTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: "600" },
  itemSub: { color: colors.textTertiary, fontSize: 11, marginTop: 2 },
  daysPill: { backgroundColor: colors.primaryMuted, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm },
  daysPillText: { color: colors.primaryGlow, fontSize: 10, fontWeight: "700" },
  emptyText: { color: colors.textTertiary, fontSize: 12, paddingVertical: 8 },
  resourceRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  resourceTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: "600" },
  resourceDesc: { color: colors.textTertiary, fontSize: 11, marginTop: 2 },
  bulletText: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
});
