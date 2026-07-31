import { execFile as execFileCallback } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import Ajv2020 from 'ajv/dist/2020.js';

const execFile = promisify(execFileCallback);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const revisionSchema = JSON.parse(await readFile(resolve(repositoryRoot, 'docs/contracts/schemas/opm-revision-v0.2.schema.json'), 'utf8'));

export function createRevisionValidator() {
  return new Ajv2020({ allErrors: true, strict: false }).compile(revisionSchema);
}

export function assertValidCommittedRevision(validate, document, label) {
  if (!validate(document)) {
    throw new Error(`REPLAY_COMMIT_STATE_MISMATCH: committed revision schema validation failed: ${label}: ${JSON.stringify(validate.errors)}`);
  }
}

async function readCommittedDocument(databasePath, revisionId) {
  const revisionLiteral = `'${revisionId.replaceAll("'", "''")}'`;
  const { stdout } = await execFile('sqlite3', ['-json', databasePath,
    `SELECT document_json FROM revision_document WHERE revision_id = ${revisionLiteral}`]);
  const rows = JSON.parse(stdout);
  if (rows.length !== 1) {
    throw new Error(`REPLAY_COMMIT_STATE_MISMATCH: committed revision document is missing: ${revisionId}`);
  }
  return JSON.parse(rows[0].document_json);
}

export async function verifyCommittedRevisions(manifestPath, workRoot) {
  const absoluteManifestPath = resolve(manifestPath);
  const manifest = JSON.parse(await readFile(absoluteManifestPath, 'utf8'));
  const profileRoot = resolve(dirname(absoluteManifestPath), '..');
  const validate = createRevisionValidator();
  let checked = 0;

  for (const goldenCase of manifest.cases) {
    if (goldenCase.expectation !== 'PASS') continue;
    const candidatePath = resolve(profileRoot, goldenCase.input_revision_fixture);
    const candidate = JSON.parse(await readFile(candidatePath, 'utf8'));
    for (const attempt of [1, 2]) {
      const databasePath = resolve(workRoot, goldenCase.case_id, String(attempt), 'projects/project.golden/project.db');
      const document = await readCommittedDocument(databasePath, candidate.revision_id);
      assertValidCommittedRevision(validate, document, `${goldenCase.case_id}/${attempt}`);
      checked += 1;
    }
  }
  return checked;
}

async function main() {
  const args = new Map();
  for (let index = 2; index < process.argv.length; index += 2) {
    args.set(process.argv[index], process.argv[index + 1]);
  }
  const manifestPath = args.get('--manifest');
  const workRoot = args.get('--work-root');
  if (!manifestPath || !workRoot || process.argv.length !== 6) {
    throw new Error('Usage: node scripts/validate-opl-golden-committed-revisions.mjs --manifest <manifest.json> --work-root <directory>');
  }
  const checked = await verifyCommittedRevisions(manifestPath, workRoot);
  console.log(`OPL committed revision schema validation passed: ${checked} PASS attempts.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
