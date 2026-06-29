// PLOS — Financial Reports bottom sheet
// Lets user pick report type, format, and date range, then downloads or shares the file.
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Platform,
  Alert,
  ScrollView,
} from "react-native";
import DatePickerCompat from "@/src/components/DatePickerCompat";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { X, FileText, FileSpreadsheet, Download, Calendar, CheckCircle2 } from "lucide-react-native";

import { financeApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";

export type ReportType = "statement_income" | "statement_expenses" | "snapshot" | "detailed";
export type ReportFormat = "pdf" | "docx" | "csv";

interface Props {
  visible: boolean;
  onClose: () => void;
}

const REPORT_OPTIONS: { value: ReportType; label: string; desc: string }[] = [
  { value: "statement_income", label: "Income Statement", desc: "All income sources for the period" },
  { value: "statement_expenses", label: "Expense Statement", desc: "All recurring expenses for the period" },
  { value: "snapshot", label: "Financial Snapshot", desc: "One-page polished summary for an advisor or bank" },
  { value: "detailed", label: "Detailed Report", desc: "Multi-page report — income, expenses, debts, assets, investments" },
];

const FORMAT_OPTIONS: { value: ReportFormat; label: string; icon: any }[] = [
  { value: "pdf", label: "PDF", icon: FileText },
  { value: "docx", label: "Word (DOCX)", icon: FileText },
  { value: "csv", label: "CSV", icon: FileSpreadsheet },
];

function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function prettyDate(d: Date) {
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// Convert base64 → Uint8Array (works in both web & native)
function base64ToBytes(b64: string): Uint8Array {
  if (typeof atob === "function") {
    const bin = atob(b64);
    const len = bin.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  // Fallback (shouldn't be needed)
  return new Uint8Array(0);
}

export function ReportsModal({ visible, onClose }: Props) {
  const today = new Date();
  const firstOfYear = new Date(today.getFullYear(), 0, 1);

  const [reportType, setReportType] = useState<ReportType>("snapshot");
  const [format, setFormat] = useState<ReportFormat>("pdf");
  const [startDate, setStartDate] = useState<Date>(firstOfYear);
  const [endDate, setEndDate] = useState<Date>(today);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [loading, setLoading] = useState(false);
  // After generation, we hold a "ready" object so the user has a visible Save button
  const [ready, setReady] = useState<{
    blobUrl?: string;
    base64?: string;
    filename: string;
    mime: string;
    sizeBytes: number;
  } | null>(null);

  // CSV is only valid for statements; auto-switch to pdf when user picks a non-statement type
  const csvAvailable = reportType.startsWith("statement_");
  const effectiveFormat = !csvAvailable && format === "csv" ? "pdf" : format;

  const reset = () => {
    setReportType("snapshot");
    setFormat("pdf");
    setStartDate(firstOfYear);
    setEndDate(today);
    setLoading(false);
    if (ready?.blobUrl) {
      try {
        URL.revokeObjectURL(ready.blobUrl);
      } catch {}
    }
    setReady(null);
  };

  const closeAll = () => {
    reset();
    onClose();
  };

  // Try to auto-trigger the download; many iframes block this silently, so we
  // also keep the blob URL around for a visible "Save File" link.
  const tryAutoDownload = (blobUrl: string, filename: string) => {
    try {
      // @ts-ignore
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      a.rel = "noopener";
      // @ts-ignore
      document.body.appendChild(a);
      a.click();
      // @ts-ignore
      document.body.removeChild(a);
    } catch {}
  };

  const prepareWebBlob = (b64: string, mime: string): string => {
    const bytes = base64ToBytes(b64);
    // @ts-ignore - Blob exists in web
    const blob = new Blob([bytes], { type: mime });
    // @ts-ignore
    return URL.createObjectURL(blob);
  };

  const saveAndShareNative = async (b64: string, filename: string, mime: string) => {
    // SDK 54 expo-file-system: use Legacy API for arbitrary path writes
    const Legacy: any = (FileSystem as any).legacy || FileSystem;
    const dir =
      Legacy.cacheDirectory ||
      Legacy.documentDirectory ||
      (FileSystem as any).cacheDirectory ||
      (FileSystem as any).documentDirectory;
    const path = `${dir}${filename}`;
    await Legacy.writeAsStringAsync(path, b64, { encoding: "base64" });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(path, { mimeType: mime, dialogTitle: filename });
    } else {
      Alert.alert("Report saved", `Saved to: ${path}`);
    }
  };

  const handleDownload = async () => {
    if (endDate < startDate) {
      Alert.alert("Invalid date range", "End date must be on or after start date.");
      return;
    }
    setLoading(true);
    try {
      const res = await financeApi.generateReport({
        report_type: reportType,
        format: effectiveFormat,
        start_date: isoDate(startDate),
        end_date: isoDate(endDate),
      });
      if (Platform.OS === "web") {
        const blobUrl = prepareWebBlob(res.content_base64, res.mime_type);
        // Try the auto-download (works in standalone tabs; often blocked in sandboxed iframes)
        tryAutoDownload(blobUrl, res.filename);
        setReady({
          blobUrl,
          filename: res.filename,
          mime: res.mime_type,
          sizeBytes: res.size_bytes,
        });
      } else {
        await saveAndShareNative(res.content_base64, res.filename, res.mime_type);
        setReady({
          base64: res.content_base64,
          filename: res.filename,
          mime: res.mime_type,
          sizeBytes: res.size_bytes,
        });
      }
    } catch (e: any) {
      Alert.alert("Report failed", e?.message || "Could not generate the report.");
    } finally {
      setLoading(false);
    }
  };

  const reshareNative = async () => {
    if (!ready?.base64) return;
    await saveAndShareNative(ready.base64, ready.filename, ready.mime);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={closeAll}
      testID="reports-modal"
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Download Reports</Text>
              <Text style={styles.subtitle}>Export your finances as PDF, Word, or CSV</Text>
            </View>
            <TouchableOpacity onPress={closeAll} style={styles.closeBtn} testID="reports-close">
              <X size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* SUCCESS STATE — shown after generation. The visible anchor link is the
              reliable "user-initiated" download trigger that works inside iframes. */}
          {ready ? (
            <View style={styles.successCard} testID="report-ready">
              <View style={styles.successHeader}>
                <CheckCircle2 size={24} color={colors.success} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.successTitle}>Report ready</Text>
                  <Text style={styles.successSub}>{ready.filename}</Text>
                  <Text style={styles.successMeta}>
                    {(ready.sizeBytes / 1024).toFixed(1)} KB · {ready.mime.split("/").pop()?.toUpperCase()}
                  </Text>
                </View>
              </View>

              {Platform.OS === "web" ? (
                // Real anchor element — user-initiated click bypasses iframe download blocking
                React.createElement(
                  "a",
                  {
                    href: ready.blobUrl,
                    download: ready.filename,
                    style: {
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      padding: 14,
                      borderRadius: 12,
                      backgroundColor: "#1E40AF",
                      color: "#fff",
                      textDecoration: "none",
                      fontSize: 14,
                      fontWeight: 700,
                      marginTop: 16,
                    },
                    "data-testid": "save-file-anchor",
                  },
                  "⬇  Save File to Device",
                )
              ) : (
                <TouchableOpacity
                  style={styles.shareBtn}
                  onPress={reshareNative}
                  testID="reshare-native"
                  activeOpacity={0.85}
                >
                  <Download size={16} color="#fff" />
                  <Text style={styles.shareBtnText}>Open Share Sheet</Text>
                </TouchableOpacity>
              )}

              <View style={styles.successActions}>
                <TouchableOpacity
                  style={styles.againBtn}
                  onPress={() => setReady(null)}
                  testID="generate-another"
                  activeOpacity={0.7}
                >
                  <Text style={styles.againBtnText}>Generate Another</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.doneBtn}
                  onPress={closeAll}
                  testID="reports-done"
                  activeOpacity={0.7}
                >
                  <Text style={styles.doneBtnText}>Done</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.hint}>
                If your browser auto-blocked the download, tap “Save File to Device” above.
              </Text>
            </View>
          ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.lg }}>
            {/* Date range */}
            <Text style={styles.sectionLabel}>DATE RANGE</Text>
            <View style={styles.dateRow}>
              <TouchableOpacity
                style={styles.dateChip}
                onPress={() => setShowStartPicker(true)}
                testID="report-start-date"
              >
                <Calendar size={14} color={colors.primaryGlow} />
                <View>
                  <Text style={styles.dateChipLabel}>FROM</Text>
                  <Text style={styles.dateChipValue}>{prettyDate(startDate)}</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.dateChip}
                onPress={() => setShowEndPicker(true)}
                testID="report-end-date"
              >
                <Calendar size={14} color={colors.primaryGlow} />
                <View>
                  <Text style={styles.dateChipLabel}>TO</Text>
                  <Text style={styles.dateChipValue}>{prettyDate(endDate)}</Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Quick range chips */}
            <View style={styles.quickRow}>
              {[
                { label: "MTD", fn: () => setStartDate(new Date(today.getFullYear(), today.getMonth(), 1)) },
                { label: "YTD", fn: () => setStartDate(new Date(today.getFullYear(), 0, 1)) },
                { label: "Last 12 mo", fn: () => setStartDate(new Date(today.getFullYear() - 1, today.getMonth(), 1)) },
              ].map((q) => (
                <TouchableOpacity
                  key={q.label}
                  style={styles.quickChip}
                  onPress={() => {
                    q.fn();
                    setEndDate(today);
                  }}
                  testID={`quick-range-${q.label}`}
                >
                  <Text style={styles.quickChipText}>{q.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Report type */}
            <Text style={styles.sectionLabel}>REPORT TYPE</Text>
            {REPORT_OPTIONS.map((o) => {
              const selected = reportType === o.value;
              return (
                <TouchableOpacity
                  key={o.value}
                  style={[styles.optionRow, selected && styles.optionRowSelected]}
                  onPress={() => setReportType(o.value)}
                  testID={`report-type-${o.value}`}
                  activeOpacity={0.7}
                >
                  <View style={[styles.radio, selected && styles.radioSelected]}>
                    {selected ? <View style={styles.radioDot} /> : null}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.optionLabel, selected && { color: colors.primaryGlow }]}>{o.label}</Text>
                    <Text style={styles.optionDesc}>{o.desc}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}

            {/* Format */}
            <Text style={styles.sectionLabel}>FORMAT</Text>
            <View style={styles.formatRow}>
              {FORMAT_OPTIONS.map((f) => {
                const Icon = f.icon;
                const disabled = f.value === "csv" && !csvAvailable;
                const selected = effectiveFormat === f.value;
                return (
                  <TouchableOpacity
                    key={f.value}
                    style={[
                      styles.formatChip,
                      selected && styles.formatChipSelected,
                      disabled && styles.formatChipDisabled,
                    ]}
                    onPress={() => !disabled && setFormat(f.value)}
                    disabled={disabled}
                    testID={`report-format-${f.value}`}
                    activeOpacity={0.7}
                  >
                    <Icon size={16} color={selected ? "#fff" : disabled ? colors.textTertiary : colors.textSecondary} />
                    <Text
                      style={[
                        styles.formatChipText,
                        selected && { color: "#fff" },
                        disabled && { color: colors.textTertiary },
                      ]}
                    >
                      {f.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {!csvAvailable ? (
              <Text style={styles.hint}>CSV is only available for Income/Expense statements.</Text>
            ) : null}

            {/* Generate */}
            <TouchableOpacity
              style={[styles.generateBtn, loading && { opacity: 0.6 }]}
              onPress={handleDownload}
              disabled={loading}
              testID="generate-report"
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Download size={16} color="#fff" />
                  <Text style={styles.generateBtnText}>Generate & Download</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
          )}

          {showStartPicker ? (
            <DatePickerCompat
              value={startDate}
              maximumDate={endDate}
              onChange={(d) => setStartDate(d)}
              onClose={() => setShowStartPicker(false)}
            />
          ) : null}
          {showEndPicker ? (
            <DatePickerCompat
              value={endDate}
              minimumDate={startDate}
              maximumDate={new Date()}
              onChange={(d) => setEndDate(d)}
              onClose={() => setShowEndPicker(false)}
            />
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    maxHeight: "92%",
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: spacing.lg },
  title: { color: colors.textPrimary, fontSize: 18, fontWeight: "700" },
  subtitle: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionLabel: {
    color: colors.textTertiary,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  dateRow: { flexDirection: "row", gap: spacing.sm },
  dateChip: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  dateChipLabel: { color: colors.textTertiary, fontSize: 9, fontWeight: "700", letterSpacing: 1 },
  dateChipValue: { color: colors.textPrimary, fontSize: 13, fontWeight: "600", marginTop: 2 },
  quickRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  quickChip: {
    backgroundColor: colors.primaryMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.sm,
  },
  quickChipText: { color: colors.primaryGlow, fontSize: 11, fontWeight: "700" },
  optionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    marginBottom: spacing.sm,
  },
  optionRowSelected: { borderColor: colors.primaryGlow, backgroundColor: colors.primaryMuted },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.textTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  radioSelected: { borderColor: colors.primaryGlow },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primaryGlow },
  optionLabel: { color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
  optionDesc: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  formatRow: { flexDirection: "row", gap: spacing.sm },
  formatChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bg,
  },
  formatChipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  formatChipDisabled: { opacity: 0.4 },
  formatChipText: { color: colors.textSecondary, fontSize: 12, fontWeight: "700" },
  hint: { color: colors.textTertiary, fontSize: 11, fontStyle: "italic", marginTop: 6 },
  generateBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: spacing.lg,
  },
  generateBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },

  // Success state
  successCard: {
    backgroundColor: colors.bg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.success,
    padding: spacing.lg,
    marginTop: spacing.sm,
  },
  successHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  successTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  successSub: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  successMeta: { color: colors.textTertiary, fontSize: 11, marginTop: 2 },
  shareBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: spacing.md,
  },
  shareBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  successActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  againBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primaryGlow,
    alignItems: "center",
  },
  againBtnText: { color: colors.primaryGlow, fontSize: 13, fontWeight: "700" },
  doneBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    alignItems: "center",
  },
  doneBtnText: { color: colors.textPrimary, fontSize: 13, fontWeight: "700" },
});
