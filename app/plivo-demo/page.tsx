'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

type Stage = 'New'|'Contacted'|'Quote Sent'|'Negotiation'|'Won'|'Lost'
type Lead = { id:string; name:string; phone:string; source:string; route:string; stage:Stage; lastContact:string }
type Log = { id:string; leadId:string; name:string; phone:string; status:string; at:string }

const stages:Stage[]=['New','Contacted','Quote Sent','Negotiation','Won','Lost']
const demoLeads:Lead[]=[
 {id:'ES-1001',name:'Rahul Sharma',phone:'+919876543210',source:'Google Ads',route:'Mumbai → Pune',stage:'New',lastContact:'—'},
 {id:'ES-1002',name:'Priya Mehta',phone:'+919812345678',source:'WhatsApp',route:'Thane → Bengaluru',stage:'Contacted',lastContact:'Today 5:20 PM'},
 {id:'ES-1003',name:'Amit Patel',phone:'+919900112233',source:'Website',route:'Mumbai → Delhi',stage:'Quote Sent',lastContact:'Yesterday'},
 {id:'ES-1004',name:'Neha Joshi',phone:'+919888776655',source:'Google Business',route:'Navi Mumbai → Surat',stage:'Negotiation',lastContact:'Yesterday'}
]

export default function PlivoDemo(){
 const [leads,setLeads]=useState<Lead[]>(demoLeads)
 const [logs,setLogs]=useState<Log[]>([])
 const [q,setQ]=useState(''); const [filter,setFilter]=useState('All')
 const [selected,setSelected]=useState<Lead|null>(null); const [phoneStatus,setPhoneStatus]=useState('Offline')
 const sdk=useRef<any>(null)
 useEffect(()=>{try{const a=localStorage.getItem('es-plivo-leads');const b=localStorage.getItem('es-plivo-logs');if(a)setLeads(JSON.parse(a));if(b)setLogs(JSON.parse(b))}catch{}},[])
 useEffect(()=>{localStorage.setItem('es-plivo-leads',JSON.stringify(leads))},[leads])
 useEffect(()=>{localStorage.setItem('es-plivo-logs',JSON.stringify(logs))},[logs])
 const visible=useMemo(()=>leads.filter(l=>(filter==='All'||l.stage===filter)&&`${l.name} ${l.phone} ${l.source} ${l.route}`.toLowerCase().includes(q.toLowerCase())),[leads,q,filter])
 const count=(s:Stage)=>leads.filter(l=>l.stage===s).length

 async function setupPhone(){
   if(sdk.current) return true
   try{
     const {default:Plivo}=await import('plivo-browser-sdk')
     const client:any=new (Plivo as any)({debug:'INFO',permOnClick:true,enableTracking:true,closeProtection:true})
     client.client.on('onLogin',()=>setPhoneStatus('Ready'))
     client.client.on('onLoginFailed',(e:any)=>setPhoneStatus(`Login failed (${e})`))
     client.client.on('onCallRemoteRinging',()=>setPhoneStatus('Ringing…'))
     client.client.on('onCallAnswered',()=>setPhoneStatus('Connected'))
     client.client.on('onCallConnected',()=>setPhoneStatus('Connected'))
     client.client.on('onCallFailed',()=>setPhoneStatus('Failed'))
     client.client.on('onCallTerminated',()=>setPhoneStatus('Ended'))
     client.client.on('onWebrtcNotSupported',()=>setPhoneStatus('WebRTC unsupported'))
     const r=await fetch('/api/plivo/token',{method:'POST'});const data=await r.json();if(!r.ok)throw new Error(data.error||'Plivo is not configured')
     sdk.current=client;client.client.loginWithAccessToken(data.token);return true
   }catch(e:any){setPhoneStatus(e.message||'Phone setup failed');return false}
 }
 async function call(lead:Lead){
   setSelected(lead);setPhoneStatus('Starting…');if(!(await setupPhone()))return
   try{sdk.current.client.call(lead.phone,{'X-ES-Lead':lead.id});setPhoneStatus(`Calling ${lead.name}…`);setLeads(x=>x.map(v=>v.id===lead.id?{...v,lastContact:'Just now'}:v));setLogs(x=>[{id:crypto.randomUUID(),leadId:lead.id,name:lead.name,phone:lead.phone,status:'initiated',at:new Date().toLocaleString('en-IN')},...x].slice(0,100))}catch(e:any){setPhoneStatus(e.message||'Call failed')}
 }
 function hangup(){try{sdk.current?.client?.hangup?.()}catch{}setPhoneStatus('Ended')}
 function addLead(){const name=prompt('Customer name')?.trim();if(!name)return;const phone=prompt('Mobile in E.164 format, e.g. +919876543210')?.trim();if(!phone)return;setLeads(x=>[{id:`ES-${1001+x.length}`,name,phone,source:'Manual',route:'',stage:'New',lastContact:'—'},...x])}
 function stage(id:string,s:Stage){setLeads(x=>x.map(v=>v.id===id?{...v,stage:s}:v))}
 return <main style={S.page}>
  <header style={S.header}><div><div style={S.logo}>Easy Shift <span style={{color:'#2563eb'}}>Plivo CRM Demo</span></div><div style={S.sub}>Basic CRM • customer stage • lead monitoring • browser calls • call logs</div></div><div style={S.actions}><span style={{...S.dot,background:phoneStatus==='Ready'?'#16a34a':'#94a3b8'}}/><span style={S.muted}>{phoneStatus}</span><button style={S.primary} onClick={addLead}>+ Add Lead</button></div></header>
  <section style={S.stats}>{stages.slice(0,5).map(s=><div style={S.stat} key={s}><span style={S.muted}>{s}</span><b style={S.big}>{count(s)}</b></div>)}<div style={S.stat}><span style={S.muted}>Call Logs</span><b style={S.big}>{logs.length}</b></div></section>
  <section style={S.toolbar}><input style={S.input} value={q} onChange={e=>setQ(e.target.value)} placeholder="Search customer, mobile, source…"/><select style={S.select} value={filter} onChange={e=>setFilter(e.target.value)}><option>All</option>{stages.map(s=><option key={s}>{s}</option>)}</select><button style={S.secondary} onClick={setupPhone}>Test Web Phone</button>{selected&&<button style={S.danger} onClick={hangup}>Hang Up</button>}</section>
  <section style={S.grid}>
   <div style={S.card}><div style={S.cardHead}><div><h2 style={S.h2}>Customers</h2><span style={S.muted}>{visible.length} matching leads</span></div><span style={S.badge}>Demo</span></div><div style={{overflowX:'auto'}}><table style={S.table}><thead><tr><th>Customer</th><th>Source</th><th>Route</th><th>Stage</th><th>Last Contact</th><th></th></tr></thead><tbody>{visible.map(l=><tr key={l.id}><td><b>{l.name}</b><small>{l.phone}</small></td><td>{l.source}</td><td>{l.route||'—'}</td><td><select style={S.stage} value={l.stage} onChange={e=>stage(l.id,e.target.value as Stage)}>{stages.map(s=><option key={s}>{s}</option>)}</select></td><td>{l.lastContact}</td><td><button style={S.call} onClick={()=>call(l)}>☎ Web Call</button></td></tr>)}{!visible.length&&<tr><td colSpan={6} style={S.empty}>No leads found.</td></tr>}</tbody></table></div></div>
   <aside style={S.card}><div style={S.cardHead}><div><h2 style={S.h2}>Web Phone</h2><span style={S.muted}>Plivo Browser SDK / WebRTC</span></div><span style={S.badge}>{phoneStatus}</span></div>{selected?<><div style={S.customer}><b style={{fontSize:18}}>{selected.name}</b><span style={S.muted}>{selected.phone}</span><span style={{marginTop:8}}>{selected.route||'No route'}</span><span style={S.pill}>{selected.stage}</span></div><div style={S.callRow}><button style={{...S.call,flex:1}} onClick={()=>call(selected)}>☎ Call</button><button style={{...S.danger,flex:1}} onClick={hangup}>End</button></div><p style={S.tip}>Browser microphone permission is required. Keep this tab in the foreground while testing.</p></>:<div style={S.emptyPanel}>Select a lead and press <b>Web Call</b>.</div>}</aside>
  </section>
  <section style={{...S.card,marginTop:18}}><div style={S.cardHead}><div><h2 style={S.h2}>Recent Call Logs</h2><span style={S.muted}>Demo logs are stored in this browser. Plivo webhook persistence is the next step.</span></div></div><div style={{overflowX:'auto'}}><table style={S.table}><thead><tr><th>Time</th><th>Customer</th><th>Status</th></tr></thead><tbody>{logs.slice(0,15).map(x=><tr key={x.id}><td>{x.at}</td><td>{x.name}<small>{x.phone}</small></td><td>{x.status}</td></tr>)}{!logs.length&&<tr><td colSpan={3} style={S.empty}>No calls yet.</td></tr>}</tbody></table></div></section>
  <footer style={S.footer}>Demo is isolated on the <b>demo/plivo-crm</b> branch. Plivo Auth ID/token never go to the browser.</footer>
 </main>
}
const S:any={page:{minHeight:'100vh',background:'#f7f9fc',color:'#0f172a',padding:'28px 34px',fontFamily:'Inter,system-ui,sans-serif'},header:{display:'flex',justifyContent:'space-between',alignItems:'center',gap:20,marginBottom:20},logo:{fontSize:27,fontWeight:800},sub:{color:'#64748b',fontSize:13,marginTop:4},actions:{display:'flex',alignItems:'center',gap:9},dot:{width:9,height:9,borderRadius:99},muted:{color:'#64748b',fontSize:13},primary:{border:0,borderRadius:9,padding:'10px 14px',background:'#2563eb',color:'#fff',fontWeight:700,cursor:'pointer'},secondary:{border:'1px solid #cbd5e1',borderRadius:9,padding:'10px 14px',background:'#fff',fontWeight:700,cursor:'pointer'},danger:{border:0,borderRadius:9,padding:'10px 14px',background:'#fee2e2',color:'#b91c1c',fontWeight:700,cursor:'pointer'},stats:{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:12,marginBottom:16},stat:{background:'#fff',border:'1px solid #e2e8f0',borderRadius:12,padding:14},big:{display:'block',fontSize:23,marginTop:5},toolbar:{display:'flex',gap:9,flexWrap:'wrap',marginBottom:16},input:{flex:'1 1 360px',border:'1px solid #cbd5e1',borderRadius:9,padding:'11px 13px',fontSize:14},select:{border:'1px solid #cbd5e1',borderRadius:9,padding:'10px 12px',background:'#fff'},grid:{display:'grid',gridTemplateColumns:'minmax(0,2fr) minmax(320px,1fr)',gap:16},card:{background:'#fff',border:'1px solid #e2e8f0',borderRadius:14,overflow:'hidden',boxShadow:'0 2px 8px rgba(15,23,42,.03)'},cardHead:{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'16px 18px',borderBottom:'1px solid #eef2f7'},h2:{margin:0,fontSize:17},badge:{background:'#eff6ff',color:'#1d4ed8',padding:'5px 8px',borderRadius:999,fontSize:11,fontWeight:700},table:{width:'100%',borderCollapse:'collapse',fontSize:13},stage:{border:'1px solid #dbe3ec',borderRadius:7,padding:'6px 8px',background:'#fff'},call:{border:0,borderRadius:8,padding:'8px 11px',background:'#0f766e',color:'#fff',fontWeight:700,cursor:'pointer',whiteSpace:'nowrap'},customer:{display:'flex',flexDirection:'column',gap:5,margin:16,padding:16,borderRadius:10,background:'#f8fafc'},pill:{alignSelf:'flex-start',marginTop:4,background:'#dbeafe',color:'#1d4ed8',padding:'5px 9px',borderRadius:99,fontSize:11,fontWeight:700},callRow:{display:'flex',gap:8,padding:'0 16px'},tip:{fontSize:12,color:'#64748b',lineHeight:1.5,padding:0 16px 16px},empty:{padding:30,textAlign:'center',color:'#64748b'},emptyPanel:{padding:42,textAlign:'center',color:'#64748b'},footer:{textAlign:'center',fontSize:12,color:'#94a3b8',padding:'20px 0 6px'}}

if(typeof document!=='undefined'&&!document.getElementById('plivo-demo-css')){const x=document.createElement('style');x.id='plivo-demo-css';x.textContent='th,td{padding:12px 14px;text-align:left;border-bottom:1px solid #eef2f7;white-space:nowrap}td small{display:block;color:#64748b;margin-top:3px;font-size:12px}tbody tr:hover{background:#fafcff}@media(max-width:900px){main{padding:18px!important}.grid{grid-template-columns:1fr!important}.stats{grid-template-columns:repeat(2,1fr)!important}.header{align-items:flex-start!important}}';document.head.appendChild(x)}
