// Travel home — Philippines pinned card + Plan a Trip + Upcoming Trips + Deal Alerts.
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Linking,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import {
  ArrowLeft,
  Plane,
  Plus,
  Search,
  Calendar,
  MapPin,
  ShieldAlert,
  ChevronRight,
  TrendingDown,
  ExternalLink,
  Compass,
  BookOpen,
  Pencil,
} from "lucide-react-native";
import { travelApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";
import { EditModal, type Field } from "@/src/components/EditModal";

const advisoryColor = (level?: number) => {
  if (level === 1) return colors.success;
  if (level === 2) return colors.warning;
  if (level === 3) return "#F97316";
  if (level === 4) return colors.danger;
  return colors.textSecondary;
};

const statusColor = (s: string) => {
  if (s === "booked") return colors.primaryGlow;
  if (s === "completed") return colors.textSecondary;
  return colors.warning;
};
const statusLabel = (s: string) => (s || "planning").replace("_", " ").replace(/^./, (c) => c.toUpperCase());

const NEW_TRIP_FIELDS: Field[] = [
  { key: "destination_name", label: "Destination Name", kind: "text", placeholder: "e.g. Tokyo" },
  { key: "city", label: "City", kind: "text", placeholder: "Tokyo" },
  { key: "country", label: "Country", kind: "text", placeholder: "Japan" },
  { key: "country_code", label: "Country Code (ISO 2)", kind: "text", placeholder: "JP" },
  { key: "departure_date", label: "Departure (YYYY-MM-DD)", kind: "text", placeholder: "2026-09-15" },
  { key: "return_date", label: "Return (YYYY-MM-DD)", kind: "text", placeholder: "2026-09-25" },
  {
    key: "purpose", label: "Purpose", kind: "select",
    options: [
      { value: "business", label: "Business" },
      { value: "leisure", label: "Leisure" },
      { value: "eden_heights", label: "Eden Heights Development" },
      { value: "family", label: "Family Visit" },
      { value: "conference", label: "Conference / Training" },
      { value: "medical", label: "Medical" },
      { value: "mixed", label: "Mixed" },
    ],
  },
  {
    key: "status", label: "Status", kind: "select",
    options: [
      { value: "planning", label: "Planning" },
      { value: "booked", label: "Booked" },
      { value: "completed", label: "Completed" },
    ],
  },
];

const PH_EDIT_FIELDS: Field[] = [
  { key: "destination_name", label: "Card Title", kind: "text", placeholder: "e.g. Manila & Bulacan" },
  { key: "city", label: "Primary City", kind: "text", placeholder: "Manila" },
  {
    key: "purpose", label: "Trip Purpose (drives subtitle)", kind: "select",
    options: [
      { value: "business", label: "Business" },
      { value: "leisure", label: "Leisure" },
      { value: "eden_heights", label: "Eden Heights Development" },
      { value: "family", label: "Family Visit" },
      { value: "conference", label: "Conference / Training" },
      { value: "medical", label: "Medical" },
      { value: "mixed", label: "Mixed" },
    ],
  },
  { key: "departure_date", label: "Departure (YYYY-MM-DD)", kind: "text", placeholder: "2026-09-15" },
  { key: "return_date", label: "Return (YYYY-MM-DD)", kind: "text", placeholder: "2026-09-25" },
  {
    key: "status", label: "Status", kind: "select",
    options: [
      { value: "planning", label: "Planning" },
      { value: "booked", label: "Booked" },
      { value: "completed", label: "Completed" },
    ],
  },
];

const PURPOSE_LABELS: Record<string, string> = {
  business: "Business",
  leisure: "Leisure",
  eden_heights: "Eden Heights Development",
  family: "Family Visit",
  conference: "Conference / Training",
  medical: "Medical",
  mixed: "Mixed",
};

export default function TravelHome() {
  const router = useRouter();
  const [trips, setTrips] = useState<any[]>([]);
  const [deals, setDeals] = useState<any[]>([]);
  const [phTemplate, setPhTemplate] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorInitial, setEditorInitial] = useState<any | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creatingPH, setCreatingPH] = useState(false);
  const [phEditorOpen, setPhEditorOpen] = useState(false);
  const [phEditorInitial, setPhEditorInitial] = useState<any | null>(null);
  const [phEditingId, setPhEditingId] = useState<string | null>(null);

  const phTrip = trips.find((t) => (t.country_code || "").toUpperCase() === "PH");
  const phTitle = phTrip?.destination_name || "Philippines Quick Access";
  const phSubtitleCity = phTrip?.city || "Manila & Bulacan";
  const phPurposeKey = (phTrip?.purpose || phTemplate?.destination?.purpose || "eden_heights") as string;
  const phSubtitle = `${phSubtitleCity} · ${PURPOSE_LABELS[phPurposeKey] || PURPOSE_LABELS.eden_heights}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, d, p] = await Promise.all([
        travelApi.listTrips(),
        travelApi.deals(),
        travelApi.philippinesTemplate(),
      ]);
      setTrips(t?.trips || []);
      setDeals(d?.deals || []);
      setPhTemplate(p);
    } catch (_e) {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const openCreate = (preset?: any) => {
    setEditingId(null);
    setEditorInitial({
      destination_name: preset?.destination_name || "",
      city: preset?.city || "",
      country: preset?.country || "",
      country_code: preset?.country_code || "",
      departure_date: "",
      return_date: "",
      purpose: preset?.purpose || "leisure",
      status: "planning",
    });
    setEditorOpen(true);
  };

  const submitTrip = async (values: any) => {
    const payload: any = {
      destination_name: (values.destination_name || "").trim(),
      city: (values.city || "").trim(),
      country: (values.country || "").trim(),
      country_code: (values.country_code || "").trim().toUpperCase(),
      departure_date: values.departure_date || null,
      return_date: values.return_date || null,
      purpose: values.purpose || "leisure",
      status: values.status || "planning",
    };
    if (!payload.destination_name) throw new Error("Destination name required");
    if (!payload.country) throw new Error("Country required");
    const created = editingId
      ? await travelApi.updateTrip(editingId, payload)
      : await travelApi.createTrip(payload);
    setEditorOpen(false);
    await load();
    if (!editingId && created?.trip_id) router.push(`/travel/${created.trip_id}`);
  };

  const openPhEdit = () => {
    setPhEditingId(phTrip?.trip_id || null);
    setPhEditorInitial({
      destination_name: phTrip?.destination_name || phTemplate?.destination?.destination_name || "Manila & Bulacan",
      city: phTrip?.city || phTemplate?.destination?.city || "Manila",
      purpose: phTrip?.purpose || phTemplate?.destination?.purpose || "eden_heights",
      departure_date: phTrip?.departure_date || "",
      return_date: phTrip?.return_date || "",
      status: phTrip?.status || "planning",
    });
    setPhEditorOpen(true);
  };

  const submitPhEdit = async (values: any) => {
    const payload: any = {
      destination_name: (values.destination_name || "").trim() || "Manila & Bulacan",
      city: (values.city || "").trim() || "Manila",
      country: "Philippines",
      country_code: "PH",
      departure_date: values.departure_date || null,
      return_date: values.return_date || null,
      purpose: values.purpose || "eden_heights",
      status: values.status || "planning",
    };
    if (phEditingId) {
      await travelApi.updateTrip(phEditingId, payload);
    } else {
      const created = await travelApi.createTrip(payload);
      // Pre-cache PH insights on the new trip (fast hardcoded path)
      try {
        await travelApi.insights({
          destination_name: payload.destination_name,
          country: payload.country,
          country_code: payload.country_code,
          city: payload.city,
          purpose: payload.purpose,
          trip_id: created.trip_id,
        });
      } catch (_e) {}
    }
    setPhEditorOpen(false);
    await load();
  };

  const openPhilippines = async () => {
    if (!phTemplate) return;
    // Look for existing PH trip first
    const existing = trips.find((t) => (t.country_code || "").toUpperCase() === "PH");
    if (existing) { router.push(`/travel/${existing.trip_id}`); return; }
    setCreatingPH(true);
    try {
      const d = phTemplate.destination;
      const created = await travelApi.createTrip({
        destination_name: d.destination_name,
        city: d.city,
        country: d.country,
        country_code: d.country_code,
        purpose: d.purpose,
        status: "planning",
      });
      // Pre-cache PH insights on the new trip
      await travelApi.insights({
        destination_name: d.destination_name,
        country: d.country,
        country_code: d.country_code,
        city: d.city,
        purpose: d.purpose,
        trip_id: created.trip_id,
      });
      await load();
      router.push(`/travel/${created.trip_id}`);
    } catch (_e) {}
    setCreatingPH(false);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} testID="travel-back">
          <ArrowLeft color={colors.textPrimary} size={20} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Travel Advisor</Text>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.push("/travel/passport")} testID="open-passport">
          <BookOpen color={colors.textPrimary} size={18} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primaryGlow} />}
      >
        {/* Plan a Trip card */}
        <View style={styles.planCard} testID="plan-trip-card">
          <Text style={styles.planLabel}>PLAN A TRIP</Text>
          <View style={styles.searchRow}>
            <Search size={16} color={colors.textTertiary} style={{ marginLeft: 12 }} />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Where to next? (e.g. Tokyo, Manila, Paris)"
              placeholderTextColor={colors.textTertiary}
              testID="trip-search"
              onSubmitEditing={() => openCreate({ destination_name: search.trim(), city: search.trim(), country: search.trim() })}
              returnKeyType="go"
            />
          </View>
          <TouchableOpacity style={styles.planBtn} onPress={() => openCreate()} testID="new-trip" activeOpacity={0.85}>
            <Plus size={14} color="#fff" />
            <Text style={styles.planBtnText}>New Trip</Text>
          </TouchableOpacity>
        </View>

        {/* Philippines pinned card */}
        {phTemplate && (
          <TouchableOpacity
            style={styles.phCard}
            onPress={openPhilippines}
            disabled={creatingPH}
            testID="ph-pinned"
            activeOpacity={0.9}
          >
            <View style={styles.phHeader}>
              <Text style={styles.phEmoji}>🇵🇭 🌴</Text>
              <View style={styles.phHeaderRight}>
                <View style={styles.phPin}><Text style={styles.phPinText}>PINNED</Text></View>
                <TouchableOpacity
                  style={styles.phEditBtn}
                  onPress={(e) => { (e as any)?.stopPropagation?.(); openPhEdit(); }}
                  testID="ph-edit"
                  hitSlop={8}
                >
                  <Pencil size={14} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
            <Text style={styles.phTitle}>{phTitle}</Text>
            <Text style={styles.phSub}>{phSubtitle}</Text>
            <View style={styles.phStats}>
              <View style={styles.phStat}>
                <Text style={styles.phStatLabel}>1 USD =</Text>
                <Text style={styles.phStatValue}>
                  {phTemplate.live_rate ? `₱${Number(phTemplate.live_rate).toFixed(2)}` : "—"}
                </Text>
              </View>
              <View style={styles.phStatDivider} />
              <View style={styles.phStat}>
                <Text style={styles.phStatLabel}>ADVISORY</Text>
                <Text style={[styles.phStatValue, { color: advisoryColor(phTemplate.advisory?.level), fontSize: 14 }]}>
                  Level {phTemplate.advisory?.level}
                </Text>
              </View>
              <View style={styles.phStatDivider} />
              <View style={styles.phStat}>
                <Text style={styles.phStatLabel}>ROUTE</Text>
                <Text style={[styles.phStatValue, { fontSize: 14 }]}>ATL → MNL</Text>
              </View>
            </View>
            <View style={styles.phCta}>
              {creatingPH ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Compass size={14} color="#fff" />
                  <Text style={styles.phCtaText}>Open Trip Planner</Text>
                  <ChevronRight size={14} color="#fff" />
                </>
              )}
            </View>
          </TouchableOpacity>
        )}

        {/* Upcoming Trips */}
        <Text style={styles.sectionLabel}>UPCOMING TRIPS</Text>
        {loading ? (
          <ActivityIndicator color={colors.primaryGlow} style={{ marginTop: 20 }} />
        ) : trips.length === 0 ? (
          <View style={styles.empty}>
            <Plane size={28} color={colors.textTertiary} />
            <Text style={styles.emptyText}>No upcoming trips yet</Text>
            <Text style={styles.emptySub}>Tap + above to plan one</Text>
          </View>
        ) : (
          trips.map((t) => (
            <TouchableOpacity
              key={t.trip_id}
              style={styles.tripCard}
              onPress={() => router.push(`/travel/${t.trip_id}`)}
              testID={`trip-${t.trip_id}`}
              activeOpacity={0.85}
            >
              <View style={styles.tripIcon}><Text style={styles.tripFlag}>{t.flag || "🏳️"}</Text></View>
              <View style={{ flex: 1 }}>
                <View style={styles.tripTitleRow}>
                  <Text style={styles.tripTitle}>{t.destination_name}</Text>
                  <View style={[styles.statusPill, { backgroundColor: statusColor(t.status) + "22", borderColor: statusColor(t.status) }]}>
                    <Text style={[styles.statusPillText, { color: statusColor(t.status) }]}>{statusLabel(t.status)}</Text>
                  </View>
                </View>
                <View style={styles.tripMetaRow}>
                  <Calendar size={11} color={colors.textTertiary} />
                  <Text style={styles.tripMetaText}>
                    {t.departure_date || "No date"}{t.return_date ? ` → ${t.return_date}` : ""}
                  </Text>
                </View>
                <View style={styles.tripMetaRow}>
                  <MapPin size={11} color={colors.textTertiary} />
                  <Text style={styles.tripMetaText}>{t.country}</Text>
                  {typeof t.days_until_departure === "number" && t.days_until_departure >= 0 ? (
                    <View style={styles.daysPill}>
                      <Text style={styles.daysPillText}>{t.days_until_departure === 0 ? "Today!" : `${t.days_until_departure}d to go`}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
              <ChevronRight size={16} color={colors.textTertiary} />
            </TouchableOpacity>
          ))
        )}

        {/* Travel Deal Alerts */}
        <Text style={styles.sectionLabel}>TRAVEL DEAL ALERTS</Text>
        <View style={styles.mockBadgeRow}>
          <Text style={styles.mockBadge}>MOCKED · Demo Data</Text>
        </View>
        {deals.map((d) => (
          <TouchableOpacity
            key={d.deal_id}
            style={styles.dealCard}
            onPress={() => Linking.openURL(d.deeplink).catch(() => {})}
            testID={`deal-${d.deal_id}`}
            activeOpacity={0.85}
          >
            <View style={[styles.dealIcon, { backgroundColor: "rgba(16,185,129,0.15)" }]}>
              <TrendingDown size={16} color={colors.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.dealTitle}>{d.origin_code} → {d.destination_code} · {d.destination_name}</Text>
              <Text style={styles.dealSub}>
                ${d.current_price_usd} round-trip · {d.discount_pct}% below 90-day avg ${d.average_price_usd}
              </Text>
              <View style={styles.dealMetaRow}>
                <Text style={[styles.dealMetaText, { color: colors.warning }]}>Expires in {d.expires_in_days}d</Text>
                <Text style={styles.dealMetaText}>· {d.tag}</Text>
              </View>
            </View>
            <ExternalLink size={14} color={colors.textTertiary} />
          </TouchableOpacity>
        ))}

        <View style={{ height: 40 }} />
      </ScrollView>

      <EditModal
        visible={editorOpen}
        title={editingId ? "Edit Trip" : "New Trip"}
        fields={NEW_TRIP_FIELDS}
        initial={editorInitial || {}}
        onClose={() => setEditorOpen(false)}
        onSubmit={submitTrip}
        testID="trip-editor"
      />

      <EditModal
        visible={phEditorOpen}
        title={phEditingId ? "Edit Philippines Quick Access" : "Set up Philippines Quick Access"}
        fields={PH_EDIT_FIELDS}
        initial={phEditorInitial || {}}
        onClose={() => setPhEditorOpen(false)}
        onSubmit={submitPhEdit}
        testID="ph-editor"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  iconBtn: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.surfaceElevated, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  scroll: { padding: spacing.xl, gap: spacing.md, paddingBottom: 80 },
  planCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.borderSubtle, gap: spacing.md },
  planLabel: { color: colors.textTertiary, fontSize: 10, fontWeight: "700", letterSpacing: 1.2 },
  searchRow: { flexDirection: "row", alignItems: "center", backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderSubtle },
  searchInput: { flex: 1, color: colors.textPrimary, fontSize: 14, paddingVertical: Platform.OS === "ios" ? 14 : 12, paddingHorizontal: 8 },
  planBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.primary, paddingVertical: 12, borderRadius: radius.md },
  planBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  phCard: { backgroundColor: "#0E3A5C", borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: "#2563EB", gap: spacing.sm, overflow: "hidden" },
  phHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  phHeaderRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  phEditBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.15)", borderWidth: 1, borderColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  phEmoji: { fontSize: 24 },
  phPin: { backgroundColor: "rgba(20,184,166,0.25)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm, borderWidth: 1, borderColor: "#14B8A6" },
  phPinText: { color: "#5EEAD4", fontSize: 9, fontWeight: "700", letterSpacing: 0.8 },
  phTitle: { color: "#fff", fontSize: 17, fontWeight: "700" },
  phSub: { color: "#94CCE5", fontSize: 12, marginBottom: 4 },
  phStats: { flexDirection: "row", backgroundColor: "rgba(0,0,0,0.25)", borderRadius: radius.md, paddingVertical: spacing.sm, marginTop: spacing.xs },
  phStat: { flex: 1, alignItems: "center" },
  phStatDivider: { width: 1, backgroundColor: "rgba(255,255,255,0.1)" },
  phStatLabel: { color: "#94CCE5", fontSize: 9, fontWeight: "700", letterSpacing: 0.8 },
  phStatValue: { color: "#fff", fontSize: 17, fontWeight: "700", marginTop: 2 },
  phCta: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: spacing.xs, paddingVertical: 10, backgroundColor: "rgba(20,184,166,0.3)", borderRadius: radius.md, borderWidth: 1, borderColor: "#14B8A6" },
  phCtaText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  sectionLabel: { color: colors.textTertiary, fontSize: 10, fontWeight: "700", letterSpacing: 1.2, marginTop: spacing.md },
  empty: { alignItems: "center", padding: spacing.xxxl, gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderSubtle },
  emptyText: { color: colors.textSecondary, fontSize: 14 },
  emptySub: { color: colors.textTertiary, fontSize: 12 },
  tripCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.borderSubtle },
  tripIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  tripFlag: { fontSize: 22 },
  tripTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  tripTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: "700", flex: 1 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm, borderWidth: 1 },
  statusPillText: { fontSize: 9, fontWeight: "700", letterSpacing: 0.5 },
  tripMetaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  tripMetaText: { color: colors.textTertiary, fontSize: 11 },
  daysPill: { marginLeft: "auto", backgroundColor: colors.primaryMuted, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm },
  daysPillText: { color: colors.primaryGlow, fontSize: 10, fontWeight: "700" },
  mockBadgeRow: { flexDirection: "row", alignItems: "center", marginTop: -spacing.sm },
  mockBadge: { color: colors.textTertiary, fontSize: 9, fontWeight: "700", letterSpacing: 1, backgroundColor: colors.surfaceElevated, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm, alignSelf: "flex-start" },
  dealCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.borderSubtle },
  dealIcon: { width: 36, height: 36, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  dealTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: "700" },
  dealSub: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  dealMetaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  dealMetaText: { color: colors.textTertiary, fontSize: 11 },
});
