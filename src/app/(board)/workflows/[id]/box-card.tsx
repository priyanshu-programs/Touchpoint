import { Button } from "@/components/ui/button";

// What the selected box is to the workflow. It floats over the whiteboard, clear
// of the whiteboard's own controls: under them at the right on a wide screen,
// above the bar along the foot of a phone.
export function BoxCard({
  isStage,
  onChange,
}: {
  isStage: boolean;
  onChange: (isStage: boolean) => void;
}) {
  return (
    <section
      aria-label="Selected box"
      className="absolute inset-x-3 bottom-20 z-10 grid gap-2 rounded-lg border bg-popover p-3 text-sm text-popover-foreground shadow-md sm:inset-x-auto sm:top-16 sm:right-3 sm:bottom-auto sm:w-60"
    >
      <p className="text-muted-foreground">
        {isStage
          ? "This box is a stage of the workflow, named by the text inside it."
          : "A stage is a step a client goes through. Its name is the text inside the box."}
      </p>
      <Button
        variant={isStage ? "outline" : "default"}
        size="sm"
        className="justify-self-start"
        onClick={() => onChange(!isStage)}
      >
        {isStage ? "Not a stage" : "Make this a stage"}
      </Button>
    </section>
  );
}
