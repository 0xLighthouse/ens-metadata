import type { LucideIcon } from 'lucide-react'
import {
  AppWindow,
  Bot,
  Building2,
  Crown,
  DollarSign,
  FileCode,
  FolderOpen,
  HandCoins,
  Landmark,
  Layers,
  User,
  Users,
  Vote,
  Wallet,
} from 'lucide-react'

export interface NodeTypeConfig {
  badgeLabel: string
  badgeBg: string
  badgeText: string
  accentColor: string
  icon: LucideIcon
  suggestedCta?: string
}

const nodeConfigs: Record<string, NodeTypeConfig> = {
  Treasury: {
    badgeLabel: 'TREASURY',
    badgeBg: 'bg-amber-100',
    badgeText: 'text-amber-800',
    accentColor: '#f59e0b',
    icon: DollarSign,
    suggestedCta: 'Click to add treasury',
  },
  Workgroup: {
    badgeLabel: 'WORKGROUP',
    badgeBg: 'bg-emerald-100',
    badgeText: 'text-emerald-800',
    accentColor: '#10b981',
    icon: Users,
    suggestedCta: 'Click to add workgroup',
  },
  Group: {
    badgeLabel: 'GROUP',
    badgeBg: 'bg-teal-100',
    badgeText: 'text-teal-800',
    accentColor: '#14b8a6',
    icon: FolderOpen,
    suggestedCta: 'Click to add group',
  },
  Person: {
    badgeLabel: 'PERSON',
    badgeBg: 'bg-sky-100',
    badgeText: 'text-sky-800',
    accentColor: '#0ea5e9',
    icon: User,
    suggestedCta: 'Click to add person',
  },
  Committee: {
    badgeLabel: 'COMMITTEE',
    badgeBg: 'bg-violet-100',
    badgeText: 'text-violet-800',
    accentColor: '#8b5cf6',
    icon: Landmark,
    suggestedCta: 'Click to add committee',
  },
  Council: {
    badgeLabel: 'COUNCIL',
    badgeBg: 'bg-purple-100',
    badgeText: 'text-purple-800',
    accentColor: '#a855f7',
    icon: Crown,
    suggestedCta: 'Click to add council',
  },
  Agent: {
    badgeLabel: 'AGENT',
    badgeBg: 'bg-cyan-100',
    badgeText: 'text-cyan-800',
    accentColor: '#06b6d4',
    icon: Bot,
    suggestedCta: 'Click to add agent',
  },
  Application: {
    badgeLabel: 'APP',
    badgeBg: 'bg-blue-100',
    badgeText: 'text-blue-800',
    accentColor: '#3b82f6',
    icon: AppWindow,
    suggestedCta: 'Click to add application',
  },
  Contract: {
    badgeLabel: 'CONTRACT',
    badgeBg: 'bg-orange-100',
    badgeText: 'text-orange-800',
    accentColor: '#f97316',
    icon: FileCode,
    suggestedCta: 'Click to add contract',
  },
  Wallet: {
    badgeLabel: 'WALLET',
    badgeBg: 'bg-lime-100',
    badgeText: 'text-lime-800',
    accentColor: '#84cc16',
    icon: Wallet,
    suggestedCta: 'Click to add wallet',
  },
  Delegate: {
    badgeLabel: 'DELEGATE',
    badgeBg: 'bg-rose-100',
    badgeText: 'text-rose-800',
    accentColor: '#f43f5e',
    icon: Vote,
    suggestedCta: 'Click to add delegate',
  },
  Grant: {
    badgeLabel: 'GRANT',
    badgeBg: 'bg-fuchsia-100',
    badgeText: 'text-fuchsia-800',
    accentColor: '#d946ef',
    icon: HandCoins,
    suggestedCta: 'Click to add grant',
  },
  Organization: {
    badgeLabel: 'ORG',
    badgeBg: 'bg-indigo-100',
    badgeText: 'text-indigo-800',
    accentColor: '#6366f1',
    icon: Building2,
    suggestedCta: 'Click to add organizational unit',
  },
}

const defaultConfig: NodeTypeConfig = {
  badgeLabel: '',
  badgeBg: '',
  badgeText: '',
  accentColor: '#94a3b8',
  icon: Layers,
  suggestedCta: 'Click to add subdomain',
}

export const getNodeConfig = (schemaType?: string): NodeTypeConfig => {
  if (!schemaType) return defaultConfig
  return nodeConfigs[schemaType] ?? defaultConfig
}
