// Adapted from the MIT-licensed shadcn/ui Radix Dialog pattern.
import { useRef, type ComponentProps } from "react";
import * as Primitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";
import { en } from "../../locales/en";

export const Dialog = Primitive.Root;
export const DialogTrigger = Primitive.Trigger;
export const DialogClose = Primitive.Close;

export function DialogContent({
  className,
  children,
  showCloseButton = true,
  closeLabel = en.closeDialog,
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...props
}: ComponentProps<typeof Primitive.Content> & { showCloseButton?: boolean; closeLabel?: string }) {
  const returnFocus = useRef<HTMLElement | null>(null);
  return (
    <Primitive.Portal>
      <Primitive.Overlay className="dialog-overlay" />
      <Primitive.Content
        className={cn("dialog-content", className)}
        onOpenAutoFocus={(event) => {
          returnFocus.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
          onOpenAutoFocus?.(event);
        }}
        onCloseAutoFocus={(event) => {
          onCloseAutoFocus?.(event);
          if (event.defaultPrevented) return;
          const target = returnFocus.current?.isConnected
            ? returnFocus.current
            : document.querySelector<HTMLElement>("[data-dialog-focus-fallback]");
          if (target) {
            event.preventDefault();
            target.focus();
          }
        }}
        {...props}
      >
        {children}
        {showCloseButton && (
          <Primitive.Close
            className="ui-button ui-button-ghost ui-button-icon dialog-close"
            aria-label={closeLabel}
          >
            <X size={18} aria-hidden="true" />
          </Primitive.Close>
        )}
      </Primitive.Content>
    </Primitive.Portal>
  );
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof Primitive.Title>) {
  return <Primitive.Title className={cn("dialog-title", className)} {...props} />;
}

export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof Primitive.Description>) {
  return <Primitive.Description className={cn("muted dialog-description", className)} {...props} />;
}
