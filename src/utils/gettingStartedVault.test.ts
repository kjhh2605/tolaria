import { describe, expect, it } from 'vitest'
import {
  GETTING_STARTED_VAULT_NAME,
  buildGettingStartedVaultPath,
  formatGettingStartedCloneError,
  labelFromPath,
} from './gettingStartedVault'

describe('gettingStartedVault', () => {
  it('builds a child vault path from a parent folder', () => {
    expect(buildGettingStartedVaultPath('/Users/luca/Documents')).toBe('/Users/luca/Documents/시작 가이드')
  })

  it('trims trailing separators when building the child vault path', () => {
    expect(buildGettingStartedVaultPath('/Users/luca/Documents/')).toBe('/Users/luca/Documents/시작 가이드')
  })

  it('preserves windows separators when building the child vault path', () => {
    expect(buildGettingStartedVaultPath('C:\\Users\\luca\\Documents\\')).toBe('C:\\Users\\luca\\Documents\\시작 가이드')
  })

  it('derives a label from the final path segment', () => {
    expect(labelFromPath('/Users/luca/Documents/시작 가이드')).toBe(GETTING_STARTED_VAULT_NAME)
  })

  it('passes through destination errors verbatim', () => {
    expect(formatGettingStartedCloneError("Destination '/tmp/시작 가이드' already exists and is not empty"))
      .toBe("Destination '/tmp/시작 가이드' already exists and is not empty")
  })

  it('maps git-not-found clone failures to an installation message', () => {
    expect(formatGettingStartedCloneError('Failed to run git clone: The system cannot find the file specified. (os error 2)'))
      .toBe('시작 가이드 볼트를 다운로드하려면 Git이 필요합니다. Git을 설치한 뒤 다시 시도하세요.')
  })

  it('maps concrete network clone failures to the connection message', () => {
    expect(formatGettingStartedCloneError('git clone failed: fatal: unable to access: Could not resolve host: github.com'))
      .toBe('시작 가이드 볼트를 다운로드할 수 없습니다. 인터넷 연결을 확인한 뒤 다시 시도하세요.')
  })

  it('preserves unexpected clone failure details', () => {
    expect(formatGettingStartedCloneError('git clone failed: fatal: unable to access'))
      .toBe('시작 가이드 볼트를 다운로드할 수 없습니다: git clone failed: fatal: unable to access')
  })
})
