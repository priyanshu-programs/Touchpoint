import {
  BookOpen,
  Briefcase,
  Calendar,
  Camera,
  ChartColumn,
  Code,
  Coffee,
  Compass,
  DollarSign,
  FileText,
  Flag,
  Globe,
  GraduationCap,
  Handshake,
  Heart,
  House,
  Lightbulb,
  Mail,
  Megaphone,
  Mic,
  Package,
  Palette,
  PenTool,
  Phone,
  Rocket,
  Scale,
  Shapes,
  Shield,
  Star,
  Target,
  Trophy,
  Truck,
  Users,
  Wrench,
  Zap,
} from "lucide-react";
import { isWorkflowIcon, type WorkflowIcon } from "@/modules/workflows/icons";

const ICONS: Record<WorkflowIcon, typeof Briefcase> = {
  briefcase: Briefcase,
  handshake: Handshake,
  rocket: Rocket,
  target: Target,
  megaphone: Megaphone,
  "pen-tool": PenTool,
  palette: Palette,
  code: Code,
  camera: Camera,
  mic: Mic,
  "file-text": FileText,
  "book-open": BookOpen,
  mail: Mail,
  phone: Phone,
  calendar: Calendar,
  users: Users,
  "graduation-cap": GraduationCap,
  scale: Scale,
  "chart-column": ChartColumn,
  "dollar-sign": DollarSign,
  package: Package,
  truck: Truck,
  house: House,
  wrench: Wrench,
  lightbulb: Lightbulb,
  compass: Compass,
  globe: Globe,
  shield: Shield,
  zap: Zap,
  heart: Heart,
  star: Star,
  flag: Flag,
  trophy: Trophy,
  coffee: Coffee,
};

export const iconLabel = (icon: WorkflowIcon) =>
  icon.charAt(0).toUpperCase() + icon.slice(1).replace(/-/g, " ");

// A workflow's icon, or a muted placeholder for one without. A key that is not
// in the list (one removed since it was stored) draws the placeholder too.
export function WorkflowIconGlyph({
  icon,
  className,
}: {
  icon: string | null;
  className: string;
}) {
  if (!isWorkflowIcon(icon)) {
    return <Shapes aria-hidden data-icon="none" className={className} />;
  }
  const Icon = ICONS[icon];
  return <Icon aria-hidden data-icon={icon} className={className} />;
}
