// DEPRECATED — the Resume Hub (builder + vault) has been replaced by the
// new Career Resume Library screen.
import { Redirect } from "expo-router";
export default function ResumeHubRedirect() {
  return <Redirect href="/(tabs)/career" />;
}
