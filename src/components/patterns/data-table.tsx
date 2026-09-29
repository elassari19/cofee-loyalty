import { cn } from "cn";

import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Shared table pattern (checklist §3 bullet 4).
 *
 * One component owns the three states every list needs — loading, empty and
 * populated — plus the toolbar/pagination slots, so no screen ships a table
 * that renders as a blank box while data is in flight.
 */

export interface DataTableColumn<T> {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  headerClassName?: string;
  className?: string;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: readonly T[];
  getRowKey: (row: T) => string;
  /** Search fields, filters, primary action. */
  toolbar?: React.ReactNode;
  /** Pagination or result count. */
  footer?: React.ReactNode;
  loading?: boolean;
  /** Rendered instead of the table when there are no rows. */
  empty?: React.ReactNode;
  /** Screen-reader summary of what the table contains. */
  label: string;
  className?: string;
}

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  toolbar,
  footer,
  loading = false,
  empty,
  label,
  className,
}: DataTableProps<T>) {
  const showEmpty = !loading && rows.length === 0;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {toolbar ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {toolbar}
        </div>
      ) : null}

      {loading ? (
        <div
          aria-busy="true"
          aria-live="polite"
          aria-label={`Loading ${label}`}
          className="overflow-hidden rounded-xl border"
        >
          <div className="bg-muted/50 flex gap-4 border-b px-3 py-2.5">
            {columns.map((column) => (
              <Skeleton key={column.key} className="h-4 w-24" />
            ))}
          </div>
          <div className="flex flex-col gap-3 p-3">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-9 w-full" />
            ))}
          </div>
        </div>
      ) : showEmpty ? (
        (empty ?? null)
      ) : (
        <div className="rounded-xl border">
          <Table aria-label={label}>
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <TableHead
                    key={column.key}
                    scope="col"
                    className={column.headerClassName}
                  >
                    {column.header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={getRowKey(row)}>
                  {columns.map((column) => (
                    <TableCell key={column.key} className={column.className}>
                      {column.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {footer ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {footer}
        </div>
      ) : null}
    </div>
  );
}
