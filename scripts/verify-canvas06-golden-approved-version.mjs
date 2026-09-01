import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import { GoldenPublishError, verifyApprovedVersion } from './release-canvas06-golden-publish.mjs';

export function parseGoldenVerifierOptions(values) {
  if (!Array.isArray(values) || values.length !== 3) input('Golden Verifier options are invalid.');
  const options = new Map();
  for (let index = 0; index < values.length; index += 1) {
    const flag = values[index];
    if (flag === '--require-approved') {
      if (options.has('require-approved')) input('Golden Verifier options are duplicated.');
      options.set('require-approved', true);
      continue;
    }
    if (flag !== '--approved-version-root' || options.has('approved-version-root')) input('Golden Verifier options are invalid.');
    const path = values[index + 1];
    if (typeof path !== 'string' || !path.startsWith('/') || path.includes('\\') || path.split('/').includes('..')) input('Approved version root is invalid.');
    options.set('approved-version-root', path);
    index += 1;
  }
  if (options.size !== 2 || options.get('require-approved') !== true) input('Golden Verifier options are incomplete.');
  return Object.freeze({ approvedVersionRoot: options.get('approved-version-root'), requireApproved: true });
}

export async function verifyApprovedGolden(options) {
  if (!options?.requireApproved || typeof options.approvedVersionRoot !== 'string') input('Golden Verifier invocation is invalid.');
  return verifyApprovedVersion(options.approvedVersionRoot);
}

function input(message) { throw new GoldenPublishError('GOLDEN_PUBLISH_INPUT_INVALID', 2, message); }

async function cli() {
  await verifyApprovedGolden(parseGoldenVerifierOptions(process.argv.slice(2)));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  cli().catch(error => {
    process.stderr.write(`${error.code ?? 'GOLDEN_PUBLISH_INTERNAL_ERROR'}\n`);
    if (error.message) process.stderr.write(`${error.message}\n`);
    process.exitCode = error.exitCode ?? 4;
  });
}
