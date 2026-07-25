
"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"
import { useDialogBack } from "@/contexts/DialogBackHandlerContext"
import {
  IN_APP_ATTACHMENT_PREVIEW_CLICK_SHIELD,
  isInAppAttachmentPreviewOpen,
} from "@/lib/inAppAttachmentPreviewOpen"
import {
  installNativeFilePickerListeners,
  isNativeFilePickerLikelyOpen,
} from "@/lib/nativeFilePickerDialogGuard"

/** Radix outside events: target in-app preview / ghost-shield ho ki grace/DOM khula — Edit Transaction dismiss roknu */
function shouldBlockDismissForInAppAttachmentPreview(ev: { detail?: { originalEvent?: Event } }): boolean {
  const t = ev.detail?.originalEvent?.target
  if (t instanceof Element) {
    if (
      t.closest(
        `[data-in-app-pdf-preview], [data-in-app-image-preview], [${IN_APP_ATTACHMENT_PREVIEW_CLICK_SHIELD}]`
      )
    )
      return true
  }
  return isInAppAttachmentPreviewOpen()
}

/** Root with global back handling: first back closes dialog, second back navigates. */
function Dialog(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  useDialogBack(props.open, props.onOpenChange)
  return <DialogPrimitive.Root {...props} />
}

const DialogTrigger = DialogPrimitive.Trigger

/**
 * Parent `open`/`onOpenChange` se controlled dialog: trigger bahar rakho.
 * `DialogTrigger asChild` + Button ref merge → "Maximum update depth" loop (party groups tab).
 */
function DialogControlledOpener({
  controlled,
  children,
}: {
  controlled: boolean;
  children?: React.ReactNode;
}) {
  if (!children) return null;
  if (controlled) return <>{children}</>;
  return <DialogTrigger asChild>{children}</DialogTrigger>;
}

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/45 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    hideCloseButton?: boolean;
    /** Overlay dim/blur override — default `bg-black/45 backdrop-blur-sm` */
    overlayClassName?: string;
  }
>(({ className, children, hideCloseButton = false, overlayClassName, ...props }, ref) => {
  /** Radix: bina DialogDescription ke warning hatane ke liye — ya phir caller `aria-describedby` de sakta hai */
  const { onPointerDownOutside, onInteractOutside, onFocusOutside, "aria-describedby": ariaDescribedBy, ...rest } = props
  const preventCloseWhilePreviewOpen = (e: {
    detail?: { originalEvent?: Event }
    preventDefault: () => void
  }) => {
    if (shouldBlockDismissForInAppAttachmentPreview(e)) e.preventDefault()
    if (isNativeFilePickerLikelyOpen()) e.preventDefault()
  }
  installNativeFilePickerListeners()
  return (
    <DialogPortal>
      {/* overlayClassName: Copy ledger jaise dialogs pe kam blur / halka dim — background party dikhe */}
      <DialogOverlay className={overlayClassName} />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
          className
        )}
        onPointerDownOutside={(ev) => {
          preventCloseWhilePreviewOpen(ev)
          onPointerDownOutside?.(ev)
        }}
        onInteractOutside={(ev) => {
          preventCloseWhilePreviewOpen(ev)
          onInteractOutside?.(ev)
        }}
        onFocusOutside={(ev) => {
          preventCloseWhilePreviewOpen(ev)
          onFocusOutside?.(ev)
        }}
        aria-describedby={ariaDescribedBy}
        {...rest}
      >
        {children}
        {!hideCloseButton && (
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
})
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogControlledOpener,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
