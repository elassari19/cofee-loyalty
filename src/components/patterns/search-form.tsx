import { SearchIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * GET search bar (checklist §3 bullet 4).
 *
 * A plain HTML form: it works without JavaScript, keeps the query in the URL
 * (shareable, back-button friendly) and lets the server page apply the filter.
 */
export function SearchForm({
  label,
  placeholder,
  defaultValue = "",
  action,
}: {
  label: string;
  placeholder: string;
  defaultValue?: string;
  /** Path to submit to; defaults to the current one. */
  action?: string;
}) {
  const id = `search-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <form
      action={action}
      method="get"
      role="search"
      className="flex w-full items-end gap-2 sm:max-w-sm"
    >
      <div className="flex-1">
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
        <Input
          id={id}
          type="search"
          name="q"
          placeholder={placeholder}
          defaultValue={defaultValue}
          autoComplete="off"
        />
      </div>
      <Button
        type="submit"
        variant="secondary"
        size="sm"
        className="h-9 shrink-0"
      >
        <SearchIcon aria-hidden="true" />
        Search
      </Button>
    </form>
  );
}
