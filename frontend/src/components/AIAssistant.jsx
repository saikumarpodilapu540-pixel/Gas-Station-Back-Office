import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Bot, Sparkles } from 'lucide-react';
import { useData } from '../context/DataContext';
import { assistantService } from '../services/api';

export default function AIAssistant() {
  const { activeStoreId } = useData();
  return <StoreAssistant key={activeStoreId} activeStoreId={activeStoreId} />;
}
function StoreAssistant({ activeStoreId }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([{ id: 1, type: 'ai', text: 'Hi! Ask me about fuel sold, profit, low stock, packs and loose bottles, transfers, or outstanding checks.' }]);
  const [input, setInput] = useState(''); const [busy, setBusy] = useState(false); const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  const send = async (event) => {
    event?.preventDefault(); const message = input.trim(); if (!message || busy) return;
    if (!activeStoreId || activeStoreId === 'hq') { setMessages(current => [...current, { id: Date.now(), type: 'ai', text: 'Select one store to ask about its records.' }]); return; }
    setInput(''); setMessages(current => [...current, { id: Date.now(), type: 'user', text: message }]); setBusy(true);
    try { const response = await assistantService.query(activeStoreId ? { message, storeId: activeStoreId } : { message }); setMessages(current => [...current, { id: Date.now() + 1, type: 'ai', text: response.data.answer }]); }
    catch (error) { setMessages(current => [...current, { id: Date.now() + 1, type: 'ai', text: error.response?.data?.error || 'I could not read the store data. Check the connection and try again.' }]); }
    finally { setBusy(false); }
  };
  const suggestions = ['How much fuel sold today?', 'Show low stock items', 'Check invoice purchases', "Today's profit?"];
  return <>
    <button onClick={() => setIsOpen(true)} className={`fixed bottom-6 right-6 p-4 bg-slate-900 text-white rounded-full shadow-2xl z-50 ${isOpen ? 'hidden' : 'flex'} items-center justify-center`}><Sparkles className="w-6 h-6" /></button>
    <AnimatePresence>{isOpen && <motion.div initial={{ opacity: 0, y: 20, scale: .95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: .95 }} className="fixed bottom-6 right-6 w-[350px] sm:w-[400px] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col z-50 overflow-hidden" style={{ height: '600px', maxHeight: '85vh' }}>
      <div className="bg-slate-900 p-4 flex justify-between items-center text-white"><div className="flex items-center gap-2"><Bot className="w-5 h-5 text-blue-400" /><div><h3 className="font-bold text-sm">FuelOps Copilot</h3><p className="text-[10px] text-slate-400 font-medium">Grounded store data assistant</p></div></div><button onClick={() => setIsOpen(false)}><X className="w-5 h-5" /></button></div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">{messages.map(message => <div key={message.id} className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm ${message.type === 'user' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-700'}`}>{message.text}</div></div>)}{busy && <div className="text-xs text-slate-400">Reading store data…</div>}<div ref={endRef} /></div>
      {messages.length === 1 && <div className="p-3 flex flex-wrap gap-2 border-t border-slate-100">{suggestions.map(suggestion => <button key={suggestion} onClick={() => { setInput(suggestion); }} className="text-xs rounded-full bg-slate-100 px-3 py-2 text-slate-600 hover:bg-slate-200">{suggestion}</button>)}</div>}
      <form onSubmit={send} className="p-3 bg-white border-t border-slate-100 flex items-center gap-2"><input value={input} onChange={event => setInput(event.target.value)} placeholder="Ask about your store…" className="flex-1 bg-slate-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none" /><button type="submit" disabled={!input.trim() || busy} className="p-2.5 bg-slate-900 text-white rounded-xl disabled:opacity-50"><Send className="w-4 h-4" /></button></form>
    </motion.div>}</AnimatePresence>
  </>;
}
