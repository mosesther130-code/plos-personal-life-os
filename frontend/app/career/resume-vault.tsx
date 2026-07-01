// Legacy /career/resume-vault route — merged into /resume-hub as a tab.
// Auto-redirect for any lingering deeplinks or old navigation calls.
import { Redirect } from "expo-router";

export default function ResumeVaultRedirect() {
  return <Redirect href="/resume-hub" />;
}
