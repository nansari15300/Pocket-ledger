/** Inlined in root layout — runs before React: clicks/errors only (no heartbeat; avoids 60s timer false stalls). */
export const CLIENT_HEALTH_EARLY_BOOT_SCRIPT = `(function(){try{
function healthOn(){
  try{if(localStorage.getItem("pl_ui_health_monitor")==="0")return false;}catch(e){}
  try{if(localStorage.getItem("pl_ui_health_monitor")==="1")return true;if(sessionStorage.getItem("pl_ui_health_monitor")==="1")return true;}catch(e){}
  var h=location.hostname||"";
  if(h==="localhost"||h==="127.0.0.1")return true;
  var ua=(navigator.userAgent||"").toLowerCase();
  if(ua.indexOf("electron")>=0)return true;
  try{var C=window.Capacitor;if(C&&C.isNativePlatform&&C.isNativePlatform())return true;}catch(e){}
  if(/Android/i.test(ua)&&/; wv\\)|\\bwv\\b|Capacitor|Ionic/i.test(ua))return true;
  return true;
}
if(!healthOn())return;
window.__PL_UI_HEALTH_EARLY__=1;
window.__PL_UI_HEALTH_EARLY_TICK_STOP__=function(){};
var RING_KEY="pl_ui_health_ring_v1",ring=[];
function route(){try{return location.pathname+(location.search||"");}catch(e){return "";}}
function persist(){try{sessionStorage.setItem(RING_KEY,JSON.stringify(ring.slice(-100)));}catch(e){}}
function push(kind,summary,detail){
  ring.push({id:String(Date.now())+"-"+Math.random().toString(36).slice(2,7),at:Date.now(),kind:kind,summary:String(summary||"").slice(0,220),detail:detail||"",route:route()});
  if(ring.length>100)ring.splice(0,ring.length-100);
  persist();
  try{window.dispatchEvent(new CustomEvent("pl_client_health_ring"));}catch(e){}
}
function exportText(){
  var lines=["--- App snapshot ---","Route: "+route(),"(early boot — React snapshot loads after hydrate)","--------------------"];
  for(var i=0;i<ring.length;i++){
    var e=ring[i],t=new Date(e.at).toLocaleTimeString();
    lines.push("["+t+"] "+String(e.kind||"").toUpperCase()+" @ "+(e.route||"")+" — "+e.summary);
    if(e.detail)lines.push(String(e.detail));
  }
  return lines.join("\\n");
}
function showOverlay(reason){
  if(document.getElementById("pl-ui-health-emergency-overlay"))return;
  var root=document.createElement("div");
  root.id="pl-ui-health-emergency-overlay";
  root.setAttribute("data-pl-ui-health-emergency","1");
  root.style.cssText="position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:12px;background:rgba(15,23,42,.92);font-family:system-ui,sans-serif;";
  var card=document.createElement("div");
  card.style.cssText="width:min(100%,520px);max-height:92vh;display:flex;flex-direction:column;gap:10px;border-radius:10px;border:1px solid #fbbf24;background:#fffbeb;padding:14px;";
  var h=document.createElement("h2");h.textContent="UI paused — diagnostics";h.style.cssText="margin:0;font-size:16px;font-weight:700;color:#92400e;";
  var p=document.createElement("p");p.textContent="Heavy work paused so you can copy the log. After browser \\"Wait\\", use Copy all then Resume.";p.style.cssText="margin:0;font-size:12px;line-height:1.45;color:#78350f;";
  var r=document.createElement("p");r.textContent=reason||"";r.style.cssText="margin:0;font-size:12px;font-weight:600;color:#b45309;";
  var ta=document.createElement("textarea");ta.readOnly=true;ta.value=exportText();ta.style.cssText="width:100%;min-height:220px;font:11px/1.4 ui-monospace,monospace;border:1px solid #fcd34d;border-radius:6px;padding:8px;";
  var row=document.createElement("div");row.style.cssText="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;";
  function btn(label,bg,fg){var b=document.createElement("button");b.type="button";b.textContent=label;b.style.cssText="cursor:pointer;border-radius:999px;padding:8px 14px;font-size:13px;border:1px solid #cbd5e1;background:"+bg+";color:"+fg+";";return b;}
  var refresh=btn("Refresh log","#f8fafc","#0f172a");
  var copy=btn("Copy all","#f8fafc","#0f172a");
  var resume=btn("Resume app","#2563eb","#fff");resume.style.border="0";
  refresh.onclick=function(){ta.value=exportText();};
  copy.onclick=function(){ta.select();try{navigator.clipboard.writeText(ta.value);}catch(e){} copy.textContent="Copied";setTimeout(function(){copy.textContent="Copy all";},1200);};
  resume.onclick=function(){root.remove();try{window.__PL_UI_HEALTH_BRAKE_RELEASE__&&window.__PL_UI_HEALTH_BRAKE_RELEASE__();}catch(e){} };
  row.append(refresh,copy,resume);card.append(h,p,r,ta,row);root.append(card);document.body.appendChild(root);
  try{window.dispatchEvent(new CustomEvent("pl_client_health_alert",{detail:{reason:reason||"stall",source:"stall",forceOpen:true}}));}catch(e){}
}
document.addEventListener("click",function(ev){
  var t=ev.target,el=t&&t.closest?t.closest("button,a,[role=button],input,select")||t:t;
  var tag=el&&el.tagName?el.tagName.toLowerCase():"?";
  var id=el&&el.id?"#"+el.id:"";
  var txt=el&&el.textContent?String(el.textContent).replace(/\\s+/g," ").trim().slice(0,40):"";
  var href=el&&el.tagName&&String(el.tagName).toLowerCase()==="a"&&el.getAttribute?(" → "+(el.getAttribute("href")||"")):"";
  push("click",tag+id+(txt?' "'+txt+'"':"")+href);
},true);
function isChunkMsg(m){m=String(m||"");return/ChunkLoadError|Failed to load chunk|hmr-client/i.test(m);}
window.addEventListener("error",function(ev){var m=String(ev.message||"Script error");if(isChunkMsg(m)){push("info","Chunk load — hard refresh (Ctrl+Shift+R) or restart dev server");return;}push("error",m);showOverlay(m);});
window.addEventListener("unhandledrejection",function(ev){var x=ev.reason,m=x&&x.message?x.message:String(x||"rejection");if(isChunkMsg(m)){push("info","Chunk load — hard refresh (Ctrl+Shift+R) or restart dev server");return;}push("rejection",m);showOverlay(m);});
try{var raw=sessionStorage.getItem(RING_KEY);if(raw){var p=JSON.parse(raw);if(Array.isArray(p))ring=p.slice(-100);}}catch(e){}
try{var ebk="pl_ui_health_early_boot_last",ebp=Number(sessionStorage.getItem(ebk)||0);if(Date.now()-ebp>8000){sessionStorage.setItem(ebk,String(Date.now()));push("info","UI health early boot (pre-React — clicks/errors only; stall detect after React)");}}catch(e){push("info","UI health early boot (pre-React — clicks/errors only; stall detect after React)");}
}catch(e){}})();`;
