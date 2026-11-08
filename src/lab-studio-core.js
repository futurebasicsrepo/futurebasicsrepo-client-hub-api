// The Studio (/lab/studio), part 1 of 5: what a layer is, the state, history, how each layer is drawn, the view, pointer work on the stage, iPad and the Pencil.
// The five parts are one script, served joined in order (core, layers, io, open, workspace) as /lab/studio-main.js (src/server.js), so
// they share one scope exactly as the single inline script they were cut from did; they are separate files to be read and changed.
'use strict';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const TOKEN=()=>{try{return localStorage.getItem('fb.admin.token')||localStorage.getItem('fb.client.token')||''}catch{return ''}}; // staff sign in at the work console; a client with the Design Lab on their room signs in at their hub
const CLIENT_MODE=()=>{try{return !localStorage.getItem('fb.admin.token')&&Boolean(localStorage.getItem('fb.client.token'))}catch{return false}};
async function api(path,o={}){const r=await fetch(path,{method:o.method||(o.body?'POST':'GET'),headers:{Authorization:'Bearer '+TOKEN(),...(o.body?{'Content-Type':'application/json'}:{})},body:o.body?JSON.stringify(o.body):undefined});const j=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(j.error||('Request failed ('+r.status+')')),{status:r.status});return j}
async function blobOf(path){const r=await fetch(path,{headers:{Authorization:'Bearer '+TOKEN()}});if(!r.ok)throw new Error('The picture could not be loaded ('+r.status+')');return r.blob()}
const urlOfBlob=b=>new Promise((ok,no)=>{const fr=new FileReader();fr.onload=()=>ok(fr.result);fr.onerror=no;fr.readAsDataURL(b)});
const imgOf=src=>new Promise((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=()=>no(new Error('A picture could not be read'));i.src=src});
const canvas=(w,h)=>{const c=document.createElement('canvas');c.width=Math.max(1,Math.round(w));c.height=Math.max(1,Math.round(h));return c};
let RID=1;const stamp=c=>{c._rid=RID++;return c};
const cloneCanvas=c=>{const n=canvas(c.width,c.height);n.getContext('2d').drawImage(c,0,0);return stamp(n)};
const uid=()=>'l'+Math.random().toString(36).slice(2,9);
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const QS=new URLSearchParams(location.search),CID=QS.get('concept')||'';
// the same studio builds graphics for the library: ?new=graphic starts on a clear canvas, ?art=<id> reworks a graphic; nothing here is a concept then
// a tag or label (?tag=<material id>) opens as a graphic the size of the tag: its blank face and its words as layers, every tool on them; saved,
// the design becomes the tag's face (cards, sheets and the tech pack draw it) and can go on a garment (?for=<concept id> adds it straight there)
let TAG=QS.get('tag')||'',TAGM=null;const FORC=QS.get('for')||'';
const PICK=QS.get('pick')==='1'&&window.parent!==window;if(PICK){document.documentElement.dataset.pick='1';document.documentElement.dataset.fbnav='off'} // a window inside the piece's studio: the studio alone, no console menu or tabs
let GID=QS.get('art')||'';const GMODE=!CID&&(Boolean(GID)||QS.get('new')==='graphic'||Boolean(TAG));
const AI_URL=()=>GMODE?'/v1/lab/library/studio/ai':`/v1/lab/concepts/${CID}/studio/ai`;
let PARTS=null,PKIND='pockets';

// ---------- what a layer is ----------
// the built-in faces, and the fonts uploaded to the Lab (loaded from the server, so type sets the same on every machine)
const FONTS={grotesk:['Space Grotesk',"'Space Grotesk',system-ui,sans-serif"],mono:['IBM Plex Mono',"'IBM Plex Mono',monospace"],serif:['Serif',"Georgia,'Times New Roman',serif"],slab:['Slab',"Rockwell,'Roboto Slab','Courier New',serif"],condensed:['Condensed',"Impact,Haettenschweiler,'Anton','Arial Narrow Bold',sans-serif"],script:['Script',"'Brush Script MT','Segoe Script','Dancing Script',cursive"],typewriter:['Typewriter',"'Courier New',Courier,'Special Elite',monospace"],
  // the open-source library (src/lab-fonts.js): every one free to use on anything we make, hosted here so it sets the same everywhere
  ...Object.fromEntries((window.FBFONTS||[]).map(f=>['g_'+f.id,[f.family,f.stack,f.category]]))};
const BLENDS=[['source-over','Normal'],['multiply','Multiply (sits in the fabric)'],['screen','Screen'],['overlay','Overlay'],['soft-light','Soft light'],['hard-light','Hard light'],['darken','Darken'],['lighten','Lighten'],['color-burn','Colour burn'],['color-dodge','Colour dodge'],['difference','Difference'],['hue','Hue'],['saturation','Saturation'],['color','Colour'],['luminosity','Luminosity']];
const KIND={base:'Picture',image:'Picture layer',paint:'Painting',text:'Type',shape:'Shape'};
const fresh=(kind,o={})=>({id:uid(),kind,name:o.name||KIND[kind],visible:true,locked:kind==='base',opacity:1,blend:'source-over',x:0,y:0,scale:1,rot:0,flip:false,
  adjust:{hue:0,sat:100,bright:100,contrast:100},tint:{color:'#141416',amount:0},distress:{style:'worn',amount:0,size:50,seed:Math.floor(Math.random()*1e6)},...o});

// ---------- state ----------
let D=null,W=1024,H=1024,LAYERS=[],SEL=null,TOOL='select',CUR='#141416',DIRTY=false,SAVED_AT=null;
const OPT={size:28,esize:40,flow:1,soft:0,dsize:60,area:60,pressure:true,tip:'round',etip:'hard',stream:0,qshape:true,lock:false,ftol:40,sym:'off'};
try{Object.assign(OPT,JSON.parse(localStorage.getItem('fb.studio.aids')||'{}'))}catch{}
const keepAids=()=>{try{localStorage.setItem('fb.studio.aids',JSON.stringify({stream:OPT.stream,qshape:OPT.qshape,lock:OPT.lock,ftol:OPT.ftol,sym:OPT.sym}))}catch{}};
const docC=canvas(1,1),docX=docC.getContext('2d');
let mask=canvas(1,1),maskX=mask.getContext('2d'),MASKED=false;
const view=$('#view'),vx=view.getContext('2d',{desynchronized:true})||view.getContext('2d');let Z=1,PX=0,PY=0,DPR=1; // desynchronized: the browser may show each frame without waiting for the page (lower Pencil latency where it is supported)
const layerOf=id=>LAYERS.find(l=>l.id===id);
const selected=()=>layerOf(SEL);
const isRaster=l=>l&&(l.kind==='base'||l.kind==='image'||l.kind==='paint');
const fixed=l=>l.kind==='base'||l.kind==='paint'; // full-size layers that do not move

// ---------- history (rasters are copied before they change, so a step keeps its own) ----------
let HIST=[],HI=-1;
const copyL=l=>({...l,adjust:{...l.adjust},tint:{...l.tint},distress:{...l.distress},finish:l.finish?{...l.finish,distress:{...l.finish.distress}}:null,...(l.warp?{warp:{...l.warp,pts:l.warp.pts.map(p=>[...p])}}:{}),...(l.paths?{paths:l.paths.map(p=>({closed:p.closed,nodes:p.nodes.map(n=>[...n])}))}:{}),...(l.ill?{ill:JSON.parse(JSON.stringify(l.ill))}:{})});
const snapL=l=>{const c=copyL(l);c._pc=null;c._pk=null;c._dc=null;c._dk=null;c._db=null;c._tk=null;c._tu=null;return c};
const snap=()=>({sel:SEL,layers:LAYERS.map(snapL)});
// a memory budget for the undo steps: each step keeps its own copy of any picture it changed, so a long session on a big picture can pass what an iPad lets a page hold (past that, Safari blanks canvases without a word); the oldest steps go first
const IOS=/iP(ad|hone|od)/.test(navigator.platform)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const MEM={hist:(IOS?160:640)*1048576};
function histBytes(){const seen=new Set();let b=0;for(const s of HIST)for(const l of s.layers){const r=l.raster;if(r&&!seen.has(r)){seen.add(r);b+=r.width*r.height*4}}return b}
function histTrim(){while(HIST.length>2&&histBytes()>MEM.hist){HIST.shift();HI--}}
function commit(){HIST=HIST.slice(0,HI+1);HIST.push(snap());if(HIST.length>60)HIST.shift();HI=HIST.length-1;histTrim();touch();syncUndo()}
function restore(s){LAYERS=s.layers.map(copyL);SEL=s.sel&&layerOf(s.sel)?s.sel:null;touch();paintPanels();draw()}
const onFlat=()=>(VMODE==='front'||VMODE==='back')&&FF()?.undo;
function undo(){if(onFlat()){FF().undo();syncUndo();return}if(HI>0){HI--;restore(HIST[HI]);syncUndo()}}function redo(){if(onFlat()){FF().redo();syncUndo();return}if(HI<HIST.length-1){HI++;restore(HIST[HI]);syncUndo()}}
function syncUndo(){if(onFlat()){const f=FF();$('#undo').disabled=!f.canUndo();$('#redo').disabled=!f.canRedo()}else{$('#undo').disabled=HI<=0;$('#redo').disabled=HI>=HIST.length-1}const ru=$('#railUndo'),rr=$('#railRedo');if(ru){ru.disabled=$('#undo').disabled;rr.disabled=$('#redo').disabled}}
let EDITS=0;function touch(){DIRTY=true;EDITS++;showSaved();PRES?.editing(true);autoSoon()}
// Who else has this concept open (/presence.js): their initials by Save; if someone else is changing it while you have changes, say so once
let PRES=null,PRES_WARNED=false;
function watchPresence(){if(PRES||GMODE||!/^[0-9a-f-]{36}$/i.test(CID)||!window.FBPresence)return;PRES=FBPresence.watch({type:'concept',id:CID,el:$('#people'),token:TOKEN,onOthers:(list,words)=>{if(DIRTY&&!PRES_WARNED&&list.some(p=>p.mode==='editing')){PRES_WARNED=true;toast(`${words}. The last one to save wins: talk it through before you both save.`)}}})}
// the last save, said the way people say it ("Saved just now", "Saved 4 min ago"), with the clock time on hover; it ticks while the page is open
const agoOf=t=>{const s=Math.max(0,(Date.now()-new Date(t))/1000);return s<45?'just now':s<90?'a minute ago':s<3600?`${Math.round(s/60)} min ago`:'at '+new Date(t).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})};
function showSaved(){const s=$('#saved');if(SAVING)return;s.className='saved'+(DIRTY||SAVE_ERR?' dirty':'');s.textContent=SAVE_ERR?`Not saved: ${SAVE_ERR}${AUTO_FAILS?' · trying again':''}`:DIRTY?'Changes not saved yet':SAVED_AT?'Saved '+agoOf(SAVED_AT):'';s.title=SAVED_AT?'Last saved '+new Date(SAVED_AT).toLocaleString():''}
setInterval(()=>{if(!DIRTY&&SAVED_AT)showSaved()},20000);
// Autosave: a few seconds after the last change, when nothing is being dragged or drawn. A failed save is tried again, a little later each time;
// the 90-second save stays as a safety net. HOLD stops it while the image model draws the picture from the flats.
const AUTO_MS=3000;let AUTO=0,AUTO_FAILS=0,SAVING=false,HOLD=false,SAVE_ERR='';
function autoSoon(ms=AUTO_MS){clearTimeout(AUTO);if(GMODE&&!GID)return;AUTO=setTimeout(autoSave,ms)}
async function autoSave(){if(!DIRTY||HOLD)return;if(DRAG||SAVING||!$('#busy').classList.contains('hidden')){autoSoon(1500);return}
  const ok=await saveAll();if(ok){AUTO_FAILS=0}else{AUTO_FAILS++;showSaved();autoSoon(Math.min(60000,AUTO_MS*2**AUTO_FAILS))}}

// ---------- distressing: a worn texture made from a seed, so it is the same every time it is drawn ----------
const texture=(...a)=>window.FBFinish.texture(...a); // the same worn textures as the technique library (src/lab-finish.js)

// ---------- what each layer looks like on its own (before it is placed) ----------
async function loadFonts(){let changed=false;for(const f of (D.fonts||[])){const key='f_'+f.id;if(FONTS[key])continue;
    try{const buf=await (await blobOf(`/v1/lab/fonts/${f.id}/file`)).arrayBuffer();const face=new FontFace(f.family,buf);await face.load();document.fonts.add(face);FONTS[key]=[f.name,`'${f.family}',sans-serif`,f.id];changed=true}catch(x){toast(`The font "${f.name}" could not be loaded.`)}}
  if(changed){for(const l of LAYERS)if(l.kind==='text'){l._pk=null;l._pc=null;l._tk=null}draw()}}
const fontOpts=v=>`<optgroup label="Built in">${Object.entries(FONTS).filter(([k])=>!k.startsWith('f_')&&!k.startsWith('g_')).map(([k,f])=>`<option value="${k}" ${k===v?'selected':''}>${esc(f[0])}</option>`).join('')}</optgroup>${[...new Set(Object.entries(FONTS).filter(([k])=>k.startsWith('g_')).map(([,f])=>f[2]))].map(cat=>`<optgroup label="${esc(cat)}">${Object.entries(FONTS).filter(([k,f])=>k.startsWith('g_')&&f[2]===cat).map(([k,f])=>`<option value="${k}" ${k===v?'selected':''}>${esc(f[0])}</option>`).join('')}</optgroup>`).join('')}${Object.keys(FONTS).some(k=>k.startsWith('f_'))?`<optgroup label="Our fonts">${Object.entries(FONTS).filter(([k])=>k.startsWith('f_')).map(([k,f])=>`<option value="${k}" ${k===v?'selected':''}>${esc(f[0])}</option>`).join('')}</optgroup>`:''}`;
async function addFont(file){if(!file)return;if(file.size>8e6){toast(file.name+' is over 8 MB.');return}busy('Adding the font…');
  try{const r=await api('/v1/lab/fonts',{body:{name:file.name.replace(/\.[a-z0-9]+$/i,''),file:await urlOfBlob(file)}});D.fonts=[...(D.fonts||[]),r.font];await loadFonts();const l=selected();if(l&&l.kind==='text'&&!l.locked){l.font='f_'+r.font.id;l._pk=null;commit()}paintLayers();draw();toast(`"${r.font.name}" is in the Lab's fonts now, for every machine.`)}
  catch(x){toast(x.message)}finally{busy()}}
$('#fontIn').addEventListener('change',e=>{addFont(e.target.files[0]);e.target.value=''});
// the words as the case setting shows them: as typed, ALL CAPS, lower case or Title Case (the words themselves are kept as typed)
const caseOf=(t,c)=>c==='upper'?t.toUpperCase():c==='lower'?t.toLowerCase():c==='title'?t.toLowerCase().replace(/(^|[\s\-\/])(\p{L})/gu,(m,a,b)=>a+b.toUpperCase()):t;
// a type layer with an effect beyond one outline: drawn as a picture in an SVG export, not as editable type
const textFx=l=>Boolean((l.stretch&&l.stretch!==100)||l.outline2||(l.shadow&&l.shadowKind&&l.shadowKind!=='none')||(l.env&&l.env!=='none'&&l.envK));
// a shape the words are set in, letter by letter (as Illustrator's envelope warps): t is where the letter is along its line (0 to 1), a the amount (−1 to 1)
const ENVS=[['none','Straight'],['bridge','Bridge'],['bulge','Bulge'],['pinch','Pinch'],['flag','Flag'],['wave','Wave'],['rise','Rise'],['grow','Grow']];
function envAt(kind,t,a,size,lw){const S=Math.sin(Math.PI*t);switch(kind){case'bridge':return{dy:0,sy:1+a*S,rot:0,base:true};case'bulge':return{dy:0,sy:1+a*S,rot:0};case'pinch':return{dy:0,sy:Math.max(.2,1-a*S*.7),rot:0};
  case'flag':{const A=a*size*.28;return{dy:A*Math.sin(2*Math.PI*t),sy:1,rot:Math.atan(A*2*Math.PI*Math.cos(2*Math.PI*t)/Math.max(1,lw))}}case'wave':{const A=a*size*.22;return{dy:A*Math.sin(4*Math.PI*t),sy:1,rot:Math.atan(A*4*Math.PI*Math.cos(4*Math.PI*t)/Math.max(1,lw))}}
  case'rise':{const A=a*size*.9;return{dy:-A*(t-.5),sy:1,rot:Math.atan(-A/Math.max(1,lw))}}case'grow':return{dy:0,sy:Math.max(.2,1+a*(t-.5)*1.4),rot:0,base:true};default:return{dy:0,sy:1,rot:0}}}
function textMetrics(l){
  // a type layer with no size yet (one opened from an older save, or half made) is set at the usual size rather than throwing on its font
  if(!(Number(l.size)>0))l.size=96;
  const x=docX,font=`${l.italic?'italic ':''}${l.bold?'700':'400'} ${l.size}px ${FONTS[l.font]?.[1]||FONTS.grotesk[1]}`;x.save();x.font=font;
  try{if(document.fonts&&!document.fonts.check(font))document.fonts.load(font).then(()=>{if(document.fonts.check(font)){l._pk=null;l._pc=null;l._tk=null;draw()}}).catch(()=>{})}catch{}
  const lines=caseOf(String(l.text||' '),l.case).split('\n'),lw=lines.map(t=>[...t].reduce((s,ch)=>s+x.measureText(ch).width,0)+Math.max(0,[...t].length-1)*l.track);x.restore();return{font,lines,lw}}
function contentOf(l){
  if(isRaster(l))return l.raster;
  if(l.kind==='text')return textEffects(l,textCore(l));
  return contentOther(l)}
function textCore(l){{
    const{font,lines,lw}=textMetrics(l),o1=l.outline||0,o2=l.outline2||0,pad=Math.ceil(l.size*.35+(o1+o2)*2+4),lh=l.size*l.lead;
    const ink=(x,g,px,py)=>{x.lineJoin='round';if(o2){x.strokeStyle=l.outline2Color||'#141416';x.lineWidth=(o1+o2)*2;x.strokeText(g,px,py)}if(o1){x.strokeStyle=l.outlineColor;x.lineWidth=o1*2;x.strokeText(g,px,py)}x.fillText(g,px,py)};
    if(l.arc&&lines.length===1){
      // one line bent on a circle: up for an arch (college, rock tee), down for a smile; each letter stands square to the curve
      const L=Math.max(1,lw[0]),th=Math.abs(l.arc)/100*Math.PI,R=L/th,up=l.arc>0;docX.save();docX.font=font;
      let s=0;const gl=[...lines[0]].map(g=>{const gw=docX.measureText(g).width,phi=-th/2+(s+gw/2)/R;s+=gw+l.track;return{g,x:R*Math.sin(phi),y:up?R*(1-Math.cos(phi)):-R*(1-Math.cos(phi)),r:up?phi:-phi}});docX.restore();
      const xs=gl.map(q=>q.x),ys=gl.map(q=>q.y),ext=l.size*.75+pad,x0=Math.min(...xs)-ext,x1=Math.max(...xs)+ext,y0=Math.min(...ys)-ext,y1=Math.max(...ys)+ext;
      const c=canvas(x1-x0,y1-y0),x=c.getContext('2d');x.font=font;x.textBaseline='middle';x.textAlign='center';x.fillStyle=l.color;
      for(const q of gl){x.save();x.translate(q.x-x0,q.y-y0);x.rotate(q.r);ink(x,q.g,0,0);x.restore()}
      return c}
    const ek=l.env&&l.env!=='none'?clamp((l.envK||0)/100,-1,1):0,ex=ek?Math.ceil(l.size*Math.abs(ek)*(l.env==='rise'?.6:1.1)):0;
    const w=Math.max(...lw,1)+pad*2,h=lines.length*lh+pad*2+ex*2,c=canvas(w,h),x=c.getContext('2d');
    x.font=font;x.textBaseline='middle';x.fillStyle=l.color;
    lines.forEach((t,i)=>{const x0=l.align==='left'?pad:l.align==='right'?w-pad-lw[i]:(w-lw[i])/2;let px=x0;const py=ex+pad+lh*i+lh/2;
      for(const g of[...t]){const gw=x.measureText(g).width;if(!ek){ink(x,g,px,py)}else{const e=envAt(l.env,(px+gw/2-x0)/Math.max(1,lw[i]),ek,l.size,lw[i]),bl=l.size*.36;x.save();x.translate(px+gw/2,py+e.dy);x.rotate(e.rot);if(e.base){x.translate(0,bl);x.scale(1,e.sy);x.translate(0,-bl)}else x.scale(1,e.sy);ink(x,g,-gw/2,0);x.restore()}px+=gw+l.track}});
    return c}}
// stretch (narrower or wider letters), then a shadow that prints: a solid copy offset (drop) or a solid block behind (extrude), in one ink
function textEffects(l,c){
  if(!c||!c.width)return c;const st=(l.stretch||100)/100;
  if(Math.abs(st-1)>.001){const s=canvas(Math.max(1,c.width*st),c.height);s.getContext('2d').drawImage(c,0,0,s.width,s.height);c=s}
  const d=l.shadowKind&&l.shadowKind!=='none'?Math.max(0,l.shadow||0):0;if(!d)return c;
  const a=((l.shadowAngle??135)-90)*Math.PI/180,dx=Math.cos(a)*d,dy=Math.sin(a)*d,sh=canvas(c.width,c.height),sx=sh.getContext('2d');sx.drawImage(c,0,0);sx.globalCompositeOperation='source-in';sx.fillStyle=l.shadowColor||'#141416';sx.fillRect(0,0,sh.width,sh.height);
  const o=canvas(c.width+Math.abs(dx)+2,c.height+Math.abs(dy)+2),ox=o.getContext('2d'),bx=dx<0?-dx:0,by=dy<0?-dy:0;
  if(l.shadowKind==='extrude'){const n=Math.ceil(d);for(let i=n;i>=1;i--)ox.drawImage(sh,bx+dx*i/n,by+dy*i/n)}else ox.drawImage(sh,bx+dx,by+dy);
  ox.drawImage(c,bx,by);return o}
function contentOther(l){
  if(l.kind==='shape'&&window.ILL){const c=ILL.content(l);if(c)return c}
  if(l.kind==='shape'&&l.shape==='path'&&window.VEC)return VEC.content(l);
  if(l.kind==='shape'){
    const sw=l.stroke?l.strokeW:0,ah=l.shape==='line'&&l.arrow&&l.arrow!=='none'?Math.max(sw,1)*3.2:0,pad=Math.ceil(sw/2+2+ah),c=canvas(l.w+pad*2,(l.shape==='line'?Math.max(sw,2):l.h)+pad*2),x=c.getContext('2d');
    x.lineWidth=sw;x.strokeStyle=l.strokeColor;x.fillStyle=l.fillColor;x.lineCap='round';x.lineJoin='round';if(l.dash==='dash')x.setLineDash([Math.max(sw,1)*3,Math.max(sw,1)*2]);else if(l.dash==='dot')x.setLineDash([.01,Math.max(sw,1)*2]);x.beginPath();
    if(l.shape==='ellipse')x.ellipse(c.width/2,c.height/2,l.w/2,l.h/2,0,0,Math.PI*2);
    else if(l.shape==='line'){const y=c.height/2,x0=pad,x1=c.width-pad;x.moveTo(x0+(l.arrow==='both'?ah*.8:0),y);x.lineTo(x1-(ah?ah*.8:0),y);x.lineWidth=Math.max(sw,1);x.strokeStyle=l.stroke?l.strokeColor:l.fillColor;x.stroke();
      if(ah){x.setLineDash([]);x.fillStyle=x.strokeStyle;const head=(tip,d)=>{x.beginPath();x.moveTo(tip,y);x.lineTo(tip-d*ah,y-ah*.6);x.lineTo(tip-d*ah,y+ah*.6);x.closePath();x.fill()};head(x1,1);if(l.arrow==='both')head(x0,-1)}return c}
    else x.roundRect(pad,pad,l.w,l.h,Math.min(l.radius||0,l.w/2,l.h/2));
    if(l.fill)x.fill();if(sw)x.stroke();return c}
  return canvas(1,1);
}
const unitOf=l=>{const u=(W/1000)/(fixed(l)?1:l.scale);return Math.pow(1.15,Math.round(Math.log(u)/Math.log(1.15)))}; // stitches and dots keep a real size: one step per 15% of scale
const sig=l=>JSON.stringify([l.finish,l.finish?unitOf(l):0,l.kind,l.raster?l.raster._rid:0,l.text,l.font,l.size,l.bold,l.italic,l.track,l.lead,l.align,l.arc,l.color,l.outline,l.outlineColor,l.case,l.stretch,l.outline2,l.outline2Color,l.shadow,l.shadowKind,l.shadowAngle,l.shadowColor,l.env,l.envK,l.shape,l.w,l.h,l.radius,l.fill,l.fillColor,l.stroke,l.strokeW,l.strokeColor,l.dash,l.arrow,l.pv,l.adjust,l.tint,l.distress,l.warp,l.ill&&{f:l.ill.fill,w:l.ill.widths,t:l.ill.text}]);
const plainLook=l=>l.adjust.hue===0&&l.adjust.sat===100&&l.adjust.bright===100&&l.adjust.contrast===100;
// the layer with its colour adjustments, its recolouring and its distressing: cached until any of them change
function processed(l){
  const k=sig(l);if(l._pk===k&&l._pc)return l._pc;
  const src=contentOf(l);if(!src||!src.width||!src.height)return canvas(1,1); // nothing drawn yet (type whose font is still loading): drawn as nothing this frame, and not kept
  const c=canvas(src.width,src.height),x=c.getContext('2d');
  if(!plainLook(l))x.filter=`hue-rotate(${l.adjust.hue}deg) saturate(${l.adjust.sat}%) brightness(${l.adjust.bright}%) contrast(${l.adjust.contrast}%)`;
  x.drawImage(src,0,0);x.filter='none';
  if(l.tint.amount>0){x.globalCompositeOperation='source-atop';x.globalAlpha=l.tint.amount;x.fillStyle=l.tint.color;x.fillRect(0,0,c.width,c.height);x.globalAlpha=1}
  if(l.distress.amount>0){x.globalCompositeOperation='destination-out';x.globalAlpha=clamp(l.distress.amount,0,1);x.drawImage(texture(l.distress.style,c.width,c.height,l.distress.size,l.distress.seed),0,0);x.globalAlpha=1}
  x.globalCompositeOperation='source-over';
  const out=l.finish&&l.finish.effect&&l.finish.effect!=='none'?window.FBFinish.effect(c,l.finish,unitOf(l),l.distress.seed||1):c;
  const bent=l.warp&&!fixed(l)?warpOf(out,l):out;l._pk=k;l._pc=bent;return bent;
}
const dims=l=>{if(isRaster(l)&&l.raster&&!(l.warp&&!fixed(l)))return[l.raster.width,l.raster.height];const c=processed(l);return[c.width,c.height]}; // a finish keeps the size; only a warp changes it
function place(x,l){x.translate(l.x,l.y);x.rotate(l.rot);x.scale(l.scale*(l.flip?-1:1),l.scale)}
// the colour adjustments as one matrix (the same maths as the CSS filters, in their order: hue, saturation, brightness, contrast), applied in one pass
function lookMatrix(a){const mul=(A,B)=>{const o=[];for(let r=0;r<3;r++){const row=[];for(let c=0;c<4;c++){let v=c===3?A[r][3]:0;for(let k=0;k<3;k++)v+=A[r][k]*B[k][c];row.push(v)}o.push(row)}return o};
  const t=a.hue*Math.PI/180,C=Math.cos(t),S=Math.sin(t),s=a.sat/100,b=a.bright/100,k=a.contrast/100;
  const hue=[[.213+C*.787-S*.213,.715-C*.715-S*.715,.072-C*.072+S*.928,0],[.213-C*.213+S*.143,.715+C*.285+S*.140,.072-C*.072-S*.283,0],[.213-C*.213-S*.787,.715-C*.715+S*.715,.072+C*.928+S*.072,0]];
  const sat=[[.213+.787*s,.715-.715*s,.072-.072*s,0],[.213-.213*s,.715+.285*s,.072-.072*s,0],[.213-.213*s,.715-.715*s,.072+.928*s,0]],br=[[b,0,0,0],[0,b,0,0],[0,0,b,0]],ct=[[k,0,0,(.5-.5*k)*255],[0,k,0,(.5-.5*k)*255],[0,0,k,(.5-.5*k)*255]];
  return mul(ct,mul(br,mul(sat,hue)))}
function draftOf(l){const k0=sig({...l,finish:null})+'|d';if(l._dk===k0&&l._dc)return l._dc;
  const bk=sig({...l,finish:null,adjust:{hue:0,sat:100,bright:100,contrast:100},tint:{amount:0},distress:{amount:0}});let base=l._db;
  if(!base||base._k!==bk){const src=contentOf(l);if(!src||!src.width)return canvas(1,1);const k=Math.min(1,480/Math.max(src.width,src.height));base=canvas(Math.max(1,Math.round(src.width*k)),Math.max(1,Math.round(src.height*k)));base.getContext('2d').drawImage(src,0,0,base.width,base.height);base._k=bk;base._w=src.width;base._h=src.height;base._px=base.getContext('2d',{willReadFrequently:true}).getImageData(0,0,base.width,base.height);l._db=base}
  const w=base.width,h=base.height,c=canvas(w,h),x=c.getContext('2d');
  if(plainLook(l))x.drawImage(base,0,0);else{const M=lookMatrix(l.adjust),S=base._px.data,img=x.createImageData(w,h),O=img.data;for(let i=0;i<S.length;i+=4){if(!S[i+3])continue;const r=S[i],g=S[i+1],bl=S[i+2];O[i]=M[0][0]*r+M[0][1]*g+M[0][2]*bl+M[0][3];O[i+1]=M[1][0]*r+M[1][1]*g+M[1][2]*bl+M[1][3];O[i+2]=M[2][0]*r+M[2][1]*g+M[2][2]*bl+M[2][3];O[i+3]=S[i+3]}x.putImageData(img,0,0)}
  const src={width:base._w,height:base._h};
  if(l.tint.amount>0){x.globalCompositeOperation='source-atop';x.globalAlpha=l.tint.amount;x.fillStyle=l.tint.color;x.fillRect(0,0,w,h);x.globalAlpha=1}
  if(l.distress.amount>0){x.globalCompositeOperation='destination-out';x.globalAlpha=clamp(l.distress.amount,0,1);x.drawImage(texture(l.distress.style,src.width,src.height,l.distress.size,l.distress.seed),0,0,w,h);x.globalAlpha=1}
  c._w=src.width;c._h=src.height;l._dk=k0;l._dc=c;return c}
let SLIDE=null;const sliding=l=>SLIDE&&SLIDE.l===l&&SLIDE.until>performance.now()&&!(l.warp&&!fixed(l));
function drawLayer(x,l){if(!l.visible)return;if(sliding(l)){const c=draftOf(l);x.save();x.globalAlpha=l.opacity;x.globalCompositeOperation=l.blend;place(x,l);x.drawImage(c,-c._w/2,-c._h/2,c._w,c._h);x.restore();return}const c=processed(l),sh=l.finish&&window.FBFinish.shadow(l.finish,W/1000);x.save();x.globalAlpha=l.opacity;x.globalCompositeOperation=l.blend;if(sh){x.shadowColor=sh.color;x.shadowBlur=sh.blur;x.shadowOffsetX=sh.dx;x.shadowOffsetY=sh.dy}place(x,l);x.drawImage(c,-c.width/2,-c.height/2);x.restore()}
// ---- drawing fast: while a stroke is made only its layer changes, so the layers under it and over it are put together once, at the start
// of the stroke, and each frame is those two pictures with the stroke's layer between them (it was every layer, with its finish, every
// frame: a slow, laggy Pencil). The whole picture is put together again when the stroke ends.
let STK=null;
// the full-size canvases a stroke or a drag works with belong to it alone: when it is done they are let go at once (on an iPad, canvas memory comes back only when a canvas is emptied)
const freeC=c=>{if(c){c.width=0;c.height=0}};
function setSTK(n){const o=STK;STK=n;if(o&&o!==n){for(const k of ['below','above','buf'])if(o[k]&&o[k]!==n?.[k])freeC(o[k])}}
function composeInto(x,keep,white){x.setTransform(1,0,0,1,0,0);x.globalCompositeOperation='source-over';x.globalAlpha=1;x.clearRect(0,0,W,H);if(white){x.fillStyle='#fff';x.fillRect(0,0,W,H)}
  const vis=LAYERS.map(q=>q.visible);LAYERS.forEach(q=>{if(!keep(q))q.visible=false});try{if(window.ILL)ILL.drawAll(x);else for(const q of LAYERS)drawLayer(x,q)}finally{LAYERS.forEach((q,i)=>{q.visible=vis[i]})}}
function strokeStart(l){const i=LAYERS.indexOf(l);if(i<0){setSTK(null);return}const below=canvas(W,H),above=canvas(W,H);
  composeInto(below.getContext('2d'),q=>LAYERS.indexOf(q)<i,!GMODE);composeInto(above.getContext('2d'),q=>LAYERS.indexOf(q)>i,false);const ba=TOOL==='brush'&&window.FBBrush?FBBrush.strokeAlpha(OPT.tip,OPT.flow):0;
  setSTK({l,below,above,anyAbove:LAYERS.slice(i+1).some(q=>q.visible),buf:ba?canvas(l.raster.width,l.raster.height):null,ba})}
function strokeEnd(keep=true){if(STK?.buf&&keep){const x=STK.l.raster.getContext('2d');x.save();x.globalAlpha=STK.ba;x.drawImage(STK.buf,0,0);x.restore();STK.l.raster._rid=RID++}setSTK(null)}
const ONE=['move','scale','rot','liquify'];
function oneLayer(){const g=DRAG&&ONE.includes(DRAG.mode)&&!window.PRO?.multi()?DRAG.l:GEST?.layer?.l||(SLIDE&&SLIDE.until>performance.now()?SLIDE.l:null);return g&&LAYERS.includes(g)?g:null}
function oneReady(ol){if(!STK||STK.l!==ol||!STK.one){const i=LAYERS.indexOf(ol),below=canvas(W,H),above=canvas(W,H);composeInto(below.getContext('2d'),q=>LAYERS.indexOf(q)<i,!GMODE);composeInto(above.getContext('2d'),q=>LAYERS.indexOf(q)>i,false);setSTK({l:ol,below,above,anyAbove:LAYERS.slice(i+1).some(q=>q.visible),one:true})}return STK}
function oneDraw(x,ol){if(DRAG?.mode==='liquify'){if(ol.visible){x.save();x.globalAlpha=ol.opacity;x.globalCompositeOperation=ol.blend;place(x,ol);x.drawImage(ol.raster,-ol.raster.width/2,-ol.raster.height/2);x.restore()}}else drawLayer(x,ol)}
function compose(){docC._v=(docC._v||0)+1;const ol=oneLayer();
  if(ol){oneReady(ol);
    docX.setTransform(1,0,0,1,0,0);docX.globalCompositeOperation='source-over';docX.globalAlpha=1;docX.clearRect(0,0,W,H);docX.drawImage(STK.below,0,0);
    oneDraw(docX,ol);
    if(STK.anyAbove)docX.drawImage(STK.above,0,0);return}
  if(STK?.one)setSTK(null);
  if(STK&&DRAG?.mode==='stroke'&&DRAG.l===STK.l){const l=STK.l;docX.setTransform(1,0,0,1,0,0);docX.globalCompositeOperation='source-over';docX.globalAlpha=1;docX.drawImage(STK.below,0,0);
    if(l.visible){docX.save();docX.globalAlpha=l.opacity;docX.globalCompositeOperation=l.blend;place(docX,l);docX.drawImage(l.raster,-l.raster.width/2,-l.raster.height/2);if(STK.buf){docX.globalAlpha=l.opacity*STK.ba;docX.drawImage(STK.buf,-l.raster.width/2,-l.raster.height/2)}docX.restore()}
    if(STK.anyAbove)docX.drawImage(STK.above,0,0);return}
  docX.setTransform(1,0,0,1,0,0);docX.globalCompositeOperation='source-over';docX.globalAlpha=1;docX.clearRect(0,0,W,H);if(!GMODE){docX.fillStyle='#fff';docX.fillRect(0,0,W,H)}if(window.ILL)ILL.drawAll(docX);else for(const l of LAYERS)drawLayer(docX,l)} // a graphic keeps its clear background
// doc point → the layer's own pixels, and back
function toLocal(l,px,py){const[w,h]=dims(l);let dx=px-l.x,dy=py-l.y;const c=Math.cos(-l.rot),s=Math.sin(-l.rot);let lx=(dx*c-dy*s)/l.scale,ly=(dx*s+dy*c)/l.scale;if(l.flip)lx=-lx;return[lx+w/2,ly+h/2]}
function corners(l){const[w,h]=dims(l),c=Math.cos(l.rot),s=Math.sin(l.rot),f=l.flip?-1:1;return[[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]].map(([a,b])=>{a*=l.scale*f;b*=l.scale;return[l.x+a*c-b*s,l.y+a*s+b*c]})}

// ---------- the view ----------
let RAF=0,DOCDIRTY=true,LASTDRAW=0,FASTTILL=0;function draw(){DOCDIRTY=true;const n=performance.now();if(n-LASTDRAW<120)FASTTILL=n+160;LASTDRAW=n;if(!RAF)RAF=requestAnimationFrame(()=>{RAF=0;render()})}
function drawOver(){if(!RAF)RAF=requestAnimationFrame(()=>{RAF=0;render()})} // only what is drawn over the picture changed (the brush's circle)
const sx=x=>x*Z+PX,sy=y=>y*Z+PY,dx=x=>(x-PX)/Z,dy=y=>(y-PY)/Z;
// moving or zooming the view changes no layer, so the picture is not put together again for those frames (it was, every frame: a slow, jumpy zoom)
let VIEWONLY=0;const viewOnly=()=>Boolean((GEST&&!GEST.layer)||(DRAG&&DRAG.mode==='pan')||VIEWONLY>performance.now());
// the picture on the graphics chip (src/lab-gl.js): the page and the picture as textures, moved by one matrix each frame; this canvas keeps what
// is drawn over the picture. A layer the chip cannot blend as the canvas does (a blend other than normal, multiply or screen, a finish's soft
// shadow) is drawn the canvas way for that frame
const hexRgba=h=>{const m=/^#?([0-9a-f]{6})$/i.exec(h||'');if(!m)return[1,1,1,1];const n=parseInt(m[1],16);return[(n>>16)/255,((n>>8)&255)/255,(n&255)/255,1]};
// The chip is for pictures that stay the same while they move: the view panned, zoomed, turned or hovered over, a layer moved, sized or turned.
// A picture that changes every frame (a stroke, liquify, the AI area) stays on this canvas: on an iPad the canvas is already on the chip, and
// sending a changed picture to WebGL each frame would cost more than it saves
function glPicture(r,vo,ol){if(!window.FBGL)return false;if(!render.gl){render.gl=1;FBGL.attach(view);addEventListener('fbgl-off',()=>draw())}if(!FBGL.ok)return false;const items=[],I=[1,0,0,1,0,0];
  const live=DRAG&&['stroke','liquify','area'].includes(DRAG.mode);if(live||(!ol&&docC._v!==glPicture.v&&(DRAG||GEST))){if(glPicture.on){FBGL.clear();glPicture.on=false}return false}
  if(ol){if(!STK?.one||STK.l!==ol)return false;const liq=false;if(!liq&&(!FBGL.canBlend(ol.blend)||(ol.finish&&window.FBFinish?.shadow(ol.finish,W/1000))))return false;
    items.push({src:STK.below,ver:0,m:I});
    if(ol.visible){let src,w,h;if(liq){src=ol.raster;w=src.width;h=src.height}else if(sliding(ol)){src=draftOf(ol);w=src._w;h=src._h}else{src=processed(ol);w=src.width;h=src.height}
      const c=Math.cos(ol.rot||0),s=Math.sin(ol.rot||0),fx=ol.scale*(ol.flip?-1:1),fy=ol.scale;
      items.push({src,ver:src._rid??0,w,h,opacity:ol.opacity,blend:ol.blend,m:[c*fx,s*fx,-s*fy,c*fy,ol.x-c*fx*w/2+s*fy*h/2,ol.y-s*fx*w/2-c*fy*h/2]})}
    if(STK.anyAbove)items.push({src:STK.above,ver:0,m:I})}
  else{items.push({src:docC,ver:docC._v||0,m:I});glPicture.v=docC._v}
  glPicture.on=true;return FBGL.frame({w:r.width,h:r.height,dpr:DPR,view:{PX,PY,Z,VR},page:{w:W,h:H,color:hexRgba(window.PAGEBG||'#ffffff')},items,sharp:!vo})}
function render(){
  // the picture is out of sight (the flats or the pattern fill the workspace): it is not drawn, so a change the flats carry back while they are
  // worked (an autosave bringing a logo or a size across) costs nothing there; setView draws it when it is shown again
  if(render.done&&typeof VMODE!=='undefined'&&(VMODE==='front'||VMODE==='back'||VMODE==='pattern')){DOCDIRTY=true;render.later=true;return}
  const ol=render.done?oneLayer():null;if(ol){oneReady(ol);DOCDIRTY=true}else if((DOCDIRTY&&!viewOnly())||!render.done){compose();render.done=true;DOCDIRTY=false}const r=vrect();DPR=window.devicePixelRatio||1;const cw=Math.round(r.width*DPR),ch=Math.round(r.height*DPR);if(view.width!==cw||view.height!==ch){view.width=cw;view.height=ch}
  const vo=viewOnly()||Boolean(DRAG)||Boolean(GEST)||FASTTILL>performance.now()||Boolean(ol); // while the view is being moved or pinched: no soft shadow and quick smoothing (both are slow on an iPad, every frame)
  const gpu=glPicture(r,vo,ol);
  vx.setTransform(DPR,0,0,DPR,0,0);vx.clearRect(0,0,r.width,r.height);if(VR){vx.translate(r.width/2,r.height/2);vx.rotate(VR*Math.PI/180);vx.translate(-r.width/2,-r.height/2)}vx.save();if(!vo){vx.shadowColor='rgba(20,20,22,.18)';vx.shadowBlur=24}else{vx.fillStyle='rgba(20,20,22,.08)';vx.fillRect(PX+2,PY+3,W*Z,H*Z)}vx.fillStyle=window.PAGEBG||'#fff';vx.fillRect(PX,PY,W*Z,H*Z);vx.restore();
  if(gpu){vx.clearRect(PX,PY,W*Z,H*Z)} // the chip drew the page and the picture under this canvas: only the page's shadow stays here
  else{vx.imageSmoothingQuality=vo?'low':'high';if(ol){vx.drawImage(STK.below,PX,PY,W*Z,H*Z);vx.save();vx.translate(PX,PY);vx.scale(Z,Z);oneDraw(vx,ol);vx.restore();if(STK.anyAbove)vx.drawImage(STK.above,PX,PY,W*Z,H*Z)}else vx.drawImage(docC,PX,PY,W*Z,H*Z)}if(vo){clearTimeout(render.sharp);render.sharp=setTimeout(()=>{if(!viewOnly()&&!DRAG&&!GEST&&!oneLayer())draw();else if(!DRAG&&!GEST)render.sharp=setTimeout(()=>draw(),180)},180)}
  // where the browser can say where the Pencil is going next (predicted points), the ink is drawn ahead to there for this frame only
  if(DRAG?.mode==='stroke'&&DRAG.pred?.length&&TOOL==='brush'){vx.save();vx.strokeStyle=CUR;vx.globalAlpha=OPT.flow;vx.lineCap='round';vx.lineJoin='round';vx.lineWidth=Math.max(.5,OPT.size*(DRAG.pr||1))*Z;vx.beginPath();vx.moveTo(sx(DRAG.x),sy(DRAG.y));for(const[a,b]of DRAG.pred)vx.lineTo(sx(a),sy(b));vx.stroke();vx.restore()}
  if(MASKED&&(TOOL==='area'||TAB==='ai')){vx.save();vx.globalAlpha=.42;vx.drawImage(mask,PX,PY,W*Z,H*Z);vx.restore()}
  const l=selected();
  if(l&&l.visible&&!fixed(l)&&TOOL==='select'&&!window.PRO?.multi()){const p=corners(l).map(([a,b])=>[sx(a),sy(b)]);vx.strokeStyle='#141416';vx.lineWidth=1;vx.setLineDash([5,4]);vx.beginPath();p.forEach(([a,b],i)=>i?vx.lineTo(a,b):vx.moveTo(a,b));vx.closePath();vx.stroke();vx.setLineDash([]);
    if(!l.locked){const tm=[(p[0][0]+p[1][0])/2,(p[0][1]+p[1][1])/2],rk=rotKnob(l);vx.beginPath();vx.moveTo(tm[0],tm[1]);vx.lineTo(rk[0],rk[1]);vx.stroke();
      for(const[a,b]of p){vx.fillStyle='#fff';vx.fillRect(a-5,b-5,10,10);vx.strokeRect(a-5,b-5,10,10)}vx.beginPath();vx.arc(rk[0],rk[1],6,0,Math.PI*2);vx.fillStyle='#4bff9a';vx.fill();vx.stroke()}}
  if(OPT.sym&&OPT.sym!=='off'&&['brush','eraser'].includes(TOOL)){const maps=symMaps(),cx=W/2,cy=H/2,R=Math.hypot(W,H);vx.save();vx.strokeStyle='rgba(42,109,244,.55)';vx.setLineDash([6,5]);vx.lineWidth=1;vx.beginPath();
    if(OPT.sym==='v'||OPT.sym==='quad'){vx.moveTo(sx(cx),sy(0));vx.lineTo(sx(cx),sy(H))}if(OPT.sym==='h'||OPT.sym==='quad'){vx.moveTo(sx(0),sy(cy));vx.lineTo(sx(W),sy(cy))}
    if(/^r/.test(OPT.sym))for(const f of maps){const q=f([cx,cy-R]);vx.moveTo(sx(cx),sy(cy));vx.lineTo(sx(q[0]),sy(q[1]))}vx.stroke();vx.restore()}
  if(HOVER&&DRAG&&['brush','eraser','distress','area'].includes(TOOL)){const rad=(TOOL==='distress'?OPT.dsize:TOOL==='area'?OPT.area:TOOL==='eraser'?OPT.esize:OPT.size)/2*Z;vx.strokeStyle='rgba(20,20,22,.8)';vx.lineWidth=1;vx.beginPath();vx.arc(HOVER[0],HOVER[1],Math.max(rad,2),0,Math.PI*2);vx.stroke();vx.strokeStyle='rgba(255,255,255,.8)';vx.beginPath();vx.arc(HOVER[0],HOVER[1],Math.max(rad,2)+1,0,Math.PI*2);vx.stroke()}
  window.PRO?.overlay(vx);window.VEC?.overlay(vx);window.ILL?.overlay(vx);overlay();$('#zLabel').textContent=Math.round(Z*100)+'%'+(VR?` · ${Math.round(VR)}°`:'');
}
function rotKnob(l){const p=corners(l).map(([a,b])=>[sx(a),sy(b)]),tm=[(p[0][0]+p[1][0])/2,(p[0][1]+p[1][1])/2],c=[sx(l.x),sy(l.y)],d=Math.hypot(tm[0]-c[0],tm[1]-c[1])||1;return[tm[0]+(tm[0]-c[0])/d*28,tm[1]+(tm[1]-c[1])/d*28]}
// FITTED: the view is still the fit, so a stage that settles or resizes keeps it fitted
let FITTED=false;
// in Focus the bar, rail, options and panel float over the stage: the drawing fits in the room they leave
function focusInsets(r){const o={l:0,t:0,r:0,b:0};if(!document.documentElement.dataset.focus)return o;const vis=e=>{const b=e?.getBoundingClientRect();return b&&b.width>0&&b.height>0?b:null};
  const rail=vis($('.rail')),bar=vis($('.bar')),opts=vis($('#opts')),side=vis($('.side'));if(rail&&rail.left<r.left+r.width/2)o.l=Math.max(0,rail.right-r.left);
  o.t=Math.max(0,...[bar,opts].filter(Boolean).map(b=>b.bottom-r.top));if(side&&side.left>r.left+r.width/2)o.r=Math.max(0,r.right-side.left);return o}
function fit(){FITTED=true;VR=0;const r=$('#stage').getBoundingClientRect(),n=focusInsets(r),w=r.width-n.l-n.r,h=r.height-n.t-n.b;Z=Math.min((w-48)/W,(h-48)/H,2);PX=n.l+(w-W*Z)/2;PY=n.t+(h-H*Z)/2;draw()}
function zoomAt(f,cx,cy){FITTED=false;VIEWONLY=performance.now()+120;const nz=clamp(Z*f,.05,8);PX=cx-(cx-PX)*nz/Z;PY=cy-(cy-PY)*nz/Z;Z=nz;draw()}
{const ro=new ResizeObserver(()=>{VRECT=null;FITTED?fit():draw()});ro.observe($('#stage'));ro.observe(view)}

// ---------- pointer work on the stage ----------
let DRAG=null,HOVER=null,SPACE=false;
// the brush's circle while the Pencil or the mouse hovers: on its own canvas over the picture, so hovering never draws the picture again
const CURC=document.createElement('canvas');CURC.setAttribute('aria-hidden','true');CURC.style.cssText='position:absolute;pointer-events:none;z-index:3';view.after(CURC);
function cursorPaint(raw){const x=CURC.getContext('2d');if(!raw){if(CURC.width>1){x.clearRect(0,0,CURC.width,CURC.height)}return}
  const r=vrect(),dpr=Math.min(2,devicePixelRatio||1),w=Math.round(r.width*dpr),h=Math.round(r.height*dpr);if(CURC.width!==w||CURC.height!==h){CURC.width=w;CURC.height=h;CURC.style.width=r.width+'px';CURC.style.height=r.height+'px'}
  CURC.style.left=view.offsetLeft+'px';CURC.style.top=view.offsetTop+'px';x.setTransform(dpr,0,0,dpr,0,0);x.clearRect(0,0,r.width,r.height);
  const rad=Math.max(2,(TOOL==='distress'?OPT.dsize:TOOL==='area'?OPT.area:TOOL==='eraser'?OPT.esize:OPT.size)/2*Z);x.lineWidth=1;x.strokeStyle='rgba(20,20,22,.8)';x.beginPath();x.arc(raw[0],raw[1],rad,0,Math.PI*2);x.stroke();x.strokeStyle='rgba(255,255,255,.8)';x.beginPath();x.arc(raw[0],raw[1],rad+1,0,Math.PI*2);x.stroke()}
// the view's turn (VR, degrees, two fingers on an iPad): the whole view is drawn turned about its centre, and a point on the screen is turned
// back before it is used, so every tool works on a turned picture as on a straight one
let VR=0;const vturn=(x,y,deg)=>{const a=deg*Math.PI/180,c=Math.cos(a),s=Math.sin(a);return[x*c-y*s,x*s+y*c]};
let VRECT=null;const vrect=()=>VRECT||(VRECT=view.getBoundingClientRect());const vrectReset=()=>{VRECT=null};addEventListener('resize',vrectReset);addEventListener('scroll',vrectReset,true);
const vcentre=()=>{const r=vrect();return[r.width/2,r.height/2]};
const rawPt=e=>{const r=vrect();return[e.clientX-r.left,e.clientY-r.top]};
const pt=e=>{const q=rawPt(e);if(!VR)return q;const[cx,cy]=vcentre(),[x,y]=vturn(q[0]-cx,q[1]-cy,-VR);return[cx+x,cy+y]};window.studioPt=pt;
function hit(px,py){for(let i=LAYERS.length-1;i>=0;i--){const l=LAYERS[i];if(!l.visible||l.kind==='base')continue;const[w,h]=dims(l),[a,b]=toLocal(l,px,py);if(a<0||b<0||a>=w||b>=h)continue;
  if(l.kind==='paint'||l.kind==='image'){const d=processed(l).getContext('2d',{willReadFrequently:true}).getImageData(Math.floor(a),Math.floor(b),1,1).data;if(d[3]<12)continue}return l}return null}
function strokeTarget(tool){
  let l=selected();
  if(tool==='brush'){if(!l||l.kind!=='paint'||l.locked){l=addLayer(fresh('paint',{name:'Painting',x:W/2,y:H/2,raster:stamp(canvas(W,H))}),{silent:true})}return l}
  if(!l||!isRaster(l)){toast(tool==='area'?'':'Select a picture, painting or the base picture first. Type and shapes: use "Turn into pixels" on them.');return null}
  if(l.locked){toast('That layer is locked. Unlock it in the layer list.');return null}
  return l;
}
// symmetry: each piece of a stroke drawn again in the mirror (left-right, top-bottom, four ways) or turned round the middle (6 or 8 ways)
const SYMS=[['off','Off'],['v','Mirror'],['h','Top–bottom'],['quad','Four ways'],['r6','Radial 6'],['r8','Radial 8']];
function symMaps(){const cx=W/2,cy=H/2,m=OPT.sym;if(!m||m==='off'||!['brush','eraser'].includes(TOOL))return[p=>p];
  const fx=p=>[2*cx-p[0],p[1]],fy=p=>[p[0],2*cy-p[1]];if(m==='v')return[p=>p,fx];if(m==='h')return[p=>p,fy];if(m==='quad')return[p=>p,fx,fy,p=>fy(fx(p))];
  const n=m==='r6'?6:8;return Array.from({length:n},(_,i)=>{const a=i*2*Math.PI/n,c=Math.cos(a),s=Math.sin(a);return p=>[cx+(p[0]-cx)*c-(p[1]-cy)*s,cy+(p[0]-cx)*s+(p[1]-cy)*c]})}
function dabS(l,x0,y0,x1,y1,tool,pr=1,qx,qy){for(const f of symMaps()){const a=f([x0,y0]),b=f([x1,y1]),q=qx!==undefined?f([qx,qy]):null;dab(l,a[0],a[1],b[0],b[1],tool,pr,q?q[0]:undefined,q?q[1]:undefined)}}
function dab(l,x0,y0,x1,y1,tool,pr=1,qx,qy){ // pr: how hard the Pencil presses (1 for a mouse or a finger); qx,qy: a control point, for a curve
  const c=l.raster,x=c.getContext('2d'),[a0,b0]=toLocal(l,x0,y0),[a1,b1]=toLocal(l,x1,y1),qq=qx!==undefined?toLocal(l,qx,qy):null,sz=Math.max(.5,(tool==='distress'?OPT.dsize:OPT.size)*pr)/l.scale;
  if(window.FBBrush&&(tool==='brush'||tool==='eraser')){const lk=OPT.lock&&tool==='brush',buf=!lk&&STK?.buf&&STK.l===l&&tool==='brush';if(lk){x.save();x.globalCompositeOperation='source-atop'}FBBrush.segment(buf?STK.buf.getContext('2d'):x,{tool,solid:Boolean(buf),tip:tool==='brush'?OPT.tip:OPT.etip,color:CUR,size:Math.max(.5,tool==='eraser'?OPT.esize:OPT.size)/l.scale,flow:OPT.flow,soft:OPT.soft,pr},[a0,b0],[a1,b1],qq);if(lk)x.restore();c._rid=RID++;return}
  x.save();x.lineCap='round';x.lineJoin='round';x.lineWidth=sz;
  if(tool==='brush'){x.globalAlpha=OPT.flow;x.strokeStyle=CUR;if(OPT.soft){x.shadowColor=CUR;x.shadowBlur=sz*OPT.soft}}
  else{x.globalCompositeOperation='destination-out';x.globalAlpha=OPT.flow;x.strokeStyle='#000'}
  if(tool==='distress'){const t=texture('worn',256,256,40,l.id.length*7919);x.strokeStyle=x.createPattern(t,'repeat');x.globalAlpha=Math.min(1,OPT.flow*1.4)}
  x.beginPath();x.moveTo(a0,b0);if(qq)x.quadraticCurveTo(qq[0],qq[1],a1+.01,b1);else x.lineTo(a1+.01,b1);x.stroke();x.restore();c._rid=RID++;
}
// QuickShape: the stroke so far read as a shape, and drawn again as that shape with the same brush
function quickShape(g){const q=window.FBBrush?.quickShapeOf?.(g.pts,{minSize:24/Z});if(!q)return;const shape=q.pts;
  g.l.raster=cloneCanvas(g.orig);if(STK?.buf&&STK.l===g.l)STK.buf.getContext('2d').clearRect(0,0,STK.buf.width,STK.buf.height);
  for(let i=1;i<shape.length;i++)dabS(g.l,shape[i-1][0],shape[i-1][1],shape[i][0],shape[i][1],TOOL,g.pr||1);
  g.shaped=true;draw();toast(`QuickShape: ${q.name}. Undo takes it back to your line.`)}
// Fill: tap inside lines to fill there, on a painting under the chosen layer (the lines stay on top); the outline comes from everything visible
function fillAt(x,y){compose();const w=docC.width,h=docC.height,X=Math.floor(x),Y=Math.floor(y);if(X<0||Y<0||X>=w||Y>=h)return;
  const src=docX.getImageData(0,0,w,h).data,k0=(Y*w+X)*4,r0=src[k0],g0=src[k0+1],b0=src[k0+2],a0=src[k0+3],tol=(OPT.ftol||40)*2,seen=new Uint8Array(w*h),st=[Y*w+X];
  const same=k=>{const j=k*4;return Math.abs(src[j]-r0)+Math.abs(src[j+1]-g0)+Math.abs(src[j+2]-b0)+Math.abs(src[j+3]-a0)*1.5<=tol};let n=0;
  while(st.length){const k=st.pop();if(seen[k])continue;if(!same(k))continue;seen[k]=1;n++;const px=k%w;if(px>0&&!seen[k-1])st.push(k-1);if(px<w-1&&!seen[k+1])st.push(k+1);if(k>=w&&!seen[k-w])st.push(k-w);if(k<w*h-w&&!seen[k+w])st.push(k+w)}
  if(n<4){toast('Nothing to fill there.');return}if(n>w*h*.97&&!GMODE){toast('That would fill the whole picture: tap inside a closed shape.');return}
  // grown by two pixels, so the fill tucks under the soft edge of the lines round it
  let m=seen;for(let pass=0;pass<2;pass++){const o=new Uint8Array(m);for(let k=0;k<w*h;k++)if(m[k]){const px=k%w;if(px>0)o[k-1]=1;if(px<w-1)o[k+1]=1;if(k>=w)o[k-w]=1;if(k<w*h-w)o[k+w]=1}m=o}
  const [cr,cg,cb]=[1,3,5].map(i=>parseInt((/^#[0-9a-f]{6}$/i.test(CUR)?CUR:'#141416').slice(i,i+2),16)),img=new ImageData(w,h);for(let k=0;k<w*h;k++)if(m[k]){img.data[k*4]=cr;img.data[k*4+1]=cg;img.data[k*4+2]=cb;img.data[k*4+3]=255}
  const f=canvas(w,h);f.getContext('2d').putImageData(img,0,0);
  let l=selected();const onPaint=l&&l.kind==='paint'&&l.raster.width===W&&l.raster.height===H;
  if(!onPaint){const at=l?LAYERS.indexOf(l):LAYERS.length;l=fresh('paint',{name:'Fill',x:W/2,y:H/2,raster:stamp(canvas(W,H))});LAYERS.splice(Math.max(1,at),0,l)}
  const x2=l.raster.getContext('2d');x2.save();x2.globalCompositeOperation=onPaint?'destination-over':'source-over';x2.drawImage(f,0,0);x2.restore();l.raster._rid=RID++;SEL=l.id;commit();paintPanels();draw()}
// one push: the pixels within the brush's reach move with the Pencil, most at the middle, none at the edge
function liquifyPush(l,x0,y0,x1,y1){const c=l.raster,ctx=c.getContext('2d',{willReadFrequently:true}),[a0,b0]=toLocal(l,x0,y0),[a1,b1]=toLocal(l,x1,y1),R=Math.max(4,OPT.size*1.5/l.scale),dx=a1-a0,dy=b1-b0;
  const X0=Math.max(0,Math.floor(Math.min(a0,a1)-R)),Y0=Math.max(0,Math.floor(Math.min(b0,b1)-R)),X1=Math.min(c.width,Math.ceil(Math.max(a0,a1)+R)),Y1=Math.min(c.height,Math.ceil(Math.max(b0,b1)+R)),w=X1-X0,h=Y1-Y0;if(w<=0||h<=0)return;
  const src=ctx.getImageData(X0,Y0,w,h),out=ctx.createImageData(w,h),S=src.data,O=out.data;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const px=x+X0,py=y+Y0,r2=((px-a1)**2+(py-b1)**2)/(R*R),k=(y*w+x)*4;let fx=x,fy=y;if(r2<1){const t=(1-r2)**2;fx=x-dx*t;fy=y-dy*t}
    if(fx===x&&fy===y){O[k]=S[k];O[k+1]=S[k+1];O[k+2]=S[k+2];O[k+3]=S[k+3];continue}
    const ix=Math.floor(fx),iy=Math.floor(fy),u=fx-ix,v=fy-iy,x0=ix<0?0:ix>w-1?w-1:ix,x1=ix+1<0?0:ix+1>w-1?w-1:ix+1,y0=iy<0?0:iy>h-1?h-1:iy,y1=iy+1<0?0:iy+1>h-1?h-1:iy+1,a=(y0*w+x0)*4,b=(y0*w+x1)*4,c2=(y1*w+x0)*4,d=(y1*w+x1)*4,wa=(1-u)*(1-v),wb=u*(1-v),wc=(1-u)*v,wd=u*v;
    O[k]=S[a]*wa+S[b]*wb+S[c2]*wc+S[d]*wd;O[k+1]=S[a+1]*wa+S[b+1]*wb+S[c2+1]*wc+S[d+1]*wd;O[k+2]=S[a+2]*wa+S[b+2]*wb+S[c2+2]*wc+S[d+2]*wd;O[k+3]=S[a+3]*wa+S[b+3]*wb+S[c2+3]*wc+S[d+3]*wd}
  ctx.putImageData(out,X0,Y0);c._rid=RID++}
function maskDab(x0,y0,x1,y1,erase){maskX.save();maskX.lineCap='round';maskX.lineWidth=OPT.area;maskX.strokeStyle='#e03b2e';if(erase)maskX.globalCompositeOperation='destination-out';maskX.beginPath();maskX.moveTo(x0,y0);maskX.lineTo(x1+.01,y1);maskX.stroke();maskX.restore();MASKED=true;mask._rid=RID++;paintAiState()}
// ---------- iPad and the Pencil ----------
// The Pencil draws (with its pressure, every sample it reports); once a Pencil has been used, fingers never draw: one finger moves the view,
// two pinch to zoom and move it, so a palm resting on the screen does nothing. Before any Pencil, a finger draws like a mouse.
// A second finger landing during a finger stroke undoes that stroke and becomes a pinch.
const PTRS=new Map();let PEN=false,GEST=null;
// keeping the pointer is a nicety: where the browser refuses it (Safari can, for a Pencil), the stroke still draws
const capture=e=>{try{view.setPointerCapture(e.pointerId)}catch{}};
const pressOf=e=>e.pointerType==='pen'&&OPT.pressure?clamp(.15+.85*(e.pressure||.5),.15,1):1;
const tolOf=e=>e.pointerType==='mouse'?10:22; // a fingertip or a Pencil tip needs a bigger target than a cursor
// Two fingers: on the selected graphic (Select tool) they resize, turn and move it, as in other drawing apps; anywhere else they zoom and move the view
function gestStart(){const[a,b]=[...PTRS.values()];GEST={d:Math.hypot(a.x-b.x,a.y-b.y)||1,mx:(a.x+b.x)/2,my:(a.y+b.y)/2,Z,PX,PY,ang:Math.atan2(b.y-a.y,b.x-a.x),VR0:VR,rm:[((a.rx??a.x)+(b.rx??b.x))/2,((a.ry??a.y)+(b.ry??b.y))/2],rang:Math.atan2((b.ry??b.y)-(a.ry??a.y),(b.rx??b.x)-(a.rx??a.x))};
  const l=selected();if(TOOL==='select'&&l&&!fixed(l)&&!l.locked&&l.visible&&[[a.x,a.y],[b.x,b.y],[GEST.mx,GEST.my]].some(([x,y])=>hit(dx(x),dy(y))===l))GEST.layer={l,s0:l.scale,r0:l.rot||0,x0:l.x,y0:l.y}}
function gestMove(){const[a,b]=[...PTRS.values()];if(!a||!b||!GEST)return;const d=Math.hypot(a.x-b.x,a.y-b.y)||1,mx=(a.x+b.x)/2,my=(a.y+b.y)/2,nz=clamp(GEST.Z*d/GEST.d,.05,8);
  if(GEST.layer){const g=GEST.layer;g.l.scale=clamp(g.s0*d/GEST.d,.02,40);g.l.rot=g.r0+Math.atan2(b.y-a.y,b.x-a.x)-GEST.ang;g.l.x=Math.round(g.x0+(mx-GEST.mx)/Z);g.l.y=Math.round(g.y0+(my-GEST.my)/Z);g.moved=true;draw();if(!fieldsRaf)fieldsRaf=requestAnimationFrame(()=>{fieldsRaf=0;paintFields()});return}
  // the view: zoomed and turned together, the point of the picture under the fingers staying under them (worked on the screen's own
  // positions, since the turn changes as they move); a turn near square snaps to it
  const ar=[a.rx??a.x,a.ry??a.y],br=[b.rx??b.x,b.ry??b.y],m=[(ar[0]+br[0])/2,(ar[1]+br[1])/2],[cx,cy]=vcentre();
  let dr=(Math.atan2(br[1]-ar[1],br[0]-ar[0])-GEST.rang)*180/Math.PI;dr=((dr+540)%360)-180;let nr=GEST.VR0+dr;const sq=Math.round(nr/90)*90;if(Math.abs(nr-sq)<5)nr=sq;nr=((nr+540)%360)-180;
  if(!GEST.doc){const[ux,uy]=vturn(GEST.rm[0]-cx,GEST.rm[1]-cy,-GEST.VR0);GEST.doc=[(cx+ux-GEST.PX)/GEST.Z,(cy+uy-GEST.PY)/GEST.Z]}
  const[vx2,vy2]=vturn(m[0]-cx,m[1]-cy,-nr);FITTED=false;VR=nr;Z=nz;PX=cx+vx2-Z*GEST.doc[0];PY=cy+vy2-Z*GEST.doc[1];draw()}
function cancelTouchStroke(){const g=DRAG;if(!g)return;strokeEnd(false);if(g.mode==='stroke'&&g.orig){g.l.raster=g.orig;g.l.raster._rid=RID++}DRAG=null;draw()}
view.addEventListener('pointerdown',e=>{
  if(!D)return;VIEWONLY=0;VRECT=null;cursorPaint(null);if(document.activeElement?.matches?.('input,textarea,select'))document.activeElement.blur(); // the picture takes the keys back from a field in the panel
  const[qx,qy]=pt(e);
  // a pointer whose lift the iPad never reported must not hold the canvas: there is one Pencil, so a new Pencil touch ends any stroke still
  // open from an earlier one, and the first finger down means no other finger is still down
  if(e.pointerType==='pen'){for(const[k,q]of PTRS)if(q.type==='pen'&&k!==e.pointerId)PTRS.delete(k);if(DRAG&&DRAG.type==='pen'&&DRAG.pid!==e.pointerId)endDrag({pointerId:DRAG.pid})}
  if(e.pointerType==='touch'&&e.isPrimary){for(const[k,q]of PTRS)if(q.type==='touch'&&k!==e.pointerId)PTRS.delete(k);GEST=null;if(DRAG&&DRAG.type==='touch'&&DRAG.pid!==e.pointerId){if(DRAG.mode==='stroke')endDrag({pointerId:DRAG.pid});else DRAG=null}}
  {const[rx,ry]=rawPt(e);PTRS.set(e.pointerId,{x:qx,y:qy,rx,ry,type:e.pointerType})}if(e.pointerType==='pen')PEN=true;
  if(e.pointerType==='touch'&&DRAG&&DRAG.type==='pen')return; // a palm while the Pencil draws
  if(e.pointerType==='pen'&&DRAG&&DRAG.type==='touch'){if(DRAG.mode==='stroke')cancelTouchStroke();else DRAG=null}if(e.pointerType==='pen')GEST=null; // the Pencil wins over a resting palm
  if(e.pointerType==='touch'){const touches=[...PTRS.values()].filter(q=>q.type==='touch').length;
    if(touches>=2){if(DRAG&&DRAG.type==='touch')cancelTouchStroke();gestStart();e.preventDefault();return}
    if(PEN){capture(e);DRAG={mode:'pan',px:qx,py:qy,PX,PY,pid:e.pointerId,type:'touch'};return}}
  if(GEST)return;if(DRAG&&DRAG.pid!==e.pointerId)return; // one stroke at a time
  capture(e);const[px,py]=pt(e),x=dx(px),y=dy(py);
  if(TOOL==='hand'||SPACE||e.button===1){DRAG={mode:'pan',px,py,PX,PY,pid:e.pointerId,type:e.pointerType};return}
  if(TOOL==='pick'){const sl=selected(),one=OPT.pickAll===false&&sl&&sl.visible;let d;if(one){const[a,b]=toLocal(sl,x,y),pc=processed(sl);d=pc.getContext('2d',{willReadFrequently:true}).getImageData(clamp(Math.floor(a),0,pc.width-1),clamp(Math.floor(b),0,pc.height-1),1,1).data;if(d[3]<12){toast('Nothing of the chosen layer there: tap where it is, or pick from All layers.');return}}else{compose();d=docX.getImageData(clamp(Math.floor(x),0,W-1),clamp(Math.floor(y),0,H-1),1,1).data}setColor('#'+[d[0],d[1],d[2]].map(v=>v.toString(16).padStart(2,'0')).join(''));return}
  if(TOOL==='area'){maskDab(x,y,x,y,e.altKey);DRAG={mode:'area',x,y,erase:e.altKey,pid:e.pointerId,type:e.pointerType};draw();return}
  if(TOOL==='fill'){fillAt(x,y);return}
  if(TOOL==='liquify'){const l=strokeTarget('eraser');if(!l)return;const orig=l.raster;l.raster=cloneCanvas(l.raster);SEL=l.id;DRAG={mode:'liquify',l,x,y,orig,pid:e.pointerId,type:e.pointerType};if(OPT.liqMode&&OPT.liqMode!=='push')window.TOOLS?.liqHold(DRAG,e.altKey);draw();return}
  if(['brush','eraser','distress'].includes(TOOL)){const l=strokeTarget(TOOL);if(!l)return;const orig=l.raster;l.raster=cloneCanvas(l.raster);SEL=l.id;DRAG={mode:'stroke',l,x,y,mx:x,my:y,orig,pid:e.pointerId,type:e.pointerType,pts:[[x,y]]};strokeStart(l);dabS(l,x,y,x,y,TOOL,pressOf(e));draw();return}
  if(TOOL==='text'){const l=addLayer(fresh('text',{name:'Type',x,y,text:'FUTURE BASICS',font:OPT.tFont||'grotesk',size:OPT.tSize||Math.round(W/14),bold:OPT.tBold!==false,italic:false,track:Math.round(W/200),lead:1.1,align:OPT.tAlign||'center',arc:0,color:CUR,outline:0,outlineColor:'#ffffff',case:'',stretch:100,outline2:0,outline2Color:'#141416',shadowKind:'none',shadow:0,shadowAngle:135,shadowColor:'#141416'}));setTool('select');tab('layers');setTimeout(()=>{const t=$('#pLayers textarea[data-p=text]');if(t){t.focus();t.select()}},30);return}
  if((window.TOOLS?.SHAPES||['rect','ellipse','line']).includes(TOOL)){DRAG={mode:'shape',x0:x,y0:y,l:null,pid:e.pointerId,type:e.pointerType};return}
  if(TOOL==='ruler'){RULER=null;DRAG={mode:'ruler',x0:x,y0:y,x1:x,y1:y,pid:e.pointerId,type:e.pointerType};draw();return}
  if(TOOL==='warp'){DRAG=warpDown(x,y,px,py);if(DRAG){DRAG.pid=e.pointerId;DRAG.type=e.pointerType}draw();return}
  if(window.ILL?.down(e,x,y))return; // artboards, shape builder, width, measure, type on a path
  if(window.VEC?.down(e,x,y))return; // the pen and Edit points
  // select: a handle of the chosen layer first, then whatever is under the pointer
  const l=selected();
  if(l&&!fixed(l)&&!l.locked&&l.visible&&!window.PRO?.multi()){const rk=rotKnob(l);if(Math.hypot(px-rk[0],py-rk[1])<tolOf(e)+1){DRAG={mode:'rot',l,a0:Math.atan2(y-l.y,x-l.x)-l.rot,pid:e.pointerId,type:e.pointerType};return}
    const k=corners(l).findIndex(([a,b])=>Math.hypot(sx(a)-px,sy(b)-py)<tolOf(e));if(k>=0){DRAG={mode:'scale',l,d0:Math.hypot(x-l.x,y-l.y)||1,s0:l.scale,pid:e.pointerId,type:e.pointerType};return}}
  if(window.PRO?.down(e,x,y))return; // several layers, a box round them, Shift-click: the professional layer
  const h=hit(x,y);SEL=h?h.id:(l&&fixed(l)?l.id:null);paintPanels();
  if(h&&!h.locked&&!fixed(h))DRAG={mode:'move',l:h,ox:x-h.x,oy:y-h.y,moved:false,pid:e.pointerId,type:e.pointerType};draw();
});
view.addEventListener('pointermove',e=>{
  const[px,py]=pt(e),q=PTRS.get(e.pointerId);if(q){q.x=px;q.y=py;const[rx,ry]=rawPt(e);q.rx=rx;q.ry=ry}
  if(GEST){gestMove();return}
  if(DRAG&&DRAG.pid!==undefined&&DRAG.pid!==e.pointerId)return;
  if(e.pointerType!=='touch')HOVER=[px,py];if(!DRAG){window.ILL?.move(null,dx(px),dy(py),e);if(['brush','eraser','distress','area'].includes(TOOL)&&e.pointerType!=='touch')cursorPaint(rawPt(e));window.VEC?.hover();return}
  const x=dx(px),y=dy(py),g=DRAG;
  if(window.ILL?.move(g,x,y,e)||window.PRO?.move(g,x,y,e)||window.VEC?.move(g,x,y,e))return;
  // the Pencil reports more samples than the screen draws: take all of them, so a quick curve stays a curve
  // each sample joins the last by a curve through their midpoints (a smooth line, not a chain of straight bits, when the samples are far
  // apart at speed); the panel's numbers wait for the end of the stroke
  if(g.mode==='stroke'){if(g.shaped)return;const ev=e.getCoalescedEvents?.()||[];for(const c of ev.length?ev:[e]){const[cx,cy]=pt(c);let ux=dx(cx),uy=dy(cy);if(OPT.stream&&TOOL==='brush'){const k=1-OPT.stream/100*.93;g.sx=(g.sx??g.x)+(ux-(g.sx??g.x))*k;g.sy=(g.sy??g.y)+(uy-(g.sy??g.y))*k;ux=g.sx;uy=g.sy}if(Math.hypot(ux-g.x,uy-g.y)*Z<.6)continue;if(g.pts)g.pts.push([ux,uy]);const mx=(g.x+ux)/2,my=(g.y+uy)/2;g.pr=pressOf(c);dabS(g.l,g.mx,g.my,mx,my,TOOL,g.pr,g.x,g.y);g.mx=mx;g.my=my;g.x=ux;g.y=uy}
    g.pred=OPT.stream?[]:(e.getPredictedEvents?.()||[]).slice(-3).map(q=>{const[a,b]=pt(q);return[dx(a),dy(b)]});
    if(g.pts&&OPT.qshape&&TOOL==='brush'&&(!g.qa||Math.hypot(g.x-g.qa[0],g.y-g.qa[1])*Z>4)){g.qa=[g.x,g.y];clearTimeout(g.qt);g.qt=setTimeout(()=>{if(DRAG===g&&!g.shaped)quickShape(g)},550)}
    draw();return}
  if(g.mode==='pan'){FITTED=false;PX=g.PX+px-g.px;PY=g.PY+py-g.py}
  else if(g.mode==='area'){maskDab(g.x,g.y,x,y,g.erase);g.x=x;g.y=y}
  else if(g.mode==='liquify'){g.tx=x;g.ty=y;if(OPT.liqMode&&OPT.liqMode!=='push'){g.x=x;g.y=y}else if(!g.lq)g.lq=requestAnimationFrame(()=>{g.lq=0;liqStep(g)})} // one push a frame, however many samples the Pencil sends
  else if(g.mode==='stroke'){dab(g.l,g.x,g.y,x,y,TOOL);g.x=x;g.y=y}
  else if(g.mode==='move'){if(window.PRO)PRO.snap1(g,x,y,e);else{g.l.x=Math.round(x-g.ox);g.l.y=Math.round(y-g.oy);g.moved=true}}
  else if(g.mode==='scale'){g.l.scale=clamp(g.s0*Math.hypot(x-g.l.x,y-g.l.y)/g.d0,.02,40);g.moved=true}
  else if(g.mode==='rot'){let a=Math.atan2(y-g.l.y,x-g.l.x)-g.a0;if(e.shiftKey)a=Math.round(a/(Math.PI/12))*(Math.PI/12);g.l.rot=a;g.moved=true}
  else if(g.mode==='ruler'){g.x1=x;g.y1=y;if(e.shiftKey){if(Math.abs(x-g.x0)>Math.abs(y-g.y0))g.y1=g.y0;else g.x1=g.x0}}
  else if(g.mode==='warp')warpMove(g,x,y);
  else if(g.mode==='shape'){
    if(TOOL==='polygon'||TOOL==='star'){window.TOOLS.starDrag(g,x,y,e);draw();return}
    if(!g.l){if(Math.hypot(x-g.x0,y-g.y0)<4)return;g.l=addLayer(fresh('shape',{name:{rect:'Rectangle',ellipse:'Ellipse',line:'Line'}[TOOL],shape:TOOL,w:4,h:4,radius:0,fill:TOOL!=='line',fillColor:CUR,stroke:TOOL==='line',strokeW:Math.max(2,Math.round(W/160)),strokeColor:CUR,...(window.TOOLS?.shapeProps(TOOL)||{}),x:g.x0,y:g.y0}),{silent:true})}
    const l=g.l;if(l.shape==='line'){const len=Math.hypot(x-g.x0,y-g.y0);l.w=Math.max(4,Math.round(len));l.x=(x+g.x0)/2;l.y=(y+g.y0)/2;l.rot=Math.atan2(y-g.y0,x-g.x0)}
    else{let w=Math.abs(x-g.x0),h=Math.abs(y-g.y0);if(e.shiftKey)w=h=Math.max(w,h);l.w=Math.max(4,Math.round(w));l.h=Math.max(4,Math.round(h));l.x=g.x0+(x<g.x0?-w:w)/2;l.y=g.y0+(y<g.y0?-h:h)/2}}
  draw();if(g.mode!=='pan'&&g.mode!=='area'){if(!fieldsRaf)fieldsRaf=requestAnimationFrame(()=>{fieldsRaf=0;paintFields()})}
});
let fieldsRaf=0;
function liqStep(g){if(g.tx===undefined||Math.hypot(g.tx-g.x,g.ty-g.y)*Z<1.5)return;liquifyPush(g.l,g.x,g.y,g.tx,g.ty);g.x=g.tx;g.y=g.ty;g.moved=true;draw()}
const endDrag=e=>{if(e&&e.pointerId!==undefined){PTRS.delete(e.pointerId);if(GEST){if(PTRS.size<2){const g=GEST.layer;GEST=null;if(g?.moved){commit();paintPanels()}}return}if(DRAG&&DRAG.pid!==undefined&&DRAG.pid!==e.pointerId)return}const g=DRAG;if(g?.mode==='liquify'&&g.lq){cancelAnimationFrame(g.lq);g.lq=0;liqStep(g)}DRAG=null;if(!g)return;if(g.mode==='stroke'){clearTimeout(g.qt);if(!g.shaped&&g.mx!==undefined&&(g.mx!==g.x||g.my!==g.y))dabS(g.l,g.mx,g.my,g.x,g.y,TOOL,g.pr||1);strokeEnd();paintFields()}if(window.ILL?.end(g)||window.PRO?.end(g)||window.VEC?.end(g))return;if(g.mode==='ruler'){rulerDone(g);draw();return}if(g.mode==='stroke'||g.mode==='area'||g.mode==='liquify'||(g.mode==='shape'&&g.l)||g.moved){if(g.mode!=='area')commit();if(g.mode==='shape')paintOpts();paintPanels()}draw()};
view.addEventListener('pointerup',endDrag);view.addEventListener('pointercancel',endDrag);view.addEventListener('lostpointercapture',e=>{if(DRAG&&DRAG.pid===e.pointerId)endDrag(e)});view.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse'||e.pointerType==='pen'&&!DRAG){HOVER=null;cursorPaint(null)}});
// iPad: a Pencil on the page can be taken as handwriting (Scribble) or the start of a text selection, and then never reaches the canvas as a
// stroke; holding the Pencil's touches on the stage keeps them ours (fingers are left alone: they move and pinch through the pointer events)
['touchstart','touchmove'].forEach(t=>$('#stage').addEventListener(t,e=>{if([...e.changedTouches].some(x=>x.touchType==='stylus'))e.preventDefault()},{passive:false}));
// Safari's own pinch would zoom the whole page; on the stage the pinch is ours
// Safari's page zoom (a pinch or a double tap anywhere in Design) is never wanted here: it threw the whole layout off. A trackpad pinch (Magic
// Keyboard) arrives only as these gesture events, so it zooms the picture under the pointer; a pinch with fingers is handled by the pointers above
let TPG=null;
['gesturestart','gesturechange','gestureend'].forEach(t=>document.addEventListener(t,e=>{e.preventDefault();if(VMODE!=='picture'||!e.target.closest?.('#stage'))return;
  if([...PTRS.values()].filter(q=>q.type==='touch').length>=2){TPG=null;return}const[cx,cy]=pt(e);
  if(t==='gesturestart')TPG={z:Z};else if(t==='gesturechange'&&TPG){zoomAt(clamp(TPG.z*e.scale,.05,8)/Z,cx,cy)}else TPG=null},{passive:false}));
view.addEventListener('wheel',e=>{e.preventDefault();const[px,py]=pt(e);if(e.ctrlKey||e.metaKey)zoomAt(Math.exp(-e.deltaY*.01),px,py);else{VIEWONLY=performance.now()+120;FITTED=false;const[ddx,ddy]=vturn(e.deltaX,e.deltaY,-VR);PX-=ddx;PY-=ddy;draw()}},{passive:false});
$('#zIn').onclick=()=>{const r=view.getBoundingClientRect();zoomAt(1.25,r.width/2,r.height/2)};$('#zOut').onclick=()=>{const r=view.getBoundingClientRect();zoomAt(.8,r.width/2,r.height/2)};$('#zFit').onclick=fit;
