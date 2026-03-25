# Interface App

- Package manager: `pnpm`
- Always use `lucide-react` icons, never custom SVGs
- React Flow (`@xyflow/react`) + Dagre (`@dagrejs/dagre`) for tree visualization

## Critical: Text Record Resolution

Node metadata (`class`, `schema`, etc.) are ENS text records stored in `node.texts`. Always resolve via `node.texts?.key` (or `resolveNodeValue` helper in `node-editor.ts`), never from top-level node properties. Pending mutation changes are merged into `node.texts` only — never spread onto the node top level, as text record keys like `name` would collide with structural TreeNode properties.

## Key Stores

| Store | File | Purpose |
|---|---|---|
| `useAppStore` | `/stores/app.ts` | Auth, user, spaces. Persists `user` + `activeSpace` only |
| `useTreeEditStore` | `/stores/tree-edits.ts` | Delta-based mutation tracking (`texts`/`changes`/`deleted`), keyed by ENS name |
| `useNodeEditorStore` | `/stores/node-editor.ts` | EditNodeDrawer form state, schema selection, field visibility |
| `useMutationsStore` | `/stores/mutations.ts` | On-chain writes via `setRecords`. Deletions → empty strings. Status: pending→signing→submitted→confirmed |
| `useSchemaStore` | `/stores/schemas.ts` | Schema registry, fetched from published IPFS CIDs |

## Node Rendering

- **`/config/nodes.ts`**: `getNodeConfig(schemaType?)` maps 13 schema types (Treasury, Person, Agent, etc.) to visual config (icon, badge, colors)
- **`BaseNodeCard`** (`nodes/BaseNode.tsx`): Shared card component with footer slot
- **`DefaultNode`**: Wraps BaseNodeCard (most types). **`TreasuryNode`**: Adds inspect button. **`SignerNode`**: Compact computed node
- **`NodeContainer`**: React Flow wrapper with state-based styling
- `getFlowNodeType()` in `Tree.tsx` routes nodes to components based on `class` text record
- `triggerLayout()` after adding/removing nodes to refit viewport

## Schemas

- Defined in `/packages/schemas/src/schemas/`, JSON Schema spec with ENS extensions
- ENSIP-5 mixin (`utils/ensip-5.ts`) provides standard fields (avatar, description, email, etc.)
- Published to `/packages/schemas/published/` with IPFS CIDs
- Schema `id` = `ipfs://<cid>`, matched against `node.texts.schema`
- Flow: schema definitions → `SCHEMAS` array → published registry → API → EditNodeDrawer → delta in tree-edits → batch apply

## Computed Nodes

- TreasuryNode inspect button calls `/app/api/inspect/route.ts` (uses `viem`, needs `RPC_URL`)
- Detects Safe multisig → creates computed signer children (`isComputed: true`)
- Stored in `inspectionData.computedChildren`, excluded from Apply Changes dialog
