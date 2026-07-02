// PLOS Career — Connect Job Sources settings card + Target Employer watch list.
import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Alert, Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ChevronLeft, CheckCircle2, XCircle, ExternalLink, Bookmark,
} from "lucide-react-native";
import { jobIntelApi, JobSourceStatus } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";

export default function JobSourcesScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [sources, setSources] = useState<JobSourceStatus[]>([]);
  const [employers, setEmployers] = useState<{ name: string; careers_url: string }[]>([]);

  const load = useCallback(async () => {
    try {
      const [s, te] = await Promise.all([
        jobIntelApi.sources(),
        jobIntelApi.targetEmployers(),
      ]);
      setSources(s.sources || []);
      setEmployers(te.target_employers || []);
    } catch (e: any) {
      Alert.alert("Load failed", String(e?.message || e));
    }
  }, []);

  useEffect(() => { (async () => { setLoading(true); await load(); setLoading(false); })(); }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loader}><ActivityIndicator color={colors.primaryGlow} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ChevronLeft size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Job Sources</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.h2}>Connected Job Sources</Text>
        <Text style={styles.sub}>Add API keys to activate additional sources. No code changes required.</Text>

        {sources.map((s) => (
          <View key={s.id} style={styles.sourceRow}>
            {s.connected ? (
              <CheckCircle2 size={16} color={colors.success} />
            ) : (
              <XCircle size={16} color={colors.textTertiary} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.sourceLabel}>{s.label}</Text>
              <Text style={[styles.sourceStatus, { color: s.connected ? colors.success : colors.textTertiary }]}>
                {s.status}
              </Text>
              {!!s.hint && <Text style={styles.sourceHint}>{s.hint}</Text>}
            </View>
          </View>
        ))}

        <Text style={[styles.h2, { marginTop: spacing.xl }]}>Target Employer Watch List</Text>
        <Text style={styles.sub}>Pre-seeded for Moses's target sectors. Any new posting from these employers triggers a priority alert.</Text>

        {employers.map((e, i) => (
          <TouchableOpacity
            key={i}
            style={styles.employerRow}
            onPress={() => Linking.openURL(e.careers_url)}
          >
            <Bookmark size={13} color={colors.primaryGlow} fill={colors.primaryGlow} />
            <View style={{ flex: 1 }}>
              <Text style={styles.employerName}>{e.name}</Text>
              <Text style={styles.employerUrl} numberOfLines={1}>{e.careers_url}</Text>
            </View>
            <ExternalLink size={12} color={colors.textTertiary} />
          </TouchableOpacity>
        ))}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: colors.borderSubtle,
  },
  backBtn: { padding: 4, width: 36, alignItems: "center" },
  headerTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: "700" },
  scroll: { padding: spacing.lg, gap: 4 },
  h2: { color: colors.textPrimary, fontSize: 15, fontWeight: "800", marginBottom: 4 },
  sub: { color: colors.textTertiary, fontSize: 11, marginBottom: 8, lineHeight: 15 },
  sourceRow: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1,
    borderRadius: radius.md, padding: spacing.md, marginBottom: 6,
  },
  sourceLabel: { color: colors.textPrimary, fontSize: 13, fontWeight: "800" },
  sourceStatus: { fontSize: 11, marginTop: 2, fontWeight: "600" },
  sourceHint: { color: colors.textTertiary, fontSize: 10, marginTop: 2, fontStyle: "italic" },
  employerRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1,
    borderRadius: radius.sm, padding: spacing.md, marginBottom: 6,
  },
  employerName: { color: colors.textPrimary, fontSize: 12, fontWeight: "700" },
  employerUrl: { color: colors.textTertiary, fontSize: 10, marginTop: 1 },
});
