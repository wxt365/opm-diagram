import { parseVerifierOptions, PreflightInputError, verifyPreflightInput } from './release-canvas06-e2e-fault-launcher-preflight-input.mjs';

export async function main(argv = process.argv.slice(2)) {
  const options = parseVerifierOptions(argv);
  return verifyPreflightInput({ sourceRoot: options['source-root'], bundleRoot: options['controlled-bundle-root'], fixedHandoff: options['fixed-handoff'], activationRoot: options['production-activation-root'] });
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  main().then(() => process.stdout.write('PRELIGHT_INPUT_VERIFIED\n')).catch(error => {
    process.stderr.write(`${error.code ?? 'PRELIGHT_INPUT_INTERNAL_ERROR'}\n`);
    process.exitCode = error instanceof PreflightInputError ? error.exitCode : 4;
  });
}
