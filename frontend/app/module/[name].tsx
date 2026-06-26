import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Sparkles } from "lucide-react-native";

import {
  investmentsApi,
  healthApi,
  aiApi,
  assetsApi,
} from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";
import { Card } from "@/src/components/Card";

const fmtUSD = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

const MODULE_META: Record<
  string,
  { title: string; subtitle: string; aiHint: string }
> = {
  investments: {
    title: "Investments",
    subtitle: "Retirement, brokerage, IRA",
    aiHint: "Review my investment allocation and recommend one rebalance action.",
  },
  business: {
    title: "Business",
    subtitle: "Side ventures & passive income",
    aiHint: "Suggest one high-leverage business move based on my current income mix.",
  },
  global: {
    title: "Global Tools",
    subtitle: "Currency, time, travel docs",
    aiHint: "Identify any expiring documents or upcoming international planning needs.",
  },
  travel: {
    title: "Travel",
    subtitle: "Trips, bookings, itineraries",
    aiHint: "What travel optimizations could I make based on my budget?",
  },
  legal: {
    title: "Legal",
    subtitle: "Documents, wills, contracts",
    aiHint: "Which key legal documents am I missing given my assets?",
  },
  shopping: {
    title: "Shopping",
    subtitle: "Deals & smart purchases",
    aiHint: "Spot recurring expenses where I'm overpaying.",
  },
  health: {
    title: "Health",
    subtitle: "Insurance, wellness, records",
    aiHint: "Summarize my health profile and flag one urgent item.",
  },
};

export default function ModuleScreen() {
  const router = useRouter();
  const { name } = useLocalSearchParams<{ name: string }>();
  const meta = MODULE_META[name as string] || {
    title: name as string,
    subtitle: "",
    aiHint: "Give me one action.",
  };

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [advice, setAdvice] = useState<string | null>(null);
  const [adviceLoading, setAdviceLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (name === "investments") {
        const inv = await investmentsApi.list();
        setData({ investments: inv });
      } else if (name === "health") {
        const h = await healthApi.get();
        setData({ health: h });
      } else {
        // For business/global/travel/legal/shopping: show assets as relevant context
        const a = await assetsApi.list();
        setData({ assets: a });
      }
    } catch (_e) {}
    setLoading(false);
  }, [name]);

  useEffect(() => {
    load();
  }, [load]);

  const runAdvice = async () => {
    setAdviceLoading(true);
    try {
      const r = await aiApi.advice(name as string, meta.aiHint);
      setAdvice(r.advice_text);
    } catch (_e) {
      setAdvice("AI advice failed. Try again.");
    }
    setAdviceLoading(false);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          testID="module-back"
        >
          <ArrowLeft color={colors.textPrimary} size={20} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{meta.title}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.subtitle}>{meta.subtitle}</Text>

        {loading ? (
          <ActivityIndicator color={colors.primaryGlow} style={{ marginTop: 40 }} />
        ) : (
          <>
            {name === "investments" && data?.investments && (
              <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
                {data.investments.length === 0 ? (
                  <Card>
                    <Text style={styles.empty}>No investments tracked</Text>
                  </Card>
                ) : (
                  data.investments.map((inv: any) => (
                    <Card key={inv.investment_id} testID={`inv-${inv.investment_id}`}>
                      <View style={styles.invRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.invType}>
                            {inv.type.replace("_", " ").toUpperCase()}
                          </Text>
                          <Text style={styles.invBalance}>
                            {fmtUSD(inv.balance)}
                          </Text>
                          <Text style={styles.invMeta}>
                            {fmtUSD(inv.contribution_monthly)}/mo · Proj 65:{" "}
                            {fmtUSD(inv.projected_at_65)}
                          </Text>
                        </View>
                      </View>
                    </Card>
                  ))
                )}
              </View>
            )}

            {name === "health" && data?.health && (
              <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
                <Card testID="health-insurance-card">
                  <Text style={styles.label}>Insurance</Text>
                  <Text style={styles.value}>
                    {data.health.insurance_type || "Not set"}
                  </Text>
                  <Text style={styles.meta}>
                    Renews:{" "}
                    {data.health.coverage_renewal_date || "—"}
                  </Text>
                </Card>
                <Card testID="health-wellness-card">
                  <Text style={styles.label}>Wellness Check-in</Text>
                  <Text style={styles.value}>
                    {data.health.wellness_checkin_score}/10
                  </Text>
                </Card>
                <Card testID="health-notes-card">
                  <Text style={styles.label}>Medical Notes</Text>
                  <Text style={styles.value}>
                    {data.health.medical_report_notes ||
                      "No notes recorded yet."}
                  </Text>
                </Card>
              </View>
            )}

            {!["investments", "health"].includes(name as string) && (
              <Card style={{ marginTop: spacing.lg }} testID="module-placeholder">
                <Text style={styles.placeholderTitle}>
                  Module ready
                </Text>
                <Text style={styles.placeholderText}>
                  This module is fully wired into PLOS. Add data via API and PLOS
                  will use it across all AI recommendations.
                </Text>
              </Card>
            )}
          </>
        )}

        {/* AI advice button */}
        <View style={{ marginTop: spacing.xxl }}>
          <TouchableOpacity
            style={styles.aiBtn}
            onPress={runAdvice}
            disabled={adviceLoading}
            testID="module-ai-advice"
          >
            {adviceLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Sparkles color="#fff" size={16} />
                <Text style={styles.aiBtnText}>Ask PLOS for advice</Text>
              </>
            )}
          </TouchableOpacity>

          {advice && (
            <Card
              style={{
                marginTop: spacing.md,
                borderColor: colors.primaryMuted,
              }}
              testID="module-advice-card"
            >
              <Text style={styles.adviceText}>{advice}</Text>
            </Card>
          )}
        </View>

        <View style={{ height: 60 }} />
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
  headerTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  scroll: { padding: spacing.xl, paddingTop: 0 },
  subtitle: { color: colors.textSecondary, fontSize: 14 },
  empty: { color: colors.textTertiary, textAlign: "center" },
  invRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  invType: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  invBalance: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: "600",
    marginTop: 4,
  },
  invMeta: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  label: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  value: { color: colors.textPrimary, fontSize: 16, marginTop: 6 },
  meta: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  placeholderTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "600",
  },
  placeholderText: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  aiBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: radius.lg,
  },
  aiBtnText: { color: "#fff", fontWeight: "700" },
  adviceText: { color: colors.textPrimary, fontSize: 14, lineHeight: 22 },
});
