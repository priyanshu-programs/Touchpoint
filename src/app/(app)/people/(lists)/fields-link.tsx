import { Settings } from "lucide-react";
import Link from "next/link";

// The gear beside a Details heading; it opens the Fields panel over the record.
export function FieldsLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-label="Fields"
      className="rounded-md p-1 text-muted-foreground hover:text-foreground"
    >
      <Settings aria-hidden className="size-4" />
    </Link>
  );
}
