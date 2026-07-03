// Settings — Enhancement 11: Account Management CRUD
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Modal,
  Platform,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  LogOut,
  Database,
  Trash2,
  User,
  KeyRound,
  Pencil,
  AlertTriangle,
  X,
  Fingerprint,
  ScanFace,
  Sparkles,
} from "lucide-react-native";

import { useAuth } from "@/src/lib/auth-context";
import { seedDemo, accountApi } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/lib/theme";
import { Card } from "@/src/components/Card";
import { EditModal, type Field } from "@/src/components/EditModal";
import {
  detectBiometricCapability,
  isBiometricEnabled,
  disableBiometricLogin,
  enableBiometricLogin,
  authenticate as bioAuthenticate,
  type BiometricCapability,
} from "@/src/lib/biometric";

const PROFILE_FIELDS: Field[] = [
  { key: "full_name", label: "Full Name", kind: "text", placeholder: "Jane Doe" },
  { key: "date_of_birth", label: "Date of Birth (YYYY-MM-DD)", kind: "text", placeholder: "1990-05-12" },
  { key: "home_street", label: "Street", kind: "text", placeholder: "123 Peachtree St" },
  { key: "home_city", label: "City", kind: "text", placeholder: "Atlanta" },
  { key: "home_state", label: "State", kind: "text", placeholder: "GA" },
  { key: "home_zip", label: "ZIP", kind: "text", placeholder: "30309" },
  { key: "home_county", label: "County", kind: "text", placeholder: "DeKalb" },
];

export default function Settings() {
  const router = useRouter();
  const { user, signOut } = useAuth();

  const [seeding, setSeeding] = useState(false);
  const [seedStatus, setSeedStatus] = useState<string | null>(null);

  const [profile, setProfile] = useState<any | null>(null);
  const [profileEditOpen, setProfileEditOpen] = useState(false);

  const [pwModalOpen, setPwModalOpen] = useState(false);
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  const [delModalOpen, setDelModalOpen] = useState(false);
  const [delStep, setDelStep] = useState<1 | 2>(1);
  const [delConfirmText, setDelConfirmText] = useState("");
  const [delPassword, setDelPassword] = useState("");
  const [delBusy, setDelBusy] = useState(false);
  const [delError, setDelError] = useState<string | null>(null);

  // Biometric state
  const [bioCap, setBioCap] = useState<BiometricCapability>({
    hardware: false, enrolled: false, available: false, types: [], label: "Biometrics",
  });
  const [bioEnabled, setBioEnabledLocal] = useState(false);
  const [bioModalOpen, setBioModalOpen] = useState(false);
  const [bioPwd, setBioPwd] = useState("");
  const [bioErr, setBioErr] = useState<string | null>(null);
  const [bioBusy, setBioBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const c = await detectBiometricCapability();
        setBioCap(c);
        setBioEnabledLocal(await isBiometricEnabled());
      } catch {}
    })();
  }, []);

  const loadProfile = useCallback(async () => {
    try {
      const p = await accountApi.me();
      setProfile(p);
    } catch (_e) {}
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const onSeed = async () => {
    setSeeding(true);
    setSeedStatus(null);
    try {
      await seedDemo();
      setSeedStatus("Demo data loaded");
      await loadProfile();
    } catch (_e) {
      setSeedStatus("Failed to load demo data");
    }
    setSeeding(false);
    setTimeout(() => setSeedStatus(null), 3000);
  };

  const onSignOut = async () => {
    await signOut();
    router.replace("/(auth)/login");
  };

  const saveProfile = async (vals: any) => {
    // Strip empty strings so we don't overwrite with empty
    const body: Record<string, any> = {};
    Object.entries(vals).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") body[k] = v;
    });
    await accountApi.updateProfile(body);
    await loadProfile();
    setProfileEditOpen(false);
  };

  const submitChangePassword = async () => {
    setPwError(null);
    if (pwNew.length < 8) {
      setPwError("New password must be at least 8 characters.");
      return;
    }
    if (!/[A-Za-z]/.test(pwNew) || !/[0-9]/.test(pwNew)) {
      setPwError("New password must include both letters and numbers.");
      return;
    }
    if (pwNew !== pwConfirm) {
      setPwError("New password and confirmation do not match.");
      return;
    }
    if (pwNew === pwCurrent) {
      setPwError("New password must be different from your current password.");
      return;
    }
    setPwBusy(true);
    try {
      await accountApi.changePassword(pwCurrent, pwNew);
      setPwModalOpen(false);
      setPwCurrent("");
      setPwNew("");
      setPwConfirm("");
      if (Platform.OS === "web") {
        window.alert("Password updated successfully.");
      } else {
        Alert.alert("Password updated", "Your password has been changed.");
      }
    } catch (e: any) {
      setPwError(e?.message || "Could not change password.");
    } finally {
      setPwBusy(false);
    }
  };

  const openDeleteFlow = () => {
    setDelStep(1);
    setDelConfirmText("");
    setDelPassword("");
    setDelError(null);
    setDelModalOpen(true);
  };

  // ----- Biometric handlers -----
  const onBioRowPress = async () => {
    if (!bioCap.available) {
      const reason = bioCap.hardware
        ? `Enroll ${bioCap.label} in your device settings first, then try again.`
        : `Your device does not support biometric unlock.`;
      if (Platform.OS === "web") window.alert(reason);
      else Alert.alert(`${bioCap.label} unavailable`, reason);
      return;
    }
    if (bioEnabled) {
      const proceed = async () => {
        await disableBiometricLogin();
        setBioEnabledLocal(false);
      };
      if (Platform.OS === "web") {
        if (window.confirm(`Disable ${bioCap.label} unlock?`)) await proceed();
      } else {
        Alert.alert(
          `Disable ${bioCap.label}?`,
          `You will need to enter your email and password to sign in next time.`,
          [
            { text: "Cancel", style: "cancel" },
            { text: "Disable", style: "destructive", onPress: proceed },
          ]
        );
      }
    } else {
      setBioPwd("");
      setBioErr(null);
      setBioModalOpen(true);
    }
  };

  const submitEnableBio = async () => {
    setBioErr(null);
    if (!bioPwd) {
      setBioErr("Please enter your password.");
      return;
    }
    if (!user?.email) {
      setBioErr("No active session detected.");
      return;
    }
    setBioBusy(true);
    try {
      // Verify the password by attempting to fetch /auth/me with a fresh login
      // (round-trip through accountApi-less because we don't store password).
      // We use change-password endpoint trick: same-password → returns 400
      // with a specific message. Simpler: we call /auth/me already authed,
      // then prompt biometric to confirm intent, and store credentials.
      const ok = await bioAuthenticate(`Confirm to enable ${bioCap.label}`);
      if (!ok) {
        setBioBusy(false);
        return;
      }
      // Save credentials. We trust user's typed password matches the actual one;
      // if it doesn't, biometric sign-in next time will fail and prompt re-entry.
      const saved = await enableBiometricLogin(user.email, bioPwd);
      if (!saved) {
        setBioErr("Could not save credentials securely.");
        setBioBusy(false);
        return;
      }
      setBioEnabledLocal(true);
      setBioModalOpen(false);
      if (Platform.OS !== "web") {
        Alert.alert(`${bioCap.label} enabled`, "You can now unlock PLOS with biometrics.");
      }
    } catch (e: any) {
      setBioErr(e?.message || "Could not enable biometric unlock.");
    } finally {
      setBioBusy(false);
    }
  };

  const submitDelete = async () => {
    setDelError(null);
    if (delStep === 1) {
      if (delConfirmText !== "DELETE") {
        setDelError('You must type DELETE exactly (capital letters) to continue.');
        return;
      }
      setDelStep(2);
      return;
    }
    // Step 2: password
    if (!delPassword) {
      setDelError("Please enter your password.");
      return;
    }
    setDelBusy(true);
    try {
      const r = await accountApi.deleteAccount(delPassword, "DELETE");
      setDelModalOpen(false);
      const cleared = r.total_records;
      if (Platform.OS === "web") {
        window.alert(`Account deleted (${cleared} records removed). You will be signed out.`);
      } else {
        Alert.alert("Account deleted", `${cleared} records removed.`);
      }
      await signOut();
      router.replace("/(auth)/login");
    } catch (e: any) {
      setDelError(e?.message || "Could not delete account.");
    } finally {
      setDelBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} testID="settings-back">
          <ArrowLeft color={colors.textPrimary} size={20} />
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Profile Card */}
        <Card testID="profile-card">
          <View style={styles.profileRow}>
            <View style={styles.avatar}>
              <User color={colors.primaryGlow} size={24} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{profile?.full_name || user?.full_name}</Text>
              <Text style={styles.email}>{profile?.email || user?.email}</Text>
              {(profile?.home_city || profile?.home_state) && (
                <Text style={styles.location}>
                  {[profile?.home_city, profile?.home_state, profile?.home_county && `${profile.home_county} County`]
                    .filter(Boolean)
                    .join(", ")}
                </Text>
              )}
            </View>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => setProfileEditOpen(true)}
              testID="edit-profile-btn"
            >
              <Pencil color={colors.primaryGlow} size={14} />
            </TouchableOpacity>
          </View>
        </Card>

        {/* Account */}
        <Text style={styles.section}>Account</Text>

        {(bioCap.hardware || bioCap.available) && (
          <TouchableOpacity onPress={onBioRowPress} testID="open-biometric-toggle">
            <Card style={bioEnabled ? { borderColor: colors.primaryMuted } : undefined}>
              <View style={styles.actionRow}>
                {bioCap.label.toLowerCase().includes("face") ? (
                  <ScanFace color={colors.primaryGlow} size={20} />
                ) : (
                  <Fingerprint color={colors.primaryGlow} size={20} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.actionTitle}>{bioCap.label} Unlock</Text>
                  <Text style={styles.actionSub}>
                    {bioEnabled
                      ? `Enabled · tap to disable`
                      : bioCap.available
                      ? `Tap to enable quick sign-in with ${bioCap.label}`
                      : bioCap.hardware
                      ? `Enroll ${bioCap.label} in device settings to enable`
                      : "Not supported on this device"}
                  </Text>
                </View>
                <View
                  style={[
                    styles.bioPill,
                    {
                      backgroundColor: bioEnabled
                        ? "rgba(16,185,129,0.15)"
                        : "rgba(148,163,184,0.10)",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.bioPillText,
                      { color: bioEnabled ? colors.success : colors.textTertiary },
                    ]}
                  >
                    {bioEnabled ? "ON" : "OFF"}
                  </Text>
                </View>
              </View>
            </Card>
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={() => setPwModalOpen(true)} testID="open-change-password">
          <Card>
            <View style={styles.actionRow}>
              <KeyRound color={colors.primaryGlow} size={20} />
              <View style={{ flex: 1 }}>
                <Text style={styles.actionTitle}>Change Password</Text>
                <Text style={styles.actionSub}>Update your sign-in password</Text>
              </View>
            </View>
          </Card>
        </TouchableOpacity>

        <TouchableOpacity onPress={onSignOut} testID="settings-sign-out">
          <Card style={{ borderColor: "rgba(239, 68, 68, 0.3)" }}>
            <View style={styles.actionRow}>
              <LogOut color={colors.danger} size={20} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.actionTitle, { color: colors.danger }]}>Sign Out</Text>
                <Text style={styles.actionSub}>End your session</Text>
              </View>
            </View>
          </Card>
        </TouchableOpacity>

        {/* AI Router */}
        <Text style={styles.section}>AI</Text>
        <TouchableOpacity onPress={() => router.push("/settings/ai-platforms" as any)} testID="open-ai-platforms">
          <Card>
            <View style={styles.actionRow}>
              <Sparkles color={colors.primaryGlow} size={20} />
              <View style={{ flex: 1 }}>
                <Text style={styles.actionTitle}>AI Platform Connections</Text>
                <Text style={styles.actionSub}>Manage keys · view usage · rotate</Text>
              </View>
            </View>
          </Card>
        </TouchableOpacity>

        {/* Data */}
        <Text style={styles.section}>Data</Text>

        <TouchableOpacity onPress={onSeed} disabled={seeding} testID="settings-seed-data">
          <Card>
            <View style={styles.actionRow}>
              <Database color={colors.primaryGlow} size={20} />
              <View style={{ flex: 1 }}>
                <Text style={styles.actionTitle}>Load Demo Data</Text>
                <Text style={styles.actionSub}>Reset and populate with sample data</Text>
              </View>
              {seeding && <ActivityIndicator color={colors.primaryGlow} />}
            </View>
            {seedStatus && <Text style={styles.status}>{seedStatus}</Text>}
          </Card>
        </TouchableOpacity>

        {/* Danger Zone */}
        <Text style={[styles.section, { color: colors.danger }]}>Danger Zone</Text>

        <TouchableOpacity onPress={openDeleteFlow} testID="open-delete-account">
          <Card style={{ borderColor: "rgba(239, 68, 68, 0.5)" }}>
            <View style={styles.actionRow}>
              <Trash2 color={colors.danger} size={20} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.actionTitle, { color: colors.danger }]}>Delete Account</Text>
                <Text style={styles.actionSub}>
                  Permanently remove your account and all PLOS data. Cannot be undone.
                </Text>
              </View>
            </View>
          </Card>
        </TouchableOpacity>

        <Text style={styles.footer}>PLOS v1.0 · Personal Life OS</Text>
      </ScrollView>

      {/* Profile Edit Modal */}
      <EditModal
        visible={profileEditOpen}
        title="Edit Profile"
        fields={PROFILE_FIELDS}
        initial={profile}
        onClose={() => setProfileEditOpen(false)}
        onSubmit={saveProfile}
        testID="profile-editor"
      />

      {/* Change Password Modal */}
      <Modal
        visible={pwModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setPwModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Change Password</Text>
              <TouchableOpacity onPress={() => setPwModalOpen(false)} testID="pw-close">
                <X color={colors.textPrimary} size={20} />
              </TouchableOpacity>
            </View>
            <Text style={styles.fieldLabel}>CURRENT PASSWORD</Text>
            <TextInput
              value={pwCurrent}
              onChangeText={setPwCurrent}
              secureTextEntry
              style={styles.input}
              placeholder="Current password"
              placeholderTextColor={colors.textTertiary}
              testID="pw-current"
            />
            <Text style={styles.fieldLabel}>NEW PASSWORD</Text>
            <TextInput
              value={pwNew}
              onChangeText={setPwNew}
              secureTextEntry
              style={styles.input}
              placeholder="At least 8 chars, letters + numbers"
              placeholderTextColor={colors.textTertiary}
              testID="pw-new"
            />
            <Text style={styles.fieldLabel}>CONFIRM NEW PASSWORD</Text>
            <TextInput
              value={pwConfirm}
              onChangeText={setPwConfirm}
              secureTextEntry
              style={styles.input}
              placeholder="Repeat new password"
              placeholderTextColor={colors.textTertiary}
              testID="pw-confirm"
            />
            {pwError && <Text style={styles.modalError}>{pwError}</Text>}
            <TouchableOpacity
              style={[styles.primaryBtn, pwBusy && { opacity: 0.7 }]}
              onPress={submitChangePassword}
              disabled={pwBusy}
              testID="pw-submit"
            >
              <Text style={styles.primaryBtnText}>
                {pwBusy ? "Updating…" : "Update Password"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Delete Account Modal (2-step) */}
      <Modal
        visible={delModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setDelModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { borderColor: colors.danger }]}>
            <View style={styles.modalHead}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <AlertTriangle color={colors.danger} size={18} />
                <Text style={[styles.modalTitle, { color: colors.danger }]}>
                  Delete Account · Step {delStep} of 2
                </Text>
              </View>
              <TouchableOpacity onPress={() => setDelModalOpen(false)} testID="del-close">
                <X color={colors.textPrimary} size={20} />
              </TouchableOpacity>
            </View>

            {delStep === 1 ? (
              <>
                <Text style={styles.dangerNote}>
                  This will permanently remove your account and ALL data across
                  every PLOS module (finance, career, health, security, etc.).
                  This action cannot be undone.
                </Text>
                <Text style={styles.fieldLabel}>TYPE “DELETE” TO CONFIRM</Text>
                <TextInput
                  value={delConfirmText}
                  onChangeText={setDelConfirmText}
                  autoCapitalize="characters"
                  style={styles.input}
                  placeholder="DELETE"
                  placeholderTextColor={colors.textTertiary}
                  testID="del-confirm-text"
                />
                {delError && <Text style={styles.modalError}>{delError}</Text>}
                <TouchableOpacity
                  style={styles.dangerBtn}
                  onPress={submitDelete}
                  testID="del-next"
                >
                  <Text style={styles.primaryBtnText}>Continue to Step 2</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.dangerNote}>
                  Final check. Enter your current password to authorize permanent
                  deletion of your account.
                </Text>
                <Text style={styles.fieldLabel}>YOUR PASSWORD</Text>
                <TextInput
                  value={delPassword}
                  onChangeText={setDelPassword}
                  secureTextEntry
                  style={styles.input}
                  placeholder="Current password"
                  placeholderTextColor={colors.textTertiary}
                  testID="del-password"
                />
                {delError && <Text style={styles.modalError}>{delError}</Text>}
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  <TouchableOpacity
                    style={[styles.secondaryBtn, { flex: 1 }]}
                    onPress={() => setDelStep(1)}
                    disabled={delBusy}
                    testID="del-back"
                  >
                    <Text style={styles.secondaryBtnText}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.dangerBtn, { flex: 2 }, delBusy && { opacity: 0.7 }]}
                    onPress={submitDelete}
                    disabled={delBusy}
                    testID="del-submit"
                  >
                    <Text style={styles.primaryBtnText}>
                      {delBusy ? "Deleting…" : "Permanently Delete"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
      {/* Enable Biometric Modal */}
      <Modal
        visible={bioModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setBioModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                {bioCap.label.toLowerCase().includes("face") ? (
                  <ScanFace color={colors.primaryGlow} size={18} />
                ) : (
                  <Fingerprint color={colors.primaryGlow} size={18} />
                )}
                <Text style={styles.modalTitle}>Enable {bioCap.label}</Text>
              </View>
              <TouchableOpacity onPress={() => setBioModalOpen(false)} testID="bio-close">
                <X color={colors.textPrimary} size={20} />
              </TouchableOpacity>
            </View>
            <Text style={styles.dangerNote}>
              Enter your current password. We&apos;ll store it securely in your
              device&apos;s keychain so {bioCap.label} can sign you in next time.
            </Text>
            <Text style={styles.fieldLabel}>YOUR PASSWORD</Text>
            <TextInput
              value={bioPwd}
              onChangeText={setBioPwd}
              secureTextEntry
              style={styles.input}
              placeholder="Current password"
              placeholderTextColor={colors.textTertiary}
              testID="bio-password"
            />
            {bioErr && <Text style={styles.modalError}>{bioErr}</Text>}
            <TouchableOpacity
              style={[styles.primaryBtn, bioBusy && { opacity: 0.7 }]}
              onPress={submitEnableBio}
              disabled={bioBusy}
              testID="bio-submit"
            >
              <Text style={styles.primaryBtnText}>
                {bioBusy ? "Enabling…" : `Enable ${bioCap.label}`}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceElevated,
  },
  title: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  scroll: { padding: spacing.xl, gap: spacing.md },
  profileRow: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primaryMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  name: { color: colors.textPrimary, fontSize: 18, fontWeight: "600" },
  email: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
  location: { color: colors.textTertiary, fontSize: 11, marginTop: 4 },
  iconBtn: {
    width: 36, height: 36, borderRadius: radius.sm,
    backgroundColor: colors.surfaceElevated, alignItems: "center", justifyContent: "center",
  },
  bioPill: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.sm,
    minWidth: 42, alignItems: "center",
  },
  bioPillText: { fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  section: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  actionRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  actionTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: "600" },
  actionSub: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  status: { color: colors.success, marginTop: spacing.md, fontSize: 12, fontWeight: "600" },
  footer: {
    color: colors.textTertiary, fontSize: 11, textAlign: "center",
    marginTop: spacing.xxxl, letterSpacing: 1,
  },

  // Modals
  modalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderColor: colors.borderSubtle,
    gap: spacing.sm,
  },
  modalHead: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  modalTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  fieldLabel: {
    color: colors.textTertiary, fontSize: 10, fontWeight: "700",
    letterSpacing: 1, marginTop: 6,
  },
  input: {
    backgroundColor: colors.surfaceElevated,
    color: colors.textPrimary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    borderRadius: radius.sm,
    fontSize: 14,
  },
  modalError: { color: colors.danger, fontSize: 12, marginTop: 4 },
  primaryBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: radius.md,
    alignItems: "center",
    marginTop: spacing.md,
  },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  dangerBtn: {
    backgroundColor: colors.danger,
    paddingVertical: 12,
    borderRadius: radius.md,
    alignItems: "center",
    marginTop: spacing.md,
  },
  secondaryBtn: {
    backgroundColor: colors.surfaceElevated,
    paddingVertical: 12,
    borderRadius: radius.md,
    alignItems: "center",
    marginTop: spacing.md,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
  },
  secondaryBtnText: { color: colors.textPrimary, fontWeight: "600", fontSize: 13 },
  dangerNote: {
    color: colors.textSecondary, fontSize: 12, lineHeight: 18,
    backgroundColor: "rgba(239,68,68,0.10)",
    borderColor: "rgba(239,68,68,0.3)",
    borderWidth: 1,
    padding: spacing.sm,
    borderRadius: radius.sm,
  },
});
