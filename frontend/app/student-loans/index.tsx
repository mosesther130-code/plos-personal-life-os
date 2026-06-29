// PLOS — Student Loans Center
// Servicer CRUD, deferment toggles, Claude repayment plans + forgiveness + daily tip.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Linking,
  Switch,
  Alert,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import {
  ArrowLeft,
  GraduationCap,
  Plus,
  Pencil,
  ExternalLink,
  Phone,
  CheckCircle2,
  Calendar,
  Sparkles,
  Award,
  Lightbulb,
  Newspaper,
  Link as LinkIcon,
  PauseCircle,
  RefreshCw,
} from "lucide-react-native";

import { studentLoansApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";
import { EditModal, type Field } from "@/src/components/EditModal";

const fmtUSD = (n: number | null | undefined) => {
  if (n == null) return "—";
  return `$${Math.round(Number(n)).toLocaleString("en-US")}`;
};

const SERVICER_FIELDS: Field[] = [
  { key: "name", label: "Servicer Name", kind: "text", placeholder: "e.g. Aidvantage" },
  { key: "website", label: "Website URL", kind: "text", placeholder: "https://aidvantage.com" },
  { key: "phone", label: "Phone Number", kind: "text", placeholder: "1-800-722-1300" },
  { key: "account_number", label: "Account Number (optional)", kind: "text", placeholder: "Will be stored masked" },
  { key: "notes", label: "Notes", kind: "textarea", maxLength: 300 },
];

const ELIGIBILITY_COLORS: Record<string, string> = {
  "Likely Eligible": colors.success,
  "Potentially Eligible": colors.warning,
  "Not Eligible": colors.danger,
};

function openLink(url: string) {
  if (!url) return;
  const normalized = url.startsWith("http") ? url : `https://${url}`;
  Linking.openURL(normalized).catch(() => {});
}

function dial(phone: string) {
  if (!phone) return;
  const cleaned = phone.replace(/[^0-9+]/g, "");
  if (Platform.OS === "web") {
    Linking.openURL(`tel:${cleaned}`).catch(() => {});
  } else {
    Linking.openURL(`tel:${cleaned}`).catch(() => {});
  }
}

function daysUntil(iso?: string | null): number | null {
  if (!iso) return null;
  try {
    const t = new Date(iso).getTime();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.floor((t - today.getTime()) / (1000 * 60 * 60 * 24));
  } catch {
    return null;
  }
}

export default function StudentLoansHub() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loans, setLoans] = useState<any[]>([]);
  const [totals, setTotals] = useState<any>({});
  const [servicers, setServicers] = useState<any[]>([]);
  const [tip, setTip] = useState<any>(null);
  const [tipLoading, setTipLoading] = useState(false);

  // Modal state
  const [servicerModal, setServicerModal] = useState<{ open: boolean; item?: any }>({ open: false });
  const [defermentDateInput, setDefermentDateInput] = useState<Record<string, string>>({});

  // Repayment plans + forgiveness per loan
  const [activeLoanId, setActiveLoanId] = useState<string | null>(null);
  const [plans, setPlans] = useState<any[] | null>(null);
  const [plansLoading, setPlansLoading] = useState(false);
  const [programs, setPrograms] = useState<any[] | null>(null);
  const [programsLoading, setProgramsLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const [l, s] = await Promise.all([
        studentLoansApi.listLoans(),
        studentLoansApi.listServicers(),
      ]);
      setLoans(l.loans || []);
      setTotals(l.totals || {});
      // Auto-seed federal servicers on first visit if list is empty
      if (!s.servicers || s.servicers.length === 0) {
        await studentLoansApi.seedFederalServicers();
        const fresh = await studentLoansApi.listServicers();
        setServicers(fresh.servicers || []);
      } else {
        setServicers(s.servicers);
      }
      if (l.loans?.length && !activeLoanId) {
        setActiveLoanId(l.loans[0].debt_id);
      }
    } catch (_e) {}
  }, [activeLoanId]);

  const loadTip = useCallback(async () => {
    setTipLoading(true);
    try {
      const r = await studentLoansApi.dailyTip();
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

  const onToggleDeferment = async (loan: any, value: boolean) => {
    const end = defermentDateInput[loan.debt_id] || loan.deferment_end_date || null;
    try {
      await studentLoansApi.updateExtras(loan.debt_id, {
        deferment_active: value,
        deferment_end_date: value ? end : null,
      });
      await load();
    } catch (e: any) {
      Alert.alert("Update failed", e?.message || "Could not update deferment status.");
    }
  };

  const onUpdateDefermentDate = async (loan: any, newDate: string) => {
    setDefermentDateInput((p) => ({ ...p, [loan.debt_id]: newDate }));
    if (loan.deferment_active) {
      try {
        await studentLoansApi.updateExtras(loan.debt_id, {
          deferment_active: true,
          deferment_end_date: newDate || null,
        });
        await load();
      } catch (_e) {}
    }
  };

  const onSaveServicer = async (vals: any) => {
    if (servicerModal.item) {
      await studentLoansApi.updateServicer(servicerModal.item.servicer_id, vals);
    } else {
      await studentLoansApi.createServicer(vals);
    }
    const fresh = await studentLoansApi.listServicers();
    setServicers(fresh.servicers || []);
  };

  const onDeleteServicer = async () => {
    if (!servicerModal.item) return;
    await studentLoansApi.deleteServicer(servicerModal.item.servicer_id);
    const fresh = await studentLoansApi.listServicers();
    setServicers(fresh.servicers || []);
  };

  const loadPlans = async () => {
    if (!activeLoanId) return;
    setPlansLoading(true);
    setPlans(null);
    try {
      const r = await studentLoansApi.repaymentPlans(activeLoanId);
      setPlans(r.plans || []);
    } catch (e: any) {
      Alert.alert("Plans failed", e?.message || "Could not generate repayment plans.");
    }
    setPlansLoading(false);
  };

  const loadForgiveness = async () => {
    if (!activeLoanId) return;
    setProgramsLoading(true);
    setPrograms(null);
    try {
      const r = await studentLoansApi.forgiveness(activeLoanId);
      setPrograms(r.programs || []);
    } catch (e: any) {
      Alert.alert("Forgiveness failed", e?.message || "Could not load forgiveness opportunities.");
    }
    setProgramsLoading(false);
  };

  const activeLoan = useMemo(
    () => loans.find((l) => l.debt_id === activeLoanId) || loans[0],
    [loans, activeLoanId],
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} testID="sl-back">
          <ArrowLeft color={colors.textPrimary} size={20} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Student Loans</Text>
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
          {/* Totals */}
          <View style={styles.totalsRow}>
            <View style={styles.totalCard}>
              <Text style={styles.totalLabel}>BALANCE</Text>
              <Text style={styles.totalValue}>{fmtUSD(totals.balance)}</Text>
            </View>
            <View style={styles.totalCard}>
              <Text style={styles.totalLabel}>MONTHLY DUE</Text>
              <Text style={[styles.totalValue, { color: colors.warning }]}>{fmtUSD(totals.active_minimum_payment)}</Text>
              {totals.deferred_count ? (
                <Text style={styles.totalSub}>{fmtUSD(totals.deferred_minimum_payment)} deferred</Text>
              ) : null}
            </View>
            <View style={styles.totalCard}>
              <Text style={styles.totalLabel}>ACTIVE LOANS</Text>
              <Text style={styles.totalValue}>{totals.active_count || 0}</Text>
              {totals.deferred_count ? <Text style={styles.totalSub}>{totals.deferred_count} deferred</Text> : null}
            </View>
          </View>

          {/* Loans with deferment toggle */}
          <Text style={styles.sectionTitle}>Your Student Loans</Text>
          {loans.length === 0 ? (
            <Text style={styles.emptyText}>No student loans yet. Add one in the Debt Manager.</Text>
          ) : (
            loans.map((loan) => {
              const dEnd = loan.deferment_end_date;
              const dDays = daysUntil(dEnd);
              const isActiveSelect = loan.debt_id === activeLoanId;
              return (
                <TouchableOpacity
                  key={loan.debt_id}
                  style={[styles.loanCard, isActiveSelect && styles.loanCardSelected]}
                  onPress={() => setActiveLoanId(loan.debt_id)}
                  activeOpacity={0.85}
                  testID={`loan-card-${loan.debt_id}`}
                >
                  <View style={styles.loanHead}>
                    <View style={styles.loanIconWrap}><GraduationCap size={16} color={colors.primaryGlow} /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.loanLender}>{loan.lender}</Text>
                      <Text style={styles.loanMeta}>{fmtUSD(loan.balance)} · {Number(loan.apr).toFixed(2)}% APR</Text>
                    </View>
                    <Text style={styles.loanMin}>{fmtUSD(loan.minimum_payment)}/mo</Text>
                  </View>

                  {loan.deferment_active ? (
                    <View style={styles.defermentBadge}>
                      <PauseCircle size={14} color={colors.success} />
                      <Text style={styles.defermentBadgeText}>In Deferment — No Payment Required</Text>
                      {dDays != null && dDays > 0 ? (
                        <Text style={styles.defermentEnd}>
                          ends in {dDays}d{dDays <= 60 ? " ⚠" : ""}
                        </Text>
                      ) : null}
                    </View>
                  ) : null}

                  <View style={styles.defermentRow}>
                    <Text style={styles.defermentLabel}>Deferment</Text>
                    <Switch
                      value={!!loan.deferment_active}
                      onValueChange={(v) => onToggleDeferment(loan, v)}
                      trackColor={{ false: colors.borderSubtle, true: colors.success }}
                      thumbColor="#fff"
                      testID={`deferment-toggle-${loan.debt_id}`}
                    />
                  </View>
                  {loan.deferment_active ? (
                    <View style={styles.endRow}>
                      <Calendar size={12} color={colors.textTertiary} />
                      <Text style={styles.endLabel}>End date (YYYY-MM-DD):</Text>
                      <Text
                        style={styles.endValueEditable}
                        onPress={() => {
                          if (Platform.OS === "web") {
                            // @ts-ignore
                            const v = window.prompt("Deferment end date (YYYY-MM-DD)", dEnd || "");
                            if (v) onUpdateDefermentDate(loan, v);
                          } else {
                            Alert.prompt?.("End date", "Enter YYYY-MM-DD", (v) => v && onUpdateDefermentDate(loan, v));
                          }
                        }}
                      >
                        {dEnd || "tap to set"}
                      </Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            })
          )}

          {/* Loan Servicers */}
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Loan Servicers</Text>
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => setServicerModal({ open: true })}
              testID="add-servicer"
            >
              <Plus size={14} color={colors.primaryGlow} />
              <Text style={styles.addBtnText}>Add</Text>
            </TouchableOpacity>
          </View>
          {servicers.map((s) => (
            <View key={s.servicer_id} style={styles.servicerCard} testID={`servicer-${s.servicer_id}`}>
              <View style={styles.servicerHead}>
                <Text style={styles.servicerName}>{s.name}</Text>
                <TouchableOpacity
                  style={styles.smallEditBtn}
                  onPress={() => setServicerModal({ open: true, item: s })}
                  testID={`edit-servicer-${s.servicer_id}`}
                >
                  <Pencil size={12} color={colors.textTertiary} />
                </TouchableOpacity>
              </View>
              {s.website ? (
                <TouchableOpacity style={styles.linkRow} onPress={() => openLink(s.website)} testID={`web-${s.servicer_id}`}>
                  <ExternalLink size={12} color={colors.primaryGlow} />
                  <Text style={styles.linkText}>{s.website}</Text>
                </TouchableOpacity>
              ) : null}
              {s.phone ? (
                <TouchableOpacity style={styles.linkRow} onPress={() => dial(s.phone)} testID={`tel-${s.servicer_id}`}>
                  <Phone size={12} color={colors.success} />
                  <Text style={[styles.linkText, { color: colors.success }]}>{s.phone}</Text>
                </TouchableOpacity>
              ) : null}
              {s.account_number_masked ? (
                <Text style={styles.servicerAccount}>Account: {s.account_number_masked}</Text>
              ) : null}
              {s.notes ? <Text style={styles.servicerNotes}>{s.notes}</Text> : null}
            </View>
          ))}

          {/* Repayment Plans */}
          <Text style={styles.sectionTitle}>Federal Repayment Plans</Text>
          <Text style={styles.sectionDesc}>
            Claude compares 6 federal repayment plans for {activeLoan ? activeLoan.lender : "your loan"}.
          </Text>
          <TouchableOpacity
            style={[styles.aiBtn, plansLoading && { opacity: 0.6 }]}
            onPress={loadPlans}
            disabled={plansLoading || !activeLoanId}
            testID="generate-plans"
            activeOpacity={0.85}
          >
            {plansLoading ? <ActivityIndicator color="#fff" /> : <Sparkles size={14} color="#fff" />}
            <Text style={styles.aiBtnText}>{plans ? "Refresh Plans" : "Compare Plans"}</Text>
          </TouchableOpacity>
          {plans?.map((p, i) => (
            <View key={i} style={styles.planCard} testID={`plan-${i}`}>
              <View style={styles.planHead}>
                <Text style={styles.planName}>{p.name}</Text>
                {p.forgiveness_amount && Number(p.forgiveness_amount) > 0 ? (
                  <View style={styles.forgivePill}>
                    <Text style={styles.forgivePillText}>Forgives {fmtUSD(p.forgiveness_amount)}</Text>
                  </View>
                ) : null}
              </View>
              {p.best_for ? <Text style={styles.planBest}>{p.best_for}</Text> : null}
              <View style={styles.planStats}>
                <View style={styles.planStat}>
                  <Text style={styles.planStatLabel}>MONTHLY</Text>
                  <Text style={styles.planStatVal}>{fmtUSD(p.monthly_payment)}</Text>
                </View>
                <View style={styles.planStat}>
                  <Text style={styles.planStatLabel}>TERM</Text>
                  <Text style={styles.planStatVal}>{p.term_years}y</Text>
                </View>
                <View style={styles.planStat}>
                  <Text style={styles.planStatLabel}>TOTAL PAID</Text>
                  <Text style={styles.planStatVal}>{fmtUSD(p.total_paid)}</Text>
                </View>
                <View style={styles.planStat}>
                  <Text style={styles.planStatLabel}>INTEREST</Text>
                  <Text style={[styles.planStatVal, { color: colors.warning }]}>{fmtUSD(p.total_interest)}</Text>
                </View>
              </View>
            </View>
          ))}

          {/* Forgiveness Opportunities */}
          <Text style={styles.sectionTitle}>Loan Forgiveness Opportunities</Text>
          <Text style={styles.sectionDesc}>
            Claude analyzes PSLF, Teacher Loan Forgiveness, IDR forgiveness, and Georgia state programs based on your career profile.
          </Text>
          <TouchableOpacity
            style={[styles.aiBtn, programsLoading && { opacity: 0.6 }]}
            onPress={loadForgiveness}
            disabled={programsLoading || !activeLoanId}
            testID="generate-forgiveness"
            activeOpacity={0.85}
          >
            {programsLoading ? <ActivityIndicator color="#fff" /> : <Award size={14} color="#fff" />}
            <Text style={styles.aiBtnText}>{programs ? "Refresh Programs" : "Find Programs"}</Text>
          </TouchableOpacity>
          {programs?.map((p, i) => {
            const elig = p.eligibility || "Potentially Eligible";
            const color = ELIGIBILITY_COLORS[elig] || colors.textSecondary;
            return (
              <View key={i} style={[styles.programCard, { borderColor: color }]} testID={`program-${i}`}>
                <View style={styles.programHead}>
                  <Text style={styles.programName}>{p.name}</Text>
                  <View style={[styles.eligPill, { backgroundColor: color + "22", borderColor: color }]}>
                    <Text style={[styles.eligPillText, { color }]}>{elig}</Text>
                  </View>
                </View>
                {p.estimated_amount ? (
                  <Text style={styles.programAmount}>Estimated forgiveness: {fmtUSD(p.estimated_amount)}</Text>
                ) : null}
                {p.why ? <Text style={styles.programWhy}>{p.why}</Text> : null}
                {Array.isArray(p.next_steps) && p.next_steps.length > 0 ? (
                  <View style={styles.stepsList}>
                    {p.next_steps.map((step: string, j: number) => (
                      <View key={j} style={styles.stepRow}>
                        <CheckCircle2 size={11} color={colors.primaryGlow} />
                        <Text style={styles.stepText}>{step}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                {p.apply_url ? (
                  <TouchableOpacity style={styles.linkRow} onPress={() => openLink(p.apply_url)}>
                    <ExternalLink size={12} color={colors.primaryGlow} />
                    <Text style={styles.linkText}>Apply / Learn more</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            );
          })}

          {/* Daily AI Debt Relief */}
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Daily Debt Relief</Text>
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
              <Text style={styles.aiBtnText}>Get Today{`'`}s Tip</Text>
            </TouchableOpacity>
          )}

          <View style={{ height: 80 }} />
        </ScrollView>
      )}

      <EditModal
        visible={servicerModal.open}
        title={servicerModal.item ? "Edit Servicer" : "Add Servicer"}
        fields={SERVICER_FIELDS}
        initial={
          servicerModal.item || { name: "", website: "", phone: "", account_number: "", notes: "" }
        }
        onClose={() => setServicerModal({ open: false })}
        onSubmit={onSaveServicer}
        onDelete={servicerModal.item ? onDeleteServicer : undefined}
        deleteSubject={servicerModal.item?.name || "this servicer"}
        testID="servicer-modal"
      />
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
    width: 36, height: 36, borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  scroll: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, gap: spacing.md },

  totalsRow: { flexDirection: "row", gap: spacing.sm },
  totalCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  totalLabel: { color: colors.textTertiary, fontSize: 9, fontWeight: "700", letterSpacing: 1, marginBottom: 4 },
  totalValue: { color: colors.textPrimary, fontSize: 15, fontWeight: "700" },
  totalSub: { color: colors.textTertiary, fontSize: 9, marginTop: 2 },

  sectionTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700", marginTop: spacing.md },
  sectionDesc: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginBottom: spacing.sm },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.md },

  addBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: colors.primaryMuted, borderRadius: radius.sm,
  },
  addBtnText: { color: colors.primaryGlow, fontSize: 11, fontWeight: "700" },

  loanCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    gap: spacing.sm,
  },
  loanCardSelected: { borderColor: colors.primaryGlow, backgroundColor: colors.primaryMuted },
  loanHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  loanIconWrap: {
    width: 32, height: 32, borderRadius: radius.sm,
    backgroundColor: colors.primaryMuted,
    alignItems: "center", justifyContent: "center",
  },
  loanLender: { color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
  loanMeta: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  loanMin: { color: colors.warning, fontSize: 13, fontWeight: "700" },

  defermentBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingVertical: 6, paddingHorizontal: 10,
    backgroundColor: "rgba(16,185,129,0.12)",
    borderRadius: radius.sm, borderWidth: 1, borderColor: colors.success,
  },
  defermentBadgeText: { color: colors.success, fontSize: 11, fontWeight: "700", flex: 1 },
  defermentEnd: { color: colors.warning, fontSize: 10, fontWeight: "700" },

  defermentRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingTop: 4,
  },
  defermentLabel: { color: colors.textPrimary, fontSize: 12, fontWeight: "600" },
  endRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  endLabel: { color: colors.textTertiary, fontSize: 11 },
  endValueEditable: {
    color: colors.primaryGlow, fontSize: 11, fontWeight: "700",
    textDecorationLine: "underline",
  },

  servicerCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1, borderColor: colors.borderSubtle,
    gap: 4, marginBottom: spacing.xs,
  },
  servicerHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  servicerName: { color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
  smallEditBtn: { padding: 6, borderRadius: 6, backgroundColor: colors.bg },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 2 },
  linkText: { color: colors.primaryGlow, fontSize: 11, fontWeight: "600" },
  servicerAccount: { color: colors.textTertiary, fontSize: 10, marginTop: 2 },
  servicerNotes: { color: colors.textSecondary, fontSize: 11, fontStyle: "italic", marginTop: 4 },

  aiBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 12, borderRadius: radius.md,
    backgroundColor: colors.primary, marginTop: 4,
  },
  aiBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },

  planCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1, borderColor: colors.borderSubtle,
    marginTop: spacing.sm, gap: spacing.xs,
  },
  planHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 },
  planName: { color: colors.textPrimary, fontSize: 14, fontWeight: "700", flex: 1 },
  forgivePill: {
    backgroundColor: "rgba(16,185,129,0.18)",
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.success,
  },
  forgivePillText: { color: colors.success, fontSize: 10, fontWeight: "700" },
  planBest: { color: colors.textSecondary, fontSize: 11, fontStyle: "italic" },
  planStats: { flexDirection: "row", gap: spacing.sm, marginTop: 6 },
  planStat: { flex: 1, alignItems: "flex-start" },
  planStatLabel: { color: colors.textTertiary, fontSize: 8, fontWeight: "700", letterSpacing: 1 },
  planStatVal: { color: colors.textPrimary, fontSize: 13, fontWeight: "700", marginTop: 2 },

  programCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1.5,
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  programHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 6 },
  programName: { color: colors.textPrimary, fontSize: 14, fontWeight: "700", flex: 1 },
  eligPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm, borderWidth: 1 },
  eligPillText: { fontSize: 10, fontWeight: "700" },
  programAmount: { color: colors.success, fontSize: 12, fontWeight: "700" },
  programWhy: { color: colors.textSecondary, fontSize: 12, lineHeight: 16 },
  stepsList: { gap: 4, marginTop: 4 },
  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  stepText: { color: colors.textPrimary, fontSize: 11, flex: 1, lineHeight: 15 },

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
});
