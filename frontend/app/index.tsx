import React, { useEffect } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "@/src/lib/auth-context";
import { colors, spacing } from "@/src/lib/theme";

export default function Index() {
  const router = useRouter();
  const { isLoading, isAuthed } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    const t = setTimeout(() => {
      if (isAuthed) router.replace("/(tabs)");
      else router.replace("/(auth)/login");
    }, 800);
    return () => clearTimeout(t);
  }, [isLoading, isAuthed, router]);

  return (
    <View style={styles.container} testID="splash-screen">
      <LinearGradient
        colors={["#08080A", "#0a0a1f", "#08080A"]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.center}>
        <View style={styles.logoWrap}>
          <Text style={styles.logoLetters}>PLOS</Text>
        </View>
        <Text style={styles.tagline}>Personal Life Operating System</Text>
        <ActivityIndicator
          color={colors.primaryGlow}
          style={{ marginTop: spacing.xxl }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  logoWrap: {
    width: 110,
    height: 110,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.primaryGlow,
    shadowOpacity: 0.8,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  logoLetters: {
    color: "#fff",
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: 2,
  },
  tagline: {
    color: colors.textSecondary,
    marginTop: spacing.xl,
    fontSize: 13,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
});
