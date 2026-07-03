// Full applications tracker — filterable by stage, tap to edit.
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";

import { careerApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";
import { EditModal, Field } from "@/src/components/EditModal";

const STAGES = ["all", "matched", "applied", "screening", "interview", "offer", "rejected"];

const STATUS_COLORS: Record<string, string> = {
  matched: colors.primaryGlow,
  applied: "#A855F7",
  screening: colors.warning,
  interview: "#EC4899",
  offer: colors.success,
  rejected: colors.textTertiary,
};

const initials = (n: string) =>
  n
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";

const appFields: Field[] = [
  { key: "employer", label: "Employer", kind: "text" },
  { key: "role_title", label: "Role Title", kind: "text" },
  {
    key: "status",
    label: "Status",
    kind: "select",
    options: [
      { value: "matched", label: "Matched" },
      { value: "applied", label: "Applied" },
      { value: "screening", label: "Screening" },
      { value: "interview", label: "Interview" },
      { value: "offer", label: "Offer" },
      { value: "rejected", label: "Rejected" },
    ],
  },
  { key: "match_score", label: "Match Score (0-100)", kind: "number" },
  { key: "location", label: "Location", kind: "text" },
  {
    key: "work_type",
    label: "Work Type",
    kind: "select",
    options: [
      { value: "remote", label: "Remote" },
      { value: "hybrid", label: "Hybrid" },
      { value: "onsite", label: "On-site" },
    ],
  },
  { key: "salary_range", label: "Salary Range", kind: "text" },
  { key: "applied_date", label: "Applied Date (YYYY-MM-DD)", kind: "text" },
  { key: "follow_up_date", label: "Follow-up Date (YYYY-MM-DD)", kind: "text" },
  { key: "notes", label: "Notes", kind: "text" },
];

export default function ApplicationsTracker() {
  const router = useRouter();
  const { stage: initialStage } = useLocalSearchParams<{ stage?: string }>();
  const [stage, setStage] = useState<string>(initialStage || "all");
  const [apps, setApps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState<{ open: boolean; item?: any }>({ open: false });

  const load = useCallback(async () => {
    const a = await careerApi.listApplications();
    setApps(a);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await load();
      } catch (_e) {}
      setLoading(false);
    })();
  }, [load]);

  const filtered =
    stage === "all" ? apps : apps.filter((a) => a.status === stage);

  const onSave = async (vals: any) => {
    if (modal.item) {
      await careerApi.updateApplication(modal.item.application_id, vals);
    } else {
      await careerApi.createApplication(vals);
    }
    await load();
  };

  const onDelete = async () => {
    if (!modal.item) return;
    await careerApi.deleteApplication(modal.item.application_id);
    await load();
  };

  const advance = async (item: any) => {
    const order = ["matched", "applied", "screening", "interview", "offer"];
    const idx = order.indexOf(item.status);
    if (idx === -1 || idx === order.length - 1) return;
    await careerApi.updateApplication(item.application_id, {
      status: order[idx + 1],
    });
    await load();
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          testID="apps-back"
        >
          <ArrowLeft color={colors.textPrimary} size={20} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Applications</Text>
        <TouchableOpacity
          onPress={() => setModal({ open: true })}
          style={styles.addBtn}
          testID="add-application"
        >
          <Text style={styles.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {/* Stage filter chips */}
      <View style={styles.chipsWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsContainer}
        >
          {STAGES.map((s) => {
            const active = stage === s;
            return (
              <TouchableOpacity
                key={s}
                onPress={() => setStage(s)}
                style={[styles.chip, active && styles.chipActive]}
                testID={`filter-${s}`}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.chipText,
                    active && { color: colors.primaryGlow },
                  ]}
                >
                  {s.toUpperCase()}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator color={colors.primaryGlow} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
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
          {filtered.length === 0 ? (
            <Text style={styles.empty}>No applications in this stage.</Text>
          ) : (
            filtered.map((a) => (
              <TouchableOpacity
                key={a.application_id}
                style={styles.card}
                onPress={() => setModal({ open: true, item: a })}
                testID={`app-${a.application_id}`}
                activeOpacity={0.85}
              >
                <View style={styles.logoBox}>
                  <Text style={styles.logoText}>{initials(a.employer)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.role}>{a.role_title}</Text>
                  <Text style={styles.emp}>
                    {a.employer} · {a.location || "—"}
                  </Text>
                  <View style={styles.cardBottom}>
                    <View
                      style={[
                        styles.statusBadge,
                        {
                          backgroundColor: `${STATUS_COLORS[a.status] || colors.textSecondary}25`,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusText,
                          { color: STATUS_COLORS[a.status] || colors.textSecondary },
                        ]}
                      >
                        {a.status.toUpperCase()}
                      </Text>
                    </View>
                    {a.match_score ? (
                      <Text style={styles.matchPct}>{a.match_score}%</Text>
                    ) : null}
                    {!["offer", "rejected"].includes(a.status) && (
                      <TouchableOpacity
                        onPress={() => advance(a)}
                        style={styles.advanceBtn}
                        testID={`advance-${a.application_id}`}
                      >
                        <Text style={styles.advanceText}>Advance →</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  {a.notes ? (
                    <Text style={styles.notes} numberOfLines={2}>
                      {a.notes}
                    </Text>
                  ) : null}
                  {a.follow_up_date ? (
                    <Text style={styles.followUp}>
                      Follow up: {a.follow_up_date}
                    </Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            ))
          )}
          <View style={{ height: 60 }} />
        </ScrollView>
      )}

      <EditModal
        visible={modal.open}
        title={modal.item ? "Edit Application" : "Add Application"}
        fields={appFields}
        initial={
          modal.item || {
            employer: "",
            role_title: "",
            status: "matched",
            match_score: 0,
          }
        }
        onClose={() => setModal({ open: false })}
        onSubmit={onSave}
        onDelete={modal.item ? onDelete : undefined}
        testID="app-modal"
      />
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
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  addBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryMuted,
  },
  addBtnText: { color: colors.primaryGlow, fontWeight: "700", fontSize: 12 },

  chipsWrap: { height: 56, justifyContent: "center" },
  chipsContainer: {
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
    alignItems: "center",
  },
  chip: {
    height: 36,
    flexShrink: 0,
    paddingHorizontal: spacing.lg,
    borderRadius: 999,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  chipActive: {
    borderColor: colors.primaryGlow,
    backgroundColor: colors.primaryMuted,
  },
  chipText: {
    color: colors.textSecondary,
    fontWeight: "700",
    fontSize: 11,
    letterSpacing: 0.5,
  },

  list: { padding: spacing.xl, paddingTop: spacing.md, gap: spacing.md },
  empty: { color: colors.textTertiary, textAlign: "center", padding: spacing.xxxl },
  card: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  logoBox: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primaryMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: { color: colors.primaryGlow, fontWeight: "700" },
  role: { color: colors.textPrimary, fontWeight: "700", fontSize: 14 },
  emp: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  cardBottom: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  statusText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  matchPct: {
    color: colors.success,
    fontSize: 12,
    fontWeight: "700",
  },
  advanceBtn: {
    marginLeft: "auto",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.primaryMuted,
  },
  advanceText: { color: colors.primaryGlow, fontSize: 11, fontWeight: "700" },
  notes: { color: colors.textTertiary, fontSize: 12, marginTop: 6 },
  followUp: {
    color: colors.warning,
    fontSize: 11,
    fontWeight: "600",
    marginTop: 4,
  },
});
