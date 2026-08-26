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
  await supabase.from('companies').insert({ name, company_code: code, contact_person: contact, phone, email, is_owner: false, status: 'active' })
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
  if (!id || !name) return
  await supabase.from('companies').update({ name, contact_person: contact, phone, email, status, updated_at: new Date().toISOString() }).eq('id', id).eq('is_owner', false)
  revalidatePath('/partners')
  revalidatePath('/')
}
