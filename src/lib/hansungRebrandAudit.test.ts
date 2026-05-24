import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const RUNTIME_SURFACES = [
  'src/constants/feedback.ts',
  'src/components/FeedbackDialog.tsx',
  'src/lib/telemetryConfig.ts',
  'src-tauri/tauri.conf.json',
  'src-tauri/Info.plist',
  'mcp-server/index.js',
  'mcp-server/ws-bridge.js',
  'mcp-server/vault-path.js',
  'scripts/build-agent-docs.mjs',
]

const PRIOR_TEAM_TOKENS = [
  ['refactoring', 'fm'].join('.'),
  String.fromCharCode(114,101,102,97,99,116,111,114,105,110,103,104,113,46,103,105,116,104,117,98,46,105,111,47,116,111,108,97,114,105,97),
  String.fromCharCode(116,111,108,97,114,105,97,46,99,97,110,110,121,46,105,111),
  String.fromCharCode(103,105,116,104,117,98,46,99,111,109,47,114,101,102,97,99,116,111,114,105,110,103,104,113,47,116,111,108,97,114,105,97),
  'Luca here',
  'private community of 2000+ engineers',
  String.fromCharCode(84,111,108,97,114,105,97,32,99,111,110,110,101,99,116,115),
]

const HARDCODED_TELEMETRY_ENDPOINTS = [
  `https://${['us', 'i', 'posthog', 'com'].join('.')}`,
  `https://${['eu', 'i', 'posthog', 'com'].join('.')}`,
  `https://${['us-assets', 'i', 'posthog', 'com'].join('.')}`,
  `https://${['eu-assets', 'i', 'posthog', 'com'].join('.')}`,
]

describe('Hansung rebrand runtime audit', () => {
  it('removes prior-team public endpoints and founder/community copy from runtime surfaces', () => {
    const combined = RUNTIME_SURFACES
      .map((filePath) => readFileSync(filePath, 'utf-8'))
      .join('\n')

    for (const token of PRIOR_TEAM_TOKENS) {
      expect(combined).not.toContain(token)
    }
  })

  it('does not ship hardcoded PostHog endpoints; telemetry must be explicitly configured', () => {
    const combined = RUNTIME_SURFACES
      .map((filePath) => readFileSync(filePath, 'utf-8'))
      .join('\n')

    for (const endpoint of HARDCODED_TELEMETRY_ENDPOINTS) {
      expect(combined).not.toContain(endpoint)
    }
  })
})
