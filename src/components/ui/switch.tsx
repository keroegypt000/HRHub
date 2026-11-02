"use client"

import * as React from "react"
import * as SwitchPrimitive from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

/**
 * مفتاح تبديل واضح ومقروء — يعمل صحيحًا مع RTL وLTR:
 * نثبّت اتجاه المفتاح نفسه LTR (زعلاف يسار→يمين) حتى لا يخرج من المسار
 * في الصفحات العربية، بحجم أكبر ولون زمردي واضح عند التفعيل.
 */
function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      dir="ltr"
      className={cn(
        "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors outline-none",
        "data-[state=checked]:bg-emerald-600 data-[state=unchecked]:bg-zinc-300 dark:data-[state=unchecked]:bg-zinc-700",
        "hover:data-[state=unchecked]:bg-zinc-400 dark:hover:data-[state=unchecked]:bg-zinc-600",
        "focus-visible:ring-[3px] focus-visible:ring-emerald-500/40 focus-visible:border-emerald-500",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block size-5 rounded-full bg-white shadow-md ring-1 ring-black/5 transition-transform",
          "data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
