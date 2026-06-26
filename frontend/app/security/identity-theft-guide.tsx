// Identity Theft Response Guide
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, CheckCircle, Circle, ExternalLink } from "lucide-react-native";

import { securityApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";

export default function IdentityTheftGuide() {
  const router = useRouter();
  const [steps, setSteps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await securityApi.identityTheftGuide();
    setSteps(r.steps || []);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await load();
      } catch (_e) {}
      setLoading(false);
    })();
  }, [load]);

  const toggle = async (step: any) => {
    setBusy(step.step_id);
    try {
      await securityApi.checkIdentityStep(step.step_id, !step.completed);
      await load();
    } catch (_e) {}
    setBusy(null);
  };

  const openLink = (url: string) => {
    if (url.startsWith("plos://security/breach")) {
      router.push("/security/breach");
    } else {
      Linking.openURL(url).catch(() => {});
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.loader}>
          <ActivityIndicator color={colors.primaryGlow} />
        </View>
      </SafeAreaView>
    );
  }

  const completedCount = steps.filter((s) => s.completed).length;
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} testID="guide-back">
          <ArrowLeft color={colors.textPrimary} size={20} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Identity Theft Response</Text>
        <View style={{ width: 36 }} />
      </View>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }} tintColor={colors.primaryGlow} />
        }
      >
        <View style={styles.intro} testID="guide-intro">
          <Text style={styles.introTitle}>If your identity is stolen, do this NOW.</Text>
          <Text style={styles.introText}>
            Work through this checklist top-to-bottom. Steps stay checked even if you close the app — so you can pick up where you left off.
          </Text>
          <Text style={styles.progress}>
            {completedCount} / {steps.length} steps complete
          </Text>
        </View>

        {steps.map((s, idx) => (
          <View key={s.step_id} style={styles.stepCard} testID={`step-${s.step_id}`}>
            <View style={styles.stepHead}>
              <TouchableOpacity
                onPress={() => toggle(s)}
                disabled={busy === s.step_id}
                style={styles.checkBtn}
                testID={`step-toggle-${s.step_id}`}
              >
                {busy === s.step_id ? (
                  <ActivityIndicator size="small" color={colors.primaryGlow} />
                ) : s.completed ? (
                  <CheckCircle color={colors.success} size={22} />
                ) : (
                  <Circle color={colors.textTertiary} size={22} />
                )}
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={styles.stepNum}>Step {idx + 1}</Text>
                <Text style={[styles.stepTitle, s.completed && styles.stepTitleDone]}>{s.title}</Text>
              </View>
            </View>
            <Text style={styles.stepDesc}>{s.description}</Text>
            {s.links?.length > 0 && (
              <View style={styles.linksWrap}>
                {s.links.map((l: any) => (
                  <TouchableOpacity
                    key={l.url}
                    onPress={() => openLink(l.url)}
                    style={styles.linkBtn}
                    testID={`step-link-${s.step_id}-${l.label}`}
                  >
                    <ExternalLink size={12} color={colors.primaryGlow} />
                    <Text style={styles.linkText}>{l.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        ))}

        <View style={{ height: 80 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.surfaceElevated,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  scroll: { padding: spacing.xl, paddingTop: spacing.md, gap: spacing.md },
  intro: {
    backgroundColor: colors.surface,
    borderColor: "rgba(239,68,68,0.30)",
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  introTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  introText: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  progress: { color: colors.primaryGlow, fontSize: 12, fontWeight: "700", marginTop: 6 },
  stepCard: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  stepHead: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
  checkBtn: { padding: 4 },
  stepNum: { color: colors.textTertiary, fontSize: 10, fontWeight: "700", letterSpacing: 1.2 },
  stepTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: "700", marginTop: 2 },
  stepTitleDone: { color: colors.success, textDecorationLine: "line-through" },
  stepDesc: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  linksWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: 4 },
  linkBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryMuted,
  },
  linkText: { color: colors.primaryGlow, fontWeight: "700", fontSize: 11 },
});
