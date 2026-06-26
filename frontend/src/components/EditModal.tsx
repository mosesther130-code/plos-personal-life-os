// Reusable bottom-sheet modal for editing/creating finance items.
import React, { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { X } from "lucide-react-native";
import { colors, spacing, radius } from "@/src/lib/theme";

export type Field =
  | { key: string; label: string; kind: "text"; placeholder?: string }
  | {
      key: string;
      label: string;
      kind: "number";
      placeholder?: string;
    }
  | {
      key: string;
      label: string;
      kind: "select";
      options: { value: string; label: string }[];
    }
  | { key: string; label: string; kind: "boolean" };

interface Props<T> {
  visible: boolean;
  title: string;
  fields: Field[];
  initial?: Partial<T>;
  onClose: () => void;
  onSubmit: (values: T) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  testID?: string;
}

export function EditModal<T extends Record<string, any>>({
  visible,
  title,
  fields,
  initial,
  onClose,
  onSubmit,
  onDelete,
  testID,
}: Props<T>) {
  const [values, setValues] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setValues({ ...(initial || {}) });
      setError(null);
    }
  }, [visible, initial]);

  const update = (k: string, v: any) => setValues((s) => ({ ...s, [k]: v }));

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const cleaned: Record<string, any> = {};
      for (const f of fields) {
        const raw = values[f.key];
        if (f.kind === "number") {
          cleaned[f.key] = raw === "" || raw === undefined ? 0 : Number(raw);
        } else if (f.kind === "boolean") {
          cleaned[f.key] = !!raw;
        } else {
          cleaned[f.key] = raw ?? "";
        }
      }
      await onSubmit(cleaned as T);
      onClose();
    } catch (e: any) {
      setError(e?.message || "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!onDelete) return;
    setBusy(true);
    try {
      await onDelete();
      onClose();
    } catch (e: any) {
      setError(e?.message || "Failed to delete");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      testID={testID}
    >
      <View style={styles.backdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1, justifyContent: "flex-end" }}
        >
          <View style={styles.sheet} testID={`${testID}-sheet`}>
            <View style={styles.header}>
              <Text style={styles.title}>{title}</Text>
              <TouchableOpacity
                onPress={onClose}
                style={styles.closeBtn}
                testID={`${testID}-close`}
              >
                <X color={colors.textSecondary} size={20} />
              </TouchableOpacity>
            </View>
            <ScrollView
              contentContainerStyle={styles.body}
              keyboardShouldPersistTaps="handled"
            >
              {fields.map((f) => (
                <View key={f.key} style={styles.field}>
                  <Text style={styles.label}>{f.label}</Text>
                  {f.kind === "select" ? (
                    <View style={styles.options}>
                      {f.options.map((o) => {
                        const active = values[f.key] === o.value;
                        return (
                          <TouchableOpacity
                            key={o.value}
                            onPress={() => update(f.key, o.value)}
                            style={[styles.chip, active && styles.chipActive]}
                            testID={`${testID}-${f.key}-${o.value}`}
                          >
                            <Text
                              style={[
                                styles.chipText,
                                active && { color: colors.primaryGlow },
                              ]}
                            >
                              {o.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : f.kind === "boolean" ? (
                    <TouchableOpacity
                      onPress={() => update(f.key, !values[f.key])}
                      style={[
                        styles.toggle,
                        values[f.key] && styles.toggleActive,
                      ]}
                      testID={`${testID}-${f.key}-toggle`}
                    >
                      <Text
                        style={[
                          styles.toggleText,
                          values[f.key] && { color: colors.primaryGlow },
                        ]}
                      >
                        {values[f.key] ? "Enabled" : "Disabled"}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <TextInput
                      testID={`${testID}-${f.key}`}
                      value={
                        values[f.key] === undefined ||
                        values[f.key] === null
                          ? ""
                          : String(values[f.key])
                      }
                      onChangeText={(t) => update(f.key, t)}
                      placeholder={
                        ("placeholder" in f ? f.placeholder : "") || ""
                      }
                      placeholderTextColor={colors.textTertiary}
                      keyboardType={f.kind === "number" ? "decimal-pad" : "default"}
                      style={styles.input}
                      autoCapitalize="none"
                    />
                  )}
                </View>
              ))}

              {error ? <Text style={styles.error}>{error}</Text> : null}
            </ScrollView>

            <View style={styles.footer}>
              {onDelete && initial && Object.keys(initial).length > 0 && (
                <TouchableOpacity
                  onPress={remove}
                  style={styles.deleteBtn}
                  disabled={busy}
                  testID={`${testID}-delete`}
                >
                  <Text style={styles.deleteText}>Delete</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={submit}
                style={styles.saveBtn}
                disabled={busy}
                testID={`${testID}-save`}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "90%",
    paddingBottom: spacing.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  title: { color: colors.textPrimary, fontSize: 17, fontWeight: "700" },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceElevated,
  },
  body: { padding: spacing.xl, gap: spacing.md },
  field: { gap: 6 },
  label: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  input: {
    backgroundColor: colors.surfaceElevated,
    color: colors.textPrimary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    fontSize: 15,
  },
  options: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: "transparent",
  },
  chipActive: { borderColor: colors.primaryGlow, backgroundColor: colors.primaryMuted },
  chipText: { color: colors.textSecondary, fontSize: 13, fontWeight: "600" },
  toggle: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    alignSelf: "flex-start",
  },
  toggleActive: { backgroundColor: colors.primaryMuted },
  toggleText: { color: colors.textSecondary, fontWeight: "600" },
  footer: {
    flexDirection: "row",
    padding: spacing.xl,
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  saveBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  saveText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  deleteBtn: {
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  deleteText: { color: colors.danger, fontWeight: "700" },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.sm },
});
