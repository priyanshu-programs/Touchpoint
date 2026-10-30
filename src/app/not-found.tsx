import Link from "next/link";
import { BrandLockup } from "@/components/brand-mark";

export default function NotFound() {
  return (
    <main className="grid flex-1 content-center justify-items-center gap-3 p-6 text-center">
      <BrandLockup className="mb-3" />
      <h1 className="text-xl font-semibold">Not found</h1>
      <p className="text-muted-foreground">
        This page does not exist, or the link is out of date.
      </p>
      <Link href="/" className="text-sm underline">
        Back to Touchpoint
      </Link>
    </main>
  );
}
