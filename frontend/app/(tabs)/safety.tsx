import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Shield, AlertTriangle, Phone, MapPin, Sparkles } from "lucide-react-native";

import { aiApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";
import { Card } from "@/src/components/Card";

export default function Safety() {
  const [advice, setAdvice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      const res = await aiApi.advice(
        "safety",
        "Audit my financial + life security: identity, insurance, emergency fund, scam exposure. One urgent action."
      );
      setAdvice(res.advice_text);
    } catch (_e) {
      setAdvice("Unable to generate advice. Try again.");
    }
    setLoading(false);
  };

  useEffect(() => {
    generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.h1}>Safety</Text>

        <Card style={styles.heroCard} testID="safety-status-card">
          <Shield color={colors.success} size={32} />
          <Text style={styles.heroTitle}>You&apos;re Protected</Text>
          <Text style={styles.heroSub}>
            Identity, financial, and emergency systems active.
          </Text>
        </Card>

        {/* AI Audit */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>AI Safety Audit</Text>
            <TouchableOpacity
              onPress={generate}
              disabled={loading}
              style={styles.refreshBtn}
              testID="safety-refresh-audit"
            >
              <Sparkles size={14} color={colors.primaryGlow} />
              <Text style={styles.refreshText}>Re-run</Text>
            </TouchableOpacity>
          </View>
          <Card testID="safety-ai-card" style={{ borderColor: colors.primaryMuted }}>
            {loading ? (
              <ActivityIndicator color={colors.primaryGlow} />
            ) : (
              <Text style={styles.aiText}>{advice || "Tap Re-run to generate."}</Text>
            )}
          </Card>
        </View>

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsGrid}>
          <ActionTile
            icon={<Phone color={colors.danger} size={22} />}
            label="Emergency Contacts"
            testID="action-contacts"
          />
          <ActionTile
            icon={<MapPin color={colors.warning} size={22} />}
            label="Share My Location"
            testID="action-location"
          />
          <ActionTile
            icon={<AlertTriangle color={colors.warning} size={22} />}
            label="Scam Watch"
            testID="action-scam"
          />
          <ActionTile
            icon={<Shield color={colors.primaryGlow} size={22} />}
            label="Insurance Vault"
            testID="action-insurance"
          />
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function ActionTile({
  icon,
  label,
  testID,
}: {
  icon: React.ReactNode;
  label: string;
  testID: string;
}) {
  return (
    <TouchableOpacity style={styles.tile} testID={testID} activeOpacity={0.7}>
      <View style={styles.tileIcon}>{icon}</View>
      <Text style={styles.tileLabel}>{label}</Text>
    </TouchableOpacity>
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
    marginBottom: spacing.md,
  },
  heroCard: {
    alignItems: "center",
    paddingVertical: spacing.xxl,
    marginTop: spacing.md,
    borderColor: "rgba(16, 185, 129, 0.3)",
  },
  heroTitle: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: "600",
    marginTop: spacing.md,
  },
  heroSub: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 6,
    textAlign: "center",
  },
  section: { marginTop: spacing.xxl, gap: spacing.md },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "600",
    marginTop: spacing.xxl,
    marginBottom: spacing.md,
  },
  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryMuted,
  },
  refreshText: { color: colors.primaryGlow, fontSize: 12, fontWeight: "700" },
  aiText: { color: colors.textPrimary, lineHeight: 22, fontSize: 14 },
  actionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  tile: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: "flex-start",
    gap: spacing.md,
  },
  tileIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  tileLabel: { color: colors.textPrimary, fontSize: 14, fontWeight: "600" },
});
