import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { colors, spacing, radius, priorityColor, priorityBg } from "@/src/lib/theme";
import { Sparkles, Check } from "lucide-react-native";

interface Props {
  module: string;
  advice: string;
  priority: "urgent" | "action" | "info" | string;
  acted?: boolean;
  onAck?: () => void;
  testID?: string;
}

export function AdviceCard({ module, advice, priority, acted, onAck, testID }: Props) {
  const color = priorityColor(priority);
  const bg = priorityBg(priority);

  return (
    <View style={styles.card} testID={testID}>
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <Sparkles size={16} color={colors.primaryGlow} strokeWidth={2} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.module}>{module.toUpperCase()}</Text>
          <View style={[styles.badge, { backgroundColor: bg }]}>
            <Text style={[styles.badgeText, { color }]}>{priority.toUpperCase()}</Text>
          </View>
        </View>
      </View>
      <Text style={styles.advice}>{advice}</Text>
      {onAck && (
        <TouchableOpacity
          style={[styles.ackBtn, acted && styles.ackBtnActive]}
          onPress={onAck}
          disabled={acted}
          testID={`${testID}-ack`}
        >
          <Check size={14} color={acted ? colors.success : colors.textSecondary} />
          <Text style={[styles.ackText, acted && { color: colors.success }]}>
            {acted ? "Acted on" : "Mark as done"}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.primaryMuted,
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.xl,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.primaryMuted,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  headerText: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  module: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
  },
  badge: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
  },
  advice: {
    color: colors.textPrimary,
    fontSize: 15,
    lineHeight: 22,
  },
  ackBtn: {
    marginTop: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  ackBtnActive: {
    borderColor: colors.success,
  },
  ackText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "600",
  },
});
