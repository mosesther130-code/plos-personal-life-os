import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Target, FileText, Briefcase } from "lucide-react-native";

import { careerApi, aiApi } from "@/src/lib/api";
import { colors, spacing, radius, priorityColor, priorityBg } from "@/src/lib/theme";
import { Card } from "@/src/components/Card";

export default function Career() {
  const [career, setCareer] = useState<any>(null);
  const [apps, setApps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, a] = await Promise.all([
        careerApi.get(),
        careerApi.listApplications(),
      ]);
      setCareer(c);
      setApps(a);
    } catch (_e) {}
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.loader}>
          <ActivityIndicator color={colors.primaryGlow} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
            tintColor={colors.primaryGlow}
          />
        }
      >
        <Text style={styles.h1}>Career</Text>

        <Card style={{ marginTop: spacing.lg }} testID="career-profile-card">
          <View style={styles.row}>
            <Briefcase color={colors.primaryGlow} size={20} />
            <Text style={styles.title}>
              {career?.current_title || "Set your title"}
            </Text>
          </View>
          <Text style={styles.sub}>{career?.current_employer || "—"}</Text>
        </Card>

        <View style={styles.grid}>
          <View style={styles.gridItem}>
            <Card style={styles.atsCard} testID="ats-score-card">
              <FileText color={colors.primaryGlow} size={18} />
              <Text style={styles.overline}>ATS Score</Text>
              <Text style={styles.bigNum}>{career?.ats_score ?? 0}</Text>
              <Text style={styles.tiny}>resume match</Text>
            </Card>
          </View>
          <View style={styles.gridItem}>
            <Card style={styles.atsCard} testID="applications-count-card">
              <Target color={colors.warning} size={18} />
              <Text style={styles.overline}>Pipeline</Text>
              <Text style={styles.bigNum}>{apps.length}</Text>
              <Text style={styles.tiny}>active apps</Text>
            </Card>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Job Applications</Text>
        {apps.length === 0 ? (
          <Card testID="empty-applications">
            <Text style={styles.empty}>No applications tracked yet.</Text>
          </Card>
        ) : (
          <View style={{ gap: spacing.md }}>
            {apps.map((a) => (
              <Card key={a.application_id} testID={`app-${a.application_id}`}>
                <View style={styles.appHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.appRole}>{a.role_title}</Text>
                    <Text style={styles.appEmployer}>{a.employer}</Text>
                  </View>
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: priorityBg(statusToPriority(a.status)) },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        { color: priorityColor(statusToPriority(a.status)) },
                      ]}
                    >
                      {a.status.toUpperCase()}
                    </Text>
                  </View>
                </View>
                <View style={styles.matchBar}>
                  <View
                    style={[styles.matchFill, { width: `${a.match_score}%` }]}
                  />
                </View>
                <Text style={styles.matchText}>{a.match_score}% match</Text>
              </Card>
            ))}
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function statusToPriority(status: string) {
  if (status === "interview" || status === "offer") return "urgent";
  if (status === "applied" || status === "screening") return "action";
  return "info";
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: spacing.xl, paddingTop: spacing.lg },
  h1: {
    color: colors.textPrimary,
    fontSize: 30,
    fontWeight: "300",
    letterSpacing: -0.5,
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  title: { color: colors.textPrimary, fontSize: 16, fontWeight: "600" },
  sub: { color: colors.textSecondary, fontSize: 13, marginTop: 4 },
  grid: {
    flexDirection: "row",
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  gridItem: { flex: 1 },
  atsCard: { gap: 8 },
  overline: {
    color: colors.textTertiary,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  bigNum: {
    color: colors.textPrimary,
    fontSize: 38,
    fontWeight: "300",
    letterSpacing: -1,
  },
  tiny: { color: colors.textTertiary, fontSize: 11 },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "600",
    marginTop: spacing.xxl,
    marginBottom: spacing.md,
  },
  empty: { color: colors.textTertiary, textAlign: "center" },
  appHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  appRole: { color: colors.textPrimary, fontSize: 16, fontWeight: "600" },
  appEmployer: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
  statusBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusText: { fontSize: 10, fontWeight: "700", letterSpacing: 1 },
  matchBar: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderSubtle,
    overflow: "hidden",
  },
  matchFill: { height: "100%", backgroundColor: colors.primaryGlow },
  matchText: {
    color: colors.textTertiary,
    fontSize: 11,
    marginTop: 6,
    fontWeight: "600",
  },
});
