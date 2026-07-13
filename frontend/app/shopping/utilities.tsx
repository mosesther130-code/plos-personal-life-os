// Utilities Review — Find better rates via PLOS AI.
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Zap, Wifi, Droplet, Smartphone, Sparkles, X } from "lucide-react-native";
import { shoppingApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";
import { CountrySelectorChip } from "@/src/components/CountrySelector";
import { useCountry } from "@/src/lib/country-context";

const categoryIcon = (c: string) => {
  switch (c) {
    case "electricity": return { icon: Zap, color: colors.warning };
    case "wireless": return { icon: Smartphone, color: "#A855F7" };
    case "internet": return { icon: Wifi, color: colors.primaryGlow };
    case "water": return { icon: Droplet, color: "#06B6D4" };
    default: return { icon: Zap, color: colors.textSecondary };
  }
};

export default function Utilities() {
  const router = useRouter();
  const { country, countryCode } = useCountry();
  const [utilities, setUtilities] = useState<any[]>([]);
  const [notice, setNotice] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [reco, setReco] = useState<string | null>(null);
  const [recoTitle, setRecoTitle] = useState("");
  const [visible, setVisible] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await shoppingApi.utilities(countryCode);
      setUtilities(r?.utilities || []);
      setNotice(r?.notice || "");
    } catch (_e) {}
    setLoading(false);
  }, [countryCode]);

  useEffect(() => { load(); }, [load]);

  const findBetter = async (u: any) => {
    setRecoTitle(u.provider);
    setReco(null);
    setVisible(true);
    setWorking(u.id);
    try {
      const r = await shoppingApi.findBetterRate(u.id, countryCode);
      setReco(r?.recommendation || "No recommendation returned.");
    } catch (_e) {
      setReco("Could not generate recommendation. Please retry.");
    }
    setWorking(null);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} testID="utilities-back">
          <ArrowLeft color={colors.textPrimary} size={20} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Utilities Review</Text>
        <CountrySelectorChip />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.intro}>
          PLOS AI compares your current providers against market alternatives in {country.flag} {country.name} and surfaces concrete annual savings in {country.currency}.
        </Text>

        {notice ? (
          <View style={styles.noticeCard}>
            <Sparkles size={12} color={colors.primaryGlow} />
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        ) : null}

        {loading ? (
          <ActivityIndicator color={colors.primaryGlow} style={{ marginTop: 40 }} />
        ) : (
          utilities.map((u) => {
            const m = categoryIcon(u.category);
            const Icon = m.icon;
            return (
              <View key={u.id} style={styles.card} testID={`utility-${u.id}`}>
                <View style={styles.headerRow}>
                  <View style={[styles.iconBox, { backgroundColor: m.color + "22" }]}>
                    <Icon size={18} color={m.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.provider}>{u.provider}</Text>
                    <Text style={styles.plan}>{u.current_plan}</Text>
                  </View>
                </View>
                <View style={styles.metricsRow}>
                  <View style={styles.metric}>
                    <Text style={styles.metricLabel}>CURRENT RATE</Text>
                    <Text style={styles.metricValue}>{u.current_rate}</Text>
                  </View>
                  <View style={styles.metric}>
                    <Text style={styles.metricLabel}>LAST BILL</Text>
                    <Text style={styles.metricValue}>${u.last_bill?.toFixed(2)}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.actionBtn, working === u.id && { opacity: 0.6 }]}
                  onPress={() => findBetter(u)}
                  disabled={working === u.id}
                  testID={`find-${u.id}`}
                  activeOpacity={0.85}
                >
                  {working === u.id ? (
                    <ActivityIndicator color={colors.primaryGlow} />
                  ) : (
                    <>
                      <Sparkles size={14} color={colors.primaryGlow} />
                      <Text style={styles.actionBtnText}>Find Better Rate (PLOS AI)</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            );
          })
        )}
        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setVisible(false)}>
        <SafeAreaView style={styles.container} edges={["top"]}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardLabel}>RECOMMENDATION · PLOS AI</Text>
              <Text style={styles.modalTitle} numberOfLines={2}>{recoTitle}</Text>
            </View>
            <TouchableOpacity style={styles.backBtn} onPress={() => setVisible(false)} testID="reco-close">
              <X color={colors.textPrimary} size={20} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.scroll}>
            {!reco ? (
              <View style={{ alignItems: "center", paddingTop: 60, gap: spacing.md }}>
                <ActivityIndicator color={colors.primaryGlow} size="large" />
                <Text style={styles.intro}>Comparing local {country.name} plans with PLOS AI…</Text>
              </View>
            ) : (
              <Text style={styles.recoText}>{reco}</Text>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  backBtn: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.surfaceElevated, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  scroll: { padding: spacing.xl, gap: spacing.md },
  intro: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  card: { backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconBox: { width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  provider: { color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
  plan: { color: colors.textTertiary, fontSize: 11, marginTop: 2 },
  metricsRow: { flexDirection: "row", gap: spacing.sm },
  metric: { flex: 1, backgroundColor: colors.bg, borderRadius: radius.md, padding: spacing.sm },
  metricLabel: { color: colors.textTertiary, fontSize: 9, fontWeight: "700", letterSpacing: 1 },
  metricValue: { color: colors.textPrimary, fontSize: 13, fontWeight: "600", marginTop: 4 },
  actionBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.primaryGlow, backgroundColor: colors.primaryMuted },
  actionBtnText: { color: colors.primaryGlow, fontSize: 13, fontWeight: "700" },
  modalHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  cardLabel: { color: colors.textTertiary, fontSize: 10, fontWeight: "700", letterSpacing: 1.2 },
  modalTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700", marginTop: 2 },
  recoText: { color: colors.textPrimary, fontSize: 14, lineHeight: 22 },
  noticeCard: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "rgba(59,130,246,0.08)", borderColor: "rgba(59,130,246,0.3)", borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  noticeText: { flex: 1, color: colors.textPrimary, fontSize: 12, lineHeight: 17 },
});
