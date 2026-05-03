import { useState, useMemo, useEffect, useCallback, useRef } from "react";

// ─── FONTS ────────────────────────────────────────────────────────────────────
const FONT_URL = "https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500;600&display=swap";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const CATS = [
  { id:"comida",     label:"Comida",      icon:"🍔", color:"#FF6B6B" },
  { id:"transporte", label:"Transporte",  icon:"🚌", color:"#4ECDC4" },
  { id:"hogar",      label:"Hogar",       icon:"🏠", color:"#45B7D1" },
  { id:"salud",      label:"Salud",       icon:"💊", color:"#96CEB4" },
  { id:"ocio",       label:"Ocio",        icon:"🎬", color:"#FFEAA7" },
  { id:"ropa",       label:"Ropa",        icon:"👗", color:"#DDA0DD" },
  { id:"educacion",  label:"Educación",   icon:"📚", color:"#F0A500" },
  { id:"servicios",  label:"Servicios",   icon:"💡", color:"#74B9FF" },
  { id:"otro",       label:"Otro",        icon:"📦", color:"#B2BEC3" },
];
const ML  = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const MS  = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const NAV = [
  { id:"home",    icon:"⌂",  label:"Inicio"    },
  { id:"gastos",  icon:"↕",  label:"Gastos"    },
  { id:"charts",  icon:"◉",  label:"Gráficas"  },
  { id:"budget",  icon:"▦",  label:"Límites"   },
  { id:"mas",     icon:"⋯",  label:"Más"       },
];

// ─── UTILS ────────────────────────────────────────────────────────────────────
const fmt    = n => new Intl.NumberFormat("es-CO",{style:"currency",currency:"COP",maximumFractionDigits:0}).format(n||0);
const fmtK   = n => { const a=Math.abs(n||0); if(a>=1e6) return (n/1e6).toFixed(1)+"M"; if(a>=1e3) return (n/1e3).toFixed(0)+"k"; return fmt(n); };
const today  = () => new Date().toISOString().split("T")[0];
const mkey   = (y,m) => `${y}-${String(m+1).padStart(2,"0")}`;
const getCat = id => CATS.find(c=>c.id===id)||CATS[8];
const clamp  = (v,a,b) => Math.max(a,Math.min(b,v));
const uid    = () => Math.random().toString(36).slice(2,10);
const daysInMonth = (y,m) => new Date(y,m+1,0).getDate();

// ─── STORAGE ──────────────────────────────────────────────────────────────────
const KEY = "maikfinance_v3";
async function loadDB() {
  try { const r=await window.storage.get(KEY); return r?JSON.parse(r.value):freshDB(); }
  catch { return freshDB(); }
}
async function saveDB(db) { try { await window.storage.set(KEY,JSON.stringify(db)); } catch {} }
function freshDB() {
  return {
    months:     {},   // { "2026-05": { income, expenses[], budgets{} } }
    metas:      [],
    deudas:     [],
    recurrentes:[],   // { id, desc, amount, category, day, active }
  };
}

// ─── AI ───────────────────────────────────────────────────────────────────────
async function callAI(prompt) {
  const r = await fetch("https://api.anthropic.com/v1/messages",{
    method:"POST", headers:{"Content-Type":"application/json"},
    body:JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:1000,
      messages:[{role:"user",content:prompt}] }),
  });
  const d=await r.json();
  return d.content?.map(b=>b.text||"").join("")||"";
}

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
const T = {
  bg:"#060608", s1:"#0C0C14", s2:"#121220", border:"#18182A", border2:"#22223A",
  text:"#F0EBE3", muted:"#50506A", accent:"#A78BFA", accentD:"#A78BFA18",
  green:"#34D399", red:"#F87171", yellow:"#FBBF24",
  font:"'DM Sans',sans-serif", fontD:"'Syne',sans-serif",
};
const inp = {
  width:"100%", background:T.s1, border:`1px solid ${T.border2}`,
  borderRadius:12, padding:"13px 16px", color:T.text,
  fontSize:14, fontFamily:T.font, outline:"none", boxSizing:"border-box",
};
const btnP = {
  background:T.accent, border:"none", borderRadius:12,
  padding:"14px 0", color:"#06060A", fontSize:14, fontWeight:700,
  fontFamily:T.font, cursor:"pointer", width:"100%",
};
const btnG = {
  background:"transparent", border:`1px solid ${T.border2}`,
  borderRadius:12, padding:"14px 0", color:T.muted,
  fontSize:13, fontFamily:T.font, cursor:"pointer", width:"100%",
};

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT
// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const now = new Date();
  const [db, setDb]     = useState(freshDB());
  const [ready, setReady] = useState(false);
  const [tab, setTab]   = useState("home");
  const [selM, setSelM] = useState(now.getMonth());
  const [selY] = useState(now.getFullYear());
  const [modal, setModal] = useState(null);
  const [mdata2, setMdata2] = useState({});
  const CM = now.getMonth(), CY = now.getFullYear();

  useEffect(() => {
    loadDB().then(d => { applyRecurrentes(d); setDb(d); setReady(true); });
    if(!document.querySelector("#mf-font")) {
      const l=document.createElement("link");
      l.id="mf-font"; l.rel="stylesheet"; l.href=FONT_URL;
      document.head.appendChild(l);
    }
  },[]);

  useEffect(() => { if(ready) saveDB(db); },[db,ready]);

  // Auto-apply recurrentes for current month
  function applyRecurrentes(d) {
    const mk = mkey(CY,CM);
    const md = d.months[mk]||{income:0,expenses:[],budgets:{}};
    const existing = new Set((md.expenses||[]).filter(e=>e.recurrenteId).map(e=>e.recurrenteId));
    const toAdd = (d.recurrentes||[]).filter(r=>r.active&&!existing.has(r.id));
    if(toAdd.length===0) return;
    d.months[mk] = { ...md, expenses:[...md.expenses, ...toAdd.map(r=>({
      id:uid(), desc:r.desc, amount:r.amount, category:r.category,
      date:`${CY}-${String(CM+1).padStart(2,"0")}-${String(r.day).padStart(2,"0")}`,
      recurrenteId:r.id,
    }))]};
  }

  const mk    = mkey(selY,selM);
  const md    = db.months[mk]||{income:0,expenses:[],budgets:{}};
  const inc   = md.income||0;
  const exps  = md.expenses||[];
  const budgs = md.budgets||{};

  const totalExp = useMemo(()=>exps.reduce((s,e)=>s+e.amount,0),[exps]);
  const balance  = inc-totalExp;
  const spendPct = inc>0?clamp(Math.round(totalExp/inc*100),0,100):0;
  const savePct  = inc>0?Math.round(balance/inc*100):0;

  const byCat = useMemo(()=>{
    const m={}; exps.forEach(e=>{m[e.category]=(m[e.category]||0)+e.amount;});
    return Object.entries(m).sort((a,b)=>b[1]-a[1]);
  },[exps]);

  const totalDebt = db.deudas.filter(d=>!d.done).reduce((s,d)=>s+(d.total-d.paid),0);

  function updM(key,fn) {
    setDb(p=>({...p,months:{...p.months,[key]:fn(p.months[key]||{income:0,expenses:[],budgets:{}})}}));
  }
  const open  = (name,data={}) => { setModal(name); setMdata2(data); };
  const close = () => { setModal(null); setMdata2({}); };

  // Prediction: avg daily spend * remaining days
  function predict() {
    if(exps.length===0) return null;
    const d=new Date(); const dayOfMonth=d.getDate();
    const dailyAvg=totalExp/dayOfMonth;
    const remaining=daysInMonth(selY,selM)-dayOfMonth;
    return Math.round(totalExp+dailyAvg*remaining);
  }
  const prediction = selM===CM&&selY===CY ? predict() : null;

  // Month-over-month
  function prevMonthTotal() {
    const pm = selM===0?11:selM-1, py=selM===0?selY-1:selY;
    return (db.months[mkey(py,pm)]?.expenses||[]).reduce((s,e)=>s+e.amount,0);
  }
  const prevTotal = prevMonthTotal();

  if(!ready) return (
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{width:36,height:36,border:`2px solid ${T.border2}`,borderTopColor:T.accent,borderRadius:"50%",animation:"spin 1s linear infinite"}}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const sharedProps = { db,setDb,selM,setSelM,selY,CM,CY,mk,inc,exps,budgs,totalExp,balance,spendPct,savePct,byCat,totalDebt,prediction,prevTotal,updM,open,close,modal,mdata2,fmt,fmtK,T,inp,btnP,btnG };

  return (
    <div style={{minHeight:"100vh",background:T.bg,color:T.text,fontFamily:T.font,display:"flex",flexDirection:"column",maxWidth:430,margin:"0 auto",position:"relative",fontSize:14}}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes up{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
        *{-webkit-tap-highlight-color:transparent;box-sizing:border-box}
        input[type=number]::-webkit-outer-spin-button,input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
        input[type=date]::-webkit-calendar-picker-indicator{filter:invert(.5)}
        ::-webkit-scrollbar{display:none}
        body{margin:0;background:#060608}
      `}</style>

      <div style={{flex:1,overflowY:"auto",paddingBottom:72}}>
        {tab==="home"   && <Home   {...sharedProps}/>}
        {tab==="gastos" && <Gastos {...sharedProps}/>}
        {tab==="charts" && <Charts {...sharedProps}/>}
        {tab==="budget" && <Budget {...sharedProps}/>}
        {tab==="mas"    && <Mas    {...sharedProps}/>}
      </div>

      {/* NAV */}
      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:430,background:"#08080F",borderTop:`1px solid ${T.border}`,display:"flex",zIndex:50}}>
        {NAV.map(n=>{
          const a=tab===n.id;
          return (
            <button key={n.id} onClick={()=>setTab(n.id)} style={{flex:1,background:"none",border:"none",padding:"10px 0 8px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
              <span style={{fontSize:18,color:a?T.accent:T.muted}}>{n.icon}</span>
              <span style={{fontSize:9,letterSpacing:.5,fontWeight:700,color:a?T.accent:T.muted,fontFamily:T.font,textTransform:"uppercase"}}>{n.label}</span>
            </button>
          );
        })}
      </div>

      {/* MODALS */}
      {modal==="expense"    && <MExpense   {...sharedProps}/>}
      {modal==="income"     && <MIncome    {...sharedProps}/>}
      {modal==="meta"       && <MMeta      {...sharedProps}/>}
      {modal==="abonoMeta"  && <MAbonoMeta {...sharedProps}/>}
      {modal==="deuda"      && <MDeuda     {...sharedProps}/>}
      {modal==="pagoDeuda"  && <MPagoDeuda {...sharedProps}/>}
      {modal==="budget"     && <MBudget    {...sharedProps}/>}
      {modal==="recurrente" && <MRecurrente {...sharedProps}/>}
      {modal==="ai"         && <MAI        {...sharedProps}/>}
      {modal==="export"     && <MExport    {...sharedProps}/>}
      {modal==="search"     && <MSearch    {...sharedProps}/>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOME
// ═══════════════════════════════════════════════════════════════════════════════
function Home(p) {
  const {selM,setSelM,selY,CM,db,inc,exps,totalExp,balance,spendPct,savePct,byCat,totalDebt,prediction,prevTotal,updM,mk,open,fmt,fmtK,T} = p;
  const health = useMemo(()=>{
    let s=100;
    if(inc>0&&spendPct>90) s-=30; else if(inc>0&&spendPct>75) s-=15;
    if(totalDebt>inc*2) s-=25; else if(totalDebt>0) s-=10;
    if(inc===0) s-=15;
    if(savePct>=20) s+=5;
    return clamp(s,0,100);
  },[inc,spendPct,totalDebt,savePct]);
  const hc = health>=70?T.green:health>=40?T.yellow:T.red;

  return (
    <div style={{animation:"up .3s ease"}}>
      {/* Header */}
      <div style={{padding:"32px 20px 16px",background:`linear-gradient(180deg,${T.s2} 0%,${T.bg} 100%)`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div>
            <div style={{fontSize:11,letterSpacing:3,color:T.muted,textTransform:"uppercase",fontWeight:600,marginBottom:4}}>Maik Finance</div>
            <div style={{fontFamily:T.fontD,fontSize:26,fontWeight:800,letterSpacing:-.5}}>{ML[selM]}</div>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <button onClick={()=>open("search")} style={{background:T.s2,border:`1px solid ${T.border2}`,borderRadius:10,width:36,height:36,color:T.muted,fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>⌕</button>
            <div style={{background:hc+"18",border:`1px solid ${hc}44`,borderRadius:20,padding:"5px 12px",display:"flex",alignItems:"center",gap:5}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:hc}}/>
              <span style={{fontSize:11,color:hc,fontWeight:700}}>{health}%</span>
            </div>
          </div>
        </div>

        {/* Month pills */}
        <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:2}}>
          {MS.map((m,i)=>{
            const has=!!(db.months[mkey(selY,i)]?.expenses?.length);
            const a=i===selM;
            return (
              <button key={i} onClick={()=>setSelM(i)} style={{
                background:a?T.accent:"transparent", color:a?"#060608":has?"#888":"#2A2A40",
                border:`1px solid ${a?T.accent:has?T.border2:T.border}`,
                borderRadius:20,padding:"5px 12px",fontSize:11,fontWeight:700,
                cursor:"pointer",whiteSpace:"nowrap",fontFamily:T.font,flexShrink:0,
              }}>{m}</button>
            );
          })}
        </div>
      </div>

      <div style={{padding:"0 20px 28px"}}>
        {/* Main card */}
        <div style={{background:T.s1,border:`1px solid ${T.border}`,borderRadius:24,padding:22,marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}>
            <div>
              <div style={{fontSize:9,letterSpacing:3,color:T.muted,textTransform:"uppercase",fontWeight:600,marginBottom:5}}>Ingresos</div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontFamily:T.fontD,fontSize:22,fontWeight:700,color:T.green}}>{inc>0?fmtK(inc):"—"}</span>
                <button onClick={()=>open("income")} style={{background:"none",border:`1px solid ${T.border2}`,borderRadius:7,color:T.muted,fontSize:10,padding:"2px 8px",cursor:"pointer",fontFamily:T.font}}>editar</button>
              </div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:9,letterSpacing:3,color:T.muted,textTransform:"uppercase",fontWeight:600,marginBottom:5}}>Gastos</div>
              <div style={{fontFamily:T.fontD,fontSize:22,fontWeight:700,color:T.red}}>{fmtK(totalExp)}</div>
            </div>
          </div>

          {inc>0&&(
            <div style={{marginBottom:14}}>
              <div style={{height:8,background:T.border,borderRadius:4,overflow:"hidden"}}>
                <div style={{height:"100%",borderRadius:4,transition:"width .6s ease",width:spendPct+"%",background:spendPct>90?T.red:spendPct>75?T.yellow:T.green}}/>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",marginTop:5,fontSize:10,color:T.muted}}>
                <span>{spendPct}% gastado</span>
                <span style={{color:balance>=0?T.green:T.red}}>{balance>=0?"Ahorro ":"Déficit "}{fmtK(Math.abs(balance))}</span>
              </div>
            </div>
          )}

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
            {[
              ["Balance", balance>=0?fmtK(balance):"−"+fmtK(Math.abs(balance)), balance>=0?T.green:T.red],
              ["Ahorro",  inc>0?savePct+"%":"—", savePct>=20?T.green:savePct>=0?T.yellow:T.red],
              ["Gastos",  exps.length, T.accent],
            ].map(([l,v,c])=>(
              <div key={l} style={{background:T.s2,borderRadius:12,padding:"10px 12px"}}>
                <div style={{fontSize:9,color:T.muted,marginBottom:4,letterSpacing:1,textTransform:"uppercase",fontWeight:600}}>{l}</div>
                <div style={{fontSize:15,fontWeight:700,color:c}}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Prediction */}
        {prediction&&(
          <div style={{background:T.accentD,border:`1px solid ${T.accent}33`,borderRadius:16,padding:"14px 18px",marginBottom:16,display:"flex",alignItems:"center",gap:12}}>
            <span style={{fontSize:20}}>🔮</span>
            <div>
              <div style={{fontSize:11,color:T.accent,fontWeight:600,marginBottom:2}}>Predicción del mes</div>
              <div style={{fontSize:13,color:T.muted}}>
                A este ritmo gastarás <span style={{color:T.text,fontWeight:600}}>{fmt(prediction)}</span>
                {inc>0&&<span style={{color:prediction>inc?T.red:T.green}}> ({prediction>inc?"déficit de "+fmtK(prediction-inc):"ahorro de "+fmtK(inc-prediction)})</span>}
              </div>
            </div>
          </div>
        )}

        {/* vs prev month */}
        {prevTotal>0&&(
          <div style={{background:T.s1,border:`1px solid ${T.border}`,borderRadius:16,padding:"14px 18px",marginBottom:16,display:"flex",alignItems:"center",gap:12}}>
            <span style={{fontSize:20}}>{totalExp>prevTotal?"📈":"📉"}</span>
            <div>
              <div style={{fontSize:11,color:T.muted,fontWeight:600,marginBottom:2}}>vs mes anterior</div>
              <div style={{fontSize:13}}>
                {totalExp>prevTotal?"Gastaste ":"Ahorraste "}
                <span style={{color:totalExp>prevTotal?T.red:T.green,fontWeight:600}}>
                  {fmtK(Math.abs(totalExp-prevTotal))} {totalExp>prevTotal?"más":"menos"}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Quick actions */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:20}}>
          {[
            ["+ Gasto rápido",()=>open("expense"),T.accent,T.accentD],
            ["🤖 Análisis IA",()=>open("ai"),T.yellow,"#FBBF2418"],
          ].map(([l,fn,c,bg])=>(
            <button key={l} onClick={fn} style={{background:bg,border:`1px solid ${c}33`,borderRadius:14,padding:"14px 0",color:c,fontSize:13,fontWeight:700,fontFamily:T.font,cursor:"pointer"}}>{l}</button>
          ))}
        </div>

        {/* Top categories */}
        {byCat.length>0&&(
          <div style={{marginBottom:20}}>
            <div style={{fontSize:9,letterSpacing:3,color:T.muted,textTransform:"uppercase",fontWeight:600,marginBottom:12}}>Dónde más gastas</div>
            {byCat.slice(0,3).map(([catId,amt],i)=>{
              const cat=getCat(catId);
              const pct=totalExp>0?Math.round(amt/totalExp*100):0;
              return (
                <div key={catId} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:`1px solid ${T.border}`}}>
                  <div style={{width:38,height:38,borderRadius:11,background:cat.color+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,flexShrink:0}}>{cat.icon}</div>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                      <span style={{fontSize:13,fontWeight:500}}>{cat.label}</span>
                      <span style={{fontSize:13,fontWeight:700,color:cat.color}}>{fmtK(amt)}</span>
                    </div>
                    <div style={{height:3,background:T.border,borderRadius:2,overflow:"hidden"}}>
                      <div style={{height:"100%",width:pct+"%",background:cat.color,borderRadius:2}}/>
                    </div>
                  </div>
                  <span style={{fontSize:10,color:T.muted,width:28,textAlign:"right"}}>{pct}%</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Pending debts alert */}
        {totalDebt>0&&(
          <div style={{background:"#F8717118",border:"1px solid #F8717133",borderLeft:`3px solid ${T.red}`,borderRadius:16,padding:"14px 18px",marginBottom:16}}>
            <div style={{fontSize:11,color:T.red,fontWeight:700,marginBottom:3}}>⚠ Deudas pendientes</div>
            <div style={{fontSize:13,color:T.muted}}>Debes un total de <span style={{color:T.text,fontWeight:600}}>{fmt(totalDebt)}</span></div>
          </div>
        )}

        {/* Recent */}
        {exps.length>0&&(
          <div>
            <div style={{fontSize:9,letterSpacing:3,color:T.muted,textTransform:"uppercase",fontWeight:600,marginBottom:12}}>Recientes</div>
            {[...exps].reverse().slice(0,5).map(e=>{
              const cat=getCat(e.category);
              return (
                <div key={e.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:`1px solid ${T.border}`}}>
                  <div style={{width:38,height:38,borderRadius:11,background:cat.color+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,flexShrink:0}}>{cat.icon}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:500,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{e.desc||cat.label}</div>
                    <div style={{fontSize:10,color:T.muted,marginTop:2}}>{cat.label} · {new Date(e.date+"T12:00").toLocaleDateString("es-CO",{day:"numeric",month:"short"})}</div>
                  </div>
                  <div style={{fontSize:13,fontWeight:700,color:cat.color,flexShrink:0}}>{fmtK(e.amount)}</div>
                </div>
              );
            })}
          </div>
        )}

        {exps.length===0&&(
          <div style={{textAlign:"center",paddingTop:40,color:T.border2}}>
            <div style={{fontSize:48,marginBottom:12}}>◈</div>
            <div style={{fontSize:14,color:T.muted}}>Sin gastos este mes</div>
          </div>
        )}
      </div>

      {/* FAB */}
      {selM===CM&&(
        <button onClick={()=>open("expense")} style={{
          position:"fixed",bottom:82,right:"calc(50% - 215px + 20px)",
          width:52,height:52,borderRadius:"50%",background:T.accent,border:"none",
          color:"#060608",fontSize:26,cursor:"pointer",boxShadow:`0 4px 24px ${T.accent}44`,
          display:"flex",alignItems:"center",justifyContent:"center",zIndex:40,
        }}>+</button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// GASTOS
// ═══════════════════════════════════════════════════════════════════════════════
function Gastos(p) {
  const {selM,setSelM,selY,CM,CY,mk,exps,totalExp,byCat,updM,open,fmt,fmtK,T,db} = p;
  const [filterCat,setFilterCat]=useState("all");
  const [query,setQuery]=useState("");
  const filtered=useMemo(()=>{
    let r=filterCat==="all"?exps:exps.filter(e=>e.category===filterCat);
    if(query) r=r.filter(e=>(e.desc||"").toLowerCase().includes(query.toLowerCase()));
    return [...r].reverse();
  },[exps,filterCat,query]);

  return (
    <div style={{animation:"up .3s ease"}}>
      <div style={{padding:"32px 20px 16px"}}>
        <div style={{fontFamily:T.fontD,fontSize:26,fontWeight:800,marginBottom:4}}>Gastos</div>
        <div style={{fontSize:13,color:T.muted}}>{fmt(totalExp)} · {exps.length} movimientos</div>
      </div>

      {/* Month */}
      <div style={{padding:"0 20px",marginBottom:12}}>
        <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:2}}>
          {MS.map((m,i)=>{
            const a=i===selM;
            return <button key={i} onClick={()=>setSelM(i)} style={{background:a?T.accent:"transparent",color:a?"#060608":"#444",border:`1px solid ${a?T.accent:T.border}`,borderRadius:20,padding:"5px 12px",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",fontFamily:T.font,flexShrink:0}}>{m}</button>;
          })}
        </div>
      </div>

      {/* Search */}
      <div style={{padding:"0 20px",marginBottom:12}}>
        <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar gasto..." style={{...p.inp,padding:"10px 14px"}}/>
      </div>

      {/* Cat filter */}
      <div style={{padding:"0 20px",marginBottom:16}}>
        <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:2}}>
          <button onClick={()=>setFilterCat("all")} style={{background:filterCat==="all"?T.s2:"transparent",border:`1px solid ${filterCat==="all"?T.accent+"44":T.border}`,borderRadius:20,padding:"5px 12px",fontSize:11,color:filterCat==="all"?T.accent:T.muted,cursor:"pointer",whiteSpace:"nowrap",fontFamily:T.font,flexShrink:0,fontWeight:600}}>Todos</button>
          {byCat.map(([catId])=>{
            const cat=getCat(catId), a=filterCat===catId;
            return <button key={catId} onClick={()=>setFilterCat(catId)} style={{background:a?cat.color+"22":"transparent",border:`1px solid ${a?cat.color+"55":T.border}`,borderRadius:20,padding:"5px 12px",fontSize:11,color:a?cat.color:T.muted,cursor:"pointer",whiteSpace:"nowrap",fontFamily:T.font,flexShrink:0,fontWeight:600}}>{cat.icon} {cat.label}</button>;
          })}
        </div>
      </div>

      <div style={{padding:"0 20px 100px"}}>
        {filtered.length===0&&<div style={{textAlign:"center",paddingTop:60,color:T.muted}}><div style={{fontSize:36,marginBottom:12}}>↕</div><div style={{fontSize:13}}>Sin gastos</div></div>}
        {filtered.map(e=>{
          const cat=getCat(e.category);
          return (
            <div key={e.id} style={{display:"flex",alignItems:"center",gap:12,padding:"13px 0",borderBottom:`1px solid ${T.border}`}}>
              <div style={{width:42,height:42,borderRadius:13,background:cat.color+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:19,flexShrink:0}}>{cat.icon}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:14,fontWeight:500,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",marginBottom:3}}>{e.desc||cat.label}</div>
                <div style={{fontSize:10,color:T.muted}}>{cat.label} · {new Date(e.date+"T12:00").toLocaleDateString("es-CO",{day:"numeric",month:"short"})}{e.recurrenteId?" · 🔄":""}</div>
              </div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                <div style={{fontSize:14,fontWeight:700,color:cat.color}}>{fmt(e.amount)}</div>
                {selM===CM&&selY===CY&&(
                  <div style={{display:"flex",gap:4}}>
                    <button onClick={()=>open("expense",{expense:e})} style={{background:"none",border:"none",color:T.muted,cursor:"pointer",fontSize:13,padding:2}}>✏️</button>
                    <button onClick={()=>updM(mk,old=>({...old,expenses:old.expenses.filter(x=>x.id!==e.id)}))} style={{background:"none",border:"none",color:T.muted,cursor:"pointer",fontSize:13,padding:2}}>🗑️</button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {selM===CM&&selY===CY&&(
        <button onClick={()=>open("expense")} style={{position:"fixed",bottom:82,right:"calc(50% - 215px + 20px)",width:52,height:52,borderRadius:"50%",background:T.accent,border:"none",color:"#060608",fontSize:26,cursor:"pointer",boxShadow:`0 4px 24px ${T.accent}44`,display:"flex",alignItems:"center",justifyContent:"center",zIndex:40}}>+</button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHARTS
// ═══════════════════════════════════════════════════════════════════════════════
function Charts(p) {
  const {selM,setSelM,selY,db,exps,totalExp,byCat,inc,T,fmtK,fmt} = p;

  // Last 6 months data
  const last6 = useMemo(()=>{
    const r=[];
    for(let i=5;i>=0;i--) {
      let m=selM-i, y=selY;
      if(m<0){m+=12;y--;}
      const md=db.months[mkey(y,m)]||{};
      const total=(md.expenses||[]).reduce((s,e)=>s+e.amount,0);
      r.push({label:MS[m],total,income:md.income||0,month:m,year:y});
    }
    return r;
  },[db,selM,selY]);

  const maxBar=Math.max(...last6.map(d=>Math.max(d.total,d.income)),1);

  // Donut
  const donutSize=180, cx=90, cy=90, r=70, stroke=18;
  const circumference=2*Math.PI*r;
  let offset=0;
  const segments=byCat.map(([catId,amt])=>{
    const pct=totalExp>0?amt/totalExp:0;
    const dash=pct*circumference;
    const seg={catId,amt,pct,dash,offset};
    offset+=dash;
    return seg;
  });

  // Daily spend heatmap for current month
  const dailyMap=useMemo(()=>{
    const m={};
    exps.forEach(e=>{const d=e.date?.split("-")[2]; if(d) m[parseInt(d)]=(m[parseInt(d)]||0)+e.amount;});
    return m;
  },[exps]);
  const maxDay=Math.max(...Object.values(dailyMap),1);
  const days=Array.from({length:daysInMonth(selY,selM)},(_,i)=>i+1);

  return (
    <div style={{animation:"up .3s ease"}}>
      <div style={{padding:"32px 20px 20px"}}>
        <div style={{fontFamily:T.fontD,fontSize:26,fontWeight:800,marginBottom:4}}>Gráficas</div>
        <div style={{fontSize:13,color:T.muted}}>Visualiza tus finanzas</div>
      </div>

      <div style={{padding:"0 20px 28px"}}>

        {/* Donut */}
        {byCat.length>0&&(
          <div style={{background:T.s1,border:`1px solid ${T.border}`,borderRadius:22,padding:22,marginBottom:16}}>
            <div style={{fontSize:9,letterSpacing:3,color:T.muted,textTransform:"uppercase",fontWeight:600,marginBottom:20}}>Distribución · {MS[selM]}</div>
            <div style={{display:"flex",alignItems:"center",gap:20}}>
              <div style={{position:"relative",flexShrink:0}}>
                <svg width={donutSize} height={donutSize} style={{transform:"rotate(-90deg)"}}>
                  <circle cx={cx} cy={cy} r={r} fill="none" stroke={T.border} strokeWidth={stroke}/>
                  {segments.map((s,i)=>(
                    <circle key={i} cx={cx} cy={cy} r={r} fill="none"
                      stroke={getCat(s.catId).color}
                      strokeWidth={stroke}
                      strokeDasharray={`${s.dash} ${circumference-s.dash}`}
                      strokeDashoffset={-s.offset}
                      strokeLinecap="round"
                    />
                  ))}
                </svg>
                <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
                  <div style={{fontSize:14,fontWeight:700}}>{fmtK(totalExp)}</div>
                  <div style={{fontSize:9,color:T.muted,letterSpacing:1,textTransform:"uppercase",fontWeight:600}}>total</div>
                </div>
              </div>
              <div style={{flex:1,minWidth:0}}>
                {byCat.slice(0,5).map(([catId,amt])=>{
                  const cat=getCat(catId);
                  const pct=totalExp>0?Math.round(amt/totalExp*100):0;
                  return (
                    <div key={catId} style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                      <div style={{width:8,height:8,borderRadius:"50%",background:cat.color,flexShrink:0}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:11,fontWeight:500,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{cat.label}</div>
                        <div style={{fontSize:9,color:T.muted}}>{pct}%</div>
                      </div>
                      <div style={{fontSize:11,fontWeight:700,color:cat.color}}>{fmtK(amt)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Bar chart last 6 months */}
        <div style={{background:T.s1,border:`1px solid ${T.border}`,borderRadius:22,padding:22,marginBottom:16}}>
          <div style={{fontSize:9,letterSpacing:3,color:T.muted,textTransform:"uppercase",fontWeight:600,marginBottom:20}}>Últimos 6 meses</div>
          <div style={{display:"flex",alignItems:"flex-end",gap:8,height:120}}>
            {last6.map((d,i)=>{
              const hE=Math.round((d.total/maxBar)*100);
              const hI=d.income>0?Math.round((d.income/maxBar)*100):0;
              const isCur=i===5;
              return (
                <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4,height:"100%",justifyContent:"flex-end"}}>
                  <div style={{width:"100%",display:"flex",gap:2,alignItems:"flex-end",height:100}}>
                    {d.income>0&&<div style={{flex:1,background:T.green+"44",borderRadius:"3px 3px 0 0",height:hI+"%",minHeight:2}}/>}
                    <div style={{flex:1,background:isCur?T.accent:T.red+"66",borderRadius:"3px 3px 0 0",height:Math.max(hE,2)+"%",minHeight:2}}/>
                  </div>
                  <div style={{fontSize:9,color:isCur?T.accent:T.muted,fontWeight:isCur?700:400}}>{d.label}</div>
                </div>
              );
            })}
          </div>
          <div style={{display:"flex",gap:16,marginTop:12}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:8,height:8,borderRadius:2,background:T.green+"44"}}/><span style={{fontSize:10,color:T.muted}}>Ingresos</span></div>
            <div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:8,height:8,borderRadius:2,background:T.red+"66"}}/><span style={{fontSize:10,color:T.muted}}>Gastos</span></div>
          </div>
        </div>

        {/* Daily heatmap */}
        {days.length>0&&(
          <div style={{background:T.s1,border:`1px solid ${T.border}`,borderRadius:22,padding:22,marginBottom:16}}>
            <div style={{fontSize:9,letterSpacing:3,color:T.muted,textTransform:"uppercase",fontWeight:600,marginBottom:16}}>Gasto diario · {MS[selM]}</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
              {days.map(d=>{
                const amt=dailyMap[d]||0;
                const intensity=amt>0?clamp(0.2+0.8*(amt/maxDay),0,1):0;
                return (
                  <div key={d} title={amt>0?fmt(amt):""} style={{
                    width:28,height:28,borderRadius:6,
                    background:amt>0?`rgba(167,139,250,${intensity})`:T.border,
                    display:"flex",alignItems:"center",justifyContent:"center",
                    fontSize:9,color:amt>0?"#fff":T.muted,fontWeight:600,
                    cursor:amt>0?"pointer":"default",
                  }}>{d}</div>
                );
              })}
            </div>
            <div style={{display:"flex",justifyContent:"space-between",marginTop:12,fontSize:9,color:T.muted}}>
              <span>Sin gasto</span><span>Más gasto</span>
            </div>
            <div style={{height:4,borderRadius:2,background:`linear-gradient(90deg,${T.border},${T.accent})`,marginTop:4}}/>
          </div>
        )}

        {/* Category trend */}
        {byCat.length>0&&(
          <div style={{background:T.s1,border:`1px solid ${T.border}`,borderRadius:22,padding:22}}>
            <div style={{fontSize:9,letterSpacing:3,color:T.muted,textTransform:"uppercase",fontWeight:600,marginBottom:16}}>Por categoría</div>
            {byCat.map(([catId,amt])=>{
              const cat=getCat(catId);
              const pct=totalExp>0?Math.round(amt/totalExp*100):0;
              return (
                <div key={catId} style={{marginBottom:14}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                    <span style={{fontSize:13}}>{cat.icon} {cat.label}</span>
                    <span style={{fontSize:13,color:cat.color,fontWeight:700}}>{fmtK(amt)} <span style={{color:T.muted,fontWeight:400}}>({pct}%)</span></span>
                  </div>
                  <div style={{height:5,background:T.border,borderRadius:3,overflow:"hidden"}}>
                    <div style={{height:"100%",width:pct+"%",background:cat.color,borderRadius:3,transition:"width .5s"}}/>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {byCat.length===0&&(
          <div style={{textAlign:"center",paddingTop:60,color:T.muted}}>
            <div style={{fontSize:40,marginBottom:12}}>◉</div>
            <div style={{fontSize:13}}>Sin datos para graficar</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// BUDGET
// ═══════════════════════════════════════════════════════════════════════════════
function Budget(p) {
  const {selM,setSelM,selY,CM,CY,mk,exps,budgs,byCat,totalExp,updM,open,fmt,fmtK,T} = p;
  const totalBudget=Object.values(budgs).reduce((s,v)=>s+v,0);
  const catsWithActivity=new Set([...byCat.map(([c])=>c),...Object.keys(budgs)]);

  return (
    <div style={{animation:"up .3s ease"}}>
      <div style={{padding:"32px 20px 20px"}}>
        <div style={{fontFamily:T.fontD,fontSize:26,fontWeight:800,marginBottom:4}}>Límites</div>
        <div style={{fontSize:13,color:T.muted}}>Controla cuánto gastas por categoría</div>
      </div>

      <div style={{padding:"0 20px",marginBottom:12}}>
        <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:2}}>
          {MS.map((m,i)=>{
            const a=i===selM;
            return <button key={i} onClick={()=>setSelM(i)} style={{background:a?T.accent:"transparent",color:a?"#060608":"#444",border:`1px solid ${a?T.accent:T.border}`,borderRadius:20,padding:"5px 12px",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",fontFamily:T.font,flexShrink:0}}>{m}</button>;
          })}
        </div>
      </div>

      <div style={{padding:"0 20px 100px"}}>
        {totalBudget>0&&(
          <div style={{background:T.s1,border:`1px solid ${T.border}`,borderRadius:20,padding:18,marginBottom:20}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
              <div>
                <div style={{fontSize:9,color:T.muted,marginBottom:3,letterSpacing:2,textTransform:"uppercase",fontWeight:600}}>Presupuesto total</div>
                <div style={{fontFamily:T.fontD,fontSize:20,fontWeight:700,color:T.accent}}>{fmtK(totalBudget)}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:9,color:T.muted,marginBottom:3,letterSpacing:2,textTransform:"uppercase",fontWeight:600}}>Gastado</div>
                <div style={{fontFamily:T.fontD,fontSize:20,fontWeight:700,color:totalExp>totalBudget?T.red:T.green}}>{fmtK(totalExp)}</div>
              </div>
            </div>
            <div style={{height:6,background:T.border,borderRadius:3,overflow:"hidden"}}>
              <div style={{height:"100%",borderRadius:3,transition:"width .5s",width:clamp(Math.round(totalExp/totalBudget*100),0,100)+"%",background:totalExp>totalBudget?T.red:totalExp/totalBudget>0.8?T.yellow:T.green}}/>
            </div>
          </div>
        )}

        {[...catsWithActivity].map(catId=>{
          const cat=getCat(catId);
          const spent=exps.filter(e=>e.category===catId).reduce((s,e)=>s+e.amount,0);
          const budget=budgs[catId]||0;
          const pct=budget>0?clamp(Math.round(spent/budget*100),0,100):0;
          const over=budget>0&&spent>budget;
          const warn=budget>0&&!over&&pct>=80;
          return (
            <div key={catId} style={{background:T.s1,border:`1px solid ${over?T.red+"33":warn?T.yellow+"33":T.border}`,borderLeft:`3px solid ${over?T.red:warn?T.yellow:budget>0?cat.color:T.border}`,borderRadius:16,padding:"16px 18px",marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:budget>0?10:0}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:20}}>{cat.icon}</span>
                  <div>
                    <div style={{fontSize:13,fontWeight:600}}>{cat.label}</div>
                    <div style={{fontSize:10,color:T.muted,marginTop:2}}>{fmt(spent)}{budget>0?" / "+fmt(budget):""}</div>
                  </div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  {over&&<span style={{fontSize:10,color:T.red,fontWeight:700}}>+{fmtK(spent-budget)}</span>}
                  {warn&&<span style={{fontSize:10,color:T.yellow,fontWeight:700}}>⚠ {pct}%</span>}
                  {(selM===CM&&selY===CY)&&(
                    <button onClick={()=>open("budget",{catId,current:budget})} style={{background:cat.color+"18",border:`1px solid ${cat.color}44`,borderRadius:8,padding:"4px 10px",color:cat.color,fontSize:10,cursor:"pointer",fontFamily:T.font,fontWeight:600}}>
                      {budget>0?"editar":"+ límite"}
                    </button>
                  )}
                </div>
              </div>
              {budget>0&&(
                <div style={{height:5,background:T.border,borderRadius:3,overflow:"hidden"}}>
                  <div style={{height:"100%",borderRadius:3,transition:"width .5s",width:pct+"%",background:over?T.red:warn?T.yellow:cat.color}}/>
                </div>
              )}
            </div>
          );
        })}

        <div style={{marginTop:20}}>
          <div style={{fontSize:9,letterSpacing:2,color:T.muted,textTransform:"uppercase",fontWeight:600,marginBottom:12}}>Sin límite</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {CATS.filter(c=>!budgs[c.id]&&![...catsWithActivity].includes(c.id)).map(cat=>(
              <button key={cat.id} onClick={()=>open("budget",{catId:cat.id,current:0})} style={{background:T.s1,border:`1px solid ${T.border}`,borderRadius:14,padding:"12px 10px",display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}>
                <span style={{fontSize:17}}>{cat.icon}</span>
                <span style={{fontSize:12,color:T.muted,fontFamily:T.font}}>{cat.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MÁS
// ═══════════════════════════════════════════════════════════════════════════════
function Mas(p) {
  const {db,setDb,open,fmt,fmtK,T,btnP,btnG} = p;
  const [subTab,setSubTab]=useState("metas");

  return (
    <div style={{animation:"up .3s ease"}}>
      <div style={{padding:"32px 20px 0"}}>
        <div style={{fontFamily:T.fontD,fontSize:26,fontWeight:800,marginBottom:20}}>Más</div>
        <div style={{display:"flex",gap:6,marginBottom:20,overflowX:"auto",paddingBottom:2}}>
          {[["metas","◎ Metas"],["deudas","⊖ Deudas"],["recurrentes","🔄 Recurrentes"],["tools","⚙ Herramientas"]].map(([v,l])=>(
            <button key={v} onClick={()=>setSubTab(v)} style={{background:subTab===v?T.accent:"transparent",color:subTab===v?"#060608":T.muted,border:`1px solid ${subTab===v?T.accent:T.border}`,borderRadius:20,padding:"6px 14px",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",fontFamily:T.font,flexShrink:0}}>{l}</button>
          ))}
        </div>
      </div>

      <div style={{padding:"0 20px 100px"}}>
        {subTab==="metas"      && <SubMetas      {...p}/>}
        {subTab==="deudas"     && <SubDeudas     {...p}/>}
        {subTab==="recurrentes"&& <SubRecurrentes {...p}/>}
        {subTab==="tools"      && <SubTools       {...p}/>}
      </div>
    </div>
  );
}

function SubMetas(p) {
  const {db,setDb,open,fmt,fmtK,T} = p;
  function del(id){setDb(prev=>({...prev,metas:prev.metas.filter(m=>m.id!==id)}));}
  return (
    <div>
      {db.metas.length===0&&<div style={{textAlign:"center",paddingTop:40,color:T.muted}}><div style={{fontSize:40,marginBottom:12}}>◎</div><div style={{fontSize:13}}>Sin metas aún</div></div>}
      {db.metas.map(m=>{
        const pct=clamp(Math.round(m.saved/m.target*100),0,100);
        return (
          <div key={m.id} style={{background:T.s1,border:`1px solid ${pct>=100?m.color+"44":T.border}`,borderRadius:20,padding:20,marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:44,height:44,borderRadius:14,background:m.color+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>{m.icon}</div>
                <div>
                  <div style={{fontSize:15,fontWeight:600}}>{m.name}</div>
                  <div style={{fontSize:11,color:T.muted,marginTop:2}}>Meta: {fmt(m.target)}</div>
                </div>
              </div>
              <button onClick={()=>del(m.id)} style={{background:"none",border:"none",color:T.muted,cursor:"pointer",fontSize:18}}>×</button>
            </div>
            <div style={{height:8,background:T.border,borderRadius:4,overflow:"hidden",marginBottom:8}}>
              <div style={{height:"100%",borderRadius:4,transition:"width .6s",width:pct+"%",background:m.color}}/>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:14}}>
              <span style={{color:m.color,fontWeight:700}}>{fmt(m.saved)}</span>
              <span style={{color:T.muted}}>{pct}% · faltan {fmt(Math.max(0,m.target-m.saved))}</span>
            </div>
            {pct<100&&<button onClick={()=>open("abonoMeta",{meta:m})} style={{background:m.color+"18",border:`1px solid ${m.color}44`,borderRadius:12,padding:"10px 0",width:"100%",color:m.color,fontSize:13,fontWeight:700,fontFamily:T.font,cursor:"pointer"}}>+ Abonar</button>}
            {pct>=100&&<div style={{textAlign:"center",color:m.color,fontSize:13,fontWeight:700}}>✓ Meta alcanzada 🎉</div>}
          </div>
        );
      })}
      <button onClick={()=>open("meta")} style={{...p.btnG,borderRadius:16,padding:"16px 0",borderStyle:"dashed",marginTop:4}}>+ Nueva meta</button>
    </div>
  );
}

function SubDeudas(p) {
  const {db,setDb,open,fmt,fmtK,T} = p;
  const pending=db.deudas.filter(d=>!d.done);
  const done=db.deudas.filter(d=>d.done);
  function del(id){setDb(prev=>({...prev,deudas:prev.deudas.filter(d=>d.id!==id)}));}
  return (
    <div>
      {pending.length===0&&done.length===0&&<div style={{textAlign:"center",paddingTop:40,color:T.muted}}><div style={{fontSize:40,marginBottom:12}}>⊖</div><div style={{fontSize:13}}>Sin deudas registradas</div></div>}
      {pending.map(d=>{
        const pct=clamp(Math.round(d.paid/d.total*100),0,100);
        const overdue=d.dueDate&&new Date(d.dueDate+"T12:00")<new Date();
        return (
          <div key={d.id} style={{background:T.s1,border:`1px solid ${overdue?T.red+"44":T.red+"22"}`,borderLeft:`3px solid ${overdue?T.red:T.red+"66"}`,borderRadius:18,padding:18,marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
              <div>
                <div style={{fontSize:15,fontWeight:600,marginBottom:3}}>{d.name}</div>
                <div style={{fontSize:11,color:T.muted}}>
                  {d.creditor&&`A: ${d.creditor}`}
                  {d.dueDate&&` · Vence ${new Date(d.dueDate+"T12:00").toLocaleDateString("es-CO",{day:"numeric",month:"short"})}`}
                  {overdue&&<span style={{color:T.red}}> · Vencida</span>}
                </div>
              </div>
              <button onClick={()=>del(d.id)} style={{background:"none",border:"none",color:T.muted,cursor:"pointer",fontSize:18}}>×</button>
            </div>
            <div style={{marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:6,fontSize:11}}>
                <span style={{color:T.muted}}>Pagado: {fmt(d.paid)}</span>
                <span style={{color:T.red,fontWeight:700}}>Resta: {fmt(d.total-d.paid)}</span>
              </div>
              <div style={{height:6,background:T.border,borderRadius:3,overflow:"hidden"}}>
                <div style={{height:"100%",borderRadius:3,transition:"width .5s",width:pct+"%",background:T.green}}/>
              </div>
              <div style={{fontSize:10,color:T.muted,marginTop:4}}>Total: {fmt(d.total)} · {pct}% pagado</div>
            </div>
            {d.note&&<div style={{fontSize:11,color:T.muted,marginBottom:12,fontStyle:"italic"}}>"{d.note}"</div>}
            <button onClick={()=>open("pagoDeuda",{deuda:d})} style={{background:"#34D39918",border:"1px solid #34D39944",borderRadius:12,padding:"10px 0",width:"100%",color:T.green,fontSize:13,fontWeight:700,fontFamily:T.font,cursor:"pointer"}}>+ Registrar pago</button>
          </div>
        );
      })}
      {done.length>0&&(
        <div style={{marginTop:16}}>
          <div style={{fontSize:9,letterSpacing:2,color:T.muted,textTransform:"uppercase",fontWeight:600,marginBottom:12}}>Pagadas ✓</div>
          {done.map(d=>(
            <div key={d.id} style={{background:T.s1,border:"1px solid #34D39922",borderLeft:"3px solid #34D39966",borderRadius:14,padding:"12px 16px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center",opacity:.6}}>
              <div>
                <div style={{fontSize:13,fontWeight:500,textDecoration:"line-through",color:T.muted}}>{d.name}</div>
                <div style={{fontSize:10,color:T.muted}}>{fmt(d.total)}</div>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <span style={{fontSize:11,color:T.green}}>✓</span>
                <button onClick={()=>del(d.id)} style={{background:"none",border:"none",color:T.muted,cursor:"pointer",fontSize:14}}>×</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <button onClick={()=>open("deuda")} style={{...p.btnG,borderRadius:16,padding:"16px 0",borderStyle:"dashed",marginTop:16}}>+ Nueva deuda</button>
    </div>
  );
}

function SubRecurrentes(p) {
  const {db,setDb,open,fmt,T} = p;
  function toggle(id){setDb(prev=>({...prev,recurrentes:prev.recurrentes.map(r=>r.id===id?{...r,active:!r.active}:r)}));}
  function del(id){setDb(prev=>({...prev,recurrentes:prev.recurrentes.filter(r=>r.id!==id)}));}
  return (
    <div>
      <div style={{fontSize:12,color:T.muted,marginBottom:16,lineHeight:1.6}}>Los gastos recurrentes se agregan automáticamente al inicio de cada mes.</div>
      {db.recurrentes.length===0&&<div style={{textAlign:"center",paddingTop:40,color:T.muted}}><div style={{fontSize:40,marginBottom:12}}>🔄</div><div style={{fontSize:13}}>Sin recurrentes</div><div style={{fontSize:12,marginTop:4}}>Ej: arriendo, Netflix, gimnasio</div></div>}
      {db.recurrentes.map(r=>{
        const cat=getCat(r.category);
        return (
          <div key={r.id} style={{background:T.s1,border:`1px solid ${r.active?cat.color+"33":T.border}`,borderRadius:16,padding:"14px 16px",marginBottom:10,display:"flex",alignItems:"center",gap,}}>
            <div style={{width:40,height:40,borderRadius:12,background:cat.color+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{cat.icon}</div>
            <div style={{flex:1,minWidth:0,marginLeft:12}}>
              <div style={{fontSize:13,fontWeight:600}}>{r.desc}</div>
              <div style={{fontSize:10,color:T.muted,marginTop:2}}>Día {r.day} · {fmt(r.amount)}</div>
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <button onClick={()=>toggle(r.id)} style={{background:r.active?T.green+"18":"transparent",border:`1px solid ${r.active?T.green+"44":T.border}`,borderRadius:10,padding:"4px 10px",color:r.active?T.green:T.muted,fontSize:10,cursor:"pointer",fontFamily:T.font,fontWeight:600}}>{r.active?"Activo":"Pausado"}</button>
              <button onClick={()=>del(r.id)} style={{background:"none",border:"none",color:T.muted,cursor:"pointer",fontSize:16}}>×</button>
            </div>
          </div>
        );
      })}
      <button onClick={()=>open("recurrente")} style={{...p.btnG,borderRadius:16,padding:"16px 0",borderStyle:"dashed",marginTop:4}}>+ Nuevo recurrente</button>
    </div>
  );
}

function SubTools(p) {
  const {open,db,T,btnG} = p;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      <button onClick={()=>open("export")} style={{...p.btnG,textAlign:"left",padding:"18px 20px",borderRadius:16,display:"flex",alignItems:"center",gap:12}}>
        <span style={{fontSize:22}}>📊</span>
        <div><div style={{fontSize:14,fontWeight:600,color:p.T.text}}>Exportar a CSV</div><div style={{fontSize:11,color:p.T.muted,marginTop:2}}>Descarga tu historial de gastos</div></div>
      </button>
      <button onClick={()=>open("ai")} style={{...p.btnG,textAlign:"left",padding:"18px 20px",borderRadius:16,display:"flex",alignItems:"center",gap:12}}>
        <span style={{fontSize:22}}>🤖</span>
        <div><div style={{fontSize:14,fontWeight:600,color:p.T.text}}>Análisis con IA</div><div style={{fontSize:11,color:p.T.muted,marginTop:2}}>Recomendaciones personalizadas</div></div>
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODAL BASE
// ═══════════════════════════════════════════════════════════════════════════════
function MB({onClose,title,children}) {
  return (
    <div style={{position:"fixed",inset:0,background:"#000000CC",zIndex:100,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:"#0C0C18",borderRadius:"24px 24px 0 0",width:"100%",maxWidth:430,padding:"24px 20px 40px",maxHeight:"92vh",overflowY:"auto",animation:"slideUp .25s ease"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
          <div style={{fontFamily:"'Syne',sans-serif",fontSize:22,fontWeight:800}}>{title}</div>
          <button onClick={onClose} style={{background:"#16162A",border:"none",borderRadius:"50%",width:32,height:32,color:"#888",fontSize:18,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Modal: Add/Edit Expense ──────────────────────────────────────────────────
function MExpense(p) {
  const {close,mk,updM,mdata2,CM,selM,CY,selY,T,inp,btnP,btnG} = p;
  const isEdit=!!(mdata2?.expense);
  const init=isEdit?{desc:mdata2.expense.desc||"",amount:String(mdata2.expense.amount),category:mdata2.expense.category,date:mdata2.expense.date}:{desc:"",amount:"",category:"comida",date:today()};
  const [form,setForm]=useState(init);
  function save(){
    if(!form.amount||isNaN(Number(form.amount))||Number(form.amount)<=0)return;
    const amount=Number(form.amount);
    updM(mk,old=>{
      if(isEdit)return{...old,expenses:old.expenses.map(e=>e.id===mdata2.expense.id?{...e,...form,amount}:e)};
      return{...old,expenses:[...(old.expenses||[]),{...form,amount,id:uid()}]};
    });
    close();
  }
  return (
    <MB onClose={close} title={isEdit?"Editar gasto":"Nuevo gasto"}>
      <div style={{textAlign:"center",marginBottom:24}}>
        <input type="number" autoFocus value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} placeholder="0"
          style={{...inp,fontSize:36,textAlign:"center",background:"transparent",border:"none",borderBottom:`2px solid ${form.amount?T.accent:T.border2}`,borderRadius:0,padding:"8px 0",fontWeight:700}}/>
        <div style={{fontSize:11,color:T.muted,marginTop:4}}>COP</div>
      </div>
      <div style={{marginBottom:20}}>
        <div style={{fontSize:9,letterSpacing:3,color:T.muted,textTransform:"uppercase",fontWeight:600,marginBottom:12}}>Categoría</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
          {CATS.map(cat=>(
            <button key={cat.id} onClick={()=>setForm(f=>({...f,category:cat.id}))} style={{background:form.category===cat.id?cat.color+"22":T.s1,border:`1px solid ${form.category===cat.id?cat.color:T.border}`,borderRadius:12,padding:"10px 8px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
              <span style={{fontSize:18}}>{cat.icon}</span>
              <span style={{fontSize:9,color:form.category===cat.id?cat.color:T.muted,fontFamily:T.font,fontWeight:600}}>{cat.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div style={{marginBottom:14}}>
        <div style={{fontSize:9,letterSpacing:3,color:T.muted,textTransform:"uppercase",fontWeight:600,marginBottom:8}}>Descripción (opcional)</div>
        <input value={form.desc} onChange={e=>setForm(f=>({...f,desc:e.target.value}))} placeholder="Ej: Almuerzo, taxi..." style={inp}/>
      </div>
      <div style={{marginBottom:24}}>
        <div style={{fontSize:9,letterSpacing:3,color:T.muted,textTransform:"uppercase",fontWeight:600,marginBottom:8}}>Fecha</div>
        <input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} style={{...inp,colorScheme:"dark"}}/>
      </div>
      <div style={{display:"flex",gap:10}}>
        <button onClick={close} style={{...btnG,flex:1}}>Cancelar</button>
        <button onClick={save} style={{...btnP,flex:2}}>{isEdit?"Guardar":"Agregar"}</button>
      </div>
    </MB>
  );
}

// ─── Modal: Income ────────────────────────────────────────────────────────────
function MIncome(p) {
  const {close,mk,updM,inc,T,inp,btnP,btnG} = p;
  const [val,setVal]=useState(inc?String(inc):"");
  function save(){const v=Number(val);if(!isNaN(v)&&v>=0){updM(mk,old=>({...old,income:v}));close();}}
  return (
    <MB onClose={close} title="Ingreso del mes">
      <div style={{textAlign:"center",marginBottom:24}}>
        <div style={{fontSize:10,letterSpacing:3,color:T.muted,textTransform:"uppercase",marginBottom:8,fontWeight:600}}>¿Cuánto ganaste?</div>
        <input type="number" autoFocus value={val} onChange={e=>setVal(e.target.value)} onKeyDown={e=>e.key==="Enter"&&save()} placeholder="0"
          style={{...inp,fontSize:32,textAlign:"center",background:"transparent",border:"none",borderBottom:`2px solid ${val?"#34D399":T.border2}`,borderRadius:0,padding:"8px 0",fontWeight:700}}/>
        <div style={{fontSize:11,color:T.muted,marginTop:4}}>COP</div>
      </div>
      <div style={{display:"flex",gap:10}}>
        <button onClick={close} style={{...btnG,flex:1}}>Cancelar</button>
        <button onClick={save} style={{...btnP,flex:2,background:"#34D399",color:"#060608"}}>Guardar</button>
      </div>
    </MB>
  );
}

// ─── Modal: Budget ────────────────────────────────────────────────────────────
function MBudget(p) {
  const {close,mk,updM,mdata2,T,inp,btnP,btnG} = p;
  const cat=getCat(mdata2?.catId||"otro");
  const [val,setVal]=useState(mdata2?.current?String(mdata2.current):"");
  function save(){const v=Number(val);if(!isNaN(v)&&v>=0){updM(mk,old=>({...old,budgets:{...(old.budgets||{}),[mdata2.catId]:v}}));close();}}
  return (
    <MB onClose={close} title={`Límite · ${cat.label}`}>
      <div style={{textAlign:"center",marginBottom:28}}>
        <div style={{fontSize:36,marginBottom:12}}>{cat.icon}</div>
        <input type="number" autoFocus value={val} onChange={e=>setVal(e.target.value)} onKeyDown={e=>e.key==="Enter"&&save()} placeholder="0"
          style={{...inp,fontSize:28,textAlign:"center",background:"transparent",border:"none",borderBottom:`2px solid ${val?cat.color:T.border2}`,borderRadius:0,padding:"8px 0",fontWeight:700}}/>
        <div style={{fontSize:11,color:T.muted,marginTop:4}}>COP / mes</div>
      </div>
      <div style={{display:"flex",gap:10}}>
        <button onClick={close} style={{...btnG,flex:1}}>Cancelar</button>
        <button onClick={save} style={{...btnP,flex:2,background:cat.color,color:"#060608"}}>Guardar</button>
      </div>
    </MB>
  );
}

// ─── Modal: Meta ──────────────────────────────────────────────────────────────
const MICONS=["🏖️","🚗","🏠","📱","💻","✈️","💍","📚","🏋️","🎓","🌱","⭐","🎮","🎵","🍕"];
const MCOLORS=["#34D399","#A78BFA","#FBBF24","#F87171","#96CEB4","#45B7D1","#DDA0DD","#4ECDC4"];

function MMeta(p) {
  const {close,db,setDb,T,inp,btnP,btnG} = p;
  const [form,setForm]=useState({name:"",target:"",icon:"🏖️",color:"#34D399"});
  function save(){
    if(!form.name.trim()||!form.target||isNaN(Number(form.target)))return;
    setDb(prev=>({...prev,metas:[...prev.metas,{...form,target:Number(form.target),saved:0,id:uid(),createdAt:today()}]}));
    close();
  }
  return (
    <MB onClose={close} title="Nueva meta">
      <div style={{marginBottom:14}}>
        <div style={{fontSize:9,letterSpacing:3,color:T.muted,textTransform:"uppercase",fontWeight:600,marginBottom:8}}>Nombre</div>
        <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Ej: Fondo emergencias..." style={inp}/>
      </div>
      <div style={{marginBottom:14}}>
        <div style={{fontSize:9,letterSpacing:3,color:T.muted,textTransform:"uppercase",fontWeight:600,marginBottom:8}}>Monto objetivo</div>
        <input type="number" value={form.target} onChange={e=>setForm(f=>({...f,target:e.target.value}))} placeholder="0" style={{...inp,fontSize:22,fontWeight:600}}/>
      </div>
      <div style={{marginBottom:14}}>
        <div style={{fontSize:9,letterSpacing:3,color:T.muted,textTransform:"uppercase",fontWeight:600,marginBottom:10}}>Ícono</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:8}}>{MICONS.map(ic=><button key={ic} onClick={()=>setForm(f=>({...f,icon:ic}))} style={{background:form.icon===ic?T.accentD:T.s1,border:`1px solid ${form.icon===ic?T.accent:T.border}`,borderRadius:10,width:40,height:40,fontSize:18,cursor:"pointer"}}>{ic}</button>)}</div>
      </div>
      <div style={{marginBottom:24}}>
        <div style={{fontSize:9,letterSpacing:3,color:T.muted,textTransform:"uppercase",fontWeight:600,marginBottom:10}}>Color</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{MCOLORS.map(c=><button key={c} onClick={()=>setForm(f=>({...f,color:c}))} style={{width:32,height:32,borderRadius:"50%",background:c,border:`3px solid ${form.color===c?"#fff":"transparent"}`,cursor:"pointer"}}/>)}</div>
      </div>
      <div style={{display:"flex",gap:10}}>
        <button onClick={close} style={{...btnG,flex:1}}>Cancelar</button>
        <button onClick={save} style={{...btnP,flex:2,background:form.color,color:"#060608"}}>Crear meta</button>
      </div>
    </MB>
  );
}

function MAbonoMeta(p) {
  const {close,db,setDb,mdata2,T,inp,btnP,btnG,fmt} = p;
  const meta=mdata2?.meta;
  const [val,setVal]=useState("");
  if(!meta)return null;
  function save(){const v=Number(val);if(!isNaN(v)&&v>0){setDb(prev=>({...prev,metas:prev.metas.map(m=>m.id===meta.id?{...m,saved:Math.min(m.target,m.saved+v)}:m)}));close();}}
  const pct=clamp(Math.round(meta.saved/meta.target*100),0,100);
  return (
    <MB onClose={close} title={`Abonar · ${meta.name}`}>
      <div style={{textAlign:"center",marginBottom:24}}>
        <div style={{fontSize:32,marginBottom:8}}>{meta.icon}</div>
        <div style={{fontSize:11,color:T.muted,marginBottom:4}}>{fmt(meta.saved)} / {fmt(meta.target)}</div>
        <div style={{height:4,background:T.border,borderRadius:2,overflow:"hidden",marginBottom:20}}><div style={{height:"100%",borderRadius:2,width:pct+"%",background:meta.color}}/></div>
        <input type="number" autoFocus value={val} onChange={e=>setVal(e.target.value)} onKeyDown={e=>e.key==="Enter"&&save()} placeholder="0"
          style={{...inp,fontSize:28,textAlign:"center",background:"transparent",border:"none",borderBottom:`2px solid ${val?meta.color:T.border2}`,borderRadius:0,padding:"8px 0",fontWeight:700}}/>
        <div style={{fontSize:11,color:T.muted,marginTop:4}}>COP</div>
      </div>
      <div style={{display:"flex",gap:10}}>
        <button onClick={close} style={{...btnG,flex:1}}>Cancelar</button>
        <button onClick={save} style={{...btnP,flex:2,background:meta.color,color:"#060608"}}>Abonar</button>
      </div>
    </MB>
  );
}

function MDeuda(p) {
  const {close,db,setDb,T,inp,btnP,btnG} = p;
  const [form,setForm]=useState({name:"",total:"",paid:"0",creditor:"",dueDate:"",note:""});
  function save(){
    if(!form.name.trim()||!form.total||isNaN(Number(form.total)))return;
    setDb(prev=>({...prev,deudas:[...prev.deudas,{...form,total:Number(form.total),paid:Number(form.paid)||0,id:uid(),done:false,createdAt:today()}]}));
    close();
  }
  return (
    <MB onClose={close} title="Nueva deuda">
      {[["Nombre","text","name","Ej: Tarjeta Visa, préstamo..."],["Monto total","number","total","0"],["Ya pagué (opcional)","number","paid","0"],["A quién le debo","text","creditor","Banco, persona..."],["Nota","text","note","Detalles..."]].map(([l,t,k,ph])=>(
        <div key={k} style={{marginBottom:14}}>
          <div style={{fontSize:9,letterSpacing:3,color:T.muted,textTransform:"uppercase",fontWeight:600,marginBottom:8}}>{l}</div>
          <input type={t} value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} placeholder={ph} style={{...inp,fontSize:t==="number"?20:14}}/>
        </div>
      ))}
      <div style={{marginBottom:20}}>
        <div style={{fontSize:9,letterSpacing:3,color:T.muted,textTransform:"uppercase",fontWeight:600,marginBottom:8}}>Fecha límite</div>
        <input type="date" value={form.dueDate} onChange={e=>setForm(f=>({...f,dueDate:e.target.value}))} style={{...inp,colorScheme:"dark"}}/>
      </div>
      <div style={{display:"flex",gap:10}}>
        <button onClick={close} style={{...btnG,flex:1}}>Cancelar</button>
        <button onClick={save} style={{...btnP,flex:2,background:T.red}}>Registrar</button>
      </div>
    </MB>
  );
}

function MPagoDeuda(p) {
  const {close,db,setDb,mdata2,T,inp,btnP,btnG,fmt} = p;
  const deuda=mdata2?.deuda;
  const [val,setVal]=useState("");
  if(!deuda)return null;
  function save(){const v=Number(val);if(!isNaN(v)&&v>0){const newP=Math.min(deuda.total,deuda.paid+v);setDb(prev=>({...prev,deudas:prev.deudas.map(d=>d.id===deuda.id?{...d,paid:newP,done:newP>=deuda.total}:d)}));close();}}
  return (
    <MB onClose={close} title={`Pago · ${deuda.name}`}>
      <div style={{textAlign:"center",marginBottom:24}}>
        <div style={{fontSize:13,color:T.muted,marginBottom:4}}>Pendiente: <span style={{color:T.red,fontWeight:700}}>{fmt(deuda.total-deuda.paid)}</span></div>
        <input type="number" autoFocus value={val} onChange={e=>setVal(e.target.value)} onKeyDown={e=>e.key==="Enter"&&save()} placeholder="0"
          style={{...inp,fontSize:28,textAlign:"center",background:"transparent",border:"none",borderBottom:`2px solid ${val?T.green:T.border2}`,borderRadius:0,padding:"8px 0",fontWeight:700,marginTop:12}}/>
        <div style={{fontSize:11,color:T.muted,marginTop:4}}>COP</div>
      </div>
      <div style={{display:"flex",gap:10}}>
        <button onClick={close} style={{...btnG,flex:1}}>Cancelar</button>
        <button onClick={save} style={{...btnP,flex:2,background:T.green,color:"#060608"}}>Registrar pago</button>
      </div>
    </MB>
  );
}

function MRecurrente(p) {
  const {close,db,setDb,T,inp,btnP,btnG} = p;
  const [form,setForm]=useState({desc:"",amount:"",category:"hogar",day:"1"});
  function save(){
    if(!form.desc.trim()||!form.amount||isNaN(Number(form.amount)))return;
    setDb(prev=>({...prev,recurrentes:[...prev.recurrentes,{...form,amount:Number(form.amount),day:Number(form.day),id:uid(),active:true}]}));
    close();
  }
  const cat=getCat(form.category);
  return (
    <MB onClose={close} title="Gasto recurrente">
      <div style={{marginBottom:14}}>
        <div style={{fontSize:9,letterSpacing:3,color:T.muted,textTransform:"uppercase",fontWeight:600,marginBottom:8}}>Descripción</div>
        <input value={form.desc} onChange={e=>setForm(f=>({...f,desc:e.target.value}))} placeholder="Ej: Arriendo, Netflix, gym..." style={inp}/>
      </div>
      <div style={{marginBottom:14}}>
        <div style={{fontSize:9,letterSpacing:3,color:T.muted,textTransform:"uppercase",fontWeight:600,marginBottom:8}}>Valor</div>
        <input type="number" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} placeholder="0" style={{...inp,fontSize:22,fontWeight:600}}/>
      </div>
      <div style={{marginBottom:14}}>
        <div style={{fontSize:9,letterSpacing:3,color:T.muted,textTransform:"uppercase",fontWeight:600,marginBottom:8}}>Día del mes</div>
        <input type="number" min="1" max="28" value={form.day} onChange={e=>setForm(f=>({...f,day:e.target.value}))} style={inp}/>
      </div>
      <div style={{marginBottom:24}}>
        <div style={{fontSize:9,letterSpacing:3,color:T.muted,textTransform:"uppercase",fontWeight:600,marginBottom:12}}>Categoría</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
          {CATS.map(c=>(
            <button key={c.id} onClick={()=>setForm(f=>({...f,category:c.id}))} style={{background:form.category===c.id?c.color+"22":T.s1,border:`1px solid ${form.category===c.id?c.color:T.border}`,borderRadius:12,padding:"10px 8px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
              <span style={{fontSize:17}}>{c.icon}</span>
              <span style={{fontSize:9,color:form.category===c.id?c.color:T.muted,fontFamily:T.font,fontWeight:600}}>{c.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div style={{display:"flex",gap:10}}>
        <button onClick={close} style={{...btnG,flex:1}}>Cancelar</button>
        <button onClick={save} style={{...btnP,flex:2,background:cat.color,color:"#060608"}}>Crear</button>
      </div>
    </MB>
  );
}

// ─── Modal: AI ────────────────────────────────────────────────────────────────
function MAI(p) {
  const {close,inc,exps,totalExp,byCat,balance,db,selM,T,fmt,fmtK,btnG} = p;
  const [text,setText]=useState("");
  const [loading,setLoading]=useState(false);
  const totalDebt=db.deudas.filter(d=>!d.done).reduce((s,d)=>s+(d.total-d.paid),0);
  const totalMeta=db.metas.reduce((s,m)=>s+m.target,0);
  const savedMeta=db.metas.reduce((s,m)=>s+m.saved,0);

  async function run(){
    setLoading(true); setText("");
    const breakdown=byCat.map(([c,a])=>`- ${getCat(c).label}: ${fmt(a)} (${totalExp>0?Math.round(a/totalExp*100):0}%)`).join("\n");
    const prompt=`Soy una persona en Colombia. Finanzas de ${ML[selM]}:

INGRESOS: ${inc>0?fmt(inc):"No registrado"}
GASTOS: ${fmt(totalExp)}
BALANCE: ${fmt(balance)} ${inc>0?"("+Math.round(balance/inc*100)+"% del ingreso)":""}
DEUDAS PENDIENTES: ${totalDebt>0?fmt(totalDebt):"Ninguna"}
METAS: ${db.metas.length} metas · ${fmt(savedMeta)} ahorrado de ${fmt(totalMeta)}

GASTOS POR CATEGORÍA:
${breakdown||"Sin datos"}

Dame exactamente 4 recomendaciones financieras muy concretas, personalizadas con mis cifras reales. Tono directo, amigable y honesto. Menciona cifras específicas. Español. Numera del 1 al 4. Sin markdown ni asteriscos.`;
    try { const r=await callAI(prompt); setText(r); }
    catch { setText("Error al conectar. Intenta de nuevo."); }
    setLoading(false);
  }

  useEffect(()=>{run();},[]);

  function parseRecs(t){
    const lines=t.split("\n").filter(l=>l.trim());
    const recs=[]; let cur=null;
    lines.forEach(l=>{const m=l.match(/^(\d+)[.)]\s*(.+)/);if(m){if(cur)recs.push(cur);cur=m[2];}else if(cur)cur+=" "+l.trim();});
    if(cur)recs.push(cur);
    return recs.length?recs:[t];
  }
  const COLORS=["#34D399","#A78BFA","#FBBF24","#F87171"];
  const ICONS=["💡","📊","🎯","⚡"];

  return (
    <MB onClose={close} title="Análisis IA">
      {loading&&<div style={{textAlign:"center",padding:"40px 0"}}><div style={{width:40,height:40,border:`2px solid ${T.border2}`,borderTopColor:T.accent,borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 16px"}}/><div style={{fontSize:13,color:T.muted}}>Analizando tus finanzas...</div></div>}
      {!loading&&text&&(
        <div>
          {parseRecs(text).map((rec,i)=>(
            <div key={i} style={{background:T.s2,borderLeft:`3px solid ${COLORS[i]||"#555"}`,borderRadius:14,padding:"16px 18px",marginBottom:12}}>
              <div style={{fontSize:18,marginBottom:8}}>{ICONS[i]||"💬"}</div>
              <div style={{fontSize:13,color:"#CCC",lineHeight:1.7}}>{rec}</div>
            </div>
          ))}
          <button onClick={run} style={{...btnG,marginTop:8,borderRadius:14}}>🔄 Actualizar</button>
        </div>
      )}
    </MB>
  );
}

// ─── Modal: Export ────────────────────────────────────────────────────────────
function MExport(p) {
  const {close,db,selM,selY,exps,T,btnP,btnG,fmt} = p;
  const [done,setDone]=useState(false);

  function exportCSV(){
    const rows=[["Fecha","Descripción","Categoría","Monto"],...exps.map(e=>[e.date,e.desc||getCat(e.category).label,getCat(e.category).label,e.amount])];
    const csv=rows.map(r=>r.join(",")).join("\n");
    const blob=new Blob([csv],{type:"text/csv"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url; a.download=`gastos-${ML[selM]}-${selY}.csv`; a.click();
    URL.revokeObjectURL(url);
    setDone(true);
  }

  return (
    <MB onClose={close} title="Exportar gastos">
      <div style={{textAlign:"center",padding:"20px 0 30px"}}>
        <div style={{fontSize:48,marginBottom:16}}>📊</div>
        <div style={{fontSize:15,fontWeight:600,marginBottom:8}}>{ML[selM]} {selY}</div>
        <div style={{fontSize:13,color:T.muted,marginBottom:24}}>{exps.length} gastos · {fmt(exps.reduce((s,e)=>s+e.amount,0))}</div>
        {done&&<div style={{fontSize:13,color:T.green,marginBottom:16}}>✓ Archivo descargado</div>}
        <button onClick={exportCSV} style={{...btnP,maxWidth:240,margin:"0 auto"}}>Descargar CSV</button>
      </div>
    </MB>
  );
}

// ─── Modal: Search ────────────────────────────────────────────────────────────
function MSearch(p) {
  const {close,db,T,inp,fmt} = p;
  const [q,setQ]=useState("");
  const results=useMemo(()=>{
    if(q.length<2)return[];
    const all=Object.values(db.months).flatMap(m=>m.expenses||[]);
    return all.filter(e=>(e.desc||"").toLowerCase().includes(q.toLowerCase())||getCat(e.category).label.toLowerCase().includes(q.toLowerCase())).slice(0,20);
  },[q,db]);

  return (
    <MB onClose={close} title="Buscar">
      <input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="Busca cualquier gasto..." style={{...inp,marginBottom:16}}/>
      {q.length>=2&&results.length===0&&<div style={{textAlign:"center",color:T.muted,paddingTop:20,fontSize:13}}>Sin resultados</div>}
      {results.map(e=>{
        const cat=getCat(e.category);
        return (
          <div key={e.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 0",borderBottom:`1px solid ${T.border}`}}>
            <div style={{width:38,height:38,borderRadius:11,background:cat.color+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,flexShrink:0}}>{cat.icon}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:500}}>{e.desc||cat.label}</div>
              <div style={{fontSize:10,color:T.muted,marginTop:2}}>{cat.label} · {e.date}</div>
            </div>
            <div style={{fontSize:13,fontWeight:700,color:cat.color}}>{fmt(e.amount)}</div>
          </div>
        );
      })}
    </MB>
  );
}
