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
            const updated = `${callback.message.text}\n\n<b>Partner response:</b> ${esc(label)}`
            try {
              await editTelegramMessage(chatId, messageId, updated, leadKeyboard(leadId))
            } catch (editError) {
              console.warn('[telegram] Could not edit callback message; confirmation was sent', editError)
            }
          }
        }
      } else {
        await answerTelegramCallback(callback.id, 'Invalid action')
      }
      return NextResponse.json({ ok: true })
    }

    const message = update.message
    if (!message) return NextResponse.json({ ok: true })
    const chatId = String(message.chat?.id ?? '')
    const text = String(message.text || '').trim()

    if (text === '/start' || text === '/help') {
      const { data: company } = await supabase.from('companies').select('name,status,is_owner').eq('telegram_chat_id', chatId).maybeSingle()
      if (!company) {
        await sendTelegramMessage(chatId, `<b>Easy Shift CRM</b>\n\nYour Telegram is not linked to a partner company yet.\n\nPlease send this Chat ID to Easy Shift Admin:\n<b>${esc(chatId)}</b>`)
      } else {
        await sendTelegramMessage(chatId, `<b>Easy Shift CRM</b>\nCompany: ${esc(company.name)}\n\nYou will receive new leads here automatically. Use the buttons on each lead to update the response.`)
      }
      return NextResponse.json({ ok: true })
    }

    // Amount updates support BOTH safe methods:
    // 1) Reply directly to the lead message: QUOTE 25000 / BOOKED 45000
    // 2) Include the unique Lead Number: QUOTE ES-20260829-123456-ABCD 25000
    // A reply can also fall back to the Lead Number printed in the replied-to message.
    const replyMessageId = Number(message.reply_to_message?.message_id ?? 0)
    const replyText = String(message.reply_to_message?.text || '')
    const replyAmountMatch = text.match(/^(QUOTE|BOOKED)\s+([0-9,]+)$/i)
    const leadNumberAmountMatch = text.match(/^(QUOTE|BOOKED)\s+(ES-[A-Z0-9-]+)\s+([0-9,]+)$/i)

    if (replyAmountMatch || leadNumberAmountMatch) {
      const kind = String((replyAmountMatch || leadNumberAmountMatch)?.[1] || '').toUpperCase()
      const amountText = String((replyAmountMatch || leadNumberAmountMatch)?.[replyAmountMatch ? 2 : 3] || '')
      const leadNumber = (leadNumberAmountMatch?.[2] || extractLeadNumber(replyText)).toUpperCase()
      const amount = Number(amountText.replace(/,/g, ''))
      let leadId = ''
      let resolvedLeadNumber = leadNumber

      // Preferred reply lookup: exact Telegram message ID + current partner chat.
      if (replyMessageId) {
        const { data: assignments, error: assignmentError } = await supabase
          .from('lead_assignments')
          .select('lead_id, leads(lead_number)')
          .eq('telegram_chat_id', chatId)
          .eq('telegram_message_id', replyMessageId)
          .eq('status', 'active')
          .limit(1)
        if (assignmentError) {
          console.warn('[telegram] reply assignment lookup failed', assignmentError)
        } else if (assignments?.[0]?.lead_id) {
          leadId = assignments[0].lead_id
          const nestedLead = Array.isArray(assignments[0].leads) ? assignments[0].leads[0] : assignments[0].leads
          resolvedLeadNumber = String(nestedLead?.lead_number || resolvedLeadNumber).toUpperCase()
        }
      }

      // Fallback for replies where the message ID was not stored: extract the Lead Number
      // from the original Telegram message being replied to.
      if (!leadId && resolvedLeadNumber) {
        const { data: leads, error: leadError } = await supabase
          .from('leads')
          .select('id,lead_number')
          .eq('lead_number', resolvedLeadNumber)
          .limit(1)
        if (leadError) {
          await sendTelegramMessage(chatId, `❌ Could not find lead <b>${esc(resolvedLeadNumber)}</b>: ${esc(leadError.message)}`)
          return NextResponse.json({ ok: true })
        }
        if (leads?.[0]) leadId = leads[0].id
      }

      // Final safety check: the lead must have an active assignment to this Telegram chat.
      if (leadId) {
        const { data: assigned } = await supabase
          .from('lead_assignments')
          .select('id,lead_id')
          .eq('lead_id', leadId)
          .eq('telegram_chat_id', chatId)
          .eq('status', 'active')
          .limit(1)
        if (!assigned?.[0]) leadId = ''
      }

      if (!leadId) {
        await sendTelegramMessage(chatId, resolvedLeadNumber
          ? `❌ Lead <b>${esc(resolvedLeadNumber)}</b> is not assigned to this Telegram group.`
          : '❌ I could not identify the lead. Reply directly to the lead message, or use: <b>QUOTE LeadNumber 25000</b> / <b>BOOKED LeadNumber 45000</b>.')
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
        const numberLabel = resolvedLeadNumber ? `\nLead: <b>${esc(resolvedLeadNumber)}</b>` : ''
        const amountLabel = kind === 'QUOTE' ? 'Quote Amount' : 'Booking Value'
        await sendTelegramMessage(chatId, `✅ <b>${kind === 'QUOTE' ? 'Quote' : 'Booking'} recorded</b>${numberLabel}\n${amountLabel}: <b>₹${amount.toLocaleString('en-IN')}</b>\nStatus: <b>${esc(label)}</b>`)
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
