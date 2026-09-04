'use client'

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { ExternalLink } from 'lucide-react'
import Link from 'next/link'

export function NavGroup({
  items,
  title,
}: {
  items: {
    name: string
    url: string
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
    isExternal?: boolean
  }[]
  title: string
}) {
  // const { isMobile } = useSidebar()

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>{title}</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => (
          <SidebarMenuItem key={item.name}>
            <SidebarMenuButton asChild>
              {item.isExternal ? (
                <a href={item.url} target="_blank" rel="noopener noreferrer">
                  <item.icon />
                  <span className="flex items-center gap-2">
                    {item.name}
                    <ExternalLink className="w-3 h-3" />
                  </span>
                </a>
              ) : (
                <Link href={item.url}>
                  <item.icon />
                  <span>{item.name}</span>
                </Link>
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}
