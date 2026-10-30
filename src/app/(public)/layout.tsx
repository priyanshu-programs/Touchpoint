import Link from "next/link";
import { BrandLockup } from "@/components/brand-mark";

// Pages anyone can open without signing in. They show nothing from the database.
export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-10">
      <header className="mb-8">
        <Link href="/about" className="inline-block">
          <BrandLockup />
        </Link>
      </header>
      <main className="grid flex-1 content-start gap-6 text-sm leading-6">{children}</main>
      <footer className="mt-12 flex flex-wrap gap-4 border-t pt-4 text-sm text-muted-foreground">
        <Link href="/about" className="hover:underline">
          About
        </Link>
        <Link href="/privacy" className="hover:underline">
          Privacy
        </Link>
        <Link href="/sign-in" className="hover:underline">
          Sign in
        </Link>
      </footer>
    </div>
  );
}
