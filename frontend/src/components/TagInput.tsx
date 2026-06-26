// Tag input — comma-separated tags edited inline. Used in EditModal as 'tags' kind.
import React, { useState } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from "react-native";
import { X } from "lucide-react-native";
import { colors, spacing, radius } from "@/src/lib/theme";

interface Props {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  testID?: string;
}

export function TagInput({ values, onChange, placeholder, testID }: Props) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const t = draft.trim();
    if (!t) return;
    if (!values.includes(t)) onChange([...values, t]);
    setDraft("");
  };

  return (
    <View testID={testID}>
      <View style={styles.row}>
        {values.map((v) => (
          <View key={v} style={styles.tag}>
            <Text style={styles.tagText}>{v}</Text>
            <TouchableOpacity
              onPress={() => onChange(values.filter((x) => x !== v))}
              testID={`${testID}-remove-${v}`}
            >
              <X size={12} color={colors.primaryGlow} />
            </TouchableOpacity>
          </View>
        ))}
      </View>
      <TextInput
        style={styles.input}
        value={draft}
        onChangeText={setDraft}
        onSubmitEditing={add}
        onBlur={add}
        placeholder={placeholder || "Add tag and press enter"}
        placeholderTextColor={colors.textTertiary}
        testID={`${testID}-input`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.primaryMuted,
  },
  tagText: { color: colors.primaryGlow, fontSize: 12, fontWeight: "600" },
  input: {
    backgroundColor: colors.surfaceElevated,
    color: colors.textPrimary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    fontSize: 15,
  },
});
