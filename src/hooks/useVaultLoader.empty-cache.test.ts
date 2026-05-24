import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VaultEntry } from '../types'
import { useVaultLoader } from './useVaultLoader'

const backendInvokeFn = vi.fn()
let mockIsTauri = true

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => backendInvokeFn(...args),
}))

vi.mock('../mock-tauri', () => ({
  isTauri: () => mockIsTauri,
  mockInvoke: (command: string, args?: Record<string, unknown>) => backendInvokeFn(command, args),
}))

function makeEntry(path: string, title: string): VaultEntry {
  return {
    path,
    filename: path.split('/').pop() ?? 'note.md',
    title,
    isA: 'Note',
    aliases: [],
    belongsTo: [],
    relatedTo: [],
    status: 'Active',
    archived: false,
    modifiedAt: 1,
    createdAt: 1,
    fileSize: 100,
    snippet: '',
    wordCount: 0,
    relationships: {},
    icon: null,
    color: null,
    order: null,
    sidebarLabel: null,
    template: null,
    sort: null,
    view: null,
    visible: null,
    organized: false,
    favorite: false,
    favoriteIndex: null,
    listPropertiesDisplay: [],
    outgoingLinks: [],
    properties: {},
    hasH1: true,
    fileKind: 'markdown',
  }
}

function commandKey(command: string, args?: Record<string, unknown>): string {
  return `${command}:${typeof args?.path === 'string' ? args.path : ''}`
}

describe('useVaultLoader empty cache recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsTauri = true
  })

  it('keeps mounted workspace entries visible while a newly active empty workspace loads', async () => {
    const hsHub = { label: 'HS-Hub', path: '/hs-hub', alias: 'hs-hub', available: true, mounted: true }
    const refactoring = { label: 'Refactoring', path: '/refactoring', alias: 'refactoring', available: true, mounted: true }
    const commandResults = new Map<string, unknown>([
      ['reload_vault:/hs-hub', [makeEntry('/hs-hub/note/hello.md', 'HS-Hub Hello')]],
      ['reload_vault:/refactoring', []],
      ['list_vault:/refactoring', []],
      ['get_modified_files:', []],
      ['list_vault_folders:', []],
      ['list_views:', []],
    ])

    backendInvokeFn.mockImplementation((command: string, args?: Record<string, unknown>) => {
      return Promise.resolve(commandResults.get(commandKey(command, args)) ?? null)
    })

    const { result, rerender } = renderHook(
      ({ activePath, vaults }) => useVaultLoader(activePath, vaults, activePath, vaults),
      { initialProps: { activePath: '/hs-hub', vaults: [hsHub] } },
    )

    await waitFor(() => {
      expect(result.current.entries.map((entry) => entry.title)).toEqual(['HS-Hub Hello'])
    })

    rerender({ activePath: '/refactoring', vaults: [hsHub, refactoring] })

    expect(result.current.entries.map((entry) => entry.title)).toContain('HS-Hub Hello')
    await waitFor(() => {
      expect(result.current.entries.map((entry) => entry.title)).toContain('HS-Hub Hello')
    })
  })

  it('reloads a background workspace when its cached startup listing is empty in Tauri mode', async () => {
    const brian = { label: 'Brian', path: '/brian', alias: 'brian', available: true, mounted: true }
    const hsHub = { label: 'HS-Hub', path: '/hs-hub', alias: 'hs-hub', available: true, mounted: true }
    const commandResults = new Map<string, unknown>([
      ['reload_vault:/brian', [makeEntry('/brian/note/hello.md', 'Brian Hello')]],
      ['list_vault:/hs-hub', []],
      ['reload_vault:/hs-hub', [makeEntry('/hs-hub/note/hello.md', 'HS-Hub Hello')]],
      ['get_modified_files:', []],
      ['list_vault_folders:', []],
      ['list_views:', []],
    ])

    backendInvokeFn.mockImplementation((command: string, args?: Record<string, unknown>) => {
      return Promise.resolve(commandResults.get(commandKey(command, args)) ?? null)
    })

    const vaults = [brian, hsHub]
    const { result } = renderHook(() => useVaultLoader('/brian', vaults, '/brian', vaults))

    await waitFor(() => {
      expect(result.current.entries.map((entry) => entry.title).sort()).toEqual(['Brian Hello', 'HS-Hub Hello'])
    })

    const hsHubLoads = backendInvokeFn.mock.calls
      .filter(([command, args]) => {
        return args?.path === '/hs-hub' && (command === 'list_vault' || command === 'reload_vault')
      })
      .map(([command]) => command)
    expect(hsHubLoads).toEqual(['list_vault', 'reload_vault'])
  })
})
