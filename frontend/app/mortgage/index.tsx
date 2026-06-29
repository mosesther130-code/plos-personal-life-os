// PLOS — Mortgage Advisor (Enhancement 3)
// Servicer CRUD with 16 pre-populated templates, 4 Claude advisor cards,
// and a daily mortgage tip + news + resource.
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Linking,
  Alert,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import {
  ArrowLeft,
  Plus,
  Pencil,
  ExternalLink,
  Phone,
  Sparkles,
  Home,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Banknote,
  HandCoins,
  Lightbulb,
  Newspaper,
  Link as LinkIcon,
  X,
} from "lucide-react-native";

import { mortgageApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";
import { EditModal, type Field } from "@/src/components/EditModal";

const fmtUSD = (n: number | null | undefined) => {
  if (n == null) return "—";
  return `$${Math.round(Number(n)).toLocaleString("en-US")}`;
};

const fmtPct = (n: number | null | undefined) => {
  if (n == null) return "—";
  return `${Number(n).toFixed(2)}%`;
};

const SERVICER_FIELDS: Field[] = [
  { key: "name", label: "Servicer Name", kind: "text" },
  {
    key: "category",
    label: "Category",
    kind: "select",
    options: [
      { label: "Bank", value: "bank" },
      { label: "Non-Bank / Independent", value: "non_bank" },
    ],
  },
  { key: "website", label: "Website URL", kind: "text" },
  { key: "phone", label: "Phone Number", kind: "text" },
  { key: "loan_number", label: "Loan Number (optional)", kind: "text", placeholder: "Stored masked" },
  { key: "current_rate", label: "Current Rate (%)", kind: "number" },
  { key: "notes", label: "Notes", kind: "textarea", maxLength: 300 },
];

function openLink(url: string) {
  if (!url) return;
  const u = url.startsWith("http") ? url : `https://${url}`;
  Linking.openURL(u).catch(() => {});
}
function dial(p: string) {
  const cleaned = (p || "").replace(/[^0-9+]/g, "");
  Linking.openURL(`tel:${cleaned}`).catch(() => {});
}

const RECOMMENDATION_COLORS: Record<string, string> = {
  "Refinance Now": colors.success,
  "Wait": colors.warning,
  "Not Recommended": colors.danger,
  "Hold": colors.primaryGlow,
  "Consider Selling": colors.warning,
  "Strong Sell": colors.success,
  "Recommended": colors.success,
  "Caution": colors.warning,
  "Avoid": colors.danger,
  "Worth Exploring": colors.success,
  "Not Recommended for Your Situation": colors.danger,
};

export default function MortgageAdvisor() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [servicers, setServicers] = useState<any[]>([]);
  const [nonBankTemplates, setNonBankTemplates] = useState<any[]>([]);
  const [bankTemplates, setBankTemplates] = useState<any[]>([]);
  const [intel, setIntel] = useState<any>(null);
  const [intelLoading, setIntelLoading] = useState(false);
  const [tip, setTip] = useState<any>(null);
  const [tipLoading, setTipLoading] = useState(false);

  const [servicerModal, setServicerModal] = useState<{ open: boolean; item?: any }>({ open: false });
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await mortgageApi.listServicers();
      setServicers(r.servicers || []);
      setNonBankTemplates(r.non_bank_templates || []);
      setBankTemplates(r.bank_templates || []);
    } catch (_e) {}
  }, []);

  const loadTip = useCallback(async () => {
    setTipLoading(true);
    try {
      const r = await mortgageApi.dailyTip();
      setTip(r);
    } catch (_e) {
      setTip(null);
    }
    setTipLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
      loadTip();
    })();
  }, [load, loadTip]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const onSaveServicer = async (vals: any) => {
    if (servicerModal.item) {
      await mortgageApi.updateServicer(servicerModal.item.servicer_id, vals);
    } else {
      await mortgageApi.createServicer(vals);
    }
    await load();
  };

  const onDeleteServicer = async () => {
    if (!servicerModal.item) return;
    await mortgageApi.deleteServicer(servicerModal.item.servicer_id);
    await load();
  };

  const addFromTemplate = async (t: any, category: string) => {
    try {
      await mortgageApi.createServicer({ ...t, category });
      await load();
      setTemplatePickerOpen(false);
    } catch (e: any) {
      Alert.alert("Could not add", e?.message || "Servicer may already exist.");
    }
  };

  const loadIntelligence = async () => {
    setIntelLoading(true);
    try {
      const r = await mortgageApi.intelligence();
      setIntel(r);
    } catch (e: any) {
      Alert.alert("Intelligence failed", e?.message || "Unable to load mortgage intelligence.");
    }
    setIntelLoading(false);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} testID="mortgage-back">
          <ArrowLeft color={colors.textPrimary} size={20} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mortgage Advisor</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primaryGlow} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primaryGlow} />}
        >
          {/* Servicer list */}
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Loan Servicers</Text>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <TouchableOpacity
                style={styles.addBtn}
                onPress={() => setTemplatePickerOpen(true)}
                testID="open-templates"
              >
                <Plus size={14} color={colors.primaryGlow} />
                <Text style={styles.addBtnText}>From list</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.addBtn, { backgroundColor: colors.primary }]}
                onPress={() => setServicerModal({ open: true })}
                testID="add-custom-servicer"
              >
                <Plus size={14} color="#fff" />
                <Text style={[styles.addBtnText, { color: "#fff" }]}>Custom</Text>
              </TouchableOpacity>
            </View>
          </View>

          {servicers.length === 0 ? (
            <Text style={styles.emptyText}>
              No servicers yet. Tap {`"`}From list{`"`} to pick from 16 US mortgage servicers, or {`"`}Custom{`"`} to add your own.
            </Text>
          ) : (
            servicers.map((s) => (
              <View key={s.servicer_id} style={styles.servicerCard} testID={`servicer-${s.servicer_id}`}>
                <View style={styles.servicerHead}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.servicerName}>{s.name}</Text>
                    {s.category ? (
                      <Text style={styles.servicerCategory}>
                        {s.category === "bank" ? "Bank" : "Non-Bank / Independent"}
                      </Text>
                    ) : null}
                  </View>
                  <TouchableOpacity
                    style={styles.smallEditBtn}
                    onPress={() => setServicerModal({ open: true, item: s })}
                    testID={`edit-servicer-${s.servicer_id}`}
                  >
                    <Pencil size={12} color={colors.textTertiary} />
                  </TouchableOpacity>
                </View>
                {s.website ? (
                  <TouchableOpacity style={styles.linkRow} onPress={() => openLink(s.website)}>
                    <ExternalLink size={12} color={colors.primaryGlow} />
                    <Text style={styles.linkText}>{s.website}</Text>
                  </TouchableOpacity>
                ) : null}
                {s.phone ? (
                  <TouchableOpacity style={styles.linkRow} onPress={() => dial(s.phone)}>
                    <Phone size={12} color={colors.success} />
                    <Text style={[styles.linkText, { color: colors.success }]}>{s.phone}</Text>
                  </TouchableOpacity>
                ) : null}
                {s.current_rate ? (
                  <Text style={styles.servicerRate}>Rate on file: {fmtPct(s.current_rate)}</Text>
                ) : null}
                {s.loan_number_masked ? (
                  <Text style={styles.servicerAccount}>Loan #: {s.loan_number_masked}</Text>
                ) : null}
              </View>
            ))
          )}

          {/* Mortgage Intelligence */}
          <Text style={styles.sectionTitle}>Mortgage Intelligence</Text>
          <Text style={styles.sectionDesc}>
            Four Claude-powered advisor cards: refinance analysis, sell-or-hold signal, home equity loan review, and home equity investment products.
          </Text>
          <TouchableOpacity
            style={[styles.aiBtn, intelLoading && { opacity: 0.6 }]}
            onPress={loadIntelligence}
            disabled={intelLoading}
            testID="generate-intel"
            activeOpacity={0.85}
          >
            {intelLoading ? <ActivityIndicator color="#fff" /> : <Sparkles size={14} color="#fff" />}
            <Text style={styles.aiBtnText}>{intel ? "Refresh Analysis" : "Analyze My Mortgage"}</Text>
          </TouchableOpacity>

          {intel?.refinance && (
            <AdvisorCard
              icon={<TrendingDown size={16} color={colors.primaryGlow} />}
              title="Should I Refinance?"
              recommendation={intel.refinance.recommendation}
              stats={[
                { label: "30YR RATE", value: fmtPct(intel.refinance.current_30yr_rate) },
                { label: "15YR RATE", value: fmtPct(intel.refinance.current_15yr_rate) },
                { label: "MONTHLY SAVE", value: fmtUSD(intel.refinance.monthly_savings) },
                { label: "BREAK-EVEN", value: `${intel.refinance.break_even_months || 0}mo` },
                { label: "TOTAL SAVINGS", value: fmtUSD(intel.refinance.total_interest_savings) },
              ]}
              reasoning={intel.refinance.reasoning}
            />
          )}

          {intel?.sell_hold && (
            <AdvisorCard
              icon={<Home size={16} color={colors.warning} />}
              title="Sell or Hold?"
              recommendation={intel.sell_hold.signal}
              stats={[
                { label: "EQUITY", value: fmtUSD(intel.sell_hold.estimated_equity) },
              ]}
              extraText={intel.sell_hold.market_outlook ? `Market: ${intel.sell_hold.market_outlook}` : undefined}
              reasoning={intel.sell_hold.reasoning}
            />
          )}

          {intel?.helo && (
            <AdvisorCard
              icon={<HandCoins size={16} color={colors.success} />}
              title="Home Equity Loan / HELOC"
              recommendation={intel.helo.recommendation}
              stats={[
                { label: "AVAIL EQUITY", value: fmtUSD(intel.helo.available_equity) },
                { label: "EST. RATE", value: fmtPct(intel.helo.estimated_heloc_rate) },
                { label: "MAX HELOC", value: fmtUSD(intel.helo.max_heloc_amount) },
              ]}
              reasoning={intel.helo.reasoning}
            />
          )}

          {intel?.hei && (
            <AdvisorCard
              icon={<Banknote size={16} color={colors.primaryGlow} />}
              title="Home Equity Investment"
              recommendation={intel.hei.recommendation}
              extraText={intel.hei.how_it_works}
              listSections={[
                { label: "PROS", items: intel.hei.pros || [], color: colors.success },
                { label: "CONS", items: intel.hei.cons || [], color: colors.warning },
              ]}
              chips={intel.hei.providers}
              reasoning={intel.hei.reasoning}
            />
          )}

          {/* Daily AI Mortgage Tip */}
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Daily Mortgage Brief</Text>
            <TouchableOpacity onPress={loadTip} testID="refresh-tip" disabled={tipLoading}>
              {tipLoading ? <ActivityIndicator size="small" color={colors.primaryGlow} /> : <RefreshCw size={14} color={colors.textTertiary} />}
            </TouchableOpacity>
          </View>
          {tip ? (
            <View style={styles.tipCard} testID="daily-tip-card">
              {tip.tip ? (
                <View style={styles.tipSection}>
                  <View style={styles.tipIconRow}>
                    <Lightbulb size={14} color={colors.warning} />
                    <Text style={styles.tipKind}>TIP</Text>
                  </View>
                  <Text style={styles.tipTitle}>{tip.tip.title}</Text>
                  <Text style={styles.tipBody}>{tip.tip.body}</Text>
                </View>
              ) : null}
              {tip.news ? (
                <View style={styles.tipSection}>
                  <View style={styles.tipIconRow}>
                    <Newspaper size={14} color={colors.primaryGlow} />
                    <Text style={styles.tipKind}>NEWS</Text>
                    {tip.news.source ? <Text style={styles.tipSource}>· {tip.news.source}</Text> : null}
                  </View>
                  <Text style={styles.tipTitle}>{tip.news.title}</Text>
                  <Text style={styles.tipBody}>{tip.news.body}</Text>
                </View>
              ) : null}
              {tip.resource ? (
                <TouchableOpacity
                  style={styles.tipSection}
                  onPress={() => openLink(tip.resource.url)}
                  testID="tip-resource"
                  activeOpacity={0.7}
                >
                  <View style={styles.tipIconRow}>
                    <LinkIcon size={14} color={colors.success} />
                    <Text style={styles.tipKind}>RESOURCE</Text>
                  </View>
                  <Text style={[styles.tipTitle, { color: colors.success }]}>{tip.resource.title}</Text>
                  <Text style={styles.tipBody}>{tip.resource.description}</Text>
                </TouchableOpacity>
              ) : null}
              <Text style={styles.tipFooter}>
                Generated {tip.date}{tip.cached ? " · cached" : ""}
              </Text>
            </View>
          ) : (
            <TouchableOpacity style={styles.aiBtn} onPress={loadTip} testID="load-tip" activeOpacity={0.85}>
              <Sparkles size={14} color="#fff" />
              <Text style={styles.aiBtnText}>Get Today{`'`}s Brief</Text>
            </TouchableOpacity>
          )}

          <View style={{ height: 80 }} />
        </ScrollView>
      )}

      {/* Custom servicer modal */}
      <EditModal
        visible={servicerModal.open}
        title={servicerModal.item ? "Edit Servicer" : "Add Custom Servicer"}
        fields={SERVICER_FIELDS}
        initial={
          servicerModal.item || {
            name: "",
            category: "non_bank",
            website: "",
            phone: "",
            loan_number: "",
            current_rate: 0,
            notes: "",
          }
        }
        onClose={() => setServicerModal({ open: false })}
        onSubmit={onSaveServicer}
        onDelete={servicerModal.item ? onDeleteServicer : undefined}
        deleteSubject={servicerModal.item?.name || "this servicer"}
        testID="mortgage-servicer-modal"
      />

      {/* Template picker modal */}
      <Modal visible={templatePickerOpen} transparent animationType="slide" onRequestClose={() => setTemplatePickerOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetTitle}>Pick a Mortgage Servicer</Text>
                <Text style={styles.sheetSub}>16 US mortgage servicers, tap to add</Text>
              </View>
              <TouchableOpacity onPress={() => setTemplatePickerOpen(false)} style={styles.closeBtn} testID="close-templates">
                <X size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.templateGroup}>NON-BANK / INDEPENDENT</Text>
              {nonBankTemplates.map((t, i) => (
                <TouchableOpacity
                  key={`nb-${i}`}
                  style={styles.templateRow}
                  onPress={() => addFromTemplate(t, "non_bank")}
                  testID={`tpl-nb-${i}`}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.templateName}>{t.name}</Text>
                    <Text style={styles.templateMeta}>{t.phone}</Text>
                  </View>
                  <Plus size={16} color={colors.primaryGlow} />
                </TouchableOpacity>
              ))}
              <Text style={styles.templateGroup}>BANKS</Text>
              {bankTemplates.map((t, i) => (
                <TouchableOpacity
                  key={`b-${i}`}
                  style={styles.templateRow}
                  onPress={() => addFromTemplate(t, "bank")}
                  testID={`tpl-b-${i}`}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.templateName}>{t.name}</Text>
                    <Text style={styles.templateMeta}>{t.phone}</Text>
                  </View>
                  <Plus size={16} color={colors.primaryGlow} />
                </TouchableOpacity>
              ))}
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ----------------- Advisor card subcomponent -----------------
interface AdvisorCardProps {
  icon: React.ReactNode;
  title: string;
  recommendation?: string;
  stats?: { label: string; value: string }[];
  extraText?: string;
  reasoning?: string;
  listSections?: { label: string; items: string[]; color: string }[];
  chips?: string[];
}
function AdvisorCard(props: AdvisorCardProps) {
  const recColor = props.recommendation
    ? RECOMMENDATION_COLORS[props.recommendation] || colors.textSecondary
    : colors.textSecondary;
  return (
    <View style={styles.advisorCard}>
      <View style={styles.advisorHead}>
        <View style={styles.advisorIconBox}>{props.icon}</View>
        <Text style={styles.advisorTitle}>{props.title}</Text>
      </View>
      {props.recommendation ? (
        <View style={[styles.recPill, { borderColor: recColor, backgroundColor: recColor + "1A" }]}>
          <Text style={[styles.recText, { color: recColor }]}>{props.recommendation}</Text>
        </View>
      ) : null}
      {props.stats && props.stats.length > 0 ? (
        <View style={styles.advisorStats}>
          {props.stats.map((s, i) => (
            <View key={i} style={styles.advisorStat}>
              <Text style={styles.advisorStatLabel}>{s.label}</Text>
              <Text style={styles.advisorStatVal}>{s.value}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {props.chips ? (
        <View style={styles.chipsRow}>
          {props.chips.map((c, i) => (
            <View key={i} style={styles.chip}><Text style={styles.chipText}>{c}</Text></View>
          ))}
        </View>
      ) : null}
      {props.extraText ? <Text style={styles.advisorExtra}>{props.extraText}</Text> : null}
      {props.listSections?.map((sec, i) => (
        <View key={i} style={{ marginTop: spacing.sm }}>
          <Text style={[styles.listLabel, { color: sec.color }]}>{sec.label}</Text>
          {sec.items.map((it, j) => (
            <Text key={j} style={styles.listItem}>•  {it}</Text>
          ))}
        </View>
      ))}
      {props.reasoning ? <Text style={styles.advisorReasoning}>{props.reasoning}</Text> : null}
    </View>
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
    width: 36, height: 36, borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  scroll: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, gap: spacing.md },

  sectionTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700", marginTop: spacing.md },
  sectionDesc: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginBottom: spacing.sm },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.md },

  addBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: colors.primaryMuted, borderRadius: radius.sm,
  },
  addBtnText: { color: colors.primaryGlow, fontSize: 11, fontWeight: "700" },

  servicerCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1, borderColor: colors.borderSubtle,
    gap: 4, marginBottom: spacing.xs,
  },
  servicerHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  servicerName: { color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
  servicerCategory: { color: colors.textTertiary, fontSize: 10, marginTop: 2, fontWeight: "600", letterSpacing: 0.5 },
  smallEditBtn: { padding: 6, borderRadius: 6, backgroundColor: colors.bg },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 2 },
  linkText: { color: colors.primaryGlow, fontSize: 11, fontWeight: "600" },
  servicerAccount: { color: colors.textTertiary, fontSize: 10, marginTop: 2 },
  servicerRate: { color: colors.success, fontSize: 11, fontWeight: "700" },

  aiBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 12, borderRadius: radius.md,
    backgroundColor: colors.primary, marginTop: 4,
  },
  aiBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },

  advisorCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1, borderColor: colors.borderSubtle,
    marginTop: spacing.sm, gap: spacing.xs,
  },
  advisorHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  advisorIconBox: {
    width: 30, height: 30, borderRadius: radius.sm,
    backgroundColor: colors.primaryMuted,
    alignItems: "center", justifyContent: "center",
  },
  advisorTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: "700", flex: 1 },
  recPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: radius.sm, borderWidth: 1,
    marginTop: 4,
  },
  recText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.3 },
  advisorStats: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  advisorStat: {
    backgroundColor: colors.bg,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: radius.sm,
    minWidth: 95,
  },
  advisorStatLabel: { color: colors.textTertiary, fontSize: 8, fontWeight: "700", letterSpacing: 1 },
  advisorStatVal: { color: colors.textPrimary, fontSize: 13, fontWeight: "700", marginTop: 2 },
  advisorExtra: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: spacing.sm, fontStyle: "italic" },
  advisorReasoning: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: spacing.sm },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: spacing.sm },
  chip: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1, borderColor: colors.primaryGlow,
  },
  chipText: { color: colors.primaryGlow, fontSize: 10, fontWeight: "700" },
  listLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 1, marginBottom: 4 },
  listItem: { color: colors.textPrimary, fontSize: 11, marginBottom: 2, lineHeight: 16 },

  tipCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1, borderColor: colors.borderSubtle,
    gap: spacing.md,
  },
  tipSection: { gap: 4 },
  tipIconRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  tipKind: { color: colors.textTertiary, fontSize: 9, fontWeight: "700", letterSpacing: 1.2 },
  tipSource: { color: colors.textTertiary, fontSize: 9 },
  tipTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: "700" },
  tipBody: { color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  tipFooter: { color: colors.textTertiary, fontSize: 10, fontStyle: "italic", textAlign: "center" },

  emptyText: { color: colors.textTertiary, fontSize: 12, fontStyle: "italic", paddingVertical: spacing.md },

  // Template picker modal
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    maxHeight: "85%",
    borderTopWidth: 1, borderTopColor: colors.borderSubtle,
  },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: spacing.md },
  sheetTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: "700" },
  sheetSub: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.bg,
    alignItems: "center", justifyContent: "center",
  },
  templateGroup: {
    color: colors.textTertiary,
    fontSize: 10, fontWeight: "700", letterSpacing: 1.5,
    marginTop: spacing.md, marginBottom: spacing.xs,
  },
  templateRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    paddingVertical: spacing.md, paddingHorizontal: spacing.sm,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.borderSubtle,
    marginBottom: 6,
  },
  templateName: { color: colors.textPrimary, fontSize: 13, fontWeight: "700" },
  templateMeta: { color: colors.textTertiary, fontSize: 11, marginTop: 2 },
});
