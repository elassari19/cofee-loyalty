"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

import type { Role } from "@/auth/roles";

import { navForRole } from "./nav-config";

interface SideNavProps {
  role: Role;
  className?: string;
  /** Called after a link is followed (mobile sheet closes itself). */
  onNavigate?: () => void;
}

/**
 * Keyboard-friendly navigation list: plain links, visible focus rings and
 * `aria-current="page"` on the active destination so screen readers announce
 * position without relying on colour alone.
 */
export function SideNav({ role, className, onNavigate }: SideNavProps) {
  const pathname = usePathname();
  const sections = navForRole(role);

  return (
    <nav aria-label="Main" className={cn("flex flex-col gap-6", className)}>
      {sections.map((section, index) => (
        <div
          key={section.title ?? `section-${index}`}
          className="flex flex-col gap-1"
        >
          {section.title ? (
            <div
              id={`nav-section-${section.title.toLowerCase().replace(/\s+/g, "-")}`}
              className="text-muted-foreground px-2 pb-1 text-[11px] font-medium tracking-wider uppercase"
            >
              {section.title}
            </div>
          ) : null}
          <ul className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const active = item.end
                ? pathname === item.href
                : pathname === item.href ||
                  pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors outline-none",
                      "focus-visible:ring-ring/50 focus-visible:border-ring focus-visible:ring-3",
                      active
                        ? "bg-accent text-accent-foreground font-medium"
                        : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                    )}
                  >
                    <Icon
                      aria-hidden="true"
                      className={cn(
                        "size-4 shrink-0",
                        active
                          ? "text-foreground"
                          : "group-hover:text-foreground",
                      )}
                    />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
