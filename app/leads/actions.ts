'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

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
  const source = String(formData.get('source') || 'manual') as any
  const { error } = await supabase.rpc('create_lead_admin', {
    p_name: String(formData.get('name') || ''),
    p_mobile: String(formData.get('mobile') || ''),
    p_alternate_mobile: String(formData.get('alternate_mobile') || ''),
    p_email: String(formData.get('email') || ''),
    p_pickup: String(formData.get('pickup_location') || ''),
    p_drop: String(formData.get('drop_location') || ''),
    p_moving_date: String(formData.get('moving_date') || '') || null,
    p_service_type: String(formData.get('service_type') || ''),
    p_property_size: String(formData.get('property_size') || ''),
    p_source: source,
    p_source_detail: String(formData.get('source_detail') || ''),
    p_notes: String(formData.get('notes') || ''),
  })
  if (error) throw new Error(error.message)
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
