import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Plus, Upload, X } from 'lucide-react';
import { useData } from '../context/DataContext';
import { invoiceService } from '../services/api';
import { blankLine, buildInvoiceDraft, purchasePayload, uploadMessage } from '../utils/invoiceDraft.mjs';

const errorText = error => error.response?.data?.error || error.message || 'Unable to complete the request.';
const currency = value => `$${Number(value || 0).toFixed(2)}`;
const inputClass = 'mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm';
const today = zone => new Intl.DateTimeFormat('en-CA', { timeZone: zone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
function Field({ label, children }) { return <label className="block text-sm font-medium text-slate-700">{label}{children}</label>; }

export default function InvoiceInbox() {
  const data = useData();
  if (!data.activeStoreId || data.activeStoreId === 'hq') return <div className="glass-panel p-8">Select one store to manage purchases.</div>;
  return <StoreInbox key={data.activeStoreId} data={data} />;
}
function StoreInbox({ data }) {
  const { activeStoreId, inventory, vendors, currentUser, stores, refreshStoreData, dataLoading } = data;
  const canWrite = ['OWNER', 'MANAGER'].includes(currentUser?.role);
  const [documents, setDocuments] = useState([]), [purchases, setPurchases] = useState([]);
  const [selected, setSelected] = useState(null), [draft, setDraft] = useState(null);
  const [manual, setManual] = useState(false), [checked, setChecked] = useState(false);
  const [capabilities, setCapabilities] = useState(null), [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false), [voiding, setVoiding] = useState(null), [voidReason, setVoidReason] = useState('');
  const request = useRef(null), formRef = useRef(null), dirty = useRef(false), refreshSequence = useRef(0);
  const storeDate = today(stores.find(store => store.id === activeStoreId)?.timezone);
  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    const [docs, posted, config] = await Promise.all([invoiceService.getAll(activeStoreId), invoiceService.getPurchases(activeStoreId), invoiceService.capabilities()]);
    if (sequence !== refreshSequence.current) return;
    setDocuments(docs.data); setPurchases(posted.data); setCapabilities(config.data);
  }, [activeStoreId]);
  useEffect(() => {
    let alive = true;
    const sequence = refreshSequence;
    refresh().catch(error => { if (alive) setMessage(errorText(error)); });
    return () => { alive = false; ++sequence.current; };
  }, [refresh]);
  useEffect(() => {
    const warn = event => { if (dirty.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, []);
  const leaveDraft = () => !dirty.current || window.confirm('Discard unsaved purchase changes?');
  const selectDocument = document => {
    dirty.current = false; request.current = null; setManual(false); setSelected(document); setChecked(false);
    setDraft(document.status === 'POSTED' ? null : buildInvoiceDraft(document, inventory, vendors, storeDate));
  };
  const open = async document => {
    if (!leaveDraft()) return;
    setBusy(true);
    try { selectDocument((await invoiceService.getById(document.id)).data); }
    catch (error) { setMessage(errorText(error)); } finally { setBusy(false); }
  };
  const change = patch => { dirty.current = true; setChecked(false); setDraft(current => ({ ...current, ...patch })); };
  const changeLine = (index, patch) => change({ lines: draft.lines.map((line, i) => i === index ? { ...line, ...patch } : line) });
  const requestKey = payload => {
    const fingerprint = JSON.stringify(payload);
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, key: `purchase-${crypto.randomUUID()}` };
    return request.current.key;
  };
  const upload = async event => {
    const input = event.target, file = input.files?.[0]; input.value = '';
    if (!file || !leaveDraft()) return;
    if (file.size > 6 * 1024 * 1024) { setMessage('Choose a PDF or photo up to 6 MB.'); return; }
    setBusy(true); setMessage('');
    try {
      const fileBase64 = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error('Could not read file.')); reader.readAsDataURL(file); });
      const document = (await invoiceService.upload({ storeId: activeStoreId, filename: file.name, fileBase64 })).data;
      selectDocument(document); setMessage(uploadMessage(document)); await refresh();
    } catch (error) { setMessage(errorText(error)); } finally { setBusy(false); }
  };
  const extract = async () => {
    if (!leaveDraft()) return;
    setBusy(true); setMessage('Reading this invoice…');
    try {
      const document = (await invoiceService.extract(selected.id)).data;
      selectDocument(document);
      setMessage(document.reviewDraft ? 'Extraction completed. Your saved manual review is preserved. Choose “Use extracted values” to replace it.' : 'Extraction completed. Check the supplier, every product and package, discounts, and total before receiving stock.');
    } catch (error) {
      setMessage(errorText(error));
      try { setSelected((await invoiceService.getById(selected.id)).data); } catch { /* Keep the open draft available. */ }
    } finally { await refresh().catch(() => {}); setBusy(false); }
  };
  const saveDraft = async () => {
    setBusy(true);
    try {
      const document = (await invoiceService.saveDraft(selected.id, draft, selected.updatedAt)).data;
      dirty.current = false; setSelected(document); setMessage('Review saved. Stock has not changed.'); await refresh();
    } catch (error) { setMessage(errorText(error)); } finally { setBusy(false); }
  };
  const post = async event => {
    event.preventDefault(); if (!checked) return;
    const payload = purchasePayload(draft);
    if (manual) { payload.storeId = activeStoreId; payload.noReceiptReason = draft.noReceiptReason; }
    else payload.expectedUpdatedAt = selected.updatedAt;
    setBusy(true); setMessage('');
    try {
      const key = requestKey({ documentId: selected?.id, manual, payload });
      const result = manual ? await invoiceService.manual(payload, key) : await invoiceService.approve(selected.id, payload, key);
      dirty.current = false; setDraft(null); setSelected(null); setManual(false); setChecked(false);
      setMessage(`Purchase ${result.data.invoiceNumber} posted for ${currency(result.data.totalCost)}. Stock received at cost.`);
      try { await Promise.all([refresh(), refreshStoreData(activeStoreId)]); }
      catch { setMessage('Purchase was posted successfully. Refresh the page to reload its records.'); }
    } catch (error) { setMessage(errorText(error)); } finally { setBusy(false); }
  };
  const download = async () => {
    setBusy(true);
    try {
      const result = await invoiceService.download(selected.id); const url = URL.createObjectURL(result.data);
      const link = document.createElement('a'); link.href = url; link.download = selected.filename; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setMessage(errorText(error)); } finally { setBusy(false); }
  };
  const voidPurchase = async event => {
    event.preventDefault(); setBusy(true);
    try {
      await invoiceService.voidPurchase(voiding.id, voidReason, requestKey({ id: voiding.id, voidReason }));
      dirty.current = false; setVoiding(null); setVoidReason(''); setSelected(null); setDraft(null);
      setMessage('Purchase voided. Untouched stock was reversed and the original record retained. Reopen its invoice to correct and post it again.');
      await Promise.all([refresh(), refreshStoreData(activeStoreId)]);
    } catch (error) { setMessage(errorText(error)); } finally { setBusy(false); }
  };
  const subtotal = draft?.lines.reduce((sum,line) => sum + Number(line.quantity || 0) * Number(line.unitCost || 0), 0) || 0;
  const computed = subtotal - Number(draft?.discount || 0) + Number(draft?.extraCharges || 0);
  const matches = draft && draft.totalCost !== '' && Math.round(computed * 100) === Math.round(Number(draft.totalCost) * 100);
  const queue = documents.filter(doc => doc.status !== 'POSTED');
  const selectedPurchase = selected?.purchases?.find(purchase => purchase.status === 'POSTED');
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-2xl font-bold">Purchases & Invoice Inbox</h2><p className="text-slate-600 mt-1">Receive stock at supplier cost, with or without a receipt.</p></div>
      {canWrite && <div className="flex flex-wrap gap-2"><button className="btn-secondary" disabled={busy || dataLoading} onClick={() => {
        if (!leaveDraft()) return; dirty.current = false; request.current = null; setSelected(null); setManual(true); setChecked(false);
        setDraft(buildInvoiceDraft(null, inventory, vendors, storeDate));
      }}>Purchase without receipt</button><label className={`btn-primary flex gap-2 items-center ${busy ? 'opacity-50' : 'cursor-pointer'}`}><Upload size={18} />Upload invoice<input aria-label="Upload invoice" type="file" accept="application/pdf,image/png,image/jpeg" className="hidden" disabled={busy || dataLoading} onChange={upload} /></label></div>}
    </div>
    {message && <div role="status" className="p-4 rounded-lg border border-blue-200 bg-blue-50 text-blue-900">{message}</div>}
    {capabilities && !capabilities.extractionAvailable && <p className="p-4 bg-amber-50 rounded-lg text-amber-900">Automatic extraction is unavailable. You can upload a file and enter its details, or record a purchase without a receipt.</p>}
    <section className="glass-panel p-6 space-y-4"><div className="flex justify-between"><h3 className="font-bold">Review queue ({queue.length})</h3><button className="text-primary text-sm" disabled={busy} onClick={() => refresh().catch(error => setMessage(errorText(error)))}>Refresh records</button></div>
      {queue.length ? queue.map(doc => <div key={doc.id} className="flex flex-wrap items-center justify-between border-t pt-3 gap-3"><div><p className="font-medium break-all">{doc.filename}</p><p className="text-sm text-slate-500">{doc.status} · {new Date(doc.createdAt).toLocaleString()}</p>{doc.error && <p className="text-sm text-rose-700">{doc.error}</p>}</div><button className="btn-secondary" disabled={busy || dataLoading} onClick={() => open(doc)}>Review</button></div>) : <p className="text-slate-500">No invoices awaiting review. Posted purchases appear below.</p>}
    </section>
    {(selected || manual) && <section className="glass-panel p-6 space-y-5">
      <div className="flex justify-between items-start gap-3"><div><h3 className="text-lg font-bold break-all">{manual ? 'Purchase without receipt' : selected.filename}</h3><p className="text-slate-500 text-sm">{selected?.status === 'POSTED' ? 'Saved purchase details. Uploading this file again does not create another delivery.' : 'Review the delivery, choose each product and package, and check costs before posting.'}</p></div><button aria-label="Close review" disabled={busy} onClick={() => { if (leaveDraft()) { dirty.current = false; setSelected(null); setDraft(null); setManual(false); } }}><X /></button></div>
      {selected && <div className="flex flex-wrap gap-3"><button disabled={busy} className="btn-secondary flex gap-2 items-center" onClick={download}><Download size={16} />Original file</button>{canWrite && selected.status !== 'POSTED' && <button className="btn-secondary" disabled={busy || !capabilities?.extractionAvailable} onClick={extract}>{busy ? 'Working…' : selected.extraction ? 'Extract again' : 'Extract invoice'}</button>}
        {canWrite && selected.extraction && selected.status !== 'POSTED' && <button className="btn-secondary" disabled={busy} onClick={() => { if (!window.confirm('Replace this review with extracted values? You must check the mappings again.')) return; change(buildInvoiceDraft(selected, inventory, vendors, storeDate, true)); }}>Use extracted values</button>}
      </div>}
      {selected?.error && <p className="text-rose-700">{selected.error}</p>}
      {selected?.extraction && selected.status !== 'POSTED' && <details className="rounded-lg border p-3"><summary className="cursor-pointer font-medium">Read extracted invoice text and warnings</summary><p className="mt-3">{selected.extraction.vendorName || 'Unknown supplier'} · {selected.extraction.invoiceNumber || 'Invoice number missing'}</p>{selected.extraction.warnings?.map((warning,i) => <p key={i} className="text-amber-800">{warning}</p>)}<div className="overflow-x-auto"><table className="w-full text-sm mt-3"><thead><tr><th className="text-left">Printed item / SKU</th><th>Package</th><th>Quantity</th><th>Cost / package</th></tr></thead><tbody>{selected.extraction.items?.map((line,i) => <tr key={i} className="border-t"><td className="p-2">{line.description} · {line.sku || 'No SKU'}{line.uncertainty && <p className="text-amber-800">{line.uncertainty}</p>}</td><td className="p-2">{line.unitLabel || 'Unclear'} ({line.unitsPerPackage ?? '?'} units)</td><td className="p-2">{line.quantity ?? '?'}</td><td className="p-2">{line.unitCost == null ? '?' : currency(line.unitCost)}</td></tr>)}</tbody></table></div></details>}
      {selectedPurchase && <PurchaseDetails purchase={selectedPurchase} />}
      {draft && <form ref={formRef} onSubmit={post} className="space-y-5"><fieldset disabled={busy || !canWrite || dataLoading} className="space-y-5 disabled:opacity-70">
        <p className="text-sm text-slate-600">{selected?.reviewDraft ? 'Loaded your saved review.' : selected?.extraction ? 'Loaded extracted values. Unmatched fields need your selection.' : 'Manual entry: fill in the delivery details.'} Costs below are per selected package.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Field label="Supplier"><select required className={inputClass} value={draft.vendorId} onChange={e => change({ vendorId: e.target.value })}><option value="">Select supplier</option>{vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field>
          <Field label={manual ? 'Reference (optional; otherwise generated)' : 'Invoice number'}><input required={!manual} maxLength={100} className={inputClass} value={draft.invoiceNumber} onChange={e => change({ invoiceNumber: e.target.value })} /></Field>
          <Field label="Receipt date"><input required type="date" max={storeDate} className={inputClass} value={draft.date} onChange={e => change({ date: e.target.value })} /></Field>
          {manual && <Field label="Why no receipt? / delivery reference"><input required minLength={5} maxLength={500} className={inputClass} value={draft.noReceiptReason} onChange={e => change({ noReceiptReason: e.target.value })} /></Field>}
          {['discount', 'extraCharges', 'totalCost'].map(field => <Field key={field} label={{ discount: 'Invoice discount ($)', extraCharges: 'Freight / tax / other charges ($)', totalCost: 'Invoice / agreed total ($)' }[field]}><input required type="number" min="0" step="0.01" className={inputClass} value={draft[field]} onChange={e => change({ [field]: e.target.value })} /></Field>)}
          <Field label="Additional charges"><select className={inputClass} value={draft.chargesTreatment} onChange={e => change({ chargesTreatment: e.target.value })}><option value="CAPITALIZE">Include in stock cost</option><option value="EXPENSE">Record separately as expense</option></select></Field>
        </div>
        {!inventory.length && <p className="text-amber-800">Add products in Inventory and a supplier in Vendors before receiving a purchase.</p>}
        {draft.lines.map((line,index) => { const product = inventory.find(item => item.id === line.inventoryId); const pack = product?.catalog?.packages.find(p => p.id === line.packageId); return <div className="rounded-xl border p-4 space-y-3" key={index}>
          <div className="flex justify-between"><strong>Item {index + 1}</strong><button type="button" disabled={draft.lines.length === 1} className="text-rose-700 disabled:opacity-40" onClick={() => change({ lines: draft.lines.filter((_,i) => i !== index) })}>Remove</button></div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Field label="Printed description"><input required maxLength={200} className={inputClass} value={line.supplierDescription} onChange={e => changeLine(index, { supplierDescription: e.target.value })} /></Field>
            <Field label="Inventory product"><select required className={inputClass} value={line.inventoryId} onChange={e => { const item = inventory.find(p => p.id === e.target.value); changeLine(index, { inventoryId: e.target.value, packageId: '', supplierDescription: line.supplierDescription || item?.name || '' }); }}><option value="">Select matching product</option>{inventory.map(item => <option key={item.id} value={item.id}>{item.name} · {item.sku}</option>)}</select></Field>
            <Field label="Delivered package"><select required className={inputClass} value={line.packageId} onChange={e => changeLine(index, { packageId: e.target.value })}><option value="">Select package explicitly</option>{product?.catalog?.packages.map(p => <option key={p.id} value={p.id}>{p.name} · {p.unitsPerPackage} units</option>)}</select></Field>
            <Field label="Number of packages"><input required type="number" min="1" max="100000" step="1" className={inputClass} value={line.quantity} onChange={e => changeLine(index, { quantity: e.target.value })} /></Field>
            <Field label="Purchase cost per package ($)"><input required type="number" min="0" step="0.000001" className={inputClass} value={line.unitCost} onChange={e => changeLine(index, { unitCost: e.target.value })} /></Field>
            <Field label="Receive into"><select className={inputClass} value={line.location} onChange={e => changeLine(index, { location: e.target.value })}><option value="BACKROOM">Backroom</option><option value="SHELF">Shelf</option></select></Field>
          </div><p className="text-sm text-slate-600">{pack ? `${Number(line.quantity || 0) * pack.unitsPerPackage} individual units` : 'Choose packaging to confirm the unit count'} · Line cost {currency(Number(line.quantity || 0) * Number(line.unitCost || 0))}</p>
        </div>; })}
        <button type="button" className="btn-secondary flex gap-2 items-center" disabled={draft.lines.length >= 200} onClick={() => change({ lines: [...draft.lines, blankLine()] })}><Plus size={16} />Add item</button>
        <div className={`p-4 rounded-lg ${matches ? 'bg-emerald-50' : 'bg-amber-50'}`}><p>Merchandise {currency(subtotal)} − discount {currency(draft.discount)} + charges {currency(draft.extraCharges)} = <strong>{currency(computed)}</strong></p>{!matches && <p className="text-amber-900">The entered total must match this amount before posting.</p>}</div>
        <label className="flex items-start gap-2 text-sm"><input required type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} />I checked the delivered quantities, product and package mappings, purchase costs, and total.</label>
        <div className="flex flex-wrap gap-3">{selected && <button type="button" className="btn-secondary" onClick={saveDraft}>Save review without receiving stock</button>}<button className="btn-primary" type="submit" disabled={!checked || !matches || !inventory.length}>{busy ? 'Posting…' : 'Post purchase & receive stock'}</button></div>
      </fieldset></form>}
    </section>}
    <section className="glass-panel p-6 space-y-4"><h3 className="font-bold">Purchase history</h3>{!purchases.length && <p className="text-slate-500">No posted purchases yet.</p>}{purchases.map(purchase => <details className="border rounded-lg p-4" key={purchase.id}><summary className="cursor-pointer"><span className="font-medium">{purchase.vendor?.name} · {purchase.invoiceNumber || 'Legacy purchase'}</span><span className="ml-3">{currency(purchase.totalCost)} · {purchase.status} · {purchase.date?.slice(0,10)}</span></summary><PurchaseDetails purchase={purchase} /><div className="flex gap-3 mt-4">{purchase.documentId && <button className="btn-secondary" disabled={busy} onClick={() => open({ id: purchase.documentId })}>Open invoice</button>}{currentUser?.role === 'OWNER' && purchase.status === 'POSTED' && <button className="btn-secondary text-rose-700" disabled={busy} onClick={() => { setVoiding(purchase); setVoidReason(''); }}>Correct mistaken purchase</button>}</div></details>)}</section>
    {voiding && <form onSubmit={voidPurchase} className="glass-panel p-6 space-y-4"><h3 className="font-bold">Void {voiding.invoiceNumber}?</h3><p>This reverses the receipt only if its stock is still untouched and the business day is open. The original purchase remains in history. Stock already used or moved needs a separate correction.</p><Field label="Correction reason"><input autoFocus required minLength={5} maxLength={500} disabled={busy} className={inputClass} value={voidReason} onChange={e => setVoidReason(e.target.value)} /></Field><button disabled={busy} type="submit" className="btn-primary">Void purchase and reverse stock</button><button disabled={busy} type="button" className="btn-secondary ml-3" onClick={() => setVoiding(null)}>Cancel</button></form>}
  </div>;
}
function PurchaseDetails({ purchase }) {
  return <div className="mt-4 space-y-2 text-sm"><p>{purchase.source === 'MANUAL' ? `Without receipt: ${purchase.noReceiptReason}` : 'Received from supplier invoice'}</p><p>Merchandise {currency(purchase.subtotal)} − discount {currency(purchase.discount)} + charges {currency(purchase.extraCharges)} = <strong>{currency(purchase.totalCost)}</strong></p>{purchase.voidReason && <p className="text-rose-700">Voided: {purchase.voidReason}</p>}<div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th>Product</th><th>Package</th><th>Quantity</th><th>Purchase cost / package</th><th>Location</th></tr></thead><tbody>{purchase.lines.map(line => <tr key={line.id} className="border-t"><td className="py-2">{line.productName}</td><td>{line.packageName} ({line.unitsPerPackage} units)</td><td>{line.quantity}</td><td>{currency(line.unitCost)}</td><td>{line.location}</td></tr>)}</tbody></table></div></div>;
}
