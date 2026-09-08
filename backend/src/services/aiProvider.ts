import { fail } from './operations';
export const aiConfigured = () => Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL);
export async function responses(body: Record<string, unknown>): Promise<any> {
  if (!aiConfigured()) return fail('AI is not configured. Set OPENAI_API_KEY and OPENAI_MODEL on the backend. Manual invoice entry and guided database queries remain available.', 503);
  let response: Response;
  try {
    response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL, store: false, max_output_tokens: 5000, ...body }), signal: AbortSignal.timeout(55000) });
  } catch { return fail('AI request timed out or could not connect. Retry or use manual entry.', 502); }
  if (!response.ok) return fail(`AI service returned HTTP ${response.status}. Check backend model access, billing, and configuration.`,502);
  const data: any = await response.json();
  if (data.status && data.status !== 'completed') return fail('AI did not complete the request. Retry or enter the information manually.',502);
  return data;
}
export function responseText(response: any) {
  const text = (response.output || []).flatMap((item: any) => item.type === 'message' ? item.content || [] : []).filter((part: any) => part.type === 'output_text').map((part: any) => part.text).join('\n');
  if (!text) return fail('AI returned no usable extraction. Use manual entry or retry.',502);
  return text;
}
