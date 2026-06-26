import { Stack } from "expo-router";
import { colors } from "@/src/lib/theme";

export default function InvestmentsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        animation: "slide_from_right",
      }}
    />
  );
}
