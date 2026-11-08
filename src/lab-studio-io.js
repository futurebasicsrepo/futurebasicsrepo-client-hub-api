// The Studio (/lab/studio), part 3 of 5: saving, using and exporting, the Illustrator round-trip, the 3D try-on, small things.
// The five parts are one script, served joined in order (core, layers, io, open, workspace) as /lab/studio-main.js (src/server.js), so
// they share one scope exactly as the single inline script they were cut from did; they are separate files to be read and changed.
// ---------- saving, using, exporting ----------
// a picture as a PNG data: URL, made off the page's thread (src/lab-encode.js): the canvas is copied at the call, so drawing on during a save is safe
const enc=(c,t='image/png',q)=>window.FBEnc?FBEnc.url(c,t,q):Promise.resolve(c.toDataURL(t,q));
// the document as saved: what each layer is, now; its pictures are copied at the call and encoded together, so the page keeps drawing while they are made
async function serialize(){const d={...(window.ILL?ILL.docData():{}),w:W,h:H,ppi:PPI,ppiSet:PPISET,selected:SEL,linked:[...LINKING]},wait=[];d.layers=LAYERS.map(l=>{const o={};for(const[k,v]of Object.entries(l))if(!k.startsWith('_')&&k!=='raster'&&k!=='dirty')o[k]=v;
  if(isRaster(l)&&(l.dirty||!l.src||l.kind==='paint'||l.raster._rid!==l._srcRid))wait.push(enc(l.raster).then(u=>{o.src=u}));return o});await Promise.all(wait);return d}
async function save(){if(SAVING)return SAVING_P||true;SAVING_P=(async()=>{SAVING=true;try{return await saveNow()}finally{SAVING=false;showSaved();if(DIRTY&&!HOLD)autoSoon()}})();return SAVING_P}
let SAVING_P=null;
async function saveNow(){const b=$('#save');b.disabled=true;$('#saved').className='saved';$('#saved').textContent='Saving…';
  try{if(!GMODE){const sent=await syncFlats({before:flatsFirst}).catch(x=>{toast('The flats did not take the graphics: '+x.message);return false});if(sent)reloadFlats()}const at=EDITS,doc=await serialize();let r;
    if(GMODE){compose();const image=await enc(docC);
      // a graphic not yet in the library goes in with its first save; after that its layers are saved on it
      if(!GID){const k=await api('/v1/lab/library/studio/keep',{body:{image,name:TAGM?`Label · ${TAGM.name}`.slice(0,120):D.concept.name,doc}});GID=k.id;D.concept.hasImage=true;if(!TAGM)history.replaceState(null,'',`/lab/studio?art=${GID}`);r={savedAt:new Date().toISOString()}}
      // a tag's face is its picture: every save puts the new picture on it, not only the layers
      else if(TAGM)r={...(await api(`/v1/lab/library/graphics/${GID}/studio/apply`,{body:{image,doc}})),savedAt:new Date().toISOString()};
      else r=await api(`/v1/lab/library/graphics/${GID}/studio`,{method:'PUT',body:{doc}});
      if(TAGM){await linkTag();paintSub()}}
    else r=await api(`/v1/lab/concepts/${CID}/studio`,{method:'PUT',body:{doc}});
    // what was sent is now what the layers come from
    for(const l of LAYERS){const s=doc.layers.find(x=>x.id===l.id);if(s&&isRaster(l)){l.src=s.src;l.dirty=false;l._srcRid=l.raster._rid}}
    DIRTY=EDITS!==at;SAVED_AT=r.savedAt;SAVE_ERR='';showSaved();if(!DIRTY)PRES?.editing(false);if(!GMODE)loadReady(); /* a change made while it saved (a graphic arriving from the flats) stays to save */return true}
  catch(x){SAVE_ERR=x.message;return false}finally{b.disabled=false}}
$('#save').onclick=(...a)=>saveAll(...a); // saveAll is in lab-studio-workspace.js, loaded after this file
// installed on the home screen (an iPad), a download would leave the app: the file opens in the app's sheet, with Share and Save
const INAPP=()=>{try{return navigator.standalone===true||matchMedia('(display-mode: standalone)').matches}catch{return false}};
// the page may not fetch its own data: and blob: addresses (the site's content rules), so the file is taken from where it was made
const BLOB_OF=new Map(),mkUrl=URL.createObjectURL.bind(URL),rmUrl=URL.revokeObjectURL.bind(URL);
URL.createObjectURL=b=>{const u=mkUrl(b);if(b instanceof Blob)BLOB_OF.set(u,b);return u};URL.revokeObjectURL=u=>{BLOB_OF.delete(u);rmUrl(u)};
function blobOfUrl(url){if(BLOB_OF.has(url))return BLOB_OF.get(url);const m=/^data:([^;,]+)?(;base64)?,(.*)$/s.exec(String(url));if(!m)return null;
  const raw=m[2]?atob(m[3]):decodeURIComponent(m[3]),a=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)a[i]=raw.charCodeAt(i);return new Blob([a],{type:m[1]||'application/octet-stream'})}
function download(url,name){if(INAPP()){const b=blobOfUrl(url);if(b){showSheet(b,name,name);return}}const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove()}
const fileBase=()=>String(D.concept.name||'concept').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,50)||'concept';
const xa=v=>esc(String(v));
// one group per layer; plain type and shapes stay live vectors, the rest is placed as its picture
function svgDoc(){
  const parts=LAYERS.filter(l=>l.visible&&!window.ILL?.isMask(l)).map(l=>{
    const c=processed(l),tr=`translate(${+l.x.toFixed(2)} ${+l.y.toFixed(2)}) rotate(${+(l.rot*180/Math.PI).toFixed(3)}) scale(${+(l.scale*(l.flip?-1:1)).toFixed(4)} ${+l.scale.toFixed(4)})`;
    const style=`opacity:${l.opacity}${l.blend!=='source-over'?';mix-blend-mode:'+l.blend:''}`,live=plainLook(l)&&!l.distress.amount&&!l.finish&&(l.tint.amount===0||l.tint.amount===1)&&!window.ILL?.rasterOnly(l),gd=window.ILL?.svgGrad(l);
    let inner='';
    if(l.kind==='text'&&live&&!l.arc&&!textFx(l)&&!l.case){const{font,lines,lw}=textMetrics(l),fill=l.tint.amount===1?l.tint.color:l.color,lh=l.size*l.lead,pad=Math.ceil(l.size*.35+(l.outline||0)*2+4),w=c.width,h=c.height;
      inner=lines.map((t,i)=>{const x0=l.align==='left'?pad:l.align==='right'?w-pad-lw[i]:(w-lw[i])/2;return `<text x="${(x0-w/2).toFixed(1)}" y="${(pad+lh*i+lh/2-h/2).toFixed(1)}" dominant-baseline="middle" font-family="${xa(FONTS[l.font][0])}" font-size="${l.size}" font-weight="${l.bold?700:400}"${l.italic?' font-style="italic"':''} letter-spacing="${l.track}" fill="${xa(fill)}"${l.outline?` stroke="${xa(l.outlineColor)}" stroke-width="${l.outline*2}" paint-order="stroke" stroke-linejoin="round"`:''} xml:space="preserve">${esc(t)}</text>`}).join('')}
    else if(l.kind==='shape'&&live){const fill=gd&&l.tint.amount!==1?gd.ref:l.tint.amount===1?l.tint.color:l.fillColor,sk=l.tint.amount===1?l.tint.color:l.strokeColor;
      inner=l.shape==='path'&&window.VEC?VEC.svg(l,fill,sk):l.shape==='line'?`<line x1="${-l.w/2}" y1="0" x2="${l.w/2}" y2="0" stroke="${xa(l.stroke?sk:fill)}" stroke-width="${Math.max(l.strokeW,1)}" stroke-linecap="round"/>`:
        l.shape==='ellipse'?`<ellipse cx="0" cy="0" rx="${l.w/2}" ry="${l.h/2}" fill="${l.fill?xa(fill):'none'}"${l.stroke?` stroke="${xa(sk)}" stroke-width="${l.strokeW}"`:''}/>`:
        `<rect x="${-l.w/2}" y="${-l.h/2}" width="${l.w}" height="${l.h}" rx="${Math.min(l.radius||0,l.w/2,l.h/2)}" fill="${l.fill?xa(fill):'none'}"${l.stroke?` stroke="${xa(sk)}" stroke-width="${l.strokeW}"`:''}/>`;if(gd)inner=gd.defs+inner}
    else inner=`<image x="${-c.width/2}" y="${-c.height/2}" width="${c.width}" height="${c.height}" href="${c.toDataURL('image/png')}"/>`;
    const g=`<g id="${xa(l.name.replace(/[^A-Za-z0-9_-]+/g,'_')+'_'+l.id)}" data-name="${xa(l.name)}" transform="${tr}" style="${style}">${inner}</g>`;return window.ILL?ILL.svgWrap(l,g):g});
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">\n<title>${esc(D.concept.name)} · Future Basics Design Lab</title>\n${window.ILL?`<defs>${ILL.svgDefs()}</defs>`:''}\n${parts.join('\n')}\n</svg>`;
}
$('#expBtn').onclick=e=>{e.stopPropagation();const p=$('#expPop'),open=p.classList.toggle('hidden');$('#expBtn').setAttribute('aria-expanded',String(!open))};
document.addEventListener('click',e=>{if(!e.target.closest('.menu')){$('#expPop').classList.add('hidden');$('#expBtn').setAttribute('aria-expanded','false')}});
$('#expPop').addEventListener('click',e=>{const b=e.target.closest('[data-exp]');if(!b)return;$('#expPop').classList.add('hidden');const k=b.dataset.exp;compose();
  if(k==='png')download(docC.toDataURL('image/png'),fileBase()+'.png');
  if(k==='keepnew'){const name=prompt('Name for the new graphic',(D.concept.name||'Graphic')+' (variant)');if(name===null)return;busy('Keeping it in the library…');Promise.all([enc(docC),serialize()]).then(([image,doc])=>api('/v1/lab/library/studio/keep',{body:{image,name,doc}})).then(()=>toast(`"${name}" is in the graphics library now.`,'/lab/library')).catch(x=>toast(x.message)).finally(()=>busy())}
  if(k==='svg'){const url=URL.createObjectURL(new Blob([svgDoc()],{type:'image/svg+xml'}));download(url,fileBase()+'-layers.svg');setTimeout(()=>URL.revokeObjectURL(url),4000)}
  if(k==='layer'){const l=selected();if(!l){toast('Choose a layer first.');return}const c=processed(l),o=canvas(c.width*l.scale,c.height*l.scale);o.getContext('2d').drawImage(c,0,0,o.width,o.height);download(o.toDataURL('image/png'),fileBase()+'-'+l.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,30)+'.png')}});
// ---------- Illustrator round-trip: the studio's own SVG comes back as layers; any other SVG comes in as picture layers ----------
const FONT_KEYS=()=>{const m=new Map();for(const[k,v]of Object.entries(FONTS)){m.set(v[0].toLowerCase(),k);m.set(v[1].split(',')[0].replace(/['"]/g,'').trim().toLowerCase(),k)}return m};
// translate / rotate / scale / matrix, in any order, as one placement
function parseTransform(str){const mul=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];let cur=[1,0,0,1,0,0],m;const re=/(matrix|translate|rotate|scale)\(([^)]*)\)/g;
  while((m=re.exec(str||''))){const v=m[2].trim().split(/[\s,]+/).map(Number);let t;
    if(m[1]==='matrix')t=v.length===6?v:[1,0,0,1,0,0];else if(m[1]==='translate')t=[1,0,0,1,v[0]||0,v[1]||0];else if(m[1]==='scale')t=[v[0]||1,0,0,v.length>1?v[1]:(v[0]||1),0,0];
    else{const a=(v[0]||0)*Math.PI/180,c=Math.cos(a),s=Math.sin(a);t=[c,s,-s,c,0,0];if(v.length>2)t=mul(mul([1,0,0,1,v[1],v[2]],t),[1,0,0,1,-v[1],-v[2]])}
    cur=mul(cur,t)}
  const[a,b,c,d,e,f]=cur,det=a*d-b*c,flip=det<0;return{x:e,y:f,rot:flip?Math.atan2(-b,-a):Math.atan2(b,a),sx:Math.hypot(a,b),sy:Math.hypot(c,d),flip}}
const svgAttr=(el,k)=>{const v=el.getAttribute(k);if(v!=null)return v;const m=new RegExp('(?:^|;)\\s*'+k+'\\s*:\\s*([^;]+)').exec(el.getAttribute('style')||'');return m?m[1].trim():null};
async function importSvg(file){
  const text=await file.text(),doc=new DOMParser().parseFromString(text,'image/svg+xml');if(doc.querySelector('parsererror')){toast('That SVG could not be read.');return}
  const svg=doc.documentElement,vb=(svg.getAttribute('viewBox')||'').trim().split(/[\s,]+/).map(Number),sw=vb.length===4&&vb[2]>0?vb[2]:parseFloat(svg.getAttribute('width'))||W,sh=vb.length===4&&vb[3]>0?vb[3]:parseFloat(svg.getAttribute('height'))||H,k=W/sw;
  const tops=[...svg.children].filter(e=>!['title','defs','metadata','desc','style','script'].includes(e.localName)),ours=tops.filter(e=>e.localName==='g'&&e.hasAttribute('data-name')),mine=ours.length>0,groups=mine?ours:tops;
  if(!groups.length){toast('There is nothing to bring in from that SVG.');return}
  const yes=mine?await ask('Bring the edited layers back?',`This file came from the studio (${groups.length} layers). They replace the layers on the canvas: type and shapes left as type and shapes stay editable; anything redrawn comes in as a picture layer. Undo brings the old ones back.`,'Replace the layers'):await ask('Bring this SVG in?',`Not a studio file: each of its ${groups.length} top-level pieces comes in as a picture layer on top, at the size of the canvas.`,'Add on top');
  if(!yes)return;busy('Bringing the SVG in…');
  try{const out=[],byId=new Map(LAYERS.map(l=>[l.id,l])),defs=svg.querySelector('defs'),defsText=defs?new XMLSerializer().serializeToString(defs):'';
    for(const g of groups){const idm=/_([a-z0-9]{6,10})$/.exec(g.getAttribute('id')||''),old=mine&&idm?byId.get(idm[1]):null,tr=parseTransform(g.getAttribute('transform')),style=g.getAttribute('style')||'',op=/opacity\s*:\s*([\d.]+)/.exec(style),bl=/mix-blend-mode\s*:\s*([a-z-]+)/.exec(style);
      const kids=[...g.children].filter(e=>e.localName!=='title'),name=(g.getAttribute('data-name')||g.getAttribute('id')||g.localName).slice(0,60);let l=null;
      const common=o=>{o.x=tr.x*k;o.y=tr.y*k;o.rot=tr.rot;o.scale=Math.max(.02,tr.sx*k);o.flip=tr.flip;o.opacity=op?clamp(Number(op[1]),0,1):1;o.blend=bl&&BLENDS.some(b=>b[0]===bl[1])?bl[1]:'source-over';o.name=name;o.visible=true;return o};
      if(mine&&kids.length&&kids.every(e=>e.localName==='text')){l=old&&old.kind==='text'?copyL(old):fresh('text',{});l.text=kids.map(t=>t.textContent).join('\n');const t0=kids[0],fam=(svgAttr(t0,'font-family')||'').replace(/['"]/g,'').split(',')[0].trim().toLowerCase(),fk=FONT_KEYS().get(fam);if(fk)l.font=fk;
        const fs=parseFloat(svgAttr(t0,'font-size'));if(fs>0)l.size=fs;const fw=svgAttr(t0,'font-weight');if(fw)l.bold=/bold|[6-9]00/.test(fw);l.italic=/italic|oblique/.test(svgAttr(t0,'font-style')||'');const ls=parseFloat(svgAttr(t0,'letter-spacing'));if(Number.isFinite(ls))l.track=ls;
        const fill=svgAttr(t0,'fill');if(fill&&fill!=='none'){l.color=fill;l.tint={...l.tint,amount:0}}const sk=svgAttr(t0,'stroke'),swd=parseFloat(svgAttr(t0,'stroke-width'));if(sk&&sk!=='none'&&swd>0){l.outlineColor=sk;l.outline=swd/2}else l.outline=0;common(l)}
      else if(mine&&kids.length===1&&['rect','ellipse','line'].includes(kids[0].localName)){const s=kids[0],n=s.localName,A=a=>parseFloat(svgAttr(s,a));l=old&&old.kind==='shape'?copyL(old):fresh('shape',{});l.shape=n;
        if(n==='rect'){l.w=A('width')||l.w;l.h=A('height')||l.h;l.radius=A('rx')||0}else if(n==='ellipse'){l.w=A('rx')*2||l.w;l.h=A('ry')*2||l.h}else l.w=Math.abs(A('x2')-A('x1'))||l.w;
        const fill=svgAttr(s,'fill'),sk=svgAttr(s,'stroke');if(n!=='line'){l.fill=Boolean(fill&&fill!=='none');if(l.fill)l.fillColor=fill}if(sk&&sk!=='none'){l.stroke=true;l.strokeColor=sk;l.strokeW=A('stroke-width')||l.strokeW;if(n==='line')l.fillColor=sk}else if(n!=='line')l.stroke=false;l.tint={...l.tint,amount:0};common(l)}
      else if(kids.length===1&&kids[0].localName==='path'&&window.VEC&&(l=VEC.fromSvg(kids[0],old,svgAttr))){common(l);VEC.normalize(l)}
      else if(kids.length===1&&kids[0].localName==='image'&&/^data:image\//.test(kids[0].getAttribute('href')||kids[0].getAttributeNS('http://www.w3.org/1999/xlink','href')||'')){const href=kids[0].getAttribute('href')||kids[0].getAttributeNS('http://www.w3.org/1999/xlink','href'),img=await imgOf(href),c=canvas(img.naturalWidth,img.naturalHeight);c.getContext('2d').drawImage(img,0,0);
        l=old&&(old.kind==='base'||old.kind==='paint')?copyL(old):fresh('image',{});l.raster=stamp(c);l.src=null;l.dirty=true;l._srcRid=l.raster._rid;common(l);
        if(fixed(l)){l.x=W/2;l.y=H/2;l.scale=1;l.rot=0;l.flip=false;if(c.width!==W||c.height!==H){const f=canvas(W,H);f.getContext('2d').drawImage(c,0,0,W,H);l.raster=stamp(f);l._srcRid=l.raster._rid}}}
      else{const wrap=`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${sw} ${sh}">${defsText}${new XMLSerializer().serializeToString(g)}</svg>`,url=URL.createObjectURL(new Blob([wrap],{type:'image/svg+xml'}));
        try{const img=await imgOf(url),c=canvas(W,H);c.getContext('2d').drawImage(img,0,0,W,H);l=fresh('image',{name});l.raster=stamp(c);l.src=null;l.dirty=true;l._srcRid=l.raster._rid;l.x=W/2;l.y=H/2}finally{URL.revokeObjectURL(url)}}
      if(l){l._pc=null;l._pk=null;out.push(l)}}
    if(!out.length)throw new Error('Nothing in that SVG could be brought in.');
    if(mine){if(!out.some(x=>x.kind==='base')){const base=LAYERS.find(x=>x.kind==='base');if(base)out.unshift(base)}LAYERS=out}else LAYERS.push(...out);
    SEL=out[out.length-1].id;commit();paintPanels();draw();toast(`${out.length} layer${out.length===1?'':'s'} brought in from the SVG.`)}
  catch(x){toast(x.message)}finally{busy()}}
$('#impBtn').onclick=()=>$('#svgIn').click();$('#svgIn').addEventListener('change',e=>{if(e.target.files[0])importSvg(e.target.files[0]);e.target.value=''});

// ---------- 3D try-on: the design painted on a 3D model (src/lab-tryon-routes.js), shown in our own viewer ----------
let TRY=null,TRYVIEW=null,TRYPOLL=0,TRYSHOWN='';
function loadStl(){return window.FBStl?Promise.resolve():new Promise((res,rej)=>{const s=document.createElement('script');s.src='/stl-viewer.js';s.onload=res;s.onerror=()=>rej(new Error('The 3D viewer could not be loaded'));document.head.appendChild(s)})}
async function tryOpen(){if(!CID||GMODE)return;$('#tryDlg').showModal();$('#tryMsg').className='msg';$('#tryMsg').textContent='';await tryRefresh()}
async function tryRefresh(){try{TRY=await api(`/v1/lab/concepts/${CID}/tryon`);paintTry();clearTimeout(TRYPOLL);if(TRY.models.some(m=>m.status==='running')&&$('#tryDlg').open)TRYPOLL=setTimeout(tryRefresh,4000);
    const done=TRY.models.find(m=>m.status==='done'&&m.hasModel);if(done&&TRYSHOWN!==done.id)await tryShow(done.id)}catch(x){$('#tryMsg').className='msg bad';$('#tryMsg').textContent=x.message}}
function paintTry(){const t=TRY,when=d=>new Date(d).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});$('#tryCanvas').disabled=!t.connected;$('#tryConcept').disabled=!t.connected;
  $('#tryNote').textContent=t.connected?'The design goes to the 3D service with its texture switched on, and the model comes back painted with it: drag to turn it, scroll to zoom. About two minutes; it spends credits, so nothing runs on its own.':t.note;
  $('#tryList').innerHTML=t.models.length?t.models.map(m=>`<div style="border:1px solid var(--line);border-radius:12px;padding:8px 10px;display:grid;gap:6px;font-size:13px;background:#fff" data-try="${m.id}"><div class="row" style="justify-content:space-between"><b>${m.status==='done'?'Ready':m.status==='running'?'Being made…':'Could not be made'}</b><span class="note">${esc(when(m.createdAt))}</span></div><span class="note">From ${m.source==='canvas'?'the canvas':'the concept picture'}${m.triangles?` · ${m.triangles.toLocaleString()} triangles${m.textured?', painted':''}`:''}${m.error?` · ${esc(m.error)}`:''}</span><div class="row">${m.status==='done'&&m.hasModel?`<button class="btn sm ${TRYSHOWN===m.id?'':'q'}" type="button" data-tryshow="${m.id}">${TRYSHOWN===m.id?'Showing':'Show'}</button>`:''}<button class="btn sm q" type="button" data-trydel="${m.id}">Remove</button></div></div>`).join(''):'<span class="note">No model yet.</span>'}
async function tryShow(id){await loadStl();const ab=await (await blobOf(`/v1/lab/concepts/${CID}/tryon/${id}/model.glb`)).arrayBuffer();if(TRYVIEW){TRYVIEW.destroy();TRYVIEW=null}$('#tryEmpty').classList.add('hidden');TRYVIEW=window.FBStl.mount($('#tryHost'),ab,{upAxis:'y'});TRYSHOWN=id;if(TRY)paintTry()}
async function tryStart(fromCanvas){const b=fromCanvas?$('#tryCanvas'):$('#tryConcept');b.disabled=true;$('#tryMsg').className='msg';$('#tryMsg').textContent='Sending the design to the 3D service…';
  try{let body={};if(fromCanvas){compose();body={image:docC.toDataURL('image/jpeg',.92)}}await api(`/v1/lab/concepts/${CID}/tryon`,{body});$('#tryMsg').textContent='The model is being made. About two minutes; it appears here on its own.';await tryRefresh()}
  catch(x){$('#tryMsg').className='msg bad';$('#tryMsg').textContent=x.message}finally{b.disabled=false}}
$('#tryBtn').onclick=tryOpen;$('#tryCanvas').onclick=()=>tryStart(true);$('#tryConcept').onclick=()=>tryStart(false);
$('#tryDlg').addEventListener('click',async e=>{if(e.target.closest('[data-tryclose]')||e.target===$('#tryDlg')){clearTimeout(TRYPOLL);$('#tryDlg').close();return}
  const sh=e.target.closest('[data-tryshow]');if(sh){try{await tryShow(sh.dataset.tryshow)}catch(x){$('#tryMsg').className='msg bad';$('#tryMsg').textContent=x.message}return}
  const dl=e.target.closest('[data-trydel]');if(dl){try{await api(`/v1/lab/concepts/${CID}/tryon/${dl.dataset.trydel}`,{method:'DELETE'});if(TRYSHOWN===dl.dataset.trydel&&TRYVIEW){TRYVIEW.destroy();TRYVIEW=null;TRYSHOWN='';$('#tryEmpty').classList.remove('hidden')}await tryRefresh()}catch(x){$('#tryMsg').className='msg bad';$('#tryMsg').textContent=x.message}}});
function ask(title,text,yes='Yes'){return new Promise(ok=>{const d=$('#askDlg');$('#askTitle').textContent=title;$('#askText').textContent=text;$('#askYes').textContent=yes;d.returnValue='';d.onclose=()=>ok(d.returnValue==='yes');d.showModal()})}
$('#apply').onclick=async()=>{
  if(GMODE&&TAGM){busy('Putting the design on the tag…');try{await tagSaveAll();toast('The tag shows this design now: in the materials library, on the garments that use it and in their tech packs.')}catch(x){toast(x.message)}finally{busy()}return}
  if(GMODE){busy(GID?'Updating the graphic…':'Keeping it in the library…');
    try{compose();const[image,doc]=await Promise.all([enc(docC),serialize()]);
      if(GID&&PICK&&QS.get('fork')==='1'){const k=await api('/v1/lab/library/studio/keep',{body:{image,name:D.concept.name,doc}});GID=k.id;history.replaceState(null,'',`/lab/studio?art=${GID}&pick=1&fork=1`)}
      else if(GID){await api(`/v1/lab/library/graphics/${GID}/studio/apply`,{body:{image,doc}});toast('The graphic is updated in the library. Pieces that already use it keep what they had.','/lab/library')}
      else{const k=await api('/v1/lab/library/studio/keep',{body:{image,name:D.concept.name,doc}});GID=k.id;D.concept.hasImage=true;history.replaceState(null,'',`/lab/studio?art=${GID}${PICK?'&pick=1':''}`);paintSub();if(!PICK)toast('It is in the graphics library now. Put it on any concept or product from there.','/lab/library')}
      DIRTY=false;SAVED_AT=new Date().toISOString();showSaved();if(PICK){try{parent.FBDesign?.graphicKept?.(GID,D.concept.name)}catch{}}}catch(x){toast(x.message)}finally{busy()}return}
  if(D.concept.locked)return;
  const ok=await ask('Use this as the concept picture?',`Everything visible becomes the picture of "${D.concept.name}". Its turns (on a model: front, three-quarter, side and back) are drawn again from it straight away; its walk can be made again on the board.${D.concept.status==='approved'?' It is approved, so it goes back to draft to be approved again.':''} The picture it has now is kept and can be put back.`,'Use it');if(!ok)return;
  busy('Saving and using it…');try{await save();compose();const[image,doc]=await Promise.all([enc(docC),serialize()]);const r=await api(`/v1/lab/concepts/${CID}/studio/apply`,{body:{image,doc}});D.concept.status=r.status;D.canRestore=true;paintSub();
    // the turns (the piece on a model from the front, three-quarter, side and back) are drawn again from the new picture straight away; a
    // piece nobody wears gets its front and back product views instead
    let made='';try{const v=await api(`/v1/lab/concepts/${CID}/views`,{body:{kinds:['model_front','model_34','model_side','model_back']}}).catch(async x=>{if(x.status===422)return api(`/v1/lab/concepts/${CID}/views`,{body:{kinds:['flat_front','flat_back']}});throw x});made=v?.started?` Its turns are being drawn from it (${v.started} view${v.started===1?'':'s'}); they show on the concept board in a few minutes.`:''}catch(x){made=` The turns were not started: ${x.message}`}
    if(r.toPack)toast('It is the picture of the product now, first in its tech pack draft.'+made,D.concept.productUrl);else toast('It is the concept picture now.'+made,`/lab#board`)}catch(x){toast(x.message)}finally{busy()}};

// ---------- small things ----------
function busy(text){const b=$('#busy');if(!text){b.classList.add('hidden');return}$('#busyText').textContent=text;b.classList.remove('hidden')}
let TT=0;function toast(text,href){if(!text)return;let el=$('#stToast');if(!el){el=document.createElement('div');el.id='stToast';el.setAttribute('role','status');el.style.cssText='position:fixed;left:50%;bottom:22px;transform:translateX(-50%);background:#141416;color:#fff;border-radius:14px;padding:10px 16px;font-size:13px;z-index:60;max-width:min(92vw,560px)';document.body.appendChild(el)}el.innerHTML=esc(text)+(href?` <a href="${esc(href)}" style="color:#4bff9a">${/^\/tech-packs\//.test(href)?'Open the tech pack':'Open the concepts'}</a>`:'');el.hidden=false;clearTimeout(TT);TT=setTimeout(()=>{el.hidden=true},6500)}
function paintSub(){const c=D.concept;$('#tryBtn').classList.toggle('hidden',GMODE);if(GMODE&&TAGM){const t=TAGM.spec;$('#cName').textContent=c.name;$('#cSub').textContent=`Tag · ${t.widthMm} × ${t.heightMm} mm · ${t.shape}${t.fold&&t.fold!=='none'?' · '+t.fold:''} · ${t.material}${TAGM.spec.face?'':' · not designed yet'}`;$('#apply').textContent='Use on the tag';$('#expKeepNew').classList.add('hidden');return}
  if(GMODE){$('#cName').textContent=c.name;$('#cSub').textContent=`${GID?'Graphic in the library':'New graphic, not kept yet'} · ${W}×${H}px · clear background`;$('#apply').textContent=PICK?'Put it on the garment':GID?'Update the graphic':'Keep in the library';$('#expKeepNew').classList.toggle('hidden',!GID);return}const st={draft:'Draft',approved:'Approved',rejected:'Rejected',tech_pack:'Tech pack'}[c.status]||c.status;$('#cName').textContent=c.name;$('#cSub').innerHTML=`${esc(st)} · ${W}×${H}px${D.canRestore?' · <button class="btn sm q" type="button" id="restore" style="min-height:22px;padding:0 8px">Put the old picture back</button>':''}`;const r=$('#restore');if(r)r.onclick=async()=>{if(!await ask('Put the old picture back?','The concept gets the picture it had before the studio. Your design here stays as it is.','Put it back'))return;try{await api(`/v1/lab/concepts/${CID}/studio/restore`,{body:{}});D.canRestore=false;paintSub();toast('The old picture is back on the concept.')}catch(x){toast(x.message)}}}
document.addEventListener('keydown',e=>{
  if(!D)return;if(window.ILL?.key(e)||window.VEC?.key(e)||window.PRO?.key(e))return;const typing=e.target.closest&&e.target.closest('input,textarea,select,[contenteditable]')&&!e.target.closest('dialog:not([open])'),mod=e.ctrlKey||e.metaKey;
  if(mod&&e.key.toLowerCase()==='s'){e.preventDefault();saveAll();return}
  // on the flats, undo and redo reach the flats' own history even when the keys land out here (a button or the page had the focus)
  if(!typing&&mod&&(VMODE==='front'||VMODE==='back')&&['z','y'].includes(e.key.toLowerCase())){e.preventDefault();(e.key.toLowerCase()==='y'||e.shiftKey)?redo():undo();return}
  if(typing||VMODE==='front'||VMODE==='back')return; // the flats take their own keys, in their frame
  if(mod&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();return}if(mod&&e.key.toLowerCase()==='y'){e.preventDefault();redo();return}
  if(mod&&e.key.toLowerCase()==='d'){e.preventDefault();const l=selected();if(l)duplicate(l);return}
  if(e.key===' '&&!SPACE){SPACE=true;view.style.cursor='grab';e.preventDefault();return}
  const l=selected();
  if((e.key==='Delete'||e.key==='Backspace')&&l&&!l.locked){e.preventDefault();removeLayer(l);return}
  if(l&&!fixed(l)&&!l.locked&&e.key.startsWith('Arrow')){e.preventDefault();const s=e.shiftKey?10:1;if(e.key==='ArrowLeft')l.x-=s;if(e.key==='ArrowRight')l.x+=s;if(e.key==='ArrowUp')l.y-=s;if(e.key==='ArrowDown')l.y+=s;draw();clearTimeout(l._nt);l._nt=setTimeout(commit,400);return}
  if(e.key==='['){OPT.size=Math.max(1,Math.round(OPT.size*.8));OPT.dsize=Math.max(4,Math.round(OPT.dsize*.8));OPT.area=Math.max(4,Math.round(OPT.area*.8));paintOpts();draw();return}
  if(e.key===']'){OPT.size=Math.min(400,Math.round(OPT.size*1.25));OPT.dsize=Math.min(600,Math.round(OPT.dsize*1.25));OPT.area=Math.min(600,Math.round(OPT.area*1.25));paintOpts();draw();return}
  if(e.key==='0'){fit();return}if(e.key==='+'||e.key==='='){const r=view.getBoundingClientRect();zoomAt(1.25,r.width/2,r.height/2);return}if(e.key==='-'){const r=view.getBoundingClientRect();zoomAt(.8,r.width/2,r.height/2);return}
  const t={v:'select',h:'hand',b:'brush',e:'eraser',d:'distress',t:'text',r:'rect',o:'ellipse',l:'line',i:'pick',m:'area',u:'ruler',w:'warp'}[e.key.toLowerCase()];if(t&&!mod&&!e.altKey&&!(LEVEL==='simple'&&PRO_TOOLS.includes(t)))setTool(t);
});
document.addEventListener('keyup',e=>{if(e.key===' '){SPACE=false;setTool(TOOL)}});
window.addEventListener('beforeunload',e=>{if(DIRTY||FF()?.dirty()){e.preventDefault();e.returnValue=''}});
$('#undo').onclick=undo;$('#redo').onclick=redo;
// the rail's own Undo and Redo: always in reach of a thumb on an iPad (the ones in the top bar are small and fold away)
$('#railUndo').onclick=undo;$('#railRedo').onclick=redo;
// what each tool is and does, beside the rail: for learning by trying. Tap a name to pick the tool; the choice to show them is remembered
const TOOL_HELP={liquify:'Push the pixels of a picture or painting, like a finger in wet paint',fill:'Tap inside lines to fill there, in the chosen colour',select:'Tap a layer to choose it; drag to move, corners to resize, the green knob to turn',hand:'Drag to move around the page (two fingers do it too)',brush:'Paint on the chosen layer',eraser:'Rub out paint, or lines of the sketch on a flat',distress:'Wear the layer away, like a washed print',text:'Type the words; on a flat, tap or drag to move them',rect:'Drag to draw a box',ellipse:'Drag to draw an oval or circle',line:'Drag to draw a straight line',pen:'Tap for corners, drag for curves; tap the first point to close',node:'Move the points of a shape you drew',ruler:'Drag across something you know the size of, to set real inches',warp:'Bend a graphic to follow the garment',pick:'Tap the picture to borrow a colour',area:'Paint where the AI should change the picture'};
function paintRailNames(){const box=$('#railLabels'),open=$('#railNames').getAttribute('aria-pressed')==='true';$('.studio')?.classList.toggle('names-on',open);box.classList.toggle('hidden',!open);if(!open)return;const rail=$('.rail'),rb=rail.getBoundingClientRect(),sb=box.parentElement.getBoundingClientRect();
  box.style.top=(rb.top-sb.top)+'px';box.style.left=(rb.right-sb.left)+'px';box.style.height=rb.height+'px';
  box.innerHTML=[...rail.querySelectorAll('button[data-tool]')].filter(b=>b.offsetParent).map(b=>{const t=b.dataset.tool,r=b.getBoundingClientRect(),name=b.getAttribute('aria-label');return `<button type="button" role="listitem" data-pick-tool="${t}" aria-pressed="${b.getAttribute('aria-pressed')==='true'}" style="top:${r.top-rb.top+r.height/2}px"><b>${esc(name)}</b><small>${esc(TOOL_HELP[t]||b.title)}</small></button>`}).join('')}
$('#railNames').onclick=()=>{const on=$('#railNames').getAttribute('aria-pressed')!=='true';$('#railNames').setAttribute('aria-pressed',String(on));try{localStorage.setItem('fb.studio.names',on?'1':'0')}catch{}paintRailNames()};
$('#railLabels').addEventListener('click',e=>{const b=e.target.closest('[data-pick-tool]');if(b){setTool(b.dataset.pickTool);paintRailNames()}});
$('.rail').addEventListener('scroll',()=>paintRailNames(),{passive:true});window.addEventListener('resize',()=>paintRailNames());
try{if(localStorage.getItem('fb.studio.names')!=='0'&&matchMedia('(pointer:coarse)').matches&&!localStorage.getItem('fb.studio.names'))$('#railNames').setAttribute('aria-pressed','true')}catch{}setTimeout(paintRailNames,300);
