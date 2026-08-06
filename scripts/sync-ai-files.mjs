#!/usr/bin/env node
// Syncs the repo-root SKILL.md and llms.txt into packages/core/ so they ship
// inside the published npm tarball. Run by `prepublishOnly` and manually.
//
// Why: AI coding tools (Cursor, Copilot, Claude Code, Continue, Windsurf) read
// repo files. The root-level files are visible on GitHub, but npm-install
// consumers only get what's inside the package tarball. Copying them into
// packages/core/ and listing them in the `files` field means
// `node_modules/@saganta/stellar-appkit/SKILL.md` and
// `node_modules/@saganta/stellar-appkit/llms.txt` exist for every consumer.
//
// The root files remain the source of truth — edits should go there.

import { copyFile, mkdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const corePkg = join(repoRoot, 'packages', 'core');

const files = ['SKILL.md', 'llms.txt'];

for (const name of files) {
  const src = join(repoRoot, name);
  const dest = join(corePkg, name);

  try {
    await access(src);
  } catch {
    console.error(`[sync-ai-files] source not found: ${src}`);
    process.exit(1);
  }

  await copyFile(src, dest);
  console.log(`[sync-ai-files] ${name}  ->  packages/core/${name}`);
}

console.log('[sync-ai-files] done');
