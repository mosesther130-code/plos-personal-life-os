// PLOS Travel — LIVE search results powered by SerpApi Google Flights & Hotels.
// Falls back to Claude engine ONLY if SerpApi returns zero results or errors.
// Deep-links to 20+ platforms always render.
import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Alert, Linking, Image,
} from "react-native";
import {
  RefreshCw, Plane, BedDouble, ChevronDown, ChevronUp, ExternalLink,
  Wifi, Coffee, Car, Waves, Star, AlertTriangle, Sparkles,
  Clock, MapPin, Info,
} from "lucide-react-native";
import { travelLiveApi, travelSearchApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";

type Props = {
  tripId: string;
  destination?: string;
  onSavedToBudget?: (expenseId: string) => void;
};

const PRICE_LEVEL_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  low:     { bg: "rgba(16,185,129,0.18)", fg: "#10B981", label: "Low Price" },
  typical: { bg: "rgba(148,163,184,0.18)", fg: "#94A3B8", label: "Typical" },
  high:    { bg: "rgba(239,68,68,0.18)",   fg: "#EF4444", label: "High Price" },
};

function fmt$(n: number | null | undefined) {
  if (!n && n !== 0) return "—";
  return `$${Number(n).toLocaleString("en-US")}`;
}

function fmtDuration(min: number | null | undefined) {
  if (!min) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m}m`;
}

function fmtRelTime(iso?: string | null) {
  if (!iso) return "never";
  try {
    const dt = new Date(iso);
    const diff = (Date.now() - dt.getTime()) / 60000;
    if (diff < 1) return "just now";
    if (diff < 60) return `${Math.floor(diff)} min ago`;
    if (diff < 60 * 24) return `${Math.floor(diff / 60)}h ago`;
    return `${Math.floor(diff / 60 / 24)}d ago`;
  } catch { return "recently"; }
}

const openUrl = (url: string) => {
  if (!url) return;
  Linking.openURL(url).catch(() =>
    Alert.alert("Could not open link", "Please try again."),
  );
};

export function LiveTripSearchResults({ tripId, destination, onSavedToBudget }: Props) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [oneWay, setOneWay] = useState(false);
  const [currency, setCurrency] = useState<"USD" | "PHP">("USD");
  const [phpRate, setPhpRate] = useState<number | null>(null);
  const [data, setData] = useState<any>(null);
  const [fallback, setFallback] = useState<any>(null);
  const [serpStatus, setSerpStatus] = useState<{
    configured: boolean; key_hint: string | null;
    last_error: null | { error: string; status_code?: number };
  } | null>(null);
  const [showMoreFlights, setShowMoreFlights] = useState(false);
  const [showMoreHotels, setShowMoreHotels] = useState(false);
  const [showFlightPlatforms, setShowFlightPlatforms] = useState(false);
  const [showHotelPlatforms, setShowHotelPlatforms] = useState(false);

  const load = useCallback(async (opts?: { refresh?: boolean; ow?: boolean }) => {
    setLoading(true);
    try {
      const [status, res] = await Promise.all([
        travelLiveApi.serpapiStatus().catch(() => null),
        travelLiveApi.searchLive(tripId, {
          refresh: !!opts?.refresh,
          one_way: opts?.ow ?? oneWay,
        }),
      ]);
      if (status) setSerpStatus(status as any);
      setData(res);
      // Auto-refetch if server told us it's over 24h
      if (res?.staleness?.auto_refetch && !opts?.refresh) {
        setRefreshing(true);
        const fresh = await travelLiveApi.searchLive(tripId, {
          refresh: true, one_way: opts?.ow ?? oneWay,
        });
        setData(fresh);
        setRefreshing(false);
      }
      // Fall back to legacy Claude engine if SerpApi returned nothing
      const noFlights = !(res?.flights_data?.flights?.length);
      const noHotels = !(res?.hotels_data?.hotels?.length);
      if (noFlights && noHotels) {
        try {
          const fb = await travelSearchApi.get(tripId);
          if (fb.has_results) setFallback(fb.results);
          else {
            const fresh = await travelSearchApi.run(tripId, true);
            setFallback(fresh);
          }
        } catch { /* silent */ }
      }
    } catch (e: any) {
      Alert.alert("Live search failed", String(e?.message || e));
    } finally { setLoading(false); }
  }, [tripId, oneWay]);

  useEffect(() => { load({ refresh: false }); }, [load]);

  // Fetch PHP exchange rate lazily
  useEffect(() => {
    (async () => {
      if (currency !== "PHP" || phpRate) return;
      try {
        const r = await fetch(
          "https://api.exchangerate.host/latest?base=USD&symbols=PHP",
        ).then((x) => x.json());
        const rate = r?.rates?.PHP;
        if (rate) setPhpRate(rate);
      } catch { setPhpRate(56.5); /* rough default */ }
    })();
  }, [currency, phpRate]);

  const priceDisplay = useCallback((usd: number | null | undefined) => {
    if (!usd && usd !== 0) return "—";
    if (currency === "USD") return `$${Math.round(usd).toLocaleString("en-US")}`;
    const rate = phpRate || 56.5;
    return `₱${Math.round(usd * rate).toLocaleString("en-US")}`;
  }, [currency, phpRate]);

  const toggleOneWay = useCallback(async () => {
    const next = !oneWay;
    setOneWay(next);
    await load({ refresh: true, ow: next });
  }, [oneWay, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await load({ refresh: true }); }
    finally { setRefreshing(false); }
  }, [load]);

  const fd = data?.flights_data || {};
  const hd = data?.hotels_data || {};
  const dl = data?.deep_links || {};
  const params = data?.params || {};
  const flights = (fd.flights || []) as any[];
  const hotels = (hd.hotels || []) as any[];
  const insights = fd.price_insights || {};
  const staleness = data?.staleness || {};
  const flightsErr = data?.flights_error;
  const hotelsErr = data?.hotels_error;
  const hasLiveFlights = flights.length > 0;
  const hasLiveHotels = hotels.length > 0;
  const usingFallback = !hasLiveFlights && !hasLiveHotels && !!fallback;
  const nightsCount = hd.nights || dl.nights || 0;

  // No SerpApi configured — show empty state + still show deep-link buttons
  const serpapiMissing = serpStatus && !serpStatus.configured;

  if (loading) {
    return (
      <View style={styles.loaderWrap}>
        <ActivityIndicator size="large" color={colors.primaryGlow} />
        <Text style={styles.loaderText}>
          Fetching live prices from Google Flights & Google Hotels…
        </Text>
        <Text style={styles.loaderSub}>Usually 3–8 seconds</Text>
      </View>
    );
  }

  return (
    <View style={styles.container} testID="live-search-root">
      {/* Header row */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.h1}>Live prices</Text>
          <Text style={styles.h1Sub}>
            {params.origin || "ATL"} → {params.destination || "?"} · {params.dep || "—"}
            {!oneWay && params.ret ? `  →  ${params.ret}` : ""}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.refreshBtn}
          onPress={onRefresh}
          disabled={refreshing}
          testID="refresh-live"
        >
          {refreshing ? <ActivityIndicator size="small" color="#fff" /> :
            <RefreshCw size={13} color="#fff" />}
          <Text style={styles.refreshBtnText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {/* SerpApi status errors */}
      {!!serpStatus?.last_error && (
        <View style={styles.errorPill}>
          <AlertTriangle size={12} color="#EF4444" />
          <Text style={styles.errorPillText}>
            SerpApi ({serpStatus.last_error.status_code || "err"}): {serpStatus.last_error.error}
          </Text>
        </View>
      )}

      {/* Freshness banner */}
      {staleness?.stale && !staleness?.auto_refetch && (
        <View style={styles.staleBanner}>
          <AlertTriangle size={12} color="#F59E0B" />
          <Text style={styles.staleBannerText}>
            Prices fetched {staleness.minutes_ago} min ago and may have changed.
            Tap Refresh for the latest.
          </Text>
        </View>
      )}

      {/* Round-trip / One-way + Currency toggles */}
      <View style={styles.togglesRow}>
        <View style={styles.togglePill}>
          <TouchableOpacity
            style={[styles.toggleOpt, !oneWay && styles.toggleOptOn]}
            onPress={() => oneWay && toggleOneWay()}
            testID="toggle-rt"
          >
            <Text style={[styles.toggleOptText, !oneWay && { color: "#fff" }]}>Round trip</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleOpt, oneWay && styles.toggleOptOn]}
            onPress={() => !oneWay && toggleOneWay()}
            testID="toggle-ow"
          >
            <Text style={[styles.toggleOptText, oneWay && { color: "#fff" }]}>One way</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.togglePill}>
          <TouchableOpacity
            style={[styles.toggleOpt, currency === "USD" && styles.toggleOptOn]}
            onPress={() => setCurrency("USD")}
            testID="cur-usd"
          >
            <Text style={[styles.toggleOptText, currency === "USD" && { color: "#fff" }]}>USD</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleOpt, currency === "PHP" && styles.toggleOptOn]}
            onPress={() => setCurrency("PHP")}
            testID="cur-php"
          >
            <Text style={[styles.toggleOptText, currency === "PHP" && { color: "#fff" }]}>PHP</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* SerpApi empty state */}
      {serpapiMissing && (
        <View style={styles.setupCard}>
          <Sparkles size={14} color={colors.primaryGlow} />
          <Text style={styles.setupTitle}>Add SerpApi for live prices</Text>
          <Text style={styles.setupBody}>
            The deep-link buttons below open pre-filled searches on Google Flights,
            Kayak, Skyscanner and every major booking site — all with real live prices.
            {"\n\n"}To see inline price previews inside PLOS, add a free SerpApi key
            (100 free searches/month) at serpapi.com and paste it in Settings ›
            Travel › SerpApi Key.
          </Text>
        </View>
      )}

      {/* ============ FLIGHTS ============ */}
      <View style={styles.sectionHead}>
        <Plane size={14} color={colors.primaryGlow} />
        <Text style={styles.sectionTitle}>Flights</Text>
        {hasLiveFlights && (
          <View style={styles.liveBadge}>
            <Text style={styles.liveBadgeText}>LIVE · fetched {fmtRelTime(fd.fetched_at)}</Text>
          </View>
        )}
      </View>

      {/* Price insights banner */}
      {hasLiveFlights && insights?.level && (
        <View style={[styles.insightsBanner,
          { backgroundColor: PRICE_LEVEL_COLORS[insights.level]?.bg }]}>
          <Info size={11} color={PRICE_LEVEL_COLORS[insights.level]?.fg} />
          <Text style={[styles.insightsText,
            { color: PRICE_LEVEL_COLORS[insights.level]?.fg }]}>
            Prices are currently {String(insights.level).toUpperCase()} for this route
            {insights.typical_range_usd?.length === 2 &&
              ` · typical ${fmt$(insights.typical_range_usd[0])}–${fmt$(insights.typical_range_usd[1])}`}
          </Text>
        </View>
      )}

      {!!flightsErr && (
        <Text style={styles.errText}>Live flights unavailable: {flightsErr}</Text>
      )}

      {hasLiveFlights ? (
        <>
          {/* Cheapest / Fastest / Best value badges */}
          {["cheapest", "fastest", "best_value"].map((cat) => {
            const f = fd[cat];
            if (!f) return null;
            const label = cat === "cheapest" ? "Cheapest"
              : cat === "fastest" ? "Fastest" : "Best Value";
            return (
              <FlightCard
                key={cat}
                category={label}
                flight={f}
                deepLinks={dl.flight_platforms || []}
                carrierLinks={dl.carrier_platforms || []}
                oneWay={oneWay}
                priceLevel={insights.level}
                fetchedAt={fd.fetched_at}
                priceFmt={priceDisplay}
              />
            );
          })}

          <TouchableOpacity
            style={styles.expandBtn}
            onPress={() => setShowMoreFlights((v) => !v)}
            testID="toggle-more-flights"
          >
            <Text style={styles.expandBtnText}>
              {showMoreFlights ? "Hide" : `Show ${flights.length - 3} more flights`}
            </Text>
            {showMoreFlights ? <ChevronUp size={14} color={colors.primaryGlow} />
                             : <ChevronDown size={14} color={colors.primaryGlow} />}
          </TouchableOpacity>

          {showMoreFlights && flights.slice(3).map((f, i) => (
            <FlightCard
              key={`extra-${i}`}
              category={i === 0 ? "Alternative" : `Option ${i + 4}`}
              flight={f}
              deepLinks={dl.flight_platforms || []}
              carrierLinks={dl.carrier_platforms || []}
              oneWay={oneWay}
              priceLevel={insights.level}
              fetchedAt={fd.fetched_at}
              priceFmt={priceDisplay}
              compact
            />
          ))}
        </>
      ) : usingFallback && fallback?.flights?.length ? (
        <>
          <View style={styles.fallbackBadge}>
            <Text style={styles.fallbackBadgeText}>
              Live prices unavailable — showing estimated prices
            </Text>
          </View>
          {(fallback.flights as any[]).slice(0, 3).map((f: any, i: number) => (
            <View key={i} style={styles.card}>
              <Text style={styles.flightAirline}>{f.airline || "Airline"}</Text>
              <Text style={styles.estimatedPrice}>
                {priceDisplay(f.total_price_usd || f.price_usd || f.price)} <Text style={{ fontSize: 10, color: colors.textTertiary }}>estimated</Text>
              </Text>
            </View>
          ))}
        </>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>
            No live flight data yet — tap the platform buttons below to search each site.
          </Text>
        </View>
      )}

      {/* All Flight Platforms */}
      <TouchableOpacity
        style={styles.platformSectionHead}
        onPress={() => setShowFlightPlatforms((v) => !v)}
        testID="toggle-flight-platforms"
      >
        <Text style={styles.platformSectionTitle}>
          All flight platforms · pre-filled searches
        </Text>
        {showFlightPlatforms ? <ChevronUp size={14} color={colors.primaryGlow} />
                             : <ChevronDown size={14} color={colors.primaryGlow} />}
      </TouchableOpacity>
      {showFlightPlatforms && (
        <View style={{ gap: 6 }}>
          {(dl.carrier_platforms || []).map((p: any) => (
            <PlatformRow key={p.platform} platform={p} highlight />
          ))}
          {(dl.flight_platforms || []).map((p: any) => (
            <PlatformRow key={p.platform} platform={p} />
          ))}
          {(dl.bundle_platforms || []).map((p: any) => (
            <PlatformRow key={p.platform} platform={p} bundle />
          ))}
        </View>
      )}

      {/* ============ HOTELS ============ */}
      <View style={[styles.sectionHead, { marginTop: spacing.xl }]}>
        <BedDouble size={14} color={colors.primaryGlow} />
        <Text style={styles.sectionTitle}>Hotels</Text>
        {hasLiveHotels && (
          <View style={styles.liveBadge}>
            <Text style={styles.liveBadgeText}>LIVE · fetched {fmtRelTime(hd.fetched_at)}</Text>
          </View>
        )}
      </View>

      {dl.bulacan_note && (
        <View style={styles.bulacanNote}>
          <MapPin size={11} color="#F59E0B" />
          <Text style={styles.bulacanNoteText}>{dl.bulacan_note}</Text>
        </View>
      )}

      {dl.airbnb_weekly_note && (
        <View style={styles.hintChip}>
          <Text style={styles.hintChipText}>💡 {dl.airbnb_weekly_note}</Text>
        </View>
      )}
      {dl.airbnb_monthly_note && (
        <View style={styles.hintChip}>
          <Text style={styles.hintChipText}>💡 {dl.airbnb_monthly_note}</Text>
        </View>
      )}

      {!!hotelsErr && (
        <Text style={styles.errText}>Live hotels unavailable: {hotelsErr}</Text>
      )}

      {hasLiveHotels ? (
        <>
          {hotels.slice(0, 3).map((h, i) => (
            <HotelCard
              key={`h-${i}`}
              hotel={h}
              nights={nightsCount}
              deepLinks={dl.hotel_platforms || []}
              fetchedAt={hd.fetched_at}
              priceFmt={priceDisplay}
              category={i === 0 ? "Cheapest"
                : i === 1 ? "Best Rated" : "Best Value"}
            />
          ))}

          {hotels.length > 3 && (
            <TouchableOpacity
              style={styles.expandBtn}
              onPress={() => setShowMoreHotels((v) => !v)}
              testID="toggle-more-hotels"
            >
              <Text style={styles.expandBtnText}>
                {showMoreHotels ? "Hide" : `Show ${hotels.length - 3} more hotels`}
              </Text>
              {showMoreHotels ? <ChevronUp size={14} color={colors.primaryGlow} />
                              : <ChevronDown size={14} color={colors.primaryGlow} />}
            </TouchableOpacity>
          )}

          {showMoreHotels && hotels.slice(3).map((h, i) => (
            <HotelCard
              key={`h-x-${i}`}
              hotel={h}
              nights={nightsCount}
              deepLinks={dl.hotel_platforms || []}
              fetchedAt={hd.fetched_at}
              priceFmt={priceDisplay}
              category="Option"
              compact
            />
          ))}
        </>
      ) : usingFallback && fallback?.hotels?.length ? (
        <>
          <View style={styles.fallbackBadge}>
            <Text style={styles.fallbackBadgeText}>
              Live prices unavailable — showing estimated prices
            </Text>
          </View>
          {(fallback.hotels as any[]).slice(0, 3).map((h: any, i: number) => (
            <View key={i} style={styles.card}>
              <Text style={styles.hotelName}>{h.name || "Hotel"}</Text>
              <Text style={styles.estimatedPrice}>
                {priceDisplay(h.total_price_usd || h.price_per_night || h.nightly_usd)} <Text style={{ fontSize: 10, color: colors.textTertiary }}>estimated</Text>
              </Text>
            </View>
          ))}
        </>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>
            No live hotel data — tap platforms below to search.
          </Text>
        </View>
      )}

      {/* All Hotel Platforms */}
      <TouchableOpacity
        style={styles.platformSectionHead}
        onPress={() => setShowHotelPlatforms((v) => !v)}
        testID="toggle-hotel-platforms"
      >
        <Text style={styles.platformSectionTitle}>
          All accommodation platforms · pre-filled
        </Text>
        {showHotelPlatforms ? <ChevronUp size={14} color={colors.primaryGlow} />
                            : <ChevronDown size={14} color={colors.primaryGlow} />}
      </TouchableOpacity>
      {showHotelPlatforms && (
        <View style={{ gap: 6 }}>
          {(dl.hotel_platforms || []).map((p: any) => (
            <PlatformRow key={p.platform} platform={p}
              highlight={p.primary && dl.philippines} />
          ))}
        </View>
      )}

      {/* Disclaimer */}
      <View style={styles.disclaimer}>
        <Text style={styles.disclaimerText}>
          Prices shown are fetched live from Google Flights and Google Hotels via
          SerpApi at the time indicated. Actual prices at time of booking may differ
          due to availability, taxes, and fees. Always confirm the final price on
          the booking site before completing your purchase. PLOS is not a booking
          agent and does not process payments.
        </Text>
      </View>

      <View style={{ height: 40 }} />
      {/* onSavedToBudget hook kept for API compat with legacy caller */}
      {!!onSavedToBudget && !!destination && null}
    </View>
  );
}

// ================================================================
// Flight Card
// ================================================================
function FlightCard({
  category, flight, deepLinks, carrierLinks, oneWay,
  priceLevel, fetchedAt, priceFmt, compact = false,
}: {
  category: string;
  flight: any;
  deepLinks: any[];
  carrierLinks: any[];
  oneWay: boolean;
  priceLevel?: string;
  fetchedAt?: string;
  priceFmt: (n: number) => string;
  compact?: boolean;
}) {
  const pl = priceLevel && PRICE_LEVEL_COLORS[priceLevel];
  const topBtns = deepLinks.filter((p) => !p.more_options).slice(0, 4);
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.catLabel}>{category}</Text>
        {pl && (
          <View style={[styles.pill, { backgroundColor: pl.bg }]}>
            <Text style={[styles.pillText, { color: pl.fg }]}>{pl.label}</Text>
          </View>
        )}
      </View>

      <View style={styles.flightRow}>
        {!!flight.airline_logo && (
          <Image source={{ uri: flight.airline_logo }} style={styles.airlineLogo} />
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.flightAirline}>{flight.airline || "Airline"}</Text>
          <Text style={styles.flightMeta} numberOfLines={1}>
            {flight.departure_airport_code} {flight.departure_time?.slice(11, 16) || ""}
            {"  →  "}
            {flight.arrival_airport_code} {flight.arrival_time?.slice(11, 16) || ""}
          </Text>
          <View style={styles.flightSubRow}>
            <Clock size={10} color={colors.textTertiary} />
            <Text style={styles.flightSubText}>{fmtDuration(flight.duration_minutes)}</Text>
            <Text style={styles.flightDot}>·</Text>
            <Text style={styles.flightSubText}>
              {flight.stops === 0 ? "Direct"
                : flight.stops === 1 ? "1 stop"
                : `${flight.stops} stops`}
              {flight.layover_airports?.length ?
                ` (${flight.layover_airports.join(", ")})` : ""}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.priceBlock}>
        <Text style={[styles.priceBig,
          pl && priceLevel === "low" ? { color: "#10B981" }
          : pl && priceLevel === "high" ? { color: "#EF4444" }
          : { color: colors.textPrimary }]}>
          {priceFmt(flight.price_usd)}
        </Text>
        <Text style={styles.priceSub}>
          per person · {oneWay ? "one way" : "round trip"}
        </Text>
        <Text style={styles.priceSource}>
          Live price from Google Flights · fetched {fmtRelTime(fetchedAt)}
        </Text>
      </View>

      {!compact && (
        <View style={styles.btnGrid}>
          {topBtns.map((p) => (
            <TouchableOpacity
              key={p.platform}
              style={[
                styles.gridBtn,
                p.primary && styles.gridBtnPrimary,
                p.platform === "ita_matrix" && styles.gridBtnMuted,
              ]}
              onPress={() => openUrl(p.url)}
              testID={`fbtn-${p.platform}`}
            >
              <Text style={[styles.gridBtnText,
                p.primary && { color: "#fff" }]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {carrierLinks.length > 0 && !compact && (
        <View style={styles.carrierRow}>
          {carrierLinks.map((c) => (
            <TouchableOpacity
              key={c.platform}
              style={[styles.carrierBtn, c.primary && styles.carrierBtnPrimary]}
              onPress={() => openUrl(c.url)}
              testID={`carrier-${c.platform}`}
            >
              <Plane size={11} color={c.primary ? "#fff" : colors.primaryGlow} />
              <Text style={[styles.carrierBtnText,
                c.primary && { color: "#fff" }]}>{c.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {topBtns.find((p) => p.platform === "ita_matrix")?.note && !compact && (
        <View style={styles.itaNote}>
          <Info size={10} color="#F59E0B" />
          <Text style={styles.itaNoteText}>
            {topBtns.find((p) => p.platform === "ita_matrix")?.note}
          </Text>
        </View>
      )}
    </View>
  );
}

// ================================================================
// Hotel Card
// ================================================================
function HotelCard({
  category, hotel, nights, deepLinks, fetchedAt, priceFmt, compact = false,
}: {
  category: string;
  hotel: any;
  nights: number;
  deepLinks: any[];
  fetchedAt?: string;
  priceFmt: (n: number) => string;
  compact?: boolean;
}) {
  const topBtns = deepLinks.filter((p) => !p.more_options).slice(0, 4);
  const amenityIcons: Record<string, JSX.Element> = {
    wifi: <Wifi size={11} color={colors.textSecondary} />,
    parking: <Car size={11} color={colors.textSecondary} />,
    pool: <Waves size={11} color={colors.textSecondary} />,
    breakfast: <Coffee size={11} color={colors.textSecondary} />,
  };
  const detected = (hotel.amenities || []).map((a: string) => a.toLowerCase());
  const amenities = Object.entries(amenityIcons).filter(([k]) =>
    detected.some((d: string) => d.includes(k))
  );

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.catLabel}>{category}</Text>
        {hotel.rating && (
          <View style={styles.starPill}>
            <Star size={10} color="#F59E0B" fill="#F59E0B" />
            <Text style={styles.starText}>{Number(hotel.rating).toFixed(1)}
              {hotel.review_count ? ` (${hotel.review_count})` : ""}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.hotelRow}>
        {!!hotel.thumbnail && (
          <Image source={{ uri: hotel.thumbnail }} style={styles.hotelThumb} />
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.hotelName} numberOfLines={2}>{hotel.name}</Text>
          {!!hotel.address && (
            <Text style={styles.hotelMeta} numberOfLines={1}>{hotel.address}</Text>
          )}
          {amenities.length > 0 && (
            <View style={styles.amenityRow}>
              {amenities.map(([k, ic]) => (
                <View key={k} style={styles.amenityChip}>
                  {ic}
                  <Text style={styles.amenityText}>{k}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>

      <View style={styles.priceBlock}>
        <Text style={[styles.priceBig, { color: colors.textPrimary }]}>
          {priceFmt(hotel.nightly_usd)}
          <Text style={{ fontSize: 12, color: colors.textTertiary, fontWeight: "600" }}>
            {" "}/ night
          </Text>
        </Text>
        {nights > 0 && (
          <Text style={styles.priceSub}>
            {priceFmt(hotel.nightly_usd * nights)} total · {nights} nights
          </Text>
        )}
        <Text style={styles.priceSource}>
          Live price from Google Hotels · fetched {fmtRelTime(fetchedAt)}
        </Text>
      </View>

      {!compact && (
        <View style={styles.btnGrid}>
          {topBtns.map((p) => (
            <TouchableOpacity
              key={p.platform}
              style={[styles.gridBtn, p.primary && styles.gridBtnPrimary]}
              onPress={() => openUrl(p.url)}
              testID={`hbtn-${p.platform}`}
            >
              <Text style={[styles.gridBtnText, p.primary && { color: "#fff" }]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

// ================================================================
// Platform Row (deep-link row for expandable "all platforms" sections)
// ================================================================
function PlatformRow({ platform, highlight, bundle }: {
  platform: any; highlight?: boolean; bundle?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.platformRow,
        highlight && styles.platformRowHighlight,
        bundle && styles.platformRowBundle]}
      onPress={() => openUrl(platform.url)}
      testID={`platform-${platform.platform}`}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.platformLabel}>{platform.label}</Text>
        <Text style={styles.platformTagline}>{platform.tagline}</Text>
        {!!platform.note && (
          <View style={styles.notePill}>
            <Info size={9} color="#F59E0B" />
            <Text style={styles.noteText}>{platform.note}</Text>
          </View>
        )}
      </View>
      <ExternalLink size={13} color={colors.primaryGlow} />
    </TouchableOpacity>
  );
}

// ================================================================
// Styles
// ================================================================
const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.lg, paddingTop: 8 },
  loaderWrap: { alignItems: "center", justifyContent: "center", padding: 40, gap: 10 },
  loaderText: { color: colors.textSecondary, fontSize: 13, textAlign: "center" },
  loaderSub: { color: colors.textTertiary, fontSize: 11 },

  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  h1: { color: colors.textPrimary, fontSize: 16, fontWeight: "800" },
  h1Sub: { color: colors.textTertiary, fontSize: 11, marginTop: 2 },
  refreshBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: colors.primary,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.sm,
  },
  refreshBtnText: { color: "#fff", fontSize: 11, fontWeight: "800" },

  errorPill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(239,68,68,0.14)",
    borderRadius: radius.sm, padding: 8, marginTop: 4,
  },
  errorPillText: { color: "#EF4444", fontSize: 10, fontWeight: "700", flex: 1 },
  staleBanner: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(245,158,11,0.14)",
    borderRadius: radius.sm, padding: 8, marginTop: 4,
  },
  staleBannerText: { color: "#F59E0B", fontSize: 10, fontWeight: "700", flex: 1 },

  togglesRow: { flexDirection: "row", gap: 8, marginTop: 10, marginBottom: 10 },
  togglePill: {
    flexDirection: "row",
    backgroundColor: colors.surface, borderRadius: 999,
    borderWidth: 1, borderColor: colors.borderSubtle,
    padding: 2,
  },
  toggleOpt: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
  },
  toggleOptOn: { backgroundColor: colors.primary },
  toggleOptText: { color: colors.textSecondary, fontSize: 11, fontWeight: "700" },

  setupCard: {
    backgroundColor: colors.primaryMuted, borderRadius: radius.md,
    padding: spacing.md, marginTop: 6, gap: 4,
  },
  setupTitle: { color: colors.primaryGlow, fontSize: 13, fontWeight: "800" },
  setupBody: { color: colors.textSecondary, fontSize: 11, lineHeight: 16 },

  sectionHead: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginTop: spacing.lg, marginBottom: 6,
  },
  sectionTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: "800", flex: 1 },
  liveBadge: {
    backgroundColor: "rgba(16,185,129,0.20)", paddingHorizontal: 8,
    paddingVertical: 3, borderRadius: 999,
  },
  liveBadgeText: { color: "#10B981", fontSize: 9, fontWeight: "800", letterSpacing: 0.3 },

  insightsBanner: {
    flexDirection: "row", alignItems: "center", gap: 6,
    padding: 8, borderRadius: radius.sm, marginBottom: 6,
  },
  insightsText: { fontSize: 10, fontWeight: "700", flex: 1 },

  errText: { color: "#EF4444", fontSize: 11, marginBottom: 6 },

  card: {
    backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1,
    borderRadius: radius.md, padding: spacing.md, marginBottom: 8, gap: 8,
  },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  catLabel: { color: colors.primaryGlow, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  pillText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.3 },

  flightRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  airlineLogo: { width: 32, height: 32, borderRadius: 4, backgroundColor: colors.surfaceElevated },
  flightAirline: { color: colors.textPrimary, fontSize: 13, fontWeight: "700" },
  flightMeta: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  flightSubRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  flightSubText: { color: colors.textTertiary, fontSize: 10, fontWeight: "600" },
  flightDot: { color: colors.textTertiary, fontSize: 10 },

  hotelRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  hotelThumb: { width: 60, height: 60, borderRadius: 6, backgroundColor: colors.surfaceElevated },
  hotelName: { color: colors.textPrimary, fontSize: 12, fontWeight: "700", lineHeight: 15 },
  hotelMeta: { color: colors.textTertiary, fontSize: 10, marginTop: 2 },
  amenityRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4 },
  amenityChip: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: colors.surfaceElevated, paddingHorizontal: 6,
    paddingVertical: 2, borderRadius: 8,
  },
  amenityText: { color: colors.textSecondary, fontSize: 9, fontWeight: "600" },
  starPill: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: "rgba(245,158,11,0.14)",
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999,
  },
  starText: { color: "#F59E0B", fontSize: 10, fontWeight: "800" },

  priceBlock: {
    backgroundColor: colors.surfaceElevated, borderRadius: radius.sm,
    padding: 10, marginTop: 4,
  },
  priceBig: { fontSize: 22, fontWeight: "900" },
  priceSub: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  priceSource: { color: "#10B981", fontSize: 9, fontWeight: "700", marginTop: 4 },

  btnGrid: {
    flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4,
  },
  gridBtn: {
    flexBasis: "48%", flexGrow: 1,
    paddingVertical: 9, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.primaryGlow,
    alignItems: "center", justifyContent: "center",
    backgroundColor: colors.surface,
  },
  gridBtnPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  gridBtnMuted: { borderColor: colors.borderSubtle },
  gridBtnText: { color: colors.primaryGlow, fontSize: 11, fontWeight: "800" },

  carrierRow: { flexDirection: "row", gap: 6, marginTop: 4 },
  carrierBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    flexGrow: 1, paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.sm,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primaryGlow,
    justifyContent: "center",
  },
  carrierBtnPrimary: { backgroundColor: "#10B981", borderColor: "#10B981" },
  carrierBtnText: { color: colors.primaryGlow, fontSize: 10, fontWeight: "800" },

  itaNote: {
    flexDirection: "row", alignItems: "flex-start", gap: 6,
    backgroundColor: "rgba(245,158,11,0.10)", padding: 8, borderRadius: radius.sm,
  },
  itaNoteText: { color: "#F59E0B", fontSize: 10, lineHeight: 14, flex: 1 },

  expandBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 4, padding: 10, backgroundColor: colors.surface,
    borderRadius: radius.sm, borderWidth: 1, borderColor: colors.borderSubtle,
    marginBottom: 8,
  },
  expandBtnText: { color: colors.primaryGlow, fontSize: 11, fontWeight: "700" },

  platformSectionHead: {
    flexDirection: "row", alignItems: "center", gap: 4,
    padding: 10, backgroundColor: colors.primaryMuted, borderRadius: radius.sm,
    marginTop: 4, marginBottom: 6,
  },
  platformSectionTitle: { color: colors.primaryGlow, fontSize: 11, fontWeight: "800", flex: 1 },

  platformRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1,
    borderRadius: radius.sm, padding: 10,
  },
  platformRowHighlight: { borderColor: colors.primaryGlow, backgroundColor: colors.primaryMuted },
  platformRowBundle: { borderStyle: "dashed" },
  platformLabel: { color: colors.textPrimary, fontSize: 12, fontWeight: "800" },
  platformTagline: { color: colors.textTertiary, fontSize: 10, marginTop: 1 },
  notePill: {
    flexDirection: "row", alignItems: "flex-start", gap: 4, marginTop: 4,
    backgroundColor: "rgba(245,158,11,0.12)", padding: 5, borderRadius: 6,
  },
  noteText: { color: "#F59E0B", fontSize: 9, lineHeight: 12, flex: 1 },

  bulacanNote: {
    flexDirection: "row", alignItems: "flex-start", gap: 6,
    backgroundColor: "rgba(245,158,11,0.10)",
    padding: 10, borderRadius: radius.sm, marginBottom: 6,
  },
  bulacanNoteText: { color: "#F59E0B", fontSize: 10, lineHeight: 14, fontWeight: "600", flex: 1 },
  hintChip: {
    backgroundColor: colors.surfaceElevated,
    padding: 8, borderRadius: radius.sm, marginBottom: 4,
  },
  hintChipText: { color: colors.textSecondary, fontSize: 10, lineHeight: 14 },

  emptyCard: {
    backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1,
    borderRadius: radius.md, padding: spacing.lg, alignItems: "center",
  },
  emptyText: { color: colors.textTertiary, fontSize: 11, textAlign: "center" },

  fallbackBadge: {
    backgroundColor: "rgba(148,163,184,0.14)",
    padding: 8, borderRadius: radius.sm, marginBottom: 6, alignItems: "center",
  },
  fallbackBadgeText: { color: "#94A3B8", fontSize: 10, fontWeight: "700" },
  estimatedPrice: { color: colors.textPrimary, fontSize: 16, fontWeight: "800", marginTop: 4 },

  disclaimer: {
    marginTop: spacing.xl, padding: 12,
    backgroundColor: colors.surfaceElevated, borderRadius: radius.sm,
  },
  disclaimerText: {
    color: colors.textTertiary, fontSize: 9, lineHeight: 14,
  },
});
