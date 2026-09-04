/**
 * Typography system
 *
 * The type scale is defined once, as the `.text-*` component classes in
 * `src/app/globals.css`. This helper only names those classes, so markup can
 * pick a variant with the class directly or with `typography('h1')`.
 */

export type TypographyVariant =
  | 'display'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'body-lg'
  | 'body'
  | 'body-sm'
  | 'caption'
  | 'mono'

export type TypographyWeights = 'normal' | 'medium' | 'semibold' | 'bold'

export const fontWeights: Record<TypographyWeights, string> = {
  normal: 'font-normal',
  medium: 'font-medium',
  semibold: 'font-semibold',
  bold: 'font-bold',
}

/**
 * Returns the type scale class for a variant, with an optional weight override.
 */
export function typography(variant: TypographyVariant, weight?: TypographyWeights): string {
  return weight ? `text-${variant} ${fontWeights[weight]}` : `text-${variant}`
}
