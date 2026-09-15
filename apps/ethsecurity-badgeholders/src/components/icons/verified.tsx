import type { SVGProps } from 'react'

/**
 * The verified mark: an eight-point star with a checkmark cut out of it. The check is a hole in
 * the path (`evenodd`), not a stroke, so whatever sits behind the icon shows through. Renders in
 * `currentColor` so it inherits whatever text color the consuming component sets.
 */
export function VerifiedIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" {...props}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 1L15.22 4.22L19.78 4.22L19.78 8.78L23 12L19.78 15.22L19.78 19.78L15.22 19.78L12 23L8.78 19.78L4.22 19.78L4.22 15.22L1 12L4.22 8.78L4.22 4.22L8.78 4.22ZM6.55 12.95L10.62 17.02L17.47 9.83L15.73 8.17L10.58 13.58L8.25 11.25Z"
      />
    </svg>
  )
}
