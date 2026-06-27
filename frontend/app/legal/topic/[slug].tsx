// Legal Topic detail (Claude-generated overview)
import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, RefreshCw, ShieldAlert } from "lucide-react-native";
import { legalApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";

export default function LegalTopic() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [response, setResponse] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [disclaimer, setDisclaimer] = useState<string>("");
  const [cached, setCached] = useState<boolean>(false);

  const load = useCallback(async (force = false) => {
    if (!slug) return;
    setLoading(true);
    try {
      const r = await legalApi.topic(slug, force);
      setResponse(r?.response || "");
      setTitle(r?.title || "");
      setDisclaimer(r?.disclaimer || "");
      setCached(!!r?.cached);
    } catch (_e) {
      setResponse("Could not load topic. Please retry.");
    }
    setLoading(false);
  }, [slug]);

  useEffect(() => { load(false); }, [load]);

  const refresh = async () => { setRefreshing(true); await load(true); setRefreshing(false); };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} testID="topic-back">
          <ArrowLeft color={colors.textPrimary} size={20} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{title || slug}</Text>
        <TouchableOpacity style={styles.iconBtn} onPress={() => load(true)} testID="topic-refresh" disabled={loading}>
          <RefreshCw color={colors.textPrimary} size={18} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primaryGlow} />}>
        {disclaimer ? (
          <View style={styles.disclaimer}>
            <ShieldAlert size={14} color={colors.warning} />
            <Text style={styles.disclaimerText}>{disclaimer}</Text>
          </View>
        ) : null}
        {loading ? (
          <View style={{ alignItems: "center", paddingTop: 40, gap: spacing.md }}>
            <ActivityIndicator size="large" color={colors.primaryGlow} />
            <Text style={styles.body}>Asking Claude 4.5 about {title || slug}…</Text>
          </View>
        ) : (
          <>
            {cached ? <Text style={styles.cachedTag}>CACHED (less than 7 days)</Text> : null}
            <Text style={styles.body}>{response}</Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm },
  iconBtn: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.surfaceElevated, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: "700", flex: 1, textAlign: "center" },
  scroll: { padding: spacing.xl, gap: spacing.md, paddingBottom: 60 },
  disclaimer: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(245,158,11,0.12)", borderColor: colors.warning, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm },
  disclaimerText: { color: colors.warning, fontSize: 11, lineHeight: 16, flex: 1 },
  cachedTag: { color: colors.textTertiary, fontSize: 9, fontWeight: "700", letterSpacing: 1 },
  body: { color: colors.textPrimary, fontSize: 14, lineHeight: 22 },
});
