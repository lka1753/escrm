import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { createPartner, updatePartner } from './actions'

type Company = {
  id: string
  name: string
  company_code: string
  contact_person: string | null
  phone: string | null
  email: string | null
  status: string
  is_owner: boolean
}

export default async function PartnersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profileRows } = await supabase.rpc('get_my_profile')
  const profile = profileRows?.[0]
  if (!profile || profile.role !== 'super_admin' || profile.status !== 'active') redirect('/')

  const { data } = await supabase.from('companies').select('id,name,company_code,contact_person,phone,email,status,is_owner').order('is_owner', { ascending: false }).order('name')
  const companies = (data ?? []) as Company[]

  return <div className="app">
    <aside className="sidebar"><div className="brand">Easy Shift CRM<small>Lead Distribution System</small></div><nav className="nav">
      <a href="/">Dashboard</a><a href="/leads">Leads</a><a href="/calls">Calls</a><a className="active" href="/partners">Partners</a><a href="/assignments">Assignments</a><a href="/conversions">Conversions</a><a href="/reports">Reports</a><a href="/users">Users</a><a href="/settings">Settings</a>
    </nav></aside>
    <main className="main">
      <header className="top"><div className="title"><h1>Partner Companies</h1><p>Manage the companies that receive Easy Shift leads</p></div><div className="admin-wrap"><div className="admin">{profile.full_name} · Super Admin</div><form action="/auth/signout" method="post"><button className="signout" type="submit">Sign out</button></form></div></header>

      <section className="section"><div className="section-head"><h2>Add Partner Company</h2><span className="link">Super Admin only</span></div><div className="card">
        <form action={createPartner} className="partner-form">
          <div><label>Company name</label><input name="name" required placeholder="e.g. ABC Packers" /></div>
          <div><label>Company code</label><input name="company_code" required placeholder="e.g. ABC" /></div>
          <div><label>Contact person</label><input name="contact_person" placeholder="Optional" /></div>
          <div><label>Phone</label><input name="phone" inputMode="tel" placeholder="Optional" /></div>
          <div><label>Email</label><input name="email" type="email" placeholder="Optional" /></div>
          <div className="form-end"><button className="primary" type="submit">Add Partner</button></div>
        </form>
      </div></section>

      <section className="section"><div className="section-head"><h2>Companies</h2><span className="link">{companies.filter(c => !c.is_owner && c.status === 'active').length} active partners</span></div>
        <div className="partner-list">
          {companies.map(company => <div className="card partner-admin-card" key={company.id}>
            <div className="partner-admin-head"><div><h3>{company.name}</h3><span className="status gray">{company.is_owner ? 'Owner' : company.company_code}</span></div><span className={'status ' + (company.status === 'active' ? 'green' : 'gray')}>{company.status}</span></div>
            <form action={updatePartner} className="partner-form compact">
              <input type="hidden" name="id" value={company.id} />
              <div><label>Name</label><input name="name" defaultValue={company.name} disabled={company.is_owner} /></div>
              <div><label>Contact</label><input name="contact_person" defaultValue={company.contact_person ?? ''} disabled={company.is_owner} /></div>
              <div><label>Phone</label><input name="phone" defaultValue={company.phone ?? ''} disabled={company.is_owner} /></div>
              <div><label>Email</label><input name="email" type="email" defaultValue={company.email ?? ''} disabled={company.is_owner} /></div>
              <div><label>Status</label><select name="status" defaultValue={company.status} disabled={company.is_owner}><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
              {!company.is_owner ? <div className="form-end"><button className="secondary" type="submit">Save Changes</button></div> : null}
            </form>
          </div>)}
        </div>
      </section>
    </main>
  </div>
}
