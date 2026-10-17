const { NumberSeries } = require('../models');
const { financialYearOf } = require('../utils/helpers');

// Hands out running numbers. Must be called inside the same DB transaction that uses the numbers, so a
// failed save never burns a number. `count` > 1 reserves a block (e.g. 10 unit barcodes for a stock-in of 10 cameras).
//   yearly: true  -> series restarts every financial year (stock documents: IN/2026-27/0001)
//   yearly: false -> one running series forever (barcodes)
const allocate = async (company, { key, date, count = 1, yearly = true, transaction }) => {
  const financialYear = yearly ? financialYearOf(date) : 'ALL';
  const where = { company_id: company.id, series_key: key, financial_year: financialYear };
  const lockOpts = { where, transaction, lock: transaction.LOCK.UPDATE };

  let row = await NumberSeries.findOne(lockOpts);
  if (!row) {
    try {
      row = await NumberSeries.create({ ...where, last_number: 0 }, { transaction });
    } catch (err) {
      row = await NumberSeries.findOne(lockOpts); // another request created it first
      if (!row) throw err;
    }
  }
  const first = row.last_number + 1;
  row.last_number += count;
  await row.save({ transaction });
  return { financial_year: financialYear, first, last: row.last_number };
};

const docNumber = (prefix, financialYear, n, padding = 4) =>
  `${prefix}/${financialYear}/${String(n).padStart(padding, '0')}`;

module.exports = { allocate, docNumber };
