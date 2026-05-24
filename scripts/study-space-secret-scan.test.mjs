import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  formatViolation,
  loadStudySpaceSecretFixtures,
  scanFiles,
  scanTextForForbiddenValues,
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
  const tempRoot = path.join(os.tmpdir(), `study-space-secret-scan-${process.pid}`)
  rmSync(tempRoot, { recursive: true, force: true })
  mkdirSync(tempRoot, { recursive: true })

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
