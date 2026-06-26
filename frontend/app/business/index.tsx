// Business hub — routes to Ideas Advisor + Eden Heights Tracker.
import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Lightbulb, TreePine, ChevronRight } from "lucide-react-native";
import { colors, spacing, radius } from "@/src/lib/theme";

export default function BusinessHub() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} testID="business-back">
          <ArrowLeft color={colors.textPrimary} size={20} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Business</Text>
        <View style={{ width: 36 }} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.intro}>
          AI-generated business ideas tailored to your skills, plus a dedicated tracker for your Bulacan eco-resort property.
        </Text>

        <TouchableOpacity
          style={styles.tile}
          onPress={() => router.push("/business/ideas")}
          testID="hub-ideas"
          activeOpacity={0.85}
        >
          <View style={[styles.tileIcon, { backgroundColor: "rgba(245,158,11,0.15)" }]}>
            <Lightbulb color={colors.warning} size={22} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.tileTitle}>Business Ideas Advisor</Text>
            <Text style={styles.tileSub}>Claude 4.5 · 5 personalized ventures · full plans</Text>
          </View>
          <ChevronRight size={16} color={colors.textTertiary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tile}
          onPress={() => router.push("/business/eden")}
          testID="hub-eden"
          activeOpacity={0.85}
        >
          <View style={[styles.tileIcon, { backgroundColor: "rgba(16,185,129,0.15)" }]}>
            <TreePine color={colors.success} size={22} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.tileTitle}>Eden Heights Tracker</Text>
            <Text style={styles.tileSub}>4 hectares · $12,000 USD · Bulacan, PH</Text>
          </View>
          <ChevronRight size={16} color={colors.textTertiary} />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  backBtn: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.surfaceElevated, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  scroll: { padding: spacing.xl, gap: spacing.md },
  intro: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginBottom: spacing.sm },
  tile: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg },
  tileIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  tileTitle: { color: colors.textPrimary, fontWeight: "700", fontSize: 15 },
  tileSub: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
});
