// Share My Location — 4-option bottom sheet.
// Works without other users having PLOS installed. Uses deep-links to
// Google Maps / Apple Maps / WhatsApp, plus a universal Copy-Link path
// and a Life360 info card.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as Location from "expo-location";
import * as Clipboard from "expo-clipboard";
import {
  MapPin, MessageCircle, Copy, Users, ChevronRight, X, CheckCircle2,
} from "lucide-react-native";

import { colors, spacing, radius } from "@/src/lib/theme";

type Coords = { lat: number; lon: number };

type Props = {
  visible: boolean;
  onClose: () => void;
  coords: Coords | null;
  /** If set, sheet will refresh coords when older than this many ms. Default 5min */
  staleAfterMs?: number;
  /** Called after the sheet finishes acquiring a fresh location — parent may want it. */
  onFreshCoords?: (c: Coords) => void;
};

const WA_MSG = (lat: number, lon: number) =>
  `📍 I am sharing my live location with you.\n\nCurrent position: ${lat}, ${lon}\nView on map: https://maps.google.com/?q=${lat},${lon}\n\n— Sent from PLOS Safety Module`;

const WEB_MAP_URL = (lat: number, lon: number) =>
  `https://maps.google.com/?q=${lat},${lon}`;

// Open a deep link with an automatic browser fallback URL.
async function openWithFallback(
  primaryUrl: string,
  fallbackUrl: string,
  friendlyName: string,
  onError: (msg: string) => void
): Promise<void> {
  try {
    const supported = await Linking.canOpenURL(primaryUrl).catch(() => false);
    if (supported) {
      await Linking.openURL(primaryUrl);
      return;
    }
    // Web preview / no scheme handler → straight to browser fallback
    await Linking.openURL(fallbackUrl);
  } catch {
    try {
      await Linking.openURL(fallbackUrl);
      onError(`Could not open ${friendlyName} — opening in browser instead.`);
    } catch (err: any) {
      onError(`Could not open ${friendlyName}: ${err?.message || "unknown error"}`);
    }
  }
}

export function ShareLocationSheet({
  visible,
  onClose,
  coords,
  staleAfterMs = 5 * 60 * 1000,
  onFreshCoords,
}: Props) {
  const [currentCoords, setCurrentCoords] = useState<Coords | null>(coords);
  const [address, setAddress] = useState<string | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<{ visible: boolean; text: string }>({
    visible: false, text: "",
  });
  const [lastAcquiredAt, setLastAcquiredAt] = useState<number>(Date.now());
  const slideAnim = useMemo(() => new Animated.Value(0), []);

  // Sync incoming coords on open.
  useEffect(() => {
    if (visible && coords) setCurrentCoords(coords);
  }, [visible, coords]);

  // Refresh stale location silently.
  useEffect(() => {
    if (!visible) return;
    const stale = Date.now() - lastAcquiredAt > staleAfterMs;
    if (!stale && currentCoords) return;
    (async () => {
      try {
        setRefreshing(true);
        const perm = await Location.getForegroundPermissionsAsync();
        if (perm.status !== "granted") {
          setRefreshing(false);
          return;
        }
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const fresh = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        setCurrentCoords(fresh);
        setLastAcquiredAt(Date.now());
        onFreshCoords?.(fresh);
      } catch {
        // silent — display last known coords
      } finally {
        setRefreshing(false);
      }
    })();
  }, [visible, staleAfterMs, currentCoords, lastAcquiredAt, onFreshCoords]);

  // Reverse geocode (3s timeout, silent on failure).
  useEffect(() => {
    if (!visible || !currentCoords) return;
    let cancelled = false;
    setGeocoding(true);
    const timer = setTimeout(() => {
      if (!cancelled) {
        setGeocoding(false);
      }
    }, 3000);
    (async () => {
      try {
        const results = await Location.reverseGeocodeAsync({
          latitude: currentCoords.lat,
          longitude: currentCoords.lon,
        });
        if (cancelled) return;
        const r = results?.[0];
        if (r) {
          const parts = [
            [r.streetNumber, r.street].filter(Boolean).join(" "),
            r.city || r.subregion,
            [r.region, r.postalCode].filter(Boolean).join(" "),
          ].filter(Boolean);
          setAddress(parts.join(", ") || null);
        }
      } catch {
        // silent
      } finally {
        clearTimeout(timer);
        if (!cancelled) setGeocoding(false);
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [visible, currentCoords]);

  // Animate slide-up.
  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: visible ? 1 : 0,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, slideAnim]);

  const showToast = useCallback((text: string) => {
    setToast({ visible: true, text });
    setTimeout(() => setToast({ visible: false, text: "" }), 3000);
  }, []);

  const shareGoogleMaps = useCallback(async () => {
    if (!currentCoords) return;
    const { lat, lon } = currentCoords;
    const fallback = WEB_MAP_URL(lat, lon);
    if (Platform.OS === "ios") {
      // Try Google Maps app first, then Apple Maps, then web.
      const googleIOS = `comgooglemaps://?center=${lat},${lon}&q=${lat},${lon}`;
      const appleIOS = `maps://?ll=${lat},${lon}&q=My+Location`;
      try {
        if (await Linking.canOpenURL(googleIOS)) {
          await Linking.openURL(googleIOS);
          onClose();
          return;
        }
      } catch {}
      await openWithFallback(appleIOS, fallback, "Maps", showToast);
    } else if (Platform.OS === "android") {
      const androidGeo = `geo:${lat},${lon}?q=${lat},${lon}(My+Location)`;
      await openWithFallback(androidGeo, fallback, "Google Maps", showToast);
    } else {
      // Web preview → open the browser URL directly (also validates the flow).
      await Linking.openURL(fallback).catch(() => {});
    }
    onClose();
  }, [currentCoords, onClose, showToast]);

  const shareWhatsApp = useCallback(async () => {
    if (!currentCoords) return;
    const { lat, lon } = currentCoords;
    const msg = WA_MSG(lat, lon);
    const encoded = encodeURIComponent(msg);
    const primary = `whatsapp://send?text=${encoded}`;
    const fallback = `https://wa.me/?text=${encoded}`;
    showToast("Opening WhatsApp — select a contact to share your location");
    // Try native scheme; fall back to wa.me web link (works in browser too).
    if (Platform.OS === "web") {
      await Linking.openURL(fallback).catch(() => {});
    } else {
      await openWithFallback(primary, fallback, "WhatsApp", showToast);
    }
    onClose();
  }, [currentCoords, onClose, showToast]);

  const copyLink = useCallback(async () => {
    if (!currentCoords) return;
    const link = WEB_MAP_URL(currentCoords.lat, currentCoords.lon);
    try {
      await Clipboard.setStringAsync(link);
      showToast("Location link copied — paste it into any app to share");
    } catch {
      showToast("Could not copy — long-press the link to copy manually.");
    }
    // Do NOT close — user may want to share via multiple channels.
  }, [currentCoords, showToast]);

  const openLife360 = useCallback((url: string) => {
    Linking.openURL(url).catch(() => {
      showToast("Could not open browser.");
    });
  }, [showToast]);

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [500, 0],
  });

  const coordLabel = currentCoords
    ? `${currentCoords.lat.toFixed(6)}, ${currentCoords.lon.toFixed(6)}`
    : "—";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose} testID="share-sheet-backdrop">
        <Pressable style={{ width: "100%" }} onPress={(e) => e.stopPropagation()}>
          <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
            <View style={styles.handle} />

            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Share My Location</Text>
              <TouchableOpacity onPress={onClose} testID="share-sheet-close" hitSlop={12}>
                <X size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator
              bounces={false}
            >
              <View style={styles.coordCard} testID="share-sheet-coords">
              {refreshing ? (
                <ActivityIndicator size="small" color={colors.textTertiary} />
              ) : (
                <MapPin size={12} color={colors.textTertiary} />
              )}
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={styles.coordText}>{coordLabel}</Text>
                <Text style={styles.addressText} numberOfLines={2}>
                  {geocoding && !address
                    ? "Getting address…"
                    : address || "Address unavailable"}
                </Text>
              </View>
            </View>

            {/* Action cards */}
            <ShareCard
              icon={<MapPin size={20} color="#EA4335" />}
              iconBg="rgba(234,67,53,0.14)"
              title="Share via Google Maps"
              description="Opens Google Maps location sharing on your device"
              onPress={shareGoogleMaps}
              testID="share-google-maps"
              disabled={!currentCoords}
            />
            <ShareCard
              icon={<MessageCircle size={20} color="#25D366" />}
              iconBg="rgba(37,211,102,0.14)"
              title="Share via WhatsApp"
              description="Send your live location to any WhatsApp contact — works over WiFi with no SIM required"
              note="Ideal for Philippines travel — works on WiFi without a local SIM"
              onPress={shareWhatsApp}
              testID="share-whatsapp"
              disabled={!currentCoords}
            />
            <ShareCard
              icon={<Copy size={20} color={colors.primaryGlow} />}
              iconBg={colors.primaryMuted}
              title="Copy Location Link"
              description="Copy a map link to paste into any app — iMessage, SMS, Viber, Telegram, email, and more"
              note="Universal — works with any messaging app worldwide"
              onPress={copyLink}
              testID="share-copy-link"
              disabled={!currentCoords}
            />

            {/* Life360 informational card */}
            <View style={styles.life360Card} testID="share-life360">
              <View style={styles.life360Header}>
                <View style={[styles.iconWrap, { backgroundColor: "rgba(129,140,248,0.15)" }]}>
                  <Users size={20} color="#818CF8" />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                    <Text style={styles.life360Title}>Life360 — Family Location Tracking</Text>
                    <View style={styles.freeBadge}>
                      <Text style={styles.freeBadgeText}>FREE TIER</Text>
                    </View>
                  </View>
                </View>
              </View>
              <Text style={styles.life360Body}>
                Life360 is purpose-built for family location sharing with a live map showing everyone{"\u2019"}s location simultaneously, trip history, arrival and departure alerts, and driving behavior monitoring.
              </Text>
              <Text style={styles.life360Sub}>Free tier includes:</Text>
              {[
                "Real-time location for the whole family",
                "2 days of location history",
                "Crash detection",
                "Crime reports for your area",
                "Last update time, battery level, and driving status for each family member",
              ].map((b, i) => (
                <Text key={i} style={styles.life360Bullet}>{"\u2022"}  {b}</Text>
              ))}
              <View style={styles.life360Btns}>
                <TouchableOpacity
                  style={styles.life360Primary}
                  onPress={() => openLife360("https://life360.com")}
                  testID="share-life360-download"
                >
                  <Text style={styles.life360PrimaryText}>Download Life360</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.life360Secondary}
                  onPress={() => openLife360("https://www.life360.com/features/")}
                  testID="share-life360-learn"
                >
                  <Text style={styles.life360SecondaryText}>Learn More</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.life360Footnote}>
                Once your family installs Life360, their locations will also appear on the PLOS Safety map via the Life360 API integration — coming in a future PLOS update.
              </Text>
            </View>
            </ScrollView>

            {/* Cancel */}
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} testID="share-sheet-cancel">
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </Animated.View>
        </Pressable>

        {/* Toast */}
        {toast.visible && (
          <View style={styles.toast} testID="share-toast">
            <CheckCircle2 size={14} color="#fff" />
            <Text style={styles.toastText}>{toast.text}</Text>
          </View>
        )}
      </Pressable>
    </Modal>
  );
}

function ShareCard({
  icon, iconBg, title, description, note, onPress, testID, disabled,
}: {
  icon: React.ReactNode; iconBg: string; title: string; description: string;
  note?: string; onPress: () => void; testID?: string; disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      android_ripple={{ color: "rgba(255,255,255,0.06)" }}
      style={({ pressed }) => [
        styles.card,
        pressed && { backgroundColor: colors.surfaceElevated },
        disabled && { opacity: 0.5 },
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>{icon}</View>
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardDesc}>{description}</Text>
        {note ? <Text style={styles.cardNote}>{note}</Text> : null}
      </View>
      <ChevronRight size={16} color={colors.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingHorizontal: spacing.md, paddingTop: 8, paddingBottom: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.borderSubtle,
    shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 20,
    shadowOffset: { width: 0, height: -6 }, elevation: 20,
    maxHeight: "88%", minHeight: 480,
  },
  scrollView: { flexGrow: 0, flexShrink: 1 },
  scrollContent: { paddingBottom: spacing.sm },
  handle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderSubtle,
    alignSelf: "center", marginBottom: 8,
  },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 8,
  },
  headerTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  coordCard: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.borderSubtle, borderWidth: 1, borderRadius: radius.sm,
    paddingHorizontal: spacing.sm, paddingVertical: 8, marginBottom: spacing.sm,
  },
  coordText: { color: colors.textPrimary, fontSize: 12, fontWeight: "700", fontVariant: ["tabular-nums"] as any },
  addressText: { color: colors.textTertiary, fontSize: 11, marginTop: 2 },
  card: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle, borderWidth: 1, borderRadius: radius.md,
    padding: spacing.sm, marginBottom: 8, minHeight: 72,
  },
  iconWrap: {
    width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center",
  },
  cardTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
  cardDesc: { color: colors.textSecondary, fontSize: 11, marginTop: 2, lineHeight: 15 },
  cardNote: { color: colors.textTertiary, fontSize: 10, fontStyle: "italic", marginTop: 3, lineHeight: 14 },
  // Life360 card — indigo background
  life360Card: {
    backgroundColor: "rgba(129,140,248,0.09)",
    borderColor: "rgba(129,140,248,0.35)", borderWidth: 1,
    borderRadius: radius.md, padding: spacing.md, marginBottom: 8,
  },
  life360Header: { flexDirection: "row", alignItems: "center" },
  life360Title: { color: colors.textPrimary, fontSize: 13, fontWeight: "700", flexShrink: 1 },
  freeBadge: {
    backgroundColor: "rgba(16,185,129,0.20)",
    borderColor: "rgba(16,185,129,0.50)", borderWidth: 1,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  freeBadgeText: { color: colors.success, fontSize: 9, fontWeight: "800", letterSpacing: 0.4 },
  life360Body: { color: colors.textSecondary, fontSize: 11, lineHeight: 16, marginTop: spacing.sm },
  life360Sub: { color: colors.textPrimary, fontSize: 11, fontWeight: "700", marginTop: spacing.sm, marginBottom: 4 },
  life360Bullet: { color: colors.textSecondary, fontSize: 11, lineHeight: 17, paddingLeft: 4 },
  life360Btns: { flexDirection: "row", gap: 8, marginTop: spacing.md },
  life360Primary: {
    flex: 1, backgroundColor: "#818CF8", paddingVertical: 10, borderRadius: radius.sm,
    alignItems: "center",
  },
  life360PrimaryText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  life360Secondary: {
    flex: 1, borderColor: "#818CF8", borderWidth: 1, paddingVertical: 10, borderRadius: radius.sm,
    alignItems: "center",
  },
  life360SecondaryText: { color: "#818CF8", fontWeight: "700", fontSize: 12 },
  life360Footnote: {
    color: colors.textTertiary, fontSize: 10, fontStyle: "italic", marginTop: spacing.sm, lineHeight: 14,
  },
  cancelBtn: {
    marginTop: spacing.sm, paddingVertical: 12, borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated, alignItems: "center",
  },
  cancelText: { color: colors.textSecondary, fontWeight: "700", fontSize: 13 },
  toast: {
    position: "absolute", left: spacing.md, right: spacing.md, bottom: 20,
    backgroundColor: "rgba(16,185,129,0.95)", borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: 10,
    flexDirection: "row", alignItems: "center", gap: 6,
    shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
    elevation: 8,
  },
  toastText: { color: "#fff", fontSize: 12, fontWeight: "700", flex: 1 },
});
