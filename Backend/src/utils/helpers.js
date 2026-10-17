const moment = require('moment-timezone');
const ApiError = require('./ApiError');
const { DEFAULT_PAGE, DEFAULT_LIMIT, MAX_LIMIT, TIMEZONE, COST_VISIBLE_ROLES } = require('../config/constants');

const getPagination = (query = {}) => {
  const page = Math.max(parseInt(query.page, 10) || DEFAULT_PAGE, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  return { page, limit, offset: (page - 1) * limit };
};

const paginationMeta = (count, page, limit) => ({
  total: count,
  page,
  limit,
  totalPages: Math.ceil(count / limit) || 1,
});

// Company scoping: super_admin may pass ?companyId=, everyone else is locked to their own company
const getCompanyId = (req) => {
  if (req.user.role === 'super_admin') {
    return req.query.companyId || req.body?.companyId || null;
  }
  return req.user.company_id;
};

// Same as getCompanyId but refuses to continue without one (writes must always belong to a company)
const requireCompanyId = (req) => {
  const id = getCompanyId(req);
  if (!id) throw new ApiError(400, 'companyId is required');
  return id;
};

const todayStr = () => moment().tz(TIMEZONE).format('YYYY-MM-DD');

const safeJSONParse = (str, fallback = {}) => {
  try {
    return typeof str === 'string' ? JSON.parse(str) : str;
  } catch {
    return fallback;
  }
};

// Indian financial year (1 Apr - 31 Mar): '2026-10-14' -> '2026-27', '2027-02-01' -> '2026-27'
const financialYearOf = (dateStr) => {
  const m = moment(dateStr, 'YYYY-MM-DD', true);
  const y = m.month() >= 3 ? m.year() : m.year() - 1; // month() is 0-based: 3 = April
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
};

// Copy only the keys that were actually sent
const pick = (obj, keys) => {
  const out = {};
  keys.forEach((k) => { if (obj[k] !== undefined) out[k] = obj[k]; });
  return out;
};

const blankToNull = (v) => (v === '' || v === undefined ? null : v);

// Purchase prices are internal: only managers and admins see them
const canSeeCost = (user) => COST_VISIBLE_ROLES.includes(user.role);

const stripKeys = (obj, keys) => {
  const j = typeof obj.toJSON === 'function' ? obj.toJSON() : { ...obj };
  keys.forEach((k) => delete j[k]);
  return j;
};

module.exports = {
  getPagination, paginationMeta, getCompanyId, requireCompanyId, todayStr, safeJSONParse,
  financialYearOf, pick, blankToNull, canSeeCost, stripKeys,
};
