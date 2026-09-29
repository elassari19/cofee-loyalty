"use client";

import { useId } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Controller,
  useForm,
  type FieldValues,
  type Path,
  type Resolver,
  type UseFormProps,
  type UseFormReturn,
} from "react-hook-form";
import type { z } from "zod";
import { cn } from "cn";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";

/**
 * Shared form pattern (checklist §3 bullet 4): react-hook-form + zod, built on
 * the accessible `Field` primitives (label ↔ control association, described-by
 * hint text, `role="alert"` errors). One shape for every form keeps validation
 * messages, focus order and error announcements consistent.
 */

export function useZodForm<T extends FieldValues>(
  schema: z.ZodType<T, unknown>,
  options?: Pick<UseFormProps<T>, "defaultValues">,
): UseFormReturn<T> {
  return useForm<T>({
    resolver: zodResolver(
      schema as unknown as z.ZodType<T, FieldValues>,
    ) as unknown as Resolver<T>,
    mode: "onBlur",
    ...options,
  }) as UseFormReturn<T>;
}

interface AppFormProps<T extends FieldValues> extends Omit<
  React.ComponentProps<"form">,
  "onSubmit" | "className"
> {
  form: UseFormReturn<T>;
  onSubmit: (values: T) => void | Promise<void>;
  className?: string;
}

export function AppForm<T extends FieldValues>({
  form,
  onSubmit,
  className,
  children,
  ...rest
}: AppFormProps<T>) {
  return (
    <form
      noValidate
      onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
      className={cn("flex flex-col gap-5", className)}
      {...rest}
    >
      {children}
    </form>
  );
}

function messageOf(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("message" in error)) {
    return undefined;
  }
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : undefined;
}

interface TextFieldProps<T extends FieldValues> {
  form: UseFormReturn<T>;
  name: Path<T>;
  label: string;
  description?: string;
  placeholder?: string;
  type?: HTMLInputElement["type"];
  inputMode?: React.ComponentProps<"input">["inputMode"];
  autoComplete?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

export function TextField<T extends FieldValues>({
  form,
  name,
  label,
  description,
  className,
  ...inputProps
}: TextFieldProps<T>) {
  const id = useId();
  const error = form.formState.errors[name];
  const message = messageOf(error);
  const describedBy =
    description || message
      ? [
          description ? `${id}-description` : null,
          message ? `${id}-error` : null,
        ]
          .filter(Boolean)
          .join(" ")
      : undefined;

  return (
    <Field className={className}>
      <FieldLabel htmlFor={id}>
        {label}
        {inputProps.required ? (
          <span aria-hidden="true" className="text-destructive">
            *
          </span>
        ) : null}
      </FieldLabel>
      <Input
        id={id}
        aria-invalid={message ? true : undefined}
        aria-describedby={describedBy}
        placeholder={inputProps.placeholder}
        {...inputProps}
        {...form.register(name)}
      />
      {description ? (
        <FieldDescription id={`${id}-description`}>
          {description}
        </FieldDescription>
      ) : null}
      <FieldError id={`${id}-error`}>{message}</FieldError>
    </Field>
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectFieldProps<T extends FieldValues> {
  form: UseFormReturn<T>;
  name: Path<T>;
  label: string;
  options: SelectOption[];
  placeholder?: string;
  description?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

export function SelectField<T extends FieldValues>({
  form,
  name,
  label,
  options,
  placeholder = "Select an option",
  description,
  disabled = false,
  className,
}: SelectFieldProps<T>) {
  const id = useId();
  const error = form.formState.errors[name];
  const message = messageOf(error);

  return (
    <Controller
      control={form.control}
      name={name}
      render={({ field }) => (
        <Field className={className}>
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          <Select
            value={typeof field.value === "string" ? field.value : ""}
            onValueChange={(value) => field.onChange(value ?? "")}
            disabled={disabled || form.formState.isSubmitting}
            items={Object.fromEntries(
              options.map((option) => [option.value, option.label]),
            )}
          >
            <SelectTrigger
              id={id}
              className="w-full"
              aria-invalid={message ? true : undefined}
              aria-describedby={
                message || description ? `${id}-message` : undefined
              }
            >
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {description || message ? (
            <FieldDescription id={`${id}-message`}>
              {message ?? description}
            </FieldDescription>
          ) : null}
          {message ? <FieldError role="alert">{message}</FieldError> : null}
        </Field>
      )}
    />
  );
}

interface TextAreaFieldProps<T extends FieldValues> {
  form: UseFormReturn<T>;
  name: Path<T>;
  label: string;
  description?: string;
  placeholder?: string;
  rows?: number;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

export function TextAreaField<T extends FieldValues>({
  form,
  name,
  label,
  description,
  rows = 3,
  className,
  ...textareaProps
}: TextAreaFieldProps<T>) {
  const id = useId();
  const message = messageOf(form.formState.errors[name]);
  const describedBy =
    description || message
      ? [
          description ? `${id}-description` : null,
          message ? `${id}-error` : null,
        ]
          .filter(Boolean)
          .join(" ")
      : undefined;

  return (
    <Field className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Textarea
        id={id}
        rows={rows}
        aria-invalid={message ? true : undefined}
        aria-describedby={describedBy}
        {...textareaProps}
        {...form.register(name)}
      />
      {description ? (
        <FieldDescription id={`${id}-description`}>
          {description}
        </FieldDescription>
      ) : null}
      <FieldError id={`${id}-error`}>{message}</FieldError>
    </Field>
  );
}

interface SwitchFieldProps<T extends FieldValues> {
  form: UseFormReturn<T>;
  name: Path<T>;
  label: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}

/** Toggle row: label stays clickable and errors render like other fields. */
export function SwitchField<T extends FieldValues>({
  form,
  name,
  label,
  description,
  disabled = false,
  className,
}: SwitchFieldProps<T>) {
  const id = useId();
  const message = messageOf(form.formState.errors[name]);

  return (
    <Controller
      control={form.control}
      name={name}
      render={({ field }) => (
        <div
          className={cn(
            "flex items-start justify-between gap-4 rounded-lg border p-3",
            className,
          )}
        >
          <div className="flex min-w-0 flex-col gap-0.5">
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            {description ? (
              <FieldDescription id={`${id}-description`}>
                {description}
              </FieldDescription>
            ) : null}
            {message ? <FieldError role="alert">{message}</FieldError> : null}
          </div>
          <Switch
            id={id}
            checked={field.value === true}
            onCheckedChange={field.onChange}
            onBlur={field.onBlur}
            disabled={disabled || form.formState.isSubmitting}
            aria-describedby={description ? `${id}-description` : undefined}
            className="mt-0.5 shrink-0"
          />
        </div>
      )}
    />
  );
}

export function FormActions({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SubmitButton({
  pending,
  children,
  className,
  disabled,
}: {
  pending: boolean;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <Button
      type="submit"
      disabled={pending || disabled}
      className={className}
      aria-busy={pending}
    >
      {pending ? <Spinner className="size-3.5" aria-hidden="true" /> : null}
      {pending ? "Saving…" : children}
    </Button>
  );
}
