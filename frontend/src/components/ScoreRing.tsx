import React from "react";
import Svg, { Circle } from "react-native-svg";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "@/src/lib/theme";

interface Props {
  score: number; // 0-100
  size?: number;
  strokeWidth?: number;
  label?: string;
  testID?: string;
}

export function ScoreRing({
  score,
  size = 120,
  strokeWidth = 10,
  label,
  testID,
}: Props) {
  const clamped = Math.max(0, Math.min(100, score));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  let color = colors.danger;
  if (clamped >= 75) color = colors.success;
  else if (clamped >= 50) color = colors.warning;

  return (
    <View style={{ width: size, height: size }} testID={testID}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.borderSubtle}
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        <Text style={[styles.score, { color }]}>{clamped}</Text>
        {label ? <Text style={styles.label}>{label}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  score: {
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: -1,
  },
  label: {
    color: colors.textTertiary,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginTop: 2,
  },
});
