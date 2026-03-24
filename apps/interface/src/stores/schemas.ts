import { fetchSchemas as fetchSchemasAPI } from '@/lib/api/schemas'
import type { Schema as BaseSchema } from '@ensmetadata/schemas/types'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Schema extends BaseSchema {
  id: string
  class: string
  isLatest: boolean
}

interface SchemaState {
  // Loaded schemas
  schemas: Schema[]
  // Selected schema
  selectedSchemaId: string | null

  // Actions
  loadSchemas: (schemas: Schema[]) => void
  fetchSchemas: () => Promise<void>
  addSchema: (schema: Schema) => void
  selectSchema: (schemaId: string) => void
  getSelectedSchema: () => Schema | undefined
}

export const useSchemaStore = create<SchemaState>()(
  persist(
    (set, get) => ({
      schemas: [],
      selectedSchemaId: null,

      loadSchemas: (schemas) => set({ schemas }),

      fetchSchemas: async () => {
        const schemas = await fetchSchemasAPI()
        set({ schemas })
      },

      addSchema: (schema) =>
        set((state) => ({
          schemas: [...state.schemas, schema],
        })),

      selectSchema: (schemaId) => set({ selectedSchemaId: schemaId }),

      getSelectedSchema: () => {
        const { schemas, selectedSchemaId } = get()
        return schemas.find((s) => s.id === selectedSchemaId)
      },
    }),
    {
      name: 'schema-storage',
      partialize: (state) => ({
        selectedSchemaId: state.selectedSchemaId,
      }),
    },
  ),
)
