import React from "react";
import { View, Text, StyleSheet, ViewStyle, StyleProp } from "react-native";
import { colors, spacing, radius } from "@/src/lib/theme";

interface Props {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Card({ children, style, testID }: Props) {
  return (
    <View style={[styles.card, style]} testID={testID}>
      {children}
    </View>
  );
}

interface StatProps {
  label: string;
  value: string;
  hint?: string;
  testID?: string;
  accent?: string;
}

export function StatCard({ label, value, hint, testID, accent }: StatProps) {
  return (
    <View style={styles.card} testID={testID}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, accent ? { color: accent } : null]}>
        {value}
      </Text>
      {hint ? <Text style={styles.statHint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.xl,
  },
  statLabel: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: spacing.sm,
  },
  statValue: {
    color: colors.textPrimary,
    fontSize: 26,
    fontWeight: "600",
    letterSpacing: -0.5,
  },
  statHint: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: spacing.xs,
  },
});
