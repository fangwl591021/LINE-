const MAX_DIRECTORY_LIMIT = 50;

function text(value, maxLength = 160) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function boundedLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 30;
  return Math.min(MAX_DIRECTORY_LIMIT, Math.max(1, parsed));
}

function safeHttpUrl(value, fieldName) {
  const raw = text(value, 500);
  if (!raw) return '';
  let parsed;
  try {
    parsed = new URL(raw);
  } catch (error) {
    throw new Error(`${fieldName}格式不正確`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`${fieldName}只允許 http 或 https 網址`);
  }
  return parsed.href;
}

function handle(prefix) {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
}

function partnerStatus(value) {
  const status = text(value, 20) || 'draft';
  if (!['draft', 'active', 'hidden', 'suspended', 'archived'].includes(status)) {
    throw new Error('店家狀態不正確');
  }
  return status;
}

function locationStatus(value) {
  const status = text(value, 20) || 'active';
  if (!['active', 'hidden', 'closed'].includes(status)) throw new Error('據點狀態不正確');
  return status;
}

function publicLocation(row) {
  if (!row.location_handle) return null;
  return {
    locationHandle: text(row.location_handle),
    branchName: text(row.branch_name),
    city: text(row.city),
    district: text(row.district),
    address: text(row.address, 300),
    latitude: Number.isFinite(Number(row.latitude)) ? Number(row.latitude) : null,
    longitude: Number.isFinite(Number(row.longitude)) ? Number(row.longitude) : null,
    mapsUrl: text(row.maps_url, 500),
    phone: text(row.location_phone),
    businessHours: text(row.business_hours, 500),
    status: text(row.location_status || 'active'),
    sortOrder: Number(row.location_sort_order) || 9999
  };
}

function publicPartner(row) {
  return {
    partnerHandle: text(row.partner_handle),
    name: text(row.name),
    category: text(row.category),
    summary: text(row.summary, 500),
    description: text(row.description, 2000),
    logoUrl: text(row.logo_url, 500),
    coverImageUrl: text(row.cover_image_url, 500),
    phone: text(row.partner_phone),
    lineUrl: text(row.line_url, 500),
    websiteUrl: text(row.website_url, 500),
    status: text(row.partner_status || 'active'),
    sortOrder: Number(row.partner_sort_order) || 9999,
    redeemPolicy: {
      enabled: Number(row.point_redeem_enabled) === 1,
      maxRedeemPercent: Math.min(100, Math.max(0, Number(row.max_redeem_percent) || 0)),
      minSpendAmount: Math.max(0, Number(row.min_spend_amount) || 0),
      note: text(row.policy_note, 500)
    },
    locations: []
  };
}

function adminPartner(row) {
  return {
    ...publicPartner(row),
    contact: {
      name: text(row.contact_name),
      email: text(row.contact_email, 320),
      taxId: text(row.tax_id, 40)
    },
    sourceCardLinked: Boolean(text(row.source_card_row_id, 160))
  };
}

function groupRows(rows, options = {}) {
  const partners = [];
  const byHandle = new Map();
  for (const row of rows || []) {
    const handle = text(row.partner_handle);
    if (!handle) continue;
    let partner = byHandle.get(handle);
    if (!partner) {
      partner = options.admin === true ? adminPartner(row) : publicPartner(row);
      byHandle.set(handle, partner);
      partners.push(partner);
    }
    const location = publicLocation(row);
    if (location && !partner.locations.some((item) => item.locationHandle === location.locationHandle)) {
      partner.locations.push(location);
    }
  }
  return partners;
}

function baseSelect() {
  return `
    SELECT
      p.partner_handle, p.name, p.category, p.summary, p.description,
      p.logo_url, p.cover_image_url, p.phone AS partner_phone,
      p.line_url, p.website_url, p.contact_name, p.contact_email, p.tax_id,
      p.source_card_row_id,
      p.status AS partner_status, p.sort_order AS partner_sort_order,
      COALESCE(pp.point_redeem_enabled, 0) AS point_redeem_enabled,
      COALESCE(pp.max_redeem_percent, 0) AS max_redeem_percent,
      COALESCE(pp.min_spend_amount, 0) AS min_spend_amount,
      COALESCE(pp.policy_note, '') AS policy_note,
      l.location_handle, l.branch_name, l.city, l.district, l.address,
      l.latitude, l.longitude, l.maps_url, l.phone AS location_phone,
      l.business_hours, l.status AS location_status,
      l.sort_order AS location_sort_order
  `;
}

export const PartnerDirectoryModule = {
  async list(payload, env) {
    if (!env?.ACTMASTER_DB) return { success: false, error: '合作店家資料庫尚未設定' };

    const query = text(payload?.query, 80);
    const category = text(payload?.category, 80);
    const city = text(payload?.city, 80);
    const limit = boundedLimit(payload?.limit);
    const queryPattern = `%${query}%`;

    const result = await env.ACTMASTER_DB.prepare(`
      WITH filtered_partners AS (
        SELECT p.*
        FROM point_redemption_partners p
        WHERE p.status = 'active'
          AND (?1 = '' OR p.category = ?1)
          AND (?2 = '' OR EXISTS (
            SELECT 1 FROM point_redemption_partner_locations city_location
            WHERE city_location.partner_id = p.partner_id
              AND city_location.status = 'active'
              AND city_location.city = ?2
          ))
          AND (?3 = '' OR p.name LIKE ?4 OR p.summary LIKE ?4 OR p.category LIKE ?4)
        ORDER BY p.sort_order ASC, p.name COLLATE NOCASE ASC
        LIMIT ?5
      )
      ${baseSelect()}
      FROM filtered_partners p
      LEFT JOIN point_redemption_partner_policies pp ON pp.partner_id = p.partner_id
      LEFT JOIN point_redemption_partner_locations l
        ON l.partner_id = p.partner_id AND l.status = 'active'
      ORDER BY p.sort_order ASC, p.name COLLATE NOCASE ASC,
        l.sort_order ASC, l.branch_name COLLATE NOCASE ASC
    `).bind(category, city, query, queryPattern, limit).all();

    const partners = groupRows(result?.results || []);
    const categories = [...new Set(partners.map((partner) => partner.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    const cities = [...new Set(partners.flatMap((partner) => partner.locations.map((location) => location.city)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    return { success: true, partners, facets: { categories, cities }, count: partners.length };
  },

  async get(payload, env) {
    if (!env?.ACTMASTER_DB) return { success: false, error: '合作店家資料庫尚未設定' };
    const partnerHandle = text(payload?.partnerHandle, 120);
    if (!partnerHandle) return { success: false, error: '缺少合作店家識別碼' };

    const result = await env.ACTMASTER_DB.prepare(`
      ${baseSelect()}
      FROM point_redemption_partners p
      LEFT JOIN point_redemption_partner_policies pp ON pp.partner_id = p.partner_id
      LEFT JOIN point_redemption_partner_locations l
        ON l.partner_id = p.partner_id AND l.status = 'active'
      WHERE p.partner_handle = ?1 AND p.status = 'active'
      ORDER BY l.sort_order ASC, l.branch_name COLLATE NOCASE ASC
    `).bind(partnerHandle).all();

    const partner = groupRows(result?.results || [])[0] || null;
    return partner
      ? { success: true, partner }
      : { success: false, error: '找不到合作店家' };
  },

  async adminList(payload, env) {
    if (!env?.ACTMASTER_DB) return { success: false, error: '合作店家資料庫尚未設定' };
    const limit = boundedLimit(payload?.limit);
    const result = await env.ACTMASTER_DB.prepare(`
      ${baseSelect()}
      FROM point_redemption_partners p
      LEFT JOIN point_redemption_partner_policies pp ON pp.partner_id = p.partner_id
      LEFT JOIN point_redemption_partner_locations l ON l.partner_id = p.partner_id
      ORDER BY p.sort_order ASC, p.name COLLATE NOCASE ASC,
        l.sort_order ASC, l.branch_name COLLATE NOCASE ASC
      LIMIT ?1
    `).bind(limit * 20).all();
    const partners = groupRows(result?.results || [], { admin: true }).slice(0, limit);
    return { success: true, partners, count: partners.length };
  },

  async save(payload, env) {
    if (!env?.ACTMASTER_DB) return { success: false, error: '合作店家資料庫尚未設定' };
    const partner = payload?.partner && typeof payload.partner === 'object' ? payload.partner : payload || {};
    const contact = payload?.contact && typeof payload.contact === 'object' ? payload.contact : {};
    const policy = payload?.redeemPolicy && typeof payload.redeemPolicy === 'object' ? payload.redeemPolicy : {};
    const location = payload?.location && typeof payload.location === 'object' ? payload.location : {};

    const name = text(partner.name, 160);
    if (!name) return { success: false, error: '請輸入店家名稱' };
    const partnerHandle = text(partner.partnerHandle, 120) || handle('partner');
    const status = partnerStatus(partner.status);
    const sourceCardRowId = text(payload?.sourceCardRowId, 160);
    if (sourceCardRowId) {
      const actorId = text(payload?.authenticatedUserId, 160);
      const sourceCard = actorId ? await env.ACTMASTER_DB.prepare(`
        SELECT row_id
        FROM card_contacts
        WHERE row_id = ?1
          AND (
            scanner_user_id = ?2
            OR (
              TRIM(COALESCE(scanner_user_id, '')) = ''
              AND (creator_id = ?2 OR owner_user_id = ?2)
            )
          )
          AND LOWER(COALESCE(source_type, '')) NOT IN ('self_profile', 'referral_placeholder')
        LIMIT 1
      `).bind(sourceCardRowId, actorId).first() : null;
      if (!sourceCard?.row_id) return { success: false, error: '找不到可用的收藏名片，請重新選擇' };
    }
    const maxRedeemPercent = Math.min(100, Math.max(0, Number.parseInt(policy.maxRedeemPercent, 10) || 0));
    const minSpendAmount = Math.max(0, Number.parseInt(policy.minSpendAmount, 10) || 0);

    const savedPartner = await env.ACTMASTER_DB.prepare(`
      INSERT INTO point_redemption_partners (
        partner_handle, name, category, summary, description, logo_url,
        cover_image_url, phone, line_url, website_url, contact_name, contact_email,
        tax_id, source_card_row_id, status, sort_order, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, CURRENT_TIMESTAMP)
      ON CONFLICT(partner_handle) DO UPDATE SET
        name = excluded.name, category = excluded.category, summary = excluded.summary,
        description = excluded.description, logo_url = excluded.logo_url,
        cover_image_url = excluded.cover_image_url, phone = excluded.phone,
        line_url = excluded.line_url, website_url = excluded.website_url,
        contact_name = excluded.contact_name, contact_email = excluded.contact_email,
        tax_id = excluded.tax_id,
        source_card_row_id = CASE
          WHEN excluded.source_card_row_id <> '' THEN excluded.source_card_row_id
          ELSE point_redemption_partners.source_card_row_id
        END,
        status = excluded.status, sort_order = excluded.sort_order, updated_at = CURRENT_TIMESTAMP
      RETURNING partner_id
    `).bind(
      partnerHandle,
      name,
      text(partner.category, 80),
      text(partner.summary, 500),
      text(partner.description, 2000),
      safeHttpUrl(partner.logoUrl, 'Logo 網址'),
      safeHttpUrl(partner.coverImageUrl, '封面圖片網址'),
      text(partner.phone, 80),
      safeHttpUrl(partner.lineUrl, 'LINE 網址'),
      safeHttpUrl(partner.websiteUrl, '官方網站'),
      text(contact.name, 160),
      text(contact.email, 320),
      text(contact.taxId, 40),
      sourceCardRowId,
      status,
      Math.max(0, Number.parseInt(partner.sortOrder, 10) || 9999)
    ).first();

    const partnerId = Number(savedPartner?.partner_id);
    if (!Number.isInteger(partnerId) || partnerId < 1) return { success: false, error: '店家資料儲存失敗' };

    const statements = [env.ACTMASTER_DB.prepare(`
      INSERT INTO point_redemption_partner_policies (
        partner_id, point_redeem_enabled, max_redeem_percent, min_spend_amount, policy_note, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, CURRENT_TIMESTAMP)
      ON CONFLICT(partner_id) DO UPDATE SET
        point_redeem_enabled = excluded.point_redeem_enabled,
        max_redeem_percent = excluded.max_redeem_percent,
        min_spend_amount = excluded.min_spend_amount,
        policy_note = excluded.policy_note,
        updated_at = CURRENT_TIMESTAMP
    `).bind(
      partnerId,
      policy.enabled === true ? 1 : 0,
      maxRedeemPercent,
      minSpendAmount,
      text(policy.note, 500)
    )];

    const hasLocation = ['branchName', 'city', 'district', 'address', 'phone', 'businessHours']
      .some((key) => text(location[key], 300));
    let locationHandle = text(location.locationHandle, 120);
    if (hasLocation) {
      locationHandle = locationHandle || handle('location');
      statements.push(env.ACTMASTER_DB.prepare(`
        INSERT INTO point_redemption_partner_locations (
          partner_id, location_handle, branch_name, city, district, address,
          latitude, longitude, maps_url, phone, business_hours, status, sort_order, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, CURRENT_TIMESTAMP)
        ON CONFLICT(location_handle) DO UPDATE SET
          branch_name = excluded.branch_name, city = excluded.city,
          district = excluded.district, address = excluded.address,
          latitude = excluded.latitude, longitude = excluded.longitude,
          maps_url = excluded.maps_url, phone = excluded.phone,
          business_hours = excluded.business_hours, status = excluded.status,
          sort_order = excluded.sort_order, updated_at = CURRENT_TIMESTAMP
        WHERE point_redemption_partner_locations.partner_id = excluded.partner_id
      `).bind(
        partnerId,
        locationHandle,
        text(location.branchName, 160),
        text(location.city, 80),
        text(location.district, 80),
        text(location.address, 300),
        Number.isFinite(Number(location.latitude)) ? Number(location.latitude) : null,
        Number.isFinite(Number(location.longitude)) ? Number(location.longitude) : null,
        safeHttpUrl(location.mapsUrl, '地圖網址'),
        text(location.phone, 80),
        text(location.businessHours, 500),
        locationStatus(location.status),
        Math.max(0, Number.parseInt(location.sortOrder, 10) || 9999)
      ));
    }

    await env.ACTMASTER_DB.batch(statements);
    return { success: true, partnerHandle, locationHandle };
  },

  async archive(payload, env) {
    if (!env?.ACTMASTER_DB) return { success: false, error: '合作店家資料庫尚未設定' };
    const partnerHandle = text(payload?.partnerHandle, 120);
    if (!partnerHandle) return { success: false, error: '缺少合作店家識別碼' };
    const partner = await env.ACTMASTER_DB.prepare(
      'SELECT partner_id FROM point_redemption_partners WHERE partner_handle = ?1 LIMIT 1'
    ).bind(partnerHandle).first();
    const partnerId = Number(partner?.partner_id);
    if (!Number.isInteger(partnerId)) return { success: false, error: '找不到合作店家' };
    await env.ACTMASTER_DB.batch([
      env.ACTMASTER_DB.prepare(`UPDATE point_redemption_partners SET status = 'archived', updated_at = CURRENT_TIMESTAMP WHERE partner_id = ?1`).bind(partnerId),
      env.ACTMASTER_DB.prepare(`UPDATE point_redemption_partner_locations SET status = 'hidden', updated_at = CURRENT_TIMESTAMP WHERE partner_id = ?1`).bind(partnerId)
    ]);
    return { success: true, partnerHandle, status: 'archived' };
  }
};
