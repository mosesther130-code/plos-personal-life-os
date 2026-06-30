// Local Intelligence & Safety — single scrolling screen.
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Linking,
  Alert,
  Animated,
  Easing,
  Platform,
  Share, // legacy import kept to avoid touching unrelated code; safeShare wraps it
  Modal,
  TextInput,
  Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Svg, { Circle, Defs, RadialGradient, Stop, Rect } from "react-native-svg";
import {
  ArrowLeft,
  Sun,
  CloudRain,
  Cloud,
  CloudSnow,
  CloudFog,
  CloudLightning,
  Wind,
  Satellite,
  Map as MapIcon,
  Phone,
  MapPin,
  Hospital,
  Shield,
  TreePine,
  AlertTriangle,
  Fuel,
  AlertCircle,
  Truck,
  CheckCircle2,
  Download,
  UserPlus,
  PauseCircle,
  PlayCircle,
  Radio,
  ChevronRight,
  RefreshCw,
  Utensils,
  Info,
  Pencil,
  Plus,
  Plane,
  Bell,
  Tv,
} from "lucide-react-native";
import * as Location from "expo-location";

import { localApi, localExtrasApi, familyLocationsApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";
import { EditModal, type Field } from "@/src/components/EditModal";
import { safeShare } from "@/src/lib/share";
import { subscribeFamilyLocations, type FamilyLocationDoc } from "@/src/lib/firebase";
import { useAuth } from "@/src/lib/auth-context";

const DEFAULT_LAT = 33.749;
const DEFAULT_LON = -84.388;

const FAMILY_FIELDS: Field[] = [
  { key: "name", label: "Name", kind: "text", placeholder: "e.g. Mom" },
  {
    key: "relation",
    label: "Relation",
    kind: "select",
    options: [
      { label: "Spouse", value: "Spouse" },
      { label: "Parent", value: "Parent" },
      { label: "Child", value: "Child" },
      { label: "Sibling", value: "Sibling" },
      { label: "Friend", value: "Friend" },
      { label: "Family", value: "Family" },
      { label: "Other", value: "Other" },
    ],
  },
  {
    key: "color",
    label: "Pin Color",
    kind: "select",
    options: [
      { label: "Blue", value: "#3B82F6" },
      { label: "Green", value: "#10B981" },
      { label: "Red", value: "#EF4444" },
      { label: "Amber", value: "#F59E0B" },
      { label: "Purple", value: "#A855F7" },
      { label: "Pink", value: "#EC4899" },
      { label: "Cyan", value: "#06B6D4" },
    ],
  },
];

const OFFLINE_FIELDS: Field[] = [
  { key: "name", label: "Region Name", kind: "text", placeholder: "e.g. Florida, USA" },
  {
    key: "region_type",
    label: "Type",
    kind: "select",
    options: [
      { label: "Country", value: "country" },
      { label: "State / Province", value: "state" },
      { label: "Metro / City", value: "metro" },
      { label: "Custom Area", value: "custom" },
    ],
  },
  { key: "size_mb", label: "Estimated Size (MB)", kind: "number", suffix: "MB" },
  { key: "notes", label: "Notes (optional)", kind: "text" },
];

function WeatherIcon({ name, size = 26, color = colors.primaryGlow }: { name: string; size?: number; color?: string }) {
  const props = { size, color };
  switch (name) {
    case "sun": return <Sun {...props} />;
    case "cloudy": return <Cloud {...props} />;
    case "partly-cloudy": return <Cloud {...props} />;
    case "rain": return <CloudRain {...props} />;
    case "snow": return <CloudSnow {...props} />;
    case "thunderstorm": return <CloudLightning {...props} />;
    case "fog": return <CloudFog {...props} />;
    case "wind": return <Wind {...props} />;
    default: return <Sun {...props} />;
  }
}

function alertSeverityStyle(event: string, severity: string) {
  const e = (event || "").toLowerCase();
  const s = (severity || "").toLowerCase();
  if (e.includes("tornado warning") || e.includes("severe thunderstorm warning") || s === "extreme") {
    return { bg: "rgba(239,68,68,0.15)", border: "rgba(239,68,68,0.5)", text: colors.danger };
  }
  if (e.includes("watch") || s === "severe") {
    return { bg: "rgba(245,158,11,0.15)", border: "rgba(245,158,11,0.5)", text: colors.warning };
  }
  return { bg: "rgba(96,165,250,0.12)", border: "rgba(96,165,250,0.4)", text: colors.primaryGlow };
}

export default function SafetyLocal() {
  const router = useRouter();
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [usingDefault, setUsingDefault] = useState(true);
  const [permDenied, setPermDenied] = useState(false);
  const [data, setData] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [recallTab, setRecallTab] = useState<"food" | "products" | "vehicle">("food");
  const [sosConfirm, setSosConfirm] = useState<{ visible: boolean; test: boolean }>({ visible: false, test: false });
  const [vinInput, setVinInput] = useState("");
  const [inviteModal, setInviteModal] = useState<{ open: boolean; name: string; link?: string }>({ open: false, name: "" });
  const [familyEdit, setFamilyEdit] = useState<{ open: boolean; item?: any }>({ open: false });
  // ----- Firestore realtime family locations -----
  const { user } = useAuth();
  const [liveLocations, setLiveLocations] = useState<Record<string, FamilyLocationDoc>>({});
  const [liveStatus, setLiveStatus] = useState<"connecting" | "live" | "off" | "error">("off");
  const [liveError, setLiveError] = useState<string | null>(null);
  const [simulateBusy, setSimulateBusy] = useState(false);
  const [simulateResult, setSimulateResult] = useState<null | {
    member_name: string;
    bearing_deg: number;
    distance_miles: number;
    latency_ms: number | null;
  }>(null);
  const simulateSentAtRef = useRef<number | null>(null);
  const simulateMemberIdRef = useRef<string | null>(null);
  // Enhancement 7 state
  const [offlineRegions, setOfflineRegions] = useState<any[]>([]);
  const [offlineTotalMb, setOfflineTotalMb] = useState(0);
  const [offlineModal, setOfflineModal] = useState<{ open: boolean; item?: any }>({ open: false });
  const [travelMap, setTravelMap] = useState<any | null>(null);
  const [gpsSettings, setGpsSettings] = useState<any>({
    enabled: true,
    severe_weather: true,
    crime_geofence: true,
    travel_advisories: true,
    speed_alerts: false,
    radius_miles: 5,
  });
  const [gpsAlerts, setGpsAlerts] = useState<any[]>([]);
  const [media, setMedia] = useState<any>({ tv: [], radio: [] });
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.06, duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ])
    ).start();
  }, [pulse]);

  const requestLocation = useCallback(async () => {
    try {
      const cur = await Location.getForegroundPermissionsAsync();
      if (cur.status === "granted") {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setUsingDefault(false);
        return { lat: pos.coords.latitude, lon: pos.coords.longitude };
      }
      if (!cur.canAskAgain) {
        setPermDenied(true);
        setUsingDefault(true);
        return { lat: DEFAULT_LAT, lon: DEFAULT_LON };
      }
      const ask = await Location.requestForegroundPermissionsAsync();
      if (ask.status === "granted") {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setUsingDefault(false);
        return { lat: pos.coords.latitude, lon: pos.coords.longitude };
      }
      setPermDenied(!ask.canAskAgain);
      setUsingDefault(true);
      return { lat: DEFAULT_LAT, lon: DEFAULT_LON };
    } catch (_e) {
      setUsingDefault(true);
      return { lat: DEFAULT_LAT, lon: DEFAULT_LON };
    }
  }, []);

  const loadAll = useCallback(async (c?: { lat: number; lon: number }) => {
    const pos = c || coords || { lat: DEFAULT_LAT, lon: DEFAULT_LON };
    const [
      weather, nearby, gas, food, products, vehicle, family, satellite,
      offlineMaps, travel, gpsSet, gpsCheck, mediaResp,
    ] = await Promise.all([
      localApi.weather(pos.lat, pos.lon).catch(() => ({})),
      localApi.nearby().catch(() => ({})),
      localApi.gas().catch(() => ({})),
      localApi.recallsFood().catch(() => ({ recalls: [] })),
      localApi.recallsProducts().catch(() => ({ recalls: [] })),
      localApi.recallsVehicle(2015, "Toyota", "RAV4").catch(() => ({ recalls: [] })),
      localApi.family().catch(() => ({ members: [] })),
      localApi.satelliteStatus().catch(() => ({})),
      localExtrasApi.listOfflineMaps().catch(() => ({ regions: [], total_size_mb: 0 })),
      localExtrasApi.travelMap().catch(() => ({ trip: null })),
      localExtrasApi.gpsAlertSettings().catch(() => null),
      localExtrasApi.checkGpsAlerts(pos.lat, pos.lon).catch(() => ({ alerts: [] })),
      localExtrasApi.media(pos.lat, pos.lon).catch(() => ({ tv: [], radio: [] })),
    ]);
    setData({ weather, nearby, gas, food, products, vehicle, family, satellite });
    setOfflineRegions(offlineMaps.regions || []);
    setOfflineTotalMb(offlineMaps.total_size_mb || 0);
    setTravelMap(travel);
    if (gpsSet) setGpsSettings(gpsSet);
    setGpsAlerts(gpsCheck?.alerts || []);
    setMedia(mediaResp);
  }, [coords]);

  // Enhancement 7 — Offline Maps handlers
  const saveOfflineRegion = async (vals: any) => {
    const body = { ...vals, size_mb: Number(vals.size_mb) || 0 };
    if (offlineModal.item) {
      await localExtrasApi.updateOfflineMap(offlineModal.item.id, body);
    } else {
      await localExtrasApi.createOfflineMap(body);
    }
    const r = await localExtrasApi.listOfflineMaps();
    setOfflineRegions(r.regions || []);
    setOfflineTotalMb(r.total_size_mb || 0);
  };
  const deleteOfflineRegion = async () => {
    if (!offlineModal.item) return;
    await localExtrasApi.deleteOfflineMap(offlineModal.item.id);
    const r = await localExtrasApi.listOfflineMaps();
    setOfflineRegions(r.regions || []);
    setOfflineTotalMb(r.total_size_mb || 0);
  };

  // Enhancement 7 — GPS Alerts toggles
  const toggleGpsSetting = async (key: string, val: boolean) => {
    const next = { ...gpsSettings, [key]: val };
    setGpsSettings(next);
    try {
      await localExtrasApi.updateGpsAlertSettings(next);
    } catch (_e) {
      // revert on failure
      setGpsSettings(gpsSettings);
    }
  };

  useEffect(() => {
    (async () => {
      const pos = await requestLocation();
      await loadAll(pos);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fireSOS = async (test: boolean) => {
    const pos = coords || { lat: DEFAULT_LAT, lon: DEFAULT_LON };
    try {
      const r = await localApi.sos(pos.lat, pos.lon, test);
      if (!test) {
        // Open share sheet w/ coordinates + dial 911
        const msg = `EMERGENCY! I need help. My location: ${pos.lat.toFixed(5)}, ${pos.lon.toFixed(5)}. Maps: https://maps.google.com/?q=${pos.lat},${pos.lon}`;
        try {
          await safeShare({
            title: "Emergency SOS",
            message: msg,
            url: `https://maps.google.com/?q=${pos.lat},${pos.lon}`,
            label: "Emergency location · copy and send",
          });
        } catch (_e) {}
        if (Platform.OS !== "web") {
          Linking.openURL("tel:911").catch(() => {});
        }
      }
      Alert.alert(
        test ? "Test SOS sent" : "SOS triggered",
        `Notified ${r.notified_count} contact${r.notified_count === 1 ? "" : "s"}${test ? " (test mode — no call placed)." : " · 911 dialed."}`
      );
    } catch (_e) {
      Alert.alert("SOS failed", "Could not log SOS event.");
    }
  };

  const checkVin = async () => {
    setBusy("vehicle");
    try {
      const r = await localApi.recallsVehicle(2015, "Toyota", "RAV4", vinInput.trim() || undefined);
      setData((d: any) => ({ ...d, vehicle: r }));
    } catch (_e) {}
    setBusy(null);
  };

  const togglePause = async () => {
    setBusy("pause");
    try {
      await localApi.pauseLocation(!data.family?.self_paused);
      const f = await localApi.family();
      setData((d: any) => ({ ...d, family: f }));
    } catch (_e) {}
    setBusy(null);
  };

  // ----- Firestore realtime family locations -----
  // Subscribe to live updates and measure end-to-end latency when we
  // trigger a "Simulate live update" so the user can see the listener fires.
  useEffect(() => {
    if (!user?.user_id) return;
    setLiveStatus("connecting");
    setLiveError(null);
    // Hydrate Firestore from MongoDB so the listener has baseline docs.
    familyLocationsApi.sync().catch((e: any) => {
      const msg = String(e?.message || e || "");
      const friendly = /firestore\.googleapis\.com|SERVICE_DISABLED|has not been used|not initialised|not enabled/i.test(
        msg
      )
        ? "Cloud Firestore API is disabled for project plos-53fbd. Enable it at console.developers.google.com and create the (default) database in native mode, then retry."
        : msg;
      console.warn("family-locations/sync failed:", msg);
      setLiveError(friendly);
      setLiveStatus("error");
    });
    const unsub = subscribeFamilyLocations(
      user.user_id,
      (docs) => {
        setLiveStatus("live");
        const byId: Record<string, FamilyLocationDoc> = {};
        docs.forEach((d) => {
          byId[d.user_id] = d;
        });
        setLiveLocations(byId);
        // Latency check — if we just sent a simulate request, measure
        // the time from request → snapshot for that exact member.
        const startedAt = simulateSentAtRef.current;
        const targetId = simulateMemberIdRef.current;
        if (startedAt && targetId && byId[targetId]) {
          const latency = Date.now() - startedAt;
          simulateSentAtRef.current = null;
          simulateMemberIdRef.current = null;
          setSimulateResult((prev) =>
            prev ? { ...prev, latency_ms: latency } : prev
          );
        }
      },
      (err) => {
        console.warn("Firestore subscribe error:", err);
        setLiveStatus("error");
      }
    );
    return () => {
      unsub();
    };
  }, [user?.user_id]);

  const simulateLiveUpdate = async () => {
    setSimulateBusy(true);
    setSimulateResult(null);
    try {
      // Prefer "Isaac" if present; else first member
      const members = data.family?.members || [];
      const target =
        members.find((m: any) => /isaac/i.test(m.name)) || members[0];
      if (!target) {
        Alert.alert("No family members", "Add a family member first.");
        return;
      }
      simulateMemberIdRef.current = target.member_id;
      simulateSentAtRef.current = Date.now();
      const r = await familyLocationsApi.simulate({
        member_id: target.member_id,
        distance_miles: 0.5,
        message: "On the move",
      });
      setSimulateResult({
        member_name: r.name,
        bearing_deg: r.bearing_deg,
        distance_miles: r.distance_miles,
        latency_ms: null, // filled when listener fires
      });
    } catch (e: any) {
      simulateSentAtRef.current = null;
      simulateMemberIdRef.current = null;
      Alert.alert("Simulate failed", String(e?.message || e));
    } finally {
      setSimulateBusy(false);
    }
  };

  const generateInvite = async () => {
    if (!inviteModal.name.trim()) return;
    setBusy("invite");
    try {
      const r = await localApi.inviteFamily(inviteModal.name.trim());
      setInviteModal((s) => ({ ...s, link: r.invite_link }));
      // refresh list so the new pending row appears immediately
      const f = await localApi.family();
      setData((d: any) => ({ ...d, family: f }));
    } catch (_e) {}
    setBusy(null);
  };

  const saveFamilyMember = async (vals: any) => {
    if (!familyEdit.item) return;
    await localApi.updateFamilyMember(familyEdit.item.member_id, {
      name: (vals.name || "").trim(),
      relation: vals.relation,
      color: vals.color,
    });
    const f = await localApi.family();
    setData((d: any) => ({ ...d, family: f }));
  };

  const deleteFamilyMember = async () => {
    if (!familyEdit.item) return;
    await localApi.deleteFamilyMember(familyEdit.item.member_id);
    const f = await localApi.family();
    setData((d: any) => ({ ...d, family: f }));
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.loader}>
          <ActivityIndicator color={colors.primaryGlow} />
        </View>
      </SafeAreaView>
    );
  }

  const w = data.weather || {};
  const nearby = data.nearby || {};
  const gas = data.gas || {};
  const food = data.food || {};
  const products = data.products || {};
  const vehicle = data.vehicle || {};
  const family = data.family || { members: [] };
  const sat = data.satellite || {};

  const recallsByTab: any =
    recallTab === "food" ? food : recallTab === "products" ? products : vehicle;
  const recallList = recallsByTab?.recalls || [];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} testID="local-back">
          <ArrowLeft color={colors.textPrimary} size={20} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={styles.headerTitle}>Local Intelligence & Safety</Text>
          <View style={styles.gpsRow}>
            <View style={[styles.gpsDot, { backgroundColor: usingDefault ? colors.warning : colors.success }]} />
            <Satellite color={colors.textTertiary} size={10} />
            <Text style={styles.gpsLabel}>
              {usingDefault ? "Default: Atlanta, GA" : "GPS Active"}
            </Text>
          </View>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => { setRefreshing(true); await loadAll(); setRefreshing(false); }}
            tintColor={colors.primaryGlow}
          />
        }
      >
        {permDenied && (
          <TouchableOpacity onPress={() => Linking.openSettings?.()} style={styles.permRow} testID="loc-perm-row">
            <Info size={12} color={colors.warning} />
            <Text style={styles.permText}>Location denied — tap to open Settings.</Text>
          </TouchableOpacity>
        )}

        {/* WEATHER */}
        <Section label="Weather" />
        {w.error ? (
          <View style={styles.card}><Text style={styles.errText}>Weather unavailable: {w.error}</Text></View>
        ) : (
          <View style={styles.weatherCard} testID="weather-card">
            <View style={styles.weatherTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.weatherLoc}>{w.location || "—"}</Text>
                <Text style={styles.weatherTemp}>{w.current?.temperature ?? "—"}°{w.current?.unit || "F"}</Text>
                <Text style={styles.weatherCond}>{w.current?.short_forecast || ""}</Text>
              </View>
              <WeatherIcon name={w.current?.icon || "sun"} size={64} color={colors.primaryGlow} />
            </View>
            <View style={styles.weatherMeta}>
              <Meta label="Humidity" value={w.current?.humidity ? `${w.current.humidity}%` : "—"} />
              <Meta label="Wind" value={`${w.current?.wind_speed || "—"} ${w.current?.wind_direction || ""}`} />
              <Meta label="UV" value="—" />
            </View>
            {w.using_default_location && (
              <Text style={styles.usingDefault}>Using default location: Atlanta, GA</Text>
            )}
          </View>
        )}

        {/* Weather alerts */}
        {(w.alerts || []).map((a: any) => {
          const s = alertSeverityStyle(a.event, a.severity);
          return (
            <View key={a.id} style={[styles.alertBanner, { backgroundColor: s.bg, borderColor: s.border }]} testID={`weather-alert-${a.id}`}>
              <AlertTriangle size={14} color={s.text} />
              <Text style={[styles.alertText, { color: s.text }]} numberOfLines={3}>
                <Text style={{ fontWeight: "700" }}>{a.event}: </Text>
                {a.headline}
              </Text>
            </View>
          );
        })}

        {/* 7-day forecast */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.forecastRow}>
          {(w.forecast || []).map((d: any) => (
            <View key={d.day} style={styles.forecastCard} testID={`forecast-${d.day}`}>
              <Text style={styles.forecastDay}>{d.day.slice(0, 3)}</Text>
              <WeatherIcon name={d.icon} size={22} />
              <Text style={styles.forecastHigh}>{d.high}°</Text>
              <Text style={styles.forecastLow}>{d.low ?? "—"}°</Text>
            </View>
          ))}
        </ScrollView>

        {/* SOS */}
        <Section label="Emergency SOS" />
        <Animated.View style={{ transform: [{ scale: pulse }] }}>
          <TouchableOpacity
            style={styles.sosBtn}
            onPress={() => setSosConfirm({ visible: true, test: false })}
            testID="sos-button"
            activeOpacity={0.85}
          >
            <Text style={styles.sosText}>EMERGENCY SOS</Text>
            <Text style={styles.sosSub}>Hold-to-confirm · calls 911 + alerts contacts</Text>
          </TouchableOpacity>
        </Animated.View>
        <View style={styles.sosRow}>
          <TouchableOpacity
            style={styles.shareBtn}
            onPress={async () => {
              const pos = coords || { lat: DEFAULT_LAT, lon: DEFAULT_LON };
              await safeShare({
                title: "My location",
                message: `My current location: ${pos.lat.toFixed(5)}, ${pos.lon.toFixed(5)}`,
                url: `https://maps.google.com/?q=${pos.lat},${pos.lon}`,
                label: "Location copied · paste into a message",
              });
            }}
            testID="share-location"
          >
            <MapPin size={14} color={colors.primaryGlow} />
            <Text style={styles.shareText}>Share My Location</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.shareBtn}
            onPress={() => setSosConfirm({ visible: true, test: true })}
            testID="test-sos"
          >
            <Shield size={14} color={colors.textSecondary} />
            <Text style={[styles.shareText, { color: colors.textSecondary }]}>Test SOS</Text>
          </TouchableOpacity>
        </View>

        {/* SATELLITE STATUS */}
        <Section label="Satellite & Offline Readiness" />
        <View style={styles.satCard} testID="satellite-card">
          <SatRow
            label="GPS satellites acquired"
            value={`${sat.gps_satellites_acquired ?? 0} of ${sat.gps_satellites_total ?? 12}`}
            ok={!!sat.gps_lock}
          />
          <SatRow
            label="Offline maps"
            value={`Downloaded for ${(sat.offline_maps?.downloaded_regions || []).length} regions`}
            ok={!!sat.offline_maps?.all_synced}
          />
          <SatRow
            label="Satellite messaging"
            value={sat.satellite_messaging?.configured ? "Configured" : "Not configured"}
            warn={!sat.satellite_messaging?.configured}
            extra={
              !sat.satellite_messaging?.configured && (
                <TouchableOpacity onPress={() => Alert.alert("Satellite Messaging", "PLOS supports Garmin inReach hardware and iPhone Emergency SOS via satellite (system-handled). Add details in Settings to enable handoff.") } testID="sat-setup">
                  <Text style={styles.satLink}>Set up</Text>
                </TouchableOpacity>
              )
            }
          />
          <SatRow
            label="Emergency contacts loaded"
            value={`${sat.emergency_contacts_loaded ?? 0} contacts`}
            ok={(sat.emergency_contacts_loaded ?? 0) > 0}
          />
        </View>

        {/* FAMILY */}
        <Section
          label="Family Locations"
          trailing={
            <View style={styles.liveRow}>
              <View style={[styles.liveDot, { backgroundColor: liveStatus === "live" ? colors.success : liveStatus === "error" ? colors.danger : colors.textTertiary }]} />
              <Text style={styles.liveLabel}>
                {liveStatus === "live" ? "Realtime · Firestore" : liveStatus === "connecting" ? "Connecting…" : liveStatus === "error" ? "Listener error" : "Offline"}
              </Text>
            </View>
          }
        />
        <FamilyMap members={family.members || []} live={liveLocations} />
        {liveError ? (
          <View style={styles.liveErrorCard} testID="firestore-error-banner">
            <AlertTriangle size={14} color={colors.warning} />
            <Text style={styles.liveErrorText}>{liveError}</Text>
          </View>
        ) : null}
        {(family.members || []).map((m: any) => {
          const live = liveLocations[m.member_id];
          return (
          <View key={m.member_id} style={styles.famRow} testID={`family-${m.member_id}`}>
            <TouchableOpacity
              style={styles.famMain}
              onPress={() =>
                Alert.alert(
                  m.name,
                  `${m.relation || "Family"} · Last seen ${timeAgo(m.last_seen)}\n${m.last_address}${m.invite_status === "pending" ? "\n\nInvite pending — share link from invite modal." : ""}${live ? `\n\nLive (Firestore): ${live.latitude.toFixed(5)}, ${live.longitude.toFixed(5)}${live.message ? `\n"${live.message}"` : ""}` : ""}`
                )
              }
              testID={`family-tap-${m.member_id}`}
            >
              <View style={[styles.famAvatar, { backgroundColor: m.color }]}>
                <Text style={styles.famInitials}>{m.initials}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.famName}>
                  {m.name}
                  {m.relation ? <Text style={styles.famRelation}>{`  ·  ${m.relation}`}</Text> : null}
                </Text>
                <Text style={styles.famAddr} numberOfLines={1}>
                  {live
                    ? `📍 ${live.latitude.toFixed(5)}, ${live.longitude.toFixed(5)}${live.trip_active ? " · moving" : ""}`
                    : m.last_address}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.famTime}>
                  {live ? "live" : timeAgo(m.last_seen)}
                </Text>
                {m.invite_status === "pending" && !live && (
                  <Text style={styles.famPending}>Pending</Text>
                )}
                {live && live.trip_active && (
                  <Text style={[styles.famPending, { color: colors.success }]}>Moving</Text>
                )}
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.famEditBtn}
              onPress={() => setFamilyEdit({ open: true, item: m })}
              testID={`family-edit-${m.member_id}`}
              accessibilityLabel={`Edit ${m.name}`}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Pencil size={14} color={colors.textTertiary} />
            </TouchableOpacity>
          </View>
          );
        })}
        <View style={styles.famActions}>
          <TouchableOpacity
            style={styles.famBtn}
            onPress={() => setInviteModal({ open: true, name: "" })}
            testID="invite-family"
          >
            <UserPlus size={14} color={colors.primaryGlow} />
            <Text style={styles.famBtnText}>Invite Family</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.famBtn} onPress={togglePause} testID="pause-location">
            {family.self_paused ? <PlayCircle size={14} color={colors.warning} /> : <PauseCircle size={14} color={colors.textSecondary} />}
            <Text style={[styles.famBtnText, family.self_paused && { color: colors.warning }]}>
              {family.self_paused ? "Resume Sharing" : "Pause My Sharing"}
            </Text>
          </TouchableOpacity>
        </View>
        {/* Realtime Firestore — Simulate Live Update */}
        <TouchableOpacity
          style={styles.simulateBtn}
          onPress={simulateLiveUpdate}
          disabled={simulateBusy}
          testID="simulate-live-update"
        >
          {simulateBusy ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Radio size={14} color="#fff" />
              <Text style={styles.simulateBtnText}>Simulate Live Update · 0.5 mi</Text>
            </>
          )}
        </TouchableOpacity>
        {simulateResult && (
          <View style={styles.simulateResultCard} testID="simulate-result">
            <CheckCircle2 size={14} color={colors.success} />
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <Text style={styles.simulateResultText}>
                {simulateResult.member_name} moved {simulateResult.distance_miles} mi
                {` `}@ {Math.round(simulateResult.bearing_deg)}°
              </Text>
              <Text style={styles.simulateResultMeta}>
                Listener latency:{" "}
                {simulateResult.latency_ms != null
                  ? `${simulateResult.latency_ms} ms`
                  : "awaiting snapshot…"}
              </Text>
            </View>
          </View>
        )}
        <View style={styles.mockedRow}>
          <Text style={styles.mockedText}>MOCKED · Real-time tracking activates when invited family members install PLOS.</Text>
        </View>

        {/* NEARBY SERVICES */}
        <Section label="Nearby Services" />
        {nearby.is_mocked && (
          <View style={styles.mockedRow}>
            <Text style={styles.mockedText}>MOCKED · Add Google Places API key in Settings to enable live nearby search.</Text>
          </View>
        )}
        {(nearby.hospitals || []).map((h: any) => (
          <ServiceRow key={h.name} icon={<Hospital size={16} color={colors.danger} />} title={h.name} sub={`${h.distance_miles} mi · ER ${h.emergency_dept_open ? "open 24/7" : "closed"}`} phone={h.phone} action={() => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(h.address)}`)} />
        ))}
        {(nearby.police || []).map((p: any) => (
          <ServiceRow key={p.name} icon={<Shield size={16} color={colors.primaryGlow} />} title={p.name} sub={`${p.distance_miles} mi · non-emergency`} phone={p.non_emergency_phone} />
        ))}
        {(nearby.restaurants || []).map((r: any) => (
          <ServiceRow key={r.name} icon={<Utensils size={16} color={colors.warning} />} title={r.name} sub={`${r.distance_miles} mi · ${r.cuisine}${r.open_now ? " · Open now" : ""}`} />
        ))}
        {(nearby.parks || []).map((p: any) => (
          <ServiceRow key={p.name} icon={<TreePine size={16} color={colors.success} />} title={p.name} sub={`${p.distance_miles} mi · ${p.notes}`} />
        ))}
        {(nearby.traffic || []).map((t: any) => (
          <View key={t.name} style={[styles.serviceCard, { borderColor: "rgba(245,158,11,0.30)" }]} testID={`traffic-${t.name}`}>
            <Truck size={16} color={colors.warning} />
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <Text style={styles.svcTitle}>{t.name}</Text>
              <Text style={styles.svcSub}>{t.summary}</Text>
            </View>
            <Text style={styles.svcMeta}>{t.updated_min_ago}m ago</Text>
          </View>
        ))}

        {/* GAS */}
        <Section label="Cheapest Gas Nearby" trailing={
          <TouchableOpacity onPress={async () => { setBusy("gas"); const g = await localApi.gas(); setData((d:any) => ({...d, gas:g})); setBusy(null); }} style={styles.iconBtn}>
            {busy === "gas" ? <ActivityIndicator size="small" color={colors.primaryGlow} /> : <RefreshCw size={14} color={colors.primaryGlow} />}
          </TouchableOpacity>
        } />
        {gas.is_mocked && (
          <View style={styles.mockedRow}>
            <Text style={styles.mockedText}>MOCKED · Live prices require GasBuddy partnership.</Text>
          </View>
        )}
        {(gas.stations || []).map((s: any, idx: number) => (
          <View key={s.name} style={styles.gasCard} testID={`gas-${idx}`}>
            <View style={[styles.gasBadge, { backgroundColor: idx === 0 ? "rgba(16,185,129,0.20)" : "rgba(255,255,255,0.05)" }]}>
              <Fuel size={14} color={idx === 0 ? colors.success : colors.textSecondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.gasName}>{s.name}</Text>
              <Text style={styles.gasSub} numberOfLines={1}>{s.address}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={[styles.gasPrice, idx === 0 && { color: colors.success }]}>${s.price_per_gallon.toFixed(2)}</Text>
              <Text style={styles.gasMeta}>{s.distance_miles} mi</Text>
            </View>
          </View>
        ))}

        {/* RECALLS */}
        <Section label="Active Recalls" />
        <View style={styles.tabsRow}>
          {(['food','products','vehicle'] as const).map((k) => (
            <TouchableOpacity key={k} onPress={() => setRecallTab(k)} style={[styles.tabPill, recallTab === k && styles.tabPillActive]} testID={`recall-tab-${k}`}>
              <Text style={[styles.tabText, recallTab === k && { color: colors.primaryGlow }]}>{k === "food" ? "FDA Food" : k === "products" ? "CPSC" : "Vehicle"}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {recallTab === "vehicle" && (
          <View style={styles.vinCard}>
            <Text style={styles.vinLabel}>2015 Toyota RAV4</Text>
            <TextInput
              value={vinInput}
              onChangeText={setVinInput}
              placeholder="Enter your VIN from your registration or door jamb sticker"
              placeholderTextColor={colors.textTertiary}
              style={styles.vinInput}
              autoCapitalize="characters"
              testID="vin-input"
            />
            <TouchableOpacity style={styles.vinBtn} onPress={checkVin} disabled={busy === "vehicle"} testID="check-vin">
              {busy === "vehicle" ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.vinBtnText}>Check Recalls</Text>}
            </TouchableOpacity>
            {(vehicle?.recalls?.length === 0 && !vehicle?.error) && (
              <View style={[styles.recallCard, { borderColor: "rgba(16,185,129,0.40)", backgroundColor: "rgba(16,185,129,0.08)" }]}>
                <CheckCircle2 size={14} color={colors.success} />
                <Text style={[styles.recallTitle, { color: colors.success }]}>No open recalls found for your 2015 Toyota RAV4</Text>
              </View>
            )}
          </View>
        )}
        {recallList.map((r: any, idx: number) => (
          <View key={(r.recall_number || r.recall_id || r.campaign || `${idx}`).toString()} style={styles.recallCard} testID={`recall-${recallTab}-${idx}`}>
            <AlertCircle size={14} color={colors.danger} />
            <View style={{ flex: 1, marginLeft: spacing.sm, gap: 4 }}>
              <Text style={styles.recallTitle} numberOfLines={2}>
                {r.product_description || r.title || `${r.component || ""} — ${r.campaign || ""}`}
              </Text>
              <Text style={styles.recallSub} numberOfLines={3}>
                {r.reason_for_recall || r.description || r.consequence || ""}
              </Text>
              <Text style={styles.recallMeta}>
                {r.recalling_firm || r.manufacturers || r.remedy || ""}
                {r.recall_date ? ` · ${r.recall_date}` : ""}
              </Text>
            </View>
          </View>
        ))}
        {recallList.length === 0 && recallTab !== "vehicle" && (
          <View style={styles.card}><Text style={styles.empty}>No active recalls found.</Text></View>
        )}

        {/* LIVE TRAVEL MAP */}
        <Section label="Live Travel Map" />
        <TravelMapCard travel={travelMap} onPress={(id) => id && router.push(`/travel/${id}` as any)} />

        {/* GPS NAVIGATION ALERTS */}
        <Section
          label="GPS Navigation Alerts"
          trailing={
            <View style={[styles.gpsLiveDot, { backgroundColor: gpsSettings.enabled ? colors.success : colors.textTertiary }]} />
          }
        />
        {gpsAlerts.length > 0 && (
          <View style={{ gap: spacing.sm }}>
            {gpsAlerts.map((a: any) => (
              <View
                key={a.alert_id}
                style={[
                  styles.alertBanner,
                  alertBgFromType(a.severity),
                ]}
                testID={`gps-alert-${a.type}`}
              >
                <Bell size={14} color={colors.warning} />
                <Text style={[styles.alertText, { color: colors.warning }]} numberOfLines={3}>
                  <Text style={{ fontWeight: "700" }}>{a.title}: </Text>{a.message}
                </Text>
              </View>
            ))}
          </View>
        )}
        {gpsAlerts.length === 0 && (
          <View style={styles.card}>
            <Text style={styles.empty}>All clear · no active GPS alerts.</Text>
          </View>
        )}
        <View style={styles.gpsSettingsCard} testID="gps-settings-card">
          <GpsToggleRow
            label="Master switch"
            value={gpsSettings.enabled}
            onChange={(v) => toggleGpsSetting("enabled", v)}
            testID="gps-toggle-enabled"
          />
          <GpsToggleRow
            label="Severe weather alerts"
            value={gpsSettings.severe_weather}
            onChange={(v) => toggleGpsSetting("severe_weather", v)}
            testID="gps-toggle-weather"
          />
          <GpsToggleRow
            label="Crime geofence alerts"
            value={gpsSettings.crime_geofence}
            onChange={(v) => toggleGpsSetting("crime_geofence", v)}
            testID="gps-toggle-crime"
          />
          <GpsToggleRow
            label="Travel advisory alerts"
            value={gpsSettings.travel_advisories}
            onChange={(v) => toggleGpsSetting("travel_advisories", v)}
            testID="gps-toggle-advisories"
          />
          <GpsToggleRow
            label="Speed alerts (driving)"
            value={gpsSettings.speed_alerts}
            onChange={(v) => toggleGpsSetting("speed_alerts", v)}
            testID="gps-toggle-speed"
          />
        </View>

        {/* OFFLINE MAPS — CRUD */}
        <Section
          label="Offline Maps"
          trailing={
            <TouchableOpacity
              style={styles.addBtnSmall}
              onPress={() => setOfflineModal({ open: true })}
              testID="add-offline-region"
            >
              <Plus size={14} color="#fff" />
              <Text style={styles.addBtnText}>Add</Text>
            </TouchableOpacity>
          }
        />
        <View style={styles.offlineSummary}>
          <MapIcon size={14} color={colors.primaryGlow} />
          <Text style={styles.offlineSummaryText}>
            {offlineRegions.length} region{offlineRegions.length === 1 ? "" : "s"} · {offlineTotalMb} MB total
          </Text>
        </View>
        {offlineRegions.length === 0 ? (
          <View style={styles.card}><Text style={styles.empty}>No offline regions yet. Tap “Add” to start.</Text></View>
        ) : (
          offlineRegions.map((r: any) => (
            <TouchableOpacity
              key={r.id}
              style={styles.offlineCard}
              onPress={() => setOfflineModal({ open: true, item: r })}
              testID={`offline-${r.id}`}
            >
              <Download size={14} color={colors.success} />
              <View style={{ flex: 1, marginLeft: spacing.sm }}>
                <Text style={styles.offlineName}>{r.name}</Text>
                <Text style={styles.offlineSub}>
                  {(r.region_type || "region").toUpperCase()} · {r.size_mb || 0} MB
                  {r.notes ? ` · ${r.notes}` : ""}
                </Text>
              </View>
              <Pencil size={14} color={colors.textTertiary} />
            </TouchableOpacity>
          ))
        )}

        {/* LOCAL MEDIA */}
        <Section label="Local Media" />
        {media?.source && (
          <Text style={styles.mediaSource} numberOfLines={1}>{media.source}</Text>
        )}
        {(media.tv || []).length > 0 && (
          <View style={{ gap: spacing.xs }}>
            <Text style={styles.mediaGroupLabel}>TV</Text>
            {(media.tv || []).map((s: any) => (
              <TouchableOpacity
                key={`tv-${s.name}`}
                style={styles.mediaRow}
                onPress={() => Linking.openURL(s.stream_url).catch(() => {})}
                testID={`media-tv-${s.name}`}
              >
                <Tv size={16} color={colors.primaryGlow} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.mediaName}>{s.name}</Text>
                  <Text style={styles.mediaMeta}>
                    Ch {s.channel} · {s.city} · {s.genre}
                  </Text>
                </View>
                <ChevronRight size={14} color={colors.textTertiary} />
              </TouchableOpacity>
            ))}
          </View>
        )}
        {(media.radio || []).length > 0 && (
          <View style={{ gap: spacing.xs, marginTop: spacing.sm }}>
            <Text style={styles.mediaGroupLabel}>Radio</Text>
            {(media.radio || []).map((s: any) => (
              <TouchableOpacity
                key={`radio-${s.name}`}
                style={styles.mediaRow}
                onPress={() => Linking.openURL(s.stream_url).catch(() => {})}
                testID={`media-radio-${s.name}`}
              >
                <Radio size={16} color={colors.warning} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.mediaName}>{s.name}</Text>
                  <Text style={styles.mediaMeta}>
                    {s.frequency} · {s.city} · {s.genre}
                  </Text>
                </View>
                <ChevronRight size={14} color={colors.textTertiary} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={{ height: 80 }} />
      </ScrollView>

      {/* SOS Confirmation Modal */}
      <Modal visible={sosConfirm.visible} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.sosModal}>
            <Radio size={28} color={colors.danger} />
            <Text style={styles.sosModalTitle}>
              {sosConfirm.test ? "Test SOS?" : "Send Emergency SOS?"}
            </Text>
            <Text style={styles.sosModalDesc}>
              {sosConfirm.test
                ? "Runs the full alert flow but does NOT dial 911."
                : "This will call 911 and alert your emergency contacts with your GPS coordinates."}
            </Text>
            <Text style={styles.sosCoords}>
              {(coords || { lat: DEFAULT_LAT, lon: DEFAULT_LON }).lat.toFixed(5)}, {(coords || { lat: DEFAULT_LAT, lon: DEFAULT_LON }).lon.toFixed(5)}
            </Text>
            <View style={styles.sosModalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setSosConfirm({ visible: false, test: false })}
                testID="sos-cancel"
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirm}
                onPress={async () => {
                  const t = sosConfirm.test;
                  setSosConfirm({ visible: false, test: false });
                  await fireSOS(t);
                }}
                testID="sos-confirm"
              >
                <Text style={styles.modalConfirmText}>{sosConfirm.test ? "Run Test" : "CONFIRM SOS"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Invite Family Modal */}
      <Modal visible={inviteModal.open} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.inviteModal}>
            <Text style={styles.sosModalTitle}>Invite Family Member</Text>
            <TextInput
              value={inviteModal.name}
              onChangeText={(t) => setInviteModal((s) => ({ ...s, name: t }))}
              placeholder="Name (e.g. Mom)"
              placeholderTextColor={colors.textTertiary}
              style={styles.vinInput}
              testID="invite-name"
            />
            {inviteModal.link ? (
              <View style={styles.linkBox}>
                <Text style={styles.linkBoxText} selectable>{inviteModal.link}</Text>
              </View>
            ) : null}
            <View style={styles.sosModalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setInviteModal({ open: false, name: "" })}>
                <Text style={styles.modalCancelText}>Close</Text>
              </TouchableOpacity>
              {!inviteModal.link ? (
                <TouchableOpacity style={styles.modalConfirm} onPress={generateInvite} disabled={busy === "invite"} testID="invite-generate">
                  {busy === "invite" ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalConfirmText}>Generate Link</Text>}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.modalConfirm} onPress={() => safeShare({ title: "Invite to PLOS", message: `Join my family on PLOS: ${inviteModal.link}`, url: inviteModal.link, label: "Invite link copied" })}>
                  <Text style={styles.modalConfirmText}>Share</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>
      {/* Offline Region Edit Modal (Enhancement 7) */}
      <EditModal
        visible={offlineModal.open}
        title={offlineModal.item ? "Edit Offline Region" : "Add Offline Region"}
        fields={OFFLINE_FIELDS}
        initial={offlineModal.item}
        onClose={() => setOfflineModal({ open: false })}
        onSubmit={saveOfflineRegion}
        onDelete={offlineModal.item ? deleteOfflineRegion : undefined}
        deleteSubject={offlineModal.item?.name}
      />
      {/* Family Member Edit Modal */}
      <EditModal
        visible={familyEdit.open}
        title="Edit Family Member"
        fields={FAMILY_FIELDS}
        initial={familyEdit.item}
        onClose={() => setFamilyEdit({ open: false })}
        onSubmit={saveFamilyMember}
        onDelete={deleteFamilyMember}
        deleteSubject={familyEdit.item?.name}
        testID="family-edit-modal"
      />
    </SafeAreaView>
  );
}

function alertBgFromType(severity?: string) {
  if (severity === "extreme") return { backgroundColor: "rgba(239,68,68,0.15)", borderColor: "rgba(239,68,68,0.5)" };
  if (severity === "severe") return { backgroundColor: "rgba(245,158,11,0.15)", borderColor: "rgba(245,158,11,0.5)" };
  return { backgroundColor: "rgba(245,158,11,0.10)", borderColor: "rgba(245,158,11,0.30)" };
}

function GpsToggleRow({
  label,
  value,
  onChange,
  testID,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  testID?: string;
}) {
  return (
    <View style={styles.gpsToggleRow}>
      <Text style={styles.gpsToggleLabel}>{label}</Text>
      <Switch
        value={!!value}
        onValueChange={onChange}
        trackColor={{ false: colors.surfaceElevated, true: colors.primary }}
        thumbColor="#fff"
        testID={testID}
      />
    </View>
  );
}

function TravelMapCard({
  travel,
  onPress,
}: {
  travel: any;
  onPress?: (tripId?: string) => void;
}) {
  if (!travel || !travel.trip) {
    return (
      <View style={styles.travelEmpty} testID="travel-empty">
        <Plane size={18} color={colors.textTertiary} />
        <Text style={styles.travelEmptyText}>No upcoming trip. Add one in the Travel module.</Text>
      </View>
    );
  }
  const t = travel.trip;
  const dest = travel.destination || {};
  const origin = travel.origin || {};
  const W = 340;
  const H = 130;
  // Project lat/lon into the SVG (simple linear scale across the world ±180/±90)
  const project = (lat: number, lon: number) => ({
    x: ((lon + 180) / 360) * W,
    y: ((90 - lat) / 180) * H,
  });
  const o = project(origin.lat ?? 0, origin.lon ?? 0);
  const d = project(dest.lat ?? 0, dest.lon ?? 0);
  return (
    <TouchableOpacity
      onPress={() => onPress?.(t.trip_id)}
      style={styles.travelCard}
      testID="travel-map-card"
      activeOpacity={0.85}
    >
      <View style={styles.mapCard}>
        <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
          <Defs>
            <RadialGradient id="g2" cx="50%" cy="50%" r="75%">
              <Stop offset="0%" stopColor="#1A3A5C" />
              <Stop offset="100%" stopColor="#0A1A2B" />
            </RadialGradient>
          </Defs>
          <Rect width={W} height={H} fill="url(#g2)" rx={12} />
          {/* Latitude lines */}
          {[0.25, 0.5, 0.75].map((y, i) => (
            <Rect key={`la-${i}`} x={0} y={H * y} width={W} height={0.6} fill="rgba(255,255,255,0.08)" />
          ))}
          {/* Curved-ish flight path (straight line for simplicity) */}
          <Rect x={Math.min(o.x, d.x)} y={Math.min(o.y, d.y) + 0.5} width={Math.abs(d.x - o.x) || 1} height={1} fill={colors.primaryGlow} />
          {/* Origin */}
          <Circle cx={o.x} cy={o.y} r={5} fill="#10B981" stroke="#fff" strokeWidth={1.5} />
          {/* Destination */}
          <Circle cx={d.x} cy={d.y} r={5} fill={colors.danger} stroke="#fff" strokeWidth={1.5} />
        </Svg>
      </View>
      <View style={styles.travelMeta}>
        <View style={{ flex: 1 }}>
          <Text style={styles.travelDest}>{t.destination_name}</Text>
          <Text style={styles.travelSub} numberOfLines={1}>
            {origin.label} → {dest.label}
          </Text>
          <Text style={styles.travelTrip}>
            {(t.purpose || "trip").replace("_", " ")} · {t.status} · {travel.distance_miles?.toLocaleString() ?? "—"} mi
          </Text>
        </View>
        <ChevronRight size={14} color={colors.textTertiary} />
      </View>
    </TouchableOpacity>
  );
}

function Section({ label, trailing }: { label: string; trailing?: React.ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {trailing}
    </View>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.meta}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

function SatRow({ label, value, ok, warn, extra }: { label: string; value: string; ok?: boolean; warn?: boolean; extra?: React.ReactNode }) {
  const c = warn ? colors.warning : ok ? colors.success : colors.textTertiary;
  return (
    <View style={styles.satRow}>
      <View style={[styles.satDot, { backgroundColor: c }]} />
      <Text style={styles.satLabel}>{label}</Text>
      <Text style={[styles.satValue, { color: c }]}>{value}</Text>
      {extra}
    </View>
  );
}

function ServiceRow({ icon, title, sub, phone, action }: { icon: React.ReactNode; title: string; sub: string; phone?: string; action?: () => void }) {
  return (
    <View style={styles.serviceCard}>
      {icon}
      <View style={{ flex: 1, marginLeft: spacing.sm }}>
        <Text style={styles.svcTitle}>{title}</Text>
        <Text style={styles.svcSub} numberOfLines={2}>{sub}</Text>
      </View>
      {phone && (
        <TouchableOpacity onPress={() => Linking.openURL(`tel:${phone.replace(/[^\d]/g, "")}`)} style={styles.iconBtn}>
          <Phone size={14} color={colors.primaryGlow} />
        </TouchableOpacity>
      )}
      {action && (
        <TouchableOpacity onPress={action} style={styles.iconBtn}>
          <MapPin size={14} color={colors.primaryGlow} />
        </TouchableOpacity>
      )}
    </View>
  );
}

function FamilyMap({ members, live }: { members: any[]; live?: Record<string, FamilyLocationDoc> }) {
  const W = 340;
  const H = 160;
  // Bounding box: compute from live coords if present, else fall back to centred cluster.
  const liveMembers = members
    .map((m) => ({ ...m, _live: live?.[m.member_id] }))
    .filter((m) => m._live);
  let project = (_lat: number, _lon: number, i: number, total: number) => ({
    cx: W * 0.55 + (i % 2 === 0 ? -8 : 8),
    cy: H * 0.5 + Math.floor(i / 2) * 12,
    r: 10,
  });
  if (liveMembers.length > 0) {
    const lats = liveMembers.map((m) => m._live!.latitude);
    const lons = liveMembers.map((m) => m._live!.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    // Add 25% padding so single-point or tiny clusters still render.
    const padLat = Math.max(0.005, (maxLat - minLat) * 0.25);
    const padLon = Math.max(0.005, (maxLon - minLon) * 0.25);
    const a = minLat - padLat, b = maxLat + padLat;
    const c = minLon - padLon, d = maxLon + padLon;
    project = (lat: number, lon: number) => ({
      cx: ((lon - c) / (d - c)) * (W - 30) + 15,
      cy: ((b - lat) / (b - a)) * (H - 30) + 15,
      r: 10,
    });
  }
  return (
    <View style={styles.mapCard}>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
        <Defs>
          <RadialGradient id="g" cx="50%" cy="50%" r="75%">
            <Stop offset="0%" stopColor="#1A3A5C" />
            <Stop offset="100%" stopColor="#0A1A2B" />
          </RadialGradient>
        </Defs>
        <Rect width={W} height={H} fill="url(#g)" rx={12} />
        {/* Roads */}
        {[0.3, 0.65].map((y, i) => (
          <Rect key={i} x={0} y={H * y} width={W} height={1.5} fill="rgba(255,255,255,0.10)" />
        ))}
        {[0.25, 0.55, 0.8].map((x, i) => (
          <Rect key={`v${i}`} x={W * x} y={0} width={1.5} height={H} fill="rgba(255,255,255,0.10)" />
        ))}
        {/* Pins — use live coords if present, otherwise cluster fallback */}
        {members.map((m: any, i: number) => {
          const liveDoc = live?.[m.member_id];
          const pos = liveDoc
            ? project(liveDoc.latitude, liveDoc.longitude, i, members.length)
            : project(0, 0, i, members.length);
          return (
            <Circle
              key={m.member_id}
              cx={pos.cx}
              cy={pos.cy}
              r={pos.r}
              fill={m.color}
              stroke="#fff"
              strokeWidth={2}
            />
          );
        })}
      </Svg>
      <View style={styles.mapOverlay}>
        <MapPin size={11} color={colors.primaryGlow} />
        <Text style={styles.mapOverlayText}>
          {liveMembers.length > 0 ? `Realtime · ${liveMembers.length} live` : "Oak View Elementary School"}
        </Text>
      </View>
    </View>
  );
}

function timeAgo(iso?: string) {
  if (!iso) return "—";
  const mins = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return hrs < 24 ? `${hrs}h ago` : `${Math.floor(hrs / 24)}d ago`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.surfaceElevated,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
  gpsRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  gpsDot: { width: 6, height: 6, borderRadius: 3 },
  gpsLabel: { color: colors.textTertiary, fontSize: 10 },
  scroll: { padding: spacing.xl, paddingTop: spacing.md, gap: spacing.sm },
  permRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(245,158,11,0.10)",
    borderColor: "rgba(245,158,11,0.30)", borderWidth: 1,
    padding: spacing.sm, borderRadius: radius.sm,
  },
  permText: { color: colors.warning, fontSize: 12 },

  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.xl, marginBottom: spacing.sm },
  sectionLabel: { color: colors.textTertiary, fontSize: 11, fontWeight: "700", letterSpacing: 1.5, textTransform: "uppercase" },

  card: { backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1, borderRadius: radius.lg, padding: spacing.md },
  errText: { color: colors.danger, fontSize: 13 },
  empty: { color: colors.textTertiary, textAlign: "center", padding: spacing.md },

  weatherCard: {
    backgroundColor: colors.surface,
    borderColor: colors.primaryMuted,
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.lg,
  },
  weatherTop: { flexDirection: "row", alignItems: "center" },
  weatherLoc: { color: colors.textTertiary, fontSize: 10, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase" },
  weatherTemp: { color: colors.textPrimary, fontSize: 48, fontWeight: "300", letterSpacing: -2 },
  weatherCond: { color: colors.textSecondary, fontSize: 13 },
  weatherMeta: { flexDirection: "row", marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.borderSubtle, justifyContent: "space-between" },
  meta: { alignItems: "flex-start" },
  metaLabel: { color: colors.textTertiary, fontSize: 9, fontWeight: "700", letterSpacing: 1 },
  metaValue: { color: colors.textPrimary, fontSize: 13, fontWeight: "700", marginTop: 2 },
  usingDefault: { color: colors.textTertiary, fontSize: 10, marginTop: 8, fontStyle: "italic" },
  alertBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    padding: spacing.md, borderRadius: radius.md, borderWidth: 1,
  },
  alertText: { fontSize: 12, flex: 1, lineHeight: 17 },
  forecastRow: { gap: spacing.sm, paddingVertical: 4 },
  forecastCard: {
    width: 64, alignItems: "center", gap: 4,
    backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1,
    borderRadius: radius.md, paddingVertical: spacing.sm,
  },
  forecastDay: { color: colors.textSecondary, fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  forecastHigh: { color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
  forecastLow: { color: colors.textTertiary, fontSize: 11 },

  sosBtn: {
    backgroundColor: colors.danger,
    paddingVertical: 22,
    borderRadius: radius.xl,
    alignItems: "center",
    shadowColor: colors.danger,
  },
  sosText: { color: "#fff", fontSize: 22, fontWeight: "800", letterSpacing: 1.8 },
  sosSub: { color: "rgba(255,255,255,0.85)", fontSize: 11, marginTop: 4 },
  sosRow: { flexDirection: "row", gap: spacing.sm },
  shareBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: colors.surfaceElevated, paddingVertical: 10, borderRadius: radius.md,
  },
  shareText: { color: colors.primaryGlow, fontWeight: "700", fontSize: 12 },

  satCard: {
    backgroundColor: "#071420",
    borderColor: "rgba(96,165,250,0.25)",
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  satRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  satDot: { width: 8, height: 8, borderRadius: 4 },
  satLabel: { color: colors.textSecondary, fontSize: 12, flex: 1 },
  satValue: { fontSize: 12, fontWeight: "700" },
  satLink: { color: colors.primaryGlow, fontWeight: "700", fontSize: 11, marginLeft: 6 },

  mapCard: { borderRadius: radius.lg, overflow: "hidden", position: "relative" },
  mapOverlay: {
    position: "absolute", bottom: 8, left: 8,
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(8,8,10,0.7)",
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm,
  },
  mapOverlayText: { color: "#fff", fontSize: 10 },
  famRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1,
    borderRadius: radius.md, paddingRight: spacing.sm,
  },
  famMain: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm,
    padding: spacing.md,
  },
  famEditBtn: {
    width: 32, height: 32, borderRadius: radius.sm,
    alignItems: "center", justifyContent: "center",
    backgroundColor: colors.surfaceElevated,
  },
  famRelation: { color: colors.textTertiary, fontSize: 11, fontWeight: "500" },
  famPending: { color: colors.warning, fontSize: 9, fontWeight: "700", marginTop: 2, letterSpacing: 0.5 },
  liveRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  liveLabel: { color: colors.textTertiary, fontSize: 10, fontWeight: "700", letterSpacing: 0.6 },
  liveErrorCard: {
    flexDirection: "row", alignItems: "flex-start", gap: spacing.sm,
    backgroundColor: "rgba(245,158,11,0.10)",
    borderColor: "rgba(245,158,11,0.40)", borderWidth: 1,
    borderRadius: radius.md, padding: spacing.sm,
  },
  liveErrorText: { color: colors.textPrimary, fontSize: 11, lineHeight: 16, flex: 1 },
  simulateBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: colors.primary, paddingVertical: 11, borderRadius: radius.md,
    marginTop: spacing.xs,
  },
  simulateBtnText: { color: "#fff", fontWeight: "700", fontSize: 12, letterSpacing: 0.3 },
  simulateResultCard: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "rgba(16,185,129,0.10)",
    borderColor: "rgba(16,185,129,0.40)", borderWidth: 1,
    borderRadius: radius.md, padding: spacing.sm,
  },
  simulateResultText: { color: colors.textPrimary, fontSize: 12, fontWeight: "700" },
  simulateResultMeta: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  famAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  famInitials: { color: "#fff", fontWeight: "700", fontSize: 12 },
  famName: { color: colors.textPrimary, fontWeight: "700", fontSize: 13 },
  famAddr: { color: colors.textTertiary, fontSize: 11, marginTop: 2 },
  famTime: { color: colors.textSecondary, fontSize: 10 },
  famActions: { flexDirection: "row", gap: spacing.sm, marginTop: 4 },
  famBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: colors.surfaceElevated, paddingVertical: 10, borderRadius: radius.md,
  },
  famBtnText: { color: colors.primaryGlow, fontWeight: "700", fontSize: 12 },

  mockedRow: { backgroundColor: "rgba(245,158,11,0.08)", borderRadius: radius.sm, padding: 8, marginTop: 4 },
  mockedText: { color: colors.warning, fontSize: 10, fontWeight: "700", textAlign: "center" },

  serviceCard: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1,
    borderRadius: radius.md, padding: spacing.md,
  },
  svcTitle: { color: colors.textPrimary, fontWeight: "700", fontSize: 13 },
  svcSub: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  svcMeta: { color: colors.textTertiary, fontSize: 10 },
  iconBtn: { padding: 6 },

  gasCard: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1,
    borderRadius: radius.md, padding: spacing.md, gap: spacing.sm,
  },
  gasBadge: { width: 32, height: 32, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  gasName: { color: colors.textPrimary, fontWeight: "700", fontSize: 13 },
  gasSub: { color: colors.textTertiary, fontSize: 11, marginTop: 2 },
  gasPrice: { color: colors.textPrimary, fontSize: 18, fontWeight: "700" },
  gasMeta: { color: colors.textTertiary, fontSize: 10, marginTop: 2 },

  tabsRow: { flexDirection: "row", gap: 6 },
  tabPill: {
    flex: 1, paddingVertical: 8, borderRadius: radius.sm, alignItems: "center",
    backgroundColor: colors.surfaceElevated,
  },
  tabPillActive: { backgroundColor: colors.primaryMuted },
  tabText: { color: colors.textSecondary, fontSize: 12, fontWeight: "700" },
  vinCard: {
    backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1,
    borderRadius: radius.md, padding: spacing.md, gap: spacing.sm,
  },
  vinLabel: { color: colors.textPrimary, fontWeight: "700", fontSize: 13 },
  vinInput: {
    backgroundColor: colors.surfaceElevated, color: colors.textPrimary,
    borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 12,
  },
  vinBtn: { backgroundColor: colors.primary, padding: 10, borderRadius: radius.sm, alignItems: "center" },
  vinBtnText: { color: "#fff", fontWeight: "700" },
  recallCard: {
    flexDirection: "row", alignItems: "flex-start",
    backgroundColor: colors.surface, borderColor: "rgba(239,68,68,0.25)", borderWidth: 1,
    borderRadius: radius.md, padding: spacing.md,
  },
  recallTitle: { color: colors.textPrimary, fontWeight: "700", fontSize: 13 },
  recallSub: { color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  recallMeta: { color: colors.textTertiary, fontSize: 10 },

  offlineCard: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.surface, borderColor: "rgba(16,185,129,0.25)", borderWidth: 1,
    borderRadius: radius.md, padding: spacing.md,
  },
  offlineName: { color: colors.textPrimary, fontWeight: "700", fontSize: 13 },
  offlineSub: { color: colors.textTertiary, fontSize: 11, marginTop: 2 },
  manageBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: colors.surfaceElevated, paddingVertical: 10, borderRadius: radius.md,
  },
  manageText: { color: colors.textSecondary, fontWeight: "700", fontSize: 12 },

  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: spacing.xl },
  sosModal: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.xl, gap: spacing.sm, alignItems: "center" },
  inviteModal: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.xl, gap: spacing.sm },
  sosModalTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: "700" },
  sosModalDesc: { color: colors.textSecondary, fontSize: 13, textAlign: "center", lineHeight: 19 },
  sosCoords: { color: colors.primaryGlow, fontSize: 16, fontWeight: "700", marginTop: spacing.sm, fontFamily: "monospace" as any },
  sosModalActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, alignSelf: "stretch" },
  modalCancel: { flex: 1, backgroundColor: colors.surfaceElevated, padding: 12, borderRadius: radius.md, alignItems: "center" },
  modalCancelText: { color: colors.textSecondary, fontWeight: "700" },
  modalConfirm: { flex: 1, backgroundColor: colors.danger, padding: 12, borderRadius: radius.md, alignItems: "center" },
  modalConfirmText: { color: "#fff", fontWeight: "700" },
  linkBox: { backgroundColor: colors.surfaceElevated, padding: spacing.sm, borderRadius: radius.sm },
  linkBoxText: { color: colors.primaryGlow, fontSize: 12, fontFamily: "monospace" as any },

  // Enhancement 7 styles
  addBtnSmall: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: colors.primary, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.sm,
  },
  addBtnText: { color: "#fff", fontSize: 11, fontWeight: "700", letterSpacing: 0.3 },
  offlineSummary: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  offlineSummaryText: { color: colors.textSecondary, fontSize: 12 },
  gpsLiveDot: { width: 8, height: 8, borderRadius: 4 },
  gpsSettingsCard: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    marginTop: spacing.sm,
  },
  gpsToggleRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  gpsToggleLabel: { color: colors.textPrimary, fontSize: 13 },
  travelEmpty: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1,
    borderRadius: radius.md, padding: spacing.md,
  },
  travelEmptyText: { color: colors.textTertiary, fontSize: 12, flex: 1 },
  travelCard: {
    backgroundColor: colors.surface,
    borderColor: colors.primaryMuted,
    borderWidth: 1,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  travelMeta: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    padding: spacing.md,
  },
  travelDest: { color: colors.textPrimary, fontWeight: "700", fontSize: 14 },
  travelSub: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  travelTrip: { color: colors.textTertiary, fontSize: 10, marginTop: 2, textTransform: "capitalize" },
  mediaSource: { color: colors.textTertiary, fontSize: 10, fontStyle: "italic" },
  mediaGroupLabel: { color: colors.textTertiary, fontSize: 10, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginTop: 4 },
  mediaRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1,
    borderRadius: radius.md, padding: spacing.md,
  },
  mediaName: { color: colors.textPrimary, fontWeight: "700", fontSize: 13 },
  mediaMeta: { color: colors.textTertiary, fontSize: 11, marginTop: 2 },
});
