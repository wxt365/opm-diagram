import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const profileRoot = resolve(repositoryRoot, 'packages/profiles/profile.iso19450.2024.draft/0.2.0');
const catalogPath = resolve(profileRoot, 'golden/opm-opl-coverage-catalog.json');
const basePath = resolve(profileRoot, 'golden/fixtures/base-golden.struct.003.json');
const write = process.argv.includes('--write');
const [catalog, base] = await Promise.all([readJson(catalogPath), readJson(basePath)]);
const requirements = catalog.requirements.filter((item) => item.family === 'STRUCT');

if (requirements.length !== 110 || requirements.filter((item) => item.expectation === 'PASS').length !== 94
  || requirements.filter((item) => item.expectation === 'BLOCKED').length !== 16) {
  throw new Error('Structural coverage catalog must stay frozen at 94 PASS and 16 BLOCKED requirements');
}

for (const requirement of requirements) {
  const candidate = requirement.expectation === 'PASS' ? passCandidate(requirement) : blockedCandidate(requirement);
  await syncJson(resolve(profileRoot, fixturePath(requirement)), candidate, write);
}

function passCandidate(requirement) {
  const candidate = emptyCandidate(requirement);
  const fact = baseFact(requirement);
  const number = capabilityNumber(requirement.capability_id);
  const dimensions = requirement.dimensions;
  if (number >= 1 && number <= 4) {
    const [source, target] = binaryThings(candidate, dimensions.endpoint_domain);
    fact.endpoints = [endpoint(fact, 'source', 'STRUCTURAL_SOURCE', 'ELEMENT', source, 0), endpoint(fact, 'target', 'STRUCTURAL_TARGET', 'ELEMENT', target, 1)];
    fact.direction = number === 3 ? 'BIDIRECTIONAL' : number === 4 ? 'UNDIRECTED' : 'DIRECTED';
    if (number === 1 || number === 3) fact.labels = number === 3
      ? [label('forward_tag', 'feeds'), label('reverse_tag', 'depends on')]
      : [label('forward_tag', 'feeds')];
    if (number === 4 && requirement.variant_key.includes('TAGGED')) fact.labels = [label('reciprocal', 'connected')];
  } else if (number === 5) {
    const [whole, parts] = fanThings(candidate, dimensions.endpoint_domain, dimensions.fan_size, 'part');
    fact.endpoints = [endpoint(fact, 'whole', 'WHOLE_THING', 'ELEMENT', whole, 0), ...parts.map((id, index) => endpoint(fact, `part-${index + 1}`, 'PART_THING', 'ELEMENT', id, index + 1))];
    fact.collection_completeness = dimensions.completeness;
  } else if (number === 6) {
    const exhibitor = thing(candidate, dimensions.endpoint_domain, 'exhibitor');
    const featureKinds = featureKindsFor(requirement);
    const features = featureKinds.map((kind, index) => feature(candidate, exhibitor, kind, `${kind.toLowerCase()} ${index + 1}`));
    fact.endpoints = [endpoint(fact, 'exhibitor', 'EXHIBITOR_THING', 'ELEMENT', exhibitor, 0), ...features.map((id, index) => endpoint(fact, `feature-${index + 1}`, 'FEATURE_THING', 'FEATURE', id, index + 1))];
    fact.collection_completeness = dimensions.completeness;
    if (requirement.variant_key.startsWith('EXHIBITION_')) {
      fact.source = productionSource();
      fact.collection_completeness = 'COMPLETE';
    }
  } else if (number === 7) {
    const [general, specialized] = fanThings(candidate, dimensions.endpoint_domain, dimensions.fan_size, 'special');
    fact.endpoints = [endpoint(fact, 'general', 'GENERAL_THING', 'ELEMENT', general, 0), ...specialized.map((id, index) => endpoint(fact, `special-${index + 1}`, 'SPECIALIZED_THING', 'ELEMENT', id, index + 1))];
    fact.collection_completeness = dimensions.completeness;
  } else if (number === 8) {
    const [type, instances] = fanThings(candidate, dimensions.endpoint_domain, dimensions.fan_size, 'instance');
    fact.endpoints = [endpoint(fact, 'class', 'CLASS_THING', 'ELEMENT', type, 0), ...instances.map((id, index) => endpoint(fact, `instance-${index + 1}`, 'INSTANCE_THING', 'ELEMENT', id, index + 1))];
  } else if (number === 9) {
    const object = thing(candidate, 'OBJECT', 'specialized');
    const attribute = feature(candidate, object, 'ATTRIBUTE', 'quality');
    const value = state(candidate, attribute, 'FEATURE', 'high');
    fact.endpoints = [endpoint(fact, 'object', 'EXHIBITOR_THING_OR_STATE', 'ELEMENT', object, 0), endpoint(fact, 'value', 'VALUE_STATE', 'STATE', value, 1)];
  } else if (number === 10) {
    const [source, target] = binaryThings(candidate, 'OBJECT');
    const sourceValue = requirement.variant_key.includes('SOURCE_STATE') || requirement.variant_key.includes('BOTH_STATE') ? state(candidate, source, 'ELEMENT', 'available') : source;
    const targetValue = requirement.variant_key.includes('DESTINATION_STATE') || requirement.variant_key.includes('BOTH_STATE') ? state(candidate, target, 'ELEMENT', 'ready') : target;
    fact.endpoints = [endpoint(fact, 'source', 'STATE_TAGGED_SOURCE', sourceValue === source ? 'ELEMENT' : 'STATE', sourceValue, 0), endpoint(fact, 'target', 'STATE_TAGGED_TARGET', targetValue === target ? 'ELEMENT' : 'STATE', targetValue, 1)];
    fact.direction = requirement.variant_key.startsWith('BIDIRECTIONAL') ? 'BIDIRECTIONAL' : requirement.variant_key.startsWith('RECIPROCAL') ? 'UNDIRECTED' : 'DIRECTED';
    if (fact.direction === 'BIDIRECTIONAL') fact.labels = [label('forward_tag', 'feeds'), label('reverse_tag', 'depends on')];
    else if (fact.direction === 'UNDIRECTED' && requirement.variant_key.includes('TAGGED')) fact.labels = [label('reciprocal_tag', 'connected')];
    else if (fact.direction === 'DIRECTED' && requirement.variant_key.includes('TAGGED')) fact.labels = [label('forward_tag', 'feeds')];
  } else throw new Error(`Unsupported Structural capability: ${requirement.capability_id}`);
  candidate.facts = [fact];
  finalize(candidate, fact);
  return candidate;
}

function blockedCandidate(requirement) {
  const candidate = emptyCandidate(requirement);
  const fact = baseFact(requirement);
  const number = capabilityNumber(requirement.capability_id);
  const variant = requirement.variant_key;
  if (number === 1 || number === 3 || number === 4) {
    const [source, target] = binaryThings(candidate, variant.includes('CROSS_KIND') ? 'MIXED' : 'OBJECT');
    fact.endpoints = [endpoint(fact, 'source', 'STRUCTURAL_SOURCE', 'ELEMENT', source, 0), endpoint(fact, 'target', 'STRUCTURAL_TARGET', 'ELEMENT', target, 1)];
    fact.direction = number === 3 ? 'BIDIRECTIONAL' : number === 4 ? 'UNDIRECTED' : 'DIRECTED';
    if (number === 1 && !variant.includes('FORWARD_TAG_MISSING')) fact.labels = [label('forward_tag', 'feeds')];
    if (number === 3 && !variant.includes('REVERSE_TAG_MISSING')) fact.labels = [label('forward_tag', 'feeds'), label('reverse_tag', 'depends on')];
    if (number === 4) fact.labels = [label('reciprocal', 'connected')];
  } else if (number === 5) {
    const [whole, parts] = fanThings(candidate, variant === 'FAN_CROSS_KIND' ? 'MIXED' : 'OBJECT', variant === 'FAN_EMPTY' ? 0 : 1, 'part');
    fact.endpoints = variant === 'FAN_CROSS_KIND'
      ? [endpoint(fact, 'whole', 'WHOLE_THING', 'ELEMENT', whole, 0), endpoint(fact, 'part-1', 'PART_THING', 'ELEMENT', thing(candidate, 'PROCESS', 'cross-kind-part'), 1)]
      : variant === 'FAN_EMPTY'
      ? [endpoint(fact, 'whole', 'WHOLE_THING', 'ELEMENT', whole, 0), endpoint(fact, 'placeholder', 'NOT_A_PART', 'ELEMENT', whole, 1)]
      : [endpoint(fact, 'whole', 'WHOLE_THING', 'ELEMENT', whole, 0), ...parts.map((id, index) => endpoint(fact, `part-${index + 1}`, 'PART_THING', 'ELEMENT', id, variant === 'FAN_ORDINAL_DUPLICATE' ? 0 : index + 1))];
    fact.collection_completeness = 'COMPLETE';
  } else if (number === 6) {
    const exhibitor = thing(candidate, 'OBJECT', 'exhibitor');
    if (variant === 'FEATURE_KIND_INVALID') {
      fact.endpoints = [endpoint(fact, 'exhibitor', 'EXHIBITOR_THING', 'ELEMENT', exhibitor, 0), endpoint(fact, 'invalid', 'FEATURE_THING', 'ELEMENT', thing(candidate, 'OBJECT', 'invalid'), 1)];
    } else {
      const attribute = feature(candidate, exhibitor, 'ATTRIBUTE', 'temperature');
      fact.endpoints = [endpoint(fact, 'exhibitor', 'EXHIBITOR_THING', 'ELEMENT', exhibitor, 0), endpoint(fact, 'feature', 'FEATURE_THING', 'FEATURE', attribute, 2)];
    }
    fact.collection_completeness = 'COMPLETE';
  } else if (number === 7) {
    const [general, special] = fanThings(candidate, 'OBJECT', 1, 'special');
    fact.endpoints = [endpoint(fact, 'general-1', 'GENERAL_THING', 'ELEMENT', general, 0), endpoint(fact, 'general-2', 'GENERAL_THING', 'ELEMENT', thing(candidate, 'OBJECT', 'second-general'), 1), endpoint(fact, 'special', 'SPECIALIZED_THING', 'ELEMENT', special[0], 2)];
    fact.collection_completeness = 'COMPLETE';
  } else if (number === 8) {
    const [type, instances] = fanThings(candidate, 'OBJECT', 1, 'instance');
    fact.endpoints = [endpoint(fact, 'class', 'CLASS_THING', 'ELEMENT', type, 0), endpoint(fact, 'instance', 'INSTANCE_THING', 'ELEMENT', instances[0], 1)];
    fact.collection_completeness = 'COMPLETE';
  } else if (number === 9) {
    const raw = thing(candidate, 'OBJECT', 'raw');
    const other = thing(candidate, 'OBJECT', 'other');
    const attribute = feature(candidate, variant === 'STATE_OWNER_MISMATCH' ? other : raw, 'ATTRIBUTE', 'quality');
    const value = state(candidate, attribute, 'FEATURE', 'high');
    const source = variant === 'SOURCE_STATE_INVALID' ? state(candidate, raw, 'ELEMENT', 'available') : raw;
    const target = variant === 'SOURCE_FEATURE_STATE_INVALID' ? state(candidate, raw, 'ELEMENT', 'available') : value;
    fact.endpoints = [endpoint(fact, 'source', 'EXHIBITOR_THING_OR_STATE', source === raw ? 'ELEMENT' : 'STATE', source, 0), endpoint(fact, 'value', 'VALUE_STATE', 'STATE', target, 1)];
  } else if (number === 10) {
    const [source, target] = binaryThings(candidate, variant === 'PROCESS_ENDPOINT_INVALID' ? 'PROCESS' : 'OBJECT');
    fact.endpoints = [endpoint(fact, 'source', 'STATE_TAGGED_SOURCE', 'ELEMENT', source, 0), endpoint(fact, 'target', 'STATE_TAGGED_TARGET', 'ELEMENT', target, 1)];
    fact.direction = variant === 'BIDIRECTIONAL_NULL_TAG' ? 'BIDIRECTIONAL' : 'DIRECTED';
  } else throw new Error(`Unsupported Structural BLOCKED capability: ${requirement.capability_id}`);
  candidate.facts = [fact];
  finalize(candidate, fact);
  return candidate;
}

function emptyCandidate(requirement) {
  const candidate = structuredClone(base);
  delete candidate.text_artifact;
  delete candidate.text_traces;
  delete candidate.validation_summary;
  delete candidate.revision_digest;
  candidate.revision_id = `revision.${slug(requirement.case_id)}`;
  candidate.revision_sequence = 2;
  candidate.parent_revision_id = base.revision_id;
  candidate.features = [];
  candidate.states = [];
  candidate.facts = [];
  candidate.occurrences = [];
  candidate.layouts = [];
  candidate.elements = [];
  candidate.contexts = [structuredClone(base.contexts[0])];
  candidate.contexts[0].occurrence_ids = [];
  return candidate;
}

function baseFact(requirement) {
  return {
    fact_id: `fact.${slug(requirement.case_id)}`,
    fact_family: 'STRUCTURAL',
    capability_ref: capability(requirement.capability_id),
    endpoints: [],
    direction: 'DIRECTED',
    labels: [],
    collection_completeness: 'NOT_APPLICABLE',
    source: normalSource(requirement.capability_id),
    normalization: { level: 'CORE' }
  };
}

function binaryThings(candidate, domain) {
  if (domain === 'PROCESS') return [thing(candidate, 'PROCESS', 'source'), thing(candidate, 'PROCESS', 'target')];
  if (domain === 'MIXED') return [thing(candidate, 'OBJECT', 'source'), thing(candidate, 'PROCESS', 'target')];
  return [thing(candidate, 'OBJECT', 'source'), thing(candidate, 'OBJECT', 'target')];
}

function fanThings(candidate, domain, count, role) {
  const kind = domain === 'PROCESS' ? 'PROCESS' : 'OBJECT';
  return [thing(candidate, kind, 'root'), Array.from({ length: count }, (_, index) => thing(candidate, kind, `${role}-${index + 1}`))];
}

function thing(candidate, kind, suffix) {
  const id = `element.${kind.toLowerCase()}.${slug(suffix)}`;
  if (!candidate.elements.some((item) => item.element_id === id)) {
    candidate.elements.push({
      element_id: id,
      core_kind: kind,
      capability_ref: capability(kind === 'PROCESS' ? 'CAP-PROCESS-001' : 'CAP-OBJECT-001'),
      name: { namespace: 'urn:opm:golden', local_name: `${kind === 'PROCESS' ? 'Process' : 'Object'} ${title(suffix)}` },
      feature_ids: [], state_ids: [], source: normalSource(kind === 'PROCESS' ? 'Process' : 'Object'), normalization: { level: 'CORE' }
    });
  }
  return id;
}

function feature(candidate, ownerId, kind, suffix) {
  const id = `feature.${slug(ownerId)}.${kind.toLowerCase()}.${slug(suffix)}`;
  candidate.features.push({ feature_id: id, owner_element_id: ownerId, feature_kind: kind, capability_ref: capability(kind === 'ATTRIBUTE' ? 'CAP-FEAT-ATTRIBUTE-001' : 'CAP-FEAT-OPERATION-001'),
    name: { namespace: 'urn:opm:golden', local_name: title(suffix) }, source: normalSource(kind), normalization: { level: 'CORE' } });
  candidate.elements.find((item) => item.element_id === ownerId).feature_ids.push(id);
  return id;
}

function state(candidate, ownerId, ownerKind, suffix) {
  const id = `state.${slug(ownerId)}.${slug(suffix)}`;
  candidate.states.push({ state_id: id, ...(ownerKind === 'FEATURE' ? { owner_target_kind: 'FEATURE' } : {}), owner_element_id: ownerId,
    capability_ref: capability(ownerKind === 'FEATURE' ? 'CAP-FEAT-STATE-001' : 'CAP-STATE-001'), name: { namespace: 'urn:opm:golden', local_name: title(suffix) },
    state_roles: [], source: normalSource('State'), normalization: { level: 'CORE' } });
  if (ownerKind === 'ELEMENT') candidate.elements.find((item) => item.element_id === ownerId).state_ids.push(id);
  return id;
}

function featureKindsFor(requirement) {
  if (requirement.variant_key.startsWith('EXHIBITION_')) return [featureKind(requirement.dimensions.feature_kind), featureKind(requirement.dimensions.feature_kind)];
  if (requirement.dimensions.feature_kind === 'MIXED') {
    const [, attributes, operations] = /^A(\d+)_O(\d+)$/.exec(requirement.dimensions.mixed_group_shape);
    return [...Array(Number(attributes)).fill('ATTRIBUTE'), ...Array(Number(operations)).fill('OPERATION')];
  }
  return Array(Number(requirement.dimensions.fan_size)).fill(featureKind(requirement.dimensions.feature_kind));
}

function finalize(candidate, fact) {
  const root = candidate.contexts[0];
  const targets = new Map();
  for (const element of candidate.elements) targets.set(`ELEMENT:${element.element_id}`, 'OBJECT_NODE');
  for (const feature of candidate.features) targets.set(`FEATURE:${feature.feature_id}`, 'FEATURE_NODE');
  for (const value of candidate.states) targets.set(`STATE:${value.state_id}`, 'STATE_NODE');
  targets.set(`FACT:${fact.fact_id}`, 'STRUCTURAL_LINK');
  let index = 0;
  for (const [key, constructRole] of targets) {
    const [targetKind, targetId] = key.split(':');
    const occurrenceId = `occurrence.${slug(targetId)}`;
    const layoutId = `layout.${slug(targetId)}`;
    root.occurrence_ids.push(occurrenceId);
    candidate.occurrences.push({ occurrence_id: occurrenceId, context_id: root.context_id, target_kind: targetKind, target_id: targetId,
      ownership: 'OWNED', construct_role: constructRole, layout_id: layoutId });
    candidate.layouts.push({ layout_id: layoutId, x: index++ * 180, y: 0, width: 160, height: 72, z_order: 1 });
  }
}

function endpoint(fact, suffix, role, targetKind, targetId, ordinal) { return { endpoint_id: `${fact.fact_id}.endpoint.${suffix}`, role, target_kind: targetKind, target_id: targetId, ordinal }; }
function label(slotId, text) { return { slot_id: slotId, text }; }
function capability(capabilityId) { return { capability_id: capabilityId, profile_id: 'profile.iso19450.2024.draft', profile_version: '0.2.0' }; }
function normalSource(entity) { return { source_profile_id: 'profile.iso19450.2024.draft', source_profile_version: '0.2.0', source_kind: 'StructuralLink', source_entity_id: `profile.${slug(entity)}` }; }
function productionSource() { return { source_profile_id: 'profile.iso19450.2024.draft', source_profile_version: '0.2.0', source_kind: 'OPL_PRODUCTION', source_entity_id: 'opl.structural.exhibition.v1' }; }
function capabilityNumber(id) { return Number(id.slice(-3)); }
function featureKind(value) { return value === 'OPERATOR' ? 'OPERATION' : value; }
function fixturePath(requirement) { return `golden/fixtures/${slug(requirement.case_id)}.json`; }
function slug(value) { return value.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/^-|-$/g, ''); }
function title(value) { return value.split(/[-_ ]+/).filter(Boolean).map((item) => item[0].toUpperCase() + item.slice(1)).join(' '); }
async function syncJson(path, value, writeOutput) {
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  try { if (await readFile(path, 'utf8') === bytes) return; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!writeOutput) throw new Error(`Generated Structural Golden fixture is out of date: ${path}`);
  await writeFile(path, bytes);
}
async function readJson(path) { return JSON.parse(await readFile(path, 'utf8')); }
