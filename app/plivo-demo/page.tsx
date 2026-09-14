'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Plivo from 'plivo-browser-sdk'

type Stage = 'New' | 'Contacted' | 'Quote Sent' | 'Negotiation' | 'Won' | 'Lost'
type Lead = { id:string; name:string; phone:string; source:string; route:string; stage:Stage; lastContact:string; notes:string }
type CallLog = { id:string; leadId:string; name:string; phone:string; direction:'outbound'|'inbound'; status:string; duration?:number; at:string }

const initialLeads: Lead[] = [
  {id:'ES-1001',name:'Rahul Sharma',phone:'+919876543210',source:'Google Ads',route:'Mumbai → Pune',stage:'New',lastContact:'—',notes:''},
  {id:'ES-1002',name:'Priya Mehta',phone:'+919812345678',source:'WhatsApp',route:'Thane → Bengaluru',stage:'Contacted',lastContact:'Today 5:20 PM',notes:'Asked for Sunday pickup.'},
  {id:'ES-1003',name:'Amit Patel',phone:'+919900112233',source:'Website',route:'Mumbai → Delhi',stage:'Quote Sent',lastContact:'Yesterday',notes:'Quote sent ₹42,500.'},
  {id:'ES-1004',name:'Neha Joshi',phone:'+919888776655',source:'Google Business',route:'Navi Mumbai → Surat',stage:'Negotiation',lastContact:'Yesterday',notes:'Waiting for final confirmation.'},
]

const stages:Stage[] = ['New','Contacted','Quote Sent','Negotiation','Won','Lost']

export default function PlivoDemoPage(){
  const [leads,setLeads] = useState<Lead[]>(initialLeads)
  const [logs,setLogs] = useState<CallLog[]>([])
  const [query,setQuery] = useState('')
  const [stage,setStage] = useState<'All'|Stage>('All')
  const [selected,setSelected] = useState<Lead|null>(null)
  const [callStatus,setCallStatus] = useState('Not connected')
  const [sdkReady,setSdkReady] = useState(false)
  const sdkRef = useRef<any>(null)
  const activeCallRef = useRef<any>(null)

  useEffect(()=>{
    try {
      const saved = localStorage.getItem('es-plivo-demo-leads')
      const savedLogs = localStorage.getItem('es-plivo-demo-logs')
      if(saved) setLeads(JSON.parse(saved))
      if(savedLogs) setLogs(JSON.parse(savedLogs))
    } catch {}
  },[])
  useEffect(()=>{ localStorage.setItem('es-plivo-demo-leads',JSON.stringify(leads)) },[leads])
  useEffect(()=>{ localStorage.setItem('es-plivo-demo-logs',JSON.stringify(logs)) },[logs])

  const filtered = useMemo(()=>leads.filter(l=>{
    const hay = `${l.name} ${l.phone} ${l.source} ${l.route}`.toLowerCase()
    return hay.includes(query.toLowerCase()) && (stage==='All' || l.stage===stage)
  }),[leads,query,stage])

  const counts = Object.fromEntries(stages.map(s=>[s,leads.filter(l=>l.stage===s).length])) as Record<Stage,number>

  async function initBrowser(){
    if(sdkRef.current) return true
    try {
      const sdk:any = new (Plivo as any)({debug:'INFO',permOnClick:true,enableTracking:true,closeProtection:true})
      sdk.client.on('onLogin',()=>{setSdkReady(true);setCallStatus('Web phone ready')})
      sdk.client.on('onLoginFailed',(e:any)=>{setSdkReady(false);setCallStatus(`Login failed: ${e}`)})
      sdk.client.on('onCallRemoteRinging',()=>setCallStatus('Ringing…'))
      sdk.client.on('onCallConnected',()=>setCallStatus('Connected'))
      sdk.client.on('onCallAnswered',()=>setCallStatus('Connected'))
      sdk.client.on('onCallFailed',()=>setCallStatus('Call failed'))
      sdk.client.on('onCallTerminated',()=>{setCallStatus('Call ended'); activeCallRef.current=null})
      sdk.client.on('onWebrtcNotSupported',()=>setCallStatus('Browser/WebRTC not supported'))
      const r = await fetch('/api/plivo/token',{method:'POST'})
      const data = await r.json()
      if(!r.ok) throw new Error(data.error || 'Plivo token unavailable')
      sdkRef.current = sdk
      sdk.client.loginWithAccessToken(data.token)
      return true
    } catch(e:any) {
      setCallStatus(e.message || 'Unable to initialize web phone')
      return false
    }
  }

  async function callLead(lead:Lead){
    setSelected(lead)
    setCallStatus('Starting web phone…')
    const ok = await initBrowser()
    if(!ok) return
    try {
      sdkRef.current.client.call(lead.phone, {'X-ES-Lead':lead.id})
      activeCallRef.current = lead
      setCallStatus(`Calling ${lead.name}…`)
      addLog(lead,'outbound','initiated')
      setLeads(prev=>prev.map(x=>x.id===lead.id?{...x,lastContact:'Just now'}:x))
    } catch(e:any) { setCallStatus(e.message || 'Call failed') }
  }

  function hangup(){
    try { sdkRef.current?.client?.hangup?.() } catch {}
    setCallStatus('Call ended')
  }
  function addLog(lead:Lead,direction:'outbound'|'inbound',status:string,duration?:number){
    setLogs(prev=>[{id:crypto.randomUUID(),leadId:lead.id,name:lead.name,phone:lead.phone,direction,status,duration,at:new Date().toLocaleString('en-IN')},...prev].slice(0,100))
  }
  function changeStage(id:string,next:Stage){ setLeads(prev=>prev.map(l=>l.id===id?{...l,stage:next}:l)) }
  function addLead(){
    const name=prompt('Customer name')?.trim(); if(!name) return
    const phone=prompt('Mobile number in E.164 format, e.g. +919876543210')?.trim(); if(!phone) return
    const id=`ES-${1000+leads.length+1}`
    setLeads(prev=>[{id,name,phone,source:'Manual',route:'',stage:'New',lastContact:'—',notes:''},...prev])
  }

  return <main style={styles.page}>
    <header style={styles.header}>
      <div><div style={styles.logo}>Easy Shift <span>Plivo CRM Demo</span></div><div style={styles.sub}>Lead monitoring + browser calling + call logs</div></div>
      <div style={{display:'flex',gap:10,alignItems:'center'}}><span style={{...styles.dot,sBackground:sdkReady?'#16a34a':'#94a3b8'}}></span><span style={styles.muted}>{sdkReady?'Web phone ready':'Web phone offline'}</span><button style={styles.primary} onClick={addLead}>+ Add Lead</button></div>
    </header>

    <section style={styles.stats}>{stages.slice(0,5).map(s=><div key={s} style={styles.stat}><div style={styles.muted}>{s}</div><strong style={styles.statNo}>{counts[s]}</strong></div>)}<div style={styles.stat}><div style={styles.muted}>Call Logs</div><strong style={styles.statNo}>{logs.length}</strong></div></section>

    <section style={styles.toolbar}><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search customer, mobile, source…" style={styles.input}/><select value={stage} onChange={e=>setStage(e.target.value as any)} style={styles.select}><option>All</option>{stages.map(s=><option key={s}>{s}</option>)}</select><button style={styles.secondary} onClick={async()=>{setCallStatus('Connecting…'); await initBrowser()}}>Test Web Phone</button>{selected&&<button style={styles.danger} onClick={hangup}>Hang Up</button>}</section>

    <section style={styles.grid}>
      <div style={styles.card}>
        <div style={styles.cardHead}><div><h2 style={styles.h2}>Customers</h2><div style={styles.muted}>{filtered.length} matching leads</div></div><span style={styles.badge}>Demo data</span></div>
        <div style={{overflowX:'auto'}}><table style={styles.table}><thead><tr><th>Customer</th><th>Source</th><th>Route</th><th>Stage</th><th>Last Contact</th><th>Action</th></tr></thead><tbody>{filtered.map(l=><tr key={l.id}><td><strong>{l.name}</strong><div style={styles.small}>{l.phone}</div></td><td>{l.source}</td><td>{l.route||'—'}</td><td><select value={l.stage} onChange={e=>changeStage(l.id,e.target.value as Stage)} style={styles.stageSelect}>{stages.map(s=><option key={s}>{s}</option>)}</select></td><td>{l.lastContact}</td><td><button style={styles.callBtn} onClick={()=>callLead(l)}>☎ Web Call</button></td></tr>)}{filtered.length===0&&<tr><td colSpan={6} style={styles.empty}>No leads found.</td></tr>}</tbody></table></div>
      </div>

      <aside style={styles.card}>
        <div style={styles.cardHead}><div><h2 style={styles.h2}>Web Phone</h2><div style={styles.muted}>Plivo Browser SDK / WebRTC</div></div><span style={{...styles.badge,background:'#ecfdf5',color:'#047857'}}>{callStatus}</span></div>
        {selected?<div><div style={styles.customerBox}><strong style={{fontSize:18}}>{selected.name}</strong><div style={styles.muted}>{selected.phone}</div><div style={styles.route}>{selected.route||'No route added'}</div><div style={{marginTop:10}}><span style={styles.stagePill}>{selected.stage}</span></div></div><div style={{display:'flex',gap:8,marginTop:12}}><button style={{...styles.callBtn,flex:1}} onClick={()=>callLead(selected)}>☎ Call</button><button style={{...styles.danger,flex:1}} onClick={hangup}>End</button></div><p style={styles.tip}>Your browser microphone will be requested when the call starts. Keep this tab in the foreground during the call.</p></div>:<div style={styles.emptyPanel}>Select a customer and press <b>Web Call</b>.</div>}
      </aside>
    </section>

    <section style={{...styles.card,marginTop:18}}><div style={styles.cardHead}><div><h2 style={styles.h2}>Recent Call Logs</h2><div style={styles.muted}>Browser-side demo logs; Plivo webhook sync comes next.</div></div></div><div style={{overflowX:'auto'}}><table style={styles.table}><thead><tr><th>Time</th><th>Customer</th><th>Direction</th><th>Status</th><th>Duration</th></tr></thead><tbody>{logs.slice(0,12).map(log=><tr key={log.id}><td>{log.at}</td><td>{log.name}<div style={styles.small}>{log.phone}</div></td><td>{log.direction==='outbound'?'↗ Outbound':'↙ Inbound'}</td><td>{log.status}</td><td>{log.duration?`${log.duration}s`:'—'}</td></tr>)}{logs.length===0&&<tr><td colSpan={5} style={styles.empty}>No calls yet. Press Web Call to create the first log.</td></tr>}</tbody></table></div></section>

    <footer style={styles.footer}>Demo branch • Plivo credentials stay server-side • No credentials are stored in browser localStorage</footer>
  </main>
}

const styles:Record<string,any>={
 page:{minHeight:'100vh',background:'#f6f8fb',color:'#122033',padding:'28px 34px',fontFamily:'Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'},
 header:{display:'flex',justifyContent:'space-between',alignItems:'center',gap:20,marginBottom:22}, logo:{fontSize:27,fontWeight:800,letterSpacing:-.5}, logoSpan:{}, sub:{color:'#64748b',marginTop:4,fontSize:14}, dot:{width:9,height:9,borderRadius:99,display:'inline-block'}, muted:{color:'#64748b',fontSize:13}, primary:{border:0,borderRadius:9,padding:'10px 15px',background:'#1d4ed8',color:'#fff',fontWeight:700,cursor:'pointer'}, secondary:{border:'1px solid #cbd5e1',borderRadius:9,padding:'10px 14px',background:'#fff',fontWeight:700,cursor:'pointer'}, danger:{border:0,borderRadius:9,padding:'10px 14px',background:'#fee2e2',color:'#b91c1c',fontWeight:700,cursor:'pointer'}, stats:{display:'grid',gridTemplateColumns:'repeat(6,minmax(0,1fr))',gap:12,marginBottom:18},stat:{background:'#fff',border:'1px solid #e2e8f0',borderRadius:12,padding:'14px 16px'},statNo:{fontSize:24,display:'block',marginTop:4},toolbar:{display:'flex',gap:10,marginBottom:18,flexWrap:'wrap'},input:{flex:'1 1 360px',minWidth:220,border:'1px solid #cbd5e1',borderRadius:9,padding:'11px 13px',background:'#fff',fontSize:14},select:{border:'1px solid #cbd5e1',borderRadius:9,padding:'10px 12px',background:'#fff'},grid:{display:'grid',gridTemplateColumns:'minmax(0,2fr) minmax(320px,1fr)',gap:18},card:{background:'#fff',border:'1px solid #e2e8f0',borderRadius:14,overflow:'hidden',boxShadow:'0 2px 8px rgba(15,23,42,.03)'},cardHead:{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,padding:'17px 18px',borderBottom:'1px solid #eef2f7'},h2:{fontSize:17,margin:0},badge:{background:'#eff6ff',color:'#1d4ed8',fontSize:11,fontWeight:700,padding:'5px 8px',borderRadius:999},table:{width:'100%',borderCollapse:'collapse',fontSize:13},small:{fontSize:12,color:'#64748b',marginTop:3},stageSelect:{border:'1px solid #dbe3ec',borderRadius:7,padding:'6px 8px',fontSize:12,background:'#fff'},callBtn:{border:0,borderRadius:8,padding:'8px 11px',background:'#0f766e',color:'#fff',fontWeight:700,cursor:'pointer',whiteSpace:'nowrap'},empty:{padding:30,textAlign:'center',color:'#64748b'},customerBox:{padding:18,background:'#f8fafc',borderRadius:10,margin:16},route:{fontSize:13,marginTop:9,color:'#334155'},stagePill:{display:'inline-block',background:'#dbeafe',color:'#1d4ed8',borderRadius:999,padding:'5px 9px',fontSize:11,fontWeight:700},tip:{fontSize:12,color:'#64748b',lineHeight:1.5,padding:'0 16px 16px'},emptyPanel:{padding:40,textAlign:'center',color:'#64748b'},footer:{textAlign:'center',fontSize:12,color:'#94a3b8',marginTop:22,paddingBottom:8}
}

// Table cell defaults without relying on the existing CRM stylesheet.
if(typeof document!=='undefined'){
  const id='plivo-demo-table-css'
  if(!document.getElementById(id)){
    const style=document.createElement('style');style.id=id;style.innerHTML='th,td{padding:12px 14px;text-align:left;border-bottom:1px solid #eef2f7;white-space:nowrap} tbody tr:hover{background:#fafcff} @media(max-width:900px){main{padding:18px!important}.grid{grid-template-columns:1fr!important}.stats{grid-template-columns:repeat(2,minmax(0,1fr))!important}}';document.head.appendChild(style)
  }
}
