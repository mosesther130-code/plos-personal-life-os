import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox, Platform, StatusBar, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider } from "@/src/lib/auth-context";
import { colors } from "@/src/lib/theme";
import PLOSErrorBoundary from "@/src/components/PLOSErrorBoundary";

LogBox.ignoreAllLogs(true);

SplashScreen.preventAutoHideAsync();

// ---------- Push notification module-scope setup (NATIVE ONLY) -----------
// These calls MUST be at module scope (not inside useEffect/component) per
// the Emergent push playbook. They are guarded with Platform.OS check so the
// web bundle never imports native-only APIs.
if (Platform.OS !== "web") {
  // Dynamic require keeps web bundles clean. This is the playbook pattern.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Notifications = require("expo-notifications");
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    if (Platform.OS === "android") {
      Notifications.setNotificationChannelAsync("default", {
        name: "Default",
        importance: Notifications.AndroidImportance.MAX,
        sound: "default",
      });
    }
  } catch {
    // expo-notifications not installed in this environment — ignore.
  }
}

export default function RootLayout() {
  const [loaded, error] = useIconFonts();
  const router = useRouter();

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  // ---------- Notification tap routing (native only) ---------------------
  useEffect(() => {
    if (Platform.OS === "web") return;
    let cleanup: (() => void) | undefined;
    (async () => {
      try {
        const Notifications = await import("expo-notifications");
        const Linking = await import("expo-linking");

        const handleResponse = (response: any) => {
          const data = response?.notification?.request?.content?.data || {};
          const url: string | undefined = data.deeplink || data.action_url;
          if (!url) return;
          if (url.startsWith("http")) {
            Linking.openURL(url);
          } else {
            router.push(url as any);
          }
        };

        // Warm tap — user taps notification while app is open
        const tapSub = Notifications.addNotificationResponseReceivedListener(
          handleResponse
        );

        // Cold-start tap — app was killed and reopened via notification tap
        const last = await Notifications.getLastNotificationResponseAsync();
        if (last) handleResponse(last);

        cleanup = () => tapSub.remove();
      } catch {
        // ignore on environments without expo-notifications
      }
    })();
    return () => {
      if (cleanup) cleanup();
    };
  }, [router]);

  if (!loaded && !error) return null;

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
        <PLOSErrorBoundary
          scope="global"
          onGoDashboard={() => router.replace("/(tabs)" as any)}
        >
          <AuthProvider>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.bg },
                animation: "slide_from_right",
              }}
            />
          </AuthProvider>
        </PLOSErrorBoundary>
      </View>
    </SafeAreaProvider>
  );
}
