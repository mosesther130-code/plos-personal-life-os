// Language Translator screen
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  ArrowRightLeft,
  Volume2,
  Copy,
  Eraser,
  History,
  Book,
  WifiOff,
  Sparkles,
} from "lucide-react-native";
import * as Speech from "expo-speech";
import * as Clipboard from "expo-clipboard";

import { globalApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";

const LANGUAGES = [
  "English", "Filipino", "French", "Spanish", "Japanese",
  "Chinese Simplified", "Arabic", "German", "Korean",
  "Hindi", "Portuguese", "Swahili",
];

const LOCALE: Record<string, string> = {
  English: "en-US",
  Filipino: "fil-PH",
  French: "fr-FR",
  Spanish: "es-ES",
  Japanese: "ja-JP",
  "Chinese Simplified": "zh-CN",
  Arabic: "ar-SA",
  German: "de-DE",
  Korean: "ko-KR",
  Hindi: "hi-IN",
  Portuguese: "pt-BR",
  Swahili: "sw-KE",
};

const QUICK_PHRASES = [
  "Hello, how are you?",
  "Where is the hospital?",
  "How much does this cost?",
  "I need help",
  "Please call the police",
  "Do you speak English?",
  "Thank you very much",
  "I am lost",
  "Where is the nearest hotel?",
  "I have a medical emergency",
];

function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const update = () => setOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    update();
    if (typeof window !== "undefined") {
      window.addEventListener("online", update);
      window.addEventListener("offline", update);
      return () => {
        window.removeEventListener("online", update);
        window.removeEventListener("offline", update);
      };
    }
  }, []);
  return online;
}

export default function Translator() {
  const router = useRouter();
  const online = useOnline();
  const [source, setSource] = useState<"auto" | string>("auto");
  const [target, setTarget] = useState<string>("Filipino");
  const [text, setText] = useState("");
  const [result, setResult] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [mode, setMode] = useState<"translate" | "phrasebook">("translate");
  const [showSrcPicker, setShowSrcPicker] = useState(false);
  const [showTgtPicker, setShowTgtPicker] = useState(false);
  const [phraseBook, setPhraseBook] = useState<Record<string, any[]>>({});
  const [pbCategory, setPbCategory] = useState<string>("Emergency");

  const loadHistory = useCallback(async () => {
    try {
      const r = await globalApi.translations();
      setHistory(r.translations || []);
    } catch (_e) {}
  }, []);

  const loadPhraseBook = useCallback(async () => {
    try {
      const r = await globalApi.phraseBook();
      setPhraseBook(r.phrase_book || {});
    } catch (_e) {}
  }, []);

  useEffect(() => {
    loadHistory();
    loadPhraseBook();
  }, [loadHistory, loadPhraseBook]);

  const swap = () => {
    if (source === "auto") return;
    const a = source;
    setSource(target);
    setTarget(a);
  };

  const translate = async (override?: string) => {
    const txt = override ?? text;
    if (!txt.trim() || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const r = await globalApi.translate(txt, target, source === "auto" ? undefined : source);
      setResult(r);
      if (override) setText(override);
      await loadHistory();
    } catch (e: any) {
      Alert.alert("Translation failed", e?.message || "Try again later.");
    }
    setBusy(false);
  };

  const speak = async (txt: string, lang: string) => {
    try {
      const locale = LOCALE[lang] || "en-US";
      const voices = await Speech.getAvailableVoicesAsync();
      const has = voices?.some?.(
        (v: any) => v.language?.toLowerCase().startsWith(locale.toLowerCase().split("-")[0])
      );
      if (!has && voices && voices.length > 0) {
        Alert.alert(
          "Voice not available",
          `Voice not available for ${lang} on your device — download it in your device language settings.`
        );
        return;
      }
      Speech.stop();
      Speech.speak(txt, { language: locale, rate: 0.95 });
    } catch (_e) {}
  };

  const copy = async (txt: string) => {
    try {
      await Clipboard.setStringAsync(txt);
      if (Platform.OS === "android") Alert.alert("Copied");
    } catch (_e) {}
  };

  const clear = () => {
    setText("");
    setResult(null);
  };

  const restoreHistory = (h: any) => {
    setText(h.source_text);
    setTarget(h.target_language);
    setSource(h.source_language || "auto");
    setResult(h);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} testID="trans-back">
          <ArrowLeft color={colors.textPrimary} size={20} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Translator</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Mode toggle */}
      <View style={styles.modeRow}>
        <TouchableOpacity
          onPress={() => setMode("translate")}
          style={[styles.modeBtn, mode === "translate" && styles.modeBtnActive]}
          testID="mode-translate"
        >
          <Sparkles size={12} color={mode === "translate" ? colors.primaryGlow : colors.textSecondary} />
          <Text style={[styles.modeText, mode === "translate" && { color: colors.primaryGlow }]}>Translate</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setMode("phrasebook")}
          style={[styles.modeBtn, mode === "phrasebook" && styles.modeBtnActive]}
          testID="mode-phrasebook"
        >
          <Book size={12} color={mode === "phrasebook" ? colors.primaryGlow : colors.textSecondary} />
          <Text style={[styles.modeText, mode === "phrasebook" && { color: colors.primaryGlow }]}>Phrase Book</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {!online && (
          <View style={styles.offlineBanner} testID="trans-offline-banner">
            <WifiOff size={12} color={colors.warning} />
            <Text style={styles.offlineText}>
              Offline — showing your last 20 translations from history. New translations unavailable.
            </Text>
          </View>
        )}

        {mode === "translate" ? (
          <>
            {/* Language bar */}
            <View style={styles.langBar}>
              <TouchableOpacity style={styles.langChip} onPress={() => setShowSrcPicker((s) => !s)} testID="src-lang">
                <Text style={styles.langText}>{source === "auto" ? "Auto-detect" : source}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={swap} style={styles.swapBtn} testID="lang-swap">
                <ArrowRightLeft color={colors.primaryGlow} size={16} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.langChip} onPress={() => setShowTgtPicker((s) => !s)} testID="tgt-lang">
                <Text style={styles.langText}>{target}</Text>
              </TouchableOpacity>
            </View>

            {/* Pickers */}
            {showSrcPicker && (
              <View style={styles.picker}>
                <TouchableOpacity onPress={() => { setSource("auto"); setShowSrcPicker(false); }} style={styles.pickerItem}>
                  <Text style={styles.pickerText}>Auto-detect</Text>
                </TouchableOpacity>
                {LANGUAGES.map((l) => (
                  <TouchableOpacity key={l} onPress={() => { setSource(l); setShowSrcPicker(false); }} style={styles.pickerItem} testID={`src-${l}`}>
                    <Text style={styles.pickerText}>{l}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {showTgtPicker && (
              <View style={styles.picker}>
                {LANGUAGES.map((l) => (
                  <TouchableOpacity key={l} onPress={() => { setTarget(l); setShowTgtPicker(false); }} style={styles.pickerItem} testID={`tgt-${l}`}>
                    <Text style={styles.pickerText}>{l}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Input */}
            <View style={styles.inputCard}>
              <TextInput
                value={text}
                onChangeText={(t) => setText(t.slice(0, 5000))}
                placeholder="Type or paste text to translate…"
                placeholderTextColor={colors.textTertiary}
                style={styles.inputText}
                multiline
                testID="trans-input"
              />
              <Text style={styles.counter}>{text.length} / 5000</Text>
              {result?.detected_language && (
                <Text style={styles.detected} testID="detected-lang">Detected: {result.detected_language}</Text>
              )}
            </View>

            {/* Output */}
            {(busy || result) && (
              <View style={styles.outputCard} testID="trans-output">
                {busy ? (
                  <ActivityIndicator color={colors.primaryGlow} />
                ) : (
                  <Text style={styles.outputText} selectable>{result?.translated_text}</Text>
                )}
                {result?.target_language && (
                  <Text style={styles.outputLang}>{result.target_language}</Text>
                )}
              </View>
            )}

            {/* Actions */}
            <View style={styles.actions}>
              <TouchableOpacity style={styles.actionPrimary} onPress={() => translate()} disabled={busy || !text.trim() || !online} testID="trans-go">
                {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.actionPrimaryText}>Translate</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionGhost}
                onPress={() => result?.translated_text && copy(result.translated_text)}
                disabled={!result}
                testID="trans-copy"
              >
                <Copy size={14} color={colors.primaryGlow} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionGhost}
                onPress={() => result?.translated_text && speak(result.translated_text, result.target_language)}
                disabled={!result}
                testID="trans-listen"
              >
                <Volume2 size={14} color={colors.primaryGlow} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionGhost} onPress={clear} testID="trans-clear">
                <Eraser size={14} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Quick phrases */}
            <Text style={styles.sectionLabel}>Quick Phrases</Text>
            <View style={styles.chipsWrap}>
              {QUICK_PHRASES.map((p) => (
                <TouchableOpacity
                  key={p}
                  style={styles.chip}
                  onPress={() => translate(p)}
                  disabled={!online}
                  testID={`quick-${p.slice(0, 12)}`}
                >
                  <Text style={styles.chipText}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* History */}
            {history.length > 0 && (
              <>
                <View style={styles.sectionRow}>
                  <Text style={styles.sectionLabel}>
                    <History size={11} color={colors.textTertiary} /> Recent Translations
                  </Text>
                  <TouchableOpacity onPress={async () => { await globalApi.clearTranslations(); loadHistory(); }} testID="clear-history">
                    <Text style={styles.clearText}>Clear</Text>
                  </TouchableOpacity>
                </View>
                {history.slice(0, 10).map((h) => (
                  <TouchableOpacity key={h.translation_id} style={styles.histCard} onPress={() => restoreHistory(h)} testID={`hist-${h.translation_id}`}>
                    <View style={styles.histHead}>
                      <Text style={styles.histLang}>{h.source_language} → {h.target_language}</Text>
                    </View>
                    <Text style={styles.histSource} numberOfLines={2}>{h.source_text}</Text>
                    <Text style={styles.histTranslated} numberOfLines={2}>{h.translated_text}</Text>
                  </TouchableOpacity>
                ))}
              </>
            )}
          </>
        ) : (
          <>
            {/* Phrase book */}
            <Text style={styles.intro}>
              Tap any row to hear all 4 pronunciations.
            </Text>
            <View style={styles.catRow}>
              {Object.keys(phraseBook).map((c) => (
                <TouchableOpacity
                  key={c}
                  onPress={() => setPbCategory(c)}
                  style={[styles.catPill, pbCategory === c && styles.catPillActive]}
                  testID={`cat-${c}`}
                >
                  <Text style={[styles.catText, pbCategory === c && { color: colors.primaryGlow }]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.tableHead}>
              <Text style={[styles.thCell, { flex: 2 }]}>English</Text>
              <Text style={[styles.thCell, { flex: 2 }]}>Filipino</Text>
              <Text style={[styles.thCell, { flex: 2 }]}>French</Text>
              <Text style={[styles.thCell, { flex: 2 }]}>Spanish</Text>
            </View>
            {(phraseBook[pbCategory] || []).map((row, i) => (
              <TouchableOpacity
                key={i}
                style={styles.tableRow}
                testID={`pb-row-${pbCategory}-${i}`}
                onPress={async () => {
                  await speak(row.English, "English");
                  setTimeout(() => speak(row.Filipino, "Filipino"), 1200);
                  setTimeout(() => speak(row.French, "French"), 2600);
                  setTimeout(() => speak(row.Spanish, "Spanish"), 4000);
                }}
              >
                <Text style={[styles.tdCell, { flex: 2 }]}>{row.English}</Text>
                <Text style={[styles.tdCell, { flex: 2 }]}>{row.Filipino}</Text>
                <Text style={[styles.tdCell, { flex: 2 }]}>{row.French}</Text>
                <Text style={[styles.tdCell, { flex: 2 }]}>{row.Spanish}</Text>
              </TouchableOpacity>
            ))}
          </>
        )}
        <View style={{ height: 80 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  backBtn: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.surfaceElevated, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  modeRow: { flexDirection: "row", gap: 6, paddingHorizontal: spacing.xl, marginBottom: spacing.sm },
  modeBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8, borderRadius: radius.sm, backgroundColor: colors.surfaceElevated },
  modeBtnActive: { backgroundColor: colors.primaryMuted },
  modeText: { color: colors.textSecondary, fontWeight: "700", fontSize: 12 },

  scroll: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl, gap: spacing.md },
  offlineBanner: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(245,158,11,0.10)", borderColor: "rgba(245,158,11,0.30)", borderWidth: 1, padding: spacing.sm, borderRadius: radius.sm },
  offlineText: { color: colors.warning, fontSize: 11, flex: 1 },

  langBar: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  langChip: { flex: 1, backgroundColor: colors.surfaceElevated, paddingVertical: 12, borderRadius: radius.md, alignItems: "center" },
  langText: { color: colors.textPrimary, fontWeight: "700", fontSize: 13 },
  swapBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primaryMuted, alignItems: "center", justifyContent: "center" },
  picker: { backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1, borderRadius: radius.md, padding: 4 },
  pickerItem: { paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.sm },
  pickerText: { color: colors.textPrimary, fontSize: 13 },

  inputCard: { backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1, borderRadius: radius.lg, padding: spacing.md },
  inputText: { color: colors.textPrimary, fontSize: 15, minHeight: 90 },
  counter: { color: colors.textTertiary, fontSize: 10, textAlign: "right", marginTop: 4 },
  detected: { color: colors.primaryGlow, fontSize: 11, marginTop: 2 },

  outputCard: { backgroundColor: "rgba(168,85,247,0.10)", borderColor: "rgba(168,85,247,0.35)", borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, minHeight: 60 },
  outputText: { color: colors.textPrimary, fontSize: 15, lineHeight: 21 },
  outputLang: { color: "#C084FC", fontSize: 10, fontWeight: "700", letterSpacing: 1, marginTop: 6, textTransform: "uppercase" },

  actions: { flexDirection: "row", gap: spacing.sm },
  actionPrimary: { flex: 1, backgroundColor: colors.primary, paddingVertical: 12, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  actionPrimaryText: { color: "#fff", fontWeight: "700" },
  actionGhost: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.surfaceElevated, alignItems: "center", justifyContent: "center" },

  sectionLabel: { color: colors.textTertiary, fontSize: 11, fontWeight: "700", letterSpacing: 1.5, textTransform: "uppercase", marginTop: spacing.lg },
  sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.lg },
  clearText: { color: colors.primaryGlow, fontSize: 11, fontWeight: "700" },

  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.sm, backgroundColor: colors.surfaceElevated },
  chipText: { color: colors.textPrimary, fontSize: 12 },

  histCard: { backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: 4 },
  histHead: { flexDirection: "row", justifyContent: "space-between" },
  histLang: { color: colors.textTertiary, fontSize: 10, fontWeight: "700", letterSpacing: 1 },
  histSource: { color: colors.textPrimary, fontSize: 12 },
  histTranslated: { color: "#C084FC", fontSize: 12 },

  intro: { color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  catRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  catPill: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.sm, backgroundColor: colors.surfaceElevated },
  catPillActive: { backgroundColor: colors.primaryMuted },
  catText: { color: colors.textSecondary, fontSize: 12, fontWeight: "700" },
  tableHead: { flexDirection: "row", backgroundColor: colors.surfaceElevated, padding: spacing.sm, borderRadius: radius.sm },
  thCell: { color: colors.textTertiary, fontSize: 10, fontWeight: "700", letterSpacing: 1 },
  tableRow: { flexDirection: "row", backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1, borderRadius: radius.sm, padding: spacing.sm },
  tdCell: { color: colors.textPrimary, fontSize: 11, paddingHorizontal: 2 },
});
