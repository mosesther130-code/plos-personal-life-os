// PLOS — My Quotes history
// Route: /shopping/insurance/history
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, RefreshCw, ExternalLink, Trash2, Clock, FileText } from "lucide-react-native";
import { colors, spacing, radius } from "@/src/lib/theme";
import { insuranceApi } from "@/src/lib/api";

export default function QuoteHistoryScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [quotes, setQuotes] = useState<any[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await insuranceApi.listQuotes();
      setQuotes(res.quotes || []);
    } catch (e: any) {
      Alert.alert("Load failed", String(e?.message || e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const removeQuote = (qid: string) => {
    Alert.alert("Delete quote?", "This removes only this saved estimate.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try {
          await insuranceApi.deleteQuote(qid);
          await load();
        } catch (e: any) {
          Alert.alert("Delete failed", String(e?.message || e));
        }
      }},
    ]);
  };

  const refreshQuote = async (q: any) => {
    router.push({
      pathname: "/shopping/insurance/quote/[qid]" as any,
      params: { qid: "new", insurer_name: q.insurer_name, insurance_type: q.insurance_type, deal_id: q.deal_id },
    });
  };

  const daysAgo = (iso: string) => {
    const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    if (d === 0) return "today";
    if (d === 1) return "1 day ago";
    return `${d} days ago`;
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft color={colors.textPrimary} size={20} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Quotes</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.primaryGlow} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primaryGlow} />}
        >
          {quotes.length === 0 ? (
            <View style={styles.emptyBox}>
              <FileText color={colors.textTertiary} size={32} />
              <Text style={styles.emptyText}>No quotes yet</Text>
              <Text style={styles.emptySub}>Tap Get My Quote on any insurer to generate your first estimate</Text>
            </View>
          ) : (
            quotes.map((q) => (
              <TouchableOpacity
                key={q.id}
                style={styles.card}
                onPress={() => router.push({ pathname: "/shopping/insurance/quote/[qid]" as any, params: { qid: q.id } })}
                testID={`history-item-${q.id}`}
              >
                <View style={styles.cardTop}>
                  <View style={[styles.avatar, { backgroundColor: (q.deal_snapshot?.logo_color) || "#3B82F6" }]}>
                    <Text style={styles.avatarText}>{q.deal_snapshot?.company_short || q.insurer_name.substring(0,2).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.insurerName}>{q.insurer_name}</Text>
                    <View style={{ flexDirection: "row", gap: 6, marginTop: 3, alignItems: "center" }}>
                      <View style={[styles.typeChip, {
                        backgroundColor: q.insurance_type === "auto" ? "rgba(59,130,246,0.2)" : q.insurance_type === "home" ? "rgba(16,185,129,0.2)" : "rgba(168,85,247,0.2)",
                      }]}><Text style={styles.typeChipText}>{q.insurance_type.toUpperCase()}</Text></View>
                      <Clock color={colors.textTertiary} size={10} />
                      <Text style={styles.ago}>{daysAgo(q.generated_at)}</Text>
                      <Text style={styles.ago}>· {q.profile_completeness}% profile</Text>
                    </View>
                  </View>
                </View>
                <Text style={styles.range}>${q.estimated_monthly_low}–${q.estimated_monthly_high}<Text style={styles.rangeUnit}>/mo</Text></Text>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => refreshQuote(q)} testID={`refresh-${q.id}`}>
                    <RefreshCw color={colors.primaryGlow} size={11} />
                    <Text style={styles.actionBtnText}>Refresh Quote</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => {
                    if (q.deal_snapshot?.quote_url) {
                      import("react-native").then(({ Linking }) => Linking.openURL(q.deal_snapshot.quote_url));
                    }
                  }} testID={`official-${q.id}`}>
                    <ExternalLink color={colors.success} size={11} />
                    <Text style={styles.actionBtnText}>Get Official</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.deleteBtn} onPress={() => removeQuote(q.id)} testID={`delete-${q.id}`}>
                    <Trash2 color={colors.danger} size={12} />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  backBtn: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.surfaceElevated, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  scroll: { padding: spacing.lg, gap: 10 },
  emptyBox: { alignItems: "center", padding: 40, gap: 10 },
  emptyText: { color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
  emptySub: { color: colors.textSecondary, fontSize: 12, textAlign: "center" },
  card: { padding: 12, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.borderSubtle, gap: 8 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  insurerName: { color: colors.textPrimary, fontWeight: "700", fontSize: 14 },
  typeChip: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3 },
  typeChipText: { color: "#fff", fontSize: 8, fontWeight: "800" },
  ago: { color: colors.textTertiary, fontSize: 10 },
  range: { color: colors.success, fontSize: 22, fontWeight: "800" },
  rangeUnit: { fontSize: 12, color: colors.textSecondary, fontWeight: "600" },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 8, borderRadius: 6, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.borderSubtle },
  actionBtnText: { color: colors.textPrimary, fontSize: 11, fontWeight: "600" },
  deleteBtn: { padding: 8, borderRadius: 6, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: "rgba(239,68,68,0.3)" },
});
