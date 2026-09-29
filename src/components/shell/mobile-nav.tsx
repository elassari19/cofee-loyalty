"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { MenuIcon } from "lucide-react";

import type { Role } from "@/auth/roles";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

import { brandForRole } from "./nav-config";
import { SideNav } from "./side-nav";

/** Responsive navigation: a left sheet on small screens, sidebar on ≥md. */
export function MobileNav({ role }: { role: Role }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [renderedPath, setRenderedPath] = useState(pathname);
  const brand = brandForRole(role);

  // Close on navigation (including back/forward) so focus never strands
  // inside the sheet — state adjusted during render instead of an effect.
  if (renderedPath !== pathname) {
    setRenderedPath(pathname);
    if (open) setOpen(false);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label="Open navigation"
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="md:hidden"
            aria-expanded={open}
          />
        }
      >
        <MenuIcon />
      </SheetTrigger>
      <SheetContent side="left" className="w-72 gap-0 p-0 sm:max-w-72">
        <SheetHeader className="border-border border-b">
          <SheetTitle>{brand.name}</SheetTitle>
          <SheetDescription>{brand.context}</SheetDescription>
        </SheetHeader>
        <SideNav
          role={role}
          className="flex-1 overflow-y-auto p-3"
          onNavigate={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  );
}
