// PLOS — Reusable Country Selector chip.
// Renders a pill button showing "🇺🇸 US" that opens a modal with country
// options. When changed, PLOS AI system prompts adapt to the new
// jurisdiction/currency automatically (backend reads the country param).
import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from "react-native";
import { Globe, Check, X } from "lucide-react-native";
import { colors, radius } from "@/src/lib/theme";
import { COUNTRIES, useCountry } from "@/src/lib/country-context";

export function CountrySelectorChip({
  homeAddress,
  onChange,
}: {
  homeAddress?: string;
  onChange?: (code: string) => void;
}) {
  const { country, countryCode, changeCountry } = useCountry(homeAddress);
  const [open, setOpen] = useState(false);

  const pick = async (code: string) => {
    await changeCountry(code);
    onChange?.(code);
    setOpen(false);
  };

  return (
    <>
      <TouchableOpacity style={styles.chip} onPress={() => setOpen(true)} testID="country-chip">
        <Globe color={colors.primaryGlow} size={12} />
        <Text style={styles.chipFlag}>{country.flag}</Text>
        <Text style={styles.chipText}>{country.code}</Text>
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>Set your country</Text>
              <TouchableOpacity onPress={() => setOpen(false)}>
                <X color={colors.textSecondary} size={20} />
              </TouchableOpacity>
            </View>
            <Text style={styles.sheetSub}>
              PLOS AI adapts legal advice, currencies, and retailer suggestions to your selected country.
            </Text>
            <ScrollView style={{ maxHeight: 400 }}>
              {COUNTRIES.map((c) => (
                <TouchableOpacity key={c.code} style={styles.row} onPress={() => pick(c.code)} testID={`country-${c.code}`}>
                  <Text style={styles.flag}>{c.flag}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName}>{c.name}</Text>
                    <Text style={styles.rowMeta}>{c.jurisdiction} · {c.currency}</Text>
                  </View>
                  {countryCode === c.code && <Check color={colors.primaryGlow} size={16} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

export function CountryContextBanner({ homeAddress }: { homeAddress?: string }) {
  const { country } = useCountry(homeAddress);
  return (
    <View style={styles.banner}>
      <Globe color={colors.primaryGlow} size={13} />
      <Text style={styles.bannerText}>
        <Text style={{ fontWeight: "700" }}>Country: {country.flag} {country.name}</Text> —
        content, jurisdiction, and currency (<Text style={{ fontWeight: "700" }}>{country.currency}</Text>) are set for this region. Tap the country chip to switch.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(59,130,246,0.15)", borderWidth: 1, borderColor: colors.primaryGlow, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 16 },
  chipFlag: { fontSize: 12 },
  chipText: { color: colors.primaryGlow, fontSize: 11, fontWeight: "700" },
  banner: { flexDirection: "row", alignItems: "flex-start", gap: 6, padding: 10, backgroundColor: "rgba(59,130,246,0.06)", borderWidth: 1, borderColor: "rgba(59,130,246,0.2)", borderRadius: 8, marginBottom: 10 },
  bannerText: { flex: 1, color: colors.textPrimary, fontSize: 11, lineHeight: 15 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "center", padding: 20 },
  sheet: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16, borderWidth: 1, borderColor: colors.borderSubtle },
  sheetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sheetTitle: { color: colors.textPrimary, fontWeight: "700", fontSize: 16 },
  sheetSub: { color: colors.textSecondary, fontSize: 12, marginTop: 6, marginBottom: 10, lineHeight: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 10, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  flag: { fontSize: 22 },
  rowName: { color: colors.textPrimary, fontWeight: "700", fontSize: 13 },
  rowMeta: { color: colors.textSecondary, fontSize: 10, marginTop: 2 },
});
