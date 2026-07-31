import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const profilePackage = join(repositoryRoot, 'packages/profiles/profile.iso19450.2024.draft/0.2.0');
const validator = join(repositoryRoot, 'scripts/validate-opl-golden-manifest.mjs');

test('GATE-05-01 的 13 类 Golden mutation 返回冻结错误码', async (suite) => {
  for (const mutation of mutations()) {
    await suite.test(mutation.name, async () => {
      const temporaryRoot = await mkdtemp(join(tmpdir(), 'opm-golden-manifest-'));
      try {
        const copiedPackage = join(temporaryRoot, 'profile');
        await cp(profilePackage, copiedPackage, { recursive: true });
        const manifestPath = join(copiedPackage, 'golden/opm-opl-golden-manifest.json');
        const profilePath = join(copiedPackage, 'profile.json');
        const manifest = await readJson(manifestPath);
        const profile = await readJson(profilePath);

        await mutation.apply({ copiedPackage, manifest, profile });
        await writeJson(manifestPath, manifest);
        await writeJson(profilePath, profile);

        const result = spawnSync(process.execPath, [validator, manifestPath], {
          cwd: repositoryRoot,
          encoding: 'utf8'
        });
        assert.notEqual(result.status, 0, mutation.name);
        assert.match(`${result.stdout}\n${result.stderr}`, new RegExp(`\\b${mutation.code}\\b`), mutation.name);
      } finally {
        await rm(temporaryRoot, { recursive: true, force: true });
      }
    });
  }
});

test('GATE-05-03 的 coverage catalog 输出冻结报告与错误码', async (suite) => {
  await suite.test('当前完整 manifest 返回 EXACT 报告和退出码 0', async () => {
    const result = spawnSync(process.execPath, [validator, join(profilePackage, 'golden/opm-opl-golden-manifest.json'), '--coverage'], {
      cwd: repositoryRoot,
      encoding: 'utf8'
    });
    assert.equal(result.status, 0);
    const report = await readJson(join(repositoryRoot, 'services/local-runtime/target/golden-coverage/opm-opl-golden-coverage-report.json'));
    const manifest = await readJson(join(profilePackage, 'golden/opm-opl-golden-manifest.json'));
    assert.equal(report.status, 'EXACT');
    assert.deepEqual(report.summary, {
      expected: 178, matched: 178, missing: 0, unexpected: 0, mismatched: 0
    });
  });

  for (const mutation of coverageMutations()) {
    await suite.test(mutation.name, async () => {
      const temporaryRoot = await mkdtemp(join(tmpdir(), 'opm-golden-coverage-'));
      try {
        const copiedPackage = join(temporaryRoot, 'profile');
        await cp(profilePackage, copiedPackage, { recursive: true });
        const manifestPath = join(copiedPackage, 'golden/opm-opl-golden-manifest.json');
        const manifest = await readJson(manifestPath);
        await mutation.apply({ copiedPackage, manifest });
        await writeJson(manifestPath, manifest);
        const result = spawnSync(process.execPath, [validator, manifestPath, '--coverage'], {
          cwd: repositoryRoot,
          encoding: 'utf8'
        });
        assert.equal(result.status, mutation.status, mutation.name);
        assert.match(`${result.stdout}\n${result.stderr}`, new RegExp(`\\b${mutation.code}\\b`), mutation.name);
        if (mutation.expectedMismatched !== undefined) {
          const report = await readJson(join(repositoryRoot, 'services/local-runtime/target/golden-coverage/opm-opl-golden-coverage-report.json'));
          assert.equal(report.summary.mismatched, mutation.expectedMismatched, mutation.name);
        }
      } finally {
        await rm(temporaryRoot, { recursive: true, force: true });
      }
    });
  }
});

test('GATE-05-05 的 Atomic 清单固定为 19 个故障注入输入', async (suite) => {
  const manifestPath = join(profilePackage, 'golden/opm-opl-golden-manifest.json');
  const manifest = await readJson(manifestPath);
  assert.equal(manifest.atomic_cases.length, 19);
  assert.deepEqual(manifest.atomic_cases.map((item) => item.case_id), [
    'G-OPL-ATOMIC-001.UNKNOWN_PRODUCTION.BLOCKED',
    'G-OPL-ATOMIC-002.EXHIBITION_RHS_MISSING.BLOCKED',
    'G-OPL-ATOMIC-003.EXHIBITION_INCOMPLETE.BLOCKED',
    'G-OPL-ATOMIC-004.ASSET_MISSING_RULE.BLOCKED',
    'G-OPL-ATOMIC-005.ASSET_MISSING_SYMBOL.BLOCKED',
    'G-OPL-ATOMIC-006.ASSET_MISSING_GRAMMAR.BLOCKED',
    'G-OPL-ATOMIC-007.ASSET_MISSING_NORMALIZATION.BLOCKED',
    'G-OPL-ATOMIC-008.ASSET_DIGEST_MISMATCH_RULE.BLOCKED',
    'G-OPL-ATOMIC-009.ASSET_DIGEST_MISMATCH_SYMBOL.BLOCKED',
    'G-OPL-ATOMIC-010.ASSET_DIGEST_MISMATCH_GRAMMAR.BLOCKED',
    'G-OPL-ATOMIC-011.ASSET_DIGEST_MISMATCH_NORMALIZATION.BLOCKED',
    'G-OPL-ATOMIC-012.ASSET_IDENTITY_MISMATCH_RULE.BLOCKED',
    'G-OPL-ATOMIC-013.ASSET_IDENTITY_MISMATCH_SYMBOL.BLOCKED',
    'G-OPL-ATOMIC-014.ASSET_IDENTITY_MISMATCH_GRAMMAR.BLOCKED',
    'G-OPL-ATOMIC-015.ASSET_IDENTITY_MISMATCH_NORMALIZATION.BLOCKED',
    'G-OPL-ATOMIC-016.BOUND_RULE_MISSING.BLOCKED',
    'G-OPL-ATOMIC-017.BOUND_SYMBOL_MISSING.BLOCKED',
    'G-OPL-ATOMIC-018.REVISION_BINDING_MISMATCH.BLOCKED',
    'G-OPL-ATOMIC-019.BINDING_DIGEST_MISMATCH.BLOCKED'
  ]);

  await suite.test('错误 stage 或 role 不得偏离冻结矩阵', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'opm-golden-atomic-'));
    try {
      const copiedPackage = join(temporaryRoot, 'profile');
      await cp(profilePackage, copiedPackage, { recursive: true });
      const copiedManifestPath = join(copiedPackage, 'golden/opm-opl-golden-manifest.json');
      const copiedManifest = await readJson(copiedManifestPath);
      copiedManifest.atomic_cases[15].fault.role = 'SYMBOL_ASSET';
      await writeJson(copiedManifestPath, copiedManifest);
      const result = spawnSync(process.execPath, [validator, copiedManifestPath], { cwd: repositoryRoot, encoding: 'utf8' });
      assert.notEqual(result.status, 0);
      assert.match(`${result.stdout}\n${result.stderr}`, /\bGOLDEN_ATOMIC_CONFLICT\b/);
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});

function mutations() {
  return [
    schemaMutation('PASS 空 Token', (manifest) => { passCase(manifest).expected_sentences[0].tokens = []; }),
    schemaMutation('PASS 缺 Trace', (manifest) => { delete passCase(manifest).expected_sentences[0].trace; }),
    schemaMutation('PASS Trace 缺 binding digest', (manifest) => { delete passCase(manifest).expected_sentences[0].trace.binding_digest; }),
    schemaMutation('PASS 携带 error', (manifest) => { passCase(manifest).expected_error_code = 'TEXT_PLAN_UNSUPPORTED'; }),
    schemaMutation('BLOCKED 携带生成输出', (manifest) => { blockedCase(manifest).expected_normalized_fact = structuredClone(passCase(manifest).expected_normalized_fact); }),
    schemaMutation('缺 Normalization ref', (manifest) => { delete passCase(manifest).normalization_adapter_ref; }),
    {
      name: 'Rule version 错误',
      code: 'GOLDEN_ASSET_IDENTITY_MISMATCH',
      apply: async ({ manifest }) => { passCase(manifest).rule_set_ref.version = '9.9.9'; }
    },
    {
      name: 'Symbol 内部 ID 改动导致 package digest 不匹配',
      code: 'GOLDEN_ASSET_DIGEST_MISMATCH',
      apply: async ({ copiedPackage, manifest, profile }) => {
        const path = join(copiedPackage, 'symbols/representative-symbol-catalog.json');
        const symbol = await readJson(path);
        symbol.asset_id = 'symbols.iso19450.2024.corrupted';
        await writeJson(path, symbol);
        const entry = requiredEntry(profile, 'SYMBOL_ASSET');
        const bytes = await readFile(path);
        entry.byte_length = bytes.length;
        entry.digest.digest = sha256(bytes);
        profile.dependencies.find((dependency) => dependency.role === 'SYMBOL_ASSET').asset.id = symbol.asset_id;
        profile.symbol_catalog_ref.id = symbol.asset_id;
        profile.manifest.package_digest.digest = packageDigest(profile);
        passCase(manifest).profile_ref.sha256 = profile.manifest.package_digest.digest;
      }
    },
    {
      name: 'Profile file SHA 冒充 package digest',
      code: 'GOLDEN_ASSET_DIGEST_MISMATCH',
      apply: async ({ copiedPackage, manifest }) => {
        passCase(manifest).profile_ref.sha256 = sha256(await readFile(join(copiedPackage, 'profile.json')));
      }
    },
    {
      name: 'Normalization digest 错误',
      code: 'GOLDEN_ASSET_DIGEST_MISMATCH',
      apply: async ({ manifest }) => { passCase(manifest).normalization_adapter_ref.sha256 = '0'.repeat(64); }
    },
    {
      name: 'Profile dependency 与 ref 不一致',
      code: 'GOLDEN_PROFILE_DEPENDENCY_MISMATCH',
      apply: async ({ profile }) => { profile.text_grammar_ref.version = '9.9.9'; }
    },
    {
      name: 'binding digest 错误',
      code: 'GOLDEN_BINDING_DIGEST_MISMATCH',
      apply: async ({ manifest }) => { passCase(manifest).binding_digest = '0'.repeat(64); }
    },
    {
      name: 'fixture 路径越界',
      code: 'GOLDEN_ASSET_PATH_INVALID',
      apply: async ({ manifest }) => { passCase(manifest).base_revision_fixture = '../profile.json'; }
    },
    {
      name: 'base/candidate model 不匹配',
      code: 'GOLDEN_FIXTURE_SCHEMA_INVALID',
      apply: async ({ copiedPackage, manifest }) => {
        const candidatePath = join(copiedPackage, passCase(manifest).input_revision_fixture);
        const candidate = await readJson(candidatePath);
        candidate.model_id = 'model.golden.unrelated';
        await writeJson(candidatePath, candidate);
      }
    },
    {
      name: 'base/candidate revision sequence 不匹配',
      code: 'GOLDEN_FIXTURE_SCHEMA_INVALID',
      apply: async ({ copiedPackage, manifest }) => {
        const candidatePath = join(copiedPackage, passCase(manifest).input_revision_fixture);
        const candidate = await readJson(candidatePath);
        candidate.revision_sequence += 1;
        await writeJson(candidatePath, candidate);
      }
    },
    {
      name: 'base/candidate parent revision 不匹配',
      code: 'GOLDEN_FIXTURE_SCHEMA_INVALID',
      apply: async ({ copiedPackage, manifest }) => {
        const candidatePath = join(copiedPackage, passCase(manifest).input_revision_fixture);
        const candidate = await readJson(candidatePath);
        candidate.parent_revision_id = 'revision.golden.unrelated';
        await writeJson(candidatePath, candidate);
      }
    }
  ];
}

function coverageMutations() {
  return [
    {
      name: 'catalog digest 错误',
      status: 2,
      code: 'GOLDEN_COVERAGE_CATALOG_INVALID',
      apply: async ({ manifest }) => { manifest.coverage_catalog_ref.sha256 = '0'.repeat(64); }
    },
    {
      name: 'catalog summary 冲突',
      status: 2,
      code: 'GOLDEN_COVERAGE_CATALOG_CONFLICT',
      apply: async ({ copiedPackage, manifest }) => {
        const path = join(copiedPackage, manifest.coverage_catalog_ref.path);
        const catalog = await readJson(path);
        catalog.summary.total = 177;
        await writeJson(path, catalog);
        manifest.coverage_catalog_ref.sha256 = sha256(await readFile(path));
      }
    },
    {
      name: 'manifest 存在未登记 case',
      status: 3,
      code: 'GOLDEN_COVERAGE_UNEXPECTED',
      apply: async ({ manifest }) => {
        const value = passCase(manifest);
        const [prefix] = value.case_id.split('.');
        value.case_id = `${prefix}.${value.variant_key}_ALT.PASS`;
        value.variant_key = `${value.variant_key}_ALT`;
      }
    },
    {
      name: 'manifest 的 template 与 requirement 不一致',
      status: 3,
      code: 'GOLDEN_COVERAGE_MISMATCH',
      expectedMismatched: 1,
      apply: async ({ manifest }) => { passCase(manifest).expected_sentences[0].template_id = 'opl.invalid.v1'; }
    }
  ];
}

function schemaMutation(name, change) {
  return {
    name,
    code: 'GOLDEN_SCHEMA_INVALID',
    apply: async ({ manifest }) => change(manifest)
  };
}

function passCase(manifest) {
  const value = manifest.cases.find((item) => item.expectation === 'PASS');
  assert.ok(value, 'manifest 缺少 PASS case');
  return value;
}

function blockedCase(manifest) {
  const value = manifest.cases.find((item) => item.expectation === 'BLOCKED');
  assert.ok(value, 'manifest 缺少 BLOCKED case');
  return value;
}

function requiredEntry(profile, role) {
  const entry = profile.manifest.entries.find((candidate) => candidate.role === role && candidate.required);
  assert.ok(entry, `缺少 ${role} manifest entry`);
  return entry;
}

function packageDigest(profile) {
  const preimage = profile.manifest.entries
    .filter((entry) => entry.required)
    .sort((left, right) => left.logical_path.localeCompare(right.logical_path))
    .map((entry) => `${entry.logical_path}\n${entry.byte_length}\n${entry.digest.digest}\n`)
    .join('');
  return sha256(Buffer.from(preimage, 'utf8'));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}
