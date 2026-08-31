function amountRow(doc, width, label, amount) {
  const labelWidth = width - 90;
  const amountWidth = 65;
  const height = Math.max(
    doc.heightOfString(label, { width: labelWidth }),
    doc.heightOfString(amount, { width: amountWidth })
  );
  if (doc.y + height > doc.page.height - doc.page.margins.bottom) doc.addPage();
  const y = doc.y;
  doc.text(label, 10, y, { width: labelWidth, align: 'left' });
  doc.text(amount, width - 75, y, { width: amountWidth, align: 'right' });
  doc.y = y + height;
  doc.x = 10;
}

module.exports = { amountRow };
