// Trip Planner detail — destination overview + Claude insights + flights/hotels + checklist + cost.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Alert,
  Platform,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  Plane,
  Calendar,
  Clock,
  Globe,
  AlertTriangle,
  ShieldAlert,
  FileText,
  Heart,
  Backpack,
  CheckCircle2,
  Circle as CircleIcon,
  ExternalLink,
  Phone,
  MapPin,
  TreePine,
  RefreshCw,
  Sparkles,
  Trash2,
  Pin,
  PinOff,
  RadioTower,
  DollarSign,
} from "lucide-react-native";
import { travelApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";
import { LiveTripSearchResults } from "@/src/components/LiveTripSearchResults";

const advisoryColor = (level?: number) => {
  if (level === 1) return colors.success;
  if (level === 2) return colors.warning;
  if (level === 3) return "#F97316";
  if (level === 4) return colors.danger;
  return colors.textSecondary;
};

const fmtUSD = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export default function TripPlanner() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [trip, setTrip] = useState<any | null>(null);
  const [insights, setInsights] = useState<any | null>(null);
  const [advisory, setAdvisory] = useState<any | null>(null);
  const [flights, setFlights] = useState<any[]>([]);
  const [hotels, setHotels] = useState<any[]>([]);
  const [checklist, setChecklist] = useState<any[]>([]);
  const [cost, setCost] = useState<any>({ flights: 0, hotel_per_night: 0, nights: 0, daily_budget: 0, days: 0, visa_fees: 0, insurance: 0, misc: 0 });
  const [loading, setLoading] = useState(true);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [pinning, setPinning] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const t = await travelApi.getTrip(id);
      setTrip(t);
      const code = (t?.country_code || "").toUpperCase();
      // Parallel fetches
      const [adv, fl, ho, ck, ce] = await Promise.all([
        code ? travelApi.advisory(code) : Promise.resolve(null),
        travelApi.flights("ATL", code === "PH" ? "MNL" : (t?.city ? t.city.slice(0, 3).toUpperCase() : "MNL")),
        travelApi.hotels(t?.city || "Manila"),
        travelApi.checklist(id),
        travelApi.costEstimate(id),
      ]);
      setAdvisory(adv);
      setFlights(fl?.flights || []);
      setHotels(ho?.hotels || []);
      setChecklist(ck?.items || []);
      setCost(ce?.estimate || cost);

      // Insights — load cached or trigger Claude
      if (t?.cached_insights) {
        setInsights(t.cached_insights);
      } else {
        setInsightsLoading(true);
        try {
          const r = await travelApi.insights({
            destination_name: t?.destination_name,
            country: t?.country,
            country_code: code,
            city: t?.city,
            purpose: t?.purpose || "leisure",
            trip_id: id,
            duration_days: cost?.days || undefined,
          });
          setInsights(r?.insights);
        } catch (_e) {
          // leave null — UI shows refresh button
        }
        setInsightsLoading(false);
      }
    } catch (_e) {}
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const refreshInsights = async () => {
    if (!id || !trip) return;
    setInsightsLoading(true);
    try {
      const r = await travelApi.insights({
        destination_name: trip.destination_name,
        country: trip.country,
        country_code: (trip.country_code || "").toUpperCase(),
        city: trip.city,
        purpose: trip.purpose || "leisure",
        trip_id: id,
        duration_days: cost?.days || undefined,
        force_refresh: true,
      });
      setInsights(r?.insights);
    } catch (_e) {
      Alert.alert("Failed", "Could not refresh insights.");
    }
    setInsightsLoading(false);
  };

  const togglePin = async () => {
    if (!id || !trip) return;
    setPinning(true);
    try {
      await travelApi.pinTrip(String(id), !trip.pinned);
      const t = await travelApi.getTrip(String(id));
      setTrip(t);
    } catch (_e) {}
    setPinning(false);
  };

  const scanAndUpdate = async () => {
    if (!id) return;
    setScanning(true);
    try {
      const r = await travelApi.scanTrip(String(id));
      // Refresh trip to pick up the new scan_result / last_scanned_at
      const t = await travelApi.getTrip(String(id));
      setTrip(t);
      const oneWay = r?.best_one_way_usd ? `$${Math.round(r.best_one_way_usd)}` : "—";
      const round = r?.best_round_trip_usd ? `$${Math.round(r.best_round_trip_usd)}` : "—";
      Alert.alert("Prices refreshed", `One-way ${oneWay} · Round-trip ${round}`);
    } catch (_e) {
      Alert.alert("Scan failed", "Could not refresh prices right now. Try again shortly.");
    }
    setScanning(false);
  };

  const toggleCheck = async (idx: number) => {
    if (!id) return;
    const next = [...checklist];
    next[idx] = { ...next[idx], checked: !next[idx].checked };
    setChecklist(next);
    try { await travelApi.updateChecklist(id, next); } catch (_e) {}
  };

  const updateNote = async (idx: number, note: string) => {
    if (!id) return;
    const next = [...checklist];
    next[idx] = { ...next[idx], note };
    setChecklist(next);
  };

  const blurNote = async () => {
    if (!id) return;
    try { await travelApi.updateChecklist(id, checklist); } catch (_e) {}
  };

  const updateCostField = (k: string, v: string) => {
    const num = v.replace(/[^0-9.]/g, "");
    setCost((c: any) => ({ ...c, [k]: num === "" ? 0 : Number(num) }));
  };
  const saveCost = async () => {
    if (!id) return;
    try { await travelApi.updateCostEstimate(id, cost); } catch (_e) {}
  };

  const totalCost = useMemo(() => {
    return (
      Number(cost.flights || 0) +
      Number(cost.hotel_per_night || 0) * Number(cost.nights || 0) +
      Number(cost.daily_budget || 0) * Number(cost.days || 0) +
      Number(cost.visa_fees || 0) +
      Number(cost.insurance || 0) +
      Number(cost.misc || 0)
    );
  }, [cost]);

  const monthsOfSurplus = (totalCost / 920);

  const deleteTrip = () => {
    const proceed = async () => {
      if (!id) return;
      try { await travelApi.deleteTrip(id); router.replace("/travel"); } catch (_e) {}
    };
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm("Delete this trip? Checklist and cost data will be removed.")) proceed();
      return;
    }
    Alert.alert("Delete trip?", "Checklist and cost data will be removed.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: proceed },
    ]);
  };

  if (loading || !trip) {
    return <SafeAreaView style={styles.container} edges={["top"]}><ActivityIndicator color={colors.primaryGlow} style={{ marginTop: 60 }} /></SafeAreaView>;
  }

  const isPH = (trip.country_code || "").toUpperCase() === "PH";
  const advLevel = advisory?.level;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} testID="trip-back">
          <ArrowLeft color={colors.textPrimary} size={20} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{trip.destination_name}</Text>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={togglePin}
          disabled={pinning}
          testID="trip-pin"
        >
          {pinning ? <ActivityIndicator size="small" color={colors.primaryGlow} /> :
            trip.pinned ? <PinOff color={colors.primaryGlow} size={18} /> : <Pin color={colors.textSecondary} size={18} />}
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn} onPress={deleteTrip} testID="trip-delete">
          <Trash2 color={colors.danger} size={18} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Hero card — destination overview */}
        <View style={styles.heroCard} testID="trip-hero">
          <Text style={styles.heroFlag}>{trip.flag || "🏳️"}</Text>
          <Text style={styles.heroTitle}>{trip.destination_name}</Text>
          {(trip.departure_iata || trip.origin_iata) && trip.destination_iata && (
            <View style={styles.routeBar}>
              <View style={styles.routeBarIata}>
                <Text style={styles.routeBarIataText}>{trip.departure_iata || trip.origin_iata}</Text>
              </View>
              <Text style={styles.routeBarArrow}>→</Text>
              <View style={styles.routeBarIata}>
                <Text style={styles.routeBarIataText}>{trip.destination_iata}</Text>
              </View>
            </View>
          )}
          {(trip.departure_city || trip.destination_city) && (
            <Text style={styles.routeCities}>
              {trip.departure_city || "Atlanta"} → {trip.destination_city || trip.city}
            </Text>
          )}
          {(trip.departure_airport_name || trip.destination_airport_name) && (
            <Text style={styles.routeAirports} numberOfLines={2}>
              {trip.departure_airport_name || "Hartsfield-Jackson"}
              {"  →  "}
              {trip.destination_airport_name || "—"}
            </Text>
          )}
          <Text style={styles.heroSub}>{[trip.city, trip.country].filter(Boolean).join(" · ")}</Text>
          {trip._migration_default_origin && (
            <TouchableOpacity
              style={styles.migrationBanner}
              onPress={async () => {
                await travelApi.updateTrip(String(id), { _migration_default_origin: false } as any);
                await load();
              }}
              testID="migration-dismiss"
            >
              <Text style={styles.migrationBannerText}>
                ⚠️ Departure defaulted to ATL (Atlanta) — tap to acknowledge, or Edit trip to change
              </Text>
            </TouchableOpacity>
          )}
          <View style={styles.heroRow}>
            <View style={styles.heroMeta}>
              <Calendar size={11} color={colors.textTertiary} />
              <Text style={styles.heroMetaText}>{trip.departure_date || "TBD"}{trip.return_date ? ` → ${trip.return_date}` : ""}</Text>
            </View>
            {typeof trip.days_until_departure === "number" && trip.days_until_departure >= 0 && (
              <View style={styles.heroPill}>
                <Text style={styles.heroPillText}>{trip.days_until_departure === 0 ? "Today!" : `${trip.days_until_departure}d to go`}</Text>
              </View>
            )}
          </View>
          {insights?.time_zone && (
            <View style={styles.heroMeta}>
              <Clock size={11} color={colors.textTertiary} />
              <Text style={styles.heroMetaText}>{insights.time_zone}</Text>
            </View>
          )}
        </View>

        {/* Live prices — scan & update */}
        <View style={styles.card} testID="scan-card">
          <View style={styles.cardHeader}>
            <Text style={styles.cardLabel}>LIVE PRICES</Text>
            <TouchableOpacity
              style={[styles.scanBtn, scanning && { opacity: 0.6 }]}
              onPress={scanAndUpdate}
              disabled={scanning}
              testID="scan-btn"
              activeOpacity={0.85}
            >
              {scanning ? <ActivityIndicator size="small" color="#fff" /> : <RadioTower size={13} color="#fff" />}
              <Text style={styles.scanBtnText}>{scanning ? "Scanning…" : trip.scan_result ? "Rescan" : "Scan"}</Text>
            </TouchableOpacity>
          </View>
          {trip.scan_result ? (
            <>
              <View style={styles.priceStrip}>
                <View style={styles.priceCell}>
                  <Text style={styles.priceLabel}>ONE-WAY</Text>
                  <Text style={styles.priceValue}>{fmtUSD(trip.scan_result.best_one_way_usd)}</Text>
                </View>
                <View style={styles.priceDivider} />
                <View style={styles.priceCell}>
                  <Text style={styles.priceLabel}>ROUND-TRIP</Text>
                  <Text style={styles.priceValue}>{fmtUSD(trip.scan_result.best_round_trip_usd)}</Text>
                </View>
                <View style={styles.priceDivider} />
                <View style={styles.priceCell}>
                  <Text style={styles.priceLabel}>HOTEL/NIGHT</Text>
                  <Text style={styles.priceValue}>{fmtUSD(trip.scan_result.avg_hotel_per_night_usd)}</Text>
                </View>
              </View>
              {/* Verifiable booking links — dates baked into the URLs */}
              {trip.scan_result.booking_links?.flights_one_way?.length ? (
                <View style={{ marginTop: spacing.sm }}>
                  <Text style={styles.bookingLabel}>VERIFY ONE-WAY PRICE ON</Text>
                  <View style={styles.bookingChipsRow}>
                    {trip.scan_result.booking_links.flights_one_way.map((b: any) => (
                      <TouchableOpacity
                        key={`ow-${b.platform}`}
                        style={styles.bookingChip}
                        onPress={() => Linking.openURL(b.url).catch(() => {})}
                        testID={`book-ow-${b.platform}`}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.bookingChipText}>{b.platform}</Text>
                        <ExternalLink size={11} color={colors.primaryGlow} />
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ) : null}
              {trip.scan_result.booking_links?.flights_round_trip?.length ? (
                <View style={{ marginTop: spacing.sm }}>
                  <Text style={styles.bookingLabel}>VERIFY ROUND-TRIP PRICE ON</Text>
                  <View style={styles.bookingChipsRow}>
                    {trip.scan_result.booking_links.flights_round_trip.map((b: any) => (
                      <TouchableOpacity
                        key={`rt-${b.platform}`}
                        style={styles.bookingChip}
                        onPress={() => Linking.openURL(b.url).catch(() => {})}
                        testID={`book-rt-${b.platform}`}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.bookingChipText}>{b.platform}</Text>
                        <ExternalLink size={11} color={colors.primaryGlow} />
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ) : null}
              {trip.scan_result.booking_links?.hotels?.length ? (
                <View style={{ marginTop: spacing.sm }}>
                  <Text style={styles.bookingLabel}>BOOK HOTEL ON</Text>
                  <View style={styles.bookingChipsRow}>
                    {trip.scan_result.booking_links.hotels.map((b: any) => (
                      <TouchableOpacity
                        key={`ho-${b.platform}`}
                        style={styles.bookingChip}
                        onPress={() => Linking.openURL(b.url).catch(() => {})}
                        testID={`book-ho-${b.platform}`}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.bookingChipText}>{b.platform}</Text>
                        <ExternalLink size={11} color={colors.primaryGlow} />
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ) : null}
              {trip.scan_result.weather_snapshot ? (
                <Text style={styles.body}>☀️ {trip.scan_result.weather_snapshot}</Text>
              ) : null}
              {trip.scan_result.top_deal ? (
                <View style={styles.dealBanner}>
                  <DollarSign size={12} color={colors.success} />
                  <Text style={styles.dealBannerText}>{trip.scan_result.top_deal}</Text>
                </View>
              ) : null}
              {trip.scan_result.notes ? (
                <Text style={styles.scannedMeta}>ℹ️ {trip.scan_result.notes}</Text>
              ) : null}
              <Text style={styles.scannedMeta}>
                Prices are AI-estimated ({trip.scan_result.price_confidence || "medium"} confidence).
                Tap any platform above to verify current live prices for these dates.
              </Text>
              <Text style={styles.scannedMeta}>
                Scanned {trip.last_scanned_at ? new Date(trip.last_scanned_at).toLocaleString() : "just now"}
                {trip.scan_result.platform_used ? ` · via ${trip.scan_result.platform_used}` : ""}
              </Text>
            </>
          ) : (
            <Text style={styles.body}>
              Tap Scan to fetch current one-way & round-trip prices, hotel rates, weather, and top deals for this trip.
              You&apos;ll get one-tap booking links to verify prices on Google Flights, Skyscanner, Kayak, Booking.com, and more.
            </Text>
          )}
        </View>

        {/* Advisory */}
        {advisory && (
          <View style={[styles.card, { borderColor: advisoryColor(advLevel) }]} testID="trip-advisory">
            <View style={styles.advisoryHeader}>
              <View style={[styles.advisoryBadge, { backgroundColor: advisoryColor(advLevel) + "22" }]}>
                <ShieldAlert size={16} color={advisoryColor(advLevel)} />
                {advLevel ? <Text style={[styles.advisoryLevel, { color: advisoryColor(advLevel) }]}>Level {advLevel}</Text> : null}
              </View>
              <Text style={[styles.advisorySummary, { color: advisoryColor(advLevel) }]}>{advisory.summary}</Text>
            </View>
            {advisory.notes ? <Text style={styles.advisoryNotes}>{advisory.notes}</Text> : null}
            {!advisory.cached && advisory.deeplink && (
              <TouchableOpacity style={styles.linkBtn} onPress={() => Linking.openURL(advisory.deeplink).catch(() => {})}>
                <ExternalLink size={12} color={colors.primaryGlow} />
                <Text style={styles.linkBtnText}>Open travel.state.gov</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* LIVE Flights + Hotels via SerpApi (with Claude fallback) */}
        <LiveTripSearchResults
          tripId={String(id)}
          destination={trip?.city || trip?.destination}
        />

        {/* Philippines extras */}
        {isPH && (
          <View style={styles.card} testID="ph-extras">
            <Text style={styles.cardLabel}>PHILIPPINES SPECIFIC</Text>
            <Text style={styles.phNoteTitle}>Immigration</Text>
            <Text style={styles.phNoteText}>US passport holders receive 30-day visa-free entry on arrival. For longer stays, extend at the Bureau of Immigration. Long-term: SRRV for property owners, or ACR I-Card.</Text>
            <Text style={[styles.phNoteTitle, { marginTop: spacing.sm }]}>Manila → Bulacan</Text>
            <Text style={styles.phNoteText}>~1-2 hours north via NLEX (toll). No direct public transit from MNL airport — pre-arrange a private vehicle or Grab car.</Text>
            <TouchableOpacity style={styles.crossLink} onPress={() => router.push("/business/eden")} testID="ph-open-eden">
              <TreePine size={14} color={colors.success} />
              <Text style={styles.crossLinkText}>Open Eden Heights Tracker</Text>
              <ExternalLink size={12} color={colors.success} />
            </TouchableOpacity>
          </View>
        )}

        {/* Claude Insights */}
        {insightsLoading ? (
          <View style={[styles.card, { alignItems: "center", paddingVertical: spacing.xl }]}>
            <ActivityIndicator color={colors.primaryGlow} size="large" />
            <Text style={styles.loadingText}>Asking Claude 4.5 about {trip.country}…</Text>
          </View>
        ) : insights ? (
          <>
            {/* Best time + cultural */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardLabel}>BEST TIME TO VISIT</Text>
                <TouchableOpacity onPress={refreshInsights} testID="refresh-insights">
                  <RefreshCw size={14} color={colors.textTertiary} />
                </TouchableOpacity>
              </View>
              <Text style={styles.body}>{insights.best_time_to_visit}</Text>
              {insights.cultural_notes ? (
                <>
                  <Text style={[styles.cardLabel, { marginTop: spacing.md }]}>CULTURAL CONTEXT</Text>
                  <Text style={styles.body}>{insights.cultural_notes}</Text>
                </>
              ) : null}
              <View style={styles.metaRow}>
                {insights.language ? <View style={styles.miniMeta}><Globe size={11} color={colors.textTertiary} /><Text style={styles.miniMetaText}>{insights.language}</Text></View> : null}
                {insights.local_currency ? <View style={styles.miniMeta}><Text style={[styles.miniMetaText, { fontWeight: "700" }]}>{insights.local_currency}</Text></View> : null}
              </View>
            </View>

            {/* Visa */}
            {insights.visa_requirement && (
              <View style={styles.card} testID="visa-card">
                <Text style={styles.cardLabel}>VISA REQUIREMENT (US PASSPORT)</Text>
                <View style={styles.metricsRow}>
                  <View style={styles.metric}>
                    <Text style={styles.metricLabel}>REQUIRED</Text>
                    <Text style={[styles.metricValue, { color: insights.visa_requirement.required ? colors.danger : colors.success }]}>
                      {insights.visa_requirement.required ? "Yes" : "No"}
                    </Text>
                  </View>
                  <View style={styles.metric}>
                    <Text style={styles.metricLabel}>TYPE</Text>
                    <Text style={styles.metricValue}>{insights.visa_requirement.type}</Text>
                  </View>
                </View>
                {insights.visa_requirement.processing_days ? (
                  <Text style={styles.body}>Processing: ~{insights.visa_requirement.processing_days} days{insights.visa_requirement.cost_usd ? ` · ~${fmtUSD(insights.visa_requirement.cost_usd)}` : ""}</Text>
                ) : null}
                <Text style={styles.body}>{insights.visa_requirement.notes}</Text>
                {insights.visa_requirement.apply_url && (
                  <TouchableOpacity style={styles.linkBtn} onPress={() => Linking.openURL(insights.visa_requirement.apply_url).catch(() => {})}>
                    <ExternalLink size={12} color={colors.primaryGlow} />
                    <Text style={styles.linkBtnText}>Apply / Learn more</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Vaccinations */}
            {Array.isArray(insights.vaccinations) && insights.vaccinations.length > 0 && (
              <View style={styles.card} testID="vaccines-card">
                <Text style={styles.cardLabel}>VACCINATIONS</Text>
                <View style={styles.chipsWrap}>
                  {insights.vaccinations.map((v: string, i: number) => (
                    <View key={i} style={styles.chip}><Heart size={10} color={colors.danger} /><Text style={styles.chipText}>{v}</Text></View>
                  ))}
                </View>
              </View>
            )}

            {/* Packing list */}
            {insights.packing_list && (
              <View style={styles.card} testID="packing-card">
                <View style={styles.cardHeader}>
                  <Text style={styles.cardLabel}>PACKING LIST</Text>
                  <Backpack size={14} color={colors.textTertiary} />
                </View>
                {["documents", "clothing", "electronics", "health", "other"].map((bucket) => {
                  const items = insights.packing_list[bucket] || [];
                  if (!items.length) return null;
                  return (
                    <View key={bucket} style={{ marginTop: spacing.sm }}>
                      <Text style={styles.bucketLabel}>{bucket.toUpperCase()}</Text>
                      {items.map((it: string, i: number) => (
                        <View key={i} style={styles.bullet}><Text style={styles.bulletDot}>•</Text><Text style={styles.bulletText}>{it}</Text></View>
                      ))}
                    </View>
                  );
                })}
              </View>
            )}

            {/* Do's & Don'ts */}
            {(insights.dos?.length || insights.donts?.length) ? (
              <View style={styles.card} testID="dosdonts-card">
                <Text style={styles.cardLabel}>DO&apos;S & DON&apos;TS</Text>
                <Text style={styles.bucketLabel}>DO</Text>
                {(insights.dos || []).map((d: string, i: number) => (
                  <View key={i} style={styles.bullet}><CheckCircle2 size={12} color={colors.success} /><Text style={styles.bulletText}>{d}</Text></View>
                ))}
                <Text style={[styles.bucketLabel, { marginTop: spacing.sm }]}>DON&apos;T</Text>
                {(insights.donts || []).map((d: string, i: number) => (
                  <View key={i} style={styles.bullet}><AlertTriangle size={12} color={colors.danger} /><Text style={styles.bulletText}>{d}</Text></View>
                ))}
              </View>
            ) : null}

            {/* Emergency contacts */}
            {insights.emergency_contacts && (
              <View style={styles.card} testID="emergency-card">
                <Text style={styles.cardLabel}>EMERGENCY CONTACTS</Text>
                {insights.emergency_contacts.police ? (
                  <TouchableOpacity style={styles.emRow} onPress={() => Linking.openURL(`tel:${insights.emergency_contacts.police.split(/[^\d+]/)[0]}`).catch(() => {})}>
                    <Phone size={13} color={colors.danger} /><Text style={styles.emLabel}>Police</Text><Text style={styles.emValue}>{insights.emergency_contacts.police}</Text>
                  </TouchableOpacity>
                ) : null}
                {insights.emergency_contacts.ambulance ? (
                  <TouchableOpacity style={styles.emRow} onPress={() => Linking.openURL(`tel:${insights.emergency_contacts.ambulance.split(/[^\d+]/)[0]}`).catch(() => {})}>
                    <Phone size={13} color={colors.danger} /><Text style={styles.emLabel}>Ambulance</Text><Text style={styles.emValue}>{insights.emergency_contacts.ambulance}</Text>
                  </TouchableOpacity>
                ) : null}
                {insights.emergency_contacts.us_embassy_phone ? (
                  <TouchableOpacity style={styles.emRow} onPress={() => Linking.openURL(`tel:${insights.emergency_contacts.us_embassy_phone.replace(/[^\d+]/g, "")}`).catch(() => {})}>
                    <Phone size={13} color={colors.primaryGlow} /><Text style={styles.emLabel}>US Embassy</Text><Text style={styles.emValue}>{insights.emergency_contacts.us_embassy_phone}</Text>
                  </TouchableOpacity>
                ) : null}
                {insights.emergency_contacts.us_embassy_address ? (
                  <View style={styles.emRow}>
                    <MapPin size={13} color={colors.textTertiary} />
                    <Text style={[styles.emValue, { flex: 1 }]}>{insights.emergency_contacts.us_embassy_address}</Text>
                  </View>
                ) : null}
              </View>
            )}
          </>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>DESTINATION INSIGHTS</Text>
            <Text style={styles.body}>Generate Claude 4.5 insights for {trip.country}: visa, vaccinations, packing list, cultural do&apos;s & don&apos;ts, emergency contacts.</Text>
            <TouchableOpacity style={styles.genBtn} onPress={refreshInsights} testID="generate-insights" activeOpacity={0.85}>
              <Sparkles size={14} color="#fff" />
              <Text style={styles.genBtnText}>Generate Insights</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* AI-searched Flights + Hotels (replaces mocked lists) */}

        {/* Pre-Travel Checklist */}
        <View style={styles.card} testID="checklist-card">
          <Text style={styles.cardLabel}>PRE-TRAVEL CHECKLIST</Text>
          {checklist.map((it: any, i: number) => (
            <View key={it.key} style={styles.checkItem}>
              <TouchableOpacity style={styles.checkRow} onPress={() => toggleCheck(i)} testID={`check-${it.key}`} activeOpacity={0.7}>
                {it.checked ? <CheckCircle2 size={18} color={colors.success} /> : <CircleIcon size={18} color={colors.textTertiary} />}
                <Text style={[styles.checkText, it.checked && { color: colors.textTertiary, textDecorationLine: "line-through" }]}>{it.label}</Text>
              </TouchableOpacity>
              {it.note_label ? (
                <TextInput
                  style={styles.noteInput}
                  value={it.note || ""}
                  onChangeText={(v) => updateNote(i, v)}
                  onBlur={blurNote}
                  placeholder={it.note_label}
                  placeholderTextColor={colors.textTertiary}
                  testID={`note-${it.key}`}
                />
              ) : it.note ? (
                <Text style={styles.noteText}>{it.note}</Text>
              ) : null}
            </View>
          ))}
        </View>

        {/* Trip Cost Estimator */}
        <View style={styles.card} testID="cost-card">
          <Text style={styles.cardLabel}>TRIP COST ESTIMATOR</Text>
          <View style={styles.costGrid}>
            <View style={styles.costField}>
              <Text style={styles.fieldLabel}>FLIGHTS</Text>
              <TextInput style={styles.costInput} value={String(cost.flights || "")} onChangeText={(v) => updateCostField("flights", v)} onBlur={saveCost} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colors.textTertiary} testID="cost-flights" />
            </View>
            <View style={styles.costField}>
              <Text style={styles.fieldLabel}>HOTEL/NIGHT</Text>
              <TextInput style={styles.costInput} value={String(cost.hotel_per_night || "")} onChangeText={(v) => updateCostField("hotel_per_night", v)} onBlur={saveCost} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colors.textTertiary} testID="cost-hotel" />
            </View>
            <View style={styles.costField}>
              <Text style={styles.fieldLabel}>NIGHTS</Text>
              <TextInput style={styles.costInput} value={String(cost.nights || "")} onChangeText={(v) => updateCostField("nights", v)} onBlur={saveCost} keyboardType="number-pad" placeholder="0" placeholderTextColor={colors.textTertiary} testID="cost-nights" />
            </View>
            <View style={styles.costField}>
              <Text style={styles.fieldLabel}>DAILY BUDGET</Text>
              <TextInput style={styles.costInput} value={String(cost.daily_budget || "")} onChangeText={(v) => updateCostField("daily_budget", v)} onBlur={saveCost} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colors.textTertiary} testID="cost-daily" />
            </View>
            <View style={styles.costField}>
              <Text style={styles.fieldLabel}>DAYS</Text>
              <TextInput style={styles.costInput} value={String(cost.days || "")} onChangeText={(v) => updateCostField("days", v)} onBlur={saveCost} keyboardType="number-pad" placeholder="0" placeholderTextColor={colors.textTertiary} testID="cost-days" />
            </View>
            <View style={styles.costField}>
              <Text style={styles.fieldLabel}>VISA FEES</Text>
              <TextInput style={styles.costInput} value={String(cost.visa_fees || "")} onChangeText={(v) => updateCostField("visa_fees", v)} onBlur={saveCost} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colors.textTertiary} testID="cost-visa" />
            </View>
            <View style={styles.costField}>
              <Text style={styles.fieldLabel}>INSURANCE</Text>
              <TextInput style={styles.costInput} value={String(cost.insurance || "")} onChangeText={(v) => updateCostField("insurance", v)} onBlur={saveCost} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colors.textTertiary} testID="cost-insurance" />
            </View>
            <View style={styles.costField}>
              <Text style={styles.fieldLabel}>MISC</Text>
              <TextInput style={styles.costInput} value={String(cost.misc || "")} onChangeText={(v) => updateCostField("misc", v)} onBlur={saveCost} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colors.textTertiary} testID="cost-misc" />
            </View>
          </View>
          <View style={styles.costTotalBar}>
            <Text style={styles.costTotalLabel}>TOTAL ESTIMATED</Text>
            <Text style={styles.costTotal} testID="cost-total">{fmtUSD(totalCost)}</Text>
          </View>
          <Text style={styles.impactText}>
            Impact on monthly budget: this trip represents {monthsOfSurplus.toFixed(1)} months of your current $920 monthly surplus.
          </Text>
        </View>

        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm },
  iconBtn: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.surfaceElevated, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700", flex: 1, textAlign: "center" },
  scroll: { padding: spacing.xl, gap: spacing.md },
  heroCard: { backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, gap: 4 },
  heroFlag: { fontSize: 28 },
  heroTitle: { color: colors.textPrimary, fontSize: 20, fontWeight: "700" },
  heroSub: { color: colors.textSecondary, fontSize: 12 },
  routeBar: {
    flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8, marginBottom: 4,
  },
  routeBarIata: {
    backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: radius.sm, minWidth: 60, alignItems: "center",
  },
  routeBarIataText: {
    color: "#fff", fontSize: 15, fontWeight: "900", letterSpacing: 1.5,
  },
  routeBarArrow: {
    color: colors.primaryGlow, fontSize: 20, fontWeight: "800",
  },
  routeCities: { color: colors.textPrimary, fontSize: 13, fontWeight: "700",
                 marginTop: 2 },
  routeAirports: { color: colors.textTertiary, fontSize: 10, marginTop: 1 },
  migrationBanner: {
    marginTop: 10, padding: 10, borderRadius: radius.sm,
    backgroundColor: "rgba(245,158,11,0.14)",
  },
  migrationBannerText: {
    color: "#F59E0B", fontSize: 10, fontWeight: "700",
  },
  heroRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.sm },
  heroMeta: { flexDirection: "row", alignItems: "center", gap: 6 },
  heroMetaText: { color: colors.textTertiary, fontSize: 12 },
  heroPill: { backgroundColor: colors.primaryMuted, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.sm },
  heroPillText: { color: colors.primaryGlow, fontSize: 11, fontWeight: "700" },
  card: { backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardLabel: { color: colors.textTertiary, fontSize: 10, fontWeight: "700", letterSpacing: 1.2 },
  body: { color: colors.textPrimary, fontSize: 13, lineHeight: 20 },
  loadingText: { color: colors.textSecondary, fontSize: 12, marginTop: spacing.md },
  advisoryHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  advisoryBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm },
  advisoryLevel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  advisorySummary: { fontSize: 13, fontWeight: "700", flex: 1 },
  advisoryNotes: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
  linkBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm },
  linkBtnText: { color: colors.primaryGlow, fontSize: 12, fontWeight: "600" },
  phNoteTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: "700", marginTop: 4 },
  phNoteText: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
  crossLink: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.md, paddingVertical: 10, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.success, backgroundColor: "rgba(16,185,129,0.08)" },
  crossLinkText: { color: colors.success, fontSize: 13, fontWeight: "700", flex: 1 },
  metricsRow: { flexDirection: "row", gap: spacing.sm },
  metric: { flex: 1, backgroundColor: colors.bg, borderRadius: radius.md, padding: spacing.sm },
  metricLabel: { color: colors.textTertiary, fontSize: 9, fontWeight: "700", letterSpacing: 1 },
  metricValue: { color: colors.textPrimary, fontSize: 13, fontWeight: "700", marginTop: 4 },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.bg, borderRadius: radius.sm },
  chipText: { color: colors.textPrimary, fontSize: 11 },
  bucketLabel: { color: colors.textTertiary, fontSize: 10, fontWeight: "700", letterSpacing: 1, marginTop: 4 },
  bullet: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 4 },
  bulletDot: { color: colors.primaryGlow, fontSize: 13 },
  bulletText: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, flex: 1 },
  metaRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.sm },
  miniMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  miniMetaText: { color: colors.textSecondary, fontSize: 11 },
  emRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  emLabel: { color: colors.textTertiary, fontSize: 11, fontWeight: "700", width: 80 },
  emValue: { color: colors.textPrimary, fontSize: 12, flex: 1 },
  genBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.primary, marginTop: spacing.sm },
  genBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  mockBadge: { color: colors.textTertiary, fontSize: 8, fontWeight: "700", letterSpacing: 1, backgroundColor: colors.surfaceElevated, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4 },
  fareRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  fareLabel: { backgroundColor: colors.primaryMuted, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4, minWidth: 70, alignItems: "center" },
  fareLabelText: { color: colors.primaryGlow, fontSize: 9, fontWeight: "700", letterSpacing: 0.5 },
  fareTitle: { color: colors.textPrimary, fontSize: 12, fontWeight: "700" },
  fareMeta: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  fareExtras: { color: colors.success, fontSize: 10, marginTop: 2 },
  farePrice: { color: colors.success, fontSize: 14, fontWeight: "700" },
  hotelRow: { flexDirection: "row", gap: spacing.sm, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  hotelName: { color: colors.textPrimary, fontSize: 13, fontWeight: "700" },
  hotelArea: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  hotelPerks: { color: colors.textTertiary, fontSize: 10, marginTop: 2 },
  hotelPrice: { color: colors.success, fontSize: 14, fontWeight: "700" },
  hotelPriceSub: { color: colors.textTertiary, fontSize: 10 },
  checkItem: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  checkRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  checkText: { color: colors.textPrimary, fontSize: 13, flex: 1, lineHeight: 18 },
  noteInput: { backgroundColor: colors.bg, borderRadius: radius.sm, padding: 8, color: colors.textPrimary, fontSize: 12, borderWidth: 1, borderColor: colors.borderSubtle, marginTop: 6, marginLeft: 26 },
  noteText: { color: colors.textTertiary, fontSize: 11, marginLeft: 26, marginTop: 2 },
  costGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  costField: { width: "47%", gap: 4 },
  fieldLabel: { color: colors.textTertiary, fontSize: 9, fontWeight: "700", letterSpacing: 1 },
  costInput: { backgroundColor: colors.bg, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8, color: colors.textPrimary, fontSize: 13, borderWidth: 1, borderColor: colors.borderSubtle },
  costTotalBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  costTotalLabel: { color: colors.textTertiary, fontSize: 10, fontWeight: "700", letterSpacing: 1 },
  costTotal: { color: colors.success, fontSize: 20, fontWeight: "700" },
  impactText: { color: colors.textSecondary, fontSize: 11, lineHeight: 17, marginTop: 6 },
  scanBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.sm },
  scanBtnText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  priceStrip: { flexDirection: "row", backgroundColor: "rgba(16,185,129,0.08)", borderRadius: radius.md, paddingVertical: spacing.sm, marginTop: 4 },
  priceCell: { flex: 1, alignItems: "center" },
  priceDivider: { width: 1, backgroundColor: colors.borderSubtle },
  priceLabel: { color: colors.textTertiary, fontSize: 9, fontWeight: "700", letterSpacing: 0.8 },
  priceValue: { color: colors.success, fontSize: 15, fontWeight: "700", marginTop: 2 },
  dealBanner: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: "rgba(16,185,129,0.12)", borderRadius: radius.sm, borderWidth: 1, borderColor: colors.success },
  dealBannerText: { color: colors.success, fontSize: 11, fontWeight: "600", flex: 1 },
  scannedMeta: { color: colors.textTertiary, fontSize: 10, marginTop: 4 },
  bookingLabel: { color: colors.textTertiary, fontSize: 9, fontWeight: "700", letterSpacing: 0.8, marginBottom: 6 },
  bookingChipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  bookingChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.primaryMuted, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.primary },
  bookingChipText: { color: colors.primaryGlow, fontSize: 11, fontWeight: "600" },
});
