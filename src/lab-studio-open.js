// The Studio (/lab/studio), part 4 of 5: opening the design, real size, warp, tone on tone, colour separations, embroidery.
// The five parts are classic scripts that share one global scope, loaded in order by lab-studio.html (core, layers, io, open,
// workspace); a later part may use what an earlier one declared at any time, an earlier one may use a later one's only inside functions
// that run after the page has loaded. scripts/studio-split-check.mjs checks that.
// ---------- opening the design: the saved layers, or the concept's picture as the base ----------
async function loadLayer(o){
  const l={...fresh(o.kind),...o,adjust:{...fresh(o.kind).adjust,...(o.adjust||{})},tint:{...fresh(o.kind).tint,...(o.tint||{})},distress:{...fresh(o.kind).distress,...(o.distress||{})},finish:o.finish&&o.finish.id?{...o.finish,distress:{...(o.finish.distress||{})}}:null};
  if(isRaster(l)){let src=l.src||'';
    if(/^brand:/.test(src)){const b=brandOf(src)||{mark:src.slice(6)};l.raster=await markRaster(b.mark,b.colour,b.dot)}
    else{if(src.startsWith('/v1/lab/art/'))src=await urlOfBlob(await blobOf(src));const img=await imgOf(src),c=canvas(img.naturalWidth,img.naturalHeight);c.getContext('2d').drawImage(img,0,0);l.raster=stamp(c)}
    l._srcRid=l.raster._rid}
  return l;
}
// a concept started from scratch: white paper, and under it the product's own outline as a locked guide at real size (the flat's pieces for a
// garment, the plush's shape), so what is drawn on it is in inches from the start; anything else gets a dot grid
let GUIDE_PPI=0;
async function scratchPage(){
  W=1400;H=1400;const paper=canvas(W,H),px=paper.getContext('2d');px.fillStyle='#ffffff';px.fillRect(0,0,W,H);LAYERS=[{...fresh('base',{name:'Paper',raster:stamp(paper),x:W/2,y:H/2,dirty:true})}];
  const g=canvas(W,H),gx=g.getContext('2d');let named='Guide: dot grid';
  try{const P=await api(`/v1/lab/concepts/${CID}/pattern`),M=await import('/lab/lab-pattern.js'),pat=P.kind==='footwear'?(await import('/lab/lab-footwear.js')).footwearPattern(P.spec):P.kind==='plush'?M.plushPattern(P.spec):P.kind==='garment'&&P.flat?M.garmentPattern(P.flat):null;
    if(pat){const A=M.assembled(pat),front=A.pieces.filter(x=>x.piece.place.view!=='back'),b=M.boundsOf(front.flatMap(x=>x.pts)),k=Math.min(W*.8/(b.x1-b.x0),H*.82/(b.y1-b.y0)),ox=W/2-(b.x0+b.x1)/2*k,oy=H/2-(b.y0+b.y1)/2*k;
      gx.strokeStyle='#9c9c96';gx.lineWidth=2.2;gx.setLineDash([10,7]);for(const {pts} of front){gx.beginPath();pts.forEach(([x,y],i)=>i?gx.lineTo(ox+x*k,oy+y*k):gx.moveTo(ox+x*k,oy+y*k));gx.closePath();gx.stroke()}
      GUIDE_PPI=k;named=`Guide: ${pat.label.toLowerCase()} outline (hide it when you are done)`}}catch{}
  if(!GUIDE_PPI){gx.fillStyle='#c9c9c4';for(let y=50;y<H;y+=50)for(let x=50;x<W;x+=50){gx.beginPath();gx.arc(x,y,2,0,7);gx.fill()}}
  LAYERS.push({...fresh('paint',{name:named,raster:stamp(g),x:W/2,y:H/2,dirty:true}),locked:true,opacity:.9});
  SCRATCH_HINT=true}let SCRATCH_HINT=false;const LAYERS_DRAWN=()=>Boolean(D.doc&&Array.isArray(D.doc.layers)&&D.doc.layers.length); // the hint is shown once the Studio knows it opened on the Picture view (not over the flats or the pattern)
// the picker's "Start from scratch": what it is, and for clothes which style; a plush picks its shape on the Pattern view
const SC_STYLES={tops:[['tee','T-shirt'],['longsleeve','Long-sleeve tee'],['crewneck','Crewneck sweatshirt'],['hoodie','Pullover hoodie'],['ziphoodie','Zip hoodie'],['polo','Polo'],['shirt','Button-up shirt'],['shirtss','Short-sleeve shirt'],['tank','Tank']],outerwear:[['jacket','Zip jacket'],['coat','Coat'],['vest','Vest']],bottoms:[['pants','Pants'],['shorts','Shorts'],['skirt','Skirt'],['leggings','Leggings']],dresses:[['dress','Dress']],headwear:[['cap','Six-panel cap'],['bucket','Bucket hat'],['beanie','Beanie']],bags:[['tote','Tote bag']],plush:[['bear','Bear'],['bean','Bean character'],['bunny','Bunny'],['pillow','Pillow character']],footwear:[['sneaker','Court sneaker'],['runner','Runner'],['derby','Derby'],['loafer','Penny loafer'],['chelsea','Chelsea boot'],['boot','Lace-up boot']]};
function scStyles(){const c=$('#scCat').value,l=SC_STYLES[c]||[];$('#scStyle').innerHTML=l.map(([k,v])=>`<option value="${k}">${v}</option>`).join('');$('#scStyle').classList.toggle('hidden',!l.length)}
$('#scCat')?.addEventListener('change',scStyles);scStyles();
$('#scratchF')?.addEventListener('submit',async e=>{e.preventDefault();const b=$('#scGo'),cat=$('#scCat').value,st=$('#scStyle').value;b.disabled=true;b.textContent='Starting…';$('#scMsg').textContent='';
  try{const r=await api('/v1/lab/concepts/from-scratch',{body:{name:$('#scName').value,category:cat,...(cat==='plush'?{shape:st}:st?{style:st}:{})}});location.href=r.studio}catch(x){$('#scMsg').textContent=x.message;b.disabled=false;b.textContent='Start drawing'}});
async function boot(){
  if(/^[0-9a-f-]{36}$/i.test(CID)&&!GMODE)document.documentElement.dataset.fbtabs='off';
  if(!TOKEN()){$('#needSignin').classList.remove('hidden');return}
  if(GMODE){return bootGraphic()}
  if(!/^[0-9a-f-]{36}$/i.test(CID)){const KEEPQ=['view','template'].filter(k=>QS.get(k)).map(k=>`&${k}=${encodeURIComponent(QS.get(k))}`).join(''),box=$('#pickC');box.classList.remove('hidden');if(window.FBLabNav)box.querySelectorAll('nav.labnav').forEach(n=>window.FBLabNav.render(n));if(QS.get('start')==='scratch'){const f=$('#scratchF');f?.scrollIntoView({block:'center'});setTimeout(()=>$('#scName')?.focus(),200)} // New design → From scratch
    let list=[];try{list=(await api('/v1/lab/concepts?limit=120')).concepts}catch(x){$('#pickList').innerHTML=`<span class="note">${esc(x.message)}</span>`;return}
    const paint=()=>{const q=($('#pickQ').value||'').toLowerCase(),l=list.filter(c=>!q||`${c.name} ${c.categoryLabel||''} ${c.planName||''}`.toLowerCase().includes(q)).slice(0,60);$('#pickList').innerHTML=l.length?l.map(c=>`<a class="btn q" style="justify-content:space-between;white-space:normal;text-align:left;min-width:0;gap:10px" href="/lab/studio?concept=${c.id}${KEEPQ}" data-pick="${c.id}"><span style="min-width:0"><b>${esc(c.name)}</b> <span class="note">· ${esc(c.categoryLabel||c.category||'')}${c.planName?' · '+esc(c.planName):''}${c.status==='tech_pack'?' · has a tech pack':''}</span></span><span>→</span></a>`).join(''):'<span class="note">No concepts yet: <a href="/lab#plans">start a line plan</a> and make some.</span>'};
    paint();$('#pickQ').addEventListener('input',paint);return}
  if(false){$('#needSignin').classList.remove('hidden');$('#needSignin h1').textContent='Open a concept first';$('#needSignin p').textContent='The studio opens from a concept in the Design Lab: open one and press Open in the studio.';$('#needSignin a').href='/lab#board';$('#needSignin a').textContent='Open the concepts';return}
  try{D=await api(`/v1/lab/concepts/${CID}/studio`)}catch(x){const n=$('#needSignin');n.classList.remove('hidden');const no=/access to Design Lab|not turned on|Only Danielle/i.test(x.message);n.querySelector('h1').textContent=x.status===404?'That concept is not there any more':no?'The Design Lab is not turned on for you':'Sign in first';n.querySelector('p').textContent=x.status===404?'It may have been deleted.':x.message;return}
  $('#app').classList.remove('hidden');$('#back').href='/lab#board';watchPresence();
  // the piece's step bar takes the place of "← Concepts": back to its line plan, and every step of the piece one press away
  if(window.FBLabNav){$('#back').classList.add('hidden');$('#app').classList.add('steps');$('#pieceSteps').classList.remove('hidden');
    window.FBLabNav.steps($('#pieceSteps'),D.concept,{at:stepOfView(VMODE),onStep:(st)=>{if(st==='picture'){setVMode('picture');return true}if(st==='flats'){setVMode(VMODE==='back'?'back':'front');return true}if(st==='pattern'){setVMode('pattern');return true}if(st==='techpack'&&!D.concept.productUrl){setTimeout(()=>{if($('#readyPop').classList.contains('hidden'))$('#readyBtn').click()});return true}return false}})}
  // hard goods, toys, home objects and electronics are engineered as 3D parts (src/lab-engineer.html) rather than cut from a pattern
  if(ENGD()){$$('#viewSeg [data-v=front],#viewSeg [data-v=back]').forEach(x=>x.classList.add('hidden'));const b=$('#viewSeg [data-v=pattern]');b.textContent='Engineering';b.title='The product as 3D parts: exploded, with materials, tooling, checks and (for electronics) the board'}
  if(D.concept.locked){$('#apply').disabled=true;$('#apply').title='This concept is already a tech pack'}
  busy('Opening the design…');
  try{
    if(D.doc&&Array.isArray(D.doc.layers)&&D.doc.layers.length){W=D.doc.w;H=D.doc.h;LAYERS=[];window.ILL?.load(D.doc);for(const o of D.doc.layers){try{LAYERS.push(await loadLayer(o))}catch{toast('A layer could not be loaded and was left out.')}}SEL=D.doc.selected&&LAYERS.some(l=>l.id===D.doc.selected)?D.doc.selected:null;SAVED_AT=D.savedAt;
      // a picture drawn since (from the flats): the service took the old base off the layers, so the new picture goes underneath what was laid on it
      if(D.concept.hasImage&&!LAYERS.some(l=>l.kind==='base')){const src=await urlOfBlob(await blobOf(`/v1/lab/concepts/${CID}/image`)),img=await imgOf(src),c=canvas(W,H);c.getContext('2d').drawImage(img,0,0,W,H);const b={...fresh('base',{name:'Picture',raster:stamp(c),src,x:W/2,y:H/2})};b._srcRid=b.raster._rid;if(img.naturalWidth!==W||img.naturalHeight!==H)b.dirty=true;LAYERS.unshift(b)}}
    else if(D.concept.hasImage){const src=await urlOfBlob(await blobOf(`/v1/lab/concepts/${CID}/image`)),img=await imgOf(src);W=img.naturalWidth;H=img.naturalHeight;const c=canvas(W,H);c.getContext('2d').drawImage(img,0,0);
      LAYERS=[{...fresh('base',{name:'Picture',raster:stamp(c),src,x:W/2,y:H/2})}];LAYERS[0]._srcRid=LAYERS[0].raster._rid}
    else if(QS.get('scratch')==='1'||D.concept.scratch){await scratchPage()}
    else{W=1024;H=1024;const c=canvas(W,H),x=c.getContext('2d');x.fillStyle='#e9e9e6';x.fillRect(0,0,W,H);LAYERS=[{...fresh('base',{name:'Blank',raster:stamp(c),x:W/2,y:H/2,dirty:true})}]}
  }catch(x){toast(x.message)}finally{busy()}
  docC.width=W;docC.height=H;mask=canvas(W,H);maskX=mask.getContext('2d');initPpi();if(GUIDE_PPI){PPI=GUIDE_PPI;PPISET=true;PPINOTE='the guide\'s own size'}
  await loadFonts();setColor(CUR);paintSub();paintAdd();if(window.GEN&&!D.concept.locked)$('#tabMake').classList.remove('hidden');tab('layers');setTool('select');HIST=[snap()];HI=0;syncUndo();DIRTY=false;showSaved();paintLayers();requestAnimationFrame(fit); // the Make tab is on the picture too, as in the graphics studio
  if(QS.get('tryon')==='1')tryOpen().catch(()=>{});
  setInterval(()=>{if(DIRTY&&!DRAG&&!HOLD)save()},90000); // the safety net under autosave: a quiet save every minute and a half while there are changes
  (D.doc?.linked||[]).forEach(id=>LINKING.add(id));setVMode(QS.get('view')||(!D.concept.hasImage&&!LAYERS_DRAWN()&&!D.concept.scratch&&QS.get('scratch')!=='1'&&D.concept.hasFlats&&!ENGD()?'front':'picture')).then(()=>{if(SCRATCH_HINT&&VMODE==='picture')toast('A blank page: draw with the Pencil or the brush. The guide is locked; hide it in Layers when you are done.')}).catch(()=>{});loadFlatsRecord();loadReady();
  if(D.concept.recipe&&!D.concept.locked){$('#recipeBtn').href=`/lab/recipe?concept=${CID}`;$('#recipeBtn').classList.remove('hidden')}paintFlatPic(); // a piece from the recipe menu: change its recipe; no picture yet: draw it from the flats
}
// a graphic for the library: a clear canvas, or the graphic's picture as a layer over one, with the layers it was built from when it has them
async function bootGraphic(){
  ['#viewSeg','#readyWrap'].forEach(s=>$(s).classList.add('hidden')); // a graphic for the library has no flats and no tech pack
  try{if(TAG){const r=await api('/v1/lab/materials?kind=tag');TAGM=r.materials.find(m=>m.id===TAG)||null;if(!TAGM)throw Object.assign(new Error('That tag is not in the materials library'),{status:404});if(TAGM.spec?.face&&!GID)GID=TAGM.spec.face}
    D=await api('/v1/lab/library/studio'+(GID?'?art='+encodeURIComponent(GID):''))}catch(x){const n=$('#needSignin');n.classList.remove('hidden');n.querySelector('h1').textContent=x.status===404?'That graphic is not in the library':'Sign in first';n.querySelector('p').textContent=x.message;return}
  D.concept={name:D.graphic?.name||'New graphic',status:'graphic',locked:false,hasImage:Boolean(D.graphic?.hasImage),hasPlain:false,colors:[]};
  $('#app').classList.remove('hidden');$('#back').href='/lab/library';$('#back').textContent='← Graphics library';document.querySelector('.brand-suffix').textContent='/ Graphics studio';
  if(TAGM){D.concept.name=TAGM.name;$('#back').href=FORC?`/lab/studio?concept=${encodeURIComponent(FORC)}`:'/lab/materials#tags';$('#back').textContent=FORC?'← Back to the garment':'← Materials, trims & tags';document.querySelector('.brand-suffix').textContent='/ Tag and label studio';$('#tagAddBtn').classList.remove('hidden')}
  busy('Opening the graphic…');
  try{
    if(D.doc&&Array.isArray(D.doc.layers)&&D.doc.layers.length){W=D.doc.w;H=D.doc.h;LAYERS=[];window.ILL?.load(D.doc);for(const o of D.doc.layers){try{LAYERS.push(await loadLayer(o))}catch{toast('A layer could not be loaded and was left out.')}}SEL=D.doc.selected&&LAYERS.some(l=>l.id===D.doc.selected)?D.doc.selected:null}
    else if(TAGM)await tagStart();
    else{W=1024;H=1024;const clear=canvas(W,H);LAYERS=[{...fresh('base',{name:'Clear background',raster:stamp(clear),x:W/2,y:H/2,dirty:true})}];
      if(GID&&D.concept.hasImage){const src=await urlOfBlob(await blobOf('/v1/lab/art/'+GID)),img=await imgOf(src);W=Math.max(1024,img.naturalWidth);H=Math.max(1024,img.naturalHeight);const c2=canvas(W,H);LAYERS[0].raster=stamp(c2);LAYERS[0].x=W/2;LAYERS[0].y=H/2;
        const c=canvas(img.naturalWidth,img.naturalHeight);c.getContext('2d').drawImage(img,0,0);LAYERS.push(fresh('image',{name:D.concept.name.slice(0,40),raster:stamp(c),src:'/v1/lab/art/'+GID,_srcRid:c._rid,scale:1,x:W/2,y:H/2}));LAYERS[1]._srcRid=LAYERS[1].raster._rid}}
    LAYERS[0]._srcRid=LAYERS[0].raster._rid;
  }catch(x){toast(x.message)}finally{busy()}
  docC.width=W;docC.height=H;mask=canvas(W,H);maskX=mask.getContext('2d');initPpi();
  await loadFonts();setColor(CUR);paintSub();paintAdd();if(window.GEN&&!TAGM){$('#tabMake').classList.remove('hidden');tab('make')}else tab('layers');setTool('select');HIST=[snap()];HI=0;syncUndo();DIRTY=false;showSaved();paintLayers();requestAnimationFrame(fit);
  setInterval(()=>{if(DIRTY&&!DRAG&&GID)save()},90000);
}
// ---------- real size: the ruler sets how many pixels make an inch; every layer then has a size on the piece ----------
let PPI=0,PPISET=false,PPINOTE='',RULER=null;
const GARMENT_IN=[[/^footwear\b/,11.5],[/^plush\b/,10],[/^electronics\b/,6],[/^toys\b/,8],[/\b(cap|hat|visor|bucket)\b/,8],[/\bbeanie\b/,9],[/\b(bag|tote|backpack|pouch)\b/,15],[/\bsock/,4],[/\bshort/,22],[/\b(pant|trouser|jean|cargo|jogger|chino|denim|bottom)/,20],[/\b(jacket|coat|parka|overshirt|shacket|bomber|vest|gilet)/,31],[/\b(hoodie|hood|sweat|crew|fleece|knit|sweater|cardigan|quarter)/,30],[/\b(tank|singlet)\b/,20],[/\b(tee|t-shirt|shirt|polo|top|longsleeve|long sleeve)/,28]];
function garmentSpan(){ // how wide the piece is in the picture, in pixels: everything that is not the background
  const b=LAYERS.find(l=>l.kind==='base');if(!b||!b.raster)return 0;const k=Math.min(1,256/b.raster.width),w=Math.max(1,Math.round(b.raster.width*k)),h=Math.max(1,Math.round(b.raster.height*k)),c=canvas(w,h),x=c.getContext('2d',{willReadFrequently:true});x.drawImage(b.raster,0,0,w,h);
  const d=x.getImageData(0,0,w,h).data,px=(i,j)=>{const o=(j*w+i)*4;return[d[o],d[o+1],d[o+2],d[o+3]]},cs=[px(0,0),px(w-1,0),px(0,h-1),px(w-1,h-1)],bg=[0,1,2].map(i=>cs.reduce((s,c)=>s+c[i],0)/4);
  const cols=new Array(w).fill(0);for(let j=0;j<h;j++)for(let i=0;i<w;i++){const p=px(i,j);if(p[3]>20&&Math.abs(p[0]-bg[0])+Math.abs(p[1]-bg[1])+Math.abs(p[2]-bg[2])>36)cols[i]++}
  const min=Math.max(2,h*.02);let a=cols.findIndex(v=>v>=min),z=w-1-[...cols].reverse().findIndex(v=>v>=min);if(a<0||z<=a)return 0;return(z-a+1)/k}
function initPpi(){RULER=null;if(TAGM){PPI=W/(TAGM.spec.widthMm/25.4);PPISET=true;PPINOTE='the tag\'s own size';return}
  if(D.doc&&Number(D.doc.ppi)>1){PPI=Number(D.doc.ppi);PPISET=Boolean(D.doc.ppiSet);PPINOTE=PPISET?'set with the ruler':'estimated';return}
  PPISET=false;if(GMODE){PPI=W/14;PPINOTE='estimated: the canvas taken as 14 in across';return}
  const words=`${D.concept.category||''} ${D.concept.name||''}`.toLowerCase(),g=(GARMENT_IN.find(([re])=>re.test(words))||[0,26])[1],span=garmentSpan();
  if(span>W*.15){PPI=span/g;PPINOTE=`estimated: the piece taken as about ${g} in across`}else{PPI=W*.62/g;PPINOTE=`estimated: about ${g} in across`}}
const TIGHT=new Map();
function tight(l){ // the inked part of a layer, without its clear margin (type has room round it)
  const src=contentOf(l),key=sig(l);if(!src||!src.width||!src.height)return{x0:0,y0:0,x1:0,y1:0,w:0,h:0};if(TIGHT.has(key))return TIGHT.get(key);const k=Math.min(1,400/Math.max(src.width,src.height)),w=Math.max(1,Math.round(src.width*k)),h=Math.max(1,Math.round(src.height*k)),c=canvas(w,h),x=c.getContext('2d',{willReadFrequently:true});x.drawImage(src,0,0,w,h);
  const d=x.getImageData(0,0,w,h).data;let x0=w,y0=h,x1=-1,y1=-1;for(let j=0;j<h;j++)for(let i=0;i<w;i++)if(d[(j*w+i)*4+3]>16){if(i<x0)x0=i;if(i>x1)x1=i;if(j<y0)y0=j;if(j>y1)y1=j}
  const r=x1<0?{w:src.width,h:src.height}:{w:(x1-x0+1)/k,h:(y1-y0+1)/k};if(TIGHT.size>200)TIGHT.clear();TIGHT.set(key,r);return r}
const inchesOf=l=>{const t=tight(l);return{w:t.w*l.scale/(PPI||1),h:t.h*l.scale/(PPI||1)}};
const fin=v=>(Math.round(v*100)/100).toFixed(v<10?2:1).replace(/\.?0+$/,'');
function sizeHtml(l){const s=inchesOf(l),goods=['footwear','plush','toys','electronics','home'].includes(D.concept?.category),pl=goods?[]:D.placements||[];
  return `<div class="sec" id="sizeSec"><h4>Size on the piece</h4>
  <p class="note" style="margin:0" id="sizeRead"><b>${fin(s.w)} × ${fin(s.h)} in</b> · ${fin(s.w*2.54)} × ${fin(s.h*2.54)} cm<br><span>${PPISET?'Scale set with the ruler.':`Scale ${esc(PPINOTE)}. For a true size, use the ruler (U) across something you know.`}</span></p>
  <label class="f w"><span>Width</span><span class="row" style="flex-wrap:nowrap"><input class="t" type="number" min="0.25" max="40" step="0.05" data-win value="${fin(s.w)}" style="width:90px" aria-label="Width in inches"><span class="note">in</span></span></label>
  ${goods?`<p class="note" style="margin:0">A ${esc(D.concept.category==='footwear'?'shoe':D.concept.category==='plush'?'plush':'product')}'s graphics are sized here and drawn on the picture; where each sits is written on its tech pack.</p>`:''}<label class="f w${goods?' hidden':''}"><span>Goes on</span><select class="t" data-placement><option value="">Choose where it goes</option>${pl.map(p=>`<option value="${p.id}" ${l.placement===p.id?'selected':''}>${esc(p.label)} · ${p.w[0]}–${p.w[1]} in</option>`).join('')}</select></label>
  <div class="row"><button class="btn sm" type="button" data-act="check">Check the size and cost</button><button class="btn sm q" type="button" data-act="sep" title="The plates a printer burns screens from, one per ink, with Pantone codes">Colour separations…</button><button class="btn sm q" type="button" data-act="emb" title="The graphic digitized for an embroidery machine: satin and fill, underlay, trims; .dst and .exp">Embroidery file…</button></div>
  <p class="note" style="margin:4px 0 0">With a place chosen, saving puts this layer on the concept's flats at this size, for the decoration sheet and the tech pack.</p>
  <div id="chk" aria-live="polite"></div></div>
  <div class="sec"><h4>Warp to the piece</h4><div class="row" style="gap:4px">${[['arcup','Arc up'],['arcdown','Arc down'],['bulge','Bulge'],['wrap','Wrap round the body'],['flag','Wave']].map(([k,v])=>`<button class="btn sm q" type="button" data-warp="${k}">${v}</button>`).join('')}${l.warp?'<button class="btn sm q" type="button" data-warp="reset">Flat again</button>':''}</div>
  ${l.warp?rng2('warpk','Amount',-1,1,.05,+(l.warp.k??.5).toFixed(2)):''}<p class="note" style="margin:4px 0 0">Or use the warp tool (W) and drag its 16 points. Warp is how the mark looks on the piece; the size, the separations and the factory files stay flat.</p></div>`}
function paintSize(){const l=selected(),r=$('#sizeRead');if(!l||!r)return;const s=inchesOf(l);r.querySelector('b').textContent=`${fin(s.w)} × ${fin(s.h)} in`;r.childNodes[1].textContent=` · ${fin(s.w*2.54)} × ${fin(s.h*2.54)} cm`;const i=$('#pLayers [data-win]');if(i&&document.activeElement!==i)i.value=fin(s.w)}
const money=c=>'$'+(c/100).toFixed(2);
async function checkSize(l){const box=$('#chk');if(!box)return;const s=inchesOf(l),btn=$('#pLayers [data-act=check]');if(btn)btn.disabled=true;box.innerHTML='<p class="note">Checking…</p>';
  try{const r=await api('/v1/lab/studio/check',{body:{image:artPng(l),widthIn:s.w,heightIn:s.h,techniqueId:l.finish?.id||null,placement:l.placement||null,name:l.name}});
    const ic={fail:'✕',warn:'!',info:'✓'},col={fail:'#b3261e',warn:'#8a5a00',info:'#1e6b3a'};
    box.innerHTML=`<div style="display:grid;gap:6px;margin-top:6px">${r.findings.map(f=>`<p class="note" style="margin:0;color:${col[f.level]||'inherit'}" data-code="${esc(f.code)}"><b>${ic[f.level]||''}</b> ${esc(f.text)}</p>`).join('')||'<p class="note" style="margin:0">Nothing to change at this size.</p>'}
    <p class="note" style="margin:0" data-cost="${r.cost.perPieceCents}"><b>${money(r.cost.perPieceCents)} a piece</b> as ${esc(r.technique.name)} at ${r.cost.qty} pieces: ${money(r.cost.unitCents)} each and ${money(r.cost.setupCents)} setup. ${r.inks?`${r.inks} ${r.technique.base==='embroidery'?'thread':'ink'} colour${r.inks>1?'s':''}.`:''} An estimate: the factory's quote confirms it.</p></div>`}
  catch(x){box.innerHTML=`<p class="note" style="color:#b3261e">${esc(x.message)}</p>`;toast(x.message)}finally{if(btn)btn.disabled=false}}
function artPng(l){const a=artOf(l),k=Math.min(1,2400/Math.max(a.width,a.height));if(k>=1)return a.toDataURL('image/png');const c=canvas(a.width*k,a.height*k);c.getContext('2d').drawImage(a,0,0,c.width,c.height);return c.toDataURL('image/png')}
// the ruler: drag across something whose size is known (a chest width, a pocket), then say how long it is
function rulerDone(g){const len=Math.hypot(g.x1-g.x0,g.y1-g.y0);if(len<8){toast('Drag the ruler across something you know the size of.');RULER=null;return}RULER={x0:g.x0,y0:g.y0,x1:g.x1,y1:g.y1};
  const d=$('#rulerDlg');$('#rulerPx').textContent=Math.round(len);$('#rulerIn').value=PPI?fin(len/PPI):'';d.returnValue='';d.onclose=()=>{if(d.returnValue!=='yes'){draw();return}let v=Number($('#rulerIn').value);if($('#rulerUnit').value==='cm')v/=2.54;
    if(!(v>0&&v<200)){toast('Type how long the line is, in inches or centimetres.');return}PPI=len/v;PPISET=true;PPINOTE='set with the ruler';touch();paintLayers();draw();toast(`Scale set: ${fin(v)} in is ${Math.round(len)} pixels.`)};d.showModal();setTimeout(()=>$('#rulerIn').select(),20)}
// ---------- warp: a 4 × 4 grid of points over the layer (a Bézier patch), drawn through small triangles ----------
const WN=4,bern=(i,t)=>[(1-t)**3,3*t*(1-t)**2,3*t*t*(1-t),t**3][i];
const flatPts=()=>{const p=[];for(let j=0;j<WN;j++)for(let i=0;i<WN;i++)p.push([i/3,j/3]);return p};
function patch(pts,u,v){let x=0,y=0;for(let j=0;j<WN;j++){const bv=bern(j,v);for(let i=0;i<WN;i++){const b=bern(i,u)*bv,p=pts[j*WN+i];x+=b*p[0];y+=b*p[1]}}return[x,y]}
function presetPts(kind,k){const p=flatPts(),mid=[0,1,1,0],s=4/3;
  for(let j=0;j<WN;j++)for(let i=0;i<WN;i++){const q=p[j*WN+i];
    if(kind==='arcup')q[1]-=k*.3*s*mid[i];if(kind==='arcdown')q[1]+=k*.3*s*mid[i];
    if(kind==='bulge'){const t=(j/3-.5)*2;q[1]+=t*k*.22*s*mid[i];q[0]+=(i/3-.5)*k*.12*mid[j]}
    if(kind==='wrap'){q[0]=i/3+(i===1?-1:i===2?1:0)*k*.16;q[1]+=k*.08*s*mid[i]}
    if(kind==='flag')q[1]+=k*.14*[0,1,-1,0][i]}
  return p}
function setWarp(l,kind){if(l.locked){toast('That layer is locked.');return}if(kind==='reset'){delete l.warp}else{const k=l.warp&&l.warp.kind===kind?l.warp.k:.5;l.warp={kind,k,pts:presetPts(kind,k)}}commit();paintLayers();draw()}
function warpOf(src,l){const w0=src.width,h0=src.height,pts=l.warp.pts,xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]),mx=Math.max(0,-Math.min(...xs),Math.max(...xs)-1),my=Math.max(0,-Math.min(...ys),Math.max(...ys)-1);
  const px=Math.ceil(mx*w0)+2,py=Math.ceil(my*h0)+2,c=canvas(w0+px*2,h0+py*2),x=c.getContext('2d'),N=12,G=[];
  l._wg={px,py,w0,h0};
  for(let j=0;j<=N;j++)for(let i=0;i<=N;i++){const[a,b]=patch(pts,i/N,j/N);G.push([px+a*w0,py+b*h0])}
  const tri=(s0,s1,s2,d0,d1,d2)=>{const den=s0[0]*(s1[1]-s2[1])+s1[0]*(s2[1]-s0[1])+s2[0]*(s0[1]-s1[1]);if(!den)return;
    const a=(d0[0]*(s1[1]-s2[1])+d1[0]*(s2[1]-s0[1])+d2[0]*(s0[1]-s1[1]))/den,b=(d0[1]*(s1[1]-s2[1])+d1[1]*(s2[1]-s0[1])+d2[1]*(s0[1]-s1[1]))/den,
      cc=(d0[0]*(s2[0]-s1[0])+d1[0]*(s0[0]-s2[0])+d2[0]*(s1[0]-s0[0]))/den,d=(d0[1]*(s2[0]-s1[0])+d1[1]*(s0[0]-s2[0])+d2[1]*(s1[0]-s0[0]))/den,
      e=(d0[0]*(s1[0]*s2[1]-s2[0]*s1[1])+d1[0]*(s2[0]*s0[1]-s0[0]*s2[1])+d2[0]*(s0[0]*s1[1]-s1[0]*s0[1]))/den,f=(d0[1]*(s1[0]*s2[1]-s2[0]*s1[1])+d1[1]*(s2[0]*s0[1]-s0[0]*s2[1])+d2[1]*(s0[0]*s1[1]-s1[0]*s0[1]))/den;
    const cx=(d0[0]+d1[0]+d2[0])/3,cy=(d0[1]+d1[1]+d2[1])/3,g=p=>{const dx=p[0]-cx,dy=p[1]-cy,n=Math.hypot(dx,dy)||1;return[p[0]+dx/n*.6,p[1]+dy/n*.6]}; // a hair bigger, so no seams show
    x.save();x.beginPath();const q0=g(d0),q1=g(d1),q2=g(d2);x.moveTo(q0[0],q0[1]);x.lineTo(q1[0],q1[1]);x.lineTo(q2[0],q2[1]);x.closePath();x.clip();x.setTransform(a,b,cc,d,e,f);x.drawImage(src,0,0);x.restore()};
  for(let j=0;j<N;j++)for(let i=0;i<N;i++){const s=(ii,jj)=>[ii/N*w0,jj/N*h0],g=(ii,jj)=>G[jj*(N+1)+ii];
    tri(s(i,j),s(i+1,j),s(i+1,j+1),g(i,j),g(i+1,j),g(i+1,j+1));tri(s(i,j),s(i+1,j+1),s(i,j+1),g(i,j),g(i+1,j+1),g(i,j+1))}
  return c}
function fromLocal(l,lx,ly){const[w,h]=dims(l);let a=(lx-w/2)*l.scale,b=(ly-h/2)*l.scale;if(l.flip)a=-a;const c=Math.cos(l.rot),s=Math.sin(l.rot);return[l.x+a*c-b*s,l.y+a*s+b*c]}
const warpHandles=l=>{processed(l);const g=l._wg;return l.warp.pts.map(([u,v])=>fromLocal(l,g.px+u*g.w0,g.py+v*g.h0))};
function overlay(){
  if((RULER&&TOOL==='ruler')||(DRAG&&DRAG.mode==='ruler')){const r=DRAG&&DRAG.mode==='ruler'?DRAG:RULER;vx.save();vx.strokeStyle='#e03b2e';vx.lineWidth=2;vx.beginPath();vx.moveTo(sx(r.x0),sy(r.y0));vx.lineTo(sx(r.x1),sy(r.y1));vx.stroke();for(const[a,b]of[[r.x0,r.y0],[r.x1,r.y1]]){vx.beginPath();vx.arc(sx(a),sy(b),4,0,Math.PI*2);vx.fillStyle='#e03b2e';vx.fill()}
    const len=Math.hypot(r.x1-r.x0,r.y1-r.y0);if(PPI&&len>8){vx.font='600 12px system-ui';vx.fillStyle='#141416';const t=`${fin(len/PPI)} in`;vx.fillText(t,sx((r.x0+r.x1)/2)+8,sy((r.y0+r.y1)/2)-8)}vx.restore()}
  const l=selected();if(TOOL==='warp'&&l&&l.warp&&!fixed(l)&&l.visible){const h=warpHandles(l).map(([a,b])=>[sx(a),sy(b)]);vx.save();vx.strokeStyle='rgba(20,20,22,.55)';vx.lineWidth=1;
    for(let j=0;j<WN;j++){vx.beginPath();for(let i=0;i<WN;i++){const p=h[j*WN+i];i?vx.lineTo(p[0],p[1]):vx.moveTo(p[0],p[1])}vx.stroke()}
    for(let i=0;i<WN;i++){vx.beginPath();for(let j=0;j<WN;j++){const p=h[j*WN+i];j?vx.lineTo(p[0],p[1]):vx.moveTo(p[0],p[1])}vx.stroke()}
    for(const[a,b]of h){vx.beginPath();vx.arc(a,b,5,0,Math.PI*2);vx.fillStyle='#fff';vx.fill();vx.strokeStyle='#141416';vx.stroke()}vx.restore()}}
function warpDown(x,y,px,py){const l=selected();if(!l||fixed(l)||l.kind==='base'){toast('Choose a graphic, mark or type layer to warp.');return null}if(l.locked){toast('That layer is locked.');return null}
  if(!l.warp){l.warp={kind:'free',k:0,pts:flatPts()};l._pk=null;draw()}const h=warpHandles(l);let best=-1,bd=14;h.forEach(([a,b],i)=>{const d=Math.hypot(sx(a)-px,sy(b)-py);if(d<bd){bd=d;best=i}});
  if(best<0)return null;return{mode:'warp',l,i:best}}
function warpMove(g,x,y){const l=g.l;processed(l);const w=l._wg,[a,b]=toLocal(l,x,y);l.warp.pts[g.i]=[clamp((a-w.px)/w.w0,-1.5,2.5),clamp((b-w.py)/w.h0,-1.5,2.5)];l.warp.kind='free';g.moved=true}
// ---------- tone on tone: the fabric under the mark, and shades of it a step lighter and darker ----------
function fabricUnder(l){const c=canvas(W,H),x=c.getContext('2d',{willReadFrequently:true});if(!GMODE){x.fillStyle='#fff';x.fillRect(0,0,W,H)}for(const o of LAYERS){if(o===l)break;drawLayer(x,o)}
  const cs=corners(l),xs=cs.map(p=>p[0]),ys=cs.map(p=>p[1]),x0=clamp(Math.floor(Math.min(...xs)),0,W-1),y0=clamp(Math.floor(Math.min(...ys)),0,H-1),x1=clamp(Math.ceil(Math.max(...xs)),x0+1,W),y1=clamp(Math.ceil(Math.max(...ys)),y0+1,H);
  const d=x.getImageData(x0,y0,x1-x0,y1-y0).data,rs=[],gs=[],bs=[];for(let i=0;i<d.length;i+=16){if(d[i+3]<128)continue;rs.push(d[i]);gs.push(d[i+1]);bs.push(d[i+2])}
  if(!rs.length)return '#d9d6cf';const med=a=>a.sort((p,q)=>p-q)[a.length>>1];return '#'+[med(rs),med(gs),med(bs)].map(v=>v.toString(16).padStart(2,'0')).join('')}
const toOk=hex=>{const n=parseInt(hex.slice(1),16),f=v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4},r=f(n>>16&255),g=f(n>>8&255),b=f(n&255),l=Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b),m=Math.cbrt(.2119034982*r+.6806995451*g+.1073969566*b),s=Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b);
  return[.2104542553*l+.793617785*m-.0040720468*s,1.9779984951*l-2.428592205*m+.4505937099*s,.0259040371*l+.7827717662*m-.808675766*s]};
const fromOk=([L,A,B])=>{const l=(L+.3963377774*A+.2158037573*B)**3,m=(L-.1055613458*A-.0638541728*B)**3,s=(L-.0894841775*A-1.291485548*B)**3,g=v=>{v=v<=.0031308?12.92*v:1.055*v**(1/2.4)-.055;return clamp(Math.round(v*255),0,255)};
  return '#'+[g(4.0767416621*l-3.3077115913*m+.2309699292*s),g(-1.2684380046*l+2.6097574011*m-.3413193965*s),g(-.0041960863*l-.7034186147*m+1.707614701*s)].map(v=>v.toString(16).padStart(2,'0')).join('')};
function tonesOf(hex){const[L,A,B]=toOk(hex);return[[-.24,'Much darker'],[-.15,'Darker'],[-.08,'A shade darker'],[0,'Dyed to match'],[.08,'A shade lighter'],[.15,'Lighter'],[.24,'Much lighter']].map(([d,label])=>({label,hex:fromOk([clamp(L+d,.05,.98),A*(d<0?1.05:.92),B*(d<0?1.05:.92)]),d}))}
function loadPantone(){return window.FBPantone?Promise.resolve():new Promise(res=>{const s=document.createElement('script');s.src='/pantone-c.js';s.onload=res;s.onerror=res;document.head.appendChild(s)})}
async function tonalOpen(l){if(l.kind==='base'){toast('Choose a graphic, mark or type layer first.');return}await loadPantone();const base=fabricUnder(l),pc=h=>window.FBPantone?window.FBPantone.code(h):'';
  $('#tonalBase').innerHTML=`<span style="display:inline-block;width:18px;height:18px;border-radius:5px;background:${base};vertical-align:middle;border:1px solid rgba(20,20,22,.2)"></span> The fabric under "${esc(l.name)}" is ${base}${pc(base)?' · '+esc(pc(base)):''}`;
  $('#tonalGrid').innerHTML=tonesOf(base).map(t=>`<button type="button" class="tile" data-tone="${t.hex}" data-pantone="${esc(pc(t.hex))}"><span style="display:block;height:64px;border-radius:8px;background:${t.hex};border:1px solid rgba(20,20,22,.12)"></span><b style="font-size:12px">${t.label}</b><small class="note">${t.hex} · ${esc(pc(t.hex))}</small></button>`).join('');
  $('#tonalDlg').dataset.layer=l.id;$('#tonalDlg').showModal()}
$('#tonalDlg').addEventListener('click',e=>{const d=$('#tonalDlg');if(e.target.closest('[data-tonalclose]')||e.target===d){d.close();return}const b=e.target.closest('[data-tone]');if(!b)return;const l=layerOf(d.dataset.layer);if(!l)return;
  l.tint={color:b.dataset.tone,amount:1};l.tone={hex:b.dataset.tone,pantone:b.dataset.pantone||''};commit();paintLayers();draw();d.close();toast(`Recoloured tone on tone: ${b.dataset.pantone||b.dataset.tone}.`)});
// ---------- colour separations: the plates the printer burns, from the job file ----------
let SEPW=null; // the whole graphic, when the separations are of everything on the canvas (no one layer)
const sepSrc=l=>l?{image:artPng(l),widthIn:inchesOf(l).w,name:l.name,techniqueId:l.finish?.id||null,garment:GMODE?'':fabricUnder(l)}:{techniqueId:null,garment:'',...SEPW};
async function sepOpen(l,whole=null){SEPW=whole;if(!l&&!whole)return;const d=$('#sepDlg'),src=sepSrc(l),s={w:src.widthIn};d.showModal();$('#sepEmb').innerHTML='';$('#sepWho').textContent=`${src.name} · ${fin(s.w)} in wide${l?.finish?' · '+l.finish.name:''}`;$('#sepGrid').innerHTML='<p class="note">Separating the colours…</p>';$('#sepNote').textContent='';d.dataset.layer=l?l.id:'';
  try{const r=await api('/v1/lab/studio/separations',{body:src});
    SEP=r;$('#sepGrid').innerHTML=r.plates.map(p=>`<figure style="margin:0;display:grid;gap:4px" data-plate="${p.n}"><img alt="Plate ${p.n}" src="${p.image}" data-ink="${p.image}" data-film="${p.film||p.image}" style="width:100%;aspect-ratio:1/1;object-fit:contain;background:#fff;border:1px solid rgba(20,20,22,.12);border-radius:10px"><figcaption class="note"><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${p.hex};vertical-align:middle"></span> <b>${p.n}. ${esc(p.pantone)}</b> · ${Math.round(p.coverage*100)}% cover${p.angle!=null?` · dots at ${p.angle}°`:''}</figcaption></figure>`).join('')+(r.underbase?`<figure style="margin:0;display:grid;gap:4px"><img alt="Underbase" src="${r.underbase}" style="width:100%;aspect-ratio:1/1;object-fit:contain;background:#555;border-radius:10px"><figcaption class="note"><b>Underbase</b> · white under the colours on a dark garment</figcaption></figure>`:'');
    $('#sepNote').innerHTML=`${r.plates.length} plate${r.plates.length===1?'':'s'} for ${esc(r.job.technique?.name||r.job.technique||'the print')} at ${esc(r.job.size?.label||fin(s.w)+' in')}${r.job.tones?', the soft tones screened as halftone dots':''}.${r.job.print?.order?.length?`<br>On the press: ${esc(r.job.print.order.join(' → '))}`:''}${(r.job.warnings||[]).map(w=>`<br>! ${esc(typeof w==='string'?w:w.text||'')}`).join('')}`;sepView('ink')}
  catch(x){$('#sepGrid').innerHTML=`<p class="note" style="color:#b3261e">${esc(x.message)}</p>`;toast(x.message)}}
let SEP=null;function sepView(v){$$('#sepDlg [data-sepview]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.sepview===v)));$$('#sepGrid img[data-ink]').forEach(i=>{i.src=v==='film'?i.dataset.film:i.dataset.ink})}
$('#sepDlg').addEventListener('click',async e=>{const d=$('#sepDlg');if(e.target.closest('[data-sepclose]')||e.target===d){d.close();return}const sv=e.target.closest('[data-sepview]');if(sv){sepView(sv.dataset.sepview);return}
  if(e.target.closest('[data-sepdst]')){const l=layerOf(d.dataset.layer);if(!l){toast('Embroidery is made from one layer: choose it, then Separations in its menu.');return}d.close();embOpen(l);return}
  const vb=e.target.closest('[data-sepvec]');
  if(vb){const l=layerOf(d.dataset.layer);if(!l&&!SEPW)return;const b=vb;b.disabled=true;const src=sepSrc(l);
    try{{const r=await api('/v1/lab/studio/vector',{body:{image:src.image,widthIn:src.widthIn,name:src.name}});const url=URL.createObjectURL(new Blob([r.svg],{type:'image/svg+xml'}));download(url,fileBase()+'-'+(src.name||'graphic').toLowerCase().replace(/[^a-z0-9]+/g,'-')+'.svg');setTimeout(()=>URL.revokeObjectURL(url),4000);toast(`Traced: ${r.paths} shape${r.paths===1?'':'s'} in ${r.colours.length} ink${r.colours.length===1?'':'s'}.`)}}
    catch(x){toast(x.message)}finally{b.disabled=false}return}if(!e.target.closest('[data-sepzip]'))return;const l=layerOf(d.dataset.layer);if(!l&&!SEPW)return;const b=e.target.closest('[data-sepzip]');b.disabled=true;
  try{const r=await fetch('/v1/lab/studio/separations',{method:'POST',headers:{Authorization:'Bearer '+TOKEN(),'Content-Type':'application/json'},body:JSON.stringify({...sepSrc(l),zip:true})});
    if(!r.ok)throw new Error((await r.json().catch(()=>({}))).error||'The files could not be made');const url=URL.createObjectURL(await r.blob());download(url,fileBase()+'-separations.zip');setTimeout(()=>URL.revokeObjectURL(url),4000);toast('The separation files are downloading.')}
  catch(x){toast(x.message)}finally{b.disabled=false}});
// ---------- embroidery: the layer digitized for a machine (src/lab-digitize.js), with the settings a digitiser changes ----------
let EMB=null;
const embBody=()=>{const l=layerOf(EMB);return{image:artPng(l),name:l.name,widthIn:Number($('#embW').value)||inchesOf(l).w,garment:GMODE?'':fabricUnder(l),techniqueId:l.finish?.id||null,fillAngle:$('#embAngle').value,rowMm:$('#embRow').value,satinMaxMm:$('#embSatin').value,pullMm:$('#embPull').value,underlay:$('#embUnder').value==='1',...(window.EMBX?.body()||{})}};
async function embOpen(l){if(!l||l.kind==='base'){toast('Choose a graphic, mark or type layer first.');return}EMB=l.id;window.EMBX?.reset();$('#embWho').textContent=l.name;$('#embW').value=fin(Math.min(16,Math.max(.5,inchesOf(l).w)));$('#embDlg').showModal();embRun()}
async function embRun(){const l=layerOf(EMB);if(!l)return;$('#embWait').classList.remove('hidden');$('#embImg').style.opacity=.35;$('#embRun').disabled=true;
  try{const r=await api('/v1/lab/studio/embroidery',{body:embBody()}),st=r.stats;$('#embImg').src=r.preview;$('#embImg').style.opacity=1;$('#embWait').classList.add('hidden');$('#embDlg').dataset.stitches=r.stitches;
    $('#embStats').innerHTML=`<b>${st.stitches.toLocaleString('en-US')} stitches</b> · ${r.widthMm} × ${r.heightMm} mm · ${st.colours} thread${st.colours===1?'':'s'}, ${st.colourChanges} change${st.colourChanges===1?'':'s'} · ${st.trims} trims · about ${Math.max(1,Math.round(st.minutes))} min a piece · ${st.satin} satin, ${st.fill} fill`;
    $('#embSeq').innerHTML='<tr><td></td><td><b>Sequence</b></td><td class="n"><b>Stitches</b></td><td><b>Sewn as</b></td></tr>'+r.threads.map(t=>`<tr><td class="n">${t.n}</td><td><i style="background:${t.hex}"></i> ${esc(t.pantone||t.hex)}</td><td class="n">${t.stitches.toLocaleString('en-US')}</td><td>${[t.satin?`${t.satin} satin`:'',t.fill?`${t.fill} fill`:''].filter(Boolean).join(', ')}</td></tr>`).join('');
    $('#embWarn').innerHTML=[...(r.knockouts||[]).map(k=>`${k} is the garment colour, so it is not sewn.`),...(r.warnings||[])].map(w=>`<p class="note" style="margin:0;color:#8a4b00">! ${esc(w)}</p>`).join('');window.EMBX?.show(r)}
  catch(x){$('#embWait').textContent=x.message;toast(x.message)}finally{$('#embRun').disabled=false}}
$('#embRun').onclick=embRun;['#embAngle','#embRow','#embSatin','#embPull','#embUnder'].forEach(s=>$(s).addEventListener('change',embRun));$('#embW').addEventListener('change',embRun);
$('#embDlg').addEventListener('click',async e=>{const d=$('#embDlg');if(e.target.closest('[data-embclose]')||e.target===d){d.close();return}const b=e.target.closest('[data-embdl]');if(!b)return;const f=b.dataset.embdl;b.disabled=true;
  try{const r=await fetch('/v1/lab/studio/embroidery',{method:'POST',headers:{Authorization:'Bearer '+TOKEN(),'Content-Type':'application/json'},body:JSON.stringify({...embBody(),format:f})});if(!r.ok)throw new Error((await r.json().catch(()=>({}))).error||'The stitch file could not be made');
    const url=URL.createObjectURL(await r.blob()),nm=(layerOf(EMB)?.name||'graphic').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'graphic';download(url,fileBase()+'-'+nm+(f==='zip'?'-embroidery.zip':'.'+f));setTimeout(()=>URL.revokeObjectURL(url),4000);toast(f==='zip'?'The embroidery files are downloading: .dst, .exp, the sew-out and the sheet.':`The ${f==='dst'?'Tajima':'Melco'} file is downloading.`)}
  catch(x){toast(x.message)}finally{b.disabled=false}});
// the layers with a place on the piece go to the concept and its flats, at their size, when the design is saved
let SYNCED=null;
// what the flats have from the picture: the graphics placed on them and their size; the same key says nothing has changed since the last sync
const placedNow=()=>LAYERS.filter(l=>l.kind!=='base'&&l.placement&&l.visible).slice(0,8).map(l=>({l,s:inchesOf(l),key:sig(l)}));
const syncKey=(placed=placedNow())=>JSON.stringify(placed.map(x=>[x.l.id,x.l.fromFlat||'',x.l.name,x.l.placement,fin(x.s.w),fin(x.s.h),x.l.finish?.id||'',x.key]));
async function syncFlats({before}={}){
  if(before)await before(); // unsaved changes on the flats go first and their sizes come back to the layers, so nothing set on the flats is undone
  const placed=placedNow(),key=syncKey(placed);if(key===SYNCED)return false;
  const layers=placed.map(x=>({layer:x.l.id,...(x.l.fromFlat?{fromFlat:x.l.fromFlat}:{}),...(brandOf(x.l.src)&&plainMark(x.l)?{brand:brandOf(x.l.src)}:{}),name:x.l.name,widthIn:x.s.w,heightIn:x.s.h,placement:x.l.placement,techniqueId:x.l.finish?.id||null,...(x.l.art&&x.l.artSig===x.key?{art:x.l.art}:{image:artPng(x.l)})}));
  const r=await api(`/v1/lab/concepts/${CID}/studio/graphics`,{body:{layers}});
  for(const x of placed)if(r.arts[x.l.id]){x.l.art=r.arts[x.l.id];x.l.artSig=x.key}
  if(SYNCED!==null||placed.length)toast(placed.length?`On the concept${r.flats?' and its flats':''}: ${placed.length} graphic${placed.length>1?'s':''} at their size.`:'Nothing from the studio is on the flats now.');
  loadFlatsRecord();const was=SYNCED;SYNCED=key;return Boolean(r.flats)&&(placed.length>0||(was!==null&&was!=='[]'))} // true when the saved flats changed
// the size fields
pL.addEventListener('input',e=>{if(!e.target.matches('[data-win]'))return;const l=selected(),v=Number(e.target.value);if(!l||!(v>0)||l.locked)return;const t=tight(l);l.scale=clamp(v*PPI/(t.w||1),.02,40);touch();draw();paintFields()});
pL.addEventListener('change',e=>{const l=selected();if(!l)return;if(e.target.matches('[data-win]')){commit();paintSize()}if(e.target.matches('[data-placement]')){l.placement=e.target.value||undefined;commit();const c=$('#chk');if(c)c.innerHTML=''}});
pL.addEventListener('input',e=>{if(e.target.dataset.p!=='warpk')return;const l=selected();if(!l||!l.warp)return;const k=Number(e.target.value);l.warp.k=k;if(l.warp.kind!=='free')l.warp.pts=presetPts(l.warp.kind,k);draw()});
