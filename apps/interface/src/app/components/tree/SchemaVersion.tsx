'use client'

import { useSchemaStore } from '@/stores/schemas'
import { ChevronDown, ExternalLink, RefreshCw, Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

interface SchemaVersionProps {
  className?: string
}

export function SchemaVersion({ className = '' }: SchemaVersionProps) {
  const { schemas, selectedSchemaId, selectSchema, getSelectedSchema, fetchSchemas } =
    useSchemaStore()
  const selectedSchema = getSelectedSchema()
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Fetch schemas on mount if not loaded
  useEffect(() => {
    if (schemas.length === 0 && !isLoading) {
      setIsLoading(true)
      fetchSchemas().finally(() => setIsLoading(false))
    }
  }, [schemas.length, fetchSchemas, isLoading])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setSearchQuery('')
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const filteredSchemas = schemas
    .filter((schema) => schema.isLatest)
    .filter((schema) => schema.class.toLowerCase().includes(searchQuery.toLowerCase()))

  const handleSelectSchema = (schemaId: string) => {
    selectSchema(schemaId)
    setIsOpen(false)
    setSearchQuery('')
  }

  const handleRefresh = async () => {
    setIsLoading(true)
    await fetchSchemas()
    setIsLoading(false)
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Schema Name Display */}
      <div className="flex items-center gap-2">
        <div className="text-lg font-semibold text-gray-900 dark:text-white">
          {selectedSchema ? selectedSchema.class : 'No Schema Selected'}
        </div>
        {selectedSchema?.source && (
          <a
            href={selectedSchema.source}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
            title={`View schema at ${selectedSchema.source}`}
          >
            <ExternalLink size={16} />
          </a>
        )}
      </div>

      {/* Version Dropdown */}
      <div>
        <div className="text-gray-700 dark:text-gray-300 text-sm font-medium mb-2">Version</div>
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="w-full flex items-center justify-between px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
          >
            <span className="text-gray-900 dark:text-white">
              {selectedSchema
                ? `v${selectedSchema.version} - ${selectedSchema.class}`
                : 'Select a schema'}
            </span>
            <ChevronDown size={16} className="text-gray-500 dark:text-gray-400" />
          </button>

          {/* Dropdown Menu */}
          {isOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg z-50">
              {/* Search Input */}
              <div className="p-2 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search
                      size={14}
                      className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
                    />
                    <input
                      type="text"
                      placeholder="Search schemas..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-7 pr-2 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      // biome-ignore lint/a11y/noAutofocus: intentional UX
                      autoFocus
                    />
                  </div>

                  {/* Refresh Button */}
                  <button
                    type="button"
                    onClick={handleRefresh}
                    disabled={isLoading}
                    className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Refresh schemas"
                  >
                    <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                  </button>
                </div>
              </div>

              {/* Schema List */}
              <div className="max-h-64 overflow-y-auto">
                {isLoading ? (
                  <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
                    Loading schemas...
                  </div>
                ) : filteredSchemas.length === 0 ? (
                  <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
                    No schemas found
                  </div>
                ) : (
                  filteredSchemas.map((schema) => (
                    <button
                      type="button"
                      key={schema.id}
                      onClick={() => handleSelectSchema(schema.id)}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                        selectedSchemaId === schema.id
                          ? 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400'
                          : 'text-gray-900 dark:text-white'
                      }`}
                    >
                      <div className="font-medium">
                        {schema.class}{' '}
                        <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
                          (v{schema.version})
                        </span>
                      </div>
                      {schema.description && (
                        <div className="text-xs text-gray-600 dark:text-gray-500 mt-1 line-clamp-2">
                          {schema.description}
                        </div>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
