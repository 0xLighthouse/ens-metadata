'use client'

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useWeb3 } from '@/contexts/Web3Provider'
import {
  AVATAR_MAX_SIZE,
  AVATAR_MIME_TYPES,
  STORAGE_TIERS,
  type StorageTier,
  uploadAvatar,
} from '@/lib/objekt'
import { Info, Link, Loader2, Trash2, Upload } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'

interface AvatarFieldProps {
  value: string
  onChange: (url: string) => void
  ensName: string
  isRequired?: boolean
  description?: string
}

export function AvatarField({
  value,
  onChange,
  ensName,
  isRequired,
  description,
}: AvatarFieldProps) {
  const { walletClient, switchChain } = useWeb3()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [filePreview, setFilePreview] = useState<string | null>(null)
  const [storageTier, setStorageTier] = useState<StorageTier>('cdn')
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showUrlInput, setShowUrlInput] = useState(false)

  const handleFileSelect = useCallback((file: File) => {
    setError(null)

    if (!AVATAR_MIME_TYPES.includes(file.type)) {
      setError('Use JPEG, PNG, or WebP images only.')
      return
    }
    if (file.size > AVATAR_MAX_SIZE) {
      setError(`File too large (${(file.size / 1024).toFixed(0)}KB). Max 512KB.`)
      return
    }

    setSelectedFile(file)
    setFilePreview(URL.createObjectURL(file))
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFileSelect(file)
    // Reset so the same file can be re-selected
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFileSelect(file)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const clearFile = () => {
    if (filePreview) URL.revokeObjectURL(filePreview)
    setSelectedFile(null)
    setFilePreview(null)
    setError(null)
  }

  const handleUpload = async () => {
    if (!selectedFile || !walletClient) return

    setIsUploading(true)
    setError(null)

    try {
      const result = await uploadAvatar({
        file: selectedFile,
        ensName,
        storageTier,
        walletClient,
        switchChain,
      })

      onChange(result.permalink)
      clearFile()
      toast.success('Avatar uploaded')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed'
      setError(message)
    } finally {
      setIsUploading(false)
    }
  }

  const previewSrc = filePreview ?? (value || null)

  return (
    <div>
      {/* Label */}
      <div className="flex items-start justify-between mb-1">
        <div>
          {/* biome-ignore lint/a11y/noLabelWithoutControl: controlled externally */}
          <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
            avatar
            {isRequired && <span className="text-red-500 ml-0.5">*</span>}
            {description && (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 cursor-help"
                    >
                      <Info size={14} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-64 text-xs">
                    {description}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </label>
        </div>
      </div>

      {/* Drop zone / Preview */}
      <input
        ref={fileInputRef}
        type="file"
        accept={AVATAR_MIME_TYPES.join(',')}
        onChange={handleInputChange}
        className="hidden"
      />

      {previewSrc && !selectedFile ? (
        /* Current avatar preview */
        <div className="relative group mb-2">
          <button
            type="button"
            className="w-full h-32 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden bg-gray-50 dark:bg-gray-900 flex items-center justify-center cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <img src={previewSrc} alt="Current avatar" className="h-full w-full object-contain" />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
              <span className="text-white text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                Change image
              </span>
            </div>
          </button>
        </div>
      ) : selectedFile && filePreview ? (
        /* Selected file preview */
        <div className="mb-2">
          <div className="w-full h-32 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
            <img src={filePreview} alt="Selected avatar" className="h-full w-full object-contain" />
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {selectedFile.name} ({(selectedFile.size / 1024).toFixed(0)}KB)
            </span>
            <button
              type="button"
              onClick={clearFile}
              className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 cursor-pointer flex items-center gap-1"
            >
              <Trash2 size={12} />
              Remove
            </button>
          </div>
        </div>
      ) : (
        /* Empty drop zone */
        <button
          type="button"
          className="w-full h-28 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors flex flex-col items-center justify-center gap-1.5 cursor-pointer mb-2 bg-gray-50 dark:bg-gray-900"
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          <Upload size={20} className="text-gray-400 dark:text-gray-500" />
          <span className="text-xs text-gray-500 dark:text-gray-400">Click or drag to upload</span>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            JPEG, PNG, WebP — max 512KB
          </span>
        </button>
      )}

      {/* Storage tier selector */}
      {selectedFile && (
        <div className="mb-2">
          <div className="flex gap-1.5">
            {(
              Object.entries(STORAGE_TIERS) as [StorageTier, (typeof STORAGE_TIERS)[StorageTier]][]
            ).map(([tier, config]) => (
              <button
                key={tier}
                type="button"
                onClick={() => setStorageTier(tier)}
                className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                  storageTier === tier
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300'
                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <div>{config.label}</div>
                <div className="text-[10px] font-normal opacity-70">{config.price}</div>
              </button>
            ))}
          </div>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
            {STORAGE_TIERS[storageTier].description}
          </p>
        </div>
      )}

      {/* Upload button */}
      {selectedFile && (
        <button
          type="button"
          onClick={handleUpload}
          disabled={isUploading || !walletClient}
          className="w-full px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center justify-center gap-2 mb-2"
        >
          {isUploading ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <Upload size={14} />
              Upload to {STORAGE_TIERS[storageTier].label}
            </>
          )}
        </button>
      )}

      {/* Error */}
      {error && <p className="text-xs text-red-500 dark:text-red-400 mb-2">{error}</p>}

      {/* Manual URL input toggle */}
      {!selectedFile && (
        <div>
          {showUrlInput ? (
            <div className="flex items-center gap-2">
              <input
                type="url"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="https://..."
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              <button
                type="button"
                onClick={() => setShowUrlInput(false)}
                className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 cursor-pointer whitespace-nowrap"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowUrlInput(true)}
              className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 cursor-pointer flex items-center gap-1"
            >
              <Link size={12} />
              or paste URL
            </button>
          )}
        </div>
      )}
    </div>
  )
}
