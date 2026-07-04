// TripPlannerModal — Departure/Destination airport search + swap + saved routes.
// Replaces the generic EditModal for trip creation/editing in Travel Advisor.
import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Modal, ActivityIndicator,
  ScrollView, Pressable, Alert, KeyboardAvoidingView, Platform,
} from "react-native";
import {
  Plane, ArrowLeftRight, MapPin, ChevronDown, Search, X, Trash2, Plus,
  Calendar, Users, Info,
} from "lucide-react-native";
import { airportsApi, routesApi, Airport, SavedRoute } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";

const PURPOSE_OPTIONS = [
  { value: "business",   label: "Business" },
  { value: "leisure",    label: "Leisure" },
  { value: "eden",       label: "Eden Heights Development" },
  { value: "family",     label: "Family Visit" },
  { value: "conference", label: "Conference / Training" },
  { value: "medical",    label: "Medical" },
  { value: "mixed",      label: "Mixed" },
];

export type TripPlannerValues = {
  departure_iata: string;
  departure_city: string;
  departure_airport_name: string;
  destination_iata: string;
  destination_city: string;
  destination_airport_name: string;
  destination_country?: string;
  destination_name: string;   // legacy card title
  city: string;               // legacy field
  country: string;            // legacy
  country_code: string;
  departure_date: string;
  return_date: string;
  purpose: string;
  travelers: number;
  status: string;
};

const emptyValues: TripPlannerValues = {
  departure_iata: "", departure_city: "", departure_airport_name: "",
  destination_iata: "", destination_city: "", destination_airport_name: "",
  destination_country: "",
  destination_name: "", city: "", country: "", country_code: "",
  departure_date: "", return_date: "", purpose: "business",
  travelers: 1, status: "planning",
};

export function TripPlannerModal({
  visible, onClose, onSubmit, initial, title = "Plan a Trip",
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (v: TripPlannerValues) => Promise<void> | void;
  initial?: Partial<TripPlannerValues>;
  title?: string;
}) {
  const [values, setValues] = useState<TripPlannerValues>(emptyValues);
  const [saving, setSaving] = useState(false);
  const [routes, setRoutes] = useState<SavedRoute[]>([]);
  const [pickerTarget, setPickerTarget] =
    useState<null | "departure" | "destination">(null);
  const [showAddRoute, setShowAddRoute] = useState(false);

  const reset = useCallback(async () => {
    setValues({ ...emptyValues, ...(initial || {}) });
    // If no departure yet, auto-fill from home
    if (!initial?.departure_iata) {
      try {
        const home = await airportsApi.autoFill();
        setValues((v) => ({
          ...v,
          departure_iata: home.iata,
          departure_city: home.city,
          departure_airport_name: home.name,
        }));
      } catch { /* fallback ATL default */ }
    }
  }, [initial]);

  useEffect(() => { if (visible) reset(); }, [visible, reset]);

  useEffect(() => {
    (async () => {
      try {
        const r = await routesApi.list();
        setRoutes(r.routes || []);
      } catch { /* silent */ }
    })();
  }, [visible]);

  const applyRoute = async (r: SavedRoute) => {
    setValues((v) => ({
      ...v,
      departure_iata: r.origin_iata,
      departure_city: r.origin?.city || "",
      departure_airport_name: r.origin?.name || "",
      destination_iata: r.destination_iata,
      destination_city: r.destination?.city || "",
      destination_airport_name: r.destination?.name || "",
      destination_country: r.destination?.country || "",
      destination_name: v.destination_name || `${r.origin?.city} → ${r.destination?.city}`,
      city: r.destination?.city || v.city,
      country: r.destination?.country || v.country,
    }));
  };

  const deleteRoute = async (r: SavedRoute) => {
    try {
      await routesApi.remove(r.route_id);
      setRoutes(routes.filter((x) => x.route_id !== r.route_id));
    } catch (e: any) { Alert.alert("Delete failed", String(e?.message || e)); }
  };

  const doSwap = () => {
    setValues((v) => ({
      ...v,
      departure_iata: v.destination_iata,
      departure_city: v.destination_city,
      departure_airport_name: v.destination_airport_name,
      destination_iata: v.departure_iata,
      destination_city: v.departure_city,
      destination_airport_name: v.departure_airport_name,
    }));
  };

  const submit = async () => {
    if (!values.departure_iata) return Alert.alert("Missing", "Choose a departure airport.");
    if (!values.destination_iata) return Alert.alert("Missing", "Choose a destination airport.");
    if (!values.destination_name?.trim()) {
      // auto-derive name
      values.destination_name = `${values.departure_iata} → ${values.destination_iata} · ${values.destination_city}`;
    }
    if (!values.city) values.city = values.destination_city;
    if (!values.country) values.country = values.destination_country || "";
    setSaving(true);
    try {
      await onSubmit(values);
      onClose();
    } catch (e: any) {
      Alert.alert("Save failed", String(e?.message || e));
    } finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.backdrop}
      >
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.head}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onClose}><X size={18} color={colors.textTertiary} /></TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
            {/* Departure */}
            <Text style={styles.lbl}>Departure (Where From)</Text>
            {values.departure_iata ? (
              <AirportConfirmedCard
                iata={values.departure_iata}
                name={values.departure_airport_name}
                city={values.departure_city}
                autoFilled={!initial?.departure_iata}
                onChange={() => setPickerTarget("departure")}
                testID="departure-confirmed"
              />
            ) : (
              <TouchableOpacity
                style={styles.emptyField}
                onPress={() => setPickerTarget("departure")}
                testID="departure-open"
              >
                <Plane size={14} color={colors.primaryGlow} />
                <Text style={styles.emptyFieldText}>City or airport — e.g. Atlanta, ATL</Text>
              </TouchableOpacity>
            )}

            {/* Swap button */}
            <View style={styles.swapRow}>
              <View style={styles.swapDivider} />
              <TouchableOpacity style={styles.swapBtn} onPress={doSwap} testID="swap-btn">
                <ArrowLeftRight size={16} color="#fff" />
              </TouchableOpacity>
              <View style={styles.swapDivider} />
            </View>

            {/* Destination */}
            <Text style={styles.lbl}>Destination (Where To)</Text>
            {values.destination_iata ? (
              <AirportConfirmedCard
                iata={values.destination_iata}
                name={values.destination_airport_name}
                city={values.destination_city}
                onChange={() => setPickerTarget("destination")}
                testID="destination-confirmed"
              />
            ) : (
              <TouchableOpacity
                style={styles.emptyField}
                onPress={() => setPickerTarget("destination")}
                testID="destination-open"
              >
                <MapPin size={14} color={colors.primaryGlow} />
                <Text style={styles.emptyFieldText}>City or airport — e.g. Manila, MNL</Text>
              </TouchableOpacity>
            )}

            {/* Quick-select routes */}
            <Text style={[styles.lbl, { marginTop: 14 }]}>Your Routes</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.routesRow}>
              {routes.map((r) => (
                <View key={r.route_id} style={styles.routeChipWrap}>
                  <TouchableOpacity
                    style={styles.routeChip}
                    onPress={() => applyRoute(r)}
                    testID={`route-${r.origin_iata}-${r.destination_iata}`}
                  >
                    <Text style={styles.routeChipIata}>
                      {r.origin_iata} → {r.destination_iata}
                    </Text>
                    <Text style={styles.routeChipLabel} numberOfLines={1}>
                      {r.label}
                    </Text>
                  </TouchableOpacity>
                  {!r.default && (
                    <TouchableOpacity
                      style={styles.routeChipDel}
                      onPress={() => Alert.alert(
                        "Delete route?", r.label,
                        [
                          { text: "Cancel", style: "cancel" },
                          { text: "Delete", style: "destructive",
                            onPress: () => deleteRoute(r) },
                        ],
                      )}
                    >
                      <Trash2 size={10} color="#EF4444" />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              <TouchableOpacity
                style={[styles.routeChip, { borderStyle: "dashed" }]}
                onPress={() => setShowAddRoute(true)}
                testID="add-route"
              >
                <Plus size={11} color={colors.primaryGlow} />
                <Text style={styles.routeChipLabel}>Add route</Text>
              </TouchableOpacity>
            </ScrollView>

            {/* Trip name */}
            <Text style={[styles.lbl, { marginTop: 14 }]}>Trip Card Title (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder={values.destination_city
                ? `${values.destination_city} — ${PURPOSE_OPTIONS.find(p => p.value === values.purpose)?.label}`
                : "e.g. Manila & Bulacan"}
              placeholderTextColor={colors.textTertiary}
              value={values.destination_name}
              onChangeText={(t) => setValues((v) => ({ ...v, destination_name: t }))}
            />

            {/* Dates */}
            <View style={styles.row2}>
              <View style={{ flex: 1 }}>
                <Text style={styles.lbl}>Departure Date</Text>
                <View style={styles.inputWithIcon}>
                  <Calendar size={12} color={colors.textTertiary} />
                  <TextInput
                    style={[styles.input, styles.inputNoBorder]}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.textTertiary}
                    value={values.departure_date}
                    onChangeText={(t) => setValues((v) => ({ ...v, departure_date: t }))}
                  />
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.lbl}>Return Date</Text>
                <View style={styles.inputWithIcon}>
                  <Calendar size={12} color={colors.textTertiary} />
                  <TextInput
                    style={[styles.input, styles.inputNoBorder]}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.textTertiary}
                    value={values.return_date}
                    onChangeText={(t) => setValues((v) => ({ ...v, return_date: t }))}
                  />
                </View>
              </View>
            </View>

            {/* Purpose */}
            <Text style={styles.lbl}>Purpose</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.purposeRow}>
              {PURPOSE_OPTIONS.map((p) => (
                <TouchableOpacity
                  key={p.value}
                  style={[styles.purposeChip,
                    values.purpose === p.value && styles.purposeChipOn]}
                  onPress={() => setValues((v) => ({ ...v, purpose: p.value }))}
                >
                  <Text style={[styles.purposeChipText,
                    values.purpose === p.value && { color: "#fff" }]}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Travelers */}
            <Text style={styles.lbl}>Travelers</Text>
            <View style={styles.travelersRow}>
              <TouchableOpacity
                style={styles.travelerBtn}
                onPress={() => setValues((v) => ({
                  ...v, travelers: Math.max(1, (v.travelers || 1) - 1),
                }))}
              >
                <Text style={styles.travelerBtnText}>–</Text>
              </TouchableOpacity>
              <View style={styles.travelerCount}>
                <Users size={12} color={colors.primaryGlow} />
                <Text style={styles.travelerCountText}>{values.travelers}</Text>
              </View>
              <TouchableOpacity
                style={styles.travelerBtn}
                onPress={() => setValues((v) => ({
                  ...v, travelers: Math.min(9, (v.travelers || 1) + 1),
                }))}
              >
                <Text style={styles.travelerBtnText}>+</Text>
              </TouchableOpacity>
            </View>

            {/* Save */}
            <TouchableOpacity
              style={[styles.saveBtn, saving && { opacity: 0.5 }]}
              onPress={submit}
              disabled={saving}
              testID="save-trip"
            >
              {saving ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={styles.saveBtnText}>Save Trip</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>

      {/* Airport picker sheet */}
      <AirportPickerModal
        visible={pickerTarget !== null}
        onClose={() => setPickerTarget(null)}
        onPick={(a) => {
          if (pickerTarget === "departure") {
            setValues((v) => ({
              ...v,
              departure_iata: a.iata,
              departure_city: a.city,
              departure_airport_name: a.name,
            }));
          } else if (pickerTarget === "destination") {
            setValues((v) => ({
              ...v,
              destination_iata: a.iata,
              destination_city: a.city,
              destination_airport_name: a.name,
              destination_country: a.country,
              country: v.country || a.country,
              country_code: v.country_code || (a.country || "").slice(0, 2).toUpperCase(),
              city: v.city || a.city,
            }));
          }
          setPickerTarget(null);
        }}
        title={pickerTarget === "departure" ? "Departure airport" : "Destination airport"}
      />

      {/* Add-route modal */}
      <AddRouteModal
        visible={showAddRoute}
        onClose={() => setShowAddRoute(false)}
        onSaved={async () => {
          const r = await routesApi.list();
          setRoutes(r.routes || []);
          setShowAddRoute(false);
        }}
      />
    </Modal>
  );
}

// ================================================================
// AirportConfirmedCard
// ================================================================
function AirportConfirmedCard({
  iata, name, city, autoFilled, onChange, testID,
}: {
  iata: string; name: string; city: string;
  autoFilled?: boolean; onChange: () => void; testID?: string;
}) {
  return (
    <View style={styles.confirmedCard} testID={testID}>
      <View style={styles.confirmedIata}>
        <Plane size={12} color="#fff" />
        <Text style={styles.confirmedIataText}>{iata}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.confirmedName} numberOfLines={1}>{name}</Text>
        <Text style={styles.confirmedCity} numberOfLines={1}>{city}</Text>
        {autoFilled && (
          <View style={styles.autoBadge}>
            <Info size={9} color={colors.primaryGlow} />
            <Text style={styles.autoBadgeText}>Auto-filled from home · tap to change</Text>
          </View>
        )}
      </View>
      <TouchableOpacity style={styles.changeBtn} onPress={onChange}>
        <Text style={styles.changeBtnText}>Change</Text>
      </TouchableOpacity>
    </View>
  );
}

// ================================================================
// AirportPickerModal — search dropdown
// ================================================================
function AirportPickerModal({ visible, onClose, onPick, title }: {
  visible: boolean; onClose: () => void; onPick: (a: Airport) => void; title: string;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Airport[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setQ(""); setResults([]);
  }, [visible]);

  useEffect(() => {
    if (!q || q.length < 1) { setResults([]); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await airportsApi.search(q);
        setResults(r.results);
      } catch { /* silent */ }
      finally { setLoading(false); }
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  if (!visible) return null;
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.pickerBackdrop}>
        <View style={styles.pickerSheet}>
          <View style={styles.head}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onClose}><X size={18} color={colors.textTertiary} /></TouchableOpacity>
          </View>
          <View style={styles.searchWrap}>
            <Search size={14} color={colors.textTertiary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Try ATL · Atlanta · Hartsfield · Philippines"
              placeholderTextColor={colors.textTertiary}
              autoFocus
              value={q}
              onChangeText={setQ}
              autoCapitalize="characters"
              testID="airport-search-input"
            />
            {loading && <ActivityIndicator size="small" color={colors.primaryGlow} />}
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 400 }}>
            {results.map((a) => (
              <TouchableOpacity
                key={a.iata}
                style={styles.resultRow}
                onPress={() => onPick(a)}
                testID={`airport-result-${a.iata}`}
              >
                <View style={styles.resultIata}>
                  <Text style={styles.resultIataText}>{a.iata}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.resultName} numberOfLines={1}>{a.name}</Text>
                  <Text style={styles.resultCity} numberOfLines={1}>
                    {a.city}{a.region ? `, ${a.region}` : ""}, {a.country}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
            {!loading && q.length >= 1 && results.length === 0 && (
              <Text style={styles.noResults}>No airports match {"\u201C"}{q}{"\u201D"}</Text>
            )}
            {q.length < 1 && (
              <Text style={styles.hint}>Type a city, airport name, or 3-letter IATA code</Text>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ================================================================
// AddRouteModal
// ================================================================
function AddRouteModal({ visible, onClose, onSaved }: {
  visible: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [origin, setOrigin] = useState<Airport | null>(null);
  const [destination, setDestination] = useState<Airport | null>(null);
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<null | "o" | "d">(null);

  useEffect(() => {
    if (!visible) { setOrigin(null); setDestination(null); setLabel(""); }
  }, [visible]);

  async function save() {
    if (!origin || !destination) return;
    setSaving(true);
    try {
      await routesApi.create({
        origin_iata: origin.iata,
        destination_iata: destination.iata,
        label: label.trim() || `${origin.city} to ${destination.city}`,
      });
      onSaved();
    } catch (e: any) {
      Alert.alert("Failed", String(e?.message || e));
    } finally { setSaving(false); }
  }

  if (!visible) return null;
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.pickerBackdrop}>
        <View style={styles.pickerSheet}>
          <View style={styles.head}>
            <Text style={styles.title}>Add saved route</Text>
            <TouchableOpacity onPress={onClose}><X size={18} color={colors.textTertiary} /></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 12 }}>
            <Text style={styles.lbl}>Origin</Text>
            <TouchableOpacity style={styles.emptyField} onPress={() => setPickerTarget("o")}>
              {origin ? (
                <>
                  <Plane size={12} color={colors.primaryGlow} />
                  <Text style={styles.emptyFieldText}>
                    {origin.iata} — {origin.name}
                  </Text>
                </>
              ) : (
                <>
                  <Plane size={12} color={colors.textTertiary} />
                  <Text style={styles.emptyFieldText}>Choose origin</Text>
                </>
              )}
            </TouchableOpacity>

            <Text style={styles.lbl}>Destination</Text>
            <TouchableOpacity style={styles.emptyField} onPress={() => setPickerTarget("d")}>
              {destination ? (
                <>
                  <MapPin size={12} color={colors.primaryGlow} />
                  <Text style={styles.emptyFieldText}>
                    {destination.iata} — {destination.name}
                  </Text>
                </>
              ) : (
                <>
                  <MapPin size={12} color={colors.textTertiary} />
                  <Text style={styles.emptyFieldText}>Choose destination</Text>
                </>
              )}
            </TouchableOpacity>

            <Text style={styles.lbl}>Label (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder={origin && destination ? `${origin.city} to ${destination.city}` : "Trip name"}
              placeholderTextColor={colors.textTertiary}
              value={label}
              onChangeText={setLabel}
            />

            <TouchableOpacity
              style={[styles.saveBtn,
                (!origin || !destination || saving) && { opacity: 0.5 }]}
              onPress={save}
              disabled={!origin || !destination || saving}
            >
              {saving ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={styles.saveBtnText}>Save route</Text>}
            </TouchableOpacity>
          </ScrollView>

          <AirportPickerModal
            visible={pickerTarget !== null}
            onClose={() => setPickerTarget(null)}
            onPick={(a) => {
              if (pickerTarget === "o") setOrigin(a);
              else if (pickerTarget === "d") setDestination(a);
              setPickerTarget(null);
            }}
            title={pickerTarget === "o" ? "Origin airport" : "Destination airport"}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: {
    backgroundColor: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: "92%",
  },
  head: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: 16, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle,
  },
  title: { color: colors.textPrimary, fontSize: 15, fontWeight: "800" },
  lbl: { color: colors.textTertiary, fontSize: 10, fontWeight: "800",
        letterSpacing: 0.5, marginTop: 10, marginBottom: 5 },
  input: {
    backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1,
    borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 10,
    color: colors.textPrimary, fontSize: 13,
  },
  inputWithIcon: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1,
    borderRadius: radius.sm, paddingHorizontal: 10,
  },
  inputNoBorder: { borderWidth: 0, paddingHorizontal: 4, flex: 1 },
  row2: { flexDirection: "row", gap: 10 },

  emptyField: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1,
    borderStyle: "solid", borderRadius: radius.sm,
    paddingHorizontal: 12, paddingVertical: 14,
  },
  emptyFieldText: { color: colors.textSecondary, fontSize: 12, flex: 1 },

  confirmedCard: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: colors.surfaceElevated, borderColor: colors.primaryGlow,
    borderWidth: 1, borderRadius: radius.sm, padding: 10,
  },
  confirmedIata: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: colors.primary, paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 6,
  },
  confirmedIataText: { color: "#fff", fontSize: 12, fontWeight: "900",
                       letterSpacing: 0.5 },
  confirmedName: { color: colors.textPrimary, fontSize: 12, fontWeight: "700" },
  confirmedCity: { color: colors.textSecondary, fontSize: 11, marginTop: 1 },
  autoBadge: {
    flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3,
    alignSelf: "flex-start",
  },
  autoBadgeText: { color: colors.primaryGlow, fontSize: 9, fontWeight: "700" },
  changeBtn: {
    backgroundColor: colors.primaryMuted, paddingHorizontal: 10,
    paddingVertical: 6, borderRadius: radius.sm,
  },
  changeBtnText: { color: colors.primaryGlow, fontSize: 10, fontWeight: "800" },

  swapRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginVertical: 6,
  },
  swapDivider: { flex: 1, height: 1, backgroundColor: colors.borderSubtle },
  swapBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.primary, alignItems: "center", justifyContent: "center",
  },

  routesRow: { gap: 6, paddingRight: 20 },
  routeChipWrap: { position: "relative" },
  routeChip: {
    flexDirection: "column", alignItems: "flex-start",
    backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1,
    borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 6,
    gap: 2, minWidth: 100,
  },
  routeChipIata: { color: colors.primaryGlow, fontSize: 10, fontWeight: "900",
                   letterSpacing: 0.5 },
  routeChipLabel: { color: colors.textSecondary, fontSize: 10, fontWeight: "600" },
  routeChipDel: {
    position: "absolute", top: -6, right: -6,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: "rgba(239,68,68,0.20)",
    alignItems: "center", justifyContent: "center",
  },

  purposeRow: { gap: 6, paddingRight: 20 },
  purposeChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
    backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1,
  },
  purposeChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  purposeChipText: { color: colors.textSecondary, fontSize: 11, fontWeight: "700" },

  travelersRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    marginTop: 4,
  },
  travelerBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1,
    alignItems: "center", justifyContent: "center",
  },
  travelerBtnText: { color: colors.primaryGlow, fontSize: 18, fontWeight: "800" },
  travelerCount: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: colors.surfaceElevated, paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: radius.sm,
  },
  travelerCountText: { color: colors.textPrimary, fontSize: 14, fontWeight: "800" },

  saveBtn: {
    marginTop: 16, backgroundColor: colors.primary, borderRadius: radius.sm,
    paddingVertical: 14, alignItems: "center",
  },
  saveBtnText: { color: "#fff", fontSize: 14, fontWeight: "900" },

  pickerBackdrop: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center", alignItems: "center", padding: 20,
  },
  pickerSheet: {
    width: "100%", maxWidth: 500, maxHeight: "85%",
    backgroundColor: colors.bg, borderRadius: 16,
    overflow: "hidden",
  },
  searchWrap: {
    flexDirection: "row", alignItems: "center", gap: 6,
    padding: 12, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle,
    backgroundColor: colors.surface,
  },
  searchInput: {
    flex: 1, color: colors.textPrimary, fontSize: 13,
    paddingVertical: Platform.OS === "ios" ? 6 : 4,
  },
  resultRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: colors.borderSubtle,
  },
  resultIata: {
    backgroundColor: colors.primaryMuted, paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 6, minWidth: 44, alignItems: "center",
  },
  resultIataText: { color: colors.primaryGlow, fontSize: 12, fontWeight: "900" },
  resultName: { color: colors.textPrimary, fontSize: 12, fontWeight: "700" },
  resultCity: { color: colors.textSecondary, fontSize: 10, marginTop: 1 },
  noResults: { color: colors.textTertiary, fontSize: 11, textAlign: "center", padding: 30 },
  hint: { color: colors.textTertiary, fontSize: 11, textAlign: "center", padding: 20 },
});
