import { useTheme } from "next-themes"
import { Toaster as Sonner, toast } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast rounded-xl border border-[#143261] border-l-4 border-l-emerald-400 bg-[#020b22] text-slate-50 shadow-sm",
          description: "group-[.toast]:text-slate-300",
          actionButton:
            "group-[.toast]:bg-slate-900 group-[.toast]:text-slate-100 hover:group-[.toast]:bg-slate-800",
          cancelButton:
            "group-[.toast]:bg-slate-900/70 group-[.toast]:text-slate-200 hover:group-[.toast]:bg-slate-800",
        },
      }}
      {...props}
    />
  )
}

export { Toaster, toast }
