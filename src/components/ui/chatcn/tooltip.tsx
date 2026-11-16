"use client"

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"
import type * as React from "react"
import { cn } from "@/lib/utils"

/**
 * Wrap the app once. After the first tooltip opens, the next ones open instantly, the way
 * native toolbars behave.
 */
function TooltipProvider({
  delay = 500,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider delay={delay} closeDelay={0} {...props} />
}

interface TooltipProps {
  content: React.ReactNode
  children: React.ReactElement
  side?: "top" | "bottom" | "left" | "right"
  align?: "start" | "center" | "end"
  /** A shortcut hint shown after the label, for example `⌘C`. */
  shortcut?: React.ReactNode
}

function Tooltip({ content, children, side = "top", align = "center", shortcut }: TooltipProps) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger render={children} />
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Positioner side={side} align={align} sideOffset={6} className="z-50">
          <TooltipPrimitive.Popup
            data-slot="tooltip"
            className={cn(
              "rounded-chatcn-sm bg-chatcn-fg chatcn-text-12 text-chatcn-bg shadow-chatcn-md flex max-w-xs origin-(--transform-origin) items-center gap-2 px-2 py-1 font-medium text-pretty",
              "ease-chatcn-out transition-[opacity,scale] duration-125",
              "data-[ending-style]:scale-97 data-[ending-style]:opacity-0 data-[ending-style]:duration-100 data-[starting-style]:scale-97 data-[starting-style]:opacity-0",
              // Once one tooltip is open, the next appears without animation. Reduced motion keeps
              // only the fade.
              "data-[instant]:transition-none motion-reduce:transition-opacity motion-reduce:data-[ending-style]:scale-100 motion-reduce:data-[starting-style]:scale-100",
            )}
          >
            {content}
            {shortcut ? <span className="font-normal opacity-60">{shortcut}</span> : null}
          </TooltipPrimitive.Popup>
        </TooltipPrimitive.Positioner>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

export type { TooltipProps }
export { Tooltip, TooltipProvider }
