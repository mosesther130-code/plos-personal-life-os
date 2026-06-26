import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import {
  CreditCard,
  Phone,
  Home as HomeIcon,
  Briefcase,
  AlertTriangle,
  HeartPulse,
  Shield,
  TrendingUp,
  Bell,
} from "lucide-react-native";
import { colors, spacing, radius } from "@/src/lib/theme";

const ICON_MAP: Record<string, any> = {
  "credit-card": CreditCard,
  phone: Phone,
  home: HomeIcon,
  briefcase: Briefcase,
  "alert-triangle": AlertTriangle,
  "heart-pulse": HeartPulse,
  shield: Shield,
  "trending-up": TrendingUp,
};

const SEV_COLORS: Record<string, string> = {
  urgent: colors.danger,
  warning: colors.warning,
  info: colors.primaryGlow,
  good: colors.success,
};

interface AlertItem {
  id: string;
  severity: string;
  icon: string;
  title: string;
  subtitle: string;
  time_label: string;
  route?: string;
}

export function AlertRow({
  alert,
  onPress,
  testID,
}: {
  alert: AlertItem;
  onPress?: () => void;
  testID?: string;
}) {
  const Icon = ICON_MAP[alert.icon] || Bell;
  const color = SEV_COLORS[alert.severity] || colors.textSecondary;

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.7}
      testID={testID}
    >
      <View style={[styles.dot, { backgroundColor: color }]} />
      <View style={[styles.iconWrap, { backgroundColor: `${color}1F` }]}>
        <Icon color={color} size={18} />
      </View>
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {alert.title}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {alert.subtitle}
        </Text>
      </View>
      <Text style={[styles.time, { color }]}>{alert.time_label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { flex: 1 },
  title: { color: colors.textPrimary, fontSize: 14, fontWeight: "600" },
  sub: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  time: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
});
