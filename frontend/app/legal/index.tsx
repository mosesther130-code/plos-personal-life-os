// Legal Advisor hub
import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  RefreshControl, Linking, Platform, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import {
  ArrowLeft, ChevronRight, Plus, Pencil, ShieldAlert, CreditCard,
  Home, Briefcase, Globe, Users, Scroll, ShoppingCart, Calculator, Building,
  ExternalLink, CheckCircle2,
} from "lucide-react-native";
import { legalApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";
import { EditModal, type Field } from "@/src/components/EditModal";

const ICONS: Record<string, any> = {
  home: Home, briefcase: Briefcase, "credit-card": CreditCard, globe: Globe,
  users: Users, scroll: Scroll, "shopping-cart": ShoppingCart, calculator: Calculator, building: Building,
};

const statusColor = (s: string) => s === "filed" || s === "signed" ? colors.success : s === "drafted" ? colors.warning : colors.textTertiary;
const statusLabel = (s: string) => s === "filed" ? "Filed" : s === "signed" ? "Signed" : s === "drafted" ? "Drafted" : "Not Started";

const DOC_FIELDS: Field[] = [
  { key: "title", label: "Title", kind: "text" },
  { key: "description", label: "Description", kind: "textarea", maxLength: 200 },
  { key: "status", label: "Status", kind: "select", options: [
    { value: "not_started", label: "Not Started" },
    { value: "drafted", label: "Drafted" },
    { value: "signed", label: "Signed" },
    { value: "filed", label: "Filed" },
  ]},
  { key: "date", label: "Date (YYYY-MM-DD)", kind: "text", placeholder: "2026-01-15" },
  { key: "location", label: "Location / Storage", kind: "text", placeholder: "Safe deposit box" },
  { key: "notes", label: "Notes", kind: "textarea", maxLength: 300 },
];

const CUSTOM_FIELDS: Field[] = [
  { key: "type", label: "Type ID", kind: "text", placeholder: "e.g. trust / contract" },
  ...DOC_FIELDS,
];

function notify(title: string, message?: string) {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.alert(message ? `${title}\n\n${message}` : title);
  } else Alert.alert(title, message);
}

export default function LegalHub() {
  const router = useRouter();
  const [categories, setCategories] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [disclaimer, setDisclaimer] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorInitial, setEditorInitial] = useState<any | null>(null);
  const [editorEditing, setEditorEditing] = useState<string | null>(null);
  const [editorFields, setEditorFields] = useState<Field[]>(DOC_FIELDS);
  const [editorAllowDelete, setEditorAllowDelete] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cats, docs] = await Promise.all([legalApi.categories(), legalApi.documents()]);
      setCategories(cats?.categories || []);
      setDocuments(docs?.documents || []);
      setDisclaimer(cats?.disclaimer || docs?.disclaimer || "");
    } catch (_e) {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const editDoc = (d: any) => {
    setEditorEditing(d.doc_id);
    setEditorInitial({
      title: d.title || "",
      description: d.description || "",
      status: d.status || "not_started",
      date: d.date || "",
      location: d.location || "",
      notes: d.notes || "",
    });
    setEditorFields(DOC_FIELDS);
    setEditorAllowDelete(!!d.custom);
    setEditorOpen(true);
  };

  const addCustomDoc = () => {
    setEditorEditing(null);
    setEditorInitial({ type: "custom", title: "", description: "", status: "not_started", date: "", location: "", notes: "" });
    setEditorFields(CUSTOM_FIELDS);
    setEditorAllowDelete(false);
    setEditorOpen(true);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} testID="legal-back">
          <ArrowLeft color={colors.textPrimary} size={20} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Legal Advisor</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primaryGlow} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primaryGlow} />}>
          {disclaimer ? (
            <View style={styles.disclaimer} testID="legal-disclaimer">
              <ShieldAlert size={14} color={colors.warning} />
              <Text style={styles.disclaimerText}>{disclaimer}</Text>
            </View>
          ) : null}

          <Text style={styles.sectionLabel}>LEGAL TOPICS</Text>
          <Text style={styles.intro}>Tap a topic. Claude 4.5 generates a Georgia-specific overview with key rights, common situations, when to consult an attorney, and resources.</Text>
          <View style={styles.grid}>
            {categories.map((c) => {
              const Icon = ICONS[c.icon] || Scroll;
              return (
                <TouchableOpacity
                  key={c.slug}
                  style={[styles.catCard, { borderColor: c.color }]}
                  onPress={() => router.push(`/legal/topic/${c.slug}`)}
                  testID={`cat-${c.slug}`}
                  activeOpacity={0.85}
                >
                  <View style={[styles.catIcon, { backgroundColor: c.color + "22" }]}>
                    <Icon size={18} color={c.color} />
                  </View>
                  <Text style={styles.catTitle}>{c.title}</Text>
                  <Text style={styles.catDesc} numberOfLines={2}>{c.description}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* My Legal Documents */}
          <View style={[styles.card, { marginTop: spacing.lg }]} testID="legal-docs">
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>My Legal Documents</Text>
              <TouchableOpacity style={styles.smallBtn} onPress={addCustomDoc} testID="add-doc">
                <Plus size={14} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>
            {documents.map((d) => (
              <TouchableOpacity key={d.doc_id} style={styles.docRow} onPress={() => editDoc(d)} testID={`doc-${d.type}`}>
                <View style={[styles.docIcon, { backgroundColor: statusColor(d.status) + "22" }]}>
                  {d.status === "filed" || d.status === "signed" ? <CheckCircle2 size={14} color={statusColor(d.status)} /> : <Scroll size={14} color={statusColor(d.status)} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.docTitle}>{d.title}</Text>
                  <Text style={styles.docSub}>{statusLabel(d.status)}{d.date ? ` · ${d.date}` : ""}{d.location ? ` · ${d.location}` : ""}</Text>
                </View>
                <Pencil size={12} color={colors.textTertiary} />
              </TouchableOpacity>
            ))}
          </View>

          {/* Debt Rights */}
          <TouchableOpacity
            style={[styles.card, styles.debtCta]}
            onPress={() => router.push("/legal/debt-rights")}
            testID="debt-rights-link"
            activeOpacity={0.85}
          >
            <View style={[styles.docIcon, { backgroundColor: "rgba(239,68,68,0.15)" }]}>
              <CreditCard size={18} color={colors.danger} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Debt & Credit Rights</Text>
              <Text style={styles.docSub}>FDCPA · Student loan forgiveness · Credit disputes · GA statute of limitations</Text>
            </View>
            <ChevronRight size={16} color={colors.textTertiary} />
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      <EditModal
        visible={editorOpen}
        title={editorEditing ? "Edit Document" : "New Custom Document"}
        fields={editorFields}
        initial={editorInitial || {}}
        onClose={() => setEditorOpen(false)}
        onSubmit={async (v) => {
          const payload: any = {
            type: v.type || (editorInitial?.type || "custom"),
            title: (v.title || "").trim(),
            description: v.description || "",
            status: v.status || "not_started",
            date: v.date || null,
            location: v.location || null,
            notes: v.notes || null,
            custom: !editorEditing,
          };
          if (!payload.title) throw new Error("Title required");
          if (editorEditing) await legalApi.updateDoc(editorEditing, payload);
          else await legalApi.createDoc(payload);
          await load(); setEditorOpen(false);
        }}
        onDelete={editorAllowDelete && editorEditing ? async () => {
          try { await legalApi.deleteDoc(editorEditing!); await load(); }
          catch (e: any) { notify("Cannot delete", e?.message || "Default documents cannot be deleted."); }
        } : undefined}
        deleteSubject={editorInitial?.title || "this document"}
        testID="doc-editor"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  iconBtn: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.surfaceElevated, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  scroll: { padding: spacing.xl, gap: spacing.md },
  disclaimer: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(245,158,11,0.12)", borderColor: colors.warning, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm },
  disclaimerText: { color: colors.warning, fontSize: 11, lineHeight: 16, flex: 1 },
  sectionLabel: { color: colors.textTertiary, fontSize: 10, fontWeight: "700", letterSpacing: 1.2, marginTop: spacing.sm },
  intro: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, justifyContent: "space-between" },
  catCard: { width: "47%", backgroundColor: colors.surface, borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: 6 },
  catIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  catTitle: { color: colors.textPrimary, fontSize: 12, fontWeight: "700" },
  catDesc: { color: colors.textTertiary, fontSize: 10, lineHeight: 14 },
  card: { backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
  smallBtn: { padding: 8, borderRadius: radius.sm, backgroundColor: colors.bg },
  docRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  docIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  docTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: "600" },
  docSub: { color: colors.textTertiary, fontSize: 11, marginTop: 2 },
  debtCta: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
});
