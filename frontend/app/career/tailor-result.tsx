// DEPRECATED — old results view replaced by tailor-result-v2.
import { Redirect, useLocalSearchParams } from "expo-router";
export default function TailorResultRedirect() {
  const { version_id } = useLocalSearchParams<{ version_id?: string }>();
  return <Redirect href={("/career/tailor-result-v2" + (version_id ? `?version_id=${version_id}` : "")) as any} />;
}
