// Reusable empty state card. Consistent visual across all list screens.
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { colors, spacing } from "@/src/lib/theme";

type Props = {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
};

export default function EmptyState({ icon, title, subtitle, actionLabel, onAction, testID }: Props) {
  return (
    <View style={styles.card} testID={testID || "empty-state"}>
      {icon}
      <Text style={styles.title}>{title}</Text>
      {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      {!!actionLabel && !!onAction && (
        <TouchableOpacity style={styles.btn} onPress={onAction} testID={`${testID || "empty-state"}-action`}>
          <Text style={styles.btnText}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.xl,
    alignItems: "center", justifyContent: "center",
    gap: spacing.sm,
  },
  title: { color: colors.text, fontWeight: "800", fontSize: 15, marginTop: spacing.xs, textAlign: "center" },
  subtitle: { color: colors.textTertiary, fontSize: 12, textAlign: "center", lineHeight: 17 },
  btn: { marginTop: spacing.sm, backgroundColor: colors.primary, paddingVertical: 10, paddingHorizontal: 22, borderRadius: 10 },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
});
