'use client'

import { Button } from '@/components/ui/button'
import { Calendar as CalendarComponent } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ChevronDown } from 'lucide-react'
import { useState } from 'react'

interface DateTimePickerProps {
  date: Date | undefined
  time: string
  onDateChange: (date: Date | undefined) => void
  onTimeChange: (time: string) => void
  label?: string
  description?: string
}

export function DateTimePicker({
  date,
  time,
  onDateChange,
  onTimeChange,
  label = 'Maturity Date & Time',
  description = 'Select the exact date and time when the bond will mature',
}: DateTimePickerProps) {
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const [selectedDateOption, setSelectedDateOption] = useState<string>('Custom')

  const handleDateOptionSelect = (option: string) => {
    setSelectedDateOption(option)

    if (option !== 'Custom') {
      const now = new Date()
      const newDate = new Date(now)

      switch (option) {
        case '+6M':
          newDate.setMonth(newDate.getMonth() + 6)
          break
        case '+3M':
          newDate.setMonth(newDate.getMonth() + 3)
          break
        case '+1M':
          newDate.setMonth(newDate.getMonth() + 1)
          break
        case '+1D':
          newDate.setDate(newDate.getDate() + 1)
          break
      }

      onDateChange(newDate)
      // Keep the current time when using quick date options
    }
  }

  const handleManualDateChange = (newDate: Date | undefined) => {
    onDateChange(newDate)
    setDatePickerOpen(false)
    setSelectedDateOption('Custom') // Reset to Custom when manually selecting
  }

  const handleTimeChange = (newTime: string) => {
    onTimeChange(newTime)
    setSelectedDateOption('Custom') // Reset to Custom when manually changing time
  }

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">{label}</Label>

      <div className="flex gap-3">
        {/* Date Picker */}
        <div className="flex-1">
          <Label htmlFor="maturity-date" className="text-xs text-gray-600 mb-1 block">
            Date
          </Label>
          <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                id="maturity-date"
                className="w-full justify-between font-normal"
                type="button"
              >
                {date ? date.toLocaleDateString() : 'Select date'}
                <ChevronDown className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto overflow-hidden p-0" align="start">
              <CalendarComponent
                mode="single"
                selected={date}
                captionLayout="dropdown"
                onSelect={handleManualDateChange}
                disabled={{ before: new Date() }}
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Time Picker */}
        <div className="w-32">
          <Label htmlFor="maturity-time" className="text-xs text-gray-600 mb-1 block">
            Time
          </Label>
          <Input
            type="time"
            id="maturity-time"
            step="1"
            value={time}
            onChange={(e) => handleTimeChange(e.target.value)}
            className="bg-background appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
          />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm text-gray-600">Quick maturity options</p>
        <div className="grid grid-cols-4 gap-2">
          {['+6M', '+3M', '+1M', '+1D'].map((option) => (
            <Button
              key={option}
              type="button"
              variant={selectedDateOption === option ? 'default' : 'outline'}
              size="sm"
              className={`text-sm transition-colors ${
                selectedDateOption === option
                  ? 'bg-black text-white hover:bg-gray-800'
                  : 'bg-white text-black hover:bg-gray-50 border-gray-300'
              }`}
              onClick={() => handleDateOptionSelect(option)}
            >
              {option}
            </Button>
          ))}
        </div>
      </div>

      <p className="text-xs text-gray-500">{description}</p>
    </div>
  )
}
