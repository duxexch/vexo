import * as React from "react"

import { cn } from "@/lib/utils"

function findNextFocusableInForm(current: HTMLInputElement): HTMLElement | null {
  const form = current.form;
  if (!form) return null;

  const focusable = Array.from(
    form.querySelectorAll<HTMLElement>("input, select, textarea")
  ).filter((el) => {
    if (el.hasAttribute("disabled")) return false;
    if (el.getAttribute("tabindex") === "-1") return false;
    if (el instanceof HTMLInputElement && el.type === "hidden") return false;
    if (el instanceof HTMLInputElement && el.readOnly) return false;
    if (el instanceof HTMLTextAreaElement && el.readOnly) return false;
    if (el.getAttribute("aria-hidden") === "true") return false;
    return el.offsetParent !== null;
  });

  const currentIndex = focusable.indexOf(current);
  if (currentIndex === -1) return null;

  return focusable[currentIndex + 1] ?? null;
}

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    // h-9 to match icon buttons and default buttons.
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        ref={ref}
        onKeyDown={(event) => {
          props.onKeyDown?.(event);

          if (event.defaultPrevented) return;
          if (event.key !== "Enter") return;
          if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;

          const target = event.currentTarget;
          if (!(target instanceof HTMLInputElement)) return;

          const next = findNextFocusableInForm(target);
          if (!next) return;

          event.preventDefault();
          next.focus({ preventScroll: true });
          next.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
        }}
        onFocus={(event) => {
          props.onFocus?.(event);
          if (event.defaultPrevented) return;

          // Keep the focused field in a comfortable thumb zone on phones.
          if (window.innerWidth > 1024) return;

          event.currentTarget.scrollIntoView({
            behavior: "smooth",
            block: "center",
            inline: "nearest",
          });
        }}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
