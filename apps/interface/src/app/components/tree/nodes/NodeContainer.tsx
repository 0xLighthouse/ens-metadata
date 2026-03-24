import { useTreeControlsStore } from '@/stores/tree-controls'
import { Handle, Position } from '@xyflow/react'
import { memo } from 'react'

interface NodeContainerProps extends React.PropsWithChildren {
  // Node state
  isSelected?: boolean
  isPendingCreation?: boolean
  hasPendingEdits?: boolean
  isSuggested?: boolean
  isCollapsed?: boolean
  hasChildren?: boolean

  // Accent color for selection/styling
  accentColor?: string

  // Style overrides
  className?: string
  style?: React.CSSProperties
  width?: string | number
  overflow?: 'hidden' | 'visible'
}

const getBackgroundColor = (
  isSuggested?: boolean,
  isPendingCreation?: boolean,
  hasPendingEdits?: boolean,
  accentColor?: string,
) => {
  if (isSuggested) return '#f8fafc'
  if (isPendingCreation) {
    if (accentColor) return `${accentColor}0d` // 5% opacity tint
    return '#f0fdf4'
  }
  if (hasPendingEdits) return '#fff7ed'
  return 'white'
}

const getBorderStyle = (
  isSuggested?: boolean,
  isPendingCreation?: boolean,
  hasPendingEdits?: boolean,
  accentColor?: string,
) => {
  if (isSuggested) return '2px dashed #cbd5e1'
  if (isPendingCreation) {
    const color = accentColor || '#22c55e'
    return `2px dashed ${color}`
  }
  if (hasPendingEdits) return '2px dashed #fb923c'

  if (accentColor && accentColor !== '#94a3b8') {
    return `1px solid ${accentColor}40` // 25% opacity
  }
  return '1px solid #e2e8f0'
}

const getBoxShadow = (
  isSelected?: boolean,
  isPendingCreation?: boolean,
  hasPendingEdits?: boolean,
  accentColor?: string,
) => {
  if (isSelected && accentColor) {
    return `0 4px 12px ${accentColor}4d` // 30% opacity
  }
  if (isSelected) return '0 4px 12px rgba(0, 0, 0, 0.15)'
  if (isPendingCreation) {
    if (accentColor) return `0 4px 12px ${accentColor}40` // 25% opacity
    return '0 4px 12px rgba(34, 197, 94, 0.25)'
  }
  if (hasPendingEdits) return '0 4px 12px rgba(249, 115, 22, 0.25)'

  if (accentColor && accentColor !== '#94a3b8') {
    return `0 2px 8px ${accentColor}26` // 15% opacity
  }
  return '0 2px 8px rgba(0, 0, 0, 0.1)'
}

const getRingStyle = (
  isSelected?: boolean,
  isCollapsed?: boolean,
  hasChildren?: boolean,
  hasPendingEdits?: boolean,
  isPendingCreation?: boolean,
  accentColor?: string,
): React.CSSProperties => {
  if (isSelected) {
    const color = accentColor || '#6366f1'
    return {
      outline: `2px solid ${color}`,
      outlineOffset: '2px',
    }
  }
  if (isCollapsed && hasChildren && !hasPendingEdits && !isPendingCreation) {
    const color = accentColor ? `${accentColor}66` : '#c7d2fe' // 40% opacity or indigo-200
    return {
      outline: `2px solid ${color}`,
      outlineOffset: '0px',
    }
  }
  return {}
}

export const NodeContainer = memo(
  ({
    children,
    isSelected,
    isPendingCreation,
    hasPendingEdits,
    isSuggested,
    isCollapsed,
    hasChildren,
    accentColor,
    className,
    style,
    width = '256px',
    overflow = 'hidden',
  }: NodeContainerProps) => {
    const { orientation } = useTreeControlsStore()
    const isVertical = orientation === 'vertical'
    const targetPosition = isVertical ? Position.Top : Position.Left
    const sourcePosition = isVertical ? Position.Bottom : Position.Right

    const baseClasses = `
    relative
    cursor-pointer
    transition-all
    duration-200
    outline-none
    focus:outline-none
    ${isSuggested ? 'opacity-50' : ''}
    ${className || ''}
  `
      .trim()
      .replace(/\s+/g, ' ')

    const ringStyle = getRingStyle(
      isSelected,
      isCollapsed,
      hasChildren,
      hasPendingEdits,
      isPendingCreation,
      accentColor,
    )

    const baseStyle: React.CSSProperties = {
      width,
      backgroundColor: getBackgroundColor(
        isSuggested,
        isPendingCreation,
        hasPendingEdits,
        accentColor,
      ),
      border: getBorderStyle(isSuggested, isPendingCreation, hasPendingEdits, accentColor),
      borderRadius: '12px',
      overflow,
      boxShadow: getBoxShadow(isSelected, isPendingCreation, hasPendingEdits, accentColor),
      ...ringStyle,
      ...style,
    }

    return (
      <div className={baseClasses} style={baseStyle}>
        {children}
        <Handle type="target" position={targetPosition} className="pointer-events-none opacity-0" />
        <Handle type="source" position={sourcePosition} className="pointer-events-none opacity-0" />
      </div>
    )
  },
)
