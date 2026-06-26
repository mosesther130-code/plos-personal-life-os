import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, LogOut, Database, Trash2, User } from "lucide-react-native";

import { useAuth } from "@/src/lib/auth-context";
import { seedDemo } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";
import { Card } from "@/src/components/Card";

export default function Settings() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [seeding, setSeeding] = useState(false);
  const [seedStatus, setSeedStatus] = useState<string | null>(null);

  const onSeed = async () => {
    setSeeding(true);
    setSeedStatus(null);
    try {
      await seedDemo();
      setSeedStatus("Demo data loaded");
    } catch (_e) {
      setSeedStatus("Failed to load demo data");
    }
    setSeeding(false);
    setTimeout(() => setSeedStatus(null), 3000);
  };

  const onSignOut = async () => {
    await signOut();
    router.replace("/(auth)/login");
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          testID="settings-back"
        >
          <ArrowLeft color={colors.textPrimary} size={20} />
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Card testID="profile-card">
          <View style={styles.profileRow}>
            <View style={styles.avatar}>
              <User color={colors.primaryGlow} size={24} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{user?.full_name}</Text>
              <Text style={styles.email}>{user?.email}</Text>
            </View>
          </View>
        </Card>

        <Text style={styles.section}>Data</Text>

        <TouchableOpacity
          onPress={onSeed}
          disabled={seeding}
          testID="settings-seed-data"
        >
          <Card>
            <View style={styles.actionRow}>
              <Database color={colors.primaryGlow} size={20} />
              <View style={{ flex: 1 }}>
                <Text style={styles.actionTitle}>Load Demo Data</Text>
                <Text style={styles.actionSub}>
                  Reset and populate with sample income, expenses, debts.
                </Text>
              </View>
              {seeding && <ActivityIndicator color={colors.primaryGlow} />}
            </View>
            {seedStatus && (
              <Text style={styles.status}>{seedStatus}</Text>
            )}
          </Card>
        </TouchableOpacity>

        <Text style={styles.section}>Account</Text>

        <TouchableOpacity onPress={onSignOut} testID="settings-sign-out">
          <Card style={{ borderColor: "rgba(239, 68, 68, 0.3)" }}>
            <View style={styles.actionRow}>
              <LogOut color={colors.danger} size={20} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.actionTitle, { color: colors.danger }]}>
                  Sign Out
                </Text>
                <Text style={styles.actionSub}>End your session</Text>
              </View>
            </View>
          </Card>
        </TouchableOpacity>

        <Text style={styles.footer}>PLOS v1.0 · Personal Life OS</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceElevated,
  },
  title: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  scroll: { padding: spacing.xl, gap: spacing.md },
  profileRow: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primaryMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  name: { color: colors.textPrimary, fontSize: 18, fontWeight: "600" },
  email: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
  section: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  actionRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  actionTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: "600" },
  actionSub: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  status: {
    color: colors.success,
    marginTop: spacing.md,
    fontSize: 12,
    fontWeight: "600",
  },
  footer: {
    color: colors.textTertiary,
    fontSize: 11,
    textAlign: "center",
    marginTop: spacing.xxxl,
    letterSpacing: 1,
  },
});
