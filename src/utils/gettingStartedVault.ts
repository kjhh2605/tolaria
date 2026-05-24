export const GETTING_STARTED_VAULT_NAME = '시작 가이드'

const CLONE_PATH_ERRORS = [
  'already exists and is not empty',
  'already exists and is not a directory',
  'Failed to create parent directory',
  'Target path is required',
]

const GIT_NOT_FOUND_ERRORS = [
  'no such file or directory',
  'os error 2',
  'program not found',
  'system cannot find the file',
]

const NETWORK_ERRORS = [
  'could not resolve host',
  'connection refused',
  'network is unreachable',
  'timed out',
  'failed to connect',
  'ssl connect error',
]

const AUTH_ERRORS = [
  'authentication failed',
  'could not read username',
  'permission denied',
  'repository not found',
  '403',
]

export function buildGettingStartedVaultPath(parentPath: string): string {
  const trimmed = parentPath.trim().replace(/[\\/]+$/g, '')
  if (!trimmed) {
    return GETTING_STARTED_VAULT_NAME
  }

  const separator = trimmed.includes('\\') && !trimmed.includes('/') ? '\\' : '/'
  return `${trimmed}${separator}${GETTING_STARTED_VAULT_NAME}`
}

export function labelFromPath(path: string): string {
  const trimmed = path.trim().replace(/[\\/]+$/g, '')
  return trimmed.split(/[\\/]/).pop() || 'Vault'
}

export function formatGettingStartedCloneError(err: unknown): string {
  const message =
    typeof err === 'string'
      ? err
      : err instanceof Error
        ? err.message
        : `${err}`

  if (CLONE_PATH_ERRORS.some(fragment => message.includes(fragment))) {
    return message
  }

  const lower = message.toLowerCase()
  if (GIT_NOT_FOUND_ERRORS.some(fragment => lower.includes(fragment))) {
    return '시작 가이드 볼트를 다운로드하려면 Git이 필요합니다. Git을 설치한 뒤 다시 시도하세요.'
  }
  if (AUTH_ERRORS.some(fragment => lower.includes(fragment))) {
    return '시작 가이드 볼트를 다운로드할 수 없습니다. GitHub 접근 권한을 확인한 뒤 다시 시도하세요.'
  }
  if (NETWORK_ERRORS.some(fragment => lower.includes(fragment))) {
    return '시작 가이드 볼트를 다운로드할 수 없습니다. 인터넷 연결을 확인한 뒤 다시 시도하세요.'
  }

  return `시작 가이드 볼트를 다운로드할 수 없습니다: ${firstCloneErrorLine(message)}`
}

function firstCloneErrorLine(message: string): string {
  return message
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(Boolean) ?? 'git에서 알 수 없는 오류를 반환했습니다'
}
