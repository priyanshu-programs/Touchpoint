import CrystalizedBall from "@/components/crystalized-ball";

// The crystal ball while a reply is on its way. Its light look in both themes: the dark
// one adds light up and turns a ball this small white.
export function ThinkingBall({ label }: { label: string }) {
  return (
    <div role="status" className="flex items-center gap-3">
      <div className="size-12 shrink-0">
        <CrystalizedBall color="#5bf2ab" theme="light" size={0.9} interactive={false} />
      </div>
      <span className="chatcn-shimmer text-sm">{label}</span>
    </div>
  );
}
