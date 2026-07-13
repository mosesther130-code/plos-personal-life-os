// PLOS — Radar Chart (SVG). Supports any number of dimensions.
import React from "react";
import Svg, { Polygon, Line, Circle, Text as SvgText } from "react-native-svg";
import { View, StyleSheet } from "react-native";
import { colors } from "@/src/lib/theme";

type Props = {
  data: { label: string; value: number; max?: number }[];
  size?: number;
  color?: string;
};

export default function RadarChart({ data, size = 260, color = "#3B82F6" }: Props) {
  if (!data || data.length < 3) return <View style={{ height: size }} />;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 32;
  const n = data.length;
  const angle = (i: number) => -Math.PI / 2 + (2 * Math.PI * i) / n;

  const point = (i: number, r: number) => ({
    x: cx + r * Math.cos(angle(i)),
    y: cy + r * Math.sin(angle(i)),
  });

  const rings = [0.25, 0.5, 0.75, 1];
  const polygon = data.map((d, i) => {
    const max = d.max || 100;
    const r = radius * Math.max(0, Math.min(1, d.value / max));
    const p = point(i, r);
    return `${p.x},${p.y}`;
  }).join(" ");

  return (
    <View style={styles.wrap}>
      <Svg width={size} height={size}>
        {rings.map((f, i) => {
          const pts = Array.from({ length: n }).map((_, k) => {
            const p = point(k, radius * f);
            return `${p.x},${p.y}`;
          }).join(" ");
          return (
            <Polygon
              key={i}
              points={pts}
              fill="none"
              stroke={i === rings.length - 1 ? colors.borderSubtle : "rgba(255,255,255,0.08)"}
              strokeWidth={1}
            />
          );
        })}
        {data.map((_, i) => {
          const p = point(i, radius);
          return (
            <Line
              key={`spoke-${i}`}
              x1={cx}
              y1={cy}
              x2={p.x}
              y2={p.y}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth={1}
            />
          );
        })}
        <Polygon
          points={polygon}
          fill={color + "44"}
          stroke={color}
          strokeWidth={2}
        />
        {data.map((d, i) => {
          const max = d.max || 100;
          const r = radius * Math.max(0, Math.min(1, d.value / max));
          const p = point(i, r);
          return <Circle key={`v-${i}`} cx={p.x} cy={p.y} r={3} fill={color} />;
        })}
        {data.map((d, i) => {
          const p = point(i, radius + 18);
          return (
            <SvgText
              key={`lbl-${i}`}
              x={p.x}
              y={p.y}
              fill={colors.textSecondary}
              fontSize={9}
              textAnchor="middle"
              alignmentBaseline="middle"
            >
              {d.label}
            </SvgText>
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center" },
});
