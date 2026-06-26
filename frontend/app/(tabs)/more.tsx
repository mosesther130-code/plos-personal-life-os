import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  TrendingUp,
  Building2,
  Globe,
  Plane,
  Scale,
  ShoppingBag,
  HeartPulse,
  MessageCircle,
  Settings as SettingsIcon,
  ChevronRight,
} from "lucide-react-native";

import { colors, spacing, radius } from "@/src/lib/theme";

const MODULES = [
  { key: "investments", title: "Investments", subtitle: "TSP, IRA, brokerage", icon: TrendingUp, color: colors.success },
  { key: "business", title: "Business", subtitle: "Side ventures & income", icon: Building2, color: colors.warning },
  { key: "global", title: "Global Tools", subtitle: "Currency, time, travel docs", icon: Globe, color: colors.primaryGlow },
  { key: "travel", title: "Travel", subtitle: "Trips, bookings, itineraries", icon: Plane, color: "#A855F7" },
  { key: "legal", title: "Legal", subtitle: "Documents, wills, contracts", icon: Scale, color: "#F59E0B" },
  { key: "shopping", title: "Shopping", subtitle: "Deals & smart purchases", icon: ShoppingBag, color: "#EC4899" },
  { key: "health", title: "Health", subtitle: "Insurance, wellness, records", icon: HeartPulse, color: "#EF4444" },
];

export default function More() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.h1}>More</Text>
        <Text style={styles.subtitle}>
          Every dimension of your life, one tap away
        </Text>

        <View style={styles.list}>
          {MODULES.map((m) => {
            const Icon = m.icon;
            return (
              <TouchableOpacity
                key={m.key}
                style={styles.row}
                onPress={() => router.push(`/module/${m.key}`)}
                testID={`module-${m.key}`}
                activeOpacity={0.7}
              >
                <View style={[styles.iconWrap, { backgroundColor: `${m.color}22` }]}>
                  <Icon color={m.color} size={20} />
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>{m.title}</Text>
                  <Text style={styles.rowSub}>{m.subtitle}</Text>
                </View>
                <ChevronRight color={colors.textTertiary} size={18} />
              </TouchableOpacity>
            );
          })}

          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.row}
            onPress={() => router.push("/chatbot")}
            testID="module-chatbot"
            activeOpacity={0.7}
          >
            <View
              style={[styles.iconWrap, { backgroundColor: colors.primaryMuted }]}
            >
              <MessageCircle color={colors.primaryGlow} size={20} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>AI Chatbot</Text>
              <Text style={styles.rowSub}>Ask PLOS anything</Text>
            </View>
            <ChevronRight color={colors.textTertiary} size={18} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.row}
            onPress={() => router.push("/settings")}
            testID="module-settings"
            activeOpacity={0.7}
          >
            <View
              style={[styles.iconWrap, { backgroundColor: colors.surfaceElevated }]}
            >
              <SettingsIcon color={colors.textSecondary} size={20} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Settings</Text>
              <Text style={styles.rowSub}>Account, data, security</Text>
            </View>
            <ChevronRight color={colors.textTertiary} size={18} />
          </TouchableOpacity>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.xl, paddingTop: spacing.lg },
  h1: {
    color: colors.textPrimary,
    fontSize: 30,
    fontWeight: "300",
    letterSpacing: -0.5,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 4,
    marginBottom: spacing.xxl,
  },
  list: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  rowText: { flex: 1 },
  rowTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: "600" },
  rowSub: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  divider: { height: 8, backgroundColor: colors.bg },
});
