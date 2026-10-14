"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@iconify/react";
import { NAV_ITEMS, type NavItem } from "./nav-items";
import { ProfileDropdown } from "../ui/ProfileDropdown";
import { usePermissions } from "@/hooks/usePermissions";

const MENU_WIDTH = 224;
const MOBILE_BREAKPOINT = 640; // sm

/* ------------------------------------------------------------------ */
/* Desktop flyout (existing behaviour, unchanged)                     */
/* ------------------------------------------------------------------ */

function DropdownItems({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [side, setSide] = useState<"right" | "left">("right");
  const pathname = usePathname();

  useEffect(() => {
    setOpen(null);
  }, [pathname]);

  const handleOpen = (label: string, element: HTMLDivElement) => {
    const rect = element.getBoundingClientRect();
    const hasRightSpace =
      rect.right + MENU_WIDTH + 8 <= window.innerWidth;
    setSide(hasRightSpace ? "right" : "left");
    setOpen(label);
  };

  return (
    <div className="w-[min(14rem,calc(100vw-2rem))] rounded-md border border-zinc-200 bg-white p-1 shadow-lg">
      {items.map((item) =>
        item.children?.length ? (
          <div
            key={item.label}
            className="relative"
            onMouseEnter={(e) => handleOpen(item.label, e.currentTarget)}
            onMouseLeave={() => setOpen(null)}
          >
            <button
              type="button"
              className="flex w-full items-center justify-between gap-6 rounded px-1 py-2 text-xs text-zinc-700 hover:bg-primary-50 hover:text-primary-600"
            >
              {item.label}
              <Icon icon="mdi:chevron-right" className="h-4 w-4 shrink-0" />
            </button>

            {open === item.label && (
              <div
                className={`absolute top-0 ${side === "right" ? "left-full ml-1" : "right-full mr-1"
                  }`}
              >
                <DropdownItems items={item.children} />
              </div>
            )}
          </div>
        ) : (
          <Link
            key={item.label}
            href={item.href ?? "#"}
            className="block rounded px-1 py-1.5 text-xs text-zinc-700 hover:bg-primary-50 hover:text-primary-600"
          >
            {item.label}
          </Link>
        )
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Mobile accordion (new)                                             */
/* ------------------------------------------------------------------ */

function MobileAccordion({
  items,
  onNavigate,
}: {
  items: NavItem[];
  onNavigate: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="flex flex-col">
      {items.map((item) =>
        item.children?.length ? (
          <div key={item.label} className="border-b border-zinc-100">
            <button
              type="button"
              onClick={() => setOpen(open === item.label ? null : item.label)}
              className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-zinc-700 hover:bg-primary-50"
              aria-expanded={open === item.label}
            >
              {item.label}
              <Icon
                icon="mdi:chevron-down"
                className={`h-4 w-4 transition-transform ${open === item.label ? "rotate-180" : ""
                  }`}
              />
            </button>

            {open === item.label && (
              <div className="bg-zinc-50 px-3 pb-2">
                <MobileAccordion
                  items={item.children}
                  onNavigate={onNavigate}
                />
              </div>
            )}
          </div>
        ) : (
          <Link
            key={item.label}
            href={item.href ?? "#"}
            onClick={onNavigate}
            className="block border-b border-zinc-100 px-4 py-3 text-sm text-zinc-700 hover:bg-primary-50"
          >
            {item.label}
          </Link>
        )
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Navbar                                                              */
/* ------------------------------------------------------------------ */

export function Navbar() {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [menuSide, setMenuSide] = useState<"left" | "right">("left");
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const mobilePanelRef = useRef<HTMLDivElement | null>(null);

  const { hasPermission } = usePermissions();
  const pathname = usePathname();

  /* Close everything on route change */
  useEffect(() => {
    setOpenMenu(null);
    setIsProfileOpen(false);
    setIsMobileOpen(false);
  }, [pathname]);

  /* Body scroll lock while mobile panel is open */
  useEffect(() => {
    if (isMobileOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [isMobileOpen]);

  /* Escape closes mobile panel */
  useEffect(() => {
    if (!isMobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isMobileOpen]);

  /* Outside click closes mobile panel */
  useEffect(() => {
    if (!isMobileOpen) return;
    const onClick = (e: MouseEvent) => {
      if (
        mobilePanelRef.current &&
        !mobilePanelRef.current.contains(e.target as Node)
      ) {
        setIsMobileOpen(false);
      }
    };
    // delay so the same click that opened it doesn't immediately close it
    const id = setTimeout(() => {
      document.addEventListener("mousedown", onClick);
    }, 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", onClick);
    };
  }, [isMobileOpen]);

  const filterNavItems = (items: NavItem[]): NavItem[] => {
    return items
      .map((item) => {
        if (item.children) {
          const filteredChildren = filterNavItems(item.children);
          return { ...item, children: filteredChildren };
        }
        return item;
      })
      .filter((item) => {
        if (item.children) {
          return item.children.length > 0;
        }
        if (item.operation) {
          return hasPermission(item.operation, "view");
        }
        return true;
      });
  };

  const filteredNavItems = filterNavItems(NAV_ITEMS);

  const handleMenuOpen = (label: string, element: HTMLDivElement) => {
    setIsProfileOpen(false);
    const rect = element.getBoundingClientRect();
    const hasRightSpace =
      rect.left + MENU_WIDTH + 8 <= window.innerWidth;
    setMenuSide(hasRightSpace ? "left" : "right");
    setOpenMenu(label);
  };

  return (
    <header className="sticky top-0 z-40 max-w-full border-b border-zinc-200 bg-white">
      {/* Top bar */}
      <nav className="flex max-w-full items-center justify-between px-4 py-2">
        {/* Mobile: hamburger + panel wrapper */}
        <div className="flex items-center gap-2 sm:hidden">
          <button
            type="button"
            onClick={() => setIsMobileOpen((v) => !v)}
            aria-label={isMobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={isMobileOpen}
            className="flex h-9 w-9 items-center justify-center rounded text-zinc-700 hover:bg-primary-50 hover:text-primary-600"
          >
            <Icon
              icon={isMobileOpen ? "mdi:close" : "mdi:menu"}
              className="h-5 w-5"
            />
          </button>
        </div>

        {/* Desktop: horizontal nav items */}
        <div className="hidden flex-wrap items-center gap-1 overflow-x-clip sm:flex">
          {filteredNavItems.map((item) =>
            item.children?.length ? (
              <div
                key={item.label}
                className="relative"
                onMouseEnter={(e) =>
                  handleMenuOpen(item.label, e.currentTarget)
                }
                onMouseLeave={() => setOpenMenu(null)}
              >
                <button
                  type="button"
                  className="flex items-center gap-1 whitespace-nowrap rounded px-1 py-2 text-xs font-medium text-zinc-700 hover:bg-primary-50 hover:text-primary-600"
                >
                  {item.label}
                  <Icon icon="mdi:chevron-down" className="h-4 w-4" />
                </button>

                {openMenu === item.label && (
                  <div
                    className={`absolute top-full pt-1 ${menuSide === "left" ? "left-0" : "right-0"
                      }`}
                  >
                    <DropdownItems items={item.children} />
                  </div>
                )}
              </div>
            ) : (
              <Link
                key={item.label}
                href={item.href ?? "#"}
                className="whitespace-nowrap rounded px-1 py-2 text-xs font-medium text-zinc-700 hover:bg-primary-50 hover:text-primary-600"
              >
                {item.label}
              </Link>
            )
          )}
        </div>

        {/* Right: profile */}
        <ProfileDropdown
          isOpen={isProfileOpen}
          setIsOpen={setIsProfileOpen}
        />
      </nav>

      {/* Mobile panel */}
      {isMobileOpen && (
        <div
          ref={mobilePanelRef}
          className="max-h-[calc(100vh-3.5rem)] overflow-y-auto border-t border-zinc-200 bg-white sm:hidden"
          role="menu"
        >
          <MobileAccordion
            items={filteredNavItems}
            onNavigate={() => setIsMobileOpen(false)}
          />
        </div>
      )}
    </header>
  );
}