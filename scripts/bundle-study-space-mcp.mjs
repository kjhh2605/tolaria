#!/usr/bin/env node
/**
 * Build the Python runtime used by the Hansung school-service Python bridges
 * (Study Space reservation and read-only LMS dashboard).
 *
 * Output: src-tauri/resources/study-space-python/
 * The directory is generated and gitignored, just like resources/mcp-server/.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(import.meta.url), '..', '..')
const OUT = join(ROOT, 'src-tauri', 'resources', 'study-space-python')
const DEFAULT_SPEC = 'git+https://github.com/kjhh2605/Hs-MCP.git@db74f2ba5230a4ca7a1b892bbacf6632b67e19df'
const SPEC = process.env.HS_MCP_PACKAGE_SPEC || DEFAULT_SPEC
const PYTHON = process.env.HS_HUB_STUDY_SPACE_PYTHON || process.env.PYTHON || 'python3'
const FORCE = process.env.HS_MCP_BUNDLE_FORCE === '1' || process.argv.includes('--force')
const MANIFEST = join(OUT, 'hs-hub-study-space-runtime.json')

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    cwd: ROOT,
    env: process.env,
    ...options,
  })
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit ${result.status}`)
  }
}

function pruneGeneratedNoise(dir) {
  run(PYTHON, ['-c', String.raw`
import pathlib, shutil
root = pathlib.Path(r'''${dir}''')
for pattern in ('__pycache__', '.pytest_cache'):
    for path in root.rglob(pattern):
        shutil.rmtree(path, ignore_errors=True)
for pattern in ('*.pyc', '*.pyo'):
    for path in root.rglob(pattern):
        try:
            path.unlink()
        except FileNotFoundError:
            pass
for name in ('bin',):
    shutil.rmtree(root / name, ignore_errors=True)
`])
}

if (!FORCE && existsSync(join(OUT, 'hs_mcp')) && existsSync(MANIFEST)) {
  console.log('study-space Hs-MCP runtime already bundled → src-tauri/resources/study-space-python/')
  process.exit(0)
}

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

run(PYTHON, [
  '-m',
  'pip',
  'install',
  '--upgrade',
  '--target',
  OUT,
  SPEC,
])

pruneGeneratedNoise(OUT)
writeFileSync(MANIFEST, `${JSON.stringify({ package: SPEC, generatedBy: 'scripts/bundle-study-space-mcp.mjs', services: ['study-space', 'lms-dashboard'] }, null, 2)}\n`)
console.log('school-service Hs-MCP runtime bundled → src-tauri/resources/study-space-python/')
