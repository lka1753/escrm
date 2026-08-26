import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

type Lead = {
  id: string
  lead_number: string
  name: string
  mobile: string
  pickup_location: string | null
  drop_location: string | null
  source: string
  status: string
  assigned_company_id: string | null
  booking_value: number | null
}

type Company = { id: string; name: string; company_code: string }

function statusClass(status: string) {
  if (['booking_confirmed', 'move_completed'].includes(status)) return 'green'
  if (['quotation_sent', 'contacted'].includes(status)) return 'blue'
  if (['new', 'assigned'].includes(status)) return 'orange'
  return 'gray'
}
function pretty(value: string) { return value.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase()) }

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { count: totalLeads }, { count: unassigned }, { count: bookings }, { data: leads }, { data: companies }] = await Promise.all([
    supabase.from('user_profiles').select('full_name, role, company_id').eq('id', user.id).maybeSingle(),
    supabase.from('leads').select('*', { count: 'exact', head: true }),
    supabase.from('leads').select('*', { count: 'exact', head: true }).is('assigned_company_id', null),
    supabase.from('leads').select('*', { count: 'exact', head: true }).in('status', ['booking_confirmed', 'move_completed']),
    supabase.from('leads').select('id,lead_number,name,mobile,pickup_location,drop_location,source,status,assigned_company_id,booking_value').order('created_at', { ascending: false }).limit(8),
    supabase.from('companies').select('id,name,company_code').order('name'),
  ])

  if (!profile) redirect('/login?error=CRM%20profile%20not%20configured')
  const isAdmin = profile.role === 'super_admin'
  const companyMap = new Map((companies ?? []).map(c => [c.id, c.name]))
  const recentLeads = (leads ?? []) as Lead[]
  const partnerCompanies = (companies ?? []) as Company[]

  return <div className="app">
    <aside className="sidebar"><div className="brand">Easy Shift CRM<small>Lead Distribution System</small></div><nav className="nav">
      <div className="active">Dashboard</div><div>Leads</div><div>Calls</div><div>Partners</div><div>Assignments</div><div>Conversions</div><div>Reports</div>{isAdmin ? <div>Users</div> : null}<div>Settings</div>
    </nav></aside>
    <main className="main">
      <header className="top"><div className="title"><h1>Dashboard</h1><p>Central control center for Easy Shift leads</p></div><div className="admin-wrap"><div className="admin">{profile.full_name} · {pretty(profile.role)}</div><form action="/auth/signout" method="post"><button className="signout" type="submit">Sign out</button></form></div></header>
      <section className="grid"><Metric label="Total Leads" value={String(totalLeads ?? 0)} note="Live from Supabase"/><Metric label="Unassigned" value={String(unassigned ?? 0)} note="Needs attention" warn={(unassigned ?? 0) > 0}/><Metric label="Bookings" value={String(bookings ?? 0)} note="Confirmed / completed"/><Metric label="Partners" value={String(partnerCompanies.filter(c => c.company_code !== 'ES').length)} note="Active companies"/></section>
      <section className="section"><div className="section-head"><h2>Recent Leads</h2><span className="link">Live data</span></div><div className="table-wrap"><table className="table"><thead><tr><th>Lead</th><th>Customer</th><th>Route</th><th>Source</th><th>Partner</th><th>Status</th><th>Value</th></tr></thead><tbody>
        {recentLeads.map(lead => <tr key={lead.id}><td><strong>{lead.lead_number}</strong></td><td>{lead.name}<br/><span className="muted">{lead.mobile}</span></td><td>{lead.pickup_location || '—'} → {lead.drop_location || '—'}</td><td>{pretty(lead.source)}</td><td>{lead.assigned_company_id ? companyMap.get(lead.assigned_company_id) ?? 'Assigned' : 'Unassigned'}</td><td><span className={'status ' + statusClass(lead.status)}>{pretty(lead.status)}</span></td><td>{lead.booking_value ? `₹${Number(lead.booking_value).toLocaleString('en-IN')}` : '—'}</td></tr>)}
        {recentLeads.length === 0 ? <tr><td colSpan={7} className="empty">No leads yet.</td></tr> : null}
      </tbody></table></div></section>
      <section className="section"><div className="section-head"><h2>Partner Companies</h2><span className="link">Live data</span></div><div className="partner-grid">
        {partnerCompanies.map(company => <div className="card partner" key={company.id}><h3>{company.name}</h3><div className="partner-row"><span>Code</span><strong>{company.company_code}</strong></div><div className="partner-row"><span>Type</span><strong>{company.company_code === 'ES' ? 'Owner' : 'Partner'}</strong></div></div>)}
      </div></section>
      <section className="section"><div className="section-head"><h2>System status</h2></div><div className="grid"><System name="Database / Supabase" state="Ready"/><System name="Authentication" state="Ready"/><System name="Lead API" state="Next"/><System name="Google / Meta" state="Next"/></div></section>
    </main>
  </div>
}
function Metric({label,value,note,warn=false}:{label:string;value:string;note:string;warn?:boolean}) { return <div className="card"><div className="metric-label">{label}</div><div className="metric">{value}</div><div className="metric-note" style={warn ? {color:'#b26b00'} : {}}>{note}</div></div> }
function System({name,state}:{name:string;state:string}) { return <div className="card"><div className="metric-label">{name}</div><div style={{marginTop:10,fontWeight:700}}><span className={'status ' + (state === 'Ready' ? 'green' : 'gray')}>{state}</span></div></div> }
