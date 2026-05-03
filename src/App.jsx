import { useState, useMemo, useEffect, useRef } from "react";

// ─── FONTS ────────────────────────────────────────────────────────────────────
const FONT_LINK = "https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&display=swap";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const CATS = [
  { id:"comida",          label:"Comida",        icon:"🍔", color:"#FF6B6B" },
  { id:"transporte",      label:"Transporte",    icon:"🚌", color:"#4ECDC4" },
  { id:"hogar",           label:"Hogar",         icon:"🏠", color:"#45B7D1" },
  { id:"salud",           label:"Salud",         icon:"💊", color:"#96CEB4" },
  { id:"ocio",            label:"Ocio",          icon:"🎬", color:"#FFEAA7" },
  { id:"ropa",            label:"Ropa",          icon:"👗", color:"#DDA0DD" },
  { id:"educacion",       label:"Educación",     icon:"📚", color:"#F0A500" },
  { id:"servicios",       label:"Servicios",     icon:"💡", color:"#74B9FF" },
  { id:"otro",            label:"Otro",          icon:"📦", color:"#B2BEC3" },
];
const MONTHS_LONG  = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const MONTHS_SHORT = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

const NAV = [
  { id:"dashboard", icon:"◈", label:"Inicio"     },
  { id:"gastos",    icon:"↕", label:"Gastos"     },
  { id:"budget",    icon:"▦", label:"Presupuesto" },
  { id:"metas",     icon:"◎", label:"Metas"      },
  { id:"deudas",    icon:"⊖", label:"Deudas"     },
];

// ─── UTILS ────────────────────────────────────────────────────────────────────
const fmt = n => new Intl.NumberFormat("es-CO",{style:"currency",currency:"COP",maximumFractionDigits:0}).format(n||0);
const fmtShort = n => {
  if(Math.abs(n)>=1000000) return (n/1000000).toFixed(1)+"M";
  if(Math.abs(n)>=1000)    return (n/1000).toFixed(0)+"k";
  return fmt(n);
};
const today    = () => new Date().toISOString().split("T")[0];
const mkey     = (y,m) => `${y}-${String(m+1).padStart(2,"0")}`;
const getCat   = id => CATS.find(c=>c.id===id)||CATS[8];
const clamp    = (v,a,b) => Math.max(a,Math.min(b,v));
const uuid     = () => Math.random().toString(36).slice(2);

// ─── STORAGE ──────────────────────────────────────────────────────────────────
const STORE_KEY = "maikfinance_v2";
async function loadDB() {
  try { const r=await window.storage.get(STORE_KEY); return r?JSON.parse(r.value):freshDB(); }
  catch { return freshDB(); }
}
async function saveDB(db) {
  try { await window.storage.set(STORE_KEY,JSON.stringify(db)); } catch {}
}
function freshDB() {
  return {
    months: {},      // { "2026-05": { income:0, expenses:[], budgets:{} } }
    metas: [],       // [{ id, name, target, saved, color, icon, createdAt }]
    deudas: [],      // [{ id, name, total, paid, creditor, dueDate, note, done }]
  };
}

// ─── AI ───────────────────────────────────────────────────────────────────────
async function callAI(prompt) {
  const r = await fetch("https://api.anthropic.com/v1/messages",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
      model:"claude-sonnet-4-20250514",
      max_tokens:1000,
      messages:[{role:"user",content:prompt}],
    }),
  });
  const d = await r.json();
  return d.content?.map(b=>b.text||"").join("")||"";
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const S = {
  bg:        "#07070F",
  surface:   "#0D0D1A",
  border:    "#16162A",
  border2:   "#1E1E35",
  text:      "#EDE9E3",
  muted:     "#5A5A7A",
  accent:    "#C8B8FF",
  accentDim: "#C8B8FF22",
  green:     "#4ECDC4",
  red:       "#FF6B6B",
  yellow:    "#F0A500",
};

const css = {
  app: {
    minHeight:"100vh", background:S.bg, color:S.text,
    fontFamily:"'DM Sans', sans-serif",
    display:"flex", flexDirection:"column",
    maxWidth:430, margin:"0 auto", position:"relative",
    fontSize:14,
  },
  surface: {
    background:S.surface, border:`1px solid ${S.border}`,
    borderRadius:18,
  },
  label: {
    fontSize:9, letterSpacing:3, color:S.muted,
    textTransform:"uppercase", fontFamily:"'DM Sans', sans-serif",
    fontWeight:600,
  },
  input: {
    width:"100%", background:"#0A0A16", border:`1px solid ${S.border2}`,
    borderRadius:12, padding:"13px 16px", color:S.text,
    fontSize:14, fontFamily:"'DM Sans', sans-serif",
    outline:"none", boxSizing:"border-box",
  },
  btnPrimary: {
    background:S.accent, border:"none", borderRadius:12,
    padding:"14px 0", color:"#07070F", fontSize:14,
    fontWeight:600, fontFamily:"'DM Sans', sans-serif",
    cursor:"pointer", width:"100%",
  },
  btnGhost: {
    background:"transparent", border:`1px solid ${S.border2}`,
    borderRadius:12, padding:"14px 0", color:S.muted,
    fontSize:13, fontFamily:"'DM Sans', sans-serif",
    cursor:"pointer", width:"100%",
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
//  ROOT
// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const now = new Date();
  const [db, setDb]           = useState(freshDB());
  const [loaded, setLoaded]   = useState(false);
  const [tab, setTab]         = useState("dashboard");
  const [selMonth, setSelMonth] = useState(now.getMonth());
  const [selYear]               = useState(now.getFullYear());
  const curMonth = now.getMonth();
  const curYear  = now.getFullYear();

  // modal state
  const [modal, setModal] = useState(null); // null | "addExpense" | "editExpense" | "addMeta" | "addDeuda" | "ai" | "income" | "addBudget"
  const [modalData, setModalData] = useState({});

  useEffect(() => {
    loadDB().then(d => { setDb(d); setLoaded(true); });
    // inject fonts
    if (!document.querySelector("#mf-fonts")) {
      const l = document.createElement("link");
      l.id="mf-fonts"; l.rel="stylesheet"; l.href=FONT_LINK;
      document.head.appendChild(l);
    }
  }, []);

  useEffect(() => { if(loaded) saveDB(db); }, [db, loaded]);

  // ── derived month data ──
  const mk     = mkey(selYear, selMonth);
  const mdata  = db.months[mk] || { income:0, expenses:[], budgets:{} };
  const income   = mdata.income   || 0;
  const expenses = mdata.expenses || [];
  const budgets  = mdata.budgets  || {};

  const totalExp   = useMemo(() => expenses.reduce((s,e)=>s+e.amount,0), [expenses]);
  const balance    = income - totalExp;
  const savePct    = income>0 ? clamp(Math.round(balance/income*100),-999,100) : 0;
  const spendPct   = income>0 ? clamp(Math.round(totalExp/income*100),0,100) : 0;
  const totalDebt  = db.deudas.filter(d=>!d.done).reduce((s,d)=>s+(d.total-d.paid),0);
  const totalMeta  = db.metas.reduce((s,m)=>s+m.saved,0);

  const byCat = useMemo(() => {
    const map={};
    expenses.forEach(e=>{map[e.category]=(map[e.category]||0)+e.amount;});
    return Object.entries(map).sort((a,b)=>b[1]-a[1]);
  },[expenses]);

  // ── helpers ──
  function updMonth(key,fn) {
    setDb(p=>({...p,months:{...p.months,[key]:fn(p.months[key]||{income:0,expenses:[],budgets:{}})}}));
  }
  function openModal(name,data={}) { setModal(name); setModalData(data); }
  function closeModal()            { setModal(null); setModalData({}); }

  if(!loaded) return (
    <div style={{...css.app, alignItems:"center",justifyContent:"center",minHeight:"100vh"}}>
      <div style={{width:32,height:32,border:`2px solid ${S.border2}`,borderTopColor:S.accent,borderRadius:"50%",animation:"spin 1s linear infinite"}}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // ── health score ──
  function healthScore() {
    let s=100;
    if(income>0 && spendPct>90) s-=30;
    else if(income>0 && spendPct>75) s-=15;
    if(totalDebt>income*2) s-=20;
    else if(totalDebt>0)   s-=10;
    if(income===0)         s-=20;
    return clamp(s,0,100);
  }
  const health = healthScore();
  const healthColor = health>=70?S.green:health>=40?S.yellow:S.red;
  const healthLabel = health>=70?"Buena":"Ajustada";

  return (
    <div style={css.app}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
        *{-webkit-tap-highlight-color:transparent}
        input[type=number]::-webkit-outer-spin-button,input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
        input[type=date]::-webkit-calendar-picker-indicator{filter:invert(0.5)}
        ::-webkit-scrollbar{display:none}
      `}</style>

      {/* ── CONTENT ── */}
      <div style={{flex:1,overflowY:"auto",paddingBottom:80}}>
        {tab==="dashboard" && <Dashboard {...{selMonth,setSelMonth,selYear,curMonth,curYear,mk,income,expenses,totalExp,balance,savePct,spendPct,byCat,db,health,healthColor,healthLabel,totalDebt,totalMeta,openModal,fmt,fmtShort,setTab}}/>}
        {tab==="gastos"    && <Gastos    {...{selMonth,setSelMonth,selYear,curMonth,curYear,mk,income,expenses,totalExp,byCat,updMonth,openModal,closeModal,modal,modalData,fmt,S,css}}/>}
        {tab==="budget"    && <Budget    {...{selMonth,setSelMonth,selYear,curMonth,curYear,mk,expenses,budgets,byCat,totalExp,updMonth,openModal,closeModal,modal,modalData,fmt,S,css}}/>}
        {tab==="metas"     && <Metas     {...{db,setDb,openModal,closeModal,modal,modalData,fmt,S,css}}/>}
        {tab==="deudas"    && <Deudas    {...{db,setDb,openModal,closeModal,modal,modalData,fmt,S,css}}/>}
      </div>

      {/* ── BOTTOM NAV ── */}
      <div style={{
        position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",
        width:"100%",maxWidth:430,
        background:"#08080F",borderTop:`1px solid ${S.border}`,
        display:"flex",zIndex:50,paddingBottom:"env(safe-area-inset-bottom,0px)",
      }}>
        {NAV.map(n=>{
          const active=tab===n.id;
          return (
            <button key={n.id} onClick={()=>setTab(n.id)} style={{
              flex:1,background:"none",border:"none",padding:"12px 0 10px",
              cursor:"pointer",display:"flex",flexDirection:"column",
              alignItems:"center",gap:4,transition:"all .15s",
            }}>
              <span style={{fontSize:16,color:active?S.accent:S.muted,transition:"color .15s"}}>{n.icon}</span>
              <span style={{fontSize:9,letterSpacing:1,fontWeight:600,color:active?S.accent:S.muted,fontFamily:"'DM Sans',sans-serif",textTransform:"uppercase"}}>{n.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── GLOBAL MODALS ── */}
      {modal==="addExpense"  && <ModalAddExpense  {...{closeModal,mk,updMonth,modalData,curMonth,selMonth,curYear,selYear,S,css}}/>}
      {modal==="editExpense" && <ModalAddExpense  {...{closeModal,mk,updMonth,modalData,curMonth,selMonth,curYear,selYear,S,css,isEdit:true}}/>}
      {modal==="income"      && <ModalIncome      {...{closeModal,mk,updMonth,income,S,css}}/>}
      {modal==="addMeta"     && <ModalAddMeta     {...{closeModal,db,setDb,modalData,S,css}}/>}
      {modal==="abonoMeta"   && <ModalAbonoMeta   {...{closeModal,db,setDb,modalData,S,css}}/>}
      {modal==="addDeuda"    && <ModalAddDeuda    {...{closeModal,db,setDb,modalData,S,css}}/>}
      {modal==="pagarDeuda"  && <ModalPagarDeuda  {...{closeModal,db,setDb,modalData,S,css}}/>}
      {modal==="addBudget"   && <ModalAddBudget   {...{closeModal,mk,updMonth,modalData,S,css}}/>}
      {modal==="ai"          && <ModalAI          {...{closeModal,income,expenses,totalExp,byCat,balance,db,selMonth,S,css}}/>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════
function Dashboard({selMonth,setSelMonth,selYear,curMonth,mk,income,expenses,totalExp,balance,savePct,spendPct,byCat,db,health,healthColor,healthLabel,totalDebt,totalMeta,openModal,fmt,fmtShort,setTab}) {
  const topCat = byCat[0];
  const recentExp = [...expenses].reverse().slice(0,4);
  const pendingDeudas = db.deudas.filter(d=>!d.done).slice(0,2);

  return (
    <div style={{animation:"fadeUp .3s ease"}}>
      {/* Header */}
      <div style={{padding:"32px 20px 16px",background:`linear-gradient(180deg, #0D0D1F 0%, ${S.bg} 100%)`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
          <div>
            <div style={{...css.label,marginBottom:6}}>Salud financiera</div>
            <div style={{fontFamily:"'DM Serif Display',serif",fontSize:28,letterSpacing:-.5,lineHeight:1.1}}>
              {MONTHS_LONG[selMonth]}
            </div>
          </div>
          <div style={{
            background:healthColor+"18",border:`1px solid ${healthColor}44`,
            borderRadius:20,padding:"6px 14px",display:"flex",alignItems:"center",gap:6,
          }}>
            <div style={{width:7,height:7,borderRadius:"50%",background:healthColor,animation:health<40?"pulse 1.5s infinite":"none"}}/>
            <span style={{fontSize:11,color:healthColor,fontWeight:600}}>{healthLabel} · {health}%</span>
          </div>
        </div>

        {/* Month tabs */}
        <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:2}}>
          {MONTHS_SHORT.map((m,i)=>{
            const hasData = !!(db.months[mkey(selYear,i)]?.expenses?.length);
            const active  = i===selMonth;
            return (
              <button key={i} onClick={()=>setSelMonth(i)} style={{
                background:active?"#C8B8FF":"transparent",
                color:active?"#07070F":hasData?"#888":"#333",
                border:`1px solid ${active?"#C8B8FF":hasData?"#2A2A40":"#141422"}`,
                borderRadius:20,padding:"5px 12px",fontSize:11,fontWeight:600,
                cursor:"pointer",whiteSpace:"nowrap",fontFamily:"'DM Sans',sans-serif",
                flexShrink:0,
              }}>{m}{hasData&&!active?<span style={{color:"#4ECDC4",marginLeft:3,fontSize:8}}>●</span>:null}</button>
            );
          })}
        </div>
      </div>

      <div style={{padding:"0 20px 24px"}}>
        {/* Balance card */}
        <div style={{
          background:"linear-gradient(135deg,#0E0E20 0%,#131325 100%)",
          border:`1px solid #1C1C35`,borderRadius:22,padding:22,marginBottom:16,
        }}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:18}}>
            <div>
              <div style={{...css.label,marginBottom:6}}>Ingresos</div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontFamily:"'DM Serif Display',serif",fontSize:24,color:"#4ECDC4"}}>
                  {income>0?fmt(income):"—"}
                </span>
                <button onClick={()=>openModal("income")} style={{
                  background:"none",border:`1px solid #1E1E35`,borderRadius:8,
                  color:"#555",fontSize:10,padding:"2px 8px",cursor:"pointer",
                  fontFamily:"'DM Sans',sans-serif",
                }}>editar</button>
              </div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{...css.label,marginBottom:6}}>Gastos</div>
              <div style={{fontFamily:"'DM Serif Display',serif",fontSize:24,color:"#FF6B6B"}}>{fmt(totalExp)}</div>
            </div>
          </div>

          {/* Spend bar */}
          {income>0 && (
            <div style={{marginBottom:14}}>
              <div style={{height:8,background:"#111125",borderRadius:4,overflow:"hidden"}}>
                <div style={{
                  height:"100%",borderRadius:4,transition:"width .6s ease",
                  width:spendPct+"%",
                  background:spendPct>90?"#FF6B6B":spendPct>75?"#F0A500":"#4ECDC4",
                }}/>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",marginTop:5,fontSize:10,color:"#444"}}>
                <span>{spendPct}% gastado</span>
                <span style={{color:balance>=0?"#4ECDC4":"#FF6B6B"}}>
                  {balance>=0?"Ahorro ":"Déficit "}{fmt(Math.abs(balance))}
                </span>
              </div>
            </div>
          )}

          {/* 3 metrics */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
            {[
              ["Balance",    balance>=0?fmt(balance):"−"+fmt(Math.abs(balance)), balance>=0?"#4ECDC4":"#FF6B6B"],
              ["Ahorro",     income>0?savePct+"%":"—",                           savePct>=20?"#4ECDC4":savePct>=0?"#F0A500":"#FF6B6B"],
              ["Transacc.",  expenses.length,                                    "#C8B8FF"],
            ].map(([l,v,c])=>(
              <div key={l} style={{background:"#0A0A18",borderRadius:12,padding:"10px 12px"}}>
                <div style={{fontSize:9,color:"#444",marginBottom:4,letterSpacing:1,textTransform:"uppercase"}}>{l}</div>
                <div style={{fontSize:15,fontWeight:600,color:c}}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick actions */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:20}}>
          {[
            ["+ Gasto",   ()=>openModal("addExpense"), "#C8B8FF","#C8B8FF18"],
            ["+ Meta",    ()=>openModal("addMeta"),    "#4ECDC4","#4ECDC418"],
            ["🤖 IA",     ()=>openModal("ai"),         "#F0A500","#F0A50018"],
          ].map(([l,fn,c,bg])=>(
            <button key={l} onClick={fn} style={{
              background:bg,border:`1px solid ${c}33`,borderRadius:14,
              padding:"14px 0",color:c,fontSize:12,fontWeight:600,
              fontFamily:"'DM Sans',sans-serif",cursor:"pointer",
            }}>{l}</button>
          ))}
        </div>

        {/* Top category */}
        {topCat && (
          <div style={{...S,background:"#0D0D1A",border:`1px solid #16162A`,borderRadius:18,padding:18,marginBottom:16}}>
            <div style={{...css.label,marginBottom:12}}>Mayor gasto · {MONTHS_SHORT[selMonth]}</div>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <div style={{
                width:48,height:48,borderRadius:14,fontSize:22,
                background:getCat(topCat[0]).color+"18",
                display:"flex",alignItems:"center",justifyContent:"center",
              }}>{getCat(topCat[0]).icon}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:15,fontWeight:600,marginBottom:2}}>{getCat(topCat[0]).label}</div>
                <div style={{fontSize:11,color:"#555"}}>
                  {income>0?Math.round(topCat[1]/income*100)+"% del ingreso":""}
                </div>
              </div>
              <div style={{fontSize:18,fontWeight:700,color:getCat(topCat[0]).color}}>{fmtShort(topCat[1])}</div>
            </div>
          </div>
        )}

        {/* Pending debts */}
        {pendingDeudas.length>0 && (
          <div style={{marginBottom:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={css.label}>Deudas pendientes</div>
              <button onClick={()=>setTab("deudas")} style={{background:"none",border:"none",color:"#444",fontSize:11,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>ver todas →</button>
            </div>
            {pendingDeudas.map(d=>(
              <div key={d.id} style={{
                background:"#0D0D1A",border:"1px solid #FF6B6B22",borderLeft:"3px solid #FF6B6B",
                borderRadius:14,padding:"12px 16px",marginBottom:8,
                display:"flex",justifyContent:"space-between",alignItems:"center",
              }}>
                <div>
                  <div style={{fontSize:13,fontWeight:500}}>{d.name}</div>
                  <div style={{fontSize:10,color:"#555",marginTop:2}}>{d.creditor||"Sin acreedor"}{d.dueDate?" · Vence "+new Date(d.dueDate+"T12:00").toLocaleDateString("es-CO",{day:"numeric",month:"short"}):""}</div>
                </div>
                <div style={{fontSize:14,fontWeight:700,color:"#FF6B6B"}}>{fmt(d.total-d.paid)}</div>
              </div>
            ))}
          </div>
        )}

        {/* Metas */}
        {db.metas.length>0 && (
          <div style={{marginBottom:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={css.label}>Metas de ahorro</div>
              <button onClick={()=>setTab("metas")} style={{background:"none",border:"none",color:"#444",fontSize:11,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>ver todas →</button>
            </div>
            {db.metas.slice(0,2).map(m=>{
              const pct=clamp(Math.round(m.saved/m.target*100),0,100);
              return (
                <div key={m.id} style={{...css.surface,padding:"14px 16px",marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                    <span style={{fontSize:13,fontWeight:500}}>{m.icon} {m.name}</span>
                    <span style={{fontSize:12,color:m.color}}>{pct}%</span>
                  </div>
                  <div style={{height:4,background:"#111125",borderRadius:2,overflow:"hidden"}}>
                    <div style={{height:"100%",width:pct+"%",background:m.color,borderRadius:2,transition:"width .5s"}}/>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",marginTop:6,fontSize:10,color:"#444"}}>
                    <span>{fmt(m.saved)}</span><span>{fmt(m.target)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Recent */}
        {recentExp.length>0 && (
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={css.label}>Recientes</div>
              <button onClick={()=>setTab("gastos")} style={{background:"none",border:"none",color:"#444",fontSize:11,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>ver todos →</button>
            </div>
            {recentExp.map(e=>{
              const cat=getCat(e.category);
              return (
                <div key={e.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:`1px solid #0F0F1E`}}>
                  <div style={{width:38,height:38,borderRadius:11,background:cat.color+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,flexShrink:0}}>{cat.icon}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:500,marginBottom:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{e.desc||cat.label}</div>
                    <div style={{fontSize:10,color:"#444"}}>{cat.label} · {new Date(e.date+"T12:00").toLocaleDateString("es-CO",{day:"numeric",month:"short"})}</div>
                  </div>
                  <div style={{fontSize:13,fontWeight:600,color:cat.color,flexShrink:0}}>{fmt(e.amount)}</div>
                </div>
              );
            })}
          </div>
        )}

        {expenses.length===0 && (
          <div style={{textAlign:"center",paddingTop:40,color:"#2A2A40"}}>
            <div style={{fontSize:48,marginBottom:12}}>◈</div>
            <div style={{fontSize:14,marginBottom:6}}>Sin gastos este mes</div>
            <div style={{fontSize:12}}>Toca "+ Gasto" para empezar</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  GASTOS
// ═══════════════════════════════════════════════════════════════════════════════
function Gastos({selMonth,setSelMonth,selYear,curMonth,curYear,mk,income,expenses,totalExp,byCat,updMonth,openModal,fmt,S,css}) {
  const [filterCat, setFilterCat] = useState("all");
  const filtered = filterCat==="all"?expenses:expenses.filter(e=>e.category===filterCat);

  return (
    <div style={{animation:"fadeUp .3s ease"}}>
      <div style={{padding:"32px 20px 16px"}}>
        <div style={{fontFamily:"'DM Serif Display',serif",fontSize:26,marginBottom:4}}>Gastos</div>
        <div style={{fontSize:13,color:"#555"}}>{fmt(totalExp)} · {expenses.length} movimientos</div>
      </div>

      {/* Month */}
      <div style={{padding:"0 20px",marginBottom:16}}>
        <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:2}}>
          {MONTHS_SHORT.map((m,i)=>(
            <button key={i} onClick={()=>setSelMonth(i)} style={{
              background:i===selMonth?"#C8B8FF":"transparent",
              color:i===selMonth?"#07070F":"#444",
              border:`1px solid ${i===selMonth?"#C8B8FF":"#1E1E35"}`,
              borderRadius:20,padding:"5px 12px",fontSize:11,fontWeight:600,
              cursor:"pointer",whiteSpace:"nowrap",fontFamily:"'DM Sans',sans-serif",flexShrink:0,
            }}>{m}</button>
          ))}
        </div>
      </div>

      {/* Cat filter */}
      <div style={{padding:"0 20px",marginBottom:16}}>
        <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:2}}>
          <button onClick={()=>setFilterCat("all")} style={{
            background:filterCat==="all"?"#16162A":"transparent",
            border:`1px solid ${filterCat==="all"?"#C8B8FF33":"#16162A"}`,
            borderRadius:20,padding:"5px 12px",fontSize:11,color:filterCat==="all"?"#C8B8FF":"#555",
            cursor:"pointer",whiteSpace:"nowrap",fontFamily:"'DM Sans',sans-serif",flexShrink:0,
          }}>Todos</button>
          {byCat.map(([catId])=>{
            const cat=getCat(catId);
            return (
              <button key={catId} onClick={()=>setFilterCat(catId)} style={{
                background:filterCat===catId?cat.color+"22":"transparent",
                border:`1px solid ${filterCat===catId?cat.color+"55":"#16162A"}`,
                borderRadius:20,padding:"5px 12px",fontSize:11,color:filterCat===catId?cat.color:"#555",
                cursor:"pointer",whiteSpace:"nowrap",fontFamily:"'DM Sans',sans-serif",flexShrink:0,
              }}>{cat.icon} {cat.label}</button>
            );
          })}
        </div>
      </div>

      <div style={{padding:"0 20px 24px"}}>
        {filtered.length===0 && (
          <div style={{textAlign:"center",paddingTop:60,color:"#2A2A40"}}>
            <div style={{fontSize:40,marginBottom:12}}>↕</div>
            <div style={{fontSize:13}}>Sin gastos</div>
          </div>
        )}
        {[...filtered].reverse().map(e=>{
          const cat=getCat(e.category);
          return (
            <div key={e.id} style={{display:"flex",alignItems:"center",gap:12,padding:"13px 0",borderBottom:`1px solid #0F0F1E`}}>
              <div style={{width:42,height:42,borderRadius:13,background:cat.color+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:19,flexShrink:0}}>{cat.icon}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:14,fontWeight:500,marginBottom:3,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{e.desc||cat.label}</div>
                <div style={{fontSize:10,color:"#555"}}>{cat.label} · {new Date(e.date+"T12:00").toLocaleDateString("es-CO",{day:"numeric",month:"short"})}</div>
              </div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                <div style={{fontSize:14,fontWeight:600,color:cat.color}}>{fmt(e.amount)}</div>
                {selMonth===curMonth && (
                  <div style={{display:"flex",gap:4}}>
                    <button onClick={()=>openModal("editExpense",{expense:e})} style={{background:"none",border:"none",color:"#333",cursor:"pointer",fontSize:13,padding:2}}>✏️</button>
                    <button onClick={()=>updMonth(mk,old=>({...old,expenses:old.expenses.filter(x=>x.id!==e.id)}))} style={{background:"none",border:"none",color:"#333",cursor:"pointer",fontSize:13,padding:2}}>🗑️</button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* FAB */}
      {selMonth===curMonth && (
        <button onClick={()=>openModal("addExpense")} style={{
          position:"fixed",bottom:90,right:"calc(50% - 215px + 20px)",
          width:52,height:52,borderRadius:"50%",
          background:"#C8B8FF",border:"none",color:"#07070F",
          fontSize:24,cursor:"pointer",boxShadow:"0 4px 24px #C8B8FF44",
          display:"flex",alignItems:"center",justifyContent:"center",zIndex:40,
        }}>+</button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  BUDGET
// ═══════════════════════════════════════════════════════════════════════════════
function Budget({selMonth,setSelMonth,selYear,curMonth,curYear,mk,expenses,budgets,byCat,totalExp,updMonth,openModal,fmt,S,css}) {
  const totalBudget = Object.values(budgets).reduce((s,v)=>s+v,0);

  return (
    <div style={{animation:"fadeUp .3s ease"}}>
      <div style={{padding:"32px 20px 20px"}}>
        <div style={{fontFamily:"'DM Serif Display',serif",fontSize:26,marginBottom:4}}>Presupuesto</div>
        <div style={{fontSize:13,color:"#555"}}>Define límites por categoría</div>
      </div>

      <div style={{padding:"0 20px",marginBottom:16}}>
        <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:2}}>
          {MONTHS_SHORT.map((m,i)=>(
            <button key={i} onClick={()=>setSelMonth(i)} style={{
              background:i===selMonth?"#C8B8FF":"transparent",
              color:i===selMonth?"#07070F":"#444",
              border:`1px solid ${i===selMonth?"#C8B8FF":"#1E1E35"}`,
              borderRadius:20,padding:"5px 12px",fontSize:11,fontWeight:600,
              cursor:"pointer",whiteSpace:"nowrap",fontFamily:"'DM Sans',sans-serif",flexShrink:0,
            }}>{m}</button>
          ))}
        </div>
      </div>

      <div style={{padding:"0 20px 100px"}}>
        {/* Summary */}
        {totalBudget>0 && (
          <div style={{background:"#0D0D1A",border:"1px solid #16162A",borderRadius:18,padding:18,marginBottom:20}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
              <div>
                <div style={{fontSize:10,color:"#444",marginBottom:3,letterSpacing:1,textTransform:"uppercase"}}>Presupuesto total</div>
                <div style={{fontSize:20,fontWeight:700,color:"#C8B8FF"}}>{fmt(totalBudget)}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:10,color:"#444",marginBottom:3,letterSpacing:1,textTransform:"uppercase"}}>Gastado</div>
                <div style={{fontSize:20,fontWeight:700,color:totalExp>totalBudget?"#FF6B6B":"#4ECDC4"}}>{fmt(totalExp)}</div>
              </div>
            </div>
            <div style={{height:6,background:"#111125",borderRadius:3,overflow:"hidden"}}>
              <div style={{height:"100%",borderRadius:3,transition:"width .5s",
                width:clamp(Math.round(totalExp/totalBudget*100),0,100)+"%",
                background:totalExp>totalBudget?"#FF6B6B":totalExp/totalBudget>0.8?"#F0A500":"#4ECDC4",
              }}/>
            </div>
          </div>
        )}

        {/* Categories */}
        {CATS.map(cat=>{
          const spent   = expenses.filter(e=>e.category===cat.id).reduce((s,e)=>s+e.amount,0);
          const budget  = budgets[cat.id]||0;
          const pct     = budget>0?clamp(Math.round(spent/budget*100),0,100):0;
          const over    = budget>0 && spent>budget;
          const warn    = budget>0 && !over && pct>=80;

          if(!budget && !spent) return null;

          return (
            <div key={cat.id} style={{
              background:"#0D0D1A",
              border:`1px solid ${over?"#FF6B6B33":warn?"#F0A50033":"#16162A"}`,
              borderRadius:16,padding:"16px 18px",marginBottom:10,
            }}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:20}}>{cat.icon}</span>
                  <div>
                    <div style={{fontSize:13,fontWeight:600}}>{cat.label}</div>
                    <div style={{fontSize:10,color:"#444",marginTop:2}}>
                      {fmt(spent)}{budget>0?" / "+fmt(budget):""}
                    </div>
                  </div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  {over && <span style={{fontSize:10,color:"#FF6B6B",fontWeight:600}}>+{fmt(spent-budget)}</span>}
                  {warn && <span style={{fontSize:10,color:"#F0A500",fontWeight:600}}>⚠ {pct}%</span>}
                  {selMonth===curMonth && (
                    <button onClick={()=>openModal("addBudget",{catId:cat.id,current:budget})} style={{
                      background:cat.color+"18",border:`1px solid ${cat.color}44`,
                      borderRadius:8,padding:"4px 10px",color:cat.color,
                      fontSize:10,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",
                    }}>{budget>0?"editar":"+ límite"}</button>
                  )}
                </div>
              </div>
              {budget>0 && (
                <div style={{height:5,background:"#111125",borderRadius:3,overflow:"hidden"}}>
                  <div style={{height:"100%",borderRadius:3,transition:"width .5s",
                    width:pct+"%",background:over?"#FF6B6B":warn?"#F0A500":cat.color,
                  }}/>
                </div>
              )}
            </div>
          );
        })}

        {/* Add budget for cats without */}
        <div style={{marginTop:16}}>
          <div style={{fontSize:10,letterSpacing:2,color:"#333",textTransform:"uppercase",marginBottom:12,fontWeight:600}}>Sin límite asignado</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {CATS.filter(c=>!budgets[c.id]).map(cat=>(
              <button key={cat.id} onClick={()=>openModal("addBudget",{catId:cat.id,current:0})} style={{
                background:"#0A0A15",border:"1px solid #16162A",borderRadius:14,
                padding:"12px 10px",display:"flex",alignItems:"center",gap:8,
                cursor:"pointer",
              }}>
                <span style={{fontSize:17}}>{cat.icon}</span>
                <span style={{fontSize:12,color:"#444",fontFamily:"'DM Sans',sans-serif"}}>{cat.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  METAS
// ═══════════════════════════════════════════════════════════════════════════════
function Metas({db,setDb,openModal,fmt,S,css}) {
  const totalTarget = db.metas.reduce((s,m)=>s+m.target,0);
  const totalSaved  = db.metas.reduce((s,m)=>s+m.saved,0);

  function deleteMeta(id) {
    setDb(p=>({...p,metas:p.metas.filter(m=>m.id!==id)}));
  }

  return (
    <div style={{animation:"fadeUp .3s ease"}}>
      <div style={{padding:"32px 20px 20px"}}>
        <div style={{fontFamily:"'DM Serif Display',serif",fontSize:26,marginBottom:4}}>Metas</div>
        <div style={{fontSize:13,color:"#555"}}>
          {db.metas.length>0?`${fmt(totalSaved)} ahorrado de ${fmt(totalTarget)}`:"Sin metas aún"}
        </div>
      </div>

      <div style={{padding:"0 20px 100px"}}>
        {db.metas.length===0 && (
          <div style={{textAlign:"center",paddingTop:60,color:"#2A2A40"}}>
            <div style={{fontSize:48,marginBottom:12}}>◎</div>
            <div style={{fontSize:14,marginBottom:6}}>Define tu primera meta</div>
            <div style={{fontSize:12}}>Fondo de emergencias, vacaciones, lo que quieras</div>
          </div>
        )}

        {db.metas.map(m=>{
          const pct=clamp(Math.round(m.saved/m.target*100),0,100);
          const done=pct>=100;
          return (
            <div key={m.id} style={{
              background:"#0D0D1A",
              border:`1px solid ${done?m.color+"44":"#16162A"}`,
              borderRadius:20,padding:20,marginBottom:14,
            }}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <div style={{width:44,height:44,borderRadius:14,background:m.color+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>{m.icon}</div>
                  <div>
                    <div style={{fontSize:15,fontWeight:600}}>{m.name}</div>
                    <div style={{fontSize:11,color:"#555",marginTop:2}}>Meta: {fmt(m.target)}</div>
                  </div>
                </div>
                <button onClick={()=>deleteMeta(m.id)} style={{background:"none",border:"none",color:"#333",cursor:"pointer",fontSize:16}}>×</button>
              </div>

              <div style={{marginBottom:10}}>
                <div style={{height:8,background:"#111125",borderRadius:4,overflow:"hidden",marginBottom:6}}>
                  <div style={{height:"100%",borderRadius:4,transition:"width .6s",width:pct+"%",background:m.color}}/>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:11}}>
                  <span style={{color:m.color,fontWeight:600}}>{fmt(m.saved)}</span>
                  <span style={{color:"#555"}}>{pct}% · faltan {fmt(Math.max(0,m.target-m.saved))}</span>
                </div>
              </div>

              {!done && (
                <button onClick={()=>openModal("abonoMeta",{meta:m})} style={{
                  background:m.color+"18",border:`1px solid ${m.color}44`,borderRadius:12,
                  padding:"10px 0",width:"100%",color:m.color,fontSize:13,fontWeight:600,
                  fontFamily:"'DM Sans',sans-serif",cursor:"pointer",
                }}>+ Abonar</button>
              )}
              {done && (
                <div style={{textAlign:"center",color:m.color,fontSize:13,fontWeight:600,padding:"6px 0"}}>
                  ✓ Meta alcanzada
                </div>
              )}
            </div>
          );
        })}

        <button onClick={()=>openModal("addMeta")} style={{
          ...css.btnGhost,borderRadius:16,padding:"16px 0",
          borderStyle:"dashed",marginTop:4,
        }}>+ Nueva meta</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  DEUDAS
// ═══════════════════════════════════════════════════════════════════════════════
function Deudas({db,setDb,openModal,fmt,S,css}) {
  const pending = db.deudas.filter(d=>!d.done);
  const done    = db.deudas.filter(d=> d.done);
  const totalPending = pending.reduce((s,d)=>s+(d.total-d.paid),0);

  function deleteDeuda(id) {
    setDb(p=>({...p,deudas:p.deudas.filter(d=>d.id!==id)}));
  }

  return (
    <div style={{animation:"fadeUp .3s ease"}}>
      <div style={{padding:"32px 20px 20px"}}>
        <div style={{fontFamily:"'DM Serif Display',serif",fontSize:26,marginBottom:4}}>Deudas</div>
        <div style={{fontSize:13,color:totalPending>0?"#FF6B6B":"#555"}}>
          {totalPending>0?`Debes ${fmt(totalPending)}`:"Sin deudas pendientes 🎉"}
        </div>
      </div>

      <div style={{padding:"0 20px 100px"}}>
        {pending.length===0 && done.length===0 && (
          <div style={{textAlign:"center",paddingTop:60,color:"#2A2A40"}}>
            <div style={{fontSize:48,marginBottom:12}}>⊖</div>
            <div style={{fontSize:14,marginBottom:6}}>Sin deudas registradas</div>
            <div style={{fontSize:12}}>Registra lo que debes para no olvidarlo</div>
          </div>
        )}

        {pending.map(d=>{
          const pct=clamp(Math.round(d.paid/d.total*100),0,100);
          const remaining=d.total-d.paid;
          const overdue=d.dueDate&&new Date(d.dueDate+"T12:00")<new Date();
          return (
            <div key={d.id} style={{
              background:"#0D0D1A",
              border:`1px solid ${overdue?"#FF6B6B44":"#FF6B6B22"}`,
              borderLeft:`3px solid ${overdue?"#FF6B6B":"#FF6B6B66"}`,
              borderRadius:18,padding:18,marginBottom:12,
            }}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                <div>
                  <div style={{fontSize:15,fontWeight:600,marginBottom:3}}>{d.name}</div>
                  <div style={{fontSize:11,color:"#555"}}>
                    {d.creditor&&`A: ${d.creditor}`}
                    {d.dueDate&&` · Vence ${new Date(d.dueDate+"T12:00").toLocaleDateString("es-CO",{day:"numeric",month:"short"})}`}
                    {overdue&&<span style={{color:"#FF6B6B",marginLeft:4}}>· Vencida</span>}
                  </div>
                </div>
                <button onClick={()=>deleteDeuda(d.id)} style={{background:"none",border:"none",color:"#333",cursor:"pointer",fontSize:16}}>×</button>
              </div>

              <div style={{marginBottom:12}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:6,fontSize:11}}>
                  <span style={{color:"#555"}}>Pagado: {fmt(d.paid)}</span>
                  <span style={{color:"#FF6B6B",fontWeight:600}}>Resta: {fmt(remaining)}</span>
                </div>
                <div style={{height:6,background:"#111125",borderRadius:3,overflow:"hidden"}}>
                  <div style={{height:"100%",borderRadius:3,transition:"width .5s",width:pct+"%",background:"#4ECDC4"}}/>
                </div>
                <div style={{fontSize:10,color:"#444",marginTop:4}}>Total: {fmt(d.total)} · {pct}% pagado</div>
              </div>

              {d.note&&<div style={{fontSize:11,color:"#444",marginBottom:12,fontStyle:"italic"}}>"{d.note}"</div>}

              <button onClick={()=>openModal("pagarDeuda",{deuda:d})} style={{
                background:"#4ECDC418",border:"1px solid #4ECDC444",borderRadius:12,
                padding:"10px 0",width:"100%",color:"#4ECDC4",fontSize:13,fontWeight:600,
                fontFamily:"'DM Sans',sans-serif",cursor:"pointer",
              }}>+ Registrar pago</button>
            </div>
          );
        })}

        {done.length>0 && (
          <div style={{marginTop:20}}>
            <div style={{fontSize:10,letterSpacing:2,color:"#333",textTransform:"uppercase",marginBottom:12,fontWeight:600}}>Pagadas ✓</div>
            {done.map(d=>(
              <div key={d.id} style={{
                background:"#0A0A15",border:"1px solid #4ECDC422",borderLeft:"3px solid #4ECDC466",
                borderRadius:14,padding:"12px 16px",marginBottom:8,
                display:"flex",justifyContent:"space-between",alignItems:"center",opacity:.6,
              }}>
                <div>
                  <div style={{fontSize:13,fontWeight:500,textDecoration:"line-through",color:"#555"}}>{d.name}</div>
                  <div style={{fontSize:10,color:"#333"}}>{fmt(d.total)}</div>
                </div>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <span style={{fontSize:11,color:"#4ECDC4"}}>✓ Pagada</span>
                  <button onClick={()=>deleteDeuda(d.id)} style={{background:"none",border:"none",color:"#333",cursor:"pointer",fontSize:14}}>×</button>
                </div>
              </div>
            ))}
          </div>
        )}

        <button onClick={()=>openModal("addDeuda")} style={{
          ...css.btnGhost,borderRadius:16,padding:"16px 0",
          borderStyle:"dashed",marginTop:16,
        }}>+ Nueva deuda</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MODALS
// ═══════════════════════════════════════════════════════════════════════════════
function ModalBase({onClose,title,children}) {
  return (
    <div style={{
      position:"fixed",inset:0,background:"#000000CC",zIndex:100,
      display:"flex",alignItems:"flex-end",justifyContent:"center",
    }} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{
        background:"#0D0D1C",borderRadius:"24px 24px 0 0",
        width:"100%",maxWidth:430,padding:"24px 20px",
        maxHeight:"92vh",overflowY:"auto",
        animation:"slideUp .25s ease",
      }}>
        <style>{`@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
          <div style={{fontFamily:"'DM Serif Display',serif",fontSize:22}}>{title}</div>
          <button onClick={onClose} style={{background:"#16162A",border:"none",borderRadius:"50%",width:32,height:32,color:"#888",fontSize:18,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Add/Edit Expense ──
function ModalAddExpense({closeModal,mk,updMonth,modalData,curMonth,selMonth,isEdit,S,css}) {
  const init = isEdit && modalData.expense ? {
    desc: modalData.expense.desc||"",
    amount: String(modalData.expense.amount),
    category: modalData.expense.category,
    date: modalData.expense.date,
  } : { desc:"", amount:"", category:"comida", date:today() };

  const [form, setForm] = useState(init);

  function save() {
    if(!form.amount||isNaN(Number(form.amount))||Number(form.amount)<=0) return;
    const amount=Number(form.amount);
    updMonth(mk,old=>{
      if(isEdit) return {...old,expenses:old.expenses.map(e=>e.id===modalData.expense.id?{...e,...form,amount}:e)};
      return {...old,expenses:[...(old.expenses||[]),{...form,amount,id:uuid()}]};
    });
    closeModal();
  }

  return (
    <ModalBase onClose={closeModal} title={isEdit?"Editar gasto":"Nuevo gasto"}>
      {/* Amount big */}
      <div style={{textAlign:"center",marginBottom:24}}>
        <div style={{fontSize:10,letterSpacing:3,color:"#555",textTransform:"uppercase",marginBottom:8}}>Valor</div>
        <input
          type="number" autoFocus
          value={form.amount}
          onChange={e=>setForm(f=>({...f,amount:e.target.value}))}
          placeholder="0"
          style={{...css.input,fontSize:32,textAlign:"center",background:"transparent",border:"none",borderBottom:`2px solid ${form.amount?"#C8B8FF":"#1E1E35"}`,borderRadius:0,padding:"8px 0"}}
        />
        <div style={{fontSize:11,color:"#444",marginTop:4}}>COP</div>
      </div>

      {/* Categories */}
      <div style={{marginBottom:20}}>
        <div style={{fontSize:9,letterSpacing:3,color:"#444",textTransform:"uppercase",marginBottom:12,fontWeight:600}}>Categoría</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
          {CATS.map(cat=>(
            <button key={cat.id} onClick={()=>setForm(f=>({...f,category:cat.id}))} style={{
              background:form.category===cat.id?cat.color+"22":"#0A0A16",
              border:`1px solid ${form.category===cat.id?cat.color:"#16162A"}`,
              borderRadius:12,padding:"10px 8px",cursor:"pointer",
              display:"flex",flexDirection:"column",alignItems:"center",gap:4,
            }}>
              <span style={{fontSize:18}}>{cat.icon}</span>
              <span style={{fontSize:9,color:form.category===cat.id?cat.color:"#444",fontFamily:"'DM Sans',sans-serif"}}>{cat.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div style={{marginBottom:16}}>
        <div style={{fontSize:9,letterSpacing:3,color:"#444",textTransform:"uppercase",marginBottom:8,fontWeight:600}}>Descripción (opcional)</div>
        <input value={form.desc} onChange={e=>setForm(f=>({...f,desc:e.target.value}))}
          placeholder="Ej: Almuerzo, taxi..." style={css.input}/>
      </div>

      <div style={{marginBottom:24}}>
        <div style={{fontSize:9,letterSpacing:3,color:"#444",textTransform:"uppercase",marginBottom:8,fontWeight:600}}>Fecha</div>
        <input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}
          style={{...css.input,colorScheme:"dark"}}/>
      </div>

      <div style={{display:"flex",gap:10}}>
        <button onClick={closeModal} style={{...css.btnGhost,flex:1}}>Cancelar</button>
        <button onClick={save} style={{...css.btnPrimary,flex:2}}>{isEdit?"Guardar":"Agregar"}</button>
      </div>
    </ModalBase>
  );
}

// ── Income ──
function ModalIncome({closeModal,mk,updMonth,income,S,css}) {
  const [val,setVal]=useState(income?String(income):"");
  function save() {
    const v=Number(val);
    if(!isNaN(v)&&v>=0) { updMonth(mk,old=>({...old,income:v})); closeModal(); }
  }
  return (
    <ModalBase onClose={closeModal} title="Ingreso del mes">
      <div style={{textAlign:"center",marginBottom:24}}>
        <div style={{fontSize:10,letterSpacing:3,color:"#555",textTransform:"uppercase",marginBottom:8}}>Cuánto ganaste este mes</div>
        <input type="number" autoFocus value={val} onChange={e=>setVal(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&save()}
          placeholder="0"
          style={{...css.input,fontSize:28,textAlign:"center",background:"transparent",border:"none",borderBottom:`2px solid ${val?"#4ECDC4":"#1E1E35"}`,borderRadius:0,padding:"8px 0"}}
        />
        <div style={{fontSize:11,color:"#444",marginTop:4}}>COP</div>
      </div>
      <div style={{display:"flex",gap:10}}>
        <button onClick={closeModal} style={{...css.btnGhost,flex:1}}>Cancelar</button>
        <button onClick={save} style={{...css.btnPrimary,flex:2,background:"#4ECDC4"}}>Guardar</button>
      </div>
    </ModalBase>
  );
}

// ── Add Budget ──
function ModalAddBudget({closeModal,mk,updMonth,modalData,S,css}) {
  const cat=getCat(modalData.catId||"otro");
  const [val,setVal]=useState(modalData.current?String(modalData.current):"");
  function save() {
    const v=Number(val);
    if(!isNaN(v)&&v>=0) {
      updMonth(mk,old=>({...old,budgets:{...(old.budgets||{}),[modalData.catId]:v}}));
      closeModal();
    }
  }
  return (
    <ModalBase onClose={closeModal} title={`Límite · ${cat.label}`}>
      <div style={{textAlign:"center",marginBottom:24}}>
        <div style={{fontSize:36,marginBottom:8}}>{cat.icon}</div>
        <div style={{fontSize:10,letterSpacing:3,color:"#555",textTransform:"uppercase",marginBottom:8}}>Límite mensual</div>
        <input type="number" autoFocus value={val} onChange={e=>setVal(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&save()} placeholder="0"
          style={{...css.input,fontSize:28,textAlign:"center",background:"transparent",border:"none",borderBottom:`2px solid ${val?cat.color:"#1E1E35"}`,borderRadius:0,padding:"8px 0"}}
        />
        <div style={{fontSize:11,color:"#444",marginTop:4}}>COP</div>
      </div>
      <div style={{display:"flex",gap:10}}>
        <button onClick={closeModal} style={{...css.btnGhost,flex:1}}>Cancelar</button>
        <button onClick={save} style={{...css.btnPrimary,flex:2,background:cat.color,color:"#07070F"}}>Guardar</button>
      </div>
    </ModalBase>
  );
}

// ── Add Meta ──
const META_ICONS=["🏖️","🚗","🏠","📱","💻","✈️","💍","📚","🏋️","🎓","🌱","⭐"];
const META_COLORS=["#4ECDC4","#C8B8FF","#F0A500","#FF6B6B","#96CEB4","#45B7D1","#DDA0DD","#FFEAA7"];

function ModalAddMeta({closeModal,db,setDb,modalData,S,css}) {
  const [form,setForm]=useState({name:"",target:"",icon:"🏖️",color:"#4ECDC4"});
  function save() {
    if(!form.name.trim()||!form.target||isNaN(Number(form.target))) return;
    setDb(p=>({...p,metas:[...p.metas,{...form,target:Number(form.target),saved:0,id:uuid(),createdAt:today()}]}));
    closeModal();
  }
  return (
    <ModalBase onClose={closeModal} title="Nueva meta">
      <div style={{marginBottom:16}}>
        <div style={{fontSize:9,letterSpacing:3,color:"#444",textTransform:"uppercase",marginBottom:8,fontWeight:600}}>Nombre</div>
        <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}
          placeholder="Ej: Fondo emergencias, Vacaciones..." style={css.input}/>
      </div>
      <div style={{marginBottom:16}}>
        <div style={{fontSize:9,letterSpacing:3,color:"#444",textTransform:"uppercase",marginBottom:8,fontWeight:600}}>Monto objetivo</div>
        <input type="number" value={form.target} onChange={e=>setForm(f=>({...f,target:e.target.value}))}
          placeholder="0" style={{...css.input,fontSize:20}}/>
      </div>
      <div style={{marginBottom:16}}>
        <div style={{fontSize:9,letterSpacing:3,color:"#444",textTransform:"uppercase",marginBottom:10,fontWeight:600}}>Ícono</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
          {META_ICONS.map(ic=>(
            <button key={ic} onClick={()=>setForm(f=>({...f,icon:ic}))} style={{
              background:form.icon===ic?"#C8B8FF22":"#0A0A16",border:`1px solid ${form.icon===ic?"#C8B8FF":"#16162A"}`,
              borderRadius:10,width:40,height:40,fontSize:18,cursor:"pointer",
            }}>{ic}</button>
          ))}
        </div>
      </div>
      <div style={{marginBottom:24}}>
        <div style={{fontSize:9,letterSpacing:3,color:"#444",textTransform:"uppercase",marginBottom:10,fontWeight:600}}>Color</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {META_COLORS.map(c=>(
            <button key={c} onClick={()=>setForm(f=>({...f,color:c}))} style={{
              width:32,height:32,borderRadius:"50%",background:c,border:`3px solid ${form.color===c?"#fff":"transparent"}`,
              cursor:"pointer",
            }}/>
          ))}
        </div>
      </div>
      <div style={{display:"flex",gap:10}}>
        <button onClick={closeModal} style={{...css.btnGhost,flex:1}}>Cancelar</button>
        <button onClick={save} style={{...css.btnPrimary,flex:2,background:form.color,color:"#07070F"}}>Crear meta</button>
      </div>
    </ModalBase>
  );
}

// ── Abono Meta ──
function ModalAbonoMeta({closeModal,db,setDb,modalData,S,css}) {
  const meta=modalData.meta;
  const [val,setVal]=useState("");
  function save() {
    const v=Number(val);
    if(!isNaN(v)&&v>0) {
      setDb(p=>({...p,metas:p.metas.map(m=>m.id===meta.id?{...m,saved:Math.min(m.target,m.saved+v)}:m)}));
      closeModal();
    }
  }
  return (
    <ModalBase onClose={closeModal} title={`Abonar · ${meta.name}`}>
      <div style={{textAlign:"center",marginBottom:24}}>
        <div style={{fontSize:32,marginBottom:8}}>{meta.icon}</div>
        <div style={{fontSize:11,color:"#555",marginBottom:4}}>Ahorrado: {fmt(meta.saved)} / {fmt(meta.target)}</div>
        <div style={{height:4,background:"#111125",borderRadius:2,overflow:"hidden",marginBottom:20}}>
          <div style={{height:"100%",borderRadius:2,width:clamp(Math.round(meta.saved/meta.target*100),0,100)+"%",background:meta.color}}/>
        </div>
        <input type="number" autoFocus value={val} onChange={e=>setVal(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&save()} placeholder="0"
          style={{...css.input,fontSize:28,textAlign:"center",background:"transparent",border:"none",borderBottom:`2px solid ${val?meta.color:"#1E1E35"}`,borderRadius:0,padding:"8px 0"}}
        />
        <div style={{fontSize:11,color:"#444",marginTop:4}}>COP</div>
      </div>
      <div style={{display:"flex",gap:10}}>
        <button onClick={closeModal} style={{...css.btnGhost,flex:1}}>Cancelar</button>
        <button onClick={save} style={{...css.btnPrimary,flex:2,background:meta.color,color:"#07070F"}}>Abonar</button>
      </div>
    </ModalBase>
  );
}

// ── Add Deuda ──
function ModalAddDeuda({closeModal,db,setDb,modalData,S,css}) {
  const [form,setForm]=useState({name:"",total:"",paid:"0",creditor:"",dueDate:"",note:""});
  function save() {
    if(!form.name.trim()||!form.total||isNaN(Number(form.total))) return;
    setDb(p=>({...p,deudas:[...p.deudas,{
      ...form,total:Number(form.total),paid:Number(form.paid)||0,
      id:uuid(),done:false,createdAt:today(),
    }]}));
    closeModal();
  }
  return (
    <ModalBase onClose={closeModal} title="Nueva deuda">
      {[
        ["Nombre de la deuda","text","name","Ej: Tarjeta Visa, préstamo..."],
        ["Monto total","number","total","0"],
        ["Ya pagué (opcional)","number","paid","0"],
        ["A quién le debo (opcional)","text","creditor","Ej: Banco, persona..."],
        ["Nota (opcional)","text","note","Detalles adicionales..."],
      ].map(([label,type,key,placeholder])=>(
        <div key={key} style={{marginBottom:14}}>
          <div style={{fontSize:9,letterSpacing:3,color:"#444",textTransform:"uppercase",marginBottom:8,fontWeight:600}}>{label}</div>
          <input type={type} value={form[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))}
            placeholder={placeholder} style={{...css.input,fontSize:type==="number"?18:14}}/>
        </div>
      ))}
      <div style={{marginBottom:20}}>
        <div style={{fontSize:9,letterSpacing:3,color:"#444",textTransform:"uppercase",marginBottom:8,fontWeight:600}}>Fecha límite (opcional)</div>
        <input type="date" value={form.dueDate} onChange={e=>setForm(f=>({...f,dueDate:e.target.value}))}
          style={{...css.input,colorScheme:"dark"}}/>
      </div>
      <div style={{display:"flex",gap:10}}>
        <button onClick={closeModal} style={{...css.btnGhost,flex:1}}>Cancelar</button>
        <button onClick={save} style={{...css.btnPrimary,flex:2,background:"#FF6B6B"}}>Registrar</button>
      </div>
    </ModalBase>
  );
}

// ── Pagar Deuda ──
function ModalPagarDeuda({closeModal,db,setDb,modalData,S,css}) {
  const deuda=modalData.deuda;
  const remaining=deuda.total-deuda.paid;
  const [val,setVal]=useState("");
  function save() {
    const v=Number(val);
    if(!isNaN(v)&&v>0) {
      const newPaid=Math.min(deuda.total,deuda.paid+v);
      const done=newPaid>=deuda.total;
      setDb(p=>({...p,deudas:p.deudas.map(d=>d.id===deuda.id?{...d,paid:newPaid,done}:d)}));
      closeModal();
    }
  }
  return (
    <ModalBase onClose={closeModal} title={`Pago · ${deuda.name}`}>
      <div style={{textAlign:"center",marginBottom:24}}>
        <div style={{fontSize:13,color:"#555",marginBottom:4}}>Pendiente: <span style={{color:"#FF6B6B",fontWeight:600}}>{fmt(remaining)}</span></div>
        <input type="number" autoFocus value={val} onChange={e=>setVal(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&save()} placeholder="0"
          style={{...css.input,fontSize:28,textAlign:"center",background:"transparent",border:"none",borderBottom:`2px solid ${val?"#4ECDC4":"#1E1E35"}`,borderRadius:0,padding:"8px 0",marginTop:12}}
        />
        <div style={{fontSize:11,color:"#444",marginTop:4}}>COP · cuánto pagaste hoy</div>
      </div>
      <div style={{display:"flex",gap:10}}>
        <button onClick={closeModal} style={{...css.btnGhost,flex:1}}>Cancelar</button>
        <button onClick={save} style={{...css.btnPrimary,flex:2,background:"#4ECDC4",color:"#07070F"}}>Registrar pago</button>
      </div>
    </ModalBase>
  );
}

// ── AI Modal ──
function ModalAI({closeModal,income,expenses,totalExp,byCat,balance,db,selMonth,S,css}) {
  const [text,setText]=useState("");
  const [loading,setLoading]=useState(false);
  const [done,setDone]=useState(false);

  async function run() {
    if(loading) return;
    setLoading(true); setDone(false); setText("");
    const byCategory=byCat.map(([cat,amt])=>`- ${getCat(cat).label}: ${fmt(amt)} (${totalExp>0?Math.round(amt/totalExp*100):0}%)`).join("\n");
    const totalDebt=db.deudas.filter(d=>!d.done).reduce((s,d)=>s+(d.total-d.paid),0);
    const totalMeta=db.metas.reduce((s,m)=>s+m.target,0);
    const savedMeta=db.metas.reduce((s,m)=>s+m.saved,0);

    const prompt=`Soy una persona en Colombia. Aquí están mis finanzas de ${MONTHS_LONG[selMonth]}:

INGRESOS: ${income>0?fmt(income):"No registrado"}
GASTOS TOTALES: ${fmt(totalExp)}
BALANCE: ${fmt(balance)}
${income>0?`AHORRO: ${Math.round(balance/income*100)}% del ingreso`:""}

GASTOS POR CATEGORÍA:
${byCategory||"Sin datos"}

DEUDAS PENDIENTES: ${totalDebt>0?fmt(totalDebt):"Ninguna"}
METAS DE AHORRO: ${db.metas.length} metas · ${fmt(savedMeta)} ahorrado de ${fmt(totalMeta)}

Dame exactamente 4 recomendaciones financieras muy concretas y personalizadas basadas en mis datos reales. Sé directo, práctico y usa un tono amigable pero honesto. Menciona cifras específicas cuando sea relevante. Responde en español. Numera cada recomendación del 1 al 4. No uses markdown ni asteriscos, solo texto plano.`;

    try {
      const result=await callAI(prompt);
      setText(result);
    } catch {
      setText("Error al conectar. Verifica tu conexión e intenta de nuevo.");
    }
    setLoading(false); setDone(true);
  }

  useEffect(()=>{ run(); },[]);

  function parseRecs(t) {
    const lines=t.split("\n").filter(l=>l.trim());
    const recs=[]; let cur=null;
    lines.forEach(l=>{
      const m=l.match(/^(\d+)[.)]\s*(.+)/);
      if(m){if(cur)recs.push(cur);cur=m[2];}
      else if(cur) cur+=" "+l.trim();
    });
    if(cur)recs.push(cur);
    return recs.length?recs:[t];
  }

  const COLORS=["#4ECDC4","#C8B8FF","#F0A500","#FF6B6B"];
  const ICONS=["💡","📊","🎯","⚡"];

  return (
    <ModalBase onClose={closeModal} title="Análisis IA">
      {loading && (
        <div style={{textAlign:"center",padding:"40px 0"}}>
          <div style={{width:40,height:40,border:"2px solid #1E1E35",borderTopColor:"#C8B8FF",borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 16px"}}/>
          <div style={{fontSize:13,color:"#555"}}>Analizando tus finanzas...</div>
        </div>
      )}
      {!loading && text && (
        <div>
          {parseRecs(text).map((rec,i)=>(
            <div key={i} style={{
              background:"#0A0A16",borderLeft:`3px solid ${COLORS[i]||"#555"}`,
              borderRadius:14,padding:"16px 18px",marginBottom:12,
            }}>
              <div style={{fontSize:18,marginBottom:8}}>{ICONS[i]||"💬"}</div>
              <div style={{fontSize:13,color:"#CCC",lineHeight:1.7}}>{rec}</div>
            </div>
          ))}
          <button onClick={run} style={{...css.btnGhost,marginTop:8,borderRadius:14}}>
            🔄 Actualizar análisis
          </button>
        </div>
      )}
    </ModalBase>
  );
}
