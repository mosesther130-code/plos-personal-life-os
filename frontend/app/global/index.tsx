// Global Tools hub — routes to Translator + Currency Exchange.
import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Languages, ArrowRightLeft, ChevronRight, Clock } from "lucide-react-native";
import { colors, spacing, radius } from "@/src/lib/theme";

export default function GlobalHub() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} testID="global-back">
          <ArrowLeft color={colors.textPrimary} size={20} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Global Tools</Text>
        <View style={{ width: 36 }} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.intro}>Translate, convert currencies, or check world time — your global toolkit.</Text>
        <TouchableOpacity
          style={styles.tile}
          onPress={() => router.push("/global/world-clock")}
          testID="hub-world-clock"
          activeOpacity={0.85}
        >
          <View style={[styles.tileIcon, { backgroundColor: "rgba(245,158,11,0.15)" }]}>
            <Clock color={colors.warning} size={22} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.tileTitle}>World Clock</Text>
            <Text style={styles.tileSub}>Multi-city · Converter · AI meeting picker</Text>
          </View>
          <ChevronRight size={16} color={colors.textTertiary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tile}
          onPress={() => router.push("/global/translator")}
          testID="hub-translator"
          activeOpacity={0.85}
        >
          <View style={[styles.tileIcon, { backgroundColor: colors.primaryMuted }]}>
            <Languages color={colors.primaryGlow} size={22} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.tileTitle}>Language Translator</Text>
            <Text style={styles.tileSub}>12 languages · PLOS AI · Phrase book</Text>
          </View>
          <ChevronRight size={16} color={colors.textTertiary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tile}
          onPress={() => router.push("/global/currency")}
          testID="hub-currency"
          activeOpacity={0.85}
        >
          <View style={[styles.tileIcon, { backgroundColor: "rgba(16,185,129,0.15)" }]}>
            <ArrowRightLeft color={colors.success} size={22} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.tileTitle}>Currency Exchange</Text>
            <Text style={styles.tileSub}>13 currencies · 30-day chart · Rate alerts</Text>
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
