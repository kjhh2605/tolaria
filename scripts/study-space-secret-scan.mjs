import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const defaultRoot = path.resolve(scriptDir, '..')
const fixturePath = 'tests/fixtures/security/study-space-secret-input.json'
const defaultUnsafeFixturePath = path.join(defaultRoot, fixturePath)
const secretFieldNames = [
  'student_id',
  'student_name',
  'password',
  'session_cookie',
  'access_token',
  'raw_authenticated_payload',
]

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

export function loadStudySpaceSecretFixtures(root = defaultRoot) {
  const fixture = readJson(path.join(root, fixturePath))
  return secretFieldNames
    .map((field) => ({ field, value: fixture[field] }))
    .filter(({ value }) => typeof value === 'string' && value.length > 0)
}

function toRepoRelative(root, filePath) {
  return path.relative(root, path.resolve(root, filePath)).split(path.sep).join('/')
}

export function trackedFiles(root = defaultRoot) {
  const output = execFileSync('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'utf8',
  })
  return output.split('\0').filter(Boolean)
}

export function scanTextForForbiddenValues(text, forbiddenValues) {
  return forbiddenValues
    .filter(({ value }) => text.includes(value))
    .map(({ field }) => field)
}

export function scanFiles(files, options = {}) {
  const root = options.root ?? defaultRoot
  const forbiddenValues = options.forbiddenValues ?? loadStudySpaceSecretFixtures(root)
  const allowedUnsafePaths = new Set(options.allowedUnsafePaths ?? [fixturePath])
  const violations = []

  for (const file of files) {
    const relativePath = toRepoRelative(root, file)
    if (allowedUnsafePaths.has(relativePath)) continue

    const absolutePath = path.join(root, relativePath)
    if (!existsSync(absolutePath)) continue

    const text = readFileSync(absolutePath, 'utf8')
    const fields = scanTextForForbiddenValues(text, forbiddenValues)
    if (fields.length > 0) {
      violations.push({ path: relativePath, fields })
    }
  }

  return violations
}

export function formatViolation(violation) {
  return `${violation.path}: forbidden study-space fixture value(s): ${violation.fields.join(', ')}`
}

export function runCli(root = defaultRoot) {
  const violations = scanFiles(trackedFiles(root), { root })
  if (violations.length > 0) {
    console.error('Study-space secret scan failed. Values are not printed; only field labels are shown.')
    for (const violation of violations) {
      console.error(`- ${formatViolation(violation)}`)
    }
    return 1
  }

  console.log(`Study-space secret scan passed. Unsafe fixture allowlist: ${fixturePath}`)
  return 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli(defaultRoot)
}

export { defaultRoot, defaultUnsafeFixturePath, fixturePath, secretFieldNames }
