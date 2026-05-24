import { beforeEach, describe, expect, it, vi } from 'vitest'
import { APP_STORAGE_KEYS, getAppStorageItem } from './appStorage'

describe('appStorage', () => {
  let store: Record<string, string>

  beforeEach(() => {
    store = {}
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => store[key] ?? null),
      setItem: vi.fn((key: string, value: string) => { store[key] = value }),
    })
  })

  it('reads HS-Hub storage keys only', () => {
    store[APP_STORAGE_KEYS.viewMode] = 'editor-list'

    expect(getAppStorageItem('viewMode')).toBe('editor-list')
  })

  it('does not fall back to previous app storage keys', () => {
    store[['la', 'puta-view-mode'].join('')] = 'editor-list'

    expect(getAppStorageItem('viewMode')).toBeNull()
  })

  it('returns safely when localStorage is restricted', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => { throw new Error('SecurityError') }),
      setItem: vi.fn(() => { throw new Error('SecurityError') }),
    })

    expect(getAppStorageItem('theme')).toBeNull()
  })
})
