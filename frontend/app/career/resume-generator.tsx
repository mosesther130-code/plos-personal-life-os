// DEPRECATED — old Resume Builder Form + Generation Holder has been removed.
// Redirects to the new Resume + JD Library screen.
import { Redirect } from "expo-router";
export default function ResumeGeneratorRedirect() {
  return <Redirect href="/(tabs)/career" />;
}
