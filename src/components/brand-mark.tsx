import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-[22%] bg-[#171717] ring-1 ring-black/5 dark:ring-white/10",
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/Images/touchpoint-mark.svg"
        alt=""
        width={316}
        height={316}
        className="size-full object-contain"
      />
    </span>
  );
}

export function BrandLockup({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <BrandMark className="size-9" />
      <span className="text-lg font-semibold tracking-tight">Touchpoint</span>
    </div>
  );
}
