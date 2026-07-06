// Compact static disclaimer text. Not a modal — just informational copy.
// Colors chosen to be readable but not alarming (soft gray).
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { spacing } from "@/src/lib/theme";

type Kind = "financial" | "legal" | "ai" | "investment";

const COPY: Record<Kind, string> = {
  financial:
    "PLOS provides general financial information for educational purposes only. This is not licensed financial advice. Consult a certified financial advisor for personalized guidance.",
  legal:
    "The information provided here is general legal information only and does not constitute legal advice. PLOS is not a law firm. For advice specific to your situation, consult a licensed attorney.",
  ai:
    "AI-generated responses are for informational purposes only. Always verify important information independently.",
  investment:
    "Investment content is educational only and does not constitute a recommendation to buy or sell any security. Past performance does not guarantee future results.",
};

export default function Disclaimer({ kind, style }: { kind: Kind; style?: any }) {
  return (
    <View style={[styles.wrap, style]} testID={`disclaimer-${kind}`}>
      <Text style={styles.text}>{COPY[kind]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  text: { color: "#6B7280", fontSize: 12, lineHeight: 16, textAlign: "left" },
});
