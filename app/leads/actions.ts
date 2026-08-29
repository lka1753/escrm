'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { notifyPartnersForLead } from '@/lib/telegram'

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

  // Send through a dedicated Vercel route so Telegram delivery is isolated from the form request.
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://escrm-puce.vercel.app'
    const internalKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (internalKey) {
      const response = await fetch(`${baseUrl}/api/telegram/notify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-crm-internal-key': internalKey },
        body: JSON.stringify({ leadId: String(leadId) }),
        cache: 'no-store',
      })
      if (!response.ok) console.error('Telegram notify endpoint returned', response.status, await response.text().catch(() => ''))
    } else {
      await notifyPartnersForLead(String(leadId))
    }
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
