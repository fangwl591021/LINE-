'use strict';

function masked(value) {
  const text = String(value || '');
  return text ? `${text.slice(0, 3)}***` : '';
}

function compareLegacyAndShadowResolution({ legacyResult = {}, shadowResult = {} } = {}) {
  const legacyId = legacyResult.cardId || legacyResult.resolvedCardId || legacyResult.id || '';
  const shadowId = shadowResult.selectedCardId || '';
  const shadowDiagnostics = shadowResult.diagnostics || [];
  let divergenceCode = 'MATCH';
  if (!legacyId && shadowId) divergenceCode = 'LEGACY_NOT_FOUND_SHADOW_FOUND';
  else if (legacyId && !shadowId) divergenceCode = 'LEGACY_FOUND_SHADOW_NOT_FOUND';
  else if (legacyId && shadowId && legacyId !== shadowId) divergenceCode = 'LEGACY_SELECTED_DIFFERENT_CARD';
  if (legacyResult.cardType === 'contact' && shadowDiagnostics.includes('MY_CARD_RESOLVED_CONTACT')) divergenceCode = 'LEGACY_SELECTED_CONTACT_FOR_MY_CARD';
  if (legacyResult.cardType === 'personal' && shadowDiagnostics.includes('PERSONAL_EXCLUDED_FROM_AI_FOLDER')) divergenceCode = 'LEGACY_SELECTED_PERSONAL_FOR_AI_FOLDER';
  if (shadowDiagnostics.includes('IDENTITY_CONFLICT')) divergenceCode = 'LEGACY_SELECTED_WITH_IDENTITY_CONFLICT';
  if (shadowDiagnostics.includes('TENANT_BOUNDARY')) divergenceCode = 'TENANT_BOUNDARY';
  if (shadowDiagnostics.includes('MULTIPLE_PERSONAL') && legacyId) divergenceCode = 'SHADOW_AMBIGUOUS_LEGACY_SELECTED_ONE';
  return {
    divergenceCode,
    legacyMaskedCardId: masked(legacyId),
    shadowMaskedCardId: masked(shadowId)
  };
}

module.exports = { compareLegacyAndShadowResolution, masked };
