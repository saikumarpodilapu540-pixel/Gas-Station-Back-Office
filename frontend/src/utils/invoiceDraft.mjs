const normalized = value => String(value ?? '').trim().toLowerCase();
const numberOrBlank = value => value === null || value === undefined ? '' : value;
export const blankLine = () => ({ inventoryId: '', packageId: '', location: 'BACKROOM', supplierDescription: '', quantity: '', unitCost: '' });
export function buildInvoiceDraft(document, inventory, vendors, date, preferExtraction = false) {
  // A reviewed mapping is authoritative over an older extraction.
  if (!preferExtraction && document?.reviewDraft?.lines?.length) return { discount: 0, extraCharges: 0, chargesTreatment: 'CAPITALIZE', noReceiptReason: '', ...structuredClone(document.reviewDraft) };
  const extracted = document?.extraction || {};
  const matches = vendors.filter(v => normalized(v.name) === normalized(extracted.vendorName) && normalized(extracted.vendorName));
  const lines = (extracted.items || []).map(line => {
    const candidates = inventory.filter(item => line.sku
      ? normalized(item.sku) === normalized(line.sku)
      : normalized(line.description) && normalized(item.productName) === normalized(line.description));
    const product = candidates.length === 1 ? candidates[0] : null;
    const packs = (product?.catalog?.packages || []).filter(pack => line.unitsPerPackage != null
      ? pack.unitsPerPackage === Number(line.unitsPerPackage)
      : normalized(line.unitLabel) && normalized(pack.name) === normalized(line.unitLabel));
    return { inventoryId: product?.id || '', packageId: packs.length === 1 ? packs[0].id : '',
      location: 'BACKROOM', supplierDescription: line.description || '', quantity: numberOrBlank(line.quantity),
      unitCost: numberOrBlank(line.unitCost) };
  });
  return { vendorId: matches.length === 1 ? matches[0].id : '', invoiceNumber: extracted.invoiceNumber || '',
    date: extracted.date || date, totalCost: numberOrBlank(extracted.totalCost), discount: extracted.discount ?? 0,
    extraCharges: extracted.extraCharges ?? 0, chargesTreatment: 'CAPITALIZE', noReceiptReason: '', lines: lines.length ? lines : [blankLine()] };
}
export function uploadMessage(document) {
  if (document.duplicate) return document.status === 'POSTED'
    ? 'This exact file was already posted. Showing the saved purchase. No new stock was received and extraction was not run.'
    : 'This exact file is already in the inbox. Its existing draft has been opened; extraction was not run.';
  return 'New file uploaded. Choose Extract invoice to read it, or enter its details manually. No stock has been received.';
}
export function purchasePayload(draft) {
  return { vendorId: draft.vendorId, invoiceNumber: draft.invoiceNumber, date: draft.date,
    totalCost: Number(draft.totalCost), discount: Number(draft.discount), extraCharges: Number(draft.extraCharges),
    chargesTreatment: draft.chargesTreatment, reviewed: true,
    lines: draft.lines.map(line => ({ inventoryId: line.inventoryId, packageId: line.packageId,
      location: line.location, supplierDescription: line.supplierDescription,
      quantity: Number(line.quantity), unitCost: Number(line.unitCost) })) };
}
