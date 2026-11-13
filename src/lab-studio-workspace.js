// The Studio (/lab/studio), part 5 of 5: one workspace with the flats, one placement model, Simple and Pro, the checklist, fabrics and trims, room for the drawing, tags; then boot().
// The five parts are one script, served joined in order (core, layers, io, open, workspace) as /lab/studio-main.js (src/server.js), so
// they share one scope exactly as the single inline script they were cut from did; they are separate files to be read and changed.
// ---------- one workspace: the picture and its flats ----------
// The flats page runs in a frame beside or instead of the picture (?embed=full: its own panel of Placements, Design, Garment, Measurements;
// ?embed=compact: the drawing alone, for side by side). The header, the view switch and Save are this page's. The frame loads the first
// time a flat is shown. Saving: unsaved flats first, then the picture, whose placed graphics go onto the flats, which then reload.
// side by side was dropped: a picture and a flat each want the whole screen
const VIEWS=['picture','front','back','pattern'],stepOfView=v=>v==='pattern'?'pattern':v==='front'||v==='back'||v==='split'?'flats':'picture';let PLOADED=false;let VMODE='picture',FLOADED=false,TPLUSED=false,FOBS=null;
function FF(){try{return FLOADED?$('#flatFrame').contentWindow.FBFlats||null:null}catch{return null}}
function flatSrc(){const t=QS.get('template');if(D?.concept?.category==='footwear'||D?.concept?.category==='bags')return `/lab/shoe-flats?concept=${CID}&embed=${VMODE==='split'?'compact':'full'}&view=${VMODE==='back'?'back':'front'}`; // a shoe is drawn in panels (src/lab-shoe-flats.html)
  return `/lab/flats?concept=${CID}&embed=${VMODE==='split'?'compact':'full'}&view=${VMODE==='back'?'back':'front'}${t&&!TPLUSED?'&template='+encodeURIComponent(t):''}`}
function loadFlats(){$('#flatFrame').src=flatSrc();FLOADED=true;TPLUSED=true}
// what the two flat views are called: a garment's front and back; a cup's sides and its wrap laid flat (the flats say which: FBFlats.viewLabels)
function viewNames(){const l=FF()?.viewLabels?.();if(!l)return;const set=(v,text,title)=>{const b=$(`#viewSeg [data-v=${v}]`);if(b&&b.textContent!==text){b.textContent=text;b.title=title}};
  if(l.wrap){set('front',l.front,l.front==='Sides'?'The measured flat: the product from the front and from the back':'The measured flat, front');set('back',l.back,'The wrap laid flat at true size: what is placed on it is printed round the product')}
  else{set('front','Flat front','The measured flat, front');set('back','Flat back','The measured flat, back')}}
function reloadFlats(){if(!FLOADED||FF()?.dirty())return;const f=FF();if(f?.refresh){f.refresh();return}$('#flatFrame').src=flatSrc()} // read again in place: no blink, and the view keeps its zoom and turn
async function flatsFirst(){const f=FF();if(f&&f.dirty()&&!(await f.save()))throw new Error('the flats could not be saved first')}
async function saveAll(){if(GMODE||!CID)return save();const f=FF();if(f&&f.dirty()&&!(await f.save()))return false;await LINKP;return save()} // graphics on their way from the flats are part of this save
// the flats' own saved line shows in the header beside the picture's
function mirrorFlats(){const d=$('#flatFrame').contentDocument,src=d&&d.getElementById('saved'),out=$('#fsaved');if(!src)return;FOBS?.disconnect();
  const copy=()=>{out.className='saved flat-only'+(src.classList.contains('dirty')?' dirty':'');out.innerHTML=src.innerHTML?'Flats: '+src.innerHTML:'';out.title=src.title||'The flats'};copy();FOBS=new MutationObserver(copy);FOBS.observe(src,{childList:true,characterData:true,subtree:true,attributes:true})}
// ---------- one placement model: inches on the garment ----------
// Where a graphic goes and how big it is lives in one place: the flats' placement, in inches from the HPS and the centre front. A layer with a
// place on the picture is that placement drawn on the picture: set its size on the picture and the flats take it; change its size on the flats,
// or take it off them, and the picture follows. FLATS is the latest record the page has (from the service, then from the flats as they save).
let FLATS=null;
function adoptFlats(list,{saved=true}={}){FLATS={saved,placements:list||[]};if(GMODE||!LAYERS.length){paintLayers();return}
  const changed=[],inStep=SYNCED!==null&&syncKey()===SYNCED; // the picture had nothing waiting for the flats: what comes from them now is theirs already
  for(const l of LAYERS){if(l.kind==='base'||!l.placement)continue;const q=FLATS.placements.find(x=>x.source==='studio'&&x.layer===l.id);
    if(q){const s=inchesOf(l);if(s.w>0&&Math.abs(q.w-s.w)>.07){l.scale=clamp(l.scale*q.w/s.w,.02,40);changed.push(`${l.name} is ${fin(q.w)} in wide, as on the flats`)}}
    else if(saved&&l.art){l.placement=undefined;changed.push(`${l.name} came off the flats, so it is on the picture only`)}} // only a layer that was on them (it has its artwork) can have come off
  // a brand mark recoloured on the flats takes the new colours on the picture too (and so in what is saved next)
  for(const l of LAYERS){const b=brandOf(l.src);if(!b)continue;const q=FLATS.placements.find(x=>x.mark&&((x.source==='studio'&&x.layer===l.id)||x.id===l.fromFlat));if(!q||brandSrc(q)===l.src)continue;
    const src=brandSrc(q);l.src=src;markRaster(q.mark,q.colour,q.dot).then(r=>{if(l.src!==src)return;l.raster=r;l._srcRid=r._rid;l._pc=null;l._pk=null;l._tk=null;commit();paintLayers();draw()}).catch(()=>{})}
  if(changed.length){commit();draw();toast(changed.slice(0,2).join('. ')+(changed.length>2?` and ${changed.length-2} more`:'')+'.');if(inStep&&saved)SYNCED=syncKey()}
  paintLayers();
  // a logo or graphic added on the flats comes onto the picture by itself (the front only: the picture shows the front). What came with the
  // concept is already drawn in its picture, so that waits for Put on the picture.
  // A picture drawn from the flats has no graphic in it (the image model is told to leave them off, src/lab-trip.js), so every front graphic,
  // the concept's own logo included, goes on it as a layer at its size
  if(saved)linkFromFlats(FLATS.placements.filter(q=>q.source!=='studio'&&q.view==='front'&&(D?.concept?.fromFlats||q.added||/^p[a-z0-9]{6}$/.test(q.id))&&(q.art||q.mark)))}
const LINKING=new Set();
// where a placement sits on the picture: the garment's top and centre in the picture, then the placement's inches at the picture's scale
function garmentBox(){const b=LAYERS.find(l=>l.kind==='base');if(!b||!b.raster)return null;const k=Math.min(1,256/b.raster.width),w=Math.max(1,Math.round(b.raster.width*k)),h=Math.max(1,Math.round(b.raster.height*k)),c=canvas(w,h),x=c.getContext('2d',{willReadFrequently:true});x.drawImage(b.raster,0,0,w,h);
  const d=x.getImageData(0,0,w,h).data,px=(i,j)=>{const o=(j*w+i)*4;return[d[o],d[o+1],d[o+2],d[o+3]]},cs=[px(0,0),px(w-1,0),px(0,h-1),px(w-1,h-1)],bg=[0,1,2].map(i=>cs.reduce((t,q)=>t+q[i],0)/4),fg=(i,j)=>{const p=px(i,j);return p[3]>20&&Math.abs(p[0]-bg[0])+Math.abs(p[1]-bg[1])+Math.abs(p[2]-bg[2])>36};
  const cols=new Array(w).fill(0),rows=new Array(h).fill(0);for(let j=0;j<h;j++)for(let i=0;i<w;i++)if(fg(i,j)){cols[i]++;rows[j]++}
  const min=Math.max(2,h*.02),a=cols.findIndex(v=>v>=min),z=w-1-[...cols].reverse().findIndex(v=>v>=min),top=rows.findIndex(v=>v>=Math.max(2,w*.02));if(a<0||z<=a||top<0)return null;
  return{cx:(a+z+1)/2/k,top:top/k}}
function flatKey(q){const ids=(D.placements||[]).map(p=>p.id),t=`${q.name||''} ${q.where||''}`.toLowerCase(),hit=ids.find(k=>t.includes(k));if(hit)return hit;
  if(/pant|short|jean|trouser|bottom/.test(String(D.concept.category||''))&&ids.includes('thigh'))return'thigh';
  if(q.w>=9&&ids.includes('full front'))return'full front';if(Math.abs(q.x)>=1.25&&ids.includes('left chest'))return'left chest';return ids.includes('centre chest')?'centre chest':ids[0]||undefined}
async function flatToLayer(q){let r,src;
  if(q.art){const u=await urlOfBlob(await blobOf('/v1/lab/art/'+q.art)),img=await imgOf(u);r=stamp(canvas(img.naturalWidth,img.naturalHeight));r.getContext('2d').drawImage(img,0,0);src='/v1/lab/art/'+q.art}
  else if(q.mark){r=await markRaster(q.mark,q.colour,q.dot);src=brandSrc(q)}else return null;
  const box=garmentBox(),l=addLayer(fresh('image',{name:String(q.name||'Graphic').slice(0,40),raster:r,src,_srcRid:r._rid,scale:1,x:Math.round(box?box.cx+q.x*PPI:W/2),y:Math.round(box?box.top+q.y*PPI:H*.4)}),{silent:true});
  const sz=inchesOf(l);if(sz.w>0)l.scale=clamp(q.w/sz.w,.02,40);l.placement=flatKey(q);l.fromFlat=q.id;if(q.techniqueId&&D.techniques?.some(t=>t.id===q.techniqueId))applyTech(l,q.techniqueId);return l}
let LINKP=Promise.resolve();
function linkFromFlats(list){return LINKP=LINKP.then(()=>linkNow(list)).catch(()=>{})}
async function linkNow(list){const todo=list.filter(q=>!LAYERS.some(l=>l.fromFlat===q.id)&&!LINKING.has(q.id));if(!todo.length)return;const done=[];
  for(const q of todo){LINKING.add(q.id);try{const l=await flatToLayer(q);if(l)done.push(l.name)}catch{LINKING.delete(q.id)}}
  if(done.length){commit();paintLayers();draw();toast(`From the flats: ${done.slice(0,2).join(', ')}${done.length>2?` and ${done.length-2} more`:''} on the picture at ${done.length>1?'their':'its'} size. Move ${done.length>1?'them':'it'} where ${done.length>1?'they sit':'it sits'} in the picture.`)}}
async function loadFlatsRecord(){if(GMODE||!CID)return;try{const r=await api(`/v1/lab/concepts/${CID}/flats`);if(r.unsupported)return;const f=r.flat||{};adoptFlats((f.placements||[]).map(q=>({...q,where:'',side:r.sides?.[q.id]||''})),{saved:Boolean(f.saved)})}catch{}}
function garmentHtml(){if(GMODE||!FLATS)return'';const L=FLATS.placements;
  return `<div class="sec" id="garmentSec"><h4>On the garment · in inches</h4>${L.length?`<div class="gpl">${L.map(q=>{const ly=q.source==='studio'&&LAYERS.find(x=>x.id===q.layer);
    const linked=ly||LAYERS.find(l=>l.fromFlat===q.id),can=!linked&&FLATS.saved&&q.view==='front'&&(q.art||q.mark);
    return `<div class="gprow"><button type="button" class="gp" data-gp="${esc(q.id)}" ${linked?`data-gly="${esc(linked.id)}"`:''}><b>${esc(q.name)}</b><span>${q.side||(q.view==='back'?'Back':'Front')} · ${fin(q.w)} × ${fin(q.h)} in${linked?' · on the picture':q.view==='back'&&q.side!=='Wrap'?' · the picture shows the front':''}</span>${q.where?`<small>${esc(q.where)}</small>`:''}</button>${can?`<button type="button" class="btn sm q" data-gpadd="${esc(q.id)}" title="Add it to the picture as a layer at its size">Put on the picture</button>`:''}</div>`}).join('')}</div>`:'<p class="note" style="margin:0">Nothing is placed on the garment yet. Choose where a layer goes (Goes on) and it lands on the flats at its size.</p>'}
    <p class="note" style="margin:0">One record for both views: change a size here or on the flats and the other follows.${FLATS.saved?'':' The flats are not saved yet.'}</p></div>`}
$('#pLayers').addEventListener('click',async e=>{const ad=e.target.closest('[data-gpadd]');if(ad){const q=FLATS?.placements.find(x=>x.id===ad.dataset.gpadd);if(!q)return;ad.disabled=true;busy('Putting it on the picture…');try{const l=await flatToLayer(q);if(l){SEL=l.id;commit();paintLayers();draw();toast(`${l.name} is on the picture at its size: move it where it sits.`)}}catch(x){toast(x.message);ad.disabled=false}finally{busy()}return}
  const b=e.target.closest('[data-gp]');if(!b)return;if(b.dataset.gly&&(VMODE==='picture'||VMODE==='split')){SEL=b.dataset.gly;paintLayers();draw();return}
  const q=FLATS?.placements.find(x=>x.id===b.dataset.gp);if(!q)return;Promise.resolve(VMODE==='split'?null:setVMode(q.view)).then(()=>{const go=()=>{const f=FF();if(f&&f.ready())f.select(q.id);else setTimeout(go,200)};go()})});
// ---------- Simple and Pro ----------
// Simple shows the essentials (the picture, graphics and their place, the flats and their sheets); Pro shows every tool. A client's room starts
// on Simple and Future Basics on Pro; the choice is remembered in this browser.
const PRO_TOOLS=['distress','ruler','warp','pick'];
const isClientView=()=>{try{return !localStorage.getItem('fb.admin.token')&&Boolean(localStorage.getItem('fb.client.token'))}catch{return false}};
let LEVEL=(()=>{try{const v=localStorage.getItem('fb.design.level');if(v==='simple'||v==='pro')return v}catch{}return isClientView()?'simple':'pro'})();
function setLevel(v,{keep=true}={}){LEVEL=v==='simple'?'simple':'pro';$('#app').dataset.level=LEVEL;$$('#levelSeg [data-level]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.level===LEVEL)));
  if(keep)try{localStorage.setItem('fb.design.level',LEVEL)}catch{}
  if(LEVEL==='simple'&&PRO_TOOLS.includes(TOOL))setTool('select');FF()?.level?.(LEVEL)}
$$('#levelSeg [data-level]').forEach(b=>b.onclick=()=>setLevel(b.dataset.level));setLevel(LEVEL,{keep:false});

// ---------- the checklist: what it still needs before the tech pack ----------
let READY=null;
async function loadReady(){if(GMODE||!CID)return;try{READY=await api(`/v1/lab/concepts/${CID}/ready`)}catch{return}paintReady()}
// a piece with flats but no picture (from the recipe menu or a sketch): draw the picture from the flats in one go
// The bar offers the picture drawn from the flats when there is none; and when the one drawn from them was checked and left a detail out
// (src/lab-flats-routes.js checkPicture), it says which and offers to draw it again with those insisted on
let PICMISS=[];
function paintFlatPic(){const c=D?.concept,can=Boolean(CID&&!GMODE&&c&&c.hasFlats&&!c.locked&&D.ai?.connected),chk=c?.fromFlats&&c.hasImage?c.pictureCheck:null;
  PICMISS=chk?.missing||[];const redo=Boolean(can&&PICMISS.length),bar=$('#flatPicBar'),txt=bar.querySelector('span');bar.dataset.mode=redo?'redo':'new';
  if(redo){const names=PICMISS.map(k=>chk.labels?.[k]||k);const said=names.length===1?names[0].toLowerCase():`${names.length} details: ${names.slice(0,2).join('; ').toLowerCase()}${names.length>2?` and ${names.length-2} more`:''}`;
    txt.innerHTML=`<b>The picture left out ${esc(said)}.</b><i class="more" style="font-style:normal"> Each detail of the flats was checked in it.</i>`;txt.title=names.join('\n');bar.setAttribute('aria-label','The picture left details out');$('#flatPicGo').textContent='Draw it again, showing them'}
  else{txt.innerHTML='<b>No picture yet.</b><i class="more" style="font-style:normal"> Draw it from the flats (one AI generation).</i>';bar.setAttribute('aria-label','No picture yet');$('#flatPicGo').textContent='Draw the picture from the flats'}
  bar.classList.toggle('hidden',!(redo||(can&&!c.hasImage)));dockFlatPic()}
$('#flatPicX').onclick=()=>$('#flatPicBar').classList.add('hidden');
// On a wide screen the prompt takes a place in the bar when the bar has the room on the rows it already has, so it never sits on the foot
// of the drawing. Where it would cost the work a row (the Picture view on a laptop, an iPad), in Focus and on a narrow screen it floats
// over the canvas as before.
const FPQ=matchMedia('(min-width:981px)');
function dockFlatPic(){const el=$('#flatPicBar'),bar=$('.bar'),put=on=>{if(on===el.classList.contains('docked'))return;el.classList.toggle('docked',on);if(on)bar.insertBefore(el,$('#people'));else $('#app').after(el)};
  if(!FPQ.matches||document.documentElement.dataset.focus||el.classList.contains('hidden'))return put(false);
  put(false);const h=bar.offsetHeight;put(true);if(bar.offsetHeight>h+2)put(false)}
FPQ.addEventListener('change',dockFlatPic);{const mo=new MutationObserver(dockFlatPic);mo.observe(document.documentElement,{attributes:true,attributeFilter:['data-focus']});mo.observe($('#app'),{attributes:true,attributeFilter:['data-v','class']});try{new ResizeObserver(dockFlatPic).observe($('.bar'))}catch{}}
$('#flatPicGo').onclick=async()=>{const b=$('#flatPicGo');if(HOLD)return;
  // what is open is saved first, and nothing saves while the model draws: a save landing after the picture would put the old base back
  if(!(await saveAll()))return;HOLD=true;busy('Drawing the picture from the flats. About a minute…');
  const redo=$('#flatPicBar').dataset.mode==='redo',body=redo?{replace:true,insist:PICMISS}:{};
  try{const r=await FBN.run(b,()=>api(`/v1/lab/concepts/${CID}/flats/picture`,{body}),{done:'The picture is drawn: it is the concept picture now.'});DIRTY=false;clearTimeout(AUTO);
    // what the check of the new picture found goes with the page that opens next
    try{sessionStorage.setItem('fb.picCheck.'+CID,JSON.stringify(r?.check||null))}catch{}location.href=`/lab/studio?concept=${CID}&view=picture`}catch{HOLD=false}finally{busy()}};
function paintReady(){const b=$('#readyBtn');if(!READY){b.textContent='Checklist';return}
  b.textContent=READY.isPack?'Tech pack ✓':`Checklist ${READY.done}/${READY.total}`;b.classList.toggle('ok',READY.ready);
  $('#readyList').innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b style="font-size:14px">${READY.isPack?'It is a tech pack':READY.ready?'Ready for the tech pack':'Before the tech pack'}</b>${READY.next?`<a class="btn sm go" href="${esc(READY.next.href)}" data-readynext>${esc(READY.next.label)}</a>`:''}</div>`
    +READY.items.map(i=>`<div class="rd" data-ready="${esc(i.id)}" data-state="${i.state}"><span class="st ${i.state}" aria-label="${i.state==='done'?'Done':i.state==='todo'?'To do':'Worth a look'}"></span><b>${esc(i.label)}</b>${i.state==='done'?'<span></span>':i.go?.view?`<button class="btn sm q" type="button" data-readygo="${esc(i.go.view)}">Go</button>`:i.go?.href?`<a class="btn sm q" href="${esc(i.go.href)}">Open</a>`:'<span></span>'}<small>${esc(i.note)}</small></div>`).join('')}
$('#readyBtn').onclick=e=>{e.stopPropagation();const p=$('#readyPop'),open=p.classList.toggle('hidden');$('#readyBtn').setAttribute('aria-expanded',String(!open));if(!open)loadReady()};
$('#readyPop').addEventListener('click',e=>{e.stopPropagation();const g=e.target.closest('[data-readygo]');if(g){$('#readyPop').classList.add('hidden');setVMode(g.dataset.readygo)}});
document.addEventListener('click',e=>{if(!e.target.closest('#readyWrap'))$('#readyPop').classList.add('hidden')});

// a sheet from the flats, when the Lab runs as a home-screen app: shown here, with Share (Print, Save to Files, AirDrop, Mail) and Close
function showSheet(blob,name,title){let d=$('#sheetDlg');if(!d){d=document.createElement('dialog');d.id='sheetDlg';d.style.cssText='border:0;border-radius:20px;padding:0;width:min(1100px,96vw);max-height:94vh;overflow:auto';document.body.appendChild(d)}
  const u=URL.createObjectURL(blob),pdf=/pdf/.test(blob.type)||/\.pdf$/.test(name),pic=/^image\//.test(blob.type)||/\.(png|svg|jpe?g|webp)$/i.test(name),file=new File([blob],name,{type:blob.type||(pdf?'application/pdf':'image/svg+xml')}),canShare=Boolean(navigator.canShare?.({files:[file]}));
  d.innerHTML=`<div style="padding:16px;display:grid;gap:12px"><div class="row" style="justify-content:space-between;gap:8px;flex-wrap:wrap"><h3 style="margin:0;font-size:16px">${esc(title)}</h3><div class="row" style="gap:8px">${canShare?'<button class="btn go sm" type="button" data-sheetshare>Share or print</button>':''}<a class="btn sm" href="${u}" download="${esc(name)}">Save</a><button class="btn sm q" type="button" data-sheetclose>Close</button></div></div>
    ${pdf?`<p class="note" style="margin:0">The decoration sheet is ready: one page per graphic. ${canShare?'Share or print sends it to Print, Files, Mail or AirDrop.':'Save keeps the PDF.'}</p>`:!pic?`<p class="note" style="margin:0">${esc(name)} is ready. ${canShare?'Share sends it to Files, Mail or AirDrop.':'Save keeps it.'}</p>`:`<img src="${u}" alt="${esc(title)}" style="width:100%;display:block;border:1px solid var(--line);border-radius:12px;background:#fff">`}</div>`;
  d.querySelector('[data-sheetclose]').onclick=()=>{d.close();setTimeout(()=>URL.revokeObjectURL(u),1000)};
  const sh=d.querySelector('[data-sheetshare]');if(sh)sh.onclick=()=>navigator.share({files:[file],title}).catch(()=>{});
  d.showModal()}
// a graphic removed on the flats leaves the garment here too (it stays on the picture as a layer); without this the next save puts it back
function flatRemoved({id,layer}={}){const l=LAYERS.find(x=>(layer&&x.id===layer)||(id&&x.fromFlat===id));if(!l||!l.placement)return;l.placement=undefined;l.fromFlat=undefined;commit();paintLayers();draw();toast(`${l.name} is off the garment. It is still a layer on the picture: delete it in Layers if you do not want it there either.`)}
const ENGD=()=>['electronics','toys','home'].includes(D?.concept?.category);
window.FBDesign={saveAll,reloadFlats:()=>{try{reloadFlats()}catch{}},showSheet,flatRemoved,graphicStudio,graphicKept,materials:()=>matOpen().catch(x=>toast(x.message)),recipeUrl:()=>D?.concept?.recipe&&!D.concept.locked?`/lab/recipe?concept=${CID}`:'',clothChanged:()=>{if(typeof paintFabrics==='function'&&$('#fabSec'))paintFabrics().catch(()=>{});if($('#matDlg')?.open)matLoadOn().catch(()=>{});setTimeout(loadReady,200)}, /* the cloth changed on the flats: the fabric panels and the checklist read it again */drawOpts:()=>({shFill:OPT.shFill,shFillC:OPT.shFillC,shStroke:OPT.shStroke,shStrokeC:OPT.shStrokeC,shW:OPT.shW,sides:OPT.sides,inner:OPT.inner,dash:OPT.dash,tool:TOOL,color:CUR,size:TOOL==='eraser'?OPT.esize:OPT.size,dsize:OPT.dsize,flow:OPT.flow,soft:OPT.soft,pressure:OPT.pressure,tip:OPT.tip,etip:OPT.etip,stream:OPT.stream,qshape:OPT.qshape,lock:OPT.lock,sym:OPT.sym,ftol:OPT.ftol,liqMode:OPT.liqMode,liqK:OPT.liqK}),flatsChanged(){syncUndo();viewNames()},flatsSaved(){const f=FF();if(f)adoptFlats(f.placements(),{saved:true});setTimeout(loadReady,300)},flatsReady(){const f=FF();if(!f)return;f.mode(VMODE==='split'?'compact':'full');if(VMODE==='front'||VMODE==='back'){f.setView(VMODE);f.tool?.(TOOL)}f.layout?.(LAYOUT);mirrorFlats();f.level?.(LEVEL);viewNames();$('#packBtn').classList.toggle('hidden',!f.canPack());FLATS={saved:f.saved(),placements:f.placements()};paintLayers();['#specBtn','#decoBtn'].forEach(s=>$(s).disabled=Boolean(f.unsupported()))}};
async function setVMode(v,{push=true}={}){
  if(!VIEWS.includes(v)||GMODE||!CID)v='picture';const was=VMODE;
  if(v==='pattern'){const f=FF();if(f?.dirty?.())toast('The flats have changes that are not saved: save them to see them in the pattern.');$('#patFrame').src=`/lab/${ENGD()?'engineer':'pattern'}?concept=${CID}&embed=1`;PLOADED=true}
  else if(v!=='picture'){
    // the graphics placed on the picture go onto the flats before they are shown
    if(!GMODE&&DIRTY&&(was==='picture'||!FLOADED)){busy('Putting the graphics on the flats…');try{const sent=await syncFlats({before:flatsFirst});if(sent&&FLOADED)reloadFlats()}catch(x){toast('The flats did not take the graphics: '+x.message)}finally{busy()}}
    if(!FLOADED)loadFlats()}
  VMODE=v;$('#app').dataset.v=v;if(v==='picture'||v==='split'){if(paintLayers.later)paintLayers();if(render.later){render.later=false;draw()}} // the panel and the picture catch up with what changed while they were hidden
  document.body.classList.toggle('typing',TOOL==='text'&&(v==='front'||v==='back'));$$('#viewSeg [data-v]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v===v)));$('#pieceSteps').setStep?.(stepOfView(v));
  const f=FF();if(f&&f.ready()){f.mode(v==='split'?'compact':'full');if(v==='front'||v==='back'){f.setView(v);f.tool?.(TOOL)}}
  if(['warp','pick','ruler'].includes(TOOL)&&v!=='picture')setTool('select');paintOpts();syncUndo();
  if(push){const u=new URL(location.href);if(v==='picture')u.searchParams.delete('view');else u.searchParams.set('view',v);u.searchParams.delete('template');history.replaceState(null,'',u)}
  if(v==='picture'||v==='split')requestAnimationFrame(fit)}
$$('#viewSeg [data-v]').forEach(b=>b.onclick=()=>setVMode(b.dataset.v));
$('#moreBtn').onclick=()=>{const o=$('.bar').classList.toggle('open');$('#moreBtn').setAttribute('aria-expanded',String(o))};
const flatsOr=fn=>()=>{const f=FF();if(!f||!f.ready()){toast('The flats are still loading.');return}fn(f)};
$('#specBtn').onclick=flatsOr(f=>f.sheet());$('#decoBtn').onclick=flatsOr(f=>f.deco());$('#washBtn').onclick=flatsOr(f=>f.wash?.());$('#packBtn').onclick=flatsOr(f=>f.pack());
// ---------- fabrics, trims and labels on the garment (the concept's bill of materials), from the materials library; on the picture and the flats ----------
const MAT={kind:'fabric',q:'',on:null,lib:[]};let MSW=null,MTG=null,MPH=null;
const matMods=async()=>{if(!MSW)[MSW,MTG,MPH]=await Promise.all([import('/lab/lab-swatches.js'),import('/lab/lab-tags.js'),import('/lab/lab-photos.js').catch(()=>null)]);return[MSW,MTG]};
const MROLES={fabric:[['main','Main fabric'],['contrast','Contrast'],['lining','Lining'],['rib','Rib and trims']],trim:[['trim','Trim']],tag:[['tag','Tag or label']]};
// what a concept's category adds to the library tabs (footwear, plush and toy materials, plastics), and the parts they go on (options.parts)
const MGOODS={footwear:[['footwear','Footwear materials']],plush:[['plush','Plush and toy materials']],toys:[['plastic','Plastics and acrylics'],['plush','Plush and toy materials']],electronics:[['plastic','Plastics and acrylics']],home:[['plastic','Plastics and acrylics']]};
const mParts=()=>(MAT.opts?.parts||{})[D?.concept?.category]||[];
// the part a material goes on when it is added: the first whose kinds and categories take it
const mPartFor=m=>{const ps=mParts();return(ps.find(p=>p.kinds.includes(m.kind)&&(!p.cats.length||p.cats.includes(m.spec?.category)))||ps.find(p=>p.kinds.includes(m.kind)))?.id||''};
const tagInk=h=>{if(!/^#[0-9a-f]{6}$/i.test(h||''))return'#141416';const n=parseInt(h.slice(1),16);return((n>>16)*299+((n>>8)&255)*587+(n&255)*114)/1000<128?'#f3eee4':'#141416'};
function matThumb(m,colour){const[S,T]=[MSW,MTG];if(m.kind==='tag'){const fill=colour?.hex||(m.colours||[])[0]?.hex||'';return`<div class="th tg" ${m.spec?.face?`data-tagface="${esc(m.spec.face)}" data-tagfill="${esc(fill)}"`:''}>${T.tagSvg(m.spec||{},{scale:2,showSize:false,fill,ink:tagInk(fill)})}</div>`}
  // a photo of the cloth or trim in the colour chosen on the garment, over the drawing (which shows while it loads, or when no photo fits)
  const cs=colour?[colour,...(m.colours||[])]:(m.colours||[]),ph=!m.hasSwatch&&MPH?MPH.photoFor({...m,colours:cs}):'',hex=(cs.find(c=>c?.hex)?.hex||'').replace('#','');
  return`<div class="th" ${m.hasSwatch?`data-msw="${m.id}"`:''}>${S.materialSvg({...m,colours:cs},'m'+m.id.replace(/-/g,'').slice(0,10)+(colour?.hex||'').slice(1))}${ph?`<img src="/lab/material-photos/${esc(ph)}.jpg?c=${esc(hex)}&s=320" alt="" loading="lazy" onerror="this.remove()">`:''}</div>`}
// a tag designed in the studio shows its face (fetched with the sign-in, then drawn into the tag)
function matFaces(root,list){for(const el of root.querySelectorAll('[data-tagface]')){const m=list.find(x=>x.spec?.face===el.dataset.tagface);if(!m)continue;
  fetch('/v1/lab/art/'+el.dataset.tagface,{headers:{Authorization:'Bearer '+TOKEN()}}).then(r=>r.ok?r.blob():null).then(b=>{if(!b)return;const f=el.dataset.tagfill;el.innerHTML=MTG.tagSvg(m.spec,{scale:2,showSize:false,face:URL.createObjectURL(b),fill:f,ink:tagInk(f)})}).catch(()=>{})}}
function matPhotos(root){for(const el of root.querySelectorAll('[data-msw]'))fetch(`/v1/lab/materials/${el.dataset.msw}/swatch?thumb=1`,{headers:{Authorization:'Bearer '+TOKEN()}}).then(r=>r.ok?r.blob():null).then(b=>{if(b){const i=new Image();i.alt='';i.src=URL.createObjectURL(b);el.append(i)}}).catch(()=>{})}
async function matOpen(){await matMods();$('#matDlg').showModal();
  {const extra=MGOODS[D?.concept?.category]||[],seg=$('#matKinds');seg.querySelectorAll('[data-goods]').forEach(b=>b.remove());seg.insertAdjacentHTML('beforeend',extra.map(([k,l])=>`<button type="button" data-mk="${k}" data-goods aria-pressed="false">${l}</button>`).join(''))}
  // the whole library once, so a pick's colours can be offered whichever tab is showing
  const all=await Promise.all(['fabric','trim','tag',...(MGOODS[D?.concept?.category]||[]).map(x=>x[0])].map(k=>api(`/v1/lab/materials?kind=${k}`).then(r=>{MAT.opts=r.options;return r.materials}).catch(()=>[])));MAT.lib=all.flat();
  await Promise.all([matLoadOn(),matLoadLib()])}
async function matLoadOn(){try{MAT.on=await api(`/v1/lab/concepts/${CID}/materials`)}catch(x){$('#matOn').innerHTML=`<span class="msg bad">${esc(x.message)}</span>`;return}matPaintOn()}
function matPaintOn(){const o=MAT.on,locked=Boolean(D?.concept?.locked),picks=o?.picks||[];
  $('#matOn').innerHTML=picks.length?picks.map(p0=>{const p={...p0,spec:MAT.lib.find(m=>m.id===p0.id)?.spec||p0.spec},roles=MROLES[p.kind]||MROLES.trim,cols=(p.colours||[]);return`<div class="mp" data-mp="${esc(p.id)}" data-role="${esc(p.role)}" data-part="${esc(p.part||'')}">${matThumb(p,p.colour)}<div><b>${esc(p.name)}</b><div class="note">${esc(money(Math.round(p.qty*p.unitCents)))} a piece · ${esc(p.qty)} ${esc(p.unit)} at ${esc(money(p.unitCents))}${p.supplier?' · '+esc(p.supplier):''}</div>
    <div class="f2">${p.role==='part'||p.part?`<label>Goes on<select class="t" data-mf="part" ${locked?'disabled':''}>${mParts().map(x=>`<option value="${esc(x.id)}" ${x.id===p.part?'selected':''}>${esc(x.label)}</option>`).join('')}</select></label>`:`<label>Used as<select class="t" data-mf="role" ${locked?'disabled':''}>${roles.map(([v,l])=>`<option value="${v}" ${v===p.role?'selected':''}>${l}</option>`).join('')}</select></label>`}
    <label>Colour<select class="t" data-mf="colour" ${locked?'disabled':''}><option value="">${p.colour?esc(p.colour.name||p.colour.hex):'Any'}</option>${(MAT.lib.find(m=>m.id===p.id)?.colours||[]).filter(c=>c.hex!==p.colour?.hex).map(c=>`<option value="${esc(c.hex)}">${esc(c.name||c.hex)}</option>`).join('')}</select></label>
    <label>${p.kind==='fabric'?'Metres a piece':'How many a piece'}<input class="t" type="number" step="any" min="0" inputmode="decimal" data-mf="qty" value="${esc(p.qty)}" ${locked?'disabled':''}></label>
    <label style="grid-column:1/-1">Where it goes<input class="t" data-mf="note" maxlength="200" placeholder="${p.kind==='tag'?esc(p.spec?.attach||'e.g. sewn into the neck seam'):p.kind==='trim'?'e.g. centre front, 7 buttons':'e.g. body and sleeves'}" value="${esc(p.note||'')}" ${locked?'disabled':''}></label></div></div>
    <div style="display:grid;gap:6px;align-content:start">${p.kind==='tag'?`<a class="btn sm" href="/lab/studio?tag=${encodeURIComponent(p.id)}&for=${encodeURIComponent(CID)}" title="Fonts, words, graphics and drawing on the label, with every studio tool">Design it</a>`:''}<button class="btn sm q" type="button" data-mdel ${locked?'disabled':''} aria-label="Take ${esc(p.name)} off the garment">Remove</button></div></div>`}).join(''):'<span class="note">Nothing yet. Add the main fabric first, then trims and labels.</span>';
  paintMatFit();
  const c=o?.cost;$('#matCost').innerHTML=c&&picks.length?`Materials ${money(c.materialsCents)} · making ${money(c.makingCents)} · landed ${money(c.landedCents)} a piece${c.marginPct!=null?` · margin ${c.marginPct}%`:''}. The tech pack takes these lines.`:'';
  matPhotos($('#matOn'));matFaces($('#matOn'),[...(MAT.on?.picks||[]).map(p=>({...p,spec:MAT.lib.find(m=>m.id===p.id)?.spec||p.spec})),...MAT.lib])}
// does the fabric suit the style? the service's answer (src/lab-fabric-fit.js), and a way to keep a "wrong" one on purpose, with the reason
let FFIT=null;const fitMod=async()=>FFIT||(FFIT=await import('/lab/lab-fabric-fit.js'));
// what the check could not see (a fabric with no weight, a sole with no hardness): asked for right under it, filled in on this piece
let FASK=null;const askMod=async()=>{if(FASK)return FASK;FASK=await import('/lab/lab-fit-ask.js');const st=document.createElement('style');st.textContent=FASK.askCss;document.head.append(st);return FASK};
function paintAsks(el,f,locked){if(locked||!f?.asks?.length)return;askMod().then(A=>{if(MAT.on?.fit!==f)return;el.insertAdjacentHTML('beforeend',`<div class="fitasks">${f.asks.slice(0,3).map((a,i)=>A.askHtml(a,i)).join('')}</div>`)}).catch(()=>{})}
function paintMatFit(){const el=$('#matFit'),f=MAT.on?.fit,locked=Boolean(D?.concept?.locked);if(!el)return;if(!f||f.verdict==='unknown'){el.classList.add('hidden');return}
  const v=f.accepted?'accepted':f.verdict;el.dataset.v=v;el.classList.remove('hidden');
  el.innerHTML=f.accepted?`<span>✓ ${esc(f.summary)}</span>${locked?'':'<div class="row"><button class="btn sm q" type="button" data-fitundo>Take it back</button></div>'}`
    :v==='good'?`<span>${f.asks?.length?'':'✓ '}${esc(f.summary)}</span>`
    :`<span><b>${v==='wrong'?'✕ This fabric does not suit it':'! Worth a look'}</b>: ${esc(f.findings[0].msg)} <span class="why">${esc(f.findings[0].fix)}</span>${f.findings.length>1?` (and ${f.findings.length-1} more)`:''}</span>${locked?'':`<div class="row"><input class="t" id="fitWhy" maxlength="300" placeholder="Keep it on purpose? Say why (e.g. a woven legging is the idea)" aria-label="Why this fabric is right"><button class="btn sm" type="button" data-fitkeep>Keep it</button></div>`}`;paintAsks(el,f,locked)}
$('#matDlg').addEventListener('submit',async e=>{const fm=e.target.closest('form.fitask');if(!fm)return;e.preventDefault();const A=await askMod(),b=fm.querySelector('button[type=submit]');
  const r=await FBN.run(b,()=>api(`/v1/lab/concepts/${CID}/materials/${fm.dataset.mid}/spec${fm.dataset.part?`?part=${encodeURIComponent(fm.dataset.part)}`:''}`,{method:'PUT',body:A.askBody(fm)}),{done:'Saved: the check reads it now.'}).catch(()=>null);
  if(r){MAT.on=r;matPaintOn();matChanged()}});
$('#matDlg').addEventListener('click',async e=>{const k=e.target.closest('[data-fitkeep]'),u=e.target.closest('[data-fitundo]');if(!k&&!u)return;
  const r=await FBN.run(k||u,()=>api(`/v1/lab/concepts/${CID}/fabric-accept`,k?{method:'PUT',body:{reason:$('#fitWhy').value}}:{method:'DELETE'}),{done:k?'Kept, with your reason on the checklist.':'Taken back: the check counts again.'}).catch(()=>null);
  if(r){MAT.on=r;matPaintOn();matChanged()}});
// each fabric in the library says, before it is added, whether it suits this style
async function fitBadges(){const style=MAT.on?.style;if(!style)return;const {fabricFit}=await fitMod();for(const b of $$('#matLib [data-madd]')){const m=MAT.lib.find(x=>x.id===b.dataset.madd);if(!m||m.kind!=='fabric')continue;
  const f=fabricFit({style,materials:[{kind:'fabric',role:'main',name:m.name,spec:m.spec||{}}]});if(f.verdict==='unknown')continue;const t=document.createElement('span');t.className='mok '+f.verdict;t.textContent=f.verdict==='good'?'✓ Suits this piece':(f.verdict==='wrong'?'✕ ':'! ')+f.findings[0].msg.replace(m.name,'this one');b.before(t);b.closest('.mc').dataset.rank={good:0,check:1,wrong:2}[f.verdict]}
  // the ones that suit come first
  const lib=$('#matLib');[...lib.querySelectorAll('.mc')].sort((x,y)=>(x.dataset.rank??1)-(y.dataset.rank??1)).forEach(el=>lib.append(el))}
async function matLoadLib(){const r=await api(`/v1/lab/materials?kind=${MAT.kind}&q=${encodeURIComponent(MAT.q)}`).catch(x=>{$('#matLib').innerHTML=`<span class="msg bad">${esc(x.message)}</span>`;return null});if(!r)return;
  MAT.lib=[...MAT.lib.filter(m=>m.kind!==MAT.kind||!r.materials.some(x=>x.id===m.id)),...r.materials];const locked=Boolean(D?.concept?.locked),on=new Set((MAT.on?.picks||[]).map(p=>p.id));
  const card=m=>{const s=m.spec||{},line=['footwear','plush','plastic'].includes(m.kind)?[s.category,s.thicknessMm?s.thicknessMm+' mm':'',s.finish,s.grade].filter(Boolean).join(' · '):m.kind==='fabric'?[s.weightGsm?s.weightGsm+' gsm':'',s.construction,s.composition].filter(Boolean).join(' · '):m.kind==='trim'?[s.size,s.material,s.finish].filter(Boolean).join(' · '):`${s.widthMm} × ${s.heightMm} mm · ${s.material||''}`;
    return`<div class="mc">${matThumb(m)}<div class="bd"><b>${esc(m.name)}</b><span class="note">${esc(line)}</span><span class="note">${esc(money(m.priceCents))} / ${esc(m.unit)}</span><button class="btn sm ${on.has(m.id)?'q':''}" type="button" data-madd="${m.id}" ${locked?'disabled':''}>${on.has(m.id)?'Add again':'Add to the garment'}</button></div></div>`};
  // fabrics for a piece whose style is known: ranked for it (src/lab-fabric-fit.js rankFabrics), best first, what does not suit it folded away
  const style=MAT.kind==='fabric'?MAT.on?.style:null,R=style?(await fitMod()).rankFabrics(style,r.materials):null;
  if(R&&R[0]?.fit?.tier){const piece=MAT.on?.styleLabel||'this piece',grp=(t,h)=>{const l=R.filter(m=>m.fit.tier===t);return l.length?`<h5 class="mgh">${esc(h)} <span>${l.length}</span></h5>`+l.map(m=>card(m).replace('<div class="bd">',`<div class="bd">${t==='check'?`<span class="mok check">! ${esc(m.fit.why)}</span>`:''}`)).join(''):''},no=R.filter(m=>m.fit.tier==='no');
    $('#matLib').innerHTML=grp('best','Best for '+piece)+grp('good','Also suits '+piece)+grp('check','Works with changes')+(no.length?`<button type="button" class="mgno" data-mgno aria-expanded="${MAT.showNo||Boolean(MAT.q)}">${MAT.showNo||MAT.q?'Hide':'Show'} ${no.length} that ${no.length===1?'does':'do'} not suit ${esc(piece)}</button>`+(MAT.showNo||MAT.q?no.map(m=>card(m).replace('<div class="bd">',`<div class="bd"><span class="mok wrong">✕ ${esc(m.fit.why)}</span>`)).join(''):''):'')}
  else $('#matLib').innerHTML=r.materials.length?r.materials.map(card).join(''):'<span class="note">Nothing in the library matches.</span>';
  if(R&&!R.length)$('#matLib').innerHTML='<span class="note">Nothing in the library matches.</span>';
  matPhotos($('#matLib'));matFaces($('#matLib'),MAT.lib);if(MAT.on)matPaintOn();if(!R?.[0]?.fit?.tier)fitBadges().catch(()=>{})}
$('#matLib').addEventListener('click',e=>{if(e.target.closest('[data-mgno]')){MAT.showNo=!MAT.showNo;matLoadLib()}});
$('#matBtn').onclick=()=>matOpen().catch(x=>toast(x.message));
document.addEventListener('click',e=>{if(e.target.closest('#fabMore'))matOpen().catch(x=>toast(x.message))});
// the graphic studio, opened from the flats panel: this same studio on a clear canvas, in a window over the piece; what is kept lands on the flat
let GS_VIEW='front';
let GS_EDIT=null; // a graphic on the flats being edited: its placement, to take the edited art back into
function graphicStudio(view,edit=null){GS_VIEW=view==='back'?'back':'front';GS_EDIT=edit?.art?edit:null;$('#gsFrame').src=GS_EDIT?`/lab/studio?art=${encodeURIComponent(GS_EDIT.art)}&pick=1&fork=1`:'/lab/studio?new=graphic&pick=1';$('#gsDlg').showModal()}
$('#gsClose').onclick=()=>{$('#gsDlg').close();$('#gsFrame').src='about:blank'};
async function graphicKept(id,name){$('#gsDlg').close();$('#gsFrame').src='about:blank';const f=FF();if(!f?.addGraphic){toast('It is in the graphics library. Add it to the flat from the panel.');return}
  if(f.view?.()!==GS_VIEW)f.setView?.(GS_VIEW);const ed=GS_EDIT;GS_EDIT=null;if(ed&&f.replaceGraphic&&await f.replaceGraphic(ed.pl,id,name)){toast(`${name||'The graphic'} is updated on the ${GS_VIEW}, in the same place.`);return}await f.addGraphic(id,name);toast(`${name||'The graphic'} is in the library and on the ${GS_VIEW}.`)}
$('#matDlg').addEventListener('click',async e=>{if(e.target.closest('[data-matclose]')||e.target===$('#matDlg')){$('#matDlg').close();return}
  const k=e.target.closest('[data-mk]');if(k){MAT.kind=k.dataset.mk;$$('#matKinds [data-mk]').forEach(b=>b.setAttribute('aria-pressed',String(b===k)));matLoadLib();return}
  const a=e.target.closest('[data-madd]');if(a){const m=MAT.lib.find(x=>x.id===a.dataset.madd),hasMain=(MAT.on?.picks||[]).some(p=>p.kind==='fabric'&&p.role==='main');
    const part=m&&['footwear','plush','plastic'].includes(m.kind)?mPartFor(m):'';const r=await FBN.run(a,()=>api(`/v1/lab/concepts/${CID}/materials`,{body:{material:a.dataset.madd,...(part?{part}:{role:m?.kind==='fabric'?(hasMain?'contrast':'main'):undefined})}}),{done:m?.kind==='fabric'?(hasMain?'Added as the contrast fabric.':'Added as the main fabric.'):'Added to the garment.'}).catch(()=>null);
    if(r){MAT.on=r;matPaintOn();matLoadLib();matChanged()}return}
  const d=e.target.closest('[data-mdel]');if(d){const row=d.closest('[data-mp]'),id=row.dataset.mp,pt=row.dataset.part;const r=await FBN.run(d,()=>api(`/v1/lab/concepts/${CID}/materials/${id}${pt?'?part='+encodeURIComponent(pt):''}`,{method:'DELETE'}),{done:'Taken off the garment.'}).catch(()=>null);if(r){MAT.on=r;matPaintOn();matLoadLib();matChanged()}}});
$('#matDlg').addEventListener('change',async e=>{const f=e.target.closest('[data-mf]');if(!f)return;const row=f.closest('[data-mp]'),k=f.dataset.mf;let v=f.value;if(k==='qty')v=Number(v);if(k==='colour'&&!v)return;
  try{MAT.on=await api(`/v1/lab/concepts/${CID}/materials/${row.dataset.mp}${row.dataset.part?'?part='+encodeURIComponent(row.dataset.part):''}`,{method:'PUT',body:{[k]:v}});matPaintOn();matChanged();toast('Saved on the garment.')}catch(x){toast(x.message)}});
let MQT=0;$('#matQ').addEventListener('input',()=>{clearTimeout(MQT);MQT=setTimeout(()=>{MAT.q=$('#matQ').value.trim();matLoadLib()},250)});
// the fabric panel in the AI tab and the checklist follow what the garment is made of
function matChanged(){if(typeof paintFabrics==='function'&&$('#fabSec'))paintFabrics().catch(()=>{});if(typeof loadReady==='function')setTimeout(loadReady,200);FF()?.clothChanged?.()} // the flats show the main fabric's surface: they read it again
if(CID&&!GMODE){$('#matBtn').classList.remove('hidden');if(QS.get('fabric'))setTimeout(()=>matOpen().catch(x=>toast(x.message)),1200)} // the checklist's fabric item opens the fabric window

// ---------- room for the drawing: the panel on the right folds away, Focus takes the whole screen (both kept for next time) ----------
const LAYOUT={panel:true,focus:false};try{const v=JSON.parse(localStorage.getItem('fb.design.layout')||'{}');if(typeof v.panel==='boolean')LAYOUT.panel=v.panel;if(typeof v.focus==='boolean')LAYOUT.focus=v.focus}catch{}
// Focus belongs to a drawing. With nothing open (the list of concepts, the sign-in notice) it is kept for next time but not put on: left on,
// the tool palette floated over the list with nothing to draw on, and the console's own header and menu were hidden there.
const studioOpen=()=>!$('#app').classList.contains('hidden');
function applyLayout({full=false}={}){$('#app').dataset.panel=LAYOUT.panel?'on':'off';if(LAYOUT.focus&&studioOpen())document.documentElement.dataset.focus='1';else delete document.documentElement.dataset.focus;
  $('#panelBtn').setAttribute('aria-pressed',String(LAYOUT.panel));$('#focusBtn').setAttribute('aria-pressed',String(LAYOUT.focus));FF()?.layout?.(LAYOUT);patLayout();
  try{localStorage.setItem('fb.design.layout',JSON.stringify(LAYOUT))}catch{}
  // full screen only on a press (browsers allow it only then), and left again with Focus
  if(full){const d=document,el=d.documentElement,on=d.fullscreenElement||d.webkitFullscreenElement;try{if(LAYOUT.focus&&!on)(el.requestFullscreen||el.webkitRequestFullscreen)?.call(el)?.catch?.(()=>{});else if(!LAYOUT.focus&&on)(d.exitFullscreen||d.webkitExitFullscreen)?.call(d)?.catch?.(()=>{})}catch{}}
  requestAnimationFrame(()=>{if(VMODE==='picture')fit()})}
// the pattern page in its frame folds its panel away with the rest (it is read again each time it loads)
function patLayout(){try{const r=$('#patFrame')?.contentDocument?.documentElement;if(r){r.dataset.panel=LAYOUT.panel?'on':'off';if(LAYOUT.focus)r.dataset.focus='1';else delete r.dataset.focus}}catch{}palRoom()}
// the room the tool palette takes on its edge, handed to the frames (the flats, a drawing, the pattern) as --pal-l/t/r/b, and the picture fitted round it
let PALZ={l:0,t:0,r:0,b:0};
function palRoom(){for(const f of ['#flatFrame','#patFrame']){try{const r=$(f)?.contentDocument?.documentElement;if(r)for(const [a,v] of Object.entries(PALZ))r.style.setProperty(`--pal-${a}`,v+'px')}catch{}}}
window.FBLAYOUT=z=>{PALZ=z;palRoom();if(VMODE==='picture'&&typeof FITTED!=='undefined'&&FITTED)requestAnimationFrame(()=>fit())};
$('#flatFrame')?.addEventListener('load',()=>setTimeout(palRoom,0));
$('#patFrame')?.addEventListener('load',patLayout);
$('#panelBtn').onclick=()=>{LAYOUT.panel=!LAYOUT.panel;applyLayout()};$('#focusBtn').onclick=()=>{LAYOUT.focus=!LAYOUT.focus;applyLayout({full:true})};
document.addEventListener('keydown',e=>{if(!studioOpen()||e.target.closest?.('input,textarea,select,[contenteditable]'))return;if(e.key==='\\'&&(e.metaKey||e.ctrlKey)&&!e.altKey){e.preventDefault();$('#panelBtn').click();return}if(e.metaKey||e.ctrlKey||e.altKey)return;if(false){}else if(e.key==='f'||e.key==='F'){e.preventDefault();$('#focusBtn').click()}});
applyLayout();
// the drawing is shown once it has loaded (and the page can come back from the browser's back-forward cache as it was left): the layout follows
{let was=studioOpen();new MutationObserver(()=>{if(studioOpen()!==was){was=studioOpen();applyLayout()}}).observe($('#app'),{attributes:true,attributeFilter:['class']});window.addEventListener('pageshow',e=>{if(e.persisted)applyLayout()})}

// ---------- tags and labels in the studio ----------
async function tagStart(){const t=TAGM.spec,k=Math.max(6,Math.min(24,1600/Math.max(t.widthMm,t.heightMm)));W=Math.round(t.widthMm*k);H=Math.round(t.heightMm*k);
  const fill=(TAGM.colours||[])[0]?.hex||'',T=await import('/lab/lab-tags.js'),img=await imgOf('data:image/svg+xml;charset=utf-8,'+encodeURIComponent(T.tagFaceSvg(t,{pxPerMm:k,fill,words:false}))),face=canvas(W,H);face.getContext('2d').drawImage(img,0,0,W,H);
  const dark=fill?(()=>{const n=parseInt(fill.slice(1),16);return((n>>16)*299+((n>>8)&255)*587+(n&255)*114)/1000<128})():/leather|rubber/.test(t.material||''),ink=dark?'#f3eee4':'#141416';
  LAYERS=[fresh('base',{name:'Clear background',raster:stamp(canvas(W,H)),x:W/2,y:H/2,dirty:true}),fresh('image',{name:'Tag face',raster:stamp(face),x:W/2,y:H/2,scale:1,dirty:true})];
  // its words, each its own type layer: change the font, the words, the size and the colour like any type
  let brand='';try{brand=FORC?(await api('/v1/lab/concepts/'+FORC)).concept?.clientName||'':(await api('/v1/lab/materials?kind=tag')).brand||''}catch{}
  const lines=T.brandWords((t.text||[]).slice(0,4),brand),fs=Math.max(12,Math.min(H*.26,W*.86/(Math.max(6,...lines.map(l=>l.length))*.62)));
  lines.forEach((line,i)=>LAYERS.push(fresh('text',{name:line.slice(0,30),x:W/2,y:H/2+(i-(lines.length-1)/2)*fs*1.3,text:line,font:'grotesk',size:Math.round(i?fs*.8:fs),bold:i===0,italic:false,track:Math.round(fs*.06),lead:1.1,align:'center',arc:0,color:ink,outline:0,outlineColor:'#ffffff'})));
  setTimeout(()=>{DIRTY=true;showSaved()},0)}
// the design is the tag's face: put on the tag (a starter tag a room cannot change is copied into the room's own library first)
async function linkTag(){if(!TAGM||!GID||TAGM.spec?.face===GID)return;
  if(TAGM.editable!==false&&!TAGM.builtin){TAGM=(await api(`/v1/lab/materials/${TAG}`,{method:'PUT',body:{spec:{face:GID}}})).material;return} // the starter set is everyone's: designing one makes your own copy
  const m=TAGM,r=await api('/v1/lab/materials',{body:{kind:'tag',name:`${m.name} (ours)`.slice(0,120),code:m.code,supplier:m.supplier,priceCents:m.priceCents,unit:m.unit,moq:m.moq,leadDays:m.leadDays,spec:{...m.spec,face:GID},colours:m.colours,notes:m.notes}});
  TAGM=r.material;TAG=TAGM.id;const u=new URL(location.href);u.searchParams.set('tag',TAG);u.searchParams.delete('art');history.replaceState(null,'',u);paintSub();toast('Starter tags are shared, so a copy with this design is in your own library now.')}
async function tagSaveAll(){if(!(await save()))throw new Error('It could not be saved')} // the save puts the picture on the tag
async function tagAdd(cid){await tagSaveAll();const orig=QS.get('tag');
  // designing a starter tag made a copy: on this garment the copy takes the starter's place
  if(orig&&orig!==TAG){const on=await api(`/v1/lab/concepts/${cid}/materials`).catch(()=>null);if(on?.picks?.some(p=>p.id===orig))await api(`/v1/lab/concepts/${cid}/materials/${orig}`,{method:'DELETE'}).catch(()=>{})}
  await api(`/v1/lab/concepts/${cid}/materials`,{body:{material:TAG}});return cid}
$('#tagAddBtn').onclick=async()=>{const b=$('#tagAddBtn');
  if(FORC){try{await FBN.run(b,()=>tagAdd(FORC),{done:'On the garment.'});toast('The label is on the garment, with this design. Back to it with ← Back to the garment.')}catch(x){toast(x.message)}return}
  $('#tagAddDlg').showModal();try{const r=await api('/v1/lab/concepts');const list=(r.concepts||[]).filter(c=>c.status!=='rejected');$('#tagAddSel').innerHTML=list.length?list.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}${c.status==='tech_pack'?' · tech pack':''}</option>`).join(''):'<option value="">No concepts yet</option>'}catch(x){$('#tagAddSel').innerHTML=`<option value="">${esc(x.message)}</option>`}};
$('#tagAddDlg').addEventListener('click',e=>{if(e.target.closest('[data-tagaddclose]')||e.target===$('#tagAddDlg'))$('#tagAddDlg').close()});
$('#tagAddGo').onclick=async()=>{const cid=$('#tagAddSel').value,b=$('#tagAddGo');if(!cid)return;try{await FBN.run(b,()=>tagAdd(cid),{done:'On the garment.'});$('#tagAddDlg').close();toast(`On "${$('#tagAddSel').selectedOptions[0]?.textContent||'the garment'}", with this design.`)}catch(x){toast(x.message)}};

boot();
