import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Bot, Sparkles } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useNavigate } from 'react-router-dom';

export default function AIAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { id: 1, type: 'ai', text: 'Hi! I am your Store Operations Assistant. Ask me about profits, low stock, fuel sales, or tell me to "add 10 Coke".' }
  ]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);
  
  const { calculateKPIs, deptSales, inventory, adjustInventoryStock, getSmartInsights } = useData();
  const navigate = useNavigate();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = (e) => {
    e?.preventDefault();
    if (!input.trim()) return;

    const userMsg = input.trim();
    setMessages(prev => [...prev, { id: Date.now(), type: 'user', text: userMsg }]);
    setInput('');

    // Process intent
    setTimeout(async () => {
      const response = await generateAIResponse(userMsg);
      setMessages(prev => [...prev, { id: Date.now() + 1, type: 'ai', text: response }]);
    }, 600);
  };

  const generateAIResponse = async (rawQuery) => {
    const query = rawQuery.toLowerCase();

    // Action: Add to inventory
    const addMatch = query.match(/add (\d+)\s+(.+)/);
    if (addMatch) {
      const qty = parseInt(addMatch[1]);
      const itemName = addMatch[2].replace('bottles', '').trim();
      
      const found = inventory.find(i => i.name.toLowerCase().includes(itemName));
      if (found) {
        try {
          const nextStock = await adjustInventoryStock(found.id, qty);
          return `✅ I've added ${qty} to your ${found.name} inventory. New stock level is ${nextStock}.`;
        } catch (error) {
          return `I couldn't update ${found.name}: ${error.message}.`;
        }
      } else {
        return `I couldn't find "${itemName}" in your inventory to add stock to.`;
      }
    }

    // Action: View Reports
    if (query.includes('view reports') || query.includes('open reports') || query.includes('show reports')) {
      navigate('/reports');
      return 'Navigating to Reports dashboard...';
    }

    // Action: Create Sale
    if (query.includes('create sale') || query.includes('ring up') || query.includes('terminal')) {
      navigate('/sales-terminal');
      return 'Navigating to Sales Terminal...';
    }

    // Analytics / Profit
    if (query.includes('profit') || query.includes('revenue') || query.includes('today')) {
      const kpi = calculateKPIs();
      return `Today's revenue is $${kpi.revenue.toFixed(2)} with a net profit of $${kpi.profit.toFixed(2)}.`;
    }
    
    // Departments
    if (query.includes('department') || query.includes('best') || query.includes('margin')) {
      const insights = getSmartInsights();
      if (insights.length > 0) return insights[0].text; // E.g. "Hot food is most profitable"
      
      const topDept = deptSales[0];
      if (topDept) {
        return `The best performing department is ${topDept.name} with $${topDept.revenue.toFixed(2)} in revenue.`;
      }
      return "I don't have enough department data right now.";
    }

    // Inventory
    if (query.includes('low stock') || query.includes('inventory')) {
      const low = inventory.filter(i => i.stock <= i.lowStockAlert);
      if (low.length === 0) return "All your inventory items are adequately stocked!";
      const list = low.map(i => `${i.name} (${i.stock} left)`).join(', ');
      return `You have ${low.length} low stock items: ${list}.`;
    }

    // Fuel
    if (query.includes('fuel')) {
      const kpi = calculateKPIs();
      return `You have sold ${kpi.gallons.toFixed(1)} gallons of fuel today.`;
    }

    return "I'm sorry, I don't understand. Try asking about 'profit', 'low stock', 'fuel', or say 'Add 10 Coke'.";
  };

  const suggestions = ["What is today's profit?", "Which department is performing best?", "Show low stock items", "Add 10 Coke"];

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-6 right-6 p-4 bg-slate-900 text-white rounded-full shadow-2xl hover:bg-slate-800 transition-all z-50 ${isOpen ? 'hidden' : 'flex'} items-center justify-center`}
      >
        <Sparkles className="w-6 h-6" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-6 right-6 w-[350px] sm:w-[400px] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col z-50 overflow-hidden"
            style={{ height: '600px', maxHeight: '85vh' }}
          >
            <div className="bg-slate-900 p-4 flex justify-between items-center text-white">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-blue-400" />
                <div>
                  <h3 className="font-bold text-sm">FuelOps Copilot</h3>
                  <p className="text-[10px] text-slate-400 font-medium">Store Operations Assistant</p>
                </div>
              </div>
              <button onClick={() => setIsOpen(false)} className="hover:bg-slate-800 p-1 rounded-lg transition-colors text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
              {messages.map(msg => (
                <div key={msg.id} className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    msg.type === 'user' ? 'bg-slate-900 text-white rounded-tr-sm' : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm shadow-sm'
                  }`}>
                    {msg.text}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Suggestions */}
            {messages.length < 3 && (
              <div className="px-4 pb-2 bg-slate-50/50 flex flex-wrap gap-2">
                {suggestions.map((sug, i) => (
                  <button 
                    key={i} 
                    onClick={() => setInput(sug)}
                    className="text-xs bg-white border border-slate-200 text-slate-600 px-3 py-1.5 rounded-full hover:bg-slate-50 transition-colors"
                  >
                    {sug}
                  </button>
                ))}
              </div>
            )}

            <div className="p-3 bg-white border-t border-slate-100">
              <form onSubmit={handleSend} className="flex items-center gap-2">
                <input 
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask a question or give a command..."
                  className="flex-1 bg-slate-100 border border-transparent rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                />
                <button type="submit" disabled={!input.trim()} className="p-2.5 bg-slate-900 text-white rounded-xl disabled:opacity-50 hover:bg-slate-800 transition-colors">
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
