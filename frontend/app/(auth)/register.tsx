import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { useAuth } from "@/src/lib/auth-context";
import { seedDemo } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";
import { Button } from "@/src/components/Button";

export default function Register() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setError(null);
    if (!email || !password || !fullName) {
      setError("All fields are required");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    try {
      await signUp(email.trim().toLowerCase(), password, fullName);
      // Seed demo data for new users for instant wow
      try {
        await seedDemo();
      } catch {}
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e?.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.brand}>
            <View style={styles.logo}>
              <Text style={styles.logoText}>PLOS</Text>
            </View>
            <Text style={styles.title}>Create your account</Text>
            <Text style={styles.subtitle}>
              Start running your life like an OS
            </Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>Full name</Text>
            <TextInput
              testID="register-name-input"
              style={styles.input}
              placeholder="John Doe"
              placeholderTextColor={colors.textTertiary}
              value={fullName}
              onChangeText={setFullName}
            />

            <Text style={styles.label}>Email</Text>
            <TextInput
              testID="register-email-input"
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />

            <Text style={styles.label}>Password</Text>
            <TextInput
              testID="register-password-input"
              style={styles.input}
              placeholder="6+ characters"
              placeholderTextColor={colors.textTertiary}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Button
              title="Create account"
              onPress={onSubmit}
              loading={loading}
              testID="register-submit-button"
              style={{ marginTop: spacing.lg }}
            />

            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.switchBtn}
              testID="register-go-to-login"
            >
              <Text style={styles.switchText}>
                Already have an account?{" "}
                <Text style={{ color: colors.primaryGlow }}>Sign in</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.xl, flexGrow: 1, justifyContent: "center" },
  brand: { alignItems: "center", marginBottom: spacing.xxxl },
  logo: {
    width: 72,
    height: 72,
    backgroundColor: colors.primary,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  logoText: { color: "#fff", fontSize: 18, fontWeight: "800", letterSpacing: 2 },
  title: {
    color: colors.textPrimary,
    fontSize: 26,
    fontWeight: "600",
    letterSpacing: -0.5,
    textAlign: "center",
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: spacing.sm,
  },
  form: { gap: 10 },
  label: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginTop: spacing.md,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.surfaceElevated,
    color: colors.textPrimary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    fontSize: 15,
  },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.sm },
  switchBtn: { marginTop: spacing.xl, alignItems: "center" },
  switchText: { color: colors.textSecondary, fontSize: 14 },
});
