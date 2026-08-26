'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data } = await supabase.rpc('get_my_profile')
  const profile = data?.[0]
  if (!profile || profile.role !== 'super_admin' || profile.status !== 'active') redirect('/')
  return supabase
}

export async function createPartner(formData: FormData) {
  const supabase = await requireAdmin()
  const name = String(formData.get('name') || '').trim()
  const code = String(formData.get('company_code') || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '_')
  const contact = String(formData.get('contact_person') || '').trim() || null
  const phone = String(formData.get('phone') || '').trim() || null
  const email = String(formData.get('email') || '').trim() || null
  if (!name || !code) return
  const { error } = await supabase.rpc('admin_create_company', {
    p_name: name,
    p_company_code: code,
    p_contact_person: contact,
    p_phone: phone,
    p_email: email,
  })
  if (error) console.error('admin_create_company failed', error)
  revalidatePath('/partners')
  revalidatePath('/')
}

export async function updatePartner(formData: FormData) {
  const supabase = await requireAdmin()
  const id = String(formData.get('id') || '')
  const name = String(formData.get('name') || '').trim()
  const contact = String(formData.get('contact_person') || '').trim() || null
  const phone = String(formData.get('phone') || '').trim() || null
  const email = String(formData.get('email') || '').trim() || null
  const status = String(formData.get('status') || 'active')
  if (!id || !name || !['active', 'inactive'].includes(status)) return
  const { error } = await supabase.rpc('admin_update_company', {
    p_id: id,
    p_name: name,
    p_contact_person: contact,
    p_phone: phone,
    p_email: email,
    p_status: status,
  })
  if (error) console.error('admin_update_company failed', error)
  revalidatePath('/partners')
  revalidatePath('/')
}
