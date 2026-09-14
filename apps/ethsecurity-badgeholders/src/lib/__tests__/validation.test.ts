import { isValidEmail, isValidTelegramHandle, isValidXHandle } from '@/lib/validation'
import { describe, expect, it } from 'vitest'

describe('isValidXHandle', () => {
  it('accepts a plain valid handle', () => {
    expect(isValidXHandle('tayvano_')).toBe(true)
    expect(isValidXHandle('VitalikButerin')).toBe(true)
    expect(isValidXHandle('0xEV_om')).toBe(true)
  })

  it('accepts the 4-character lower boundary', () => {
    expect(isValidXHandle('abcd')).toBe(true)
  })

  it('rejects below the 4-character lower boundary', () => {
    expect(isValidXHandle('abc')).toBe(false)
  })

  it('accepts the 15-character upper boundary', () => {
    expect(isValidXHandle('a'.repeat(15))).toBe(true)
  })

  it('rejects above the 15-character upper boundary', () => {
    expect(isValidXHandle('a'.repeat(16))).toBe(false)
  })

  it('rejects a full profile URL', () => {
    expect(isValidXHandle('https://twitter.com/gf_256')).toBe(false)
    expect(isValidXHandle('https://twitter.com/PatrickAlphaC')).toBe(false)
  })

  it('rejects a leading @', () => {
    expect(isValidXHandle('@tayvano_')).toBe(false)
  })

  it('rejects an empty string', () => {
    expect(isValidXHandle('')).toBe(false)
  })
})

describe('isValidTelegramHandle', () => {
  it('accepts a plain valid handle', () => {
    expect(isValidTelegramHandle('tanuki_42')).toBe(true)
    expect(isValidTelegramHandle('devtooligan')).toBe(true)
  })

  it('accepts the 5-character lower boundary', () => {
    expect(isValidTelegramHandle('stkux')).toBe(true)
  })

  it('rejects below the 5-character lower boundary', () => {
    expect(isValidTelegramHandle('stku')).toBe(false)
  })

  it('accepts the 32-character upper boundary', () => {
    expect(isValidTelegramHandle('a'.repeat(32))).toBe(true)
  })

  it('rejects above the 32-character upper boundary', () => {
    expect(isValidTelegramHandle('a'.repeat(33))).toBe(false)
  })

  it('rejects characters outside the Latin alphanumeric/underscore set', () => {
    expect(isValidTelegramHandle('tanuki-42')).toBe(false)
    expect(isValidTelegramHandle('tanuki.42')).toBe(false)
  })

  it('rejects an empty string', () => {
    expect(isValidTelegramHandle('')).toBe(false)
  })
})

describe('isValidEmail', () => {
  it('accepts plain valid addresses', () => {
    expect(isValidEmail('devtooligan@gmail.com')).toBe(true)
    expect(isValidEmail('steffen@kuxfamily.de')).toBe(true)
  })

  it('rejects a missing @', () => {
    expect(isValidEmail('devtooligan.gmail.com')).toBe(false)
  })

  it('rejects a missing domain', () => {
    expect(isValidEmail('devtooligan@')).toBe(false)
  })

  it('rejects a missing local part', () => {
    expect(isValidEmail('@gmail.com')).toBe(false)
  })

  it('rejects an empty string', () => {
    expect(isValidEmail('')).toBe(false)
  })
})
