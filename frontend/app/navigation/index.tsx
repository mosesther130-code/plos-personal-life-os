// PLOS — Navigation Home
// Route: /navigation  (deep-link: ?destination=lat,lng&mode=driving&query=text)
//
// Phase 1 web/Expo Go: shows static-map placeholder + all 12 transport chips +
// saved places + quick actions + route comparison launch. Real interactive
// react-native-maps view renders only in a production dev build (Phase 2).
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Image, ActivityIndicator, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ArrowLeft, Search, MapPin, Compass, Navigation, Home as HomeIcon, Briefcase, Building, Leaf, Shield, Landmark, Star, Trash2, X } from "lucide-react-native";
import { colors, spacing, radius } from "@/src/lib/theme";
import { navigationApi } from "@/src/lib/api";

type ModeKey = "driving" | "truck" | "transit" | "taxi" | "cycling" | "walking" | "hiking" | "trail_run" | "mountain" | "boat" | "train" | "motorcycle";

const MODES: { key: ModeKey; label: string; emoji: string; color: string }[] = [
  { key: "driving",    label: "Car",         emoji: "🚗", color: "#3B82F6" },
  { key: "truck",      label: "Truck",       emoji: "🚛", color: "#1E40AF" },
  { key: "transit",    label: "Transit",     emoji: "🚌", color: "#10B981" },
  { key: "taxi",       label: "Taxi",        emoji: "🚕", color: "#F59E0B" },
  { key: "cycling",    label: "Bike",        emoji: "🚲", color: "#14B8A6" },
  { key: "walking",    label: "Walk",        emoji: "🚶", color: "#F97316" },
  { key: "hiking",     label: "Hike",        emoji: "🥾", color: "#78350F" },
  { key: "trail_run",  label: "Trail Run",   emoji: "🏃", color: "#DC2626" },
  { key: "mountain",   label: "Mountain",    emoji: "⛰️",  color: "#4B5563" },
  { key: "boat",       label: "Boat",        emoji: "⛵",   color: "#0C4A6E" },
  { key: "train",      label: "Train",       emoji: "🚂", color: "#7C3AED" },
  { key: "motorcycle", label: "Motorcycle",  emoji: "🏍️", color: "#EA580C" },
];

const DEFAULT_HOME = { lat: 33.8073, lng: -84.1700 };

export default function NavigationHome() {
  const router = useRouter();
  const params = useLocalSearchParams<{ destination?: string; mode?: string; query?: string }>();
  const [places, setPlaces] = useState<{ presets: any[]; user_places: any[] }>({ presets: [], user_places: [] });
  const [analytics, setAnalytics] = useState<any>(null);
  const [mode, setMode] = useState<ModeKey>((params.mode as ModeKey) || "driving");
  const [query, setQuery] = useState<string>(String(params.query || ""));
  const [loading, setLoading] = useState(true);

  // Address autocomplete state (GLOBAL — no country restriction)
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [autoLoading, setAutoLoading] = useState(false);
  const [resolveLoading, setResolveLoading] = useState(false);
  const [provider, setProvider] = useState<string>("");
  const debounceRef = useRef<any>(null);

  const load = useCallback(async () => {
    try {
      const [p, a] = await Promise.all([navigationApi.places(), navigationApi.analytics()]);
      setPlaces({ presets: p.presets || [], user_places: p.user_places || [] });
      setAnalytics(a);
    } catch (e: any) {
      console.warn("[nav] load", e?.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Deep-link auto navigate
  useEffect(() => {
    if (!params.destination) return;
    const s = String(params.destination);
    const parts = s.split(",");
    if (parts.length === 2) {
      const lat = parseFloat(parts[0]);
      const lng = parseFloat(parts[1]);
      if (isFinite(lat) && isFinite(lng)) {
        router.push({ pathname: "/navigation/compare", params: { origin_lat: DEFAULT_HOME.lat, origin_lng: DEFAULT_HOME.lng, dest_lat: lat, dest_lng: lng, mode: mode } as any });
      }
    }
  }, [params.destination, mode, router]);

  const goToDest = (dest: { lat: number; lng: number; name?: string }) => {
    router.push({
      pathname: "/navigation/compare",
      params: {
        origin_lat: DEFAULT_HOME.lat,
        origin_lng: DEFAULT_HOME.lng,
        dest_lat: dest.lat,
        dest_lng: dest.lng,
        dest_name: dest.name || "Destination",
        mode,
      } as any,
    });
  };

  const onSearch = () => {
    if (!query.trim()) return;
    // Accept raw lat,lng input as a shortcut
    const parts = query.split(",").map((s) => parseFloat(s.trim()));
    if (parts.length === 2 && parts.every((n) => isFinite(n))) {
      goToDest({ lat: parts[0], lng: parts[1], name: query });
      return;
    }
    // Trigger a fresh autocomplete search & keep list open
    runAutocomplete(query);
    setSuggestionsOpen(true);
  };

  // ------- Address autocomplete (debounced, GLOBAL search) -------
  const runAutocomplete = useCallback(async (q: string) => {
    if (!q || q.trim().length < 2) {
      setSuggestions([]);
      setProvider("");
      return;
    }
    setAutoLoading(true);
    try {
      // Global search — no country restriction. Location bias is still applied
      // so nearby results are ranked higher, but any address worldwide is returned.
      const r = await navigationApi.autocomplete(q.trim(), {
        near_lat: DEFAULT_HOME.lat,
        near_lng: DEFAULT_HOME.lng,
      });
      setSuggestions(r.predictions || []);
      setProvider(r.provider || "");
    } catch (e: any) {
      console.warn("[nav] autocomplete", e?.message);
      setSuggestions([]);
    } finally {
      setAutoLoading(false);
    }
  }, []);

  const onQueryChange = (v: string) => {
    setQuery(v);
    setSuggestionsOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!v.trim()) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(() => { runAutocomplete(v); }, 280);
  };

  const pickSuggestion = async (s: any) => {
    setSuggestionsOpen(false);
    setQuery(s.description || s.main_text || "");
    // OSM predictions already carry lat/lng
    if (typeof s.lat === "number" && typeof s.lng === "number") {
      goToDest({ lat: s.lat, lng: s.lng, name: s.main_text || s.description });
      return;
    }
    // Google predictions need details lookup
    if (s.place_id) {
      setResolveLoading(true);
      try {
        const d = await navigationApi.placeDetails(s.place_id);
        if (d && d.lat != null && d.lng != null) {
          goToDest({ lat: d.lat, lng: d.lng, name: d.address || s.description });
        } else {
          Alert.alert("Search", "Could not resolve that place.");
        }
      } catch (e: any) {
        Alert.alert("Search", e?.message || "Could not resolve that place.");
      } finally {
        setResolveLoading(false);
      }
    }
  };

  const clearQuery = () => {
    setQuery("");
    setSuggestions([]);
    setSuggestionsOpen(false);
  };

  const allPlaces = useMemo(() => [...places.presets, ...places.user_places], [places]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} testID="nav-back">
          <ArrowLeft color={colors.textPrimary} size={20} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={styles.headerTitle}>Navigation</Text>
          <Text style={styles.headerSub}>Stone Mountain, GA · GPS ready</Text>
        </View>
        <TouchableOpacity style={styles.iconBtn} testID="nav-compass">
          <Compass color={colors.textSecondary} size={18} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} testID="nav-scroll">
        {/* Map placeholder */}
        <View style={styles.mapBox} testID="map-placeholder">
          <Image
            source={{ uri: `https://maps.googleapis.com/maps/api/staticmap?center=${DEFAULT_HOME.lat},${DEFAULT_HOME.lng}&zoom=13&size=600x300&maptype=roadmap&markers=color:blue%7Clabel:P%7C${DEFAULT_HOME.lat},${DEFAULT_HOME.lng}&key=${process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY || ""}` }}
            style={styles.mapImg}
            resizeMode="cover"
          />
          <View style={styles.mapOverlay} pointerEvents="none">
            <View style={styles.blueDot}>
              <View style={styles.blueDotInner} />
            </View>
            <Text style={styles.mapCoord}>{DEFAULT_HOME.lat.toFixed(4)}°N, {Math.abs(DEFAULT_HOME.lng).toFixed(4)}°W</Text>
          </View>
          {Platform.OS === "web" && (
            <View style={styles.webNotice}>
              <Text style={styles.webNoticeText}>🗺️ Interactive map available in the mobile app — install PLOS on your Android device to use GPS navigation</Text>
            </View>
          )}
        </View>

        {/* Search */}
        <View>
          <View style={styles.searchBar} testID="search-bar">
            <Search color={colors.textSecondary} size={16} />
            <TextInput
              value={query}
              onChangeText={onQueryChange}
              onFocus={() => query.length >= 2 && setSuggestionsOpen(true)}
              placeholder="Search any address, place, or lat,lng…"
              placeholderTextColor={colors.textTertiary}
              style={styles.searchInput}
              onSubmitEditing={onSearch}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
              testID="search-input"
            />
            {autoLoading || resolveLoading ? (
              <ActivityIndicator size="small" color={colors.primaryGlow} />
            ) : query.length > 0 ? (
              <TouchableOpacity onPress={clearQuery} testID="search-clear">
                <X color={colors.textTertiary} size={14} />
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity onPress={onSearch} testID="search-btn"><Text style={styles.searchBtn}>Go</Text></TouchableOpacity>
          </View>

          {suggestionsOpen && (suggestions.length > 0 || autoLoading) && (
            <View style={styles.suggestionsBox} testID="suggestions">
              {autoLoading && suggestions.length === 0 ? (
                <View style={styles.suggestionEmpty}>
                  <ActivityIndicator size="small" color={colors.primaryGlow} />
                  <Text style={styles.suggestionEmptyText}>Searching…</Text>
                </View>
              ) : (
                <>
                  {suggestions.map((s, idx) => (
                    <TouchableOpacity
                      key={s.place_id || `${idx}-${s.description}`}
                      style={styles.suggestionRow}
                      onPress={() => pickSuggestion(s)}
                      testID={`suggestion-${idx}`}
                    >
                      <MapPin color={colors.primaryGlow} size={14} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.suggestionMain} numberOfLines={1}>{s.main_text || s.description}</Text>
                        {s.secondary_text ? (
                          <Text style={styles.suggestionSub} numberOfLines={1}>{s.secondary_text}</Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  ))}
                  <View style={styles.suggestionFooter}>
                    <Text style={styles.suggestionFooterText}>
                      🌍 Global search · Powered by {provider === "google" ? "Google Places" : provider === "osm" ? "OpenStreetMap" : "PLOS Search"}
                    </Text>
                  </View>
                </>
              )}
            </View>
          )}
        </View>

        {/* Transport modes */}
        <Text style={styles.h2}>Transport mode</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow} testID="mode-chips">
          {MODES.map((m) => {
            const active = m.key === mode;
            return (
              <TouchableOpacity
                key={m.key}
                style={[styles.modeChip, { backgroundColor: active ? m.color : colors.surfaceElevated, borderColor: active ? m.color : colors.borderSubtle }]}
                onPress={() => setMode(m.key)}
                testID={`mode-${m.key}`}
              >
                <Text style={styles.modeEmoji}>{m.emoji}</Text>
                <Text style={[styles.modeLabel, active && { color: "#fff", fontWeight: "700" }]}>{m.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Analytics teaser */}
        {analytics && analytics.sessions > 0 && (
          <View style={styles.analytics} testID="analytics-card">
            <MapPin color={colors.primaryGlow} size={13} />
            <Text style={styles.analyticsText}>
              📍 {analytics.week_miles} mi navigated this week · Top: {analytics.top_destination || "—"}
            </Text>
          </View>
        )}

        {/* Saved places */}
        <View style={styles.h2Row}>
          <Text style={styles.h2}>Saved places</Text>
          <Text style={styles.h2Meta}>{allPlaces.length} total</Text>
        </View>
        {loading ? (
          <ActivityIndicator color={colors.primaryGlow} style={{ marginTop: 20 }} />
        ) : (
          <View style={{ gap: 8 }}>
            {allPlaces.map((p) => {
              const Icon = p.icon === "home" ? HomeIcon : p.icon === "briefcase" ? Briefcase : p.icon === "leaf" ? Leaf : p.icon === "shield" ? Shield : p.icon === "building" ? Building : p.icon === "landmark" ? Landmark : MapPin;
              return (
                <TouchableOpacity
                  key={p.id || p.key}
                  style={styles.placeRow}
                  onPress={() => goToDest({ lat: p.lat, lng: p.lng, name: p.name })}
                  testID={`place-${p.key || p.id}`}
                >
                  <View style={[styles.placeIcon, { backgroundColor: (p.color || colors.primaryGlow) + "30" }]}>
                    <Icon color={p.color || colors.primaryGlow} size={16} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.placeName}>{p.name}</Text>
                    <Text style={styles.placeAddr} numberOfLines={1}>{p.address}</Text>
                  </View>
                  {p.is_preset ? <Star color={colors.warning} size={12} /> : (
                    <TouchableOpacity onPress={async () => { await navigationApi.deletePlace(p.id); load(); }}>
                      <Trash2 color={colors.danger} size={13} />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Quick actions */}
        <Text style={styles.h2}>Quick actions</Text>
        <View style={styles.quickRow}>
          <TouchableOpacity style={styles.quickBtn} onPress={() => {
            const h = places.presets.find((x) => x.key === "home") || places.presets[0];
            if (h) goToDest({ lat: h.lat, lng: h.lng, name: h.name });
          }} testID="qa-home">
            <HomeIcon color={colors.primaryGlow} size={14} />
            <Text style={styles.quickBtnText}>Home</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickBtn} onPress={() => {
            const w = places.presets.find((x) => x.key === "work");
            if (w) goToDest({ lat: w.lat, lng: w.lng, name: w.name });
          }} testID="qa-work">
            <Briefcase color={colors.success} size={14} />
            <Text style={styles.quickBtnText}>Work</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickBtn} onPress={() => {
            const e = places.presets.find((x) => x.key === "eden_heights");
            if (e) goToDest({ lat: e.lat, lng: e.lng, name: e.name });
          }} testID="qa-eden">
            <Leaf color={"#22C55E"} size={14} />
            <Text style={styles.quickBtnText}>Eden Heights</Text>
          </TouchableOpacity>
        </View>

        {/* Phase 2 note */}
        <View style={styles.phase2Note}>
          <Navigation color={colors.textTertiary} size={12} />
          <Text style={styles.phase2Text}>
            Phase 2 features unlock after your next Play Store build: turn-by-turn voice guidance, offline maps, compass overlay, track recording, terrain overlays, Philippines coding-scheme alerts, and live location sharing.
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: 8 },
  backBtn: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.surfaceElevated, alignItems: "center", justifyContent: "center" },
  iconBtn: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.surfaceElevated, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: "700" },
  headerSub: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  scroll: { padding: spacing.lg, gap: 12, paddingBottom: 60 },
  mapBox: { height: 200, borderRadius: 12, overflow: "hidden", backgroundColor: colors.surfaceElevated, position: "relative" },
  mapImg: { width: "100%", height: "100%" },
  mapOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  blueDot: { width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(59,130,246,0.25)", alignItems: "center", justifyContent: "center" },
  blueDotInner: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.primaryGlow, borderWidth: 2, borderColor: "#fff" },
  mapCoord: { color: "#fff", fontSize: 10, marginTop: 6, backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3 },
  webNotice: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "rgba(0,0,0,0.72)", padding: 8 },
  webNoticeText: { color: "#fff", fontSize: 10, textAlign: "center", lineHeight: 14 },
  searchBar: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  searchInput: { flex: 1, color: colors.textPrimary, fontSize: 14 },
  searchBtn: { color: colors.primaryGlow, fontWeight: "700", fontSize: 13, paddingHorizontal: 6 },
  suggestionsBox: { marginTop: 6, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: 10, overflow: "hidden" },
  suggestionRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  suggestionMain: { color: colors.textPrimary, fontSize: 13, fontWeight: "600" },
  suggestionSub: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  suggestionEmpty: { flexDirection: "row", alignItems: "center", gap: 8, padding: 14, justifyContent: "center" },
  suggestionEmptyText: { color: colors.textSecondary, fontSize: 12 },
  suggestionFooter: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.surface },
  suggestionFooterText: { color: colors.textTertiary, fontSize: 10 },
  h2: { color: colors.textPrimary, fontSize: 13, fontWeight: "700", marginTop: 8, letterSpacing: 0.4, textTransform: "uppercase" },
  h2Row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
  h2Meta: { color: colors.textTertiary, fontSize: 11 },
  chipsRow: { gap: 6, paddingRight: 12 },
  modeChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  modeEmoji: { fontSize: 14 },
  modeLabel: { color: colors.textPrimary, fontSize: 12, fontWeight: "600" },
  analytics: { flexDirection: "row", alignItems: "center", gap: 6, padding: 10, backgroundColor: "rgba(59,130,246,0.08)", borderRadius: 8, borderWidth: 1, borderColor: "rgba(59,130,246,0.25)" },
  analyticsText: { color: colors.textPrimary, fontSize: 12, flex: 1 },
  placeRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.borderSubtle },
  placeIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  placeName: { color: colors.textPrimary, fontWeight: "700", fontSize: 13 },
  placeAddr: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  quickRow: { flexDirection: "row", gap: 8 },
  quickBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 8, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.borderSubtle },
  quickBtnText: { color: colors.textPrimary, fontWeight: "600", fontSize: 12 },
  phase2Note: { flexDirection: "row", gap: 6, padding: 10, backgroundColor: colors.surfaceElevated, borderRadius: 8, marginTop: 20, alignItems: "flex-start" },
  phase2Text: { color: colors.textTertiary, fontSize: 10, flex: 1, lineHeight: 14 },
});
