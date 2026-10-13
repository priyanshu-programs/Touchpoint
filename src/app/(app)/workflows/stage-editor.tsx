"use client";

import { MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROW_CONTROL } from "../people/(lists)/field-list";
import { removeStageAction, reorderStagesAction } from "./actions";
import { StageForm, type StageValues } from "./stage-form";
import { StageList } from "./stage-list";

export type StageEditorRow = StageValues & { detail: string };

const FORM_DIALOG = "max-h-[90dvh] overflow-y-auto sm:max-w-xl";

// The stages of one workflow: added, opened to edit, put in order and deleted.
export function StageEditor({
  templateId,
  stages,
}: {
  templateId: string;
  stages: StageEditorRow[];
}) {
  // The stage a dialog is about stays set while the dialog closes, so its
  // words do not go blank on the way out.
  const [open, setOpen] = useState<"new" | "edit" | "delete" | null>(null);
  const [chosen, setChosen] = useState<StageEditorRow | null>(null);
  const close = (isOpen: boolean) => !isOpen && setOpen(null);
  const choose = (stage: StageEditorRow, dialog: "edit" | "delete") => {
    setChosen(stage);
    setOpen(dialog);
  };

  return (
    <div className="grid gap-3">
      {stages.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No stages yet. Add the one a client starts in.
        </p>
      ) : (
        <StageList
          // It keeps the order in state, so a stage added or deleted on the
          // server needs the list built again; a move or an edit does not.
          key={stages
            .map(({ id }) => id)
            .sort()
            .join()}
          stages={stages}
          action={reorderStagesAction.bind(null, templateId)}
          onOpen={(stage) => choose(stage, "edit")}
          menu={(stage) => (
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={`Actions for ${stage.name}`}
                className={ROW_CONTROL}
              >
                <MoreVertical aria-hidden className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-auto min-w-36">
                <DropdownMenuItem onClick={() => choose(stage, "edit")}>
                  <Pencil aria-hidden />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => choose(stage, "delete")}
                >
                  <Trash2 aria-hidden />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        />
      )}
      <Button
        variant="outline"
        className="justify-self-start"
        onClick={() => setOpen("new")}
      >
        <Plus aria-hidden />
        Add stage
      </Button>

      <Dialog open={open === "new"} onOpenChange={close}>
        <DialogContent className={FORM_DIALOG}>
          <DialogHeader>
            <DialogTitle>New stage</DialogTitle>
            <DialogDescription>
              It goes at the end. Drag it to where it belongs afterwards.
            </DialogDescription>
          </DialogHeader>
          <StageForm
            templateId={templateId}
            stage={null}
            onSaved={() => setOpen(null)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={open === "edit"} onOpenChange={close}>
        <DialogContent className={FORM_DIALOG}>
          <DialogHeader>
            <DialogTitle>Edit stage</DialogTitle>
            <DialogDescription>
              Workflows already running keep the stage as it was when they
              started.
            </DialogDescription>
          </DialogHeader>
          {chosen && (
            <StageForm
              key={chosen.id}
              templateId={templateId}
              stage={chosen}
              onSaved={() => setOpen(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={open === "delete"} onOpenChange={close}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {chosen?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The stage is removed from this workflow, with its checklist and
              tasks. Workflows already running keep their own copy of it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <form
              action={async (formData) => {
                await removeStageAction(formData);
                setOpen(null);
              }}
            >
              <input type="hidden" name="templateId" value={templateId} />
              <input type="hidden" name="stageId" value={chosen?.id ?? ""} />
              <AlertDialogAction
                type="submit"
                variant="destructive"
                className="w-full"
              >
                Delete stage
              </AlertDialogAction>
            </form>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
