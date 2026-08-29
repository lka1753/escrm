import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { answerTelegramCallback, editTelegramMessage, leadKeyboard, sendTelegramMessage } from '@/lib/telegram'

export const runtime = 'nodejs'

function esc(value: unknown) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function webhookAuthorized(req: NextRequest) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET
  if (!expected) return true
  return req.headers.get('x-telegram-bot-api-secret-token') === expected
}

function extractLeadNumber(value: unknown) {
  const match = String(value || '').match(/\bES-[A-Z0-9-]+\b/i)
  return match?.[0]?.toUpperCase() || ''
}

export async function POST(req: NextRequest) {
  if (!webhookAuthorized(req)) return new NextResponse('Unauthorized', { status: 401 })
  const update = await req.json().catch(() => null)
  if (!update) return NextResponse.json({ ok: true })

  try {
    const supabase = createAdminClient()
    const callback = update.callback_query
    if (callback) {
      const chatId = String(callback.message?.chat?.id ?? '')
      const messageId = Number(callback.message?.message_id ?? 0)
      const parts = String(callback.data || '').split(':')
      if (parts.length === 3 && parts[0] === 'lead') {
        const leadId = parts[1]
        const responseStatus = parts[2]
        const { error } = await supabase.rpc('telegram_update_assignment', { p_lead_id: leadId, p_chat_id: chatId, p_response_status: responseStatus, p_message_id: messageId })
        if (error) {
          await answerTelegramCallback(callback.id, 'Could not update this lead.')
          await sendTelegramMessage(chatId, `❌ <b>Lead update failed</b>\n\n${esc(error.message)}`)
        } else {
          const label = responseStatus.replaceAll('_', ' ')
          await answerTelegramCallback(callback.id, `Updated: ${label}`)
          await sendTelegramMessage(chatId, `✅ <b>Status updated</b>\nLead response: <b>${esc(label)}</b>`)
          if (callback.message?.text) {
            try {
              await editTelegramMessage(chatId, messageId, `${callback.message.text}\n\n<b>Partner response:</b> ${esc(label)}`, leadKeyboard(leadId))
            } catch (e) {
              console.warn('[telegram] message edit failed after successful status update', e)
            }
          }
        }
      } else await answerTelegramCallback(callback.id, 'Invalid action')
      return NextResponse.json({ ok: true })
    }

    const message = update.message
    if (!message) return NextResponse.json({ ok: true })
    const chatId = String(message.chat?.id ?? '')
    const text = String(message.text || '').trim()

    if (text === '/start' || text === '/help') {
      const { data: companies, error: companyError } = await supabase
        .from('companies')
        .select('name,status,is_owner')
        .eq('telegram_chat_id', chatId)
        .limit(20)
      const company = companies?.find((c: any) => c.status === 'active' && c.is_owner === false)
      if (companyError) console.warn('[telegram] company lookup failed', companyError)
      await sendTelegramMessage(chatId, company
        ? `<b>Easy Shift CRM</b>\nCompany: ${esc(company.name)}\n\nYou will receive new leads here automatically. Use the buttons on each lead to update the response.`
        : `<b>Easy Shift CRM</b>\n\nYour Telegram is not linked to a partner company yet.\n\nPlease send this Chat ID to Easy Shift Admin:\n<b>${esc(chatId)}</b>`)
      return NextResponse.json({ ok: true })
    }

    const replyMessageId = Number(message.reply_to_message?.message_id ?? 0)
    const replyText = String(message.reply_to_message?.text || '')
    const replyMatch = text.match(/^(QUOTE|BOOKED)\s+([0-9,]+)$/i)
    const numberMatch = text.match(/^(QUOTE|BOOKED)\s+(ES-[A-Z0-9-]+)\s+([0-9,]+)$/i)

    if (replyMatch || numberMatch) {
      const kind = String((replyMatch || numberMatch)?.[1] || '').toUpperCase()
      const amountText = String((replyMatch || numberMatch)?.[replyMatch ? 2 : 3] || '')
      const suppliedLeadNumber = numberMatch?.[2] || ''
      const repliedLeadNumber = extractLeadNumber(replyText)
      const amount = Number(amountText.replace(/,/g, ''))

      // Resolve the partner by Telegram chat ID without using maybeSingle().
      // This is deliberately tolerant of duplicate/legacy company rows while still
      // requiring an active non-owner partner company.
      const { data: companies, error: companyError } = await supabase
        .from('companies')
        .select('id,name,status,is_owner,telegram_chat_id')
        .eq('telegram_chat_id', chatId)
        .limit(20)
      const company = companies?.find((c: any) => c.status === 'active' && c.is_owner === false)
      if (companyError) console.warn('[telegram] quote company lookup failed', { chatId, error: companyError })
      if (!company) {
        console.warn('[telegram] no active partner company for Telegram chat', { chatId, companies })
        await sendTelegramMessage(chatId, '❌ This Telegram group is not linked to an active partner company.')
        return NextResponse.json({ ok: true })
      }

      let leadId = ''
      let leadNumber = (suppliedLeadNumber || repliedLeadNumber).toUpperCase()

      // First preference: exact assignment message in this Telegram group.
      if (replyMessageId) {
        const { data: assignments, error: assignmentError } = await supabase
          .from('lead_assignments')
          .select('lead_id,leads(lead_number)')
          .eq('company_id', company.id)
          .eq('telegram_chat_id', chatId)
          .eq('telegram_message_id', replyMessageId)
          .eq('status', 'active')
          .limit(1)
        if (assignmentError) console.warn('[telegram] reply assignment lookup failed', assignmentError)
        const assignment = assignments?.[0]
        if (assignment?.lead_id) {
          leadId = assignment.lead_id
          const nested = Array.isArray(assignment.leads) ? assignment.leads[0] : assignment.leads
          leadNumber = String(nested?.lead_number || leadNumber).toUpperCase()
        }
      }

      // Second preference: unique Lead Number, scoped to this partner company.
      if (!leadId && leadNumber) {
        const { data: lead, error: leadError } = await supabase
          .from('leads')
          .select('id,lead_number,assigned_company_id')
          .eq('lead_number', leadNumber)
          .eq('assigned_company_id', company.id)
          .limit(1)
          .maybeSingle()
        if (leadError) console.warn('[telegram] lead number lookup failed', { leadNumber, companyId: company.id, error: leadError })
        if (lead) leadId = lead.id
      }

      if (!leadId) {
        await sendTelegramMessage(chatId, leadNumber
          ? `❌ Lead <b>${esc(leadNumber)}</b> is not assigned to this Telegram group.`
          : '❌ I could not identify the lead. Reply directly to the lead message, or use <b>QUOTE LeadNumber 25000</b> / <b>BOOKED LeadNumber 45000</b>.')
        return NextResponse.json({ ok: true })
      }

      const responseStatus = kind === 'BOOKED' ? 'booking_confirmed' : 'quotation_sent'
      const { error } = await supabase.rpc('telegram_update_assignment', {
        p_lead_id: leadId,
        p_chat_id: chatId,
        p_response_status: responseStatus,
        p_quote_amount: kind === 'QUOTE' ? amount : null,
        p_booking_value: kind === 'BOOKED' ? amount : null,
        p_message_id: replyMessageId || null,
      })

      if (error) {
        await sendTelegramMessage(chatId, `❌ <b>Lead update failed</b>\n\n${esc(error.message)}`)
      } else {
        const label = responseStatus.replaceAll('_', ' ')
        await sendTelegramMessage(chatId, `✅ <b>${kind === 'QUOTE' ? 'Quote' : 'Booking'} recorded</b>\nLead: <b>${esc(leadNumber)}</b>\n${kind === 'QUOTE' ? 'Quote Amount' : 'Booking Value'}: <b>₹${amount.toLocaleString('en-IN')}</b>\nStatus: <b>${esc(label)}</b>`)
      }
      return NextResponse.json({ ok: true })
    }

    await sendTelegramMessage(chatId, 'Use the buttons on a lead message to update the response. For amounts, reply to the lead message with QUOTE 25000 or BOOKED 45000. You can also use QUOTE LeadNumber 25000 or BOOKED LeadNumber 45000.')
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Telegram webhook error', error)
    return NextResponse.json({ ok: true })
  }
}
