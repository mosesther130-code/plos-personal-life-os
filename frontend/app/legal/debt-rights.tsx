// Debt & Credit Rights detail page
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, ShieldAlert, ExternalLink, Phone } from "lucide-react-native";
import { legalApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";

export default function DebtRights() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await legalApi.debtRights()); }
    catch (_e) {}
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading || !data) {
    return <SafeAreaView style={styles.container} edges={["top"]}><ActivityIndicator color={colors.primaryGlow} style={{ marginTop: 60 }} /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} testID="debt-back">
          <ArrowLeft color={colors.textPrimary} size={20} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Debt & Credit Rights</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.disclaimer}>
          <ShieldAlert size={14} color={colors.warning} />
          <Text style={styles.disclaimerText}>{data.disclaimer}</Text>
        </View>

        {/* FDCPA */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{data.fdcpa.title}</Text>
          {data.fdcpa.rights.map((r: string, i: number) => (
            <View key={i} style={styles.bullet}><Text style={styles.dot}>•</Text><Text style={styles.bulletText}>{r}</Text></View>
          ))}
        </View>

        {/* Credit disputes */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{data.credit_disputes.title}</Text>
          {data.credit_disputes.steps.map((s: string, i: number) => (
            <View key={i} style={styles.bullet}><Text style={[styles.dot, { color: colors.primaryGlow }]}>{i + 1}.</Text><Text style={styles.bulletText}>{s}</Text></View>
          ))}
        </View>

        {/* Student loans */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{data.student_loans.title}</Text>
          {data.student_loans.programs.map((p: any, i: number) => (
            <View key={i} style={styles.program}>
              <Text style={styles.programName}>{p.name}</Text>
              <Text style={styles.programCriteria}>{p.criteria}</Text>
            </View>
          ))}
        </View>

        {/* Statute of Limitations */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{data.statute_of_limitations_ga.title}</Text>
          {data.statute_of_limitations_ga.items.map((it: any, i: number) => (
            <View key={i} style={styles.solRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.solType}>{it.debt_type}</Text>
                <Text style={styles.solNote}>{it.note}</Text>
              </View>
              <View style={styles.solYears}><Text style={styles.solYearsText}>{it.years} yrs</Text></View>
            </View>
          ))}
        </View>

        {/* Free Legal Aid */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Free Legal Aid (Georgia)</Text>
          {data.free_legal_aid_ga.map((a: any, i: number) => (
            <View key={i} style={styles.aidRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.aidName}>{a.name}</Text>
                <Text style={styles.aidPhone}>{a.phone}</Text>
              </View>
              <TouchableOpacity style={styles.aidBtn} onPress={() => Linking.openURL(`tel:${a.phone.replace(/[^\d+]/g, "")}`).catch(() => {})}>
                <Phone size={14} color={colors.primaryGlow} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.aidBtn} onPress={() => Linking.openURL(a.url).catch(() => {})}>
                <ExternalLink size={14} color={colors.primaryGlow} />
              </TouchableOpacity>
            </View>
          ))}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  iconBtn: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.surfaceElevated, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  scroll: { padding: spacing.xl, gap: spacing.md },
  disclaimer: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(245,158,11,0.12)", borderColor: colors.warning, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm },
  disclaimerText: { color: colors.warning, fontSize: 11, lineHeight: 16, flex: 1 },
  card: { backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  cardTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
  bullet: { flexDirection: "row", gap: 6, marginTop: 4 },
  dot: { color: colors.primaryGlow, fontSize: 13, width: 16 },
  bulletText: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, flex: 1 },
  program: { paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  programName: { color: colors.textPrimary, fontSize: 13, fontWeight: "600" },
  programCriteria: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 2 },
  solRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  solType: { color: colors.textPrimary, fontSize: 12, fontWeight: "600" },
  solNote: { color: colors.textTertiary, fontSize: 10, marginTop: 2 },
  solYears: { backgroundColor: colors.primaryMuted, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.sm },
  solYearsText: { color: colors.primaryGlow, fontSize: 11, fontWeight: "700" },
  aidRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  aidName: { color: colors.textPrimary, fontSize: 13, fontWeight: "600" },
  aidPhone: { color: colors.textTertiary, fontSize: 11, marginTop: 2 },
  aidBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primaryMuted, alignItems: "center", justifyContent: "center" },
});
