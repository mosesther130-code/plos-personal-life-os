// Category color mapping for expenses.
import { colors } from "@/src/lib/theme";
import {
  Home,
  Zap,
  ShieldCheck,
  Car,
  CreditCard,
  ShoppingBag,
  Phone,
  Heart,
  Tv,
  HelpCircle,
} from "lucide-react-native";

export interface CategoryMeta {
  color: string;
  icon: any;
}

const HOUSING = "#3B82F6"; // blue
const UTILITIES = "#60A5FA"; // light blue
const INSURANCE = "#10B981"; // green
const TRANSPORT = "#9CA3AF"; // gray
const DEBT = "#EF4444"; // red
const PHONE = "#A855F7"; // purple
const FOOD = "#F59E0B"; // amber
const STREAMING = "#EC4899"; // pink
const HEALTH = "#F43F5E"; // rose
const OTHER = colors.textSecondary;

const MAP: Record<string, CategoryMeta> = {
  housing: { color: HOUSING, icon: Home },
  rent: { color: HOUSING, icon: Home },
  mortgage: { color: HOUSING, icon: Home },
  utilities: { color: UTILITIES, icon: Zap },
  electricity: { color: UTILITIES, icon: Zap },
  water: { color: UTILITIES, icon: Zap },
  insurance: { color: INSURANCE, icon: ShieldCheck },
  transport: { color: TRANSPORT, icon: Car },
  transportation: { color: TRANSPORT, icon: Car },
  gas: { color: TRANSPORT, icon: Car },
  auto: { color: TRANSPORT, icon: Car },
  debt: { color: DEBT, icon: CreditCard },
  "credit card": { color: DEBT, icon: CreditCard },
  loan: { color: DEBT, icon: CreditCard },
  phone: { color: PHONE, icon: Phone },
  groceries: { color: FOOD, icon: ShoppingBag },
  food: { color: FOOD, icon: ShoppingBag },
  streaming: { color: STREAMING, icon: Tv },
  entertainment: { color: STREAMING, icon: Tv },
  health: { color: HEALTH, icon: Heart },
  medical: { color: HEALTH, icon: Heart },
};

export function categoryMeta(category: string): CategoryMeta {
  if (!category) return { color: OTHER, icon: HelpCircle };
  const key = category.trim().toLowerCase();
  return MAP[key] || { color: OTHER, icon: HelpCircle };
}
