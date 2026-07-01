// PLOS Travel — AI-searched Flights + Hotels display component.
// Fetches cached search from backend on mount; auto-runs a fresh search when
// results are missing or stale (>6h). Renders 3 flight cards + 3 hotel cards
// + trip cost summary + booking buttons with real pre-filtered URLs.
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, Linking, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import {
  RefreshCw, Plane, BedDouble, Wifi, Car, Coffee, Waves, Bus, Star,
  Sparkles, ChevronRight, ChevronDown, ExternalLink,
} from "lucide-react-native";
import { travelSearchApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";

const LOADING_STEPS = [
  "Searching 200+ airlines for your route…",
  "Comparing fare classes and connection times…",
  "Analyzing hotel options in your destination…",
  "Checking availability for your dates…",
  "Calculating best value combinations…",
  "Generating your personalized booking links…",
];

type Props = {
  tripId: string;
  destination?: string;
  onSavedToBudget?: (expense_id: string) => void;
};

function fmt$(n: number) { return `$${Number(n || 0).toLocaleString()}`; }
function relTime(iso?: string | null) {
  if (!iso) return "Never";
  try {
    const d = new Date(iso);
    const diff = (Date.now() - d.getTime()) / 60000;
    if (diff < 1) return "just now";
    if (diff < 60) return `${Math.floor(diff)} min ago`;
    if (diff < 60 * 24) return `${Math.floor(diff / 60)}h ago`;
    return d.toLocaleDateString();
  } catch { return "recently"; }
}

export function TripSearchResults({ tripId, destination, onSavedToBudget }: Props) {
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [step, setStep] = useState(0);
  const [data, setData] = useState<any>(null);
  const [searchedAt, setSearchedAt] = useState<string | null>(null);

  const runSearch = useCallback(async (force = false) => {
    setSearching(true); setStep(0);
    try {
      const r = await travelSearchApi.run(tripId, force);
      setData(r); setSearchedAt(r?.searched_at || new Date().toISOString());
    } catch (e: any) {
      Alert.alert("Search failed", String(e?.message || e));
    } finally { setSearching(false); }
  }, [tripId]);

  // Load cached; auto-search if missing or stale
  useEffect(() => {
    (async () => {
      try {
        const r = await travelSearchApi.get(tripId);
        if (r.has_results) {
          setData(r.results); setSearchedAt(r.searched_at);
          if (r.stale) runSearch(true);
        } else {
          runSearch(true);
        }
      } catch (_e) {
        runSearch(true);
      } finally { setLoading(false); }
    })();
  }, [tripId, runSearch]);

  useEffect(() => {
    if (!searching) return;
    const id = setInterval(() => setStep((s) => (s + 1) % LOADING_STEPS.length), 4500);
    return () => clearInterval(id);
  }, [searching]);

  const openUrl = useCallback((url?: string) => {
    if (!url) return;
    Linking.openURL(url).catch(() => Alert.alert("Could not open link"));
  }, []);

  const saveBudget = useCallback(async () => {
    const total = data?.trip_cost_summary?.ai_recommendation?.total_usd
      || data?.trip_cost_summary?.best_value_total_usd
      || data?.trip_cost_summary?.cheapest_total_usd;
    if (!total) return;
    try {
      const r = await travelSearchApi.saveToBudget(tripId, total, `Trip: ${destination || "Travel"}`);
      Alert.alert("Saved to Financial Planner", `Trip budget of $${total} added to planned expenses.`);
      onSavedToBudget?.(r.expense_id);
    } catch (e: any) {
      Alert.alert("Save failed", String(e?.message || e));
    }
  }, [data, tripId, destination, onSavedToBudget]);

  if (loading) {
    return (
      <View style={{ padding: spacing.lg, alignItems: "center" }}>
        <ActivityIndicator color={colors.primaryGlow} />
      </View>
    );
  }
  if (searching && !data) {
    return (
      <View style={styles.loadingCard} testID="search-loading">
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <ActivityIndicator color={colors.primaryGlow} />
          <Sparkles size={16} color={colors.primaryGlow} />
        </View>
        <Text style={styles.loadingStep}>{LOADING_STEPS[step]}</Text>
        <Text style={styles.loadingMeta}>Claude Sonnet 4.5 · 25-40s typical</Text>
      </View>
    );
  }
  if (!data?.flights) return null;

  const summary = data.trip_cost_summary || {};
  const rec = summary.ai_recommendation || {};
  const extras = data.extras || {};

  return (
    <View style={{ gap: spacing.md }}>
      {/* TRIP COST SUMMARY */}
      <View style={styles.summaryCard} testID="trip-cost-summary">
        <Text style={styles.summaryTitle}>Trip Cost Summary</Text>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Cheapest</Text>
          <Text style={styles.summaryValue}>{fmt$(summary.cheapest_total_usd)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Best Value</Text>
          <Text style={styles.summaryValue}>{fmt$(summary.best_value_total_usd)}</Text>
        </View>
        {rec.total_usd ? (
          <View style={styles.recBox}>
            <Text style={styles.recTiny}>AI RECOMMENDS</Text>
            <Text style={styles.recText}>
              {rec.flight_category} flight + {rec.hotel_category} hotel = <Text style={{ color: colors.success }}>{fmt$(rec.total_usd)}</Text>
            </Text>
            {rec.reasoning ? <Text style={styles.recReason}>{rec.reasoning}</Text> : null}
          </View>
        ) : null}
        <TouchableOpacity style={styles.budgetBtn} onPress={saveBudget} testID="save-to-budget">
          <Text style={styles.budgetBtnText}>Save Budget to Financial Planner</Text>
        </TouchableOpacity>
      </View>

      {/* PHILIPPINES NOTE */}
      {extras.bulacan_note ? (
        <View style={styles.tipCard} testID="ph-tip">
          <Text style={styles.tipText}>{extras.bulacan_note}</Text>
        </View>
      ) : null}

      {/* DEAL INTELLIGENCE badges */}
      {data.deals_intelligence ? <DealsIntelligence deals={data.deals_intelligence} /> : null}

      {/* FLIGHTS HEADER */}
      <SectionHead
        icon="✈️" label="Flights — AI Searched"
        searchedAt={searchedAt} onRefresh={() => runSearch(true)}
        loading={searching}
      />
      {(data.flights || []).map((f: any, i: number) => (
        <FlightCard key={`f${i}`} flight={f} onOpen={openUrl} />
      ))}

      {/* HOTELS HEADER */}
      <SectionHead
        icon="🏨" label="Hotels — AI Searched"
        searchedAt={searchedAt} onRefresh={() => runSearch(true)}
        loading={searching}
      />
      {(data.hotels || []).map((h: any, i: number) => (
        <HotelCard
          key={`h${i}`} hotel={h} onOpen={openUrl}
          phMode={!!extras.philippines_mode || !!extras.asian_mode}
        />
      ))}

      {/* BUNDLE section — flight + hotel packages */}
      {data.bundles ? (
        <BundleSection
          bundles={data.bundles}
          savingsEstimate={data.bundle_savings_estimate_usd}
          nights={extras.nights}
          onOpen={openUrl}
        />
      ) : null}

      {/* Airbnb long-stay note */}
      {extras.airbnb_long_stay_note ? (
        <View style={styles.airbnbNoteCard} testID="airbnb-long-stay-note">
          <Text style={styles.airbnbNoteText}>{extras.airbnb_long_stay_note}</Text>
        </View>
      ) : null}

      {/* PRO TIPS collapsible */}
      {(data.pro_tips || []).length > 0 ? <ProTips tips={data.pro_tips} /> : null}

      {extras.airbnb_url ? (
        <TouchableOpacity style={styles.airbnbBtn} onPress={() => openUrl(extras.airbnb_url)} testID="airbnb-ph">
          <BedDouble size={14} color="#FF385C" />
          <Text style={styles.airbnbText}>Search Airbnb — Private Homes in {destination}</Text>
          <ExternalLink size={12} color="#FF385C" />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function SectionHead({ icon, label, searchedAt, onRefresh, loading }: {
  icon: string; label: string; searchedAt: string | null; onRefresh: () => void; loading: boolean;
}) {
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionLabel}>{icon}  {label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Text style={styles.sectionMeta}>Last: {relTime(searchedAt)}</Text>
        <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn} testID="refresh-search">
          {loading ? <ActivityIndicator size="small" color={colors.primaryGlow} /> : <RefreshCw size={13} color={colors.primaryGlow} />}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function FlightCard({ flight, onOpen }: { flight: any; onOpen: (u?: string) => void }) {
  const color = flight.category_color || colors.primary;
  return (
    <View style={styles.card}>
      <View style={[styles.cardHead, { backgroundColor: color }]}>
        <Text style={styles.cardHeadText}>{flight.category_icon}  {flight.category}</Text>
        <View style={styles.dealScore}><Text style={styles.dealScoreText}>{flight.deal_score} Deal</Text></View>
      </View>
      <View style={{ padding: spacing.md, gap: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={[styles.airlineCircle, { backgroundColor: color }]}>
            <Text style={styles.airlineCode}>{flight.airline_code || "??"}</Text>
          </View>
          <Text style={styles.airlineName}>{flight.airline}</Text>
        </View>
        <View style={styles.routeRow}>
          <View style={{ alignItems: "center" }}>
            <Text style={styles.airport}>{flight.departure_airport}</Text>
            <Text style={styles.timeText}>{flight.departure_time}</Text>
          </View>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Plane size={14} color={colors.textTertiary} />
            <Text style={styles.stopsText}>
              {flight.stops === 0 ? "Direct" : `${flight.stops} stop${flight.stops > 1 ? "s" : ""}`}
              {flight.layover_airports?.length ? ` via ${flight.layover_airports.join(", ")}` : ""}
            </Text>
            <Text style={styles.durationText}>{flight.total_duration}</Text>
          </View>
          <View style={{ alignItems: "center" }}>
            <Text style={styles.airport}>{flight.arrival_airport}</Text>
            <Text style={styles.timeText}>{flight.arrival_time}</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
          <Text style={[styles.priceText, { color }]}>{fmt$(flight.price_per_person_usd)}</Text>
          <Text style={styles.priceMeta}>/ person</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 6 }}>
          <Chip label={`Carry-on ${flight.carry_on_included ? "✓" : "✗"}`} on={flight.carry_on_included} />
          <Chip label={`Checked bag ${flight.includes_checked_bag ? "✓" : "✗"}`} on={flight.includes_checked_bag} />
          {flight.refundable && <Chip label="Refundable" on={true} />}
        </View>
        {flight.why_recommended ? <Text style={styles.whyText}>{flight.why_recommended}</Text> : null}
        {/* PRIMARY ROW — 2 large buttons */}
        <View style={styles.primaryRow}>
          <TouchableOpacity
            style={[styles.btnPrimaryLg, { backgroundColor: color }]}
            onPress={() => onOpen(flight.booking_url_airline)}
            testID="flight-book-airline"
          >
            <Text style={styles.btnPrimaryLgText} numberOfLines={1}>
              Book on {flight.airline}
            </Text>
            <Text style={styles.btnPrimaryLgSub}>Direct · Best price guarantee</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btnPrimaryLg, styles.btnPrimaryLgAlt]}
            onPress={() => onOpen(flight.google_flights)}
            testID="flight-google"
          >
            <Text style={[styles.btnPrimaryLgText, { color: colors.primaryGlow }]} numberOfLines={1}>
              Google Flights
            </Text>
            <Text style={styles.btnPrimaryLgSubAlt}>Compare all fares</Text>
          </TouchableOpacity>
        </View>
        {/* SECONDARY ROW — 3 smaller buttons */}
        <View style={styles.secondaryRow}>
          <SecondaryBtn label="Kayak" onPress={() => onOpen(flight.kayak)} />
          <SecondaryBtn label="Skyscanner" onPress={() => onOpen(flight.skyscanner)} />
          <SecondaryBtn label="Expedia" onPress={() => onOpen(flight.expedia)} />
        </View>
        {/* ACCORDION — More Platforms */}
        <PlatformAccordion
          label="More Booking Platforms"
          options={[
            { label: "Momondo", url: flight.momondo, hint: "Deep discount search" },
            { label: "Priceline", url: flight.priceline, hint: "Express Deals + bundles" },
            { label: "Going", url: flight.going, hint: "Mistake fare alerts" },
            { label: "Secret Flying", url: flight.secret_flying, hint: "Error fares from your city" },
            { label: "Skyscanner — Everywhere", url: flight.skyscanner_everywhere, hint: "Discover cheapest destinations" },
            { label: "Skyscanner — Cheapest Month", url: flight.skyscanner_cheapest_month, hint: "Flex dates for lowest price" },
            { label: "Kayak — Flexible Dates", url: flight.kayak_flexible, hint: "±3 day price grid" },
          ]}
          onOpen={onOpen}
        />
      </View>
    </View>
  );
}

function HotelCard({ hotel, onOpen, phMode }: { hotel: any; onOpen: (u?: string) => void; phMode: boolean }) {
  const color = hotel.category_color || colors.primary;
  const ratingBg = hotel.rating_score >= 8.5 ? colors.success : hotel.rating_score >= 7 ? colors.warning : "#F97316";
  return (
    <View style={styles.card}>
      <View style={[styles.cardHead, { backgroundColor: color }]}>
        <Text style={styles.cardHeadText}>{hotel.category_icon}  {hotel.category}</Text>
        <View style={styles.dealScore}><Text style={styles.dealScoreText}>{hotel.deal_score} Deal</Text></View>
      </View>
      <View style={{ padding: spacing.md, gap: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Text style={styles.hotelName}>{hotel.hotel_name}</Text>
          <View style={{ flexDirection: "row" }}>
            {Array.from({ length: hotel.star_rating || 0 }).map((_, i) => (
              <Star key={i} size={10} color="#F59E0B" fill="#F59E0B" />
            ))}
          </View>
        </View>
        <Text style={styles.hotelHood}>{hotel.neighborhood} · {hotel.distance_from_center_km} km from center</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
          <View style={[styles.ratingCircle, { backgroundColor: ratingBg }]}>
            <Text style={styles.ratingText}>{hotel.rating_score}</Text>
          </View>
          <Text style={styles.ratingLabel}>{hotel.rating_label} · {hotel.review_count} reviews</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: 4 }}>
          <Text style={[styles.priceText, { color }]}>{fmt$(hotel.price_per_night_usd)}</Text>
          <Text style={styles.priceMeta}>/ night · {fmt$(hotel.total_price_usd)} for {hotel.number_of_nights} nights</Text>
        </View>
        <View style={styles.amenityRow}>
          <Amenity icon={<Wifi size={12} color={hotel.free_wifi ? colors.success : colors.textTertiary} />} label="WiFi" on={hotel.free_wifi} />
          <Amenity icon={<Car size={12} color={hotel.free_parking ? colors.success : colors.textTertiary} />} label="Parking" on={hotel.free_parking} />
          <Amenity icon={<Waves size={12} color={hotel.pool ? colors.success : colors.textTertiary} />} label="Pool" on={hotel.pool} />
          <Amenity icon={<Coffee size={12} color={hotel.breakfast_included ? colors.success : colors.textTertiary} />} label="Breakfast" on={hotel.breakfast_included} />
          <Amenity icon={<Bus size={12} color={hotel.airport_shuttle ? colors.success : colors.textTertiary} />} label="Shuttle" on={hotel.airport_shuttle} />
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
          {(hotel.highlights || []).map((h: string, i: number) => (
            <View key={i} style={styles.hlChip}><Text style={styles.hlChipText}>{h}</Text></View>
          ))}
        </View>
        {hotel.why_recommended ? <Text style={styles.whyText}>{hotel.why_recommended}</Text> : null}
        {/* PRIMARY ROW — Agoda first for Asia, otherwise Book Direct + Booking.com */}
        <View style={styles.primaryRow}>
          {phMode ? (
            <>
              <TouchableOpacity
                style={[styles.btnPrimaryLg, { backgroundColor: "#FF9500" }]}
                onPress={() => onOpen(hotel.booking_url_agoda)}
                testID="hotel-agoda"
              >
                <Text style={styles.btnPrimaryLgText} numberOfLines={1}>Agoda</Text>
                <Text style={styles.btnPrimaryLgSub}>🇦🇸 Best for Asia · Lowest rates</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPrimaryLg, { backgroundColor: "#003580" }]}
                onPress={() => onOpen(hotel.booking_url_booking_com)}
                testID="hotel-booking"
              >
                <Text style={styles.btnPrimaryLgText} numberOfLines={1}>Booking.com</Text>
                <Text style={styles.btnPrimaryLgSub}>Free cancellation on most</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.btnPrimaryLg, { backgroundColor: color }]}
                onPress={() => onOpen(hotel.booking_url_hotel_direct)}
                testID="hotel-direct"
              >
                <Text style={styles.btnPrimaryLgText} numberOfLines={1}>Book Direct</Text>
                <Text style={styles.btnPrimaryLgSub}>Best price guarantee</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPrimaryLg, { backgroundColor: "#003580" }]}
                onPress={() => onOpen(hotel.booking_url_booking_com)}
                testID="hotel-booking"
              >
                <Text style={styles.btnPrimaryLgText} numberOfLines={1}>Booking.com</Text>
                <Text style={styles.btnPrimaryLgSub}>Free cancellation on most</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
        {/* SECONDARY ROW — 3 smaller buttons */}
        <View style={styles.secondaryRow}>
          {phMode ? (
            <>
              <SecondaryBtn label="Book Direct" onPress={() => onOpen(hotel.booking_url_hotel_direct)} />
              <SecondaryBtn label="Hotels.com" onPress={() => onOpen(hotel.booking_url_hotels_com)} />
              <SecondaryBtn label="Expedia" onPress={() => onOpen(hotel.booking_url_expedia)} />
            </>
          ) : (
            <>
              <SecondaryBtn label="Hotels.com" onPress={() => onOpen(hotel.booking_url_hotels_com)} />
              <SecondaryBtn label="Expedia" onPress={() => onOpen(hotel.booking_url_expedia)} />
              <SecondaryBtn
                label="Agoda"
                onPress={() => onOpen(hotel.booking_url_agoda)}
                accent="#FF9500"
              />
            </>
          )}
        </View>
        {/* ACCORDION — More Platforms */}
        <PlatformAccordion
          label="More Booking Platforms"
          options={[
            { label: "Kayak", url: hotel.booking_url_kayak, hint: "Aggregated price search" },
            { label: "Kayak Pricebreakers", url: hotel.booking_url_kayak_pricebreakers, hint: "Mystery hotels — up to 40% off" },
            { label: "HotelTonight", url: hotel.booking_url_hoteltonight, hint: "Last-minute mobile deals" },
            { label: "Priceline", url: hotel.booking_url_priceline, hint: "Aggregated rates" },
            { label: "Priceline Express", url: hotel.booking_url_priceline_express, hint: "Unlisted deals — save up to 60%" },
            { label: "Airbnb", url: hotel.booking_url_airbnb, hint: "Private homes & long-stay discounts", accent: "#FF385C" },
          ]}
          onOpen={onOpen}
        />
      </View>
    </View>
  );
}

function Chip({ label, on }: { label: string; on: boolean }) {
  return (
    <View style={[styles.chip, on && styles.chipOn]}>
      <Text style={[styles.chipText, on && { color: colors.success }]}>{label}</Text>
    </View>
  );
}
function Amenity({ icon, label, on }: { icon: React.ReactNode; label: string; on: boolean }) {
  return (
    <View style={{ alignItems: "center", gap: 2 }}>
      {icon}
      <Text style={[styles.amenityLabel, on && { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

function SecondaryBtn({ label, onPress, accent }: { label: string; onPress: () => void; accent?: string }) {
  return (
    <TouchableOpacity
      style={[styles.btnSecondary, accent ? { borderColor: accent } : null]}
      onPress={onPress}
      testID={`sec-${label.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}
    >
      <Text
        style={[styles.btnSecondaryText, accent ? { color: accent } : null]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function PlatformAccordion({ label, options, onOpen }: {
  label: string;
  options: { label: string; url?: string; hint?: string; accent?: string }[];
  onOpen: (u?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const filtered = options.filter((o) => !!o.url);
  if (filtered.length === 0) return null;
  return (
    <View style={styles.accordionCard} testID="platform-accordion">
      <TouchableOpacity
        style={styles.accordionHead}
        onPress={() => setOpen((v) => !v)}
        testID="accordion-toggle"
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <ExternalLink size={12} color={colors.primaryGlow} />
          <Text style={styles.accordionLabel}>{label}</Text>
          <View style={styles.accordionCount}>
            <Text style={styles.accordionCountText}>{filtered.length}</Text>
          </View>
        </View>
        {open
          ? <ChevronDown size={14} color={colors.textSecondary} />
          : <ChevronRight size={14} color={colors.textSecondary} />}
      </TouchableOpacity>
      {open ? (
        <View style={styles.accordionBody}>
          {filtered.map((o, i) => (
            <TouchableOpacity
              key={i}
              style={styles.accordionRow}
              onPress={() => onOpen(o.url)}
              testID={`platform-${o.label.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.accordionRowLabel, o.accent ? { color: o.accent } : null]}>
                  {o.label}
                </Text>
                {o.hint ? <Text style={styles.accordionRowHint}>{o.hint}</Text> : null}
              </View>
              <ExternalLink size={12} color={colors.textTertiary} />
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function DealsIntelligence({ deals }: { deals: any }) {
  const items: { key: string; color: string; label: string; msg: string }[] = [];
  const d = deals || {};
  if (d.mistake_fare_alert?.show) items.push({ key: "mf", color: "#EF4444", label: "MISTAKE FARE ALERT", msg: d.mistake_fare_alert.message });
  if (d.best_booking_window?.show) items.push({ key: "bw", color: "#10B981", label: "BEST BOOKING WINDOW", msg: d.best_booking_window.message });
  if (d.flexible_dates_savings?.show) items.push({ key: "fd", color: "#F59E0B", label: "FLEXIBLE DATES SAVINGS", msg: d.flexible_dates_savings.message });
  if (d.bundle_opportunity?.show) items.push({ key: "bo", color: "#A855F7", label: "BUNDLE OPPORTUNITY", msg: d.bundle_opportunity.message });
  if (d.asia_rate_alert?.show) items.push({ key: "ar", color: "#F97316", label: "ASIA RATE ALERT", msg: d.asia_rate_alert.message });
  if (items.length === 0) return null;
  return (
    <View style={{ gap: 6 }} testID="deals-intelligence">
      {items.map((it) => (
        <View key={it.key} style={[styles.dealBadgeCard, { borderColor: it.color + "60" }]}>
          <View style={[styles.dealBadge, { backgroundColor: it.color }]}>
            <Text style={styles.dealBadgeText}>{it.label}</Text>
          </View>
          <Text style={styles.dealBadgeMsg}>{it.msg}</Text>
        </View>
      ))}
    </View>
  );
}

function BundleSection({ bundles, savingsEstimate, nights, onOpen }: {
  bundles: any; savingsEstimate?: number; nights?: number; onOpen: (u?: string) => void;
}) {
  const list: { key: string; label: string; badge?: string; badgeBg?: string; url: string }[] = [
    { key: "expedia", label: "Expedia Bundle", badge: "SAVE $100+", badgeBg: "#10B981", url: bundles.expedia },
    { key: "orbitz", label: "Orbitz Bundle", url: bundles.orbitz },
    { key: "travelocity", label: "Travelocity", url: bundles.travelocity },
    { key: "travelzoo", label: "Travelzoo Top 20", badge: "WEEKLY DEALS", badgeBg: "#A855F7", url: bundles.travelzoo },
    { key: "priceline", label: "Priceline Bundle", url: bundles.priceline },
  ];
  return (
    <View style={styles.bundleCard} testID="bundle-section">
      <Text style={styles.bundleTitle}>✈️🏨 Bundle — Flight + Hotel Together</Text>
      {savingsEstimate ? (
        <Text style={styles.bundleCallout}>
          Bundling for this {nights || "multi"}-night trip could save an estimated <Text style={{ color: colors.success, fontWeight: "800" }}>${savingsEstimate}</Text>. Compare bundle prices vs your best individual prices above.
        </Text>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {list.filter((b) => b.url).map((b) => (
          <TouchableOpacity key={b.key} style={styles.bundleBtn} onPress={() => onOpen(b.url)} testID={`bundle-${b.key}`}>
            <Text style={styles.bundleBtnText}>{b.label}</Text>
            {b.badge ? (
              <View style={[styles.miniBadge, { backgroundColor: b.badgeBg }]}>
                <Text style={styles.miniBadgeText}>{b.badge}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

function ProTips({ tips }: { tips: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.proTipsCard} testID="pro-tips">
      <TouchableOpacity style={styles.proTipsHead} onPress={() => setOpen((v) => !v)}>
        <Text style={styles.proTipsTitle}>💡  Pro Traveler Tips — Save More on This Trip</Text>
        <ChevronRight size={14} color={colors.textSecondary} style={{ transform: [{ rotate: open ? "90deg" : "0deg" }] }} />
      </TouchableOpacity>
      {!open ? (
        <Text style={styles.proTipsPreview} numberOfLines={2}>{tips[0]}</Text>
      ) : (
        tips.map((t, i) => (
          <View key={i} style={styles.proTipRow}>
            <Text style={styles.proTipNum}>{i + 1}.</Text>
            <Text style={styles.proTipText}>{t}</Text>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  loadingCard: {
    backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1,
    borderRadius: radius.md, padding: spacing.lg, alignItems: "center", gap: spacing.sm,
  },
  loadingStep: { color: colors.textPrimary, fontSize: 13, fontWeight: "700", textAlign: "center" },
  loadingMeta: { color: colors.textTertiary, fontSize: 10 },
  summaryCard: {
    backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1,
    borderRadius: radius.md, padding: spacing.md, gap: 6,
  },
  summaryTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: "800", letterSpacing: 0.3, marginBottom: 4 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between" },
  summaryLabel: { color: colors.textSecondary, fontSize: 12 },
  summaryValue: { color: colors.textPrimary, fontSize: 13, fontWeight: "700" },
  recBox: {
    backgroundColor: "rgba(16,185,129,0.10)", borderColor: "rgba(16,185,129,0.35)", borderWidth: 1,
    borderRadius: radius.sm, padding: spacing.sm, marginTop: 4,
  },
  recTiny: { color: colors.success, fontSize: 9, fontWeight: "800", letterSpacing: 0.6 },
  recText: { color: colors.textPrimary, fontSize: 12, fontWeight: "700", marginTop: 2 },
  recReason: { color: colors.textSecondary, fontSize: 10, marginTop: 3, lineHeight: 15 },
  budgetBtn: {
    backgroundColor: colors.primary, paddingVertical: 10, borderRadius: radius.sm, alignItems: "center", marginTop: 6,
  },
  budgetBtnText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  tipCard: {
    backgroundColor: "rgba(59,130,246,0.10)", borderColor: "rgba(59,130,246,0.30)", borderWidth: 1,
    borderRadius: radius.sm, padding: spacing.sm,
  },
  tipText: { color: colors.textPrimary, fontSize: 11, lineHeight: 16 },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.sm },
  sectionLabel: { color: colors.textPrimary, fontSize: 14, fontWeight: "800" },
  sectionMeta: { color: colors.textTertiary, fontSize: 10 },
  refreshBtn: { padding: 6, borderRadius: radius.sm, backgroundColor: colors.surfaceElevated },
  card: { backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1, borderRadius: radius.md, overflow: "hidden" },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 10 },
  cardHeadText: { color: "#fff", fontWeight: "800", fontSize: 12, letterSpacing: 0.4 },
  dealScore: { backgroundColor: "rgba(255,255,255,0.20)", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  dealScoreText: { color: "#fff", fontSize: 9, fontWeight: "800" },
  airlineCircle: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  airlineCode: { color: "#fff", fontSize: 10, fontWeight: "800" },
  airlineName: { color: colors.textPrimary, fontSize: 12, fontWeight: "700" },
  routeRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  airport: { color: colors.textPrimary, fontSize: 15, fontWeight: "800" },
  timeText: { color: colors.textSecondary, fontSize: 10 },
  stopsText: { color: colors.textTertiary, fontSize: 9, marginTop: 2 },
  durationText: { color: colors.textSecondary, fontSize: 10, fontWeight: "600" },
  priceText: { fontSize: 22, fontWeight: "800", lineHeight: 24 },
  priceMeta: { color: colors.textTertiary, fontSize: 10 },
  chip: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4, backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle, borderWidth: 1 },
  chipOn: { borderColor: "rgba(16,185,129,0.4)" },
  chipText: { color: colors.textTertiary, fontSize: 9, fontWeight: "700" },
  whyText: { color: colors.textSecondary, fontSize: 10, fontStyle: "italic", marginTop: 4, lineHeight: 14 },
  btnRow: { flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap" },
  hotelBtnGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  btnPrimary: { flexBasis: "48%", flexGrow: 1, paddingVertical: 10, borderRadius: radius.sm, alignItems: "center" },
  btnPrimaryText: { color: "#fff", fontWeight: "800", fontSize: 11 },
  btnOutline: {
    flexBasis: "48%", flexGrow: 1, paddingVertical: 9, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border, alignItems: "center", backgroundColor: colors.surface,
  },
  btnOutlineText: { color: colors.primaryGlow, fontWeight: "700", fontSize: 11 },
  moreLink: { color: colors.primaryGlow, fontSize: 11, fontWeight: "700" },
  // NEW BOOKING GRID — Primary/Secondary/Accordion
  primaryRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  btnPrimaryLg: {
    flex: 1, paddingVertical: 12, paddingHorizontal: 10, borderRadius: radius.sm,
    alignItems: "center", justifyContent: "center", gap: 2, minHeight: 52,
  },
  btnPrimaryLgAlt: {
    backgroundColor: "rgba(59,130,246,0.10)",
    borderWidth: 1, borderColor: "rgba(59,130,246,0.40)",
  },
  btnPrimaryLgText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  btnPrimaryLgSub: { color: "rgba(255,255,255,0.85)", fontSize: 9, fontWeight: "600", marginTop: 2 },
  btnPrimaryLgSubAlt: { color: colors.textSecondary, fontSize: 9, fontWeight: "600", marginTop: 2 },
  secondaryRow: { flexDirection: "row", gap: 6, marginTop: 6 },
  btnSecondary: {
    flex: 1, paddingVertical: 8, paddingHorizontal: 6, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
    alignItems: "center", justifyContent: "center", minHeight: 34,
  },
  btnSecondaryText: { color: colors.primaryGlow, fontWeight: "700", fontSize: 10.5 },
  // Accordion
  accordionCard: {
    marginTop: 8, borderRadius: radius.sm, borderWidth: 1,
    borderColor: colors.borderSubtle, backgroundColor: colors.surfaceElevated,
    overflow: "hidden",
  },
  accordionHead: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 10, paddingVertical: 8,
  },
  accordionLabel: { color: colors.textPrimary, fontSize: 11, fontWeight: "700" },
  accordionCount: {
    backgroundColor: "rgba(59,130,246,0.20)", borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 1, marginLeft: 4,
  },
  accordionCountText: { color: colors.primaryGlow, fontSize: 9, fontWeight: "800" },
  accordionBody: { borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  accordionRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 10, paddingVertical: 9,
    borderBottomWidth: 1, borderBottomColor: colors.borderSubtle,
  },
  accordionRowLabel: { color: colors.textPrimary, fontSize: 11, fontWeight: "700" },
  accordionRowHint: { color: colors.textTertiary, fontSize: 9, marginTop: 1 },
  hotelName: { color: colors.textPrimary, fontSize: 14, fontWeight: "800" },
  hotelHood: { color: colors.textTertiary, fontSize: 10 },
  ratingCircle: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  ratingText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  ratingLabel: { color: colors.textSecondary, fontSize: 10 },
  amenityRow: { flexDirection: "row", justifyContent: "space-around", marginVertical: 4 },
  amenityLabel: { color: colors.textTertiary, fontSize: 8 },
  hlChip: { backgroundColor: colors.surfaceElevated, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  hlChipText: { color: colors.textSecondary, fontSize: 9, fontWeight: "600" },
  airbnbBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: colors.surface, borderColor: "#FF385C", borderWidth: 1,
    borderRadius: radius.md, paddingVertical: 12,
  },
  airbnbText: { color: "#FF385C", fontSize: 12, fontWeight: "700" },
  // Deal intelligence badges
  dealBadgeCard: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: colors.surface, borderWidth: 1, borderRadius: radius.sm,
    paddingHorizontal: spacing.sm, paddingVertical: 8,
  },
  dealBadge: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 3 },
  dealBadgeText: { color: "#fff", fontSize: 8, fontWeight: "800", letterSpacing: 0.4 },
  dealBadgeMsg: { color: colors.textSecondary, fontSize: 11, flex: 1, lineHeight: 15 },
  // Bundle section
  bundleCard: {
    backgroundColor: "rgba(59,130,246,0.08)", borderColor: "rgba(59,130,246,0.35)",
    borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: 8,
  },
  bundleTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: "800" },
  bundleCallout: { color: colors.textSecondary, fontSize: 11, lineHeight: 16 },
  bundleBtn: {
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.sm, alignItems: "center", gap: 4,
    minWidth: 130,
  },
  bundleBtnText: { color: colors.primaryGlow, fontWeight: "700", fontSize: 11 },
  miniBadge: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3 },
  miniBadgeText: { color: "#fff", fontSize: 8, fontWeight: "800", letterSpacing: 0.4 },
  // Airbnb long-stay note
  airbnbNoteCard: {
    backgroundColor: "rgba(255,56,92,0.09)", borderColor: "rgba(255,56,92,0.35)",
    borderWidth: 1, borderRadius: radius.sm, padding: spacing.sm,
  },
  airbnbNoteText: { color: "#FF385C", fontSize: 11, fontWeight: "600", lineHeight: 15 },
  // Pro Tips
  proTipsCard: {
    backgroundColor: "rgba(245,158,11,0.08)", borderColor: "rgba(245,158,11,0.35)",
    borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: 6,
  },
  proTipsHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  proTipsTitle: { color: colors.textPrimary, fontSize: 12, fontWeight: "800" },
  proTipsPreview: { color: colors.textSecondary, fontSize: 11, lineHeight: 15, fontStyle: "italic" },
  proTipRow: { flexDirection: "row", gap: 6 },
  proTipNum: { color: "#F59E0B", fontSize: 11, fontWeight: "800", minWidth: 18 },
  proTipText: { color: colors.textSecondary, fontSize: 11, lineHeight: 16, flex: 1 },
});
