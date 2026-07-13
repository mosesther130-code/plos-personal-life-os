// PLOS — Insurance Quote Profile
// Route: /shopping/insurance/profile
// Stores personal, location, vehicle, driver, home, and coverage details
// for insurance quoting. Never shared with any insurer automatically.
//
// TODO (Sub-Phase B): The following fields should be encrypted at rest with
// per-field AES-256 before the app reaches 1,000 real users:
//   - personal_details.date_of_birth
//   - personal_details.credit_score_range
//   - vehicles[*].vin
//   - home_details.home_value
//   - home_details.rebuild_cost
//   - drivers[*].accidents_3yr
//   - drivers[*].violations_3yr
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  ArrowLeft,
  Lock,
  Sparkles,
  Save,
  Trash2,
  Car,
  Home,
  User,
  Shield,
  Users,
  Plus,
  X,
  Check,
  MapPin,
} from "lucide-react-native";
import { colors, spacing, radius } from "@/src/lib/theme";
import { insuranceApi } from "@/src/lib/api";

const CREDIT_RANGES = ["Excellent 750+", "Good 700-749", "Fair 650-699", "Poor below 650", "Prefer not to say"];
const GENDERS = ["Male", "Female", "Non-binary", "Prefer not to say"];
const MARITAL = ["Single", "Married", "Divorced", "Widowed"];
const MILEAGES = ["Under 5,000", "5,000-10,000", "10,000-15,000", "15,000-20,000", "Over 20,000"];
const USES = ["Commuting", "Pleasure", "Business", "Farm"];
const OWNERSHIP = ["Owned outright", "Financed", "Leased"];
const LICENSE_STATUS = ["Licensed", "Permit", "Unlicensed", "Suspended"];
const ACCIDENTS = ["None", "1", "2", "3+"];
const VIOLATIONS = ["None", "Speeding ticket", "DUI/DWI", "Reckless driving", "Other"];
const PROPERTY_TYPES = ["Single family home", "Townhouse", "Condo", "Mobile home", "Rental property"];
const STORIES = ["1", "2", "3+"];
const CONSTRUCTION = ["Frame", "Masonry", "Mixed"];
const ROOF_TYPES = ["Asphalt shingle", "Metal", "Tile", "Flat", "Other"];
const CLAIMS = ["None", "1", "2", "3+"];
const LIABILITY_LIMITS = ["State minimum", "50/100/50", "100/300/100", "250/500/250"];
const DEDUCTIBLES = ["$250", "$500", "$1,000", "$2,500"];
const HOME_DEDUCTIBLES = ["$500", "$1,000", "$2,500", "$5,000"];
const PERSONAL_PROP = ["$50,000", "$75,000", "$100,000", "$150,000", "$200,000"];
const LIABILITY_COV = ["$100,000", "$200,000", "$300,000", "$500,000"];
const SECURITY = ["Alarm system", "Deadbolt locks", "Smoke detectors", "Carbon monoxide detectors", "Smart home security", "Gated community", "Fire sprinklers"];

// ------------------- Screen -------------------
export default function QuoteProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ scrollTo?: string }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [prefilled, setPrefilled] = useState<Record<string, boolean>>({});
  const [completeness, setCompleteness] = useState<number>(0);
  const [exists, setExists] = useState<boolean>(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await insuranceApi.getProfile();
      setProfile(res.profile);
      setPrefilled(res.prefilled_fields || {});
      setCompleteness(res.profile_completeness || 0);
      setExists(res.exists);
    } catch (e: any) {
      Alert.alert("Load failed", String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setPD = (k: string, v: any) => setProfile((p: any) => ({ ...p, personal_details: { ...p.personal_details, [k]: v } }));
  const setLoc = (k: string, v: any) => setProfile((p: any) => ({ ...p, location: { ...p.location, [k]: v } }));
  const setHome = (k: string, v: any) => setProfile((p: any) => ({ ...p, home_details: { ...p.home_details, [k]: v } }));
  const setCovAuto = (k: string, v: any) => setProfile((p: any) => ({ ...p, coverage_preferences: { ...p.coverage_preferences, auto: { ...p.coverage_preferences.auto, [k]: v } } }));
  const setCovHome = (k: string, v: any) => setProfile((p: any) => ({ ...p, coverage_preferences: { ...p.coverage_preferences, home: { ...p.coverage_preferences.home, [k]: v } } }));

  const updateVehicle = (idx: number, k: string, v: any) => setProfile((p: any) => {
    const vs = [...p.vehicles];
    vs[idx] = { ...vs[idx], [k]: v };
    return { ...p, vehicles: vs };
  });
  const addVehicle = () => setProfile((p: any) => {
    if (p.vehicles.length >= 5) return p;
    return { ...p, vehicles: [...p.vehicles, { id: `v-${Date.now()}`, year: 2020, make: "", model: "", primary_use: "Commuting", annual_mileage: "10,000-15,000", ownership_status: "Owned outright" }] };
  });
  const removeVehicle = (idx: number) => setProfile((p: any) => ({ ...p, vehicles: p.vehicles.filter((_: any, i: number) => i !== idx) }));

  const updateDriver = (idx: number, k: string, v: any) => setProfile((p: any) => {
    const ds = [...p.drivers];
    ds[idx] = { ...ds[idx], [k]: v };
    return { ...p, drivers: ds };
  });
  const addDriver = () => setProfile((p: any) => {
    if (p.drivers.length >= 4) return p;
    return { ...p, drivers: [...p.drivers, { id: `d-${Date.now()}`, full_name: "", license_status: "Licensed", accidents_3yr: "None", violations_3yr: "None" }] };
  });
  const removeDriver = (idx: number) => setProfile((p: any) => ({ ...p, drivers: p.drivers.filter((_: any, i: number) => i !== idx) }));

  const toggleSecurity = (item: string) => setProfile((p: any) => {
    const cur = new Set(p.home_details.security_features || []);
    if (cur.has(item)) cur.delete(item); else cur.add(item);
    return { ...p, home_details: { ...p.home_details, security_features: Array.from(cur) } };
  });

  const save = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const res = await insuranceApi.saveProfile(profile);
      setCompleteness(res.profile_completeness || 0);
      setExists(true);
      Alert.alert("Saved", `Profile ${res.profile_completeness}% complete.`);
    } catch (e: any) {
      Alert.alert("Save failed", String(e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  const deleteProfile = () => {
    Alert.alert(
      "Delete Quote Profile?",
      "This removes your quote profile and ALL saved quotes from your account. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete Everything", style: "destructive", onPress: async () => {
          try {
            const res = await insuranceApi.deleteProfile();
            Alert.alert("Deleted", `Removed ${res.profiles_removed} profile(s) and ${res.quotes_removed} quote(s).`);
            await load();
          } catch (e: any) {
            Alert.alert("Delete failed", String(e?.message || e));
          }
        }},
      ],
    );
  };

  if (loading || !profile) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <ScreenHeader title="My Quote Profile" onBack={() => router.back()} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.primaryGlow} />
        </View>
      </SafeAreaView>
    );
  }

  const pd = profile.personal_details;
  const loc = profile.location;
  const hd = profile.home_details;
  const cp = profile.coverage_preferences;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScreenHeader title="My Quote Profile" onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Privacy notice */}
        <View style={styles.privacyBox} testID="privacy-notice">
          <Lock color={colors.success} size={16} />
          <Text style={styles.privacyText}>
            Your information is stored securely in your PLOS account and is{" "}
            <Text style={{ fontWeight: "700" }}>never automatically shared</Text> with any insurance company. You control when and where you share your information.
          </Text>
        </View>

        {/* Pre-fill banner */}
        {!exists && Object.keys(prefilled).length > 0 && (
          <View style={styles.prefillBanner}>
            <Sparkles color={colors.primaryGlow} size={14} />
            <Text style={styles.prefillText}>
              We pre-filled some details from your PLOS profile. Review and complete the remaining fields for a more accurate estimate.
            </Text>
          </View>
        )}

        {/* Completeness */}
        <View style={styles.completeCard}>
          <Text style={styles.completeLabel}>Profile completeness</Text>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${completeness}%` }]} />
          </View>
          <Text style={styles.completeValue}>{completeness}%</Text>
        </View>

        {/* ------- Section 1: Personal ------- */}
        <SectionHeader icon={<User color={colors.primaryGlow} size={16} />} title="Personal Details" />
        <Field label="Full name" prefilled={prefilled["full_name"]}>
          <TextInput value={pd.full_name || ""} onChangeText={(v) => setPD("full_name", v)} style={styles.input} placeholder="Your full name" placeholderTextColor={colors.textTertiary} />
        </Field>
        <Field label="Date of birth (YYYY-MM-DD)">
          <TextInput value={pd.date_of_birth || ""} onChangeText={(v) => setPD("date_of_birth", v)} style={styles.input} placeholder="1990-06-15" placeholderTextColor={colors.textTertiary} />
        </Field>
        <PillPicker label="Gender" options={GENDERS} value={pd.gender} onChange={(v) => setPD("gender", v)} />
        <PillPicker label="Marital status" options={MARITAL} value={pd.marital_status} onChange={(v) => setPD("marital_status", v)} />
        <PillPicker label="Credit score range" options={CREDIT_RANGES} value={pd.credit_score_range} onChange={(v) => setPD("credit_score_range", v)} />
        <Field label="Years at current address">
          <TextInput keyboardType="numeric" value={String(pd.years_at_address || "")} onChangeText={(v) => setPD("years_at_address", Number(v) || 0)} style={styles.input} placeholder="5" placeholderTextColor={colors.textTertiary} />
        </Field>

        {/* ------- Section 2: Location ------- */}
        <SectionHeader icon={<MapPin color={colors.success} size={16} />} title="Location" />
        <Field label="Home address" prefilled={prefilled["location.home_address"]}>
          <TextInput value={loc.home_address || ""} onChangeText={(v) => setLoc("home_address", v)} style={styles.input} placeholder="Street, City, State ZIP" placeholderTextColor={colors.textTertiary} />
        </Field>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Field label="City" prefilled={prefilled["location.city"]}>
              <TextInput value={loc.city || ""} onChangeText={(v) => setLoc("city", v)} style={styles.input} placeholderTextColor={colors.textTertiary} />
            </Field>
          </View>
          <View style={{ width: 80 }}>
            <Field label="State" prefilled={prefilled["location.state"]}>
              <TextInput value={loc.state || ""} onChangeText={(v) => setLoc("state", v)} style={styles.input} maxLength={2} autoCapitalize="characters" placeholderTextColor={colors.textTertiary} />
            </Field>
          </View>
          <View style={{ width: 90 }}>
            <Field label="ZIP" prefilled={prefilled["location.zip"]}>
              <TextInput value={loc.zip || ""} onChangeText={(v) => setLoc("zip", v)} style={styles.input} keyboardType="numeric" maxLength={5} placeholderTextColor={colors.textTertiary} />
            </Field>
          </View>
        </View>
        <Field label="County" prefilled={prefilled["location.county"]}>
          <TextInput value={loc.county || ""} onChangeText={(v) => setLoc("county", v)} style={styles.input} placeholder="DeKalb County" placeholderTextColor={colors.textTertiary} />
        </Field>

        {/* ------- Section 3: Vehicles ------- */}
        <SectionHeader icon={<Car color={colors.warning} size={16} />} title={`Vehicles (${profile.vehicles.length}/5)`} />
        {profile.vehicles.map((v: any, idx: number) => (
          <View key={v.id || idx} style={styles.itemCard}>
            <View style={styles.itemHead}>
              <Text style={styles.itemTitle}>Vehicle {idx + 1}</Text>
              {idx === 0 && prefilled["vehicles"] && <View style={styles.prefillBadge}><Text style={styles.prefillBadgeText}>Auto-filled</Text></View>}
              {profile.vehicles.length > 1 && (
                <TouchableOpacity onPress={() => removeVehicle(idx)}>
                  <Trash2 color={colors.danger} size={14} />
                </TouchableOpacity>
              )}
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ width: 80 }}>
                <Field label="Year">
                  <TextInput value={String(v.year || "")} onChangeText={(x) => updateVehicle(idx, "year", Number(x) || 0)} style={styles.input} keyboardType="numeric" maxLength={4} placeholderTextColor={colors.textTertiary} />
                </Field>
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Make">
                  <TextInput value={v.make || ""} onChangeText={(x) => updateVehicle(idx, "make", x)} style={styles.input} placeholder="Toyota" placeholderTextColor={colors.textTertiary} />
                </Field>
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Model">
                  <TextInput value={v.model || ""} onChangeText={(x) => updateVehicle(idx, "model", x)} style={styles.input} placeholder="RAV4" placeholderTextColor={colors.textTertiary} />
                </Field>
              </View>
            </View>
            <PillPicker label="Primary use" options={USES} value={v.primary_use} onChange={(x) => updateVehicle(idx, "primary_use", x)} />
            <PillPicker label="Annual mileage" options={MILEAGES} value={v.annual_mileage} onChange={(x) => updateVehicle(idx, "annual_mileage", x)} />
            <PillPicker label="Ownership" options={OWNERSHIP} value={v.ownership_status} onChange={(x) => updateVehicle(idx, "ownership_status", x)} />
            <Field label="VIN (optional — improves accuracy)">
              <TextInput value={v.vin || ""} onChangeText={(x) => updateVehicle(idx, "vin", x)} style={styles.input} placeholder="17-digit VIN" placeholderTextColor={colors.textTertiary} maxLength={17} autoCapitalize="characters" />
            </Field>
          </View>
        ))}
        {profile.vehicles.length < 5 && (
          <TouchableOpacity style={styles.addBtn} onPress={addVehicle} testID="add-vehicle">
            <Plus color={colors.primaryGlow} size={14} />
            <Text style={styles.addBtnText}>Add Vehicle</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.supportText}>Need to add more? Contact plos.support@gmail.com</Text>

        {/* ------- Section 4: Drivers ------- */}
        <SectionHeader icon={<Users color="#EC4899" size={16} />} title={`Drivers (${profile.drivers.length}/4)`} />
        {profile.drivers.map((d: any, idx: number) => (
          <View key={d.id || idx} style={styles.itemCard}>
            <View style={styles.itemHead}>
              <Text style={styles.itemTitle}>Driver {idx + 1}</Text>
              {idx === 0 && prefilled["drivers"] && <View style={styles.prefillBadge}><Text style={styles.prefillBadgeText}>Auto-filled</Text></View>}
              {profile.drivers.length > 1 && (
                <TouchableOpacity onPress={() => removeDriver(idx)}>
                  <Trash2 color={colors.danger} size={14} />
                </TouchableOpacity>
              )}
            </View>
            <Field label="Full name">
              <TextInput value={d.full_name || ""} onChangeText={(x) => updateDriver(idx, "full_name", x)} style={styles.input} placeholderTextColor={colors.textTertiary} />
            </Field>
            <Field label="Years licensed">
              <TextInput value={String(d.years_licensed || "")} onChangeText={(x) => updateDriver(idx, "years_licensed", Number(x) || 0)} style={styles.input} keyboardType="numeric" placeholderTextColor={colors.textTertiary} />
            </Field>
            <PillPicker label="License status" options={LICENSE_STATUS} value={d.license_status} onChange={(x) => updateDriver(idx, "license_status", x)} />
            <PillPicker label="Accidents in last 3 years" options={ACCIDENTS} value={d.accidents_3yr} onChange={(x) => updateDriver(idx, "accidents_3yr", x)} />
            <PillPicker label="Violations in last 3 years" options={VIOLATIONS} value={d.violations_3yr} onChange={(x) => updateDriver(idx, "violations_3yr", x)} />
            <ToggleRow label="Defensive driving course completed" value={!!d.defensive_driving} onChange={(x) => updateDriver(idx, "defensive_driving", x)} />
            <ToggleRow label="Good student (under 25, GPA 3.0+)" value={!!d.good_student} onChange={(x) => updateDriver(idx, "good_student", x)} />
          </View>
        ))}
        {profile.drivers.length < 4 && (
          <TouchableOpacity style={styles.addBtn} onPress={addDriver} testID="add-driver">
            <Plus color={colors.primaryGlow} size={14} />
            <Text style={styles.addBtnText}>Add Driver</Text>
          </TouchableOpacity>
        )}

        {/* ------- Section 5: Home ------- */}
        <SectionHeader icon={<Home color="#A855F7" size={16} />} title="Home Details" />
        <PillPicker label="Property type" options={PROPERTY_TYPES} value={hd.property_type} onChange={(v) => setHome("property_type", v)} />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Field label="Year built">
              <TextInput value={String(hd.year_built || "")} onChangeText={(v) => setHome("year_built", Number(v) || 0)} style={styles.input} keyboardType="numeric" placeholderTextColor={colors.textTertiary} placeholder="2003" />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Square footage">
              <TextInput value={String(hd.square_footage || "")} onChangeText={(v) => setHome("square_footage", Number(v) || 0)} style={styles.input} keyboardType="numeric" placeholderTextColor={colors.textTertiary} placeholder="2100" />
            </Field>
          </View>
        </View>
        <PillPicker label="Stories" options={STORIES} value={hd.stories} onChange={(v) => setHome("stories", v)} />
        <PillPicker label="Construction" options={CONSTRUCTION} value={hd.construction_type} onChange={(v) => setHome("construction_type", v)} />
        <PillPicker label="Roof type" options={ROOF_TYPES} value={hd.roof_type} onChange={(v) => setHome("roof_type", v)} />
        <Field label="Roof age (years)">
          <TextInput value={String(hd.roof_age || "")} onChangeText={(v) => setHome("roof_age", Number(v) || 0)} style={styles.input} keyboardType="numeric" placeholderTextColor={colors.textTertiary} />
        </Field>
        <Field label="Estimated home value ($)" prefilled={prefilled["home_value"]}>
          <TextInput value={String(hd.home_value || "")} onChangeText={(v) => setHome("home_value", Number(v) || 0)} style={styles.input} keyboardType="numeric" placeholderTextColor={colors.textTertiary} placeholder="285000" />
        </Field>
        <Field label="Estimated rebuild cost ($)">
          <TextInput value={String(hd.rebuild_cost || "")} onChangeText={(v) => setHome("rebuild_cost", Number(v) || 0)} style={styles.input} keyboardType="numeric" placeholderTextColor={colors.textTertiary} placeholder="228000" />
        </Field>
        <Field label="Mortgage company (optional)">
          <TextInput value={hd.mortgage_company || ""} onChangeText={(v) => setHome("mortgage_company", v)} style={styles.input} placeholderTextColor={colors.textTertiary} />
        </Field>
        <Text style={styles.fieldLabel}>Security features</Text>
        <View style={styles.pillRow}>
          {SECURITY.map((s) => {
            const active = (hd.security_features || []).includes(s);
            return (
              <TouchableOpacity key={s} style={[styles.pill, active && styles.pillActive]} onPress={() => toggleSecurity(s)}>
                {active && <Check color="#fff" size={11} />}
                <Text style={[styles.pillText, active && { color: "#fff" }]}>{s}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <ToggleRow label="Pool or trampoline on property" value={!!hd.has_pool} onChange={(v) => setHome("has_pool", v)} />
        <ToggleRow label="Home business operated" value={!!hd.home_business} onChange={(v) => setHome("home_business", v)} />
        <PillPicker label="Claims in last 5 years" options={CLAIMS} value={hd.claims_5yr} onChange={(v) => setHome("claims_5yr", v)} />

        {/* ------- Section 6: Coverage Preferences ------- */}
        <SectionHeader icon={<Shield color={colors.primaryGlow} size={16} />} title="Auto Coverage Preferences" />
        <PillPicker label="Liability limits" options={LIABILITY_LIMITS} value={cp.auto.liability_limits} onChange={(v) => setCovAuto("liability_limits", v)} />
        <PillPicker label="Collision deductible" options={DEDUCTIBLES} value={cp.auto.deductible_collision ? `$${cp.auto.deductible_collision}` : undefined} onChange={(v) => setCovAuto("deductible_collision", Number(v.replace(/[$,]/g, "")))} />
        <PillPicker label="Comprehensive deductible" options={DEDUCTIBLES} value={cp.auto.deductible_comprehensive ? `$${cp.auto.deductible_comprehensive}` : undefined} onChange={(v) => setCovAuto("deductible_comprehensive", Number(v.replace(/[$,]/g, "")))} />
        <ToggleRow label="Uninsured motorist coverage" value={!!cp.auto.uninsured_motorist} onChange={(v) => setCovAuto("uninsured_motorist", v)} />
        <ToggleRow label="Roadside assistance" value={!!cp.auto.roadside_assistance} onChange={(v) => setCovAuto("roadside_assistance", v)} />
        <ToggleRow label="Rental reimbursement" value={!!cp.auto.rental_reimbursement} onChange={(v) => setCovAuto("rental_reimbursement", v)} />
        <ToggleRow label="Gap insurance (for financed/leased)" value={!!cp.auto.gap_insurance} onChange={(v) => setCovAuto("gap_insurance", v)} />

        <SectionHeader icon={<Shield color={colors.success} size={16} />} title="Home Coverage Preferences" />
        <Field label="Dwelling coverage ($)">
          <TextInput value={String(cp.home.dwelling_coverage || "")} onChangeText={(v) => setCovHome("dwelling_coverage", Number(v) || 0)} style={styles.input} keyboardType="numeric" placeholderTextColor={colors.textTertiary} />
        </Field>
        <PillPicker label="Personal property" options={PERSONAL_PROP} value={cp.home.personal_property ? `$${cp.home.personal_property.toLocaleString()}` : undefined} onChange={(v) => setCovHome("personal_property", Number(v.replace(/[$,]/g, "")))} />
        <PillPicker label="Liability coverage" options={LIABILITY_COV} value={cp.home.liability_coverage ? `$${cp.home.liability_coverage.toLocaleString()}` : undefined} onChange={(v) => setCovHome("liability_coverage", Number(v.replace(/[$,]/g, "")))} />
        <PillPicker label="Deductible" options={HOME_DEDUCTIBLES} value={cp.home.deductible ? `$${cp.home.deductible.toLocaleString()}` : undefined} onChange={(v) => setCovHome("deductible", Number(v.replace(/[$,]/g, "")))} />
        <ToggleRow label="Flood insurance add-on" value={!!cp.home.flood_insurance} onChange={(v) => setCovHome("flood_insurance", v)} />
        <ToggleRow label="Earthquake coverage" value={!!cp.home.earthquake_coverage} onChange={(v) => setCovHome("earthquake_coverage", v)} />
        <ToggleRow label="Scheduled personal property (jewelry/art/electronics)" value={!!cp.home.scheduled_personal_property} onChange={(v) => setCovHome("scheduled_personal_property", v)} />

        {/* Save + Delete */}
        <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving} testID="save-profile">
          {saving ? <ActivityIndicator color="#fff" /> : <Save color="#fff" size={16} />}
          <Text style={styles.saveBtnText}>Save Quote Profile</Text>
        </TouchableOpacity>
        {exists && (
          <TouchableOpacity style={styles.deleteBtn} onPress={deleteProfile} testID="delete-profile">
            <Trash2 color={colors.danger} size={14} />
            <Text style={styles.deleteBtnText}>Delete My Quote Profile</Text>
          </TouchableOpacity>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ------------------- Sub-components -------------------
function ScreenHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity style={styles.backBtn} onPress={onBack} testID="profile-back">
        <ArrowLeft color={colors.textPrimary} size={20} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={{ width: 36 }} />
    </View>
  );
}

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <View style={styles.sectionHeader}>
      {icon}
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function Field({ label, prefilled, children }: { label: string; prefilled?: boolean; children: React.ReactNode }) {
  return (
    <View style={styles.fieldWrap}>
      <View style={styles.labelRow}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {prefilled && (
          <View style={styles.prefillBadge}>
            <Sparkles color={colors.primaryGlow} size={9} />
            <Text style={styles.prefillBadgeText}>Auto-filled</Text>
          </View>
        )}
      </View>
      {children}
    </View>
  );
}

function PillPicker({ label, options, value, onChange }: { label: string; options: string[]; value?: string; onChange: (v: string) => void }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.pillRow}>
        {options.map((o) => (
          <TouchableOpacity key={o} style={[styles.pill, value === o && styles.pillActive]} onPress={() => onChange(o)}>
            <Text style={[styles.pillText, value === o && { color: "#fff" }]}>{o}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.primaryGlow, false: "#333" }} thumbColor="#fff" />
    </View>
  );
}

// ------------------- Styles -------------------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  backBtn: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.surfaceElevated, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  scroll: { padding: spacing.lg, gap: 6 },
  privacyBox: {
    flexDirection: "row",
    gap: 8,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: "rgba(16,185,129,0.08)",
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.25)",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  privacyText: { color: colors.textPrimary, fontSize: 11, flex: 1, lineHeight: 15 },
  prefillBanner: { flexDirection: "row", gap: 6, padding: 10, backgroundColor: "rgba(59,130,246,0.1)", borderRadius: 8, borderWidth: 1, borderColor: "rgba(59,130,246,0.25)", alignItems: "flex-start", marginTop: 4 },
  prefillText: { color: colors.textPrimary, fontSize: 11, flex: 1, lineHeight: 15 },
  completeCard: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.borderSubtle, marginTop: 6 },
  completeLabel: { color: colors.textSecondary, fontSize: 12 },
  progressBar: { flex: 1, height: 6, backgroundColor: colors.surfaceElevated, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: colors.primaryGlow },
  completeValue: { color: colors.textPrimary, fontWeight: "700" },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 18, marginBottom: 4 },
  sectionTitle: { color: colors.textPrimary, fontWeight: "700", fontSize: 14 },
  fieldWrap: { marginTop: 8 },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  fieldLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: "600", marginBottom: 4, letterSpacing: 0.4, textTransform: "uppercase" },
  input: { backgroundColor: colors.surfaceElevated, color: colors.textPrimary, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, fontSize: 14, borderWidth: 1, borderColor: colors.borderSubtle },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pill: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.borderSubtle },
  pillActive: { backgroundColor: colors.primaryGlow, borderColor: colors.primaryGlow },
  pillText: { color: colors.textSecondary, fontSize: 11, fontWeight: "600" },
  itemCard: { padding: 12, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: 12, backgroundColor: colors.surface, marginTop: 8 },
  itemHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  itemTitle: { color: colors.textPrimary, fontWeight: "700", fontSize: 13, flex: 1 },
  prefillBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(59,130,246,0.18)", paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
  prefillBadgeText: { color: colors.primaryGlow, fontSize: 8, fontWeight: "800", letterSpacing: 0.4 },
  addBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, padding: 10, borderStyle: "dashed", borderWidth: 1, borderColor: colors.primaryGlow, borderRadius: 8, marginTop: 8 },
  addBtnText: { color: colors.primaryGlow, fontWeight: "700", fontSize: 12 },
  supportText: { color: colors.textTertiary, fontSize: 10, marginTop: 4, textAlign: "center" },
  toggleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 10, backgroundColor: colors.surfaceElevated, borderRadius: 8, marginTop: 6 },
  toggleLabel: { color: colors.textPrimary, fontSize: 12, flex: 1, marginRight: 8 },
  saveBtn: { marginTop: 20, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.primaryGlow, paddingVertical: 14, borderRadius: 10 },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  deleteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 10, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.danger },
  deleteBtnText: { color: colors.danger, fontWeight: "700", fontSize: 13 },
});
