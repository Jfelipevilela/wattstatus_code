import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-[3px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        // Mobile: folha presa ao rodapé. A partir de sm: modal centralizado.
        // O conteúdo rola num container interno sem barra visível; o externo só recorta.
        "fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[28px] border border-border/60 bg-background shadow-[0_24px_64px_-12px_rgba(0,0,0,0.35)] ring-1 ring-black/[0.03] duration-300 dark:ring-white/[0.04]",
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-8 data-[state=closed]:slide-out-to-bottom-8",
        "sm:inset-x-auto sm:bottom-auto sm:left-[50%] sm:top-[50%] sm:max-h-[90dvh] sm:max-w-lg sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-3xl sm:duration-200",
        "sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:zoom-in-95 sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=closed]:slide-out-to-bottom-0",
        className
      )}
      {...props}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-energy-green-light/[0.08] to-transparent"
      />
      <span aria-hidden className="absolute left-1/2 top-2.5 z-10 h-1 w-10 -translate-x-1/2 rounded-full bg-muted-foreground/25 sm:hidden" />
      <div className="relative grid flex-1 gap-5 overflow-y-auto overscroll-contain px-6 pb-6 pt-8 [scrollbar-width:none] sm:px-7 sm:pt-7 [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
      <DialogPrimitive.Close className="absolute right-4 top-4 z-10 flex size-9 items-center justify-center rounded-full border border-border/60 bg-background/80 text-muted-foreground shadow-sm backdrop-blur transition-all hover:rotate-90 hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none">
        <X className="h-4 w-4" />
        <span className="sr-only">Fechar</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col gap-1.5 pr-8 text-left",
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
      // Rodapé fixo no fim do modal, mesmo com conteúdo rolando.
      "sticky bottom-0 z-10 -mx-6 -mb-6 mt-1 flex flex-col-reverse gap-2 border-t border-border/60 bg-background/85 px-6 py-4 backdrop-blur-md sm:-mx-7 sm:flex-row sm:justify-end sm:px-7 [&_button]:h-11 [&_button]:rounded-xl [&_button]:px-5",
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
      "text-xl font-semibold tracking-tight",
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

const iconTones = {
  green: "bg-energy-green-light/10 text-energy-700 ring-energy-green-light/25 dark:text-energy-green-light",
  red: "bg-red-500/10 text-red-600 ring-red-500/20 dark:text-red-400",
  blue: "bg-sky-500/10 text-sky-600 ring-sky-500/20 dark:text-sky-400",
  amber: "bg-amber-500/10 text-amber-600 ring-amber-500/20 dark:text-amber-400",
}

// Selo de ícone mostrado no topo do cabeçalho de modais e confirmações.
const DialogIcon = ({
  tone = "green",
  className,
  children,
}: {
  tone?: keyof typeof iconTones
  className?: string
  children: React.ReactNode
}) => (
  <div
    aria-hidden
    className={cn(
      "mb-2 flex size-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset [&>svg]:size-5",
      iconTones[tone],
      className
    )}
  >
    {children}
  </div>
)
DialogIcon.displayName = "DialogIcon"

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogIcon,
}
