import React from "react";
import { Tabs, Redirect } from "expo-router";
import { Home, Wallet, Briefcase, Shield, Grid3x3 } from "lucide-react-native";
import { Platform, View } from "react-native";
import { BlurView } from "expo-blur";

import { useAuth } from "@/src/lib/auth-context";
import { colors } from "@/src/lib/theme";

export default function TabsLayout() {
  const { isAuthed, isLoading } = useAuth();
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
          title: "Safety",
          tabBarIcon: ({ color, focused }) => (
            <Shield color={color} size={22} strokeWidth={focused ? 2 : 1.5} />
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
