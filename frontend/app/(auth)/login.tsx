import React, { useEffect, useState } from "react";
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
import * as LocalAuthentication from "expo-local-authentication";
import { Fingerprint } from "lucide-react-native";

import { useAuth } from "@/src/lib/auth-context";
import { colors, spacing, radius } from "@/src/lib/theme";
import { Button } from "@/src/components/Button";
import { storage } from "@/src/utils/storage";

const BIOMETRIC_FLAG = "plos_biometric_enabled";

export default function Login() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const hasHw = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        setBiometricAvailable(hasHw && enrolled);
        const enabled = await storage.getItem<boolean>(BIOMETRIC_FLAG, false);
        setBiometricEnabled(!!enabled);
      } catch {}
    })();
  }, []);

  const tryBiometric = async () => {
    try {
      const res = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock PLOS",
      });
      if (res.success) {
        // Token already in secure store; just navigate.
        router.replace("/(tabs)");
      }
    } catch (_e) {}
  };

  const onSubmit = async () => {
    setError(null);
    if (!email || !password) {
      setError("Please enter email and password");
      return;
    }
    setLoading(true);
    try {
      await signIn(email.trim().toLowerCase(), password);
      await storage.setItem(BIOMETRIC_FLAG, true);
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e?.message || "Login failed");
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
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>
              Your personal life operating system
            </Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              testID="login-email-input"
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
              testID="login-password-input"
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor={colors.textTertiary}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Button
              title="Sign in"
              onPress={onSubmit}
              loading={loading}
              testID="login-submit-button"
              style={{ marginTop: spacing.lg }}
            />

            {biometricAvailable && biometricEnabled && (
              <TouchableOpacity
                style={styles.biometricBtn}
                onPress={tryBiometric}
                testID="login-biometric-button"
              >
                <Fingerprint size={20} color={colors.primaryGlow} />
                <Text style={styles.biometricText}>Unlock with biometrics</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={() => router.push("/(auth)/register")}
              style={styles.switchBtn}
              testID="login-go-to-register"
            >
              <Text style={styles.switchText}>
                Don&apos;t have an account?{" "}
                <Text style={{ color: colors.primaryGlow }}>Sign up</Text>
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
    fontSize: 28,
    fontWeight: "600",
    letterSpacing: -0.5,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: spacing.sm,
    letterSpacing: 0.5,
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
    borderWidth: 1,
    borderColor: "transparent",
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    marginTop: spacing.sm,
  },
  switchBtn: { marginTop: spacing.xl, alignItems: "center" },
  switchText: { color: colors.textSecondary, fontSize: 14 },
  biometricBtn: {
    marginTop: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  biometricText: { color: colors.textPrimary, fontWeight: "600" },
});
