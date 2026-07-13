// PLOS — Route Comparison
// Route: /navigation/compare?origin_lat=..&origin_lng=..&dest_lat=..&dest_lng=..&dest_name=..
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ArrowLeft, ExternalLink, MapPin, Trophy, Clock } from "lucide-react-native";
import { colors, spacing, radius } from "@/src/lib/theme";
import { navigationApi } from "@/src/lib/api";
import { openExternalUrl } from "@/src/lib/open-url";

// (Local openExternal replaced by shared /src/lib/open-url helper — fixes
// ERR_BLOCKED_BY_RESPONSE when Google Maps refuses to iframe-embed on web.)

const MODE_META: Record<string, { label: string; emoji: string; color: string }> = {
  driving: { label: "Drive",   emoji: "🚗", color: "#3B82F6" },
  walking: { label: "Walk",    emoji: "🚶", color: "#F97316" },
  cycling: { label: "Cycle",   emoji: "🚲", color: "#14B8A6" },
  transit: { label: "Transit", emoji: "🚌", color: "#10B981" },
};

export default function CompareRoutes() {
  const router = useRouter();
  const params = useLocalSearchParams<{ origin_lat: string; origin_lng: string; dest_lat: string; dest_lng: string; dest_name?: string }>();
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const origin = { lat: parseFloat(String(params.origin_lat)), lng: parseFloat(String(params.origin_lng)) };
      const destination = { lat: parseFloat(String(params.dest_lat)), lng: parseFloat(String(params.dest_lng)) };
      if (!isFinite(origin.lat) || !isFinite(destination.lat)) throw new Error("Bad coords");
      const res = await navigationApi.compare({ origin, destination });
      setResult(res);
      // Log to history — pick fastest for logging
      const modes = res.modes || {};
      const bestMode = Object.entries(modes).find(([_, v]: any) => v?.duration_min);
      if (bestMode) {
        const [mk, mv]: any = bestMode;
        navigationApi.logHistory({
          origin,
          destination,
          destination_name: String(params.dest_name || "Destination"),
          transport_mode: mk,
          planned_distance_km: mv?.distance_km,
          planned_duration_minutes: mv?.duration_min,
          map_provider_used: mv?.provider,
        }).catch(() => {});
      }
    } catch (e: any) {
      Alert.alert("Compare failed", String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, [params.origin_lat, params.origin_lng, params.dest_lat, params.dest_lng, params.dest_name]);

  useEffect(() => { load(); }, [load]);

  const openGoogleMaps = (m: any) => {
    const url = m?.google_maps_link || `https://www.google.com/maps/dir/?api=1&origin=${params.origin_lat},${params.origin_lng}&destination=${params.dest_lat},${params.dest_lng}`;
    openExternalUrl(url);
  };

  // Determine fastest mode
  const modes = result?.modes || {};
  const modesArr = Object.entries(modes).filter(([_, v]: any) => v?.duration_min);
  const fastest = modesArr.length ? modesArr.reduce((a: any, b: any) => (a[1].duration_min < b[1].duration_min ? a : b)) : null;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} testID="compare-back">
          <ArrowLeft color={colors.textPrimary} size={20} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={styles.headerTitle}>Route options</Text>
          <Text style={styles.headerSub} numberOfLines={1}>To: {String(params.dest_name || "Destination")}</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.primaryGlow} size="large" />
          <Text style={styles.loadingText}>Calculating routes for 4 modes...</Text>
          <Text style={styles.loadingSub}>Google Directions + OpenStreetMap</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.tripCard} testID="trip-summary">
            <MapPin color={colors.primaryGlow} size={14} />
            <View style={{ flex: 1 }}>
              <Text style={styles.tripText}>{String(params.origin_lat).slice(0, 6)}°, {String(params.origin_lng).slice(0, 6)}°</Text>
              <Text style={styles.tripArrow}>↓</Text>
              <Text style={styles.tripText}>{String(params.dest_name || `${params.dest_lat}°, ${params.dest_lng}°`)}</Text>
            </View>
          </View>

          {["driving", "walking", "cycling", "transit"].map((m) => {
            const meta = MODE_META[m];
            const data = modes[m];
            const isFastest = fastest && fastest[0] === m;
            if (!data) return null;
            const hasError = data.provider === "fallback" || data.error;
            return (
              <View key={m} style={[styles.modeCard, isFastest && { borderColor: colors.success, backgroundColor: "rgba(16,185,129,0.06)" }]} testID={`mode-card-${m}`}>
                <View style={styles.modeCardHead}>
                  <View style={[styles.modeAvatar, { backgroundColor: meta.color }]}>
                    <Text style={styles.modeAvatarEmoji}>{meta.emoji}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={styles.modeCardTitle}>{meta.label}</Text>
                      {isFastest && (
                        <View style={styles.fastestBadge}>
                          <Trophy color="#000" size={9} />
                          <Text style={styles.fastestText}>FASTEST</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.modeProvider}>via {data.provider === "google" ? "Google Maps" : data.provider === "osrm" ? "OpenStreetMap" : "Deep link"}</Text>
                  </View>
                </View>
                {hasError ? (
                  <View style={styles.errorBox}>
                    <Text style={styles.errorText}>{data.message || `Routing unavailable (${data.error})`}</Text>
                    {data.google_maps_link && (
                      <TouchableOpacity onPress={() => openGoogleMaps(data)}>
                        <Text style={styles.openLink}>Open in Google Maps →</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ) : (
                  <>
                    <View style={styles.metricsRow}>
                      <View style={styles.metric}>
                        <Clock color={colors.textSecondary} size={12} />
                        <Text style={styles.metricValue}>{Math.round(data.duration_min)}<Text style={styles.metricUnit}> min</Text></Text>
                      </View>
                      <View style={styles.metric}>
                        <MapPin color={colors.textSecondary} size={12} />
                        <Text style={styles.metricValue}>{data.distance_miles}<Text style={styles.metricUnit}> mi</Text></Text>
                      </View>
                      <View style={styles.metric}>
                        <Text style={[styles.metricValue, { fontSize: 12, color: colors.textSecondary }]}>{data.distance_km} km</Text>
                      </View>
                    </View>
                    {data.disclaimer && (
                      <Text style={styles.disclaimerText}>⚠️ {data.disclaimer}</Text>
                    )}
                    <TouchableOpacity style={[styles.startBtn, { backgroundColor: meta.color }]} onPress={() => openGoogleMaps(data)} testID={`start-${m}`}>
                      <ExternalLink color="#fff" size={13} />
                      <Text style={styles.startBtnText}>Open in Google Maps</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            );
          })}

          <View style={styles.footerNote}>
            <Text style={styles.footerNoteText}>
              Turn-by-turn navigation with voice guidance opens after your next Play Store build. For now tap any mode to open the full directions in Google Maps.
            </Text>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  backBtn: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.surfaceElevated, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: "700" },
  headerSub: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  loadingBox: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 40 },
  loadingText: { color: colors.textPrimary, fontSize: 14, fontWeight: "600" },
  loadingSub: { color: colors.textSecondary, fontSize: 11 },
  scroll: { padding: spacing.lg, gap: 10 },
  tripCard: { flexDirection: "row", gap: 10, padding: 12, backgroundColor: colors.surfaceElevated, borderRadius: 10 },
  tripText: { color: colors.textPrimary, fontSize: 12 },
  tripArrow: { color: colors.textTertiary, fontSize: 12, marginVertical: 2 },
  modeCard: { padding: 12, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.borderSubtle, gap: 8 },
  modeCardHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  modeAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  modeAvatarEmoji: { fontSize: 18 },
  modeCardTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: "700" },
  modeProvider: { color: colors.textTertiary, fontSize: 10, marginTop: 2 },
  fastestBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: colors.success, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
  fastestText: { color: "#000", fontSize: 8, fontWeight: "800", letterSpacing: 0.5 },
  metricsRow: { flexDirection: "row", gap: 16 },
  metric: { flexDirection: "row", alignItems: "center", gap: 4 },
  metricValue: { color: colors.textPrimary, fontSize: 18, fontWeight: "800" },
  metricUnit: { fontSize: 12, color: colors.textSecondary, fontWeight: "600" },
  disclaimerText: { color: colors.warning, fontSize: 10 },
  startBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 8 },
  startBtnText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  errorBox: { padding: 10, backgroundColor: colors.surfaceElevated, borderRadius: 8 },
  errorText: { color: colors.textSecondary, fontSize: 12 },
  openLink: { color: colors.primaryGlow, fontSize: 12, fontWeight: "700", marginTop: 6 },
  footerNote: { padding: 12, backgroundColor: colors.surfaceElevated, borderRadius: 8, marginTop: 8 },
  footerNoteText: { color: colors.textTertiary, fontSize: 10, lineHeight: 14 },
});
