const PDFDocument = require('pdfkit');
const { renderPng } = require('./barcode.service');
const ApiError = require('../utils/ApiError');
const { LABEL_LAYOUTS, DEFAULT_LABEL_LAYOUT, MAX_LABELS_PER_REQUEST } = require('../config/constants');

const MM = 72 / 25.4; // PDF points per millimetre

const truncate = (s, n) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s || '');

/**
 * labels: [{ code, title, subtitle?, price? }]  one entry per label to print
 * options: { layout, type (barcode type), show_price, show_company, company_name, start_position (1-based slot on the first sheet) }
 * Returns a PDF Buffer.
 */
const buildLabelPdf = async (labels, options = {}) => {
  const layoutName = options.layout || DEFAULT_LABEL_LAYOUT;
  const L = LABEL_LAYOUTS[layoutName];
  if (!L) throw new ApiError(400, `layout must be one of: ${Object.keys(LABEL_LAYOUTS).join(', ')}`);
  if (!labels.length) throw new ApiError(400, 'Nothing to print');
  if (labels.length > MAX_LABELS_PER_REQUEST) throw new ApiError(400, `At most ${MAX_LABELS_PER_REQUEST} labels per request`);

  const perPage = L.cols * L.rows;
  const startSlot = Math.min(Math.max(parseInt(options.start_position, 10) || 1, 1), perPage) - 1; // skip already-used labels on a part-printed sheet

  const lw = L.label_w * MM;
  const lh = L.label_h * MM;
  const gx = L.gap_x * MM;
  const gy = L.gap_y * MM;
  const pageSize = L.page === 'A4' ? 'A4' : [lw, lh];
  const pageW = L.page === 'A4' ? 595.28 : lw;
  const pageH = L.page === 'A4' ? 841.89 : lh;
  // the grid is centred on the page
  const left = (pageW - (L.cols * lw + (L.cols - 1) * gx)) / 2;
  const top = (pageH - (L.rows * lh + (L.rows - 1) * gy)) / 2;

  const doc = new PDFDocument({ size: pageSize, margin: 0, autoFirstPage: false, info: { Title: 'Barcode labels' } });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve, reject) => { doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject); });

  const small = L.label_h < 25;
  const pngCache = new Map();
  const pngFor = async (code) => {
    if (!pngCache.has(code)) pngCache.set(code, await renderPng(code, { type: options.type, scale: 6, height: 10, includeText: false }));
    return pngCache.get(code);
  };

  let slot = startSlot;
  doc.addPage();
  for (let i = 0; i < labels.length; i += 1) {
    if (slot >= perPage) { doc.addPage(); slot = 0; }
    const col = slot % L.cols;
    const row = Math.floor(slot / L.cols);
    const x = left + col * (lw + gx);
    const y = top + row * (lh + gy);
    const lab = labels[i];
    const pad = 3 * MM;
    const innerW = lw - 2 * pad;
    let cy = y + 2 * MM;

    if (options.show_company && options.company_name && !small) {
      doc.font('Helvetica').fontSize(5.5).fillColor('#555').text(truncate(options.company_name, 40), x + pad, cy, { width: innerW, align: 'center', lineBreak: false });
      cy += 7;
    }
    doc.font('Helvetica-Bold').fontSize(small ? 5.5 : 7).fillColor('#000')
      .text(truncate(lab.title, small ? 34 : 60), x + pad, cy, { width: innerW, height: small ? 7 : 18, align: 'center', ellipsis: true });
    cy += small ? 7 : (lab.title && lab.title.length > 32 ? 17 : 9);

    let footer = 9;
    if (lab.subtitle && !small) footer += 8;
    if (options.show_price && lab.price != null && !small) footer += 8;
    const imgH = Math.max(y + lh - 2 * MM - footer - cy, 12);
    const png = await pngFor(lab.code);
    doc.image(png, x + pad, cy, { fit: [innerW, imgH], align: 'center', valign: 'center' });

    let fy = cy + imgH + 1;
    doc.font('Courier-Bold').fontSize(small ? 6 : 8).fillColor('#000').text(lab.code, x + pad, fy, { width: innerW, align: 'center', lineBreak: false });
    fy += small ? 7 : 9;
    if (lab.subtitle && !small) {
      doc.font('Helvetica').fontSize(6).fillColor('#333').text(truncate(lab.subtitle, 48), x + pad, fy, { width: innerW, align: 'center', lineBreak: false });
      fy += 8;
    }
    if (options.show_price && lab.price != null && !small) {
      doc.font('Helvetica-Bold').fontSize(7).fillColor('#000').text(`MRP Rs. ${Number(lab.price).toFixed(2)}`, x + pad, fy, { width: innerW, align: 'center', lineBreak: false });
    }
    if (options.border) doc.rect(x, y, lw, lh).lineWidth(0.3).strokeColor('#999').stroke();
    slot += 1;
  }
  doc.end();
  return done;
};

module.exports = { buildLabelPdf };
