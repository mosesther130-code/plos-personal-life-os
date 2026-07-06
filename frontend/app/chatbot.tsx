// AI Life Advisor Chatbot — central PLOS intelligence.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
  Alert,
  Animated,
  Easing,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import {
  ArrowLeft,
  Send,
  Brain,
  History,
  SlidersHorizontal,
  Copy as CopyIcon,
  Mic,
  MicOff,
  Paperclip,
  X,
  Trash2,
  Search,
  Check,
  Scale,
  Wallet,
  Briefcase,
  Plane,
  Sparkles,
  Plus,
} from "lucide-react-native";

import { aiApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";

// Helper: Alert.alert is a silent no-op on react-native-web; fall back to window.alert.
function notify(title: string, message?: string) {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.alert(message ? `${title}\n\n${message}` : title);
  } else {
    Alert.alert(title, message);
  }
}

type Mode = "general" | "legal" | "financial" | "career" | "travel";

interface Msg {
  id: string;
  role: "user" | "assistant";
  content: string;
  mode?: string;
  created_at?: string;
}

const QUICK_ACTIONS = [
  "Analyze my finances today",
  "Am I on track for retirement?",
  "Should I refinance my mortgage?",
  "What job should I apply to next?",
  "How do I improve my credit score?",
  "What business should I start?",
  "Is my debt payoff plan optimal?",
  "Review my investment strategy",
];

const MODE_META: Record<Mode, { label: string; icon: any; color: string; description: string }> = {
  general: { label: "Life Advisor", icon: Brain, color: colors.primaryGlow, description: "Balanced PLOS advisor across all life areas." },
  legal: { label: "Legal Advisor", icon: Scale, color: "#A855F7", description: "Focused legal guidance — always includes attorney disclaimer." },
  financial: { label: "Financial Planner", icon: Wallet, color: colors.success, description: "Detailed calculations: mortgage, debt payoff, retirement, taxes." },
  career: { label: "Career Coach", icon: Briefcase, color: colors.warning, description: "Resume writing, interview prep, salary negotiation." },
  travel: { label: "Travel Planner", icon: Plane, color: "#06B6D4", description: "Destinations, visas, packing lists, itineraries." },
};

// ---------- Lightweight markdown renderer ----------
function renderInline(text: string, baseStyle: any, key: string) {
  // Handle **bold**, *italic*, `code`
  const parts: any[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      parts.push(<Text key={`${key}-${i++}`} style={baseStyle}>{text.slice(last, m.index)}</Text>);
    }
    const token = m[1];
    if (token.startsWith("**")) {
      parts.push(<Text key={`${key}-${i++}`} style={[baseStyle, { fontWeight: "700" }]}>{token.slice(2, -2)}</Text>);
    } else if (token.startsWith("`")) {
      parts.push(<Text key={`${key}-${i++}`} style={[baseStyle, styles.inlineCode]}>{token.slice(1, -1)}</Text>);
    } else {
      parts.push(<Text key={`${key}-${i++}`} style={[baseStyle, { fontStyle: "italic" }]}>{token.slice(1, -1)}</Text>);
    }
    last = m.index + token.length;
  }
  if (last < text.length) parts.push(<Text key={`${key}-${i++}`} style={baseStyle}>{text.slice(last)}</Text>);
  return parts;
}

function MarkdownText({ text, baseStyle }: { text: string; baseStyle: any }) {
  const lines = (text || "").split("\n");
  return (
    <View>
      {lines.map((line, idx) => {
        const t = line.replace(/\s+$/, "");
        // Heading
        if (/^#{1,3}\s/.test(t)) {
          const level = (t.match(/^#+/) || [""])[0].length;
          const content = t.replace(/^#+\s/, "");
          const sz = level === 1 ? 17 : level === 2 ? 15 : 14;
          return (
            <Text key={idx} style={[baseStyle, { fontSize: sz, fontWeight: "700", marginTop: idx === 0 ? 0 : 8, marginBottom: 4 }]}>
              {renderInline(content, [baseStyle, { fontSize: sz, fontWeight: "700" }], `h-${idx}`)}
            </Text>
          );
        }
        // Numbered list
        const num = t.match(/^(\d+)\.\s+(.+)$/);
        if (num) {
          return (
            <View key={idx} style={styles.listRow}>
              <Text style={[baseStyle, { fontWeight: "700", width: 22 }]}>{num[1]}.</Text>
              <Text style={[baseStyle, { flex: 1 }]}>{renderInline(num[2], baseStyle, `n-${idx}`)}</Text>
            </View>
          );
        }
        // Bullet list
        const bul = t.match(/^[-•*]\s+(.+)$/);
        if (bul) {
          return (
            <View key={idx} style={styles.listRow}>
              <Text style={[baseStyle, { width: 14, color: colors.primaryGlow }]}>•</Text>
              <Text style={[baseStyle, { flex: 1 }]}>{renderInline(bul[1], baseStyle, `b-${idx}`)}</Text>
            </View>
          );
        }
        if (t === "") return <View key={idx} style={{ height: 6 }} />;
        return (
          <Text key={idx} style={[baseStyle, { marginTop: idx === 0 ? 0 : 2 }]}>
            {renderInline(t, baseStyle, `l-${idx}`)}
          </Text>
        );
      })}
    </View>
  );
}

// ---------- Animated thinking dots ----------
function ThinkingDots() {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(a, { toValue: 1, duration: 600, useNativeDriver: true, easing: Easing.linear }),
        Animated.timing(a, { toValue: 0, duration: 600, useNativeDriver: true, easing: Easing.linear }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [a]);
  const op = (delay: number) => a.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1], extrapolate: "clamp" });
  return (
    <View style={styles.dotsRow}>
      <Animated.View style={[styles.dot, { opacity: op(0) }]} />
      <Animated.View style={[styles.dot, { opacity: op(0.2), transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [0, -2] }) }] }]} />
      <Animated.View style={[styles.dot, { opacity: op(0.4) }]} />
    </View>
  );
}

// ---------- Web Speech API helper ----------
function getWebSpeechRecognition(): any {
  if (Platform.OS !== "web") return null;
  if (typeof window === "undefined") return null;
  const w: any = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export default function Chatbot() {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [mode, setMode] = useState<Mode>("general");
  const [modeOpen, setModeOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [conversations, setConversations] = useState<any[]>([]);
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);
  const scrollRef = useRef<ScrollView>(null);

  const ModeIcon = MODE_META[mode].icon;
  const modeColor = MODE_META[mode].color;

  const startGreeting = useMemo<Msg>(
    () => ({
      id: "intro",
      role: "assistant",
      content:
        "Hi — I'm your **AI Life Advisor**. I have your full PLOS data on hand: income, expenses, debts, career, investments, trips, health. Ask me anything, or tap a quick action below.",
    }),
    [],
  );

  useEffect(() => {
    setMessages([startGreeting]);
  }, [startGreeting]);

  const loadConversations = useCallback(async () => {
    try {
      const r = await aiApi.conversations();
      setConversations(r?.conversations || []);
    } catch (_e) {}
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  useEffect(() => {
    if (searchQ.trim().length < 2) { setSearchResults([]); return; }
    const handle = setTimeout(async () => {
      try {
        const r = await aiApi.searchMessages(searchQ.trim());
        setSearchResults(r?.results || []);
      } catch (_e) {}
    }, 300);
    return () => clearTimeout(handle);
  }, [searchQ]);

  const scrollToBottom = () => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);

  const sendWithText = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setInput("");
    const userMsg: Msg = { id: `u-${Date.now()}`, role: "user", content: trimmed, mode };
    setMessages((m) => [...m, userMsg]);
    setLoading(true);
    scrollToBottom();
    try {
      const res = await aiApi.chat(trimmed, sessionId, mode);
      setSessionId(res.session_id);
      setMessages((m) => [
        ...m,
        { id: `a-${Date.now()}`, role: "assistant", content: res.response, mode },
      ]);
      loadConversations();
    } catch (_e) {
      setMessages((m) => [
        ...m,
        { id: `e-${Date.now()}`, role: "assistant", content: "I couldn't reach Claude. Please try again." },
      ]);
    }
    setLoading(false);
    scrollToBottom();
  };

  const send = () => sendWithText(input);

  const copyMessage = async (msg: Msg) => {
    try {
      await Clipboard.setStringAsync(msg.content);
      setCopiedId(msg.id);
      setTimeout(() => setCopiedId((c) => (c === msg.id ? null : c)), 1500);
    } catch (_e) {}
  };

  const newChat = () => {
    setSessionId(undefined);
    setMessages([startGreeting]);
    setMode("general");
  };

  const loadConversation = async (sid: string) => {
    setHistoryOpen(false);
    try {
      const history = await aiApi.chatHistory(sid);
      const mapped: Msg[] = (history || []).map((m: any, i: number) => ({
        id: `${sid}-${i}`,
        role: m.role,
        content: m.content,
        mode: m.mode,
        created_at: m.created_at,
      }));
      setMessages(mapped.length ? mapped : [startGreeting]);
      setSessionId(sid);
      // Restore the last-used mode from history
      const lastMode = (mapped[mapped.length - 1]?.mode as Mode) || "general";
      if (MODE_META[lastMode]) setMode(lastMode);
      scrollToBottom();
    } catch (_e) {}
  };

  const deleteConversation = (sid: string) => {
    const proceed = async () => {
      try {
        await aiApi.deleteConversation(sid);
        if (sessionId === sid) newChat();
        await loadConversations();
      } catch (_e) {}
    };
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm("Delete this conversation?")) proceed();
      return;
    }
    Alert.alert("Delete conversation?", "All messages in this thread will be removed.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: proceed },
    ]);
  };

  const clearAll = () => {
    const proceed = async () => {
      try {
        await aiApi.clearAllConversations();
        newChat();
        await loadConversations();
      } catch (_e) {}
    };
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm("Clear ALL conversations? This cannot be undone.")) proceed();
      return;
    }
    Alert.alert("Clear all history?", "All conversations and messages will be deleted.", [
      { text: "Cancel", style: "cancel" },
      { text: "Clear All", style: "destructive", onPress: proceed },
    ]);
  };

  const toggleVoice = () => {
    const SR = getWebSpeechRecognition();
    if (!SR) {
      notify("Voice unavailable", "Voice input requires Chrome / Edge browser on web. On mobile native, this will be wired up in a future build.");
      return;
    }
    if (listening) {
      try { recRef.current?.stop(); } catch (_e) {}
      setListening(false);
      return;
    }
    try {
      const rec = new SR();
      rec.lang = "en-US";
      rec.continuous = false;
      rec.interimResults = true;
      rec.onresult = (event: any) => {
        const text = Array.from(event.results).map((r: any) => r[0].transcript).join(" ");
        setInput(text);
      };
      rec.onerror = () => setListening(false);
      rec.onend = () => setListening(false);
      rec.start();
      recRef.current = rec;
      setListening(true);
    } catch (_e) {
      setListening(false);
    }
  };

  const showAttachmentNotice = () =>
    notify("Attachments coming soon", "Document and photo analysis will be wired up in the next iteration.");

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} testID="chatbot-back">
          <ArrowLeft color={colors.textPrimary} size={20} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={[styles.brainBubble, { backgroundColor: modeColor + "22", borderColor: modeColor }]}>
            <Brain size={16} color={modeColor} />
          </View>
          <View>
            <Text style={styles.headerTitle}>AI Life Advisor</Text>
            <View style={styles.statusRow}>
              <View style={styles.dot} />
              <Text style={styles.statusText}>Online · {MODE_META[mode].label}</Text>
            </View>
            <Text style={{ color: "#6B7280", fontSize: 10, marginTop: 2, maxWidth: 220 }}>
              AI-generated · Verify important info independently.
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 6 }}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => setModeOpen(true)} testID="chatbot-mode">
            <SlidersHorizontal color={colors.textPrimary} size={18} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => setHistoryOpen(true)} testID="chatbot-history">
            <History color={colors.textPrimary} size={18} />
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.messages}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {messages.map((m) => (
            <View key={m.id} style={[styles.msgRow, m.role === "user" ? styles.msgRowUser : styles.msgRowAI]}>
              {m.role === "assistant" && (
                <View style={[styles.aiBubbleIcon, { backgroundColor: modeColor + "22", borderColor: modeColor }]}>
                  <Brain size={12} color={modeColor} />
                </View>
              )}
              <View style={[styles.bubble, m.role === "user" ? styles.bubbleUser : styles.bubbleAI]}>
                <MarkdownText text={m.content} baseStyle={m.role === "user" ? styles.bubbleTextUser : styles.bubbleTextAI} />
                {m.role === "assistant" && m.id !== "intro" && (
                  <TouchableOpacity style={styles.copyBtn} onPress={() => copyMessage(m)} testID={`copy-${m.id}`}>
                    {copiedId === m.id ? (
                      <><Check size={12} color={colors.success} /><Text style={[styles.copyText, { color: colors.success }]}>Copied</Text></>
                    ) : (
                      <><CopyIcon size={12} color={colors.textTertiary} /><Text style={styles.copyText}>Copy</Text></>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}
          {loading && (
            <View style={[styles.msgRow, styles.msgRowAI]}>
              <View style={[styles.aiBubbleIcon, { backgroundColor: modeColor + "22", borderColor: modeColor }]}>
                <Brain size={12} color={modeColor} />
              </View>
              <View style={[styles.bubble, styles.bubbleAI, { paddingVertical: 14 }]}>
                <ThinkingDots />
              </View>
            </View>
          )}
        </ScrollView>

        {/* Quick action chips (show only on first message) */}
        {messages.length <= 1 && !loading && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            {QUICK_ACTIONS.map((q, i) => (
              <TouchableOpacity key={i} style={styles.chip} onPress={() => sendWithText(q)} testID={`quick-${i}`} activeOpacity={0.85}>
                <Sparkles size={11} color={colors.primaryGlow} />
                <Text style={styles.chipText}>{q}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Composer */}
        <View style={styles.composer}>
          <TouchableOpacity style={styles.composerBtn} onPress={showAttachmentNotice} testID="attach-btn" hitSlop={6}>
            <Paperclip size={18} color={colors.textTertiary} />
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Ask anything about your life…"
            placeholderTextColor={colors.textTertiary}
            onSubmitEditing={send}
            returnKeyType="send"
            multiline
            testID="chatbot-input"
          />
          <TouchableOpacity style={[styles.composerBtn, listening && { backgroundColor: colors.dangerBg }]} onPress={toggleVoice} testID="mic-btn" hitSlop={6}>
            {listening ? <MicOff size={18} color={colors.danger} /> : <Mic size={18} color={colors.textTertiary} />}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() || loading) && { opacity: 0.5 }]}
            onPress={send}
            disabled={!input.trim() || loading}
            testID="chatbot-send"
          >
            {loading ? <ActivityIndicator color="#fff" size="small" /> : <Send size={16} color="#fff" />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Mode picker */}
      <Modal visible={modeOpen} animationType="slide" transparent onRequestClose={() => setModeOpen(false)}>
        <View style={styles.modalBackdrop}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setModeOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Specialized modes</Text>
            <Text style={styles.sheetHint}>Pick a focus area. The advisor adapts its system prompt for sharper answers.</Text>
            {(Object.keys(MODE_META) as Mode[]).map((k) => {
              const M = MODE_META[k];
              const Icon = M.icon;
              const active = mode === k;
              return (
                <TouchableOpacity
                  key={k}
                  style={[styles.modeRow, active && { borderColor: M.color, backgroundColor: M.color + "12" }]}
                  onPress={() => { setMode(k); setModeOpen(false); }}
                  testID={`mode-${k}`}
                  activeOpacity={0.85}
                >
                  <View style={[styles.modeIcon, { backgroundColor: M.color + "22", borderColor: M.color }]}>
                    <Icon size={16} color={M.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modeTitle}>{M.label}</Text>
                    <Text style={styles.modeDesc}>{M.description}</Text>
                  </View>
                  {active ? <Check size={16} color={M.color} /> : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Modal>

      {/* History drawer */}
      <Modal visible={historyOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setHistoryOpen(false)}>
        <SafeAreaView style={styles.container} edges={["top"]}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.iconBtn} onPress={() => setHistoryOpen(false)} testID="history-close">
              <X color={colors.textPrimary} size={20} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Conversations</Text>
            <TouchableOpacity style={styles.iconBtn} onPress={() => { setHistoryOpen(false); newChat(); }} testID="history-new-chat">
              <Plus color={colors.textPrimary} size={18} />
            </TouchableOpacity>
          </View>

          <View style={styles.searchWrap}>
            <Search size={14} color={colors.textTertiary} style={{ marginLeft: 10 }} />
            <TextInput
              style={styles.searchInput}
              value={searchQ}
              onChangeText={setSearchQ}
              placeholder="Search past messages…"
              placeholderTextColor={colors.textTertiary}
              testID="history-search"
            />
            {searchQ ? (
              <TouchableOpacity onPress={() => setSearchQ("")} style={{ paddingHorizontal: 10 }}>
                <X size={14} color={colors.textTertiary} />
              </TouchableOpacity>
            ) : null}
          </View>

          <ScrollView contentContainerStyle={styles.historyList}>
            {searchQ.trim().length >= 2 ? (
              searchResults.length === 0 ? (
                <Text style={styles.emptyText}>No matches in your history.</Text>
              ) : (
                searchResults.map((r, i) => (
                  <TouchableOpacity
                    key={i}
                    style={styles.searchResultRow}
                    onPress={() => loadConversation(r.session_id)}
                    testID={`search-result-${i}`}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.searchRole}>{(r.role || "").toUpperCase()}</Text>
                    <Text style={styles.searchSnippet} numberOfLines={2}>{r.content}</Text>
                  </TouchableOpacity>
                ))
              )
            ) : (
              <>
                {conversations.length === 0 ? (
                  <Text style={styles.emptyText}>No conversations yet. Ask your first question!</Text>
                ) : (
                  conversations.map((c) => (
                    <View key={c.session_id} style={styles.convRow}>
                      <TouchableOpacity style={{ flex: 1 }} onPress={() => loadConversation(c.session_id)} testID={`conv-${c.session_id}`} activeOpacity={0.85}>
                        <Text style={styles.convTitle} numberOfLines={1}>{c.title}</Text>
                        <View style={styles.convMetaRow}>
                          {c.mode && c.mode !== "general" ? (
                            <View style={[styles.modeChip, { backgroundColor: (MODE_META[c.mode as Mode]?.color || colors.primaryGlow) + "22" }]}>
                              <Text style={[styles.modeChipText, { color: MODE_META[c.mode as Mode]?.color || colors.primaryGlow }]}>{MODE_META[c.mode as Mode]?.label || c.mode}</Text>
                            </View>
                          ) : null}
                          <Text style={styles.convMeta}>{c.message_count} msgs · {(c.last_message_at || "").slice(0, 10)}</Text>
                        </View>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.delBtn} onPress={() => deleteConversation(c.session_id)} testID={`del-${c.session_id}`} hitSlop={8}>
                        <Trash2 size={14} color={colors.danger} />
                      </TouchableOpacity>
                    </View>
                  ))
                )}
                {conversations.length > 0 && (
                  <TouchableOpacity style={styles.clearAllBtn} onPress={clearAll} testID="clear-all-conversations" activeOpacity={0.85}>
                    <Trash2 size={14} color={colors.danger} />
                    <Text style={styles.clearAllText}>Clear All History</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle, gap: spacing.sm },
  iconBtn: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.surfaceElevated, alignItems: "center", justifyContent: "center" },
  headerCenter: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  brainBubble: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  headerTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: "700" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 1 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success },
  statusText: { color: colors.textSecondary, fontSize: 10 },
  messages: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },
  msgRow: { flexDirection: "row", gap: 6, alignItems: "flex-end" },
  msgRowUser: { justifyContent: "flex-end" },
  msgRowAI: { justifyContent: "flex-start" },
  aiBubbleIcon: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  bubble: { maxWidth: "80%", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.lg },
  bubbleUser: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleAI: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderSubtle, borderBottomLeftRadius: 4 },
  bubbleTextUser: { color: "#fff", fontSize: 14, lineHeight: 20 },
  bubbleTextAI: { color: colors.textPrimary, fontSize: 14, lineHeight: 20 },
  inlineCode: { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", backgroundColor: colors.bg, paddingHorizontal: 4, borderRadius: 4, fontSize: 12 },
  listRow: { flexDirection: "row", marginTop: 4, gap: 4 },
  copyBtn: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing.sm, alignSelf: "flex-start", backgroundColor: colors.bg, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm },
  copyText: { color: colors.textTertiary, fontSize: 11, fontWeight: "600" },
  dotsRow: { flexDirection: "row", gap: 6, alignItems: "center" },
  chipsRow: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: 6 },
  chip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 18, marginRight: 6 },
  chipText: { color: colors.textPrimary, fontSize: 12 },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 6, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.borderSubtle, backgroundColor: colors.bg },
  composerBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderSubtle },
  input: { flex: 1, color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderWidth: 1, borderRadius: 19, paddingHorizontal: 14, paddingVertical: Platform.OS === "ios" ? 10 : 8, fontSize: 14, maxHeight: 120 },
  sendBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: spacing.lg, gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderSubtle, paddingBottom: 28 },
  sheetHandle: { width: 36, height: 4, backgroundColor: colors.borderSubtle, borderRadius: 2, alignSelf: "center", marginBottom: spacing.sm },
  sheetTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: "700" },
  sheetHint: { color: colors.textSecondary, fontSize: 12, marginBottom: spacing.sm },
  modeRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderSubtle },
  modeIcon: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  modeTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
  modeDesc: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  searchWrap: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, marginHorizontal: spacing.lg, marginVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderSubtle },
  searchInput: { flex: 1, color: colors.textPrimary, fontSize: 13, paddingVertical: 10, paddingHorizontal: 8 },
  historyList: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: 8 },
  emptyText: { color: colors.textTertiary, fontSize: 13, textAlign: "center", marginTop: 40 },
  convRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.borderSubtle },
  convTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: "600" },
  convMetaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  modeChip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  modeChipText: { fontSize: 9, fontWeight: "700", letterSpacing: 0.4 },
  convMeta: { color: colors.textTertiary, fontSize: 11 },
  delBtn: { padding: 6, borderRadius: radius.sm, backgroundColor: colors.dangerBg },
  searchResultRow: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.borderSubtle, gap: 4 },
  searchRole: { color: colors.textTertiary, fontSize: 9, fontWeight: "700", letterSpacing: 0.8 },
  searchSnippet: { color: colors.textPrimary, fontSize: 12, lineHeight: 17 },
  clearAllBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, padding: spacing.md, marginTop: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.danger, backgroundColor: colors.dangerBg },
  clearAllText: { color: colors.danger, fontSize: 13, fontWeight: "700" },
});
