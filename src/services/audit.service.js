const { AuditLog } = require('../models');

// Best-effort: a failing audit write must never break the request that triggered it
const audit = async (req, companyId, entityType, entityId, action, details = null, transaction = undefined) => {
  try {
    await AuditLog.create({
      company_id: companyId || null, entity_type: entityType, entity_id: entityId, action,
      performed_by: req.user?.id || null, details,
    }, { transaction });
  } catch (e) {
    console.error('Audit log failed:', e.message);
  }
};

module.exports = { audit };
