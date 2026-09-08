import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { money, D } from './operations';
export async function transferPdf(t: any, source: any, destination: any): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: `${t.number} - Stock transfer at cost` } });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => { doc.on('data', c => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject); });
  const origin = process.env.APP_URL || 'http://localhost:5173';
  const qr = await QRCode.toBuffer(`${origin.replace(/\/$/,'')}/transfers?transfer=${t.id}`, { width: 110 });
  doc.fontSize(20).text('FuelOps | Stock transfer');
  doc.fontSize(12).text(t.number).text(`Status: ${t.status}${!t.dispatchedAt ? ' - DRAFT / COST ESTIMATE' : ''}`).moveDown();
  doc.fontSize(10).text(`From: ${source.name} | ${source.location}`).text(`To: ${destination.name} | ${destination.location}`)
    .text(`Created: ${new Date(t.createdAt).toISOString()}`).text(`Dispatched: ${t.dispatchedAt ? new Date(t.dispatchedAt).toISOString() : 'Not dispatched'}`)
    .text('Values below are inventory costs.').moveDown();
  for (const line of t.lines) {
    if (doc.y > 660) doc.addPage();
    doc.font('Helvetica-Bold').text(`${line.productName} | ${line.sku}`);
    doc.font('Helvetica').text(`${line.quantity} ${line.packageName} x ${line.unitsPerPackage} units = ${line.quantity * line.unitsPerPackage} individual units`)
      .text(`Cost per ${line.packageName}: $${D(line.unitCost).mul(line.unitsPerPackage).toFixed(6)} | Line cost: $${money(D(line.unitCost).mul(line.unitsPerPackage * line.quantity)).toFixed(2)}`)
      .text(`Received: ${line.received}; transit returns: ${line.returned}; received returns: ${line.returnedAfterReceipt}; damaged: ${line.damaged}`).moveDown();
  }
  if (doc.y > 560) doc.addPage();
  doc.font('Helvetica-Bold').text(`Original transfer: $${money(t.totalCost).toFixed(2)}`)
    .text(`Credits: $${money(t.credit).toFixed(2)} | Amount due: $${money(t.amountDue).toFixed(2)}`)
    .text(`Checks cleared: $${money(t.clearedAmount).toFixed(2)} | Outstanding: $${money(t.outstanding).toFixed(2)}`).moveDown();
  doc.font('Helvetica').text(`Notes: ${t.notes || 'None'}`).moveDown().text('Dispatched by: __________________  Received by: __________________');
  if (doc.y > 640) doc.addPage();
  doc.image(qr, 40, doc.y, { width: 90 });
  doc.fontSize(9).text('Scan to open this existing transfer in FuelOps. Sign-in and store access are required.', 145, doc.y + 20, { width: 320 });
  doc.end(); return done;
}
