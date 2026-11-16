"use client"

import * as React from "react"
import { useConversation } from "@/components/ui/chatcn/conversation"
import { ArrowDownIcon } from "@/lib/chatcn-icons"
import { cn } from "@/lib/utils"

interface ScrollToBottomProps extends Omit<React.ComponentProps<"button">, "children"> {
  /**
   * When the pill shows. `far` waits until the reader is more than one viewport up, or until a
   * new message lands below them. `away` shows as soon as they leave the bottom. Defaults to `far`.
   */
  when?: "far" | "away"
  /** Show the unread count next to the arrow. Defaults to true. */
  showUnread?: boolean
  /** Force the pill on or off, for example to keep it hidden while a dialog is open. */
  visible?: boolean
}

/**
 * Jump-to-latest pill. Floats at the bottom center of the nearest `Conversation`, fades in with
 * 4 px of travel over 150 ms, and re-engages stick-to-bottom when pressed. When messages land
 * below the reader, the round arrow opens sideways into "3 new" and closes again once read.
 */
function ScrollToBottom({
  when = "far",
  showUnread = true,
  visible,
  className,
  onClick,
  ...props
}: ScrollToBottomProps) {
  const ctx = useConversation()
  if (!ctx) throw new Error("ScrollToBottom must be used inside Conversation.")
  const { isAtBottom, isFar, unread, scrollToBottom } = ctx
  const show = visible ?? (when === "away" ? !isAtBottom : isFar || (!isAtBottom && unread > 0))
  const count = showUnread && unread > 0 ? unread : 0
  // Keep the last count while the label closes, so it never collapses around an empty string.
  const [shown, setShown] = React.useState(count)
  if (count > 0 && count !== shown) setShown(count)
  const label = count
    ? `${count} new ${count === 1 ? "message" : "messages"}, scroll to latest`
    : "Scroll to latest"

  return (
    <button
      type="button"
      aria-label={label}
      aria-hidden={show ? undefined : true}
      tabIndex={show ? undefined : -1}
      data-slot="scroll-to-bottom"
      data-visible={show ? "" : undefined}
      onClick={(event) => {
        onClick?.(event)
        if (!event.defaultPrevented) scrollToBottom({ behavior: "smooth" })
      }}
      className={cn(
        "chatcn-focus absolute inset-x-0 bottom-4 z-10 mx-auto flex h-8 w-fit items-center rounded-full px-2",
        "bg-chatcn-card text-chatcn-fg-muted shadow-chatcn-md chatcn-text-13 font-medium tabular-nums select-none",
        "hover:text-chatcn-fg active:scale-(--chatcn-press-scale) [&_svg]:size-4 [&_svg]:shrink-0",
        // Exit is 0.75x the enter. Under reduced motion the travel goes and only the fade remains.
        "ease-chatcn-out transition-[opacity,translate,color,scale] duration-150",
        "pointer-coarse:after:absolute pointer-coarse:after:-inset-1.5 pointer-coarse:after:content-['']",
        show
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-1 opacity-0 duration-110",
        "motion-reduce:translate-y-0 motion-reduce:transition-opacity",
        className,
      )}
      {...props}
    >
      <ArrowDownIcon aria-hidden="true" />
      {/* 0fr to 1fr: the pill widens from its center as the label opens, and nothing reflows. */}
      <span
        aria-hidden="true"
        data-slot="scroll-to-bottom-count"
        data-open={count ? "" : undefined}
        className={cn(
          "grid grid-cols-[0fr] opacity-0 data-[open]:grid-cols-[1fr] data-[open]:opacity-100",
          "ease-chatcn-out transition-[grid-template-columns,opacity] duration-200",
          "motion-reduce:transition-opacity",
        )}
      >
        <span className="overflow-hidden whitespace-nowrap">
          <span className="ps-1.5 pe-1">{shown > 99 ? "99+" : shown} new</span>
        </span>
      </span>
    </button>
  )
}

export type { ScrollToBottomProps }
export { ScrollToBottom }
