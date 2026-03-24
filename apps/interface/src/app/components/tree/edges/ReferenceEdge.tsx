import {
  BaseEdge,
  type Edge,
  EdgeLabelRenderer,
  type EdgeProps,
  getStraightPath,
} from '@xyflow/react'

interface ReferenceEdgeData {
  sourceLabel?: string
  [key: string]: unknown
}

type ReferenceEdgeType = Edge<ReferenceEdgeData>

export function ReferenceEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
}: EdgeProps<ReferenceEdgeType>) {
  const [edgePath, labelX, labelY] = getStraightPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
  })

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: '#f59e0b',
          strokeWidth: 2,
          strokeDasharray: '6 4',
        }}
      />
      {/* Animated dash overlay */}
      <path
        d={edgePath}
        fill="none"
        stroke="#f59e0b"
        strokeWidth={2}
        strokeDasharray="6 4"
        className="animate-[dash_1s_linear_infinite]"
        style={{
          animation: 'dash 1s linear infinite',
        }}
      />
      <style>{`
        @keyframes dash {
          to {
            stroke-dashoffset: -20;
          }
        }
      `}</style>
      {data?.sourceLabel && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-auto"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              fontSize: 11,
              fontWeight: 600,
              fontFamily: 'ui-monospace, monospace',
              background: '#f59e0b',
              color: '#fff',
              padding: '2px 8px',
              borderRadius: 9999,
              whiteSpace: 'nowrap',
            }}
          >
            {data.sourceLabel}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
