// Biometric unlock helper — Enhancement: Biometric Login (P2)
// Encapsulates capability detection, credential storage, and the prompt UX.
import { Platform } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

export const BIOMETRIC_ENABLED_KEY = "plos_biometric_enabled";
export const BIOMETRIC_EMAIL_KEY = "plos_bio_email";
export const BIOMETRIC_PASSWORD_KEY = "plos_bio_password";

export type BiometricCapability = {
  hardware: boolean;
  enrolled: boolean;
  available: boolean; // hardware && enrolled
  types: number[]; // LocalAuthentication.AuthenticationType[]
  label: string; // "Face ID", "Touch ID", "Fingerprint", "Biometrics"
};

export async function detectBiometricCapability(): Promise<BiometricCapability> {
  // Web doesn't support expo-local-authentication outside dev builds; report
  // unavailable rather than throwing.
  if (Platform.OS === "web") {
    return { hardware: false, enrolled: false, available: false, types: [], label: "Biometrics" };
  }
  try {
    const [hw, enrolled, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);
    let label = "Biometrics";
    if (types?.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      label = Platform.OS === "ios" ? "Face ID" : "Face Unlock";
    } else if (types?.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      label = Platform.OS === "ios" ? "Touch ID" : "Fingerprint";
    } else if (types?.includes(LocalAuthentication.AuthenticationType.IRIS)) {
      label = "Iris";
    }
    return {
      hardware: !!hw,
      enrolled: !!enrolled,
      available: !!(hw && enrolled),
      types: types || [],
      label,
    };
  } catch {
    return { hardware: false, enrolled: false, available: false, types: [], label: "Biometrics" };
  }
}

export async function isBiometricEnabled(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    const v = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY);
    return v === "1";
  } catch {
    return false;
  }
}

export async function getStoredEmail(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  try {
    return await SecureStore.getItemAsync(BIOMETRIC_EMAIL_KEY);
  } catch {
    return null;
  }
}

/**
 * Triggers the native biometric prompt. Returns true on success.
 */
export async function authenticate(promptMessage = "Unlock PLOS"): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: "Use password",
      disableDeviceFallback: false,
      fallbackLabel: "Use device passcode",
    });
    return !!res.success;
  } catch {
    return false;
  }
}

/**
 * Enables biometric unlock on this device by storing the user's credentials
 * inside SecureStore. The native OS keychain is already gated by device
 * unlock; we additionally require a biometric prompt to read on each launch.
 */
export async function enableBiometricLogin(
  email: string,
  password: string
): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    await SecureStore.setItemAsync(BIOMETRIC_EMAIL_KEY, email);
    await SecureStore.setItemAsync(BIOMETRIC_PASSWORD_KEY, password);
    await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, "1");
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads stored credentials (after biometric auth has already succeeded).
 */
export async function readStoredCredentials(): Promise<
  { email: string; password: string } | null
> {
  if (Platform.OS === "web") return null;
  try {
    const [email, password] = await Promise.all([
      SecureStore.getItemAsync(BIOMETRIC_EMAIL_KEY),
      SecureStore.getItemAsync(BIOMETRIC_PASSWORD_KEY),
    ]);
    if (email && password) return { email, password };
    return null;
  } catch {
    return null;
  }
}

export async function disableBiometricLogin(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    await SecureStore.deleteItemAsync(BIOMETRIC_ENABLED_KEY);
    await SecureStore.deleteItemAsync(BIOMETRIC_EMAIL_KEY);
    await SecureStore.deleteItemAsync(BIOMETRIC_PASSWORD_KEY);
  } catch {
    // ignore
  }
}
