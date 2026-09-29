"use client";

import { toast } from "sonner";

type ToastOptions = Parameters<typeof toast.success>[1];

/**
 * Toast helpers (checklist §3 bullets 4–5).
 *
 * Every value-affecting action reports its *result* — what changed, not that
 * "something happened" — so a cashier or owner always knows whether the
 * operation committed:
 *
 *   notify.success("Reward deactivated. Customers can no longer redeem it.");
 *   notify.error("Could not save the reward. Nothing was changed.");
 */
export const notify = {
  success(message: string, options?: ToastOptions) {
    return toast.success(message, options);
  },
  error(message: string, options?: ToastOptions) {
    return toast.error(message, options);
  },
  info(message: string, options?: ToastOptions) {
    return toast.info(message, options);
  },
  warning(message: string, options?: ToastOptions) {
    return toast.warning(message, options);
  },
  loading(message: string, options?: ToastOptions) {
    return toast.loading(message, options);
  },
  dismiss(id?: string | number) {
    return toast.dismiss(id);
  },
};
