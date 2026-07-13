// PLOS — Reusable Country Selector chip (searchable typeahead for 195+ countries).
import React, { useState, useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal, FlatList, TextInput, Keyboard } from "react-native";
import { Globe, Check, X, Search } from "lucide-react-native";
import { colors, radius } from "@/src/lib/theme";
import { COUNTRIES, useCountry, type CountryOption } from "@/src/lib/country-context";

export function CountrySelectorChip({
  homeAddress,
  onChange,
}: {
  homeAddress?: string;
  onChange?: (code: string) => void;
}) {
  const { country, countryCode, changeCountry } = useCountry(homeAddress);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const results = useMemo<CountryOption[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      c.code.toLowerCase().includes(q) ||
      c.currency.toLowerCase().includes(q)
    );
  }, [query]);

  const pick = async (code: string) => {
    Keyboard.dismiss();
    await changeCountry(code);
    onChange?.(code);
    setOpen(false);
    setQuery("");
  };

  return (
    <>
      <TouchableOpacity style={styles.chip} onPress={() => setOpen(true)} testID="country-chip">
        <Globe color={colors.primaryGlow} size={12} />
        <Text style={styles.chipFlag}>{country.flag}</Text>
        <Text style={styles.chipText}>{country.code}</Text>
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>Set your country</Text>
              <TouchableOpacity onPress={() => { setOpen(false); setQuery(""); }} testID="country-close">
                <X color={colors.textSecondary} size={20} />
              </TouchableOpacity>
            </View>
            <Text style={styles.sheetSub}>
              PLOS AI adapts legal advice, currencies, and retailer suggestions to your selected country.
            </Text>
            <View style={styles.searchWrap}>
              <Search size={14} color={colors.textTertiary} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search 195+ countries…"
                placeholderTextColor={colors.textTertiary}
                style={styles.searchInput}
                autoCorrect={false}
                autoCapitalize="none"
                testID="country-search"
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => setQuery("")}>
                  <X size={14} color={colors.textTertiary} />
                </TouchableOpacity>
              )}
            </View>
            <FlatList
              data={results}
              keyExtractor={(item) => item.code}
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: 460 }}
              initialNumToRender={20}
              maxToRenderPerBatch={30}
              windowSize={10}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Text style={styles.emptyText}>No countries match “{query}”.</Text>
                </View>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.row, countryCode === item.code && styles.rowActive]}
                  onPress={() => pick(item.code)}
                  testID={`country-${item.code}`}
                >
                  <Text style={styles.flag}>{item.flag}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName}>{item.name}</Text>
                    <Text style={styles.rowMeta}>{item.code} · {item.currency} · {item.jurisdiction}</Text>
                  </View>
                  {countryCode === item.code && <Check color={colors.primaryGlow} size={16} />}
                </TouchableOpacity>
              )}
            />
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
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: 16, borderWidth: 1, borderColor: colors.borderSubtle, maxHeight: "85%" },
  sheetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sheetTitle: { color: colors.textPrimary, fontWeight: "700", fontSize: 16 },
  sheetSub: { color: colors.textSecondary, fontSize: 12, marginTop: 6, marginBottom: 10, lineHeight: 16 },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10 },
  searchInput: { flex: 1, color: colors.textPrimary, fontSize: 14, paddingVertical: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 10, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  rowActive: { backgroundColor: "rgba(59,130,246,0.08)" },
  flag: { fontSize: 22 },
  rowName: { color: colors.textPrimary, fontWeight: "700", fontSize: 13 },
  rowMeta: { color: colors.textSecondary, fontSize: 10, marginTop: 2 },
  empty: { padding: 24, alignItems: "center" },
  emptyText: { color: colors.textTertiary, fontSize: 13 },
});
