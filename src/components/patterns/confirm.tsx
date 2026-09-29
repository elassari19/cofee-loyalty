"use client";

import { useState, type ReactNode } from "react";
import { TriangleAlertIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { notify } from "./toast";

/**
 * Confirmation pattern (checklist §3 bullets 4–5).
 *
 * Destructive or value-affecting actions (deactivating rewards, adjusting
 * balances, clearing points) never run on the first click: this dialog states
 * the consequence, requires an explicit confirm, then reports the actual
 * result through a toast — including failures ("Nothing was changed").
 */

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** What exactly will happen if confirmed. */
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  /** Shown on success, e.g. "Reward deactivated. Customers can no longer redeem it." */
  successMessage?: string;
  /** Shown when the action fails; defaults to the thrown error message. */
  errorMessage?: string;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  successMessage,
  errorMessage = "Something went wrong. Nothing was changed.",
}: ConfirmDialogProps) {
  const [pending, setPending] = useState(false);

  async function handleConfirm() {
    setPending(true);
    try {
      await onConfirm();
      onOpenChange(false);
      if (successMessage) notify.success(successMessage);
    } catch (error) {
      onOpenChange(false);
      notify.error(
        error instanceof Error && error.message ? error.message : errorMessage,
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {destructive ? (
              <TriangleAlertIcon
                aria-hidden="true"
                className="text-destructive size-5 shrink-0"
              />
            ) : null}
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            {cancelLabel}
          </AlertDialogCancel>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={() => void handleConfirm()}
            disabled={pending}
            aria-busy={pending}
          >
            {pending ? "Working…" : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export interface ConfirmButtonProps extends Omit<
  ConfirmDialogProps,
  "open" | "onOpenChange"
> {
  children: ReactNode;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  disabled?: boolean;
  className?: string;
}

/** Trigger button + confirmation dialog in one, for dense lists and toolbars. */
export function ConfirmButton({
  children,
  variant,
  size,
  disabled,
  className,
  ...dialogProps
}: ConfirmButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant={
          variant ?? (dialogProps.destructive ? "destructive" : "outline")
        }
        size={size}
        disabled={disabled}
        className={className}
        onClick={() => setOpen(true)}
      >
        {children}
      </Button>
      <ConfirmDialog open={open} onOpenChange={setOpen} {...dialogProps} />
    </>
  );
}
