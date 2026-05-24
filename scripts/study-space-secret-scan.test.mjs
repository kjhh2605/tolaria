import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  formatViolation,
  loadStudySpaceSecretFixtures,
  scanFiles,
  scanTextForForbiddenValues,
  trackedFiles,
} from './study-space-secret-scan.mjs'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

test('sanitized study-space fixture does not contain unsafe fixture values', () => {
  const values = loadStudySpaceSecretFixtures(root)
  const sanitized = readFileSync(
    path.join(root, 'tests/fixtures/security/study-space-secret-sanitized.json'),
    'utf8',
  )

  assert.deepEqual(scanTextForForbiddenValues(sanitized, values), [])
})

test('secret scanner reports labels and paths without echoing secret values', () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'study-space-secret-scan-'))

  const [fixtureValue] = loadStudySpaceSecretFixtures(root)
  const leakPath = path.join(tempRoot, 'leaky-log.txt')
  writeFileSync(leakPath, `unsafe value: ${fixtureValue.value}`)

  const violations = scanFiles(['leaky-log.txt'], {
    root: tempRoot,
    forbiddenValues: [fixtureValue],
    allowedUnsafePaths: [],
  })

  assert.equal(violations.length, 1)
  assert.deepEqual(violations[0].fields, [fixtureValue.field])

  const formatted = formatViolation(violations[0])
  assert.match(formatted, /leaky-log\.txt/)
  assert.match(formatted, new RegExp(fixtureValue.field))
  assert.equal(formatted.includes(fixtureValue.value), false)

  rmSync(tempRoot, { recursive: true, force: true })
})

test('tracked repository scan keeps unsafe fixture scoped to its allowlist', () => {
  const fixtureRelativePath = 'tests/fixtures/security/study-space-secret-input.json'
  const values = loadStudySpaceSecretFixtures(root)
  const fixtureFiles = trackedFiles(root)
    .filter((file) => file.startsWith('tests/fixtures/security/'))
    .sort()

  assert.equal(fixtureFiles.includes(fixtureRelativePath), true)
  assert.deepEqual(
    scanFiles(fixtureFiles, { root, forbiddenValues: values }),
    [],
  )

  const violations = scanFiles(fixtureFiles, {
    root,
    forbiddenValues: values,
    allowedUnsafePaths: [],
  })
  assert.deepEqual(
    violations.map((violation) => violation.path),
    [fixtureRelativePath],
  )
})
