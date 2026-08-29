import { createAdminClient } from '@/lib/supabase/admin'

const token = process.env.TELEGRAM_BOT_TOKEN
const apiBase = token ? `https://api.telegram.org/bot${token}` : null

async function telegram(method: string, body: Record<string, unknown>) {
  if (!apiBase) throw new Error('TELEGRAM_BOT_TOKEN is not configured')
  const res = await fetch(`${apiBase}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' })
  const raw = await res.text()
  let json: any = null
  try { json = JSON.parse(raw) } catch {}
  console.log(`[telegram] ${method} HTTP ${res.status}`, json?.ok, json?.description || '')
  if (!res.ok || !json?.ok) throw new Error(json?.description || `Telegram ${method} failed (HTTP ${res.status})`)
  return json.result
}

export async function sendTelegramMessage(chatId: string, text: string, replyMarkup?: unknown) {
  return telegram('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) })
}

export function leadKeyboard(leadId: string) {
  return { inline_keyboard: [
    [{ text: '📞 Contacted', callback_data: `lead:${leadId}:contacted` }, { text: '👍 Interested', callback_data: `lead:${leadId}:interested` }],
    [{ text: '🧾 Quote Sent', callback_data: `lead:${leadId}:quotation_sent` }, { text: '✅ Booked', callback_data: `lead:${leadId}:booking_confirmed` }],
    [{ text: '❌ Lost', callback_data: `lead:${leadId}:lost` }],
  ] }
}

export function formatLeadMessage(lead: any, companyName: string) {
  const route = [lead.pickup_location, lead.drop_location].filter(Boolean).join(' → ') || 'Not specified'
  return [`<b>🚚 New Easy Shift Lead</b>`, `<b>Lead:</b> ${lead.lead_number}`, `<b>Customer:</b> ${lead.name}`, `<b>Mobile:</b> ${lead.mobile}`, `<b>Route:</b> ${route}`, `<b>Moving date:</b> ${lead.moving_date || 'Not specified'}`, `<b>Service:</b> ${lead.service_type || 'Not specified'}`, `<b>Property:</b> ${lead.property_size || 'Not specified'}`, `<b>Source:</b> ${lead.source || 'Unknown'}`, `<b>Assigned to:</b> ${companyName}`, '', `Use the buttons below to update this lead.`, `For a quote or booking amount, reply to this message with <b>QUOTE 25000</b> or <b>BOOKED 45000</b>.`].join('\n')
}

export async function notifyPartnersForLead(leadId: string) {
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not configured')
  const supabase = createAdminClient()
  const [{ data: lead, error: leadError }, { data: assignments, error: assignmentError }] = await Promise.all([
    supabase.from('leads').select('id,lead_number,name,mobile,pickup_location,drop_location,moving_date,service_type,property_size,source').eq('id', leadId).single(),
    supabase.from('lead_assignments').select('id,company_id,telegram_chat_id').eq('lead_id', leadId).eq('status', 'active'),
  ])
  if (leadError) throw new Error(`Lead lookup failed: ${leadError.message}`)
  if (assignmentError) throw new Error(`Assignment lookup failed: ${assignmentError.message}`)
  if (!lead || !assignments?.length) throw new Error('No active lead assignment found')
  const companyIds = assignments.map(a => a.company_id)
  const { data: companies, error: companyError } = await supabase.from('companies').select('id,name,telegram_chat_id').in('id', companyIds).eq('status', 'active').eq('is_owner', false)
  if (companyError) throw new Error(`Company lookup failed: ${companyError.message}`)
  let sent = 0
  for (const company of companies ?? []) {
    if (!company.telegram_chat_id) {
      console.warn('[telegram] Company has no Telegram chat ID', company.id, company.name)
      continue
    }
    try {
      const result = await sendTelegramMessage(company.telegram_chat_id, formatLeadMessage(lead, company.name), leadKeyboard(lead.id))
      const messageId = result?.message_id
      if (!messageId) throw new Error('Telegram returned no message_id')
      const { error: updateError } = await supabase.from('lead_assignments').update({ telegram_chat_id: company.telegram_chat_id, telegram_message_id: messageId }).eq('lead_id', lead.id).eq('company_id', company.id).eq('status', 'active')
      if (updateError) throw new Error(`Assignment update failed: ${updateError.message}`)
      sent++
      console.log('[telegram] Lead notification sent', leadId, company.name, messageId)
    } catch (error) {
      console.error('[telegram] Lead notification failed', company.id, company.name, error)
      throw error
    }
  }
  if (!sent) throw new Error('No partner Telegram notification was sent')
}

export async function answerTelegramCallback(callbackQueryId: string, text: string) {
  return telegram('answerCallbackQuery', { callback_query_id: callbackQueryId, text, show_alert: false })
}

export async function editTelegramMessage(chatId: string, messageId: number, text: string, replyMarkup?: unknown) {
  return telegram('editMessageText', { chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) })
}
