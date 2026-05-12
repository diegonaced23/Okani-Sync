import {
  Baby, Banknote, BookOpen, Briefcase, Building2, Car, CircleDollarSign,
  Coffee, Coins, CreditCard, Dumbbell, Ellipsis, Folder, Gift, Heart,
  HeartPulse, Home, Laptop, Music, PawPrint, Phone, PiggyBank, Plane,
  Scale, Scissors, Shirt, ShoppingCart, Star, Tag, TrendingUp, Tv,
  UtensilsCrossed, Wallet, Zap,
} from "lucide-react";
import type { LucideProps } from "lucide-react";

type LucideIcon = React.ComponentType<LucideProps>;

export const CATEGORY_ICON_MAP: Record<string, LucideIcon> = {
  "utensils":        UtensilsCrossed,
  "shopping-cart":   ShoppingCart,
  "cart":            ShoppingCart,
  "car":             Car,
  "plane":           Plane,
  "home":            Home,
  "home2":           Home,
  "zap":             Zap,
  "heart-pulse":     HeartPulse,
  "heart":           Heart,
  "music":           Music,
  "book-open":       BookOpen,
  "shirt":           Shirt,
  "coffee":          Coffee,
  "dumbbell":        Dumbbell,
  "paw-print":       PawPrint,
  "baby":            Baby,
  "scissors":        Scissors,
  "phone":           Phone,
  "briefcase":       Briefcase,
  "laptop":          Laptop,
  "trending-up":     TrendingUp,
  "gift":            Gift,
  "building-2":      Building2,
  "piggy-bank":      PiggyBank,
  "banknote":        Banknote,
  "coins":           Coins,
  "star":            Star,
  "circle-ellipsis": Ellipsis,
  "tag":             Tag,
  "folder":          Folder,
  "credit-card":     CreditCard,
  "tv":              Tv,
  "wallet":          Wallet,
  "scale":           Scale,
};

export function CategoryIcon({ name, ...props }: { name: string } & LucideProps) {
  const Icon = CATEGORY_ICON_MAP[name] ?? CircleDollarSign;
  return <Icon {...props} />;
}
