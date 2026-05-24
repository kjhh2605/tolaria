import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock isTauri — default to browser mode
vi.mock('../mock-tauri', () => ({
  isTauri: vi.fn(() => false),
}))

const openMock = vi.fn()

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: (...args: unknown[]) => openMock(...args),
}))

import { pickFolder } from './vault-dialog'
import { isTauri } from '../mock-tauri'

describe('pickFolder', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns user input from prompt in browser mode', async () => {
    vi.mocked(isTauri).mockReturnValue(false)
    vi.spyOn(window, 'prompt').mockReturnValue('/Users/test/my-vault')

    const result = await pickFolder('Select vault')
    expect(result).toBe('/Users/test/my-vault')
    expect(window.prompt).toHaveBeenCalledWith('Select vault')
  })

  it('returns null when user cancels prompt in browser mode', async () => {
    vi.mocked(isTauri).mockReturnValue(false)
    vi.spyOn(window, 'prompt').mockReturnValue(null)

    const result = await pickFolder('Select vault')
    expect(result).toBeNull()
  })

  it('uses default title when none provided in browser mode', async () => {
    vi.mocked(isTauri).mockReturnValue(false)
    vi.spyOn(window, 'prompt').mockReturnValue('/some/path')

    await pickFolder()
    expect(window.prompt).toHaveBeenCalledWith('Enter folder path:')
  })

  it('normalizes file URLs returned by the browser fallback prompt', async () => {
    vi.mocked(isTauri).mockReturnValue(false)
    vi.spyOn(window, 'prompt').mockReturnValue('file:///Users/test/My%20Vault')

    const result = await pickFolder('Select vault')

    expect(result).toBe('/Users/test/My Vault')
  })

  it('normalizes a native single-selection array to its first folder path', async () => {
    vi.mocked(isTauri).mockReturnValue(true)
    openMock.mockResolvedValue(['/Users/test/my-vault'])

    const result = await pickFolder('Select vault')

    expect(result).toBe('/Users/test/my-vault')
    expect(openMock).toHaveBeenCalledWith({
      directory: true,
      multiple: false,
      title: 'Select vault',
    })
  })

  it('ignores overlapping native folder picker requests while one is open', async () => {
    vi.mocked(isTauri).mockReturnValue(true)

    let resolveOpen: ((path: string) => void) | null = null
    openMock.mockReturnValueOnce(new Promise((resolve) => {
      resolveOpen = resolve
    }))

    const firstRequest = pickFolder('Open vault folder')
    const secondRequest = pickFolder('Open vault folder')

    await expect(secondRequest).resolves.toBeNull()
    expect(openMock).toHaveBeenCalledTimes(1)

    resolveOpen?.('/Users/test/restored-vault')
    await expect(firstRequest).resolves.toBe('/Users/test/restored-vault')
  })

  it('normalizes native file URLs to filesystem paths', async () => {
    vi.mocked(isTauri).mockReturnValue(true)
    openMock.mockResolvedValue('file:///Users/test/My%20Vault')

    const result = await pickFolder('Select vault')

    expect(result).toBe('/Users/test/My Vault')
  })
})
