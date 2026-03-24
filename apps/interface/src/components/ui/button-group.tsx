'use client'

import { Slot } from '@radix-ui/react-slot'
import * as React from 'react'
import { type VariantProps, tv } from 'tailwind-variants'

import { Separator } from '@/components/ui/separator'

const buttonGroupVariants = tv({
  base: "flex w-fit items-stretch has-[>[data-slot=button-group]]:gap-2 [&>*]:focus-visible:relative [&>*]:focus-visible:z-10 has-[select[aria-hidden=true]:last-child]:[&>[data-slot=select-trigger]:last-of-type]:rounded-r-md [&>[data-slot=select-trigger]:not([class*='w-'])]:w-fit [&>input]:flex-1",
  variants: {
    orientation: {
      horizontal:
        '[&>*:not(:first-child)]:rounded-l-none [&>*:not(:first-child)]:border-l-0 [&>*:not(:last-child)]:rounded-r-none',
      vertical:
        'flex-col [&>*:not(:first-child)]:rounded-t-none [&>*:not(:first-child)]:border-t-0 [&>*:not(:last-child)]:rounded-b-none',
    },
  },
  defaultVariants: {
    orientation: 'horizontal',
  },
})

export interface ButtonGroupProps
  extends React.ComponentProps<'div'>,
    VariantProps<typeof buttonGroupVariants> {}

const ButtonGroup = React.forwardRef<HTMLDivElement, ButtonGroupProps>(
  ({ className, orientation, ...props }, ref) => {
    return (
      <div
        role="group"
        data-slot="button-group"
        data-orientation={orientation}
        className={buttonGroupVariants({ orientation, class: className })}
        ref={ref}
        {...props}
      />
    )
  },
)
ButtonGroup.displayName = 'ButtonGroup'

export interface ButtonGroupTextProps extends React.ComponentProps<'div'> {
  asChild?: boolean
}

const ButtonGroupText = React.forwardRef<HTMLDivElement, ButtonGroupTextProps>(
  ({ className, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'div'

    return (
      <Comp
        className={buttonGroupVariants({
          class: `bg-neutral-100 shadow-xs flex items-center gap-2 rounded-md border border-neutral-200 px-4 text-sm font-medium [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none dark:bg-neutral-800 dark:border-neutral-800 ${className}`,
        })}
        ref={ref}
        {...props}
      />
    )
  },
)
ButtonGroupText.displayName = 'ButtonGroupText'

export interface ButtonGroupSeparatorProps extends React.ComponentProps<typeof Separator> {}

const ButtonGroupSeparator = React.forwardRef<
  React.ElementRef<typeof Separator>,
  ButtonGroupSeparatorProps
>(({ className, orientation = 'vertical', ...props }, ref) => {
  return (
    <Separator
      data-slot="button-group-separator"
      orientation={orientation}
      className={buttonGroupVariants({
        class: `bg-neutral-200 relative !m-0 self-stretch data-[orientation=vertical]:h-auto dark:bg-neutral-800 ${className}`,
      })}
      ref={ref}
      {...props}
    />
  )
})
ButtonGroupSeparator.displayName = 'ButtonGroupSeparator'

export { ButtonGroup, ButtonGroupSeparator, ButtonGroupText, buttonGroupVariants }
