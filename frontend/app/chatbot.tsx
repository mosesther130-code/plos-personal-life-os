import React, { useEffect, useRef, useState } from "react";
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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Send, Sparkles } from "lucide-react-native";

import { aiApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";

interface Msg {
  role: "user" | "assistant";
  content: string;
  id: string;
}

export default function Chatbot() {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    setMessages([
      {
        id: "intro",
        role: "assistant",
        content:
          "I'm PLOS — your personal life operating system. I have access to your full financial, career, and life data. Ask me anything.",
      },
    ]);
  }, []);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    const userMsg: Msg = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
    };
    setMessages((m) => [...m, userMsg]);
    setLoading(true);
    try {
      const res = await aiApi.chat(text, sessionId);
      setSessionId(res.session_id);
      setMessages((m) => [
        ...m,
        { id: `a-${Date.now()}`, role: "assistant", content: res.response },
      ]);
    } catch (e: any) {
      setMessages((m) => [
        ...m,
        {
          id: `e-${Date.now()}`,
          role: "assistant",
          content: `Error: ${e?.message || "failed"}`,
        },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          testID="chatbot-back"
          style={styles.backBtn}
        >
          <ArrowLeft color={colors.textPrimary} size={20} />
        </TouchableOpacity>
        <View style={styles.titleRow}>
          <Sparkles color={colors.primaryGlow} size={16} />
          <Text style={styles.title}>PLOS AI</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.messages}
          onContentSizeChange={() =>
            scrollRef.current?.scrollToEnd({ animated: true })
          }
        >
          {messages.map((m) => (
            <View
              key={m.id}
              testID={`chat-msg-${m.role}`}
              style={[
                styles.bubble,
                m.role === "user" ? styles.userBubble : styles.aiBubble,
              ]}
            >
              <Text
                style={[
                  styles.bubbleText,
                  m.role === "user" && { color: colors.textPrimary },
                ]}
              >
                {m.content}
              </Text>
            </View>
          ))}
          {loading && (
            <View style={[styles.bubble, styles.aiBubble]}>
              <ActivityIndicator color={colors.primaryGlow} />
            </View>
          )}
        </ScrollView>

        <View style={styles.inputRow}>
          <TextInput
            testID="chat-input"
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Ask PLOS anything..."
            placeholderTextColor={colors.textTertiary}
            multiline
            maxLength={1000}
            onSubmitEditing={send}
          />
          <TouchableOpacity
            onPress={send}
            disabled={loading || !input.trim()}
            style={[
              styles.sendBtn,
              (!input.trim() || loading) && { opacity: 0.5 },
            ]}
            testID="chat-send-button"
          >
            <Send size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceElevated,
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  messages: { padding: spacing.lg, gap: spacing.md },
  bubble: {
    maxWidth: "85%",
    padding: spacing.md,
    borderRadius: radius.lg,
  },
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    alignSelf: "flex-start",
    backgroundColor: colors.surfaceElevated,
    borderBottomLeftRadius: 4,
  },
  bubbleText: { color: colors.textPrimary, fontSize: 15, lineHeight: 22 },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: spacing.lg,
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surfaceElevated,
    color: colors.textPrimary,
    borderRadius: radius.lg,
    padding: spacing.md,
    fontSize: 15,
    maxHeight: 100,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
});
