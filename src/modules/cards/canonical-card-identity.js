'use strict';

/**
 * Fixture-safe identity normalization for the future card resolver.  Trusted
 * caller identities always win; card row aliases are evidence only.
 */
const TRUSTED_SOURCES = [
  ['webhookUserId', 'webhook'],
  ['trustedLineUserId', 'trusted_line'],
  ['liffUserId', 'liff'],
  ['authenticatedUserId', 'authenticated']
];

const CARD_ALIASES = [
  'lineId', 'line_id', 'ownerUserId', 'owner_user_id', 'profileUserId',
  'profile_user_id', 'boundUserId', 'bound_user_id', 'userId'
];

function valueOf(input, key) {
  const value = input && input[key];
  return value === undefined || value === null || value === '' ? '' : String(value);
}

function resolveCanonicalCardActor(input = {}) {
  const aliases = {};
  for (const key of CARD_ALIASES) {
    const value = valueOf(input, key);
    if (value) aliases[key] = value;
  }

  let canonicalActorId = '';
  let canonicalSource = 'none';
  for (const [key, source] of TRUSTED_SOURCES) {
    const value = valueOf(input, key);
    if (value) {
      canonicalActorId = value;
      canonicalSource = source;
      aliases[key] = value;
      break;
    }
  }

  const trusted = Boolean(canonicalActorId);
  const conflicts = [];
  const diagnostics = [];
  const networkId = valueOf(input, 'networkId') || valueOf(input, 'network_id');
  const expectedNetworkId = valueOf(input, 'expectedNetworkId') || valueOf(input, 'expected_network_id');

  if (trusted) {
    const contradictory = Object.entries(aliases)
      .filter(([, value]) => value && value !== canonicalActorId)
      .map(([key]) => key);
    if (contradictory.length) {
      conflicts.push({ code: 'IDENTITY_CONFLICT', aliases: contradictory });
      diagnostics.push('IDENTITY_CONFLICT');
    }
  }
  if (expectedNetworkId && networkId && expectedNetworkId !== networkId) {
    conflicts.push({ code: 'TENANT_BOUNDARY', expectedNetworkId, networkId });
    diagnostics.push('TENANT_BOUNDARY');
  }

  return {
    canonicalActorId,
    canonicalSource,
    trusted,
    networkId,
    aliases,
    conflicts,
    diagnostics
  };
}

module.exports = { resolveCanonicalCardActor };
