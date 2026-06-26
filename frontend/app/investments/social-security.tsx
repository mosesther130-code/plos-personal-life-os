// Social Security Estimator — claim at 62/67/70 with break-even analysis.
import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Crown } from "lucide-react-native";
import { investmentsApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";

const fmtUSD = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export default function SocialSecurity() {
  const router = useRouter();
  const [age, setAge] = useState("37");
  const [salary, setSalary] = useState("120000");
  const [years, setYears] = useState("15");
  const [life, setLife] = useState("85");
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  const calc = async () => {
    setLoading(true);
    try {
      const r = await investmentsApi.socialSecurity({
        current_age: Number(age),
        current_salary: Number(salary),
        years_of_contributions: Number(years),
        life_expectancy: Number(life),
      });
      setData(r);
    } catch (_e) {}
    setLoading(false);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} testID="ss-back">
          <ArrowLeft color={colors.textPrimary} size={20} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Social Security</Text>
        <View style={{ width: 36 }} />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.inputs}>
            <Field label="Current Age" value={age} onChange={setAge} testID="ss-age" />
            <Field label="Current Salary ($/yr)" value={salary} onChange={setSalary} testID="ss-salary" />
            <Field label="Years of Contributions" value={years} onChange={setYears} testID="ss-years" />
            <Field label="Life Expectancy" value={life} onChange={setLife} testID="ss-life" />
            <TouchableOpacity style={styles.calcBtn} onPress={calc} disabled={loading} testID="ss-calc">
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.calcBtnText}>Calculate Estimates</Text>}
            </TouchableOpacity>
          </View>

          {data && (
            <>
              <Text style={styles.sectionLabel}>Monthly Benefits</Text>
              <View style={styles.benefitsRow} testID="ss-benefits">
                {[
                  { age: 62, monthly: data.monthly_at_62, lifetime: data.lifetime_at_62 },
                  { age: 67, monthly: data.monthly_at_67, lifetime: data.lifetime_at_67 },
                  { age: 70, monthly: data.monthly_at_70, lifetime: data.lifetime_at_70 },
                ].map((opt) => {
                  const isRec = data.recommended_claim_age === opt.age;
                  return (
                    <View
                      key={opt.age}
                      style={[styles.benefitCard, isRec && styles.benefitBest]}
                      testID={`ss-age-${opt.age}`}
                    >
                      {isRec && (
                        <View style={styles.crownBadge}>
                          <Crown color={colors.primaryGlow} size={12} />
                          <Text style={styles.crownText}>BEST</Text>
                        </View>
                      )}
                      <Text style={styles.benefitAge}>Age {opt.age}</Text>
                      <Text style={styles.benefitMonthly}>{fmtUSD(opt.monthly)}/mo</Text>
                      <Text style={styles.benefitLifetime}>
                        Lifetime: {fmtUSD(opt.lifetime)}
                      </Text>
                    </View>
                  );
                })}
              </View>

              <View style={styles.breakevenCard} testID="ss-breakeven">
                <Text style={styles.sectionLabel}>Break-Even Analysis</Text>
                <Text style={styles.breakevenLine}>
                  62 vs 67 — break-even at age {data.break_even_62_vs_67_age}
                </Text>
                <Text style={styles.breakevenLine}>
                  67 vs 70 — break-even at age {data.break_even_67_vs_70_age}
                </Text>
                <Text style={styles.breakevenReason}>{data.reasoning}</Text>
              </View>
            </>
          )}
          <View style={{ height: 60 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, value, onChange, testID }: any) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        placeholderTextColor={colors.textTertiary}
        testID={testID}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  backBtn: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.surfaceElevated, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  scroll: { padding: spacing.xl, gap: spacing.lg },
  inputs: { gap: 8 },
  label: { color: colors.textSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase", marginTop: spacing.md, marginBottom: 4 },
  input: { backgroundColor: colors.surfaceElevated, color: colors.textPrimary, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: 12, fontSize: 15 },
  calcBtn: { marginTop: spacing.md, backgroundColor: colors.primary, paddingVertical: 14, borderRadius: radius.lg, alignItems: "center" },
  calcBtnText: { color: "#fff", fontWeight: "700" },
  sectionLabel: { color: colors.textTertiary, fontSize: 11, fontWeight: "700", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: spacing.sm },
  benefitsRow: { flexDirection: "row", gap: spacing.sm },
  benefitCard: { flex: 1, backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: 4 },
  benefitBest: { borderColor: colors.primaryGlow, backgroundColor: colors.primaryMuted },
  crownBadge: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", backgroundColor: colors.bg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, marginBottom: 4 },
  crownText: { color: colors.primaryGlow, fontSize: 9, fontWeight: "700", letterSpacing: 0.8 },
  benefitAge: { color: colors.textTertiary, fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  benefitMonthly: { color: colors.textPrimary, fontSize: 18, fontWeight: "700", letterSpacing: -0.3, marginTop: 2 },
  benefitLifetime: { color: colors.textSecondary, fontSize: 10, marginTop: 4 },
  breakevenCard: { backgroundColor: colors.surface, borderColor: colors.primaryMuted, borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, gap: 6 },
  breakevenLine: { color: colors.textPrimary, fontSize: 13 },
  breakevenReason: { color: colors.textSecondary, fontSize: 13, marginTop: spacing.sm, lineHeight: 19 },
});
