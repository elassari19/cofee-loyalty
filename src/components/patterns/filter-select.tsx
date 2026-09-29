"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * URL-driven filter select (checklist §3 bullet 2): changing the value updates
 * `?param=` and the server page re-renders with the filter applied — no local
 * state to fall out of sync with what the URL says.
 */
export function FilterSelect({
  param,
  label,
  value,
  options,
  allLabel = "All",
  className,
}: {
  param: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  allLabel?: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function apply(next: string | null) {
    if (next === null) return;
    const params = new URLSearchParams(searchParams.toString());
    if (next && next !== "all") {
      params.set(param, next);
    } else {
      params.delete(param);
    }
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div className={className}>
      <Label htmlFor={`filter-${param}`} className="sr-only">
        {label}
      </Label>
      <Select
        value={value || "all"}
        onValueChange={apply}
        items={{
          all: allLabel,
          ...Object.fromEntries(
            options.map((option) => [option.value, option.label]),
          ),
        }}
      >
        <SelectTrigger id={`filter-${param}`} className="w-full sm:w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{allLabel}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
