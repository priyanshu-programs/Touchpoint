import Link from "next/link";
import { BrandLockup } from "@/components/brand-mark";

export default function NotFound() {
  return (
    <main className="grid justify-items-start gap-3 p-6">
      <BrandLockup className="mb-3" />
      <h1 className="text-xl font-semibold">Not found</h1>
      <p className="text-muted-foreground">
        This workflow does not exist, or the link is out of date.
      </p>
      <Link href="/workflows" className="text-sm underline">
        Back to Workflows
      </Link>
    </main>
  );
}
