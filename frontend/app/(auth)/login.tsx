import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Fingerprint, ScanFace, ShieldCheck } from "lucide-react-native";

import { useAuth } from "@/src/lib/auth-context";
import { colors, spacing, radius } from "@/src/lib/theme";
import { Button } from "@/src/components/Button";
import {
  authenticate as bioAuthenticate,
  detectBiometricCapability,
  enableBiometricLogin,
  getStoredEmail,
  isBiometricEnabled,
  readStoredCredentials,
  type BiometricCapability,
} from "@/src/lib/biometric";

const mask = (email: string) => {
  if (!email) return "";
  const [name, domain] = email.split("@");
  if (!domain) return email;
  const visible = name.slice(0, 2);
  return `${visible}${"•".repeat(Math.max(name.length - 2, 1))}@${domain}`;
};

export default function Login() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [cap, setCap] = useState<BiometricCapability>({
    hardware: false,
    enrolled: false,
    available: false,
    types: [],
    label: "Biometrics",
  });
  const [bioEnabled, setBioEnabled] = useState(false);
  const [storedEmail, setStoredEmail] = useState<string | null>(null);
  const [bioPromptVisible, setBioPromptVisible] = useState(false);
  const autoTriedRef = useRef(false);

  // Detect biometric capability + enrollment state on mount
  useEffect(() => {
    (async () => {
      try {
        const c = await detectBiometricCapability();
        setCap(c);
        const enabled = await isBiometricEnabled();
        const se = await getStoredEmail();
        setBioEnabled(enabled);
        setStoredEmail(se);
        // Auto-trigger biometric prompt only once on first mount
        if (c.available && enabled && se && !autoTriedRef.current) {
          autoTriedRef.current = true;
          // Small delay so the screen renders first
          setTimeout(() => doBiometricSignIn(), 350);
        }
      } catch {
        // ignore
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doBiometricSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      const ok = await bioAuthenticate(`Unlock PLOS with ${cap.label}`);
      if (!ok) {
        setLoading(false);
        return;
      }
      const creds = await readStoredCredentials();
      if (!creds) {
        setError("Stored credentials are unavailable. Please sign in once.");
        setLoading(false);
        return;
      }
      await signIn(creds.email, creds.password);
      router.replace("/(tabs)");
    } catch (e: any) {
      // Stored password may have been changed/rotated; force manual sign-in
      setError(
        "Biometric sign-in failed. Your saved password may have changed — sign in once to refresh."
      );
      setLoading(false);
    }
  };

  const onSubmit = async () => {
    setError(null);
    if (!email || !password) {
      setError("Please enter email and password");
      return;
    }
    setLoading(true);
    try {
      const cleanEmail = email.trim().toLowerCase();
      await signIn(cleanEmail, password);
      // Prompt to enable biometric only if hardware available, enrolled,
      // and the user hasn't already enabled it.
      if (cap.available && !bioEnabled) {
        setBioPromptVisible(true);
      } else {
        router.replace("/(tabs)");
      }
    } catch (e: any) {
      setError(e?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const confirmEnableBio = async () => {
    setBioPromptVisible(false);
    const ok = await bioAuthenticate(`Confirm to enable ${cap.label}`);
    if (!ok) {
      router.replace("/(tabs)");
      return;
    }
    await enableBiometricLogin(email.trim().toLowerCase(), password);
    if (Platform.OS !== "web") {
      Alert.alert(
        `${cap.label} enabled`,
        `Next time, you can unlock PLOS with ${cap.label}. You can disable this in Settings.`
      );
    }
    router.replace("/(tabs)");
  };

  const skipBio = () => {
    setBioPromptVisible(false);
    router.replace("/(tabs)");
  };

  // Pick the right icon for the biometric type
  const BioIcon = cap.label === "Face ID" || cap.label === "Face Unlock" ? ScanFace : Fingerprint;

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
            <Text style={styles.subtitle}>Your personal life operating system</Text>
          </View>

          {/* Biometric quick-unlock banner */}
          {cap.available && bioEnabled && storedEmail && (
            <TouchableOpacity
              style={styles.bioBanner}
              onPress={doBiometricSignIn}
              disabled={loading}
              testID="login-biometric-button"
              activeOpacity={0.85}
            >
              <View style={styles.bioBannerIcon}>
                <BioIcon size={26} color={colors.primaryGlow} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.bioBannerLabel}>Sign in with {cap.label}</Text>
                <Text style={styles.bioBannerEmail}>{mask(storedEmail)}</Text>
              </View>
              <ShieldCheck size={14} color={colors.success} />
            </TouchableOpacity>
          )}

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

            {/* Hint when biometric is enrolled on device but not yet enabled in PLOS */}
            {cap.available && !bioEnabled && (
              <Text style={styles.bioHint}>
                After signing in, you can enable {cap.label} unlock for faster
                access next time.
              </Text>
            )}
            {!cap.available && (cap.hardware || cap.enrolled) && (
              <Text style={styles.bioHint}>
                {cap.hardware && !cap.enrolled
                  ? `Enroll ${cap.label} in your device settings to enable quick unlock.`
                  : ""}
              </Text>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Post-login biometric opt-in modal */}
      <Modal
        visible={bioPromptVisible}
        transparent
        animationType="fade"
        onRequestClose={skipBio}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconWrap}>
              <BioIcon size={32} color={colors.primaryGlow} />
            </View>
            <Text style={styles.modalTitle}>Enable {cap.label} Unlock?</Text>
            <Text style={styles.modalBody}>
              Use {cap.label} to sign in to PLOS without typing your password.
              Credentials are stored securely in your device&apos;s keychain.
            </Text>
            <TouchableOpacity
              style={styles.modalPrimary}
              onPress={confirmEnableBio}
              testID="enable-biometric-confirm"
            >
              <Text style={styles.modalPrimaryText}>Enable {cap.label}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalSecondary}
              onPress={skipBio}
              testID="enable-biometric-skip"
            >
              <Text style={styles.modalSecondaryText}>Not now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.xl, flexGrow: 1, justifyContent: "center" },
  brand: { alignItems: "center", marginBottom: spacing.xxxl },
  logo: {
    width: 72, height: 72, backgroundColor: colors.primary, borderRadius: 20,
    alignItems: "center", justifyContent: "center", marginBottom: spacing.lg,
  },
  logoText: { color: "#fff", fontSize: 18, fontWeight: "800", letterSpacing: 2 },
  title: { color: colors.textPrimary, fontSize: 28, fontWeight: "600", letterSpacing: -0.5 },
  subtitle: { color: colors.textSecondary, fontSize: 13, marginTop: spacing.sm, letterSpacing: 0.5 },

  bioBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderColor: colors.primaryMuted,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.xl,
  },
  bioBannerIcon: {
    width: 48, height: 48, borderRadius: radius.md,
    backgroundColor: colors.primaryMuted, alignItems: "center", justifyContent: "center",
  },
  bioBannerLabel: { color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
  bioBannerEmail: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },

  form: { gap: 10 },
  label: {
    color: colors.textSecondary, fontSize: 12, fontWeight: "700", letterSpacing: 1.2,
    textTransform: "uppercase", marginTop: spacing.md, marginBottom: 6,
  },
  input: {
    backgroundColor: colors.surfaceElevated, color: colors.textPrimary,
    borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: 14,
    fontSize: 15, borderWidth: 1, borderColor: "transparent",
  },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.sm },
  switchBtn: { marginTop: spacing.xl, alignItems: "center" },
  switchText: { color: colors.textSecondary, fontSize: 14 },
  bioHint: {
    color: colors.textTertiary, fontSize: 11, fontStyle: "italic",
    marginTop: spacing.md, textAlign: "center", lineHeight: 16,
  },

  modalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.75)",
    alignItems: "center", justifyContent: "center", padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderColor: colors.primaryMuted,
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.xl,
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
  },
  modalIconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: colors.primaryMuted,
    alignItems: "center", justifyContent: "center", marginBottom: spacing.md,
  },
  modalTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: "700" },
  modalBody: {
    color: colors.textSecondary, fontSize: 13, lineHeight: 19,
    textAlign: "center", marginTop: spacing.sm, marginBottom: spacing.lg,
  },
  modalPrimary: {
    backgroundColor: colors.primary, paddingVertical: 12, paddingHorizontal: spacing.lg,
    borderRadius: radius.md, alignItems: "center", width: "100%", marginBottom: 8,
  },
  modalPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  modalSecondary: { paddingVertical: 8, alignItems: "center", width: "100%" },
  modalSecondaryText: { color: colors.textSecondary, fontWeight: "600", fontSize: 13 },
});
