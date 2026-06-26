import React, { useEffect, useState } from "react";
import { Tabs, Redirect } from "expo-router";
import { Home, Wallet, Briefcase, Shield, Grid3x3 } from "lucide-react-native";
import { Platform, View, StyleSheet } from "react-native";
import { BlurView } from "expo-blur";

import { useAuth } from "@/src/lib/auth-context";
import { securityApi } from "@/src/lib/api";
import { colors } from "@/src/lib/theme";

function badgeColor(threat: number) {
  if (threat >= 6) return colors.danger;
  if (threat >= 3) return colors.warning;
  return colors.success;
}

function SafetyIcon({
  color,
  focused,
  threat,
}: {
  color: string;
  focused: boolean;
  threat: number;
}) {
  const dotColor = badgeColor(threat);
  const showDot = threat >= 3;
  return (
    <View style={styles.iconWrap}>
      <Shield color={color} size={22} strokeWidth={focused ? 2 : 1.5} />
      {showDot && (
        <View
          style={[styles.dot, { backgroundColor: dotColor }]}
          testID="safety-threat-dot"
        />
      )}
    </View>
  );
}

export default function TabsLayout() {
  const { isAuthed, isLoading } = useAuth();
  const [threat, setThreat] = useState<number>(0);

  useEffect(() => {
    if (!isAuthed) return;
    let active = true;
    const tick = async () => {
      try {
        const o = await securityApi.overview();
        if (active) setThreat(Number(o?.threat_score) || 0);
      } catch (_e) {}
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [isAuthed]);

  if (isLoading) return null;
  if (!isAuthed) return <Redirect href="/(auth)/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primaryGlow,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "600",
          letterSpacing: 0.5,
        },
        tabBarStyle: {
          position: "absolute",
          borderTopColor: colors.borderSubtle,
          borderTopWidth: 1,
          backgroundColor:
            Platform.OS === "ios" ? "transparent" : "rgba(8,8,10,0.95)",
          elevation: 0,
          height: 80,
          paddingTop: 8,
          paddingBottom: 20,
        },
        tabBarBackground: () =>
          Platform.OS === "ios" ? (
            <BlurView
              tint="dark"
              intensity={80}
              style={{ flex: 1, backgroundColor: "rgba(8,8,10,0.6)" }}
            />
          ) : (
            <View style={{ flex: 1, backgroundColor: "rgba(8,8,10,0.95)" }} />
          ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <Home color={color} size={22} strokeWidth={focused ? 2 : 1.5} />
          ),
          tabBarTestID: "tab-home",
        }}
      />
      <Tabs.Screen
        name="finance"
        options={{
          title: "Finance",
          tabBarIcon: ({ color, focused }) => (
            <Wallet color={color} size={22} strokeWidth={focused ? 2 : 1.5} />
          ),
          tabBarTestID: "tab-finance",
        }}
      />
      <Tabs.Screen
        name="career"
        options={{
          title: "Career",
          tabBarIcon: ({ color, focused }) => (
            <Briefcase color={color} size={22} strokeWidth={focused ? 2 : 1.5} />
          ),
          tabBarTestID: "tab-career",
        }}
      />
      <Tabs.Screen
        name="safety"
        options={{
          title: "Security",
          tabBarIcon: ({ color, focused }) => (
            <SafetyIcon color={color} focused={focused} threat={threat} />
          ),
          tabBarTestID: "tab-safety",
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "More",
          tabBarIcon: ({ color, focused }) => (
            <Grid3x3 color={color} size={22} strokeWidth={focused ? 2 : 1.5} />
          ),
          tabBarTestID: "tab-more",
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconWrap: { width: 22, height: 22, alignItems: "center", justifyContent: "center" },
  dot: {
    position: "absolute",
    top: -1,
    right: -3,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: "rgba(8,8,10,0.95)",
  },
});
