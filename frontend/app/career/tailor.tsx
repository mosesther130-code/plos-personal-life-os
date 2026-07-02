// DEPRECATED — old Tailor Modal replaced by the new Tailoring Modal (v2).
import { Redirect } from "expo-router";
import { useLocalSearchParams } from "expo-router";
export default function TailorRedirect() {
  const params = useLocalSearchParams();
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v && q.append(k, String(v)));
  const suffix = q.toString();
  return <Redirect href={("/career/tailor-modal" + (suffix ? `?${suffix}` : "")) as any} />;
}
