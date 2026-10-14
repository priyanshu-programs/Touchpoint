import {
  File,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType,
  Link2,
  NotebookPen,
  Presentation,
} from "lucide-react";
import type { BoxKind } from "@/modules/workflows/drawing";

const ICONS: Record<BoxKind, typeof File> = {
  pdf: FileText,
  word: FileType,
  excel: FileSpreadsheet,
  powerpoint: Presentation,
  picture: FileImage,
  file: File,
  link: Link2,
  note: NotebookPen,
};

// The icon for one kind of thing a box carries, on its mark and in its card.
export function KindIcon({ kind, className }: { kind: BoxKind; className: string }) {
  const Icon = ICONS[kind];
  return <Icon aria-hidden data-kind={kind} className={className} />;
}
