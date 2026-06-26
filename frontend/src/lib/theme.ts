// PLOS Design tokens — dark mode, Luxury + Swiss archetype.
export const colors = {
  bg: "#08080A",
  surface: "#121216",
  surfaceElevated: "#1A1A20",
  primary: "#1E40AF",
  primaryGlow: "#3B82F6",
  primaryMuted: "rgba(30, 64, 175, 0.2)",
  textPrimary: "#FFFFFF",
  textSecondary: "#A1A1AA",
  textTertiary: "#71717A",
  borderSubtle: "rgba(255, 255, 255, 0.06)",
  borderStrong: "rgba(255, 255, 255, 0.15)",
  success: "#10B981",
  successBg: "rgba(16, 185, 129, 0.1)",
  warning: "#F59E0B",
  warningBg: "rgba(245, 158, 11, 0.1)",
  danger: "#EF4444",
  dangerBg: "rgba(239, 68, 68, 0.1)",
  info: "#3B82F6",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
};

export const priorityColor = (p: string) => {
  if (p === "urgent") return colors.danger;
  if (p === "action") return colors.warning;
  return colors.primaryGlow;
};

export const priorityBg = (p: string) => {
  if (p === "urgent") return colors.dangerBg;
  if (p === "action") return colors.warningBg;
  return colors.primaryMuted;
};
