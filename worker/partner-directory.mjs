const MAX_DIRECTORY_LIMIT = 50;

function text(value, maxLength = 160) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function boundedLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 30;
  return Math.min(MAX_DIRECTORY_LIMIT, Math.max(1, parsed));
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
    businessHours: text(row.business_hours, 500)
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
    redeemPolicy: {
      enabled: Number(row.point_redeem_enabled) === 1,
      maxRedeemPercent: Math.min(100, Math.max(0, Number(row.max_redeem_percent) || 0)),
      minSpendAmount: Math.max(0, Number(row.min_spend_amount) || 0),
      note: text(row.policy_note, 500)
    },
    locations: []
  };
}

function groupRows(rows) {
  const partners = [];
  const byHandle = new Map();
  for (const row of rows || []) {
    const handle = text(row.partner_handle);
    if (!handle) continue;
    let partner = byHandle.get(handle);
    if (!partner) {
      partner = publicPartner(row);
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
      p.line_url, p.website_url,
      COALESCE(pp.point_redeem_enabled, 0) AS point_redeem_enabled,
      COALESCE(pp.max_redeem_percent, 0) AS max_redeem_percent,
      COALESCE(pp.min_spend_amount, 0) AS min_spend_amount,
      COALESCE(pp.policy_note, '') AS policy_note,
      l.location_handle, l.branch_name, l.city, l.district, l.address,
      l.latitude, l.longitude, l.maps_url, l.phone AS location_phone,
      l.business_hours
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
  }
};

