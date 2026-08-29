'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { sendTelegramMessage, formatLeadMessage, leadKeyboard } from '@/lib/telegram'

function formValue(formData: FormData, name: string) {
  const value = formData.get(name)
  return value == null ? null : String(value).trim() || null
}

async function getSessionProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data } = await supabase.rpc('get_my_profile')
  const profile = data?.[0]
  if (!profile || profile.status !== 'active') redirect('/login')
  return { supabase, profile }
}

export async function createLead(formData: FormData) {
  const { supabase, profile } = await getSessionProfile()
  if (profile.role !== 'super_admin') redirect('/')

  const { data: leadId, error } = await supabase.rpc('create_lead_admin', {
    p_name: formValue(formData, 'name') || '',
    p_mobile: formValue(formData, 'mobile') || '',
    p_alternate_mobile: formValue(formData, 'alternate_mobile'),
    p_email: formValue(formData, 'email'),
    p_pickup: formValue(formData, 'pickup_location'),
    p_drop: formValue(formData, 'drop_location'),
    p_moving_date: formValue(formData, 'moving_date'),
    p_service_type: formValue(formData, 'service_type'),
    p_property_size: formValue(formData, 'property_size'),
    p_source: formValue(formData, 'source') || 'manual',
    p_source_detail: formValue(formData, 'source_detail'),
    p_notes: formValue(formData, 'notes'),
    p_gclid: formValue(formData, 'gclid'),
    p_gbraid: formValue(formData, 'gbraid'),
    p_wbraid: formValue(formData, 'wbraid'),
    p_fbclid: formValue(formData, 'fbclid'),
    p_utm_source: formValue(formData, 'utm_source'),
    p_utm_medium: formValue(formData, 'utm_medium'),
    p_utm_campaign: formValue(formData, 'utm_campaign'),
    p_utm_term: formValue(formData, 'utm_term'),
    p_utm_content: formValue(formData, 'utm_content'),
    p_landing_page: formValue(formData, 'landing_page'),
    p_referrer: formValue(formData, 'referrer'),
  })

  if (error || !leadId) throw new Error(error?.message || 'Lead was not created')

  // Use the same authenticated Supabase connection that created the lead.
  // This avoids the production service-role lookup mismatch that previously
  // caused /api/telegram/notify to report the lead as missing.
  try {
    const id = String(leadId)
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('id,lead_number,name,mobile,pickup_location,drop_location,moving_date,service_type,property_size,source')
      .eq('id', id)
      .maybeSingle()
    if (leadError) throw new Error(`Lead lookup failed: ${leadError.message}`)
    if (!lead) throw new Error(`Lead not found after creation: ${id}`)

    const { data: assignments, error: assignmentError } = await supabase
      .from('lead_assignments')
      .select('id,company_id,telegram_chat_id')
      .eq('lead_id', id)
      .eq('status', 'active')
    if (assignmentError) throw new Error(`Assignment lookup failed: ${assignmentError.message}`)

    const companyIds = (assignments ?? []).map(a => a.company_id)
    if (!companyIds.length) throw new Error('No active lead assignment found')

    const { data: companies, error: companyError } = await supabase
      .from('companies')
      .select('id,name,telegram_chat_id')
      .in('id', companyIds)
      .eq('status', 'active')
      .eq('is_owner', false)
    if (companyError) throw new Error(`Company lookup failed: ${companyError.message}`)

    let sent = 0
    for (const company of companies ?? []) {
      if (!company.telegram_chat_id) {
        console.warn('[telegram] Company has no Telegram chat ID', company.id, company.name)
        continue
      }
      try {
        const result = await sendTelegramMessage(
          company.telegram_chat_id,
          formatLeadMessage(lead, company.name),
          leadKeyboard(lead.id)
        )
        const messageId = result?.message_id
        if (!messageId) throw new Error('Telegram returned no message_id')
        const { error: updateError } = await supabase
          .from('lead_assignments')
          .update({ telegram_chat_id: company.telegram_chat_id, telegram_message_id: messageId })
          .eq('lead_id', lead.id)
          .eq('company_id', company.id)
          .eq('status', 'active')
        if (updateError) throw new Error(`Assignment update failed: ${updateError.message}`)
        sent++
        console.log('[telegram] Lead notification sent', lead.id, company.name, messageId)
      } catch (telegramError) {
        console.error('[telegram] Lead notification failed', company.id, company.name, telegramError)
      }
    }
    if (!sent) throw new Error('No partner Telegram notification was sent')
  } catch (telegramError) {
    console.error('Lead created but Telegram notification failed', telegramError)
  }

  revalidatePath('/leads')
  revalidatePath('/')
}

export async function updateLeadStatus(formData: FormData) {
  const { supabase } = await getSessionProfile()
  const id = String(formData.get('id') || '')
  const status = String(formData.get('status') || '') as any
  if (!id || !status) return
  const { error } = await supabase.from('leads').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/leads')
  revalidatePath('/')
}

export async function assignLead(formData: FormData) {
  const { supabase, profile } = await getSessionProfile()
  if (profile.role !== 'super_admin') redirect('/')
  const leadId = String(formData.get('lead_id') || '')
  const companyId = String(formData.get('company_id') || '')
  if (!leadId || !companyId) return
  const { error } = await supabase.rpc('assign_lead_admin', { p_lead_id: leadId, p_company_id: companyId, p_reason: String(formData.get('reason') || '') })
  if (error) throw new Error(error.message)
  revalidatePath('/leads')
  revalidatePath('/assignments')
  revalidatePath('/')
}

export async function unassignLead(formData: FormData) {
  const { supabase, profile } = await getSessionProfile()
  if (profile.role !== 'super_admin') redirect('/')
  const leadId = String(formData.get('lead_id') || '')
  if (!leadId) return
  const { error } = await supabase.rpc('unassign_lead_admin', { p_lead_id: leadId, p_reason: String(formData.get('reason') || '') })
  if (error) throw new Error(error.message)
  revalidatePath('/leads')
  revalidatePath('/assignments')
  revalidatePath('/')
}
