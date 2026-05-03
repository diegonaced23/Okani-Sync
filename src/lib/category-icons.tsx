import {
  Utensils, ShoppingCart, Car, Plane, Home, Zap,
  HeartPulse, Music, BookOpen, Shirt, Coffee, Dumbbell,
  PawPrint, Baby, Scissors, Phone,
  Briefcase, Laptop, TrendingUp, Gift, Building2,
  PiggyBank, Banknote, Coins, Star,
  CircleEllipsis, Tag, Folder, Circle,
  type LucideIcon,
} from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  "utensils": Utensils,
  "shopping-cart": ShoppingCart,
  "car": Car,
  "plane": Plane,
  "home": Home,
  "zap": Zap,
  "heart-pulse": HeartPulse,
  "music": Music,
  "book-open": BookOpen,
  "shirt": Shirt,
  "coffee": Coffee,
  "dumbbell": Dumbbell,
  "paw-print": PawPrint,
  "baby": Baby,
  "scissors": Scissors,
  "phone": Phone,
  "briefcase": Briefcase,
  "laptop": Laptop,
  "trending-up": TrendingUp,
  "gift": Gift,
  "building-2": Building2,
  "piggy-bank": PiggyBank,
  "banknote": Banknote,
  "coins": Coins,
  "star": Star,
  "circle-ellipsis": CircleEllipsis,
  "tag": Tag,
  "folder": Folder,
  "circle": Circle,
};

type CategoryIconProps = {
  name: string;
  className?: string;
  style?: React.CSSProperties;
  strokeWidth?: number;
  "aria-hidden"?: boolean | "true" | "false";
};

export function CategoryIcon({ name, className, style, strokeWidth, "aria-hidden": ariaHidden }: CategoryIconProps) {
  const Icon = ICON_MAP[name] ?? Circle;
  return <Icon className={className} style={style} strokeWidth={strokeWidth} aria-hidden={ariaHidden} />;
}
