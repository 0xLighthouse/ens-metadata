'use client'

import { Compass } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'

/**
 * Derives a page title from the last path segment, e.g. `/some-page` → "Some Page".
 * Returns an empty string for the root path.
 */
export function pageTitleFromPath(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean)
  const last = segments[segments.length - 1]
  if (!last) return ''
  return decodeURIComponent(last)
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export const PageBreadcrumbs = () => {
  const title = pageTitleFromPath(usePathname())

  return (
    <Breadcrumb>
      <BreadcrumbList className="flex items-center text-base leading-none text-neutral-600">
        <BreadcrumbItem>
          <Link
            href="/"
            className="text-neutral-400 transition-colors hover:text-neutral-700 dark:text-neutral-500 dark:hover:text-neutral-200"
            title="Badgeholders"
          >
            <Compass className="size-5" />
          </Link>
        </BreadcrumbItem>
        {title && (
          <>
            <BreadcrumbSeparator className="text-neutral-400" />
            <BreadcrumbItem>
              <BreadcrumbPage className="text-neutral-700">{title}</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
