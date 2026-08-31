const test = require('node:test');
const assert = require('node:assert/strict');
const PDFDocument = require('pdfkit');
const { amountRow } = require('./pdfLayout');

for (const width of [164, 226]) {
  test(`receipt ${width}pt restores full width after wrapped monetary rows`, () => {
    const doc = new PDFDocument({ size: [width, 841], margin: 10 });
    doc.resume();
    doc.fontSize(8);
    const y = doc.y;
    const height = doc.heightOfString('TOTAL IMPUESTOS:', { width: width - 90 });
    amountRow(doc, width, 'TOTAL IMPUESTOS:', '$123456.78');
    assert.equal(doc.x, 10);
    assert.ok(doc.y >= y + height);
    doc.text('CLIENTE: PUBLICO GENERAL', 10, doc.y, { width: width - 20 });
    assert.equal(doc.x, 10);
    doc.y = 830;
    amountRow(doc, width, 'TOTAL:', '$100.00');
    assert.ok(doc.y < 830, 'rows near the footer must move to a new page');
    doc.end();
  });
}
