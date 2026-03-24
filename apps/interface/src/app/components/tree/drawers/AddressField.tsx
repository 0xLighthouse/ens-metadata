import { EthIcon } from '@/components/icons/eth'

interface Props {
  label: string
  value: string
  onChange: (value: string) => void
}

export function AddressField({ label, value, onChange }: Props) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
      {/* biome-ignore lint/a11y/noLabelWithoutControl: controlled externally */}
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        {label}
      </label>
      <div className="flex items-stretch border border-gray-300 dark:border-gray-600 rounded-lg focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-transparent bg-white dark:bg-gray-900">
        <div className="flex items-center px-3 border-r border-gray-300 dark:border-gray-600 rounded-l-lg">
          <EthIcon />
        </div>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0x…"
          className="flex-1 font-mono text-sm px-3 py-2 bg-transparent outline-none text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
        />
      </div>
    </div>
  )
}
