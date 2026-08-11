import { CustomerImportModule } from './worker/customer-import.mjs';
import { isTaipeiLocalDateTime, normalizeTaipeiDateTime, taipeiDateTimeEpoch } from './worker/personal-agenda-time.mjs';
import { PartnerDirectoryModule } from './worker/partner-directory.mjs';

/**
 * ACTMASTER v6.0 - 企業安全防護版 (Edge Auth & Security)
 * 特點：導入 Cloudflare KV 進行毫秒級身分驗證，並新增 LINE Token 強制核對與 OpenAI 流量防護機制
 */

// ==================== 金流加密工具 (NewebPay MPG) ====================
const NewebPayCrypto = {
  encoder: new TextEncoder(),

  bytesToHex(bytes) {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  },

  hexToBytes(hex) {
    const clean = String(hex || '').trim();
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
    return bytes;
  },

  pkcs7Pad(bytes) {
    const blockSize = 16;
    let padding = blockSize - (bytes.length % blockSize);
    if (padding === 0) padding = blockSize;
    const out = new Uint8Array(bytes.length + padding);
    out.set(bytes);
    out.fill(padding, bytes.length);
    return out;
  },

  pkcs7Unpad(bytes) {
    const padding = bytes[bytes.length - 1];
    if (!padding || padding > 16) return bytes;
    return bytes.slice(0, bytes.length - padding);
  },

  async importAesKey(hashKey) {
    return await crypto.subtle.importKey('raw', this.encoder.encode(hashKey), { name: 'AES-CBC' }, false, ['encrypt', 'decrypt']);
  },

  async aesEncrypt(text, hashKey, hashIv) {
    const key = await this.importAesKey(hashKey);
    const padded = this.pkcs7Pad(this.encoder.encode(text));
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-CBC', iv: this.encoder.encode(hashIv) }, key, padded);
    return this.bytesToHex(new Uint8Array(encrypted));
  },

  async aesDecrypt(hex, hashKey, hashIv) {
    const key = await this.importAesKey(hashKey);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: this.encoder.encode(hashIv) }, key, this.hexToBytes(hex));
    return new TextDecoder().decode(this.pkcs7Unpad(new Uint8Array(decrypted)));
  },

  async sha256(text) {
    const hash = await crypto.subtle.digest('SHA-256', this.encoder.encode(text));
    return this.bytesToHex(new Uint8Array(hash)).toUpperCase();
  }
};

// ==================== Action Authorization Policy ====================
const ACTION_POLICIES = {
  checkUser: { access: 'public', legacyAuthSkip: true, note: 'login_status_probe' },
  getCardForClaim: { access: 'public', legacyAuthSkip: true },
  getPublicCardById: { access: 'public' },
  getPublicActivities: { access: 'public', legacyAuthSkip: true },
  getStoreSettings: { access: 'public', legacyAuthSkip: true },
  listRichmanCoupons: { access: 'public', legacyAuthSkip: true },
  listAnnouncements: { access: 'public', legacyAuthSkip: true },
  registerUser: { access: 'public', note: 'initial_registration' },
  joinActivity: { access: 'public', note: 'public_activity_registration' },
  getSocialLikeStats: { access: 'public' },
  recordShareCardVisit: { access: 'public' },
  listPointRedemptionPartners: { access: 'public', note: 'public_partner_directory' },
  getPointRedemptionPartner: { access: 'public', note: 'public_partner_directory' },

  updateUserProfile: { access: 'authenticated', ownership: 'self' },
  linkUserIdentity: { access: 'authenticated', ownership: 'self' },
  getCardContacts: { access: 'authenticated', ownership: 'self', allowD1Fallback: true, legacyAuthSkip: true },
  getCardHarvestContacts: { access: 'authenticated', ownership: 'self', allowD1Fallback: true, legacyAuthSkip: true },
  getCrmContacts: { access: 'authenticated', ownership: 'tenant-resource', tenantScoped: true, allowD1Fallback: true },
  listCustomers: { access: 'authenticated', ownership: 'self', tenantScoped: true },
  saveCustomer: { access: 'authenticated', ownership: 'self', tenantScoped: true },
  archiveCustomer: { access: 'authenticated', ownership: 'self', tenantScoped: true },
  createCustomerImportBatch: { access: 'authenticated', ownership: 'self', tenantScoped: true },
  suggestCustomerImportMapping: { access: 'authenticated', ownership: 'self', tenantScoped: true },
  previewCustomerImportRows: { access: 'authenticated', ownership: 'self', tenantScoped: true },
  commitCustomerImportBatch: { access: 'authenticated', ownership: 'self', tenantScoped: true },
  getCustomerImportBatch: { access: 'authenticated', ownership: 'self', tenantScoped: true },
  rollbackCustomerImportBatch: { access: 'authenticated', ownership: 'self', tenantScoped: true },
  saveCard: { access: 'authenticated', ownership: 'self', allowD1Fallback: true },
  updateCard: { access: 'authenticated', ownership: 'self', allowD1Fallback: true },
  claimCardAndRegister: { access: 'authenticated', ownership: 'self' },
  deleteCard: { access: 'authenticated', ownership: 'resource-owner-or-tenant' },
  unlinkCard: { access: 'authenticated', ownership: 'resource-owner' },
  getSubsiteHome: { access: 'authenticated', ownership: 'self', allowD1Fallback: true, legacyAuthSkip: true },
  getMotherRegistrationUrl: { access: 'authenticated', ownership: 'self' },
  ensureMotherLineMember: { access: 'authenticated', ownership: 'self' },
  queryPointBalanceFast: { access: 'authenticated', ownership: 'self', allowD1Fallback: true, legacyAuthSkip: true },
  queryUserPoints: { access: 'authenticated', ownership: 'self', allowD1Fallback: true, legacyAuthSkip: true },
  dailyPointCheckin: { access: 'authenticated', ownership: 'self', allowD1Fallback: true },
  listPersonalTasks: { access: 'authenticated', ownership: 'self', allowD1Fallback: true },
  savePersonalTask: { access: 'authenticated', ownership: 'self' },
  completePersonalTask: { access: 'authenticated', ownership: 'self' },
  deletePersonalTask: { access: 'authenticated', ownership: 'self' },
  parsePersonalTaskVoice: { access: 'authenticated', ownership: 'self' },
  getInboxCount: { access: 'authenticated', ownership: 'self', allowD1Fallback: true },
  listInboxItems: { access: 'authenticated', ownership: 'self', allowD1Fallback: true },
  listSentInboxItems: { access: 'authenticated', ownership: 'self', allowD1Fallback: true },
  getInboxItem: { access: 'authenticated', ownership: 'self', allowD1Fallback: true },
  markInboxRead: { access: 'authenticated', ownership: 'self' },
  searchInboxRecipients: { access: 'authenticated', tenantScoped: true },
  sendInboxMessage: { access: 'authenticated', tenantScoped: true },
  redeemInboxCoupon: { access: 'authenticated', ownership: 'self' },
  getWebPushConfig: { access: 'authenticated' },
  saveWebPushSubscription: { access: 'authenticated', ownership: 'self' },
  deleteWebPushSubscription: { access: 'authenticated', ownership: 'self' },
  getPersonalAssistantCore: { access: 'authenticated', ownership: 'self' },
  savePersonalAssistantCore: { access: 'authenticated', ownership: 'self' },
  matchmakeContacts: { access: 'authenticated', ownership: 'self' },
  mlmCreateOrder: { access: 'authenticated', ownership: 'self-or-manager' },
  createTenantBonusOrder: { access: 'authenticated', ownership: 'self-or-manager' },
  nfcCheckin: { access: 'authenticated' },
  getActivityById: { access: 'authenticated', legacyAuthSkip: true },
  cancelActivityRegistration: { access: 'authenticated', ownership: 'self' },
  cancelRegistration: { access: 'authenticated', ownership: 'self' },
  unregisterActivity: { access: 'authenticated', ownership: 'self' },
  removeActivityRegistration: { access: 'authenticated', ownership: 'self' },
  mlmListBonusTransactions: { access: 'authenticated', ownership: 'self-or-manager' },
  mlmGetMemberTree: { access: 'authenticated', ownership: 'self-or-manager' },
  mlmGetOrganizationTree: { access: 'authenticated', ownership: 'self-or-manager' },
  getMyActivities: { access: 'authenticated', ownership: 'self' },
  getUserActivities: { access: 'authenticated', ownership: 'self' },
  getMyRegistrations: { access: 'authenticated', ownership: 'self' },
  getUserRegistrations: { access: 'authenticated', ownership: 'self' },
  mlmListOrders: { access: 'authenticated', ownership: 'self-or-manager', legacyAuthSkip: true },
  mlmGetReferralStats: { access: 'authenticated', ownership: 'self' },
  mlmPreviewBonusPlan: { access: 'authenticated', ownership: 'self-or-manager' },
  prepareTenantCardPayment: { access: 'authenticated', ownership: 'self', legacyAuthSkip: true },
  recognizeCardWithGPT4o: { access: 'authenticated' },
  calculateFateTags: { access: 'authenticated' },
  reviewCardSafety: { access: 'authenticated' },
  generateCardCopy: { access: 'authenticated' },
  resolveMyCardVersion: { access: 'authenticated', ownership: 'self', legacyAuthSkip: true },
  getMyVideoDraft: { access: 'authenticated', ownership: 'self', legacyAuthSkip: true },
  getCardCoolDraft: { access: 'authenticated', ownership: 'self', legacyAuthSkip: true },
  confirmCardCoolDraft: { access: 'authenticated', ownership: 'self', legacyAuthSkip: true },
  sendCardCoolCardToChat: { access: 'authenticated', ownership: 'self', legacyAuthSkip: true },
  // A liker acts on a shared card that is normally owned by someone else.
  // The handler derives the liker from the verified LIFF actor and rejects self-likes.
  recordSocialLike: { access: 'authenticated' },
  uploadImageToR2: { access: 'authenticated', legacyAuthSkip: true },

  bulkAddRegistrants: { access: 'manager', tenantScoped: true },
  updateActivity: { access: 'manager', tenantScoped: true, allowD1Fallback: true },
  removeAct: { access: 'manager', tenantScoped: true },
  setActivityStatus: { access: 'manager', tenantScoped: true },
  duplicateActivity: { access: 'manager', tenantScoped: true },
  getActivityRegistrants: { access: 'manager', tenantScoped: true },
  confirmPayment: { access: 'manager', tenantScoped: true },
  toggleCheckin: { access: 'manager', tenantScoped: true },
  getInboxMonitor: { access: 'manager', tenantScoped: true },
  saveStoreSettings: { access: 'manager', tenantScoped: true, allowD1Fallback: true },
  getStoreKnowledgeBase: { access: 'manager', tenantScoped: true, allowD1Fallback: true },
  saveStoreKnowledgeBase: { access: 'manager', tenantScoped: true, allowD1Fallback: true },
  searchStoreKnowledgeBase: { access: 'manager', tenantScoped: true },
  extractLineVoomMedia: { access: 'manager', tenantScoped: true, allowD1Fallback: true },
  storeAdjustCustomerPoints: { access: 'manager', tenantScoped: true },
  getStorePointCustomer: { access: 'manager', tenantScoped: true },
  prepareStorePointCashierSession: { access: 'manager', tenantScoped: true },
  listStorePointCashierLogs: { access: 'manager', tenantScoped: true, allowD1Fallback: true },
  updateCrmContact: { access: 'manager', tenantScoped: true, ownership: 'tenant-resource' },
  getActivities: { access: 'manager', tenantScoped: true },
  getAllActivities: { access: 'manager', tenantScoped: true },

  updateUserRole: { access: 'admin' },
  adminSyncBoundCardUser: { access: 'admin', allowD1Fallback: true },
  mlmMarkOrderPaid: { access: 'admin' },
  mlmCancelOrder: { access: 'admin' },
  mlmRefundOrder: { access: 'admin' },
  mlmCreateSettlementBatch: { access: 'admin' },
  mlmLockSettlementBatch: { access: 'admin' },
  mlmListSettlementBatches: { access: 'admin' },
  mlmPreviewMonthlySettlement: { access: 'admin' },
  mlmMarkSettlementPaid: { access: 'admin' },
  markTenantOrderPaid: { access: 'admin' },
  cancelTenantBonusOrder: { access: 'admin' },
  auditDataConsistency: { access: 'admin' },
  repairDataConsistency: { access: 'admin' },
  previewIdentityMigration: { access: 'admin' },
  confirmIdentityMerge: { access: 'admin' },
  listDuplicateCardBindings: { access: 'admin' },
  resolveDuplicateCardBinding: { access: 'admin' },
  deployRichMenu: { access: 'admin' },
  getLineOAChatMonitor: { access: 'admin', allowD1Fallback: true },
  getLineOAChatAudience: { access: 'admin', allowD1Fallback: true },
  getLineOAChatCrm: { access: 'admin', allowD1Fallback: true },
  repairLineOAFollowPointOnboarding: { access: 'admin' },
  repairRecentLineOAFollowPointAwards: { access: 'admin' },
  repairPointWalletSearchIndex: { access: 'admin' },
  diagnosePointSync: { access: 'admin' },
  listPointSyncJobs: { access: 'admin' },
  enqueuePointSyncJob: { access: 'admin' },
  processPointSyncJobs: { access: 'admin' },
  getAdminPointProfile: { access: 'admin' },
  adminAdjustCustomerPoints: { access: 'admin' },
  uploadLineOAAsset: { access: 'admin', allowD1Fallback: true },
  sendLineOAChatReply: { access: 'admin', allowD1Fallback: true },
  updateLineOAChatThread: { access: 'admin', allowD1Fallback: true },
  listLineOAKeywordRules: { access: 'admin' },
  saveLineOAKeywordRule: { access: 'admin' },
  deleteLineOAKeywordRule: { access: 'admin' },
  listAdminAnnouncements: { access: 'admin' },
  getAdminCustomerImportOverview: { access: 'admin' },
  listAdminCustomerImportBatches: { access: 'admin' },
  getAdminCustomerImportBatchSummary: { access: 'admin' },
  saveAnnouncement: { access: 'admin' },
  deleteAnnouncement: { access: 'admin' },
  d1BackfillFromGas: { access: 'admin' },
  getAllUsers: { access: 'admin' },
  buildFlexMessage: { access: 'admin' }
};
// ==================== 模組 0: 資安防護 (Security Module) ====================
const SecurityModule = {
  hardAdminAccounts: [
    {
      label: '方萬隆',
      ids: ['Uf729764dbb5b652a5a90a467320bea29', 'U050397a077bef628b317b0bbedeb2187'],
      phones: ['0927136847'],
      names: ['方萬隆', 'Tonyfang']
    },
    {
      label: '楊滄棋',
      ids: ['U58eb5c1a747450140ce1335af709ae55', 'Ue9a59cf9b2969ec78b6bfdc2a4cfca08'],
      phones: ['0986919171'],
      names: ['楊滄棋']
    }
  ],
  hardAdminIds: new Set([
    'Uf729764dbb5b652a5a90a467320bea29',
    'U050397a077bef628b317b0bbedeb2187',
    'U58eb5c1a747450140ce1335af709ae55',
    'Ue9a59cf9b2969ec78b6bfdc2a4cfca08'
  ]),

  text(value) {
    return String(value ?? '').trim();
  },

  normalizeRole(value) {
    const role = this.text(value).toLowerCase();
    if (role === 'admin' || role === '總管') return 'admin';
    if (role === 'store' || role === 'tenant' || role === '店長' || role === '租戶') return 'store';
    return 'user';
  },

  normalizePhone(value) {
    return this.text(value).replace(/\D/g, '');
  },

  hasHardAdminId(userId, user = {}) {
    const ids = [
      userId,
      user.line_id,
      user.row_id,
      user.legacy_line_id,
      user.point_line_id,
      user.legacyLineId,
      user.pointLineId,
      user.identityLink && user.identityLink.oldLineId,
      user.identityLink && user.identityLink.newLineId
    ].map(value => this.text(value)).filter(Boolean);
    return this.hardAdminAccounts.some(account => ids.some(id => account.ids.includes(id)));
  },

  isHardAdmin(userId, user = {}) {
    const ids = [
      userId,
      user.line_id,
      user.row_id,
      user.legacy_line_id,
      user.point_line_id,
      user.legacyLineId,
      user.pointLineId,
      user.identityLink && user.identityLink.oldLineId,
      user.identityLink && user.identityLink.newLineId
    ].map(value => this.text(value)).filter(Boolean);
    const name = this.text(user.name || user.displayName || user.user_name);
    const phone = this.normalizePhone(user.phone || user.mobile);
    return this.hardAdminAccounts.some(account => {
      const idMatch = ids.some(id => account.ids.includes(id));
      const phoneMatch = !!phone && account.phones.includes(phone);
      const nameMatch = !!name && account.names.some(allowed => name.includes(allowed));
      if (idMatch) return phoneMatch || nameMatch;
      return phoneMatch && nameMatch;
    });
  },

  sanitizeRole(userId, role, user = {}) {
    if (this.isHardAdmin(userId, user)) return 'admin';
    const normalized = this.normalizeRole(role);
    return normalized === 'admin' ? 'user' : normalized;
  },

  effectiveNetworkId(userId, role, user = {}) {
    const normalizedRole = this.normalizeRole(role);
    const currentUserId = this.text(userId || user.line_id || user.row_id);
    if (normalizedRole === 'admin') return 'admin';
    if (normalizedRole === 'store') return currentUserId || this.text(user.network_id, 'admin');
    const explicitNetwork = this.text(user.network_id);
    if (explicitNetwork && explicitNetwork !== 'admin') return explicitNetwork;
    const referrerId = this.text(user.referrer_id);
    if (referrerId) return referrerId;
    return explicitNetwork || 'admin';
  },

  async getLineUserIdFromToken(token, env) {
    if (!token) return '';
    const cacheKey = `AUTH_${token.substring(0, 30)}`;
    try {
      if (env.ACTMASTER_KV) {
        const cachedUserId = await env.ACTMASTER_KV.get(cacheKey);
        if (cachedUserId) return cachedUserId;
      }

      const res = await fetch('https://api.line.me/v2/profile', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.status !== 200) return '';
      const data = await res.json();
      const userId = this.text(data.userId);
      if (userId && env.ACTMASTER_KV) {
        await env.ACTMASTER_KV.put(cacheKey, userId, { expirationTtl: 3600 });
      }
      return userId;
    } catch (e) {
      console.error('LINE token profile lookup failed', e && e.message ? e.message : e);
      return '';
    }
  },

  maskId(id) {
    const text = this.text(id);
    if (!text) return '';
    if (text.length <= 12) return text;
    return `${text.slice(0, 10)}...${text.slice(-6)}`;
  },

  getActionPolicy(action) {
    const key = this.text(action);
    return key ? ACTION_POLICIES[key] || null : null;
  },

  legacyAuthSkipActions() {
    return new Set(Object.entries(ACTION_POLICIES)
      .filter(([, policy]) => policy && policy.legacyAuthSkip === true)
      .map(([action]) => action));
  },

  logUnknownAction(action) {
    const safeAction = this.text(action).replace(/[^a-zA-Z0-9_:-]/g, '').slice(0, 80) || 'unknown';
    console.warn('Unknown action denied by policy:', safeAction);
  },
  async authMismatchDiagnostic(payloadUserId, tokenUserId, env) {
    const payloadId = this.text(payloadUserId);
    const tokenId = this.text(tokenUserId);
    const payloadIdentity = env.ACTMASTER_DB && typeof D1ReadModule !== 'undefined' && payloadId
      ? await D1ReadModule.findUserByIdentity(env, payloadId).catch(() => null)
      : null;
    const tokenIdentity = env.ACTMASTER_DB && typeof D1ReadModule !== 'undefined' && tokenId
      ? await D1ReadModule.findUserByIdentity(env, tokenId).catch(() => null)
      : null;
    return this.normalizeSimpleMyCardFlex({
      payloadUserId: this.maskId(payloadId),
      tokenUserId: this.maskId(tokenId),
      payloadRegistered: !!(payloadIdentity && payloadIdentity.user),
      tokenRegistered: !!(tokenIdentity && tokenIdentity.user),
      payloadCanonical: this.maskId(payloadIdentity && payloadIdentity.canonicalId),
      tokenCanonical: this.maskId(tokenIdentity && tokenIdentity.canonicalId),
      sameCanonical: !!(
        payloadIdentity && tokenIdentity &&
        this.text(payloadIdentity.canonicalId) &&
        this.text(payloadIdentity.canonicalId) === this.text(tokenIdentity.canonicalId)
      )
    });
  },

  async getActor(payload, request, env) {
    const token = payload.lineAccessToken || request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return null;
    const userId = await this.getLineUserIdFromToken(token, env);
    if (!userId) return null;

    let role = 'user';
    let networkId = 'admin';
    if (this.isHardAdmin(userId)) role = 'admin';
    if (env.ACTMASTER_DB && typeof D1ReadModule !== 'undefined') {
      const user = await D1ReadModule.first(env, 'SELECT role, network_id, referrer_id, name, phone FROM users WHERE line_id = ? OR row_id = ? LIMIT 1', [userId, userId]);
      if (user) {
        role = this.sanitizeRole(userId, user.role, user);
        networkId = this.effectiveNetworkId(userId, role, user);
      }
    }
    return { userId, role, networkId, token };
  },

  async getActorFromD1Identity(payload, env) {
    if (!env.ACTMASTER_DB || typeof D1ReadModule === 'undefined') return null;
    const data = payload && typeof payload.data === 'object' ? payload.data : {};
    const requestedUserId = this.text(
      payload.authenticatedUserId ||
      payload.authUserId ||
      payload.operatorId ||
      payload.targetUserId ||
      payload.pointUserId ||
      payload.pt_uid ||
      payload.userId ||
      payload.lineId ||
      payload.LINE_user_id ||
      payload.ownerUserId ||
      payload.creatorId ||
      data.authenticatedUserId ||
      data.authUserId ||
      data.operatorId ||
      data.pointUserId ||
      data.pt_uid ||
      data.userId ||
      data.lineId ||
      data.LINE_user_id ||
      data['LINE ID'] ||
      data.ownerUserId ||
      data.creatorId ||
      data['建檔者ID']
    );
    if (!requestedUserId) return null;
    const identity = await D1ReadModule.findUserByIdentity(env, requestedUserId).catch(() => null);
    const user = identity && identity.user ? D1ReadModule.userRow(identity.user, 'd1_actor_fallback') : null;
    if (!user || !user.userId) return null;
    return {
      userId: user.userId,
      role: user.role,
      networkId: user.networkId,
      token: '',
      source: 'd1_identity_fallback'
    };
  },

  canManage(role) {
    return role === 'admin' || role === 'store';
  },

  async authorizeAction(action, payload, request, env) {
    const policy = this.getActionPolicy(action);
    if (!policy) {
      this.logUnknownAction(action);
      return { allowed: false, error: 'Access Denied: ACTION_POLICY_NOT_FOUND' };
    }

    if (policy.access === 'public') {
      return { allowed: true, actor: null, policy };
    }

    let actor = await this.getActor(payload, request, env);
    if (!actor && policy.allowD1Fallback) {
      actor = await this.getActorFromD1Identity(payload, env);
    }
    if (!actor && policy.allowD1Fallback && (action === 'queryUserPoints' || action === 'queryPointBalanceFast' || action === 'getSubsiteHome') && env.ACTMASTER_DB) {
      const requestedUserId = this.text(payload.userId || payload.pointUserId || payload.LINE_user_id);
      const identity = requestedUserId
        ? await D1ReadModule.findUserByIdentity(env, requestedUserId).catch(() => null)
        : null;
      if (identity && identity.user) {
        return { allowed: true, actor: null, policy };
      }
    }
    if (!actor && policy.allowD1Fallback && (action === 'getCardContacts' || action === 'getCardHarvestContacts') && env.ACTMASTER_DB) {
      const requestedUserId = this.text(payload.userId || payload.authenticatedUserId || payload.authUserId || payload.operatorId);
      const identity = requestedUserId
        ? await D1ReadModule.findUserByIdentity(env, requestedUserId).catch(() => null)
        : null;
      const user = identity && identity.user ? D1ReadModule.userRow(identity.user) : null;
      if (user && user.userId) {
        payload.authenticatedUserId = user.userId;
        payload.authenticatedRole = user.role;
        payload.authenticatedNetworkId = user.networkId;
        return {
          allowed: true,
          actor: {
            userId: user.userId,
            role: user.role,
            networkId: user.networkId,
            token: '',
            source: 'd1_identity_fallback'
          },
          policy
        };
      }
    }
    if (!actor && policy.allowD1Fallback && action === 'listStorePointCashierLogs' && env.ACTMASTER_DB) {
      const requestedUserId = this.text(payload.userId || payload.authenticatedUserId);
      const identity = requestedUserId
        ? await D1ReadModule.findUserByIdentity(env, requestedUserId).catch(() => null)
        : null;
      const user = identity && identity.user ? D1ReadModule.userRow(identity.user) : null;
      if (user && this.canManage(user.role)) {
        payload.authenticatedUserId = user.userId;
        payload.authenticatedRole = user.role;
        payload.authenticatedNetworkId = user.networkId;
        return {
          allowed: true,
          actor: {
            userId: user.userId,
            role: user.role,
            networkId: user.networkId,
            token: '',
            source: 'd1_identity_fallback'
          },
          policy
        };
      }
    }
    if (!actor) return { allowed: false, error: 'Access Denied: Missing or invalid LINE Token' };

    payload.authenticatedUserId = actor.userId;
    payload.authenticatedRole = actor.role;
    payload.authenticatedNetworkId = actor.networkId;

    if (policy.access === 'admin' && actor.role !== 'admin') {
      return { allowed: false, error: 'Access Denied: Admin only action' };
    }

    if (policy.access === 'manager' && !this.canManage(actor.role)) {
      return { allowed: false, error: 'Access Denied: Manager role required' };
    }

    if (action === 'mlmCreateOrder' || action === 'createTenantBonusOrder') {
      const buyerId = this.text(payload.buyerId || payload.tenantId || payload.userId);
      if (!this.canManage(actor.role) && buyerId && buyerId !== actor.userId) {
        return { allowed: false, error: 'Access Denied: Cannot create order for another user' };
      }
      if (!this.canManage(actor.role)) {
        payload.buyerId = actor.userId;
        payload.tenantId = actor.userId;
        payload.paymentStatus = 'pending_payment';
        payload.status = 'pending_payment';
      }
    }

    if (action === 'updateUserProfile') {
      payload.userId = actor.userId;
    }

    if (action === 'linkUserIdentity') {
      payload.newUserId = actor.userId;
    }

    if (action === 'claimCardAndRegister') {
      payload.userId = actor.userId;
    }

    return { allowed: true, actor, policy };
  },
  // 驗證 LIFF Token，確保 userId 未被偽造
  async verifyLineAuth(userId, token, env) {
    if (!token || !userId) return false;
    if (!env.ACTMASTER_KV) return true; // 若未綁定 KV 則暫時放行(避免癱瘓系統)

    const cacheKey = `AUTH_${token.substring(0, 30)}`; // 避免 Key 過長
    const cachedUserId = await env.ACTMASTER_KV.get(cacheKey);
    if (cachedUserId === userId) return true;

    try {
      const res = await fetch('https://api.line.me/v2/profile', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.status !== 200) return false;
      const data = await res.json();
      
      if (data.userId === userId) {
        // 驗證成功，快取 1 小時，大幅降低 LINE API 呼叫延遲
        await env.ACTMASTER_KV.put(cacheKey, userId, { expirationTtl: 3600 });
        return true;
      }
      return false;
    } catch(e) {
      return false;
    }
  },

  // 防刷機制 (Rate Limiting)
  async checkRateLimit(userId, action, env, role) {
    if (!env.ACTMASTER_KV || !userId) return true;
    
    const date = new Date().toISOString().split('T')[0];
    const key = `RL_${action}_${userId}_${date}`;
    
    // 定義各項 AI 功能的每日上限
    const limits = { 
      recognizeCardWithGPT4o: 10, 
      fateTags: 10, 
      matchmakeContacts: 20,
      reviewCardSafety: 50,
      generateCardCopy: 50
    };
    let max = limits[action] || 50;
    if (action === 'generateCardCopy' || action === 'reviewCardSafety') {
      if (role === 'admin') return true;
      max = (role === 'store' || role === 'tenant') ? 50 : 5;
    }

    let count = 0;
    try {
      count = parseInt(await env.ACTMASTER_KV.get(key)) || 0;
    } catch (e) {
      console.warn('[RateLimit] KV get failed, allowing action:', action, e && e.message);
      return true;
    }
    if (count >= max) return false;

    try {
      await env.ACTMASTER_KV.put(key, (count + 1).toString(), { expirationTtl: 86400 });
    } catch (e) {
      console.warn('[RateLimit] KV put failed, allowing action:', action, e && e.message);
      return true;
    }
    return true;
  }
};

// ==================== 模組 1: 核心工具 (Core Utils) ====================
const Utils = {
  zwsp: String.fromCharCode(8203),

  text(value) {
    return String(value ?? '').trim();
  },
  
  getIconUrl(type) {
    const icons = {
      "LINE": "https://aiwe.cc/wp-content/uploads/2026/02/b75a5831fd553c7130aeafbb9783cf79.png",
      "FB":   "https://aiwe.cc/wp-content/uploads/2026/02/3986d1fd62384c8cdaa0e7c82f2740d1.png",
      "IG":   "https://aiwe.cc/wp-content/uploads/2026/02/a33306edcecd1ebdfd14baea6718cf23.png",
      "YT":   "https://aiwe.cc/wp-content/uploads/2026/02/87e6f8054bd3672f2885e38bddb112e2.png",
      "TEL":  "https://aiwe.cc/wp-content/uploads/2026/02/7254567388850a6b4d77b75208ebd4b8.png",
      "WEB":  "https://cdn-icons-png.flaticon.com/512/1006/1006771.png"
    };
    return icons[type] || icons['WEB'];
  },

  cleanURI(uri) {
    if (!uri) return '';
    uri = uri.trim();
    if (uri === 'http://' || uri === 'https://') return '';
    if (!uri.match(/^(http|https|tel|mailto|line):/i)) return 'https://' + uri;
    return uri;
  },

  formatPhone(val) {
    if (!val) return '';
    let s = String(val).replaceAll(this.zwsp, '').replaceAll("'", "");
    return this.zwsp + s;
  },

  jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
};

// ==================== 模組 2: 圖片處理 (Storage Module) ====================
// Central feature flag helpers. Keep feature rollout decisions here so risky
// changes can be disabled by Worker env vars without reverting code.
const FeatureFlagModule = {
  enabled(env, name, defaultValue = false) {
    const key = String(name || '').trim();
    if (!key) return Boolean(defaultValue);
    const value = env && Object.prototype.hasOwnProperty.call(env, key) ? env[key] : undefined;
    if (value === undefined || value === null || value === '') return Boolean(defaultValue);
    return ['1', 'true', 'yes', 'on', 'enabled'].includes(String(value).trim().toLowerCase());
  },

  disabled(env, name, defaultValue = false) {
    return !this.enabled(env, name, defaultValue);
  },

  value(env, name, defaultValue = '') {
    const key = String(name || '').trim();
    if (!key || !env || !Object.prototype.hasOwnProperty.call(env, key)) return defaultValue;
    const value = env[key];
    return value === undefined || value === null || value === '' ? defaultValue : value;
  },

  snapshot(env) {
    const names = [
      'FEATURE_HOME_UI_V2',
      'FEATURE_MY_CARD_KEYWORD',
      'FEATURE_PUBLIC_MATCHMAKING_POOL',
      'FEATURE_THIRD_POINT_WEBHOOK',
      'FEATURE_RELAXED_NEW_USER_AUTH',
      'FEATURE_LINEOA_MONITOR_V2'
    ];
    return names.reduce((acc, name) => {
      acc[name] = this.enabled(env, name, false);
      return acc;
    }, {});
  }
};

const StorageModule = {
  text(value = '', fallback = '') {
    const text = String(value ?? '').trim();
    return text || fallback;
  },

  safeFilePart(value = '', fallback = 'media') {
    return this.text(value, fallback)
      .replace(/[\\/:*?"<>|#%{}^~[\]`]+/g, '_')
      .replace(/\s+/g, '_')
      .slice(0, 90) || fallback;
  },

  publicBaseUrl(env) {
    return (env.R2_PUBLIC_URL || env.R2_WORKER_URL || 'https://pub-1e42b8765b1e4675bfb7be60f0e785ca.r2.dev').replace(/\/$/, '');
  },

  async uploadMediaRequest(request, env) {
    if (!env.IMG_BUCKET) return { success: false, error: 'IMG_BUCKET_MISSING' };
    const url = new URL(request.url);
    const mediaType = this.text(url.searchParams.get('type'), 'video').toLowerCase();
    const rawFilename = this.text(url.searchParams.get('filename'), 'video.mp4');
    const contentType = this.text(request.headers.get('content-type'), 'application/octet-stream').toLowerCase();
    const contentLength = Number(request.headers.get('content-length') || 0);
    const maxBytes = mediaType === 'video' ? 200 * 1024 * 1024 : 20 * 1024 * 1024;
    if (contentLength && contentLength > maxBytes) return { success: false, error: '檔案超過限制：影片需小於 200MB' };
    if (mediaType === 'video') {
      const isMp4 = contentType.includes('video/mp4') || /\.mp4$/i.test(rawFilename);
      if (!isMp4) return { success: false, error: '目前影音名片僅支援 MP4 檔案' };
    }
    if (!request.body) return { success: false, error: 'MISSING_FILE' };
    const ext = mediaType === 'video' ? 'mp4' : (contentType.split('/')[1] || 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'bin';
    const filename = this.safeFilePart(rawFilename.replace(/\.[^.]+$/, ''), mediaType);
    const key = `card-media/${mediaType}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${filename}.${ext}`;
    await env.IMG_BUCKET.put(key, request.body, {
      httpMetadata: { contentType: mediaType === 'video' ? 'video/mp4' : contentType }
    });
    return {
      success: true,
      data: {
        url: `${this.publicBaseUrl(env)}/${key}`,
        key,
        filename: `${filename}.${ext}`,
        contentType: mediaType === 'video' ? 'video/mp4' : contentType,
        size: contentLength || 0
      }
    };
  },

  async upload(base64Image, env) {
    try {
      if (env.IMG_BUCKET) {
        const matches = base64Image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          const mimeType = matches[1];
          const binaryStr = atob(matches[2]);
          const buffer = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) buffer[i] = binaryStr.charCodeAt(i);
          const ext = mimeType.split('/')[1] || 'jpeg';
          const fileName = `card_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
          await env.IMG_BUCKET.put(fileName, buffer, { httpMetadata: { contentType: mimeType } });
          const baseUrl = (env.R2_PUBLIC_URL || env.R2_WORKER_URL || 'https://pub-1e42b8765b1e4675bfb7be60f0e785ca.r2.dev').replace(/\/$/, '');
          return `${baseUrl}/${fileName}`;
        }
      } 
      
      if (env.PHOTOMAN) {
        const r2Res = await env.PHOTOMAN.fetch("https://photoman.internal/", {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64Image })
        });
        const r2Data = await r2Res.json();
        if (r2Data.url) return r2Data.url;
      }

      // ImgBB 備援 
      if (!env.IMGBB_API_KEY) throw new Error("Missing IMGBB_API_KEY in environment variables");
      const formData = new URLSearchParams();
      formData.append('image', base64Image.replace(/^data:image\/[a-z]+;base64,/, ''));
      const bbRes = await fetch(`https://api.imgbb.com/1/upload?key=${env.IMGBB_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString()
      });
      const bbData = await bbRes.json();
      return bbData.data?.url || '';
    } catch (e) {
      console.error("[Storage Error]", e);
      return '';
    }
  }
};

// ==================== 模組 3: AI 服務 (AI Module) ====================
// ==================== LINE OA Tools Module ====================
const LineOAModule = {
  cleanMenu(menu) {
    const source = menu || {};
    const size = source.size || {};
    const cleaned = {
      size: { width: 2500, height: Number(size.height) === 1686 ? 1686 : 843 },
      selected: source.selected !== false,
      name: Utils.text(source.name || 'New Rich Menu').slice(0, 300),
      chatBarText: Utils.text(source.chatBarText || '選單').slice(0, 14),
      areas: []
    };
    cleaned.areas = (Array.isArray(source.areas) ? source.areas : []).map(area => {
      const bounds = area.bounds || {};
      const action = area.action || {};
      const type = Utils.text(action.type || 'uri').toLowerCase();
      const pure = { type };
      if (type === 'uri') pure.uri = Utils.cleanURI(action.uri || '');
      else if (type === 'message') pure.text = Utils.text(action.text);
      else if (type === 'postback') {
        pure.data = Utils.text(action.data);
        if (action.displayText) pure.displayText = Utils.text(action.displayText);
      } else if (type === 'richmenuswitch') {
        pure.richMenuAliasId = Utils.text(action.richMenuAliasId);
        pure.data = Utils.text(action.data);
      } else {
        pure.type = 'uri';
        pure.uri = '';
      }
      return {
        bounds: {
          x: Math.max(0, Math.round(Number(bounds.x) || 0)),
          y: Math.max(0, Math.round(Number(bounds.y) || 0)),
          width: Math.max(1, Math.round(Number(bounds.width) || 1)),
          height: Math.max(1, Math.round(Number(bounds.height) || 1))
        },
        action: pure
      };
    });
    return cleaned;
  },

  validateMenu(menu, imageBase64) {
    if (!menu.name) throw new Error('Rich Menu name is required');
    if (!menu.chatBarText) throw new Error('Rich Menu chatBarText is required');
    if (!Array.isArray(menu.areas) || menu.areas.length === 0) throw new Error('Rich Menu requires at least one tappable area');
    if (!imageBase64 || !String(imageBase64).startsWith('data:image')) throw new Error('Rich Menu image is required');
    menu.areas.forEach((area, index) => {
      const action = area.action || {};
      if (action.type === 'uri' && !action.uri) throw new Error(`Area #${index + 1} missing URI`);
      if (action.type === 'message' && !action.text) throw new Error(`Area #${index + 1} missing message text`);
      if (action.type === 'postback' && !action.data) throw new Error(`Area #${index + 1} missing postback data`);
      if (action.type === 'richmenuswitch' && (!action.richMenuAliasId || !action.data)) throw new Error(`Area #${index + 1} missing switch alias or data`);
    });
  },

  base64ToBytes(imageBase64) {
    const body = String(imageBase64).split(',')[1] || '';
    const binary = atob(body);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  },

  async deployRichMenu(payload, env) {
    if (!env.LINE_CHANNEL_ACCESS_TOKEN) throw new Error('Missing LINE_CHANNEL_ACCESS_TOKEN');
    const menu = this.cleanMenu(payload.menuObject || payload.richMenuConfig || payload);
    const imageBase64 = payload.imageBase64 || payload.image || payload.base64Image;
    this.validateMenu(menu, imageBase64);

    const createRes = await fetch('https://api.line.me/v2/bot/richmenu', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(menu)
    });
    if (!createRes.ok) throw new Error('Create LINE rich menu failed: ' + await createRes.text());
    const richMenuId = (await createRes.json()).richMenuId;

    const uploadRes = await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`, 'Content-Type': 'image/jpeg' },
      body: this.base64ToBytes(imageBase64)
    });
    if (!uploadRes.ok) throw new Error('Upload rich menu image failed: ' + await uploadRes.text());

    const defaultRes = await fetch(`https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` }
    });
    if (!defaultRes.ok) throw new Error('Set default rich menu failed: ' + await defaultRes.text());

    return { success: true, data: { richMenuId, menu } };
  },

  extractUrls(text) {
    const found = new Set();
    const pattern = /https?:\/\/[^\s"'<>)\]]+/gi;
    let match;
    while ((match = pattern.exec(String(text || '')))) {
      found.add(match[0].replace(/\\u002F/g, '/').replace(/\\\//g, '/').replace(/[),.;]+$/g, ''));
    }
    return Array.from(found);
  },

  classifyMedia(urls) {
    const images = [];
    let video = null;
    urls.forEach(url => {
      if (/(\.mp4|\/video\/|videoUrl|videoplayback)/i.test(url)) video = video || { videoUrl: url };
      else if (/(\.jpg|\.jpeg|\.png|\.webp|\/image\/|\/photo\/|thumbnail)/i.test(url)) images.push({ url });
    });
    return { video, images };
  },

  async extractLineVoomMedia(payload) {
    const target = Utils.text(payload.url);
    if (!/^https:\/\/(linevoom\.line\.me|line\.me)\//i.test(target)) throw new Error('Only LINE VOOM URLs are supported');
    const res = await fetch(target, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LINEOA-Extractor/1.0)', 'Accept': 'text/html,application/xhtml+xml,application/json' } });
    if (!res.ok) throw new Error(`Fetch LINE VOOM failed: HTTP ${res.status}`);
    const html = await res.text();
    const urls = this.extractUrls(html);
    const media = this.classifyMedia(urls);
    const ogImage = html.match(/property=["']og:image["'][^>]+content=["']([^"']+)/i)?.[1] || html.match(/content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1];
    const ogVideo = html.match(/property=["']og:video(?::url)?["'][^>]+content=["']([^"']+)/i)?.[1] || html.match(/content=["']([^"']+)["'][^>]+property=["']og:video(?::url)?["']/i)?.[1];
    if (ogImage && !media.images.some(img => img.url === ogImage)) media.images.unshift({ url: ogImage });
    if (ogVideo && !media.video) media.video = { videoUrl: ogVideo, thumbnailUrl: ogImage || '' };
    if (media.video && ogImage && !media.video.thumbnailUrl) media.video.thumbnailUrl = ogImage;
    const type = media.video && media.images.length ? 'MIXED' : media.video ? 'VIDEO' : media.images.length ? 'IMAGE' : 'UNKNOWN';
    return { success: true, data: { success: true, sourceUrl: target, type, video: media.video, images: media.images.slice(0, 20), urls: urls.slice(0, 100) } };
  }
};

const LineOAChatModule = {
  encoder: new TextEncoder(),

  text(value, fallback = '') {
    const next = String(value ?? '').trim();
    return next || fallback;
  },

  async ensure(env) {
    if (!env.ACTMASTER_DB) throw new Error('Missing ACTMASTER_DB binding');
    await env.ACTMASTER_DB.prepare(`
      CREATE TABLE IF NOT EXISTS line_oa_threads (
        thread_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL DEFAULT '',
        source_type TEXT NOT NULL DEFAULT 'user',
        display_name TEXT NOT NULL DEFAULT '',
        picture_url TEXT NOT NULL DEFAULT '',
        last_message_text TEXT NOT NULL DEFAULT '',
        last_message_type TEXT NOT NULL DEFAULT '',
        last_event_type TEXT NOT NULL DEFAULT '',
        message_count INTEGER NOT NULL DEFAULT 0,
        unread_count INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'open',
        tags TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        last_event_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    await env.ACTMASTER_DB.prepare(`
      CREATE TABLE IF NOT EXISTS line_oa_messages (
        message_id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL DEFAULT '',
        user_id TEXT NOT NULL DEFAULT '',
        direction TEXT NOT NULL DEFAULT 'inbound',
        message_type TEXT NOT NULL DEFAULT '',
        text_content TEXT NOT NULL DEFAULT '',
        event_type TEXT NOT NULL DEFAULT '',
        reply_token TEXT NOT NULL DEFAULT '',
        raw_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_line_oa_threads_updated ON line_oa_threads(updated_at)').run();
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_line_oa_threads_user ON line_oa_threads(user_id)').run();
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_line_oa_messages_thread ON line_oa_messages(thread_id, created_at)').run();
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_line_oa_messages_user ON line_oa_messages(user_id, created_at)').run();
    await env.ACTMASTER_DB.prepare(`
      CREATE TABLE IF NOT EXISTS line_oa_keyword_rules (
        rule_id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        keyword TEXT NOT NULL DEFAULT '',
        match_type TEXT NOT NULL DEFAULT 'contains',
        response_mode TEXT NOT NULL DEFAULT 'standalone',
        response_type TEXT NOT NULL DEFAULT 'text',
        text_content TEXT NOT NULL DEFAULT '',
        flex_title TEXT NOT NULL DEFAULT '',
        flex_label TEXT NOT NULL DEFAULT '',
        flex_button_text TEXT NOT NULL DEFAULT '',
        flex_button_keyword TEXT NOT NULL DEFAULT '',
        flex_alt_text TEXT NOT NULL DEFAULT '',
        flex_json TEXT NOT NULL DEFAULT '',
        enabled INTEGER NOT NULL DEFAULT 1,
        priority INTEGER NOT NULL DEFAULT 100,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_line_oa_keyword_rules_enabled ON line_oa_keyword_rules(enabled, priority, updated_at)').run();
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_line_oa_keyword_rules_keyword ON line_oa_keyword_rules(keyword)').run();
    try {
      await env.ACTMASTER_DB.prepare(`ALTER TABLE line_oa_keyword_rules ADD COLUMN flex_json TEXT NOT NULL DEFAULT ''`).run();
    } catch (e) {
      if (!String(e?.message || e).toLowerCase().includes('duplicate column')) throw e;
    }
    try {
      await env.ACTMASTER_DB.prepare(`ALTER TABLE line_oa_keyword_rules ADD COLUMN response_mode TEXT NOT NULL DEFAULT 'standalone'`).run();
    } catch (e) {
      if (!String(e?.message || e).toLowerCase().includes('duplicate column')) throw e;
    }
    const optionalThreadColumns = [
      `ALTER TABLE line_oa_threads ADD COLUMN opportunity_stage TEXT NOT NULL DEFAULT 'new'`,
      `ALTER TABLE line_oa_threads ADD COLUMN opportunity_value INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE line_oa_threads ADD COLUMN opportunity_note TEXT NOT NULL DEFAULT ''`,
      `ALTER TABLE line_oa_threads ADD COLUMN ai_paused INTEGER NOT NULL DEFAULT 0`
    ];
    for (const sql of optionalThreadColumns) {
      try {
        await env.ACTMASTER_DB.prepare(sql).run();
      } catch (e) {
        if (!String(e?.message || e).toLowerCase().includes('duplicate column')) throw e;
      }
    }
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_line_oa_threads_ai_paused ON line_oa_threads(ai_paused, updated_at)').run();
    const optionalMessageColumns = [
      `ALTER TABLE line_oa_messages ADD COLUMN media_url TEXT NOT NULL DEFAULT ''`,
      `ALTER TABLE line_oa_messages ADD COLUMN media_content_type TEXT NOT NULL DEFAULT ''`,
      `ALTER TABLE line_oa_messages ADD COLUMN media_size INTEGER NOT NULL DEFAULT 0`
    ];
    for (const sql of optionalMessageColumns) {
      try {
        await env.ACTMASTER_DB.prepare(sql).run();
      } catch (e) {
        if (!String(e?.message || e).toLowerCase().includes('duplicate column')) throw e;
      }
    }
  },

  async verifySignature(rawBody, signature, env) {
    const secret = this.text(env.LINE_CHANNEL_SECRET);
    if (!secret) return false;
    if (!signature) return false;
    const key = await crypto.subtle.importKey('raw', this.encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signed = await crypto.subtle.sign('HMAC', key, this.encoder.encode(rawBody));
    const expected = btoa(String.fromCharCode(...new Uint8Array(signed)));
    return expected === signature;
  },

  eventUserId(event) {
    return this.text(event?.source?.userId || event?.source?.groupId || event?.source?.roomId);
  },

  eventTimestamp(event) {
    const ts = Number(event?.timestamp || 0);
    return ts ? new Date(ts).toISOString() : new Date().toISOString();
  },

  messageId(event) {
    return this.text(event?.message?.id) || `LINE_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  },

  messageText(event) {
    const message = event?.message || {};
    if (message.type === 'text') return this.text(message.text);
    if (event?.type === 'follow') return '加入好友 / 開始關注官方帳號';
    if (event?.type === 'unfollow') return '封鎖或離開官方帳號';
    if (event?.type === 'postback') return this.text(event?.postback?.data, '點擊 postback');
    return message.type ? `[${message.type}]` : `[${this.text(event?.type, 'event')}]`;
  },

  async fetchProfile(env, userId) {
    const id = this.text(userId);
    if (!id || !id.startsWith('U') || !env.LINE_CHANNEL_ACCESS_TOKEN) return {};
    try {
      const res = await fetch(`https://api.line.me/v2/bot/profile/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` }
      });
      if (!res.ok) return {};
      const data = await res.json();
      return {
        displayName: this.text(data.displayName),
        pictureUrl: this.text(data.pictureUrl)
      };
    } catch (e) {
      return {};
    }
  },

  isSimpleMyCardKeyword(event) {
    const message = event?.message || {};
    if (message.type !== 'text') return false;
    const text = this.text(message.text).replace(/\s+/g, '');
    return text === '我的名片';
  },

  quickMyCardUrl(userId, env, rowId = '') {
    const liffId = this.text(env.POINT_LIFF_ID || env.LIFF_ID || '1660923784-vViMTZ1y');
    const params = new URLSearchParams({
      mode: 'wysiwyg-card'
    });
    if (userId) params.set('lineUserId', userId);
    if (rowId) params.set('rowId', rowId);
    return `https://liff.line.me/${encodeURIComponent(liffId)}?${params.toString()}`;
  },

  showMyCardPostback(rowId = '') {
    const params = new URLSearchParams({ action: 'lineoa_mycard_show' });
    if (rowId) params.set('rowId', this.text(rowId));
    return params.toString();
  },

  myCardQuickReplyItems(userId, env, rowId = '') {
    return [{
      type: 'action',
      action: { type: 'uri', label: '編輯名片', uri: this.quickMyCardUrl(userId, env, rowId) }
    }, {
      type: 'action',
      action: {
        type: 'postback',
        label: '顯示名片',
        data: this.showMyCardPostback(rowId),
        displayText: '我的名片'
      }
    }];
  },

  cardShareUrl(rowId, userId, networkId, env, shareMode = false) {
    const liffId = this.text(env.POINT_LIFF_ID || env.LIFF_ID || '1660923784-vViMTZ1y');
    const params = new URLSearchParams({ shareCardId: this.text(rowId) });
    if (userId) params.set('ref', userId);
    if (networkId) params.set('net', networkId);
    if (shareMode) params.set('share', '1');
    return `https://liff.line.me/${encodeURIComponent(liffId)}?${params.toString()}`;
  },

  async findMySelfCard(env, userId) {
    const rows = await this.findMySelfCards(env, userId);
    return rows[0] || null;
  },

  async findMySelfCards(env, userId) {
    const id = this.text(userId);
    if (!id || !env.ACTMASTER_DB) return [];
    await D1ReadModule.ensureCardAccessColumns(env);
    const ids = await D1ReadModule.identityIdsForUser(env, id).catch(() => [id]);
    const safeIds = (Array.isArray(ids) ? ids : [id]).map(v => this.text(v)).filter(Boolean);
    if (!safeIds.length) return [];
    const placeholders = safeIds.map(() => '?').join(',');
    const rows = await D1ReadModule.all(env, `
      SELECT * FROM card_contacts
      WHERE (
        line_id IN (${placeholders})
        OR profile_user_id IN (${placeholders})
        OR owner_user_id IN (${placeholders})
        OR (
          COALESCE(line_id, '') = ''
          AND COALESCE(profile_user_id, '') = ''
          AND COALESCE(owner_user_id, '') = ''
          AND creator_id IN (${placeholders})
        )
      )
      AND LOWER(COALESCE(source_type, '')) = 'self_profile'
      AND row_id LIKE 'CARD_%'
      ORDER BY
        CASE WHEN line_id IN (${placeholders}) THEN 0 ELSE 1 END,
        COALESCE(updated_at, created_at) DESC,
        row_id DESC
      LIMIT 20
    `, [...safeIds, ...safeIds, ...safeIds, ...safeIds, ...safeIds]).catch(() => []);
    return rows.filter(row => {
      if (!this.isLineOaMyCardCandidate(row)) return false;
      const lineId = this.text(row.line_id);
      const profileId = this.text(row.profile_user_id);
      const ownerId = this.text(row.owner_user_id);
      const creatorId = this.text(row.creator_id);
      const hasDirectOwner = lineId || profileId || ownerId;
      return safeIds.includes(lineId) ||
        safeIds.includes(profileId) ||
        safeIds.includes(ownerId) ||
        (!hasDirectOwner && safeIds.includes(creatorId));
    });
  },

  async findMySelfCardByRowId(env, userId, rowId) {
    const targetRowId = this.text(rowId);
    if (!targetRowId) return null;
    const rows = await this.findMySelfCards(env, userId);
    return rows.find(row => this.text(row.row_id) === targetRowId) || null;
  },

  async findMyVideoCards(env, userId) {
    const id = this.text(userId);
    if (!id || !env.ACTMASTER_DB) return [];
    await D1ReadModule.ensureCardAccessColumns(env);
    const ids = await D1ReadModule.identityIdsForUser(env, id).catch(() => [id]);
    const safeIds = (Array.isArray(ids) ? ids : [id]).map(v => this.text(v)).filter(Boolean);
    if (!safeIds.length) return [];
    const placeholders = safeIds.map(() => '?').join(',');
    const rows = await D1ReadModule.all(env, `
      SELECT * FROM card_contacts
      WHERE (
        line_id IN (${placeholders})
        OR profile_user_id IN (${placeholders})
        OR owner_user_id IN (${placeholders})
        OR creator_id IN (${placeholders})
      )
      AND row_id LIKE 'CARD_VIDEO_%'
      ORDER BY COALESCE(updated_at, created_at) DESC, row_id DESC
      LIMIT 5
    `, [...safeIds, ...safeIds, ...safeIds, ...safeIds]).catch(() => []);
    return rows.filter(row => {
      const config = this.parseLineOaMyCardConfig(row);
      return this.isLineOaVideoCard(row) && this.text(config.videoUrl);
    });
  },

  async findMyVideoCardByRowId(env, userId, rowId) {
    const targetRowId = this.text(rowId);
    if (!targetRowId) return null;
    const rows = await this.findMyVideoCards(env, userId);
    return rows.find(row => this.text(row.row_id) === targetRowId) || null;
  },

  myCardVersionOrder(row) {
    const card = D1ReadModule.cardRow(row);
    const label = this.myCardVersionLabel(card);
    if (label === '標準') return 10;
    if (label === '滿版') return 20;
    if (label === '正方') return 30;
    if (label === '影音') return 40;
    return 90;
  },

  async myCardSelectorRows(env, userId) {
    const normalRows = this.filterLineOaMyCardCandidates(await this.findMySelfCards(env, userId));
    const videoRows = await this.findMyVideoCards(env, userId);
    const seen = new Set();
    return normalRows.concat(videoRows).filter(row => {
      const rowId = this.text(row && row.row_id);
      if (!rowId || seen.has(rowId)) return false;
      seen.add(rowId);
      return true;
    }).sort((a, b) => this.myCardVersionOrder(a) - this.myCardVersionOrder(b));
  },
  parseLineOaMyCardConfig(row) {
    const raw = this.text(row && (row.custom_config || row.customConfig || row['自訂名片設定']));
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      return {};
    }
  },

  isLineOaVideoCard(row) {
    const rowId = this.text(row && row.row_id);
    const config = this.parseLineOaMyCardConfig(row);
    const explicitVersion = this.text(config.cardVersion || config.card_version).toLowerCase();
    if (rowId.startsWith('CARD_VIDEO_')) return true;
    if (['standard', 'poster', 'portrait', 'square'].includes(explicitVersion)) return false;
    return explicitVersion === 'video'
      || config.cardVariant === 'video_card'
      || config.videoCard === true
      || config.videoStorageKind === 'dedicated_video_card';
  },

  isLineOaMyCardCandidate(row) {
    const rowId = this.text(row && row.row_id);
    const sourceType = this.text(row && row.source_type);
    if (sourceType !== 'self_profile') return false;
    if (!rowId.startsWith('CARD_')) return false;
    if (this.isLineOaVideoCard(row)) return false;
    const name = this.text(row && row.name);
    const company = this.text(row && row.company_name);
    const imageUrl = this.text(row && row.image_url);
    return !!(name && company && imageUrl);
  },

  filterLineOaMyCardCandidates(rows) {
    const list = Array.isArray(rows) ? rows : [];
    return list.filter(row => this.isLineOaMyCardCandidate(row));
  },

  normalizeCardButton(button) {
    if (!button || typeof button !== 'object') return null;
    const label = this.text(button.l || button.label || button.text || button.title);
    const uri = this.text(button.u || button.url || button.uri || button.href);
    const color = this.text(button.c || button.color, '#06C755');
    return label && uri ? { l: label, u: this.normalizeActionUri(uri), c: color } : null;
  },

  firstPhoneForTel(value) {
    const raw = this.text(value).replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/＋/g, '+').trim();
    if (!raw) return '';
    const candidates = raw.match(/(?:\+?886|00886)?[\s().-]*0?9(?:[\s().-]*\d){8}|\+?\d(?:[\s().-]*\d){6,14}/g) || [];
    for (const candidate of candidates) {
      let phone = candidate.replace(/[^0-9+]/g, '');
      if (phone.startsWith('00886')) phone = '+886' + phone.slice(5);
      if (/^\+?\d{7,16}$/.test(phone)) return phone;
    }
    const compact = raw.replace(/[^0-9+]/g, '');
    if (/^09\d{18,}$/.test(compact)) return compact.slice(0, 10);
    if (/^\+?\d{7,16}$/.test(compact)) return compact;
    return '';
  },

  normalizeActionUri(uri) {
    const value = this.text(uri).replace(/[\u200B-\u200D\uFEFF]/g, '');
    if (!value) return '';
    if (/^tel:/i.test(value)) {
      const phone = this.firstPhoneForTel(value.replace(/^tel:/i, ''));
      return phone ? 'tel:' + phone : '';
    }
    if (/^(https?|mailto|line):/i.test(value)) return value;
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'mailto:' + value;
    const compactPhone = this.firstPhoneForTel(value);
    if (compactPhone) return 'tel:' + compactPhone;
    return Utils.cleanURI(value);
  },

  normalizeCardButtons(buttons) {
    return (Array.isArray(buttons) ? buttons : [])
      .map(button => this.normalizeCardButton(button))
      .filter(Boolean);
  },

  parseCardSocials(raw) {
    const text = this.text(raw);
    if (!text) return [];
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === 'object') return Object.entries(parsed).map(([type, value]) => {
        if (value && typeof value === 'object') return { t: type, ...value };
        return { t: type, u: value };
      });
    } catch (e) {}
    return [{ t: 'LINE', u: text }];
  },

  socialLineUrl(card) {
    const socials = this.parseCardSocials(card?.socials);
    for (const item of socials) {
      const type = this.text(item.t || item.type || item.platform || item.name).toLowerCase();
      const url = this.text(item.u || item.url || item.uri || item.value || item.link);
      if (!url) continue;
      if (type.includes('line') || /^https?:\/\/(line\.me|lin\.ee)\//i.test(url) || /^line:\/\//i.test(url)) return url;
    }
    const website = this.text(card?.website);
    if (/^https?:\/\/(line\.me|lin\.ee)\//i.test(website) || /^line:\/\//i.test(website)) return website;
    return '';
  },

  mapUrlFromAddress(address) {
    const value = this.text(address);
    if (!value) return '';
    if (/^https?:\/\//i.test(value)) return value;
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(value);
  },

  autoCardButtons(card) {
    const buttons = [];
    const lineUrl = this.socialLineUrl(card);
    const phone = this.firstPhoneForTel(card?.mobile || card?.officePhone);
    const addressUrl = this.mapUrlFromAddress(card?.address);
    if (lineUrl) buttons.push({ l: '加LINE好友', u: lineUrl, c: '#06C755' });
    if (phone) buttons.push({ l: '行動電話', u: 'tel:' + phone, c: '#3B82F6' });
    if (addressUrl) buttons.push({ l: '店家地址', u: addressUrl, c: '#1E293B' });
    return buttons;
  },

  hasAddressButton(buttons) {
    return this.normalizeCardButtons(buttons).some(button => {
      const label = this.text(button.l).toLowerCase();
      const uri = this.text(button.u).toLowerCase();
      return label.includes('地址') ||
        label.includes('地圖') ||
        uri.includes('google.com/maps') ||
        uri.includes('maps/search');
    });
  },

  addMissingAddressButton(buttons, card) {
    const normalized = this.normalizeCardButtons(buttons);
    if (normalized.length >= 4 || this.hasAddressButton(normalized)) return normalized;
    const addressUrl = this.mapUrlFromAddress(card?.address);
    if (!addressUrl) return normalized;
    return normalized.concat([{ l: '店家地址', u: addressUrl, c: '#1E293B' }]).slice(0, 4);
  },
  myCardVersionFromRowId(card, config = {}) {
    const rowId = this.text(card?.rowId || card?.row_id || card?.id).toUpperCase();
    if (rowId.startsWith('CARD_VIDEO_')) return 'video';
    if (rowId.startsWith('CARD_POSTER_')) return 'poster';
    if (rowId.startsWith('CARD_SQUARE_')) return 'square';
    if (rowId.startsWith('CARD_STD_')) return 'standard';
    const version = this.text(config.cardVersion || config.card_version).toLowerCase();
    const layout = this.text(config.layoutStyle || config.layout).toLowerCase();
    if (version === 'video' || config.videoCard === true) return 'video';
    if (version === 'poster' || layout === 'portrait') return 'poster';
    if (version === 'square' || layout === 'square') return 'square';
    return 'standard';
  },

  myCardLayoutForVersion(version, config = {}) {
    if (version === 'poster') return 'portrait';
    if (version === 'square') return 'square';
    if (version === 'video') {
      const layout = this.text(config.layoutStyle || config.layout || 'landscape').toLowerCase();
      return layout === 'square' ? 'square' : 'landscape';
    }
    return 'landscape';
  },

  myCardImageForVersion(card, config, version) {
    if (version === 'poster') return config.imgUrlPortrait || config.imgUrl || card.imageUrl;
    if (version === 'square') return config.imgUrlSquare || config.imgUrl || card.imageUrl;
    if (version === 'video') return config.thumbnailUrl || config.previewUrl || config.imgUrl || config.imgUrlLandscape || card.imageUrl || config.imgUrlSquare;
    return config.imgUrl || config.imgUrlLandscape || card.imageUrl || config.imgUrlPortrait || config.imgUrlSquare;
  },
  buildExistingMyCardFlex(row, userId, env) {
    const card = D1ReadModule.cardRow(row);
    if (!card || !card.rowId) return null;
    let config = {};
    try {
      config = card.customConfig ? JSON.parse(card.customConfig) : {};
    } catch (e) {
      config = {};
    }
    const cardVersion = this.myCardVersionFromRowId(card, config);
    const layoutStyle = this.myCardLayoutForVersion(cardVersion, config);
    config = {
      ...config,
      cardVersion,
      layoutStyle,
      imgUrl: this.myCardImageForVersion(card, config, cardVersion),
      imgRatioLandscape: config.imgRatioLandscape || '20:13',
      imgRatioPortrait: config.imgRatioPortrait || '400:600',
      imgRatioSquare: config.imgRatioSquare || '1:1',
      title: config.title || card.name,
      desc: config.desc || card.services || card.title || '',
      buttons: this.normalizeCardButtons(config.buttons)
    };
    if (!config.buttons.length) config.buttons = this.autoCardButtons(card);
    else config.buttons = this.addMissingAddressButton(config.buttons, card);
    const flex = MessagingModule.buildFlex({
      card,
      config,
      referrerId: userId,
      networkId: card.networkId || 'admin',
      liffId: env.POINT_LIFF_ID || env.LIFF_ID,
      socialLikeLiffId: env.SOCIAL_LIKE_LIFF_ID || env.LIKE_LIFF_ID
    });
    const editUrl = this.quickMyCardUrl(userId, env);
    const shareUrl = this.cardShareUrl(card.rowId, userId, card.networkId || 'admin', env, true);
    if (flex?.header?.contents?.length) {
      const shareButton = flex.header.contents[flex.header.contents.length - 1];
      shareButton.action = { type: 'uri', uri: shareUrl };
    }
    return {
      type: 'flex',
      altText: `${card.name || '我的名片'} 的電子名片`,
      quickReply: {
        items: this.myCardQuickReplyItems(userId, env, card.rowId)
      },
      contents: flex
    };
  },

  async attachSocialLikeCountToFlexMessage(message, row, env) {
    const cardId = this.text(row?.row_id || row?.rowId || row?.id);
    if (!message?.contents?.header?.contents?.[0]?.contents || !cardId) return message;
    const stats = await TrackingModule.getSocialLikeStats({ cardId }, env).catch(() => null);
    const count = String(Math.max(0, Number(stats?.data?.totalLikes || 0) || 0));
    const likeContents = message.contents.header.contents[0].contents;
    if (likeContents[1] && likeContents[1].type === 'text') likeContents[1].text = count;
    return message;
  },

  myCardVersionLabel(card) {
    const rowId = this.text(card?.rowId || card?.row_id || card?.id).toUpperCase();
    let cfg = {};
    try {
      const raw = card?.customConfig || card?.custom_config || card?.['自訂名片設定'];
      cfg = raw && typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
    } catch (e) {
      cfg = {};
    }
    const version = this.text(cfg.cardVersion || cfg.card_version).toLowerCase();
    const layout = this.text(cfg.layoutStyle || cfg.layout).toLowerCase();
    if (rowId.startsWith('CARD_VIDEO_')) return '影音';
    if (rowId.startsWith('CARD_POSTER_')) return '滿版';
    if (rowId.startsWith('CARD_SQUARE_')) return '正方';
    if (rowId.startsWith('CARD_STD_')) return '標準';
    if (version === 'video' || cfg.videoCard === true) return '影音';
    if (version === 'poster' || layout === 'portrait') return '滿版';
    if (version === 'square' || layout === 'square') return '正方';
    if (version === 'standard' || layout === 'landscape') return '標準';
    return this.text(card?.name, '名片');
  },
  buildMyCardSelectorFlex(rows, userId, env) {
    const cards = (Array.isArray(rows) ? rows : []).slice(0, 10).map(row => D1ReadModule.cardRow(row)).filter(card => card && card.rowId);
    if (!cards.length) return null;
    const editUrl = this.quickMyCardUrl(userId, env);
    const selectActionForCard = card => {
      const label = this.myCardVersionLabel(card).slice(0, 20);
      return {
        type: 'postback',
        label,
        data: new URLSearchParams({
          action: 'lineoa_mycard_select',
          rowId: card.rowId
        }).toString(),
        displayText: label
      };
    };
    const buttons = cards.map(card => ({
      type: 'button',
      style: 'secondary',
      height: 'sm',
      action: selectActionForCard(card)
    }));
    const quickReplyItems = this.myCardQuickReplyItems(userId, env)
      .concat(cards.map(card => ({ type: 'action', action: selectActionForCard(card) })))
      .slice(0, 13);
    return {
      type: 'flex',
      altText: '選擇我的名片',
      quickReply: {
        items: quickReplyItems
      },
      contents: {
        type: 'bubble',
        size: 'kilo',
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'md',
          paddingAll: '16px',
          contents: [
            { type: 'text', text: '選擇要顯示的名片', weight: 'bold', size: 'lg', color: '#111827' },
            { type: 'text', text: `找到 ${cards.length} 張個人名片`, size: 'sm', color: '#6B7280' },
            ...buttons
          ]
        }
      }
    };
  },

  myCardPostbackRowId(event) {
    if (event?.type !== 'postback') return '';
    const data = this.text(event?.postback?.data);
    if (!data) return '';
    const params = new URLSearchParams(data);
    if (params.get('action') !== 'lineoa_mycard_select') return '';
    return this.text(params.get('rowId'));
  },

  myCardShowPostbackRowId(event) {
    if (event?.type !== 'postback') return null;
    const data = this.text(event?.postback?.data);
    if (!data) return null;
    const params = new URLSearchParams(data);
    if (params.get('action') !== 'lineoa_mycard_show') return null;
    return this.text(params.get('rowId'));
  },

  normalizeSimpleMyCardFlex(message) {
    const visit = node => {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'text' && typeof node.text === 'string') {
        const text = node.text;
        if (text.includes('LINE') && (text.includes('頭貼') || text.includes('?剛票') || text.includes('雿輻'))) {
          node.text = '請補上電話、連結與介紹，完成後即可分享這張名片。';
        }
        if (text.includes('快速建立電子名片') || text.includes('敹恍')) {
          node.text = '補齊名片資料';
        }
      }
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach(visit);
        else if (value && typeof value === 'object') visit(value);
      }
    };
    visit(message);
    return message;
  },

  buildSimpleMyCardFlex(profile, userId, env) {
    const name = this.text(profile?.displayName, '我的名片');
    const avatarUrl = '';
    const coverUrl = this.text(
      env.SIMPLE_MY_CARD_COVER_URL,
      'https://s3.us-west-1.wasabisys.com/aitw/2026/05/fe806f078850d66200c36a1daf125597.png'
    );
    const editUrl = this.quickMyCardUrl(userId, env);
    const avatar = [];
    const legacyAvatar = avatarUrl ? [{
      type: 'image',
      url: avatarUrl,
      size: 'sm',
      aspectRatio: '1:1',
      aspectMode: 'cover',
      flex: 0
    }] : [];

    return {
      type: 'flex',
      altText: `${name} 的電子名片`,
      quickReply: {
        items: this.myCardQuickReplyItems(userId, env)
      },
      contents: {
        type: 'bubble',
        size: 'mega',
        header: {
          type: 'box',
          layout: 'horizontal',
          justifyContent: 'flex-end',
          paddingAll: '8px',
          contents: [{
            type: 'box',
            layout: 'vertical',
            justifyContent: 'center',
            backgroundColor: '#EF4444',
            width: '65px',
            height: '25px',
            cornerRadius: '25px',
            contents: [{ type: 'text', text: '分享', weight: 'bold', align: 'center', color: '#FFFFFF', size: 'xs' }],
            action: { type: 'uri', uri: `${editUrl}&share=1` }
          }]
        },
        hero: {
          type: 'image',
          url: coverUrl,
          size: 'full',
          aspectRatio: '20:13',
          aspectMode: 'cover',
          action: { type: 'uri', uri: editUrl }
        },
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'md',
          paddingAll: '18px',
          contents: [{
            type: 'box',
            layout: 'horizontal',
            spacing: 'md',
            alignItems: 'center',
            contents: [
              ...avatar,
              {
                type: 'box',
                layout: 'vertical',
                contents: [
                  { type: 'text', text: name, weight: 'bold', size: 'xl', color: '#111827', wrap: true },
                  { type: 'text', text: '快速建立電子名片', size: 'sm', color: '#6B7280', margin: 'xs' }
                ]
              }
            ]
          }, {
            type: 'text',
            text: '這張名片使用 LINE 頭貼與預設封面建立，點下方按鈕即可快速補上電話、連結與介紹。',
            size: 'sm',
            color: '#4B5563',
            wrap: true
          }]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          paddingAll: '12px',
          contents: [{
            type: 'button',
            style: 'primary',
            color: '#06C755',
            height: 'sm',
            action: { type: 'uri', label: '加LINE好友', uri: 'https://lin.ee/OvW0zxb' }
          }, {
            type: 'button',
            style: 'primary',
            color: '#2563EB',
            height: 'sm',
            action: { type: 'uri', label: '行動電話', uri: 'tel:09xxxxxxxx' }
          }, {
            type: 'button',
            style: 'primary',
            color: '#1E293B',
            height: 'sm',
            action: { type: 'uri', label: '店家地址', uri: 'https://www.google.com/' }
          }]
        }
      }
    };
  },

  async replySimpleMyCard(events, env) {
    for (const event of events) {
      const selectedRowId = this.myCardPostbackRowId(event);
      const showRowId = this.myCardShowPostbackRowId(event);
      const isKeyword = this.isSimpleMyCardKeyword(event);
      if (!isKeyword && !selectedRowId && showRowId === null) continue;
      const replyToken = this.text(event.replyToken);
      const userId = this.eventUserId(event);
      if (!replyToken || !userId) continue;
      let message = null;
      let messageCardRow = null;
      if (selectedRowId) {
        let selectedCard = this.filterLineOaMyCardCandidates([
          await this.findMySelfCardByRowId(env, userId, selectedRowId)
        ]).filter(Boolean)[0];
        if (!selectedCard) selectedCard = await this.findMyVideoCardByRowId(env, userId, selectedRowId);
        messageCardRow = selectedCard || null;
        message = selectedCard
          ? (this.isLineOaVideoCard(selectedCard) && typeof LineOAMyVideoKeywordModule !== 'undefined'
            ? LineOAMyVideoKeywordModule.buildExistingVideoCardFlex(selectedCard, userId, env)
            : this.buildExistingMyCardFlex(selectedCard, userId, env))
          : null;
      } else if (showRowId !== null) {
        const cards = await this.myCardSelectorRows(env, userId);
        const selectedCard = showRowId
          ? cards.find(row => this.text(row.row_id) === showRowId)
          : cards[0];
        if (selectedCard) {
          messageCardRow = selectedCard;
          message = this.isLineOaVideoCard(selectedCard) && typeof LineOAMyVideoKeywordModule !== 'undefined'
            ? LineOAMyVideoKeywordModule.buildExistingVideoCardFlex(selectedCard, userId, env)
            : this.buildExistingMyCardFlex(selectedCard, userId, env);
        } else {
          const profile = await this.fetchProfile(env, userId);
          message = this.buildSimpleMyCardFlex(profile, userId, env);
        }
      } else {
        const profile = await this.fetchProfile(env, userId);
        const existingCards = await this.myCardSelectorRows(env, userId);
        message = existingCards.length > 1
          ? this.buildMyCardSelectorFlex(existingCards, userId, env)
          : (existingCards.length === 1
            ? (messageCardRow = existingCards[0], (this.isLineOaVideoCard(existingCards[0]) && typeof LineOAMyVideoKeywordModule !== 'undefined' ? LineOAMyVideoKeywordModule.buildExistingVideoCardFlex(existingCards[0], userId, env) : this.buildExistingMyCardFlex(existingCards[0], userId, env)))
            : this.buildSimpleMyCardFlex(profile, userId, env));
      }
      if (messageCardRow) message = await this.attachSocialLikeCountToFlexMessage(message, messageCardRow, env);
      if (!message) continue;
      const replyResult = await this.replyLine({ replyToken, messages: [message] }, env);
      if (!replyResult.success) console.error('Simple my-card reply failed', replyResult);
      return true;
    }
    return false;
  },

  async getMyVideoDraft(payload, env) {
    return await LineOAMyVideoKeywordModule.getDraft(payload || {}, env);
  },

  async forwardToGas(rawBody, env) {
    const gasUrl = this.text(env.GAS_URL || env.GAS_WEBAPP_URL);
    if (!gasUrl) return { success: false, skipped: true, error: 'Missing GAS_URL' };
    const body = JSON.parse(rawBody || '{}');
    const res = await fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'LINE_WEBHOOK', payload: body })
    });
    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch (e) {
      data = { rawText: text };
    }
    if (!res.ok) return { success: false, status: res.status, data, error: text || `GAS HTTP ${res.status}` };
    return { success: true, status: res.status, data };
  },

  normalizeReplyPayload(gasResult) {
    const data = gasResult && gasResult.data ? gasResult.data : gasResult;
    const payload = data?.replyPayload || data?.data?.replyPayload || data?.payload?.replyPayload;
    if (!payload || !payload.replyToken || !Array.isArray(payload.messages) || !payload.messages.length) return null;
    return {
      replyToken: this.text(payload.replyToken),
      messages: payload.messages.slice(0, 5)
    };
  },

  mergeReplyPayloads(primary, secondary) {
    if (!primary && !secondary) return null;
    if (!primary) return secondary;
    if (!secondary) return primary;
    if (!primary.replyToken || primary.replyToken !== secondary.replyToken) return primary;
    const primaryMessages = Array.isArray(primary.messages) ? primary.messages : [];
    const secondaryMessages = Array.isArray(secondary.messages) ? secondary.messages : [];
    const quickReplyItems = secondaryMessages
      .flatMap(message => Array.isArray(message?.quickReply?.items) ? message.quickReply.items : [])
      .filter(Boolean)
      .slice(0, 13);
    if (quickReplyItems.length && primaryMessages.length) {
      const messages = primaryMessages.slice(0, 5).map(message => ({ ...message }));
      const targetIndex = messages.length - 1;
      const existingItems = Array.isArray(messages[targetIndex]?.quickReply?.items)
        ? messages[targetIndex].quickReply.items
        : [];
      messages[targetIndex].quickReply = {
        items: existingItems.concat(quickReplyItems).slice(0, 13)
      };
      return { replyToken: primary.replyToken, messages };
    }
    return {
      replyToken: primary.replyToken,
      messages: primaryMessages.slice(0, Math.max(0, 5 - secondaryMessages.length)).concat(secondaryMessages).slice(0, 5)
    };
  },

  async replyLine(replyPayload, env) {
    if (!replyPayload) return { success: true, skipped: true };
    if (!env.LINE_CHANNEL_ACCESS_TOKEN) return { success: false, error: 'Missing LINE_CHANNEL_ACCESS_TOKEN' };
    const res = await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(replyPayload)
    });
    const text = await res.text();
    if (!res.ok) return { success: false, status: res.status, error: text || `LINE Reply API HTTP ${res.status}` };
    return { success: true, status: res.status };
  },

  async pushLineMessage(userId, text, env) {
    return await this.pushLineMessages(userId, [{ type: 'text', text }], env);
  },

  normalizeOutboundMessage(item = {}) {
    const type = this.text(item.type);
    if (type === 'text') {
      const text = this.text(item.text);
      if (!text) return null;
      if (text.length > 5000) throw new Error('TEXT_TOO_LONG');
      const message = { type: 'text', text };
      if (item.quickReply && Array.isArray(item.quickReply.items) && item.quickReply.items.length) {
        message.quickReply = { items: item.quickReply.items.slice(0, 13) };
      }
      return message;
    }
    if (type === 'image') {
      const originalContentUrl = this.text(item.originalContentUrl || item.url);
      const previewImageUrl = this.text(item.previewImageUrl || item.previewUrl || originalContentUrl);
      if (!/^https:\/\//i.test(originalContentUrl) || !/^https:\/\//i.test(previewImageUrl)) return null;
      return { type: 'image', originalContentUrl, previewImageUrl };
    }
    if (type === 'flex') {
      const contents = item.contents;
      const altText = this.text(item.altText || '客服訊息').slice(0, 400) || '客服訊息';
      if (!contents || typeof contents !== 'object') return null;
      return { type: 'flex', altText, contents };
    }
    return null;
  },

  normalizeOutboundMessages(messages = []) {
    const items = (Array.isArray(messages) ? messages : [])
      .filter(item => item && typeof item === 'object')
      .slice(0, 5)
      .map(item => this.normalizeOutboundMessage(item))
      .filter(Boolean);
    if (!items.length) throw new Error('MISSING_MESSAGES');
    return items;
  },

  summarizeOutboundMessage(message = {}) {
    if (message.type === 'text') return this.text(message.text);
    if (message.type === 'image') return '客服傳送圖片';
    if (message.type === 'flex') return this.text(message.altText, '客服傳送多頁訊息');
    return '客服傳送訊息';
  },

  async pushLineMessages(userId, messages = [], env) {
    const target = this.text(userId);
    if (!target) return { success: false, error: 'Missing LINE userId' };
    const safeMessages = this.normalizeOutboundMessages(messages);
    if (!env.LINE_CHANNEL_ACCESS_TOKEN) return { success: false, error: 'Missing LINE_CHANNEL_ACCESS_TOKEN' };
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ to: target, messages: safeMessages })
    });
    const responseText = await res.text();
    if (!res.ok) return { success: false, status: res.status, error: responseText || `LINE Push API HTTP ${res.status}` };
    return { success: true, status: res.status, count: safeMessages.length };
  },

  decodeBase64DataUrl(value = '') {
    const input = this.text(value);
    if (!input) return null;
    const match = input.match(/^data:([^;,]+);base64,(.+)$/i);
    const contentType = match ? match[1] : 'application/octet-stream';
    const base64 = (match ? match[2] : input).replace(/\s+/g, '');
    if (!base64) return null;
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return { contentType, bytes };
  },

  safeAssetName(value = '') {
    return this.text(value, 'line-oa-asset')
      .replace(/[\\/:*?"<>|#%{}^~[\]`]+/g, '_')
      .replace(/\s+/g, '_')
      .slice(0, 120) || 'line-oa-asset';
  },

  async uploadAsset(payload, env) {
    if (!env.IMG_BUCKET) return { success: false, error: 'IMG_BUCKET_MISSING' };
    const decoded = this.decodeBase64DataUrl(payload.base64 || payload.dataUrl || payload.file);
    if (!decoded?.bytes?.length) return { success: false, error: 'MISSING_FILE' };
    const contentType = this.text(payload.contentType || decoded.contentType, decoded.contentType || 'application/octet-stream');
    const filename = this.safeAssetName(payload.filename || `line-oa-${Date.now()}`);
    const key = `line-oa/outbound/${Date.now()}_${filename}`;
    await env.IMG_BUCKET.put(key, decoded.bytes, { httpMetadata: { contentType } });
    const baseUrl = (env.R2_PUBLIC_URL || env.R2_WORKER_URL || 'https://pub-1e42b8765b1e4675bfb7be60f0e785ca.r2.dev').replace(/\/$/, '');
    const motherBalance = Number(wallet.data?.balance || 0) || 0;
    const localBalance = await AdminPointModule.localBalance(env, customerPointUserId).catch(() => 0);
    return {
      success: true,
      data: {
        url: `${baseUrl}/${key}`,
        key,
        filename,
        contentType,
        size: decoded.bytes.length
      }
    };
  },

  async sendReply(payload, env) {
    await this.ensure(env);
    const threadId = this.text(payload.threadId);
    const text = this.text(payload.text || payload.body || payload.message);
    const rawMessages = Array.isArray(payload.messages) ? payload.messages : [];
    const messages = rawMessages.length ? this.normalizeOutboundMessages(rawMessages) : (text ? [{ type: 'text', text }] : []);
    if (!threadId) return { success: false, error: 'Missing threadId' };
    if (!messages.length) return { success: false, error: 'Missing reply messages' };
    const thread = await D1ReadModule.first(env, 'SELECT * FROM line_oa_threads WHERE thread_id = ? LIMIT 1', [threadId]);
    if (!thread) return { success: false, error: 'Thread not found' };
    const userId = this.text(thread.user_id);
    const pushResult = await this.pushLineMessages(userId, messages, env);
    if (!pushResult.success) return pushResult;
    const now = new Date().toISOString();
    let messageId = '';
    for (const message of messages) {
      messageId = `OUT_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      await env.ACTMASTER_DB.prepare(`
        INSERT INTO line_oa_messages (
          message_id,thread_id,user_id,direction,message_type,text_content,event_type,reply_token,raw_json,media_url,media_content_type,media_size,created_at
        ) VALUES (?, ?, ?, 'outbound', ?, ?, 'admin_reply', '', ?, ?, ?, 0, ?)
      `).bind(
        messageId,
        threadId,
        userId,
        message.type || 'text',
        this.summarizeOutboundMessage(message),
        JSON.stringify({
          operatorId: this.text(payload.authenticatedUserId || payload.userId),
          source: 'admin_console',
          message
        }),
        message.type === 'image' ? message.originalContentUrl : '',
        message.type === 'image' ? 'image' : '',
        now
      ).run();
    }
    const summaryText = messages.map(message => this.summarizeOutboundMessage(message)).filter(Boolean).join('\n').slice(0, 1000);
    await env.ACTMASTER_DB.prepare(`
      UPDATE line_oa_threads
      SET last_message_text = ?, last_message_type = 'text', last_event_type = 'admin_reply',
          message_count = message_count + 1, unread_count = 0, updated_at = CURRENT_TIMESTAMP, last_event_at = ?
      WHERE thread_id = ?
    `).bind(summaryText, now, threadId).run();
    return { success: true, data: { messageId, threadId, userId, messageCount: messages.length } };
  },

  async updateThread(payload, env) {
    await this.ensure(env);
    const threadId = this.text(payload.threadId || payload.id);
    if (!threadId) return { success: false, error: 'Missing threadId' };
    const allowedStatus = new Set(['open', 'pending', 'closed']);
    const status = allowedStatus.has(this.text(payload.status)) ? this.text(payload.status) : '';
    const tags = Array.isArray(payload.tags)
      ? payload.tags.map(v => this.text(v)).filter(Boolean).slice(0, 20).join(',')
      : this.text(payload.tags);
    const note = this.text(payload.note).slice(0, 5000);
    const allowedOpportunity = new Set(['new', 'qualified', 'quoted', 'payment', 'won', 'lost']);
    const opportunityStage = allowedOpportunity.has(this.text(payload.opportunityStage)) ? this.text(payload.opportunityStage) : '';
    const opportunityValue = Math.max(0, Math.round(Number(payload.opportunityValue || 0) || 0));
    const opportunityNote = this.text(payload.opportunityNote).slice(0, 5000);
    const aiPaused = payload.aiPaused === undefined && payload.ai_paused === undefined
      ? null
      : ((payload.aiPaused ?? payload.ai_paused) === true || String(payload.aiPaused ?? payload.ai_paused) === '1' ? 1 : 0);

    const current = await D1ReadModule.first(env, 'SELECT * FROM line_oa_threads WHERE thread_id = ? LIMIT 1', [threadId]);
    if (!current) return { success: false, error: 'Thread not found' };
    await env.ACTMASTER_DB.prepare(`
      UPDATE line_oa_threads
      SET status = COALESCE(NULLIF(?, ''), status),
          tags = ?,
          note = ?,
          opportunity_stage = COALESCE(NULLIF(?, ''), opportunity_stage),
          opportunity_value = ?,
          opportunity_note = ?,
          ai_paused = COALESCE(?, ai_paused),
          unread_count = CASE WHEN ? = 'closed' THEN 0 ELSE unread_count END,
          updated_at = CURRENT_TIMESTAMP
      WHERE thread_id = ?
    `).bind(
      status,
      tags,
      note,
      opportunityStage,
      opportunityValue,
      opportunityNote,
      aiPaused,
      status,
      threadId
    ).run();
    return await this.monitor({ threadId, limit: Number(payload.limit || 30) || 30 }, env);
  },

  async forwardToSecondSystem(rawBody, signature, env) {
    const forwardUrl = this.text(env.FORWARD_WEBHOOK_URL);
    if (!forwardUrl) return { success: true, skipped: true };
    try {
      const res = await fetch(forwardUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-line-signature': signature || ''
        },
        body: rawBody
      });
      const text = await res.text();
      let data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch (e) {
        data = { rawText: text };
      }
      return { success: res.ok, status: res.status, data };
    } catch (e) {
      console.error('FORWARD_WEBHOOK_URL failed', e);
      return { success: false, error: e.message || String(e) };
    }
  },

  async saveEvent(env, event) {
    const userId = this.eventUserId(event);
    if (!userId) return null;
    const threadId = `line:${userId}`;
    const createdAt = this.eventTimestamp(event);
    const messageType = this.text(event?.message?.type || event?.type);
    const eventType = this.text(event?.type);
    const text = this.messageText(event);
    const messageId = this.messageId(event);
    const existingMessage = await D1ReadModule.first(env, 'SELECT message_id FROM line_oa_messages WHERE message_id = ? LIMIT 1', [messageId]).catch(() => null);
    if (existingMessage) return { threadId, userId, duplicate: true };
    const profile = await this.fetchProfile(env, userId);
    const displayName = profile.displayName || userId;
    const pictureUrl = profile.pictureUrl || '';
    const walletIndex = PointModule && PointModule.ensureLocalPointWalletIndexFast
      ? await PointModule.ensureLocalPointWalletIndexFast(env, userId, {
          name: displayName,
          displayName,
          industry: 'LINE OA',
          networkId: 'admin'
        }).catch(e => ({ success: false, error: e.message || String(e) }))
      : null;
    if (walletIndex && walletIndex.success === false) console.error('LINE OA point wallet index failed', walletIndex.error);

    await env.ACTMASTER_DB.prepare(`
      INSERT INTO line_oa_threads (
        thread_id,user_id,source_type,display_name,picture_url,last_message_text,last_message_type,last_event_type,
        message_count,unread_count,status,last_event_at,created_at,updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 'open', ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(thread_id) DO UPDATE SET
        display_name=CASE WHEN excluded.display_name <> '' THEN excluded.display_name ELSE line_oa_threads.display_name END,
        picture_url=CASE WHEN excluded.picture_url <> '' THEN excluded.picture_url ELSE line_oa_threads.picture_url END,
        last_message_text=excluded.last_message_text,
        last_message_type=excluded.last_message_type,
        last_event_type=excluded.last_event_type,
        message_count=line_oa_threads.message_count + 1,
        unread_count=line_oa_threads.unread_count + 1,
        status=CASE WHEN excluded.last_event_type = 'unfollow' THEN 'closed' ELSE line_oa_threads.status END,
        last_event_at=excluded.last_event_at,
        updated_at=CURRENT_TIMESTAMP
    `).bind(threadId, userId, this.text(event?.source?.type, 'user'), displayName, pictureUrl, text, messageType, eventType, createdAt, createdAt).run();

    await env.ACTMASTER_DB.prepare(`
      INSERT OR IGNORE INTO line_oa_messages (
        message_id,thread_id,user_id,direction,message_type,text_content,event_type,reply_token,raw_json,created_at
      ) VALUES (?, ?, ?, 'inbound', ?, ?, ?, ?, ?, ?)
    `).bind(
      messageId,
      threadId,
      userId,
      messageType,
      text,
      eventType,
      this.text(event?.replyToken),
      JSON.stringify(event || {}),
      createdAt
    ).run();
    return { threadId, userId };
  },

  followAwardPoints(env) {
    const raw = env.LINE_OA_FOLLOW_POINTS ?? env.POINT_FOLLOW_POINTS ?? 300;
    const points = Number(raw);
    return Number.isFinite(points) && points > 0 ? points : 0;
  },

  async ensureLineOAPointBinding(env, userId, profile = {}) {
    const lineId = this.text(userId);
    if (!lineId || !env.ACTMASTER_DB) return { success: false, error: 'Missing LINE user id' };
    await D1WriteModule.upsertUser({
      userId: lineId,
      name: this.text(profile.displayName || profile.name),
      role: 'user'
    }, env);
    const motherMember = await PointModule.ensureMotherLineMember({
      userId: lineId,
      LINE_user_id: lineId,
      displayName: this.text(profile.displayName || profile.name),
      pictureUrl: this.text(profile.pictureUrl || profile.picture_url),
      statusMessage: this.text(profile.statusMessage || profile.status_message)
    }, env).catch(e => ({ success: false, error: e && e.message ? e.message : String(e) }));
    const wallet = await PointModule.queryPointBalanceFast({
      pointUserId: lineId,
      point_type: 'gift_money',
      page: 1,
      per_page: 20
    }, env).catch(e => ({ success: false, error: e.message || String(e) }));
    const pointVerified = !!(wallet && wallet.success);
    if (pointVerified) {
      await env.ACTMASTER_DB.prepare(`
        UPDATE users
        SET point_line_id = COALESCE(NULLIF(point_line_id, ''), ?),
            identity_source = COALESCE(NULLIF(identity_source, ''), 'line_oa_follow'),
            migrated_at = COALESCE(migrated_at, CURRENT_TIMESTAMP)
        WHERE line_id = ? OR row_id = ? OR point_line_id = ? OR legacy_line_id = ?
      `).bind(lineId, lineId, lineId, lineId, lineId).run();
    } else {
      await env.ACTMASTER_DB.prepare(`
        UPDATE users
        SET identity_source = COALESCE(NULLIF(identity_source, ''), 'line_oa_follow_unverified')
        WHERE line_id = ? OR row_id = ?
      `).bind(lineId, lineId).run();
    }
    await D1WriteModule.clearUserCache(env, lineId).catch(() => null);
    const user = await D1ReadModule.first(env, `
      SELECT * FROM users
      WHERE line_id = ? OR row_id = ? OR point_line_id = ? OR legacy_line_id = ?
      LIMIT 1
    `, [lineId, lineId, lineId, lineId]).catch(() => null);
    const crmPlaceholder = user
      ? await D1WriteModule.ensureReferralPlaceholderCard(env, {
          ...user,
          referrer_id: D1ReadModule.text(user.referrer_id) || 'admin',
          source_type: 'line_oa_follow',
          crm_status: '已加好友未建名片',
          crm_type: 'LINE 加好友',
          notes: 'LINE 加好友後自動建立；待本人建立正式名片。'
        }).catch(e => ({ success: false, error: e && e.message ? e.message : String(e) }))
      : null;
    return {
      success: true,
      data: {
        lineUserId: lineId,
        pointUserId: D1ReadModule.text(user && user.point_line_id) || lineId,
        pointVerified,
        wallet,
        motherMember,
        crmPlaceholder,
        user: user ? D1ReadModule.userRow(user, 'line_oa_follow') : null
      }
    };
  },

  async awardLineOAFollowPoints(env, userId, createdAt = '') {
    const lineId = this.text(userId);
    if (!lineId || !env.ACTMASTER_DB) return { awarded: false, reason: 'missing_user' };
    const points = this.followAwardPoints(env);
    if (!points) return { awarded: false, reason: 'disabled' };
    await PointModule.ensureAwardTable(env);
    const pointUserId = await PointModule.resolvePointUserId(env, lineId).catch(() => lineId);
    const awardId = 'AWD_LINE_OA_FOLLOW_' + pointUserId;
    const awardType = 'line_oa_follow';
    const cardId = 'line_oa_follow';
    const eventName = 'LINE OA follow reward';
    const eventContent = 'Official account follow onboarding reward';
    const existing = await D1ReadModule.first(env, `
      SELECT * FROM point_awards
      WHERE user_id = ? AND card_id = ? AND award_type = ?
      LIMIT 1
    `, [pointUserId, cardId, awardType]).catch(() => null);
    if (existing && ['sent', 'local_sent'].includes(this.text(existing.status))) {
      return { awarded: false, reason: 'already_awarded', pointUserId };
    }
    if (!existing) {
      const inserted = await env.ACTMASTER_DB.prepare(`
        INSERT OR IGNORE INTO point_awards (award_id,user_id,card_id,award_type,points,point_type,status,response_json,updated_at)
        VALUES (?, ?, ?, ?, ?, 'gift_money', 'pending', '{}', CURRENT_TIMESTAMP)
      `).bind(awardId, pointUserId, cardId, awardType, points).run();
      if (!inserted || !inserted.meta || Number(inserted.meta.changes || 0) === 0) {
        return { awarded: false, reason: 'already_recorded', pointUserId };
      }
    }
    const motherMember = await PointModule.ensureMotherLineMember({
      userId: lineId,
      LINE_user_id: lineId
    }, env).catch(e => ({ success: false, error: e && e.message ? e.message : String(e), lineUserId: lineId }));

    let result = null;
    if (motherMember && motherMember.success === false) {
      result = { success: false, error: motherMember.error || 'Mother member creation failed', motherMember };
    } else {
      result = await PointModule.insertUserPoint({
        userId: pointUserId,
        points,
        pointType: 'gift_money',
        eventName,
        eventContent,
        shop_remark: ['line_oa_follow', createdAt || new Date().toISOString()].join(';')
      }, env).catch(e => ({ success: false, error: e.message || 'Point API failed' }));
      result.motherMember = motherMember;
    }
    let status = result && result.success ? 'sent' : 'pending_sync';
    let syncJob = null;
    if (status === 'pending_sync') {
      syncJob = await PointSyncModule.enqueue({
        jobId: `PSJ_LINE_OA_FOLLOW_${pointUserId}`,
        lineUserId: pointUserId,
        source: 'line_oa_follow',
        sourceRef: awardId,
        points,
        pointType: 'gift_money',
        createdBy: 'system',
        payload: { lineUserId: lineId, pointUserId, createdAt, motherResult: result }
      }, env).catch(e => ({ success: false, error: e && e.message ? e.message : String(e) }));
    }
    await env.ACTMASTER_DB.prepare(`
      UPDATE point_awards
      SET status = ?, response_json = ?, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND card_id = ? AND award_type = ?
    `).bind(
      status,
      JSON.stringify({ result, syncJob, lineUserId: lineId, pointUserId, createdAt, sourceOfTruth: 'mother' }),
      pointUserId,
      cardId,
      awardType
    ).run();
    if (status === 'sent') return { awarded: true, points, pointUserId, source: 'mother', response: result.data };
    return { awarded: false, points, pointUserId, source: 'mother_pending', syncJob, error: (result && result.error) || 'Point award queued for mother sync' };
  },

  async handleFollowPointOnboarding(env, event) {
    const userId = this.eventUserId(event);
    if (!env.ACTMASTER_DB || !userId || event?.type !== 'follow' || !userId.startsWith('U')) {
      return { success: true, skipped: true };
    }
    const profile = await this.fetchProfile(env, userId).catch(() => ({}));
    const binding = await this.ensureLineOAPointBinding(env, userId, profile);
    const award = await this.awardLineOAFollowPoints(env, userId, this.eventTimestamp(event));
    return {
      success: binding.success !== false && !award.error,
      data: { userId, binding, award }
    };
  },

  async followPointOnboardingJob(env, events) {
    const follows = (Array.isArray(events) ? events : []).filter(event => event && event.type === 'follow');
    if (!follows.length) return { success: true, skipped: true };
    const results = [];
    for (const event of follows) {
      results.push(await this.handleFollowPointOnboarding(env, event).catch(e => ({
        success: false,
        error: e.message || String(e)
      })));
    }
    return { success: results.every(item => item && item.success !== false), data: { results } };
  },

  async repairFollowPointOnboarding(payload, env) {
    if (!env.ACTMASTER_DB) return { success: false, error: 'Missing ACTMASTER_DB binding' };
    const raw = this.text(payload.userId || payload.lineUserId || payload.customerId || payload.query || payload.keyword);
    if (!raw) return { success: false, error: 'Missing userId or query' };
    let userId = raw;
    if (!/^U[0-9a-fA-F]{20,64}$/.test(raw)) {
      const found = await PointModule.findStorePointCustomerCandidates(env, raw).catch(() => ({ matches: [] }));
      const matches = Array.isArray(found && found.matches) ? found.matches.filter(item => this.text(item && item.id)) : [];
      if (matches.length !== 1) {
        return {
          success: false,
          needsSelection: matches.length > 1,
          error: matches.length ? 'Multiple customers matched' : 'Customer not found',
          data: { candidates: matches }
        };
      }
      userId = this.text(matches[0].id);
    }
    const profile = await this.fetchProfile(env, userId).catch(() => ({}));
    const binding = await this.ensureLineOAPointBinding(env, userId, profile);
    const award = await this.awardLineOAFollowPoints(env, userId, this.text(payload.createdAt) || new Date().toISOString());
    return {
      success: binding.success !== false && !award.error,
      data: { userId, binding, award }
    };
  },

  async repairRecentFollowPointAwards(payload, env) {
    if (!env.ACTMASTER_DB) return { success: false, error: 'Missing ACTMASTER_DB binding' };
    const limit = Math.min(100, Math.max(1, Math.floor(Number(payload.limit || 20))));
    const requestedUserId = this.text(payload.userId || payload.lineUserId || payload.customerId || '');
    await PointModule.ensureAwardTable(env);
    const whereUser = requestedUserId ? 'AND m.user_id = ?' : '';
    const binds = requestedUserId ? [requestedUserId, limit] : [limit];
    const rows = await D1ReadModule.all(env, `
      SELECT m.user_id, MIN(m.created_at) AS follow_at
      FROM line_oa_messages m
      LEFT JOIN point_awards a
       ON a.user_id = m.user_id
       AND a.card_id = 'line_oa_follow'
       AND a.award_type = 'line_oa_follow'
       AND a.status IN ('sent', 'local_sent')
      WHERE m.event_type = 'follow'
        AND m.user_id <> ''
        AND a.award_id IS NULL
        ${whereUser}
      GROUP BY m.user_id
      ORDER BY follow_at DESC
      LIMIT ?
    `, binds).catch(() => []);
    const results = [];
    for (const row of rows) {
      const userId = this.text(row.user_id);
      if (!userId) continue;
      const profile = await this.fetchProfile(env, userId).catch(() => ({}));
      const binding = await this.ensureLineOAPointBinding(env, userId, profile).catch(e => ({ success: false, error: e.message || String(e) }));
      const award = await this.awardLineOAFollowPoints(env, userId, this.text(row.follow_at) || new Date().toISOString()).catch(e => ({
        awarded: false,
        error: e.message || String(e)
      }));
      results.push({ userId, followAt: this.text(row.follow_at), binding, award });
    }
    return {
      success: true,
      data: {
        requestedUserId,
        scanned: rows.length,
        results
      }
    };
  },

  async handleWebhook(request, env, ctx) {
    const rawBody = await request.text();
    const signature = request.headers.get('x-line-signature') || '';
    const body = JSON.parse(rawBody || '{}');
    const events = Array.isArray(body.events) ? body.events : [];
    const ok = await this.verifySignature(rawBody, signature, env);
    if (!ok && events.length > 0) return new Response('Invalid LINE signature', { status: 401 });
    if (!ok && events.length === 0) return new Response('OK', { status: 200 });
    await this.ensure(env);
    const saveJob = Promise.all(events.map(event => this.saveEvent(env, event).catch(e => console.error('LINE OA event save failed', e))));
    const followPointJob = this.followPointOnboardingJob(env, events).catch(e => console.error('LINE OA follow point onboarding failed', e));
    const forwardJob = this.forwardToSecondSystem(rawBody, signature, env);
    if (ctx && typeof ctx.waitUntil === 'function') {
      ctx.waitUntil(saveJob);
      ctx.waitUntil(followPointJob);
      ctx.waitUntil(forwardJob);
    } else {
      await saveJob;
      await followPointJob;
      await forwardJob;
    }
    const myVideoReplied = await LineOAMyVideoKeywordModule.reply(events, env, ctx);
    if (myVideoReplied) return new Response('OK', { status: 200 });
    const cardCoolReplied = await LineOACardCoolKeywordModule.reply(events, env, ctx);
    if (cardCoolReplied) return new Response('OK', { status: 200 });
    const simpleMyCardReplied = await this.replySimpleMyCard(events, env);
    if (simpleMyCardReplied) return new Response('OK', { status: 200 });
    const referralFriendReplied = await ReferralFriendKeywordModule.reply(events, env);
    if (referralFriendReplied) return new Response('OK', { status: 200 });
    const storeSearchReplied = await LineOAStoreSearchKeywordModule.reply(events, env);
    if (storeSearchReplied) return new Response('OK', { status: 200 });
    const keywordRuleReply = await LineOAKeywordRuleModule.replyPayload(events, env);
    const keywordAttachOnly = keywordRuleReply?.mode === 'attach_only';
    if (keywordRuleReply) {
      const forwardResult = await forwardJob.catch(e => ({ success: false, error: e.message || String(e) }));
      const forwardReplyPayload = forwardResult && forwardResult.success
        ? this.normalizeReplyPayload(forwardResult.data)
        : null;
      if (forwardReplyPayload) {
        const replyResult = await this.replyLine(this.mergeReplyPayloads(forwardReplyPayload, keywordRuleReply), env);
        if (!replyResult.success) console.error('LINE forward reply merge failed', replyResult);
        return new Response('OK', { status: 200 });
      }
    }
    const gasRawBody = keywordRuleReply ? rawBody : await this.filterAutoReplyPayload(rawBody, events, env);
    if (!gasRawBody) {
      if (keywordRuleReply && !keywordAttachOnly) {
        const replyResult = await this.replyLine(keywordRuleReply, env);
        if (!replyResult.success) console.error('LINE OA keyword rule reply failed', replyResult);
      } else if (keywordRuleReply) {
        console.warn('LINE OA keyword rule skipped because no mother reply payload is available');
      }
      return new Response('OK', { status: 200 });
    }
    const gasResult = await this.forwardToGas(gasRawBody, env);
    if (gasResult.success) {
      const replyPayload = this.normalizeReplyPayload(gasResult.data);
      if (replyPayload) {
        const replyResult = await this.replyLine(this.mergeReplyPayloads(replyPayload, keywordRuleReply), env);
        if (!replyResult.success) console.error('LINE Reply API failed', replyResult);
      } else if (keywordRuleReply && !keywordAttachOnly) {
        const replyResult = await this.replyLine(keywordRuleReply, env);
        if (!replyResult.success) console.error('LINE OA keyword rule reply failed', replyResult);
      } else if (keywordRuleReply) {
        console.warn('LINE OA keyword rule skipped because GAS returned no replyPayload; avoid consuming mother-site replyToken');
      }
    } else if (!gasResult.skipped) {
      console.error('GAS LINE_WEBHOOK failed', gasResult);
    } else if (keywordRuleReply && !keywordAttachOnly) {
      const replyResult = await this.replyLine(keywordRuleReply, env);
      if (!replyResult.success) console.error('LINE OA keyword rule reply failed', replyResult);
    } else if (keywordRuleReply) {
      console.warn('LINE OA keyword rule skipped because GAS is not configured; avoid consuming mother-site replyToken');
    }
    return new Response('OK', { status: 200 });
  },

  async isAiPaused(env, threadId) {
    if (!env.ACTMASTER_DB || !threadId) return false;
    await this.ensure(env);
    const row = await D1ReadModule.first(env, 'SELECT ai_paused FROM line_oa_threads WHERE thread_id = ? LIMIT 1', [threadId]).catch(() => null);
    return Number(row?.ai_paused || 0) === 1;
  },

  async filterAutoReplyPayload(rawBody, events, env) {
    if (!Array.isArray(events) || !events.length || !env.ACTMASTER_DB) return rawBody;
    const activeEvents = [];
    for (const event of events) {
      const userId = this.eventUserId(event);
      const threadId = userId ? `line:${userId}` : '';
      const paused = await this.isAiPaused(env, threadId);
      if (!paused) activeEvents.push(event);
    }
    if (!activeEvents.length) return '';
    if (activeEvents.length === events.length) return rawBody;
    const body = JSON.parse(rawBody || '{}');
    return JSON.stringify({ ...body, events: activeEvents });
  },

  async hubTest(env) {
    const gasUrl = this.text(env.GAS_URL || env.GAS_WEBAPP_URL);
    const forwardUrl = this.text(env.FORWARD_WEBHOOK_URL);
    const checks = {
      gas: { configured: !!gasUrl, ok: false, status: 0 },
      forward: { configured: !!forwardUrl, ok: false, status: 0 },
      secret: { configured: !!env.LINE_CHANNEL_SECRET, ok: !!env.LINE_CHANNEL_SECRET, status: 0 },
      line: { configured: !!env.LINE_CHANNEL_ACCESS_TOKEN, ok: false, status: 0, botName: '' }
    };
    if (gasUrl) {
      try {
        const res = await fetch(gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'PING', payload: { source: 'hub-test' } })
        });
        checks.gas.status = res.status;
        checks.gas.ok = res.ok || res.status < 500;
      } catch (e) {
        checks.gas.error = e.message || String(e);
      }
    }
    if (forwardUrl) {
      try {
        const res = await fetch(forwardUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-line-signature': 'hub-test' },
          body: JSON.stringify({ events: [], source: 'hub-test' })
        });
        checks.forward.status = res.status;
        checks.forward.ok = res.status < 500;
      } catch (e) {
        checks.forward.error = e.message || String(e);
      }
    }
    if (env.LINE_CHANNEL_ACCESS_TOKEN) {
      try {
        const res = await fetch('https://api.line.me/v2/bot/info', {
          headers: { Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` }
        });
        checks.line.status = res.status;
        checks.line.ok = res.ok;
        if (res.ok) {
          const data = await res.json();
          checks.line.botName = this.text(data.displayName || data.basicId);
        }
      } catch (e) {
        checks.line.error = e.message || String(e);
      }
    }
    const row = (label, item) => {
      const mark = item.ok ? 'OK' : (item.configured ? 'CHECK' : 'MISSING');
      const color = item.ok ? '#047857' : (item.configured ? '#b45309' : '#b91c1c');
      return `<tr><td>${label}</td><td style="color:${color};font-weight:800">${mark}</td><td>${item.status || '-'}</td><td>${item.botName || item.error || ''}</td></tr>`;
    };
    return new Response(`<!doctype html><meta charset="utf-8"><title>LINE Hub Test</title>
      <body style="font-family:system-ui;padding:32px;background:#f8fafc;color:#0f172a">
      <h1>雙 Webhook 診斷</h1>
      <p>Webhook URL: <code>https://line-engine.fangwl591021.workers.dev/line-webhook</code></p>
      <table cellpadding="10" cellspacing="0" style="background:white;border-collapse:collapse;border:1px solid #e2e8f0">
      <tr><th align="left">節點</th><th align="left">狀態</th><th align="left">HTTP</th><th align="left">備註</th></tr>
      ${row('GAS_URL（舊 GAS 相容，選填）', checks.gas)}${row('FORWARD_WEBHOOK_URL（選填）', checks.forward)}${row('LINE_CHANNEL_SECRET', checks.secret)}${row('LINE_CHANNEL_ACCESS_TOKEN', checks.line)}
      </table></body>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  },

  async monitor(payload, env) {
    await this.ensure(env);
    const limit = Math.min(Math.max(Number(payload.limit || 30) || 30, 1), 100);
    const threadId = this.text(payload.threadId);
    const summary = await D1ReadModule.first(env, `
      SELECT
        COUNT(*) AS threads,
        COALESCE(SUM(message_count), 0) AS messages,
        COALESCE(SUM(unread_count), 0) AS unread,
        SUM(CASE WHEN last_event_at >= datetime('now', '-1 day') THEN 1 ELSE 0 END) AS active24h
      FROM line_oa_threads
    `, []);
    const threads = await D1ReadModule.all(env, `
      SELECT thread_id,user_id,source_type,display_name,picture_url,last_message_text,last_message_type,last_event_type,
             message_count,unread_count,status,tags,note,opportunity_stage,opportunity_value,opportunity_note,ai_paused,last_event_at,updated_at
      FROM line_oa_threads
      ORDER BY COALESCE(NULLIF(last_event_at, ''), updated_at) DESC
      LIMIT ?
    `, [limit]);
    const enrichedThreads = threads.map(row => ({ ...row, risk: this.riskLevel(row) }));
    const selectedThreadId = threadId || (threads[0] && threads[0].thread_id) || '';
    const messages = selectedThreadId
      ? await D1ReadModule.all(env, `
          SELECT message_id,thread_id,user_id,direction,message_type,text_content,event_type,created_at
          FROM line_oa_messages
          WHERE thread_id = ?
          ORDER BY created_at DESC
          LIMIT 80
        `, [selectedThreadId])
      : [];
    return {
      success: true,
      data: {
        summary: {
          threads: Number(summary?.threads || 0),
          messages: Number(summary?.messages || 0),
          unread: Number(summary?.unread || 0),
          active24h: Number(summary?.active24h || 0)
        },
        threads: enrichedThreads,
        selectedThreadId,
        messages: messages.reverse()
      }
    };
  },

  splitList(value) {
    return this.text(value).split(',').map(item => this.text(item)).filter(Boolean);
  },

  audienceInterestBuckets() {
    return [
      { key: 'points', label: '點數/贈點', keywords: ['點數', '贈點', '簽到', '入帳', '折抵', '扣點'] },
      { key: 'card', label: '名片/掃描', keywords: ['名片', '掃描', 'QR', 'QRCode', '個人專屬連結'] },
      { key: 'share', label: '分享/導流', keywords: ['分享', '轉發', '連結', '好友', '邀請'] },
      { key: 'match', label: 'AI 配對', keywords: ['AI', '配對', '媒合', '公開交流池', '名片池'] },
      { key: 'crm', label: 'CRM/商機', keywords: ['CRM', '客戶', '商機', '報價', '合作', '付款'] },
      { key: 'lineoa', label: 'LINE OA 設定', keywords: ['LINE', 'OA', '圖文選單', 'webhook', 'LIFF'] },
      { key: 'support', label: '客服/異常', keywords: ['客服', '沒同步', '失敗', '錯誤', '無法', 'Bad Request', 'Unauthorized'] }
    ];
  },

  async pointAudience(env) {
    const empty = { claimedNotDeducted: [], summary: { claimedNotDeducted: 0 } };
    if (!env.ACTMASTER_DB) return empty;
    try {
      const rows = await D1ReadModule.all(env, `
        SELECT
          pa.user_id AS user_id,
          COALESCE(NULLIF(u.name, ''), NULLIF(u.line_id, ''), pa.user_id) AS display_name,
          COALESCE(NULLIF(u.point_line_id, ''), pa.user_id) AS point_user_id,
          COUNT(*) AS award_count,
          COALESCE(SUM(pa.points), 0) AS award_points,
          MAX(pa.created_at) AS last_award_at
        FROM point_awards pa
        LEFT JOIN users u
          ON u.line_id = pa.user_id
          OR u.row_id = pa.user_id
          OR u.point_line_id = pa.user_id
          OR u.legacy_line_id = pa.user_id
        WHERE CAST(pa.points AS REAL) > 0
          AND COALESCE(pa.status, '') IN ('success', 'awarded', 'completed', 'pending')
          AND NOT EXISTS (
            SELECT 1
            FROM store_point_cashier_logs logs
            WHERE (logs.customer_point_user_id = pa.user_id OR logs.customer_user_id = pa.user_id)
              AND CAST(logs.points AS REAL) < 0
          )
        GROUP BY pa.user_id, display_name, point_user_id
        ORDER BY last_award_at DESC
        LIMIT 30
      `, []);
      const claimedNotDeducted = rows.map(row => ({
        userId: this.text(row.user_id),
        name: this.text(row.display_name, row.user_id || '未命名會員'),
        pointUserId: this.text(row.point_user_id || row.user_id),
        awardCount: Number(row.award_count || 0),
        awardPoints: Number(row.award_points || 0),
        lastAwardAt: row.last_award_at || ''
      }));
      return {
        claimedNotDeducted,
        summary: { claimedNotDeducted: claimedNotDeducted.length }
      };
    } catch (e) {
      return { ...empty, error: this.text(e?.message || e) };
    }
  },

  async audience(payload, env) {
    await this.ensure(env);
    const limit = Math.min(Math.max(Number(payload.limit || 500) || 500, 1), 1000);
    const rows = await D1ReadModule.all(env, `
      SELECT thread_id,user_id,source_type,display_name,picture_url,last_message_text,last_message_type,last_event_type,
             message_count,unread_count,status,tags,note,opportunity_stage,opportunity_value,opportunity_note,ai_paused,last_event_at,updated_at
      FROM line_oa_threads
      ORDER BY COALESCE(NULLIF(last_event_at, ''), updated_at) DESC
      LIMIT ?
    `, [limit]);
    const messages7d = await D1ReadModule.first(env, `
      SELECT COUNT(*) AS count
      FROM line_oa_messages
      WHERE created_at >= datetime('now', '-7 days')
    `, []).catch(() => ({ count: 0 }));
    const buckets = this.audienceInterestBuckets().map(bucket => ({ ...bucket, count: 0 }));
    const tagCounts = {};
    const statusCounts = {};
    const riskCounts = {};
    const riskThreads = [];
    for (const row of rows) {
      const risk = this.riskLevel(row);
      riskCounts[risk] = (riskCounts[risk] || 0) + 1;
      statusCounts[row.status || 'open'] = (statusCounts[row.status || 'open'] || 0) + 1;
      const tags = this.splitList(row.tags);
      tags.forEach(tag => { tagCounts[tag] = (tagCounts[tag] || 0) + 1; });
      const blob = [row.display_name, row.last_message_text, row.tags, row.note, row.opportunity_note].map(v => this.text(v)).join('\n');
      buckets.forEach(bucket => {
        if (bucket.keywords.some(keyword => blob.includes(keyword))) bucket.count += 1;
      });
      if (risk === 'high' || risk === 'medium' || Number(row.unread_count || 0) > 0 || Number(row.ai_paused || 0) === 1) {
        riskThreads.push({
          id: row.thread_id || '',
          threadId: row.thread_id || '',
          userId: row.user_id || '',
          name: row.display_name || row.user_id || '未命名客戶',
          pictureUrl: row.picture_url || '',
          risk,
          status: row.status || 'open',
          unread: Number(row.unread_count || 0),
          aiPaused: Number(row.ai_paused || 0) === 1,
          summary: row.last_message_text || '',
          tags,
          lastMessageAt: row.last_event_at || row.updated_at || ''
        });
      }
    }
    const pointAudience = await this.pointAudience(env);
    return {
      success: true,
      data: {
        generatedAt: new Date().toISOString(),
        overview: {
          totalThreads: rows.length,
          activeThreads24h: rows.filter(row => Date.parse(row.last_event_at || row.updated_at || '') >= Date.now() - 24 * 60 * 60 * 1000).length,
          activeThreads7d: rows.filter(row => Date.parse(row.last_event_at || row.updated_at || '') >= Date.now() - 7 * 24 * 60 * 60 * 1000).length,
          activeThreads30d: rows.filter(row => Date.parse(row.last_event_at || row.updated_at || '') >= Date.now() - 30 * 24 * 60 * 60 * 1000).length,
          messages7d: Number(messages7d?.count || 0),
          unreadMessages: rows.reduce((sum, row) => sum + Number(row.unread_count || 0), 0),
          highRiskThreads: riskCounts.high || 0,
          mediumRiskThreads: riskCounts.medium || 0,
          aiPausedThreads: rows.filter(row => Number(row.ai_paused || 0) === 1).length,
          claimedNotDeducted: pointAudience.summary.claimedNotDeducted || 0
        },
        statusCounts,
        riskCounts,
        interests: buckets
          .map(({ key, label, count }) => ({ key, label, count }))
          .sort((a, b) => b.count - a.count),
        tags: Object.entries(tagCounts)
          .map(([label, count]) => ({ label, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 20),
        riskThreads: riskThreads
          .sort((a, b) => Number(b.unread || 0) - Number(a.unread || 0) || String(b.lastMessageAt || '').localeCompare(String(a.lastMessageAt || '')))
          .slice(0, 30),
        pointAudience
      }
    };
  },

  riskLevel(row) {
    const blob = [row.last_message_text, row.tags, row.note, row.opportunity_note].map(v => this.text(v)).join('\n');
    if (/(退費|生氣|投訴|詐騙|不能用|沒同步|未入帳|客服|緊急|失敗|錯誤|無法)/.test(blob)) return 'high';
    if (/(點數|贈點|簽到|名片|加入好友|合作|報價|付款|需求)/.test(blob)) return 'medium';
    return 'low';
  },

  visitorRecordsFromThread(row) {
    const records = [];
    const note = this.text(row.note);
    note.split(/\r?\n/).map(line => this.text(line)).filter(Boolean).forEach((line, index) => {
      const important = line.startsWith('[重要]');
      const content = important ? this.text(line.replace(/^\[重要\]\s*/, '')) : line;
      if (!content) return;
      records.push({
        id: `${row.thread_id || row.user_id || 'thread'}:note:${index}`,
        category: important ? '重要紀錄' : '備註',
        content,
        status: important ? 'follow_up' : 'open',
        priority: important ? 'high' : 'normal',
        createdAt: row.updated_at || row.last_event_at || ''
      });
    });
    const opportunityNote = this.text(row.opportunity_note);
    if (opportunityNote) {
      records.unshift({
        id: `${row.thread_id || row.user_id || 'thread'}:opportunity`,
        category: '商機',
        content: opportunityNote,
        status: ['won', 'lost'].includes(this.text(row.opportunity_stage)) ? 'done' : 'follow_up',
        priority: Number(row.opportunity_value || 0) > 0 ? 'high' : 'normal',
        createdAt: row.updated_at || row.last_event_at || ''
      });
    }
    return records;
  },

  crmThreadRow(row) {
    const records = this.visitorRecordsFromThread(row);
    const tags = this.splitList(row.tags);
    const risk = this.riskLevel(row);
    return {
      id: row.thread_id || '',
      threadId: row.thread_id || '',
      userId: row.user_id || '',
      name: row.display_name || row.user_id || '未命名客戶',
      pictureUrl: row.picture_url || '',
      status: row.status || 'open',
      risk,
      summary: row.last_message_text || '',
      lastMessageType: row.last_message_type || '',
      tags,
      note: row.note || '',
      unread: Number(row.unread_count || 0),
      messageCount: Number(row.message_count || 0),
      lastMessageAt: row.last_event_at || row.updated_at || '',
      opportunityStage: row.opportunity_stage || 'new',
      opportunityValue: Number(row.opportunity_value || 0),
      opportunityNote: row.opportunity_note || '',
      aiPaused: Number(row.ai_paused || 0) === 1,
      visitorRecords: records
    };
  },

  async crm(payload, env) {
    await this.ensure(env);
    const limit = Math.min(Math.max(Number(payload.limit || 300) || 300, 1), 500);
    const rows = await D1ReadModule.all(env, `
      SELECT thread_id,user_id,source_type,display_name,picture_url,last_message_text,last_message_type,last_event_type,
             message_count,unread_count,status,tags,note,opportunity_stage,opportunity_value,opportunity_note,ai_paused,last_event_at,updated_at
      FROM line_oa_threads
      ORDER BY COALESCE(NULLIF(last_event_at, ''), updated_at) DESC
      LIMIT ?
    `, [limit]);
    const data = rows.map(row => this.crmThreadRow(row));
    const summary = {
      customers: data.length,
      records: data.reduce((sum, item) => sum + item.visitorRecords.length, 0),
      unread: data.reduce((sum, item) => sum + Number(item.unread || 0), 0),
      highRisk: data.filter(item => item.risk === 'high' || item.visitorRecords.some(record => record.priority === 'high')).length
    };
    return { success: true, data, summary };
  },

  async monitorPage() {
    const source = 'https://raw.githubusercontent.com/fangwl591021/LINE-/691416b/lineoa-monitor.html';
    try {
      const res = await fetch(source, {
        headers: { 'User-Agent': 'line-engine-monitor-page/1.0' },
        cf: { cacheTtl: 60, cacheEverything: true }
      });
      if (!res.ok) throw new Error(`source ${res.status}`);
      const html = await res.text();
      return new Response(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*'
        }
      });
    } catch (e) {
      return new Response(`<!doctype html><meta charset="utf-8"><title>LINE OA Monitor</title><body style="font-family:system-ui;padding:32px"><h1>LINE OA 聊天室監控</h1><p>監控頁暫時無法載入，請稍後重新整理。</p><pre>${String(e?.message || e)}</pre></body>`, {
        status: 502,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }
  },

  async crmPage() {
    const source = 'https://raw.githubusercontent.com/fangwl591021/LINE-/853ff82/lineoa-crm.html';
    try {
      const res = await fetch(source, {
        headers: { 'User-Agent': 'line-engine-crm-page/1.0' },
        cf: { cacheTtl: 60, cacheEverything: true }
      });
      if (!res.ok) throw new Error(`source ${res.status}`);
      const html = await res.text();
      return new Response(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*'
        }
      });
    } catch (e) {
      return new Response(`<!doctype html><meta charset="utf-8"><title>LINE OA CRM</title><body style="font-family:system-ui;padding:32px"><h1>LINE OA CRM 載入失敗</h1><pre>${String(e?.message || e)}</pre></body>`, {
        status: 502,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }
  }
};

const LineOAKeywordRuleModule = {
  text(value, fallback = '') {
    const next = String(value ?? '').trim();
    return next || fallback;
  },

  normalizeText(value) {
    return this.text(value).replace(/\s+/g, '').toLowerCase();
  },

  async ensure(env) {
    await LineOAChatModule.ensure(env);
  },

  createId() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
      return 'kw_' + globalThis.crypto.randomUUID().replace(/-/g, '');
    }
    return 'kw_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  },

  sanitizeRule(payload = {}) {
    const rawResponseType = this.text(payload.responseType || payload.response_type, 'quick_reply');
    const responseType = rawResponseType === 'flex' ? 'flex' : 'quick_reply';
    const matchType = this.text(payload.matchType || payload.match_type, 'contains') === 'exact' ? 'exact' : 'contains';
    const responseMode = this.text(payload.responseMode || payload.response_mode, 'standalone') === 'attach_only' ? 'attach_only' : 'standalone';
    return {
      ruleId: this.text(payload.ruleId || payload.rule_id) || this.createId(),
      name: this.text(payload.name).slice(0, 80),
      keyword: this.text(payload.keyword).slice(0, 80),
      matchType,
      responseMode,
      responseType,
      textContent: this.text(payload.textContent || payload.text_content).slice(0, 2000),
      flexTitle: this.text(payload.flexTitle || payload.flex_title || payload.name).slice(0, 80),
      flexLabel: this.text(payload.flexLabel || payload.flex_label).slice(0, 120),
      flexButtonText: this.text(payload.flexButtonText || payload.flex_button_text).slice(0, 40),
      flexButtonKeyword: this.text(payload.flexButtonKeyword || payload.flex_button_keyword).slice(0, 80),
      flexAltText: this.text(payload.flexAltText || payload.flex_alt_text).slice(0, 200),
      flexJson: this.text(payload.flexJson || payload.flex_json).slice(0, 12000),
      enabled: Number(payload.enabled ?? 1) ? 1 : 0,
      priority: Math.max(0, Math.min(9999, Number(payload.priority ?? 100) || 100))
    };
  },

  mapRow(row = {}) {
    return {
      ruleId: row.rule_id,
      name: row.name,
      keyword: row.keyword,
      matchType: row.match_type,
      responseMode: row.response_mode || 'standalone',
      responseType: row.response_type,
      textContent: row.text_content,
      flexTitle: row.flex_title,
      flexLabel: row.flex_label,
      flexButtonText: row.flex_button_text,
      flexButtonKeyword: row.flex_button_keyword,
      flexAltText: row.flex_alt_text,
      flexJson: row.flex_json || '',
      enabled: Number(row.enabled || 0),
      priority: Number(row.priority || 100),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  },

  async list(payload, env) {
    await this.ensure(env);
    const rows = await D1ReadModule.all(env, `
      SELECT *
      FROM line_oa_keyword_rules
      ORDER BY enabled DESC, priority ASC, datetime(updated_at) DESC
      LIMIT 300
    `);
    return { success: true, data: { rules: rows.map(row => this.mapRow(row)) } };
  },

  async save(payload, env) {
    await this.ensure(env);
    const rule = this.sanitizeRule(payload || {});
    if (!rule.name) return { success: false, error: 'Missing rule name' };
    if (!rule.keyword) return { success: false, error: 'Missing keyword' };
    if (rule.responseType === 'quick_reply' && !rule.textContent && !rule.flexLabel && !rule.flexButtonKeyword) return { success: false, error: 'Missing quick reply label' };
    if (rule.responseType === 'flex' && rule.flexJson) {
      try { JSON.parse(rule.flexJson); } catch (e) {
        return { success: false, error: `Invalid Flex JSON: ${e.message}` };
      }
    }
    if (rule.responseType === 'flex' && !rule.flexJson && !rule.flexLabel && !rule.flexButtonKeyword) return { success: false, error: 'Missing Flex JSON, label, or button keyword' };
    await env.ACTMASTER_DB.prepare(`
      INSERT INTO line_oa_keyword_rules (
        rule_id,name,keyword,match_type,response_mode,response_type,text_content,flex_title,flex_label,
        flex_button_text,flex_button_keyword,flex_alt_text,flex_json,enabled,priority,created_at,updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(rule_id) DO UPDATE SET
        name=excluded.name,
        keyword=excluded.keyword,
        match_type=excluded.match_type,
        response_mode=excluded.response_mode,
        response_type=excluded.response_type,
        text_content=excluded.text_content,
        flex_title=excluded.flex_title,
        flex_label=excluded.flex_label,
        flex_button_text=excluded.flex_button_text,
        flex_button_keyword=excluded.flex_button_keyword,
        flex_alt_text=excluded.flex_alt_text,
        flex_json=excluded.flex_json,
        enabled=excluded.enabled,
        priority=excluded.priority,
        updated_at=CURRENT_TIMESTAMP
    `).bind(
      rule.ruleId,
      rule.name,
      rule.keyword,
      rule.matchType,
      rule.responseMode,
      rule.responseType,
      rule.textContent,
      rule.flexTitle,
      rule.flexLabel,
      rule.flexButtonText,
      rule.flexButtonKeyword,
      rule.flexAltText,
      rule.flexJson,
      rule.enabled,
      rule.priority
    ).run();
    return { success: true, data: { rule } };
  },

  async delete(payload, env) {
    await this.ensure(env);
    const ruleId = this.text(payload && (payload.ruleId || payload.rule_id));
    if (!ruleId) return { success: false, error: 'Missing ruleId' };
    await env.ACTMASTER_DB.prepare('DELETE FROM line_oa_keyword_rules WHERE rule_id = ?').bind(ruleId).run();
    return { success: true, data: { ruleId } };
  },

  async activeRules(env) {
    await this.ensure(env);
    const rows = await D1ReadModule.all(env, `
      SELECT *
      FROM line_oa_keyword_rules
      WHERE enabled = 1 AND keyword <> ''
      ORDER BY priority ASC, datetime(updated_at) DESC
      LIMIT 100
    `);
    return rows.map(row => this.mapRow(row));
  },

  matchRule(rules, rawText) {
    const incoming = this.normalizeText(rawText);
    if (!incoming) return null;
    return rules.find(rule => {
      const keyword = this.normalizeText(rule.keyword);
      if (!keyword) return false;
      return rule.matchType === 'exact' ? incoming === keyword : incoming.includes(keyword);
    }) || null;
  },

  keywordShareUrl(rule, env) {
    const liffId = this.text(env.POINT_LIFF_ID || env.LIFF_ID || '1660923784-vViMTZ1y');
    const params = new URLSearchParams({ lineoaKeywordShare: this.text(rule.ruleId) });
    return `https://liff.line.me/${encodeURIComponent(liffId)}?${params.toString()}`;
  },

  attachShareTargetPickerButtons(message, rule, env) {
    const shareUrl = this.keywordShareUrl(rule, env);
    const visit = node => {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'button' && node.action && String(node.action.label || '').includes('分享好友')) {
        node.action = { type: 'uri', label: String(node.action.label || '分享好友').slice(0, 20), uri: shareUrl };
      }
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach(visit);
        else if (value && typeof value === 'object') visit(value);
      }
    };
    const cloned = JSON.parse(JSON.stringify(message));
    visit(cloned.contents || cloned);
    return cloned;
  },

  buildFlex(rule, env) {
    if (this.text(rule.flexJson)) {
      const parsed = JSON.parse(rule.flexJson);
      if (parsed && parsed.type === 'flex' && parsed.contents) {
        return this.attachShareTargetPickerButtons({
          ...parsed,
          altText: this.text(parsed.altText || rule.flexAltText || rule.name, 'LINE Flex Card').slice(0, 400)
        }, rule, env);
      }
      if (parsed && typeof parsed === 'object' && (parsed.type === 'bubble' || parsed.type === 'carousel')) {
        return this.attachShareTargetPickerButtons({
          type: 'flex',
          altText: this.text(rule.flexAltText || rule.name, 'LINE Flex Card').slice(0, 400),
          contents: parsed
        }, rule, env);
      }
      throw new Error('Invalid Flex JSON: expected flex message, bubble, or carousel');
    }
    const title = this.text(rule.flexTitle || rule.name, 'LINE 快速功能');
    const label = this.text(rule.flexLabel, title);
    const buttonText = this.text(rule.flexButtonText, label).slice(0, 20);
    const buttonKeyword = this.text(rule.flexButtonKeyword, label || rule.keyword);
    return this.attachShareTargetPickerButtons({
      type: 'flex',
      altText: this.text(rule.flexAltText, title).slice(0, 200),
      contents: {
        type: 'bubble',
        size: 'mega',
        header: {
          type: 'box',
          layout: 'vertical',
          paddingAll: '20px',
          backgroundColor: '#06C755',
          contents: [
            { type: 'text', text: title, weight: 'bold', size: 'xl', color: '#FFFFFF', wrap: true }
          ]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'md',
          contents: [
            { type: 'text', text: label, weight: 'bold', size: 'lg', color: '#111827', wrap: true },
            { type: 'text', text: '請點選下方按鈕繼續操作。', size: 'sm', color: '#6B7280', wrap: true }
          ]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [{
            type: 'button',
            style: 'primary',
            color: '#06C755',
            action: { type: 'message', label: buttonText || '開始', text: buttonKeyword || label || title }
          }]
        }
      }
    }, rule, env);
  },

  buildQuickReply(rule) {
    const label = this.text(rule.textContent || rule.flexLabel || rule.name, rule.keyword).slice(0, 20);
    const text = this.text(rule.flexButtonKeyword || rule.flexLabel || rule.textContent, label).slice(0, 300);
    return {
      type: 'text',
      text: this.text(rule.name, '請選擇功能').slice(0, 5000),
      quickReply: {
        items: [{
          type: 'action',
          action: { type: 'message', label, text }
        }]
      }
    };
  },

  buildMessage(rule, env) {
    if (rule.responseType === 'flex') return this.buildFlex(rule, env);
    return this.buildQuickReply(rule);
  },

  async replyPayload(events, env) {
    if (!Array.isArray(events) || !events.length || !env.ACTMASTER_DB) return null;
    const rules = await this.activeRules(env);
    if (!rules.length) return null;
    for (const event of events) {
      const message = event && event.message ? event.message : {};
      if (message.type !== 'text') continue;
      const replyToken = this.text(event.replyToken);
      if (!replyToken) continue;
      const rule = this.matchRule(rules, message.text);
      if (!rule) continue;
      return { replyToken, messages: [this.buildMessage(rule, env)], mode: rule.responseMode || 'standalone' };
    }
    return null;
  },

  async shareMessage(payload, env) {
    await this.ensure(env);
    const ruleId = this.text(payload.ruleId || payload.rule_id || payload.id);
    if (!ruleId) return { success: false, error: 'Missing ruleId' };
    const row = await D1ReadModule.first(env, 'SELECT * FROM line_oa_keyword_rules WHERE rule_id = ? AND enabled = 1 LIMIT 1', [ruleId]).catch(() => null);
    if (!row) return { success: false, error: 'Keyword rule not found' };
    const rule = this.mapRow(row);
    if (rule.responseType !== 'flex') return { success: false, error: 'Only Flex rules can be shared' };
    return { success: true, data: { message: this.buildFlex(rule, env), ruleId } };
  }
};

const ReferralFriendKeywordModule = {
  text(value, fallback = '') {
    const next = String(value ?? '').trim();
    return next || fallback;
  },

  isKeyword(event) {
    const message = event && event.message ? event.message : {};
    if (message.type !== 'text') return false;
    const text = this.text(message.text).replace(/\s+/g, '');
    return text === '\u63a8\u85a6\u597d\u53cb';
  },

  async resolveContext(env, userId) {
    const referrerId = this.text(userId);
    if (!/^U[a-zA-Z0-9]+$/.test(referrerId)) return null;
    const identity = env.ACTMASTER_DB
      ? await D1ReadModule.findUserByIdentity(env, referrerId).catch(() => null)
      : null;
    const row = identity && identity.user ? identity.user : null;
    const role = SecurityModule.sanitizeRole(referrerId, row && row.role, row || {});
    const networkId = this.text(
      row && row.network_id,
      SecurityModule.effectiveNetworkId(referrerId, role, row || {})
    ) || 'admin';
    const storeId = this.text(row && row.store_id);
    return {
      referrerId,
      networkId,
      tracking: (storeId ? storeId + '_' : '') + referrerId.slice(0, 10),
      displayName: this.text(row && row.name, 'LINE \u597d\u53cb')
    };
  },

  buildInviteUrl(context, env) {
    const liffId = this.text(env.POINT_LIFF_ID || env.LIFF_ID || '1660923784-vViMTZ1y');
    const params = new URLSearchParams({
      ref: context.referrerId,
      net: context.networkId || 'admin',
      via: context.tracking,
      point_friend: '1',
      point_from: 'lineoa-referral-keyword-v2',
      from: 'business-engine'
    });
    return `https://liff.line.me/${encodeURIComponent(liffId)}?${params.toString()}`;
  },

  buildLineShareUrl(inviteUrl, context) {
    const text = `${context.displayName} \u9080\u8acb\u4f60\u52a0\u5165\u9ede\u6578\u901a\n${inviteUrl}`;
    return `https://line.me/R/msg/text/?${encodeURIComponent(text)}`;
  },

  buildMessage(inviteUrl, context) {
    const qrUrl = 'https://quickchart.io/qr?text=' + encodeURIComponent(inviteUrl) + '&size=360&margin=2';
    return {
      type: 'flex',
      altText: '\u63a8\u85a6\u597d\u53cb\u5c08\u5c6c QR',
      contents: {
        type: 'bubble',
        size: 'micro',
        body: {
          type: 'box',
          layout: 'vertical',
          paddingAll: '10px',
          spacing: 'sm',
          contents: [
            {
              type: 'text',
              text: '\u5c08\u5c6c QR',
              size: 'sm',
              weight: 'bold',
              align: 'center',
              color: '#1F2937'
            },
            {
              type: 'image',
              url: qrUrl,
              size: 'full',
              aspectRatio: '1:1',
              aspectMode: 'cover',
              action: { type: 'uri', uri: inviteUrl }
            },
            {
              type: 'button',
              style: 'primary',
              height: 'sm',
              color: '#EC4899',
              action: {
                type: 'uri',
                label: '\u5206\u4eab',
                uri: this.buildLineShareUrl(inviteUrl, context)
              }
            }
          ]
        }
      }
    };
  },

  async reply(events, env) {
    for (const event of Array.isArray(events) ? events : []) {
      if (!this.isKeyword(event)) continue;
      const replyToken = this.text(event.replyToken);
      const userId = LineOAChatModule.eventUserId(event);
      if (!replyToken || !userId) continue;
      const context = await this.resolveContext(env, userId);
      if (!context || !context.referrerId) continue;
      const inviteUrl = this.buildInviteUrl(context, env);
      const message = this.buildMessage(inviteUrl, context);
      const result = await LineOAChatModule.replyLine({ replyToken, messages: [message] }, env);
      if (!result.success) console.error('Referral friend keyword reply failed', result);
      return true;
    }
    return false;
  }
};

const LineOAStoreSearchKeywordModule = {
  text(value, fallback = '') {
    const next = String(value ?? '').trim();
    return next || fallback;
  },

  parseQuery(event) {
    const message = event && event.message ? event.message : {};
    if (message.type !== 'text') return '';
    const raw = this.text(message.text);
    const compact = raw.replace(/\s+/g, '');
    const prefixes = ['找服務', '找商品', '搜尋服務', '搜尋商品', '店家搜尋'];
    for (const prefix of prefixes) {
      if (compact === prefix) return '';
      if (compact.startsWith(prefix)) {
        return raw.replace(new RegExp(`^\\s*${prefix}\\s*[:：]?\\s*`), '').trim();
      }
    }
    return '';
  },

  button(label, uri, color = '#2563EB') {
    if (!uri) return null;
    return {
      type: 'button',
      style: 'primary',
      height: 'sm',
      color,
      action: {
        type: 'uri',
        label: String(label || '了解更多').slice(0, 20),
        uri
      }
    };
  },

  buildBubble(item) {
    const summary = item && item.summary ? item.summary : {};
    const contacts = summary.contacts || {};
    const productNames = Array.isArray(summary.productNames) ? summary.productNames : [];
    const serviceNames = Array.isArray(summary.serviceNames) ? summary.serviceNames : [];
    const areas = Array.isArray(summary.serviceAreas) ? summary.serviceAreas : [];
    const lines = [];
    if (summary.category) lines.push(`類型：${summary.category}`);
    if (productNames.length) lines.push(`商品：${productNames.slice(0, 4).join('、')}`);
    if (serviceNames.length) lines.push(`服務：${serviceNames.slice(0, 4).join('、')}`);
    if (areas.length) lines.push(`地區：${areas.slice(0, 4).join('、')}`);
    if (contacts.phone) lines.push(`電話：${contacts.phone}`);
    const actions = [
      this.button('LINE 聯絡', contacts.lineUrl, '#06C755'),
      this.button('網站', contacts.website, '#2563EB'),
      this.button('地圖/地址', contacts.address && /^https?:\/\//i.test(contacts.address) ? contacts.address : '', '#111827')
    ].filter(Boolean);
    return {
      type: 'bubble',
      size: 'mega',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        paddingAll: '18px',
        contents: [
          {
            type: 'text',
            text: this.text(item.storeName || summary.storeName, '店家'),
            weight: 'bold',
            size: 'lg',
            wrap: true,
            color: '#0F172A'
          },
          {
            type: 'text',
            text: lines.length ? lines.join('\n') : '找到符合的店家商品服務資料。',
            size: 'sm',
            color: '#475569',
            wrap: true
          }
        ].concat(actions.length ? [{
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          margin: 'md',
          contents: actions.slice(0, 3)
        }] : [])
      }
    };
  },

  buildResultMessage(searchResult) {
    const data = searchResult && searchResult.data ? searchResult.data : {};
    if (data.outOfScope) return { type: 'text', text: data.message };
    const items = Array.isArray(data.items) ? data.items : [];
    if (!items.length) {
      return { type: 'text', text: `目前找不到「${this.text(data.query)}」相關的店家商品或服務。` };
    }
    return {
      type: 'flex',
      altText: '店家商品服務搜尋結果',
      contents: {
        type: 'carousel',
        contents: items.slice(0, 10).map(item => this.buildBubble(item))
      }
    };
  },

  async reply(events, env) {
    for (const event of Array.isArray(events) ? events : []) {
      const replyToken = this.text(event.replyToken);
      const query = this.parseQuery(event);
      if (!replyToken || !query) continue;
      const searchResult = await D1StoreKnowledgeBaseModule.search({ query, limit: 5 }, env);
      const message = this.buildResultMessage(searchResult);
      const result = await LineOAChatModule.replyLine({ replyToken, messages: [message] }, env);
      if (!result.success) console.error('Store search keyword reply failed', result);
      return true;
    }
    return false;
  }
};

const LineOAMyVideoKeywordModule = {
  statePrefix: 'lineoa:myvideo:',
  draftPrefix: 'lineoa:myvideo:draft:',
  ttlSeconds: 1800,
  draftTtlSeconds: 86400,

  text(value, fallback = '') {
    return String(value ?? '').trim() || fallback;
  },

  stateKey(userId) {
    return this.statePrefix + this.text(userId);
  },

  draftKey(jobId) {
    return this.draftPrefix + this.text(jobId);
  },

  eventUserId(event) {
    return LineOAChatModule.eventUserId(event);
  },

  isKeyword(event) {
    const message = event?.message || {};
    if (message.type !== 'text') return false;
    return this.text(message.text).replace(/\s+/g, '') === '影音名片';
  },

  isRemakeKeyword(event) {
    const message = event?.message || {};
    if (message.type !== 'text') return false;
    const text = this.text(message.text).replace(/\s+/g, '');
    return text === '重做影音名片' || text === '重新製作影音名片';
  },

  isCancel(event) {
    const message = event?.message || {};
    if (message.type !== 'text') return false;
    const text = this.text(message.text).replace(/\s+/g, '');
    return text === '取消' || text === '取消影片' || text === '停止';
  },

  isText(event) {
    return event?.type === 'message' && event?.message?.type === 'text';
  },

  isImage(event) {
    return event?.type === 'message' && event?.message?.type === 'image' && !!event?.message?.id;
  },

  normalizeVideoUrl(value) {
    const raw = this.text(value);
    if (!raw) return '';
    const matched = raw.match(/https:\/\/[^\s]+/i);
    const url = matched ? matched[0] : raw;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') return '';
      return parsed.toString();
    } catch (e) {
      return '';
    }
  },

  async loadState(env, userId) {
    if (!env.ACTMASTER_KV || !userId) return null;
    const raw = await env.ACTMASTER_KV.get(this.stateKey(userId)).catch(() => '');
    if (!raw) return null;
    try {
      const state = JSON.parse(raw);
      return state && typeof state === 'object' ? state : null;
    } catch (e) {
      return null;
    }
  },

  async saveState(env, userId, state) {
    if (!env.ACTMASTER_KV || !userId) return false;
    await env.ACTMASTER_KV.put(this.stateKey(userId), JSON.stringify(state), { expirationTtl: this.ttlSeconds });
    return true;
  },

  async clearState(env, userId) {
    if (!env.ACTMASTER_KV || !userId) return;
    await env.ACTMASTER_KV.delete(this.stateKey(userId)).catch(() => {});
  },

  async loadActor(env, userId) {
    const id = this.text(userId);
    if (!id) return { role: 'user', user: null };
    if (SecurityModule.isHardAdmin(id)) return { role: 'admin', user: null };
    if (!D1ReadModule.hasD1(env)) return { role: 'user', user: null };
    const identity = await D1ReadModule.findUserByIdentity(env, id).catch(() => null);
    const user = identity && identity.user;
    const role = user ? SecurityModule.sanitizeRole(id, user.role, user) : 'user';
    return { role, user };
  },

  canUse(actor) {
    return actor && (actor.role === 'admin' || actor.role === 'store');
  },

  async saveDraft(env, draft) {
    if (!env.ACTMASTER_KV) throw new Error('Missing ACTMASTER_KV');
    const jobId = draft.jobId || (crypto.randomUUID ? crypto.randomUUID() : `VID_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`);
    const payload = { ...draft, jobId, status: 'ready', updatedAt: new Date().toISOString() };
    await env.ACTMASTER_KV.put(this.draftKey(jobId), JSON.stringify(payload), { expirationTtl: this.draftTtlSeconds });
    return payload;
  },

  async loadDraft(env, jobId) {
    if (!env.ACTMASTER_KV || !jobId) return null;
    const raw = await env.ACTMASTER_KV.get(this.draftKey(jobId)).catch(() => '');
    if (!raw) return null;
    try {
      const draft = JSON.parse(raw);
      return draft && typeof draft === 'object' ? draft : null;
    } catch (e) {
      return null;
    }
  },

  async getDraft(payload, env) {
    const jobId = this.text(payload.jobId || payload.videoDraft);
    const userId = this.text(payload.userId || payload.pt_uid || payload.lineUserId);
    const draft = await this.loadDraft(env, jobId);
    if (!draft) return { success: false, error: '影片名片草稿已失效，請重新輸入「影音名片」。' };
    if (this.text(draft.userId) && userId && this.text(draft.userId) !== userId) {
      return { success: false, error: 'Access Denied: video draft owner mismatch' };
    }
    return { success: true, data: draft };
  },

  parseCardConfig(row) {
    const raw = this.text(row && (row.custom_config || row.customConfig || row['自訂名片設定']));
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      return {};
    }
  },

  isDedicatedVideoCard(row) {
    const rowId = this.text(row && row.row_id);
    const config = this.parseCardConfig(row);
    return rowId.startsWith('CARD_VIDEO_') || config.videoStorageKind === 'dedicated_video_card';
  },

  isVideoCardLike(row) {
    const rowId = this.text(row && row.row_id);
    const config = this.parseCardConfig(row);
    return rowId.startsWith('CARD_VIDEO_')
      || config.cardVariant === 'video_card'
      || config.videoCard === true
      || config.cardType === 'video'
      || config.videoStorageKind === 'dedicated_video_card';
  },

  async findTargetCard(env, userId) {
    const rows = LineOAChatModule.filterLineOaMyCardCandidates(await LineOAChatModule.findMySelfCards(env, userId));
    return rows.find(row => !this.isVideoCardLike(row)) || rows[0] || null;
  },

  async findDedicatedVideoCard(env, userId) {
    const rows = await LineOAChatModule.findMyVideoCards(env, userId);
    return (Array.isArray(rows) ? rows : []).find(row => this.isDedicatedVideoCard(row)) || null;
  },

  buildVideoCardConfig(baseRow, videoUrl, thumbnailUrl) {
    const baseConfig = this.parseCardConfig(baseRow);
    return {
      ...baseConfig,
      cardType: 'video',
      cardVariant: 'video_card',
      videoCard: true,
      videoStorageKind: 'dedicated_video_card',
      templateVersion: 'my-video-card-v1',
      sourceType: 'video_profile',
      visibility: 'private',
      isPrivate: true,
      layoutStyle: 'landscape',
      imgUrl: thumbnailUrl,
      imgUrlLandscape: thumbnailUrl,
      videoUrl,
      thumbnailUrl,
      previewUrl: thumbnailUrl,
      buttons: Array.isArray(baseConfig.buttons) && baseConfig.buttons.length
        ? baseConfig.buttons
        : (baseRow ? LineOAChatModule.autoCardButtons(D1ReadModule.cardRow(baseRow)) : [])
    };
  },

  async ensureVideoCard(env, userId, state) {
    if (!D1ReadModule.hasD1(env)) return null;
    const id = this.text(userId);
    const videoUrl = this.text(state && state.videoUrl);
    const thumbnailUrl = this.text(state && state.thumbnailUrl);
    const existingVideo = await this.findDedicatedVideoCard(env, id);
    const baseRow = await this.findTargetCard(env, id);
    const baseCard = baseRow ? D1ReadModule.cardRow(baseRow) : null;
    const rowId = this.text(existingVideo && existingVideo.row_id) || `CARD_VIDEO_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const config = this.buildVideoCardConfig(baseRow, videoUrl, thumbnailUrl);
    const payload = {
      rowId,
      lineId: id,
      creatorId: id,
      ownerUserId: id,
      profileUserId: id,
      sourceType: 'video_profile',
      visibility: 'private',
      poolEligible: 0,
      aiReviewStatus: 'pending',
      networkId: this.text(baseCard && baseCard.networkId, 'admin'),
      name: this.text(baseCard && baseCard.name, '影音名片'),
      englishName: this.text(baseCard && baseCard.englishName),
      companyName: this.text(baseCard && baseCard.companyName),
      title: this.text(baseCard && baseCard.title),
      department: this.text(baseCard && baseCard.department),
      mobile: this.text(baseCard && baseCard.mobile),
      officePhone: this.text(baseCard && baseCard.officePhone),
      email: this.text(baseCard && baseCard.email),
      website: this.text(baseCard && baseCard.website),
      socials: this.text(baseCard && baseCard.socials),
      address: this.text(baseCard && baseCard.address),
      services: this.text(baseCard && baseCard.services),
      notes: this.text(baseCard && baseCard.notes, 'LINE OA 影音名片建立'),
      imageUrl: thumbnailUrl,
      customConfig: JSON.stringify(config),
      tags: this.text(baseCard && baseCard.tags, '#影音名片')
    };
    const saved = await D1WriteModule.upsertCard({
      ...payload,
      authenticatedUserId: id,
      userId: id,
      authenticatedRole: 'admin'
    }, env);
    if (!saved || saved.success === false) throw new Error(saved?.error || 'video card save failed');
    return { rowId, baseRowId: this.text(baseRow && baseRow.row_id), card: saved.data || null, created: !existingVideo };
  },

  buildVideoEditUrl(userId, env, rowId = '') {
    const liffId = this.text(env.POINT_LIFF_ID || env.LIFF_ID || '1660923784-vViMTZ1y');
    const params = new URLSearchParams({
      mode: 'wysiwyg-card',
      videoCard: '1'
    });
    if (userId) params.set('lineUserId', userId);
    if (rowId) params.set('rowId', rowId);
    return `https://liff.line.me/${encodeURIComponent(liffId)}?${params.toString()}`;
  },

  videoQuickReplyItems(userId, env, rowId = '') {
    return [{
      type: 'action',
      action: { type: 'uri', label: '編輯影音名片', uri: this.buildVideoEditUrl(userId, env, rowId) }
    }, {
      type: 'action',
      action: { type: 'message', label: '顯示影音名片', text: '影音名片' }
    }, {
      type: 'action',
      action: { type: 'message', label: '重新製作', text: '重做影音名片' }
    }];
  },

  buildExistingVideoCardFlex(row, userId, env) {
    const message = LineOAChatModule.buildExistingMyCardFlex(row, userId, env);
    if (!message) return null;
    const rowId = this.text(row && row.row_id);
    message.altText = `${this.text(row && row.name, '影音名片')} 的影音名片`;
    message.quickReply = { items: this.videoQuickReplyItems(userId, env, rowId) };
    return message;
  },

  buildWysiwygUrl(userId, env, draft) {
    const liffId = this.text(env.POINT_LIFF_ID || env.LIFF_ID || '1660923784-vViMTZ1y');
    const params = new URLSearchParams({
      mode: 'wysiwyg-card',
      videoCard: '1',
      videoDraft: this.text(draft.jobId)
    });
    if (userId) params.set('lineUserId', userId);
    if (draft.rowId) params.set('rowId', draft.rowId);
    return `https://liff.line.me/${encodeURIComponent(liffId)}?${params.toString()}`;
  },

  buildStartMessage() {
    return {
      type: 'text',
      text: '\u5f71\u7247\u540d\u7247\u8a2d\u5b9a\u958b\u59cb\u3002\n\u8acb\u5148\u8f38\u5165\u5f71\u7247\u7db2\u5740\u3002\n\n\u6ce8\u610f\uff1aLINE Flex \u5f71\u7247\u5efa\u8b70\u4f7f\u7528\u53ef\u76f4\u63a5\u64ad\u653e\u7684 HTTPS MP4 \u7db2\u5740\u3002'
    };
  },

  buildThumbnailPrompt() {
    return {
      type: 'text',
      text: '\u5df2\u6536\u5230\u5f71\u7247\u7db2\u5740\u3002\n\u8acb\u4e0a\u50b3\u7e2e\u5716\u76f8\u7247\uff0c\u7e2e\u5716\u6703\u653e\u5728\u5f71\u7247\u4e0a\u534a\u90e8\u3002',
      quickReply: {
        items: [{
          type: 'action',
          action: { type: 'camera', label: '\u62cd\u7167' }
        }, {
          type: 'action',
          action: { type: 'cameraRoll', label: '\u9078\u7167\u7247' }
        }]
      }
    };
  },

  buildEditMessage(editUrl) {
    return {
      type: 'template',
      altText: '\u5f71\u7247\u540d\u7247\u8349\u7a3f\u5b8c\u6210',
      template: {
        type: 'buttons',
        title: '\u5f71\u7247\u540d\u7247\u8349\u7a3f\u5b8c\u6210',
        text: '\u5f71\u7247\u8207\u7e2e\u5716\u5df2\u5957\u5165\uff0c\u8acb\u7de8\u8f2f\u4e0b\u534a\u90e8\u5167\u5bb9\u3002',
        actions: [{
          type: 'uri',
          label: '\u7de8\u8f2f\u5f71\u7247\u540d\u7247',
          uri: editUrl
        }]
      }
    };
  },

  buildEditFallbackMessage(editUrl) {
    return {
      type: 'text',
      text: '\u5f71\u7247\u540d\u7247\u8349\u7a3f\u5b8c\u6210\uff0c\u8acb\u9ede\u958b\u7de8\u8f2f\uff1a\n' + editUrl
    };
  },

  buildThumbnailReceivedMessage() {
    return {
      type: 'text',
      text: '\u5df2\u6536\u5230\u7e2e\u5716\uff0c\u6b63\u5728\u5efa\u7acb\u5f71\u7247\u540d\u7247\u8349\u7a3f\u3002\u5b8c\u6210\u5f8c\u6703\u63a8\u9001\u7de8\u8f2f\u9023\u7d50\u3002'
    };
  },

  buildThumbnailErrorMessage() {
    return {
      type: 'text',
      text: '\u7e2e\u5716\u8655\u7406\u5931\u6557\uff0c\u8acb\u91cd\u65b0\u8f38\u5165\u300c\u6211\u7684\u5f71\u7247\u300d\u518d\u8a66\u4e00\u6b21\u3002'
    };
  },

  async processThumbnailAndPush(userId, messageId, state, env) {
    try {
      const imageDataUri = await LineOACardCoolKeywordModule.fetchLineImageDataUri(env, messageId);
      const thumbnailUrl = await StorageModule.upload(imageDataUri, env);
      if (!thumbnailUrl) throw new Error('thumbnail upload failed');
      const videoCard = await this.ensureVideoCard(env, userId, {
        videoUrl: this.text(state.videoUrl),
        thumbnailUrl
      });
      const draft = await this.saveDraft(env, {
        userId,
        rowId: this.text(videoCard && videoCard.rowId),
        videoUrl: this.text(state.videoUrl),
        thumbnailUrl,
        card: videoCard && videoCard.card ? videoCard.card : null,
        createdAt: new Date().toISOString()
      });
      await this.clearState(env, userId);
      const editUrl = this.buildWysiwygUrl(userId, env, draft);
      const result = await LineOACardCoolKeywordModule.pushLine(userId, [this.buildEditMessage(editUrl)], env);
      if (!result.success) {
        console.error('My video edit push failed', result);
        await LineOACardCoolKeywordModule.pushLine(userId, [this.buildEditFallbackMessage(editUrl)], env);
      }
    } catch (e) {
      console.error('My video thumbnail async processing failed', e);
      await LineOACardCoolKeywordModule.pushLine(userId, [this.buildThumbnailErrorMessage()], env);
    }
  },

  async reply(events, env, ctx) {
    for (const event of Array.isArray(events) ? events : []) {
      const replyToken = this.text(event.replyToken);
      const userId = this.eventUserId(event);
      if (!replyToken || !userId) continue;

      if (this.isKeyword(event) || this.isRemakeKeyword(event)) {
        const actor = await this.loadActor(env, userId);
        if (!this.canUse(actor)) {
          const result = await LineOAChatModule.replyLine({
            replyToken,
            messages: [{ type: 'text', text: '影片名片目前僅開放付費租戶、店長與管理員使用。' }]
          }, env);
          if (!result.success) console.error('My video permission reply failed', result);
          return true;
        }
        if (this.isKeyword(event)) {
          const existingVideo = await this.findDedicatedVideoCard(env, userId);
          if (existingVideo) {
            let message = this.buildExistingVideoCardFlex(existingVideo, userId, env);
            if (message) message = await LineOAChatModule.attachSocialLikeCountToFlexMessage(message, existingVideo, env);
            if (message) {
              const result = await LineOAChatModule.replyLine({ replyToken, messages: [message] }, env);
              if (!result.success) console.error('Existing my video reply failed', result);
              return true;
            }
          }
        }
        await this.clearState(env, userId);
        await this.saveState(env, userId, { step: 'await_video_url', createdAt: new Date().toISOString() });
        const result = await LineOAChatModule.replyLine({ replyToken, messages: [this.buildStartMessage()] }, env);
        if (!result.success) console.error('My video start reply failed', result);
        return true;
      }

      const state = await this.loadState(env, userId);
      if (!state || !state.step) continue;

      if (this.isCancel(event)) {
        await this.clearState(env, userId);
        const result = await LineOAChatModule.replyLine({ replyToken, messages: [{ type: 'text', text: '已取消影片名片設定。' }] }, env);
        if (!result.success) console.error('My video cancel reply failed', result);
        return true;
      }

      if (state.step === 'await_video_url') {
        if (!this.isText(event)) continue;
        const videoUrl = this.normalizeVideoUrl(event.message.text);
        if (!videoUrl) {
          const result = await LineOAChatModule.replyLine({
            replyToken,
            messages: [{ type: 'text', text: '影片網址格式不正確。請輸入 HTTPS 影片網址，例如 https://example.com/video.mp4。' }]
          }, env);
          if (!result.success) console.error('My video invalid url reply failed', result);
          return true;
        }
        await this.saveState(env, userId, { ...state, step: 'await_thumbnail', videoUrl, updatedAt: new Date().toISOString() });
        const result = await LineOAChatModule.replyLine({ replyToken, messages: [this.buildThumbnailPrompt()] }, env);
        if (!result.success) console.error('My video thumbnail prompt failed', result);
        return true;
      }

      if (state.step === 'await_thumbnail') {
        if (!this.isImage(event)) continue;
        const result = await LineOAChatModule.replyLine({ replyToken, messages: [this.buildThumbnailReceivedMessage()] }, env);
        if (!result.success) console.error('My video thumbnail received reply failed', result);
        const job = this.processThumbnailAndPush(userId, event.message.id, state, env);
        if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(job);
        else await job;
        return true;
        try {
          const imageDataUri = await LineOACardCoolKeywordModule.fetchLineImageDataUri(env, event.message.id);
          const thumbnailUrl = await StorageModule.upload(imageDataUri, env);
          if (!thumbnailUrl) throw new Error('縮圖上傳失敗');
          const targetCard = await this.findTargetCard(env, userId);
          const draft = await this.saveDraft(env, {
            userId,
            rowId: this.text(targetCard && targetCard.row_id),
            videoUrl: this.text(state.videoUrl),
            thumbnailUrl,
            createdAt: new Date().toISOString()
          });
          await this.clearState(env, userId);
          const editUrl = this.buildWysiwygUrl(userId, env, draft);
          const result = await LineOAChatModule.replyLine({ replyToken, messages: [this.buildEditMessage(editUrl)] }, env);
          if (!result.success) {
            console.error('My video edit reply failed', result);
            await LineOACardCoolKeywordModule.pushLine(userId, [this.buildEditFallbackMessage(editUrl)], env);
          }
          return true;
        } catch (e) {
          console.error('My video thumbnail processing failed', e);
          const result = await LineOAChatModule.replyLine({
            replyToken,
            messages: [{ type: 'text', text: '縮圖處理失敗，請重新上傳清楚的圖片。' }]
          }, env);
          if (!result.success) {
            console.error('My video error reply failed', result);
            await LineOACardCoolKeywordModule.pushLine(userId, [{ type: 'text', text: '\u7e2e\u5716\u8655\u7406\u5931\u6557\uff0c\u8acb\u91cd\u65b0\u8f38\u5165\u300c\u6211\u7684\u5f71\u7247\u300d\u518d\u8a66\u4e00\u6b21\u3002' }], env);
          }
          return true;
        }
      }
    }
    return false;
  }
};

const LineOACardCoolKeywordModule = {
  statePrefix: 'lineoa:cardcool:',
  reviewPrefix: 'lineoa:cardcool:review:',
  ttlSeconds: 900,
  reviewTtlSeconds: 86400,

  text(value, fallback = '') {
    return String(value ?? '').trim() || fallback;
  },

  stateKey(userId) {
    return this.statePrefix + this.text(userId);
  },

  reviewKey(jobId) {
    return this.reviewPrefix + this.text(jobId);
  },

  isKeyword(event) {
    const message = event?.message || {};
    if (message.type !== 'text') return false;
    const normalizedText = this.text(message.text).replace(/\s+/g, '').toLowerCase();
    return normalizedText === '名片酷' || normalizedText === 'ai名片夾';
  },

  postbackSides(event) {
    if (event?.type !== 'postback') return 0;
    const data = this.text(event?.postback?.data);
    if (!data) return 0;
    const params = new URLSearchParams(data);
    if (params.get('action') !== 'lineoa_cardcool_sides') return 0;
    const sides = Number(params.get('sides') || 0);
    return sides === 2 ? 2 : (sides === 1 ? 1 : 0);
  },

  postbackSendCardId(event) {
    if (event?.type !== 'postback') return '';
    const data = this.text(event?.postback?.data);
    if (!data) return '';
    const params = new URLSearchParams(data);
    if (params.get('action') !== 'lineoa_cardcool_send') return '';
    return this.text(params.get('cardId'));
  },

  isImage(event) {
    return event?.type === 'message' && event?.message?.type === 'image' && !!event?.message?.id;
  },

  async loadState(env, userId) {
    if (!env.ACTMASTER_KV || !userId) return null;
    const raw = await env.ACTMASTER_KV.get(this.stateKey(userId)).catch(() => '');
    if (!raw) return null;
    try {
      const state = JSON.parse(raw);
      return state && typeof state === 'object' ? state : null;
    } catch (e) {
      return null;
    }
  },

  async saveState(env, userId, state) {
    if (!env.ACTMASTER_KV || !userId) return false;
    await env.ACTMASTER_KV.put(this.stateKey(userId), JSON.stringify(state), { expirationTtl: this.ttlSeconds });
    return true;
  },

  async clearState(env, userId) {
    if (!env.ACTMASTER_KV || !userId) return;
    await env.ACTMASTER_KV.delete(this.stateKey(userId)).catch(() => {});
  },

  async startLoadingAnimation(userId, env, loadingSeconds = 20) {
    if (!env.LINE_CHANNEL_ACCESS_TOKEN || !userId) return false;
    try {
      const res = await fetch('https://api.line.me/v2/bot/chat/loading/start', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ chatId: userId, loadingSeconds })
      });
      return res.ok;
    } catch (e) {
      console.error('Card cool loading animation failed', e);
      return false;
    }
  },

  async pushLine(userId, messages, env) {
    if (!env.LINE_CHANNEL_ACCESS_TOKEN || !userId || !Array.isArray(messages) || !messages.length) {
      return { success: false, error: 'Missing LINE push payload' };
    }
    try {
      const res = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ to: userId, messages })
      });
      const data = await res.json().catch(() => ({}));
      return res.ok ? { success: true, data } : { success: false, status: res.status, error: data.message || 'LINE push failed' };
    } catch (e) {
      return { success: false, error: e.message || String(e) };
    }
  },

  buildReviewUrl(jobId, env, cardId = '') {
    const liffId = env.POINT_LIFF_ID || env.LIFF_ID || '1660923784-vViMTZ1y';
    const params = new URLSearchParams({ mode: 'cardcool-review' });
    if (this.text(jobId)) params.set('jobId', this.text(jobId));
    if (this.text(cardId)) params.set('cardId', this.text(cardId));
    return `https://liff.line.me/${encodeURIComponent(liffId)}?${params.toString()}`;
  },

  buildListUrl(env) {
    const liffId = env.POINT_LIFF_ID || env.LIFF_ID || '1660923784-vViMTZ1y';
    const params = new URLSearchParams({ mode: 'cardcool-list' });
    return `https://liff.line.me/${encodeURIComponent(liffId)}?${params.toString()}`;
  },

  buildReviewMessage(jobId, data, env) {
    const name = this.text(data?.name || data?.companyName || '名片資料');
    return {
      type: 'template',
      altText: '名片解析完成，請核對資料',
      template: {
        type: 'buttons',
        title: '名片解析完成',
        text: `${name} 的資料已解析完成，請核對後送出建立名片。`,
        actions: [{ type: 'uri', label: '核對名片資料', uri: this.buildReviewUrl(jobId, env) }]
      }
    };
  },

  async saveReviewDraft(env, draft) {
    if (!env.ACTMASTER_KV) throw new Error('Missing ACTMASTER_KV');
    const jobId = draft.jobId || (crypto.randomUUID ? crypto.randomUUID() : `JOB_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`);
    const payload = { ...draft, jobId, status: draft.status || 'ready', updatedAt: new Date().toISOString() };
    await env.ACTMASTER_KV.put(this.reviewKey(jobId), JSON.stringify(payload), { expirationTtl: this.reviewTtlSeconds });
    return payload;
  },

  async loadReviewDraft(env, jobId) {
    if (!env.ACTMASTER_KV || !jobId) return null;
    const raw = await env.ACTMASTER_KV.get(this.reviewKey(jobId)).catch(() => '');
    if (!raw) return null;
    try {
      const draft = JSON.parse(raw);
      return draft && typeof draft === 'object' ? draft : null;
    } catch (e) {
      return null;
    }
  },

  async loadUserLabel(env, userId) {
    const id = this.text(userId);
    if (!id || !D1ReadModule.hasD1(env)) return { userId: id, name: '' };
    const identity = await D1ReadModule.findUserByIdentity(env, id).catch(() => null);
    const user = identity && identity.user;
    return {
      userId: id,
      name: this.text(user && (user.name || user.display_name || user.line_name))
    };
  },

  async loadOwnedCard(env, cardId, userId, role = '') {
    const rowId = this.text(cardId);
    const actorId = this.text(userId);
    const actorRole = this.text(role).toLowerCase();
    if (!rowId || !D1ReadModule.hasD1(env)) return null;
    await D1ReadModule.ensureCardAccessColumns(env);
    const row = await D1ReadModule.first(env, 'SELECT * FROM card_contacts WHERE row_id = ? LIMIT 1', [rowId]).catch(() => null);
    if (!row) return null;
    if (actorRole !== 'admin') {
      const ids = actorId ? await D1ReadModule.identityIdsForUser(env, actorId).catch(() => [actorId]) : [];
      const ownerCandidates = [
        row.owner_user_id,
        row.creator_id,
        row.line_id,
        row.profile_user_id
      ].map(v => this.text(v)).filter(Boolean);
      if (!ids.some(id => ownerCandidates.includes(id))) return null;
    }
    return D1ReadModule.cardRow(row);
  },

  cardToReviewDraft(card) {
    if (!card) return {};
    return {
      name: this.text(card.name),
      englishName: this.text(card.englishName),
      companyName: this.text(card.companyName),
      title: this.text(card.title),
      department: this.text(card.department),
      mobile: this.text(card.mobile),
      officePhone: this.text(card.officePhone),
      email: this.text(card.email),
      website: this.text(card.website),
      address: this.text(card.address),
      services: this.text(card.services),
      tags: this.text(card.tags),
      imageUrl: this.text(card.imageUrl),
      customConfig: this.text(card.customConfig),
      notes: this.text(card.notes)
    };
  },

  async getReviewDraft(payload, env) {
    const jobId = this.text(payload.jobId);
    const cardId = this.text(payload.cardId || payload.rowId);
    const userId = this.text(payload.userId);
    const role = this.text(payload.authenticatedRole || payload.role);
    if (cardId) {
      const card = await this.loadOwnedCard(env, cardId, userId, role);
      if (!card) return { success: false, error: 'Access Denied: card owner mismatch' };
      const scanner = await this.loadUserLabel(env, card.ownerUserId || card.creatorId || userId);
      return {
        success: true,
        data: {
          cardId,
          card: this.cardToReviewDraft(card),
          status: 'ready',
          source: 'card',
          scanner
        }
      };
    }
    const draft = await this.loadReviewDraft(env, jobId);
    if (!draft) return { success: false, error: '名片核對資料已失效，請重新上傳名片。' };
    if (this.text(draft.userId) && userId && this.text(draft.userId) !== userId) {
      return { success: false, error: 'Access Denied: draft owner mismatch' };
    }
    return { success: true, data: { jobId, card: draft.card || {}, uploadedUrls: draft.uploadedUrls || [], status: draft.status || 'ready', scanner: draft.scanner || null } };
  },

  mergeReviewedCard(draftCard, reviewedCard) {
    const source = reviewedCard && typeof reviewedCard === 'object' ? reviewedCard : {};
    const merged = { ...(draftCard || {}) };
    [
      'name','englishName','companyName','title','department','mobile','officePhone',
      'email','website','address','services','tags','imageUrl','customConfig','notes'
    ].forEach(key => {
      if (Object.prototype.hasOwnProperty.call(source, key)) merged[key] = this.text(source[key]);
    });
    return merged;
  },

  buildSidesMessage(env) {
    return {
      type: 'text',
      text: '請選擇這張名片有幾面。選完後再上傳名片照片；非名片圖片不會建立資料。',
      quickReply: {
        items: [{
          type: 'action',
          action: {
            type: 'postback',
            label: '一面',
            data: 'action=lineoa_cardcool_sides&sides=1',
            displayText: 'AI名片夾：一面'
          }
        }, {
          type: 'action',
          action: {
            type: 'postback',
            label: '二面',
            data: 'action=lineoa_cardcool_sides&sides=2',
            displayText: 'AI名片夾：二面'
          }
        }, {
          type: 'action',
          action: {
            type: 'uri',
            label: '觀看名單',
            uri: this.buildListUrl(env)
          }
        }]
      }
    };
  },

  buildUploadPrompt(sides) {
    return {
      type: 'text',
      text: sides === 2
        ? '請先上傳名片第 1 面照片。'
        : '請上傳名片照片，我會辨識內容並建立到 AI名片夾。',
      quickReply: {
        items: [{
          type: 'action',
          action: { type: 'camera', label: '拍攝名片' }
        }, {
          type: 'action',
          action: { type: 'cameraRoll', label: '從相簿選擇' }
        }]
      }
    };
  },

  arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  },

  async fetchLineImageDataUri(env, messageId) {
    if (!env.LINE_CHANNEL_ACCESS_TOKEN) throw new Error('Missing LINE_CHANNEL_ACCESS_TOKEN');
    const res = await fetch(`https://api-data.line.me/v2/bot/message/${encodeURIComponent(messageId)}/content`, {
      headers: { Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` }
    });
    if (!res.ok) throw new Error('LINE image fetch failed: HTTP ' + res.status);
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > 8 * 1024 * 1024) throw new Error('圖片太大，請重新上傳較清楚且較小的名片照片。');
    return `data:${contentType};base64,${this.arrayBufferToBase64(buffer)}`;
  },

  newImportEventId() {
    if (typeof crypto !== 'undefined' && crypto && typeof crypto.randomUUID === 'function') return `CIMP_${crypto.randomUUID()}`;
    return `CIMP_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  },

  async recordImportEvent(env, event = {}) {
    if (!env || !env.ACTMASTER_DB) return null;
    await D1ReadModule.ensureCardAccessColumns(env);
    const eventId = this.text(event.eventId || event.event_id, this.newImportEventId());
    const scannerUid = this.text(event.scannerUid || event.scanner_uid, 'admin');
    const inviterUid = this.text(event.inviterUid || event.inviter_uid, 'admin');
    const source = this.text(event.source, 'line_oa_cardcool');
    const imageCount = Math.max(1, Number(event.imageCount || event.image_count || 1) || 1);
    const rawMessageIds = Array.isArray(event.rawMessageIds || event.raw_message_ids)
      ? JSON.stringify(event.rawMessageIds || event.raw_message_ids)
      : this.text(event.rawMessageIds || event.raw_message_ids, '[]');
    const status = this.text(event.status, 'received');
    const cardRowId = this.text(event.cardRowId || event.card_row_id);
    const rejectReason = this.text(event.rejectReason || event.reject_reason);
    await env.ACTMASTER_DB.prepare(`
      INSERT INTO card_import_events (event_id,scanner_uid,inviter_uid,source,image_count,raw_message_ids,status,card_row_id,reject_reason,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      ON CONFLICT(event_id) DO UPDATE SET
        scanner_uid=excluded.scanner_uid,
        inviter_uid=excluded.inviter_uid,
        source=excluded.source,
        image_count=excluded.image_count,
        raw_message_ids=excluded.raw_message_ids,
        status=excluded.status,
        card_row_id=CASE WHEN excluded.card_row_id <> '' THEN excluded.card_row_id ELSE card_import_events.card_row_id END,
        reject_reason=excluded.reject_reason,
        updated_at=CURRENT_TIMESTAMP
    `).bind(eventId, scannerUid, inviterUid, source, imageCount, rawMessageIds, status, cardRowId, rejectReason).run();
    return eventId;
  },

  async markImportEvent(env, eventId, status, cardRowId = '', rejectReason = '') {
    const id = this.text(eventId);
    if (!id || !env || !env.ACTMASTER_DB) return;
    await env.ACTMASTER_DB.prepare(`
      UPDATE card_import_events
      SET status = ?,
          card_row_id = CASE WHEN ? <> '' THEN ? ELSE card_row_id END,
          reject_reason = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE event_id = ?
    `).bind(this.text(status, 'received'), this.text(cardRowId), this.text(cardRowId), this.text(rejectReason), id).run();
  },

  normalizeSavedCardPayload(userId, ocrData) {
    const name = this.text(ocrData.name || ocrData.companyName, '未命名名片');
    const companyName = this.text(ocrData.companyName);
    const title = this.text(ocrData.title);
    return {
      authenticatedUserId: userId,
      userId,
      rowId: `CARD_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      lineId: '',
      name,
      englishName: this.text(ocrData.englishName),
      companyName,
      title,
      department: this.text(ocrData.department),
      mobile: this.text(ocrData.mobile),
      officePhone: this.text(ocrData.officePhone),
      email: this.text(ocrData.email),
      website: this.text(ocrData.website),
      address: this.text(ocrData.address),
      services: this.text(ocrData.services || title || companyName),
      tags: this.text(ocrData.tags),
      notes: this.text(ocrData.notes, `LINE OA AI名片夾 OCR 建立；掃描者：${this.text(ocrData.scannerName || ocrData.scannerId || userId)}`),
      creatorId: userId,
      ownerUserId: userId,
      scannerUserId: this.text(ocrData.scannerUserId || ocrData.scannerId || userId),
      scannerName: this.text(ocrData.scannerName || userId),
      profileUserId: '',
      sourceType: 'private_import',
      visibility: 'private',
      poolEligible: '0',
      aiReviewStatus: 'passed',
      imageUrl: this.text(ocrData.imageUrl),
      customConfig: this.text(ocrData.customConfig),
      sourceEventId: this.text(ocrData.sourceEventId || ocrData.importEventId)
    };
  },

  buildSavedCardMessage(card, userId, env) {
    let config = {};
    try {
      config = card.customConfig ? JSON.parse(card.customConfig) : {};
    } catch (e) {
      config = {};
    }
    if (!Array.isArray(config.buttons) || !config.buttons.length) {
      config.buttons = LineOAChatModule.autoCardButtons(card);
    }
    const flex = MessagingModule.buildFlex({
      card,
      config,
      referrerId: userId,
      networkId: card.networkId || 'admin',
      liffId: env.POINT_LIFF_ID || env.LIFF_ID,
      socialLikeLiffId: env.SOCIAL_LIKE_LIFF_ID || env.LIKE_LIFF_ID
    });
    const message = {
      type: 'flex',
      altText: `${card.name || 'AI名片夾'} 的電子名片`,
      contents: flex
    };
    const rowId = this.text(card.rowId || card.id);
    if (rowId) {
      message.quickReply = {
        items: [{
          type: 'action',
          action: {
            type: 'uri',
            label: '編輯名片',
            uri: this.buildReviewUrl('', env, rowId)
          }
        }, {
          type: 'action',
          action: {
            type: 'postback',
            label: '再發送',
            data: `action=lineoa_cardcool_send&cardId=${encodeURIComponent(rowId)}`,
            displayText: 'AI名片夾：發送名片'
          }
        }]
      };
    }
    return message;
  },

  async processImages(userId, images, env) {
    const ocr = await AIModule.recognizeBusinessCardImages({ base64Images: images }, env);
    if (!ocr.success) return { success: false, error: ocr.error || '非名片圖片，未建立資料。' };
    const savePayload = this.normalizeSavedCardPayload(userId, ocr.data || {});
    const saved = await D1WriteModule.upsertCard(savePayload, env);
    if (!saved || saved.success === false) return { success: false, error: saved?.error || '名片儲存失敗。' };
    return { success: true, card: saved.data };
  },

  async processImagesAndPushReview(userId, imageInputs, env) {
    let importEventId = '';
    try {
      const images = [];
      for (const input of Array.isArray(imageInputs) ? imageInputs : []) {
        if (!input) continue;
        if (String(input).startsWith('data:')) images.push(input);
        else images.push(await this.fetchLineImageDataUri(env, input));
      }
      if (!images.length) throw new Error('Missing image data');
      try {
        const rawMessageIds = (Array.isArray(imageInputs) ? imageInputs : [])
          .filter(input => input && !String(input).startsWith('data:'))
          .map(input => String(input));
        importEventId = await this.recordImportEvent(env, {
          scannerUid: userId,
          inviterUid: 'admin',
          imageCount: images.length,
          rawMessageIds,
          status: 'received'
        }) || '';
      } catch (eventError) {
        console.error('Card cool import event record failed', eventError);
      }
      const ocr = await AIModule.recognizeBusinessCardImages({ base64Images: images }, env);
      if (!ocr.success) throw new Error(ocr.error || '\u540d\u7247\u89e3\u6790\u5931\u6557');
      if (importEventId) await this.markImportEvent(env, importEventId, 'review_ready').catch(eventError => console.error('Card cool import event ready failed', eventError));
      const scanner = await this.loadUserLabel(env, userId);
      const cardData = { ...(ocr.data || {}), scannerId: userId, scannerName: scanner.name || userId, importEventId, sourceEventId: importEventId };
      const jobId = crypto.randomUUID ? crypto.randomUUID() : `JOB_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      const draft = await this.saveReviewDraft(env, {
        jobId,
        userId,
        card: cardData,
        uploadedUrls: ocr.data?.uploadedUrls || [],
        importEventId,
        scanner,
        status: 'ready',
        createdAt: new Date().toISOString()
      });
      const push = await this.pushLine(userId, [this.buildReviewMessage(draft.jobId, draft.card, env)], env);
      if (!push.success) console.error('Card cool review push failed', push);
      return { success: true, jobId: draft.jobId };
    } catch (e) {
      console.error('Card cool async OCR failed', e);
      if (importEventId) await this.markImportEvent(env, importEventId, 'rejected', '', e.message || String(e)).catch(eventError => console.error('Card cool import event reject failed', eventError));
      await this.pushLine(userId, [{
        type: 'text',
        text: e.message || '\u540d\u7247\u89e3\u6790\u5931\u6557\uff0c\u8acb\u78ba\u8a8d\u5716\u7247\u662f\u5b8c\u6574\u3001\u6e05\u695a\u7684\u540d\u7247\u5f8c\u518d\u8a66\u4e00\u6b21\u3002'
      }], env);
      return { success: false, error: e.message || String(e) };
    }
  },

  async confirmReviewDraft(payload, env) {
    const jobId = this.text(payload.jobId);
    const cardId = this.text(payload.cardId || payload.rowId);
    const userId = this.text(payload.userId);
    const role = this.text(payload.authenticatedRole || payload.role);
    let draft = null;
    if (cardId) {
      const existingCard = await this.loadOwnedCard(env, cardId, userId, role);
      if (!existingCard) return { success: false, error: 'Access Denied: card owner mismatch' };
      draft = { userId: existingCard.ownerUserId || existingCard.creatorId || userId, card: this.cardToReviewDraft(existingCard), cardId };
    } else {
      draft = await this.loadReviewDraft(env, jobId);
      if (!draft) return { success: false, error: '\u540d\u7247\u6838\u5c0d\u8cc7\u6599\u5df2\u5931\u6548\uff0c\u8acb\u91cd\u65b0\u4e0a\u50b3\u540d\u7247\u3002' };
      if (!userId || this.text(draft.userId) !== userId) return { success: false, error: 'Access Denied: draft owner mismatch' };
    }
    const cardData = this.mergeReviewedCard(draft.card || {}, payload.card || {});
    const scanner = await this.loadUserLabel(env, userId);
    cardData.scannerId = this.text(cardData.scannerId, userId);
    cardData.scannerName = this.text(cardData.scannerName, scanner.name || userId);
    if (!cardId && draft.importEventId) {
      cardData.importEventId = this.text(draft.importEventId);
      cardData.sourceEventId = this.text(draft.importEventId);
    }
    const savePayload = this.normalizeSavedCardPayload(userId, cardData);
    if (cardId) savePayload.rowId = cardId;
    const saved = await D1WriteModule.upsertCard(savePayload, env);
    if (!saved || saved.success === false) return { success: false, error: saved?.error || '\u540d\u7247\u5132\u5b58\u5931\u6557' };
    if (!cardId && draft.importEventId) {
      await this.markImportEvent(env, draft.importEventId, 'created', saved.rowId || saved.data?.rowId || '').catch(eventError => console.error('Card cool import event created failed', eventError));
    }
    if (!cardId && env.ACTMASTER_KV) await env.ACTMASTER_KV.delete(this.reviewKey(jobId)).catch(() => {});
    const shouldPush = payload.pushToChat !== false;
    const push = shouldPush ? await this.pushLine(userId, [this.buildSavedCardMessage(saved.data, userId, env)], env) : { success: false };
    if (shouldPush && !push.success) console.error('Card cool saved card push failed', push);
    return { success: true, data: { card: saved.data, pushed: push.success } };
  },

  async sendSavedCardToChat(payload, env) {
    const userId = this.text(payload.userId);
    const cardId = this.text(payload.cardId || payload.rowId);
    const role = this.text(payload.authenticatedRole || payload.role);
    if (!userId || !cardId) return { success: false, error: 'Missing card id' };
    const card = await this.loadOwnedCard(env, cardId, userId, role);
    if (!card) return { success: false, error: 'Access Denied: card owner mismatch' };
    const push = await this.pushLine(userId, [this.buildSavedCardMessage(card, userId, env)], env);
    return push.success ? { success: true, data: { pushed: true } } : { success: false, error: push.error || 'LINE push failed' };
  },

  async reply(events, env, ctx) {
    for (const event of Array.isArray(events) ? events : []) {
      const replyToken = this.text(event.replyToken);
      const userId = LineOAChatModule.eventUserId(event);
      if (!replyToken || !userId) continue;

      if (this.isKeyword(event)) {
        await this.clearState(env, userId);
        const result = await LineOAChatModule.replyLine({ replyToken, messages: [this.buildSidesMessage(env)] }, env);
        if (!result.success) console.error('Card cool side selector reply failed', result);
        return true;
      }

      const sides = this.postbackSides(event);
      if (sides) {
        const ok = await this.saveState(env, userId, { sides, images: [], createdAt: new Date().toISOString() });
        const message = ok ? this.buildUploadPrompt(sides) : { type: 'text', text: '\u540d\u7247\u9177\u66ab\u6642\u7121\u6cd5\u555f\u52d5\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66\u3002' };
        const result = await LineOAChatModule.replyLine({ replyToken, messages: [message] }, env);
        if (!result.success) console.error('Card cool upload prompt reply failed', result);
        return true;
      }

      const sendCardId = this.postbackSendCardId(event);
      if (sendCardId) {
        const card = await this.loadOwnedCard(env, sendCardId, userId, '');
        const message = card
          ? this.buildSavedCardMessage(card, userId, env)
          : { type: 'text', text: '找不到可發送的名片，請回名片列表確認。' };
        const result = await LineOAChatModule.replyLine({ replyToken, messages: [message] }, env);
        if (!result.success) console.error('Card cool resend reply failed', result);
        return true;
      }

      if (!this.isImage(event)) continue;
      const state = await this.loadState(env, userId);
      if (!state || !state.sides) continue;

      try {
        const messageId = event.message.id;
        let images = Array.isArray(state.images) ? state.images.slice() : [];
        if (Number(state.sides) === 2 && images.length < 1) {
          const image = await this.fetchLineImageDataUri(env, messageId);
          images = images.concat([image]);
          await this.saveState(env, userId, { ...state, images, updatedAt: new Date().toISOString() });
          const result = await LineOAChatModule.replyLine({
            replyToken,
            messages: [{ type: 'text', text: '\u5df2\u6536\u5230\u7b2c 1 \u9762\uff0c\u8acb\u518d\u4e0a\u50b3\u540d\u7247\u7b2c 2 \u9762\u7167\u7247\u3002' }]
          }, env);
          if (!result.success) console.error('Card cool second-side prompt failed', result);
          return true;
        }

        await this.clearState(env, userId);
        await this.startLoadingAnimation(userId, env, 20);
        const processingMessage = { type: 'text', text: '\u540d\u7247\u89e3\u6790\u4e2d\uff0c\u5b8c\u6210\u5f8c\u6703\u63a8\u9001\u6838\u5c0d\u756b\u9762\u3002\u8acb\u5148\u4e0d\u8981\u91cd\u8907\u4e0a\u50b3\u3002' };
        const result = await LineOAChatModule.replyLine({ replyToken, messages: [processingMessage] }, env);
        if (!result.success) console.error('Card cool processing reply failed', result);
        const finalInputs = Number(state.sides) === 2 ? images.concat([messageId]).slice(0, 2) : [messageId];
        const job = this.processImagesAndPushReview(userId, finalInputs, env);
        if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(job);
        else await job;
        return true;
      } catch (e) {
        const result = await LineOAChatModule.replyLine({
          replyToken,
          messages: [{ type: 'text', text: e.message || '\u540d\u7247\u9177\u8655\u7406\u5931\u6557\uff0c\u8acb\u91cd\u65b0\u8f38\u5165\u300c\u540d\u7247\u9177\u300d\u518d\u8a66\u3002' }]
        }, env);
        if (!result.success) console.error('Card cool error reply failed', result);
        return true;
      }
    }
    return false;
  }

};

// ==================== Point Service Module ====================
const PointModule = {
  apiUrl: 'https://aiwe.cc/index.php/wp-json/wetw-point/v1/query-user-point-list',
  insertApiUrl: 'https://aiwe.cc/index.php/wp-json/wetw-point/v1/insert-user-point',

  motherRegistrationUrl(env, userId) {
    const lineUserId = String(userId || '').trim();
    const botToken = String(env.MOTHER_CUS_ACCOUNT_BOT_TOKEN || env.AIWE_CUS_ACCOUNT_BOT_TOKEN || '').trim();
    if (!lineUserId || !botToken) return '';
    const url = new URL(String(env.MOTHER_CUS_ACCOUNT_URL || 'https://aiwe.cc/index.php/cus_account/'));
    url.searchParams.set('line_userid', lineUserId);
    url.searchParams.set('bot_token', botToken);
    url.searchParams.set('shop_id', String(env.MOTHER_CUS_ACCOUNT_SHOP_ID || env.POINT_SHOP_ID || 78));
    url.searchParams.set('client_id', String(env.MOTHER_CUS_ACCOUNT_CLIENT_ID || '1660923784'));
    url.searchParams.set('redirect_uri', String(env.MOTHER_CUS_ACCOUNT_REDIRECT_URI || 'https://aiwe.cc/index.php/line_login/677/'));
    return url.toString();
  },

  async getMotherRegistrationUrl(payload, env) {
    const requestedUserId = String(payload.authenticatedUserId || payload.userId || payload.LINE_user_id || payload.lineUserId || '').trim();
    if (!requestedUserId) return { success: false, error: 'Missing LINE user id' };
    const url = this.motherRegistrationUrl(env, requestedUserId);
    if (!url) return { success: false, error: 'Mother registration token is not configured' };
    return {
      success: true,
      data: {
        userId: requestedUserId,
        url
      }
    };
  },

  motherLineMemberApiUrl(env) {
    return String(env.MOTHER_LINE_MEMBER_API_URL || 'https://aiwe.cc/index.php/wp-json/wetw/v1/check-or-create-line-user').trim();
  },

  motherLineMemberApiKey(env) {
    return String(env.MOTHER_LINE_MEMBER_API_KEY || env.WETW_MASTER_API_KEY || env.AIWE_MEMBER_API_KEY || env.POINT_API_KEY || env.WETW_POINT_API_KEY || env.MOTHER_CUS_ACCOUNT_BOT_TOKEN || env.AIWE_CUS_ACCOUNT_BOT_TOKEN || '').trim();
  },

  pointApiKey(env) {
    return String(env.POINT_API_KEY || env.WETW_POINT_API_KEY || env.MOTHER_LINE_MEMBER_API_KEY || env.WETW_MASTER_API_KEY || env.AIWE_MEMBER_API_KEY || '').trim();
  },

  async ensureMotherLineMember(payload = {}, env) {
    const apiKey = this.motherLineMemberApiKey(env);
    const lineUserId = String(payload.LINE_user_id || payload.lineUserId || payload.userId || payload.pointUserId || payload.pt_uid || payload.authenticatedUserId || '').trim();
    if (!lineUserId) return { success: false, error: 'Missing LINE user id' };
    if (!apiKey) return { success: true, skipped: true, reason: 'missing_mother_member_api_key', lineUserId };

    const body = {
      api_key: apiKey,
      shop_id: Number(payload.shop_id || payload.shopId || env.MOTHER_CUS_ACCOUNT_SHOP_ID || env.POINT_SHOP_ID || 78),
      LINE_user_id: lineUserId
    };
    const displayName = String(payload.LINE_display_name || payload.displayName || payload.name || payload['姓名'] || '').trim();
    const statusMessage = String(payload.LINE_status_message || payload.statusMessage || '').trim();
    const pictureUrl = String(payload.LINE_picture_url || payload.pictureUrl || payload.avatarUrl || payload.picture || '').trim();
    if (displayName) body.LINE_display_name = displayName;
    if (statusMessage) body.LINE_status_message = statusMessage;
    if (pictureUrl) body.LINE_picture_url = pictureUrl;

    let res;
    let data = {};
    try {
      res = await fetch(this.motherLineMemberApiUrl(env), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const text = await res.text();
      try {
        data = text ? JSON.parse(text) : {};
      } catch (e) {
        data = { rawText: text.slice(0, 300) };
      }
    } catch (e) {
      return { success: false, error: 'Mother member API unavailable: ' + (e && e.message ? e.message : String(e)), lineUserId };
    }
    if (!res.ok || data.success === false) {
      return { success: false, error: data.message || data.code || ('Mother member API HTTP ' + res.status), code: data.code || ('HTTP_' + res.status), data, lineUserId };
    }
    if (env.ACTMASTER_DB) {
      await this.ensureLocalPointWallet(env, lineUserId, {
        name: displayName,
        displayName,
        networkId: payload.networkId || payload.network_id || 'admin'
      }).catch(() => null);
      await env.ACTMASTER_DB.prepare(`
        UPDATE users
        SET point_line_id = COALESCE(NULLIF(point_line_id, ''), ?),
            identity_source = COALESCE(NULLIF(identity_source, ''), 'mother_member_api'),
            migrated_at = COALESCE(migrated_at, CURRENT_TIMESTAMP)
        WHERE line_id = ? OR row_id = ? OR point_line_id = ? OR legacy_line_id = ?
      `).bind(lineUserId, lineUserId, lineUserId, lineUserId, lineUserId).run().catch(() => null);
      await D1WriteModule.clearUserCache(env, lineUserId).catch(() => null);
    }
    return {
      success: true,
      lineUserId,
      code: String(data.code || ''),
      created: String(data.code || '') === 'register_success',
      alreadyMember: String(data.code || '') === 'already_member',
      data
    };
  },
  number(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  },

  time(value) {
    const text = String(value || '').trim();
    if (!text) return 0;
    const parsed = Date.parse(text.replace(' ', 'T'));
    return Number.isFinite(parsed) ? parsed : 0;
  },

  latestBalance(list) {
    if (!Array.isArray(list) || !list.length) return 0;
    const rowsWithBalance = list.filter(item => item.point_balance !== undefined && item.point_balance !== null && String(item.point_balance).trim() !== '');
    if (!rowsWithBalance.length) return list.reduce((sum, item) => sum + this.number(item.get_point), 0);
    const sorted = rowsWithBalance.slice().sort((a, b) => {
      const byTime = this.time(b.created_at) - this.time(a.created_at);
      if (byTime !== 0) return byTime;
      return this.number(b.id) - this.number(a.id);
    });
    return this.number(sorted[0].point_balance);
  },

  balancesByType(list) {
    const groups = {};
    (Array.isArray(list) ? list : []).forEach(item => {
      const type = String(item.point_type || 'unknown').trim() || 'unknown';
      if (!groups[type]) groups[type] = [];
      groups[type].push(item);
    });
    return Object.keys(groups).reduce((acc, type) => {
      acc[type] = this.latestBalance(groups[type]);
      return acc;
    }, {});
  },

  async fetchPointPage(body) {
    let res = null;
    let text = '';
    try {
      res = await fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      text = await res.text();
    } catch (e) {
      return { error: 'Mother point API unavailable: ' + (e && e.message ? e.message : String(e)), code: 'POINT_API_FETCH_FAILED', data: {} };
    }
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch (e) {
      data = { rawText: text.slice(0, 300) };
    }
    if (!res.ok || data.success === false) {
      return { error: data.message || data.code || ('Point API HTTP ' + res.status), code: data.code || ('HTTP_' + res.status), data };
    }
    return { data };
  },

  async queryPointBalanceFast(payload, env) {
    const apiKey = this.pointApiKey(env);
    if (!apiKey) return { success: false, error: 'Missing POINT_API_KEY' };

    const explicitPointUserId = String(payload.pointUserId || payload.pt_uid || payload.LINE_user_id || '').trim();
    const fallbackUserId = String(payload.authenticatedUserId || payload.userId || '').trim();
    const requestedLineUserId = explicitPointUserId || fallbackUserId;
    const resolvedPointUserId = await this.resolvePointUserId(env, requestedLineUserId).catch(() => '');
    const lineUserId = resolvedPointUserId || explicitPointUserId || fallbackUserId;
    if (!lineUserId) return { success: false, error: 'Missing LINE user id' };

    const pointType = String(payload.point_type || payload.pointType || 'gift_money').trim() || 'gift_money';
    const body = {
      api_key: apiKey,
      LINE_user_id: lineUserId,
      page: 1,
      per_page: 20,
      point_type: pointType
    };
    if (payload.shop_id || payload.shopId) body.shop_id = Number(payload.shop_id || payload.shopId);

    const result = await this.fetchPointPage(body);
    if (result.error) {
      const localBalance = await AdminPointModule.localBalance(env, lineUserId).catch(() => 0);
      if (env.ACTMASTER_DB && Number(localBalance || 0)) {
        return {
          success: true,
          data: {
            status: 'ready',
            source: 'local',
            motherError: result.error,
            balance: Number(localBalance || 0),
            latestBalance: Number(localBalance || 0),
            typedBalance: Number(localBalance || 0),
            pointType,
            queriedLineUserId: lineUserId,
            requestedLineUserId,
            sampledRows: 0,
            total: 0,
            pagination: {},
            updatedAt: new Date().toISOString()
          }
        };
      }
      return { success: false, error: result.error, code: result.code };
    }

    const list = Array.isArray(result.data?.data?.list) ? result.data.data.list : [];
    const pagination = result.data?.data?.pagination || {};
    const balance = this.latestBalance(list);
    return {
      success: true,
      data: {
        status: 'ready',
        source: 'mother',
        balance,
        latestBalance: balance,
        typedBalance: balance,
        pointType,
        queriedLineUserId: lineUserId,
        requestedLineUserId,
        sampledRows: list.length,
        total: this.number(pagination.total),
        pagination,
        updatedAt: new Date().toISOString()
      }
    };
  },

  async insertUserPoint(payload, env) {
    const apiKey = this.pointApiKey(env);
    if (!apiKey) return { success: false, error: 'Missing POINT_API_KEY' };
    const rawLineUserId = String(payload.LINE_user_id || payload.lineUserId || payload.userId || '').trim();
    const lineUserId = await this.resolvePointUserId(env, rawLineUserId).catch(() => rawLineUserId);
    if (!lineUserId) return { success: false, error: 'Missing LINE user id' };

    let motherMember = { success: true, skipped: true, reason: 'skip_mother_member_setup', lineUserId };
    if (payload.skipMotherMemberSetup !== true) {
      motherMember = await this.ensureMotherLineMember({
        ...payload,
        LINE_user_id: lineUserId,
        lineUserId,
        userId: lineUserId
      }, env).catch(e => ({ success: false, error: e && e.message ? e.message : String(e) }));
      if (motherMember && motherMember.success === false) {
        return { success: false, error: 'Mother member setup failed: ' + (motherMember.error || motherMember.code || 'unknown'), motherMember };
      }
    }
    const body = {
      api_key: apiKey,
      LINE_user_id: lineUserId,
      shop_id: Number(payload.shop_id || payload.shopId || env.POINT_SHOP_ID || env.MOTHER_CUS_ACCOUNT_SHOP_ID || 78),
      event_name: String(payload.event_name || payload.eventName || '掃描名片贈點'),
      event_content: String(payload.event_content || payload.eventContent || '新增不重複名片，系統自動贈點'),
      point_type: String(payload.point_type || payload.pointType || 'system_point'),
      get_point: Number(payload.get_point || payload.points || 0),
      shop_user_lineid: String(payload.shop_user_lineid || ''),
      child_shop_name: String(payload.child_shop_name || ''),
      child_shop_renew: Number(payload.child_shop_renew || 0),
      shop_remark: String(payload.shop_remark || '')
    };
    if (!body.get_point) return { success: false, error: 'Missing point amount', motherMember };

    const res = await fetch(this.insertApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      return { success: false, error: data.message || data.code || ('Point insert API HTTP ' + res.status), data, motherMember };
    }
    return { success: true, data, motherMember };
  },
  async enrichPointRowsWithCashierLogs(env, lineUserId, rows) {
    if (!env.ACTMASTER_DB || !lineUserId || !Array.isArray(rows) || !rows.length) return rows;
    await this.ensureCashierLedgerTable(env);

    const logs = await D1ReadModule.all(env, `
      SELECT *
      FROM store_point_cashier_logs
      WHERE customer_point_user_id = ? OR customer_user_id = ?
      ORDER BY created_at DESC
      LIMIT 100
    `, [lineUserId, lineUserId]).catch(() => []);
    if (!logs.length) return rows;

    const actorNames = {};
    for (const log of logs) {
      const actorId = D1ReadModule.text(log.actor_user_id);
      if (!actorId || actorNames[actorId]) continue;
      const actor = await D1ReadModule.findUserByIdentity(env, actorId).catch(() => null);
      const user = actor && actor.user ? D1ReadModule.userRow(actor.user) : null;
      actorNames[actorId] = D1ReadModule.text(user && user.name)
        || D1ReadModule.text(user && user.storeId)
        || D1ReadModule.text(user && user.phone)
        || actorId;
    }

    const usedLogIds = new Set();
    const rowAmount = row => Number(row.get_point ?? row.point ?? row.amount ?? row.points ?? 0) || 0;
    const rowTime = row => Date.parse(String(row.created_at || row.createdAt || row.time || row.date || '').replace(' ', 'T'));
    const logTime = log => Date.parse(String(log.created_at || '').replace(' ', 'T'));
    const hasSource = row => Boolean(
      D1ReadModule.text(row.event_content || row.eventContent || row.child_shop_name || row.childShopName || row.shop_remark || row.shopRemark)
    );
    const makeDetail = (log, sourceName) => {
      const amount = Number(log.amount || 0) || 0;
      const points = Math.abs(Number(log.points || 0) || 0);
      const payable = Number(log.payable_amount || 0) || 0;
      if (D1ReadModule.text(log.mode) === 'reward') {
        return `來源：${sourceName}；消費 NT$${amount.toLocaleString('zh-TW')}，1:1 贈送 ${points.toLocaleString('zh-TW')} 點`;
      }
      return `來源：${sourceName}；消費 NT$${amount.toLocaleString('zh-TW')}，折抵 ${points.toLocaleString('zh-TW')} 點，應收 NT$${payable.toLocaleString('zh-TW')}`;
    };

    const enrichedRows = rows.map(row => {
      if (hasSource(row)) return row;
      const amount = rowAmount(row);
      const timeMs = rowTime(row);
      const matched = logs.find(log => {
        const logId = D1ReadModule.text(log.log_id);
        if (!logId || usedLogIds.has(logId)) return false;
        const points = Number(log.points || 0) || 0;
        if (points !== amount) return false;
        const lTime = logTime(log);
        if (!Number.isNaN(timeMs) && !Number.isNaN(lTime)) {
          // D1 stores CURRENT_TIMESTAMP in UTC while the point service may return Taiwan-local time.
          // Keep this wide enough for timezone differences and delayed external ledger writes.
          return Math.abs(timeMs - lTime) <= 36 * 60 * 60 * 1000;
        }
        return true;
      });
      if (!matched) return row;

      const logId = D1ReadModule.text(matched.log_id);
      usedLogIds.add(logId);
      const sourceName = actorNames[D1ReadModule.text(matched.actor_user_id)] || '店家';
      const eventContent = makeDetail(matched, sourceName);
      const originalTitle = D1ReadModule.text(row.event_name || row.eventName || row.title || row.name);
      const sourceTitle = originalTitle.includes(sourceName)
        ? originalTitle
        : `${sourceName}｜${originalTitle || (D1ReadModule.text(matched.mode) === 'reward' ? '消費贈點' : '消費折抵')}`;
      return {
        ...row,
        event_name: sourceTitle,
        eventName: sourceTitle,
        event_content: eventContent,
        eventContent,
        child_shop_name: sourceName,
        childShopName: sourceName,
        shop_remark: `source=${sourceName}; store_cashier_log=${logId}`,
        storeCashierLogId: logId
      };
    });

    const sourceRowForLog = (log) => {
      const logId = D1ReadModule.text(log.log_id);
      const sourceName = actorNames[D1ReadModule.text(log.actor_user_id)] || '店家';
      const eventContent = makeDetail(log, sourceName);
      const mode = D1ReadModule.text(log.mode);
      return {
        id: logId,
        localLedger: true,
        event_name: `${sourceName}｜${mode === 'reward' ? '消費贈點' : '消費折抵'}`,
        eventName: `${sourceName}｜${mode === 'reward' ? '消費贈點' : '消費折抵'}`,
        event_content: eventContent,
        eventContent,
        child_shop_name: sourceName,
        childShopName: sourceName,
        shop_remark: `source=${sourceName}; store_cashier_log=${logId}`,
        get_point: Number(log.points || 0) || 0,
        point: Number(log.points || 0) || 0,
        created_at: D1ReadModule.text(log.created_at),
        createdAt: D1ReadModule.text(log.created_at),
        storeCashierLogId: logId
      };
    };
    const combined = enrichedRows.concat(
      logs
        .filter(log => !usedLogIds.has(D1ReadModule.text(log.log_id)))
        .slice(0, 20)
        .map(sourceRowForLog)
    );
    return combined.sort((a, b) => {
      const at = Date.parse(String(a.created_at || a.createdAt || '').replace(' ', 'T')) || 0;
      const bt = Date.parse(String(b.created_at || b.createdAt || '').replace(' ', 'T')) || 0;
      return bt - at;
    });
  },

  async queryUserPoints(payload, env) {
    const apiKey = this.pointApiKey(env);
    if (!apiKey) return { success: false, error: 'Missing POINT_API_KEY' };

    const explicitPointUserId = String(payload.pointUserId || payload.pt_uid || payload.LINE_user_id || '').trim();
    const fallbackUserId = String(payload.authenticatedUserId || payload.userId || '').trim();
    const requestedLineUserId = explicitPointUserId || fallbackUserId;
    const resolvedPointUserId = await this.resolvePointUserId(env, requestedLineUserId).catch(() => '');
    let lineUserId = resolvedPointUserId || explicitPointUserId || fallbackUserId;
    if (!lineUserId) return { success: false, error: 'Missing LINE user id' };
    const legacyLineUserIds = await this.resolvePointUserIds(env, requestedLineUserId || lineUserId).catch(() => [lineUserId]);
    const queryLineUserIds = Array.from(new Set([lineUserId].map(id => String(id || '').trim()).filter(Boolean)));

    const makeBaseBody = (queryLineUserId) => ({
      api_key: apiKey,
      LINE_user_id: queryLineUserId,
      page: Math.max(1, Number(payload.page || 1)),
      per_page: 100
    });
    const baseBody = makeBaseBody(lineUserId);
    if (payload.shop_id || payload.shopId) baseBody.shop_id = Number(payload.shop_id || payload.shopId);
    if (payload.date_start || payload.dateStart) baseBody.date_start = String(payload.date_start || payload.dateStart);
    if (payload.date_end || payload.dateEnd) baseBody.date_end = String(payload.date_end || payload.dateEnd);
    const withFilters = (body) => {
      const next = { ...body };
      if (payload.shop_id || payload.shopId) next.shop_id = Number(payload.shop_id || payload.shopId);
      if (payload.date_start || payload.dateStart) next.date_start = String(payload.date_start || payload.dateStart);
      if (payload.date_end || payload.dateEnd) next.date_end = String(payload.date_end || payload.dateEnd);
      return next;
    };

    const collectPages = async (body) => {
      const firstPage = await this.fetchPointPage(body);
      if (firstPage.error) return { error: firstPage.error, code: firstPage.code };

      const data = firstPage.data;
      const pagination = data.data?.pagination || {};
      const totalPages = Math.max(1, this.number(pagination.total_pages));
      let combinedList = Array.isArray(data.data?.list) ? data.data.list.slice() : [];

      if (totalPages > 1) {
        const seenPages = new Set([1]);
        const pages = [];
        for (let page = 2; page <= Math.min(totalPages, 20); page++) pages.push(page);
        if (totalPages > 20) {
          const tailStart = Math.max(21, totalPages - 4);
          for (let page = tailStart; page <= totalPages; page++) pages.push(page);
        }

        for (const page of pages) {
          if (seenPages.has(page)) continue;
          seenPages.add(page);
          const pageResult = await this.fetchPointPage({ ...body, page });
          if (!pageResult.error && Array.isArray(pageResult.data?.data?.list)) {
            combinedList = combinedList.concat(pageResult.data.data.list);
          }
        }
      }

      return {
        body,
        pagination,
        total: this.number(pagination.total),
        list: combinedList,
        latestBalance: this.latestBalance(combinedList),
        balanceByType: this.balancesByType(combinedList)
      };
    };

    const requestedType = String(payload.point_type || payload.pointType || '').trim();
    const typedResults = [];
    const allTypeResults = [];
    for (const queryId of queryLineUserIds) {
      const body = withFilters(makeBaseBody(queryId));
      const typedResult = await collectPages({ ...body, point_type: requestedType || 'gift_money' });
      if (!typedResult.error) typedResults.push(typedResult);
      const allTypeResult = await collectPages(body);
      if (!allTypeResult.error) allTypeResults.push(allTypeResult);
    }
    if (!typedResults.length) {
      const firstError = await collectPages({ ...withFilters(makeBaseBody(lineUserId)), point_type: requestedType || 'gift_money' });
      const localBalance = await AdminPointModule.localBalance(env, lineUserId).catch(() => 0);
      const localRows = await AdminPointModule.localRows(env, lineUserId, 100).catch(() => []);
      if (env.ACTMASTER_DB && (Number(localBalance || 0) || localRows.length)) {
        const localList = localRows.map(row => ({
          id: row.rowId,
          event_name: row.note || 'Local point',
          event_content: row.note || '',
          shop_remark: row.source || 'local',
          point_type: requestedType || 'gift_money',
          get_point: Number(row.points || 0) || 0,
          point: Number(row.points || 0) || 0,
          points: Number(row.points || 0) || 0,
          point_balance: Number(row.balanceAfter || 0) || 0,
          created_at: row.createdAt || ''
        }));
        return {
          success: true,
          data: {
            status: 'ready',
            source: 'local',
            motherError: firstError.error || 'Point query failed',
            balance: Number(localBalance || 0),
            latestBalance: Number(localBalance || 0),
            typedBalance: Number(localBalance || 0),
            allTypeBalance: Number(localBalance || 0),
            balanceByType: { [requestedType || 'gift_money']: Number(localBalance || 0) },
            pointType: requestedType || 'gift_money',
            requestedPointType: requestedType || 'gift_money',
            queriedLineUserId: lineUserId,
            requestedLineUserId,
            list: localList,
            total: localList.length,
            pagination: { total: localList.length, total_pages: 1, current_page: 1 },
            updatedAt: new Date().toISOString()
          }
        };
      }
      return { success: false, error: firstError.error || 'Point query failed', code: firstError.code };
    }

    const mergeBalancesByType = (results) => {
      const merged = {};
      for (const result of results) {
        const source = result.balanceByType || {};
        for (const [key, value] of Object.entries(source)) {
          merged[key] = (Number(merged[key] || 0) || 0) + (Number(value || 0) || 0);
        }
      }
      return merged;
    };
    const typedList = typedResults.flatMap(result => Array.isArray(result.list) ? result.list : []);
    const allTypeList = allTypeResults.flatMap(result => Array.isArray(result.list) ? result.list : []);
    const balanceByType = allTypeResults.length ? mergeBalancesByType(allTypeResults) : mergeBalancesByType(typedResults);
    const balance = typedResults.reduce((sum, result) => sum + (Number(result.latestBalance || 0) || 0), 0);
    const allTypeBalance = allTypeResults.length
      ? allTypeResults.reduce((sum, result) => sum + (Number(result.latestBalance || 0) || 0), 0)
      : null;
    const typedBody = typedResults[0].body;
    const typedResult = {
      ...typedResults[0],
      list: typedList,
      latestBalance: balance,
      total: typedResults.reduce((sum, result) => sum + (Number(result.total || 0) || 0), 0),
      pagination: typedResults[0].pagination
    };
    let enrichedList = typedList
      .sort((a, b) => {
        const at = Date.parse(String(a.created_at || a.createdAt || a.time || a.date || '').replace(' ', 'T')) || 0;
        const bt = Date.parse(String(b.created_at || b.createdAt || b.time || b.date || '').replace(' ', 'T')) || 0;
        return bt - at;
      })
      .slice(0, baseBody.per_page);
    for (const queryId of queryLineUserIds) {
      enrichedList = await this.enrichPointRowsWithCashierLogs(env, queryId, enrichedList);
    }

    return {
      success: true,
      data: {
        balance,
        latestBalance: typedResult.latestBalance,
        typedBalance: typedResult.latestBalance,
        allTypeBalance,
        balanceByType,
        queriedLineUserId: lineUserId,
        queriedLineUserIds: queryLineUserIds,
        legacyResolvedLineUserIds: legacyLineUserIds,
        requestedLineUserId,
        sampledRows: typedResult.list.length,
        pointType: typedResult.body.point_type || 'gift_money',
        requestedPointType: typedBody.point_type,
        total: typedResult.total,
        pagination: typedResult.pagination,
        list: enrichedList
      }
    };
  }
,

  async resolvePointUserId(env, userId) {
    const id = String(userId || '').trim();
    if (!id || !env || !env.ACTMASTER_DB) return id;
    const identity = await D1ReadModule.findUserByIdentity(env, id).catch(() => null);
    const row = identity && identity.user;
    return D1ReadModule.text(row && row.point_line_id)
      || D1ReadModule.text(identity && identity.canonicalId)
      || D1ReadModule.text(row && row.line_id)
      || id;
  },

  async resolvePointUserIds(env, userId) {
    const id = String(userId || '').trim();
    const ids = [];
    const add = value => {
      const next = String(value || '').trim();
      if (next && !ids.includes(next)) ids.push(next);
    };
    add(id);
    if (!id || !env || !env.ACTMASTER_DB) return ids;
    const identity = await D1ReadModule.findUserByIdentity(env, id).catch(() => null);
    add(identity && identity.canonicalId);
    const row = identity && identity.user;
    add(row && row.point_line_id);
    add(row && row.line_id);
    add(row && row.legacy_line_id);
    add(row && row.row_id);
    const link = identity && identity.link;
    add(link && link.new_line_id);
    add(link && link.old_line_id);
    const activeLinks = await D1ReadModule.all(env, `
      SELECT old_line_id, new_line_id
      FROM user_identity_links
      WHERE status = 'active' AND (old_line_id IN (${ids.map(() => '?').join(',')}) OR new_line_id IN (${ids.map(() => '?').join(',')}))
    `, ids.concat(ids)).catch(() => []);
    for (const linkRow of activeLinks) {
      add(linkRow.old_line_id);
      add(linkRow.new_line_id);
    }
    return ids.length ? ids : [id];
  },

  async ensureLocalPointWallet(env, userId, profile = {}) {
    const id = D1ReadModule.text(userId);
    if (!id || !env || !env.ACTMASTER_DB) return { success: false, error: 'Missing user id' };
    const userColumns = [
      "ALTER TABLE users ADD COLUMN point_line_id TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE users ADD COLUMN legacy_line_id TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE users ADD COLUMN identity_source TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE users ADD COLUMN migrated_at TEXT"
    ];
    for (const sql of userColumns) {
      await env.ACTMASTER_DB.prepare(sql).run().catch(() => null);
    }
    await env.ACTMASTER_DB.prepare(`
      INSERT INTO users (
        row_id, line_id, name, industry, phone, role, network_id,
        point_line_id, identity_source, migrated_at
      ) VALUES (?, ?, ?, ?, ?, 'user', ?, ?, 'store_point_wallet_repair', CURRENT_TIMESTAMP)
      ON CONFLICT(row_id) DO UPDATE SET
        line_id=CASE WHEN TRIM(COALESCE(users.line_id,'')) = '' THEN excluded.line_id ELSE users.line_id END,
        name=CASE WHEN TRIM(COALESCE(users.name,'')) = '' THEN excluded.name ELSE users.name END,
        industry=CASE WHEN TRIM(COALESCE(users.industry,'')) = '' THEN excluded.industry ELSE users.industry END,
        phone=CASE WHEN TRIM(COALESCE(users.phone,'')) = '' THEN excluded.phone ELSE users.phone END,
        network_id=CASE WHEN TRIM(COALESCE(users.network_id,'')) = '' THEN excluded.network_id ELSE users.network_id END,
        point_line_id=CASE WHEN TRIM(COALESCE(users.point_line_id,'')) = '' THEN excluded.point_line_id ELSE users.point_line_id END,
        identity_source=CASE WHEN TRIM(COALESCE(users.identity_source,'')) = '' THEN excluded.identity_source ELSE users.identity_source END,
        migrated_at=COALESCE(users.migrated_at, CURRENT_TIMESTAMP)
    `).bind(
      id,
      id,
      D1ReadModule.text(profile.name || profile.displayName),
      D1ReadModule.text(profile.industry || profile.title || profile.companyName),
      D1ReadModule.text(profile.phone || profile.mobile),
      D1ReadModule.text(profile.networkId || 'admin'),
      id
    ).run();
    await env.ACTMASTER_DB.prepare(`
      UPDATE users
      SET point_line_id = COALESCE(NULLIF(point_line_id, ''), ?),
          identity_source = COALESCE(NULLIF(identity_source, ''), 'store_point_wallet_repair'),
          migrated_at = COALESCE(migrated_at, CURRENT_TIMESTAMP)
      WHERE line_id = ? OR row_id = ? OR legacy_line_id = ? OR point_line_id = ?
    `).bind(id, id, id, id, id).run();
    await AdminPointModule.ensure(env).catch(() => null);
    await D1WriteModule.clearUserCache(env, id).catch(() => null);
    return { success: true, pointUserId: id, source: 'local_wallet_index' };
  },

  async ensureLocalPointWalletIndexFast(env, userId, profile = {}) {
    const id = D1ReadModule.text(userId);
    if (!id || !env || !env.ACTMASTER_DB) return { success: false, error: 'Missing user id' };
    try {
      await env.ACTMASTER_DB.prepare(`
        INSERT INTO users (
          row_id, line_id, name, industry, phone, role, network_id,
          point_line_id, identity_source, migrated_at
        ) VALUES (?, ?, ?, ?, ?, 'user', ?, ?, 'line_oa_chat_index', CURRENT_TIMESTAMP)
        ON CONFLICT(row_id) DO UPDATE SET
          line_id=CASE WHEN TRIM(COALESCE(users.line_id,'')) = '' THEN excluded.line_id ELSE users.line_id END,
          name=CASE WHEN TRIM(COALESCE(users.name,'')) = '' THEN excluded.name ELSE users.name END,
          industry=CASE WHEN TRIM(COALESCE(users.industry,'')) = '' THEN excluded.industry ELSE users.industry END,
          phone=CASE WHEN TRIM(COALESCE(users.phone,'')) = '' THEN excluded.phone ELSE users.phone END,
          network_id=CASE WHEN TRIM(COALESCE(users.network_id,'')) = '' THEN excluded.network_id ELSE users.network_id END,
          point_line_id=CASE WHEN TRIM(COALESCE(users.point_line_id,'')) = '' THEN excluded.point_line_id ELSE users.point_line_id END,
          identity_source=CASE WHEN TRIM(COALESCE(users.identity_source,'')) = '' THEN excluded.identity_source ELSE users.identity_source END,
          migrated_at=COALESCE(users.migrated_at, CURRENT_TIMESTAMP)
      `).bind(
        id,
        id,
        D1ReadModule.text(profile.name || profile.displayName),
        D1ReadModule.text(profile.industry || profile.title || profile.companyName || 'LINE OA'),
        D1ReadModule.text(profile.phone || profile.mobile),
        D1ReadModule.text(profile.networkId || 'admin'),
        id
      ).run();
      return { success: true, pointUserId: id, source: 'line_oa_chat_index' };
    } catch (e) {
      return await this.ensureLocalPointWallet(env, id, {
        ...profile,
        industry: profile.industry || profile.title || profile.companyName || 'LINE OA',
        networkId: profile.networkId || 'admin'
      });
    }
  },

  async ensureAwardTable(env) {
    await env.ACTMASTER_DB.prepare(`
      CREATE TABLE IF NOT EXISTS point_awards (
        award_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL DEFAULT '',
        card_id TEXT NOT NULL DEFAULT '',
        award_type TEXT NOT NULL DEFAULT 'card_scan_create',
        points REAL NOT NULL DEFAULT 0,
        point_type TEXT NOT NULL DEFAULT 'gift_money',
        status TEXT NOT NULL DEFAULT 'pending',
        response_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    const awardColumns = [
      "ALTER TABLE point_awards ADD COLUMN user_id TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE point_awards ADD COLUMN card_id TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE point_awards ADD COLUMN award_type TEXT NOT NULL DEFAULT 'card_scan_create'",
      "ALTER TABLE point_awards ADD COLUMN points REAL NOT NULL DEFAULT 0",
      "ALTER TABLE point_awards ADD COLUMN point_type TEXT NOT NULL DEFAULT 'gift_money'",
      "ALTER TABLE point_awards ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'",
      "ALTER TABLE point_awards ADD COLUMN response_json TEXT NOT NULL DEFAULT '{}'",
      "ALTER TABLE point_awards ADD COLUMN created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP",
      "ALTER TABLE point_awards ADD COLUMN updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP"
    ];
    for (const sql of awardColumns) {
      await env.ACTMASTER_DB.prepare(sql).run().catch(() => null);
    }
    await env.ACTMASTER_DB.prepare(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_point_awards_unique_card_scan
      ON point_awards(user_id, card_id, award_type)
      WHERE user_id <> '' AND card_id <> ''
    `).run();
  },

  taipeiDate() {
    return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  },

  async ensureSubsitePointWalletOnJoin(payload, env) {
    if (!env || !env.ACTMASTER_DB) return { success: false, error: 'Missing ACTMASTER_DB binding' };
    const rawUserId = String(payload.userId || payload.LINE_user_id || payload.lineUserId || payload.authenticatedUserId || '').trim();
    const pointUserId = await this.resolvePointUserId(env, rawUserId).catch(() => rawUserId);
    if (!pointUserId) return { success: false, error: 'Missing userId' };
    const profile = {
      name: payload.name || payload.displayName || payload['姓名'] || '',
      displayName: payload.displayName || payload.name || payload['姓名'] || '',
      phone: payload.phone || payload.mobile || payload['手機號碼'] || '',
      industry: payload.industry || payload.title || payload.companyName || '',
      title: payload.title || payload.industry || '',
      companyName: payload.companyName || payload.company || '',
      networkId: payload.networkId || payload.net || payload.network_id || 'admin'
    };
    const motherMember = await this.ensureMotherLineMember({
      ...payload,
      ...profile,
      LINE_user_id: pointUserId,
      lineUserId: pointUserId,
      userId: pointUserId
    }, env).catch(e => ({ success: false, error: e && e.message ? e.message : String(e) }));
    const localWallet = await this.ensureLocalPointWallet(env, pointUserId, profile);
    return {
      ...localWallet,
      motherMember,
      data: {
        ...(localWallet && localWallet.data ? localWallet.data : {}),
        motherMember
      }
    };
  },
  async dailyCheckinLocalFallback(options = {}) {
    const env = options.env;
    const pointUserId = String(options.pointUserId || '').trim();
    const rawUserId = String(options.rawUserId || pointUserId || '').trim();
    const today = String(options.today || this.taipeiDate()).trim();
    const awardId = String(options.awardId || `AWD_DAILY_${pointUserId}_${today}`).trim();
    if (!env || !env.ACTMASTER_DB) return { success: false, error: 'Missing ACTMASTER_DB binding' };
    if (!pointUserId) return { success: false, error: 'Missing userId' };

    await this.ensureLocalPointWallet(env, pointUserId, options.profile || {}).catch(() => null);
    await AdminPointModule.ensure(env);
    const balanceBefore = await AdminPointModule.localBalance(env, pointUserId).catch(() => 0);
    const localLedgerId = `APL_DAILY_${pointUserId}_${today}`;
    const insert = await env.ACTMASTER_DB.prepare(`
      INSERT OR IGNORE INTO admin_point_ledger (row_id,user_id,actor_user_id,mode,points,balance_after,note,source)
      VALUES (?, ?, ?, 'grant', 10, ?, ?, 'daily_checkin_local_wallet')
    `).bind(
      localLedgerId,
      pointUserId,
      rawUserId || pointUserId,
      Number(balanceBefore || 0) + 10,
      `daily_checkin=${today}; fallback_reason=${String(options.reason || 'mother_unavailable').slice(0, 160)}`
    ).run();
    const inserted = Number(insert && insert.meta && insert.meta.changes || 0) > 0;
    const balanceAfter = inserted
      ? Number(balanceBefore || 0) + 10
      : await AdminPointModule.localBalance(env, pointUserId).catch(() => balanceBefore);

    await env.ACTMASTER_DB.prepare(`
      INSERT OR REPLACE INTO point_awards (award_id,user_id,card_id,award_type,points,point_type,status,response_json,updated_at)
      VALUES (?, ?, ?, 'daily_checkin', 10, 'gift_money', 'local_sent', ?, CURRENT_TIMESTAMP)
    `).bind(
      awardId,
      pointUserId,
      today,
      JSON.stringify({
        source: 'local_fallback',
        inserted,
        balanceBefore,
        balanceAfter,
        localLedgerId,
        reason: options.reason || '',
        mother: options.mother || null
      })
    ).run();

    const syncJob = await PointSyncModule.enqueue({
      jobId: `PSJ_DAILY_${pointUserId}_${today}`,
      lineUserId: pointUserId,
      source: 'daily_checkin_local_wallet',
      sourceRef: awardId,
      points: 10,
      pointType: 'gift_money',
      createdBy: rawUserId || pointUserId,
      payload: {
        userId: rawUserId || pointUserId,
        pointUserId,
        date: today,
        localLedgerId,
        fallbackReason: options.reason || ''
      }
    }, env).catch(e => ({ success: false, error: e && e.message ? e.message : String(e) }));

    return {
      success: true,
      data: {
        awarded: inserted,
        alreadyChecked: !inserted,
        points: inserted ? 10 : 0,
        date: today,
        balanceBefore,
        balance: balanceAfter,
        pointUserId,
        source: 'local_fallback',
        syncJob,
        message: inserted ? 'Daily check-in recorded locally.' : 'Already checked in today.'
      }
    };
  },

  async awardShareJoinPoints(payload, env) {
    if (!env.ACTMASTER_DB) return { success: false, skipped: true, reason: 'missing_db' };
    const rawUserId = String(payload.userId || payload.LINE_user_id || payload.lineUserId || payload.authenticatedUserId || '').trim();
    const pointUserId = await this.resolvePointUserId(env, rawUserId).catch(() => rawUserId);
    const referrerId = String(payload.referrerId || payload.ref || payload['推薦人'] || payload['?刻鈭?'] || '').trim();
    const networkId = String(payload.networkId || payload.net || payload.network_id || 'admin').trim() || 'admin';
    const sourceRef = String(payload.claimRowId || payload.claimedCardRowId || payload.shareCardId || payload.cardId || referrerId || networkId || 'share_url').trim();
    if (!pointUserId) return { success: false, skipped: true, reason: 'missing_user_id' };

    const pointWallet = await this.ensureSubsitePointWalletOnJoin({
      ...payload,
      userId: pointUserId,
      LINE_user_id: pointUserId,
      lineUserId: pointUserId,
      networkId
    }, env).catch(e => ({ success: false, error: e && e.message ? e.message : String(e) }));

    return {
      success: true,
      awarded: false,
      skipped: true,
      reason: 'join_points_are_owned_by_line_oa_follow',
      pointUserId,
      referrerId,
      networkId,
      sourceRef,
      pointWallet,
      message: '子站加入只同步會員與點數錢包索引；300 點由 LINE 加好友流程發放。'
    };
  },
  async dailyCheckin(payload, env) {
    if (!env.ACTMASTER_DB) return { success: false, error: 'Missing ACTMASTER_DB binding' };
    await this.ensureAwardTable(env);

    const rawUserId = String(payload.authenticatedUserId || payload.userId || '').trim();
    const rawPointUserId = String(payload.pointUserId || payload.pt_uid || rawUserId || '').trim();
    const pointUserId = await this.resolvePointUserId(env, rawPointUserId).catch(() => rawPointUserId);
    if (!pointUserId) return { success: false, error: 'Missing userId' };

    const today = this.taipeiDate();
    const awardId = `AWD_DAILY_${pointUserId}_${today}`;
    const existingAward = await D1ReadModule.first(env, `
      SELECT *
      FROM point_awards
      WHERE award_id = ?
         OR (user_id = ? AND card_id = ? AND award_type = 'daily_checkin')
      LIMIT 1
    `, [awardId, pointUserId, today]).catch(() => null);
    if (existingAward && String(existingAward.status || '').trim() !== 'failed') {
      const localBalance = await AdminPointModule.localBalance(env, pointUserId).catch(() => 0);
      return {
        success: true,
        data: {
          awarded: false,
          alreadyChecked: true,
          points: 0,
          date: today,
          balance: Number(localBalance || 0),
          pointUserId,
          source: String(existingAward.status || '').trim() || 'local',
          message: 'Already checked in today.'
        }
      };
    }
    const beforeWallet = await this.queryUserPoints({
      pointUserId,
      point_type: 'gift_money',
      page: 1,
      per_page: 100
    }, env);
    if (!beforeWallet || !beforeWallet.success) {
      return await this.dailyCheckinLocalFallback({
        env,
        pointUserId,
        rawUserId,
        today,
        awardId,
        profile: {
          displayName: payload.displayName || payload.name || '',
          pictureUrl: payload.pictureUrl || ''
        },
        reason: beforeWallet && beforeWallet.error ? beforeWallet.error : 'mother_wallet_unavailable',
        mother: beforeWallet || null
      });
      await this.ensureLocalPointWallet(env, pointUserId, {
        displayName: payload.displayName || payload.name || '',
        pictureUrl: payload.pictureUrl || ''
      }).catch(() => null);
      await AdminPointModule.ensure(env);
      const balanceBefore = await AdminPointModule.localBalance(env, pointUserId).catch(() => 0);
      const balanceAfter = Number(balanceBefore || 0) + 10;
      const localLedgerId = `APL_DAILY_${pointUserId}_${today}`;
      await env.ACTMASTER_DB.prepare(`
        INSERT OR IGNORE INTO admin_point_ledger (row_id,user_id,actor_user_id,mode,points,balance_after,note,source)
        VALUES (?, ?, ?, 'grant', 10, ?, ?, 'daily_checkin_local_wallet')
      `).bind(
        localLedgerId,
        pointUserId,
        rawUserId || pointUserId,
        balanceAfter,
        `daily_checkin=${today}; mother_error=${String(beforeWallet && beforeWallet.error || 'mother_wallet_unavailable').slice(0, 180)}`
      ).run();
      await env.ACTMASTER_DB.prepare(`
        INSERT OR REPLACE INTO point_awards (award_id,user_id,card_id,award_type,points,point_type,status,response_json,updated_at)
        VALUES (?, ?, ?, 'daily_checkin', 10, 'gift_money', 'local_sent', ?, CURRENT_TIMESTAMP)
      `).bind(
        awardId,
        pointUserId,
        today,
        JSON.stringify({ source: 'local_fallback', beforeWallet, balanceBefore, balanceAfter, localLedgerId })
      ).run();
      const syncJob = await PointSyncModule.enqueue({
        jobId: `PSJ_DAILY_${pointUserId}_${today}`,
        lineUserId: pointUserId,
        source: 'daily_checkin_local_wallet',
        sourceRef: awardId,
        points: 10,
        pointType: 'gift_money',
        createdBy: rawUserId || pointUserId,
        payload: {
          userId: rawUserId || pointUserId,
          pointUserId,
          date: today,
          localLedgerId,
          motherError: beforeWallet && beforeWallet.error || ''
        }
      }, env).catch(e => ({ success: false, error: e.message || String(e) }));
      return {
        success: true,
        data: {
          awarded: true,
          alreadyChecked: false,
          points: 10,
          date: today,
          balanceBefore,
          balance: balanceAfter,
          pointUserId,
          source: 'local_fallback',
          syncJob,
          message: 'Daily check-in recorded locally.'
        }
      };
      return {
        success: false,
        error: beforeWallet && beforeWallet.error ? beforeWallet.error : '無法讀取母站點數',
        data: { pointUserId, date: today, stage: 'before_query', beforeWallet }
      };
    }

    const balanceBefore = Number(beforeWallet.data?.balance || 0) || 0;
    const dailyAwardExists = (wallet) => {
      const list = Array.isArray(wallet?.data?.list) ? wallet.data.list : [];
      return list.some(row => {
        const amount = Number(row.get_point ?? row.point ?? row.points ?? 0) || 0;
        const text = [
          row.event_name,
          row.eventName,
          row.event_content,
          row.eventContent,
          row.shop_remark,
          row.shopRemark
        ].map(v => String(v || '')).join(' ');
        return amount >= 10 && (
          text.includes(`daily_checkin=${today}`) ||
          (text.includes(today) && (text.includes('每日簽到') || text.includes('點數家族')))
        );
      });
    };

    if (dailyAwardExists(beforeWallet)) {
      return {
        success: true,
        data: {
          awarded: false,
          alreadyChecked: true,
          points: 0,
          date: today,
          balance: balanceBefore,
          pointUserId,
          message: '今天已領取過點數家族簽到獎勵'
        }
      };
    }

    await env.ACTMASTER_DB.prepare(`
      INSERT OR IGNORE INTO point_awards (award_id,user_id,card_id,award_type,points,point_type,status,response_json,updated_at)
      VALUES (?, ?, ?, 'daily_checkin', 10, 'gift_money', 'pending', '{}', CURRENT_TIMESTAMP)
    `).bind(awardId, pointUserId, today).run();

    const result = await this.insertUserPoint({
      userId: pointUserId,
      points: 10,
      pointType: 'gift_money',
      eventName: '點數家族每日簽到',
      eventContent: `點數家族 ${today} 每日簽到贈點`,
      shop_remark: `daily_checkin=${today}`
    }, env).catch(e => ({ success: false, error: e && e.message ? e.message : String(e) }));

    let afterWallet = null;
    let balanceAfter = balanceBefore;
    if (result && result.success) {
      await new Promise(resolve => setTimeout(resolve, 1600));
      afterWallet = await this.queryUserPoints({
        pointUserId,
        point_type: 'gift_money',
        page: 1,
        per_page: 100
      }, env).catch(e => ({ success: false, error: e.message || String(e) }));
      if (afterWallet && afterWallet.success) {
        balanceAfter = Number(afterWallet.data?.balance || 0) || 0;
      }
    }

    const verified = !!(result && result.success && (balanceAfter >= balanceBefore + 10 || dailyAwardExists(afterWallet)));
    await env.ACTMASTER_DB.prepare(`
      UPDATE point_awards
      SET status = ?, response_json = ?, updated_at = CURRENT_TIMESTAMP
      WHERE award_id = ?
    `).bind(
      verified ? 'sent' : 'failed',
      JSON.stringify({ result, before: balanceBefore, after: balanceAfter, afterWallet }),
      awardId
    ).run();

    if (!verified) {
      return await this.dailyCheckinLocalFallback({
        env,
        pointUserId,
        rawUserId,
        today,
        awardId,
        reason: result && result.error ? result.error : 'mother_verify_failed',
        mother: { result, before: balanceBefore, after: balanceAfter, afterWallet }
      });
      return {
        success: false,
        error: result && result.error ? result.error : '母站尚未確認點數入帳，請重新整理後再試',
        data: { date: today, pointUserId, balanceBefore, balanceAfter, pointInsertResult: result, afterWallet }
      };
    }

    return {
      success: true,
      data: {
        awarded: true,
        alreadyChecked: false,
        points: 10,
        date: today,
        balanceBefore,
        balance: balanceAfter,
        pointUserId,
        message: '點數家族簽到成功，已獲得 10 點'
      }
    };
  },

  async findCustomerByPhone(env, phoneRaw) {
    if (!env.ACTMASTER_DB) return { match: null, error: '' };
    const phone = SecurityModule.normalizePhone(phoneRaw);
    if (phone.length < 7) return { match: null, error: '' };
    const tail = phone.slice(-9);
    const userRows = await D1ReadModule.all(env, `
      SELECT * FROM users
      WHERE phone LIKE ? OR phone LIKE ?
      ORDER BY row_id DESC
      LIMIT 20
    `, [`%${phone}%`, `%${tail}%`]).catch(() => []);
    const cardRows = await D1ReadModule.all(env, `
      SELECT * FROM card_contacts
      WHERE mobile LIKE ? OR mobile LIKE ? OR office_phone LIKE ? OR office_phone LIKE ?
      ORDER BY COALESCE(updated_at, created_at) DESC
      LIMIT 20
    `, [`%${phone}%`, `%${tail}%`, `%${phone}%`, `%${tail}%`]).catch(() => []);

    const candidates = [];
    const pushMatch = (kind, row, rawPhone) => {
      const normalized = SecurityModule.normalizePhone(rawPhone);
      if (!normalized || (normalized !== phone && !normalized.endsWith(tail) && !phone.endsWith(normalized.slice(-9)))) return;
      const id = kind === 'card'
        ? D1ReadModule.text(row.line_id || row.profile_user_id || row.claimed_by_uid)
        : D1ReadModule.text(row.line_id || row.row_id);
      if (!id && kind !== 'card') return;
      candidates.push({ kind: id ? kind : 'card_unbound', id, row });
    };
    userRows.forEach(row => pushMatch('user', row, row.phone));
    cardRows.forEach(row => pushMatch('card', row, row.mobile || row.office_phone));

    const canonicalMatches = [];
    for (const item of candidates) {
      if (!item.id) {
        if (!canonicalMatches.some(match => match.kind === 'card_unbound' && match.row && match.row.row_id === item.row.row_id)) {
          canonicalMatches.push({ kind: 'card_unbound', id: '', row: item.row });
        }
        continue;
      }
      const identity = await D1ReadModule.findUserByIdentity(env, item.id).catch(() => null);
      const canonicalId = D1ReadModule.text(identity && identity.canonicalId, item.id);
      const user = identity && identity.user ? identity.user : null;
      const preferredRow = user || item.row;
      if (!canonicalMatches.some(match => match.id === canonicalId)) {
        canonicalMatches.push({
          kind: user ? 'user' : item.kind,
          id: canonicalId,
          row: preferredRow
        });
      }
    }

    if (canonicalMatches.length > 1) {
      const boundMatches = canonicalMatches.filter(match => match.id);
      if (boundMatches.length === 1) return { match: boundMatches[0], error: '' };
      return { match: null, error: '手機對應多筆資料，請改掃 QR 或輸入客戶 UID' };
    }
    return { match: canonicalMatches[0] || null, error: '' };
  },

  async findStorePointCustomerCandidates(env, queryRaw) {
    if (!env.ACTMASTER_DB) return { matches: [], error: '' };
    const query = D1ReadModule.text(queryRaw);
    if (!query) return { matches: [], error: '' };
    const normalizedPhone = SecurityModule.normalizePhone(query);
    const isPhone = normalizedPhone.length >= 7;
    const isUid = /^U[0-9a-fA-F]{20,64}$/.test(query);
    const like = `%${query}%`;
    const phoneTail = normalizedPhone.slice(-9);

    const userWhere = isUid
      ? `line_id = ? OR row_id = ? OR point_line_id = ? OR legacy_line_id = ?`
      : isPhone
        ? `phone LIKE ? OR phone LIKE ?`
        : `name LIKE ? OR phone LIKE ? OR line_id LIKE ? OR row_id LIKE ?`;
    const userBinds = isUid
      ? [query, query, query, query]
      : isPhone
        ? [`%${normalizedPhone}%`, `%${phoneTail}%`]
        : [like, like, like, like];
    const cardWhere = isUid
      ? `line_id = ? OR owner_user_id = ? OR profile_user_id = ? OR creator_id = ?`
      : isPhone
        ? `mobile LIKE ? OR mobile LIKE ? OR office_phone LIKE ? OR office_phone LIKE ?`
        : `name LIKE ? OR mobile LIKE ? OR office_phone LIKE ? OR line_id LIKE ?`;
    const cardBinds = isUid
      ? [query, query, query, query]
      : isPhone
        ? [`%${normalizedPhone}%`, `%${phoneTail}%`, `%${normalizedPhone}%`, `%${phoneTail}%`]
        : [like, like, like, like];

    const userRows = await D1ReadModule.all(env, `
      SELECT * FROM users
      WHERE ${userWhere}
      ORDER BY row_id DESC
      LIMIT 20
    `, userBinds).catch(() => []);
    const cardRows = await D1ReadModule.all(env, `
      SELECT * FROM card_contacts
      WHERE ${cardWhere}
      ORDER BY
        CASE WHEN source_type = 'self_profile' THEN 0 ELSE 1 END,
        COALESCE(updated_at, created_at) DESC,
        row_id DESC
      LIMIT 20
    `, cardBinds).catch(() => []);
    const threadRows = await D1ReadModule.all(env, `
      SELECT *
      FROM line_oa_threads
      WHERE ${isUid ? 'user_id = ?' : 'display_name LIKE ? OR user_id LIKE ?'}
      ORDER BY COALESCE(last_event_at, updated_at, created_at) DESC
      LIMIT 20
    `, isUid ? [query] : [like, like]).catch(() => []);

    const matches = [];
    const seen = new Set();
    const addMatch = async (kind, row) => {
      if (!row) return;
      const rawId = kind === 'user'
        ? D1ReadModule.text(row.line_id || row.row_id)
        : D1ReadModule.text(row.line_id || row.profile_user_id || row.owner_user_id || row.claimed_by_uid);
      const identity = rawId ? await D1ReadModule.findUserByIdentity(env, rawId).catch(() => null) : null;
      const user = identity && identity.user ? D1ReadModule.userRow(identity.user) : (kind === 'user' ? D1ReadModule.userRow(row) : null);
      const card = kind === 'card' ? D1ReadModule.cardRow(row) : null;
      const id = D1ReadModule.text(user && user.userId) || D1ReadModule.text(identity && identity.canonicalId) || rawId;
      const key = id || `card:${D1ReadModule.text(row.row_id)}`;
      if (!key || seen.has(key)) return;
      seen.add(key);
      matches.push({
        kind: id ? (user ? 'user' : 'card') : 'card_unbound',
        id,
        row,
        user,
        card,
        name: D1ReadModule.text(user && user.name) || D1ReadModule.text(card && card.name) || D1ReadModule.text(row.name),
        phone: D1ReadModule.text(user && user.phone) || D1ReadModule.text(card && (card.mobile || card.officePhone)) || D1ReadModule.text(row.phone || row.mobile || row.office_phone),
        industry: D1ReadModule.text(user && user.industry) || D1ReadModule.text(card && (card.title || card.companyName)) || D1ReadModule.text(row.industry || row.title || row.company_name),
        avatarUrl: D1ReadModule.text(card && card.imageUrl),
        needsBinding: !id
      });
    };
    const addThreadMatch = async (row) => {
      const rawId = D1ReadModule.text(row && row.user_id);
      if (!rawId) return;
      const identity = await D1ReadModule.findUserByIdentity(env, rawId).catch(() => null);
      const user = identity && identity.user ? D1ReadModule.userRow(identity.user) : null;
      const id = D1ReadModule.text(user && user.userId) || D1ReadModule.text(identity && identity.canonicalId) || rawId;
      const key = id || `thread:${rawId}`;
      if (!key || seen.has(key)) return;
      seen.add(key);
      matches.push({
        kind: user ? 'user' : 'line_oa_thread',
        id,
        row,
        user,
        card: null,
        name: D1ReadModule.text(user && user.name) || D1ReadModule.text(row.display_name) || rawId,
        phone: D1ReadModule.text(user && user.phone),
        industry: D1ReadModule.text(user && user.industry) || 'LINE OA',
        avatarUrl: D1ReadModule.text(row.picture_url),
        needsBinding: false
      });
    };
    for (const row of userRows) await addMatch('user', row);
    for (const row of cardRows) await addMatch('card', row);
    for (const row of threadRows) await addThreadMatch(row);
    return { matches, error: '' };
  },

  async resolveStorePointCustomer(env, rawCustomerId) {
    const raw = D1ReadModule.text(rawCustomerId);
    if (!raw) return { customerPointUserId: '', rawCustomerId: raw, identity: null, user: null, card: null };

    let matchedId = raw;
    let matchedUser = null;
    let matchedCard = null;
    const looksLikePhone = !/^U[0-9a-fA-F]{20,64}$/.test(raw) && SecurityModule.normalizePhone(raw).length >= 7;
    if (looksLikePhone) {
      const phoneMatch = await this.findCustomerByPhone(env, raw);
      if (phoneMatch.error) return { error: phoneMatch.error };
      if (phoneMatch.match) {
        if (phoneMatch.match.kind === 'card_unbound') {
          return {
            customerPointUserId: '',
            rawCustomerId: raw,
            matchedId: '',
            identity: null,
            user: null,
            card: D1ReadModule.cardRow(phoneMatch.match.row),
            needsBinding: true,
            matchedBy: 'phone_card_unbound'
          };
        }
        matchedId = phoneMatch.match.id;
        if (phoneMatch.match.kind === 'user') matchedUser = D1ReadModule.userRow(phoneMatch.match.row);
        if (phoneMatch.match.kind === 'card') matchedCard = D1ReadModule.cardRow(phoneMatch.match.row);
      }
    } else if (!/^U[0-9a-fA-F]{20,64}$/.test(raw)) {
      const search = await this.findStorePointCustomerCandidates(env, raw);
      if (search.error) return { error: search.error };
      if (search.matches.length === 1) {
        const match = search.matches[0];
        if (match.needsBinding) {
          return {
            customerPointUserId: '',
            rawCustomerId: raw,
            matchedId: '',
            identity: null,
            user: null,
            card: match.card || (match.kind === 'card' ? D1ReadModule.cardRow(match.row) : null),
            needsBinding: true,
            matchedBy: 'keyword_card_unbound'
          };
        }
        matchedId = match.id;
        matchedUser = match.user || null;
        matchedCard = match.card || null;
      } else if (search.matches.length > 1) {
        return {
          error: '',
          needsSelection: true,
          rawCustomerId: raw,
          candidates: search.matches.slice(0, 10).map(match => ({
            customerPointUserId: match.id,
            name: match.name || '未命名',
            phone: match.phone || '',
            industry: match.industry || '',
            avatarUrl: match.avatarUrl || '',
            needsBinding: !!match.needsBinding,
            canAdjust: !!match.id,
            matchedBy: match.kind
          }))
        };
      }
    }

    const customerPointUserId = await this.resolvePointUserId(env, matchedId);
    const identity = env.ACTMASTER_DB
      ? await D1ReadModule.findUserByIdentity(env, matchedId).catch(() => null)
      : null;
    const user = matchedUser || (identity && identity.user ? D1ReadModule.userRow(identity.user) : null);
    let card = matchedCard;
    if (env.ACTMASTER_DB && customerPointUserId && !card) {
      const row = await D1ReadModule.cardByIdentity(env, customerPointUserId);
      card = D1ReadModule.cardRow(row);
    }

    return { customerPointUserId, rawCustomerId: raw, matchedId, identity, user, card };
  },

  cashierSessionKey(sessionId) {
    return 'STORE_CASHIER_SESSION_' + String(sessionId || '').trim();
  },

  async createStorePointCashierSession(env, payload = {}) {
    if (!env.ACTMASTER_KV) return null;
    const actorId = String(payload.actorId || '').trim();
    const customerPointUserId = String(payload.customerPointUserId || '').trim();
    if (!actorId || !customerPointUserId) return null;
    const actorPointUserId = String(payload.actorPointUserId || actorId).trim();
    const sessionId = 'SCS_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
    const session = {
      sessionId,
      actorId,
      actorPointUserId,
      customerPointUserId,
      customerPointSource: String(payload.customerPointSource || 'mother'),
      balance: this.number(payload.balance),
      motherBalance: this.number(payload.motherBalance),
      localBalance: this.number(payload.localBalance),
      actorBalance: this.number(payload.actorBalance),
      actorCanOperate: true,
      motherReady: payload.motherReady === true,
      createdAt: new Date().toISOString()
    };
    await env.ACTMASTER_KV.put(this.cashierSessionKey(sessionId), JSON.stringify(session), { expirationTtl: 180 }).catch(() => null);
    return session;
  },

  async loadStorePointCashierSession(env, sessionId, actorId, customerPointUserId) {
    if (!env.ACTMASTER_KV || !sessionId) return null;
    const raw = await env.ACTMASTER_KV.get(this.cashierSessionKey(sessionId)).catch(() => null);
    if (!raw) return null;
    let session = null;
    try { session = JSON.parse(raw); } catch (e) { return null; }
    if (String(session.actorId || '') !== String(actorId || '')) return null;
    if (String(session.customerPointUserId || '') !== String(customerPointUserId || '')) return null;
    const ageMs = Date.now() - Date.parse(session.createdAt || 0);
    if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > 180000) return null;
    return session;
  },

  async getStorePointCustomer(payload, env) {
    const rawCustomerId = String(
      payload.customerUserId ||
      payload.targetUserId ||
      payload.pointUserId ||
      payload.LINE_user_id ||
      payload.uid ||
      ''
    ).trim();
    const resolved = await this.resolveStorePointCustomer(env, rawCustomerId);
    if (resolved.error) return { success: false, error: resolved.error };
    if (resolved.needsSelection) {
      return {
        success: true,
        data: {
          customerUserId: rawCustomerId,
          matchedBy: 'keyword_candidates',
          needsSelection: true,
          candidates: resolved.candidates || []
        }
      };
    }
    if (resolved.needsBinding) {
      const mappedCard = resolved.card || null;
      return {
        success: true,
        data: {
          customerUserId: rawCustomerId,
          customerPointUserId: '',
          canonicalUserId: '',
          matchedBy: resolved.matchedBy || 'phone_card_unbound',
          needsBinding: true,
          canAdjust: false,
          canAutoBindPointAccount: false,
          name: D1ReadModule.text(mappedCard && mappedCard.name, '未綁定名片'),
          phone: D1ReadModule.text(mappedCard && (mappedCard.mobile || mappedCard['手機號碼'])),
          industry: D1ReadModule.text(mappedCard && (mappedCard.title || mappedCard.companyName || mappedCard['職稱'] || mappedCard['公司名稱'])),
          role: 'unbound_card',
          avatarUrl: D1ReadModule.text(mappedCard && mappedCard.imageUrl),
          balance: null,
          pointType: 'gift_money',
          message: '此手機找到名片，但尚未綁定會員/點數帳號，請請客戶先用 LINE 授權或掃客戶點數 QR。',
          user: null,
          card: mappedCard
        }
      };
    }
    const customerPointUserId = resolved.customerPointUserId;
    if (!customerPointUserId) return { success: false, error: 'Missing customer user id' };

    let identity = resolved.identity;
    let user = resolved.user;
    let mappedCard = resolved.card;
    if (env.ACTMASTER_DB && !mappedCard && rawCustomerId !== customerPointUserId) {
      const card = await D1ReadModule.cardByIdentity(env, rawCustomerId);
      mappedCard = D1ReadModule.cardRow(card);
    }
    if (env.ACTMASTER_DB && !identity) {
      identity = await D1ReadModule.findUserByIdentity(env, customerPointUserId).catch(() => null);
      user = identity && identity.user ? D1ReadModule.userRow(identity.user) : user;
    }
    if (env.ACTMASTER_DB && !mappedCard) {
      const card = await D1ReadModule.cardByIdentity(env, customerPointUserId);
      mappedCard = D1ReadModule.cardRow(card);
      if (!card && rawCustomerId !== customerPointUserId) {
        const fallbackCard = await D1ReadModule.cardByIdentity(env, rawCustomerId);
        mappedCard = D1ReadModule.cardRow(fallbackCard);
      }
    }

    const wallet = await this.queryPointBalanceFast({
      pointUserId: customerPointUserId,
      point_type: 'gift_money',
      page: 1,
      per_page: 20
    }, env).catch(e => ({ success: false, error: e && e.message ? e.message : String(e) }));
    const displayName = D1ReadModule.text(user && user.name)
      || D1ReadModule.text(mappedCard && mappedCard.name)
      || D1ReadModule.text(mappedCard && mappedCard['姓名'])
      || '未命名用戶';
    const phone = D1ReadModule.text(user && user.phone)
      || D1ReadModule.text(mappedCard && (mappedCard.mobile || mappedCard['手機號碼']));
    const industry = D1ReadModule.text(user && user.industry)
      || D1ReadModule.text(mappedCard && (mappedCard.title || mappedCard.companyName || mappedCard['職稱'] || mappedCard['公司名稱']));

    const localWalletIndex = await this.ensureLocalPointWallet(env, customerPointUserId, {
      name: displayName,
      phone,
      industry,
      networkId: D1ReadModule.text(user && user.networkId) || D1ReadModule.text(mappedCard && mappedCard.networkId) || 'admin'
    }).catch(e => ({ success: false, error: e.message || String(e) }));
    const motherRegistrationUrl = this.motherRegistrationUrl(env, customerPointUserId);

    if (!wallet || wallet.success === false) {
      const localBalance = await AdminPointModule.localBalance(env, customerPointUserId).catch(() => 0);
      return {
        success: true,
        data: {
          customerUserId: rawCustomerId,
          customerPointUserId,
          canonicalUserId: D1ReadModule.text(identity && identity.canonicalId, customerPointUserId),
          matchedBy: rawCustomerId === customerPointUserId ? 'uid_local_point' : 'local_customer_point_ledger',
          needsBinding: false,
          localPointOnly: true,
          localWalletRepaired: !!(localWalletIndex && localWalletIndex.success),
          localWalletIndex,
          canAdjust: true,
          canAutoBindPointAccount: false,
          motherRegistrationUrl,
          bindCustomerUserId: customerPointUserId,
          cashierSessionId: '',
          cashierPreparedAt: '',
          cashierReady: false,
          cashierPreparing: true,
          name: displayName,
          phone,
          industry,
          role: D1ReadModule.text(user && user.role, 'user'),
          avatarUrl: D1ReadModule.text(mappedCard && mappedCard.imageUrl),
          balance: localBalance,
          totalBalance: localBalance,
          pointType: 'gift_money',
          message: '已找到本地客戶；母站尚未建立點數錢包，已改用本系統點數檔，可正常贈點與扣點。',
          pointError: wallet && wallet.error ? wallet.error : 'point wallet unavailable',
          user,
          card: mappedCard
        }
      };
    }

    const motherBalance = this.number(wallet && wallet.data && wallet.data.balance);
    const localBalance = await AdminPointModule.localBalance(env, customerPointUserId).catch(() => 0);

    return {
      success: true,
      data: {
        customerUserId: rawCustomerId,
        customerPointUserId,
        canonicalUserId: D1ReadModule.text(identity && identity.canonicalId, customerPointUserId),
        matchedBy: rawCustomerId === customerPointUserId ? 'uid' : 'phone_or_identity',
        needsBinding: false,
        canAdjust: true,
        localWalletRepaired: !!(localWalletIndex && localWalletIndex.success),
        localWalletIndex,
        motherRegistrationUrl,
        cashierSessionId: '',
        cashierPreparedAt: '',
        cashierReady: false,
        cashierPreparing: true,
        name: displayName,
        phone,
        industry,
        role: D1ReadModule.text(user && user.role, 'user'),
        avatarUrl: D1ReadModule.text(mappedCard && mappedCard.imageUrl),
        balance: motherBalance,
        motherBalance,
        localBalance,
        totalBalance: motherBalance + localBalance,
        balanceSource: localBalance ? 'mother+local' : 'mother',
        pointType: 'gift_money',
        user,
        card: mappedCard
      }
    };
  },

  async prepareStorePointCashierSession(payload, env) {
    const rawCustomerId = String(
      payload.customerUserId ||
      payload.targetUserId ||
      payload.pointUserId ||
      payload.LINE_user_id ||
      payload.uid ||
      ''
    ).trim();
    const actorId = String(payload.authenticatedUserId || payload.userId || '').trim();
    if (!actorId) return { success: false, error: 'Missing operator user id' };
    const resolved = await this.resolveStorePointCustomer(env, rawCustomerId);
    if (resolved.error) return { success: false, error: resolved.error };
    if (resolved.needsSelection || resolved.needsBinding) {
      return { success: false, error: 'Customer is not ready for cashier session' };
    }
    const customerPointUserId = resolved.customerPointUserId;
    if (!customerPointUserId) return { success: false, error: 'Missing customer user id' };

    const actorPointUserId = await this.resolvePointUserId(env, actorId).catch(() => actorId);
    const [wallet, customerMotherReady] = await Promise.all([
      this.queryPointBalanceFast({
        pointUserId: customerPointUserId,
        point_type: 'gift_money',
        page: 1,
        per_page: 20
      }, env).catch(e => ({ success: false, error: e && e.message ? e.message : String(e) })),
      this.ensureMotherLineMember({ ...payload, LINE_user_id: customerPointUserId, lineUserId: customerPointUserId, userId: customerPointUserId }, env).catch(e => ({ success: false, error: e.message || String(e) }))
    ]);
    const actorBalance = 0;
    const motherReady = (!customerMotherReady || customerMotherReady.success !== false);
    let customerPointSource = 'mother';
    let balance = this.number(wallet && wallet.data && wallet.data.balance);
    let motherBalance = balance;
    const localBalance = await AdminPointModule.localBalance(env, customerPointUserId).catch(() => 0);
    if (!wallet || wallet.success === false) {
      return {
        success: false,
        error: '母站點數錢包暫時無法讀取，無法建立收銀通道。',
        data: {
          customerPointUserId,
          pointError: wallet && wallet.error ? wallet.error : 'mother wallet unavailable',
          localBalance
        }
      };
    }
    const cashierSession = await this.createStorePointCashierSession(env, {
      actorId,
      actorPointUserId,
      customerPointUserId,
      customerPointSource,
      balance,
      motherBalance,
      localBalance,
      actorBalance,
      motherReady
    });
    if (!cashierSession) return { success: false, error: 'Cashier session unavailable' };
    return {
      success: true,
      data: {
        customerPointUserId,
        cashierSessionId: cashierSession.sessionId,
        cashierPreparedAt: cashierSession.createdAt,
        cashierReady: true,
        actorCanOperate: cashierSession.actorCanOperate
      }
    };
  },

  async ensureCashierLedgerTable(env) {
    if (!env.ACTMASTER_DB) return false;
    await env.ACTMASTER_DB.prepare(`
      CREATE TABLE IF NOT EXISTS store_point_cashier_logs (
        log_id TEXT PRIMARY KEY,
        actor_user_id TEXT NOT NULL DEFAULT '',
        customer_user_id TEXT NOT NULL DEFAULT '',
        customer_point_user_id TEXT NOT NULL DEFAULT '',
        mode TEXT NOT NULL DEFAULT '',
        amount REAL NOT NULL DEFAULT 0,
        points REAL NOT NULL DEFAULT 0,
        payable_amount REAL NOT NULL DEFAULT 0,
        balance_before REAL NOT NULL DEFAULT 0,
        balance_after_estimate REAL NOT NULL DEFAULT 0,
        point_type TEXT NOT NULL DEFAULT 'gift_money',
        point_response_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    await env.ACTMASTER_DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_store_point_cashier_actor_time
      ON store_point_cashier_logs(actor_user_id, created_at)
    `).run();
    await env.ACTMASTER_DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_store_point_cashier_customer_time
      ON store_point_cashier_logs(customer_point_user_id, created_at)
    `).run();
    return true;
  },

  async storeAdjustCustomerPoints(payload, env) {
    const operatorFee = 0;
    const actorId = String(payload.authenticatedUserId || payload.userId || '').trim();
    const rawCustomerId = String(
      payload.customerUserId ||
      payload.targetUserId ||
      payload.pointUserId ||
      payload.LINE_user_id ||
      payload.uid ||
      ''
    ).trim();
    let resolvedCustomer = await this.resolveStorePointCustomer(env, rawCustomerId);
    if (resolvedCustomer.error) return { success: false, error: resolvedCustomer.error };
    const amount = Math.floor(Number(payload.amount || payload.spendAmount || payload.total || 0));
    const mode = String(payload.mode || payload.operation || 'redeem').trim().toLowerCase();
    const isReward = mode === 'reward' || mode === 'earn' || mode === 'add';
    const autoBindPointAccount = payload.autoBindPointAccount === true || String(payload.autoBindPointAccount || '') === '1';
    let customerPointUserId = resolvedCustomer.customerPointUserId;
    let autoBindResult = null;
    if (autoBindPointAccount && /^U[0-9a-fA-F]{20,64}$/.test(customerPointUserId || rawCustomerId)) {
      const bindTarget = /^U[0-9a-fA-F]{20,64}$/.test(customerPointUserId) ? customerPointUserId : rawCustomerId;
      autoBindResult = await LineOAChatModule.ensureLineOAPointBinding(env, bindTarget, {
        name: D1ReadModule.text(resolvedCustomer.user && resolvedCustomer.user.name) ||
          D1ReadModule.text(resolvedCustomer.card && resolvedCustomer.card.name)
      }).catch(e => ({ success: false, error: e.message || String(e) }));
      if (!autoBindResult || autoBindResult.success === false) {
        return { success: false, error: autoBindResult && autoBindResult.error ? autoBindResult.error : 'Point account bind failed', data: { autoBindResult } };
      }
      resolvedCustomer = await this.resolveStorePointCustomer(env, bindTarget);
      if (resolvedCustomer.error) return { success: false, error: resolvedCustomer.error };
      customerPointUserId = resolvedCustomer.customerPointUserId || bindTarget;
    }

    if (!actorId) return { success: false, error: 'Missing operator user id' };
    if (!customerPointUserId) return { success: false, error: 'Missing customer user id' };
    if (!amount || amount <= 0) return { success: false, error: '消費金額必須大於 0' };

    const customerLocalWalletIndex = await this.ensureLocalPointWallet(env, customerPointUserId, {
      name: D1ReadModule.text(resolvedCustomer.user && resolvedCustomer.user.name) ||
        D1ReadModule.text(resolvedCustomer.card && resolvedCustomer.card.name),
      phone: D1ReadModule.text(resolvedCustomer.user && resolvedCustomer.user.phone) ||
        D1ReadModule.text(resolvedCustomer.card && (resolvedCustomer.card.mobile || resolvedCustomer.card.officePhone)),
      industry: D1ReadModule.text(resolvedCustomer.user && resolvedCustomer.user.industry) ||
        D1ReadModule.text(resolvedCustomer.card && (resolvedCustomer.card.title || resolvedCustomer.card.companyName)),
      networkId: D1ReadModule.text(resolvedCustomer.user && resolvedCustomer.user.networkId) ||
        D1ReadModule.text(resolvedCustomer.card && resolvedCustomer.card.networkId) ||
        D1ReadModule.text(payload.authenticatedNetworkId || payload.networkId || 'admin')
    }).catch(e => ({ success: false, error: e.message || String(e) }));

    const cashierSession = await this.loadStorePointCashierSession(env, payload.cashierSessionId, actorId, customerPointUserId);

    let wallet = cashierSession
      ? { success: true, data: { balance: cashierSession.balance }, prepared: true }
      : await this.queryUserPoints({
          pointUserId: customerPointUserId,
          point_type: 'gift_money',
          page: 1,
          per_page: 100
        }, env);
    let customerPointSource = cashierSession ? (cashierSession.customerPointSource || 'mother') : 'mother';
    if (!wallet || !wallet.success) {
      return { success: false, error: wallet && wallet.error ? wallet.error : '無法取得客戶點數' };
    }
    if (customerPointSource !== 'mother') {
      return {
        success: false,
        error: '此客戶目前尚未完成母站點數錢包同步；本次未送出點數。',
        data: {
          customerPointUserId,
          customerPointSource,
          cashierSessionId: payload.cashierSessionId || '',
          requiresMotherWallet: true
        }
      };
    }

    const balanceBefore = wallet && wallet.success ? Math.max(0, Math.floor(Number(wallet.data?.balance || 0))) : 0;
    let points = 0;
    let payableAmount = amount;
    let eventName = '';
    let eventContent = '';
    const actorIdentity = env.ACTMASTER_DB
      ? await D1ReadModule.findUserByIdentity(env, actorId).catch(() => null)
      : null;
    const actorProfile = actorIdentity && actorIdentity.user ? D1ReadModule.userRow(actorIdentity.user) : null;
    const sourceName = D1ReadModule.text(actorProfile && actorProfile.name)
      || D1ReadModule.text(actorProfile && actorProfile.storeId)
      || D1ReadModule.text(actorProfile && actorProfile.phone)
      || actorId;
    const sourceLabel = sourceName.length > 28 ? sourceName.slice(0, 28) + '...' : sourceName;

    if (!cashierSession || cashierSession.motherReady !== true) {
      const pointMemberIds = Array.from(new Set([customerPointUserId].filter(Boolean)));
      const pointMemberResults = await Promise.all(pointMemberIds.map(lineUserId => this.ensureMotherLineMember({
        ...payload,
        LINE_user_id: lineUserId,
        lineUserId,
        userId: lineUserId
      }, env).catch(e => ({ success: false, error: e && e.message ? e.message : String(e), lineUserId }))));
      const failedPointMember = pointMemberResults.find(item => item && item.success === false);
      if (failedPointMember) {
        return { success: false, error: 'Mother member setup failed: ' + (failedPointMember.error || failedPointMember.code || 'unknown'), data: { motherMember: failedPointMember } };
      }
    }

    if (isReward) {
      points = amount;
      eventName = '店家消費贈點';
      eventContent = `來源：${sourceLabel}；消費 NT$${amount.toLocaleString('zh-TW')}，1:1 贈送 ${points.toLocaleString('zh-TW')} 點`;
    } else {
      const requestedDeduction = Math.floor(Number(payload.deductPoints || payload.discountPoints || payload.redeemPoints || 0));
      if (!requestedDeduction || requestedDeduction <= 0) {
        return {
          success: false,
          error: '請輸入本次折抵點數',
          data: { amount, balanceBefore, requestedDeduction: 0, payableAmount: amount }
        };
      }
      if (requestedDeduction > amount) {
        return {
          success: false,
          error: '折抵點數不可大於消費金額',
          data: { amount, balanceBefore, requestedDeduction, payableAmount: amount }
        };
      }
      if (requestedDeduction > balanceBefore) {
        return {
          success: false,
          error: '客戶可用點數不足',
          data: { amount, balanceBefore, requestedDeduction, payableAmount: amount }
        };
      }
      const deductPoints = requestedDeduction;
      if (!deductPoints || deductPoints <= 0) {
        return {
          success: false,
          error: '客戶可用點數不足，無法折抵',
          data: { amount, balanceBefore, requestedDeduction, payableAmount: amount }
        };
      }
      points = -deductPoints;
      payableAmount = Math.max(0, amount - deductPoints);
      eventName = '店家消費折抵';
      eventContent = `來源：${sourceLabel}；消費 NT$${amount.toLocaleString('zh-TW')}，折抵 ${deductPoints.toLocaleString('zh-TW')} 點，應收 NT$${payableAmount.toLocaleString('zh-TW')}`;
    }

    const operatorFeeResult = { status: 'free', skipped: true, pointType: 'gift_money', points: 0 };

    const result = await this.insertUserPoint({
      userId: customerPointUserId,
      points,
      pointType: 'gift_money',
      eventName,
      eventContent,
      shop_user_lineid: actorId,
      child_shop_name: sourceLabel,
      shop_remark: `source=${sourceLabel}; store_cashier operator=${actorId}; customer=${customerPointUserId}; amount=${amount}; mode=${isReward ? 'reward' : 'redeem'}`,
      skipMotherMemberSetup: true
    }, env);

    if (!result || !result.success) {
      const resultError = result && result.error ? String(result.error) : '';
      if (/查無|對應會員|LINE_user_id|not\s*found|member/i.test(resultError)) {
        return {
          success: false,
          error: '母站查無此點數會員，請先掃描客戶點數 QR 或完成點數通綁定後再操作。',
          data: { requiresPointQr: true, customerPointUserId, pointResult: result }
        };
      }
      return { success: false, error: result && result.error ? result.error : '點數流水寫入失敗', data: result };
    }

    const changedPoints = Math.abs(points);
    const ledgerId = `SPC_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const syncJob = null;
    if (await this.ensureCashierLedgerTable(env)) {
      await env.ACTMASTER_DB.prepare(`
        INSERT INTO store_point_cashier_logs (
          log_id, actor_user_id, customer_user_id, customer_point_user_id,
          mode, amount, points, payable_amount, balance_before, balance_after_estimate,
          point_type, point_response_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'gift_money', ?)
      `).bind(
        ledgerId,
        actorId,
        rawCustomerId,
        customerPointUserId,
        isReward ? 'reward' : 'redeem',
        amount,
        points,
        payableAmount,
        balanceBefore,
        balanceBefore + points,
        JSON.stringify({
          pointResult: result.data || result,
          customerPointSource: 'mother',
          syncStatus: 'synced',
          localPointOnly: false
        })
      ).run();
    }

    return {
      success: true,
      data: {
        ledgerId,
        mode: isReward ? 'reward' : 'redeem',
        customerPointUserId,
        amount,
        points,
        changedPoints,
        payableAmount,
        requestedDeduction: isReward ? 0 : Math.floor(Number(payload.deductPoints || payload.discountPoints || payload.redeemPoints || 0)),
        balanceBefore,
        balanceAfterEstimate: balanceBefore + points,
        customerPointSource,
        localPointOnly: customerPointSource === 'local',
        localWalletRepaired: !!(customerLocalWalletIndex && customerLocalWalletIndex.success),
        localWalletIndex: customerLocalWalletIndex,
        syncJob,
        autoBoundPointAccount: !!autoBindResult,
        autoBindResult,
        eventName,
        eventContent,
        operatorFee,
        operatorFeeResult,
        insertResult: result.data || result
      }
    };
  },

  async listStorePointCashierLogs(payload, env) {
    if (!env.ACTMASTER_DB) return { success: false, error: 'Missing ACTMASTER_DB binding' };
    await this.ensureCashierLedgerTable(env);

    const actorId = String(payload.authenticatedUserId || payload.userId || '').trim();
    const role = SecurityModule.normalizeRole(payload.authenticatedRole || payload.role || '');
    const limit = Math.min(50, Math.max(1, Math.floor(Number(payload.limit || 10))));
    if (!actorId) return { success: false, error: 'Missing operator user id' };

    const binds = role === 'admin' ? [limit] : [actorId, limit];
    const where = role === 'admin' ? '' : 'WHERE actor_user_id = ?';
    const rows = await D1ReadModule.all(env, `
      SELECT *
      FROM store_point_cashier_logs
      ${where}
      ORDER BY created_at DESC
      LIMIT ?
    `, binds);

    const list = [];
    for (const row of rows) {
      const customerId = D1ReadModule.text(row.customer_point_user_id || row.customer_user_id);
      const identity = customerId ? await D1ReadModule.findUserByIdentity(env, customerId).catch(() => null) : null;
      const user = identity && identity.user ? D1ReadModule.userRow(identity.user) : null;
      let card = null;
      if (customerId) {
        card = await D1ReadModule.first(env, `
          SELECT * FROM card_contacts
          WHERE line_id = ? OR creator_id = ?
          ORDER BY COALESCE(updated_at, created_at) DESC
          LIMIT 1
        `, [customerId, customerId]).catch(() => null);
      }
      const mappedCard = D1ReadModule.cardRow(card);
      const customerName = D1ReadModule.text(user && user.name)
        || D1ReadModule.text(mappedCard && mappedCard.name)
        || D1ReadModule.text(row.customer_point_user_id, '客戶');
      const customerPhone = D1ReadModule.text(user && user.phone)
        || D1ReadModule.text(mappedCard && mappedCard.mobile);

      list.push({
        logId: D1ReadModule.text(row.log_id),
        actorUserId: D1ReadModule.text(row.actor_user_id),
        customerUserId: D1ReadModule.text(row.customer_user_id),
        customerPointUserId: customerId,
        customerName,
        customerPhone,
        customerAvatarUrl: D1ReadModule.text(mappedCard && mappedCard.imageUrl),
        mode: D1ReadModule.text(row.mode),
        amount: Number(row.amount || 0) || 0,
        points: Number(row.points || 0) || 0,
        payableAmount: Number(row.payable_amount || 0) || 0,
        balanceBefore: Number(row.balance_before || 0) || 0,
        balanceAfterEstimate: Number(row.balance_after_estimate || 0) || 0,
        pointType: D1ReadModule.text(row.point_type, 'gift_money'),
        createdAt: D1ReadModule.text(row.created_at)
      });
    }

    return {
      success: true,
      data: {
        role,
        scope: role === 'admin' ? 'all' : 'own_store',
        list
      }
    };
  },

  async repairPointWalletSearchIndex(payload, env) {
    if (!env.ACTMASTER_DB) return { success: false, error: 'Missing ACTMASTER_DB binding' };
    const limit = Math.min(500, Math.max(1, Math.floor(Number(payload.limit || 200))));
    const dryRun = payload.dryRun === true || String(payload.dryRun || '') === '1';
    const uidPattern = /^U[0-9a-fA-F]{20,64}$/;
    const candidates = [];
    const seen = new Set();
    const addCandidate = (source, id, profile = {}) => {
      const userId = D1ReadModule.text(id);
      if (!uidPattern.test(userId) || seen.has(userId)) return;
      seen.add(userId);
      candidates.push({ source, userId, profile });
    };

    const userRows = await D1ReadModule.all(env, `
      SELECT row_id, line_id, name, phone, industry, network_id, role, point_line_id, legacy_line_id
      FROM users
      WHERE (line_id LIKE 'U%' OR row_id LIKE 'U%' OR point_line_id LIKE 'U%' OR legacy_line_id LIKE 'U%')
      ORDER BY COALESCE(updated_at, created_at) DESC
      LIMIT ?
    `, [limit]).catch(() => []);
    for (const row of userRows) {
      addCandidate('users', row.line_id || row.point_line_id || row.legacy_line_id || row.row_id, {
        name: row.name,
        phone: row.phone,
        industry: row.industry,
        networkId: row.network_id
      });
    }

    const threadRows = await D1ReadModule.all(env, `
      SELECT user_id, display_name, picture_url
      FROM line_oa_threads
      WHERE user_id LIKE 'U%'
      ORDER BY COALESCE(last_event_at, updated_at, created_at) DESC
      LIMIT ?
    `, [limit]).catch(() => []);
    for (const row of threadRows) {
      addCandidate('line_oa_threads', row.user_id, {
        name: row.display_name,
        avatarUrl: row.picture_url,
        industry: 'LINE OA',
        networkId: 'admin'
      });
    }

    const cardRows = await D1ReadModule.all(env, `
      SELECT line_id, profile_user_id, owner_user_id, claimed_by_uid, name, mobile, office_phone, title, company_name, network_id
      FROM card_contacts
      WHERE line_id LIKE 'U%' OR profile_user_id LIKE 'U%' OR owner_user_id LIKE 'U%' OR claimed_by_uid LIKE 'U%'
      ORDER BY COALESCE(updated_at, created_at) DESC
      LIMIT ?
    `, [limit]).catch(() => []);
    for (const row of cardRows) {
      addCandidate('card_contacts', row.line_id || row.profile_user_id || row.owner_user_id || row.claimed_by_uid, {
        name: row.name,
        phone: row.mobile || row.office_phone,
        industry: row.title || row.company_name,
        networkId: row.network_id || 'admin'
      });
    }

    const repaired = [];
    const failed = [];
    if (!dryRun) {
      for (const item of candidates) {
        const result = await this.ensureLocalPointWallet(env, item.userId, item.profile)
          .catch(e => ({ success: false, error: e.message || String(e) }));
        if (result && result.success) repaired.push({ userId: item.userId, source: item.source, rowId: result.rowId });
        else failed.push({ userId: item.userId, source: item.source, error: result && result.error ? result.error : 'repair failed' });
      }
    }

    return {
      success: true,
      data: {
        dryRun,
        scanned: {
          users: userRows.length,
          lineOAThreads: threadRows.length,
          cards: cardRows.length
        },
        candidateCount: candidates.length,
        repairedCount: dryRun ? 0 : repaired.length,
        failedCount: failed.length,
        candidates: dryRun ? candidates.slice(0, 50) : undefined,
        repaired: repaired.slice(0, 50),
        failed: failed.slice(0, 50)
      }
    };
  }
};

const AdminPointModule = {
  text(value, fallback = '') {
    const next = String(value ?? '').trim();
    return next || fallback;
  },
  number(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  },

  async ensure(env) {
    if (!env.ACTMASTER_DB) throw new Error('Missing ACTMASTER_DB binding');
    await env.ACTMASTER_DB.prepare(`
      CREATE TABLE IF NOT EXISTS admin_point_ledger (
        row_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL DEFAULT '',
        actor_user_id TEXT NOT NULL DEFAULT '',
        mode TEXT NOT NULL DEFAULT 'grant',
        points REAL NOT NULL DEFAULT 0,
        balance_after REAL NOT NULL DEFAULT 0,
        note TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT 'admin_local',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_admin_point_ledger_user_time ON admin_point_ledger(user_id, created_at)').run();
  },

  async resolveUser(env, rawUserId) {
    const id = this.text(rawUserId);
    if (!id) return { userId: '', user: null };
    const identity = await D1ReadModule.findUserByIdentity(env, id).catch(() => null);
    const row = identity && identity.user ? identity.user : null;
    const userId = D1ReadModule.text(row && row.line_id) || D1ReadModule.text(identity && identity.canonicalId) || id;
    return { userId, user: row ? D1ReadModule.userRow(row, 'admin_point') : null };
  },

  async localRows(env, userId, limit = 20) {
    await this.ensure(env);
    return await D1ReadModule.all(env, `
      SELECT *
      FROM admin_point_ledger
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `, [userId, limit]).catch(() => []);
  },

  async localBalance(env, userId) {
    await this.ensure(env);
    const row = await D1ReadModule.first(env, `
      SELECT COALESCE(SUM(points), 0) AS balance
      FROM admin_point_ledger
      WHERE user_id = ?
    `, [userId]).catch(() => null);
    return this.number(row && row.balance);
  },

  mapRow(row) {
    return {
      rowId: this.text(row.row_id),
      userId: this.text(row.user_id),
      actorUserId: this.text(row.actor_user_id),
      mode: this.text(row.mode),
      points: this.number(row.points),
      balanceAfter: this.number(row.balance_after),
      note: this.text(row.note),
      source: this.text(row.source),
      createdAt: this.text(row.created_at)
    };
  },

  async profile(payload, env) {
    const rawUserId = this.text(payload.userId || payload.targetUserId || payload.customerUserId || payload.LINE_user_id);
    const resolved = await this.resolveUser(env, rawUserId);
    if (!resolved.userId) return { success: false, error: 'Missing user id' };
    const mother = await PointModule.queryUserPoints({
      pointUserId: resolved.userId,
      point_type: 'gift_money',
      page: 1,
      per_page: 20
    }, env).catch(e => ({ success: false, error: e.message || String(e) }));
    const rows = await this.localRows(env, resolved.userId, 30);
    const localBalance = await this.localBalance(env, resolved.userId);
    const motherBalance = mother && mother.success ? this.number(mother.data && mother.data.balance) : null;
    const motherRows = mother && mother.success && Array.isArray(mother.data && mother.data.list) ? mother.data.list : [];
    return {
      success: true,
      data: {
        userId: resolved.userId,
        user: resolved.user,
        source: mother && mother.success ? 'mother+local' : 'local',
        motherAvailable: !!(mother && mother.success),
        motherError: mother && mother.success ? '' : this.text(mother && mother.error, 'Mother point member not found'),
        balance: (motherBalance === null ? 0 : motherBalance) + localBalance,
        motherBalance,
        localBalance,
        rows: rows.map(row => this.mapRow(row)),
        motherRows
      }
    };
  },

  async adjust(payload, env) {
    const actorId = this.text(payload.authenticatedUserId || payload.userId);
    const rawUserId = this.text(payload.targetUserId || payload.customerUserId || payload.LINE_user_id);
    const mode = this.text(payload.mode || payload.operation || 'grant').toLowerCase();
    let points = Math.abs(this.number(payload.points || payload.amount || payload.get_point));
    if (!rawUserId) return { success: false, error: 'Missing target user id' };
    if (!points) return { success: false, error: 'Missing points' };
    if (['deduct', 'debit', 'subtract'].includes(mode)) points = -points;
    const resolved = await this.resolveUser(env, rawUserId);
    const before = await this.localBalance(env, resolved.userId);
    const after = before + points;
    if (after < 0) return { success: false, error: 'Local point balance is insufficient' };
    await this.ensure(env);
    const rowId = `APL_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await env.ACTMASTER_DB.prepare(`
      INSERT INTO admin_point_ledger (row_id,user_id,actor_user_id,mode,points,balance_after,note,source)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'admin_local')
    `).bind(rowId, resolved.userId, actorId, points >= 0 ? (mode === 'backfill' ? 'backfill' : 'grant') : 'deduct', points, after, this.text(payload.note)).run();
    return await this.profile({ userId: resolved.userId }, env);
  }
};

const PointSyncModule = {
  text(value, fallback = '') {
    const next = String(value ?? '').trim();
    return next || fallback;
  },
  number(value) {
    const num = Number(value || 0);
    return Number.isFinite(num) ? num : 0;
  },

  json(value) {
    try {
      const parsed = typeof value === 'string' ? JSON.parse(value || '{}') : (value || {});
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (e) {
      return {};
    }
  },

  async ensure(env) {
    if (!env.ACTMASTER_DB) return false;
    await env.ACTMASTER_DB.prepare(`
      CREATE TABLE IF NOT EXISTS point_sync_jobs (
        job_id TEXT PRIMARY KEY,
        line_user_id TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT '',
        source_ref TEXT NOT NULL DEFAULT '',
        points REAL NOT NULL DEFAULT 0,
        point_type TEXT NOT NULL DEFAULT 'gift_money',
        status TEXT NOT NULL DEFAULT 'pending',
        retry_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT NOT NULL DEFAULT '',
        payload_json TEXT NOT NULL DEFAULT '{}',
        result_json TEXT NOT NULL DEFAULT '{}',
        created_by TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        synced_at TEXT NOT NULL DEFAULT ''
      )
    `).run();
    await env.ACTMASTER_DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_point_sync_jobs_user_status
      ON point_sync_jobs(line_user_id, status, created_at)
    `).run();
    await env.ACTMASTER_DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_point_sync_jobs_status_time
      ON point_sync_jobs(status, created_at)
    `).run();
    await env.ACTMASTER_DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_point_sync_jobs_source_ref
      ON point_sync_jobs(source, source_ref)
    `).run();
    return true;
  },

  mapJob(row) {
    return {
      jobId: this.text(row.job_id),
      lineUserId: this.text(row.line_user_id),
      source: this.text(row.source),
      sourceRef: this.text(row.source_ref),
      points: this.number(row.points),
      pointType: this.text(row.point_type, 'gift_money'),
      status: this.text(row.status, 'pending'),
      retryCount: Math.floor(this.number(row.retry_count)),
      lastError: this.text(row.last_error),
      payload: this.json(row.payload_json),
      result: this.json(row.result_json),
      createdBy: this.text(row.created_by),
      createdAt: this.text(row.created_at),
      updatedAt: this.text(row.updated_at),
      syncedAt: this.text(row.synced_at)
    };
  },

  async enqueue(payload, env) {
    if (!await this.ensure(env)) return { success: false, error: 'Missing ACTMASTER_DB binding' };
    const rawUserId = this.text(payload.query || payload.lineUserId || payload.customerUserId || payload.LINE_user_id || payload.uid || payload.targetUserId);
    const resolved = rawUserId ? await PointModule.resolveStorePointCustomer(env, rawUserId).catch(() => null) : null;
    const lineUserId = this.text(resolved && resolved.customerPointUserId)
      || (rawUserId ? await PointModule.resolvePointUserId(env, rawUserId).catch(() => rawUserId) : '');
    const points = this.number(payload.points || payload.get_point || payload.amount);
    const source = this.text(payload.source || payload.awardType || payload.eventName || 'manual_sync');
    const sourceRef = this.text(payload.sourceRef || payload.refId || payload.ledgerId || payload.awardId);
    if (!lineUserId) return { success: false, error: 'Missing LINE user id' };
    if (!points) return { success: false, error: 'Missing points' };
    const jobId = this.text(payload.jobId) || `PSJ_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const actorId = this.text(payload.authenticatedUserId || payload.createdBy || payload.userId);
    await env.ACTMASTER_DB.prepare(`
      INSERT INTO point_sync_jobs (
        job_id, line_user_id, source, source_ref, points, point_type,
        status, payload_json, created_by, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, CURRENT_TIMESTAMP)
    `).bind(
      jobId,
      lineUserId,
      source,
      sourceRef,
      points,
      this.text(payload.pointType || payload.point_type, 'gift_money'),
      JSON.stringify(payload.payload || payload || {}),
      actorId
    ).run();
    const row = await D1ReadModule.first(env, 'SELECT * FROM point_sync_jobs WHERE job_id = ?', [jobId]);
    return { success: true, data: this.mapJob(row) };
  },

  async list(payload, env) {
    if (!await this.ensure(env)) return { success: false, error: 'Missing ACTMASTER_DB binding' };
    const status = this.text(payload.status);
    const rawUserId = this.text(payload.query || payload.lineUserId || payload.customerUserId || payload.LINE_user_id || payload.uid || payload.targetUserId);
    const resolved = rawUserId ? await PointModule.resolveStorePointCustomer(env, rawUserId).catch(() => null) : null;
    const lineUserId = this.text(resolved && resolved.customerPointUserId)
      || (rawUserId ? await PointModule.resolvePointUserId(env, rawUserId).catch(() => rawUserId) : '');
    const limit = Math.min(100, Math.max(1, Math.floor(this.number(payload.limit || 30))));
    const where = [];
    const binds = [];
    if (status) {
      where.push('status = ?');
      binds.push(status);
    }
    if (lineUserId) {
      where.push('line_user_id = ?');
      binds.push(lineUserId);
    }
    binds.push(limit);
    const rows = await D1ReadModule.all(env, `
      SELECT *
      FROM point_sync_jobs
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY created_at DESC
      LIMIT ?
    `, binds);
    return { success: true, data: rows.map(row => this.mapJob(row)) };
  },

  async recentForUser(env, userId, limit = 20) {
    if (!env.ACTMASTER_DB || !userId) return [];
    await this.ensure(env);
    const rows = await D1ReadModule.all(env, `
      SELECT *
      FROM point_sync_jobs
      WHERE line_user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `, [userId, Math.min(50, Math.max(1, limit))]).catch(() => []);
    return rows.map(row => this.mapJob(row));
  },

  async updateJob(env, jobId, fields = {}) {
    const status = this.text(fields.status);
    const lastError = this.text(fields.lastError);
    const resultJson = JSON.stringify(fields.result || {});
    const syncedAt = status === 'synced' ? new Date().toISOString() : this.text(fields.syncedAt);
    await env.ACTMASTER_DB.prepare(`
      UPDATE point_sync_jobs
      SET status = COALESCE(NULLIF(?, ''), status),
          retry_count = CASE WHEN ? = 1 THEN retry_count + 1 ELSE retry_count END,
          last_error = ?,
          result_json = ?,
          updated_at = CURRENT_TIMESTAMP,
          synced_at = CASE WHEN ? <> '' THEN ? ELSE synced_at END
      WHERE job_id = ?
    `).bind(
      status,
      fields.incrementRetry ? 1 : 0,
      lastError,
      resultJson,
      syncedAt,
      syncedAt,
      jobId
    ).run();
  },

  eventName(source, points) {
    const labels = {
      store_reward_local_wallet: '子站店家贈點同步',
      store_redeem_local_wallet: '子站店家扣點同步',
      daily_checkin_local_wallet: '子站每日簽到同步',
      share_url_join_local_wallet: '子站分享加入同步',
      line_oa_follow: 'LINE 加好友贈點同步',
      new_user_join: '子站新會員同步',
      card_scan_create: '子站名片建檔同步',
      manual_sync: '手動點數同步'
    };
    return labels[this.text(source)] || (points >= 0 ? '子站點數補同步' : '子站點數扣抵同步');
  },

  eventContent(job) {
    const points = this.number(job.points);
    const action = points >= 0 ? '補入' : '扣除';
    return `子站點數佇列同步：${action} ${Math.abs(points).toLocaleString('zh-TW')} 點；來源 ${this.text(job.source, 'unknown')}；job ${this.text(job.jobId)}`;
  },

  async processJob(job, env) {
    if (!job || !job.jobId) return { success: false, error: 'Missing job' };
    const points = this.number(job.points);
    const source = this.text(job.source);
    if (points > 0 && ['share_url_join_local_wallet', 'new_user_join'].includes(source)) {
      await this.updateJob(env, job.jobId, {
        status: 'synced',
        lastError: '',
        result: { skipped: true, reason: 'join_points_are_owned_by_line_oa_follow', source, points }
      });
      return { success: true, skipped: true, jobId: job.jobId, reason: 'join_points_are_owned_by_line_oa_follow' };
    }
    if (!job.lineUserId || !points) {
      await this.updateJob(env, job.jobId, {
        status: 'failed',
        incrementRetry: true,
        lastError: 'Missing line user id or points'
      });
      return { success: false, error: 'Missing line user id or points', jobId: job.jobId };
    }
    const result = await PointModule.insertUserPoint({
      userId: job.lineUserId,
      points,
      pointType: job.pointType || 'gift_money',
      eventName: this.eventName(job.source, points),
      eventContent: this.eventContent(job),
      shop_user_lineid: job.createdBy || '',
      child_shop_name: 'LINE 子站同步',
      shop_remark: `point_sync_job=${job.jobId}; source=${job.source}; source_ref=${job.sourceRef}`
    }, env).catch(e => ({ success: false, error: e.message || String(e) }));
    if (result && result.success) {
      await this.updateJob(env, job.jobId, {
        status: 'synced',
        lastError: '',
        result: result.data || result
      });
      return { success: true, jobId: job.jobId, data: result.data || result };
    }
    const error = this.text(result && result.error, 'Point sync failed');
    await this.updateJob(env, job.jobId, {
      status: 'failed',
      incrementRetry: true,
      lastError: error,
      result: result || {}
    });
    return { success: false, jobId: job.jobId, error };
  },

  async process(payload, env) {
    if (!await this.ensure(env)) return { success: false, error: 'Missing ACTMASTER_DB binding' };
    const limit = Math.min(50, Math.max(1, Math.floor(this.number(payload.limit || 10))));
    const maxRetry = Math.min(20, Math.max(1, Math.floor(this.number(payload.maxRetry || 5))));
    const rawUserId = this.text(payload.lineUserId || payload.userId || payload.customerUserId || payload.LINE_user_id || payload.uid);
    const lineUserId = rawUserId ? await PointModule.resolvePointUserId(env, rawUserId).catch(() => rawUserId) : '';
    const binds = [maxRetry];
    let userWhere = '';
    if (lineUserId) {
      userWhere = 'AND line_user_id = ?';
      binds.push(lineUserId);
    }
    binds.push(limit);
    const rows = await D1ReadModule.all(env, `
      SELECT *
      FROM point_sync_jobs
      WHERE status IN ('pending', 'failed')
        AND retry_count < ?
        ${userWhere}
      ORDER BY created_at ASC
      LIMIT ?
    `, binds);
    const jobs = rows.map(row => this.mapJob(row));
    const results = [];
    for (const job of jobs) {
      const locked = await env.ACTMASTER_DB.prepare(`
        UPDATE point_sync_jobs
        SET status = 'processing', updated_at = CURRENT_TIMESTAMP
        WHERE job_id = ? AND status IN ('pending', 'failed')
      `).bind(job.jobId).run().catch(() => null);
      if (!locked || ((locked.meta && Number(locked.meta.changes || 0)) === 0)) continue;
      results.push(await this.processJob(job, env));
    }
    return {
      success: true,
      data: {
        requested: limit,
        picked: jobs.length,
        processed: results.length,
        synced: results.filter(item => item.success).length,
        failed: results.filter(item => !item.success).length,
        results
      }
    };
  },

  async diagnose(payload, env) {
    if (!env.ACTMASTER_DB) return { success: false, error: 'Missing ACTMASTER_DB binding' };
    await this.ensure(env);
    const raw = this.text(payload.query || payload.lineUserId || payload.customerUserId || payload.LINE_user_id || payload.uid || payload.targetUserId);
    if (!raw) return { success: false, error: 'Missing query user id' };
    const resolved = await PointModule.resolveStorePointCustomer(env, raw).catch(e => ({ error: e.message || String(e) }));
    const pointUserId = this.text(resolved && resolved.customerPointUserId) || await PointModule.resolvePointUserId(env, raw).catch(() => raw) || raw;
    const identity = pointUserId ? await D1ReadModule.findUserByIdentity(env, pointUserId).catch(() => null) : null;
    const user = identity && identity.user ? D1ReadModule.userRow(identity.user) : null;
    const mother = pointUserId ? await PointModule.queryPointBalanceFast({
      pointUserId,
      point_type: this.text(payload.pointType || payload.point_type, 'gift_money')
    }, env).catch(e => ({ success: false, error: e.message || String(e) })) : null;
    const localBalance = pointUserId ? await AdminPointModule.localBalance(env, pointUserId).catch(() => 0) : 0;
    const jobs = pointUserId ? await this.recentForUser(env, pointUserId, Math.floor(this.number(payload.jobLimit || 20))) : [];
    const search = await PointModule.findStorePointCustomerCandidates(env, raw).catch(e => ({ matches: [], error: e.message || String(e) }));
    const userIndexRow = pointUserId ? await D1ReadModule.first(env, `
      SELECT row_id, line_id, name, phone, role, network_id, point_line_id, legacy_line_id, identity_source, migrated_at
      FROM users
      WHERE row_id = ? OR line_id = ? OR point_line_id = ? OR legacy_line_id = ?
      LIMIT 1
    `, [pointUserId, pointUserId, pointUserId, pointUserId]).catch(() => null) : null;
    const pendingPoints = jobs
      .filter(job => job.status === 'pending' || job.status === 'failed')
      .reduce((sum, job) => sum + this.number(job.points), 0);
    const motherBalance = mother && mother.success ? this.number(mother.data && mother.data.balance) : null;
    return {
      success: true,
      data: {
        query: raw,
        pointUserId,
        resolved: {
          matchedBy: this.text(resolved && resolved.matchedBy),
          needsBinding: !!(resolved && resolved.needsBinding),
          needsSelection: !!(resolved && resolved.needsSelection),
          error: this.text(resolved && resolved.error),
          candidates: resolved && Array.isArray(resolved.candidates) ? resolved.candidates : []
        },
        mother: {
          available: !!(mother && mother.success),
          balance: motherBalance,
          error: mother && mother.success ? '' : this.text(mother && mother.error),
          code: this.text(mother && mother.code)
        },
        local: {
          indexed: !!userIndexRow,
          balance: localBalance,
          user,
          indexRow: userIndexRow || null
        },
        sync: {
          pendingCount: jobs.filter(job => job.status === 'pending').length,
          failedCount: jobs.filter(job => job.status === 'failed').length,
          pendingPoints,
          jobs
        },
        searchIndex: {
          candidateCount: Array.isArray(search.matches) ? search.matches.length : 0,
          error: this.text(search.error),
          candidates: Array.isArray(search.matches) ? search.matches.slice(0, 10).map(match => ({
            kind: match.kind,
            id: match.id,
            name: match.name,
            phone: match.phone,
            industry: match.industry,
            needsBinding: !!match.needsBinding
          })) : []
        },
        summary: {
          status: mother && mother.success ? (pendingPoints ? 'mother_ready_with_pending_local_sync' : 'mother_ready') : (localBalance ? 'local_only_needs_sync' : 'missing_wallet'),
          operableBalance: motherBalance === null ? localBalance : motherBalance,
          totalKnownBalance: (motherBalance === null ? 0 : motherBalance) + localBalance,
          recommendedAction: mother && mother.success
            ? (pendingPoints ? 'sync_pending_local_points_to_mother' : 'none')
            : (localBalance ? 'register_or_bind_mother_wallet_then_sync' : 'create_mother_wallet_or_local_index')
        }
      }
    };
  }
};

const SubsiteHomeModule = {
  text(value, fallback = '') {
    const next = String(value ?? '').trim();
    return next || fallback;
  },

  effectiveRole(user, payload) {
    const payloadRole = this.text(payload.authenticatedRole || payload.role);
    const userRole = this.text(user && user.role);
    return SecurityModule.normalizeRole(payloadRole || userRole || 'user');
  },

  canUseStorePointCashier(role) {
    return role === 'admin' || role === 'store' || role === 'tenant';
  },

  isOwnSelfCard(card, userId) {
    if (!card || !userId) return false;
    const sourceType = this.text(card.sourceType || card.source_type).toLowerCase();
    if (sourceType && sourceType !== 'self_profile') return false;
    const ids = [
      card.lineId,
      card.userId,
      card.ownerUserId,
      card.profileUserId,
      card.creatorId,
      card['LINE ID']
    ].map(value => this.text(value)).filter(Boolean);
    return ids.includes(userId);
  },

  async getCardSummary(payload, env, userId) {
    const empty = {
      status: 'ready',
      hasMyCard: false,
      ownCard: null,
      recentCards: [],
      cardCount: 0,
      scannedCardCount: 0,
      updatedAt: new Date().toISOString()
    };
    if (!env.ACTMASTER_DB || !userId) return empty;

    await D1ReadModule.ensureCardAccessColumns(env);
    const ids = await D1ReadModule.identityIdsForUser(env, userId).catch(() => [userId]);
    const safeIds = ids.filter(Boolean);
    if (!safeIds.length) return empty;
    const placeholders = safeIds.map(() => '?').join(',');
    const rows = await D1ReadModule.all(env, `
      SELECT *
      FROM card_contacts
      WHERE line_id IN (${placeholders})
         OR creator_id IN (${placeholders})
         OR owner_user_id IN (${placeholders})
         OR profile_user_id IN (${placeholders})
      ORDER BY
        CASE WHEN source_type = 'self_profile' THEN 0 ELSE 1 END,
        COALESCE(updated_at, created_at) DESC,
        row_id DESC
      LIMIT 12
    `, [...safeIds, ...safeIds, ...safeIds, ...safeIds]).catch(() => []);
    const cards = rows.map(row => D1ReadModule.cardRow(row)).filter(Boolean);
    const ownCard = cards.find(card => this.isOwnSelfCard(card, userId))
      || cards.find(card => card && card.isSelfProfile === true)
      || null;
    const scannedCardCount = cards.filter(card => {
      const sourceType = this.text(card.sourceType || card.source_type).toLowerCase();
      return sourceType && sourceType !== 'self_profile' && sourceType !== 'referral_placeholder';
    }).length;
    return {
      ...empty,
      hasMyCard: !!ownCard,
      ownCard,
      recentCards: cards.slice(0, 5),
      cardCount: cards.length,
      scannedCardCount
    };
  },

  async getStorePointCashierSummary(payload, env, userId, role) {
    const canUse = this.canUseStorePointCashier(role);
    const summary = {
      canUse,
      status: canUse ? 'ready' : 'disabled',
      logs: [],
      scope: role === 'admin' ? 'all' : 'own_store',
      updatedAt: new Date().toISOString()
    };
    if (!canUse || !env.ACTMASTER_DB || !userId) return summary;
    const logs = await PointModule.listStorePointCashierLogs({
      ...payload,
      userId,
      authenticatedUserId: userId,
      authenticatedRole: role,
      role,
      limit: Math.min(10, Math.max(1, Number(payload.cashierLogLimit || 10) || 10))
    }, env).catch(err => ({ success: false, error: err && err.message ? err.message : String(err) }));
    if (!logs || logs.success === false) {
      return { ...summary, status: 'error', error: logs && logs.error ? logs.error : 'cashier logs unavailable' };
    }
    const data = logs.data || logs;
    return {
      ...summary,
      status: 'ready',
      scope: data.scope || summary.scope,
      logs: Array.isArray(data.list) ? data.list : []
    };
  },

  async get(payload, env) {
    const requestedUserId = this.text(payload.authenticatedUserId || payload.userId || payload.LINE_user_id);
    if (!requestedUserId) return { success: false, error: 'Missing user id' };

    const identity = env.ACTMASTER_DB
      ? await D1ReadModule.findUserByIdentity(env, requestedUserId).catch(() => null)
      : null;
    const user = identity && identity.user ? D1ReadModule.userRow(identity.user, 'subsite_home') : null;
    const canonicalUserId = this.text(user && user.userId) || this.text(identity && identity.canonicalId) || requestedUserId;
    const role = this.effectiveRole(user, payload);
    const pointUserId = this.text(payload.pointUserId || payload.pt_uid)
      || this.text(user && user.pointLineId)
      || await PointModule.resolvePointUserId(env, canonicalUserId).catch(() => canonicalUserId);

    const [walletResult, cardSummary, cashierSummary] = await Promise.all([
      PointModule.queryPointBalanceFast({
        ...payload,
        userId: canonicalUserId,
        authenticatedUserId: canonicalUserId,
        pointUserId,
        pt_uid: pointUserId,
        point_type: payload.point_type || payload.pointType || 'gift_money'
      }, env).catch(err => ({ success: false, error: err && err.message ? err.message : String(err) })),
      this.getCardSummary(payload, env, canonicalUserId).catch(err => ({
        status: 'error',
        error: err && err.message ? err.message : String(err),
        hasMyCard: false,
        ownCard: null,
        recentCards: [],
        cardCount: 0,
        scannedCardCount: 0
      })),
      this.getStorePointCashierSummary(payload, env, canonicalUserId, role)
    ]);

    const wallet = walletResult && walletResult.success !== false
      ? { ...(walletResult.data || walletResult), status: 'ready' }
      : { status: 'error', error: walletResult && walletResult.error ? walletResult.error : 'point wallet unavailable' };

    return {
      success: true,
      data: {
        status: 'ready',
        source: 'subsite_home_fast',
        userId: canonicalUserId,
        pointUserId,
        role,
        user,
        wallet,
        cards: cardSummary,
        storePointCashier: cashierSummary,
        loadedAt: new Date().toISOString()
      }
    };
  }
};

const ThirdPointWebhookModule = {
  text(value) {
    return String(value ?? '').trim();
  },

  pick(source, keys) {
    if (!source || typeof source !== 'object') return '';
    for (const key of keys) {
      const value = source[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
    }
    return '';
  },

  async handle(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization,x-webhook-secret,x-point-webhook-secret'
        }
      });
    }

    if (request.method === 'GET') {
      return Utils.jsonResponse({
        success: true,
        service: 'third_point_webhook',
        lineWebhook: '/line-webhook',
        pointWebhook: '/point-webhook',
        compatiblePath: '/webhook/points',
        auth: 'Authorization: Bearer POINT_WEBHOOK_SECRET',
        actions: ['bind', 'query', 'grant', 'deduct', 'adjust']
      });
    }

    if (request.method !== 'POST') {
      return Utils.jsonResponse({ success: false, error: 'Method Not Allowed' }, 405);
    }

    const auth = this.verifySecret(request, env);
    if (!auth.ok) return Utils.jsonResponse({ success: false, error: auth.error }, auth.status);

    let payload = {};
    try {
      payload = await request.json();
    } catch (err) {
      return Utils.jsonResponse({ success: false, error: 'Invalid JSON payload' }, 400);
    }

    const context = await this.normalizePayload(payload, env);
    let result;
    try {
      result = await this.dispatch(context, payload, env);
    } catch (err) {
      result = { success: false, error: err && err.message ? err.message : String(err) };
    }

    await this.logRequest(env, context, payload, result).catch(err => {
      console.error('third point webhook log failed', err && err.message ? err.message : err);
    });

    return Utils.jsonResponse(result, result && result.success === false ? 400 : 200);
  },

  verifySecret(request, env) {
    const secret = this.text(env.POINT_WEBHOOK_SECRET || env.THIRD_SYSTEM_WEBHOOK_SECRET);
    if (!secret) return { ok: false, status: 500, error: 'Missing POINT_WEBHOOK_SECRET' };
    const bearer = this.text(request.headers.get('authorization')).replace(/^Bearer\s+/i, '');
    const headerSecret = this.text(request.headers.get('x-point-webhook-secret') || request.headers.get('x-webhook-secret'));
    if (bearer === secret || headerSecret === secret) return { ok: true };
    return { ok: false, status: 401, error: 'Invalid webhook secret' };
  },

  async normalizePayload(payload, env) {
    const member = payload.member && typeof payload.member === 'object' ? payload.member : {};
    const action = this.text(payload.action || payload.type || payload.event || 'query').toLowerCase();
    const provider = this.text(payload.provider || payload.sourceSystem || payload.source || member.provider || 'third_system');
    const externalUserId = this.pick(member, ['externalUserId', 'external_id', 'memberId', 'member_id']) ||
      this.pick(payload, ['externalUserId', 'external_id', 'memberId', 'member_id']);
    const lineUserId = this.pick(member, ['lineUserId', 'LINE_user_id', 'lineId', 'userId', 'uid']) ||
      this.pick(payload, ['lineUserId', 'LINE_user_id', 'lineId', 'userId', 'uid']);
    const pointUserId = this.pick(member, ['pointUserId', 'point_line_id', 'pt_uid']) ||
      this.pick(payload, ['pointUserId', 'point_line_id', 'pt_uid']);
    const phone = this.pick(member, ['phone', 'mobile']) || this.pick(payload, ['phone', 'mobile']);
    const name = this.pick(member, ['name', 'displayName']) || this.pick(payload, ['name', 'displayName']);
    const rawUserId = pointUserId || lineUserId || externalUserId;

    let canonicalId = rawUserId;
    let resolvedPointUserId = pointUserId || lineUserId || '';
    if (env.ACTMASTER_DB && rawUserId) {
      const identity = await D1ReadModule.findUserByIdentity(env, rawUserId).catch(() => null);
      const row = identity && identity.user;
      canonicalId = this.text(identity && identity.canonicalId) || this.text(row && row.line_id) || rawUserId;
      resolvedPointUserId = this.text(row && row.point_line_id) || pointUserId || canonicalId || lineUserId;
    }

    return {
      action,
      provider,
      externalUserId,
      lineUserId,
      pointUserId: resolvedPointUserId,
      canonicalId,
      phone,
      name,
      points: Number(payload.points ?? payload.get_point ?? payload.amount ?? 0) || 0,
      pointType: this.text(payload.pointType || payload.point_type || 'gift_money'),
      eventName: this.text(payload.eventName || payload.event_name || provider + ' point webhook'),
      eventContent: this.text(payload.eventContent || payload.event_content || payload.memo || payload.note || ''),
      referenceId: this.text(payload.referenceId || payload.reference_id || payload.orderId || payload.order_id || payload.id || ''),
      shopId: payload.shop_id || payload.shopId || ''
    };
  },

  async dispatch(context, payload, env) {
    if (!env.ACTMASTER_DB) return { success: false, error: 'Missing ACTMASTER_DB binding' };

    if (['ping', 'health'].includes(context.action)) {
      return { success: true, data: { status: 'ok', provider: context.provider } };
    }

    if (context.action === 'bind') {
      return await this.bindMember(context, env);
    }

    const targetPointUserId = context.pointUserId || context.canonicalId || context.lineUserId;
    if (!targetPointUserId) return { success: false, error: 'Missing member identity' };

    if (context.action === 'query') {
      return await PointModule.queryUserPoints({
        pointUserId: targetPointUserId,
        point_type: context.pointType,
        page: payload.page || 1
      }, env);
    }

    const debitActions = new Set(['deduct', 'redeem', 'subtract', 'debit']);
    const creditActions = new Set(['grant', 'add', 'reward', 'credit']);
    const signedActions = new Set(['adjust', 'transaction']);
    if (!debitActions.has(context.action) && !creditActions.has(context.action) && !signedActions.has(context.action)) {
      return { success: false, error: 'Unsupported action: ' + context.action };
    }

    let points = Number(context.points || 0) || 0;
    if (!points) return { success: false, error: 'Missing point amount' };
    if (debitActions.has(context.action)) points = -Math.abs(points);
    if (creditActions.has(context.action)) points = Math.abs(points);

    const result = await PointModule.insertUserPoint({
      userId: targetPointUserId,
      points,
      pointType: context.pointType,
      eventName: context.eventName,
      eventContent: context.eventContent || `${context.provider}:${context.referenceId || context.action}`,
      shop_id: context.shopId,
      shop_remark: [context.provider, context.referenceId].filter(Boolean).join(':')
    }, env);

    return {
      success: result && result.success !== false,
      data: {
        provider: context.provider,
        action: context.action,
        lineUserId: context.lineUserId,
        pointUserId: targetPointUserId,
        points,
        pointType: context.pointType,
        referenceId: context.referenceId,
        pointResult: result
      },
      error: result && result.success === false ? result.error : undefined
    };
  },

  async bindMember(context, env) {
    const lineId = context.lineUserId || context.pointUserId || context.canonicalId;
    if (!lineId) return { success: false, error: 'Missing LINE user id for bind' };
    await D1WriteModule.upsertUser({
      userId: lineId,
      name: context.name,
      phone: context.phone,
      role: 'user'
    }, env);
    const pointLineId = context.pointUserId || lineId;
    await env.ACTMASTER_DB.prepare(`
      UPDATE users
      SET point_line_id = COALESCE(NULLIF(?, ''), point_line_id),
          legacy_line_id = CASE WHEN line_id <> ? THEN COALESCE(NULLIF(legacy_line_id, ''), line_id) ELSE legacy_line_id END,
          identity_source = COALESCE(NULLIF(identity_source, ''), ?),
          migrated_at = COALESCE(migrated_at, CURRENT_TIMESTAMP)
      WHERE line_id = ? OR row_id = ? OR point_line_id = ? OR legacy_line_id = ?
    `).bind(pointLineId, pointLineId, context.provider, lineId, lineId, pointLineId, lineId).run().catch(() => null);
    await D1WriteModule.clearUserCache(env, lineId).catch(() => null);
    return {
      success: true,
      data: {
        provider: context.provider,
        lineUserId: lineId,
        pointUserId: pointLineId,
        externalUserId: context.externalUserId
      }
    };
  },

  async ensureLogTable(env) {
    if (!env.ACTMASTER_DB) return false;
    await env.ACTMASTER_DB.prepare(`
      CREATE TABLE IF NOT EXISTS third_point_webhook_logs (
        log_id TEXT PRIMARY KEY,
        provider TEXT NOT NULL DEFAULT '',
        action TEXT NOT NULL DEFAULT '',
        external_user_id TEXT NOT NULL DEFAULT '',
        line_user_id TEXT NOT NULL DEFAULT '',
        point_user_id TEXT NOT NULL DEFAULT '',
        points REAL NOT NULL DEFAULT 0,
        point_type TEXT NOT NULL DEFAULT 'gift_money',
        reference_id TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT '',
        request_json TEXT NOT NULL DEFAULT '{}',
        response_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    await env.ACTMASTER_DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_third_point_webhook_provider_time
      ON third_point_webhook_logs(provider, created_at)
    `).run();
    return true;
  },

  async logRequest(env, context, requestPayload, responsePayload) {
    if (!env.ACTMASTER_DB) return;
    await this.ensureLogTable(env);
    const logId = `TPW_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await env.ACTMASTER_DB.prepare(`
      INSERT INTO third_point_webhook_logs (
        log_id, provider, action, external_user_id, line_user_id, point_user_id,
        points, point_type, reference_id, status, request_json, response_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      logId,
      context.provider,
      context.action,
      context.externalUserId,
      context.lineUserId,
      context.pointUserId,
      context.points,
      context.pointType,
      context.referenceId,
      responsePayload && responsePayload.success === false ? 'failed' : 'success',
      JSON.stringify(requestPayload || {}),
      JSON.stringify(responsePayload || {})
    ).run();
  }
};

const AIModule = {
  normalizeClientOpenAIKey(key) {
    const value = String(key || '').trim();
    if (!value || !/^sk-[A-Za-z0-9_\-]+/.test(value)) return '';
    return value;
  },

  getOpenAIKeys(env, clientKey = '') {
    const localKey = this.normalizeClientOpenAIKey(clientKey);
    if (localKey) return [localKey];
    return [
      env.OPENAI_API_KEY,
      env.OPENAI_API_KEY_2,
      env.OPENAI_API_KEY_BACKUP,
      env.OPENAI_BACKUP_API_KEY
    ].filter((key, index, list) => key && list.indexOf(key) === index);
  },

  async callOpenAI(env, body, clientKey = '') {
    const keys = this.getOpenAIKeys(env, clientKey);
    if (!keys.length) throw new Error("Missing OPENAI_API_KEY");

    let lastError = '';
    for (let i = 0; i < keys.length; i++) {
      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + keys[i], 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.error) {
          lastError = result.error?.message || ('OpenAI HTTP ' + response.status);
          console.warn('[OpenAI fallback]', 'key', i + 1, lastError);
          continue;
        }
        if (!result.choices?.[0]?.message) {
          lastError = 'OpenAI did not return choices';
          continue;
        }
        return result;
      } catch (e) {
        lastError = e.message || String(e);
        console.warn('[OpenAI fallback]', 'key', i + 1, lastError);
      }
    }

    throw new Error(lastError || 'OpenAI request failed');
  },

  async callGemini(env, prompt, temperature = 0.2) {
    if (!env.GEMINI_API_KEY) throw new Error("Missing GEMINI_API_KEY");
    const model = env.GEMINI_MODEL || 'gemini-1.5-flash';
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature }
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.error) {
      throw new Error(result.error?.message || ('Gemini HTTP ' + response.status));
    }
    const text = (result.candidates?.[0]?.content?.parts || [])
      .map(part => part.text || '')
      .join('');
    if (!text) throw new Error('Gemini did not return text');
    return text;
  },

  dataUriParts(base64Image) {
    const raw = String(base64Image || '');
    const match = raw.match(/^data:([^;]+);base64,(.+)$/);
    if (match) return { mimeType: match[1] || 'image/jpeg', data: match[2] || '' };
    return { mimeType: 'image/jpeg', data: raw };
  },

  async callGeminiVision(env, base64Image, prompt, temperature = 0.2) {
    if (!env.GEMINI_API_KEY) throw new Error("Missing GEMINI_API_KEY");
    const model = env.GEMINI_VISION_MODEL || env.GEMINI_MODEL;
    if (!model) throw new Error('Missing GEMINI_VISION_MODEL');
    const image = this.dataUriParts(base64Image);
    if (!image.data) throw new Error('Missing image data');
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { text: prompt },
            { inline_data: { mime_type: image.mimeType, data: image.data } }
          ]
        }],
        generationConfig: { temperature }
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.error) {
      throw new Error(result.error?.message || ('Gemini HTTP ' + response.status));
    }
    const text = (result.candidates?.[0]?.content?.parts || [])
      .map(part => part.text || '')
      .join('');
    if (!text) throw new Error('Gemini did not return text');
    return text;
  },

  normalizePhoneForTel(value) {
    const raw = String(value || '').replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/＋/g, '+').trim();
    if (!raw) return '';
    const candidates = raw.match(/(?:\+?886|00886)?[\s().-]*0?9(?:[\s().-]*\d){8}|\+?\d(?:[\s().-]*\d){6,14}/g) || [];
    for (const candidate of candidates) {
      let phone = candidate.replace(/[^0-9+]/g, '');
      if (phone.startsWith('00')) phone = '+' + phone.slice(2);
      if (!phone.startsWith('+') && /^886\d{8,10}$/.test(phone)) phone = '+' + phone;
      if (!phone.startsWith('+') && /^86\d{8,13}$/.test(phone)) phone = '+' + phone;
      if (/^\+?\d{7,16}$/.test(phone)) return phone;
    }
    let compact = raw.replace(/[^\d+]/g, '');
    if (/^09\d{18,}$/.test(compact)) compact = compact.slice(0, 10);
    if (compact.startsWith('00')) compact = '+' + compact.slice(2);
    if (!compact.startsWith('+') && /^886\d{8,10}$/.test(compact)) compact = '+' + compact;
    if (!compact.startsWith('+') && /^86\d{8,13}$/.test(compact)) compact = '+' + compact;
    return /^\+?\d{7,16}$/.test(compact) ? compact : '';
  },

  normalizeWebsiteUrl(value) {
    let url = String(value || '').trim();
    if (!url) return '';
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    return url;
  },

  async recognizeBusinessCardImages(payload, env) {
    try {
      const images = (Array.isArray(payload.base64Images) ? payload.base64Images : [payload.base64Image])
        .map(v => String(v || '').trim())
        .filter(Boolean)
        .slice(0, 2);
      if (!images.length) throw new Error('Missing image data');

      const uploadedUrls = [];
      for (const image of images) {
        uploadedUrls.push(await StorageModule.upload(image, env));
      }

      const prompt = [
        '你是名片 OCR 助理。請只接受真實紙本名片、電子名片截圖、商務聯絡卡片。',
        '如果圖片不是名片或缺少姓名與至少一項聯絡資訊，回傳 {"isBusinessCard":false,"reason":"原因"}，不要猜測。',
        '如果是名片，回傳純 JSON，不要 markdown：',
        '{"isBusinessCard":true,"language":"","name":"","englishName":"","companyName":"","title":"","department":"","mobile":"","officePhone":"","email":"","website":"","address":"","services":"","tags":""}',
        '支援中文與英文名片。電話請保留可撥打格式，必須識別 +886、886、00886、+86、86、09 開頭等格式。',
        'services 請根據名片上的公司、職稱、服務項目、網址與可判斷行業，擴寫成可直接放在電子名片上的 3 到 8 行介紹；不要捏造不存在的證照或經歷。',
        'services 請整理成 3 到 8 行中文重點；沒有資料留空。'
      ].join('\n');

      const content = images.flatMap(image => ([
        { type: 'image_url', image_url: { url: image, detail: 'high' } }
      ]));
      content.push({ type: 'text', text: prompt });

      let text = '';
      let openaiError = null;
      try {
        const result = await this.callOpenAI(env, {
          model: env.OPENAI_VISION_MODEL || env.OPENAI_MODEL || 'gpt-4o',
          messages: [{ role: 'user', content }],
          temperature: 0
        }, payload.clientOpenAIKey);
        text = result.choices?.[0]?.message?.content || '';
      } catch (err) {
        openaiError = err;
        console.warn('[LINE OA card cool] GPT vision failed:', err.message);
      }

      if (!text && String(env.OCR_FALLBACK_PROVIDER || '').toLowerCase() === 'gemini') {
        try {
          text = await this.callGeminiVision(env, images[0], prompt, 0);
        } catch (geminiError) {
          throw new Error((openaiError && openaiError.message) || geminiError.message);
        }
      }
      if (!text) throw new Error((openaiError && openaiError.message) || 'OCR failed');

      const data = this.parseJsonObject(text);
      if (!data || data.isBusinessCard !== true) {
        return { success: false, code: 'NON_BUSINESS_CARD', error: String(data?.reason || '這張圖片不像名片，未建立資料。') };
      }

      const buttons = [];
      const mobile = this.normalizePhoneForTel(data.mobile || data.officePhone || '');
      if (mobile) buttons.push({ l: '行動電話', u: 'tel:' + mobile, c: '#3B82F6' });
      if (data.email) buttons.push({ l: '電子郵件', u: 'mailto:' + String(data.email).trim(), c: '#F97316' });
      if (data.website) {
        let url = this.normalizeWebsiteUrl(data.website);
        if (url) buttons.push({ l: '官方網站', u: url, c: '#1E293B' });
      }
      if (data.address) {
        buttons.push({ l: '地圖導航', u: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(String(data.address).trim()), c: '#1E293B' });
      }

      const config = {
        cardType: 'v1',
        layoutStyle: 'landscape',
        imgUrl: uploadedUrls[0],
        imgUrlLandscape: uploadedUrls[0],
        imgRatioLandscape: '20:13',
        title: String(data.name || data.companyName || '名片').trim(),
        desc: String(data.services || data.title || data.companyName || '').trim(),
        buttons: buttons.slice(0, 4),
        isPrivate: true,
        descAlign: 'center',
        descColor: '#374151'
      };

      return {
        success: true,
        data: {
          ...data,
          imageUrl: uploadedUrls[0],
          customConfig: JSON.stringify(config),
          config,
          uploadedUrls
        }
      };
    } catch (e) {
      return { success: false, error: '名片 OCR 失敗：' + (e.message || String(e)) };
    }
  },

  parseJsonObject(text) {
    const raw = String(text || '').replace(/```json/gi, '```');
    const fence = raw.match(/```\s*([\s\S]*?)```/);
    const source = fence && fence[1] ? fence[1] : raw;
    const jsonMatch = source.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : {};
  },

  parseJsonArray(text) {
    const raw = String(text || '').replace(/```json/gi, '```');
    const fence = raw.match(/```\s*([\s\S]*?)```/);
    const source = fence && fence[1] ? fence[1] : raw;
    const jsonMatch = source.match(/\[[\s\S]*\]/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : [];
  },

  openAITextModel(env) {
    return env.OPENAI_TEXT_MODEL || env.OPENAI_MODEL || 'gpt-4o';
  },

  localMatchmakingFallback(query, contacts) {
    const tokens = String(query || '')
      .toLowerCase()
      .split(/[\s,，。;；、/\\|]+/)
      .map(token => token.trim())
      .filter(token => token.length >= 2);

    return contacts
      .map(contact => {
        const text = [contact.Name, contact.Company, contact.Title, contact.Tags].filter(Boolean).join(' ').toLowerCase();
        const hitCount = tokens.reduce((count, token) => count + (text.includes(token) ? 1 : 0), 0);
        const score = Math.max(55, Math.min(88, 60 + hitCount * 8));
        return {
          rowId: contact.rowId,
          score,
          reason: hitCount
            ? 'AI 暫時無法完成深度配對，先依需求關鍵字與名片標籤排序。'
            : 'AI 暫時無法完成深度配對，先提供配對池中的可交流名片。',
          card: contact.card || undefined
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  },

  matchContactFromCard(card) {
    const tags = [
      card.tags,
      card['個性'],
      card['興趣'],
      card['財富'],
      card['健康'],
      card['事業'],
      card.services,
      card['服務項目'],
      card.notes
    ].filter(Boolean).join(' ');
    return {
      rowId: card.rowId,
      Name: card.name || card['姓名'] || '',
      Company: card.companyName || card['公司名稱'] || '',
      Title: card.title || card['職稱'] || '',
      Tags: tags,
      visibility: card.visibility || card['公開狀態'] || '',
      sourceType: card.sourceType || card['名片來源'] || '',
      poolEligible: card.poolEligible,
      isPrivate: card.isPrivate === true,
      card
    };
  },

  async loadMatchmakingPool(payload, env) {
    const scope = payload.poolScope === 'public' ? 'public' : 'own';
    const legacyContacts = Array.isArray(payload.contacts) ? payload.contacts : [];
    if (!env.ACTMASTER_DB || typeof D1ReadModule === 'undefined') {
      return { scope, contacts: legacyContacts };
    }

    await D1ReadModule.ensureCardAccessColumns(env);
    const actorId = D1ReadModule.text(
      payload.authenticatedUserId ||
      payload.userId ||
      payload.currentUser?.userId ||
      payload.currentUser?.lineId ||
      payload.currentUser?.line_id
    );
    const excludeRowId = D1ReadModule.text(payload.currentCardRowId || payload.excludeRowId);
    const limit = Math.min(Math.max(Number(payload.limit || 80) || 80, 1), 120);
    let rows = [];

    if (scope === 'own') {
      if (!actorId) throw new Error('Missing user identity for own matchmaking pool');
      const ids = await D1ReadModule.identityIdsForUser(env, actorId);
      if (!ids.length) ids.push(actorId);
      const placeholders = ids.map(() => '?').join(',');
      const params = [...ids, ...ids, ...ids, ...ids];
      let sql = `
        SELECT * FROM card_contacts
        WHERE (
          owner_user_id IN (${placeholders}) OR creator_id IN (${placeholders})
          OR line_id IN (${placeholders}) OR profile_user_id IN (${placeholders})
        )
        AND LOWER(COALESCE(source_type,'')) <> 'referral_placeholder'
      `;
      if (excludeRowId) {
        sql += ' AND row_id <> ?';
        params.push(excludeRowId);
      }
      sql += ` ORDER BY COALESCE(updated_at, created_at) DESC, row_id DESC LIMIT ${limit}`;
      rows = await D1ReadModule.all(env, sql, params);
    } else {
      const params = [];
      let sql = `
        SELECT * FROM card_contacts
        WHERE LOWER(COALESCE(visibility,'')) = 'public'
          AND LOWER(COALESCE(source_type,'')) = 'self_profile'
          AND CAST(COALESCE(pool_eligible, 0) AS INTEGER) = 1
          AND LOWER(COALESCE(ai_review_status, 'passed')) = 'passed'
      `;
      if (excludeRowId) {
        sql += ' AND row_id <> ?';
        params.push(excludeRowId);
      }
      sql += ` ORDER BY COALESCE(updated_at, created_at) DESC, row_id DESC LIMIT ${limit}`;
      rows = await D1ReadModule.all(env, sql, params);
    }

    return {
      scope,
      contacts: rows
        .map(row => {
          const card = D1ReadModule.cardRow(row);
          if (scope === 'public' && card) {
            card.visibility = 'public';
            card.sourceType = 'self_profile';
            card.poolEligible = true;
            card.isPrivate = false;
          }
          return card;
        })
        .filter(Boolean)
        .map(card => this.matchContactFromCard(card))
    };
  },

  async recognize(payload, env) {
    try {
      const uploadedImgUrl = await StorageModule.upload(payload.base64Image, env);
      const prompt = '請解析這張名片並提取資訊。支援多國語言（如英文、日文等），若無中文請直接保留原文。輸出JSON格式：{"姓名":"","英文名":"","職稱":"","公司名稱":"","手機號碼":"","公司電話":"","電子郵件":"","公司網址":"","公司地址":"","統一編號":"","分機":"","傳真":"","部門":"","社群帳號":"","服務項目":""}\n所有欄位必須是字串，保留開頭的 0。若名片上沒有清楚服務項目，請依公司名稱、職稱、地址、網站合理推估，替「服務項目」生成 3 到 5 行簡短商務介紹；每行 12 到 18 字，避免誇大，不要寫「未知」。';

      let text = '';
      let openaiError = null;
      try {
        const result = await this.callOpenAI(env, {
          model: env.OPENAI_VISION_MODEL || env.OPENAI_MODEL || 'gpt-4o',
          messages: [{
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: payload.base64Image, detail: 'high' } },
              { type: 'text', text: prompt }
            ]
          }]
        }, payload.clientOpenAIKey);
        text = result.choices?.[0]?.message?.content || '';
      } catch (err) {
        openaiError = err;
        console.warn('[AI OCR] GPT vision failed:', err.message);
      }

      if (!text && String(env.OCR_FALLBACK_PROVIDER || '').toLowerCase() === 'gemini') {
        try {
          console.warn('[AI fallback] recognize GPT failed, trying Gemini:', openaiError && openaiError.message);
          text = await this.callGeminiVision(env, payload.base64Image, prompt, 0.2);
        } catch (geminiError) {
          console.warn('[AI fallback] Gemini OCR failed:', geminiError.message);
          throw new Error('GPT OCR 失敗: ' + ((openaiError && openaiError.message) || '無法取得辨識結果'));
        }
      }

      if (!text) {
        throw new Error('GPT OCR 失敗: ' + ((openaiError && openaiError.message) || '無法取得辨識結果'));
      }
      
      let cardData = this.parseJsonObject(text);
      
      cardData['名片圖檔'] = uploadedImgUrl;
      
      let autoButtons = [];
      const mobileForButton = this.normalizePhoneForTel(cardData['手機號碼']);
      const officeForButton = this.normalizePhoneForTel(cardData['公司電話']);
      if (mobileForButton) autoButtons.push({ l: '撥打手機', u: 'tel:' + mobileForButton, c: '#06C755' });
      if (officeForButton && officeForButton !== mobileForButton) autoButtons.push({ l: '撥打市話', u: 'tel:' + officeForButton, c: '#3b82f6' });
      if (cardData['公司地址']) autoButtons.push({ l: '地圖導航', u: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(cardData['公司地址']), c: '#ef4444' });
      if (cardData['電子郵件']) autoButtons.push({ l: '發送郵件', u: 'mailto:' + cardData['電子郵件'], c: '#f59e0b' });
      if (cardData['公司網址']) {
          let url = cardData['公司網址'].trim();
          if (!url.startsWith('http')) url = 'https://' + url;
          autoButtons.push({ l: '官方網站', u: url, c: '#64748b' });
      }
      
      const config = {
        cardType: 'v1', imgUrl: uploadedImgUrl, title: cardData['姓名'] || cardData['英文名'] || '數字名片',
        desc: cardData['服務項目'] || cardData['職稱'] || cardData['公司名稱'] || '',
        buttons: autoButtons, isPrivate: false, descAlign: 'center', descColor: '#666666'
      };
      cardData['自訂名片設定'] = JSON.stringify(config);
      
      return { success: true, data: cardData };
    } catch (e) {
      return { success: false, error: "AI 辨識失敗: " + e.message };
    }
  },

  async matchmaking(payload, env) {
    try {
      const { currentUser, query } = payload || {};
      const pool = await this.loadMatchmakingPool(payload || {}, env);
      const safeContacts = pool.contacts.filter(c => {
        const visibility = String(c.visibility || '').toLowerCase();
        const sourceType = String(c.sourceType || '').toLowerCase();
        const poolEligible = c.poolEligible === true || c.poolEligible === 1 || c.poolEligible === '1' || c.poolEligible === 'true';
        const isPrivate = c.isPrivate === true || visibility === 'private';
        if (pool.scope === 'own') return sourceType !== 'referral_placeholder';
        return !isPrivate && visibility === 'public' && poolEligible && sourceType === 'self_profile';
      });

      if (!safeContacts.length) {
        return { success: false, error: pool.scope === 'own' ? '自己的名片池目前沒有可配對名片' : '目前沒有可配對的公開名片' };
      }

      const contactsList = safeContacts.map((c, i) => `${i + 1}. ${c.Name || '未命名'} (${c.Company || '無'})\n標籤: ${c.Tags || '無'}`).join('\n');
      const prompt = `使用者:${currentUser?.name || '使用者'}，配對池:${pool.scope === 'own' ? '自己的名片池' : '公開交流池'}，需求:${query}\n候選名單:\n${contactsList}\n請回傳最匹配的前5名 JSON 陣列: [{"index":0,"score":95,"reason":"原因，20字內"}]`;

      let items = [];
      try {
        const result = await this.callOpenAI(env, { model: this.openAITextModel(env), messages: [{ role: 'user', content: prompt }], temperature: 0.2 }, payload.clientOpenAIKey);
        items = this.parseJsonArray(result.choices?.[0]?.message?.content || '[]');
      } catch (aiError) {
        console.warn('[AI matchmaking] GPT failed, using local fallback:', aiError.message);
        return { success: true, data: this.localMatchmakingFallback(query, safeContacts), fallback: true, poolScope: pool.scope };
      }

      const used = new Set();
      const matches = items.map(item => {
        let index = Number(item.index);
        if (!Number.isFinite(index)) index = Number(item.no || item.number || item.id);
        if (!Number.isFinite(index)) return null;
        const zeroBased = index > 0 ? index - 1 : index;
        const contact = safeContacts[zeroBased] || safeContacts[index];
        if (!contact || used.has(contact.rowId)) return null;
        used.add(contact.rowId);
        return {
          rowId: contact.rowId,
          score: Math.max(0, Math.min(100, Number(item.score || 0) || 0)),
          reason: String(item.reason || '符合您的配對需求').slice(0, 80),
          card: contact.card || undefined
        };
      }).filter(Boolean);
      return {
        success: true,
        data: matches.length ? matches : this.localMatchmakingFallback(query, safeContacts),
        fallback: matches.length === 0,
        poolScope: pool.scope
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  async reviewCardSafety(payload, env) {
    try {
      const card = payload.card || {};
      const prompt = `你是名片公開搜尋前的安全審核員。請檢查文字與圖片是否包含色情、性交易、裸露暗示、犯罪、詐騙、毒品、武器、賭博、暴力或其他高風險內容。
只回傳純 JSON，不要解釋在 JSON 外。
格式：{"pass":true,"riskLevel":"low","reasons":[],"suggestions":[]}
若有疑慮 pass=false，reasons 用繁體中文列出原因，suggestions 提供可修改方向。
名片資料：${JSON.stringify(card).slice(0, 6000)}`;
      const content = [{ type: 'text', text: prompt }];
      if (card.imageUrl && /^https?:\/\//i.test(card.imageUrl)) {
        content.push({ type: 'image_url', image_url: { url: card.imageUrl, detail: 'low' } });
      }

      let text = '';
      try {
        const result = await this.callOpenAI(env, { model: this.openAITextModel(env), messages: [{ role: 'user', content }], temperature: 0 }, payload.clientOpenAIKey);
        text = result.choices?.[0]?.message?.content || '{}';
      } catch (openaiError) {
        if (String(env.AI_FALLBACK_PROVIDER || '').toLowerCase() !== 'gemini') throw openaiError;
        console.warn('[AI fallback] reviewCardSafety GPT failed, trying Gemini:', openaiError.message);
        text = await this.callGemini(env, prompt, 0);
      }
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const data = jsonMatch ? JSON.parse(jsonMatch[0]) : { pass: false, reasons: ['AI 健檢沒有回傳有效結果'], suggestions: ['請稍後再試'] };
      return { success: true, data };
    } catch (e) {
      return { success: false, error: 'AI 名片健檢失敗: ' + e.message };
    }
  },

  async generateCardCopy(payload, env) {
    try {
      const card = payload.card || {};
      const brief = payload.brief || '';
      const prompt = `你是商務名片文案顧問。請根據名片資料與使用者補充，產生適合數位名片的服務介紹。
要求：
1. 使用繁體中文。
2. 4 到 5 行，每行盡量 16 字內。
3. 具體、可信、不要誇大療效或保證收益。
4. 不得產生色情、犯罪、詐騙、賭博、毒品、武器等違規內容。
只回傳純 JSON：{"service":"第一行\\n第二行\\n第三行","headline":"","tips":[]}
名片資料：${JSON.stringify(card).slice(0, 5000)}
補充需求：${brief}`;

      let text = '';
      try {
        const result = await this.callOpenAI(env, { model: this.openAITextModel(env), messages: [{ role: 'user', content: prompt }], temperature: 0.7 }, payload.clientOpenAIKey);
        text = result.choices?.[0]?.message?.content || '{}';
      } catch (openaiError) {
        if (String(env.AI_FALLBACK_PROVIDER || '').toLowerCase() !== 'gemini') throw openaiError;
        console.warn('[AI fallback] generateCardCopy GPT failed, trying Gemini:', openaiError.message);
        text = await this.callGemini(env, prompt, 0.7);
      }
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const data = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
      return { success: true, data };
    } catch (e) {
      return { success: false, error: 'AI 名片代寫失敗: ' + e.message };
    }
  },

  async fateTags(payload, env) {
    try {
      const prompt = `你是一位專業的商務AI心理與命理分析專家。請根據以下資料（姓名用字、手機號碼頻率與尾數、生日），進行深度商務人格分析。
姓名：${payload.Name || '未知'}
手機：${payload.Mobile || '未知'}
生日：${payload.Birthday || '未知'}
公司：${payload.Company || '未知'}
職稱：${payload.Title || '未知'}

分析邏輯與必含維度參考：
1. 姓名：字形判斷行動/思考型，發音判斷外向/內斂，結構判斷主導/依附。
2. 手機號碼：數字頻率(1領導,2協調...9理想)，尾數判斷決策模式(快攻/慢養)，奇偶比判斷衝動/保守。
3. 生日（若有填寫）：請立即啟動並融合「八字」、「紫微斗數」、「生命靈數」與「東西方星座學」的運算模型，疊加分析其先天命格、潛能與流年運勢。
4. 【重點要求】分析結果必須明確判斷並結合以下商務特徵：
   - 感官接收偏好 (VAK)：視覺型、聽覺型、或觸覺型。
   - 思考與決策模式：分析型、數據型、或直覺型。
   - 行為與風險偏好：積極/消極、冒險/保守。

【強制要求】：請輸出純 JSON 格式。五大維度（Personality, Hobbies, Wealth, Health, Career）的值，每個都「必須」是一段 20 到 40 字的完整情境描述，請直接給出具體特徵與商務應對建議（例如：此人為視覺數據型，決策保守，建議提供圖表數據...），絕對不要只給單詞。
JSON格式：{"Personality":"","Hobbies":"","Wealth":"","Health":"","Career":""}`;

      const result = await this.callOpenAI(env, { model: this.openAITextModel(env), messages: [{ role: 'user', content: prompt }] }, payload.clientOpenAIKey);
      const jsonMatch = result.choices[0].message.content.match(/\{[\s\S]*\}/);
      return { success: true, data: jsonMatch ? JSON.parse(jsonMatch[0]) : {} };
    } catch (e) { return { success: false, error: e.message }; }
  }
};

// ==================== 模組 4: 訊息構建 (Messaging Module) ====================
const MessagingModule = {
  flexTextAlign(value) {
    const align = String(value || '').trim().toLowerCase();
    if (align === 'left') return 'start';
    if (align === 'right') return 'end';
    if (align === 'start' || align === 'end' || align === 'center') return align;
    return 'center';
  },

  buildFlex(payload) {
    const { card, config, referrerId, networkId, liffId, socialLikeLiffId } = payload;
    
    const activeLiffId = liffId || '1660923784-vViMTZ1y';
    let badgeUrl = 'https://liff.line.me/' + activeLiffId + '?shareCardId=' + card.rowId;
    if (referrerId) badgeUrl += '&ref=' + referrerId;
    if (networkId) badgeUrl += '&net=' + networkId;
    const shareActionUrl = badgeUrl + '&share=1';
    const activeSocialLikeLiffId = String(socialLikeLiffId || config.socialLikeLiffId || '').trim();
    let likeActionUrl = activeSocialLikeLiffId
      ? 'https://liff.line.me/' + encodeURIComponent(activeSocialLikeLiffId) + '?likeCardId=' + encodeURIComponent(card.rowId) + '&likeLiffId=' + encodeURIComponent(activeSocialLikeLiffId)
      : 'https://fangwl591021.github.io/LINE-/?likeCardId=' + encodeURIComponent(card.rowId);
    if (referrerId) likeActionUrl += '&ref=' + referrerId;
    if (networkId) likeActionUrl += '&net=' + networkId;

    const layoutStyle = String(config.layoutStyle || config.layout || 'landscape').trim();
    const imgUrl = (
      layoutStyle === 'portrait' ? (config.imgUrlPortrait || config.imgUrl || card['名片圖檔']) :
      layoutStyle === 'square' ? (config.imgUrlSquare || config.imgUrl || card['名片圖檔']) :
      (config.imgUrl || config.imgUrlLandscape || card['名片圖檔'])
    ) || 'https://images.unsplash.com/photo-1616628188550-808682f3926d?w=800&q=80';
    const aspectRatio = layoutStyle === 'portrait'
      ? (config.imgRatioPortrait || '400:600')
      : (layoutStyle === 'square' ? (config.imgRatioSquare || '1:1') : (config.imgRatioLandscape || '20:13'));
    const bubbleSize = layoutStyle === 'portrait' ? 'giga' : 'mega';
    const imageAspectMode = 'cover';
    
    let buttons = (config.buttons || []).map(b => ({ l: b.l, u: Utils.cleanURI(b.u), c: b.c }))
      .filter(b => b.l && b.u)
      .map(btn => ({
        type: "button", style: "primary", color: btn.c || "#06C755", height: "sm",
        action: { type: "uri", label: btn.l.substring(0, 40), uri: btn.u }
      }));

    let hero = { type: "image", url: imgUrl, size: "full", aspectRatio: aspectRatio, aspectMode: imageAspectMode, action: { type: "uri", uri: badgeUrl } };
    if (config.cardType === 'video' && config.videoUrl) {
      hero = { type: "video", url: config.videoUrl, previewUrl: imgUrl, aspectRatio: aspectRatio, altContent: { type: "image", size: "full", aspectRatio: aspectRatio, aspectMode: imageAspectMode, url: imgUrl, action: { type: "uri", uri: badgeUrl } } };
    }

    const titleText = (config.title || card['姓名'] || ' ').trim() || ' ';
    const descText = (config.desc || card['服務項目'] || ' ').trim() || ' ';

    return {
      type: "bubble", size: bubbleSize,
      header: {
        type: "box", layout: "horizontal", justifyContent: "space-between", alignItems: "center", paddingAll: "8px",
        contents: [{
          type: "box", layout: "horizontal", alignItems: "center", spacing: "xs", backgroundColor: "#F1F5F9", width: "65px", height: "25px", cornerRadius: "6px", paddingStart: "8px", paddingEnd: "8px",
          contents: [
            { type: "text", text: "\uD83D\uDC4D", size: "xs", flex: 0 },
            { type: "text", text: String(Math.max(0, Number(config.socialLikeCount || 0) || 0)), weight: "bold", color: "#334155", size: "xs", flex: 1 }
          ],
          action: { type: "uri", uri: likeActionUrl }
        }, {
          type: "box", layout: "vertical", justifyContent: "center", backgroundColor: "#FF0000", width: "65px", height: "25px", cornerRadius: "25px",
          contents: [{ type: "text", text: "分享", weight: "bold", align: "center", color: "#FFFFFF", size: "xs" }],
          action: { type: "uri", uri: shareActionUrl }
        }]
      },
      hero: hero,
      body: {
        type: "box", layout: "vertical", paddingAll: "15px",
        contents: [
          { type: "text", text: titleText, weight: "bold", size: "xl", align: "center", wrap: true },
          { type: "text", text: descText, size: "sm", margin: "md", color: config.descColor || "#666666", wrap: true, align: this.flexTextAlign(config.descAlign) }
        ]
      },
      footer: buttons.length > 0 ? { type: "box", layout: "vertical", spacing: "sm", paddingAll: "10px", contents: buttons } : undefined
    };
  }
};

// ==================== 模組 5: 資料庫轉發 (Database Module) ====================
const DBModule = {
  async forward(action, payload, env) {
    try {
      const response = await fetch(env.GAS_WEBAPP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload })
      });
      if (response.status === 302) {
        const loc = response.headers.get('location');
        const res2 = await fetch(loc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, payload }) });
        return await res2.json();
      }
      return await response.json();
    } catch (e) { return { success: false, error: "GAS Connection Failed" }; }
  }
};

const D1StoreSettingsModule = {
  key(networkId) {
    return 'store_settings:' + String(networkId || 'admin').trim();
  },

  normalize(payload = {}) {
    const networkId = String(payload.networkId || 'admin').trim() || 'admin';
    return {
      networkId,
      siteName: String(payload.siteName || '').trim(),
      bannerUrl: String(payload.bannerUrl || '').trim(),
      showBanner: payload.showBanner === undefined ? true : !!payload.showBanner,
      youtubeUrl: String(payload.youtubeUrl || '').trim(),
      showYoutube: payload.showYoutube === undefined ? true : !!payload.showYoutube,
      couponSettings: this.normalizeCouponSettings(payload.couponSettings || payload.richmanCoupon || this.normalizeCouponSettingsList(payload.couponSettingsList || [])[0] || {}),
      couponSettingsList: this.normalizeCouponSettingsList(payload.couponSettingsList || payload.richmanCoupons || payload.coupons || []),
      updatedAt: new Date().toISOString()
    };
  },


  normalizeCouponSettings(input = {}) {
    const raw = input && typeof input === 'object' ? input : {};
    const validDays = Math.max(1, Math.min(365, Math.floor(Number(raw.validDays || raw.valid_days || 30) || 30)));
    const redeemLimit = String(raw.redeemLimit || raw.redeem_limit || 'once') === 'manual' ? 'manual' : 'once';
    return {
      id: String(raw.id || raw.couponId || raw.coupon_id || '').trim().slice(0, 80),
      enabled: raw.enabled === undefined ? true : !!raw.enabled,
      title: String(raw.title || '').trim().slice(0, 80),
      body: String(raw.body || raw.description || '').trim().slice(0, 1000),
      validDays,
      redeemLimit,
      updatedAt: String(raw.updatedAt || raw.updated_at || '').trim()
    };
  },

  normalizeCouponSettingsList(input = []) {
    const rawList = Array.isArray(input) ? input : [];
    return rawList
      .map(item => this.normalizeCouponSettings(item))
      .filter(item => item.title || item.body)
      .slice(0, 20);
  },

  async ensure(env) {
    if (!env.ACTMASTER_DB) throw new Error('D1 database unavailable');
    await env.ACTMASTER_DB.prepare(`
      CREATE TABLE IF NOT EXISTS app_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
  },

  async get(payload = {}, env) {
    await this.ensure(env);
    const networkId = String(payload.networkId || 'admin').trim() || 'admin';
    const row = await env.ACTMASTER_DB.prepare(
      'SELECT value FROM app_meta WHERE key = ?'
    ).bind(this.key(networkId)).first();
    if (!row || !row.value) return null;
    try {
      const data = JSON.parse(row.value);
      return { success: true, data: { ...data, networkId } };
    } catch (e) {
      return null;
    }
  },

  async listCoupons(payload = {}, env) {
    const settings = await this.get(payload, env);
    const networkId = String(payload.networkId || 'admin').trim() || 'admin';
    if (!settings || !settings.data) {
      return { success: true, data: { networkId, coupons: [], defaultCoupon: null, count: 0, updatedAt: '' } };
    }
    const includeDisabled = payload.includeDisabled === true || String(payload.includeDisabled || '').toLowerCase() === 'true';
    const rawList = this.normalizeCouponSettingsList(settings.data.couponSettingsList || []);
    const fallback = this.normalizeCouponSettings(settings.data.couponSettings || {});
    const sourceList = rawList.length ? rawList : (fallback.title || fallback.body ? [fallback] : []);
    const coupons = sourceList.filter(coupon => includeDisabled || coupon.enabled);
    return {
      success: true,
      data: {
        networkId,
        coupons,
        defaultCoupon: coupons[0] || null,
        count: coupons.length,
        updatedAt: settings.data.updatedAt || ''
      }
    };
  },
  async save(payload = {}, env) {
    await this.ensure(env);
    const data = this.normalize(payload);
    await env.ACTMASTER_DB.prepare(`
      INSERT INTO app_meta(key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = CURRENT_TIMESTAMP
    `).bind(this.key(data.networkId), JSON.stringify(data)).run();
    return { success: true, data };
  }
};

const D1BackfillModule = {
  listFromResult(result, keys = []) {
    if (Array.isArray(result)) return result;
    if (!result || typeof result !== 'object') return [];
    for (const key of ['data', 'rows', 'items', ...keys]) {
      if (Array.isArray(result[key])) return result[key];
    }
    return [];
  },

  str(value) {
    return String(value ?? '').trim();
  },

  boolInt(value) {
    if (value === true) return 1;
    const text = String(value ?? '').trim().toLowerCase();
    return ['true', '1', 'yes', 'y', '已綁定', '已公開'].includes(text) ? 1 : 0;
  },

  json(value) {
    try { return JSON.stringify(value ?? {}); } catch (e) { return '{}'; }
  },

  id(prefix, row, index) {
    return this.str(row.rowId || row.id || row.ID || row[`${prefix}ID`] || row['活動ID'] || row['報名ID']) ||
      `${prefix}_${Date.now()}_${index}`;
  },

  normalizeUser(row, index) {
    const userId = this.str(row.userId || row['LINE ID'] || row.lineId || row['User ID']);
    if (!userId) return null;
    return {
      user_id: userId,
      line_id: userId,
      name: this.str(row.name || row['姓名'] || row.displayName || '待補資料'),
      phone: this.str(row.phone || row['手機'] || row['手機號碼']),
      industry: this.str(row.industry || row['主要業種'] || row.title || row['職稱']),
      birthday: this.str(row.birthday || row['出生年月日']),
      company_name: this.str(row.companyName || row.company || row['公司名稱']),
      title: this.str(row.title || row['職稱']),
      role: this.str(row.role || row['權限級別'] || 'user').toLowerCase(),
      network_id: this.str(row.networkId || row['歸屬網'] || 'admin') || 'admin',
      store_id: this.str(row.storeid || row.storeId || row['店代碼']),
      referrer_id: this.str(row.referrerId || row['推薦人']),
      profile_status: this.str(row.profileStatus || row.status || 'active'),
      source: this.str(row.source || 'gas_backfill'),
      claimed_card_id: this.str(row.claimedCardRowId || row.claimRowId),
      socials_json: this.str(row.socials) || '[]',
      telegram_token: this.str(row.tgToken),
      telegram_chat_id: this.str(row.tgChatId),
      raw_json: this.json(row)
    };
  },

  normalizeUserFromCard(card) {
    const userId = this.str(card['LINE ID'] || card.userId || card.lineId || card['User ID']);
    if (!userId) return null;
    return this.normalizeUser({
      userId,
      name: card['姓名'] || card['英文名'] || '待補資料',
      phone: card['手機號碼'] || card['公司電話'] || '',
      industry: card['職稱'] || card['公司名稱'] || '已綁定名片',
      companyName: card['公司名稱'] || '',
      title: card['職稱'] || '',
      role: 'user',
      networkId: card['歸屬網'] || 'admin',
      profileStatus: 'bound_card',
      source: 'bound_card',
      claimedCardRowId: card.rowId || card.id || ''
    });
  },

  normalizeCard(row, index) {
    const cfgRaw = this.str(row['自訂名片設定'] || row['電子名片設定'] || row.cardConfig || row.config);
    let cfg = {};
    try { cfg = cfgRaw ? JSON.parse(cfgRaw) : {}; } catch (e) {}
    const cardId = this.str(row.rowId || row.id || row['Row ID']) || `CARD_${Date.now()}_${index}`;
    const owner = this.str(row['LINE ID'] || row.userId || row.lineId || row['User ID']);
    return {
      card_id: cardId,
      owner_user_id: owner,
      creator_user_id: this.str(row.creatorId || row['建檔者ID']),
      network_id: this.str(row.networkId || row['歸屬網'] || 'admin') || 'admin',
      name: this.str(row['姓名'] || row.name),
      english_name: this.str(row['英文名']),
      company_name: this.str(row['公司名稱']),
      title: this.str(row['職稱']),
      department: this.str(row['部門']),
      mobile: this.str(row['手機號碼'] || row['手機']),
      company_phone: this.str(row['公司電話']),
      extension: this.str(row['分機']),
      fax: this.str(row['傳真']),
      email: this.str(row['電子郵件']),
      website: this.str(row['公司網址']),
      address: this.str(row['公司地址']),
      tax_id: this.str(row['統一編號']),
      social_accounts: this.str(row['社群帳號']),
      service: this.str(row['服務項目'] || cfg.desc),
      note: this.str(row['建檔人/備註']),
      image_url: this.str(row['名片圖檔'] || cfg.imgUrl),
      config_json: cfgRaw || this.json(cfg),
      tags: this.str(row['標籤']),
      is_bound: owner ? 1 : 0,
      is_private: this.boolInt(cfg.isPrivate),
      template_draft: this.boolInt(cfg.templateDraft),
      safety_status: cfg.safetyReview ? (cfg.safetyReview.pass ? 'passed' : 'failed') : 'pending',
      source: this.str(row.source || 'gas_backfill'),
      raw_json: this.json(row)
    };
  },

  normalizeActivity(row, index) {
    const activityId = this.str(row.activityId || row['活動ID'] || row.rowId || row.id) || `ACT_${Date.now()}_${index}`;
    return {
      activity_id: activityId,
      owner_user_id: this.str(row.userId || row.ownerUserId || row['建立者ID']),
      network_id: this.str(row.networkId || row['歸屬網'] || 'admin') || 'admin',
      name: this.str(row.activityName || row['活動名稱'] || row.name || '未命名活動'),
      type: this.str(row.activityType || row['活動類型'] || '例會'),
      default_identity: this.str(row.defaultIdentity || row['預設身份'] || '會員'),
      fee_type: this.str(row.feeType || row['收費方式'] || '免費'),
      price: Number(row.price || row['金額'] || 0) || 0,
      start_time: this.str(row.startTime || row['開始時間']),
      end_time: this.str(row.endTime || row['結束時間']),
      description: this.str(row.description || row['活動說明']),
      image_url: this.str(row.imageUrl || row['宣傳圖']),
      status: this.str(row.status || row['狀態'] || 'published'),
      is_batch: this.boolInt(row.isBatch || row['是否系列']),
      parent_activity_id: this.str(row.parentActivityId || row['父活動ID']),
      nfc_checkin_start: this.str(row.nfcCheckinStart || row['NFC簽到開始']),
      nfc_checkin_end: this.str(row.nfcCheckinEnd || row['NFC簽到結束']),
      nfc_same_day_only: row.nfcCheckinSameDayOnly === false ? 0 : 1,
      raw_json: this.json(row)
    };
  },

  normalizeRegistration(row, activityId, index) {
    const regId = this.str(row.registrationId || row.rowId || row.id || row['報名ID']) || `REG_${activityId}_${index}`;
    return {
      registration_id: regId,
      activity_id: this.str(row.activityId || row['活動ID'] || activityId),
      user_id: this.str(row.userId || row['LINE ID']),
      name: this.str(row.name || row['姓名'] || row.userName),
      phone: this.str(row.phone || row['手機'] || row['手機號碼'] || row.userPhone),
      identity: this.str(row.identity || row['身份'] || row['預設身份'] || '會員'),
      payment_status: this.str(row.paymentStatus || row['繳費狀態']),
      checkin_status: this.boolInt(row.checkinStatus || row['簽到']),
      checked_in_at: this.str(row.checkedInAt || row['簽到時間']),
      cancelled_at: this.str(row.cancelledAt || row['取消時間']),
      raw_json: this.json(row)
    };
  },

  async upsertUser(env, user) {
    await env.ACTMASTER_DB.prepare(`
      INSERT INTO users (row_id,line_id,name,industry,phone,birthday,socials,role,store_id,referrer_id,network_id,tg_token,tg_chat_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(line_id) DO UPDATE SET
        name=excluded.name,industry=excluded.industry,phone=excluded.phone,birthday=excluded.birthday,socials=excluded.socials,
        role=CASE
          WHEN users.role = 'admin' OR excluded.role = 'admin' THEN 'admin'
          WHEN users.role = 'store' OR excluded.role = 'store' THEN 'store'
          ELSE excluded.role
        END,
        store_id=excluded.store_id,referrer_id=excluded.referrer_id,network_id=excluded.network_id,
        tg_token=excluded.tg_token,tg_chat_id=excluded.tg_chat_id
    `).bind(user.user_id,user.line_id,user.name,user.industry,user.phone,user.birthday,user.socials_json,user.role,user.store_id,user.referrer_id,user.network_id,user.telegram_token,user.telegram_chat_id).run();
  },

  async upsertCard(env, card) {
    await env.ACTMASTER_DB.prepare(`
      INSERT INTO card_contacts (row_id,line_id,name,english_name,company_name,title,department,tax_id,mobile,office_phone,extension,fax,email,website,socials,address,services,notes,creator_id,image_url,custom_config,network_id,tags,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(row_id) DO UPDATE SET
        line_id=excluded.line_id,name=excluded.name,english_name=excluded.english_name,company_name=excluded.company_name,title=excluded.title,
        department=excluded.department,tax_id=excluded.tax_id,mobile=excluded.mobile,office_phone=excluded.office_phone,
        extension=excluded.extension,fax=excluded.fax,email=excluded.email,website=excluded.website,socials=excluded.socials,
        address=excluded.address,services=excluded.services,notes=excluded.notes,creator_id=excluded.creator_id,
        image_url=excluded.image_url,custom_config=excluded.custom_config,network_id=excluded.network_id,tags=excluded.tags,updated_at=CURRENT_TIMESTAMP
    `).bind(card.card_id,card.owner_user_id,card.name,card.english_name,card.company_name,card.title,card.department,card.tax_id,card.mobile,card.company_phone,card.extension,card.fax,card.email,card.website,card.social_accounts,card.address,card.service,card.note,card.creator_user_id,card.image_url,card.config_json,card.network_id,card.tags).run();
  },

  async upsertActivity(env, activity) {
    await env.ACTMASTER_DB.prepare(`
      INSERT INTO activities (activity_id,name,type,fee_type,price,start_time,end_time,description,image_url,creator_id,status,is_series)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(activity_id) DO UPDATE SET
        name=excluded.name,type=excluded.type,fee_type=excluded.fee_type,price=excluded.price,start_time=excluded.start_time,
        end_time=excluded.end_time,description=excluded.description,image_url=excluded.image_url,creator_id=excluded.creator_id,
        status=excluded.status,is_series=excluded.is_series
    `).bind(activity.activity_id,activity.name,activity.type,activity.fee_type,activity.price,activity.start_time,activity.end_time,activity.description,activity.image_url,activity.owner_user_id,activity.status,activity.is_batch).run();
  },

  async upsertRegistration(env, reg) {
    await env.ACTMASTER_DB.prepare(`
      INSERT INTO registrants (row_id,line_id,activity_name,name,phone,identity,checked_in,payment_status,activity_id,nfc_checkin_time)
      VALUES (?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(row_id) DO UPDATE SET
        line_id=excluded.line_id,activity_name=excluded.activity_name,name=excluded.name,phone=excluded.phone,identity=excluded.identity,
        checked_in=excluded.checked_in,payment_status=excluded.payment_status,activity_id=excluded.activity_id,nfc_checkin_time=excluded.nfc_checkin_time
    `).bind(reg.registration_id,reg.user_id,'',reg.name,reg.phone,reg.identity,reg.checkin_status,reg.payment_status,reg.activity_id,reg.checked_in_at).run();
  },

  assertCanWrite(payload, env) {
    if (payload.dryRun !== false) return;
    if (!env.MIGRATION_TOKEN || payload.migrationToken !== env.MIGRATION_TOKEN) {
      throw new Error('Missing or invalid MIGRATION_TOKEN');
    }
    if (payload.confirm !== 'BACKFILL_D1') throw new Error('Missing confirm=BACKFILL_D1');
  },

  async backfillFromGas(payload, env) {
    if (!env.ACTMASTER_DB) return { success: false, error: 'Missing ACTMASTER_DB binding' };
    this.assertCanWrite(payload || {}, env);

    const dryRun = payload.dryRun !== false;
    const includeRegistrations = payload.includeRegistrations === true;
    const summary = { dryRun, users: 0, boundUsers: 0, cards: 0, activities: 0, registrations: 0, errors: [] };

    const users = this.listFromResult(await DBModule.forward('getAllUsers', {}, env));
    for (let i = 0; i < users.length; i++) {
      const user = this.normalizeUser(users[i], i);
      if (!user) continue;
      summary.users++;
      if (!dryRun) await this.upsertUser(env, user);
    }

    const cards = this.listFromResult(await DBModule.forward('getCardContacts', { role: 'admin', networkId: 'admin' }, env));
    const seenUsers = new Set(users.map(u => this.str(u.userId || u['LINE ID'] || u.lineId)).filter(Boolean));
    for (let i = 0; i < cards.length; i++) {
      const card = this.normalizeCard(cards[i], i);
      if (!card.card_id) continue;
      summary.cards++;
      if (!dryRun) await this.upsertCard(env, card);

      const boundUser = this.normalizeUserFromCard(cards[i]);
      if (boundUser && !seenUsers.has(boundUser.user_id)) {
        seenUsers.add(boundUser.user_id);
        summary.boundUsers++;
        if (!dryRun) await this.upsertUser(env, boundUser);
      }
    }

    const activities = this.listFromResult(await DBModule.forward('getPublicActivities', {}, env), ['activities']);
    for (let i = 0; i < activities.length; i++) {
      const activity = this.normalizeActivity(activities[i], i);
      if (!activity.activity_id) continue;
      summary.activities++;
      if (!dryRun) await this.upsertActivity(env, activity);

      if (includeRegistrations) {
        try {
          const regs = this.listFromResult(await DBModule.forward('getActivityRegistrants', { activityId: activity.activity_id }, env), ['registrations']);
          for (let r = 0; r < regs.length; r++) {
            const reg = this.normalizeRegistration(regs[r], activity.activity_id, r);
            if (!reg.registration_id || !reg.activity_id) continue;
            summary.registrations++;
            if (!dryRun) await this.upsertRegistration(env, reg);
          }
        } catch (e) {
          summary.errors.push({ activityId: activity.activity_id, error: e.message });
        }
      }
    }

    return { success: true, data: summary };
  }
};

// ==================== 模組 6: 邊緣快取驗證 (Edge Auth KV Module) ====================
const D1ReadModule = {
  cardAccessSchemaReady: false,

  hasD1(env) {
    return !!(env && env.ACTMASTER_DB);
  },

  text(value, fallback = '') {
    const next = String(value ?? '').trim();
    return next || fallback;
  },

  role(value) {
    const next = this.text(value, 'user').toLowerCase();
    if (next === 'admin' || next === '總管') return 'admin';
    if (next === 'store' || next === 'tenant' || next === '店長' || next === '租戶') return 'store';
    return 'user';
  },

  jsonObject(value) {
    try {
      const parsed = typeof value === 'string' ? JSON.parse(value || '{}') : (value || {});
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (e) {
      return {};
    }
  },

  async ensureCardAccessColumns(env) {
    if (!this.hasD1(env) || this.cardAccessSchemaReady) return;
    const alters = [
      "ALTER TABLE card_contacts ADD COLUMN owner_user_id TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE card_contacts ADD COLUMN profile_user_id TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE card_contacts ADD COLUMN scanner_user_id TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE card_contacts ADD COLUMN scanner_name TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE card_contacts ADD COLUMN source_type TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE card_contacts ADD COLUMN visibility TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE card_contacts ADD COLUMN pool_eligible INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE card_contacts ADD COLUMN ai_review_status TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE card_contacts ADD COLUMN crm_status TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE card_contacts ADD COLUMN crm_type TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE card_contacts ADD COLUMN crm_next_action TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE card_contacts ADD COLUMN crm_next_followup_at TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE card_contacts ADD COLUMN crm_ai_suggestion TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE card_contacts ADD COLUMN source_event_id TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE card_contacts ADD COLUMN claimed_from_row_id TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE card_contacts ADD COLUMN claimed_by_uid TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE card_contacts ADD COLUMN claimed_at TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE card_contacts ADD COLUMN merged_into_row_id TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE card_contacts ADD COLUMN archived_at TEXT NOT NULL DEFAULT ''"
    ];
    for (const sql of alters) {
      try {
        await env.ACTMASTER_DB.prepare(sql).run();
      } catch (e) {
        const msg = String(e && e.message || e).toLowerCase();
        if (!msg.includes('duplicate column')) throw e;
      }
    }
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_card_contacts_owner ON card_contacts(owner_user_id)').run();
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_card_contacts_profile ON card_contacts(profile_user_id)').run();
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_card_contacts_scanner ON card_contacts(scanner_user_id)').run();
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_card_contacts_pool ON card_contacts(pool_eligible, visibility)').run();
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_card_contacts_crm_status ON card_contacts(owner_user_id, crm_status, updated_at)').run();
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_card_contacts_source_event ON card_contacts(source_event_id)').run();
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_card_contacts_source_type_owner ON card_contacts(source_type, owner_user_id, updated_at)').run();
    await env.ACTMASTER_DB.prepare(`
      CREATE TABLE IF NOT EXISTS card_import_events (
        event_id TEXT PRIMARY KEY,
        scanner_uid TEXT NOT NULL,
        inviter_uid TEXT NOT NULL DEFAULT 'admin',
        source TEXT NOT NULL DEFAULT 'line_oa',
        image_count INTEGER NOT NULL DEFAULT 1,
        raw_message_ids TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'received',
        card_row_id TEXT NOT NULL DEFAULT '',
        reject_reason TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_card_import_events_scanner ON card_import_events(scanner_uid, status, updated_at)').run();
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_card_import_events_card ON card_import_events(card_row_id)').run();
    this.cardAccessSchemaReady = true;
  },

  async first(env, sql, binds = []) {
    const stmt = env.ACTMASTER_DB.prepare(sql);
    return binds.length ? await stmt.bind(...binds).first() : await stmt.first();
  },

  async all(env, sql, binds = []) {
    const stmt = env.ACTMASTER_DB.prepare(sql);
    const result = binds.length ? await stmt.bind(...binds).all() : await stmt.all();
    return result && Array.isArray(result.results) ? result.results : [];
  },

  async getIdentityLink(env, userId) {
    const id = this.text(userId);
    if (!id) return null;
    try {
      return await this.first(env, `
        SELECT * FROM user_identity_links
        WHERE (new_line_id = ? OR old_line_id = ?)
          AND status IN ('active', 'replaced')
        ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, updated_at DESC, id DESC
        LIMIT 1
      `, [id, id]);
    } catch (e) {
      return null;
    }
  },

  async identityIdsForUser(env, userId) {
    const ids = [];
    const add = value => {
      const id = this.text(value);
      if (id && !ids.includes(id)) ids.push(id);
    };
    add(userId);
    const link = await this.getIdentityLink(env, userId).catch(() => null);
    if (link) {
      add(link.new_line_id);
      add(link.old_line_id);
    }
    for (let pass = 0; pass < 2 && ids.length; pass++) {
      const placeholders = ids.map(() => '?').join(', ');
      const rows = await this.all(env, `
        SELECT line_id,row_id,legacy_line_id,point_line_id
        FROM users
        WHERE line_id IN (${placeholders})
           OR row_id IN (${placeholders})
           OR legacy_line_id IN (${placeholders})
           OR point_line_id IN (${placeholders})
        LIMIT 20
      `, [...ids, ...ids, ...ids, ...ids]).catch(() => []);
      const before = ids.length;
      rows.forEach(row => {
        add(row && row.line_id);
        add(row && row.row_id);
        add(row && row.legacy_line_id);
        add(row && row.point_line_id);
      });
      if (ids.length === before) break;
    }
    return ids;
  },

  placeholders(values) {
    return (Array.isArray(values) ? values : []).map(() => '?').join(', ');
  },

  async cardByIdentity(env, userId, options = {}) {
    const ids = await this.identityIdsForUser(env, userId).catch(() => [this.text(userId)].filter(Boolean));
    const safeIds = ids.filter(Boolean);
    if (!safeIds.length) return null;
    const placeholders = this.placeholders(safeIds);
    const rowId = this.text(options.rowId);
    const excludeRowId = this.text(options.excludeRowId);
    const sourceType = this.text(options.sourceType);
    const binds = [...safeIds, ...safeIds, ...safeIds, ...safeIds];
    let extra = '';
    if (sourceType) {
      extra += ' AND source_type = ?';
      binds.push(sourceType);
    }
    if (rowId) {
      extra += ' AND row_id = ?';
      binds.push(rowId);
    }
    if (excludeRowId) {
      extra += ' AND row_id <> ?';
      binds.push(excludeRowId);
    }
    return await this.first(env, `
      SELECT * FROM card_contacts
      WHERE (
        line_id IN (${placeholders})
        OR creator_id IN (${placeholders})
        OR owner_user_id IN (${placeholders})
        OR profile_user_id IN (${placeholders})
      )
      ${extra}
      ORDER BY
        CASE WHEN source_type = 'self_profile' THEN 0 ELSE 1 END,
        COALESCE(updated_at, created_at) DESC,
        row_id DESC
      LIMIT 1
    `, binds).catch(() => null);
  },

  async findUserByIdentity(env, userId) {
    const id = this.text(userId);
    if (!id) return { user: null, link: null, canonicalId: '' };
    const link = await this.getIdentityLink(env, id);
    const ids = [];
    const addId = value => {
      const next = this.text(value);
      if (next && !ids.includes(next)) ids.push(next);
    };
    addId(link && link.new_line_id);
    addId(id);
    addId(link && link.old_line_id);

    for (const candidate of ids) {
      const user = await this.first(env, `
        SELECT * FROM users
        WHERE line_id = ? OR row_id = ? OR point_line_id = ? OR legacy_line_id = ?
        LIMIT 1
      `, [candidate, candidate, candidate, candidate]);
      if (user) {
        return {
          user,
          link,
          canonicalId: this.text(link && link.new_line_id, this.text(user.line_id || user.row_id, candidate))
        };
      }
    }
    return { user: null, link, canonicalId: this.text(link && link.new_line_id, id) };
  },

  userRow(row, source = 'd1_user') {
    if (!row) return null;
    const userId = this.text(row.line_id || row.row_id);
    if (!userId) return null;
    const role = SecurityModule.sanitizeRole(userId, row.role, row);
    const networkId = SecurityModule.effectiveNetworkId(userId, role, row);
    const socials = this.jsonObject(row.socials);
    const dealerProfile = socials.dealerProfile && typeof socials.dealerProfile === 'object' ? socials.dealerProfile : {};
    return {
      rowId: this.text(row.row_id, userId),
      userId,
      lineId: userId,
      name: this.text(row.name, '未命名'),
      phone: this.text(row.phone),
      industry: this.text(row.industry || row.title || row.company_name),
      birthday: this.text(row.birthday),
      personality: this.text(row.personality),
      hobbies: this.text(row.hobbies),
      wealth: this.text(row.wealth),
      health: this.text(row.health),
      career: this.text(row.career),
      role,
      roleLabel: role === 'admin' ? '總管' : (role === 'store' ? '店長' : '一般'),
      storeid: this.text(row.store_id),
      storeId: this.text(row.store_id),
      referrerId: this.text(row.referrer_id),
      networkId,
      tgToken: this.text(row.tg_token),
      tgChatId: this.text(row.tg_chat_id),
      legacyLineId: this.text(row.legacy_line_id),
      pointLineId: this.text(row.point_line_id),
      identitySource: this.text(row.identity_source),
      migratedAt: this.text(row.migrated_at),
      socials: this.text(row.socials),
      dealerProfile,
      kycStatus: this.text(dealerProfile.kycStatus),
      dealerType: this.text(dealerProfile.dealerType),
      taxId: this.text(dealerProfile.taxId),
      legalCompanyName: this.text(dealerProfile.legalCompanyName),
      points: Number(row.points || 0) || 0,
      source,
      profileStatus: source === 'bound_card' ? 'bound_card' : 'active'
    };
  },

  isValidPublicCardButton(button) {
    const label = this.text(button && (button.l || button.label || button.text));
    const url = this.text(button && (button.u || button.url || button.uri));
    return !!(label && /^(https?:\/\/|line:\/\/|tel:|mailto:)/i.test(url));
  },

  isPublicCardReady(row, cfg) {
    cfg = cfg || {};
    const imageUrl = this.text(cfg.imgUrl || cfg.imgUrlLandscape || cfg.imgUrlPortrait || cfg.imgUrlSquare || (row && (row.image_url || row.imageUrl || row['名片圖檔'])));
    const title = this.text(cfg.title || (row && (row.name || row.title || row['姓名'] || row['職稱'])));
    const desc = this.text(cfg.desc || (row && (row.services || row.description || row['服務項目'] || row['服務內容'])));
    const buttons = Array.isArray(cfg.buttons) ? cfg.buttons : [];
    const placeholderImage = !imageUrl ||
      imageUrl.toLowerCase().includes('assets/rental-template-cover.png') ||
      imageUrl.toLowerCase().includes('images.unsplash.com/photo-1616628188550-808682f3926d');
    return !placeholderImage &&
      title.length >= 2 &&
      desc.length >= 8 &&
      cfg.templateDraft !== true &&
      buttons.length > 0 &&
      buttons.every(button => this.isValidPublicCardButton(button));
  },

  inferCardAccess(row, options = {}) {
    const cfg = this.jsonObject(row && (row.custom_config || row.customConfig || row['自訂名片設定']));
    const creatorId = this.text(row && (row.creator_id || row.creatorId || row['建檔者ID']));
    const lineId = this.text(row && (row.line_id || row.lineId || row['LINE ID']));
    const rowId = this.text(row && (row.row_id || row.rowId || row.id)).toUpperCase();
    const actorId = this.text(options.actorId);
    const ownerUserId = this.text(row && (row.owner_user_id || row.ownerUserId), creatorId || actorId || lineId);
    const profileUserId = this.text(row && (row.profile_user_id || row.profileUserId), lineId);
    const rawExplicitSource = this.text(row && (row.source_type || row.sourceType || cfg.sourceType));
    const isDedicatedVideo = rowId.startsWith('CARD_VIDEO_') ||
      cfg.videoCard === true ||
      cfg.videoStorageKind === 'dedicated_video_card' ||
      this.text(cfg.cardType).toLowerCase() === 'video' ||
      this.text(cfg.cardVariant).toLowerCase() === 'video_card';
    const explicitSource = isDedicatedVideo ? 'video_profile' : rawExplicitSource;
    const explicitVisibility = this.text(row && (row.visibility || cfg.visibility)).toLowerCase();
    const safetyStatus = this.text(row && (row.ai_review_status || row.aiReviewStatus), cfg.safetyReview ? (cfg.safetyReview.pass ? 'passed' : 'failed') : '');
    const isSelfProfile = !isDedicatedVideo && (explicitSource === 'self_profile'
      || (!!lineId && !!creatorId && lineId === creatorId)
      || (!!lineId && !!ownerUserId && lineId === ownerUserId && (cfg.templateVersion || cfg.cardType || cfg.buttons)));
    const sourceType = isDedicatedVideo ? 'video_profile' : (explicitSource || (isSelfProfile ? 'self_profile' : 'private_import'));
    const cfgPrivate = cfg.isPrivate === true || cfg.private === true;
    const visibility = explicitVisibility || ((isSelfProfile && !cfgPrivate) ? 'public' : 'private');
    const hasStoredAccess = !!(explicitSource || explicitVisibility || this.text(row && row.ai_review_status));
    const storedPool = hasStoredAccess && row && row.pool_eligible !== undefined && row.pool_eligible !== null && String(row.pool_eligible).trim() !== ''
      ? Number(row.pool_eligible) === 1
      : null;
    const aiPassed = safetyStatus === 'passed';
    const publicReady = this.isPublicCardReady(row, cfg);
    const poolEligible = storedPool !== null
      ? !!(storedPool && publicReady && aiPassed)
      : !!(isSelfProfile && visibility === 'public' && publicReady && aiPassed);
    return {
      ownerUserId,
      profileUserId,
      sourceType,
      visibility,
      poolEligible,
      aiReviewStatus: safetyStatus || 'pending',
      isPrivate: visibility !== 'public',
      isSelfProfile
    };
  },

  inferCrmType(row) {
    const text = [
      row && row.title,
      row && row.company_name,
      row && row.department,
      row && row.services,
      row && row.notes,
      row && row.tags
    ].map(v => this.text(v).toLowerCase()).join(' ');
    if (!text.trim()) return '待判斷';
    if (/保險|房仲|不動產|地產|租|建設|投資|理財|貸款|金融/.test(text)) return '潛在客戶';
    if (/董事|總經理|負責人|創辦|店長|經理|協會|理事|主任|總監/.test(text)) return '合作夥伴';
    if (/通路|行銷|媒體|廣告|社群|電商|直播|業務|銷售/.test(text)) return '通路資源';
    if (/教育|講師|顧問|課程|教練|培訓/.test(text)) return '課程合作';
    if (/供應|製造|印刷|設計|工程|系統|開發|科技/.test(text)) return '供應商';
    return '待判斷';
  },

  inferCrmNextAction(row, crmType) {
    const phone = this.text(row && (row.mobile || row.office_phone));
    if (!phone) return '補齊聯絡方式';
    if (crmType === '通路資源') return '傳送合作說明';
    if (crmType === '課程合作') return '邀請課程或訪談';
    if (crmType === '合作夥伴') return '安排 1 對 1 訪談';
    if (crmType === '供應商') return '詢問合作條件';
    return '初次聯繫';
  },

  inferCrmSuggestion(row, crmType, nextAction) {
    const name = this.text(row && row.name, '此客戶');
    const company = this.text(row && row.company_name);
    const title = this.text(row && row.title);
    const identity = [company, title].filter(Boolean).join(' / ');
    if (crmType === '待判斷') return `${name}${identity ? '（' + identity + '）' : ''}已建立，建議先補上備註與客戶類型，再安排下一步。`;
    return `${name}${identity ? '（' + identity + '）' : ''}被歸類為${crmType}，建議下一步：${nextAction}。`;
  },

  cardRow(row) {
    if (!row) return null;
    const config = this.text(row.custom_config);
    const access = this.inferCardAccess(row);
    return {
      rowId: this.text(row.row_id),
      id: this.text(row.row_id),
      lineId: this.text(row.line_id),
      userId: this.text(row.line_id),
      creatorId: this.text(row.creator_id),
      ownerUserId: access.ownerUserId,
      profileUserId: access.profileUserId,
      scannerUserId: this.text(row.scanner_user_id),
      scannerName: this.text(row.scanner_name),
      sourceEventId: this.text(row.source_event_id),
      claimedFromRowId: this.text(row.claimed_from_row_id),
      claimedByUid: this.text(row.claimed_by_uid),
      claimedAt: this.text(row.claimed_at),
      mergedIntoRowId: this.text(row.merged_into_row_id),
      archivedAt: this.text(row.archived_at),
      sourceType: access.sourceType,
      visibility: access.visibility,
      poolEligible: access.poolEligible,
      aiReviewStatus: access.aiReviewStatus,
      crmStatus: this.text(row.crm_status, access.isSelfProfile ? '個人名片' : '新名片'),
      crmType: this.text(row.crm_type, this.inferCrmType(row)),
      crmNextAction: this.text(row.crm_next_action, this.inferCrmNextAction(row, this.inferCrmType(row))),
      crmNextFollowupAt: this.text(row.crm_next_followup_at),
      crmAiSuggestion: this.text(row.crm_ai_suggestion, this.inferCrmSuggestion(row, this.inferCrmType(row), this.inferCrmNextAction(row, this.inferCrmType(row)))),
      isPrivate: access.isPrivate,
      isSelfProfile: access.isSelfProfile,
      networkId: this.text(row.network_id, 'admin'),
      name: this.text(row.name, '未命名'),
      englishName: this.text(row.english_name),
      companyName: this.text(row.company_name),
      title: this.text(row.title),
      department: this.text(row.department),
      taxId: this.text(row.tax_id),
      mobile: this.text(row.mobile),
      officePhone: this.text(row.office_phone),
      extension: this.text(row.extension),
      fax: this.text(row.fax),
      email: this.text(row.email),
      website: this.text(row.website),
      socials: this.text(row.socials),
      address: this.text(row.address),
      birthday: this.text(row.birthday),
      personality: this.text(row.personality),
      hobbies: this.text(row.hobbies),
      wealth: this.text(row.wealth),
      health: this.text(row.health),
      career: this.text(row.career),
      services: this.text(row.services),
      notes: this.text(row.notes),
      imageUrl: this.text(row.image_url),
      customConfig: config,
      tags: this.text(row.tags),
      createdAt: this.text(row.created_at),
      updatedAt: this.text(row.updated_at),
      fateAnalysisStatus: this.text(row.fate_analysis_status, 'not_requested'),
      fateAnalyzedAt: this.text(row.fate_analyzed_at),
      'LINE ID': this.text(row.line_id),
      ['\u500b\u6027']: this.text(row.personality),
      ['\u8208\u8da3']: this.text(row.hobbies),
      ['\u8ca1\u5bcc']: this.text(row.wealth),
      ['\u5065\u5eb7']: this.text(row.health),
      ['\u4e8b\u696d']: this.text(row.career),
      '姓名': this.text(row.name, '未命名'),
      '英文名': this.text(row.english_name),
      '公司名稱': this.text(row.company_name),
      '職稱': this.text(row.title),
      '部門': this.text(row.department),
      '統一編號': this.text(row.tax_id),
      '手機號碼': this.text(row.mobile),
      '公司電話': this.text(row.office_phone),
      '分機': this.text(row.extension),
      '傳真': this.text(row.fax),
      '電子郵件': this.text(row.email),
      '公司網址': this.text(row.website),
      '社群帳號': this.text(row.socials),
      '公司地址': this.text(row.address),
      '生日': this.text(row.birthday),
      '服務項目': this.text(row.services),
      '建檔人/備註': this.text(row.notes),
      '建檔者ID': this.text(row.creator_id),
      '擁有人ID': access.ownerUserId,
      '名片來源': access.sourceType,
      '公開狀態': access.visibility,
      '客戶狀態': this.text(row.crm_status, access.isSelfProfile ? '個人名片' : '新名片'),
      '客戶類型': this.text(row.crm_type, this.inferCrmType(row)),
      '建議下一步': this.text(row.crm_next_action, this.inferCrmNextAction(row, this.inferCrmType(row))),
      '下次跟進時間': this.text(row.crm_next_followup_at),
      'AI建議': this.text(row.crm_ai_suggestion, this.inferCrmSuggestion(row, this.inferCrmType(row), this.inferCrmNextAction(row, this.inferCrmType(row)))),
      '名片圖檔': this.text(row.image_url),
      '自訂名片設定': config,
      '電子名片設定': config,
      '歸屬網': this.text(row.network_id, 'admin'),
      '標籤': this.text(row.tags)
    };
  },

  userFromCard(row) {
    if (!row || !this.text(row.line_id)) return null;
    return {
      user_id: this.text(row.line_id),
      line_id: this.text(row.line_id),
      name: this.text(row.name, '未命名'),
      phone: this.text(row.mobile || row.office_phone),
      industry: this.text(row.title || row.company_name, '名片會員'),
      birthday: this.text(row.birthday),
      socials_json: this.text(row.socials) || '[]',
      role: 'user',
      store_id: '',
      referrer_id: '',
      network_id: this.text(row.network_id, 'admin'),
      telegram_token: '',
      telegram_chat_id: ''
    };
  },

  cardMatchesHardAdmin(card, account) {
    if (!card || !account) return false;
    const name = this.text(card.name);
    const phone = SecurityModule.normalizePhone(card.mobile || card.office_phone);
    const phoneMatch = !!phone && account.phones.includes(phone);
    const nameMatch = !!name && account.names.some(allowed => name.includes(allowed));
    return phoneMatch && nameMatch;
  },

  hardAdminAccountFromIdentity(userId, link) {
    const ids = [
      userId,
      link && link.old_line_id,
      link && link.new_line_id
    ].map(value => this.text(value)).filter(Boolean);
    return SecurityModule.hardAdminAccounts.find(account => ids.some(id => account.ids.includes(id))) || null;
  },

  async findBestBoundCard(env, userId, identity = {}) {
    const id = this.text(userId);
    const link = identity && identity.link;
    const ids = [];
    const addId = value => {
      const next = this.text(value);
      if (next && !ids.includes(next)) ids.push(next);
    };
    addId(id);
    addId(link && link.new_line_id);
    addId(link && link.old_line_id);
    if (!ids.length) return null;

    const placeholders = ids.map(() => '?').join(',');
    const cards = await this.all(env, `
      SELECT * FROM card_contacts
      WHERE line_id IN (${placeholders})
         OR profile_user_id IN (${placeholders})
         OR owner_user_id IN (${placeholders})
         OR claimed_by_uid IN (${placeholders})
         OR (
           creator_id IN (${placeholders})
           AND LOWER(COALESCE(source_type,'')) = 'self_profile'
           AND TRIM(COALESCE(line_id,'')) = ''
           AND TRIM(COALESCE(owner_user_id,'')) = ''
           AND TRIM(COALESCE(profile_user_id,'')) = ''
         )
      ORDER BY
        CASE
          WHEN line_id IN (${placeholders}) THEN 0
          WHEN profile_user_id IN (${placeholders}) THEN 1
          WHEN owner_user_id IN (${placeholders}) THEN 2
          WHEN claimed_by_uid IN (${placeholders}) THEN 3
          ELSE 4
        END,
        CASE WHEN LOWER(COALESCE(source_type,'')) = 'self_profile' THEN 0 ELSE 1 END,
        COALESCE(updated_at, created_at) DESC,
        row_id DESC
      LIMIT 50
    `, [
      ...ids, ...ids, ...ids, ...ids, ...ids,
      ...ids, ...ids, ...ids, ...ids
    ]).catch(() => []);

    const account = this.hardAdminAccountFromIdentity(id, link);
    if (account) {
      const ownCard = cards.find(card => this.cardMatchesHardAdmin(card, account));
      if (ownCard) return ownCard;
    }
    return cards.find(card => ids.includes(this.text(card.line_id))) ||
      cards.find(card => ids.includes(this.text(card.profile_user_id))) ||
      cards.find(card => ids.includes(this.text(card.owner_user_id))) ||
      cards[0] ||
      null;
  },

  async upsertBoundUserFromCard(env, card, options = {}) {
    const user = this.userFromCard(card);
    if (!user) return null;
    if (options.userId) {
      user.user_id = this.text(options.userId);
      user.line_id = this.text(options.userId);
    }
    if (options.role) user.role = this.text(options.role, user.role);
    if (options.networkId) user.network_id = this.text(options.networkId, user.network_id);
    await D1BackfillModule.upsertUser(env, user);
    if (options.legacyLineId || options.pointLineId || options.identitySource || options.role) {
      await env.ACTMASTER_DB.prepare(`
        UPDATE users
        SET role = CASE
              WHEN ? = 'admin' OR role = 'admin' THEN 'admin'
              WHEN ? = 'store' OR role = 'store' THEN 'store'
              ELSE role
            END,
            legacy_line_id = CASE WHEN ? <> '' THEN ? ELSE legacy_line_id END,
            point_line_id = CASE WHEN ? <> '' THEN ? ELSE point_line_id END,
            identity_source = CASE WHEN ? <> '' THEN ? ELSE identity_source END,
            migrated_at = CASE WHEN ? <> '' THEN CURRENT_TIMESTAMP ELSE migrated_at END
        WHERE line_id = ? OR row_id = ?
      `).bind(
        this.text(options.role),
        this.text(options.role),
        this.text(options.legacyLineId), this.text(options.legacyLineId),
        this.text(options.pointLineId), this.text(options.pointLineId),
        this.text(options.identitySource), this.text(options.identitySource),
        this.text(options.identitySource),
        user.line_id,
        user.user_id
      ).run().catch(e => console.error('bound user identity update skipped', e));
    }
    const saved = await this.first(env, 'SELECT * FROM users WHERE line_id = ? OR row_id = ? LIMIT 1', [user.line_id, user.user_id]).catch(() => null);
    if (saved) return this.userRow(saved, options.source || 'bound_card');
    return this.userRow({
      row_id: user.user_id,
      line_id: user.line_id,
      name: user.name,
      phone: user.phone,
      industry: user.industry,
      birthday: user.birthday,
      role: user.role,
      network_id: user.network_id
    }, options.source || 'bound_card');
  },

  async checkUser(payload, env) {
    if (!this.hasD1(env)) return null;
    const userId = this.text(payload.userId || payload.lineId);
    if (!userId) return { success: false, error: 'Missing userId' };

    const identity = await this.findUserByIdentity(env, userId);
    const user = identity.user;
    if (user) {
      const profile = this.userRow(user);
      profile.requestedUserId = userId;
      profile.canonicalUserId = identity.canonicalId || profile.userId;
      if (identity.link) {
        profile.identityLink = {
          oldLineId: this.text(identity.link.old_line_id),
          newLineId: this.text(identity.link.new_line_id),
          matchMethod: this.text(identity.link.match_method),
          confidence: this.text(identity.link.confidence)
        };
      }
      if (env.ACTMASTER_KV) {
        await env.ACTMASTER_KV.put(`U_PROFILE_${userId}`, JSON.stringify(profile), { expirationTtl: 600 });
      }
      return { success: true, data: { isRegistered: true, info: profile, source: identity.link ? 'identity_link' : 'd1_user' } };
    }

    const card = await this.findBestBoundCard(env, userId, identity);
    if (card) {
      const account = this.hardAdminAccountFromIdentity(userId, identity.link);
      const isLinkedHardAdmin = !!(account && this.cardMatchesHardAdmin(card, account));
      const profile = await this.upsertBoundUserFromCard(env, card, {
        userId,
        role: isLinkedHardAdmin ? 'admin' : 'user',
        networkId: isLinkedHardAdmin ? 'admin' : this.text(card.network_id, 'admin'),
        legacyLineId: identity.link && identity.link.old_line_id,
        pointLineId: identity.link && identity.link.new_line_id,
        identitySource: identity.link ? 'identity_bound_card' : '',
        source: isLinkedHardAdmin ? 'hard_admin_bound_card' : 'bound_card'
      });
      if (profile && env.ACTMASTER_KV) {
        await env.ACTMASTER_KV.put(`U_PROFILE_${userId}`, JSON.stringify(profile), { expirationTtl: 600 });
      }
      return { success: true, data: { isRegistered: true, info: profile, source: 'bound_card' } };
    }

    return { success: true, data: { isRegistered: false, info: null, source: 'd1' } };
  },

  async linkUserIdentity(payload, env) {
    if (!this.hasD1(env)) return null;
    const oldUserId = this.text(payload.oldUserId || payload.previousUserId || payload.legacyUserId);
    const newUserId = this.text(payload.newUserId || payload.authenticatedUserId || payload.userId);
    if (!oldUserId || !newUserId) return { success: false, error: 'Missing identity ids' };
    if (oldUserId === newUserId) return await this.checkUser({ userId: newUserId }, env);

    const existingNew = await this.first(env, 'SELECT * FROM users WHERE line_id = ? OR row_id = ? LIMIT 1', [newUserId, newUserId]);
    if (existingNew) {
      const profile = this.userRow(existingNew);
      if (env.ACTMASTER_KV) await env.ACTMASTER_KV.put(`U_PROFILE_${newUserId}`, JSON.stringify(profile), { expirationTtl: 600 });
      return { success: true, data: { isRegistered: true, info: profile, source: 'identity_existing' } };
    }

    const oldUser = await this.first(env, 'SELECT * FROM users WHERE line_id = ? OR row_id = ? LIMIT 1', [oldUserId, oldUserId]);
    if (!oldUser) return { success: false, error: '找不到舊會員資料' };

    const cachedName = this.text(payload.name || payload.cachedName);
    const cachedPhone = this.text(payload.phone || payload.cachedPhone);
    const oldName = this.text(oldUser.name);
    const oldPhone = this.text(oldUser.phone);
    const isHardAdmin = SecurityModule.isHardAdmin(oldUserId, oldUser);
    const nameOk = cachedName && oldName && cachedName === oldName;
    const phoneOk = cachedPhone && oldPhone && cachedPhone === oldPhone;
    if (!isHardAdmin && !nameOk && !phoneOk) {
      return { success: false, error: '舊帳號驗證不足，請由管理員合併身份' };
    }

    try {
      await env.ACTMASTER_DB.prepare('DELETE FROM user_identity_links WHERE old_line_id = ? OR new_line_id = ?').bind(oldUserId, newUserId).run();
      await env.ACTMASTER_DB.prepare(`
        INSERT INTO user_identity_links (old_line_id,new_line_id,match_method,confidence,status,note,updated_at)
        VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)
      `).bind(
        oldUserId,
        newUserId,
        phoneOk ? 'phone_cache' : (nameOk ? 'name_cache' : 'hard_admin'),
        phoneOk || isHardAdmin ? 'high' : 'medium',
        'active',
        'linked during LIFF identity recovery'
      ).run();
    } catch (e) {
      console.error('identity link write skipped', e);
    }

    await env.ACTMASTER_DB.prepare(`
      INSERT INTO users (row_id,line_id,name,industry,gender,phone,birthday,region,address,socials,role,store_id,referrer_id,network_id,tg_token,tg_chat_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(line_id) DO UPDATE SET
        name=excluded.name,industry=excluded.industry,gender=excluded.gender,phone=excluded.phone,birthday=excluded.birthday,
        region=excluded.region,address=excluded.address,socials=excluded.socials,role=excluded.role,store_id=excluded.store_id,
        referrer_id=excluded.referrer_id,network_id=excluded.network_id,tg_token=excluded.tg_token,tg_chat_id=excluded.tg_chat_id
    `).bind(
      `USR_${newUserId}`,
      newUserId,
      oldUser.name || cachedName || '',
      oldUser.industry || '',
      oldUser.gender || '',
      oldUser.phone || cachedPhone || '',
      oldUser.birthday || '',
      oldUser.region || '',
      oldUser.address || '',
      oldUser.socials || '',
      isHardAdmin ? 'admin' : (oldUser.role || 'user'),
      oldUser.store_id || '',
      oldUser.referrer_id || '',
      oldUser.network_id || 'admin',
      oldUser.tg_token || '',
      oldUser.tg_chat_id || ''
    ).run();

    try {
      await env.ACTMASTER_DB.prepare(`
        UPDATE users
        SET legacy_line_id = ?, point_line_id = ?, identity_source = 'point_liff', migrated_at = CURRENT_TIMESTAMP
        WHERE line_id = ? OR row_id = ?
      `).bind(oldUserId, newUserId, newUserId, `USR_${newUserId}`).run();
    } catch (e) {
      console.error('identity columns update skipped', e);
    }

    await env.ACTMASTER_DB.prepare('UPDATE card_contacts SET line_id = ?, updated_at = CURRENT_TIMESTAMP WHERE line_id = ?').bind(newUserId, oldUserId).run();
    await env.ACTMASTER_DB.prepare('UPDATE registrants SET line_id = ? WHERE line_id = ?').bind(newUserId, oldUserId).run().catch(() => null);

    if (env.ACTMASTER_KV) {
      await env.ACTMASTER_KV.delete(`U_PROFILE_${oldUserId}`).catch(() => null);
      await env.ACTMASTER_KV.delete(`U_PROFILE_${newUserId}`).catch(() => null);
    }

    const migrated = await this.first(env, 'SELECT * FROM users WHERE line_id = ? LIMIT 1', [newUserId]);
    const profile = this.userRow(migrated);
    if (env.ACTMASTER_KV) await env.ACTMASTER_KV.put(`U_PROFILE_${newUserId}`, JSON.stringify(profile), { expirationTtl: 600 });
    return { success: true, data: { isRegistered: true, info: profile, oldUserId, newUserId, source: 'identity_linked' } };
  },

  async getAllUsers(payload, env) {
    if (!this.hasD1(env)) return null;
    const users = await this.all(env, 'SELECT * FROM users ORDER BY created_at DESC, row_id DESC LIMIT 500');
    const merged = [];
    const seen = new Set();
    const seenIdentity = new Set();
    const identityKey = (profile) => {
      const phone = this.text(profile.phone).replace(/\D/g, '');
      if (phone.length >= 7) return `phone:${phone}`;
      const name = this.text(profile.name).toLowerCase();
      const network = this.text(profile.networkId, 'admin').toLowerCase();
      return name ? `name:${network}:${name}` : '';
    };
    const hasUsefulProfile = (profile) => {
      const role = this.text(profile.role, 'user').toLowerCase();
      if (['admin', 'store', 'tenant'].includes(role)) return true;
      const placeholders = new Set(['-', '—', '未填寫', '未命名', '待補資料', '無電話', '尚無 Email', '尚無公司資料', '已綁定名片']);
      return [profile.name, profile.phone, profile.email, profile.companyName, profile.title, profile.industry, profile.birthday, profile.city, profile.area, profile.address]
        .some(value => {
          const text = this.text(value);
          return text && !placeholders.has(text);
        });
    };
    const addProfile = (profile) => {
      if (!profile || seen.has(profile.userId) || !hasUsefulProfile(profile)) return;
      const key = identityKey(profile);
      if (key && seenIdentity.has(key)) return;
      seen.add(profile.userId);
      if (key) seenIdentity.add(key);
      merged.push(profile);
    };

    users.forEach(row => {
      const profile = this.userRow(row);
      addProfile(profile);
    });

    const cards = await this.all(env, "SELECT * FROM card_contacts WHERE line_id IS NOT NULL AND TRIM(line_id) <> '' ORDER BY created_at DESC LIMIT 500");
    cards.forEach(row => {
      const userId = this.text(row.line_id);
      if (!userId || seen.has(userId)) return;
      const profile = this.userRow({
        row_id: userId,
        line_id: userId,
        name: row.name,
        phone: row.mobile || row.office_phone,
        industry: row.title || row.company_name,
        role: 'user',
        network_id: row.network_id
      }, 'bound_card');
      addProfile(profile);
    });

    return { success: true, data: merged };
  },

  async getCardContacts(payload, env) {
    if (!this.hasD1(env)) return null;
    await this.ensureCardAccessColumns(env);
    const limit = Math.min(Math.max(Number(payload.limit || 200) || 200, 1), 500);
    const role = this.role(payload.authenticatedRole || 'user');
    const actorId = this.text(payload.authenticatedUserId || payload.userId);
    let rows = [];
    if (role === 'admin') {
      rows = await this.all(env, `SELECT * FROM card_contacts ORDER BY COALESCE(updated_at, created_at) DESC, row_id DESC LIMIT ${limit}`);
    } else if (actorId) {
      const ids = await this.identityIdsForUser(env, actorId);
      const placeholders = ids.map(() => '?').join(',');
      rows = await this.all(env, `
        SELECT * FROM card_contacts
        WHERE line_id IN (${placeholders}) OR creator_id IN (${placeholders})
           OR owner_user_id IN (${placeholders}) OR profile_user_id IN (${placeholders})
        ORDER BY COALESCE(updated_at, created_at) DESC, row_id DESC
        LIMIT ${limit}
      `, [...ids, ...ids, ...ids, ...ids]);
    }
    return { success: true, data: rows.map(row => this.cardRow(row)).filter(Boolean) };
  },

  async getCardHarvestContacts(payload, env) {
    if (!this.hasD1(env)) return null;
    await this.ensureCardAccessColumns(env);
    const limit = Math.min(Math.max(Number(payload.limit || 200) || 200, 1), 500);
    const actorId = this.text(payload.authenticatedUserId || payload.userId);
    if (!actorId) return { success: true, data: [] };
    const ids = await this.identityIdsForUser(env, actorId);
    if (!ids.length) ids.push(actorId);
    const placeholders = ids.map(() => '?').join(',');
    const rows = await this.all(env, `
      SELECT * FROM card_contacts
      WHERE (
        scanner_user_id IN (${placeholders})
        OR (
          TRIM(COALESCE(scanner_user_id,'')) = ''
          AND (
            creator_id IN (${placeholders})
            OR owner_user_id IN (${placeholders})
          )
        )
      )
      AND LOWER(COALESCE(source_type,'')) <> 'self_profile'
      AND LOWER(COALESCE(source_type,'')) <> 'referral_placeholder'
      ORDER BY COALESCE(updated_at, created_at) DESC, row_id DESC
      LIMIT ${limit}
    `, [...ids, ...ids, ...ids]);
    return { success: true, data: rows.map(row => this.cardRow(row)).filter(Boolean) };
  },

  async getPublicCardById(payload, env) {
    if (!this.hasD1(env)) return null;
    await this.ensureCardAccessColumns(env);
    const rowId = this.text(payload.rowId || payload.cardId || payload.id || payload.webCardId || payload.shareCardId);
    if (!rowId) return { success: false, error: 'Missing card id' };
    const row = await this.first(env, 'SELECT * FROM card_contacts WHERE row_id = ? LIMIT 1', [rowId]);
    if (!row) return { success: false, error: '找不到這張名片' };
    return { success: true, data: this.cardRow(row) };
  },

  crmContactRow(row) {
    if (!row) return null;
    const card = this.cardRow(row);
    const phone = this.text(card.mobile || card.officePhone);
    return {
      rowId: card.rowId,
      cardRowId: card.rowId,
      userId: card.lineId,
      ownerUserId: card.ownerUserId,
      profileUserId: card.profileUserId,
      name: card.name,
      phone,
      email: card.email,
      company: card.companyName,
      title: card.title,
      tags: card.tags,
      personality: card.personality,
      hobbies: card.hobbies,
      wealth: card.wealth,
      health: card.health,
      career: card.career,
      ['\u500b\u6027']: card.personality,
      ['\u8208\u8da3']: card.hobbies,
      ['\u8ca1\u5bcc']: card.wealth,
      ['\u5065\u5eb7']: card.health,
      ['\u4e8b\u696d']: card.career,
      sourceType: card.sourceType,
      visibility: card.visibility,
      poolEligible: card.poolEligible,
      crmStatus: card.crmStatus,
      crmType: card.crmType,
      crmNextAction: card.crmNextAction,
      crmNextFollowupAt: card.crmNextFollowupAt,
      crmAiSuggestion: card.crmAiSuggestion,
      ownerNetwork: card.networkId,
      ownerName: this.text(row.owner_name),
      ownerStoreId: this.text(row.owner_store_id),
      activityCount: 0,
      activities: [],
      lastActivityTime: this.text(row.updated_at || row.created_at)
    };
  },

  async getCrmContacts(payload, env) {
    if (!this.hasD1(env)) return null;
    await this.ensureCardAccessColumns(env);
    const role = this.role(payload.authenticatedRole || payload.role);
    const actorId = this.text(payload.authenticatedUserId || payload.userId);
    const limit = Math.min(Math.max(Number(payload.limit || 200) || 200, 1), 500);
    const baseSelect = `
      SELECT c.*, u.name AS owner_name, u.store_id AS owner_store_id
      FROM card_contacts c
      LEFT JOIN users u ON u.line_id = COALESCE(NULLIF(c.owner_user_id,''), NULLIF(c.creator_id,''), NULLIF(c.line_id,''))
    `;
    let rows = [];
    if (role === 'admin') {
      rows = await this.all(env, `${baseSelect} ORDER BY COALESCE(c.updated_at, c.created_at) DESC, c.row_id DESC LIMIT ${limit}`);
    } else if (actorId) {
      const ids = await this.identityIdsForUser(env, actorId);
      const placeholders = ids.map(() => '?').join(',');
      rows = await this.all(env, `
        ${baseSelect}
        WHERE c.owner_user_id IN (${placeholders}) OR c.creator_id IN (${placeholders})
           OR c.line_id IN (${placeholders}) OR c.profile_user_id IN (${placeholders})
        ORDER BY COALESCE(c.updated_at, c.created_at) DESC, c.row_id DESC
        LIMIT ${limit}
      `, [...ids, ...ids, ...ids, ...ids]);
    }
    return { success: true, data: rows.map(row => this.crmContactRow(row)).filter(Boolean) };
  },

  async updateCrmContact(payload, env) {
    if (!this.hasD1(env)) return null;
    await this.ensureCardAccessColumns(env);
    const rowId = this.text(payload.rowId || payload.cardRowId);
    const actorId = this.text(payload.authenticatedUserId || payload.userId);
    const role = this.role(payload.authenticatedRole || payload.role);
    if (!rowId) return { success: false, error: 'Missing card row id' };
    const row = await this.first(env, 'SELECT * FROM card_contacts WHERE row_id = ? LIMIT 1', [rowId]);
    if (!row) return { success: false, error: '找不到名片資料' };
    if (role !== 'admin') {
      const ids = actorId ? await this.identityIdsForUser(env, actorId) : [];
      const ownerId = this.text(row.owner_user_id || row.creator_id || row.line_id);
      if (!ids.includes(ownerId) && !ids.includes(this.text(row.creator_id)) && !ids.includes(this.text(row.profile_user_id))) {
        return { success: false, error: '無權限更新此客戶資料' };
      }
    }
    const allowedStatuses = new Set(['新名片', '已初次聯繫', '已發送資料', '已邀約', '已報名活動', '已到場', '已成交', '已流失', '暫緩追蹤', '個人名片']);
    const status = this.text(payload.crmStatus || payload.status || row.crm_status, row.crm_status || '新名片');
    const crmType = this.text(payload.crmType || payload.type || row.crm_type, row.crm_type || this.inferCrmType(row));
    const nextAction = this.text(payload.crmNextAction || payload.nextAction || row.crm_next_action, row.crm_next_action || this.inferCrmNextAction(row, crmType));
    const nextFollowupAt = this.text(payload.crmNextFollowupAt || payload.nextFollowupAt || row.crm_next_followup_at);
    const suggestion = this.text(payload.crmAiSuggestion || payload.aiSuggestion || row.crm_ai_suggestion, row.crm_ai_suggestion || this.inferCrmSuggestion(row, crmType, nextAction));
    if (!allowedStatuses.has(status)) return { success: false, error: '不支援的客戶狀態' };
    await env.ACTMASTER_DB.prepare(`
      UPDATE card_contacts
      SET crm_status = ?, crm_type = ?, crm_next_action = ?, crm_next_followup_at = ?, crm_ai_suggestion = ?, updated_at = CURRENT_TIMESTAMP
      WHERE row_id = ?
    `).bind(status, crmType, nextAction, nextFollowupAt, suggestion, rowId).run();
    const updated = await this.first(env, 'SELECT * FROM card_contacts WHERE row_id = ? LIMIT 1', [rowId]);
    return { success: true, data: this.crmContactRow(updated) };
  },

  async previewIdentityMigration(payload, env) {
    if (!this.hasD1(env)) return null;
    const limit = Math.min(Math.max(Number(payload.limit || 100) || 100, 1), 500);
    let links = [];
    let linksTableReady = true;
    try {
      links = await this.all(env, 'SELECT * FROM user_identity_links ORDER BY updated_at DESC, id DESC LIMIT ?', [limit]);
    } catch (e) {
      linksTableReady = false;
    }

    const users = await this.all(env, 'SELECT * FROM users ORDER BY created_at DESC, row_id DESC LIMIT ?', [limit]);
    const cards = await this.all(env, `
      SELECT * FROM card_contacts
      WHERE line_id IS NOT NULL AND TRIM(line_id) <> ''
      ORDER BY COALESCE(updated_at, created_at) DESC, row_id DESC
      LIMIT ?
    `, [limit]);

    const linkedOld = new Set(links.map(row => this.text(row.old_line_id)).filter(Boolean));
    const linkedNew = new Set(links.map(row => this.text(row.new_line_id)).filter(Boolean));
    const canonicalMap = new Map();
    const setCanonical = (from, to) => {
      const source = this.text(from);
      const target = this.text(to);
      if (source && target) canonicalMap.set(source, target);
    };
    links.forEach(row => {
      setCanonical(row.old_line_id, row.new_line_id);
      setCanonical(row.new_line_id, row.new_line_id);
    });
    users.forEach(row => {
      const lineId = this.text(row.line_id || row.row_id);
      const pointId = this.text(row.point_line_id);
      const legacyId = this.text(row.legacy_line_id);
      if (pointId) {
        setCanonical(lineId, pointId);
        setCanonical(pointId, pointId);
        setCanonical(legacyId, pointId);
      }
    });
    const canonicalId = value => {
      let id = this.text(value);
      const seen = new Set();
      for (let i = 0; i < 8 && id && canonicalMap.has(id) && !seen.has(id); i++) {
        seen.add(id);
        id = canonicalMap.get(id);
      }
      return id;
    };
    const phoneMap = new Map();
    const phoneItemKeys = new Map();
    const normalizePhone = value => this.text(value).replace(/\D/g, '');
    const pushPhoneItem = (phone, item) => {
      const canonicalUserId = canonicalId(item.userId);
      const key = [canonicalUserId || item.userId || item.cardId, item.type].join(':');
      if (!phoneMap.has(phone)) {
        phoneMap.set(phone, []);
        phoneItemKeys.set(phone, new Set());
      }
      const keys = phoneItemKeys.get(phone);
      if (keys.has(key)) return;
      keys.add(key);
      phoneMap.get(phone).push({ ...item, canonicalUserId });
    };
    users.forEach(row => {
      const phone = normalizePhone(row.phone);
      if (phone.length < 7) return;
      pushPhoneItem(phone, { type: 'user', userId: this.text(row.line_id || row.row_id), name: this.text(row.name), phone });
    });
    cards.forEach(row => {
      const phone = normalizePhone(row.mobile || row.office_phone);
      if (phone.length < 7) return;
      pushPhoneItem(phone, { type: 'card', userId: this.text(row.line_id), cardId: this.text(row.row_id), name: this.text(row.name), phone });
    });

    const duplicatePhones = Array.from(phoneMap.entries())
      .filter(([, items]) => new Set(items.map(item => item.canonicalUserId || item.userId).filter(Boolean)).size > 1)
      .slice(0, 50)
      .map(([phone, items]) => ({ phone, items }));

    const usersWithoutPointId = users
      .map(row => this.userRow(row))
      .filter(profile => profile && !this.text(profile.pointLineId) && !linkedNew.has(profile.userId) && !linkedOld.has(profile.userId) && canonicalId(profile.userId) === profile.userId)
      .slice(0, 50);

    const boundCardsWithoutUser = cards
      .filter(card => !users.some(user => canonicalId(user.line_id || user.row_id) === canonicalId(card.line_id)))
      .slice(0, 50)
      .map(row => this.cardRow(row));

    return {
      success: true,
      data: {
        linksTableReady,
        existingLinks: links.map(row => ({
          oldLineId: this.text(row.old_line_id),
          newLineId: this.text(row.new_line_id),
          matchMethod: this.text(row.match_method),
          confidence: this.text(row.confidence),
          status: this.text(row.status),
          note: this.text(row.note),
          updatedAt: this.text(row.updated_at)
        })),
        counts: {
          sampledUsers: users.length,
          sampledBoundCards: cards.length,
          existingLinks: links.length,
          usersWithoutPointId: usersWithoutPointId.length,
          boundCardsWithoutUser: boundCardsWithoutUser.length,
          duplicatePhones: duplicatePhones.length
        },
        usersWithoutPointId,
        boundCardsWithoutUser,
        duplicatePhones,
        hardAdminIds: Array.from(SecurityModule.hardAdminIds || [])
      }
    };
  }
};

const D1WriteModule = {
  cardScanAwardType() {
    return 'card_scan_create';
  },

  cardScanAwardPoints() {
    return 10;
  },

  hasD1(env) {
    return !!(env && env.ACTMASTER_DB);
  },

  text(value, fallback = '') {
    const next = String(value ?? '').trim();
    return next || fallback;
  },

  pick(source, keys, fallback = '') {
    for (const key of keys) {
      const value = source && source[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
    }
    return fallback;
  },

  isLineUserIdLike(value) {
    return /^U[0-9A-Za-z]{20,}$/.test(this.text(value));
  },

  role(value) {
    const next = this.text(value, 'user').toLowerCase();
    if (next === 'admin' || next === '總管') return 'admin';
    if (next === 'store' || next === 'tenant' || next === '店長' || next === '租戶') return 'store';
    return 'user';
  },

  jsonObject(value) {
    try {
      const parsed = typeof value === 'string' ? JSON.parse(value || '{}') : (value || {});
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (e) {
      return {};
    }
  },

  buildSocials(data = {}) {
    const raw = this.pick(data, ['socials', 'socials_json', '社群帳號']);
    if (!raw && !(data.dealerProfile && typeof data.dealerProfile === 'object')) return '';
    if (raw) {
      try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (Array.isArray(parsed)) return JSON.stringify(parsed.filter(Boolean));
      } catch (e) {}
    }
    const socials = this.jsonObject(raw || '{}');
    if (data.dealerProfile && typeof data.dealerProfile === 'object') {
      socials.dealerProfile = data.dealerProfile;
    }
    return JSON.stringify(socials);
  },

  async clearUserCache(env, userId) {
    if (!env.ACTMASTER_KV || !userId) return;
    try { await env.ACTMASTER_KV.delete(`U_PROFILE_${userId}`); } catch (e) { console.error('KV Delete Error', e); }
  },

  normalizeUser(payload = {}) {
    const data = payload.data || payload.profile || payload;
    const userId = this.pick(data, ['userId', 'lineId', 'line_id', 'LINE ID'], this.pick(payload, ['userId', 'lineId', 'targetUserId']));
    if (!userId) return null;
    return {
      row_id: this.pick(data, ['rowId', 'row_id'], `USR_${userId}`),
      line_id: userId,
      name: this.pick(data, ['name', 'displayName', '姓名', '真實姓名']),
      industry: this.pick(data, ['industry', 'title', '職稱', '主要業種', '公司名稱']),
      gender: this.pick(data, ['gender', '性別']),
      phone: this.pick(data, ['phone', 'mobile', '手機', '手機號碼']),
      picture_url: this.pick(data, ['pictureUrl', 'picture_url', 'avatarUrl', 'avatar_url', 'photoUrl', 'photo_url']),
      birthday: this.pick(data, ['birthday', 'birthdate', '出生年月日']),
      region: this.pick(data, ['region', '地區']),
      address: this.pick(data, ['address', '地址', '公司地址']),
      socials: this.buildSocials(data),
      role: this.role(this.pick(data, ['role', '權限級別'], 'user')),
      store_id: this.pick(data, ['storeid', 'storeId', 'store_id', '店代碼']),
      referrer_id: this.pick(data, ['referrerId', 'referrer_id', '推薦人']),
      network_id: this.pick(data, ['networkId', 'network_id', '歸屬網'], 'admin'),
      tg_token: this.pick(data, ['tgToken', 'tg_token']),
      tg_chat_id: this.pick(data, ['tgChatId', 'tg_chat_id'])
    };
  },

  normalizeCard(payload = {}) {
    const data = payload.data || payload.card || payload;
    const config = this.pick(data, ['customConfig', 'custom_config', 'cardConfig', '電子名片設定', '自訂名片設定'], '{}');
    const rowId = this.pick(data, ['rowId', 'row_id', 'id'], this.pick(payload, ['rowId']));
    return {
      row_id: rowId || `CARD_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      line_id: this.pick(data, ['lineId', 'line_id', 'LINE ID', 'User ID']),
      name: this.pick(data, ['name', '姓名']),
      english_name: this.pick(data, ['englishName', 'english_name', '英文名']),
      company_name: this.pick(data, ['companyName', 'company_name', '公司名稱']),
      title: this.pick(data, ['title', '職稱']),
      department: this.pick(data, ['department', '部門']),
      tax_id: this.pick(data, ['taxId', 'tax_id', '統一編號']),
      mobile: this.pick(data, ['mobile', 'phone', '手機號碼', '手機']),
      office_phone: this.pick(data, ['officePhone', 'office_phone', '公司電話']),
      extension: this.pick(data, ['extension', '分機']),
      fax: this.pick(data, ['fax', '傳真']),
      email: this.pick(data, ['email', '電子郵件']),
      website: this.pick(data, ['website', '公司網址']),
      socials: this.pick(data, ['socials', '社群帳號']),
      address: this.pick(data, ['address', '公司地址']),
      birthday: this.pick(data, ['birthday', '生日']),
      personality: this.pick(data, ['personality', '個性']),
      hobbies: this.pick(data, ['hobbies', '興趣']),
      wealth: this.pick(data, ['wealth', '財富']),
      health: this.pick(data, ['health', '健康']),
      career: this.pick(data, ['career', '事業']),
      services: this.pick(data, ['services', 'service', '服務項目']),
      notes: this.pick(data, ['notes', '建檔人/備註']),
      creator_id: this.pick(data, ['creatorId', 'creator_id', '建檔者ID'], this.pick(payload, ['creatorId', 'userId'])),
      image_url: this.pick(data, ['imageUrl', 'image_url', '名片圖檔']),
      custom_config: config,
      network_id: this.pick(data, ['networkId', 'network_id', '歸屬網'], 'admin'),
      tags: this.pick(data, ['tags', '標籤']),
      owner_user_id: this.pick(data, ['ownerUserId', 'owner_user_id', '擁有人ID']),
      profile_user_id: this.pick(data, ['profileUserId', 'profile_user_id']),
      scanner_user_id: this.pick(data, ['scannerUserId', 'scanner_user_id', 'scannerId', 'scanner_id']),
      scanner_name: this.pick(data, ['scannerName', 'scanner_name']),
      source_type: this.pick(data, ['sourceType', 'source_type', '名片來源']),
      visibility: this.pick(data, ['visibility', '公開狀態']),
      pool_eligible: this.pick(data, ['poolEligible', 'pool_eligible']),
      ai_review_status: this.pick(data, ['aiReviewStatus', 'ai_review_status']),
      crm_status: this.pick(data, ['crmStatus', 'crm_status', '客戶狀態']),
      crm_type: this.pick(data, ['crmType', 'crm_type', '客戶類型']),
      crm_next_action: this.pick(data, ['crmNextAction', 'crm_next_action', '建議下一步']),
      crm_next_followup_at: this.pick(data, ['crmNextFollowupAt', 'crm_next_followup_at', '下次跟進時間']),
      crm_ai_suggestion: this.pick(data, ['crmAiSuggestion', 'crm_ai_suggestion', 'AI建議'])
      , source_event_id: this.pick(data, ['sourceEventId', 'source_event_id', 'importEventId', 'import_event_id']),
      claimed_from_row_id: this.pick(data, ['claimedFromRowId', 'claimed_from_row_id']),
      claimed_by_uid: this.pick(data, ['claimedByUid', 'claimed_by_uid']),
      claimed_at: this.pick(data, ['claimedAt', 'claimed_at']),
      merged_into_row_id: this.pick(data, ['mergedIntoRowId', 'merged_into_row_id']),
      archived_at: this.pick(data, ['archivedAt', 'archived_at'])
    };
  },

  async ensureReferralPlaceholderCard(env, user = {}) {
    if (!this.hasD1(env)) return null;
    const lineId = this.text(user.line_id);
    const referrerId = this.text(user.referrer_id);
    if (!lineId || !referrerId || lineId === referrerId) return null;
    await D1ReadModule.ensureCardAccessColumns(env);

    const rowId = `REF_${lineId}`;
    const ownCard = await D1ReadModule.cardByIdentity(env, lineId, { sourceType: 'self_profile' });
    if (ownCard) return { skipped: true, reason: 'has_self_profile', rowId: ownCard.row_id };

    const existing = await D1ReadModule.first(env, `
      SELECT row_id FROM card_contacts
      WHERE row_id = ? OR (profile_user_id = ? AND source_type = 'referral_placeholder')
      LIMIT 1
    `, [rowId, lineId]).catch(() => null);

    const name = this.text(user.name, '\u5c1a\u672a\u5efa\u7acb\u540d\u7247');
    const phone = this.text(user.phone);
    const title = this.text(user.industry);
    const imageUrl = this.text(user.picture_url || user.pictureUrl || user.avatarUrl || user.avatar_url);
    const networkId = this.text(user.network_id, 'admin');
    const crmStatus = this.text(user.crm_status, '\u5df2\u8a3b\u518a\u672a\u5efa\u540d\u7247');
    const crmType = this.text(user.crm_type, '\u9080\u7d04\u8a3b\u518a');
    const note = this.text(user.notes, '\u63a8\u85a6\u9023\u7d50\u6388\u6b0a\u5f8c\u81ea\u52d5\u5efa\u7acb\uff1b\u5f85\u672c\u4eba\u5efa\u7acb\u6b63\u5f0f\u540d\u7247\u3002');

    if (existing) {
      await env.ACTMASTER_DB.prepare(`
        UPDATE card_contacts
        SET owner_user_id = CASE WHEN TRIM(COALESCE(owner_user_id,'')) = '' THEN ? ELSE owner_user_id END,
            creator_id = CASE WHEN TRIM(COALESCE(creator_id,'')) = '' THEN ? ELSE creator_id END,
            line_id = CASE WHEN TRIM(COALESCE(line_id,'')) = '' THEN ? ELSE line_id END,
            profile_user_id = ?,
            name = CASE WHEN TRIM(COALESCE(name,'')) = '' OR name = ? THEN ? ELSE name END,
            mobile = CASE WHEN TRIM(COALESCE(mobile,'')) = '' THEN ? ELSE mobile END,
            title = CASE WHEN TRIM(COALESCE(title,'')) = '' THEN ? ELSE title END,
            image_url = CASE WHEN TRIM(COALESCE(image_url,'')) = '' THEN ? ELSE image_url END,
            network_id = CASE WHEN TRIM(COALESCE(network_id,'')) = '' THEN ? ELSE network_id END,
            source_type = 'referral_placeholder',
            visibility = 'private',
            pool_eligible = 0,
            ai_review_status = CASE WHEN TRIM(COALESCE(ai_review_status,'')) = '' THEN 'pending' ELSE ai_review_status END,
            crm_status = ?,
            crm_type = CASE WHEN TRIM(COALESCE(crm_type,'')) = '' THEN ? ELSE crm_type END,
            notes = CASE WHEN TRIM(COALESCE(notes,'')) = '' THEN ? ELSE notes END,
            updated_at = CURRENT_TIMESTAMP
        WHERE row_id = ?
      `).bind(referrerId, referrerId, lineId, lineId, '\u5c1a\u672a\u5efa\u7acb\u540d\u7247', name, phone, title, imageUrl, networkId, crmStatus, crmType, note, existing.row_id).run();
      return { rowId: existing.row_id, updated: true };
    }

    await env.ACTMASTER_DB.prepare(`
      INSERT INTO card_contacts (
        row_id,line_id,name,title,mobile,creator_id,notes,network_id,image_url,
        owner_user_id,profile_user_id,source_type,visibility,pool_eligible,
        ai_review_status,crm_status,crm_type,updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
    `).bind(rowId, lineId, name, title, phone, referrerId, note, networkId, imageUrl, referrerId, lineId, 'referral_placeholder', 'private', 0, 'pending', crmStatus, crmType).run();
    return { rowId, created: true };
  },

  async upsertUser(payload, env) {
    if (!this.hasD1(env)) return null;
    const user = this.normalizeUser(payload);
    if (!user) return { success: false, error: 'Missing userId' };
    const data = payload.data || payload.profile || payload;
    const existing = await D1ReadModule.first(env, 'SELECT * FROM users WHERE line_id = ? OR row_id = ? LIMIT 1', [user.line_id, user.line_id]);
    const hasReferrerInput = ['referrerId', 'referrer_id', '?刻鈭?'].some(key => data && data[key] !== undefined && data[key] !== null);
    const canOverrideReferrer = SecurityModule.normalizeRole(payload.authenticatedRole || '') === 'admin'
      && hasReferrerInput
      && user.referrer_id
      && user.referrer_id !== user.line_id;
    const hasRoleInput = ['role', '權限級別'].some(key => data && data[key] !== undefined && data[key] !== null && String(data[key]).trim() !== '');
    if (existing) {
      ['name','industry','gender','phone','birthday','region','address','socials','store_id','referrer_id','network_id','tg_token','tg_chat_id'].forEach(key => {
        if (user[key] === '' || user[key] === undefined || user[key] === null || user[key] === '未命名') user[key] = existing[key] || '';
      });
      const existingHardAdminId = SecurityModule.hasHardAdminId(user.line_id, existing);
      const incomingHardAdminVerified = SecurityModule.isHardAdmin(user.line_id, {
        ...existing,
        row_id: user.row_id || existing.row_id,
        line_id: user.line_id || existing.line_id,
        legacy_line_id: user.legacy_line_id || existing.legacy_line_id,
        point_line_id: user.point_line_id || existing.point_line_id,
        name: user.name,
        displayName: user.displayName,
        user_name: user.user_name,
        phone: user.phone,
        mobile: user.mobile
      });
      if (existingHardAdminId && !incomingHardAdminVerified) {
        ['name','industry','gender','phone','birthday','region','address','socials','store_id','tg_token','tg_chat_id'].forEach(key => {
          user[key] = existing[key] || '';
        });
      }
      if (existing.referrer_id && String(existing.referrer_id).trim() && !canOverrideReferrer) {
        user.referrer_id = existing.referrer_id;
        user.network_id = existing.network_id || user.network_id;
      }
      if (user.referrer_id && user.referrer_id === user.line_id) user.referrer_id = existing.referrer_id || '';
      if (existing.role === 'store' && user.role === 'user') user.role = existing.role;
      if (!hasRoleInput) user.role = existing.role || user.role;
    }
    user.role = SecurityModule.sanitizeRole(user.line_id, user.role, user);
    await env.ACTMASTER_DB.prepare(`
      INSERT INTO users (row_id,line_id,name,industry,gender,phone,birthday,region,address,socials,role,store_id,referrer_id,network_id,tg_token,tg_chat_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(line_id) DO UPDATE SET
        name=excluded.name,industry=excluded.industry,gender=excluded.gender,phone=excluded.phone,birthday=excluded.birthday,
        region=excluded.region,address=excluded.address,socials=excluded.socials,
        role=CASE
          WHEN users.role = 'admin' OR excluded.role = 'admin' THEN 'admin'
          WHEN users.role = 'store' OR excluded.role = 'store' THEN 'store'
          ELSE excluded.role
        END,
        store_id=excluded.store_id,
        referrer_id=excluded.referrer_id,network_id=excluded.network_id,tg_token=excluded.tg_token,tg_chat_id=excluded.tg_chat_id
    `).bind(user.row_id,user.line_id,user.name,user.industry,user.gender,user.phone,user.birthday,user.region,user.address,user.socials,user.role,user.store_id,user.referrer_id,user.network_id,user.tg_token,user.tg_chat_id).run();
    await this.clearUserCache(env, user.line_id);
    const referralPlaceholder = await this.ensureReferralPlaceholderCard(env, user).catch(e => {
      console.error('D1 referral placeholder failed', e && e.message ? e.message : e);
      return null;
    });
    const info = D1ReadModule.userRow({
      row_id: user.row_id,
      line_id: user.line_id,
      name: user.name,
      industry: user.industry,
      phone: user.phone,
      birthday: user.birthday,
      role: user.role,
      store_id: user.store_id,
      referrer_id: user.referrer_id,
      network_id: user.network_id,
      tg_token: user.tg_token,
      tg_chat_id: user.tg_chat_id
    });
    return { success: true, data: { isRegistered: true, info, source: 'd1_write', referralPlaceholder } };
  },

  async updateUserRoleLegacy(payload, env) {
    if (!this.hasD1(env)) return null;
    const targetUserId = this.pick(payload, ['targetUserId', 'targetLineId', 'lineId', 'userId']);
    const role = this.role(this.pick(payload, ['newRole', 'targetRole', 'permission', 'role']));
    if (!targetUserId) return { success: false, error: 'Missing targetUserId' };
    if (role === 'admin') return { success: false, error: 'Admin role cannot be assigned from role editor' };
    const existing = await D1ReadModule.first(env, 'SELECT * FROM users WHERE line_id = ? OR row_id = ? LIMIT 1', [targetUserId, targetUserId]);
    if (!existing) return { success: false, error: '找不到指定用戶' };
    if (SecurityModule.isHardAdmin(targetUserId, existing)) return { success: false, error: 'Hard admin role cannot be modified' };
    await env.ACTMASTER_DB.prepare('UPDATE users SET role = ? WHERE line_id = ? OR row_id = ?').bind(role, targetUserId, targetUserId).run();
    await this.clearUserCache(env, targetUserId);
    return { success: true, data: { userId: targetUserId, role, source: 'd1_write' } };
  },

  async updateUserRole(payload, env) {
    if (!this.hasD1(env)) return null;
    const targetUserId = this.pick(payload, ['targetUserId', 'targetLineId', 'lineId', 'userId']);
    const role = this.role(this.pick(payload, ['newRole', 'targetRole', 'permission', 'role']));
    if (!targetUserId) return { success: false, error: 'Missing targetUserId' };
    if (role === 'admin') return { success: false, error: 'Admin role cannot be assigned from role editor' };

    let existing = await D1ReadModule.first(env, 'SELECT * FROM users WHERE line_id = ? OR row_id = ? OR point_line_id = ? OR legacy_line_id = ? LIMIT 1', [targetUserId, targetUserId, targetUserId, targetUserId]).catch(() => null);
    if (existing && SecurityModule.isHardAdmin(targetUserId, existing)) return { success: false, error: 'Hard admin role cannot be modified' };
    if (!existing) {
      const card = await D1ReadModule.first(env, `
        SELECT * FROM card_contacts
        WHERE line_id = ? OR creator_id = ?
        ORDER BY COALESCE(updated_at, created_at) DESC
        LIMIT 1
      `, [targetUserId, targetUserId]).catch(() => null);
      if (card) {
        await this.upsertUser({
          userId: targetUserId,
          name: card.name || '',
          phone: card.mobile || card.office_phone || '',
          industry: card.title || card.company_name || '',
          networkId: card.network_id || 'admin',
          role: 'user'
        }, env);
        existing = await D1ReadModule.first(env, 'SELECT * FROM users WHERE line_id = ? OR row_id = ? LIMIT 1', [targetUserId, targetUserId]).catch(() => null);
      }
    }
    if (!existing) return { success: false, error: '找不到指定用戶' };

    const targetLineId = this.text(existing.line_id || targetUserId);
    await env.ACTMASTER_DB.prepare('UPDATE users SET role = ? WHERE line_id = ? OR row_id = ? OR point_line_id = ? OR legacy_line_id = ?').bind(role, targetLineId, targetUserId, targetUserId, targetUserId).run();
    await this.clearUserCache(env, targetLineId);
    await this.clearUserCache(env, targetUserId);
    return { success: true, data: { userId: targetLineId, role, source: 'd1_write' } };
  },

  async runCount(env, sql, binds = []) {
    const res = await env.ACTMASTER_DB.prepare(sql).bind(...binds).run();
    return Number(res && res.meta && res.meta.changes) || 0;
  },

  bestRole(...roles) {
    const normalized = roles.map(role => this.role(role));
    if (normalized.includes('admin')) return 'admin';
    if (normalized.includes('store')) return 'store';
    return 'user';
  },

  firstText(...values) {
    for (const value of values) {
      const next = this.text(value);
      if (next) return next;
    }
    return '';
  },

  normalizePhone(value) {
    return this.text(value).replace(/\D/g, '');
  },

  jsonSafe(value) {
    try {
      const parsed = typeof value === 'string' ? JSON.parse(value || '{}') : (value || {});
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      return {};
    }
  },

  async resolvePointAwardUserId(env, userId) {
    const id = this.text(userId);
    if (!id || !env || !env.ACTMASTER_DB) return id;
    const identity = await D1ReadModule.findUserByIdentity(env, id).catch(() => null);
    const row = identity && identity.user;
    return this.text(row && row.point_line_id)
      || this.text(identity && identity.canonicalId)
      || this.text(row && row.line_id)
      || id;
  },

  async ensurePointAwardTable(env) {
    await env.ACTMASTER_DB.prepare(`
      CREATE TABLE IF NOT EXISTS point_awards (
        award_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL DEFAULT '',
        card_id TEXT NOT NULL DEFAULT '',
        award_type TEXT NOT NULL DEFAULT 'card_scan_create',
        points REAL NOT NULL DEFAULT 0,
        point_type TEXT NOT NULL DEFAULT 'gift_money',
        status TEXT NOT NULL DEFAULT 'pending',
        response_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    await env.ACTMASTER_DB.prepare(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_point_awards_unique_card_scan
      ON point_awards(user_id, card_id, award_type)
      WHERE user_id <> '' AND card_id <> ''
    `).run();
  },

  async hasDuplicateCardForOwner(env, ownerId, card, rowId) {
    if (!ownerId) return false;
    const phone = this.normalizePhone(card.mobile || card.office_phone);
    const name = this.text(card.name).toLowerCase();
    if (!phone && !name) return false;
    const rows = await D1ReadModule.all(env, `
      SELECT row_id,name,mobile,office_phone
      FROM card_contacts
      WHERE creator_id = ? AND row_id <> ?
      ORDER BY COALESCE(updated_at, created_at) DESC, row_id DESC
      LIMIT 300
    `, [ownerId, rowId]).catch(() => []);
    return rows.some(row => {
      const rowPhone = this.normalizePhone(row.mobile || row.office_phone);
      if (phone && rowPhone && phone === rowPhone) return true;
      const rowName = this.text(row.name).toLowerCase();
      return !!(name && rowName && name === rowName);
    });
  },

  async awardCardScanPoints(env, userId, cardId, card, eligible) {
    if (!eligible || !userId || !cardId) return null;
    await this.ensurePointAwardTable(env);
    const awardUserId = await this.resolvePointAwardUserId(env, userId);
    if (!awardUserId) return null;
    const awardType = this.cardScanAwardType();
    const awardPoints = this.cardScanAwardPoints();
    const awardId = 'AWD_CARD_SCAN_' + awardUserId + '_' + cardId;
    const eventName = '\u6383\u63cf\u540d\u7247\u8d08\u9ede';
    const correctionEventName = '\u6383\u63cf\u540d\u7247\u8d08\u9ede\u88dc\u6b63';
    const eventContent = '\u65b0\u589e\u4e0d\u91cd\u8907\u540d\u7247\uff1a' + (this.text(card.name) || cardId);
    const existingAward = await D1ReadModule.first(env, `
      SELECT * FROM point_awards
      WHERE user_id = ? AND card_id = ? AND award_type = ?
      LIMIT 1
    `, [awardUserId, cardId, awardType]).catch(() => null);

    if (existingAward) {
      const existingJson = this.jsonSafe(existingAward.response_json);
      const insertRow = existingJson && existingJson.data && existingJson.data.data && existingJson.data.data.insert_row;
      const alreadyGiftMoney = this.text(existingAward.point_type) === 'gift_money'
        && this.text(existingAward.status) === 'sent';
      const alreadyCorrected = !!(existingJson.correctedGiftMoneyInsertId || (insertRow && this.text(insertRow.point_type) === 'gift_money'));
      if (alreadyGiftMoney || alreadyCorrected) {
        return { awarded: false, reason: 'already_awarded' };
      }

      const retryResult = await PointModule.insertUserPoint({
        userId: awardUserId,
        points: awardPoints,
        pointType: 'gift_money',
        eventName: this.text(existingAward.point_type) === 'system_point' ? correctionEventName : eventName,
        eventContent,
        shop_remark: 'cardId=' + cardId + ';correct=' + (this.text(existingAward.point_type) || 'retry')
      }, env).catch(e => ({ success: false, error: e.message || 'Point API failed' }));

      const nextJson = {
        previous: existingJson,
        correctedGiftMoneyInsertId: retryResult && retryResult.data && retryResult.data.data && retryResult.data.data.insert_id,
        correctedAt: new Date().toISOString(),
        retryResult
      };
      await env.ACTMASTER_DB.prepare(`
        UPDATE point_awards
        SET user_id = ?, point_type = 'gift_money', status = ?, response_json = ?, updated_at = CURRENT_TIMESTAMP
        WHERE award_id = ?
      `).bind(awardUserId, retryResult && retryResult.success ? 'sent' : 'failed', JSON.stringify(nextJson), existingAward.award_id).run();

      return retryResult && retryResult.success
        ? { awarded: true, points: awardPoints, corrected: true, response: retryResult.data }
        : { awarded: false, points: awardPoints, error: (retryResult && retryResult.error) || 'Point award failed' };
    }

    const inserted = await env.ACTMASTER_DB.prepare(`
      INSERT OR IGNORE INTO point_awards (award_id,user_id,card_id,award_type,points,point_type,status,response_json,updated_at)
      VALUES (?,?,?,?,?,?,?, '{}', CURRENT_TIMESTAMP)
    `).bind(awardId, awardUserId, cardId, awardType, awardPoints, 'gift_money', 'pending').run();
    if (!inserted || !inserted.meta || Number(inserted.meta.changes || 0) === 0) {
      return { awarded: false, reason: 'already_awarded' };
    }

    const result = await PointModule.insertUserPoint({
      userId: awardUserId,
      points: awardPoints,
      pointType: 'gift_money',
      eventName,
      eventContent,
      shop_remark: 'cardId=' + cardId
    }, env).catch(e => ({ success: false, error: e.message || 'Point API failed' }));

    await env.ACTMASTER_DB.prepare(`
      UPDATE point_awards
      SET status = ?, response_json = ?, updated_at = CURRENT_TIMESTAMP
      WHERE award_id = ?
    `).bind(result && result.success ? 'sent' : 'failed', JSON.stringify(result || {}), awardId).run();

    return result && result.success
      ? { awarded: true, points: awardPoints, response: result.data }
      : { awarded: false, points: awardPoints, error: (result && result.error) || 'Point award failed' };
  },

  async confirmIdentityMerge(payload, env) {
    if (!this.hasD1(env)) return null;
    const oldLineId = this.pick(payload, ['oldLineId', 'oldUserId', 'legacyLineId']);
    const newLineId = this.pick(payload, ['newLineId', 'newUserId', 'pointLineId']);
    const confirm = this.pick(payload, ['confirm']);
    if (!oldLineId || !newLineId) return { success: false, error: 'Missing oldLineId or newLineId' };
    if (oldLineId === newLineId) return { success: false, error: 'Old and new LINE IDs are the same' };
    if (confirm !== 'MERGE_IDENTITY') return { success: false, error: 'Missing merge confirmation' };

    const activeOld = await D1ReadModule.first(env, `
      SELECT * FROM user_identity_links
      WHERE old_line_id = ? AND status = 'active'
      LIMIT 1
    `, [oldLineId]).catch(() => null);
    if (activeOld && this.text(activeOld.new_line_id) && this.text(activeOld.new_line_id) !== newLineId) {
      return { success: false, error: 'Old LINE ID is already linked to another point UID' };
    }
    const activeNew = await D1ReadModule.first(env, `
      SELECT * FROM user_identity_links
      WHERE new_line_id = ? AND status = 'active'
      LIMIT 1
    `, [newLineId]).catch(() => null);
    if (activeNew && this.text(activeNew.old_line_id) && this.text(activeNew.old_line_id) !== oldLineId) {
      return { success: false, error: 'Point UID is already linked to another old LINE ID' };
    }

    const oldUser = await D1ReadModule.first(env, 'SELECT * FROM users WHERE line_id = ? OR row_id = ? OR legacy_line_id = ? OR point_line_id = ? LIMIT 1', [oldLineId, oldLineId, oldLineId, oldLineId]).catch(() => null);
    const newUser = await D1ReadModule.first(env, 'SELECT * FROM users WHERE line_id = ? OR row_id = ? OR legacy_line_id = ? OR point_line_id = ? LIMIT 1', [newLineId, newLineId, newLineId, newLineId]).catch(() => null);
    const oldCard = await D1ReadModule.first(env, 'SELECT * FROM card_contacts WHERE line_id = ? OR creator_id = ? ORDER BY COALESCE(updated_at, created_at) DESC LIMIT 1', [oldLineId, oldLineId]).catch(() => null);
    const newCard = await D1ReadModule.first(env, 'SELECT * FROM card_contacts WHERE line_id = ? OR creator_id = ? ORDER BY COALESCE(updated_at, created_at) DESC LIMIT 1', [newLineId, newLineId]).catch(() => null);

    if (!oldUser && !newUser && !oldCard && !newCard) {
      return { success: false, error: 'No matching user or card found for either LINE ID' };
    }

    const canonical = {
      row_id: this.firstText(newUser && newUser.row_id, `USR_${newLineId}`),
      line_id: newLineId,
      name: this.firstText(newUser && newUser.name, oldUser && oldUser.name, newCard && newCard.name, oldCard && oldCard.name),
      industry: this.firstText(newUser && newUser.industry, oldUser && oldUser.industry, newCard && (newCard.title || newCard.company_name), oldCard && (oldCard.title || oldCard.company_name)),
      gender: this.firstText(newUser && newUser.gender, oldUser && oldUser.gender),
      phone: this.firstText(newUser && newUser.phone, oldUser && oldUser.phone, newCard && (newCard.mobile || newCard.office_phone), oldCard && (oldCard.mobile || oldCard.office_phone)),
      birthday: this.firstText(newUser && newUser.birthday, oldUser && oldUser.birthday),
      region: this.firstText(newUser && newUser.region, oldUser && oldUser.region),
      address: this.firstText(newUser && newUser.address, oldUser && oldUser.address, newCard && newCard.address, oldCard && oldCard.address),
      socials: this.firstText(newUser && newUser.socials, oldUser && oldUser.socials),
      role: SecurityModule.sanitizeRole(newLineId, this.bestRole(newUser && newUser.role, oldUser && oldUser.role), {
        name: this.firstText(newUser && newUser.name, oldUser && oldUser.name, newCard && newCard.name, oldCard && oldCard.name),
        phone: this.firstText(newUser && newUser.phone, oldUser && oldUser.phone, newCard && (newCard.mobile || newCard.office_phone), oldCard && (oldCard.mobile || oldCard.office_phone)),
        legacy_line_id: oldLineId,
        point_line_id: newLineId
      }),
      store_id: this.firstText(newUser && newUser.store_id, oldUser && oldUser.store_id),
      referrer_id: this.firstText(newUser && newUser.referrer_id, oldUser && oldUser.referrer_id),
      network_id: this.firstText(newUser && newUser.network_id, oldUser && oldUser.network_id, newCard && newCard.network_id, oldCard && oldCard.network_id, 'admin'),
      tg_token: this.firstText(newUser && newUser.tg_token, oldUser && oldUser.tg_token),
      tg_chat_id: this.firstText(newUser && newUser.tg_chat_id, oldUser && oldUser.tg_chat_id)
    };

    await env.ACTMASTER_DB.prepare(`
      INSERT INTO users (row_id,line_id,name,industry,gender,phone,birthday,region,address,socials,role,store_id,referrer_id,network_id,tg_token,tg_chat_id,legacy_line_id,point_line_id,identity_source,migrated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(line_id) DO UPDATE SET
        name=CASE WHEN users.name <> '' THEN users.name ELSE excluded.name END,
        industry=CASE WHEN users.industry <> '' THEN users.industry ELSE excluded.industry END,
        gender=CASE WHEN users.gender <> '' THEN users.gender ELSE excluded.gender END,
        phone=CASE WHEN users.phone <> '' THEN users.phone ELSE excluded.phone END,
        birthday=CASE WHEN users.birthday <> '' THEN users.birthday ELSE excluded.birthday END,
        region=CASE WHEN users.region <> '' THEN users.region ELSE excluded.region END,
        address=CASE WHEN users.address <> '' THEN users.address ELSE excluded.address END,
        socials=CASE WHEN users.socials <> '' THEN users.socials ELSE excluded.socials END,
        role=CASE
          WHEN users.role = 'admin' OR excluded.role = 'admin' THEN 'admin'
          WHEN users.role = 'store' OR excluded.role = 'store' THEN 'store'
          ELSE excluded.role
        END,
        store_id=CASE WHEN users.store_id <> '' THEN users.store_id ELSE excluded.store_id END,
        referrer_id=CASE WHEN users.referrer_id <> '' THEN users.referrer_id ELSE excluded.referrer_id END,
        network_id=CASE WHEN users.network_id <> '' THEN users.network_id ELSE excluded.network_id END,
        tg_token=CASE WHEN users.tg_token <> '' THEN users.tg_token ELSE excluded.tg_token END,
        tg_chat_id=CASE WHEN users.tg_chat_id <> '' THEN users.tg_chat_id ELSE excluded.tg_chat_id END,
        legacy_line_id=excluded.legacy_line_id,
        point_line_id=excluded.point_line_id,
        identity_source='manual_confirm',
        migrated_at=CURRENT_TIMESTAMP
    `).bind(
      canonical.row_id,
      canonical.line_id,
      canonical.name,
      canonical.industry,
      canonical.gender,
      canonical.phone,
      canonical.birthday,
      canonical.region,
      canonical.address,
      canonical.socials,
      canonical.role,
      canonical.store_id,
      canonical.referrer_id,
      canonical.network_id,
      canonical.tg_token,
      canonical.tg_chat_id,
      oldLineId,
      newLineId,
      'manual_confirm'
    ).run();

    await env.ACTMASTER_DB.prepare(`
      UPDATE user_identity_links
      SET status = 'replaced', note = 'replaced by manual merge', updated_at = CURRENT_TIMESTAMP
      WHERE (old_line_id = ? OR new_line_id = ?)
        AND NOT (old_line_id = ? AND new_line_id = ?)
    `).bind(oldLineId, newLineId, oldLineId, newLineId).run().catch(() => null);
    const linkUpdate = await env.ACTMASTER_DB.prepare(`
      UPDATE user_identity_links
      SET match_method = ?, confidence = ?, status = 'active', note = ?, updated_at = CURRENT_TIMESTAMP
      WHERE old_line_id = ? AND new_line_id = ?
    `).bind('manual_confirm', 'confirmed', this.firstText(payload.note, 'admin confirmed identity merge'), oldLineId, newLineId).run().catch(() => null);
    const linkUpdated = Number(linkUpdate && linkUpdate.meta && linkUpdate.meta.changes || 0);
    if (!linkUpdated) {
      await env.ACTMASTER_DB.prepare(`
        INSERT INTO user_identity_links (old_line_id,new_line_id,match_method,confidence,status,note,updated_at)
        VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)
      `).bind(oldLineId, newLineId, 'manual_confirm', 'confirmed', 'active', this.firstText(payload.note, 'admin confirmed identity merge')).run();
    }

    const updated = {};
    updated.cardsLineId = await this.runCount(env, 'UPDATE card_contacts SET line_id = ?, updated_at = CURRENT_TIMESTAMP WHERE line_id = ?', [newLineId, oldLineId]).catch(() => 0);
    updated.cardsCreatorId = await this.runCount(env, 'UPDATE card_contacts SET creator_id = ?, updated_at = CURRENT_TIMESTAMP WHERE creator_id = ?', [newLineId, oldLineId]).catch(() => 0);
    updated.registrants = await this.runCount(env, 'UPDATE registrants SET line_id = ? WHERE line_id = ?', [newLineId, oldLineId]).catch(() => 0);
    updated.userReferrers = await this.runCount(env, 'UPDATE users SET referrer_id = ? WHERE referrer_id = ?', [newLineId, oldLineId]).catch(() => 0);
    updated.ordersBuyer = await this.runCount(env, 'UPDATE orders SET buyer_id = ?, updated_at = CURRENT_TIMESTAMP WHERE buyer_id = ?', [newLineId, oldLineId]).catch(() => 0);
    updated.ordersSponsor = await this.runCount(env, 'UPDATE orders SET sponsor_id = ?, updated_at = CURRENT_TIMESTAMP WHERE sponsor_id = ?', [newLineId, oldLineId]).catch(() => 0);
    updated.ordersRecruiter = await this.runCount(env, 'UPDATE orders SET recruiter_id = ?, updated_at = CURRENT_TIMESTAMP WHERE recruiter_id = ?', [newLineId, oldLineId]).catch(() => 0);
    updated.ordersPlacement = await this.runCount(env, 'UPDATE orders SET placement_parent_id = ?, updated_at = CURRENT_TIMESTAMP WHERE placement_parent_id = ?', [newLineId, oldLineId]).catch(() => 0);
    updated.bonusBeneficiary = await this.runCount(env, 'UPDATE bonus_transactions SET beneficiary_id = ?, updated_at = CURRENT_TIMESTAMP WHERE beneficiary_id = ?', [newLineId, oldLineId]).catch(() => 0);
    updated.bonusSource = await this.runCount(env, 'UPDATE bonus_transactions SET source_user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE source_user_id = ?', [newLineId, oldLineId]).catch(() => 0);
    updated.removedLegacyUsers = await this.runCount(env, 'DELETE FROM users WHERE (line_id = ? OR row_id = ?) AND line_id <> ?', [oldLineId, oldLineId, newLineId]).catch(() => 0);

    await this.clearUserCache(env, oldLineId);
    await this.clearUserCache(env, newLineId);
    const merged = await D1ReadModule.first(env, 'SELECT * FROM users WHERE line_id = ? LIMIT 1', [newLineId]);
    return {
      success: true,
      data: {
        oldLineId,
        newLineId,
        updated,
        info: D1ReadModule.userRow(merged, 'identity_merged')
      }
    };
  },

  async upsertCard(payload, env) {
    if (!this.hasD1(env)) return null;
    await D1ReadModule.ensureCardAccessColumns(env);
    const card = this.normalizeCard(payload);
    const sourceData = payload.data || payload.card || payload;
    const explicitRowId = this.pick(sourceData, ['rowId', 'row_id', 'id'], this.pick(payload, ['rowId', 'row_id', 'id']));
    const hasExplicitNetworkInput = ['networkId', 'network_id', '歸屬網'].some((key) => Object.prototype.hasOwnProperty.call(sourceData || {}, key));
    const explicitNetworkId = hasExplicitNetworkInput ? this.text(this.pick(sourceData, ['networkId', 'network_id', '歸屬網']), 'admin') : '';
    const explicitOwnerTransferUserId = hasExplicitNetworkInput && this.isLineUserIdLike(explicitNetworkId) ? explicitNetworkId : '';
    if (!card.row_id) return { success: false, error: 'Missing card rowId' };
    if (!explicitRowId) {
      const provisionalAccess = D1ReadModule.inferCardAccess(card, { actorId: this.text(payload.authenticatedUserId || payload.userId) });
      const isStaticSelfProfile = provisionalAccess && provisionalAccess.sourceType === 'self_profile'
        && !String(card.row_id || '').startsWith('CARD_VIDEO_')
        && String(card.custom_config || '').toLowerCase().indexOf('"videostoragekind"') < 0;
      const profileId = this.text(card.line_id || provisionalAccess.profileUserId || payload.authenticatedUserId || payload.userId);
      if (isStaticSelfProfile && profileId) {
        const existingSelfProfile = await D1ReadModule.first(env, `
          SELECT row_id FROM card_contacts
          WHERE (
            line_id = ? OR profile_user_id = ? OR owner_user_id = ?
          )
            AND LOWER(COALESCE(source_type,'')) = 'self_profile'
            AND row_id NOT LIKE 'CARD_VIDEO_%'
            AND LOWER(COALESCE(custom_config,'')) NOT LIKE '%"videostoragekind"%'
          ORDER BY COALESCE(updated_at, created_at) DESC, row_id DESC
          LIMIT 1
        `, [profileId, profileId, profileId]).catch(() => null);
        if (existingSelfProfile && existingSelfProfile.row_id) card.row_id = this.text(existingSelfProfile.row_id);
      }
    }
    const existing = await D1ReadModule.first(env, 'SELECT * FROM card_contacts WHERE row_id = ? LIMIT 1', [card.row_id]);
    let preserveExistingCardIdentity = false;
    let privateImportOwnerTransferUserId = '';
    if (existing) {
      const actorId = this.text(payload.authenticatedUserId || payload.userId);
      const role = this.role(payload.authenticatedRole || payload.role);
      const networkId = this.text(payload.authenticatedNetworkId || payload.networkId);
      const existingLineId = this.text(existing.line_id);
      const existingCreatorId = this.text(existing.creator_id);
      const existingOwnerId = this.text(existing.owner_user_id);
      const existingNetworkId = this.text(existing.network_id);
      const existingSourceType = this.text(existing.source_type).toLowerCase();
      const isBoundToActor = !!(actorId && existingLineId && existingLineId === actorId);
      const isAdminSupportEdit = role === 'admin';
      const isUnboundOwner = !!(actorId && !existingLineId && (existingCreatorId === actorId || existingOwnerId === actorId));
      const isUnboundStoreManager = !!(role === 'store' && !existingLineId && networkId && existingNetworkId && networkId === existingNetworkId);
      const isTransferableImport = existingSourceType !== 'self_profile'
        && existingSourceType !== 'video_profile'
        && existingSourceType !== 'referral_placeholder';

      if (!isBoundToActor && !isAdminSupportEdit && !isUnboundOwner && !isUnboundStoreManager) {
        return { success: false, error: 'Access Denied: cannot update this card' };
      }
      privateImportOwnerTransferUserId = isAdminSupportEdit && explicitOwnerTransferUserId && isTransferableImport
        ? explicitOwnerTransferUserId
        : '';
      preserveExistingCardIdentity = isAdminSupportEdit && !isBoundToActor && !privateImportOwnerTransferUserId;
    }
    const rawAwardUserId = this.text(payload.authenticatedUserId || card.creator_id || payload.creatorId || payload.userId);
    const awardUserId = await this.resolvePointAwardUserId(env, rawAwardUserId);
    const cardLineId = await this.resolvePointAwardUserId(env, card.line_id);
    const isOwnCard = !!(cardLineId && awardUserId && cardLineId === awardUserId);
    const duplicateForAward = !existing && !isOwnCard && await this.hasDuplicateCardForOwner(env, awardUserId, card, card.row_id);
    if (existing) {
      [
        'line_id','name','english_name','company_name','title','department','tax_id','mobile','office_phone',
        'extension','fax','email','website','socials','address','birthday','personality','hobbies','wealth',
        'health','career','services','notes','creator_id','image_url','custom_config','network_id','tags',
        'scanner_user_id','scanner_name','crm_status','crm_type','crm_next_action','crm_next_followup_at','crm_ai_suggestion'
      ].forEach(key => {
        if (card[key] === '' || card[key] === undefined || card[key] === null) card[key] = existing[key] || '';
      });
    }
    if (existing && preserveExistingCardIdentity) {
      card.line_id = this.text(existing.line_id);
      card.creator_id = this.text(existing.creator_id);
      card.owner_user_id = this.text(existing.owner_user_id);
      card.profile_user_id = this.text(existing.profile_user_id);
      card.source_type = this.text(existing.source_type);
      card.visibility = this.text(existing.visibility);
      card.pool_eligible = existing.pool_eligible;
      card.ai_review_status = this.text(existing.ai_review_status);
      card.network_id = hasExplicitNetworkInput ? explicitNetworkId : this.text(existing.network_id, card.network_id);
    }
    if (existing && privateImportOwnerTransferUserId) {
      card.creator_id = privateImportOwnerTransferUserId;
      card.owner_user_id = privateImportOwnerTransferUserId;
      card.scanner_user_id = privateImportOwnerTransferUserId;
      card.scanner_name = privateImportOwnerTransferUserId;
      card.source_type = this.text(card.source_type || existing.source_type, 'private_import');
      card.visibility = this.text(card.visibility || existing.visibility, 'private');
      const existingNetwork = this.text(existing.network_id);
      const fallbackNetwork = this.text(payload.authenticatedNetworkId || payload.networkId || 'admin', 'admin');
      card.network_id = existingNetwork && !this.isLineUserIdLike(existingNetwork) ? existingNetwork : fallbackNetwork;
    }
    const inferredAccess = D1ReadModule.inferCardAccess(card, { actorId: awardUserId });
    const access = preserveExistingCardIdentity ? {
      ...inferredAccess,
      ownerUserId: this.text(card.owner_user_id, inferredAccess.ownerUserId),
      profileUserId: this.text(card.profile_user_id, inferredAccess.profileUserId),
      sourceType: this.text(card.source_type, inferredAccess.sourceType),
      visibility: this.text(card.visibility, inferredAccess.visibility),
      poolEligible: Number(card.pool_eligible) === 1,
      aiReviewStatus: this.text(card.ai_review_status, inferredAccess.aiReviewStatus)
    } : inferredAccess;
    card.owner_user_id = access.ownerUserId;
    card.profile_user_id = access.profileUserId;
    card.source_type = access.sourceType;
    card.visibility = access.visibility;
    card.pool_eligible = access.poolEligible ? 1 : 0;
    card.ai_review_status = access.aiReviewStatus;
    if (card.source_type === 'private_import' && !this.text(card.scanner_user_id)) {
      card.scanner_user_id = this.text(payload.scannerUserId || payload.scannerId || sourceData.scannerUserId || sourceData.scannerId || card.creator_id || awardUserId);
    }
    if (card.source_type === 'private_import' && !this.text(card.scanner_name)) {
      card.scanner_name = this.text(payload.scannerName || sourceData.scannerName || card.scanner_user_id);
    }
    card.crm_status = card.crm_status || (access.isSelfProfile ? '個人名片' : '新名片');
    card.crm_type = card.crm_type || D1ReadModule.inferCrmType(card);
    card.crm_next_action = card.crm_next_action || D1ReadModule.inferCrmNextAction(card, card.crm_type);
    card.crm_ai_suggestion = card.crm_ai_suggestion || D1ReadModule.inferCrmSuggestion(card, card.crm_type, card.crm_next_action);
    await env.ACTMASTER_DB.prepare(`
      INSERT INTO card_contacts (row_id,line_id,name,english_name,company_name,title,department,tax_id,mobile,office_phone,extension,fax,email,website,socials,address,birthday,personality,hobbies,wealth,health,career,services,notes,creator_id,image_url,custom_config,network_id,tags,owner_user_id,profile_user_id,scanner_user_id,scanner_name,source_type,visibility,pool_eligible,ai_review_status,crm_status,crm_type,crm_next_action,crm_next_followup_at,crm_ai_suggestion,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(row_id) DO UPDATE SET
        line_id=excluded.line_id,name=excluded.name,english_name=excluded.english_name,company_name=excluded.company_name,title=excluded.title,
        department=excluded.department,tax_id=excluded.tax_id,mobile=excluded.mobile,office_phone=excluded.office_phone,
        extension=excluded.extension,fax=excluded.fax,email=excluded.email,website=excluded.website,socials=excluded.socials,
        address=excluded.address,birthday=excluded.birthday,personality=excluded.personality,hobbies=excluded.hobbies,
        wealth=excluded.wealth,health=excluded.health,career=excluded.career,services=excluded.services,notes=excluded.notes,
        creator_id=excluded.creator_id,image_url=excluded.image_url,custom_config=excluded.custom_config,network_id=excluded.network_id,
        tags=excluded.tags,owner_user_id=excluded.owner_user_id,profile_user_id=excluded.profile_user_id,
        scanner_user_id=excluded.scanner_user_id,scanner_name=excluded.scanner_name,source_type=excluded.source_type,
        visibility=excluded.visibility,pool_eligible=excluded.pool_eligible,ai_review_status=excluded.ai_review_status,
        crm_status=excluded.crm_status,crm_type=excluded.crm_type,crm_next_action=excluded.crm_next_action,
        crm_next_followup_at=excluded.crm_next_followup_at,crm_ai_suggestion=excluded.crm_ai_suggestion,
        updated_at=CURRENT_TIMESTAMP
    `).bind(card.row_id,card.line_id,card.name,card.english_name,card.company_name,card.title,card.department,card.tax_id,card.mobile,card.office_phone,card.extension,card.fax,card.email,card.website,card.socials,card.address,card.birthday,card.personality,card.hobbies,card.wealth,card.health,card.career,card.services,card.notes,card.creator_id,card.image_url,card.custom_config,card.network_id,card.tags,card.owner_user_id,card.profile_user_id,card.scanner_user_id,card.scanner_name,card.source_type,card.visibility,card.pool_eligible,card.ai_review_status,card.crm_status,card.crm_type,card.crm_next_action,card.crm_next_followup_at,card.crm_ai_suggestion).run();
    await env.ACTMASTER_DB.prepare(`
      UPDATE card_contacts
      SET source_event_id = CASE WHEN ? <> '' THEN ? ELSE COALESCE(source_event_id,'') END,
          claimed_from_row_id = CASE WHEN ? <> '' THEN ? ELSE COALESCE(claimed_from_row_id,'') END,
          claimed_by_uid = CASE WHEN ? <> '' THEN ? ELSE COALESCE(claimed_by_uid,'') END,
          claimed_at = CASE WHEN ? <> '' THEN ? ELSE COALESCE(claimed_at,'') END,
          merged_into_row_id = CASE WHEN ? <> '' THEN ? ELSE COALESCE(merged_into_row_id,'') END,
          archived_at = CASE WHEN ? <> '' THEN ? ELSE COALESCE(archived_at,'') END
      WHERE row_id = ?
    `).bind(
      this.text(card.source_event_id), this.text(card.source_event_id),
      this.text(card.claimed_from_row_id), this.text(card.claimed_from_row_id),
      this.text(card.claimed_by_uid), this.text(card.claimed_by_uid),
      this.text(card.claimed_at), this.text(card.claimed_at),
      this.text(card.merged_into_row_id), this.text(card.merged_into_row_id),
      this.text(card.archived_at), this.text(card.archived_at),
      card.row_id
    ).run();
    if (card.line_id) await this.upsertUser({ userId: card.line_id, name: card.name, phone: card.mobile || card.office_phone, industry: card.title || card.company_name, networkId: card.network_id, role: 'user' }, env);
    const pointAward = await this.awardCardScanPoints(env, awardUserId, card.row_id, card, !existing && !duplicateForAward && !isOwnCard);
    const awardedPoints = pointAward && pointAward.awarded ? pointAward.points : 0;
    const responseCard = D1ReadModule.cardRow(card);
    responseCard.awardedPoints = awardedPoints;
    responseCard.pointAward = pointAward;
    responseCard.rowId = card.row_id;
    return {
      success: true,
      data: responseCard,
      rowId: card.row_id,
      awardedPoints,
      pointAward
    };
  },

  async deleteCard(payload, env) {
    if (!this.hasD1(env)) return null;
    const rowId = this.pick(payload, ['rowId', 'row_id', 'id']);
    if (!rowId) return { success: false, error: 'Missing card rowId' };
    const card = await D1ReadModule.first(env, 'SELECT * FROM card_contacts WHERE row_id = ? LIMIT 1', [rowId]);
    if (!card) return { success: false, error: 'Card not found' };
    const actorId = this.text(payload.authenticatedUserId || payload.userId);
    const role = this.role(payload.authenticatedRole || payload.role);
    const networkId = this.text(payload.authenticatedNetworkId || payload.networkId);
    const isOwner = actorId && (actorId === this.text(card.creator_id) || actorId === this.text(card.line_id));
    const isStoreManager = role === 'store' && networkId && networkId === this.text(card.network_id);
    if (role !== 'admin' && !isStoreManager && !isOwner) {
      return { success: false, error: 'Access Denied: cannot delete this card' };
    }
    await env.ACTMASTER_DB.prepare('DELETE FROM card_contacts WHERE row_id = ?').bind(rowId).run();
    return { success: true, rowId, deleted: true };
  },

  async unlinkCard(payload, env) {
    if (!this.hasD1(env)) return null;
    const rowId = this.pick(payload, ['rowId', 'row_id', 'id']);
    if (!rowId) return { success: false, error: 'Missing card rowId' };
    const card = await D1ReadModule.first(env, 'SELECT * FROM card_contacts WHERE row_id = ? LIMIT 1', [rowId]);
    if (!card) return { success: false, error: 'Card not found' };
    const actorId = this.text(payload.authenticatedUserId || payload.userId);
    const role = this.role(payload.authenticatedRole || payload.role);
    const isOwner = actorId && (actorId === this.text(card.creator_id) || actorId === this.text(card.line_id));
    if (role !== 'admin' && !isOwner) {
      return { success: false, error: 'Access Denied: cannot unlink this card' };
    }
    await env.ACTMASTER_DB.prepare('UPDATE card_contacts SET line_id = "", updated_at = CURRENT_TIMESTAMP WHERE row_id = ?').bind(rowId).run();
    return { success: true, rowId, unlinked: true };
  }
};

const D1ConsistencyModule = {
  hasD1(env) {
    return !!(env && env.ACTMASTER_DB);
  },

  text(value) {
    return String(value ?? '').trim();
  },

  isPlaceholder(value) {
    const next = this.text(value);
    return !next || next === '未命名' || next === '姓名';
  },

  async first(env, sql, binds = []) {
    return await D1ReadModule.first(env, sql, binds);
  },

  async all(env, sql, binds = []) {
    return await D1ReadModule.all(env, sql, binds);
  },

  async ensureIndexes(env) {
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_users_line_id ON users(line_id)').run();
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_cards_line_id ON card_contacts(line_id)').run();
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_cards_creator_id ON card_contacts(creator_id)').run();
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_cards_updated_at ON card_contacts(updated_at)').run();
  },

  async audit(payload, env) {
    if (!this.hasD1(env)) return { success: false, error: 'D1 is not configured' };
    await this.ensureIndexes(env);
    await D1ReadModule.ensureCardAccessColumns(env);
    const missingUsers = await this.all(env, `
      SELECT c.row_id AS card_row_id, c.line_id, c.name, c.mobile, c.office_phone, c.title, c.company_name, c.network_id
      FROM card_contacts c
      LEFT JOIN users u ON u.line_id = c.line_id
      WHERE c.line_id IS NOT NULL AND TRIM(c.line_id) <> '' AND u.line_id IS NULL
      ORDER BY c.updated_at DESC
      LIMIT 200
    `);
    const duplicateCards = await this.all(env, `
      SELECT line_id, COUNT(*) AS count, GROUP_CONCAT(row_id) AS card_row_ids
      FROM card_contacts
      WHERE line_id IS NOT NULL AND TRIM(line_id) <> ''
      GROUP BY line_id
      HAVING COUNT(*) > 1
      LIMIT 200
    `);
    const placeholderUsers = await this.all(env, `
      SELECT row_id, line_id, name, phone, role, network_id
      FROM users
      WHERE TRIM(COALESCE(name,'')) = '' OR name = '未命名' OR name = '姓名'
      LIMIT 200
    `);
    const placeholderCards = await this.all(env, `
      SELECT row_id, line_id, name, mobile, office_phone, network_id
      FROM card_contacts
      WHERE TRIM(COALESCE(name,'')) = '' OR name = '未命名' OR name = '姓名'
      LIMIT 200
    `);
    const mismatches = await this.all(env, `
      SELECT u.line_id, u.name AS user_name, c.name AS card_name, u.phone AS user_phone,
             COALESCE(c.mobile, c.office_phone, '') AS card_phone, u.industry AS user_industry,
             COALESCE(c.title, c.company_name, '') AS card_industry, u.role, c.row_id AS card_row_id
      FROM users u
      JOIN card_contacts c ON c.line_id = u.line_id
      WHERE (
        (TRIM(COALESCE(u.name,'')) = '' OR u.name = '未命名' OR u.name = '姓名') AND TRIM(COALESCE(c.name,'')) <> '' AND c.name NOT IN ('未命名','姓名')
      ) OR (
        (TRIM(COALESCE(c.name,'')) = '' OR c.name = '未命名' OR c.name = '姓名') AND TRIM(COALESCE(u.name,'')) <> '' AND u.name NOT IN ('未命名','姓名')
      ) OR (
        TRIM(COALESCE(u.phone,'')) = '' AND TRIM(COALESCE(c.mobile, c.office_phone, '')) <> ''
      ) OR (
        TRIM(COALESCE(c.mobile, c.office_phone, '')) = '' AND TRIM(COALESCE(u.phone,'')) <> ''
      )
      LIMIT 200
    `);
    const importEventsWithoutCards = await this.all(env, `
      SELECT e.event_id, e.scanner_uid, e.inviter_uid, e.status, e.card_row_id, e.created_at, e.updated_at
      FROM card_import_events e
      LEFT JOIN card_contacts c ON c.row_id = e.card_row_id
      WHERE TRIM(COALESCE(e.card_row_id,'')) <> ''
        AND e.status IN ('created','merged','claimed')
        AND c.row_id IS NULL
      ORDER BY e.updated_at DESC
      LIMIT 200
    `);
    const privateCardsWithoutScanner = await this.all(env, `
      SELECT row_id, line_id, creator_id, owner_user_id, name, mobile, office_phone, source_type, updated_at
      FROM card_contacts
      WHERE LOWER(COALESCE(source_type,'')) = 'private_import'
        AND TRIM(COALESCE(scanner_user_id,'')) = ''
      ORDER BY updated_at DESC
      LIMIT 200
    `);
    const duplicatePrivateImports = await this.all(env, `
      SELECT scanner_user_id, duplicate_key, COUNT(*) AS count, GROUP_CONCAT(row_id) AS card_row_ids, GROUP_CONCAT(name) AS names
      FROM (
        SELECT row_id, scanner_user_id, name,
               COALESCE(NULLIF(TRIM(COALESCE(mobile,'')), ''), NULLIF(TRIM(COALESCE(office_phone,'')), ''), LOWER(TRIM(COALESCE(name,'')))) AS duplicate_key
        FROM card_contacts
        WHERE LOWER(COALESCE(source_type,'')) = 'private_import'
          AND TRIM(COALESCE(scanner_user_id,'')) <> ''
      )
      WHERE TRIM(COALESCE(duplicate_key,'')) <> ''
      GROUP BY scanner_user_id, duplicate_key
      HAVING COUNT(*) > 1
      LIMIT 200
    `);
    const personalVersionDuplicates = await this.all(env, `
      SELECT owner_user_id, version_key, COUNT(*) AS count, GROUP_CONCAT(row_id) AS card_row_ids, GROUP_CONCAT(name) AS names
      FROM (
        SELECT row_id, owner_user_id, name,
               CASE
                 WHEN row_id LIKE 'CARD_VIDEO_%' OR custom_config LIKE '%"cardVersion":"video"%' OR custom_config LIKE '%"cardVariant":"video_card"%' THEN 'video'
                 WHEN row_id LIKE 'CARD_POSTER_%' OR custom_config LIKE '%"cardVersion":"poster"%' THEN 'poster'
                 WHEN row_id LIKE 'CARD_SQUARE_%' OR custom_config LIKE '%"cardVersion":"square"%' THEN 'square'
                 ELSE 'standard'
               END AS version_key
        FROM card_contacts
        WHERE LOWER(COALESCE(source_type,'')) IN ('self_profile','video_profile')
          AND TRIM(COALESCE(owner_user_id,'')) <> ''
      )
      GROUP BY owner_user_id, version_key
      HAVING COUNT(*) > 1
      LIMIT 200
    `);
    const defaultAdminAttributions = await this.all(env, `
      SELECT row_id, line_id, creator_id, owner_user_id, scanner_user_id, name, mobile, office_phone, source_type, updated_at
      FROM card_contacts
      WHERE LOWER(COALESCE(source_type,'')) = 'private_import'
        AND TRIM(COALESCE(scanner_user_id,'')) = 'admin'
      ORDER BY updated_at DESC
      LIMIT 200
    `);
    return {
      success: true,
      data: {
        counts: {
          missingUsers: missingUsers.length,
          duplicateCardLineIds: duplicateCards.length,
          placeholderUsers: placeholderUsers.length,
          placeholderCards: placeholderCards.length,
          repairableMismatches: mismatches.length,
          importEventsWithoutCards: importEventsWithoutCards.length,
          privateCardsWithoutScanner: privateCardsWithoutScanner.length,
          duplicatePrivateImports: duplicatePrivateImports.length,
          personalVersionDuplicates: personalVersionDuplicates.length,
          defaultAdminAttributions: defaultAdminAttributions.length
        },
        missingUsers,
        duplicateCards,
        placeholderUsers,
        placeholderCards,
        mismatches,
        importEventsWithoutCards,
        privateCardsWithoutScanner,
        duplicatePrivateImports,
        personalVersionDuplicates,
        defaultAdminAttributions
      }
    };
  },

  async clearUserCache(env, userId) {
    if (!env.ACTMASTER_KV || !userId) return;
    try { await env.ACTMASTER_KV.delete(`U_PROFILE_${userId}`); } catch (e) { console.error('KV consistency clear error', e); }
  },

  async repair(payload, env) {
    if (!this.hasD1(env)) return { success: false, error: 'D1 is not configured' };
    await this.ensureIndexes(env);
    const before = await this.audit(payload, env);
    const repaired = {
      createdUsersFromBoundCards: 0,
      updatedUsersFromCards: 0,
      updatedCardsFromUsers: 0,
      cacheCleared: 0
    };
    const touchedUsers = new Set();

    const missingUsers = before.data.missingUsers || [];
    for (const card of missingUsers) {
      const lineId = this.text(card.line_id);
      if (!lineId) continue;
      await env.ACTMASTER_DB.prepare(`
        INSERT INTO users (row_id,line_id,name,industry,phone,role,network_id)
        VALUES (?,?,?,?,?,?,?)
        ON CONFLICT(line_id) DO NOTHING
      `).bind(
        `USR_${lineId}`,
        lineId,
        this.text(card.name) || '未命名',
        this.text(card.title || card.company_name),
        this.text(card.mobile || card.office_phone),
        'user',
        this.text(card.network_id) || 'admin'
      ).run();
      repaired.createdUsersFromBoundCards += 1;
      touchedUsers.add(lineId);
    }

    const mismatches = before.data.mismatches || [];
    for (const row of mismatches) {
      const lineId = this.text(row.line_id);
      if (!lineId) continue;
      const userName = this.text(row.user_name);
      const cardName = this.text(row.card_name);
      const userPhone = this.text(row.user_phone);
      const cardPhone = this.text(row.card_phone);
      const userIndustry = this.text(row.user_industry);
      const cardIndustry = this.text(row.card_industry);

      if ((this.isPlaceholder(userName) || !userPhone || !userIndustry) && (!this.isPlaceholder(cardName) || cardPhone || cardIndustry)) {
        await env.ACTMASTER_DB.prepare(`
          UPDATE users
          SET name = CASE WHEN (TRIM(COALESCE(name,'')) = '' OR name IN ('未命名','姓名')) AND ? <> '' THEN ? ELSE name END,
              phone = CASE WHEN TRIM(COALESCE(phone,'')) = '' AND ? <> '' THEN ? ELSE phone END,
              industry = CASE WHEN TRIM(COALESCE(industry,'')) = '' AND ? <> '' THEN ? ELSE industry END
          WHERE line_id = ?
        `).bind(cardName, cardName, cardPhone, cardPhone, cardIndustry, cardIndustry, lineId).run();
        repaired.updatedUsersFromCards += 1;
        touchedUsers.add(lineId);
      }

      if ((this.isPlaceholder(cardName) || !cardPhone) && (!this.isPlaceholder(userName) || userPhone)) {
        await env.ACTMASTER_DB.prepare(`
          UPDATE card_contacts
          SET name = CASE WHEN (TRIM(COALESCE(name,'')) = '' OR name IN ('未命名','姓名')) AND ? <> '' THEN ? ELSE name END,
              mobile = CASE WHEN TRIM(COALESCE(mobile,'')) = '' AND TRIM(COALESCE(office_phone,'')) = '' AND ? <> '' THEN ? ELSE mobile END,
              updated_at = CURRENT_TIMESTAMP
          WHERE row_id = ?
        `).bind(userName, userName, userPhone, userPhone, row.card_row_id).run();
        repaired.updatedCardsFromUsers += 1;
        touchedUsers.add(lineId);
      }
    }

    for (const userId of touchedUsers) {
      await this.clearUserCache(env, userId);
      repaired.cacheCleared += 1;
    }
    const after = await this.audit(payload, env);
    return { success: true, data: { repaired, before: before.data.counts, after: after.data.counts } };
  },

  async listDuplicateBindings(payload, env) {
    if (!this.hasD1(env)) return { success: false, error: 'D1 is not configured' };
    await this.ensureIndexes(env);
    const limit = Math.min(Math.max(Number(payload.limit || 100) || 100, 1), 300);
    const groups = await this.all(env, `
      SELECT line_id, COUNT(*) AS count
      FROM card_contacts
      WHERE line_id IS NOT NULL AND TRIM(line_id) <> ''
      GROUP BY line_id
      HAVING COUNT(*) > 1
      ORDER BY count DESC, line_id
      LIMIT ?
    `, [limit]);
    const data = [];
    for (const group of groups) {
      const lineId = this.text(group.line_id);
      const cards = await this.all(env, `
        SELECT row_id, line_id, name, company_name, title, mobile, office_phone,
               creator_id, network_id, created_at, updated_at
        FROM card_contacts
        WHERE line_id = ?
        ORDER BY
          CASE WHEN creator_id = line_id THEN 0 ELSE 1 END,
          updated_at DESC,
          created_at DESC,
          row_id DESC
      `, [lineId]);
      data.push({ lineId, count: Number(group.count || cards.length), cards });
    }
    return { success: true, data };
  },

  async resolveDuplicateBinding(payload, env) {
    if (!this.hasD1(env)) return { success: false, error: 'D1 is not configured' };
    await this.ensureIndexes(env);
    const lineId = this.text(payload.lineId);
    const keepRowId = this.text(payload.keepRowId);
    const confirmed = payload.confirmResolve === true || String(payload.confirmResolve || '').toLowerCase() === 'true';
    if (!confirmed) return { success: false, error: 'Missing duplicate binding confirmation' };
    if (!lineId || !keepRowId) return { success: false, error: 'Missing lineId or keepRowId' };

    const cards = await this.all(env, `
      SELECT row_id, line_id, name, company_name, title, mobile, office_phone, creator_id, network_id
      FROM card_contacts
      WHERE line_id = ?
      ORDER BY updated_at DESC, created_at DESC
    `, [lineId]);
    if (cards.length <= 1) return { success: false, error: 'This LINE ID is not duplicated' };
    if (!cards.some(card => this.text(card.row_id) === keepRowId)) {
      return { success: false, error: 'Keep card is not in this duplicate group' };
    }

    const requested = Array.isArray(payload.unlinkRowIds)
      ? payload.unlinkRowIds.map(id => this.text(id)).filter(Boolean)
      : cards.map(card => this.text(card.row_id)).filter(id => id && id !== keepRowId);
    const unlinkRowIds = Array.from(new Set(requested)).filter(id => id !== keepRowId && cards.some(card => this.text(card.row_id) === id));
    if (!unlinkRowIds.length) return { success: false, error: 'No duplicate card selected to unlink' };

    const placeholders = unlinkRowIds.map(() => '?').join(',');
    const result = await env.ACTMASTER_DB.prepare(`
      UPDATE card_contacts
      SET line_id = '', updated_at = CURRENT_TIMESTAMP
      WHERE line_id = ? AND row_id IN (${placeholders}) AND row_id <> ?
    `).bind(lineId, ...unlinkRowIds, keepRowId).run();
    await this.clearUserCache(env, lineId);
    const remaining = await this.first(env, `
      SELECT COUNT(*) AS count
      FROM card_contacts
      WHERE line_id = ?
    `, [lineId]);
    return {
      success: true,
      data: {
        lineId,
        keepRowId,
        unlinkedRowIds,
        changed: result?.meta?.changes || unlinkRowIds.length,
        remainingCount: Number(remaining?.count || 0)
      }
    };
  }
};

const D1ActivityModule = {
  hasD1(env) {
    return !!(env && env.ACTMASTER_DB);
  },

  text(value, fallback = '') {
    const next = String(value ?? '').trim();
    return next || fallback;
  },

  pick(source, keys, fallback = '') {
    for (const key of keys) {
      const value = source && source[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
    }
    return fallback;
  },

  bool(value) {
    return value === true || String(value ?? '').toLowerCase() === 'true' || String(value ?? '') === '1';
  },

  activityRow(row) {
    if (!row) return null;
    return {
      rowId: this.text(row.activity_id),
      activityId: this.text(row.activity_id),
      userId: this.text(row.creator_id),
      name: this.text(row.name, '未命名活動'),
      activityName: this.text(row.name, '未命名活動'),
      activityType: this.text(row.type, '活動'),
      feeType: this.text(row.fee_type, '免費'),
      price: Number(row.price || 0) || 0,
      startTime: this.text(row.start_time),
      endTime: this.text(row.end_time),
      description: this.text(row.description),
      imageUrl: this.text(row.image_url),
      imageRatio: this.text(row.image_ratio, '16:9'),
      image_ratio: this.text(row.image_ratio, '16:9'),
      status: this.text(row.status, '上架'),
      networkId: this.text(row.network_id, 'admin'),
      network_id: this.text(row.network_id, 'admin'),
      nfcCheckinStart: this.text(row.nfc_checkin_start),
      nfcCheckinEnd: this.text(row.nfc_checkin_end),
      nfcCheckinSameDayOnly: row.nfc_same_day_only !== 0,
      createdAt: this.text(row.created_at),
      '活動ID': this.text(row.activity_id),
      '活動名稱': this.text(row.name, '未命名活動'),
      '活動類型': this.text(row.type, '活動'),
      '收費方式': this.text(row.fee_type, '免費'),
      '金額': Number(row.price || 0) || 0,
      '開始時間': this.text(row.start_time),
      '結束時間': this.text(row.end_time),
      '活動說明': this.text(row.description),
      '宣傳圖': this.text(row.image_url),
      '狀態': this.text(row.status, '上架'),
      '歸屬網': this.text(row.network_id, 'admin'),
      'NFC簽到開始': this.text(row.nfc_checkin_start),
      'NFC簽到結束': this.text(row.nfc_checkin_end),
      'NFC限當日': row.nfc_same_day_only !== 0
    };
  },

  registrantRow(row) {
    if (!row) return null;
    const checked = Number(row.checked_in || 0) === 1;
    const cancelled = this.text(row.status) === 'cancelled';
    return {
      rowId: this.text(row.row_id),
      registrationId: this.text(row.row_id),
      lineId: this.text(row.line_id),
      userId: this.text(row.line_id),
      activityId: this.text(row.activity_id),
      activityName: this.text(row.activity_name),
      name: this.text(row.name, '未命名'),
      phone: this.text(row.phone),
      identity: this.text(row.identity, '會員'),
      checkedIn: checked,
      checkinStatus: checked,
      paymentStatus: this.text(row.payment_status),
      status: cancelled ? 'cancelled' : (checked ? 'checkedin' : 'active'),
      amount: Number(row.amount || 0) || 0,
      startTime: this.text(row.start_time),
      description: this.text(row.description),
      imageUrl: this.text(row.image_url),
      nfcCheckinTime: this.text(row.nfc_checkin_time),
      createdAt: this.text(row.created_at),
      cancelledAt: this.text(row.cancelled_at),
      '報名ID': this.text(row.row_id),
      'LINE ID': this.text(row.line_id),
      '活動ID': this.text(row.activity_id),
      '活動名稱': this.text(row.activity_name),
      '姓名': this.text(row.name, '未命名'),
      '手機': this.text(row.phone),
      '身份': this.text(row.identity, '會員'),
      '簽到': checked,
      '付款狀態': this.text(row.payment_status),
      '報名狀態': cancelled ? '已取消' : '有效',
      '金額': Number(row.amount || 0) || 0,
      '開始時間': this.text(row.start_time),
      '活動說明': this.text(row.description),
      '宣傳圖': this.text(row.image_url),
      '報名時間': this.text(row.created_at)
    };
  },

  normalizeActivity(payload = {}) {
    const data = payload.data || payload;
    const activityId = this.pick(data, ['activityId', '活動ID'], this.pick(payload, ['activityId'])) || `ACT_${Date.now()}`;
    return {
      activity_id: activityId,
      name: this.pick(data, ['activityName', 'name', '活動名稱'], '未命名活動'),
      type: this.pick(data, ['activityType', 'type', '活動類型'], '活動'),
      fee_type: this.pick(data, ['feeType', '收費方式'], '免費'),
      price: Number(this.pick(data, ['price', '金額'], '0')) || 0,
      start_time: this.pick(data, ['startTime', '開始時間']),
      end_time: this.pick(data, ['endTime', '結束時間']),
      description: this.pick(data, ['description', '活動說明']),
      image_url: this.pick(data, ['imageUrl', '宣傳圖']),
      image_ratio: this.pick(data, ['imageRatio', 'image_ratio', 'posterRatio', 'poster_ratio', 'posterLayout', 'imageLayout'], '16:9'),
      creator_id: this.pick(data, ['userId', 'creatorId'], this.pick(payload, ['userId'], 'admin')),
      network_id: this.pick(payload, ['authenticatedNetworkId'], this.pick(data, ['networkId', 'network_id', '歸屬網'], this.pick(payload, ['networkId'], 'admin'))),
      status: this.pick(data, ['status', '狀態'], '上架'),
      nfc_checkin_start: this.pick(data, ['nfcCheckinStart', 'NFC簽到開始']),
      nfc_checkin_end: this.pick(data, ['nfcCheckinEnd', 'NFC簽到結束']),
      nfc_same_day_only: this.bool(data.nfcCheckinSameDayOnly ?? data['NFC限當日'] ?? true) ? 1 : 0,
      is_series: this.bool(data.isBatch || data.isSeries) ? 1 : 0
    };
  },

  async ensureActivityNetworkScope(env) {
    if (!this.hasD1(env) || this._networkScopeReady) return;
    await env.ACTMASTER_DB.prepare("ALTER TABLE activities ADD COLUMN network_id TEXT NOT NULL DEFAULT 'admin'").run().catch(() => null);
    await env.ACTMASTER_DB.prepare("ALTER TABLE activities ADD COLUMN image_ratio TEXT NOT NULL DEFAULT '16:9'").run().catch(() => null);
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_activities_status_start ON activities(status, start_time)').run().catch(() => null);
    await env.ACTMASTER_DB.prepare(`
      UPDATE activities
      SET network_id = COALESCE(
        (
          SELECT CASE
            WHEN LOWER(COALESCE(users.role, '')) IN ('store','tenant') OR users.role IN ('店長','租戶') THEN users.line_id
            WHEN NULLIF(users.network_id, '') IS NOT NULL AND users.network_id <> 'admin' THEN users.network_id
            WHEN NULLIF(users.referrer_id, '') IS NOT NULL THEN users.referrer_id
            ELSE 'admin'
          END
          FROM users
          WHERE users.line_id = activities.creator_id
             OR users.row_id = activities.creator_id
          LIMIT 1
        ),
        'admin'
      )
      WHERE network_id = '' OR network_id = 'admin'
    `).run().catch(() => null);
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_activities_network_status ON activities(network_id, status, start_time)').run().catch(() => null);
    this._networkScopeReady = true;
  },

  async listActivities(payload, env, actor = null) {
    if (!this.hasD1(env)) return null;
    await this.ensureActivityNetworkScope(env);
    const role = actor
      ? SecurityModule.normalizeRole(actor.role)
      : SecurityModule.normalizeRole(payload.authenticatedRole || payload.role || payload.operatorRole || payload.actorRole || '');
    const requestedNetworkId = this.text(payload.networkId || payload.net || '');
    const actorNetworkId = this.text(actor?.networkId || payload.authenticatedNetworkId || 'admin', 'admin');
    const networkId = requestedNetworkId || actorNetworkId;
    const actorId = this.text(actor?.userId || payload.authenticatedUserId || payload.userId);
    const isAdmin = role === 'admin';
    const adminWantsAll = isAdmin && (!requestedNetworkId || requestedNetworkId === 'all' || requestedNetworkId === 'admin');
    const rows = adminWantsAll
      ? await D1ReadModule.all(env, 'SELECT * FROM activities ORDER BY COALESCE(start_time, created_at) DESC, created_at DESC LIMIT 500')
      : networkId === 'admin'
        ? actorId
          ? await D1ReadModule.all(env, `
              SELECT * FROM activities
              WHERE COALESCE(NULLIF(network_id, ''), 'admin') = 'admin'
                 OR creator_id = ?
              ORDER BY COALESCE(start_time, created_at) DESC, created_at DESC
              LIMIT 500
            `, [actorId])
          : await D1ReadModule.all(env, `
            SELECT * FROM activities
            WHERE COALESCE(NULLIF(network_id, ''), 'admin') = 'admin'
            ORDER BY COALESCE(start_time, created_at) DESC, created_at DESC
            LIMIT 500
          `)
      : actorId
        ? await D1ReadModule.all(env, `
            SELECT * FROM activities
            WHERE COALESCE(NULLIF(network_id, ''), 'admin') = ?
               OR creator_id = ?
            ORDER BY COALESCE(start_time, created_at) DESC, created_at DESC
            LIMIT 500
          `, [networkId, actorId])
        : await D1ReadModule.all(env, `
            SELECT * FROM activities
            WHERE COALESCE(NULLIF(network_id, ''), 'admin') = ?
            ORDER BY COALESCE(start_time, created_at) DESC, created_at DESC
            LIMIT 500
          `, [networkId]);
    return { success: true, data: rows.map(row => this.activityRow(row)).filter(Boolean) };
  },

  async getActivityById(payload, env, actor = null) {
    if (!this.hasD1(env)) return null;
    await this.ensureActivityNetworkScope(env);
    const activityId = this.pick(payload, ['activityId', '活動ID']);
    if (!activityId) return { success: false, error: 'Missing activityId' };
    const row = await D1ReadModule.first(env, 'SELECT * FROM activities WHERE activity_id = ? LIMIT 1', [activityId]);
    if (!row) return { success: false, error: '找不到活動資料' };

    const role = actor
      ? SecurityModule.normalizeRole(actor.role)
      : SecurityModule.normalizeRole(payload.authenticatedRole || payload.role || payload.operatorRole || payload.actorRole || '');
    const actorId = this.text(actor?.userId || payload.authenticatedUserId || payload.userId);
    const requestedNetwork = this.text(payload.networkId || payload.net || '');
    const actorNetwork = requestedNetwork || this.text(actor?.networkId || payload.authenticatedNetworkId || 'admin', 'admin');
    const activityNetwork = this.text(row.network_id, 'admin');
    const sameNetwork = (!activityNetwork || activityNetwork === 'admin')
      ? actorNetwork === 'admin'
      : activityNetwork === actorNetwork;

    let hasRegistration = false;
    if (actorId) {
      const reg = await D1ReadModule.first(env, "SELECT row_id FROM registrants WHERE activity_id = ? AND line_id = ? AND status <> 'cancelled' LIMIT 1", [activityId, actorId]).catch(() => null);
      hasRegistration = !!reg;
    }

    if (role !== 'admin' && !sameNetwork && !hasRegistration) {
      return { success: false, error: 'Access Denied: Activity outside your scope' };
    }
    return { success: true, data: this.activityRow(row) };
  },

  getActivityNetwork(activity) {
    const explicitNetwork = this.text(activity && (
      activity.networkId ||
      activity.network_id ||
      activity.net ||
      activity['歸屬網']
    ));
    if (explicitNetwork) return explicitNetwork;
    const creatorId = this.text(activity && (activity.creatorId || activity.creator_id || activity.userId));
    return creatorId && creatorId !== 'admin' ? creatorId : 'admin';
  },

  filterResultByActor(result, payload = {}, actor = null) {
    const role = actor
      ? SecurityModule.normalizeRole(actor.role)
      : SecurityModule.normalizeRole(payload.authenticatedRole || payload.role || payload.operatorRole || payload.actorRole || '');
    if (role === 'admin') return result;
    const requestedNetworkId = this.text(payload.networkId || payload.net || '');
    const networkId = requestedNetworkId || this.text(actor?.networkId || payload.authenticatedNetworkId || 'admin', 'admin');
    const canSee = (activity) => {
      const activityNetwork = this.getActivityNetwork(activity);
      if (!activityNetwork || activityNetwork === 'admin') return networkId === 'admin';
      return activityNetwork === networkId;
    };
    if (Array.isArray(result)) return result.filter(canSee);
    if (!result || typeof result !== 'object') return result;
    if (Array.isArray(result.data)) return { ...result, data: result.data.filter(canSee) };
    if (Array.isArray(result.activities)) return { ...result, activities: result.activities.filter(canSee) };
    if (Array.isArray(result.items)) return { ...result, items: result.items.filter(canSee) };
    return result;
  },

  async upsertActivity(payload, env) {
    if (!this.hasD1(env)) return null;
    await this.ensureActivityNetworkScope(env);
    const activity = this.normalizeActivity(payload);
    await env.ACTMASTER_DB.prepare(`
      INSERT INTO activities (activity_id,name,type,fee_type,price,start_time,end_time,description,image_url,image_ratio,creator_id,network_id,status,is_series,nfc_checkin_start,nfc_checkin_end,nfc_same_day_only)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(activity_id) DO UPDATE SET
        name=excluded.name,type=excluded.type,fee_type=excluded.fee_type,price=excluded.price,start_time=excluded.start_time,
        end_time=excluded.end_time,description=excluded.description,image_url=excluded.image_url,image_ratio=excluded.image_ratio,network_id=excluded.network_id,status=excluded.status,
        is_series=excluded.is_series,nfc_checkin_start=excluded.nfc_checkin_start,nfc_checkin_end=excluded.nfc_checkin_end,
        nfc_same_day_only=excluded.nfc_same_day_only
    `).bind(activity.activity_id,activity.name,activity.type,activity.fee_type,activity.price,activity.start_time,activity.end_time,activity.description,activity.image_url,activity.image_ratio,activity.creator_id,activity.network_id,activity.status,activity.is_series,activity.nfc_checkin_start,activity.nfc_checkin_end,activity.nfc_same_day_only).run();
    return activity;
  },

  async bulkAddRegistrants(payload, env) {
    const activity = await this.upsertActivity(payload, env);
    if (!activity) return null;
    const names = Array.isArray(payload.names) ? payload.names : [];
    for (let i = 0; i < names.length; i++) {
      const name = this.text(names[i]);
      if (!name) continue;
      await this.insertRegistration({
        activityId: activity.activity_id,
        activityName: activity.name,
        name,
        identity: payload.defaultIdentity || '會員',
        amount: activity.price,
        paymentStatus: activity.price > 0 ? '待付款' : '免費',
        startTime: activity.start_time,
        description: activity.description,
        imageUrl: activity.image_url
      }, env);
    }
    return { success: true, data: { activityId: activity.activity_id, inserted: names.filter(Boolean).length } };
  },

  async insertRegistration(payload, env) {
    const activityId = this.pick(payload, ['activityId', '活動ID']);
    if (!activityId) return { success: false, error: 'Missing activityId' };
    const lineId = this.pick(payload, ['userId', 'lineId', 'LINE ID']);
    if (lineId) {
      const existing = await D1ReadModule.first(env, "SELECT * FROM registrants WHERE activity_id = ? AND line_id = ? AND status <> 'cancelled' LIMIT 1", [activityId, lineId]);
      if (existing) return { success: true, data: this.registrantRow(existing), existed: true };
    }
    const activity = await D1ReadModule.first(env, 'SELECT * FROM activities WHERE activity_id = ? LIMIT 1', [activityId]);
    const rowId = this.pick(payload, ['rowId', 'registrationId']) || `REG_${activityId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const activityName = this.pick(payload, ['activityName', '活動名稱'], activity ? activity.name : '');
    const name = this.pick(payload, ['userName', 'name', '姓名'], '未命名');
    const phone = this.pick(payload, ['userPhone', 'phone', '手機']);
    const identity = this.pick(payload, ['defaultIdentity', 'identity', '身份'], '會員');
    const amount = Number(this.pick(payload, ['amount', 'price', '金額'], activity ? activity.price : 0)) || 0;
    const payment = this.pick(payload, ['paymentStatus', '付款狀態'], amount > 0 ? '待付款' : '免費');
    await env.ACTMASTER_DB.prepare(`
      INSERT INTO registrants (row_id,line_id,activity_name,name,phone,identity,checked_in,payment_status,activity_id,amount,start_time,description,image_url,status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(rowId,lineId,activityName,name,phone,identity,0,payment,activityId,amount,activity ? activity.start_time : '',activity ? activity.description : '',activity ? activity.image_url : '','active').run();
    return { success: true, data: { rowId, activityId }, existed: false };
  },

  async listRegistrants(payload, env) {
    if (!this.hasD1(env)) return null;
    const activityId = this.pick(payload, ['activityId', '活動ID']);
    const rows = activityId
      ? await D1ReadModule.all(env, 'SELECT * FROM registrants WHERE activity_id = ? ORDER BY created_at DESC LIMIT 500', [activityId])
      : await D1ReadModule.all(env, 'SELECT * FROM registrants ORDER BY created_at DESC LIMIT 500');
    return { success: true, data: rows.map(row => this.registrantRow(row)).filter(Boolean) };
  },

  async listMyRegistrations(payload, env) {
    if (!this.hasD1(env)) return null;
    const userId = this.pick(payload, ['userId', 'lineId']);
    const phone = this.pick(payload, ['phone', '手機']);
    const name = this.pick(payload, ['name', '姓名']);
    const rows = await D1ReadModule.all(env, `
      SELECT * FROM registrants
      WHERE (? <> '' AND line_id = ?) OR (? <> '' AND phone = ?) OR (? <> '' AND name = ?)
      ORDER BY created_at DESC LIMIT 200
    `, [userId,userId,phone,phone,name,name]);
    return { success: true, data: rows.map(row => this.registrantRow(row)).filter(Boolean) };
  },

  async cancelRegistration(payload, env) {
    const rowId = this.pick(payload, ['rowId', 'registrationId']);
    if (!rowId) return { success: false, error: 'Missing registrationId' };
    await env.ACTMASTER_DB.prepare("UPDATE registrants SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP WHERE row_id = ?").bind(rowId).run();
    return { success: true, data: { rowId, status: 'cancelled' } };
  },

  async toggleCheckin(payload, env, source = 'manual') {
    const rowId = this.pick(payload, ['rowId', 'registrationId', 'verifyCheckin']);
    if (!rowId) return { success: false, error: 'Missing registrationId' };
    const row = await D1ReadModule.first(env, "SELECT * FROM registrants WHERE row_id = ? AND status <> 'cancelled' LIMIT 1", [rowId]);
    if (!row) return { success: false, error: '找不到有效報名資料' };
    const next = Number(row.checked_in || 0) === 1 ? 0 : 1;
    await env.ACTMASTER_DB.prepare('UPDATE registrants SET checked_in = ?, nfc_checkin_time = ?, nfc_checkin_source = ? WHERE row_id = ?')
      .bind(next, next ? new Date().toISOString() : '', source, rowId).run();
    return { success: true, data: { rowId, checkedIn: next === 1 } };
  },

  taipeiNow() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(new Date()).reduce((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
    const date = `${parts.year}-${parts.month}-${parts.day}`;
    const time = `${parts.hour}:${parts.minute}`;
    return { date, time, localDateTime: `${date}T${time}` };
  },

  normalizeNfcWindowValue(value) {
    const raw = this.text(value).trim();
    if (!raw) return '';
    return raw.replace(' ', 'T').substring(0, 16);
  },

  isFullNfcDateTime(value) {
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(this.normalizeNfcWindowValue(value));
  },

  async nfcCheckin(payload, env) {
    const activityId = this.pick(payload, ['activityId', 'checkin']);
    const userId = this.pick(payload, ['userId', 'lineId']);
    if (!activityId || !userId) return { success: false, error: '缺少活動或會員資料' };
    const activity = await D1ReadModule.first(env, 'SELECT * FROM activities WHERE activity_id = ? LIMIT 1', [activityId]);
    if (!activity || this.text(activity.status) !== '上架') return { success: false, error: '活動不存在或已下架' };
    const reg = await D1ReadModule.first(env, "SELECT * FROM registrants WHERE activity_id = ? AND line_id = ? AND status <> 'cancelled' LIMIT 1", [activityId, userId]);
    if (!reg) return { success: false, error: '尚未報名，無法簽到' };

    const start = this.text(activity.nfc_checkin_start);
    const end = this.text(activity.nfc_checkin_end);
    if (start && end) {
      const now = this.taipeiNow();
      const startWindow = this.normalizeNfcWindowValue(start);
      const endWindow = this.normalizeNfcWindowValue(end);
      if (this.isFullNfcDateTime(startWindow) || this.isFullNfcDateTime(endWindow)) {
        if (!this.isFullNfcDateTime(startWindow) || !this.isFullNfcDateTime(endWindow)) {
          return { success: false, error: 'NFC 簽到起訖需同時包含日期與時間' };
        }
        if (now.localDateTime < startWindow || now.localDateTime > endWindow) return { success: false, error: '目前不在 NFC 簽到時段' };
      } else {
        const activityDate = this.text(activity.start_time).substring(0, 10);
        if (activity.nfc_same_day_only !== 0 && activityDate && activityDate !== now.date) {
          return { success: false, error: 'NFC 簽到限活動當日' };
        }
        if (now.time < startWindow || now.time > endWindow) return { success: false, error: '目前不在 NFC 簽到時段' };
      }
    }

    if (Number(reg.checked_in || 0) === 1) return { success: true, data: { alreadyChecked: true, rowId: reg.row_id } };
    await env.ACTMASTER_DB.prepare('UPDATE registrants SET checked_in = 1, nfc_checkin_time = ?, nfc_checkin_source = ? WHERE row_id = ?')
      .bind(new Date().toISOString(), 'nfc', reg.row_id).run();
    return { success: true, data: { alreadyChecked: false, rowId: reg.row_id, awardedPoints: Number(activity.reward_points || 0) || 0 } };
  },

  async confirmPayment(payload, env) {
    const rowId = this.pick(payload, ['rowId', 'registrationId']);
    if (!rowId) return { success: false, error: 'Missing registrationId' };
    await env.ACTMASTER_DB.prepare("UPDATE registrants SET payment_status = '已付款' WHERE row_id = ?").bind(rowId).run();
    return { success: true, data: { rowId, paymentStatus: '已付款' } };
  },

  async removeActivity(payload, env) {
    const activityId = this.pick(payload, ['activityId', '活動ID']);
    if (!activityId) return { success: false, error: 'Missing activityId' };
    return await this.setActivityStatus({ activityId, status: '下架' }, env);
  },

  async setActivityStatus(payload, env) {
    const activityId = this.pick(payload, ['activityId', '活動ID']);
    const status = this.pick(payload, ['status', '狀態'], '上架') === '下架' ? '下架' : '上架';
    if (!activityId) return { success: false, error: 'Missing activityId' };

    const existing = await D1ReadModule.first(env, 'SELECT activity_id FROM activities WHERE activity_id = ? LIMIT 1', [activityId]);
    if (!existing) return { success: false, error: '找不到活動資料' };

    if (status === '下架') {
      await env.ACTMASTER_DB.prepare("UPDATE activities SET status = '下架', ever_unpublished = 1 WHERE activity_id = ?").bind(activityId).run();
    } else {
      await env.ACTMASTER_DB.prepare("UPDATE activities SET status = '上架' WHERE activity_id = ?").bind(activityId).run();
    }
    return { success: true, data: { activityId, status } };
  },

  async duplicateActivity(payload, env) {
    if (!this.hasD1(env)) return null;
    await this.ensureActivityNetworkScope(env);
    const activityId = this.pick(payload, ['activityId', '活動ID']);
    if (!activityId) return { success: false, error: 'Missing activityId' };
    const source = await D1ReadModule.first(env, 'SELECT * FROM activities WHERE activity_id = ? LIMIT 1', [activityId]);
    if (!source) return { success: false, error: '找不到活動資料' };

    const newActivityId = this.pick(payload, ['newActivityId']) || `ACT_${Date.now()}`;
    const copiedName = `${this.text(source.name, '未命名活動')}（複製）`;
    await env.ACTMASTER_DB.prepare(`
      INSERT INTO activities (
        activity_id,name,type,fee_type,price,start_time,end_time,description,image_url,image_ratio,
        creator_id,network_id,status,is_series,nfc_checkin_start,nfc_checkin_end,nfc_same_day_only
      )
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      newActivityId,
      copiedName,
      this.text(source.type, '活動'),
      this.text(source.fee_type, '免費'),
      Number(source.price || 0) || 0,
      this.text(source.start_time),
      this.text(source.end_time),
      this.text(source.description),
      this.text(source.image_url),
      this.text(source.image_ratio, '16:9'),
      this.text(source.creator_id, this.text(payload.authenticatedUserId || payload.userId, 'admin')),
      this.text(source.network_id, this.text(payload.authenticatedNetworkId || payload.networkId, 'admin')),
      '下架',
      Number(source.is_series || 0) || 0,
      this.text(source.nfc_checkin_start),
      this.text(source.nfc_checkin_end),
      source.nfc_same_day_only === 0 ? 0 : 1
    ).run();

    const copied = await D1ReadModule.first(env, 'SELECT * FROM activities WHERE activity_id = ? LIMIT 1', [newActivityId]);
    return { success: true, data: { activityId: newActivityId, sourceActivityId: activityId, activity: this.activityRow(copied) } };
  },

  reminderWindowTaipei() {
    const now = new Date();
    const taipeiNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
    const next = new Date(taipeiNow);
    next.setDate(next.getDate() + 1);
    const y = next.getFullYear();
    const m = String(next.getMonth() + 1).padStart(2, '0');
    const d = String(next.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  nextDateString(dateText) {
    const raw = this.text(dateText);
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return raw;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    date.setDate(date.getDate() + 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  },

  async sendActivityReminders(payload, env) {
    if (!this.hasD1(env)) return null;
    const targetDate = this.pick(payload, ['date', 'targetDate'], this.reminderWindowTaipei());
    const nextDate = this.nextDateString(targetDate);
    const rows = await D1ReadModule.all(env, `
      SELECT
        r.row_id AS registration_id,
        r.line_id AS receiver_user_id,
        r.name AS registrant_name,
        a.activity_id,
        a.name AS activity_name,
        a.start_time,
        a.end_time,
        a.description,
        a.image_url,
        a.network_id,
        a.creator_id
      FROM registrants r
      JOIN activities a ON a.activity_id = r.activity_id
      WHERE r.status <> 'cancelled'
        AND TRIM(COALESCE(r.line_id, '')) <> ''
        AND a.status <> '銝'
        AND a.start_time >= ?
        AND a.start_time < ?
      ORDER BY a.start_time ASC, r.created_at ASC
      LIMIT 1000
    `, [targetDate, nextDate]);
    let sent = 0;
    let skipped = 0;
    for (const row of rows) {
      const receiverId = this.text(row.receiver_user_id);
      const activityId = this.text(row.activity_id);
      if (!receiverId || !activityId) {
        skipped++;
        continue;
      }
      const payloadJson = JSON.stringify({
        activityId,
        registrationId: this.text(row.registration_id),
        reminderDate: targetDate,
        kind: 'activity_day_before'
      });
      const exists = await D1ReadModule.first(env, `
        SELECT message_id
        FROM inbox_items
        WHERE receiver_user_id = ?
          AND message_type = 'activity_reminder'
          AND payload_json LIKE ?
        LIMIT 1
      `, [receiverId, `%"activityId":"${activityId}"%`]).catch(() => null);
      if (exists) {
        skipped++;
        continue;
      }
      const messageId = `ACTREM_${activityId}_${receiverId}_${targetDate}`.replace(/[^A-Za-z0-9_:-]/g, '_');
      const senderId = this.text(row.creator_id, 'system');
      const context = await D1InboxModule.senderContext(env, senderId).catch(() => ({ snapshot: { name: '系統提醒', lineId: senderId } }));
      const bodyLines = [
        `你報名的活動將於明日開始：${this.text(row.activity_name)}`,
        row.start_time ? `時間：${this.text(row.start_time)}` : '',
        this.text(row.description)
      ].filter(Boolean);
      await env.ACTMASTER_DB.prepare(`
        INSERT OR IGNORE INTO inbox_items (
          message_id, receiver_user_id, sender_user_id, sender_card_id, network_id,
          message_type, title, body, payload_json, sender_snapshot_json, status,
          read_at, archived_at, expires_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'activity_reminder', ?, ?, ?, ?, 'unread', '', '', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).bind(
        messageId,
        receiverId,
        senderId,
        this.text(context.snapshot && context.snapshot.cardId),
        this.text(row.network_id, 'admin'),
        `明日活動提醒：${this.text(row.activity_name)}`,
        bodyLines.join('\n'),
        payloadJson,
        JSON.stringify(context.snapshot || { name: '系統提醒', lineId: senderId })
      ).run();
      sent++;
      await WebPushModule.notifyUser(receiverId, {
        title: '明日活動提醒',
        body: this.text(row.activity_name),
        url: '/LINE-/?open=inbox'
      }, env).catch(() => null);
    }
    return { success: true, data: { targetDate, checked: rows.length, sent, skipped } };
  }
};

const D1PersonalTaskModule = {
  text(value, fallback = '') {
    const next = String(value ?? '').trim();
    return next || fallback;
  },

  number(value, fallback = 0) {
    const next = Number(value);
    return Number.isFinite(next) ? next : fallback;
  },

  async ensure(env) {
    await env.ACTMASTER_DB.prepare(`
      CREATE TABLE IF NOT EXISTS personal_tasks (
        task_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        task_type TEXT NOT NULL DEFAULT 'followup',
        related_name TEXT NOT NULL DEFAULT '',
        related_card_id TEXT NOT NULL DEFAULT '',
        start_time TEXT NOT NULL DEFAULT '',
        end_time TEXT NOT NULL DEFAULT '',
        remind_minutes INTEGER NOT NULL DEFAULT 30,
        notes TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending',
        recurrence_type TEXT NOT NULL DEFAULT 'none' CHECK (recurrence_type IN ('none', 'daily', 'weekly')),
        google_event_url TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed_at TEXT NOT NULL DEFAULT ''
      )
    `).run();
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_personal_tasks_user_time ON personal_tasks(user_id, start_time)').run();
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_personal_tasks_user_status ON personal_tasks(user_id, status)').run();
    await env.ACTMASTER_DB.prepare(`
      CREATE TABLE IF NOT EXISTS personal_task_occurrences (
        occurrence_id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        occurrence_key TEXT NOT NULL,
        scheduled_for TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'done',
        completed_at TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    await env.ACTMASTER_DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_personal_task_occurrences_task_key ON personal_task_occurrences(task_id, occurrence_key)').run();
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_personal_task_occurrences_user_schedule ON personal_task_occurrences(user_id, scheduled_for)').run();
  },

  taskRow(row) {
    if (!row) return null;
    return {
      taskId: this.text(row.task_id),
      userId: this.text(row.user_id),
      title: this.text(row.title),
      taskType: this.text(row.task_type, 'followup'),
      relatedName: this.text(row.related_name),
      relatedCardId: this.text(row.related_card_id),
      startTime: this.text(row.start_time),
      endTime: this.text(row.end_time),
      remindMinutes: this.number(row.remind_minutes, 30),
      notes: this.text(row.notes),
      status: this.text(row.status, 'pending'),
      recurrenceType: this.text(row.recurrence_type, 'none'),
      googleEventUrl: this.text(row.google_event_url),
      createdAt: this.text(row.created_at),
      updatedAt: this.text(row.updated_at),
      completedAt: this.text(row.completed_at)
    };
  },

  ownUserId(payload) {
    return this.text(payload.authenticatedUserId || payload.userId);
  },

  taipeiDate(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(now).reduce((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});
    return `${parts.year}-${parts.month}-${parts.day}`;
  },

  weekStart(dateText) {
    const date = new Date(`${dateText}T00:00:00Z`);
    const offset = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - offset);
    return date.toISOString().slice(0, 10);
  },

  occurrencePeriod(recurrenceType, now = new Date(), startTime = '') {
    const date = this.taipeiDate(now);
    if (recurrenceType === 'daily') {
      return { occurrenceKey: `D:${date}`, scheduledFor: date };
    }
    const monday = this.weekStart(date);
    const anchorMatch = this.text(startTime).match(/^(\d{4}-\d{2}-\d{2})/);
    if (!anchorMatch) {
      return { occurrenceKey: `W:${monday}`, scheduledFor: monday };
    }
    const anchorDate = new Date(`${anchorMatch[1]}T00:00:00Z`);
    const weekdayOffset = (anchorDate.getUTCDay() + 6) % 7;
    const scheduledDate = new Date(`${monday}T00:00:00Z`);
    scheduledDate.setUTCDate(scheduledDate.getUTCDate() + weekdayOffset);
    return {
      occurrenceKey: `W:${monday}`,
      scheduledFor: scheduledDate.toISOString().slice(0, 10)
    };
  },

  async list(payload, env) {
    await this.ensure(env);
    const userId = this.ownUserId(payload);
    if (!userId) return { success: false, error: 'Missing userId' };
    const rows = await D1ReadModule.all(env, `
      SELECT * FROM personal_tasks
      WHERE user_id = ? AND status <> 'deleted'
      ORDER BY CASE WHEN status = 'pending' THEN 0 ELSE 1 END,
               COALESCE(NULLIF(start_time, ''), created_at) ASC,
               updated_at DESC
      LIMIT 200
    `, [userId]);
    const tasks = rows.map(row => this.taskRow(row)).filter(Boolean);
    const today = this.taipeiDate();
    const dailyKey = `D:${today}`;
    const weeklyKey = `W:${this.weekStart(today)}`;
    const occurrences = await D1ReadModule.all(env, `
      SELECT task_id, occurrence_key, completed_at
      FROM personal_task_occurrences
      WHERE user_id = ? AND status = 'done' AND occurrence_key IN (?, ?)
    `, [userId, dailyKey, weeklyKey]);
    const completedByKey = new Map(
      occurrences.map(row => [`${this.text(row.task_id)}|${this.text(row.occurrence_key)}`, this.text(row.completed_at)])
    );
    return {
      success: true,
      data: tasks.map(task => {
        if (!['daily', 'weekly'].includes(task.recurrenceType)) {
          return {
            ...task,
            currentOccurrenceKey: '',
            currentOccurrenceDone: false,
            currentOccurrenceCompletedAt: '',
            scheduledFor: ''
          };
        }
        const period = this.occurrencePeriod(task.recurrenceType, new Date(), task.startTime);
        const completedAt = completedByKey.get(`${task.taskId}|${period.occurrenceKey}`) || '';
        return {
          ...task,
          currentOccurrenceKey: period.occurrenceKey,
          currentOccurrenceDone: Boolean(completedAt),
          currentOccurrenceCompletedAt: completedAt,
          scheduledFor: period.scheduledFor
        };
      })
    };
  },

  async save(payload, env) {
    await this.ensure(env);
    const userId = this.ownUserId(payload);
    if (!userId) return { success: false, error: 'Missing userId' };
    const taskId = this.text(payload.taskId || payload.task_id) || `TASK_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const title = this.text(payload.title);
    if (!title) return { success: false, error: '請輸入標題' };
    const taskType = this.text(payload.taskType || payload.task_type, 'followup');
    const recurrenceType = this.text(payload.recurrenceType || payload.recurrence_type, 'none').toLowerCase();
    if (!['none', 'daily', 'weekly'].includes(recurrenceType)) {
      return { success: false, error: '循環類型不正確' };
    }
    const relatedName = this.text(payload.relatedName || payload.related_name);
    const relatedCardId = this.text(payload.relatedCardId || payload.related_card_id);
    const startTime = this.text(payload.startTime || payload.start_time);
    const endTime = this.text(payload.endTime || payload.end_time);
    const inputSource = this.text(payload.inputSource || payload.input_source, 'manual').toLowerCase();
    if (inputSource === 'voice' && !startTime) {
      return { success: false, error: 'AI 尚未確認日期或時間，請補充後再儲存' };
    }
    if (startTime && !isTaipeiLocalDateTime(startTime)) return { success: false, error: '開始時間格式不正確' };
    if (endTime && !isTaipeiLocalDateTime(endTime)) return { success: false, error: '結束時間格式不正確' };
    if (startTime && endTime && taipeiDateTimeEpoch(endTime) <= taipeiDateTimeEpoch(startTime)) {
      return { success: false, error: '結束時間必須晚於開始時間' };
    }
    const remindMinutes = this.number(payload.remindMinutes || payload.remind_minutes, 30);
    const notes = this.text(payload.notes);
    const googleEventUrl = this.text(payload.googleEventUrl || payload.google_event_url);

    await env.ACTMASTER_DB.prepare(`
      INSERT INTO personal_tasks (
        task_id,user_id,title,task_type,related_name,related_card_id,start_time,end_time,
        remind_minutes,notes,status,recurrence_type,google_event_url,created_at,updated_at,completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, '')
      ON CONFLICT(task_id) DO UPDATE SET
        title=excluded.title,
        task_type=excluded.task_type,
        related_name=excluded.related_name,
        related_card_id=excluded.related_card_id,
        start_time=excluded.start_time,
        end_time=excluded.end_time,
        remind_minutes=excluded.remind_minutes,
        notes=excluded.notes,
        recurrence_type=excluded.recurrence_type,
        google_event_url=excluded.google_event_url,
        updated_at=CURRENT_TIMESTAMP
      WHERE personal_tasks.user_id = excluded.user_id
    `).bind(taskId, userId, title, taskType, relatedName, relatedCardId, startTime, endTime, remindMinutes, notes, recurrenceType, googleEventUrl).run();

    const row = await D1ReadModule.first(env, 'SELECT * FROM personal_tasks WHERE task_id = ? AND user_id = ? LIMIT 1', [taskId, userId]);
    return { success: true, data: this.taskRow(row) };
  },

  async parseVoiceDraft(payload, env) {
    const userId = this.ownUserId(payload);
    if (!userId) return { success: false, error: 'Missing userId' };
    const clean = value => this.text(value).slice(0, 2000);
    const normalizeDateTime = value => normalizeTaipeiDateTime(clean(value));
    const parseProposal = async transcript => {
      const prompt = `你是繁體中文個人行事曆助理。依 Asia/Taipei 時區，把使用者文字整理成待辦草稿。\n目前時間：${new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).replace(' ', 'T')}\n內容：${clean(transcript)}\n只回傳 JSON，欄位為 title,startTime,endTime,taskType,relatedName,location,notes,remindMinutes,recurrenceType,needsConfirmation。\n規則：startTime、endTime 必須使用 YYYY-MM-DDTHH:mm；相對日期依 Asia/Taipei 與目前時間換算；日期或時間不明確時 startTime、endTime 留空且 needsConfirmation=true；未指定結束時間時為開始後 60 分鐘；taskType 只能 followup、visit、payment、event、todo；recurrenceType 只能 none、daily、weekly；remindMinutes 只能 10、30、60、1440；不得捏造人物、地點或日期。`;
      const result = await AIModule.callOpenAI(env, {
        model: env.OPENAI_TEXT_MODEL || env.OPENAI_MODEL || 'gpt-4o-mini',
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }]
      });
      let parsed = {};
      try { parsed = JSON.parse(result.choices?.[0]?.message?.content || '{}'); } catch (e) {}
      const taskType = ['followup', 'visit', 'payment', 'event', 'todo'].includes(clean(parsed.taskType)) ? clean(parsed.taskType) : 'followup';
      const recurrenceType = ['none', 'daily', 'weekly'].includes(clean(parsed.recurrenceType)) ? clean(parsed.recurrenceType) : 'none';
      const remindMinutes = [10, 30, 60, 1440].includes(Number(parsed.remindMinutes)) ? Number(parsed.remindMinutes) : 30;
      return {
        transcript: clean(transcript).slice(0, 500),
        proposal: {
          title: clean(parsed.title).slice(0, 100) || clean(transcript).slice(0, 100),
          startTime: normalizeDateTime(parsed.startTime),
          endTime: normalizeDateTime(parsed.endTime),
          taskType,
          relatedName: clean(parsed.relatedName).slice(0, 120),
          location: clean(parsed.location).slice(0, 300),
          notes: clean(parsed.notes).slice(0, 1000),
          remindMinutes,
          recurrenceType,
          needsConfirmation: Boolean(parsed.needsConfirmation) || !normalizeDateTime(parsed.startTime)
        }
      };
    };

    const transcript = clean(payload.transcript).slice(0, 500);
    if (transcript) return { success: true, data: await parseProposal(transcript) };

    const durationMs = Number(payload.durationMs || 0);
    const mimeType = clean(payload.mimeType).toLowerCase().split(';')[0];
    const allowed = new Set(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-m4a']);
    const encoded = String(payload.audioBase64 || '').replace(/^data:[^,]+,/, '').replace(/\s/g, '');
    if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > 15000) return { success: false, error: '語音長度最多 15 秒' };
    if (!allowed.has(mimeType) || !encoded) return { success: false, error: '不支援這個語音格式' };
    let bytes;
    try { bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0)); } catch (e) { return { success: false, error: '語音資料格式不正確' }; }
    if (!bytes.length || bytes.byteLength > 1500000) return { success: false, error: '語音檔案過大，請縮短後再試' };
    const keys = AIModule.getOpenAIKeys(env);
    if (!keys.length) return { success: false, error: 'AI 語音服務尚未設定' };
    const extension = mimeType === 'audio/mp4' || mimeType === 'audio/x-m4a' ? 'm4a' : mimeType.split('/')[1] || 'webm';
    let transcription = '';
    let lastError = '';
    for (const key of keys) {
      try {
        const form = new FormData();
        form.append('model', env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe');
        form.append('file', new Blob([bytes], { type: mimeType }), `agenda.${extension}`);
        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form });
        const result = await response.json().catch(() => ({}));
        if (response.ok && result.text) { transcription = clean(result.text).slice(0, 500); break; }
        lastError = result.error?.message || `OpenAI HTTP ${response.status}`;
      } catch (e) { lastError = e.message || String(e); }
    }
    if (!transcription) return { success: false, error: lastError || 'AI 語音辨識失敗' };
    return { success: true, data: await parseProposal(transcription) };
  },
  async setStatus(payload, env, status) {
    await this.ensure(env);
    const userId = this.ownUserId(payload);
    const taskId = this.text(payload.taskId || payload.task_id);
    if (!userId || !taskId) return { success: false, error: 'Missing taskId' };
    const task = await D1ReadModule.first(
      env,
      "SELECT * FROM personal_tasks WHERE task_id = ? AND user_id = ? AND status <> 'deleted' LIMIT 1",
      [taskId, userId]
    );
    if (!task) return { success: false, error: '找不到待辦事項' };
    const recurrenceType = this.text(task.recurrence_type, 'none');
    if (status === 'done' && ['daily', 'weekly'].includes(recurrenceType)) {
      const completedAt = new Date().toISOString();
      const { occurrenceKey, scheduledFor } = this.occurrencePeriod(recurrenceType, new Date(), task.start_time);
      const occurrenceId = `${taskId}:${occurrenceKey}`;
      await env.ACTMASTER_DB.prepare(`
        INSERT INTO personal_task_occurrences (
          occurrence_id,task_id,user_id,occurrence_key,scheduled_for,status,completed_at,created_at
        ) VALUES (?, ?, ?, ?, ?, 'done', ?, CURRENT_TIMESTAMP)
        ON CONFLICT(task_id, occurrence_key) DO NOTHING
      `).bind(occurrenceId, taskId, userId, occurrenceKey, scheduledFor, completedAt).run();
      await env.ACTMASTER_DB.prepare(`
        UPDATE personal_tasks
        SET status = 'pending', completed_at = '', updated_at = CURRENT_TIMESTAMP
        WHERE task_id = ? AND user_id = ?
      `).bind(taskId, userId).run();
      return {
        success: true,
        data: { taskId, status: 'done', recurrenceType, occurrenceKey, scheduledFor, recurring: true }
      };
    }
    const completedAt = status === 'done' ? new Date().toISOString() : '';
    await env.ACTMASTER_DB.prepare(`
      UPDATE personal_tasks
      SET status = ?, completed_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE task_id = ? AND user_id = ?
    `).bind(status, completedAt, taskId, userId).run();
    return { success: true, data: { taskId, status } };
  }
};

const D1PersonalAssistantCoreModule = {
  text(value, fallback = '') {
    const next = String(value ?? '').trim();
    return next || fallback;
  },

  ownUserId(payload) {
    return this.text(payload.authenticatedUserId || payload.userId);
  },

  async ensure(env) {
    await env.ACTMASTER_DB.prepare(`
      CREATE TABLE IF NOT EXISTS personal_ai_cores (
        user_id TEXT PRIMARY KEY,
        schema_version TEXT NOT NULL DEFAULT '',
        core_json TEXT NOT NULL DEFAULT '{}',
        summary_json TEXT NOT NULL DEFAULT '{}',
        summary_text TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_personal_ai_cores_updated ON personal_ai_cores(updated_at)').run();
  },

  parseCore(payload) {
    let core = payload && (payload.core || payload.coreJson || payload.data);
    if (typeof core === 'string') core = JSON.parse(core);
    if (!core || typeof core !== 'object' || Array.isArray(core)) throw new Error('JSON 格式不正確');
    if (core.schemaVersion !== 'personal_ai_assistant_core_v1') throw new Error('schemaVersion 不正確');
    return core;
  },

  summarize(core) {
    core = core || {};
    const owner = core.ownerProfile || {};
    const biz = core.businessIdentity || {};
    const crm = core.crmRules || {};
    const daily = core.dailyAssistantRules || {};
    const offers = Array.isArray(core.productsAndOffers) ? core.productsAndOffers : [];
    const tags = Array.isArray(crm.defaultTags) ? crm.defaultTags.filter(Boolean).slice(0, 12) : [];
    return {
      displayName: this.text(owner.displayName, '未命名'),
      companyName: this.text(owner.companyName),
      title: this.text(owner.title),
      positioning: this.text(biz.oneLinePositioning),
      serviceSummary: this.text(biz.serviceSummary),
      productCount: offers.length,
      tagCount: tags.length,
      tags,
      suggestionCount: Array.isArray(daily.cardScanSuggestions) ? daily.cardScanSuggestions.length : 0,
      isComplete: !!(core.uploadReview && core.uploadReview.isComplete)
    };
  },

  row(row) {
    if (!row) return { exists: false, core: null, summary: null, summaryText: '', updatedAt: '' };
    let core = null;
    let summary = null;
    try { core = JSON.parse(row.core_json || '{}'); } catch (e) { core = {}; }
    try { summary = JSON.parse(row.summary_json || '{}'); } catch (e) { summary = this.summarize(core); }
    return {
      exists: true,
      userId: this.text(row.user_id),
      schemaVersion: this.text(row.schema_version),
      core,
      summary,
      summaryText: this.text(row.summary_text),
      createdAt: this.text(row.created_at),
      updatedAt: this.text(row.updated_at)
    };
  },

  async get(payload, env) {
    await this.ensure(env);
    const userId = this.ownUserId(payload);
    if (!userId) return { success: false, error: 'Missing userId' };
    const row = await D1ReadModule.first(env, 'SELECT * FROM personal_ai_cores WHERE user_id = ? LIMIT 1', [userId]);
    return { success: true, data: this.row(row) };
  },

  async save(payload, env) {
    await this.ensure(env);
    const userId = this.ownUserId(payload);
    if (!userId) return { success: false, error: 'Missing userId' };
    const core = this.parseCore(payload || {});
    const coreJson = JSON.stringify(core);
    if (coreJson.length > 120000) return { success: false, error: '資料包過大，請只保留標準 JSON 結果' };
    const summary = this.summarize(core);
    const summaryJson = JSON.stringify(summary);
    const summaryText = this.text(payload.summaryText || payload.summary_text).slice(0, 10000);

    await env.ACTMASTER_DB.prepare(`
      INSERT INTO personal_ai_cores (
        user_id,schema_version,core_json,summary_json,summary_text,created_at,updated_at
      ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET
        schema_version=excluded.schema_version,
        core_json=excluded.core_json,
        summary_json=excluded.summary_json,
        summary_text=excluded.summary_text,
        updated_at=CURRENT_TIMESTAMP
    `).bind(userId, core.schemaVersion, coreJson, summaryJson, summaryText).run();

    const row = await D1ReadModule.first(env, 'SELECT * FROM personal_ai_cores WHERE user_id = ? LIMIT 1', [userId]);
    return { success: true, data: this.row(row) };
  }
};

const D1StoreKnowledgeBaseModule = {
  schemaVersion: 'store_ai_knowledge_base_v1',

  text(value, fallback = '') {
    const next = String(value ?? '').trim();
    return next || fallback;
  },

  json(value, fallback = {}) {
    if (!value) return fallback;
    if (typeof value === 'object') return value;
    try {
      const parsed = JSON.parse(String(value));
      return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch (e) {
      return fallback;
    }
  },

  ownUserId(payload) {
    return this.text(payload.authenticatedUserId || payload.userId || payload.ownerLineUid || payload.owner_line_uid);
  },

  async ensure(env) {
    await env.ACTMASTER_DB.prepare(`
      CREATE TABLE IF NOT EXISTS store_ai_knowledge_profiles (
        profile_id TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL DEFAULT '',
        network_id TEXT NOT NULL DEFAULT 'admin',
        store_name TEXT NOT NULL DEFAULT '',
        schema_version TEXT NOT NULL DEFAULT '',
        search_visibility INTEGER NOT NULL DEFAULT 0,
        knowledge_json TEXT NOT NULL DEFAULT '{}',
        summary_json TEXT NOT NULL DEFAULT '{}',
        searchable_text TEXT NOT NULL DEFAULT '',
        item_count INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_store_ai_profiles_owner ON store_ai_knowledge_profiles(owner_user_id, status)').run();
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_store_ai_profiles_network ON store_ai_knowledge_profiles(network_id, status, search_visibility)').run();
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_store_ai_profiles_updated ON store_ai_knowledge_profiles(updated_at)').run();
  },

  parseKnowledge(payload) {
    let knowledge = payload && (payload.knowledge || payload.knowledgeJson || payload.data);
    if (typeof knowledge === 'string') knowledge = JSON.parse(knowledge);
    if (!knowledge || typeof knowledge !== 'object' || Array.isArray(knowledge)) throw new Error('JSON 格式不正確');
    if (knowledge.schemaVersion !== this.schemaVersion) throw new Error('schemaVersion 不正確');
    return knowledge;
  },

  normalizeList(value) {
    return Array.isArray(value) ? value.filter(item => item && typeof item === 'object') : [];
  },

  validateKnowledge(knowledge) {
    const errors = [];
    const store = knowledge.store || {};
    const products = this.normalizeList(knowledge.products);
    const services = this.normalizeList(knowledge.services);
    if (!this.text(store.storeName)) errors.push('store.storeName 不可空白');
    if (!this.text(store.ownerLineUid)) errors.push('store.ownerLineUid 不可空白');
    if (typeof store.searchVisibility !== 'boolean') errors.push('store.searchVisibility 必須是 true 或 false');
    if (!products.length && !services.length) errors.push('products 或 services 至少要有一筆');
    products.forEach((item, index) => {
      if (!this.text(item.name)) errors.push(`products[${index}].name 不可空白`);
      if (!this.text(item.summary)) errors.push(`products[${index}].summary 不可空白`);
      if (!this.text(item.description)) errors.push(`products[${index}].description 不可空白`);
    });
    services.forEach((item, index) => {
      if (!this.text(item.name)) errors.push(`services[${index}].name 不可空白`);
      if (!this.text(item.summary)) errors.push(`services[${index}].summary 不可空白`);
      if (!this.text(item.description)) errors.push(`services[${index}].description 不可空白`);
    });
    return errors;
  },

  collectSearchText(knowledge) {
    const parts = [];
    const append = value => {
      if (Array.isArray(value)) value.forEach(append);
      else if (value && typeof value === 'object') Object.values(value).forEach(append);
      else {
        const text = this.text(value);
        if (text) parts.push(text);
      }
    };
    append(knowledge.store || {});
    append(knowledge.products || []);
    append(knowledge.services || []);
    append(knowledge.faqs || []);
    return parts.join(' ').slice(0, 60000);
  },

  summarize(knowledge) {
    const store = knowledge.store || {};
    const products = this.normalizeList(knowledge.products);
    const services = this.normalizeList(knowledge.services);
    const faqs = Array.isArray(knowledge.faqs) ? knowledge.faqs : [];
    return {
      storeName: this.text(store.storeName),
      category: this.text(store.category),
      ownerLineUid: this.text(store.ownerLineUid),
      serviceAreas: Array.isArray(store.serviceAreas) ? store.serviceAreas.filter(Boolean).slice(0, 12) : [],
      searchVisibility: store.searchVisibility === true,
      productCount: products.length,
      serviceCount: services.length,
      faqCount: faqs.length,
      productNames: products.map(item => this.text(item.name)).filter(Boolean).slice(0, 20),
      serviceNames: services.map(item => this.text(item.name)).filter(Boolean).slice(0, 20),
      contacts: {
        phone: this.text(store.contacts && store.contacts.phone),
        lineUrl: this.text(store.contacts && store.contacts.lineUrl),
        website: this.text(store.contacts && store.contacts.website),
        address: this.text(store.contacts && store.contacts.address)
      }
    };
  },

  row(row, includeKnowledge = false) {
    if (!row) return { exists: false };
    const summary = this.json(row.summary_json, {});
    const data = {
      exists: true,
      profileId: this.text(row.profile_id),
      ownerUserId: this.text(row.owner_user_id),
      networkId: this.text(row.network_id),
      storeName: this.text(row.store_name),
      schemaVersion: this.text(row.schema_version),
      searchVisibility: Number(row.search_visibility) === 1,
      itemCount: Number(row.item_count || 0),
      status: this.text(row.status, 'active'),
      summary,
      createdAt: this.text(row.created_at),
      updatedAt: this.text(row.updated_at)
    };
    if (includeKnowledge) data.knowledge = this.json(row.knowledge_json, {});
    return data;
  },

  async get(payload, env) {
    await this.ensure(env);
    const userId = this.ownUserId(payload);
    if (!userId) return { success: false, error: 'Missing userId' };
    const row = await D1ReadModule.first(env, `
      SELECT * FROM store_ai_knowledge_profiles
      WHERE owner_user_id = ? AND status <> 'deleted'
      ORDER BY updated_at DESC
      LIMIT 1
    `, [userId]);
    return { success: true, data: this.row(row, true) };
  },

  async save(payload, env) {
    await this.ensure(env);
    const actorUserId = this.ownUserId(payload);
    if (!actorUserId) return { success: false, error: 'Missing userId' };
    const knowledge = this.parseKnowledge(payload || {});
    const errors = this.validateKnowledge(knowledge);
    if (errors.length) return { success: false, error: errors.join('；'), validationErrors: errors };

    const store = knowledge.store || {};
    const ownerLineUid = this.text(store.ownerLineUid, actorUserId);
    if (ownerLineUid !== actorUserId && this.text(payload.authenticatedRole) !== 'admin') {
      return { success: false, error: '只能上傳自己的店家知識庫' };
    }
    store.ownerLineUid = ownerLineUid;
    knowledge.store = store;

    const profileId = this.text(payload.profileId || payload.profile_id) || `STOREKB_${ownerLineUid}`;
    const networkId = this.text(payload.authenticatedNetworkId || store.storeId || store.networkId, ownerLineUid);
    const summary = this.summarize(knowledge);
    const products = this.normalizeList(knowledge.products);
    const services = this.normalizeList(knowledge.services);
    const itemCount = products.length + services.length;
    const knowledgeJson = JSON.stringify(knowledge);
    if (knowledgeJson.length > 150000) return { success: false, error: '資料包過大，請縮減商品服務內容' };
    const summaryJson = JSON.stringify(summary);
    const searchableText = this.collectSearchText(knowledge);

    await env.ACTMASTER_DB.prepare(`
      INSERT INTO store_ai_knowledge_profiles (
        profile_id,owner_user_id,network_id,store_name,schema_version,search_visibility,
        knowledge_json,summary_json,searchable_text,item_count,status,created_at,updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(profile_id) DO UPDATE SET
        owner_user_id=excluded.owner_user_id,
        network_id=excluded.network_id,
        store_name=excluded.store_name,
        schema_version=excluded.schema_version,
        search_visibility=excluded.search_visibility,
        knowledge_json=excluded.knowledge_json,
        summary_json=excluded.summary_json,
        searchable_text=excluded.searchable_text,
        item_count=excluded.item_count,
        status='active',
        updated_at=CURRENT_TIMESTAMP
    `).bind(
      profileId,
      ownerLineUid,
      networkId,
      summary.storeName,
      knowledge.schemaVersion,
      summary.searchVisibility ? 1 : 0,
      knowledgeJson,
      summaryJson,
      searchableText,
      itemCount
    ).run();

    const row = await D1ReadModule.first(env, 'SELECT * FROM store_ai_knowledge_profiles WHERE profile_id = ? LIMIT 1', [profileId]);
    return { success: true, data: this.row(row, false) };
  },

  isOutOfScope(query) {
    const text = this.text(query).toLowerCase();
    if (!text || text.length < 2) return true;
    const blocked = ['股票', '投資', '政治', '選舉', '色情', '診斷', '治療', '法律判決', '保證獲利'];
    return blocked.some(word => text.includes(word.toLowerCase()));
  },

  async search(payload, env) {
    await this.ensure(env);
    const query = this.text(payload.query || payload.q || payload.text);
    if (this.isOutOfScope(query)) {
      return {
        success: true,
        data: {
          outOfScope: true,
          message: '這個問題超出本店商品與服務範圍，我只能協助介紹店家的商品、服務、預約與聯絡資訊。',
          items: []
        }
      };
    }
    const limit = Math.max(1, Math.min(Number(payload.limit || 5) || 5, 10));
    const keyword = `%${query.replace(/[%_]/g, '').slice(0, 80)}%`;
    const rows = await D1ReadModule.all(env, `
      SELECT profile_id,owner_user_id,network_id,store_name,schema_version,search_visibility,
             summary_json,item_count,status,created_at,updated_at
      FROM store_ai_knowledge_profiles
      WHERE status = 'active'
        AND search_visibility = 1
        AND searchable_text LIKE ?
      ORDER BY updated_at DESC
      LIMIT ?
    `, [keyword, limit]);
    return {
      success: true,
      data: {
        outOfScope: false,
        query,
        count: rows.length,
        items: rows.map(row => this.row(row, false))
      }
    };
  }
};

const AdminCustomerImportMonitorModule = {
  text(value, fallback = '') {
    const next = String(value ?? '').trim();
    return next || fallback;
  },

  number(value, fallback = 0) {
    const next = Number(value);
    return Number.isFinite(next) ? next : fallback;
  },

  batchRow(row) {
    if (!row) return null;
    return {
      batchId: this.text(row.batch_id),
      ownerUserId: this.text(row.owner_user_id),
      ownerName: this.text(row.owner_name, '未命名用戶'),
      networkId: this.text(row.network_id),
      sourceType: this.text(row.source_type),
      sourceName: this.text(row.source_name),
      state: this.text(row.state),
      totalRows: this.number(row.total_rows),
      readyRows: this.number(row.ready_rows),
      errorRows: this.number(row.error_rows),
      createdRows: this.number(row.created_rows),
      updatedRows: this.number(row.updated_rows),
      skippedRows: this.number(row.skipped_rows),
      checkpoint: this.number(row.checkpoint),
      createdAt: this.text(row.created_at),
      updatedAt: this.text(row.updated_at),
      completedAt: this.text(row.completed_at),
      rolledBackAt: this.text(row.rolled_back_at)
    };
  },

  async overview(payload, env) {
    const customer = await D1ReadModule.first(env, `
      SELECT COUNT(*) AS total_customers, COUNT(DISTINCT owner_user_id) AS owner_count
      FROM customer_records
      WHERE archived_at = ''
    `).catch(() => null);
    const imports = await D1ReadModule.first(env, `
      SELECT COUNT(*) AS total_batches,
             SUM(CASE WHEN date(created_at, '+8 hours') = date('now', '+8 hours') THEN 1 ELSE 0 END) AS today_batches,
             SUM(CASE WHEN date(created_at, '+8 hours') = date('now', '+8 hours') THEN created_rows ELSE 0 END) AS today_created,
             SUM(CASE WHEN state IN ('failed','partial_failed') THEN 1 ELSE 0 END) AS attention_batches
      FROM customer_import_batches
    `).catch(() => null);
    const settings = await D1ReadModule.first(env, `
      SELECT master_enabled,offpeak_start_hour_taipei,offpeak_end_hour_taipei,max_jobs_per_run,max_jobs_per_day,updated_at
      FROM customer_tag_analysis_settings WHERE settings_key='global'
    `).catch(() => null);
    const ai = await D1ReadModule.first(env, `
      SELECT COUNT(*) AS total_batches,
             SUM(CASE WHEN state IN ('approved','running') THEN 1 ELSE 0 END) AS active_batches,
             SUM(estimated_cost_microusd) AS estimated_cost_microusd,
             SUM(max_cost_microusd) AS approved_limit_microusd,
             SUM(actual_cost_microusd) AS actual_cost_microusd
      FROM customer_tag_analysis_batches
    `).catch(() => null);
    const jobs = await D1ReadModule.first(env, `
      SELECT SUM(CASE WHEN status IN ('pending','leased') THEN 1 ELSE 0 END) AS pending_jobs,
             SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed_jobs,
             SUM(CASE WHEN status IN ('failed','insufficient') THEN 1 ELSE 0 END) AS attention_jobs
      FROM customer_tag_analysis_jobs
    `).catch(() => null);
    return {
      success: true,
      data: {
        customers: {
          total: this.number(customer?.total_customers),
          owners: this.number(customer?.owner_count)
        },
        imports: {
          totalBatches: this.number(imports?.total_batches),
          todayBatches: this.number(imports?.today_batches),
          todayCreated: this.number(imports?.today_created),
          attentionBatches: this.number(imports?.attention_batches)
        },
        ai: {
          masterEnabled: this.number(settings?.master_enabled) === 1,
          offpeakStartHourTaipei: this.number(settings?.offpeak_start_hour_taipei, 2),
          offpeakEndHourTaipei: this.number(settings?.offpeak_end_hour_taipei, 5),
          maxJobsPerRun: this.number(settings?.max_jobs_per_run, 5),
          maxJobsPerDay: this.number(settings?.max_jobs_per_day, 100),
          totalBatches: this.number(ai?.total_batches),
          activeBatches: this.number(ai?.active_batches),
          pendingJobs: this.number(jobs?.pending_jobs),
          completedJobs: this.number(jobs?.completed_jobs),
          attentionJobs: this.number(jobs?.attention_jobs),
          estimatedCostMicrousd: this.number(ai?.estimated_cost_microusd),
          approvedLimitMicrousd: this.number(ai?.approved_limit_microusd),
          actualCostMicrousd: this.number(ai?.actual_cost_microusd),
          updatedAt: this.text(settings?.updated_at)
        }
      }
    };
  },

  async list(payload, env) {
    const allowedStates = new Set(['draft','reading','mapping','validating','ready','importing','completed','partial_failed','failed','rolled_back']);
    const allowedSources = new Set(['xlsx','xls','csv','manual']);
    const state = allowedStates.has(this.text(payload.state)) ? this.text(payload.state) : '';
    const sourceType = allowedSources.has(this.text(payload.sourceType).toLowerCase()) ? this.text(payload.sourceType).toLowerCase() : '';
    const query = this.text(payload.query).slice(0, 80);
    const limit = Math.min(Math.max(this.number(payload.limit, 25), 1), 100);
    const offset = Math.max(this.number(payload.offset, 0), 0);
    const conditions = [];
    const binds = [];
    if (state) { conditions.push('b.state = ?'); binds.push(state); }
    if (sourceType) { conditions.push('b.source_type = ?'); binds.push(sourceType); }
    if (query) {
      const like = `%${query.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
      conditions.push(`(b.batch_id LIKE ? ESCAPE '\\' OR b.owner_user_id LIKE ? ESCAPE '\\' OR b.source_name LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM users uq WHERE (uq.line_id=b.owner_user_id OR uq.row_id=b.owner_user_id) AND uq.name LIKE ? ESCAPE '\\'))`);
      binds.push(like, like, like, like);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const total = await D1ReadModule.first(env, `SELECT COUNT(*) AS count FROM customer_import_batches b ${where}`, binds);
    const rows = await D1ReadModule.all(env, `
      SELECT b.batch_id,b.network_id,b.owner_user_id,b.source_type,b.source_name,b.state,
             b.total_rows,b.ready_rows,b.error_rows,b.created_rows,b.updated_rows,b.skipped_rows,b.checkpoint,
             b.created_at,b.updated_at,b.completed_at,b.rolled_back_at,
             COALESCE((SELECT u.name FROM users u WHERE u.line_id=b.owner_user_id OR u.row_id=b.owner_user_id LIMIT 1),'') AS owner_name
      FROM customer_import_batches b
      ${where}
      ORDER BY b.created_at DESC
      LIMIT ? OFFSET ?
    `, [...binds, limit, offset]);
    return { success: true, data: { items: rows.map(row => this.batchRow(row)), total: this.number(total?.count), limit, offset } };
  },

  async summary(payload, env) {
    const batchId = this.text(payload.batchId).slice(0, 160);
    if (!batchId) return { success: false, error: 'BATCH_ID_REQUIRED' };
    const row = await D1ReadModule.first(env, `
      SELECT b.batch_id,b.network_id,b.owner_user_id,b.source_type,b.source_name,b.state,
             b.total_rows,b.ready_rows,b.error_rows,b.created_rows,b.updated_rows,b.skipped_rows,b.checkpoint,
             b.created_at,b.updated_at,b.completed_at,b.rolled_back_at,
             COALESCE((SELECT u.name FROM users u WHERE u.line_id=b.owner_user_id OR u.row_id=b.owner_user_id LIMIT 1),'') AS owner_name
      FROM customer_import_batches b WHERE b.batch_id=? LIMIT 1
    `, [batchId]);
    if (!row) return { success: false, error: 'BATCH_NOT_FOUND' };
    const errors = await D1ReadModule.all(env, `
      SELECT COALESCE(NULLIF(error_code,''),'NONE') AS code,status,decision,COUNT(*) AS count
      FROM customer_import_rows
      WHERE batch_id=? AND network_id=? AND owner_user_id=?
      GROUP BY COALESCE(NULLIF(error_code,''),'NONE'),status,decision
      ORDER BY count DESC
      LIMIT 50
    `, [batchId, row.network_id, row.owner_user_id]);
    const ai = await D1ReadModule.first(env, `
      SELECT COUNT(*) AS total_batches,
             SUM(CASE WHEN state IN ('approved','running') THEN 1 ELSE 0 END) AS active_batches,
             SUM(eligible_customers) AS eligible_customers,
             SUM(estimated_cost_microusd) AS estimated_cost_microusd,
             SUM(max_cost_microusd) AS approved_limit_microusd,
             SUM(actual_cost_microusd) AS actual_cost_microusd
      FROM customer_tag_analysis_batches
      WHERE network_id=? AND owner_user_id=?
    `, [row.network_id, row.owner_user_id]).catch(() => null);
    return {
      success: true,
      data: {
        batch: this.batchRow(row),
        rowSummary: errors.map(item => ({
          code: this.text(item.code),
          status: this.text(item.status),
          decision: this.text(item.decision),
          count: this.number(item.count)
        })),
        ownerAi: {
          totalBatches: this.number(ai?.total_batches),
          activeBatches: this.number(ai?.active_batches),
          eligibleCustomers: this.number(ai?.eligible_customers),
          estimatedCostMicrousd: this.number(ai?.estimated_cost_microusd),
          approvedLimitMicrousd: this.number(ai?.approved_limit_microusd),
          actualCostMicrousd: this.number(ai?.actual_cost_microusd)
        }
      }
    };
  }
};

const D1AnnouncementModule = {
  text(value, fallback = '') {
    const next = String(value ?? '').trim();
    return next || fallback;
  },

  number(value, fallback = 20) {
    const next = Number(value);
    return Number.isFinite(next) ? next : fallback;
  },

  async ensure(env) {
    await env.ACTMASTER_DB.prepare(`
      CREATE TABLE IF NOT EXISTS announcements (
        announcement_id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT '',
        body TEXT NOT NULL DEFAULT '',
        image_url TEXT NOT NULL DEFAULT '',
        action_label TEXT NOT NULL DEFAULT '',
        action_url TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active',
        created_by TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_announcements_status_updated ON announcements(status, updated_at)').run();
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_announcements_updated ON announcements(updated_at)').run();
  },

  row(row) {
    if (!row) return null;
    return {
      announcementId: this.text(row.announcement_id),
      title: this.text(row.title),
      body: this.text(row.body),
      imageUrl: this.text(row.image_url),
      actionLabel: this.text(row.action_label),
      actionUrl: this.text(row.action_url),
      status: this.text(row.status, 'active'),
      createdBy: this.text(row.created_by),
      createdAt: this.text(row.created_at),
      updatedAt: this.text(row.updated_at)
    };
  },

  async list(payload, env, admin = false) {
    await this.ensure(env);
    const limit = Math.min(Math.max(this.number(payload.limit, admin ? 100 : 10), 1), 100);
    const rows = admin
      ? await D1ReadModule.all(env, `
          SELECT * FROM announcements
          WHERE status <> 'deleted'
          ORDER BY COALESCE(NULLIF(updated_at, ''), created_at) DESC, created_at DESC
          LIMIT ?
        `, [limit])
      : await D1ReadModule.all(env, `
          SELECT * FROM announcements
          WHERE status = 'active'
          ORDER BY COALESCE(NULLIF(updated_at, ''), created_at) DESC, created_at DESC
          LIMIT ?
        `, [limit]);
    return { success: true, data: rows.map(row => this.row(row)).filter(Boolean) };
  },

  async save(payload, env) {
    await this.ensure(env);
    const announcementId = this.text(payload.announcementId || payload.announcement_id) || `ANN_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const title = this.text(payload.title);
    const body = this.text(payload.body);
    if (!title && !body) return { success: false, error: 'Missing announcement content' };
    const imageUrl = this.text(payload.imageUrl || payload.image_url);
    const actionLabel = this.text(payload.actionLabel || payload.action_label);
    const actionUrl = this.text(payload.actionUrl || payload.action_url);
    const status = ['active', 'hidden'].includes(this.text(payload.status)) ? this.text(payload.status) : 'active';
    const createdBy = this.text(payload.authenticatedUserId || payload.userId || payload.operatorId || payload.createdBy);

    await env.ACTMASTER_DB.prepare(`
      INSERT INTO announcements (
        announcement_id,title,body,image_url,action_label,action_url,status,created_by,created_at,updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(announcement_id) DO UPDATE SET
        title=excluded.title,
        body=excluded.body,
        image_url=excluded.image_url,
        action_label=excluded.action_label,
        action_url=excluded.action_url,
        status=excluded.status,
        updated_at=CURRENT_TIMESTAMP
    `).bind(announcementId, title, body, imageUrl, actionLabel, actionUrl, status, createdBy).run();

    const row = await D1ReadModule.first(env, 'SELECT * FROM announcements WHERE announcement_id = ? LIMIT 1', [announcementId]);
    return { success: true, data: this.row(row) };
  },

  async remove(payload, env) {
    await this.ensure(env);
    const announcementId = this.text(payload.announcementId || payload.announcement_id);
    if (!announcementId) return { success: false, error: 'Missing announcementId' };
    await env.ACTMASTER_DB.prepare(`
      UPDATE announcements
      SET status = 'deleted', updated_at = CURRENT_TIMESTAMP
      WHERE announcement_id = ?
    `).bind(announcementId).run();
    return { success: true, data: { announcementId, status: 'deleted' } };
  }
};

const D1InboxModule = {
  text(value, fallback = '') {
    const next = String(value ?? '').trim();
    return next || fallback;
  },

  json(value, fallback = {}) {
    if (!value) return fallback;
    if (typeof value === 'object') return value;
    try {
      const parsed = JSON.parse(String(value));
      return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch (e) {
      return fallback;
    }
  },

  ownUserId(payload) {
    return this.text(payload.authenticatedUserId || payload.userId || payload.lineId);
  },

  async identityIds(env, userId) {
    const id = this.text(userId);
    const ids = [];
    const add = value => {
      const next = this.text(value);
      if (next && !ids.includes(next)) ids.push(next);
    };
    add(id);
    const identity = await D1ReadModule.findUserByIdentity(env, id).catch(() => null);
    add(identity && identity.canonicalId);
    const user = identity && identity.user ? identity.user : null;
    add(user && user.line_id);
    add(user && user.row_id);
    add(user && user.legacy_line_id);
    add(user && user.point_line_id);
    const link = identity && identity.link ? identity.link : null;
    add(link && link.new_line_id);
    add(link && link.old_line_id);
    return ids.length ? ids : [id];
  },

  placeholders(values) {
    return (Array.isArray(values) ? values : []).map(() => '?').join(', ');
  },

  uniqueTextList(values) {
    const list = [];
    for (const value of Array.isArray(values) ? values : []) {
      const next = this.text(value);
      if (next && !list.includes(next)) list.push(next);
    }
    return list;
  },

  recipientIdentityValues(row) {
    return this.uniqueTextList([
      row && row.line_id,
      row && row.row_id,
      row && row.legacy_line_id,
      row && row.point_line_id
    ]);
  },

  intersects(left, right) {
    const rightSet = new Set(this.uniqueTextList(right));
    return this.uniqueTextList(left).some(value => rightSet.has(value));
  },

  async actorReachContext(payload, env) {
    const actorId = this.ownUserId(payload);
    const actorRole = this.text(payload.authenticatedRole || payload.role, 'user').toLowerCase();
    const actorNetwork = this.text(payload.authenticatedNetworkId || payload.networkId, 'admin');
    const actorIds = actorId ? await this.identityIds(env, actorId).catch(() => [actorId]) : [];
    const actorIdentity = actorId ? await D1ReadModule.findUserByIdentity(env, actorId).catch(() => null) : null;
    const actorUser = actorIdentity && actorIdentity.user ? actorIdentity.user : null;
    const actorReferrerId = this.text(actorUser && actorUser.referrer_id);
    const actorReferrerIds = actorReferrerId ? await this.identityIds(env, actorReferrerId).catch(() => [actorReferrerId]) : [];
    const actorNetworkIds = actorNetwork ? await this.identityIds(env, actorNetwork).catch(() => [actorNetwork]) : [];
    return {
      actorId,
      actorRole,
      actorNetwork,
      actorUser,
      actorIds: this.uniqueTextList(actorIds),
      actorReferrerIds: this.uniqueTextList(actorReferrerIds),
      actorNetworkIds: this.uniqueTextList(actorNetworkIds)
    };
  },

  async ensure(env) {
    await env.ACTMASTER_DB.prepare(`
      CREATE TABLE IF NOT EXISTS inbox_items (
        message_id TEXT PRIMARY KEY,
        receiver_user_id TEXT NOT NULL,
        sender_user_id TEXT NOT NULL DEFAULT '',
        sender_card_id TEXT NOT NULL DEFAULT '',
        network_id TEXT NOT NULL DEFAULT 'admin',
        message_type TEXT NOT NULL DEFAULT 'message',
        title TEXT NOT NULL DEFAULT '',
        body TEXT NOT NULL DEFAULT '',
        payload_json TEXT NOT NULL DEFAULT '{}',
        sender_snapshot_json TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'unread',
        coupon_status TEXT NOT NULL DEFAULT 'issued',
        coupon_redeemed_at TEXT NOT NULL DEFAULT '',
        coupon_redeemed_by TEXT NOT NULL DEFAULT '',
        coupon_redeem_note TEXT NOT NULL DEFAULT '',
        read_at TEXT NOT NULL DEFAULT '',
        archived_at TEXT NOT NULL DEFAULT '',
        expires_at TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_inbox_receiver_status ON inbox_items(receiver_user_id, status, created_at)').run();
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_inbox_receiver_created ON inbox_items(receiver_user_id, created_at)').run();
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_inbox_sender_created ON inbox_items(sender_user_id, created_at)').run();
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_inbox_network_created ON inbox_items(network_id, created_at)').run();
    await env.ACTMASTER_DB.prepare("ALTER TABLE inbox_items ADD COLUMN coupon_status TEXT NOT NULL DEFAULT 'issued'").run().catch(() => null);
    await env.ACTMASTER_DB.prepare("ALTER TABLE inbox_items ADD COLUMN coupon_redeemed_at TEXT NOT NULL DEFAULT ''").run().catch(() => null);
    await env.ACTMASTER_DB.prepare("ALTER TABLE inbox_items ADD COLUMN coupon_redeemed_by TEXT NOT NULL DEFAULT ''").run().catch(() => null);
    await env.ACTMASTER_DB.prepare("ALTER TABLE inbox_items ADD COLUMN coupon_redeem_note TEXT NOT NULL DEFAULT ''").run().catch(() => null);
  },

  async senderContext(env, senderUserId, senderCardId = '') {
    const senderId = this.text(senderUserId);
    const cardId = this.text(senderCardId);
    let card = null;
    let user = null;

    if (cardId) {
      card = await D1ReadModule.first(env, 'SELECT * FROM card_contacts WHERE row_id = ? LIMIT 1', [cardId]).catch(() => null);
    }
    if (!card && senderId) {
      card = await D1ReadModule.cardByIdentity(env, senderId);
    }
    if (senderId) {
      user = await D1ReadModule.first(env, `
        SELECT * FROM users
        WHERE line_id = ? OR row_id = ? OR legacy_line_id = ? OR point_line_id = ?
        LIMIT 1
      `, [senderId, senderId, senderId, senderId]).catch(() => null);
    }

    const mappedCard = D1ReadModule.cardRow(card);
    const mappedUser = D1ReadModule.userRow(user);
    return {
      senderCard: mappedCard,
      senderUser: mappedUser,
      snapshot: {
        name: this.text(mappedUser && mappedUser.name, this.text(mappedCard && mappedCard.name, '未知寄件者')),
        phone: this.text(mappedUser && mappedUser.phone, this.text(mappedCard && mappedCard.mobile)),
        companyName: this.text(mappedCard && mappedCard.companyName),
        title: this.text(mappedUser && mappedUser.industry, this.text(mappedCard && mappedCard.title)),
        cardId: this.text(mappedCard && mappedCard.rowId, cardId),
        lineId: senderId
      }
    };
  },

  async receiverContext(env, receiverUserId) {
    const receiverId = this.text(receiverUserId);
    let user = null;
    let card = null;
    if (receiverId) {
      const identity = await D1ReadModule.findUserByIdentity(env, receiverId).catch(() => null);
      user = identity && identity.user ? identity.user : null;
      const canonicalId = this.text(identity && identity.canonicalId, receiverId);
      card = await D1ReadModule.cardByIdentity(env, canonicalId);
    }
    return {
      receiverUser: D1ReadModule.userRow(user),
      receiverCard: D1ReadModule.cardRow(card)
    };
  },

  itemRow(row, context = {}) {
    if (!row) return null;
    return {
      messageId: this.text(row.message_id),
      receiverUserId: this.text(row.receiver_user_id),
      senderUserId: this.text(row.sender_user_id),
      senderCardId: this.text(row.sender_card_id),
      networkId: this.text(row.network_id, 'admin'),
      messageType: this.text(row.message_type, 'message'),
      title: this.text(row.title),
      body: this.text(row.body),
      payload: this.json(row.payload_json),
      senderSnapshot: this.json(row.sender_snapshot_json, context.snapshot || {}),
      status: this.text(row.status, 'unread'),
      couponStatus: this.text(row.coupon_status, 'issued'),
      couponRedeemedAt: this.text(row.coupon_redeemed_at),
      couponRedeemedBy: this.text(row.coupon_redeemed_by),
      couponRedeemNote: this.text(row.coupon_redeem_note),
      readAt: this.text(row.read_at),
      archivedAt: this.text(row.archived_at),
      expiresAt: this.text(row.expires_at),
      createdAt: this.text(row.created_at),
      updatedAt: this.text(row.updated_at),
      senderCard: context.senderCard || null,
      senderUser: context.senderUser || null,
      receiverCard: context.receiverCard || null,
      receiverUser: context.receiverUser || null,
      viewerRole: context.viewerRole || ''
    };
  },

  isVisibleSql() {
    return "(expires_at = '' OR expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)";
  },

  async count(payload, env) {
    await this.ensure(env);
    const userId = this.ownUserId(payload);
    if (!userId) return { success: false, error: 'Missing userId' };
    const ids = await this.identityIds(env, userId);
    const row = await D1ReadModule.first(env, `
      SELECT COUNT(*) AS unread
      FROM inbox_items
      WHERE receiver_user_id IN (${this.placeholders(ids)})
        AND status = 'unread'
        AND ${this.isVisibleSql()}
    `, ids);
    return { success: true, data: { unread: Number(row && row.unread) || 0 } };
  },

  async monitor(payload, env) {
    await this.ensure(env);
    const role = this.text(payload.authenticatedRole || payload.role, 'user').toLowerCase();
    const networkId = this.text(payload.authenticatedNetworkId || payload.networkId, 'admin');
    const isAdmin = role === 'admin';
    const binds = [];
    const scopeSql = isAdmin ? '1 = 1' : 'network_id = ?';
    if (!isAdmin) binds.push(networkId);

    const summary = await D1ReadModule.first(env, `
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'unread' THEN 1 ELSE 0 END) AS unread,
        SUM(CASE WHEN created_at >= datetime('now', '-24 hours') THEN 1 ELSE 0 END) AS last24h,
        SUM(CASE WHEN message_type = 'coupon' THEN 1 ELSE 0 END) AS coupons,
        SUM(CASE WHEN message_type = 'coupon' AND coupon_status = 'redeemed' THEN 1 ELSE 0 END) AS redeemedCoupons
      FROM inbox_items
      WHERE archived_at = ''
        AND ${this.isVisibleSql()}
        AND ${scopeSql}
    `, binds);

    const recentRows = await D1ReadModule.all(env, `
      SELECT i.*,
             su.name AS sender_name,
             ru.name AS receiver_name
      FROM inbox_items i
      LEFT JOIN users su ON su.line_id = i.sender_user_id OR su.row_id = i.sender_user_id OR su.point_line_id = i.sender_user_id OR su.legacy_line_id = i.sender_user_id
      LEFT JOIN users ru ON ru.line_id = i.receiver_user_id OR ru.row_id = i.receiver_user_id OR ru.point_line_id = i.receiver_user_id OR ru.legacy_line_id = i.receiver_user_id
      WHERE i.archived_at = ''
        AND ${this.isVisibleSql().replace(/expires_at/g, 'i.expires_at')}
        AND ${isAdmin ? '1 = 1' : 'i.network_id = ?'}
      ORDER BY i.created_at DESC, i.message_id DESC
      LIMIT 8
    `, binds);

    const threadRows = await D1ReadModule.all(env, `
      SELECT
        CASE WHEN sender_user_id < receiver_user_id THEN sender_user_id || '|' || receiver_user_id ELSE receiver_user_id || '|' || sender_user_id END AS thread_key,
        MAX(created_at) AS lastAt,
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'unread' THEN 1 ELSE 0 END) AS unread,
        MAX(sender_user_id) AS sender_user_id,
        MAX(receiver_user_id) AS receiver_user_id
      FROM inbox_items
      WHERE archived_at = ''
        AND ${this.isVisibleSql()}
        AND ${scopeSql}
      GROUP BY thread_key
      ORDER BY lastAt DESC
      LIMIT 6
    `, binds);

    return {
      success: true,
      data: {
        scope: isAdmin ? 'all' : networkId,
        summary: {
          total: Number(summary && summary.total) || 0,
          unread: Number(summary && summary.unread) || 0,
          last24h: Number(summary && summary.last24h) || 0,
          coupons: Number(summary && summary.coupons) || 0,
          redeemedCoupons: Number(summary && summary.redeemedCoupons) || 0
        },
        recent: recentRows.map(row => ({
          ...this.itemRow(row),
          senderName: this.text(row.sender_name, this.text(this.json(row.sender_snapshot_json).name, row.sender_user_id)),
          receiverName: this.text(row.receiver_name, row.receiver_user_id)
        })),
        threads: threadRows.map(row => ({
          threadKey: this.text(row.thread_key),
          senderUserId: this.text(row.sender_user_id),
          receiverUserId: this.text(row.receiver_user_id),
          total: Number(row.total) || 0,
          unread: Number(row.unread) || 0,
          lastAt: this.text(row.lastAt)
        }))
      }
    };
  },

  async list(payload, env) {
    await this.ensure(env);
    const userId = this.ownUserId(payload);
    if (!userId) return { success: false, error: 'Missing userId' };
    const ids = await this.identityIds(env, userId);
    const status = this.text(payload.status);
    const type = this.text(payload.messageType || payload.type);
    const binds = [...ids];
    let where = `receiver_user_id IN (${this.placeholders(ids)}) AND archived_at = '' AND ${this.isVisibleSql()}`;
    if (status === 'unread' || status === 'read') {
      where += ' AND status = ?';
      binds.push(status);
    }
    if (type) {
      where += ' AND message_type = ?';
      binds.push(type);
    }
    const rows = await D1ReadModule.all(env, `
      SELECT *
      FROM inbox_items
      WHERE ${where}
      ORDER BY CASE WHEN status = 'unread' THEN 0 ELSE 1 END,
               created_at DESC,
               message_id DESC
      LIMIT 100
    `, binds);
    return { success: true, data: rows.map(row => this.itemRow(row)).filter(Boolean) };
  },

  async listSent(payload, env) {
    await this.ensure(env);
    const userId = this.ownUserId(payload);
    if (!userId) return { success: false, error: 'Missing userId' };
    const ids = await this.identityIds(env, userId);
    const type = this.text(payload.messageType || payload.type);
    const binds = [...ids];
    let where = `sender_user_id IN (${this.placeholders(ids)}) AND archived_at = '' AND ${this.isVisibleSql()}`;
    if (type) {
      where += ' AND message_type = ?';
      binds.push(type);
    }
    const rows = await D1ReadModule.all(env, `
      SELECT *
      FROM inbox_items
      WHERE ${where}
      ORDER BY created_at DESC, message_id DESC
      LIMIT 100
    `, binds);
    const enriched = [];
    for (const row of rows) {
      const receiver = await this.receiverContext(env, row.receiver_user_id).catch(() => ({}));
      const sender = await this.senderContext(env, row.sender_user_id, row.sender_card_id).catch(() => ({}));
      enriched.push(this.itemRow(row, { ...sender, ...receiver, viewerRole: 'sender' }));
    }
    return { success: true, data: enriched.filter(Boolean) };
  },

  async get(payload, env) {
    await this.ensure(env);
    const userId = this.ownUserId(payload);
    const messageId = this.text(payload.messageId || payload.message_id);
    if (!userId || !messageId) return { success: false, error: 'Missing messageId' };
    const ids = await this.identityIds(env, userId);
    const row = await D1ReadModule.first(env, `
      SELECT *
      FROM inbox_items
      WHERE message_id = ?
        AND (receiver_user_id IN (${this.placeholders(ids)}) OR sender_user_id IN (${this.placeholders(ids)}))
        AND archived_at = ''
        AND ${this.isVisibleSql()}
      LIMIT 1
    `, [messageId, ...ids, ...ids]);
    if (!row) return { success: false, error: '找不到這封訊息' };

    const viewerIsReceiver = ids.includes(this.text(row.receiver_user_id));
    if (viewerIsReceiver && this.text(row.status, 'unread') === 'unread') {
      await env.ACTMASTER_DB.prepare(`
        UPDATE inbox_items
        SET status = 'read', read_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE message_id = ? AND receiver_user_id = ?
      `).bind(messageId, this.text(row.receiver_user_id)).run();
      row.status = 'read';
    }

    const context = await this.senderContext(env, row.sender_user_id, row.sender_card_id);
    const receiver = await this.receiverContext(env, row.receiver_user_id).catch(() => ({}));
    return { success: true, data: this.itemRow(row, { ...context, ...receiver, viewerRole: viewerIsReceiver ? 'receiver' : 'sender' }) };
  },

  async markRead(payload, env) {
    await this.ensure(env);
    const userId = this.ownUserId(payload);
    const messageId = this.text(payload.messageId || payload.message_id);
    if (!userId || !messageId) return { success: false, error: 'Missing messageId' };
    const ids = await this.identityIds(env, userId);
    await env.ACTMASTER_DB.prepare(`
      UPDATE inbox_items
      SET status = 'read', read_at = COALESCE(NULLIF(read_at, ''), CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
      WHERE message_id = ? AND receiver_user_id IN (${this.placeholders(ids)})
    `).bind(messageId, ...ids).run();
    return { success: true, data: { messageId, status: 'read' } };
  },

  async redeemCoupon(payload, env) {
    await this.ensure(env);
    const userId = this.ownUserId(payload);
    const messageId = this.text(payload.messageId || payload.message_id);
    if (!userId || !messageId) return { success: false, error: 'Missing messageId' };
    const ids = await this.identityIds(env, userId);
    const row = await D1ReadModule.first(env, `
      SELECT *
      FROM inbox_items
      WHERE message_id = ?
        AND receiver_user_id IN (${this.placeholders(ids)})
        AND message_type = 'coupon'
        AND archived_at = ''
        AND ${this.isVisibleSql()}
      LIMIT 1
    `, [messageId, ...ids]);
    if (!row) return { success: false, error: '找不到可核銷的優惠券' };
    if (this.text(row.coupon_redeemed_at) || this.text(row.coupon_status) === 'redeemed') {
      return { success: false, error: '這張優惠券已核銷，不能重複使用' };
    }

    const note = this.text(payload.note || payload.redeemNote);
    const result = await env.ACTMASTER_DB.prepare(`
      UPDATE inbox_items
      SET coupon_status = 'redeemed',
          coupon_redeemed_at = CURRENT_TIMESTAMP,
          coupon_redeemed_by = ?,
          coupon_redeem_note = ?,
          status = 'read',
          read_at = COALESCE(NULLIF(read_at, ''), CURRENT_TIMESTAMP),
          updated_at = CURRENT_TIMESTAMP
      WHERE message_id = ?
        AND receiver_user_id IN (${this.placeholders(ids)})
        AND message_type = 'coupon'
        AND (coupon_redeemed_at = '' OR coupon_redeemed_at IS NULL)
        AND coupon_status <> 'redeemed'
    `).bind(userId, note, messageId, ...ids).run();

    if (!result || !result.success || Number(result.meta && result.meta.changes || 0) < 1) {
      return { success: false, error: '這張優惠券已核銷，不能重複使用' };
    }

    const updated = await D1ReadModule.first(env, 'SELECT * FROM inbox_items WHERE message_id = ? LIMIT 1', [messageId]);
    const context = await this.senderContext(env, updated.sender_user_id, updated.sender_card_id);
    const receiver = await this.receiverContext(env, updated.receiver_user_id).catch(() => ({}));
    return { success: true, data: this.itemRow(updated, { ...context, ...receiver, viewerRole: 'receiver' }) };
  },

  async courseRecipientSummary(payload, env) {
    const actorId = this.ownUserId(payload);
    const actorRole = this.text(payload.authenticatedRole || payload.role, 'user').toLowerCase();
    const actorNetwork = this.text(payload.authenticatedNetworkId || payload.networkId, 'admin');
    const courseId = this.text(payload.courseId || payload.activityId || payload.keyword || payload.receiverQuery);
    if (!courseId) return { activity: null, recipients: [] };

    const activity = await D1ReadModule.first(env, `
      SELECT *
      FROM activities
      WHERE activity_id = ?
      LIMIT 1
    `, [courseId]).catch(() => null);
    if (!activity) return { activity: null, recipients: [] };

    const ownerId = this.text(activity.owner_id || activity.network_id || activity.creator_id || activity.created_by || activity.store_id);
    if (actorRole !== 'admin' && ownerId && ownerId !== actorId && ownerId !== actorNetwork) {
      return { activity, recipients: [] };
    }

    const rows = await D1ReadModule.all(env, `
      SELECT r.*, u.line_id AS user_line_id, u.row_id AS user_row_id, u.name AS user_name,
             u.phone AS user_phone, u.industry AS user_industry, u.role AS user_role,
             u.network_id AS user_network_id
      FROM registrants r
      LEFT JOIN users u ON u.line_id = r.line_id OR u.row_id = r.line_id OR u.phone = r.phone
      WHERE r.activity_id = ?
        AND COALESCE(r.status, '') <> 'cancelled'
      ORDER BY r.created_at DESC
      LIMIT 500
    `, [courseId]).catch(() => []);

    const seen = new Set();
    const recipients = [];
    for (const row of rows) {
      const userRow = {
        line_id: this.text(row.user_line_id || row.line_id),
        row_id: this.text(row.user_row_id),
        name: this.text(row.user_name || row.name),
        phone: this.text(row.user_phone || row.phone),
        industry: this.text(row.user_industry),
        role: this.text(row.user_role, 'user'),
        network_id: this.text(row.user_network_id || activity.network_id || activity.owner_id || 'admin')
      };
      if (!this.isActiveRecipient(userRow)) continue;
      if (!await this.canReachRecipient(payload, userRow, env)) continue;
      const uid = this.text(userRow.line_id || userRow.row_id);
      if (!uid || seen.has(uid)) continue;
      seen.add(uid);
      recipients.push(userRow);
    }
    return { activity, recipients };
  },

  recipientFromUserRow(row) {
    return {
      line_id: this.text(row && (row.user_line_id || row.line_id || row.row_id)),
      row_id: this.text(row && (row.user_row_id || row.row_id)),
      name: this.text(row && (row.user_name || row.name)),
      phone: this.text(row && (row.user_phone || row.phone)),
      industry: this.text(row && (row.user_industry || row.industry)),
      role: this.text(row && (row.user_role || row.role), 'user'),
      network_id: this.text(row && (row.user_network_id || row.network_id), 'admin'),
      referrer_id: this.text(row && (row.user_referrer_id || row.referrer_id))
    };
  },

  async ownedActiveRecipientSummary(payload, env) {
    const actorId = this.ownUserId(payload);
    const keyword = this.text(payload.keyword || payload.query || payload.receiverQuery);
    if (!actorId) return { recipients: [] };
    const ids = await this.identityIds(env, actorId);
    const placeholders = this.placeholders(ids);
    const allMode = ['all', 'ALL', '全部', '*'].includes(keyword);
    const binds = [...ids, ...ids];
    let filterSql = '';
    if (!allMode) {
      const like = `%${keyword}%`;
      filterSql = 'AND (c.name LIKE ? OR c.mobile LIKE ? OR c.office_phone LIKE ? OR c.company_name LIKE ? OR c.line_id LIKE ?)';
      binds.push(like, like, like, like, like);
    }
    const rows = await D1ReadModule.all(env, `
      SELECT c.*, u.line_id AS user_line_id, u.row_id AS user_row_id, u.name AS user_name,
             u.phone AS user_phone, u.industry AS user_industry, u.role AS user_role,
             u.network_id AS user_network_id, u.referrer_id AS user_referrer_id
      FROM card_contacts c
      INNER JOIN users u
        ON u.line_id = c.line_id OR u.row_id = c.line_id OR u.point_line_id = c.line_id OR u.legacy_line_id = c.line_id
      WHERE (c.owner_user_id IN (${placeholders}) OR c.creator_id IN (${placeholders}))
        AND TRIM(COALESCE(c.line_id, '')) <> ''
        ${filterSql}
      ORDER BY COALESCE(c.updated_at, c.created_at) DESC, c.row_id DESC
      LIMIT 500
    `, binds).catch(() => []);
    const seen = new Set();
    const recipients = [];
    for (const row of rows) {
      const userRow = this.recipientFromUserRow(row);
      if (!this.isActiveRecipient(userRow)) continue;
      const uid = this.text(userRow.line_id || userRow.row_id);
      if (!uid || uid === actorId || seen.has(uid)) continue;
      seen.add(uid);
      recipients.push(userRow);
    }
    return { recipients };
  },

  async broadcastRecipientSummary(payload, env) {
    const actorId = this.ownUserId(payload);
    const actorRole = this.text(payload.authenticatedRole || payload.role, 'user').toLowerCase();
    const keyword = this.text(payload.keyword || payload.query || payload.receiverQuery);
    if (actorRole !== 'admin') return { recipients: [], forbidden: true };
    const allMode = ['all', 'ALL', '全部', '*'].includes(keyword);
    const binds = [actorId];
    let filterSql = '';
    if (!allMode) {
      const like = `%${keyword}%`;
      filterSql = 'AND (name LIKE ? OR phone LIKE ? OR line_id LIKE ? OR store_id LIKE ? OR industry LIKE ?)';
      binds.push(like, like, like, like, like);
    }
    const rows = await D1ReadModule.all(env, `
      SELECT *
      FROM users
      WHERE line_id <> ?
        AND ${this.activeRecipientSql()}
        ${filterSql}
      ORDER BY COALESCE(updated_at, created_at) DESC, row_id DESC
      LIMIT 500
    `, binds).catch(() => []);
    const seen = new Set();
    const recipients = [];
    for (const row of rows) {
      const userRow = this.recipientFromUserRow(row);
      if (!this.isActiveRecipient(userRow)) continue;
      const uid = this.text(userRow.line_id || userRow.row_id);
      if (!uid || uid === actorId || seen.has(uid)) continue;
      seen.add(uid);
      recipients.push(userRow);
    }
    return { recipients };
  },

  async sendRecipientGroup(payload, env, groupType) {
    const senderUserId = this.ownUserId(payload);
    const rawQuery = this.text(payload.receiverUserId || payload.receiverQuery || payload.keyword).replace(/^(owned|broadcast):/, '');
    const messageType = this.text(payload.messageType || payload.type, 'message');
    const title = this.text(payload.title);
    const body = this.text(payload.body || payload.content);
    const messageCost = 0;
    if (!senderUserId) return { success: false, error: 'Missing sender' };
    if (!rawQuery) return { success: false, error: 'Missing recipient query' };
    if (!title) return { success: false, error: 'Missing title' };
    if (!body) return { success: false, error: 'Missing body' };

    const summary = groupType === 'broadcast'
      ? await this.broadcastRecipientSummary({ ...payload, keyword: rawQuery }, env)
      : await this.ownedActiveRecipientSummary({ ...payload, keyword: rawQuery }, env);
    if (summary.forbidden) return { success: false, error: 'Access Denied: Admin only action' };
    let recipients = Array.isArray(summary.recipients) ? summary.recipients : [];
    const selectedIds = this.uniqueTextList(Array.isArray(payload.selectedUserIds)
      ? payload.selectedUserIds
      : this.text(payload.selectedUserIds).split(','));
    if (selectedIds.length) {
      const selectedSet = new Set(selectedIds);
      recipients = recipients.filter(row => {
        const ids = this.uniqueTextList([row.line_id, row.row_id, row.userId, row.user_id]);
        return ids.some(id => selectedSet.has(id));
      });
    }
    if (!recipients.length) return { success: false, error: 'No eligible recipients' };


    const sent = [];
    const failed = [];
    for (const row of recipients) {
      const receiverId = this.text(row.line_id || row.row_id);
      const result = await this.send({
        ...payload,
        receiverUserId: receiverId,
        receiverQuery: '',
        recipientMode: 'user',
        authenticatedRole: groupType === 'owned' ? 'admin' : payload.authenticatedRole,
        role: groupType === 'owned' ? 'admin' : payload.role,
        _skipCourseGroup: true,
        payload: {
          ...(payload.payload && typeof payload.payload === 'object' ? payload.payload : {}),
          groupType,
          groupQuery: rawQuery
        }
      }, env).catch(e => ({ success: false, error: e.message || String(e) }));
      if (result && result.success) {
        sent.push({ userId: receiverId, name: this.text(row.name, receiverId), messageId: result.data && result.data.messageId });
      } else {
        failed.push({ userId: receiverId, name: this.text(row.name, receiverId), error: result && result.error || 'send_failed' });
      }
    }

    if (!sent.length) return { success: false, error: failed[0] && failed[0].error || 'send_failed', data: { failed } };
    return {
      success: true,
      data: {
        groupType,
        groupQuery: rawQuery,
        sentCount: sent.length,
        failedCount: failed.length,
        totalCost: sent.length * messageCost,
        sent,
        failed
      }
    };
  },

  async searchRecipients(payload, env) {
    await this.ensure(env);
    const actorId = this.ownUserId(payload);
    const actorRole = this.text(payload.authenticatedRole || payload.role, 'user').toLowerCase();
    const actorNetwork = this.text(payload.authenticatedNetworkId || payload.networkId, 'admin');
    const keyword = this.text(payload.keyword || payload.query || payload.q);
    if (!actorId) return { success: false, error: 'Missing userId' };
    if (keyword.length < 2) return { success: true, data: [] };

    if (this.text(payload.recipientMode || payload.mode) === 'course') {
      const summary = await this.courseRecipientSummary({ ...payload, courseId: keyword }, env);
      if (!summary.activity) return { success: true, data: [] };
      const title = this.text(summary.activity.name || summary.activity.activity_name || summary.activity.title, keyword);
      return {
        success: true,
        data: [{
          type: 'course',
          userId: `course:${keyword}`,
          name: title,
          subtitle: `課程編號 ${keyword} / 可群發 ${summary.recipients.length} 位學員`,
          badge: `${summary.recipients.length} 位`
        }]
      };
    }

    if (this.text(payload.recipientMode || payload.mode) === 'owned') {
      const summary = await this.ownedActiveRecipientSummary({ ...payload, keyword }, env);
      if (this.text(payload.listMode) === 'select') {
        return {
          success: true,
          data: summary.recipients.map(row => ({
            type: 'owned-user',
            userId: this.text(row.line_id || row.row_id),
            name: this.text(row.name, '未命名'),
            phone: this.text(row.phone),
            industry: this.text(row.industry),
            subtitle: [this.text(row.phone), this.text(row.industry), this.text(row.network_id)].filter(Boolean).join(' / '),
            badge: '可收信'
          }))
        };
      }
      return {
        success: true,
        data: summary.recipients.length ? [{
          type: 'owned',
          userId: `owned:${keyword}`,
          name: '我的已使用客戶',
          subtitle: `符合 ${summary.recipients.length} 位，可群發給自己掃進來且已使用系統的客戶`,
          badge: `${summary.recipients.length} 位`
        }] : []
      };
    }

    if (this.text(payload.recipientMode || payload.mode) === 'broadcast') {
      const summary = await this.broadcastRecipientSummary({ ...payload, keyword }, env);
      if (summary.forbidden) return { success: false, error: 'Access Denied: Admin only action' };
      if (this.text(payload.listMode) === 'select') {
        return {
          success: true,
          data: summary.recipients.map(row => ({
            type: 'broadcast-user',
            userId: this.text(row.line_id || row.row_id),
            name: this.text(row.name, '未命名'),
            phone: this.text(row.phone),
            industry: this.text(row.industry),
            subtitle: [this.text(row.phone), this.text(row.industry), this.text(row.network_id)].filter(Boolean).join(' / '),
            badge: '可收信'
          }))
        };
      }
      return {
        success: true,
        data: summary.recipients.length ? [{
          type: 'broadcast',
          userId: `broadcast:${keyword}`,
          name: '跨區訊息',
          subtitle: `符合 ${summary.recipients.length} 位，僅 admin 可群發`,
          badge: `${summary.recipients.length} 位`
        }] : []
      };
    }

    const like = `%${keyword}%`;
    const binds = [actorId, like, like, like, like];
    let scopeSql = '';
    let excludeIds = [actorId];
    if (actorRole === 'admin') {
      scopeSql = '';
    } else if (actorRole === 'store') {
      const actorContext = await this.actorReachContext(payload, env);
      const actorIds = actorContext.actorIds.length ? actorContext.actorIds : [actorId];
      const actorReferrerIds = actorContext.actorReferrerIds;
      excludeIds = actorIds;
      const ownPlaceholders = this.placeholders(actorIds);
      const conditions = [
        `network_id IN (${ownPlaceholders})`,
        `referrer_id IN (${ownPlaceholders})`
      ];
      binds.push(...actorIds, ...actorIds);
      if (actorReferrerIds.length) {
        const referrerPlaceholders = this.placeholders(actorReferrerIds);
        conditions.push(`line_id IN (${referrerPlaceholders})`);
        conditions.push(`row_id IN (${referrerPlaceholders})`);
        conditions.push(`legacy_line_id IN (${referrerPlaceholders})`);
        conditions.push(`point_line_id IN (${referrerPlaceholders})`);
        binds.push(...actorReferrerIds, ...actorReferrerIds, ...actorReferrerIds, ...actorReferrerIds);
      }
      scopeSql = `AND (${conditions.join(' OR ')})`;
    } else {
      const actorContext = await this.actorReachContext(payload, env);
      const networkIds = actorContext.actorNetworkIds.length ? actorContext.actorNetworkIds : [actorNetwork];
      excludeIds = actorContext.actorIds.length ? actorContext.actorIds : [actorId];
      const networkPlaceholders = this.placeholders(networkIds);
      scopeSql = `AND (network_id IN (${networkPlaceholders}) OR referrer_id IN (${networkPlaceholders}))`;
      binds.push(...networkIds, ...networkIds);
    }

    const rows = await D1ReadModule.all(env, `
      SELECT *
      FROM users
      WHERE line_id <> ?
        AND (name LIKE ? OR phone LIKE ? OR line_id LIKE ? OR store_id LIKE ?)
        AND ${this.activeRecipientSql()}
        ${scopeSql}
      ORDER BY CASE WHEN name LIKE ? THEN 0 ELSE 1 END, row_id DESC
      LIMIT 20
    `, [...binds, like]).catch(() => []);

    return {
      success: true,
      data: rows.map(row => D1ReadModule.userRow(row)).filter(Boolean).filter(user => {
        const ids = this.uniqueTextList([user.userId, user.rowId, user.legacyLineId, user.pointLineId]);
        return !this.intersects(ids, excludeIds);
      }).map(user => ({
        userId: user.userId,
        name: user.name,
        phone: user.phone,
        industry: user.industry,
        role: user.role,
        roleLabel: user.roleLabel,
        networkId: user.networkId,
        canReceiveInbox: true
      }))
    };
  },

  activeRecipientSql() {
    return "TRIM(COALESCE(line_id,'')) <> '' AND TRIM(COALESCE(name,'')) NOT IN ('', '未命名', '待補資料') AND TRIM(COALESCE(phone,'')) <> ''";
  },

  isActiveRecipient(row) {
    const userId = this.text(row && (row.line_id || row.row_id));
    const name = this.text(row && row.name);
    const phone = this.text(row && row.phone);
    return !!userId && !!phone && !!name && !['未命名', '待補資料'].includes(name);
  },

  async canReachRecipient(payload, receiverRow, env) {
    const context = await this.actorReachContext(payload, env);
    const actorId = context.actorId;
    const actorRole = context.actorRole;
    const receiverIds = this.recipientIdentityValues(receiverRow);
    const receiverId = this.text(receiverIds[0]);
    const receiverNetwork = this.text(receiverRow && receiverRow.network_id, 'admin');
    const receiverReferrer = this.text(receiverRow && receiverRow.referrer_id);
    if (!actorId || !receiverId || this.intersects(receiverIds, context.actorIds)) return false;
    if (actorRole === 'admin') return true;
    if (actorRole === 'store') {
      return context.actorIds.includes(receiverNetwork)
        || context.actorIds.includes(receiverReferrer)
        || this.intersects(receiverIds, context.actorReferrerIds);
    }
    return context.actorNetworkIds.includes(receiverNetwork)
      || context.actorNetworkIds.includes(receiverReferrer)
      || this.intersects(receiverIds, context.actorReferrerIds);
  },

  async sendCourseGroup(payload, env) {
    const senderUserId = this.ownUserId(payload);
    const rawCourseId = this.text(payload.receiverUserId || payload.receiverQuery || payload.courseId || payload.activityId).replace(/^course:/, '');
    const messageType = this.text(payload.messageType || payload.type, 'message');
    const title = this.text(payload.title);
    const body = this.text(payload.body || payload.content);
    const messageCost = 0;
    if (!senderUserId) return { success: false, error: 'Missing sender' };
    if (!rawCourseId) return { success: false, error: '請貼上課程編號' };
    if (!title) return { success: false, error: '請輸入標題' };
    if (!body) return { success: false, error: '請輸入內容' };

    const summary = await this.courseRecipientSummary({ ...payload, courseId: rawCourseId }, env);
    if (!summary.activity) return { success: false, error: '找不到課程編號' };
    const recipients = Array.isArray(summary.recipients) ? summary.recipients : [];
    if (!recipients.length) return { success: false, error: '這個課程目前沒有可收信的已註冊學員' };


    const sent = [];
    const failed = [];
    for (const row of recipients) {
      const receiverId = this.text(row.line_id || row.row_id);
      const result = await this.send({
        ...payload,
        receiverUserId: receiverId,
        receiverQuery: '',
        recipientMode: 'user',
        _skipCourseGroup: true,
        payload: {
          ...(payload.payload && typeof payload.payload === 'object' ? payload.payload : {}),
          courseId: rawCourseId,
          courseTitle: this.text(summary.activity.name || summary.activity.activity_name || summary.activity.title, rawCourseId)
        }
      }, env).catch(e => ({ success: false, error: e.message || String(e) }));
      if (result && result.success) {
        sent.push({ userId: receiverId, name: this.text(row.name, receiverId), messageId: result.data && result.data.messageId });
      } else {
        failed.push({ userId: receiverId, name: this.text(row.name, receiverId), error: result && result.error || 'send_failed' });
      }
    }

    if (!sent.length) return { success: false, error: failed[0] && failed[0].error || '群發失敗', data: { failed } };
    return {
      success: true,
      data: {
        courseId: rawCourseId,
        sentCount: sent.length,
        failedCount: failed.length,
        totalCost: sent.length * messageCost,
        sent,
        failed
      }
    };
  },

  async send(payload, env) {
    await this.ensure(env);
    const senderUserId = this.ownUserId(payload);
    let receiverUserId = this.text(payload.receiverUserId || payload.receiver_user_id || payload.toUserId);
    if (!receiverUserId && this.text(payload.receiverQuery || payload.keyword)) {
      const found = await this.searchRecipients({ ...payload, keyword: payload.receiverQuery || payload.keyword }, env);
      receiverUserId = this.text(found && found.data && found.data[0] && found.data[0].userId);
    }
    if (!senderUserId) return { success: false, error: 'Missing sender' };
    if (!payload._skipCourseGroup && (this.text(payload.recipientMode || payload.mode) === 'course' || receiverUserId.startsWith('course:'))) {
      return await this.sendCourseGroup({ ...payload, receiverUserId }, env);
    }
    if (!payload._skipCourseGroup && (this.text(payload.recipientMode || payload.mode) === 'owned' || receiverUserId.startsWith('owned:'))) {
      return await this.sendRecipientGroup({ ...payload, receiverUserId }, env, 'owned');
    }
    if (!payload._skipCourseGroup && (this.text(payload.recipientMode || payload.mode) === 'broadcast' || receiverUserId.startsWith('broadcast:'))) {
      return await this.sendRecipientGroup({ ...payload, receiverUserId }, env, 'broadcast');
    }
    if (!receiverUserId) return { success: false, error: '請指定收件人' };
    if (receiverUserId === senderUserId) return { success: false, error: '不能寄給自己' };

    const receiver = await D1ReadModule.findUserByIdentity(env, receiverUserId).catch(() => null);
    if (!receiver || !receiver.user) return { success: false, error: '找不到收件人' };
    if (!this.isActiveRecipient(receiver.user)) return { success: false, error: '對方尚未完成會員註冊，無法接收站內訊息' };
    if (!await this.canReachRecipient(payload, receiver.user, env)) return { success: false, error: '收件人不在可傳送範圍內' };

    const title = this.text(payload.title, '新訊息');
    const body = this.text(payload.body || payload.content);
    const messageType = this.text(payload.messageType || payload.type, 'message');
    const senderCardId = this.text(payload.senderCardId || payload.sender_card_id);
    const context = await this.senderContext(env, senderUserId, senderCardId);
    const messageId = this.text(payload.messageId || payload.message_id) || `MSG_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const networkId = this.text(payload.networkId || payload.authenticatedNetworkId || receiver.user.network_id || 'admin', 'admin');
    const expiresAt = this.text(payload.expiresAt || payload.expires_at);
    const messageCost = 0;

    const pointPayload = { ...(payload.payload && typeof payload.payload === 'object' ? payload.payload : {}) };
    pointPayload.pointCharge = { pointType: 'gift_money', points: 0, status: 'free', messageType };
    if (messageType === 'coupon') {
      pointPayload.coupon = { status: 'issued', issuedAt: new Date().toISOString(), singleUse: true };
    }
    const payloadJson = JSON.stringify(pointPayload);

    await env.ACTMASTER_DB.prepare(`
      INSERT INTO inbox_items (
        message_id, receiver_user_id, sender_user_id, sender_card_id, network_id,
        message_type, title, body, payload_json, sender_snapshot_json, status,
        read_at, archived_at, expires_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unread', '', '', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).bind(
      messageId,
      D1ReadModule.text(receiver.canonicalId || receiver.user.line_id || receiver.user.row_id, receiverUserId),
      senderUserId,
      this.text(context.snapshot && context.snapshot.cardId, senderCardId),
      networkId,
      messageType,
      title,
      body,
      payloadJson,
      JSON.stringify(context.snapshot || {}),
      expiresAt
    ).run();



    await WebPushModule.notifyUser(receiverUserId, {
      title: '你有一封新訊息',
      body: `${this.text(context.snapshot && context.snapshot.name, '會員')} 傳送了 ${this.text(messageType, 'message')}`,
      url: '/LINE-/?open=inbox'
    }, env).catch(() => null);

    const row = await D1ReadModule.first(env, 'SELECT * FROM inbox_items WHERE message_id = ? LIMIT 1', [messageId]);
    return { success: true, data: this.itemRow(row, context) };
  }
};

const WebPushModule = {
  text(value, fallback = '') {
    const next = String(value ?? '').trim();
    return next || fallback;
  },

  base64Url(input) {
    let bytes;
    if (typeof input === 'string') bytes = new TextEncoder().encode(input);
    else bytes = new Uint8Array(input);
    let binary = '';
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  },

  base64UrlToBytes(value) {
    const text = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    const padded = text + '='.repeat((4 - text.length % 4) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  },

  async ensure(env) {
    await env.ACTMASTER_DB.prepare(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        endpoint TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        p256dh TEXT NOT NULL DEFAULT '',
        auth TEXT NOT NULL DEFAULT '',
        user_agent TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id, status, updated_at)').run();
  },

  async config(payload, env) {
    const publicKey = this.text(env.VAPID_PUBLIC_KEY);
    return {
      success: true,
      data: {
        enabled: !!publicKey,
        publicKey,
        reason: publicKey ? '' : '尚未設定 VAPID_PUBLIC_KEY'
      }
    };
  },

  async save(payload, env, request) {
    await this.ensure(env);
    const userId = this.text(payload.authenticatedUserId || payload.userId);
    const subscription = payload.subscription && typeof payload.subscription === 'object' ? payload.subscription : payload;
    const endpoint = this.text(subscription.endpoint);
    const keys = subscription.keys && typeof subscription.keys === 'object' ? subscription.keys : {};
    if (!userId || !endpoint) return { success: false, error: 'Missing push subscription' };
    await env.ACTMASTER_DB.prepare(`
      INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, user_agent, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(endpoint) DO UPDATE SET
        user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent,
        status = 'active',
        updated_at = CURRENT_TIMESTAMP
    `).bind(
      endpoint,
      userId,
      this.text(keys.p256dh),
      this.text(keys.auth),
      this.text(payload.userAgent || (request && request.headers.get('user-agent')))
    ).run();
    return { success: true, data: { endpoint, status: 'active' } };
  },

  async remove(payload, env) {
    await this.ensure(env);
    const userId = this.text(payload.authenticatedUserId || payload.userId);
    const endpoint = this.text(payload.endpoint || (payload.subscription && payload.subscription.endpoint));
    if (!userId || !endpoint) return { success: false, error: 'Missing push subscription' };
    await env.ACTMASTER_DB.prepare(`
      UPDATE push_subscriptions
      SET status = 'deleted', updated_at = CURRENT_TIMESTAMP
      WHERE endpoint = ? AND user_id = ?
    `).bind(endpoint, userId).run();
    return { success: true, data: { endpoint, status: 'deleted' } };
  },

  publicKeyParts(publicKey) {
    const bytes = this.base64UrlToBytes(publicKey);
    if (bytes.length !== 65 || bytes[0] !== 4) throw new Error('Invalid VAPID public key');
    return {
      x: this.base64Url(bytes.slice(1, 33)),
      y: this.base64Url(bytes.slice(33, 65))
    };
  },

  async privateKey(env) {
    const publicKey = this.text(env.VAPID_PUBLIC_KEY);
    const rawPrivate = this.text(env.VAPID_PRIVATE_KEY);
    const privateJwkText = this.text(env.VAPID_PRIVATE_JWK);
    if (privateJwkText) {
      return JSON.parse(privateJwkText);
    }
    if (!publicKey || !rawPrivate) throw new Error('Missing VAPID keys');
    const parts = this.publicKeyParts(publicKey);
    return { kty: 'EC', crv: 'P-256', x: parts.x, y: parts.y, d: rawPrivate, ext: true };
  },

  ecdsaSignatureToJose(signature) {
    const bytes = new Uint8Array(signature);
    if (bytes.length === 64) return this.base64Url(bytes);
    let offset = 0;
    if (bytes[offset++] !== 0x30) throw new Error('Invalid ECDSA signature');
    let seqLen = bytes[offset++];
    if (seqLen & 0x80) offset += (seqLen & 0x7f);
    if (bytes[offset++] !== 0x02) throw new Error('Invalid ECDSA signature');
    const rLen = bytes[offset++];
    let r = bytes.slice(offset, offset + rLen);
    offset += rLen;
    if (bytes[offset++] !== 0x02) throw new Error('Invalid ECDSA signature');
    const sLen = bytes[offset++];
    let s = bytes.slice(offset, offset + sLen);
    const normalize = part => {
      let start = 0;
      while (start < part.length - 1 && part[start] === 0) start++;
      part = part.slice(start);
      if (part.length > 32) part = part.slice(part.length - 32);
      const out = new Uint8Array(32);
      out.set(part, 32 - part.length);
      return out;
    };
    const out = new Uint8Array(64);
    out.set(normalize(r), 0);
    out.set(normalize(s), 32);
    return this.base64Url(out);
  },

  async vapidJwt(endpoint, env) {
    const aud = new URL(endpoint).origin;
    const exp = Math.floor(Date.now() / 1000) + 12 * 60 * 60;
    const sub = this.text(env.VAPID_SUBJECT, 'mailto:Fangwl591021@gmail.com');
    const header = this.base64Url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
    const body = this.base64Url(JSON.stringify({ aud, exp, sub }));
    const signingInput = `${header}.${body}`;
    const key = await crypto.subtle.importKey(
      'jwk',
      await this.privateKey(env),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      new TextEncoder().encode(signingInput)
    );
    return `${signingInput}.${this.ecdsaSignatureToJose(signature)}`;
  },

  async send(subscription, env) {
    const publicKey = this.text(env.VAPID_PUBLIC_KEY);
    const endpoint = this.text(subscription && subscription.endpoint);
    if (!publicKey || !endpoint) return { ok: false, skipped: true };
    const jwt = await this.vapidJwt(endpoint, env);
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        TTL: '120',
        Urgency: 'normal',
        Authorization: `vapid t=${jwt}, k=${publicKey}`
      }
    });
    return { ok: res.ok, status: res.status, text: res.ok ? '' : await res.text().catch(() => '') };
  },

  async notifyUser(userId, message, env) {
    await this.ensure(env);
    if (!this.text(env.VAPID_PUBLIC_KEY) || (!this.text(env.VAPID_PRIVATE_KEY) && !this.text(env.VAPID_PRIVATE_JWK))) {
      return { success: false, skipped: true, error: 'Missing VAPID keys' };
    }
    const ids = await D1InboxModule.identityIds(env, userId);
    const rows = await D1ReadModule.all(env, `
      SELECT *
      FROM push_subscriptions
      WHERE user_id IN (${D1InboxModule.placeholders(ids)}) AND status = 'active'
      ORDER BY updated_at DESC
      LIMIT 10
    `, ids).catch(() => []);
    let sent = 0;
    for (const row of rows) {
      const result = await this.send(row, env).catch(err => ({ ok: false, status: 0, text: String(err && err.message || err) }));
      if (result.ok) {
        sent++;
      } else if (result.status === 404 || result.status === 410) {
        await env.ACTMASTER_DB.prepare(`
          UPDATE push_subscriptions SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE endpoint = ?
        `).bind(row.endpoint).run().catch(() => null);
      }
    }
    return { success: true, data: { sent, total: rows.length } };
  }
};

const AuthModule = {
  getCardLineId(card) {
    return String((card && (card['LINE ID'] || card.lineId || card.userId)) || '').trim();
  },

  buildProfileFromBoundCard(card, userId) {
    const rawName = String(card['姓名'] || card['英文名'] || '').trim();
    const company = String(card['公司名稱'] || '').trim();
    const title = String(card['職稱'] || '').trim();
    const phone = String(card['手機號碼'] || card['公司電話'] || '').trim();
    if (!(rawName || phone || company || title)) return null;
    return {
      userId,
      name: rawName || '待補資料',
      phone,
      industry: title || company || '',
      birthday: '',
      role: 'user',
      networkId: String(card['歸屬網'] || 'admin').trim(),
      claimedCardRowId: card.rowId || '',
      companyName: company,
      title,
      profileStatus: phone ? 'active' : 'bound_card',
      source: 'bound_card'
    };
  },

  async ensureBoundCardUser(userId, env) {
    const cardsResult = await DBModule.forward('getCardContacts', { role: 'admin', networkId: 'admin' }, env);
    const cards = cardsResult && Array.isArray(cardsResult.data) ? cardsResult.data : (Array.isArray(cardsResult) ? cardsResult : []);
    const card = cards.find(c => this.getCardLineId(c) === userId);
    if (!card) return null;

    const profile = this.buildProfileFromBoundCard(card, userId);
    if (!profile) return null;
    const result = await DBModule.forward('registerUser', profile, env);
    if (!result || !result.success) return null;
    if (env.ACTMASTER_KV) {
      try {
        await env.ACTMASTER_KV.delete(`U_PROFILE_${userId}`);
        await env.ACTMASTER_KV.put(`U_PROFILE_${userId}`, JSON.stringify(profile), { expirationTtl: 600 });
      } catch (e) { console.error("KV Write Error", e); }
    }
    return profile;
  },

  async getAllUsersWithBoundCards(payload, env) {
    try {
      const d1Result = await D1ReadModule.getAllUsers(payload || {}, env);
      if (d1Result && d1Result.success && Array.isArray(d1Result.data)) return d1Result;
    } catch (e) {
      console.error("D1 getAllUsers fallback", e);
    }

    const usersResult = await DBModule.forward('getAllUsers', payload, env);
    const cardsResult = await DBModule.forward('getCardContacts', { ...payload, role: 'admin', networkId: payload.networkId || 'admin' }, env);
    const users = usersResult && Array.isArray(usersResult.data) ? usersResult.data : (Array.isArray(usersResult) ? usersResult : []);
    const cards = cardsResult && Array.isArray(cardsResult.data) ? cardsResult.data : (Array.isArray(cardsResult) ? cardsResult : []);
    const seen = new Set(users.map(u => String(u.userId || '').trim()).filter(Boolean));
    const merged = [...users];

    cards.forEach(card => {
      const userId = this.getCardLineId(card);
      if (!userId || seen.has(userId)) return;
      const profile = this.buildProfileFromBoundCard(card, userId);
      if (!profile) return;
      seen.add(userId);
      merged.push(profile);
    });

    return { success: true, data: merged };
  },

  async check(payload, env) {
    const userId = payload.userId;
    if (!userId) return { success: false, error: "Missing userId" };

    try {
      const d1Result = await D1ReadModule.checkUser(payload || {}, env);
      if (d1Result && d1Result.success && d1Result.data && d1Result.data.isRegistered) return d1Result;
    } catch (e) {
      console.error("D1 checkUser fallback", e);
    }

    if (env.ACTMASTER_KV) {
      try {
        // 🚨 修正：變更 Cache Key 前綴，瞬間作廢所有舊記憶
        const cached = await env.ACTMASTER_KV.get(`U_PROFILE_${userId}`, 'json');
        if (cached) {
          cached.role = SecurityModule.sanitizeRole(userId, cached.role, cached);
          return { success: true, data: { isRegistered: true, info: cached } };
        }
      } catch (e) { console.error("KV Read Error", e); }
    }

    if (env.ACTMASTER_DB) {
      try {
        const user = await D1ReadModule.first(env, `
          SELECT * FROM users
          WHERE line_id = ? OR row_id = ? OR point_line_id = ? OR legacy_line_id = ?
          LIMIT 1
        `, [userId, userId, userId, userId]);
        if (user) {
          const profile = D1ReadModule.userRow(user);
          if (profile) {
            profile.requestedUserId = userId;
            profile.canonicalUserId = profile.pointLineId || profile.lineId || profile.userId;
            if (env.ACTMASTER_KV) {
              try {
                await env.ACTMASTER_KV.put(`U_PROFILE_${userId}`, JSON.stringify(profile), { expirationTtl: 600 });
              } catch (e) { console.error("KV Write Error", e); }
            }
            return { success: true, data: { isRegistered: true, info: profile, source: 'd1_direct_user' } };
          }
        }
      } catch (e) {
        console.error("D1 direct checkUser failed", e && e.message ? e.message : e);
      }
    }

    const result = { success: true, data: { isRegistered: false, info: null, source: 'd1_no_user' } };

    if (result && result.success && result.data && result.data.isRegistered && env.ACTMASTER_KV) {
      try {
        // 🚨 修正：縮短快取為 600 秒 (10 分鐘)，避免資料庫變更卡住
        await env.ACTMASTER_KV.put(`U_PROFILE_${userId}`, JSON.stringify(result.data.info), { expirationTtl: 600 });
      } catch (e) { console.error("KV Write Error", e); }
    }

    if (!result || result.success === false || !result.data || !result.data.isRegistered) {
      const boundProfile = null;
      if (boundProfile) {
        return { success: true, data: { isRegistered: true, info: boundProfile, source: 'bound_card' } };
      }
    }
    return result;
  },

  async updateAndClearCache(action, payload, env) {
    const forwardPayload = { ...payload };
    if (action === 'updateUserRole' && payload.targetUserId) {
      forwardPayload.userId = payload.targetUserId;
      forwardPayload.role = payload.newRole || payload.targetRole || payload.permission || payload.role;
      forwardPayload.operatorId = payload.operatorId || payload.authUserId || payload.userId || '';
    }

    const result = await DBModule.forward(action, forwardPayload, env);

    if (result && result.success && env.ACTMASTER_KV) {
      try {
        let targetUserId = null;
        if (action === 'updateUserRole') {
          targetUserId = payload.targetUserId || payload.userId;
        } else if (action === 'registerUser' || action === 'updateUserProfile') {
          targetUserId = payload.userId;
        }

        if (targetUserId) {
          // 🚨 修正：連帶修改清除指令的前綴
          await env.ACTMASTER_KV.delete(`U_PROFILE_${targetUserId}`);
        }
      } catch(e) { console.error("KV Delete Error", e); }
    }
    return result;
  },

  async adminSyncBoundCardUser(payload, env) {
    const profile = payload.profile || {};
    const targetUserId = payload.targetUserId || profile.userId;
    if (!targetUserId) return { success: false, error: "Missing targetUserId" };

    const nextProfile = {
      ...profile,
      userId: targetUserId,
      role: profile.role || 'user',
      profileStatus: profile.profileStatus || 'incomplete',
      source: profile.source || 'bound_card'
    };

    const result = await DBModule.forward('registerUser', nextProfile, env);
    if (result && result.success && env.ACTMASTER_KV) {
      try {
        await env.ACTMASTER_KV.delete(`U_PROFILE_${targetUserId}`);
      } catch(e) { console.error("KV Delete Error", e); }
    }
    return result;
  }
};

const ClaimModule = {
  text(value, fallback = '') {
    const next = String(value ?? '').trim();
    return next || fallback;
  },

  cleanText(value, fallback = '') {
    const next = String(value ?? '')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .trim();
    return next || fallback;
  },

  pick(payload, keys, fallback = '') {
    for (const key of keys) {
      const value = payload && payload[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
    }
    return fallback;
  },

  async getCardForClaim(payload, env) {
    const rowId = this.pick(payload, ['claimRowId', 'rowId', 'cardId', 'claim']);
    if (!rowId) return { success: false, error: 'Missing claimRowId' };
    await D1ReadModule.ensureCardAccessColumns(env);
    const card = await D1ReadModule.first(env, 'SELECT * FROM card_contacts WHERE row_id = ? LIMIT 1', [rowId]);
    if (!card) return { success: false, error: 'Card not found' };
    return { success: true, data: D1ReadModule.cardRow(card) };
  },

  async claimCardAndRegister(payload, env) {
    const rowId = this.pick(payload, ['claimRowId', 'rowId', 'cardId', 'claim']);
    const userId = this.pick(payload, ['authenticatedUserId', 'userId', 'lineId']);
    if (!rowId || !userId) return { success: false, error: 'Missing claimRowId or userId' };

    await D1ReadModule.ensureCardAccessColumns(env);
    const card = await D1ReadModule.first(env, 'SELECT * FROM card_contacts WHERE row_id = ? LIMIT 1', [rowId]);
    if (!card) return { success: false, error: 'Card not found' };
    const existingOwner = this.text(card.line_id);
    if (existingOwner && existingOwner !== userId) return { success: false, error: 'Card already claimed by another user' };
    const existingProfile = this.text(card.profile_user_id);
    if (existingProfile && existingProfile !== userId && existingOwner !== userId) {
      return { success: false, error: 'Card already claimed by another user' };
    }

    const networkId = this.pick(payload, ['networkId', 'network_id'], this.text(card.network_id, 'admin'));
    await env.ACTMASTER_DB.prepare(`
      UPDATE card_contacts
      SET line_id = ?, profile_user_id = ?, owner_user_id = ?, creator_id = ?, network_id = ?,
          source_type = 'self_profile',
          visibility = 'private', pool_eligible = 0,
          notes = CASE
            WHEN INSTR(COALESCE(notes,''), '已由本人認領') > 0 THEN notes
            WHEN TRIM(COALESCE(notes,'')) = '' THEN '已由本人認領為專屬名片'
            ELSE notes || '；已由本人認領為專屬名片'
          END,
          updated_at = CURRENT_TIMESTAMP
      WHERE row_id = ?
    `).bind(userId, userId, userId, userId, networkId, rowId).run();

    const profile = {
      userId,
      name: this.pick(payload, ['name', '姓名', '憪?'], this.text(card.name, userId)),
      phone: this.pick(payload, ['phone', '手機號碼', '???Ⅳ'], this.text(card.mobile || card.office_phone)),
      industry: this.pick(payload, ['industry', 'title', '職稱', '?瑞迂'], this.text(card.title || card.company_name)),
      companyName: this.pick(payload, ['companyName', 'company', '公司名稱', '?砍?迂'], this.text(card.company_name)),
      title: this.pick(payload, ['title', '職稱', '?瑞迂'], this.text(card.title)),
      networkId,
      referrerId: this.pick(payload, ['referrerId', '推薦人', '?刻鈭?']),
      claimedCardRowId: rowId,
      profileStatus: 'bound_card',
      source: 'claim_link'
    };

    const userResult = await D1WriteModule.upsertUser(profile, env);
    const pointWallet = await PointModule.ensureSubsitePointWalletOnJoin({
      ...payload,
      ...profile,
      userId
    }, env).catch(e => ({ success: false, error: e && e.message ? e.message : String(e) }));
    const shareJoinAward = await PointModule.awardShareJoinPoints({
      ...payload,
      ...profile,
      userId,
      sourceRef: rowId
    }, env).catch(e => ({ success: false, error: e && e.message ? e.message : String(e) }));
    if (env.ACTMASTER_KV) {
      try { await env.ACTMASTER_KV.delete(`U_PROFILE_${userId}`); } catch (e) {}
    }
    const updatedCard = await D1ReadModule.first(env, 'SELECT * FROM card_contacts WHERE row_id = ? LIMIT 1', [rowId]);
    return {
      success: true,
      data: {
        claimed: true,
        rowId,
        userId,
        card: D1ReadModule.cardRow(updatedCard || card),
        user: userResult && userResult.data ? userResult.data : profile,
        pointWallet,
        shareJoinAward
      }
    };
  }
};

const TrackingModule = {
  text(value, fallback = '') {
    const next = String(value ?? '').trim();
    return next || fallback;
  },

  todayKey() {
    return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  },

  async ensureSocialLikeTable(env) {
    if (!env.ACTMASTER_DB) return false;
    await env.ACTMASTER_DB.prepare(`
      CREATE TABLE IF NOT EXISTS card_social_likes (
        like_id TEXT PRIMARY KEY,
        card_id TEXT NOT NULL,
        owner_user_id TEXT NOT NULL DEFAULT '',
        liker_user_id TEXT NOT NULL,
        like_date TEXT NOT NULL,
        reward_marker INTEGER NOT NULL DEFAULT 4,
        owner_award_status TEXT NOT NULL DEFAULT 'pending',
        liker_award_status TEXT NOT NULL DEFAULT 'pending',
        response_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    await env.ACTMASTER_DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_card_social_likes_daily ON card_social_likes(card_id, liker_user_id, like_date)').run();
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_card_social_likes_card ON card_social_likes(card_id, created_at)').run();
    return true;
  },

  async findSocialLikeCard(cardId, env) {
    const id = this.text(cardId);
    if (!id || !env.ACTMASTER_DB) return null;
    return await D1ReadModule.first(env, 'SELECT * FROM card_contacts WHERE row_id = ? LIMIT 1', [id]).catch(() => null);
  },

  socialLikeOwnerIdFromRow(row) {
    if (!row) return '';
    return this.text(row.line_id || row.owner_user_id || row.profile_user_id || row.creator_id);
  },

  async resolveSocialLikeCardId(cardId, env) {
    const requestedId = this.text(cardId);
    if (!requestedId || !env.ACTMASTER_DB) return requestedId;
    const row = await this.findSocialLikeCard(requestedId, env);
    if (!row) return requestedId;
    const ownerUserId = this.socialLikeOwnerIdFromRow(row);
    if (!ownerUserId) return requestedId;
    const baseRow = await D1ReadModule.first(env, `
      SELECT * FROM card_contacts
      WHERE (line_id = ? OR owner_user_id = ? OR profile_user_id = ? OR creator_id = ?)
        AND LOWER(COALESCE(source_type, '')) = 'self_profile'
        AND row_id LIKE 'CARD_%'
        AND row_id NOT LIKE 'CARD_VIDEO_%'
        AND LOWER(COALESCE(custom_config,'')) NOT LIKE '%"cardversion":"video"%'
        AND LOWER(COALESCE(custom_config,'')) NOT LIKE '%"cardvariant":"video_card"%'
        AND LOWER(COALESCE(custom_config,'')) NOT LIKE '%"videostoragekind":"dedicated_video_card"%'
      ORDER BY
        CASE
          WHEN row_id LIKE 'CARD_STD_%' THEN 0
          WHEN LOWER(COALESCE(custom_config,'')) LIKE '%"cardversion":"standard"%' THEN 1
          ELSE 2
        END,
        COALESCE(updated_at, created_at) DESC,
        row_id DESC
      LIMIT 1
    `, [ownerUserId, ownerUserId, ownerUserId, ownerUserId]).catch(() => null);
    return this.text(baseRow && baseRow.row_id) || requestedId;
  },

  async socialLikeSiblingCardIds(cardId, env) {
    const requestedId = this.text(cardId);
    const ids = new Set([requestedId].filter(Boolean));
    if (!requestedId || !env.ACTMASTER_DB) return [...ids];
    const row = await this.findSocialLikeCard(requestedId, env);
    const ownerUserId = this.socialLikeOwnerIdFromRow(row);
    if (!ownerUserId) return [...ids];
    const rows = await D1ReadModule.all(env, `
      SELECT row_id FROM card_contacts
      WHERE (line_id = ? OR owner_user_id = ? OR profile_user_id = ? OR creator_id = ?)
        AND LOWER(COALESCE(source_type, '')) IN ('self_profile', 'video_profile')
        AND row_id LIKE 'CARD_%'
    `, [ownerUserId, ownerUserId, ownerUserId, ownerUserId]).catch(() => []);
    for (const item of rows || []) {
      const rowId = this.text(item && item.row_id);
      if (rowId) ids.add(rowId);
    }
    const canonicalId = await this.resolveSocialLikeCardId(requestedId, env).catch(() => requestedId);
    if (canonicalId) ids.add(canonicalId);
    return [...ids];
  },

  async getSocialLikeStats(payload, env) {
    const cardId = this.text(payload.shareCardId || payload.cardId || payload.rowId);
    const viewerId = this.text(payload.authenticatedUserId || payload.userId || payload.visitorId || payload.likerUserId);
    if (!cardId) return { success: false, error: 'Missing card id' };
    if (!await this.ensureSocialLikeTable(env)) return { success: false, error: 'Missing ACTMASTER_DB' };

    const likeCardId = await this.resolveSocialLikeCardId(cardId, env);
    const siblingIds = await this.socialLikeSiblingCardIds(cardId, env);
    const placeholders = siblingIds.map(() => '?').join(',');
    const totalRow = await D1ReadModule.first(env, `
      SELECT COUNT(*) AS total FROM (
        SELECT liker_user_id, like_date
        FROM card_social_likes
        WHERE card_id IN (${placeholders})
        GROUP BY liker_user_id, like_date
      )
    `, siblingIds).catch(() => null);
    const today = this.todayKey();
    let likedToday = false;
    if (viewerId) {
      const row = await D1ReadModule.first(env, `
        SELECT like_id FROM card_social_likes
        WHERE card_id IN (${placeholders}) AND liker_user_id = ? AND like_date = ?
        LIMIT 1
      `, [...siblingIds, viewerId, today]).catch(() => null);
      likedToday = !!row;
    }
    return {
      success: true,
      data: {
        cardId: likeCardId,
        requestedCardId: cardId,
        totalLikes: Number(totalRow && totalRow.total || 0),
        likedToday,
        rewardMarker: 4,
        dailyRewardLimit: true,
        dateKey: today
      }
    };
  },
  async findSocialLikeCardOwner(cardId, env) {
    const row = await D1ReadModule.first(env, 'SELECT * FROM card_contacts WHERE row_id = ? LIMIT 1', [cardId]).catch(() => null);
    const card = row ? D1ReadModule.cardRow(row) : null;
    if (!card) return { card: null, ownerUserId: '' };
    const ownerUserId = this.text(card.lineId || card.ownerUserId || card.profileUserId || card.creatorId || row.line_id || row.creator_id);
    return { card, ownerUserId };
  },

  async hasRegisteredUser(userId, env) {
    const id = this.text(userId);
    if (!id || !env.ACTMASTER_DB) return false;
    const row = await D1ReadModule.first(env, `
      SELECT row_id FROM users
      WHERE line_id = ? OR row_id = ? OR point_line_id = ? OR legacy_line_id = ?
      LIMIT 1
    `, [id, id, id, id]).catch(() => null);
    return !!row;
  },

  async awardSocialLikePoints(payload, env) {
    const recipientId = this.text(payload.recipientId);
    const cardId = this.text(payload.cardId);
    const likerId = this.text(payload.likerId);
    const dateKey = this.text(payload.dateKey);
    const awardType = this.text(payload.awardType);
    const role = this.text(payload.role);
    if (!recipientId || !cardId || !likerId || !dateKey || !awardType) {
      return { success: false, skipped: true, error: 'Missing social like award context' };
    }

    await PointModule.ensureAwardTable(env);
    const awardCardId = `${cardId}:${likerId}:${dateKey}`;
    const awardId = `${awardType}_${dateKey}_${cardId}_${likerId}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 180);
    const existing = await D1ReadModule.first(env, `
      SELECT * FROM point_awards
      WHERE user_id = ? AND card_id = ? AND award_type = ?
      LIMIT 1
    `, [recipientId, awardCardId, awardType]).catch(() => null);
    if (existing && ['sent', 'local_sent'].includes(this.text(existing.status))) {
      return { success: true, skipped: true, status: this.text(existing.status), existing };
    }
    if (!existing) {
      await env.ACTMASTER_DB.prepare(`
        INSERT OR IGNORE INTO point_awards (award_id,user_id,card_id,award_type,points,point_type,status,response_json,updated_at)
        VALUES (?, ?, ?, ?, 10, 'gift_money', 'pending', '{}', CURRENT_TIMESTAMP)
      `).bind(awardId, recipientId, awardCardId, awardType).run();
    }

    const remark = `marker=4;source=social_like;role=${role};cardId=${cardId};liker=${likerId};date=${dateKey}`;
    const motherResult = await PointModule.insertUserPoint({
      LINE_user_id: recipientId,
      points: 10,
      pointType: 'gift_money',
      eventName: '社群按讚獎勵',
      eventContent: role === 'liker' ? '按讚支持名片獎勵' : '名片獲得社群按讚獎勵',
      shop_remark: remark
    }, env);

    let finalStatus = motherResult && motherResult.success ? 'sent' : 'failed';
    let finalResult = motherResult;
    if (finalStatus === 'failed' && env.ACTMASTER_DB) {
      const localResult = await AdminPointModule.adjust({
        authenticatedUserId: 'system',
        targetUserId: recipientId,
        mode: 'grant',
        points: 10,
        note: remark
      }, env).catch(e => ({ success: false, error: e && e.message ? e.message : String(e) }));
      if (localResult && localResult.success) {
        finalStatus = 'local_sent';
        finalResult = { success: true, local: true, data: localResult };
      } else {
        finalResult = { success: false, mother: motherResult, local: localResult };
      }
    }

    await env.ACTMASTER_DB.prepare(`
      UPDATE point_awards
      SET status = ?, response_json = ?, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND card_id = ? AND award_type = ?
    `).bind(finalStatus, JSON.stringify(finalResult || {}), recipientId, awardCardId, awardType).run();
    return { success: finalStatus === 'sent' || finalStatus === 'local_sent', status: finalStatus, result: finalResult };
  },

  async recordSocialLike(payload, env) {
    const likerId = this.text(payload.authenticatedUserId || payload.userId || payload.visitorId || payload.likerUserId);
    const cardId = this.text(payload.shareCardId || payload.cardId || payload.rowId);
    const networkId = this.text(payload.networkId, 'admin');
    if (!likerId || !cardId) return { success: false, error: 'Missing likerUserId or cardId' };
    if (!await this.ensureSocialLikeTable(env)) return { success: false, error: 'Missing ACTMASTER_DB' };

    const likeCardId = await this.resolveSocialLikeCardId(cardId, env);
    if (likeCardId !== cardId) {
      await env.ACTMASTER_DB.prepare('UPDATE OR IGNORE card_social_likes SET card_id = ? WHERE card_id = ?').bind(likeCardId, cardId).run().catch(() => null);
    }
    const { ownerUserId } = await this.findSocialLikeCardOwner(likeCardId, env);
    if (ownerUserId && ownerUserId === likerId) {
      return { success: false, error: '不能對自己的名片按讚' };
    }

    const dateKey = this.todayKey();
    const likeId = `CSL_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const inserted = await env.ACTMASTER_DB.prepare(`
      INSERT OR IGNORE INTO card_social_likes (
        like_id, card_id, owner_user_id, liker_user_id, like_date, reward_marker, response_json
      ) VALUES (?, ?, ?, ?, ?, 4, ?)
    `).bind(likeId, likeCardId, ownerUserId, likerId, dateKey, JSON.stringify({ networkId, requestedCardId: cardId })).run();
    const changed = Number(inserted && inserted.meta && inserted.meta.changes || 0);
    if (!changed) {
      const stats = await this.getSocialLikeStats({ cardId: likeCardId, userId: likerId }, env);
      return { success: true, data: { ...(stats.data || {}), alreadyLikedToday: true, awarded: false } };
    }

    const awards = {};
    if (ownerUserId) {
      awards.owner = await this.awardSocialLikePoints({
        recipientId: ownerUserId,
        cardId: likeCardId,
        likerId,
        dateKey,
        awardType: 'social_like_owner',
        role: 'owner'
      }, env);
    } else {
      awards.owner = { success: false, skipped: true, reason: 'missing_card_owner' };
    }

    if (await this.hasRegisteredUser(likerId, env)) {
      awards.liker = await this.awardSocialLikePoints({
        recipientId: likerId,
        cardId: likeCardId,
        likerId,
        dateKey,
        awardType: 'social_like_liker',
        role: 'liker'
      }, env);
    } else {
      awards.liker = { success: false, skipped: true, reason: 'liker_not_registered' };
    }

    await env.ACTMASTER_DB.prepare(`
      UPDATE card_social_likes
      SET owner_award_status = ?, liker_award_status = ?, response_json = ?
      WHERE like_id = ?
    `).bind(
      this.text(awards.owner && awards.owner.status, awards.owner && awards.owner.success ? 'sent' : 'skipped'),
      this.text(awards.liker && awards.liker.status, awards.liker && awards.liker.success ? 'sent' : 'skipped'),
      JSON.stringify({ networkId, awards }),
      likeId
    ).run();

    const stats = await this.getSocialLikeStats({ cardId: likeCardId, userId: likerId }, env);
    return {
      success: true,
      data: {
        ...(stats.data || {}),
        likeId,
        requestedCardId: cardId,
        awarded: true,
        awards
      }
    };
  },

  async recordShareCardVisit(payload, env) {
    const visitorId = payload.visitorId || payload.userId;
    const shareCardId = payload.shareCardId || '';
    const referrerId = payload.referrerId || '';
    const networkId = payload.networkId || 'admin';

    if (!visitorId || !shareCardId) {
      return { success: false, error: 'Missing visitorId or shareCardId' };
    }
    if (referrerId && referrerId === visitorId) {
      return { success: true, data: { skipped: true, reason: 'self_referral' } };
    }

    if (env.ACTMASTER_DB && referrerId && visitorId) {
      await D1WriteModule.upsertUser({
        userId: visitorId,
        name: payload.displayName || payload.name || '',
        pictureUrl: payload.pictureUrl || payload.picture_url || '',
        referrerId,
        networkId,
        source: 'share_visit',
        profileStatus: 'line_authorized'
      }, env).catch(e => {
        console.error('D1 share visit placeholder failed', e && e.message ? e.message : e);
      });
    }

    const key = `FIRST_SHARE_TOUCH_${visitorId}`;
    if (env.ACTMASTER_KV) {
      const existing = await env.ACTMASTER_KV.get(key, 'json');
      if (existing) {
        return { success: true, data: { skipped: true, existing } };
      }
    }

    const record = {
      visitorId,
      shareCardId,
      referrerId,
      networkId,
      firstTouchOnly: true,
      touchedAt: new Date().toISOString()
    };

    const result = await DBModule.forward('recordShareCardVisit', record, env);

    if (env.ACTMASTER_KV && (!result || result.success !== false)) {
      await env.ACTMASTER_KV.put(key, JSON.stringify(record), { expirationTtl: 60 * 60 * 24 * 365 });
    }

    return result && result.success !== undefined
      ? result
      : { success: true, data: record };
  }
};

const BONUS_POLICY_TYPE = 'left_right_independent_split';

const BonusPolicyModule = {
  getPolicy(payload = {}) {
    const bv = Number(payload.bv || payload.bonusBV || payload.bonusAmount || 3000);
    const splitBonus = Number(payload.bonusPolicy?.splitBonus || payload.splitBonus || Math.floor(bv / 2));
    return {
      type: BONUS_POLICY_TYPE,
      grossAmount: Number(payload.grossAmount || payload.price || payload.fee || payload.amount || 6300),
      bv,
      directFullBonus: Number(payload.bonusPolicy?.directFullBonus || payload.bonusPolicy?.independentBonus || payload.directFullBonus || bv),
      directSplitBonus: splitBonus,
      sponsorSplitBonus: Number(payload.bonusPolicy?.sponsorSplitBonus || payload.sponsorSplitBonus || (bv - splitBonus)),
      renewalReferralBonus: Number(payload.bonusPolicy?.renewalReferralBonus || payload.renewalReferralBonus || splitBonus),
      renewalPlacementBonus: Number(payload.bonusPolicy?.renewalPlacementBonus || payload.renewalPlacementBonus || splitBonus),
      qualificationRequired: 2,
      freezeDays: Number(payload.bonusPolicy?.freezeDays || payload.freezeDays || 14)
    };
  },

  normalizeSide(side) {
    const value = String(side || '').toLowerCase();
    if (value === 'left' || value === 'l' || value === '左') return 'left';
    if (value === 'right' || value === 'r' || value === '右') return 'right';
    return '';
  },

  isIndependent(profile = {}) {
    if (profile.isIndependent === true || profile.independent === true) return true;
    if (profile.independentAt || profile.independenceAt) return true;
    if (String(profile.qualificationStatus || '').toLowerCase() === 'independent') return true;
    const leftDone = !!(profile.qualificationLeftMemberId || profile.leftQualifiedMemberId || profile.leftQualified);
    const rightDone = !!(profile.qualificationRightMemberId || profile.rightQualifiedMemberId || profile.rightQualified);
    if (leftDone && rightDone) return true;
    return Number(profile.qualificationCount || profile.qualifiedCount || 0) >= 2;
  },

  getRecruiterProfile(payload = {}) {
    return {
      ...(payload.recruiter || {}),
      isIndependent: payload.recruiterIsIndependent ?? payload.isRecruiterIndependent,
      independentAt: payload.recruiterIndependentAt,
      qualificationCount: payload.recruiterQualificationCount,
      qualificationLeftMemberId: payload.recruiterQualificationLeftMemberId,
      qualificationRightMemberId: payload.recruiterQualificationRightMemberId
    };
  },

  resolveRecruiterId(payload = {}) {
    return payload.recruiterId || payload.sponsorId || payload.referrerId || payload.introducerId || payload.recommenderId || '';
  },

  resolveRecruiterSponsorId(payload = {}) {
    return payload.recruiterSponsorId || payload.sponsorSponsorId || payload.recruiterUplineId || payload.uplineSponsorId || '';
  },

  addTransaction(plan, item) {
    if (!item.memberId || Number(item.amount || 0) <= 0) return;
    const idSuffix = plan.transactions.length + 1;
    plan.transactions.push({
      transactionId: item.transactionId || `${plan.orderId}-${String(idSuffix).padStart(2, '0')}`,
      orderId: plan.orderId,
      memberId: item.memberId,
      sourceMemberId: plan.sourceMemberId,
      bonusType: item.bonusType,
      amount: Number(item.amount),
      currency: plan.currency,
      status: 'pending',
      freezeUntil: plan.freezeUntil,
      note: item.note || ''
    });
  },

  getEventTime(payload = {}) {
    const raw = payload.paidAt || payload.createdAt || Date.now();
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? new Date() : date;
  },

  buildPlan(payload = {}) {
    const policy = this.getPolicy(payload);
    const now = this.getEventTime(payload);
    const freezeUntil = new Date(now.getTime() + policy.freezeDays * 24 * 60 * 60 * 1000).toISOString();
    const orderType = payload.orderType || 'tenant_annual_fee';
    const orderId = payload.orderId || '';
    const buyerId = payload.buyerId || payload.tenantId || payload.userId || '';
    const recruiterId = this.resolveRecruiterId(payload);
    const recruiterSponsorId = this.resolveRecruiterSponsorId(payload);
    const placementParentId = payload.placementParentId || payload.placementOwnerId || payload.parentId || '';
    const placementSide = this.normalizeSide(payload.placementSide || payload.qualificationSide);
    const recruiterProfile = this.getRecruiterProfile(payload);
    const recruiterIndependent = this.isIndependent(recruiterProfile);
    const plan = {
      policyType: policy.type,
      orderId,
      orderType,
      sourceMemberId: buyerId,
      currency: payload.currency || 'TWD',
      status: 'pending',
      freezeDays: policy.freezeDays,
      freezeUntil,
      policy,
      relationships: {
        recruiterId,
        recruiterSponsorId,
        placementParentId,
        placementSide
      },
      qualificationUpdate: null,
      transactions: [],
      warnings: []
    };

    if (!orderId) plan.warnings.push('missing_order_id');
    if (!buyerId) plan.warnings.push('missing_buyer_id');

    if (orderType === 'tenant_renewal_fee') {
      if (recruiterId) {
        this.addTransaction(plan, {
          memberId: recruiterId,
          bonusType: 'renewal_referral',
          amount: policy.renewalReferralBonus,
          note: '年度續約：直接推薦獎金'
        });
      } else {
        plan.warnings.push('missing_recruiter_for_renewal');
      }

      if (placementParentId) {
        this.addTransaction(plan, {
          memberId: placementParentId,
          bonusType: 'renewal_placement',
          amount: policy.renewalPlacementBonus,
          note: '年度續約：當下安置獎金'
        });
      } else {
        plan.warnings.push('missing_placement_parent_for_renewal');
      }
    } else {
      if (!recruiterId) {
        plan.warnings.push('missing_recruiter');
      } else if (recruiterIndependent) {
        this.addTransaction(plan, {
          memberId: recruiterId,
          bonusType: 'direct_full',
          amount: policy.directFullBonus,
          note: '推薦人已獨立，取得全額 BV'
        });
      } else {
        this.addTransaction(plan, {
          memberId: recruiterId,
          bonusType: 'direct_split',
          amount: policy.directSplitBonus,
          note: '推薦人未獨立，推薦人取得半額'
        });

        if (recruiterSponsorId) {
          this.addTransaction(plan, {
            memberId: recruiterSponsorId,
            bonusType: 'sponsor_split',
            amount: policy.sponsorSplitBonus,
            note: '推薦人未獨立，上線取得半額'
          });
        } else {
          plan.warnings.push('missing_recruiter_sponsor');
        }

        plan.qualificationUpdate = {
          ownerId: recruiterId,
          sourceMemberId: buyerId,
          side: placementSide,
          requiredCount: policy.qualificationRequired,
          countsTowardIndependence: true,
          completesIndependence: this.wouldCompleteIndependence(recruiterProfile, placementSide)
        };
        if (!placementSide) plan.warnings.push('missing_qualification_side');
      }
    }

    if (plan.warnings.length) plan.status = 'review_required';
    return plan;
  },

  wouldCompleteIndependence(profile = {}, side = '') {
    const normalizedSide = this.normalizeSide(side);
    const leftDone = !!(profile.qualificationLeftMemberId || profile.leftQualifiedMemberId || profile.leftQualified);
    const rightDone = !!(profile.qualificationRightMemberId || profile.rightQualifiedMemberId || profile.rightQualified);
    if (this.isIndependent(profile)) return false;
    if (normalizedSide === 'left') return rightDone;
    if (normalizedSide === 'right') return leftDone;
    return Number(profile.qualificationCount || profile.qualifiedCount || 0) >= 1;
  },

  preview(payload = {}) {
    return { success: true, data: this.buildPlan(payload) };
  },

  buildTreeQuery(payload = {}) {
    return {
      memberId: payload.memberId || payload.userId || '',
      treeType: payload.treeType || 'placement',
      depth: Math.min(10, Math.max(1, Number(payload.depth || 3))),
      includeBonusSummary: payload.includeBonusSummary !== false,
      includeQualification: true,
      policyType: BONUS_POLICY_TYPE
    };
  }
};

const CardVersionResolverModule = {
  text(value, fallback = '') {
    const next = String(value ?? '').trim();
    return next || fallback;
  },

  parseConfig(row) {
    const raw = this.text(row && (row.custom_config || row.customConfig || row['自訂名片設定'] || row['電子名片設定']));
    if (!raw) return {};
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (e) {
      return {};
    }
  },

  normalizeVersion(value) {
    const next = this.text(value).toLowerCase();
    if (next === 'video' || next === 'video_card' || next === 'movie') return 'video';
    if (next === 'poster' || next === 'portrait' || next === 'giga' || next === '400:600') return 'poster';
    if (next === 'square' || next === '1:1') return 'square';
    return 'standard';
  },

  layoutForVersion(version) {
    if (version === 'poster') return 'portrait';
    if (version === 'square') return 'square';
    return 'landscape';
  },

  versionForRow(row) {
    const rowId = this.text(row && (row.row_id || row.rowId || row.id)).toUpperCase();
    const cfg = this.parseConfig(row);
    if (rowId.startsWith('CARD_VIDEO_')) return 'video';
    if (rowId.startsWith('CARD_POSTER_')) return 'poster';
    if (rowId.startsWith('CARD_SQUARE_')) return 'square';
    if (rowId.startsWith('CARD_STD_')) return 'standard';
    if (cfg.cardVersion || cfg.card_version) return this.normalizeVersion(cfg.cardVersion || cfg.card_version);
    if (cfg.videoCard === true || cfg.videoStorageKind === 'dedicated_video_card' || this.text(cfg.cardVariant).toLowerCase() === 'video_card') return 'video';
    return this.normalizeVersion(cfg.layoutStyle || cfg.layout || 'standard');
  },

  isVideoRow(row) {
    return this.versionForRow(row) === 'video';
  },

  rowIdPrefix(version) {
    if (version === 'video') return 'CARD_VIDEO';
    if (version === 'poster') return 'CARD_POSTER';
    if (version === 'square') return 'CARD_SQUARE';
    return 'CARD_STD';
  },

  imageForVersion(card, cfg, version) {
    if (version === 'poster') return this.text(cfg.imgUrlPortrait, this.text(card.imageUrl || card.image_url || cfg.imgUrl));
    if (version === 'square') return this.text(cfg.imgUrlSquare, this.text(card.imageUrl || card.image_url || cfg.imgUrl));
    return this.text(cfg.imgUrl, this.text(card.imageUrl || card.image_url || cfg.imgUrlPortrait || cfg.imgUrlSquare));
  },

  async loadRowsForUser(userId, env) {
    if (!env.ACTMASTER_DB || !userId) return [];
    await D1ReadModule.ensureCardAccessColumns(env);
    const ids = await D1ReadModule.identityIdsForUser(env, userId).catch(() => [this.text(userId)].filter(Boolean));
    const safeIds = ids.map(id => this.text(id)).filter(Boolean);
    if (!safeIds.length) return [];
    const placeholders = safeIds.map(() => '?').join(',');
    return await D1ReadModule.all(env, `
      SELECT * FROM card_contacts
      WHERE (
        line_id IN (${placeholders})
        OR profile_user_id IN (${placeholders})
        OR owner_user_id IN (${placeholders})
        OR claimed_by_uid IN (${placeholders})
        OR (
          creator_id IN (${placeholders})
          AND LOWER(COALESCE(source_type,'')) = 'self_profile'
          AND TRIM(COALESCE(line_id,'')) = ''
          AND TRIM(COALESCE(owner_user_id,'')) = ''
          AND TRIM(COALESCE(profile_user_id,'')) = ''
        )
      )
      AND (
        LOWER(COALESCE(source_type,'')) IN ('self_profile', 'video_profile')
        OR (LOWER(COALESCE(source_type,'')) = '' AND (line_id IN (${placeholders}) OR profile_user_id IN (${placeholders})))
      )
      ORDER BY
        CASE
          WHEN line_id IN (${placeholders}) THEN 0
          WHEN profile_user_id IN (${placeholders}) THEN 1
          WHEN owner_user_id IN (${placeholders}) THEN 2
          WHEN claimed_by_uid IN (${placeholders}) THEN 3
          ELSE 4
        END,
        COALESCE(updated_at, created_at) DESC,
        row_id DESC
    `, [
      ...safeIds, ...safeIds, ...safeIds, ...safeIds, ...safeIds,
      ...safeIds, ...safeIds,
      ...safeIds, ...safeIds, ...safeIds, ...safeIds
    ]);
  },

  async createVersionFromBase(baseRow, userId, version, env) {
    const base = D1ReadModule.cardRow(baseRow);
    if (!base || !base.rowId) return null;
    const cfg = this.parseConfig(baseRow);
    const nextCfg = { ...cfg };
    const layout = this.layoutForVersion(version);
    nextCfg.cardVersion = version;
    nextCfg.layoutStyle = layout;
    nextCfg.imgRatioLandscape = nextCfg.imgRatioLandscape || '20:13';
    nextCfg.imgRatioPortrait = nextCfg.imgRatioPortrait || '400:600';
    nextCfg.imgRatioSquare = nextCfg.imgRatioSquare || '1:1';
    if (version !== 'video') {
      delete nextCfg.cardType;
      delete nextCfg.cardVariant;
      delete nextCfg.videoCard;
      delete nextCfg.videoStorageKind;
      delete nextCfg.videoUrl;
      delete nextCfg.videoPosterUrl;
    }
    const imageUrl = this.imageForVersion(base, nextCfg, version);
    const rowId = `${this.rowIdPrefix(version)}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const saved = await D1WriteModule.upsertCard({
      rowId,
      authenticatedUserId: userId,
      userId,
      authenticatedRole: 'admin',
      data: {
        rowId,
        lineId: userId,
        creatorId: userId,
        ownerUserId: userId,
        profileUserId: userId,
        sourceType: version === 'video' ? 'video_profile' : 'self_profile',
        visibility: 'private',
        networkId: base.networkId || 'admin',
        name: base.name,
        englishName: base.englishName,
        companyName: base.companyName,
        title: base.title,
        department: base.department,
        taxId: base.taxId,
        mobile: base.mobile,
        officePhone: base.officePhone,
        extension: base.extension,
        fax: base.fax,
        email: base.email,
        website: base.website,
        socials: base.socials,
        address: base.address,
        birthday: base.birthday,
        services: base.services,
        notes: base.notes,
        imageUrl,
        customConfig: JSON.stringify(nextCfg),
        tags: base.tags
      }
    }, env);
    if (!saved || saved.success === false) return null;
    return saved.data || null;
  },

  async resolve(payload = {}, env, options = {}) {
    const userId = this.text(payload.authenticatedUserId || payload.userId || payload.lineUserId || payload.lineId);
    const version = this.normalizeVersion(payload.cardVersion || payload.version || payload.layout || payload.layoutStyle);
    if (!userId) return { success: false, error: 'Missing userId' };
    if (!env.ACTMASTER_DB) return { success: false, error: 'D1 unavailable' };
    const rows = await this.loadRowsForUser(userId, env);
    const staticRows = rows.filter(row => !this.isVideoRow(row));
    const videoRows = rows.filter(row => this.isVideoRow(row));
    const exact = version === 'video'
      ? (videoRows.find(row => this.text(row.row_id || row.rowId || row.id).toUpperCase().startsWith('CARD_VIDEO_')) || videoRows[0])
      : staticRows.find(row => this.text(row.row_id || row.rowId || row.id).toUpperCase().startsWith(this.rowIdPrefix(version) + '_'));
    if (exact) {
      return { success: true, data: { rowId: this.text(exact.row_id), version, versionMatched: true, card: D1ReadModule.cardRow(exact) } };
    }
    const staticBase = staticRows[0];
    const base = version === 'video' ? videoRows[0] : staticBase;
    if (options.createIfMissing || payload.createIfMissing === true || payload.createIfMissing === 'true') {
      const created = base ? await this.createVersionFromBase(base, userId, version, env) : null;
      if (created) return { success: true, data: { rowId: created.rowId, version, versionMatched: true, created: true, card: created } };
    }
    if (base) {
      return { success: true, data: { rowId: this.text(base.row_id), version: this.versionForRow(base), requestedVersion: version, versionMatched: false, card: D1ReadModule.cardRow(base) } };
    }
    return { success: false, error: 'Card not found' };
  }
};

async function resolveOwnCardRowId(payload, env) {
  const userId = String((payload && (payload.userId || payload.authenticatedUserId || payload.lineUserId)) || '').trim();
  if (!userId) return '';
  if (env.ACTMASTER_DB) {
    try {
      const result = await CardVersionResolverModule.resolve({
        ...payload,
        userId,
        version: payload.cardVersion || payload.version || payload.layout || payload.layoutStyle || 'standard'
      }, env, { createIfMissing: payload.createIfMissing === true });
      const rowId = result && result.data && result.data.rowId;
      if (rowId) return rowId;
    } catch (e) {
      console.error('D1 resolveOwnCardRowId fallback', e);
    }
  }
  const cardsResult = await DBModule.forward('getCardContacts', { role: 'admin', networkId: 'admin' }, env);
  const cards = Array.isArray(cardsResult) ? cardsResult : (cardsResult && (cardsResult.data || cardsResult.cards)) || [];
  const card = cards.find(c => {
    const lineId = String(c['LINE ID'] || c.lineId || c.userId || '').trim();
    return lineId && lineId === userId && !/^CARD_VIDEO_/i.test(String(c.rowId || c['rowId'] || c['Row ID'] || c.id || ''));
  });
  return card && (card.rowId || card['rowId'] || card['Row ID'] || card.id || '');
}

const D1FinanceModule = {
  hasD1(env) {
    return !!(env && env.ACTMASTER_DB);
  },

  text(value, fallback = '') {
    const next = String(value ?? '').trim();
    return next || fallback;
  },

  pick(source, keys, fallback = '') {
    for (const key of keys) {
      const value = source && source[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
    }
    return fallback;
  },

  orderRow(row) {
    if (!row) return null;
    let raw = {};
    try { raw = row.raw_json ? JSON.parse(row.raw_json) : {}; } catch (e) {}
    return {
      ...raw,
      orderId: this.text(row.order_id),
      id: this.text(row.order_id),
      rowId: this.text(row.order_id),
      orderType: this.text(row.order_type),
      buyerId: this.text(row.buyer_id),
      tenantId: this.text(row.buyer_id),
      buyerName: this.text(row.buyer_name),
      tenantName: this.text(row.buyer_name),
      networkId: this.text(row.network_id, 'admin'),
      productCode: this.text(row.product_code),
      productName: this.text(row.product_name),
      grossAmount: Number(row.gross_amount || 0) || 0,
      fee: Number(row.gross_amount || 0) || 0,
      price: Number(row.gross_amount || 0) || 0,
      netAmount: Number(row.net_amount || 0) || 0,
      taxAmount: Number(row.tax_amount || 0) || 0,
      taxRate: Number(row.tax_rate || 0) || 0,
      bv: Number(row.bv || 0) || 0,
      currency: this.text(row.currency, 'TWD'),
      paymentStatus: this.text(row.payment_status),
      status: this.text(row.payment_status),
      paymentProvider: this.text(row.payment_provider),
      paymentNo: this.text(row.payment_no),
      paidAt: this.text(row.paid_at),
      bonusStatus: this.text(row.bonus_status),
      sponsorId: this.text(row.sponsor_id),
      recruiterId: this.text(row.recruiter_id),
      placementParentId: this.text(row.placement_parent_id),
      placementSide: this.text(row.placement_side),
      qualificationSide: this.text(row.placement_side),
      bonusPolicyType: this.text(row.bonus_policy_type),
      createdAt: this.text(row.created_at),
      updatedAt: this.text(row.updated_at)
    };
  },

  bonusRow(row) {
    if (!row) return null;
    let raw = {};
    try { raw = row.raw_json ? JSON.parse(row.raw_json) : {}; } catch (e) {}
    return {
      ...raw,
      txId: this.text(row.tx_id),
      transactionId: this.text(row.tx_id),
      orderId: this.text(row.order_id),
      beneficiaryId: this.text(row.beneficiary_id),
      memberId: this.text(row.beneficiary_id),
      sourceUserId: this.text(row.source_user_id),
      networkId: this.text(row.network_id, 'admin'),
      bonusType: this.text(row.bonus_type),
      amount: Number(row.amount || 0) || 0,
      bv: Number(row.bv || 0) || 0,
      status: this.text(row.status),
      freezeUntil: this.text(row.freeze_until),
      settledAt: this.text(row.settled_at),
      note: this.text(row.note),
      createdAt: this.text(row.created_at),
      updatedAt: this.text(row.updated_at)
    };
  },

  async upsertOrder(order, env) {
    const raw = JSON.stringify(order || {});
    await env.ACTMASTER_DB.prepare(`
      INSERT INTO orders (order_id,order_type,buyer_id,buyer_name,network_id,product_code,product_name,gross_amount,net_amount,tax_amount,tax_rate,bv,currency,payment_status,payment_provider,payment_no,paid_at,bonus_status,sponsor_id,recruiter_id,placement_parent_id,placement_side,bonus_policy_type,raw_json,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(order_id) DO UPDATE SET
        order_type=excluded.order_type,buyer_id=excluded.buyer_id,buyer_name=excluded.buyer_name,network_id=excluded.network_id,
        product_code=excluded.product_code,product_name=excluded.product_name,gross_amount=excluded.gross_amount,net_amount=excluded.net_amount,
        tax_amount=excluded.tax_amount,tax_rate=excluded.tax_rate,bv=excluded.bv,currency=excluded.currency,payment_status=excluded.payment_status,
        payment_provider=excluded.payment_provider,payment_no=excluded.payment_no,paid_at=excluded.paid_at,bonus_status=excluded.bonus_status,
        sponsor_id=excluded.sponsor_id,recruiter_id=excluded.recruiter_id,placement_parent_id=excluded.placement_parent_id,
        placement_side=excluded.placement_side,bonus_policy_type=excluded.bonus_policy_type,raw_json=excluded.raw_json,updated_at=CURRENT_TIMESTAMP
    `).bind(
      order.orderId, order.orderType, order.buyerId, order.buyerName, order.networkId, order.productCode, order.productName,
      order.grossAmount, order.netAmount, order.taxAmount, order.taxRate, order.bv, order.currency, order.paymentStatus,
      order.paymentProvider, order.paymentNo, order.paidAt || '', order.bonusStatus, order.sponsorId, order.recruiterId,
      order.placementParentId, order.placementSide, order.bonusPolicyType, raw
    ).run();
  },

  async createOrder(payload, env) {
    if (!this.hasD1(env)) return null;
    const order = MLMModule.normalizeOrder(payload || {});
    if (!order.buyerId) return { success: false, error: 'Missing buyerId' };
    if (order.grossAmount <= 0 || order.bv < 0) return { success: false, error: 'Invalid order amount or BV' };
    order.bonusPlanPreview = BonusPolicyModule.buildPlan(order);
    await this.upsertOrder(order, env);
    return { success: true, data: this.orderRow(await D1ReadModule.first(env, 'SELECT * FROM orders WHERE order_id = ? LIMIT 1', [order.orderId])) };
  },

  async markOrderPaid(payload, env) {
    if (!this.hasD1(env)) return null;
    const orderId = this.pick(payload, ['orderId']);
    if (!orderId) return { success: false, error: 'Missing orderId' };
    const row = await D1ReadModule.first(env, 'SELECT * FROM orders WHERE order_id = ? LIMIT 1', [orderId]);
    if (!row) return { success: false, error: '找不到訂單' };
    const current = this.orderRow(row);
    const merged = MLMModule.normalizeOrder({ ...current, ...payload, paymentStatus: 'paid', status: 'paid', paidAt: payload.paidAt || new Date().toISOString() });
    merged.bonusStatus = payload.triggerBonus === false ? 'not_generated' : 'generated';
    const bonusPlan = BonusPolicyModule.buildPlan(merged);
    merged.bonusPlan = bonusPlan;
    await this.upsertOrder(merged, env);

    if (payload.triggerBonus !== false) {
      await env.ACTMASTER_DB.prepare('DELETE FROM bonus_transactions WHERE order_id = ?').bind(orderId).run();
      for (let i = 0; i < bonusPlan.transactions.length; i++) {
        const tx = bonusPlan.transactions[i];
        const txId = tx.transactionId || `${orderId}-B${i + 1}`;
        await env.ACTMASTER_DB.prepare(`
          INSERT INTO bonus_transactions (tx_id,order_id,beneficiary_id,source_user_id,network_id,bonus_type,amount,bv,status,freeze_until,note,raw_json,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
        `).bind(
          txId, orderId, tx.memberId, bonusPlan.sourceMemberId, merged.networkId, tx.bonusType,
          tx.amount, tx.amount, 'frozen', tx.freezeUntil || bonusPlan.freezeUntil, tx.note || '', JSON.stringify(tx)
        ).run();
      }
    }

    return { success: true, data: { ...this.orderRow(await D1ReadModule.first(env, 'SELECT * FROM orders WHERE order_id = ? LIMIT 1', [orderId])), bonusPlan } };
  },

  async updateOrderStatus(payload, env, status) {
    if (!this.hasD1(env)) return null;
    const orderId = this.pick(payload, ['orderId']);
    if (!orderId) return { success: false, error: 'Missing orderId' };
    const bonusStatus = status === 'refunded' ? 'reversed' : status;
    await env.ACTMASTER_DB.prepare('UPDATE orders SET payment_status = ?, bonus_status = ?, updated_at = CURRENT_TIMESTAMP WHERE order_id = ?')
      .bind(status, bonusStatus, orderId).run();
    await env.ACTMASTER_DB.prepare('UPDATE bonus_transactions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE order_id = ?')
      .bind(status === 'refunded' ? 'reversed' : 'cancelled', orderId).run();
    return { success: true, data: { orderId, status } };
  },

  async updateOrderPaymentProvider(payload, env) {
    if (!this.hasD1(env)) return null;
    const orderId = this.pick(payload, ['orderId']);
    if (!orderId) return { success: false, error: 'Missing orderId' };
    await env.ACTMASTER_DB.prepare(`
      UPDATE orders
      SET payment_provider = ?, payment_no = ?, raw_json = ?, updated_at = CURRENT_TIMESTAMP
      WHERE order_id = ?
    `).bind(
      payload.paymentProvider || 'newebpay',
      payload.paymentNo || '',
      JSON.stringify(payload.raw || {}),
      orderId
    ).run();
    return { success: true, data: this.orderRow(await D1ReadModule.first(env, 'SELECT * FROM orders WHERE order_id = ? LIMIT 1', [orderId])) };
  },

  async listOrders(payload, env) {
    if (!this.hasD1(env)) return null;
    const page = Math.max(1, Number(payload.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(payload.pageSize || 20)));
    const offset = (page - 1) * pageSize;
    const status = this.text(payload.status || 'all');
    const orderType = this.text(payload.orderType);
    const actorRole = this.text(payload.authenticatedRole || payload.role || '').toLowerCase();
    const actorId = this.text(payload.authenticatedUserId || '');
    let buyerId = this.text(payload.buyerId);
    if (actorId && actorRole !== 'admin' && buyerId && buyerId !== actorId) {
      return { success: false, error: 'Access Denied: Cannot query another user order' };
    }
    if (actorId && actorRole !== 'admin' && !buyerId) buyerId = actorId;
    const rows = await D1ReadModule.all(env, `
      SELECT * FROM orders
      WHERE (? = 'all' OR payment_status = ?)
        AND (? = '' OR order_type = ?)
        AND (? = '' OR buyer_id = ?)
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [status,status,orderType,orderType,buyerId,buyerId,pageSize,offset]);
    const count = await D1ReadModule.first(env, `
      SELECT COUNT(*) AS total FROM orders
      WHERE (? = 'all' OR payment_status = ?)
        AND (? = '' OR order_type = ?)
        AND (? = '' OR buyer_id = ?)
    `, [status,status,orderType,orderType,buyerId,buyerId]);
    return { success: true, data: rows.map(row => this.orderRow(row)), orders: rows.map(row => this.orderRow(row)), total: Number(count?.total || 0), page, pageSize };
  },

  async listBonusTransactions(payload, env) {
    if (!this.hasD1(env)) return null;
    const page = Math.max(1, Number(payload.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(payload.pageSize || 20)));
    const offset = (page - 1) * pageSize;
    const status = this.text(payload.status || 'all');
    const actorRole = this.text(payload.authenticatedRole || payload.role || '').toLowerCase();
    const actorId = this.text(payload.authenticatedUserId || '');
    let memberId = this.text(payload.memberId || payload.beneficiaryId);
    if (actorId && actorRole !== 'admin' && memberId && memberId !== actorId) {
      return { success: false, error: 'Access Denied: Cannot query another user bonus' };
    }
    if (actorId && actorRole !== 'admin' && !memberId) memberId = actorId;
    const rows = await D1ReadModule.all(env, `
      SELECT * FROM bonus_transactions
      WHERE (? = 'all' OR status = ?)
        AND (? = '' OR beneficiary_id = ?)
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [status,status,memberId,memberId,pageSize,offset]);
    return { success: true, data: rows.map(row => this.bonusRow(row)), transactions: rows.map(row => this.bonusRow(row)), page, pageSize };
  },

  async getReferralStats(payload, env) {
    if (!this.hasD1(env)) return null;
    await D1ReadModule.ensureCardAccessColumns(env).catch(() => null);
    const actorRole = this.text(payload.authenticatedRole || payload.role || '').toLowerCase();
    const actorId = this.text(payload.authenticatedUserId || '');
    let memberId = this.text(payload.memberId || payload.userId);
    if (actorId && actorRole !== 'admin' && memberId && memberId !== actorId) {
      return { success: false, error: 'Access Denied: Cannot query another user referral stats' };
    }
    if (actorId && actorRole !== 'admin' && !memberId) memberId = actorId;
    if (!memberId) return { success: false, error: 'Missing memberId' };

    const ids = Array.from(new Set([
      memberId,
      ...await D1ReadModule.identityIdsForUser(env, memberId).catch(() => [])
    ].map(id => this.text(id)).filter(Boolean)));
    const placeholders = ids.map(() => '?').join(',');

    const scanRows = await D1ReadModule.all(env, `
      SELECT DISTINCT line_id AS person_id
      FROM users
      WHERE referrer_id IN (${placeholders})
        AND TRIM(COALESCE(line_id, '')) <> ''
        AND line_id NOT IN (${placeholders})
      UNION
      SELECT DISTINCT COALESCE(NULLIF(profile_user_id, ''), NULLIF(line_id, ''), row_id) AS person_id
      FROM card_contacts
      WHERE owner_user_id IN (${placeholders})
        AND source_type = 'referral_placeholder'
    `, [...ids, ...ids, ...ids]).catch(() => []);

    const boundRows = await D1ReadModule.all(env, `
      SELECT DISTINCT u.line_id AS person_id
      FROM users u
      WHERE u.referrer_id IN (${placeholders})
        AND TRIM(COALESCE(u.line_id, '')) <> ''
        AND EXISTS (
          SELECT 1
          FROM card_contacts c
          WHERE (c.profile_user_id = u.line_id OR c.line_id = u.line_id OR c.creator_id = u.line_id)
            AND COALESCE(c.source_type, '') <> 'referral_placeholder'
            AND (
              c.source_type = 'self_profile'
              OR c.pool_eligible = 1
              OR c.visibility = 'public'
              OR TRIM(COALESCE(c.line_id, '')) <> ''
            )
        )
    `, [...ids]).catch(() => []);

    const ownIds = new Set(ids);
    const cleanIds = rows => new Set((rows || [])
      .map(row => this.text(row.person_id))
      .filter(id => id && !ownIds.has(id)));
    const scanIds = cleanIds(scanRows);
    const boundIds = cleanIds(boundRows);

    return {
      success: true,
      data: {
        scanCount: scanIds.size,
        scannedCount: scanIds.size,
        boundCount: boundIds.size,
        bindingCount: boundIds.size
      }
    };
  },

  ym(value = '') {
    const source = String(value || '').trim();
    const match = source.match(/^(\d{4})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}`;
    return new Date().toISOString().slice(0, 7);
  },

  periodEnd(period) {
    const safePeriod = this.ym(period);
    const [year, month] = safePeriod.split('-').map(Number);
    return new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)).toISOString();
  },

  parseJson(value) {
    try { return value ? JSON.parse(value) : {}; } catch (e) { return {}; }
  },

  async ensureSettlementSchema(env) {
    if (!this.hasD1(env)) return false;
    await env.ACTMASTER_DB.prepare(`
      CREATE TABLE IF NOT EXISTS settlement_batches (
        batch_id TEXT PRIMARY KEY,
        period TEXT NOT NULL,
        network_id TEXT DEFAULT 'admin',
        status TEXT DEFAULT 'draft',
        gross_amount REAL DEFAULT 0,
        withholding_tax REAL DEFAULT 0,
        nhi_fee REAL DEFAULT 0,
        net_amount REAL DEFAULT 0,
        item_count INTEGER DEFAULT 0,
        created_by TEXT DEFAULT '',
        locked_at TEXT DEFAULT '',
        paid_at TEXT DEFAULT '',
        raw_json TEXT DEFAULT '{}',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    await env.ACTMASTER_DB.prepare(`
      CREATE TABLE IF NOT EXISTS settlement_items (
        item_id TEXT PRIMARY KEY,
        batch_id TEXT NOT NULL,
        tx_id TEXT NOT NULL UNIQUE,
        beneficiary_id TEXT NOT NULL,
        beneficiary_name TEXT DEFAULT '',
        network_id TEXT DEFAULT 'admin',
        gross_amount REAL DEFAULT 0,
        withholding_tax REAL DEFAULT 0,
        nhi_fee REAL DEFAULT 0,
        net_amount REAL DEFAULT 0,
        invoice_required INTEGER DEFAULT 0,
        kyc_status TEXT DEFAULT '',
        status TEXT DEFAULT 'draft',
        raw_json TEXT DEFAULT '{}',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(batch_id) REFERENCES settlement_batches(batch_id)
      )
    `).run();
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_settlement_batches_period ON settlement_batches(period, network_id, status)').run();
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_settlement_items_batch ON settlement_items(batch_id, beneficiary_id)').run();
    return true;
  },

  settlementBatchRow(row) {
    if (!row) return null;
    const raw = this.parseJson(row.raw_json);
    return {
      ...raw,
      batchId: this.text(row.batch_id),
      period: this.text(row.period),
      networkId: this.text(row.network_id, 'admin'),
      status: this.text(row.status, 'draft'),
      grossAmount: Number(row.gross_amount || 0) || 0,
      withholdingTax: Number(row.withholding_tax || 0) || 0,
      nhiFee: Number(row.nhi_fee || 0) || 0,
      netAmount: Number(row.net_amount || 0) || 0,
      itemCount: Number(row.item_count || 0) || 0,
      createdBy: this.text(row.created_by),
      lockedAt: this.text(row.locked_at),
      paidAt: this.text(row.paid_at),
      createdAt: this.text(row.created_at),
      updatedAt: this.text(row.updated_at)
    };
  },

  async buildMonthlySettlement(payload, env) {
    await this.ensureSettlementSchema(env);
    const period = this.ym(payload.period || payload.month || payload.periodStart || '');
    const endAt = payload.periodEnd || this.periodEnd(period);
    const networkId = this.text(payload.networkId || 'admin');
    const withholdingRate = Math.max(0, Number(payload.withholdingRate || 0)) / 100;
    const nhiRate = Math.max(0, Number(payload.nhiRate || 0)) / 100;
    const params = [endAt, endAt, networkId, networkId];
    const rows = await D1ReadModule.all(env, `
      SELECT
        bt.*,
        u.name AS beneficiary_name,
        u.phone AS beneficiary_phone,
        u.socials AS beneficiary_socials
      FROM bonus_transactions bt
      LEFT JOIN users u ON u.line_id = bt.beneficiary_id OR u.row_id = bt.beneficiary_id
      LEFT JOIN settlement_items si ON si.tx_id = bt.tx_id
      WHERE bt.status IN ('frozen','payable')
        AND (bt.freeze_until = '' OR bt.freeze_until IS NULL OR bt.freeze_until <= ?)
        AND (bt.created_at = '' OR bt.created_at IS NULL OR bt.created_at <= ?)
        AND (? = 'all' OR ? = '' OR bt.network_id = ?)
        AND si.tx_id IS NULL
      ORDER BY bt.created_at ASC
      LIMIT 5000
    `, [params[0], params[1], params[2], params[3], params[3]]);

    const grouped = new Map();
    rows.forEach(row => {
      const tx = this.bonusRow(row);
      const beneficiaryId = tx.beneficiaryId;
      if (!beneficiaryId) return;
      const socials = this.parseJson(row.beneficiary_socials);
      const dealer = socials.dealerProfile || socials.distributorProfile || {};
      const dealerType = this.text(dealer.dealerType || dealer.businessType || '');
      const invoiceRequired = dealerType === 'company' || dealerType === 'sole_proprietor' || !!dealer.taxId || !!dealer.uniformNo;
      const gross = Number(tx.amount || 0) || 0;
      const withholdingTax = Math.round(gross * withholdingRate);
      const nhiFee = Math.round(gross * nhiRate);
      const net = Math.max(0, gross - withholdingTax - nhiFee);
      if (!grouped.has(beneficiaryId)) {
        grouped.set(beneficiaryId, {
          beneficiaryId,
          beneficiaryName: this.text(row.beneficiary_name, beneficiaryId),
          networkId: tx.networkId || networkId,
          grossAmount: 0,
          withholdingTax: 0,
          nhiFee: 0,
          netAmount: 0,
          invoiceRequired,
          kycStatus: this.text(dealer.kycStatus || dealer.status || ''),
          taxId: this.text(dealer.taxId || dealer.uniformNo || ''),
          transactions: []
        });
      }
      const item = grouped.get(beneficiaryId);
      item.grossAmount += gross;
      item.withholdingTax += withholdingTax;
      item.nhiFee += nhiFee;
      item.netAmount += net;
      item.invoiceRequired = item.invoiceRequired || invoiceRequired;
      item.transactions.push({ ...tx, withholdingTax, nhiFee, netAmount: net });
    });

    const items = Array.from(grouped.values());
    const totals = items.reduce((sum, item) => ({
      grossAmount: sum.grossAmount + item.grossAmount,
      withholdingTax: sum.withholdingTax + item.withholdingTax,
      nhiFee: sum.nhiFee + item.nhiFee,
      netAmount: sum.netAmount + item.netAmount,
      transactionCount: sum.transactionCount + item.transactions.length
    }), { grossAmount: 0, withholdingTax: 0, nhiFee: 0, netAmount: 0, transactionCount: 0 });

    return {
      period,
      networkId,
      periodEnd: endAt,
      withholdingRate: withholdingRate * 100,
      nhiRate: nhiRate * 100,
      itemCount: items.length,
      items,
      totals
    };
  },

  async previewMonthlySettlement(payload, env) {
    if (!this.hasD1(env)) return null;
    const preview = await this.buildMonthlySettlement(payload || {}, env);
    return { success: true, data: preview, preview };
  },

  async createSettlementBatch(payload, env) {
    if (!this.hasD1(env)) return null;
    const preview = await this.buildMonthlySettlement(payload || {}, env);
    if (!preview.items.length) return { success: false, error: '本期沒有可結算獎金', data: preview };
    const existing = await D1ReadModule.first(env, `
      SELECT * FROM settlement_batches
      WHERE period = ? AND network_id = ? AND status IN ('draft','locked','paid')
      ORDER BY created_at DESC LIMIT 1
    `, [preview.period, preview.networkId]);
    if (existing && !payload.force) {
      return { success: false, error: '本月份已有結算批次', data: this.settlementBatchRow(existing), preview };
    }

    const batchId = payload.batchId || `SET-${preview.period.replace('-', '')}-${Date.now().toString(36).toUpperCase()}`;
    const createdBy = this.text(payload.operatorId || payload.userId || '');
    await env.ACTMASTER_DB.prepare(`
      INSERT INTO settlement_batches (batch_id, period, network_id, status, gross_amount, withholding_tax, nhi_fee, net_amount, item_count, created_by, raw_json, updated_at)
      VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(
      batchId, preview.period, preview.networkId, preview.totals.grossAmount, preview.totals.withholdingTax,
      preview.totals.nhiFee, preview.totals.netAmount, preview.itemCount, createdBy, JSON.stringify(preview)
    ).run();

    for (const item of preview.items) {
      for (const tx of item.transactions) {
        const itemId = `${batchId}-${tx.txId}`;
        await env.ACTMASTER_DB.prepare(`
          INSERT INTO settlement_items (item_id, batch_id, tx_id, beneficiary_id, beneficiary_name, network_id, gross_amount, withholding_tax, nhi_fee, net_amount, invoice_required, kyc_status, status, raw_json, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, CURRENT_TIMESTAMP)
        `).bind(
          itemId, batchId, tx.txId, item.beneficiaryId, item.beneficiaryName, item.networkId,
          tx.amount, tx.withholdingTax, tx.nhiFee, tx.netAmount, item.invoiceRequired ? 1 : 0,
          item.kycStatus, JSON.stringify({ item, transaction: tx })
        ).run();
      }
    }

    const row = await D1ReadModule.first(env, 'SELECT * FROM settlement_batches WHERE batch_id = ? LIMIT 1', [batchId]);
    return { success: true, data: this.settlementBatchRow(row), preview };
  },

  async listSettlementBatches(payload, env) {
    if (!this.hasD1(env)) return null;
    await this.ensureSettlementSchema(env);
    const period = this.text(payload.period || payload.month || '');
    const networkId = this.text(payload.networkId || 'admin');
    const rows = await D1ReadModule.all(env, `
      SELECT * FROM settlement_batches
      WHERE (? = '' OR period = ?)
        AND (? = 'all' OR ? = '' OR network_id = ?)
      ORDER BY period DESC, created_at DESC
      LIMIT 100
    `, [period, period, networkId, networkId, networkId]);
    return { success: true, data: rows.map(row => this.settlementBatchRow(row)), batches: rows.map(row => this.settlementBatchRow(row)) };
  },

  async lockSettlementBatch(payload, env) {
    if (!this.hasD1(env)) return null;
    await this.ensureSettlementSchema(env);
    const batchId = this.pick(payload, ['batchId']);
    if (!batchId) return { success: false, error: 'Missing batchId' };
    const batch = await D1ReadModule.first(env, 'SELECT * FROM settlement_batches WHERE batch_id = ? LIMIT 1', [batchId]);
    if (!batch) return { success: false, error: '找不到結算批次' };
    if (batch.status === 'paid') return { success: false, error: '已付款批次不能重新鎖定' };
    await env.ACTMASTER_DB.prepare("UPDATE settlement_batches SET status = 'locked', locked_at = ?, updated_at = CURRENT_TIMESTAMP WHERE batch_id = ?")
      .bind(new Date().toISOString(), batchId).run();
    await env.ACTMASTER_DB.prepare("UPDATE settlement_items SET status = 'locked', updated_at = CURRENT_TIMESTAMP WHERE batch_id = ?")
      .bind(batchId).run();
    await env.ACTMASTER_DB.prepare(`
      UPDATE bonus_transactions SET status = 'payable', settled_at = COALESCE(NULLIF(settled_at, ''), ?), updated_at = CURRENT_TIMESTAMP
      WHERE tx_id IN (SELECT tx_id FROM settlement_items WHERE batch_id = ?)
    `).bind(new Date().toISOString(), batchId).run();
    const row = await D1ReadModule.first(env, 'SELECT * FROM settlement_batches WHERE batch_id = ? LIMIT 1', [batchId]);
    return { success: true, data: this.settlementBatchRow(row) };
  },

  async markSettlementPaid(payload, env) {
    if (!this.hasD1(env)) return null;
    await this.ensureSettlementSchema(env);
    const batchId = this.pick(payload, ['batchId']);
    if (!batchId) return { success: false, error: 'Missing batchId' };
    const batch = await D1ReadModule.first(env, 'SELECT * FROM settlement_batches WHERE batch_id = ? LIMIT 1', [batchId]);
    if (!batch) return { success: false, error: '找不到結算批次' };
    if (batch.status !== 'locked') return { success: false, error: '請先鎖定結算批次再付款' };
    const paidAt = payload.paidAt || new Date().toISOString();
    await env.ACTMASTER_DB.prepare("UPDATE settlement_batches SET status = 'paid', paid_at = ?, updated_at = CURRENT_TIMESTAMP WHERE batch_id = ?")
      .bind(paidAt, batchId).run();
    await env.ACTMASTER_DB.prepare("UPDATE settlement_items SET status = 'paid', updated_at = CURRENT_TIMESTAMP WHERE batch_id = ?")
      .bind(batchId).run();
    await env.ACTMASTER_DB.prepare(`
      UPDATE bonus_transactions SET status = 'paid', settled_at = COALESCE(NULLIF(settled_at, ''), ?), updated_at = CURRENT_TIMESTAMP
      WHERE tx_id IN (SELECT tx_id FROM settlement_items WHERE batch_id = ?)
    `).bind(paidAt, batchId).run();
    const row = await D1ReadModule.first(env, 'SELECT * FROM settlement_batches WHERE batch_id = ? LIMIT 1', [batchId]);
    return { success: true, data: this.settlementBatchRow(row) };
  },

  async getOrganizationTree(payload, env) {
    if (!this.hasD1(env)) return null;
    const actorRole = this.text(payload.authenticatedRole || payload.role || '').toLowerCase();
    const actorId = this.text(payload.authenticatedUserId || '');
    let rootId = this.text(payload.memberId || payload.userId);
    if (actorId && actorRole !== 'admin' && rootId && rootId !== actorId) {
      return { success: false, error: 'Access Denied: Cannot query another user organization' };
    }
    if (actorId && actorRole !== 'admin' && !rootId) rootId = actorId;
    if (!rootId) return { success: false, error: 'Missing memberId' };
    const treeType = this.text(payload.treeType || 'placement');
    const depth = Math.min(10, Math.max(1, Number(payload.depth || 3)));
    const users = await D1ReadModule.all(env, 'SELECT * FROM users LIMIT 2000');
    const orders = await D1ReadModule.all(env, "SELECT * FROM orders WHERE payment_status = 'paid' LIMIT 5000");
    const bonuses = await D1ReadModule.all(env, "SELECT beneficiary_id, SUM(amount) AS total FROM bonus_transactions WHERE status IN ('frozen','payable','paid') GROUP BY beneficiary_id");
    const userMap = new Map(users.map(row => [this.text(row.line_id || row.row_id), row]));
    const bonusMap = new Map(bonuses.map(row => [this.text(row.beneficiary_id), Number(row.total || 0) || 0]));
    const childrenMap = new Map();
    const qualifiedSides = new Map();

    const addChild = (parentId, childId, side, relation) => {
      if (!parentId || !childId || parentId === childId) return;
      if (!childrenMap.has(parentId)) childrenMap.set(parentId, []);
      const list = childrenMap.get(parentId);
      if (!list.some(item => item.memberId === childId && item.relation === relation)) list.push({ memberId: childId, placementSide: side || '', relation });
    };

    orders.forEach(order => {
      const buyerId = this.text(order.buyer_id);
      const recruiterId = this.text(order.recruiter_id || order.sponsor_id);
      const parentId = treeType === 'sponsor' ? recruiterId : this.text(order.placement_parent_id || recruiterId);
      const side = this.text(order.placement_side);
      addChild(parentId, buyerId, side, treeType);
      if (recruiterId && side) {
        if (!qualifiedSides.has(recruiterId)) qualifiedSides.set(recruiterId, new Set());
        qualifiedSides.get(recruiterId).add(side);
      }
    });

    users.forEach(user => {
      const childId = this.text(user.line_id || user.row_id);
      const parentId = this.text(user.referrer_id);
      if (treeType === 'sponsor') addChild(parentId, childId, '', 'referrer');
    });

    const buildNode = (memberId, level, side = '') => {
      const user = userMap.get(memberId) || { line_id: memberId, name: memberId, role: 'user' };
      const children = level >= depth ? [] : (childrenMap.get(memberId) || [])
        .sort((a, b) => (a.placementSide || '').localeCompare(b.placementSide || '') || a.memberId.localeCompare(b.memberId))
        .map(child => buildNode(child.memberId, level + 1, child.placementSide));
      const sides = qualifiedSides.get(memberId) || new Set();
      return {
        memberId,
        userId: memberId,
        id: memberId,
        name: this.text(user.name, memberId),
        phone: this.text(user.phone),
        role: this.text(user.role, 'user'),
        networkId: this.text(user.network_id, 'admin'),
        placementSide: side,
        independent: sides.has('left') && sides.has('right'),
        qualificationCount: sides.size,
        qualificationLeftMemberId: sides.has('left') ? 'qualified' : '',
        qualificationRightMemberId: sides.has('right') ? 'qualified' : '',
        bonusTotal: bonusMap.get(memberId) || 0,
        children
      };
    };

    const root = buildNode(rootId, 0);
    return { success: true, data: { root, nodes: [root], treeType, depth }, tree: root };
  }
};

const PaymentModule = {
  text(value, fallback = '') {
    const next = String(value ?? '').trim();
    return next || fallback;
  },

  gatewayUrl(merchantId) {
    const id = String(merchantId || '').toUpperCase();
    return id.includes('TEST') || id.includes('DUMMY')
      ? 'https://ccore.newebpay.com/MPG/mpg_gateway'
      : 'https://core.newebpay.com/MPG/mpg_gateway';
  },

  credentials(env) {
    return {
      merchantId: this.text(env.NEWEBPAY_MERCHANT_ID || env.NEWEBPAY_MERCHANTID),
      hashKey: this.text(env.NEWEBPAY_HASH_KEY),
      hashIv: this.text(env.NEWEBPAY_HASH_IV)
    };
  },

  merchantOrderNo(orderId) {
    const base = String(orderId || '').replace(/[^A-Za-z0-9]/g, '').slice(-20);
    return `LC${Date.now().toString().slice(-8)}${base}`.slice(0, 30);
  },

  buildReturnUrl(payload) {
    return this.text(payload.returnUrl || payload.clientBackUrl || 'https://fangwl591021.github.io/LINE-/?payment=tenant');
  },

  buildNotifyUrl(env, payload) {
    return this.text(payload.notifyUrl || env.NEWEBPAY_NOTIFY_URL || 'https://line-engine.fangwl591021.workers.dev/newebpay/notify');
  },

  async prepareTenantCardPayment(payload, env) {
    if (!env.ACTMASTER_DB) return { success: false, error: 'Missing ACTMASTER_DB binding' };
    const orderId = this.text(payload.orderId);
    if (!orderId) return { success: false, error: 'Missing orderId' };
    const orderRow = await D1ReadModule.first(env, 'SELECT * FROM orders WHERE order_id = ? LIMIT 1', [orderId]);
    if (!orderRow) return { success: false, error: '找不到訂單' };
    const order = D1FinanceModule.orderRow(orderRow);
    const actorId = this.text(payload.authenticatedUserId);
    const actorRole = this.text(payload.authenticatedRole || payload.role).toLowerCase();
    if (actorId && actorRole !== 'admin' && actorRole !== 'store' && order.buyerId !== actorId) {
      return { success: false, error: 'Access Denied: Cannot pay another user order' };
    }
    if (!['pending_payment', 'pending', ''].includes(String(order.paymentStatus || '').toLowerCase())) {
      return { success: false, error: '此訂單不是待付款狀態' };
    }

    const creds = this.credentials(env);
    if (!creds.merchantId || !creds.hashKey || !creds.hashIv) {
      return { success: false, error: '尚未設定藍新刷卡 MerchantID / HashKey / HashIV' };
    }
    if (creds.hashKey.length !== 32 || creds.hashIv.length !== 16) {
      return { success: false, error: '藍新 HashKey 或 HashIV 長度不正確' };
    }

    const merchantOrderNo = this.merchantOrderNo(orderId);
    const amount = Math.max(1, Math.round(Number(order.grossAmount || payload.amount || 0)));
    const tradeInfo = {
      MerchantID: creds.merchantId,
      RespondType: 'JSON',
      TimeStamp: Math.floor(Date.now() / 1000).toString(),
      Version: '2.0',
      MerchantOrderNo: merchantOrderNo,
      Amt: amount,
      ItemDesc: String(order.productName || '租戶年費').replace(/[^\u4e00-\u9fa5A-Za-z0-9 _-]/g, '').slice(0, 45),
      ReturnURL: this.buildReturnUrl(payload),
      NotifyURL: this.buildNotifyUrl(env, payload),
      Email: this.text(payload.email || ''),
      LoginType: 0
    };
    const tradeInfoStr = Object.keys(tradeInfo).map(key => `${key}=${encodeURIComponent(tradeInfo[key])}`).join('&');
    const encrypted = await NewebPayCrypto.aesEncrypt(tradeInfoStr, creds.hashKey, creds.hashIv);
    const tradeSha = await NewebPayCrypto.sha256(`HashKey=${creds.hashKey}&${encrypted}&HashIV=${creds.hashIv}`);
    const raw = {
      ...D1FinanceModule.parseJson(orderRow.raw_json),
      newebpay: {
        merchantOrderNo,
        amount,
        preparedAt: new Date().toISOString(),
        gateway: this.gatewayUrl(creds.merchantId)
      }
    };
    await D1FinanceModule.updateOrderPaymentProvider({
      orderId,
      paymentProvider: 'newebpay',
      paymentNo: merchantOrderNo,
      raw
    }, env);

    return {
      success: true,
      data: {
        GatewayUrl: this.gatewayUrl(creds.merchantId),
        MerchantID: creds.merchantId,
        TradeInfo: encrypted,
        TradeSha: tradeSha,
        Version: '2.0',
        MerchantOrderNo: merchantOrderNo,
        orderId,
        amount
      }
    };
  },

  async handleNewebpayNotify(request, env, ctx) {
    const rawText = await request.text();
    const form = new URLSearchParams(rawText);
    const tradeInfo = form.get('TradeInfo');
    if (!tradeInfo) return new Response('OK', { status: 200 });
    ctx.waitUntil((async () => {
      try {
        const creds = this.credentials(env);
        if (!creds.hashKey || !creds.hashIv) throw new Error('Missing NewebPay credentials');
        const decrypted = await NewebPayCrypto.aesDecrypt(tradeInfo, creds.hashKey, creds.hashIv);
        const data = JSON.parse(decrypted);
        const result = data.Result || {};
        const merchantOrderNo = result.MerchantOrderNo || '';
        if (data.Status === 'SUCCESS' && merchantOrderNo) {
          const order = await D1ReadModule.first(env, "SELECT * FROM orders WHERE payment_provider = 'newebpay' AND payment_no = ? LIMIT 1", [merchantOrderNo]);
          if (order) {
            await MLMModule.markOrderPaid({
              orderId: order.order_id,
              paymentProvider: 'newebpay',
              paymentNo: result.TradeNo || merchantOrderNo,
              paidAt: result.PayTime || new Date().toISOString(),
              triggerBonus: true
            }, env);
          }
        }
      } catch (e) {
        console.error('NewebPay notify error', e);
      }
    })());
    return new Response('OK', { status: 200 });
  }
};

const TenantOrderModule = {
  async createTenantBonusOrder(payload, env) {
    const d1Result = await D1FinanceModule.createOrder({
      ...payload,
      buyerId: payload.tenantId || payload.userId || payload.buyerId,
      buyerName: payload.tenantName || payload.buyerName || '',
      orderType: 'tenant_annual_fee',
      productCode: 'TENANT_ANNUAL',
      productName: payload.productName || '租戶年費',
      grossAmount: Number(payload.fee || payload.price || payload.grossAmount || 6300),
      bv: Number(payload.bv || 3000)
    }, env);
    if (d1Result) return d1Result;

    const now = new Date().toISOString();
    const order = {
      orderId: payload.orderId || 'TEN-' + Date.now().toString() + Math.random().toString(36).substring(2, 6).toUpperCase(),
      tenantId: payload.tenantId || payload.userId || '',
      tenantName: payload.tenantName || '',
      networkId: payload.networkId || 'admin',
      productName: payload.productName || '租戶年費',
      fee: Number(payload.fee || payload.price || 6300),
      price: Number(payload.price || payload.fee || 6300),
      bv: Number(payload.bv || 3000),
      taxIncluded: payload.taxIncluded !== false,
      taxRate: Number(payload.taxRate || 5),
      status: payload.status || 'pending_payment',
      paymentProvider: payload.paymentProvider || 'manual',
      paymentNo: payload.paymentNo || '',
      sponsorId: payload.sponsorId || payload.recruiterId || payload.referrerId || '',
      recruiterId: payload.recruiterId || payload.sponsorId || payload.referrerId || '',
      recruiterSponsorId: payload.recruiterSponsorId || payload.sponsorSponsorId || payload.recruiterUplineId || '',
      placementParentId: payload.placementParentId || payload.placementOwnerId || payload.parentId || '',
      placementSide: BonusPolicyModule.normalizeSide(payload.placementSide || payload.qualificationSide),
      bonusPolicyType: BONUS_POLICY_TYPE,
      createdAt: now,
      updatedAt: now
    };

    const result = await DBModule.forward('createTenantBonusOrder', order, env);
    return result && result.success !== false ? result : { success: true, data: order };
  },

  async markTenantOrderPaid(payload, env) {
    const d1Result = await D1FinanceModule.markOrderPaid(payload, env);
    if (d1Result) return d1Result;

    const now = new Date().toISOString();
    const paidPayload = {
      ...payload,
      status: 'paid',
      paidAt: payload.paidAt || now,
      updatedAt: now,
      triggerBonus: true,
      freezeDays: payload.bonusPolicy?.freezeDays || 14
    };
    return await DBModule.forward('markTenantOrderPaid', paidPayload, env);
  },

  async cancelTenantBonusOrder(payload, env) {
    const d1Result = await D1FinanceModule.updateOrderStatus(payload, env, 'cancelled');
    if (d1Result) return d1Result;

    return await DBModule.forward('cancelTenantBonusOrder', {
      ...payload,
      status: 'cancelled',
      updatedAt: new Date().toISOString()
    }, env);
  }
};

const MLMModule = {
  normalizeOrder(payload) {
    const now = new Date().toISOString();
    const grossAmount = Number(payload.grossAmount || payload.price || payload.fee || payload.amount || 0);
    const taxRate = Number(payload.taxRate || 5);
    const netAmount = payload.netAmount !== undefined
      ? Number(payload.netAmount)
      : Math.round(grossAmount / (1 + taxRate / 100));

    return {
      orderId: payload.orderId || 'ORD-' + Date.now().toString() + Math.random().toString(36).substring(2, 8).toUpperCase(),
      orderType: payload.orderType || 'tenant_annual_fee',
      buyerId: payload.buyerId || payload.tenantId || payload.userId || '',
      buyerName: payload.buyerName || payload.tenantName || '',
      networkId: payload.networkId || 'admin',
      productCode: payload.productCode || 'TENANT_ANNUAL',
      productName: payload.productName || '租戶年費',
      grossAmount,
      netAmount,
      taxAmount: Math.max(0, grossAmount - netAmount),
      taxRate,
      bv: Number(payload.bv || payload.bonusBV || 3000),
      currency: payload.currency || 'TWD',
      paymentStatus: payload.paymentStatus || payload.status || 'pending_payment',
      paymentProvider: payload.paymentProvider || 'manual',
      paymentNo: payload.paymentNo || payload.tradeNo || '',
      bonusStatus: payload.bonusStatus || 'not_generated',
      bonusPolicyType: payload.bonusPolicyType || payload.bonusPolicy?.type || BONUS_POLICY_TYPE,
      sponsorId: payload.sponsorId || payload.recruiterId || payload.referrerId || '',
      recruiterId: payload.recruiterId || payload.sponsorId || payload.referrerId || '',
      recruiterSponsorId: payload.recruiterSponsorId || payload.sponsorSponsorId || payload.recruiterUplineId || '',
      placementParentId: payload.placementParentId || payload.placementOwnerId || payload.parentId || '',
      placementSide: BonusPolicyModule.normalizeSide(payload.placementSide || payload.qualificationSide),
      qualificationSide: BonusPolicyModule.normalizeSide(payload.qualificationSide || payload.placementSide),
      recruiterIsIndependent: payload.recruiterIsIndependent ?? payload.isRecruiterIndependent ?? false,
      recruiterIndependentAt: payload.recruiterIndependentAt || '',
      recruiterQualificationCount: Number(payload.recruiterQualificationCount || 0),
      recruiterQualificationLeftMemberId: payload.recruiterQualificationLeftMemberId || '',
      recruiterQualificationRightMemberId: payload.recruiterQualificationRightMemberId || '',
      createdAt: payload.createdAt || now,
      updatedAt: now,
      source: payload.source || 'admin'
    };
  },

  async createOrder(payload, env) {
    const d1Result = await D1FinanceModule.createOrder(payload, env);
    if (d1Result) return d1Result;

    const order = this.normalizeOrder(payload);
    if (!order.buyerId) return { success: false, error: 'Missing buyerId' };
    if (order.grossAmount <= 0 || order.bv < 0) return { success: false, error: 'Invalid order amount or BV' };

    const key = `ORDER_LOCK_${order.orderId}`;
    if (env.ACTMASTER_KV) {
      const exists = await env.ACTMASTER_KV.get(key);
      if (exists) return { success: false, error: 'Duplicate orderId' };
      await env.ACTMASTER_KV.put(key, '1', { expirationTtl: 60 * 60 * 24 * 30 });
    }

    return await DBModule.forward('mlmCreateOrder', {
      ...order,
      bonusPlanPreview: BonusPolicyModule.buildPlan(order)
    }, env);
  },

  async markOrderPaid(payload, env) {
    const d1Result = await D1FinanceModule.markOrderPaid(payload, env);
    if (d1Result) return d1Result;

    const orderId = payload.orderId || '';
    const paymentNo = payload.paymentNo || payload.tradeNo || '';
    if (!orderId) return { success: false, error: 'Missing orderId' };

    if (paymentNo && env.ACTMASTER_KV) {
      const paymentKey = `PAYMENT_LOCK_${payload.paymentProvider || 'manual'}_${paymentNo}`;
      const existing = await env.ACTMASTER_KV.get(paymentKey);
      if (existing) {
        return { success: true, data: { skipped: true, reason: 'duplicate_payment_callback' } };
      }
      await env.ACTMASTER_KV.put(paymentKey, orderId, { expirationTtl: 60 * 60 * 24 * 365 });
    }

    const planInput = {
      ...payload,
      orderId,
      paidAt: payload.paidAt || new Date().toISOString()
    };
    const bonusPlan = BonusPolicyModule.buildPlan(planInput);
    const paidPayload = {
      ...payload,
      paymentStatus: 'paid',
      status: 'paid',
      paidAt: planInput.paidAt,
      triggerBonus: payload.triggerBonus !== false,
      freezeDays: Number(payload.freezeDays || payload.bonusPolicy?.freezeDays || 14),
      bonusPolicy: {
        type: BONUS_POLICY_TYPE,
        directFullBonus: Number(payload.bonusPolicy?.directFullBonus || payload.bonusPolicy?.independentBonus || payload.bv || 3000),
        directSplitBonus: Number(payload.bonusPolicy?.directSplitBonus || payload.bonusPolicy?.splitBonus || Math.floor(Number(payload.bv || 3000) / 2)),
        sponsorSplitBonus: Number(payload.bonusPolicy?.sponsorSplitBonus || Math.ceil(Number(payload.bv || 3000) / 2)),
        renewalReferralBonus: Number(payload.bonusPolicy?.renewalReferralBonus || Math.floor(Number(payload.bv || 3000) / 2)),
        renewalPlacementBonus: Number(payload.bonusPolicy?.renewalPlacementBonus || Math.floor(Number(payload.bv || 3000) / 2)),
        qualificationRequired: 2,
        freezeDays: Number(payload.bonusPolicy?.freezeDays || payload.freezeDays || 14)
      },
      bonusPolicyType: BONUS_POLICY_TYPE,
      bonusPlan,
      bonusStatus: payload.triggerBonus === false ? 'not_generated' : bonusPlan.status,
      updatedAt: new Date().toISOString()
    };

    return await DBModule.forward('mlmMarkOrderPaid', paidPayload, env);
  },

  async cancelOrder(payload, env) {
    if (!payload.orderId) return { success: false, error: 'Missing orderId' };
    const d1Result = await D1FinanceModule.updateOrderStatus(payload, env, 'cancelled');
    if (d1Result) return d1Result;

    return await DBModule.forward('mlmCancelOrder', {
      ...payload,
      paymentStatus: 'cancelled',
      status: 'cancelled',
      bonusStatus: 'cancelled',
      updatedAt: new Date().toISOString()
    }, env);
  },

  async refundOrder(payload, env) {
    if (!payload.orderId) return { success: false, error: 'Missing orderId' };
    const d1Result = await D1FinanceModule.updateOrderStatus(payload, env, 'refunded');
    if (d1Result) return d1Result;

    return await DBModule.forward('mlmRefundOrder', {
      ...payload,
      paymentStatus: 'refunded',
      status: 'refunded',
      reversalRequired: true,
      updatedAt: new Date().toISOString()
    }, env);
  },

  async listOrders(payload, env) {
    const d1Result = await D1FinanceModule.listOrders(payload, env);
    if (d1Result) return d1Result;

    return await DBModule.forward('mlmListOrders', {
      page: Number(payload.page || 1),
      pageSize: Math.min(100, Number(payload.pageSize || 20)),
      status: payload.status || 'all',
      keyword: payload.keyword || '',
      buyerId: payload.buyerId || '',
      networkId: payload.networkId || '',
      orderType: payload.orderType || '',
      bonusPolicyType: payload.bonusPolicyType || ''
    }, env);
  },

  async listBonusTransactions(payload, env) {
    const d1Result = await D1FinanceModule.listBonusTransactions(payload, env);
    if (d1Result) return d1Result;

    return await DBModule.forward('mlmListBonusTransactions', {
      page: Number(payload.page || 1),
      pageSize: Math.min(100, Number(payload.pageSize || 20)),
      status: payload.status || 'all',
      memberId: payload.memberId || '',
      batchId: payload.batchId || ''
    }, env);
  },

  async getReferralStats(payload, env) {
    const d1Result = await D1FinanceModule.getReferralStats(payload, env);
    if (d1Result) return d1Result;
    return await DBModule.forward('mlmGetReferralStats', {
      memberId: payload.memberId || payload.userId || '',
      userId: payload.userId || '',
      networkId: payload.networkId || ''
    }, env);
  },

  async createSettlementBatch(payload, env) {
    const d1Result = await D1FinanceModule.createSettlementBatch(payload, env);
    if (d1Result) return d1Result;

    return await DBModule.forward('mlmCreateSettlementBatch', {
      batchId: payload.batchId || 'BAT-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + Math.random().toString(36).substring(2, 6).toUpperCase(),
      periodStart: payload.periodStart || '',
      periodEnd: payload.periodEnd || '',
      status: 'draft',
      createdBy: payload.operatorId || payload.userId || '',
      createdAt: new Date().toISOString()
    }, env);
  },

  async lockSettlementBatch(payload, env) {
    if (!payload.batchId) return { success: false, error: 'Missing batchId' };
    const d1Result = await D1FinanceModule.lockSettlementBatch(payload, env);
    if (d1Result) return d1Result;

    return await DBModule.forward('mlmLockSettlementBatch', {
      ...payload,
      status: 'locked',
      lockedAt: new Date().toISOString()
    }, env);
  },

  async listSettlementBatches(payload, env) {
    const d1Result = await D1FinanceModule.listSettlementBatches(payload, env);
    if (d1Result) return d1Result;
    return await DBModule.forward('mlmListSettlementBatches', payload, env);
  },

  async previewMonthlySettlement(payload, env) {
    const d1Result = await D1FinanceModule.previewMonthlySettlement(payload, env);
    if (d1Result) return d1Result;
    return await DBModule.forward('mlmPreviewMonthlySettlement', payload, env);
  },

  async markSettlementPaid(payload, env) {
    const d1Result = await D1FinanceModule.markSettlementPaid(payload, env);
    if (d1Result) return d1Result;
    return await DBModule.forward('mlmMarkSettlementPaid', {
      ...payload,
      status: 'paid',
      paidAt: payload.paidAt || new Date().toISOString()
    }, env);
  },

  async getMemberTree(payload, env) {
    const d1Result = await D1FinanceModule.getOrganizationTree(payload, env);
    if (d1Result) return d1Result;

    return await DBModule.forward('mlmGetMemberTree', BonusPolicyModule.buildTreeQuery(payload), env);
  },

  async previewBonusPlan(payload, env) {
    return BonusPolicyModule.preview(payload);
  },

  async getOrganizationTree(payload, env) {
    const d1Result = await D1FinanceModule.getOrganizationTree(payload, env);
    if (d1Result) return d1Result;

    const query = BonusPolicyModule.buildTreeQuery(payload);
    const result = await DBModule.forward('mlmGetOrganizationTree', query, env);
    if (result && result.success !== false) return result;
    return await DBModule.forward('mlmGetMemberTree', query, env);
  }
};

const CUSTOMER_IMPORT_AI_TARGETS = new Set([
  '', 'name', 'mobile', 'email', 'company', 'title', 'address', 'birthday',
  'category', 'status', 'lastContactAt', 'nextFollowupAt', 'notes', 'externalId'
]);

function parseCustomerImportMappingJson(value) {
  const raw = String(value || '').replace(/```json/gi, '```');
  const fenced = raw.match(/```\s*([\s\S]*?)```/);
  const source = fenced?.[1] || raw;
  const object = source.match(/\{[\s\S]*\}/);
  if (!object) throw new Error('AI_MAPPING_INVALID_RESPONSE');
  return JSON.parse(object[0]);
}

async function suggestCustomerImportMapping(payload, env) {
  const columns = (Array.isArray(payload.columns) ? payload.columns : [])
    .slice(0, 50)
    .map((column, index) => ({
      index: Number.isInteger(Number(column?.index)) ? Number(column.index) : index,
      header: String(column?.header || '').normalize('NFKC').trim().slice(0, 80),
      samples: (Array.isArray(column?.samples) ? column.samples : [])
        .slice(0, 3)
        .map(value => String(value ?? '').normalize('NFKC').trim().slice(0, 80))
    }));
  if (!columns.length) return { success: false, error: 'AI_MAPPING_COLUMNS_REQUIRED' };

  const prompt = [
    '你是 CRM 客戶名單欄位配對器。只回傳 JSON，不要解釋。',
    '可用 target：name,mobile,email,company,title,address,birthday,category,status,lastContactAt,nextFollowupAt,notes,externalId；無法判斷用空字串。',
    '同一 target 最多使用一次。不得根據樣本推斷健康、財務、行銷同意或其他敏感屬性。',
    'confidence 只能是 high、medium、low。reason 使用繁體中文且不超過 30 字。',
    '輸出格式：{"columns":[{"index":0,"target":"name","confidence":"high","reason":"欄名為姓名"}]}',
    JSON.stringify({ columns })
  ].join('\n');

  try {
    const result = await AIModule.callOpenAI(env, {
      model: AIModule.openAITextModel(env),
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      response_format: { type: 'json_object' }
    }, payload.clientOpenAIKey);
    const parsed = parseCustomerImportMappingJson(result?.choices?.[0]?.message?.content || '');
    const used = new Set();
    const suggestions = (Array.isArray(parsed.columns) ? parsed.columns : []).slice(0, columns.length).map(item => {
      const index = Number(item?.index);
      let target = CUSTOMER_IMPORT_AI_TARGETS.has(String(item?.target || '')) ? String(item.target || '') : '';
      if (target && used.has(target)) target = '';
      if (target) used.add(target);
      const confidence = ['high', 'medium', 'low'].includes(String(item?.confidence || '')) ? String(item.confidence) : 'low';
      return { index, target, confidence, reason: String(item?.reason || '').slice(0, 30) };
    }).filter(item => Number.isInteger(item.index) && item.index >= 0 && item.index < columns.length);
    return { success: true, data: { suggestions, source: 'ai' } };
  } catch (error) {
    return { success: true, data: { suggestions: [], source: 'rules', warning: 'AI_MAPPING_FALLBACK' } };
  }
}

// ==================== 請求分發器 (Action Dispatcher) ====================
async function dispatchAction(action, payload, request, env) {
  const authz = await SecurityModule.authorizeAction(action, payload, request, env);
  if (!authz.allowed) {
    return { success: false, error: authz.error || 'Access Denied' };
  }
  const actor = authz.actor;
  // 1. 資安防護：LIFF Token 驗證 (過渡相容模式)
  const legacyAuthSkipActions = SecurityModule.legacyAuthSkipActions();
  if (payload.userId && !actor && !legacyAuthSkipActions.has(action)) {
    const token = payload.lineAccessToken || request.headers.get('Authorization')?.replace('Bearer ', '');
    if (token) {
      // 若前端有傳 Token，則嚴格驗證是否被偽造
      const isValid = await SecurityModule.verifyLineAuth(payload.userId, token, env);
      if (!isValid) {
        if (action === 'checkUser') {
          const tokenUserId = await SecurityModule.getLineUserIdFromToken(token, env);
          const diag = await SecurityModule.authMismatchDiagnostic(payload.userId, tokenUserId, env);
          return {
            success: false,
            error: `Access Denied: Invalid or Expired LINE Token [payload=${diag.payloadUserId || '-'} token=${diag.tokenUserId || '-'} payloadRegistered=${diag.payloadRegistered ? 'Y' : 'N'} tokenRegistered=${diag.tokenRegistered ? 'Y' : 'N'} sameCanonical=${diag.sameCanonical ? 'Y' : 'N'}]`,
            data: { authDiagnostic: diag }
          };
        }
        return { success: false, error: "Access Denied: Invalid or Expired LINE Token" };
      }
    } else {
      // 【過渡期處理】若前端程式還沒更新傳送 Token，暫時放行非高敏感操作，讓舊系統能登入
      const strictActions = ['updateUserRole', 'adminSyncBoundCardUser', 'auditDataConsistency', 'repairDataConsistency', 'previewIdentityMigration', 'confirmIdentityMerge', 'listDuplicateCardBindings', 'resolveDuplicateCardBinding', 'mlmCreateOrder', 'mlmMarkOrderPaid', 'mlmCancelOrder', 'mlmRefundOrder', 'mlmCreateSettlementBatch', 'mlmLockSettlementBatch', 'mlmListSettlementBatches', 'mlmPreviewMonthlySettlement', 'mlmMarkSettlementPaid'];
      if (strictActions.includes(action)) {
        return { success: false, error: "Access Denied: Missing LINE Token for sensitive action" };
      }
    }
  }

  // 2. 資安防護：OpenAI 限流機制
  const aiActions = ['recognizeCardWithGPT4o', 'matchmakeContacts', 'calculateFateTags', 'reviewCardSafety', 'generateCardCopy', 'suggestCustomerImportMapping'];
  if (aiActions.includes(action) && (actor?.userId || payload.userId)) {
    const allowed = await SecurityModule.checkRateLimit(actor?.userId || payload.userId, action, env, actor?.role || payload.role);
    if (!allowed) {
      return { success: false, error: "Daily AI quota exceeded for this action. Please try again tomorrow." };
    }
  }

  // 格式校正沙盒
  const writeActions = ['registerUser', 'updateUserProfile', 'saveCard', 'updateCard'];
  if (writeActions.includes(action)) {
    const data = payload.data || payload;
    ['手機', '手機號碼', '公司電話', '統一編號', '傳真'].forEach(k => {
      if (data[k]) data[k] = Utils.formatPhone(data[k]);
    });
  }

  if (action === 'updateCard' && (!payload.rowId || String(payload.rowId).trim() === '')) {
    const rowId = await resolveOwnCardRowId({ ...payload, createIfMissing: true }, env);
    if (rowId) payload.rowId = rowId;
  }

  switch (action) {
    case 'checkUser':              return await AuthModule.check(payload, env);
    case 'getCardForClaim':        return await ClaimModule.getCardForClaim(payload || {}, env);
    case 'claimCardAndRegister':   return await ClaimModule.claimCardAndRegister(payload || {}, env);
    case 'getAllUsers':            return await AuthModule.getAllUsersWithBoundCards(payload, env);
    case 'getCardContacts': {
      try {
        const d1Result = await D1ReadModule.getCardContacts(payload || {}, env);
        if (d1Result && d1Result.success && Array.isArray(d1Result.data)) return d1Result;
      } catch (e) {
        console.error("D1 getCardContacts fallback", e);
      }
      return await DBModule.forward(action, payload, env);
    }
    case 'getCardHarvestContacts': {
      try {
        const d1Result = await D1ReadModule.getCardHarvestContacts(payload || {}, env);
        if (d1Result && d1Result.success && Array.isArray(d1Result.data)) return d1Result;
      } catch (e) {
        console.error("D1 getCardHarvestContacts failed", e);
      }
      return { success: true, data: [] };
    }
    case 'getPublicCardById': {
      try {
        const d1Result = await D1ReadModule.getPublicCardById(payload || {}, env);
        if (d1Result) return d1Result;
      } catch (e) {
        console.error("D1 getPublicCardById failed", e);
      }
      return { success: false, error: '找不到這張名片' };
    }
    case 'resolveMyCardVersion': {
      try {
        return await CardVersionResolverModule.resolve(payload || {}, env, {
          createIfMissing: payload && (payload.createIfMissing === true || payload.createIfMissing === 'true')
        });
      } catch (e) {
        console.error("resolveMyCardVersion failed", e);
        return { success: false, error: e && e.message ? e.message : 'resolveMyCardVersion failed' };
      }
    }
    case 'listCustomers':
      return await CustomerImportModule.listCustomers(payload || {}, env);
    case 'saveCustomer':
      return await CustomerImportModule.saveCustomer(payload || {}, env);
    case 'archiveCustomer':
      return await CustomerImportModule.archiveCustomer(payload || {}, env);
    case 'createCustomerImportBatch':
      return await CustomerImportModule.createBatch(payload || {}, env);
    case 'suggestCustomerImportMapping':
      return await suggestCustomerImportMapping(payload || {}, env);
    case 'previewCustomerImportRows':
      return await CustomerImportModule.previewRows(payload || {}, env);
    case 'commitCustomerImportBatch':
      return await CustomerImportModule.commitBatch(payload || {}, env);
    case 'getCustomerImportBatch':
      return await CustomerImportModule.getBatch(payload || {}, env);
    case 'rollbackCustomerImportBatch':
      return await CustomerImportModule.rollbackBatch(payload || {}, env);
    case 'getCrmContacts': {
      try {
        const d1Result = await D1ReadModule.getCrmContacts(payload || {}, env);
        if (d1Result && d1Result.success && Array.isArray(d1Result.data)) return d1Result;
      } catch (e) {
        console.error("D1 getCrmContacts fallback", e);
      }
      return await DBModule.forward(action, payload, env);
    }
    case 'registerUser': {
      try {
        const d1Result = await D1WriteModule.upsertUser(payload || {}, env);
        if (d1Result) {
          const pointWallet = await PointModule.ensureSubsitePointWalletOnJoin(payload || {}, env).catch(e => ({ success: false, error: e && e.message ? e.message : String(e) }));
          const shareJoinAward = await PointModule.awardShareJoinPoints(payload || {}, env).catch(e => ({ success: false, error: e && e.message ? e.message : String(e) }));
          if (d1Result && typeof d1Result === 'object') {
            d1Result.pointWallet = pointWallet;
            d1Result.shareJoinAward = shareJoinAward;
            if (d1Result.data && typeof d1Result.data === 'object') {
              d1Result.data.pointWallet = pointWallet;
              d1Result.data.shareJoinAward = shareJoinAward;
            }
          }
          return d1Result;
        }
      } catch (e) {
        console.error("D1 registerUser failed", e);
      }
      return { success: false, error: 'D1 registration failed' };
    }
    case 'updateUserProfile': {
      try {
        const d1Result = await D1WriteModule.upsertUser(payload || {}, env);
        if (d1Result && d1Result.success !== false) return d1Result;
      } catch (e) {
        console.error("D1 upsertUser fallback", e);
      }
      return await AuthModule.updateAndClearCache(action, payload, env);
    }
    case 'linkUserIdentity': {
      try {
        const d1Result = await D1ReadModule.linkUserIdentity(payload || {}, env);
        if (d1Result) return d1Result;
      } catch (e) {
        console.error("D1 linkUserIdentity fallback", e);
      }
      return { success: false, error: '身份合併失敗' };
    }
    case 'updateUserRole': {
      try {
        const d1Result = await D1WriteModule.updateUserRole(payload || {}, env);
        if (d1Result) return d1Result;
      } catch (e) {
        console.error("D1 updateUserRole fallback", e);
      }
      return await AuthModule.updateAndClearCache(action, payload, env);
    }
    case 'auditDataConsistency':
      return await D1ConsistencyModule.audit(payload || {}, env);
    case 'repairDataConsistency':
      return await D1ConsistencyModule.repair(payload || {}, env);
    case 'previewIdentityMigration':
      return await D1ReadModule.previewIdentityMigration(payload || {}, env);
    case 'confirmIdentityMerge':
      return await D1WriteModule.confirmIdentityMerge(payload || {}, env);
    case 'listDuplicateCardBindings':
      return await D1ConsistencyModule.listDuplicateBindings(payload || {}, env);
    case 'resolveDuplicateCardBinding':
      return await D1ConsistencyModule.resolveDuplicateBinding(payload || {}, env);
    case 'saveCard':
    case 'updateCard': {
      try {
        const d1Result = await D1WriteModule.upsertCard(payload || {}, env);
        if (d1Result) return d1Result;
      } catch (e) {
        console.error("D1 upsertCard fallback", e);
      }
      return await DBModule.forward(action, payload, env);
    }
    case 'deleteCard': {
      try {
        const d1Result = await D1WriteModule.deleteCard(payload || {}, env);
        if (d1Result && d1Result.success !== false) return d1Result;
      } catch (e) {
        console.error("D1 deleteCard fallback", e);
      }
      return await DBModule.forward(action, payload, env);
    }
    case 'unlinkCard': {
      try {
        const d1Result = await D1WriteModule.unlinkCard(payload || {}, env);
        if (d1Result && d1Result.success !== false) return d1Result;
      } catch (e) {
        console.error("D1 unlinkCard fallback", e);
      }
      return await DBModule.forward(action, payload, env);
    }
    case 'adminSyncBoundCardUser': {
      try {
        const profile = {
          ...(payload.profile || {}),
          userId: payload.targetUserId || payload.profile?.userId,
          role: payload.profile?.role || 'user',
          authenticatedUserId: payload.authenticatedUserId,
          authenticatedRole: payload.authenticatedRole,
          authenticatedNetworkId: payload.authenticatedNetworkId
        };
        const d1Result = await D1WriteModule.upsertUser(profile, env);
        if (d1Result && d1Result.success !== false) return d1Result;
      } catch (e) {
        console.error("D1 adminSyncBoundCardUser fallback", e);
      }
      return await AuthModule.adminSyncBoundCardUser(payload, env);
    }
    case 'getStoreSettings': {
      try {
        const d1Result = await D1StoreSettingsModule.get(payload || {}, env);
        if (d1Result && d1Result.success !== false) return d1Result;
      } catch (e) {
        console.error("D1 getStoreSettings fallback", e);
      }
      return await DBModule.forward(action, payload, env);
    }
    case 'listRichmanCoupons': {
      try {
        return await D1StoreSettingsModule.listCoupons(payload || {}, env);
      } catch (e) {
        console.error("D1 listRichmanCoupons failed", e);
        return { success: false, error: e && e.message ? e.message : 'listRichmanCoupons failed' };
      }
    }    case 'saveStoreSettings': {
      try {
        const d1Result = await D1StoreSettingsModule.save(payload || {}, env);
        if (d1Result && d1Result.success !== false) return d1Result;
      } catch (e) {
        console.error("D1 saveStoreSettings failed", e);
        return { success: false, error: e.message || 'Store settings save failed' };
      }
      return { success: false, error: 'Store settings save failed' };
    }
    case 'getPublicActivities':
    case 'getAllActivities':
    case 'getActivities': {
      let listActor = actor;
      try {
        if (!listActor && payload && payload.lineAccessToken) {
          listActor = await SecurityModule.getActor(payload, request, env).catch(() => null);
        }
        const d1Result = await D1ActivityModule.listActivities(payload || {}, env, listActor);
        if (d1Result) return d1Result;
      } catch (e) {
        console.error("D1 listActivities fallback", e);
      }
      const fallbackResult = await DBModule.forward(action, payload, env);
      return D1ActivityModule.filterResultByActor(fallbackResult, payload || {}, listActor);
    }
    case 'getActivityById': {
      try {
        const d1Result = await D1ActivityModule.getActivityById(payload || {}, env, actor);
        if (d1Result) return d1Result;
      } catch (e) {
        console.error("D1 getActivityById fallback", e);
      }
      return await DBModule.forward(action, payload, env);
    }
    case 'bulkAddRegistrants': {
      try {
        const d1Result = await D1ActivityModule.bulkAddRegistrants(payload || {}, env);
        if (d1Result && d1Result.success !== false) return d1Result;
      } catch (e) {
        console.error("D1 bulkAddRegistrants fallback", e);
      }
      return await DBModule.forward(action, payload, env);
    }
    case 'updateActivity': {
      try {
        const d1Result = await D1ActivityModule.upsertActivity(payload || {}, env);
        if (d1Result) return { success: true, data: { activityId: d1Result.activity_id } };
      } catch (e) {
        console.error("D1 updateActivity fallback", e);
      }
      return await DBModule.forward(action, payload, env);
    }
    case 'joinActivity': {
      try {
        const d1Result = await D1ActivityModule.insertRegistration(payload || {}, env);
        if (d1Result) return d1Result;
      } catch (e) {
        console.error("D1 joinActivity fallback", e);
      }
      return await DBModule.forward(action, payload, env);
    }
    case 'getActivityRegistrants': {
      try {
        const d1Result = await D1ActivityModule.listRegistrants(payload || {}, env);
        if (d1Result) return d1Result;
      } catch (e) {
        console.error("D1 listRegistrants fallback", e);
      }
      return await DBModule.forward(action, payload, env);
    }
    case 'getMyActivities':
    case 'getUserActivities':
    case 'getMyRegistrations':
    case 'getUserRegistrations': {
      try {
        const d1Result = await D1ActivityModule.listMyRegistrations(payload || {}, env);
        if (d1Result) return d1Result;
      } catch (e) {
        console.error("D1 listMyRegistrations fallback", e);
      }
      return await DBModule.forward(action, payload, env);
    }
    case 'cancelActivityRegistration':
    case 'cancelRegistration':
    case 'unregisterActivity':
    case 'removeActivityRegistration': {
      try {
        const d1Result = await D1ActivityModule.cancelRegistration(payload || {}, env);
        if (d1Result) return d1Result;
      } catch (e) {
        console.error("D1 cancelRegistration fallback", e);
      }
      return await DBModule.forward(action, payload, env);
    }
    case 'toggleCheckin': {
      try {
        const d1Result = await D1ActivityModule.toggleCheckin(payload || {}, env, 'manual');
        if (d1Result) return d1Result;
      } catch (e) {
        console.error("D1 toggleCheckin fallback", e);
      }
      return await DBModule.forward(action, payload, env);
    }
    case 'nfcCheckin': {
      try {
        const d1Result = await D1ActivityModule.nfcCheckin(payload || {}, env);
        if (d1Result) return d1Result;
      } catch (e) {
        console.error("D1 nfcCheckin fallback", e);
      }
      return await DBModule.forward(action, payload, env);
    }
    case 'confirmPayment': {
      try {
        const d1Result = await D1ActivityModule.confirmPayment(payload || {}, env);
        if (d1Result) return d1Result;
      } catch (e) {
        console.error("D1 confirmPayment fallback", e);
      }
      return await DBModule.forward(action, payload, env);
    }
    case 'removeAct': {
      try {
        const d1Result = await D1ActivityModule.removeActivity(payload || {}, env);
        if (d1Result) return d1Result;
      } catch (e) {
        console.error("D1 removeAct fallback", e);
      }
      return await DBModule.forward(action, payload, env);
    }
    case 'setActivityStatus': {
      try {
        const d1Result = await D1ActivityModule.setActivityStatus(payload || {}, env);
        if (d1Result) return d1Result;
      } catch (e) {
        console.error("D1 setActivityStatus fallback", e);
      }
      return await DBModule.forward(action, payload, env);
    }
    case 'duplicateActivity': {
      try {
        const d1Result = await D1ActivityModule.duplicateActivity(payload || {}, env);
        if (d1Result) return d1Result;
      } catch (e) {
        console.error("D1 duplicateActivity fallback", e);
      }
      return await DBModule.forward(action, payload, env);
    }
    case 'listPersonalTasks':
      return await D1PersonalTaskModule.list(payload || {}, env);
    case 'savePersonalTask':
      return await D1PersonalTaskModule.save(payload || {}, env);
    case 'completePersonalTask':
      return await D1PersonalTaskModule.setStatus(payload || {}, env, 'done');
    case 'deletePersonalTask':
      return await D1PersonalTaskModule.setStatus(payload || {}, env, 'deleted');
    case 'parsePersonalTaskVoice':
      return await D1PersonalTaskModule.parseVoiceDraft(payload || {}, env);
    case 'listAnnouncements':
      return await D1AnnouncementModule.list(payload || {}, env, false);
    case 'listAdminAnnouncements':
      return await D1AnnouncementModule.list(payload || {}, env, true);
    case 'getAdminCustomerImportOverview':
      return await AdminCustomerImportMonitorModule.overview(payload || {}, env);
    case 'listAdminCustomerImportBatches':
      return await AdminCustomerImportMonitorModule.list(payload || {}, env);
    case 'getAdminCustomerImportBatchSummary':
      return await AdminCustomerImportMonitorModule.summary(payload || {}, env);
    case 'saveAnnouncement':
      return await D1AnnouncementModule.save(payload || {}, env);
    case 'deleteAnnouncement':
      return await D1AnnouncementModule.remove(payload || {}, env);
    case 'updateCrmContact':
      return await D1ReadModule.updateCrmContact(payload || {}, env);
    case 'getInboxCount':
      return await D1InboxModule.count(payload || {}, env);
    case 'getInboxMonitor':
      return await D1InboxModule.monitor(payload || {}, env);
    case 'getLineOAChatMonitor':
      return await LineOAChatModule.monitor(payload || {}, env);
    case 'getLineOAChatAudience':
      return await LineOAChatModule.audience(payload || {}, env);
    case 'getLineOAChatCrm':
      return await LineOAChatModule.crm(payload || {}, env);
    case 'repairLineOAFollowPointOnboarding':
      return await LineOAChatModule.repairFollowPointOnboarding(payload || {}, env);
    case 'repairRecentLineOAFollowPointAwards':
      return await LineOAChatModule.repairRecentFollowPointAwards(payload || {}, env);
    case 'getAdminPointProfile':
      return await AdminPointModule.profile(payload || {}, env);
    case 'adminAdjustCustomerPoints':
      return await AdminPointModule.adjust(payload || {}, env);
    case 'uploadLineOAAsset':
      return await LineOAChatModule.uploadAsset(payload || {}, env);
    case 'sendLineOAChatReply':
      return await LineOAChatModule.sendReply(payload || {}, env);
    case 'updateLineOAChatThread':
      return await LineOAChatModule.updateThread(payload || {}, env);
    case 'listInboxItems':
      return await D1InboxModule.list(payload || {}, env);
    case 'listSentInboxItems':
      return await D1InboxModule.listSent(payload || {}, env);
    case 'getInboxItem':
      return await D1InboxModule.get(payload || {}, env);
    case 'markInboxRead':
      return await D1InboxModule.markRead(payload || {}, env);
    case 'searchInboxRecipients':
      return await D1InboxModule.searchRecipients(payload || {}, env);
    case 'sendInboxMessage':
      return await D1InboxModule.send(payload || {}, env);
    case 'redeemInboxCoupon':
      return await D1InboxModule.redeemCoupon(payload || {}, env);
    case 'getWebPushConfig':
      return await WebPushModule.config(payload || {}, env);
    case 'saveWebPushSubscription':
      return await WebPushModule.save(payload || {}, env, request);
    case 'deleteWebPushSubscription':
      return await WebPushModule.remove(payload || {}, env);
    case 'getPersonalAssistantCore':
      return await D1PersonalAssistantCoreModule.get(payload || {}, env);
    case 'savePersonalAssistantCore':
      return await D1PersonalAssistantCoreModule.save(payload || {}, env);
    case 'getStoreKnowledgeBase':
      return await D1StoreKnowledgeBaseModule.get(payload || {}, env);
    case 'saveStoreKnowledgeBase':
      return await D1StoreKnowledgeBaseModule.save(payload || {}, env);
    case 'searchStoreKnowledgeBase':
      return await D1StoreKnowledgeBaseModule.search(payload || {}, env);
    case 'getMyVideoDraft':
      return await LineOAChatModule.getMyVideoDraft(payload || {}, env);
    case 'getCardCoolDraft':
      return await LineOACardCoolKeywordModule.getReviewDraft(payload || {}, env);
    case 'confirmCardCoolDraft':
      return await LineOACardCoolKeywordModule.confirmReviewDraft(payload || {}, env);
    case 'sendCardCoolCardToChat':
      return await LineOACardCoolKeywordModule.sendSavedCardToChat(payload || {}, env);
    
    case 'recognizeCardWithGPT4o': return await AIModule.recognize(payload, env);
    case 'matchmakeContacts':      return await AIModule.matchmaking(payload, env);
    case 'calculateFateTags':      return await AIModule.fateTags(payload, env);
    case 'reviewCardSafety':       return await AIModule.reviewCardSafety(payload, env);
    case 'generateCardCopy':       return await AIModule.generateCardCopy(payload, env);
    case 'getSubsiteHome':         return await SubsiteHomeModule.get(payload || {}, env);
    case 'getMotherRegistrationUrl': return await PointModule.getMotherRegistrationUrl(payload || {}, env);
    case 'ensureMotherLineMember': return await PointModule.ensureMotherLineMember(payload || {}, env);
    case 'queryPointBalanceFast':  return await PointModule.queryPointBalanceFast(payload || {}, env);
    case 'queryUserPoints':        return await PointModule.queryUserPoints(payload || {}, env);
    case 'dailyPointCheckin':      return await PointModule.dailyCheckin(payload || {}, env);
    case 'getStorePointCustomer':  return await PointModule.getStorePointCustomer(payload || {}, env);
    case 'prepareStorePointCashierSession': return await PointModule.prepareStorePointCashierSession(payload || {}, env);
    case 'storeAdjustCustomerPoints': return await PointModule.storeAdjustCustomerPoints(payload || {}, env);
    case 'listStorePointCashierLogs': return await PointModule.listStorePointCashierLogs(payload || {}, env);
    case 'repairPointWalletSearchIndex': return await PointModule.repairPointWalletSearchIndex(payload || {}, env);
    case 'diagnosePointSync':    return await PointSyncModule.diagnose(payload || {}, env);
    case 'listPointSyncJobs':    return await PointSyncModule.list(payload || {}, env);
    case 'enqueuePointSyncJob':  return await PointSyncModule.enqueue(payload || {}, env);
    case 'processPointSyncJobs': return await PointSyncModule.process(payload || {}, env);
    case 'getSocialLikeStats':     return await TrackingModule.getSocialLikeStats(payload || {}, env);
    case 'recordSocialLike':       return await TrackingModule.recordSocialLike(payload || {}, env);
    case 'recordShareCardVisit':   return await TrackingModule.recordShareCardVisit(payload, env);
    case 'listPointRedemptionPartners': return await PartnerDirectoryModule.list(payload || {}, env);
    case 'getPointRedemptionPartner': return await PartnerDirectoryModule.get(payload || {}, env);
    case 'prepareTenantCardPayment': return await PaymentModule.prepareTenantCardPayment(payload, env);
    case 'createTenantBonusOrder': return await TenantOrderModule.createTenantBonusOrder(payload, env);
    case 'markTenantOrderPaid':    return await TenantOrderModule.markTenantOrderPaid(payload, env);
    case 'cancelTenantBonusOrder': return await TenantOrderModule.cancelTenantBonusOrder(payload, env);
    case 'mlmCreateOrder':         return await MLMModule.createOrder(payload, env);
    case 'mlmMarkOrderPaid':       return await MLMModule.markOrderPaid(payload, env);
    case 'mlmCancelOrder':         return await MLMModule.cancelOrder(payload, env);
    case 'mlmRefundOrder':         return await MLMModule.refundOrder(payload, env);
    case 'mlmListOrders':          return await MLMModule.listOrders(payload, env);
    case 'mlmListBonusTransactions': return await MLMModule.listBonusTransactions(payload, env);
    case 'mlmGetReferralStats':    return await MLMModule.getReferralStats(payload, env);
    case 'mlmListSettlementBatches': return await MLMModule.listSettlementBatches(payload, env);
    case 'mlmPreviewMonthlySettlement': return await MLMModule.previewMonthlySettlement(payload, env);
    case 'mlmCreateSettlementBatch': return await MLMModule.createSettlementBatch(payload, env);
    case 'mlmLockSettlementBatch': return await MLMModule.lockSettlementBatch(payload, env);
    case 'mlmMarkSettlementPaid': return await MLMModule.markSettlementPaid(payload, env);
    case 'mlmGetMemberTree':       return await MLMModule.getMemberTree(payload, env);
    case 'mlmPreviewBonusPlan':     return await MLMModule.previewBonusPlan(payload, env);
    case 'mlmGetOrganizationTree':  return await MLMModule.getOrganizationTree(payload, env);
    case 'd1BackfillFromGas':       return await D1BackfillModule.backfillFromGas(payload, env);
    case 'buildFlexMessage':       return { success: true, data: MessagingModule.buildFlex(payload) };
    case 'uploadImageToR2':        return { success: true, url: await StorageModule.upload(payload.base64Image, env) };
    case 'deployRichMenu':         return await LineOAModule.deployRichMenu(payload, env);
    case 'listLineOAKeywordRules': return await LineOAKeywordRuleModule.list(payload, env);
    case 'saveLineOAKeywordRule':  return await LineOAKeywordRuleModule.save(payload, env);
    case 'deleteLineOAKeywordRule': return await LineOAKeywordRuleModule.delete(payload, env);
    case 'extractLineVoomMedia':    return await LineOAModule.extractLineVoomMedia(payload, env);
    default:                       return await DBModule.forward(action, payload, env);
  }
}

// ==================== 主入口 (Worker Entry) ====================
export default {
  async scheduled(controller, env, ctx) {
    const run = D1ActivityModule.sendActivityReminders({ source: 'cron' }, env).catch(err => {
      console.error('activity reminder cron failed', err);
    });
    const pointSyncRun = PointSyncModule.process({ source: 'cron', limit: 10, maxRetry: 5 }, env).catch(err => {
      console.error('point sync cron failed', err);
    });
    if (ctx && typeof ctx.waitUntil === 'function') {
      ctx.waitUntil(run);
      ctx.waitUntil(pointSyncRun);
    } else {
      await run;
      await pointSyncRun;
    }
  },

  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
    }
    try {
      const url = new URL(request.url);
      if (request.method === 'GET' && url.pathname === '/hub-test') {
        return await LineOAChatModule.hubTest(env);
      }
      if (request.method === 'GET' && (url.pathname === '/monitor' || url.pathname === '/lineoa-monitor.html')) {
        return await LineOAChatModule.monitorPage();
      }
      if (request.method === 'GET' && (url.pathname === '/crm' || url.pathname === '/lineoa-crm.html')) {
        return await LineOAChatModule.crmPage();
      }
      if (request.method === 'GET' && url.pathname === '/api/line-oa/crm') {
        const payload = {
          pt_uid: url.searchParams.get('pt_uid') || url.searchParams.get('uid') || url.searchParams.get('userId') || '',
          limit: url.searchParams.get('limit') || '300'
        };
        const authz = await SecurityModule.authorizeAction('getLineOAChatCrm', payload, request, env);
        if (!authz.allowed) return Utils.jsonResponse({ success: false, error: authz.error || 'Access Denied' }, 403);
        return Utils.jsonResponse(await LineOAChatModule.crm(payload, env));
      }
      if (request.method === 'GET' && url.pathname === '/api/line-oa/audience') {
        const payload = {
          pt_uid: url.searchParams.get('pt_uid') || url.searchParams.get('uid') || url.searchParams.get('userId') || '',
          limit: url.searchParams.get('limit') || '500'
        };
        const authz = await SecurityModule.authorizeAction('getLineOAChatAudience', payload, request, env);
        if (!authz.allowed) return Utils.jsonResponse({ success: false, error: authz.error || 'Access Denied' }, 403);
        return Utils.jsonResponse(await LineOAChatModule.audience(payload, env));
      }
      if (request.method === 'GET' && url.pathname.replace(/\/{2,}/g, '/') === '/api/line-oa/keyword-share') {
        return Utils.jsonResponse(await LineOAKeywordRuleModule.shareMessage({
          ruleId: url.searchParams.get('ruleId') || url.searchParams.get('id') || ''
        }, env));
      }
      if (request.method === 'POST' && url.pathname === '/api/line-oa/upload-asset') {
        const payload = await request.json();
        payload.pt_uid = payload.pt_uid || payload.uid || payload.userId || '';
        const authz = await SecurityModule.authorizeAction('uploadLineOAAsset', payload, request, env);
        if (!authz.allowed) return Utils.jsonResponse({ success: false, error: authz.error || 'Access Denied' }, 403);
        return Utils.jsonResponse(await LineOAChatModule.uploadAsset(payload, env));
      }
      if (url.pathname === '/point-webhook' || url.pathname === '/webhook/points') {
        return await ThirdPointWebhookModule.handle(request, env);
      }
      if (url.pathname === '/webhook/line' || url.pathname === '/line-webhook') {
        return await LineOAChatModule.handleWebhook(request, env, ctx || { waitUntil: promise => promise });
      }
      if (url.pathname === '/newebpay/notify') {
        return await PaymentModule.handleNewebpayNotify(request, env, ctx || { waitUntil: promise => promise });
      }
      if (request.method === 'POST' && url.pathname === '/api/upload-media') {
        return Utils.jsonResponse(await StorageModule.uploadMediaRequest(request, env));
      }
      if (request.method !== 'POST') return Utils.jsonResponse({ status: "ACTMASTER API v6.0 Running with Edge Security (Compatibility Mode)" });
      const body = await request.json();
      const result = await dispatchAction(body.action, body.payload || {}, request, env);
      return Utils.jsonResponse(result);
    } catch (err) {
      return Utils.jsonResponse({ success: false, error: "Critical Error: " + err.message }, 500);
    }
  }
};
