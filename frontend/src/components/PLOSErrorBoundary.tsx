// Global + module-scoped React error boundary for PLOS.
// Guarantees the app never renders a white crash screen. Instead it shows a
// friendly recovery card with a Retry (soft reset local state) button and,
// for the global boundary, a Go To Dashboard button.
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { colors, spacing } from "@/src/lib/theme";

type Props = {
  children: React.ReactNode;
  moduleName?: string;                       // e.g. "Career", "Safety" — used in message
  onReset?: () => void;                       // caller-supplied soft reset
  onGoDashboard?: () => void;                 // only wired for the global boundary
  scope?: "global" | "module";               // controls copy + secondary CTA
};

type State = { hasError: boolean; error: Error | null };

export default class PLOSErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Log locally. In production we can pipe this to Sentry/Crashlytics.
    console.error(`[PLOS ErrorBoundary${this.props.moduleName ? " " + this.props.moduleName : ""}]`, error, info?.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  handleGoDashboard = () => {
    this.setState({ hasError: false, error: null });
    this.props.onGoDashboard?.();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    const isGlobal = this.props.scope !== "module";
    const moduleLabel = this.props.moduleName ? `The ${this.props.moduleName} module` : "PLOS";
    const title = isGlobal ? "Something went wrong" : "This section is temporarily unavailable";
    const message = isGlobal
      ? "PLOS encountered an unexpected error. Your data is safe."
      : `${moduleLabel} could not load. Tap Try Again to reload — the rest of the app keeps working.`;
    return (
      <View style={styles.container} testID="error-boundary">
        <View style={styles.card}>
          <Text style={styles.emoji}>{isGlobal ? "⚠️" : "🔄"}</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={this.handleReset} testID="error-retry">
            <Text style={styles.primaryBtnText}>Try Again</Text>
          </TouchableOpacity>
          {isGlobal && (
            <TouchableOpacity style={styles.secondaryBtn} onPress={this.handleGoDashboard} testID="error-goto-dashboard">
              <Text style={styles.secondaryBtnText}>Go to Dashboard</Text>
            </TouchableOpacity>
          )}
          {__DEV__ && this.state.error && (
            <Text style={styles.devErrorText} numberOfLines={4}>{String(this.state.error.message || this.state.error)}</Text>
          )}
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  card: {
    width: "100%", maxWidth: 420, backgroundColor: colors.surface, borderRadius: 16,
    padding: spacing.xl, alignItems: "center",
    borderWidth: 1, borderColor: colors.border,
    ...Platform.select({ ios: { shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } }, android: { elevation: 4 } }),
  },
  emoji: { fontSize: 36, marginBottom: spacing.sm },
  title: { color: colors.text, fontSize: 18, fontWeight: "800", textAlign: "center", marginBottom: spacing.xs },
  message: { color: colors.textSecondary, fontSize: 14, textAlign: "center", lineHeight: 20, marginBottom: spacing.lg },
  primaryBtn: { backgroundColor: colors.primary, paddingVertical: 12, paddingHorizontal: 32, borderRadius: 10, minWidth: 200, alignItems: "center" },
  primaryBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  secondaryBtn: { marginTop: spacing.sm, paddingVertical: 10, paddingHorizontal: 24 },
  secondaryBtnText: { color: colors.textSecondary, fontWeight: "700", fontSize: 13 },
  devErrorText: { marginTop: spacing.md, color: "#EF4444", fontSize: 10, fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }), textAlign: "center" },
});
