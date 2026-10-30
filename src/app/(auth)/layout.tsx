import { BrandLockup } from "@/components/brand-mark";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <BrandLockup className="mb-6 justify-center" />
        {children}
      </div>
    </main>
  );
}
