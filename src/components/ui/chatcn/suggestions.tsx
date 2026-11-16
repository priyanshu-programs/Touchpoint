"use client"

import * as React from "react"
import { ArrowRightIcon } from "@/lib/chatcn-icons"
import { cn } from "@/lib/utils"

type SuggestionsVariant = "chips" | "rows" | "cards"

const SuggestionsContext = React.createContext<SuggestionsVariant>("chips")

/* -------------------------------------------------------------------------------------------------
 * Suggestions
 * -----------------------------------------------------------------------------------------------*/

interface SuggestionsProps extends React.ComponentProps<"div"> {
  /** `chips` for starters under a composer, `rows` for follow-ups, `cards` for a richer start. */
  variant?: SuggestionsVariant
  /** Chips only: one line that scrolls sideways, with edges that fade while there is more. */
  scroll?: boolean
  /** Heading above the list, such as "Follow-ups". Also names the group for screen readers. */
  label?: string
  /** Stagger the items in once, on mount. Never replays on re-render. Defaults to true. */
  animate?: boolean
}

/**
 * Starter prompts and follow-ups. Items stagger in 40 ms apart, once, when the list mounts. Under
 * reduced motion they fade without moving.
 */
function Suggestions({
  variant = "chips",
  scroll = false,
  label,
  animate = true,
  className,
  children,
  ...props
}: SuggestionsProps) {
  const listRef = React.useRef<HTMLDivElement>(null)
  const labelId = React.useId()
  const [edges, setEdges] = React.useState({ start: false, end: false })

  // One-shot entrance with WAAPI: no keyframe on rapidly changing state, nothing on re-render.
  React.useEffect(() => {
    const list = listRef.current
    if (!animate || !list?.animate) return
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    const items = Array.from(list.querySelectorAll<HTMLElement>('[data-slot="suggestion"]'))
    const animations = items.slice(0, 6).map((item, i) =>
      item.animate(
        reduce
          ? [{ opacity: 0 }, { opacity: 1 }]
          : [
              { opacity: 0, transform: "translateY(4px)" },
              { opacity: 1, transform: "none" },
            ],
        {
          duration: reduce ? 150 : 200,
          delay: reduce ? 0 : i * 40,
          easing: "cubic-bezier(0.23, 1, 0.32, 1)",
          fill: "backwards",
        },
      ),
    )
    return () => {
      for (const a of animations) a.cancel()
    }
  }, [])

  React.useEffect(() => {
    const list = listRef.current
    if (!scroll || !list) return
    const measure = () => {
      const max = list.scrollWidth - list.clientWidth
      // scrollLeft is negative in right-to-left layouts.
      const pos = Math.abs(list.scrollLeft)
      setEdges({ start: pos > 1, end: pos < max - 1 })
    }
    measure()
    list.addEventListener("scroll", measure, { passive: true })
    const ro = new ResizeObserver(measure)
    ro.observe(list)
    return () => {
      list.removeEventListener("scroll", measure)
      ro.disconnect()
    }
  }, [scroll])

  return (
    <SuggestionsContext.Provider value={variant}>
      <div
        data-slot="suggestions"
        data-variant={variant}
        className={cn("flex min-w-0 flex-col gap-2", className)}
        {...props}
      >
        {label ? (
          <h3 id={labelId} className="chatcn-text-13 text-chatcn-fg-muted font-medium">
            {label}
          </h3>
        ) : null}
        {/* biome-ignore lint/a11y/useSemanticElements: a group of buttons, not a form fieldset */}
        <div
          ref={listRef}
          role="group"
          aria-labelledby={label ? labelId : undefined}
          aria-label={label ? undefined : "Suggestions"}
          data-scroll-start={edges.start ? "" : undefined}
          data-scroll-end={edges.end ? "" : undefined}
          className={cn(
            variant === "chips" &&
              (scroll
                ? cn(
                    "-mx-1 flex [scrollbar-width:none] gap-2 overflow-x-auto overscroll-x-contain px-1 py-1 [&::-webkit-scrollbar]:hidden",
                    // Fade only the edges that hide more chips.
                    "[--fade-end:0px] [--fade-start:0px] data-[scroll-end]:[--fade-end:40px] data-[scroll-start]:[--fade-start:40px]",
                    "[mask-image:linear-gradient(to_right,transparent,black_var(--fade-start),black_calc(100%-var(--fade-end)),transparent)]",
                    "rtl:[mask-image:linear-gradient(to_left,transparent,black_var(--fade-start),black_calc(100%-var(--fade-end)),transparent)]",
                  )
                : "flex flex-wrap gap-2"),
            variant === "rows" && "divide-chatcn-border flex flex-col divide-y",
            variant === "cards" && "grid grid-cols-1 gap-2 sm:grid-cols-2",
          )}
        >
          {children}
        </div>
      </div>
    </SuggestionsContext.Provider>
  )
}

/* -------------------------------------------------------------------------------------------------
 * Suggestion
 * -----------------------------------------------------------------------------------------------*/

interface SuggestionProps extends Omit<React.ComponentProps<"button">, "onSelect"> {
  /** Second line for rows and cards. */
  description?: React.ReactNode
  /** A 16 px icon before the label. */
  icon?: React.ReactNode
  /** The prompt this suggestion stands for. Passed to `onSelect`; defaults to the text label. */
  value?: string
  onSelect?: (value: string) => void
}

/** One suggestion. A real button: Enter and Space pick it. */
function Suggestion({
  description,
  icon,
  value,
  onSelect,
  onClick,
  className,
  children,
  ...props
}: SuggestionProps) {
  const variant = React.useContext(SuggestionsContext)

  const base = cn(
    "chatcn-focus text-start select-none",
    "ease-chatcn-standard transition-[background-color,color,box-shadow,scale] duration-150",
  )

  return (
    <button
      type="button"
      data-slot="suggestion"
      onClick={(event) => {
        onClick?.(event)
        if (event.defaultPrevented) return
        onSelect?.(value ?? (typeof children === "string" ? children : ""))
      }}
      className={cn(
        base,
        variant === "chips" &&
          cn(
            "chatcn-press chatcn-text-13 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 font-medium whitespace-nowrap",
            "bg-chatcn-card text-chatcn-fg-muted shadow-chatcn-xs hover:bg-chatcn-fill-hover hover:text-chatcn-fg",
            "[&_svg]:text-chatcn-fg-subtle pointer-coarse:h-11 pointer-coarse:px-4 [&_svg]:size-3.5",
          ),
        variant === "rows" &&
          cn(
            "group/suggestion chatcn-text-14 flex min-h-11 w-full items-center gap-3 py-2.5",
            "text-chatcn-fg-muted hover:text-chatcn-fg focus-visible:outline-offset-0",
            "[&_svg]:text-chatcn-fg-subtle [&_svg]:size-4 [&_svg]:shrink-0",
          ),
        variant === "cards" &&
          cn(
            "rounded-chatcn-lg bg-chatcn-card shadow-chatcn-xs flex min-h-16 flex-col gap-1 p-3",
            "hover:bg-chatcn-bg-subtle hover:shadow-chatcn-sm-hover active:scale-99",
            "[&_svg]:text-chatcn-fg-subtle [&_svg]:size-4",
          ),
        className,
      )}
      {...props}
    >
      {variant === "cards" ? (
        <>
          <span className="chatcn-text-14 text-chatcn-fg flex items-center gap-2 font-medium">
            {icon}
            {children}
          </span>
          {description ? (
            // Hangs under the title, not the icon: 16 px icon plus the 8 px gap.
            <span
              className={cn("chatcn-text-13 text-chatcn-fg-subtle text-pretty", icon && "ps-6")}
            >
              {description}
            </span>
          ) : null}
        </>
      ) : variant === "rows" ? (
        <>
          {icon}
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-pretty">{children}</span>
            {description ? (
              <span className="chatcn-text-13 text-chatcn-fg-subtle text-pretty">
                {description}
              </span>
            ) : null}
          </span>
          <ArrowRightIcon
            aria-hidden="true"
            className="group-hover/suggestion:text-chatcn-fg transition-colors duration-150 rtl:-scale-x-100"
          />
        </>
      ) : (
        <>
          {icon}
          {children}
        </>
      )}
    </button>
  )
}

export type { SuggestionProps, SuggestionsProps, SuggestionsVariant }
export { Suggestion, Suggestions }
