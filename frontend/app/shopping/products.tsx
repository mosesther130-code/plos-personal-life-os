// Registered Products — manual product registration for recall monitoring.
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Plus, Package, Trash2, X, Save } from "lucide-react-native";
import { shoppingApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";

const CATEGORIES = ["electronics", "appliance", "auto", "baby", "food", "other"];

export default function Products() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [category, setCategory] = useState("electronics");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await shoppingApi.registered();
      setItems(r?.products || []);
    } catch (_e) {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const reset = () => { setName(""); setBrand(""); setModel(""); setCategory("electronics"); };

  const create = async () => {
    if (!name.trim()) { Alert.alert("Required", "Enter a product name."); return; }
    setSaving(true);
    try {
      const created = await shoppingApi.registerProduct({ name: name.trim(), brand: brand.trim() || undefined, model: model.trim() || undefined, category });
      setItems((prev) => [created, ...prev]);
      setModal(false);
      reset();
    } catch (_e) {
      Alert.alert("Failed", "Could not register product.");
    }
    setSaving(false);
  };

  const removeItem = (id: string) => {
    const performRemove = async () => {
      try {
        await shoppingApi.unregisterProduct(id);
        setItems((prev) => prev.filter((p) => p.product_id !== id));
      } catch (_e) {}
    };
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm("Remove product? You won’t receive recall alerts for it anymore.")) {
        performRemove();
      }
      return;
    }
    Alert.alert("Remove product?", "You won’t receive recall alerts for it anymore.", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: performRemove },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} testID="products-back">
          <ArrowLeft color={colors.textPrimary} size={20} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Registered Products</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => setModal(true)} testID="products-add">
          <Plus color={colors.textPrimary} size={20} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.intro}>
          Track appliances, electronics, vehicles, and other products. PLOS cross-checks recall feeds (CPSC, FDA, NHTSA) for matches.
        </Text>

        {loading ? (
          <ActivityIndicator color={colors.primaryGlow} style={{ marginTop: 40 }} />
        ) : items.length === 0 ? (
          <View style={styles.empty}>
            <Package size={28} color={colors.textTertiary} />
            <Text style={styles.emptyText}>No registered products yet</Text>
            <Text style={styles.emptySub}>Tap + to add your first product</Text>
          </View>
        ) : (
          items.map((p) => (
            <View key={p.product_id} style={styles.card} testID={`product-${p.product_id}`}>
              <View style={styles.iconBox}><Package size={18} color={colors.primaryGlow} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{p.name}</Text>
                <Text style={styles.sub}>
                  {[p.brand, p.model].filter(Boolean).join(" · ") || "—"}
                </Text>
                <View style={styles.catPill}><Text style={styles.catText}>{p.category}</Text></View>
              </View>
              <TouchableOpacity onPress={() => removeItem(p.product_id)} testID={`del-${p.product_id}`} style={styles.delBtn}>
                <Trash2 size={14} color={colors.danger} />
              </TouchableOpacity>
            </View>
          ))
        )}
        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal visible={modal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModal(false)}>
        <SafeAreaView style={styles.container} edges={["top"]}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardLabel}>NEW PRODUCT</Text>
              <Text style={styles.modalTitle}>Register a product</Text>
            </View>
            <TouchableOpacity style={styles.backBtn} onPress={() => setModal(false)} testID="add-close">
              <X color={colors.textPrimary} size={20} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <Text style={styles.fieldLabel}>Product Name *</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. RAV4 2015" placeholderTextColor={colors.textTertiary} testID="f-name" />
            <Text style={styles.fieldLabel}>Brand</Text>
            <TextInput style={styles.input} value={brand} onChangeText={setBrand} placeholder="e.g. Toyota" placeholderTextColor={colors.textTertiary} testID="f-brand" />
            <Text style={styles.fieldLabel}>Model / Serial</Text>
            <TextInput style={styles.input} value={model} onChangeText={setModel} placeholder="e.g. RAV4 LE AWD" placeholderTextColor={colors.textTertiary} testID="f-model" />
            <Text style={styles.fieldLabel}>Category</Text>
            <View style={styles.chipsRow}>
              {CATEGORIES.map((c) => (
                <TouchableOpacity key={c} onPress={() => setCategory(c)} style={[styles.chip, category === c && styles.chipActive]} testID={`cat-${c}`}>
                  <Text style={[styles.chipText, category === c && styles.chipTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={create} disabled={saving} testID="f-save">
              {saving ? <ActivityIndicator color="#fff" /> : <><Save color="#fff" size={14} /><Text style={styles.saveBtnText}>Register Product</Text></>}
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  backBtn: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.surfaceElevated, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  scroll: { padding: spacing.xl, gap: spacing.md },
  intro: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  empty: { alignItems: "center", padding: spacing.xxxl, gap: spacing.sm },
  emptyText: { color: colors.textSecondary, fontSize: 14 },
  emptySub: { color: colors.textTertiary, fontSize: 12 },
  card: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg },
  iconBox: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.primaryMuted, alignItems: "center", justifyContent: "center" },
  name: { color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
  sub: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  catPill: { alignSelf: "flex-start", backgroundColor: colors.bg, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3, marginTop: 6 },
  catText: { color: colors.textTertiary, fontSize: 10, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
  delBtn: { padding: 8, borderRadius: radius.sm, backgroundColor: colors.dangerBg },
  modalHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  cardLabel: { color: colors.textTertiary, fontSize: 10, fontWeight: "700", letterSpacing: 1.2 },
  modalTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700", marginTop: 2 },
  fieldLabel: { color: colors.textTertiary, fontSize: 11, fontWeight: "700", letterSpacing: 1, marginTop: spacing.md },
  input: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, color: colors.textPrimary, fontSize: 15, borderWidth: 1, borderColor: colors.borderSubtle, marginTop: 6 },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderSubtle },
  chipActive: { backgroundColor: colors.primaryMuted, borderColor: colors.primaryGlow },
  chipText: { color: colors.textSecondary, fontSize: 11, fontWeight: "600" },
  chipTextActive: { color: colors.primaryGlow },
  saveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.primary, paddingVertical: 14, borderRadius: radius.lg, marginTop: spacing.xl },
  saveBtnText: { color: "#fff", fontWeight: "700" },
});
