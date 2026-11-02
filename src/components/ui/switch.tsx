"use client"

import * as React from "react"
import * as SwitchPrimitive from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

/**
 * مفتاح تبديل واضح ومقروء يعمل بشكل صحيح في RTL (التطبيق كله dir="rtl"):
 * نستخدم موضعًا منطقيًا (inset-inline-start) للإبهام بدل translate-x،
 * فبقي الإبهام داخل المسار في الحالتين مهما كان الاتجاه:
 * المسار 2.75rem، الإبهام 1.25rem ⇒ بداية 0.125rem ونهاية calc(100% - 1.375rem) داخل صناديق الحدود.
 */
function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors outline-none",
        "data-[state=checked]:bg-emerald-600 data-[state=unchecked]:bg-slate-300 dark:data-[state=unchecked]:bg-slate-600",
        "hover:data-[state=unchecked]:bg-slate-400 dark:hover:data-[state=unchecked]:bg-slate-500",
        "focus-visible:ring-[3px] focus-visible:ring-emerald-500/40 focus-visible:border-emerald-500",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none absolute top-1/2 start-0.5 block h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow-md ring-0",
          "transition-[inset-inline-start] duration-200 ease-out",
          "data-[state=checked]:start-[calc(100%-1.375rem)]"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
