// The Studio (/lab/studio), part 2 of 5: tools and their options, the layers panel, Add (marks, graphics, pictures, colours), AI.
// The five parts are one script, served joined in order (core, layers, io, open, workspace) as /lab/studio-main.js (src/server.js), so
// they share one scope exactly as the single inline script they were cut from did; they are separate files to be read and changed.
// ---------- tools and their options ----------
function setTool(t){TOOL=t;cursorPaint(null);window.TOOLS?.onTool(t);window.TOOLS?.flyClose();document.body.classList.toggle('typing',t==='text'&&(VMODE==='front'||VMODE==='back'));setTimeout(()=>window.paintDock?.(),0);setTimeout(()=>window.paintRailNames?.(),0);if(VMODE==='front'||VMODE==='back')FF()?.tool?.(t);$$('.rail [data-tool]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tool===t)));view.style.cursor=t==='hand'?'grab':t==='select'?'default':t==='text'?'text':'crosshair';paintOpts();draw()}
const pressHtml=()=>`<label class="chk" title="With an Apple Pencil, pressing harder makes the line wider"><input type="checkbox" data-press ${OPT.pressure?'checked':''}> Pencil pressure</label>`;
$('#opts').addEventListener('change',e=>{if(e.target.matches('[data-press]'))OPT.pressure=e.target.checked});
// Steady: the line trails the Pencil a little, so a shaky hand draws smooth (Procreate's StreamLine). QuickShape: hold the Pencil still at the
// end of a stroke and a rough line, circle, oval, triangle or box becomes a clean one. Lock: paint only where the layer is already painted.
function aidsHtml(){const tg=(k,t,tip)=>`<button class="btn sm ${OPT[k]?'':'q'}" type="button" data-otog="${k}" aria-pressed="${Boolean(OPT[k])}" title="${tip}">${t}</button>`;
  return `<label title="Draw mirrored or round the middle">Symmetry<select data-osym>${SYMS.map(([v,t])=>`<option value="${v}" ${OPT.sym===v?'selected':''}>${t}</option>`).join('')}</select></label><label title="Smooths the line as you draw">Steady<input type="range" data-o="stream" min="0" max="90" step="5" value="${OPT.stream}"><output>${OPT.stream}%</output></label>${tg('qshape','QuickShape','Hold the Pencil still at the end of a stroke to snap it to a clean shape')}${tg('lock','Lock','Paint only where this layer is already painted (lock transparency)')}`}
document.addEventListener('click',e=>{const b=e.target.closest('[data-otog]');if(!b)return;const k=b.dataset.otog;OPT[k]=!OPT[k];keepAids();paintOpts();if(k==='lock')toast(OPT.lock?'Lock is on: the brush paints only over what is already on the layer.':'Lock is off.')});
document.addEventListener('change',e=>{if(e.target.dataset?.o==='stream'||e.target.dataset?.o==='ftol')keepAids();if(e.target.matches?.('[data-osym]')){OPT.sym=e.target.value;keepAids();draw()}});
function paintOpts(){
  const o=$('#opts'),rg=(k,lab,min,max,step=1,unit='px')=>`<label>${lab}<input type="range" data-o="${k}" min="${min}" max="${max}" step="${step}" value="${OPT[k]}"><output>${OPT[k]}${unit}</output></label>`;
  const help={pen:'Click for a sharp point, drag for a curve. Click the first point to close the shape; Enter or Esc leaves it open. Shift keeps to 45°. Backspace takes the last point back.',node:'Drag a point or a handle. Alt-click a point to make it sharp or smooth, click the line to add a point, Delete takes the chosen point away. Alt while dragging a handle breaks it from its pair.',select:'Click a layer to choose it. Drag to move, a corner to resize, the green knob to turn (Shift: 15° steps). Arrows nudge.',hand:'Drag to move around. Ctrl and the wheel, or a pinch, zooms.',text:'Click where the type should go.',rect:'Drag to draw. Shift makes a square.',ellipse:'Drag to draw. Shift makes a circle.',line:'Drag to draw a line.',pick:'Click the picture to take its colour.',ruler:'Drag across something whose size you know, then say how long it is. Shift keeps the line straight.',warp:'Choose a layer, then drag its points to bend it to the piece. Presets are in the layer settings.'};
  // the production tools (src/lab-studio-ill.js) say what they do too
  Object.assign(help,{artboard:'Drag to make an artboard: a face of the box, a label, a hang tag. Drag one to move it; sizes, bleed and Lay out a box are in Document.',shapebuilder:'Drag across shapes to join the pieces you cross into one. Alt-click a piece to take it away. Choose two or more shapes first.',width:'Drag a point on a stroke to make it thicker or thinner there, for a line that tapers. Alt-click a point to put it back.',measure:'Drag from one point to another: the distance and angle show in mm or inches (Document sets which).',typepath:'Click a path to set type along it. Its words, size and where it starts are in the panel on the right.'});
  const tipsHtml=(list,key)=>`<span class="tips" role="radiogroup" aria-label="Tip">${list.map(t=>`<button type="button" role="radio" data-tip="${key}:${t.id}" aria-checked="${OPT[key]===t.id}" title="${esc(t.hint)}">${esc(t.label)}</button>`).join('')}</span>`,B=window.FBBrush;
  if(TOOL==='brush')o.innerHTML=swatchesHtml()+(B?tipsHtml(B.TIPS,'tip'):'')+rg('size','Size',1,400)+rg('flow','Opacity',.05,1,.05,'')+rg('soft','Softness',0,1,.05,'')+pressHtml()+aidsHtml()+(window.OUTL?OUTL.bar():'');
  else if(TOOL==='liquify')o.innerHTML=rg('size','Size',4,400)+'<span class="hint">Drag on a picture or painting layer to push it.</span>';
  else if(TOOL==='fill')o.innerHTML=swatchesHtml()+rg('ftol','Gap',5,120,1,'')+'<span class="hint">Tap inside lines. A bigger gap fills across softer edges.</span>';
  else if(TOOL==='eraser')o.innerHTML=(B?tipsHtml(B.ERASER_TIPS,'etip'):'')+rg('esize','Size',1,600)+rg('flow','Strength',.05,1,.05,'')+pressHtml()+`<label>Symmetry<select data-osym>${SYMS.map(([v,t])=>`<option value="${v}" ${OPT.sym===v?'selected':''}>${t}</option>`).join('')}</select></label>`+'<span class="hint">Rubs out the selected layer.</span>';
  else if(TOOL==='distress')o.innerHTML=rg('dsize','Size',4,600)+rg('flow','Strength',.05,1,.05,'')+'<span class="hint">Wears the selected layer away, like an old print. For an even wear across the layer, use Distress in its settings.</span>';
  else if(TOOL==='area')o.innerHTML=rg('area','Size',4,600)+'<span class="hint">Paint over what the AI should change. Hold Alt to rub out.</span><button class="btn sm" type="button" data-clearmask>Clear the area</button>';
  else o.innerHTML=`<span class="hint">${help[TOOL]||''}</span>`;
  window.TOOLS?.opts(o);
  // on the flats the same tools draw on the flat itself, saved with it and carried into the tech pack
  if(VMODE==='front'||VMODE==='back'){const fh={select:'Drag a graphic to move it, a corner to resize it, the green knob to turn it; its size and place, in inches, are in the panel on the right.',hand:'Drag to move around once zoomed in; pinch or Ctrl and the wheel zooms.',brush:'Draws on the flat. It is saved with the flat and goes into the tech pack. With the Pencil, fingers move and pinch the view.',eraser:'Rubs out what you drew on the flat; anywhere else it rubs out the sketch\'s own lines (put them back from the Design panel).',distress:'Wears away what was drawn on the flat.',text:'Type the words in the panel; tap or drag on the flat to move them. Place keeps them; another tool places them too.',rect:'Drag to draw a box on the flat.',ellipse:'Drag to draw a ring on the flat.',line:'Drag to draw a line on the flat.',area:'Drag a box on the flat over what the AI should redraw, then say what to change.'}[TOOL];
    o.querySelector('[data-clearmask]')?.remove();const h=o.querySelector('.hint');if(h&&fh)h.textContent=fh;else if(fh)o.insertAdjacentHTML('beforeend',`<span class="hint">${fh}</span>`)}
  window.PRO?.opts(o);
}
$('#opts').addEventListener('input',e=>{const k=e.target.dataset.o;if(!k)return;OPT[k]=Number(e.target.value);e.target.nextElementSibling.textContent=OPT[k]+(['flow','soft','ftol'].includes(k)?'':k==='stream'?'%':'px');paintDock();draw()});
$('#opts').addEventListener('click',e=>{const b=e.target.closest('[data-tip]');if(!b)return;const[k,v]=b.dataset.tip.split(':');OPT[k]=v;paintOpts();toast(b.title)});
// ---- the size dock: a big size slider beside the canvas while a brush, the eraser or distress is chosen (a Pencil reaches it without
// leaving the drawing), with quick sizes and the opacity; it follows the tool's own size (the eraser keeps its own)
const sizeKey=()=>TOOL==='eraser'?'esize':TOOL==='distress'?'dsize':'size';
function paintDock(){const d=$('#sizeDock');if(!d)return;const on=['brush','eraser','distress'].includes(TOOL);d.classList.toggle('hidden',!on);if(!on)return;if(typeof dockEdge==='function')dockEdge($('.studio')?.classList.contains('names-on'));const k=sizeKey(),mx=k==='size'?400:600,v=OPT[k];
  d.querySelector('[data-dk=size]').max=mx;d.querySelector('[data-dk=size]').value=v;d.querySelector('[data-dk=flow]').value=OPT.flow;
  const dot=d.querySelector('.dk-dot'),px=Math.max(3,Math.min(56,v*Z));dot.style.width=dot.style.height=px+'px';d.querySelector('.dk-v').textContent=v+'px';d.querySelector('.dk-o').textContent=Math.round(OPT.flow*100)+'%';
  d.querySelectorAll('[data-dpre]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.dpre)===v)))}
document.addEventListener('input',e=>{const k=e.target.dataset?.dk;if(!k)return;if(k==='size')OPT[sizeKey()]=Number(e.target.value);else OPT.flow=Number(e.target.value);paintDock();paintOpts();draw()});
document.addEventListener('click',e=>{const b=e.target.closest('[data-dpre]');if(!b)return;OPT[sizeKey()]=Number(b.dataset.dpre);paintDock();paintOpts();draw()});
$('#opts').addEventListener('click',e=>{if(e.target.closest('[data-clearmask]'))clearMask()});
$$('.rail [data-tool]').forEach(b=>b.onclick=()=>setTool(b.dataset.tool));
function setColor(c){CUR=c;$('#curColor').style.background=c;$('#curPicker').value=c;$$('.swr [data-sw]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.sw===c)))}
$('#curPicker').addEventListener('input',e=>setColor(e.target.value));$('#curPicker').addEventListener('change',e=>{recentColor(e.target.value);paintOpts()});
// the colours on the brush's bar: the last ones used, then black, white and the brand's; the rainbow one opens the full picker
const RECENT_KEY='fb.studio.colors';function recentColor(c){try{const r=[c,...JSON.parse(localStorage.getItem(RECENT_KEY)||'[]').filter(x=>x!==c)].slice(0,6);localStorage.setItem(RECENT_KEY,JSON.stringify(r))}catch{}}
function swatchesHtml(){let r=[];try{r=JSON.parse(localStorage.getItem(RECENT_KEY)||'[]')}catch{}const base=['#141416','#ffffff',...((D&&D.palette)||[]).map(x=>x.hex)],list=[...new Set([...r,...base].map(x=>String(x).toLowerCase()).filter(x=>/^#[0-9a-f]{6}$/.test(x)))].slice(0,10);
  return `<span class="swr" role="group" aria-label="Colour">${list.map(c=>`<button type="button" data-sw="${c}" style="background:${c}" aria-label="Colour ${c}" aria-pressed="${c===String(CUR).toLowerCase()}"></button>`).join('')}<label title="Any colour"><input type="color" data-swpick value="${esc(CUR)}" aria-label="Any colour"></label></span>`}
document.addEventListener('click',e=>{const b=e.target.closest('.swr [data-sw]');if(!b)return;setColor(b.dataset.sw);recentColor(b.dataset.sw)});
document.addEventListener('input',e=>{if(e.target.matches?.('[data-swpick]'))setColor(e.target.value)});document.addEventListener('change',e=>{if(e.target.matches?.('[data-swpick]')){recentColor(e.target.value);paintOpts()}});
function clearMask(){maskX.clearRect(0,0,W,H);MASKED=false;paintAiState();draw()}

// ---------- layers ----------
function addLayer(l,{silent=false,top=false}={}){
  if(!l.x&&!l.y){l.x=W/2;l.y=H/2}
  const i=SEL?LAYERS.findIndex(x=>x.id===SEL):-1;if(top||i<0)LAYERS.push(l);else LAYERS.splice(i+1,0,l);
  SEL=l.id;if(!silent)commit();paintPanels();draw();return l}
function removeLayer(l){if(l.kind==='base'&&LAYERS.filter(x=>x.kind==='base').length<2){toast('The base picture stays. Hide it instead if you need to.');return}LAYERS=LAYERS.filter(x=>x!==l);SEL=LAYERS.length?LAYERS[LAYERS.length-1].id:null;commit();paintPanels();draw()}
function moveLayer(l,d){const i=LAYERS.indexOf(l),j=clamp(i+d,0,LAYERS.length-1);if(i===j)return;LAYERS.splice(i,1);LAYERS.splice(j,0,l);commit();paintPanels();draw()}
function duplicate(l){const c={...copyL(l),id:uid(),name:l.name+' copy',_pc:null,_pk:null};if(isRaster(l)){c.raster=cloneCanvas(l.raster);if(l.raster._rid===l._srcRid)c._srcRid=c.raster._rid}if(c.kind==='base'){c.kind='image';c.locked=false}if(!fixed(c)){c.x+=20;c.y+=20}addLayer(c)}
// type and shapes become a picture layer (with their look baked in), so they can be painted on, rubbed out and distressed by hand
function rasterize(l){const c=processed(l),r=cloneCanvas(c),n={...fresh('image',{name:l.name}),x:l.x,y:l.y,scale:l.scale,rot:l.rot,flip:l.flip,opacity:l.opacity,blend:l.blend,raster:r,src:null,dirty:true};const i=LAYERS.indexOf(l);LAYERS[i]=n;SEL=n.id;commit();paintPanels();draw()}
const thumbOf=l=>{const k=sig(l)+(l.warp?JSON.stringify(l.warp):'');if(l._tk===k&&l._tu)return l._tu;const u=thumbOf0(l);l._tk=k;l._tu=u;return u}; // a layer's thumbnail is made again only when the layer changes
const thumbOf0=l=>{try{const c=processed(l),t=canvas(80,80),x=t.getContext('2d'),k=Math.min(80/c.width,80/c.height);x.drawImage(c,(80-c.width*k)/2,(80-c.height*k)/2,c.width*k,c.height*k);return t.toDataURL('image/png')}catch{return ''}};
const EYE='<svg viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',SHUT='<svg viewBox="0 0 24 24"><path d="M3 3l18 18M10.6 5.1A10 10 0 0112 5c6 0 10 7 10 7a17 17 0 01-3 3.7M6.6 6.6C3.8 8.4 2 12 2 12s4 7 10 7a9.5 9.5 0 004.4-1"/></svg>',LOCK='<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg>',OPEN='<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 017.5-2"/></svg>';

let TAB='layers';
function tab(t){TAB=t;$$('.tabs [data-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===t)));$('#pLayers').classList.toggle('hidden',t!=='layers');$('#pAdd').classList.toggle('hidden',t!=='add');$('#pAi').classList.toggle('hidden',t!=='ai');$('#pMake').classList.toggle('hidden',t!=='make');if(t==='ai'){paintAi()}if(t==='make')window.GEN?.paint();draw()}
$$('.tabs [data-tab]').forEach(b=>b.onclick=()=>tab(b.dataset.tab));

const rng2=(p,lab,min,max,step,v,unit='')=>`<label class="f"><span>${lab}</span><input type="range" data-p="${p}" min="${min}" max="${max}" step="${step}" value="${v}"><output>${v}${unit}</output></label>`;
function paintPanels(){paintLayers();window.PRO?.optsRefresh();if(TAB==='ai')paintAiState();if(TAB==='make'){clearTimeout(paintPanels.mk);paintPanels.mk=setTimeout(function go(){if(DRAG||GEST){paintPanels.mk=setTimeout(go,200);return}window.GEN?.inks()},200)}} // the Make tab's inks and print follow once the drawing settles
function paintLayers(){
  const p=$('#pLayers'),l=selected();
  const list=[...LAYERS].reverse().map(x=>`<div class="ly ${x.id===SEL?'on':''} ${x.visible?'':'off'}" data-ly="${x.id}" tabindex="0" role="button" aria-pressed="${x.id===SEL}"><button type="button" data-vis title="${x.visible?'Hide':'Show'}" aria-label="${x.visible?'Hide':'Show'} ${esc(x.name)}">${x.visible?EYE:SHUT}</button>${x.kind==='text'?`<span class="th">T</span>`:`<img alt="" src="${thumbOf(x)}">`}<span class="nm">${esc(x.name)}<small>${KIND[x.kind]}${x.blend!=='source-over'?' · '+esc(BLENDS.find(b=>b[0]===x.blend)?.[1].split(' (')[0]):''}${x.finish?' · '+esc(x.finish.name):x.distress.amount?' · distressed':''}</small></span><button type="button" data-lock title="${x.locked?'Unlock':'Lock'}" aria-label="${x.locked?'Unlock':'Lock'} ${esc(x.name)}">${x.locked?LOCK:OPEN}</button></div>`).join('');
  p.innerHTML=`<div class="sec"><h4>Layers · top first</h4><div class="layers">${list}</div></div>${garmentHtml()}${window.PRO?.multi()?PRO.multiHtml():l?fieldsHtml(l):'<p class="note">Choose a layer to change it. Add type, our marks, your own pictures and AI graphics from the Add and AI tabs.</p>'}`;
  window.PRO?.rows();
}
function fieldsHtml(l){
  const a=l.adjust,t=l.tint,d=l.distress,col=(p,v)=>`<input type="color" data-p="${p}" value="${v}">`;
  let kind='';
  if(l.kind==='text')kind=`<div class="sec"><h4>Type</h4><textarea class="t" data-p="text" aria-label="The words" maxlength="400">${esc(l.text)}</textarea>
    <label class="f w"><span>Font</span><span class="row" style="flex-wrap:nowrap">${window.TYPE?TYPE.button(l):`<select class="t" data-p="font" style="min-width:0">${fontOpts(l.font)}</select>`}<button class="btn sm q" type="button" data-act="addfont" title="Upload a TTF, OTF, WOFF or WOFF2: it is kept in the Lab and sets the same on every machine">Add a font…</button></span></label>
    <div class="row"><button class="btn sm ${l.bold?'':'q'}" type="button" data-toggle="bold">Bold</button><button class="btn sm ${l.italic?'':'q'}" type="button" data-toggle="italic">Italic</button>${['left','center','right'].map(x=>`<button class="btn sm ${l.align===x?'':'q'}" type="button" data-align="${x}">${x==='center'?'Centre':x[0].toUpperCase()+x.slice(1)}</button>`).join('')}</div>
    <label class="f w"><span>Case</span><select class="t" data-p="case">${[['','As typed'],['upper','ALL CAPS'],['title','Title Case'],['lower','lower case']].map(([v,t])=>`<option value="${v}" ${(l.case||'')===v?'selected':''}>${t}</option>`).join('')}</select></label>
    ${rng2('size','Size',8,600,1,l.size,'px')}${rng2('track','Spacing',-20,120,1,l.track)}${rng2('lead','Line height',.7,2.5,.05,l.lead)}${rng2('stretch','Stretch',50,200,1,l.stretch||100,'%')}${rng2('arc','Arch',-100,100,1,l.arc)}
    <label class="f w"><span>Shape</span><select class="t" data-p="env">${ENVS.map(([v,t])=>`<option value="${v}" ${(l.env||'none')===v?'selected':''}>${t}</option>`).join('')}</select></label>${l.env&&l.env!=='none'?rng2('envK','Amount',-100,100,1,l.envK??40):''}
    <label class="f w"><span>Colour</span>${col('color',l.color)}</label>${rng2('outline','Outline',0,40,1,l.outline,'px')}<label class="f w"><span>Outline colour</span>${col('outlineColor',l.outlineColor)}</label>
    ${rng2('outline2','Second outline',0,40,1,l.outline2||0,'px')}<label class="f w"><span>Second colour</span>${col('outline2Color',l.outline2Color||'#141416')}</label>
    <label class="f w"><span>Shadow</span><select class="t" data-p="shadowKind">${[['none','None'],['drop','Drop shadow'],['extrude','3D block']].map(([v,t])=>`<option value="${v}" ${(l.shadowKind||'none')===v?'selected':''}>${t}</option>`).join('')}</select></label>
    ${l.shadowKind&&l.shadowKind!=='none'?`${rng2('shadow','Distance',0,120,1,l.shadow||0,'px')}${rng2('shadowAngle','Angle',0,359,1,l.shadowAngle??135,'°')}<label class="f w"><span>Shadow colour</span>${col('shadowColor',l.shadowColor||'#141416')}</label>`:''}
    <p class="note">Every effect prints as solid ink: no blur or soft shadow.</p></div>`;
  if(l.kind==='shape'&&l.shape==='path'&&window.VEC)kind=VEC.fieldsHtml(l);
  else if(l.kind==='shape')kind=`<div class="sec"><h4>Shape</h4>${rng2('w','Width',4,Math.max(W,H)*2,1,l.w,'px')}${l.shape==='line'?'':rng2('h','Height',4,Math.max(W,H)*2,1,l.h,'px')}${l.shape==='rect'?rng2('radius','Corners',0,600,1,l.radius,'px'):''}
    ${l.shape==='line'?'':`<label class="f w"><span>Fill</span><span class="row"><input type="checkbox" data-p="fill" ${l.fill?'checked':''} aria-label="Fill">${col('fillColor',l.fillColor)}</span></label>`}
    <label class="f w"><span>${l.shape==='line'?'Line':'Outline'}</span><span class="row">${l.shape==='line'?'':`<input type="checkbox" data-p="stroke" ${l.stroke?'checked':''} aria-label="Outline">`}${col('strokeColor',l.strokeColor)}</span></label>${rng2('strokeW','Thickness',1,120,1,l.strokeW,'px')}${window.VEC?VEC.convertHtml():''}</div>`;
  const pos=fixed(l)?'':`<div class="sec"><h4>Place</h4>${window.PRO?PRO.geoHtml(l):''}${rng2('scale','Size',.02,6,.01,+l.scale.toFixed(2),'×')}${rng2('rotd','Turn',-180,180,1,Math.round(l.rot*180/Math.PI),'°')}<div class="row"><button class="btn sm q" type="button" data-act="centre">Centre</button><button class="btn sm q" type="button" data-act="flip">Flip</button><button class="btn sm q" type="button" data-act="fabric" title="Multiply, a little worn: the way a print sits in cloth">Sit it in the fabric</button></div></div>${l.kind==='base'?'':sizeHtml(l)}`;
  return `<div class="sec"><h4>${esc(KIND[l.kind])}</h4><input class="t" data-p="name" value="${esc(l.name)}" maxlength="60" aria-label="Layer name">
    ${rng2('opacity','Opacity',0,1,.01,l.opacity)}<label class="f w"><span>Blend</span><select class="t" data-p="blend">${BLENDS.map(([k,v])=>`<option value="${k}" ${k===l.blend?'selected':''}>${esc(v)}</option>`).join('')}</select></label></div>
  ${l.kind==='base'?'':techHtml(l)}
  ${kind}${window.ILL?ILL.fieldsHtml(l):''}${pos}
  <div class="sec"><h4>Colour</h4>${rng2('a.hue','Hue',-180,180,1,a.hue,'°')}${rng2('a.sat','Saturation',0,300,1,a.sat,'%')}${rng2('a.bright','Brightness',0,200,1,a.bright,'%')}${rng2('a.contrast','Contrast',0,200,1,a.contrast,'%')}
    <label class="f w"><span>Recolour</span>${col('t.color',t.color)}</label>${rng2('t.amount','Recolour amount',0,1,.01,t.amount)}
    <div class="row"><button class="btn sm q" type="button" data-act="lookreset">Reset the colour</button>${l.kind==='base'?'':'<button class="btn sm q" type="button" data-act="tonal" title="The colour of the fabric under it, a step lighter or darker, with Pantone codes">Tone on tone…</button>'}</div>${l.kind==='base'?'<p class="note">Hue turns the colour of the whole picture: on a grey studio background mostly the piece changes. For one part only, paint it in the AI tab and ask.</p>':''}</div>
  <div class="sec"><h4>Distress</h4><label class="f w"><span>Kind</span><select class="t" data-p="d.style">${[['worn','Worn print: specks and grain'],['cracked','Cracked ink'],['faded','Faded, washed out'],['spatter','Ink spatter'],['drag','Screen drag streaks'],['scratched','Scratched']].map(([k,v])=>`<option value="${k}" ${k===d.style?'selected':''}>${v}</option>`).join('')}</select></label>
    ${rng2('d.amount','Amount',0,1,.01,d.amount)}${rng2('d.size','Grain size',5,200,1,d.size)}<div class="row"><button class="btn sm q" type="button" data-act="seed">Another pattern</button></div></div>
  ${window.OUTL?OUTL.fields(l):''}${window.FX?FX.fields(l):''}
  <div class="sec"><h4>Layer</h4><div class="row"><button class="btn sm q" type="button" data-act="up">Move up</button><button class="btn sm q" type="button" data-act="down">Move down</button><button class="btn sm q" type="button" data-act="dup">Duplicate</button>${l.kind==='base'?'':'<button class="btn sm q" type="button" data-act="keep" title="Keep this artwork in the graphics library, for other pieces">Save to the library</button>'}${l.kind==='text'||l.kind==='shape'?'<button class="btn sm q" type="button" data-act="raster" title="So it can be painted on and rubbed out">Turn into pixels</button>':''}${l.kind==='base'&&D.concept.hasPlain?'<button class="btn sm q" type="button" data-act="plain">Use the plain picture</button>':''}<button class="btn sm q" type="button" data-act="del">Delete</button></div></div>`;
}
const TECH_KINDS=[['embroidery','Embroidery'],['print','Print'],['heat_transfer','Heat transfer'],['patch','Patches and appliqué'],['other','Other ways'],['distress','Distressing and wash']];
const techOpts=v=>`<option value="">None</option>${TECH_KINDS.map(([k,lab])=>{const t=(D.techniques||[]).filter(x=>x.kind===k);return t.length?`<optgroup label="${lab}">${t.map(x=>`<option value="${x.id}" ${x.id===v?'selected':''}>${esc(x.name)}</option>`).join('')}</optgroup>`:''}).join('')}`;
// "Made as": every way the mark can be made, drawn on the layer itself as small previews, grouped by kind; the library's recipes (src/lab-finish.js) do the drawing
let TKIND='',TTH=new Map(),MADE={color:'#d9d6cf',cloth:'jersey'};
function techThumb(l,t){const src=contentOf(l),key=techKey(l,t);if(TTH.has(key))return TTH.get(key);
  const TW=132,TH=76,k=Math.min(TW*.9/src.width,TH*.84/src.height),w=Math.max(2,Math.round(src.width*k)),h=Math.max(2,Math.round(src.height*k)),g=canvas(w,h);g.getContext('2d').drawImage(src,0,0,w,h);
  let out;try{const f=t.finish||{};let e=window.FBFinish.effect(g,f,.45,1);if(f.distress&&f.distress.amount>0){const c2=canvas(w,h);c2.getContext('2d').drawImage(e,0,0);window.FBFinish.distress(c2,f.distress,1);e=c2}
    const tile=canvas(TW,TH),x=tile.getContext('2d'),fk=TW+'x'+TH+MADE.color+MADE.cloth;if(techThumb.fk!==fk){techThumb.fk=fk;techThumb.fab=window.FBFinish.fabric(TW,TH,MADE.color,MADE.cloth,3)}x.drawImage(techThumb.fab,0,0);x.globalAlpha=f.opacity??1;x.globalCompositeOperation=f.blend||'source-over';const sh=window.FBFinish.shadow(f,.3);if(sh){x.shadowColor=sh.color;x.shadowBlur=sh.blur;x.shadowOffsetX=sh.dx;x.shadowOffsetY=sh.dy}x.drawImage(e,(TW-w)/2,(TH-h)/2);out=tile.toDataURL('image/png')}catch{out=''}
  if(TTH.size>600)TTH.clear();TTH.set(key,out);return out}
const TBLANK='data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
function techKey(l,t){return l.id+'|'+t.id+'|'+(isRaster(l)?(l.raster&&l.raster._rid):[l.text,l.font,l.size,l.color,l.shape,l.w,l.h,l.fillColor].join('|'))+'|'+JSON.stringify(t.finish)}
const techThumbNow=(l,t)=>TTH.get(techKey(l,t))||'';
// the previews still to draw, one at a time between frames, and never while something is being drawn or dragged
let TTQ=0;function techThumbsSoon(){cancelAnimationFrame(TTQ);const step=()=>{TTQ=0;if(DRAG||GEST){TTQ=requestAnimationFrame(()=>setTimeout(step,120));return}
  const l=selected(),img=l&&[...document.querySelectorAll('#pLayers img[data-tth]')].find(i=>i.src===TBLANK||i.src.endsWith(TBLANK));if(!img)return;const t=(D.techniques||[]).find(x=>x.id===img.dataset.tth);if(!t){img.removeAttribute('data-tth');return}
  const t0=performance.now();img.src=techThumb(l,t)||TBLANK;if(img.src===TBLANK)img.removeAttribute('data-tth');TTQ=requestAnimationFrame(()=>setTimeout(step,Math.min(60,performance.now()-t0)))};TTQ=requestAnimationFrame(()=>setTimeout(step,30))}
function techHtml(l){techThumbsSoon();const f=l.finish,kind=TKIND||(f&&(D.techniques||[]).find(t=>t.id===f.id)?.kind)||'embroidery',list=(D.techniques||[]).filter(t=>t.kind===kind);
  return `<div class="sec"><h4>Made as</h4><p class="note" style="margin:0 0 4px">How this mark is made on the piece. Pick a way below: it is drawn on the layer straight away. Embroidery, prints, transfers, patches, knit, laser, metal and stones, each in its variants; the <a href="/lab/library#techniques" target="_blank" rel="noopener">technique library</a> has their factory notes.</p>
  <div class="row" style="gap:4px">${TECH_KINDS.map(([k,lab])=>`<button type="button" class="btn sm ${kind===k?'':'q'}" data-tkind="${k}" aria-pressed="${kind===k}">${lab}</button>`).join('')}</div>
  <div class="tiles" style="grid-template-columns:repeat(2,minmax(0,1fr));margin-top:6px">${list.map(t=>`<button type="button" class="tile" data-tapply="${t.id}" title="${esc(t.summary)}" style="${f&&f.id===t.id?'border-color:var(--ink);background:#fff':''}"><img alt="" src="${techThumbNow(l,t)||TBLANK}" data-tth="${t.id}" width="132" height="76" style="border-radius:8px;width:100%;height:auto;background:#eeede9">${esc(t.name)}</button>`).join('')||'<span class="note">None of this kind yet.</span>'}</div>
  <label class="f w" style="margin-top:8px"><span>Or pick by name</span><select class="t" data-tech>${techOpts(f&&f.id)}</select></label>
  <div class="row" style="margin-top:8px"><button class="btn sm q" type="button" data-act="madeall">See it made every way</button>${f?`<button class="btn sm q" type="button" data-tapply="">Plain (no technique)</button>`:''}</div>
  ${f?`<p class="note" style="margin:6px 0 0"><b>${esc(f.name)}</b></p>${f.effect!=='none'?rng2('fin.strength','Strength',0,1,.05,f.strength):''}${rng2('fin.raise','Raised',0,12,.5,f.raise)}${['stitch','foil','film','rubber','silicone','metallic','knit'].includes(f.effect)?rng2('fin.angle','Direction',-180,180,5,f.angle,'°'):''}
  <div class="row"><button class="btn sm go" type="button" data-act="real" ${D.ai.connected?'':'disabled'}>Make it real with AI</button></div><p class="note">Drawn here as a quick look. Make it real asks the image model for the real ${esc(f.name.toLowerCase())} on this fabric, in this layer's area only, using the technique's words and reference photos.</p>`:''}</div>`}
// every way at once, on a piece of fabric: the technique library's swatch, with this layer's artwork, for each technique
function madeWall(l){const art=artOf(l),box=$('#madeGrid');box.innerHTML='';const cur=l.finish&&l.finish.id;
  for(const [k,lab] of TECH_KINDS){const list=(D.techniques||[]).filter(t=>t.kind===k);if(!list.length)continue;const h=document.createElement('h4');h.textContent=lab;h.style.cssText='grid-column:1/-1;margin:8px 0 0;font-size:13px';box.appendChild(h);
    for(const t of list){const card=document.createElement('button');card.type='button';card.className='tile';card.dataset.madeapply=t.id;card.title=t.summary||'';if(cur===t.id)card.style.cssText='border-color:var(--ink);background:#fff';
      const c=window.FBFinish.swatch(art,t.finish,{w:260,h:200,color:MADE.color,cloth:MADE.cloth,fill:.6,seed:5});c.style.cssText='width:100%;height:auto;border-radius:8px';card.appendChild(c);const sp=document.createElement('span');sp.textContent=t.name;card.appendChild(sp);box.appendChild(card)}}}
function madeOpen(){const l=selected();if(!l||l.kind==='base'){toast('Choose a graphic, mark or type layer first.');return}$('#madeDlg').showModal();$('#madeCol').value=MADE.color;$('#madeCloth').value=MADE.cloth;$('#madeWho').textContent=l.name;madeWall(l)}
$('#madeDlg').addEventListener('click',e=>{if(e.target.closest('[data-madeclose]')||e.target===$('#madeDlg')){$('#madeDlg').close();return}const a=e.target.closest('[data-madeapply]');if(a){const l=selected();if(l){applyTech(l,a.dataset.madeapply);commit();paintLayers();draw();toast(`"${l.name}" is made as ${(D.techniques||[]).find(t=>t.id===a.dataset.madeapply)?.name||'that'}.`)}$('#madeDlg').close()}});
$('#madeDlg').addEventListener('change',e=>{if(e.target.id==='madeCol')MADE.color=e.target.value;if(e.target.id==='madeCloth')MADE.cloth=e.target.value;TTH.clear();const l=selected();if(l)madeWall(l)});
function applyTech(l,id){
  const t=(D.techniques||[]).find(x=>x.id===id);
  if(!t){l.finish=null;l.blend='source-over';l.opacity=1;l.distress={...l.distress,amount:0};l.adjust.sat=100;return}
  const f=t.finish||{};l.finish={id:t.id,name:t.name,...f,distress:{...(f.distress||{})}};l.blend=f.blend||'source-over';l.opacity=f.opacity??1;l.adjust.sat=f.sat??100;
  l.distress=f.distress&&f.distress.amount>0?{...l.distress,style:f.distress.style,amount:f.distress.amount,size:f.distress.size}:{...l.distress,amount:0};
}
// the layer alone, as a soft-edged area the size of the picture, for the AI to work inside
function areaOf(l){const c=canvas(W,H),x=c.getContext('2d');const p=processed(l);x.save();place(x,l);x.drawImage(p,-p.width/2,-p.height/2);x.restore();
  const m=canvas(W,H),mx=m.getContext('2d'),pad=Math.max(4,Math.round(W/160));mx.filter=`blur(${pad}px)`;for(let i=0;i<3;i++)mx.drawImage(c,0,0);mx.filter='none';mx.globalCompositeOperation='source-in';mx.fillStyle='#e03b2e';mx.fillRect(0,0,W,H);return m}
// the artwork of a layer for the library: its colour, without wear or a technique
function artOf(l){const src=contentOf(l);if(!src||!src.width||!src.height)return canvas(1,1); /* nothing drawn yet: an empty picture, not an error mid-save */const c=canvas(src.width,src.height),x=c.getContext('2d');if(!plainLook(l))x.filter=`hue-rotate(${l.adjust.hue}deg) saturate(${l.adjust.sat}%) brightness(${l.adjust.bright}%) contrast(${l.adjust.contrast}%)`;x.drawImage(src,0,0);x.filter='none';if(l.tint.amount>0){x.globalCompositeOperation='source-atop';x.globalAlpha=l.tint.amount;x.fillStyle=l.tint.color;x.fillRect(0,0,c.width,c.height)}return c}
async function keepInLibrary(l){try{const r=await api('/v1/lab/library/graphics/upload',{body:{image:artOf(l).toDataURL('image/png'),name:l.name,source:'studio',techniqueId:l.finish?l.finish.id:null}});toast(`"${l.name}" is in the graphics library now.`);LIB=null;if(TAB==='add')paintLib()}catch(x){toast(x.message)}}
async function makeReal(l){
  const btn=$('#pLayers [data-act=real]');if(btn)btn.disabled=true;busy(`The AI is making it real ${l.finish.name.toLowerCase()}. About a minute…`);
  try{compose();const area=areaOf(l),mk=canvas(W,H),mx=mk.getContext('2d');mx.fillStyle='#000';mx.fillRect(0,0,W,H);mx.globalCompositeOperation='destination-out';mx.drawImage(area,0,0);
    const r=await api(AI_URL(),{body:{mode:'real',techniqueId:l.finish.id,image:docC.toDataURL('image/png'),mask:mk.toDataURL('image/png')}});
    const img=await imgOf(r.image),c=canvas(W,H),x=c.getContext('2d');x.drawImage(img,0,0,W,H);x.globalCompositeOperation='destination-in';x.drawImage(area,0,0);
    addLayer(fresh('image',{name:`Real · ${l.finish.name} · ${l.name}`.slice(0,60),raster:stamp(c),src:null,dirty:true,x:W/2,y:H/2}),{top:true});D.ai.left=r.left;
    toast(`Done: the real ${l.finish.name.toLowerCase()} is the top layer. Hide it to compare.`)}catch(x){toast(x.message)}finally{busy();if(btn)btn.disabled=false}}
// the moving parts of the panel follow a drag without the whole panel being drawn again
function paintFields(){const l=selected();if(!l)return;for(const[k,v]of[['scale',+l.scale.toFixed(2)],['rotd',Math.round(l.rot*180/Math.PI)],['w',l.w],['h',l.h]]){const i=$(`#pLayers [data-p="${k}"]`);if(i&&document.activeElement!==i){i.value=v;if(i.nextElementSibling)i.nextElementSibling.textContent=v+(k==='scale'?'×':k==='rotd'?'°':'px')}}paintSize()}
function setProp(l,p,v){
  if(p==='warpk')return;if(p==='env'&&v!=='none'&&!l.envK)l.envK=40;
  if(p.startsWith('fin.')){if(l.finish)l.finish[p.slice(4)]=Number(v);return}
  if(p.startsWith('a.'))l.adjust[p.slice(2)]=Number(v);else if(p.startsWith('t.'))l.tint[p.slice(2)]=p==='t.color'?v:Number(v);else if(p.startsWith('d.'))l.distress[p.slice(2)]=p==='d.style'?v:Number(v);
  else if(p==='rotd')l.rot=Number(v)*Math.PI/180;else if(['name','text','font','blend','color','outlineColor','fillColor','strokeColor','case','shadowKind','outline2Color','shadowColor','env'].includes(p))l[p]=v;else if(['fill','stroke'].includes(p))l[p]=Boolean(v);else l[p]=Number(v);
}
const pL=$('#pLayers');
pL.addEventListener('input',e=>{const p=e.target.dataset.p,l=selected();if(!p||!l)return;if(e.target.type==='range')SLIDE={l,until:performance.now()+150};setProp(l,p,e.target.type==='checkbox'?e.target.checked:e.target.value);if(e.target.type==='range'&&e.target.nextElementSibling)e.target.nextElementSibling.textContent=e.target.value+({opacity:'',scale:'×',rotd:'°','a.hue':'°','a.sat':'%','a.bright':'%','a.contrast':'%',size:'px',w:'px',h:'px',radius:'px',strokeW:'px',outline:'px'}[p]??'');touch();draw()});
pL.addEventListener('change',e=>{if(e.target.matches('[data-tech]')){const l=selected();if(l){applyTech(l,e.target.value);commit();paintLayers();draw()}return}if(!e.target.dataset.p)return;commit();if(['name','blend','d.amount','text'].includes(e.target.dataset.p)||e.target.tagName==='SELECT'||e.target.type==='checkbox')paintLayers()});
pL.addEventListener('click',e=>{
  const row=e.target.closest('[data-ly]');
  if(row){const l=layerOf(row.dataset.ly);if(e.target.closest('[data-vis]')){l.visible=!l.visible;commit()}else if(e.target.closest('[data-lock]')){l.locked=!l.locked;commit()}else if(e.shiftKey&&window.PRO)PRO.toggle(l.id);else SEL=l.id;paintPanels();draw();return}
  const l=selected();if(!l)return;const tg=e.target.closest('[data-toggle]'),al=e.target.closest('[data-align]'),ac=e.target.closest('[data-act]');
  const tk=e.target.closest('[data-tkind]');if(tk){TKIND=tk.dataset.tkind;paintLayers();return}
  const ta=e.target.closest('[data-tapply]');if(ta){applyTech(l,ta.dataset.tapply);commit();paintLayers();draw();return}
  if(tg){l[tg.dataset.toggle]=!l[tg.dataset.toggle];commit();paintLayers();draw();return}
  if(al){l.align=al.dataset.align;commit();paintLayers();draw();return}
  const wp=e.target.closest('[data-warp]');if(wp){setWarp(l,wp.dataset.warp);return}
  if(!ac)return;const a=ac.dataset.act;
  if(a==='addfont'){$('#fontIn').click();return}
  if(a==='madeall'){madeOpen();return}
  if(a==='check'){checkSize(l);return}if(a==='sep'){sepOpen(l);return}if(a==='emb'){embOpen(l);return}if(a==='tonal'){tonalOpen(l);return}
  if(a==='up')moveLayer(l,1);if(a==='down')moveLayer(l,-1);if(a==='dup')duplicate(l);if(a==='del')removeLayer(l);if(a==='raster')rasterize(l);if(a==='real')makeReal(l);if(a==='keep')keepInLibrary(l);if(a==='plain')usePlain(l);
  if(a==='centre'){l.x=W/2;l.y=H/2;commit();draw()}if(a==='flip'){l.flip=!l.flip;commit();draw()}
  if(a==='fabric'){l.blend='multiply';l.opacity=Math.min(l.opacity,.94);if(!l.distress.amount){l.distress.style='worn';l.distress.amount=.18}commit();paintLayers();draw()}
  if(a==='lookreset'){l.adjust={hue:0,sat:100,bright:100,contrast:100};l.tint.amount=0;commit();paintLayers();draw()}
  if(a==='seed'){l.distress.seed=Math.floor(Math.random()*1e6);if(!l.distress.amount)l.distress.amount=.3;commit();paintLayers();draw()}
});
pL.addEventListener('keydown',e=>{const row=e.target.closest('[data-ly]');if(row&&(e.key==='Enter'||e.key===' ')&&e.target===row){e.preventDefault();SEL=row.dataset.ly;paintLayers();draw()}});
async function usePlain(l){busy('Loading the plain picture…');try{const src=await urlOfBlob(await blobOf(`/v1/lab/concepts/${CID}/studio/plain`)),img=await imgOf(src),r=canvas(W,H);r.getContext('2d').drawImage(img,0,0,W,H);l.raster=stamp(r);l.src=null;l.dirty=true;l.name='Picture (plain)';commit();paintLayers();draw();toast('The base is the picture without the logo and graphics. Add our marks from the Add tab.')}catch(x){toast(x.message)}finally{busy()}}

// ---------- add: marks, graphics, pictures, colours ----------
function paintAdd(){
  const p=$('#pAdd');
  p.innerHTML=`<div class="sec"><h4>Future Basics marks</h4><div class="tiles">${D.marks.map(m=>`<button class="tile" type="button" data-mark="${m.id}"><img alt="" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(m.svg)}">${esc(m.label)}</button>`).join('')}</div><p class="note">Added in Ink. Click a colour below to recolour the selected mark.</p></div>
  ${D.graphics.length?`<div class="sec"><h4>This concept's graphics</h4><div class="tiles" id="gfxTiles">${D.graphics.map(g=>`<button class="tile" type="button" data-art="${esc(g.art)}"><img alt="" data-artimg="${esc(g.art)}">${esc(g.name)}</button>`).join('')}</div></div>`:''}
  <div class="sec"><h4>From the graphics library</h4><input class="t" type="search" id="libQ" placeholder="Search our graphics" aria-label="Search the graphics library"><div class="tiles" id="libTiles"><span class="note">Loading…</span></div><p class="note"><a href="/lab/library" target="_blank" rel="noopener">Open the library</a> to draw new graphics or manage them.</p></div>
  <div class="sec"><h4>From the sketch pack</h4><div class="row" id="partKinds"></div><div class="tiles" id="partTiles"><span class="note">Loading…</span></div><p class="note">The pack's own pockets, zips, collars, trims and buttons, drawn in flat-sketch lines. Add one, place it, then paint over it and use “Change it with AI” to blend it into the piece.</p></div>
  <div class="sec"><h4>Your own pictures</h4><div class="row"><button class="btn sm" type="button" id="addPic">Add a picture…</button><button class="btn sm q" type="button" id="addPaint">New painting layer</button></div><p class="note">Or drop or paste one onto the stage. A logo, a scan, a texture, a photo of a print.</p></div>
  <div class="sec"><h4>Type and shapes</h4><div class="row"><button class="btn sm q" type="button" data-addtool="text">Type</button><button class="btn sm q" type="button" data-addtool="rect">Rectangle</button><button class="btn sm q" type="button" data-addtool="ellipse">Ellipse</button><button class="btn sm q" type="button" data-addtool="line">Line</button></div></div>
  <div class="sec"><h4>Colours</h4>${['brand','program'].map(f=>{const s=D.palette.filter(c=>c.from===f);return s.length?`<span class="note">${f==='brand'?'Future Basics':'This plan\'s graphic program'}</span><div class="sw">${s.map(c=>`<button type="button" data-sw="${esc(c.hex)}" title="${esc(c.name)} ${esc(c.hex)}" aria-label="${esc(c.name)}" style="background:${esc(c.hex)}"></button>`).join('')}</div>`:''}).join('')}
    <p class="note">A colour becomes the brush colour. With type or a shape selected it colours that; with a picture or mark selected it recolours it.</p></div>`;
  for(const i of p.querySelectorAll('[data-artimg]'))blobOf('/v1/lab/art/'+i.dataset.artimg+'?thumb=1').then(b=>{i.src=URL.createObjectURL(b)}).catch(()=>{});
  paintLib();let lt=0;$('#libQ').addEventListener('input',()=>{clearTimeout(lt);lt=setTimeout(()=>{LIB=null;paintLib()},250)});
  paintParts();
}
async function paintParts(){const box=$('#partTiles'),kinds=$('#partKinds');if(!box)return;
  try{if(!PARTS)PARTS=await import('/lab/lab-flat-parts.js');
    kinds.innerHTML=Object.entries(PARTS.PART_KINDS).map(([k,l])=>`<button class="btn sm q" type="button" data-pkind="${k}" aria-pressed="${PKIND===k}">${esc(l)}s</button>`).join('');
    box.innerHTML=PARTS.FLAT_PARTS.filter(q=>q.kind===PKIND).map(q=>`<button class="tile" type="button" data-part="${esc(q.id)}" title="${esc(q.label)}"><img alt="" loading="lazy" src="/lab/flat-parts/${esc(q.file)}">${esc(q.label)}</button>`).join('')||'<span class="note">None of this kind.</span>'}
  catch(x){box.innerHTML=`<span class="note">${esc(x.message)}</span>`}}
let LIB=null;
async function paintLib(){const box=$('#libTiles');if(!box)return;
  try{if(!LIB){const q=($('#libQ')?.value||'').trim();LIB=(await api('/v1/lab/library/graphics?limit=24'+(q?'&q='+encodeURIComponent(q):''))).graphics}
    box.innerHTML=LIB.length?LIB.map(g=>`<button class="tile" type="button" data-lib="${g.id}" title="${esc(g.name)}${g.techniqueName?' · '+esc(g.techniqueName):''}"><img alt="" data-libimg="${g.id}">${esc((g.name||'Untitled').slice(0,28))}</button>`).join(''):'<span class="note">Nothing found.</span>';
    for(const i of box.querySelectorAll('[data-libimg]'))blobOf('/v1/lab/art/'+i.dataset.libimg+'?thumb=1').then(b=>{i.src=URL.createObjectURL(b)}).catch(()=>{})}catch(x){box.innerHTML=`<span class="note">${esc(x.message)}</span>`}}
// a brand mark as pixels: its lines and lettering in color, its cue dot in dot (its own green when none). brand:word:#a02a20:#a02a20 says both
const brandSrc=q=>'brand:'+q.mark+(q.colour||q.dot?':'+(q.colour||'')+':'+(q.dot||''):''),brandOf=src=>{const m=/^brand:(mark|word|lockup)(?::(#[0-9a-f]{6})?)?(?::(#[0-9a-f]{6})?)?$/i.exec(String(src||''));return m?{mark:m[1],...(m[2]?{colour:m[2].toLowerCase()}:{}),...(m[3]?{dot:m[3].toLowerCase()}:{})}:null};
// a mark the studio has not changed (no tint, colour adjustment, distress, warp or filter): it can be drawn from itself on the flats in its colours
const plainMark=l=>!l.tint?.amount&&!l.distress?.amount&&!l.warp&&!l.fx&&!l.filters?.length&&(!l.adjust||(l.adjust.hue===0&&l.adjust.sat===100&&l.adjust.bright===100&&l.adjust.contrast===100))&&!(l.raster&&l.raster._rid!==l._srcRid);
async function markRaster(id,color='#141416',dot=''){const m=D.marks.find(x=>x.id===id);let svg=m.svg.replace(/#141416/gi,color||'#141416');if(dot)svg=svg.replace(/#4BFF9A/gi,dot);const img=await imgOf('data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg));const k=1600/Math.max(img.naturalWidth||img.width,1),c=canvas((img.naturalWidth||img.width)*k,(img.naturalHeight||img.height)*k);c.getContext('2d').drawImage(img,0,0,c.width,c.height);return stamp(c)}
async function addPicture(src,name,{fit=.45,origin=null}={}){const img=await imgOf(src),c=canvas(img.naturalWidth,img.naturalHeight);c.getContext('2d').drawImage(img,0,0);const sc=Math.min(W*fit/c.width,H*fit/c.height,1);return addLayer(fresh('image',{name,raster:stamp(c),src:origin,dirty:!origin,_srcRid:c._rid,scale:+sc.toFixed(3),x:W/2,y:H/2}))}
async function addFiles(files){for(const f of[...files].filter(f=>/^image\//.test(f.type)).slice(0,6)){if(f.size>15e6){toast(f.name+' is over 15 MB.');continue}try{await addPicture(await urlOfBlob(f),f.name.replace(/\.[a-z0-9]+$/i,'').slice(0,40)||'Picture')}catch(x){toast(x.message)}}}
$('#pAdd').addEventListener('click',async e=>{
  const mk=e.target.closest('[data-mark]'),ar=e.target.closest('[data-art]'),sw=e.target.closest('[data-sw]'),at=e.target.closest('[data-addtool]');
  const pk=e.target.closest('[data-pkind]');if(pk){PKIND=pk.dataset.pkind;paintParts();return}
  const pt=e.target.closest('[data-part]');if(pt){const q=(PARTS?.FLAT_PARTS||[]).find(x=>x.id===pt.dataset.part);if(!q)return;busy('Loading the part…');try{await addPicture('/lab/flat-parts/'+q.file,q.label,{fit:.28,origin:'/lab/flat-parts/'+q.file});toast(`${q.label} added as a layer: drag it into place.`)}catch(x){toast(x.message)}finally{busy()}return}
  if(mk){const r=await markRaster(mk.dataset.mark);addLayer(fresh('image',{name:D.marks.find(m=>m.id===mk.dataset.mark).label,raster:r,src:'brand:'+mk.dataset.mark,_srcRid:r._rid,scale:+Math.min(W*.22/r.width,1).toFixed(3),x:W/2,y:H*.4}));return}
  if(ar){busy('Loading the graphic…');try{const src=await urlOfBlob(await blobOf('/v1/lab/art/'+ar.dataset.art));const img=await imgOf(src),c=canvas(img.naturalWidth,img.naturalHeight);c.getContext('2d').drawImage(img,0,0);addLayer(fresh('image',{name:ar.textContent.trim().slice(0,40)||'Graphic',raster:stamp(c),src:'/v1/lab/art/'+ar.dataset.art,_srcRid:c._rid,scale:+Math.min(W*.35/c.width,1).toFixed(3),x:W/2,y:H*.45}))}catch(x){toast(x.message)}finally{busy()}return}
  const lb=e.target.closest('[data-lib]');
  if(lb){const g=(LIB||[]).find(x=>x.id===lb.dataset.lib);busy('Loading the graphic…');try{const src=await urlOfBlob(await blobOf('/v1/lab/art/'+lb.dataset.lib));const img=await imgOf(src),c=stamp(canvas(img.naturalWidth,img.naturalHeight));c.getContext('2d').drawImage(img,0,0);
    const l=addLayer(fresh('image',{name:(g&&g.name||'Graphic').slice(0,40),raster:c,src:'/v1/lab/art/'+lb.dataset.lib,_srcRid:c._rid,scale:+Math.min(W*.35/c.width,1).toFixed(3),x:W/2,y:H*.45}),{silent:true});
    if(g&&g.techniqueId)applyTech(l,g.techniqueId);commit();paintLayers();draw();tab('layers')}catch(x){toast(x.message)}finally{busy()}return}
  if(sw){applySwatch(sw.dataset.sw);return}
  if(at){setTool(at.dataset.addtool);toast(at.dataset.addtool==='text'?'Click the picture where the type should go.':'Drag on the picture to draw it.');return}
  if(e.target.id==='addPic')$('#fileIn').click();
  if(e.target.id==='addPaint')addLayer(fresh('paint',{name:'Painting',raster:stamp(canvas(W,H))}));
});
function applySwatch(hex){setColor(hex);const l=selected();if(!l||l.locked)return;
  if(l.kind==='text')l.color=hex;else if(l.kind==='shape'){if(l.fill||l.shape==='line')l.fillColor=hex;if(l.stroke)l.strokeColor=hex}else if(l.kind!=='base'){l.tint={color:hex,amount:1}}else return;commit();paintLayers();draw()}
$('#fileIn').addEventListener('change',e=>{addFiles(e.target.files);e.target.value=''});
const stage=$('#stage');let dragN=0;
stage.addEventListener('dragenter',e=>{if([...e.dataTransfer.types].includes('Files')){dragN++;$('#drop').classList.remove('hidden')}});
stage.addEventListener('dragleave',()=>{if(--dragN<=0){dragN=0;$('#drop').classList.add('hidden')}});
stage.addEventListener('dragover',e=>e.preventDefault());
stage.addEventListener('drop',e=>{e.preventDefault();dragN=0;$('#drop').classList.add('hidden');addFiles(e.dataTransfer.files)});
document.addEventListener('paste',e=>{if(e.target.closest&&e.target.closest('input,textarea')||VMODE==='front'||VMODE==='back')return;const f=[...(e.clipboardData?.files||[])];if(f.length){e.preventDefault();addFiles(f)}});

// ---------- AI: change the piece (all of it, or the painted area), or make a graphic ----------
function paintAi(){
  const p=$('#pAi'),ai=D.ai;
  p.innerHTML=`<div class="sec"><h4>Change the piece</h4><textarea class="t" id="aiEdit" maxlength="800" placeholder="Make the body a washed olive. Add a raw hem. Give the sleeves a faded sun-bleached look."></textarea>
    <div class="row"><button class="btn sm ${MASKED?'':'q'}" type="button" data-aiscope="area" aria-pressed="${MASKED}">Only the painted area</button><button class="btn sm q" type="button" data-paintarea>Paint the area</button><button class="btn sm q" type="button" data-clearmask ${MASKED?'':'disabled'}>Clear it</button></div>
    <p class="note" id="aiScope"></p><div class="row"><button class="btn go sm" type="button" id="aiGo" ${ai.connected?'':'disabled'}>Change it</button>${CID&&!GMODE?`<button class="btn sm" type="button" id="rmGfx" title="Takes the printed graphic off the piece: a selected graphic layer is removed; otherwise the AI finds it (or uses the painted area) and fills it with plain fabric" ${ai.connected?'':'disabled'}>Remove the graphic</button>`:''}</div>
    <p class="note">Comes back as a new layer on top.</p></div>
  ${GMODE?'':`<div class="sec"><h4>Make a graphic</h4><textarea class="t" id="aiArt" maxlength="800" placeholder="A cracked two-colour arch of the words FUTURE BASICS over a lightning bolt, 1970s rock tour style, ink and cream"></textarea>
    <label class="f w"><span>Made as</span><select class="t" id="aiTech">${techOpts('')}</select></label>
    <div class="row"><button class="btn go sm" type="button" id="artGo" ${ai.connected?'':'disabled'}>Make it</button><a class="btn sm q" href="/lab/library?print=1">From a library graphic</a></div><p class="note">On a clear background, kept in the graphics library.</p></div>`}
  ${CID&&!GMODE?`<div class="sec" id="fabSec"><h4>The fabric</h4><span class="note">Loading the materials library…</span></div>`:''}
  <p class="msg" id="aiMsg" role="status">${ai.connected?(ai.left==null?'':`${ai.left} left today`):'No image model connected.'}</p>`;
  paintAiState();if(CID&&!GMODE)paintFabrics().catch(x=>{const f=$('#fabSec');if(f)f.innerHTML=`<h4>The fabric</h4><span class="note">${esc(x.message)}</span>`});
}
// versions: kept on apply and on request; two side by side with a wipe; open one to carry on from its layers
let VERS=[],VSEL=[];
const verUrl=(n,thumb)=>blobOf(`/v1/lab/concepts/${CID}/studio/versions/${n}/image${thumb?'?thumb=1':''}`).then(urlOfBlob);
async function verOpen(){if(!CID||GMODE)return;$('#verDlg').showModal();$('#verList').innerHTML='<span class="note">Loading…</span>';VSEL=[];$('#verCmp').classList.add('hidden');
  try{VERS=(await api(`/v1/lab/concepts/${CID}/studio/versions`)).versions;paintVers();for(const v of VERS){const u=await verUrl(v.n,true);const el=$(`#verList [data-vn="${v.n}"] .im`);if(el)el.innerHTML=`<img src="${u}" alt="">`}}catch(x){$('#verMsg').className='msg bad';$('#verMsg').textContent=x.message}}
function paintVers(){$('#verList').innerHTML=VERS.length?VERS.map(v=>`<div data-vn="${v.n}" style="flex:none;width:150px;display:grid;gap:4px;border:1px solid var(--line);border-radius:12px;padding:6px;background:#fff"><div class="im" style="aspect-ratio:1/1;background:#f5f5f2;border-radius:8px;overflow:hidden;display:grid;place-items:center"></div><label class="note" style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-vsel="${v.n}" ${VSEL.includes(v.n)?'checked':''}> v${v.n}${v.applied?' · used':''}</label><span class="note" style="font-size:11px">${esc(v.note)}<br>${esc(new Date(v.at).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}))}${v.by?' · '+esc(v.by):''}</span><button class="btn sm q" type="button" data-vopen="${v.n}" ${v.hasLayers?'':'disabled title="Kept as a picture only"'}>Open its layers</button></div>`).join(''):'<span class="note">No versions yet: use a picture as the concept, or press “Keep this as a version”.</span>'}
async function verCompare(){if(VSEL.length!==2){$('#verCmp').classList.add('hidden');return}const [a,b]=[...VSEL].sort((x,y)=>x-y);$('#verCmp').classList.remove('hidden');$('#verCmpNote').textContent=`v${a} under, v${b} over: drag the wipe`;$('#verLabA').textContent=`v${a}`;$('#verLabB').textContent=`v${b}`;$('#verWipe').value=50;wipe(50);$('#verA').src=await verUrl(a);$('#verB').src=await verUrl(b)}
function wipe(p){$('#verB').style.clipPath=`inset(0 ${100-p}% 0 0)`;$('#verLine').style.left=p+'%'}
$('#verWipe').addEventListener('input',e=>wipe(Number(e.target.value)));
$('#verBtn').onclick=verOpen;
$('#verDlg').addEventListener('click',async e=>{if(e.target.closest('[data-verclose]')||e.target===$('#verDlg')){$('#verDlg').close();return}
  const vs=e.target.closest('[data-vsel]');if(vs){const n=Number(vs.dataset.vsel);if(vs.checked){VSEL.push(n);if(VSEL.length>2){const drop=VSEL.shift();const o=$(`[data-vsel="${drop}"]`);if(o)o.checked=false}}else VSEL=VSEL.filter(x=>x!==n);verCompare();return}
  const vo=e.target.closest('[data-vopen]');if(vo){const n=Number(vo.dataset.vopen);if(DIRTY&&!(await ask('Open version '+n+'?','What is on the canvas now is not saved. Keep a version of it first if you want it back.')))return;busy('Opening version '+n+'…');
    try{const r=await api(`/v1/lab/concepts/${CID}/studio/versions/${n}`);if(!r.doc)throw new Error('That version has no layers');W=r.doc.w;H=r.doc.h;LAYERS=[];window.ILL?.load(r.doc);for(const o of r.doc.layers){try{LAYERS.push(await loadLayer(o))}catch{toast('A layer could not be loaded and was left out.')}}SEL=null;docC.width=W;docC.height=H;mask=canvas(W,H);maskX=mask.getContext('2d');HIST=[snap()];HI=0;syncUndo();touch();paintLayers();requestAnimationFrame(fit);$('#verDlg').close();toast(`Version ${n} is on the canvas. Save to keep working from it.`)}
    catch(x){$('#verMsg').className='msg bad';$('#verMsg').textContent=x.message}finally{busy()}return}
  if(e.target.id==='verKeep'){const b=e.target;FBN.begin(b);try{compose();const r=await api(`/v1/lab/concepts/${CID}/studio/versions`,{body:{...(await (async()=>{const image=enc(docC),doc=serialize();return{image:await image,doc:await doc}})()),note:'Kept from the studio'}});FBN.end(b,true);FBN.toast(`Kept as version ${r.n}.`,'ok');await verOpen()}catch(x){FBN.end(b,false);$('#verMsg').className='msg bad';$('#verMsg').textContent=x.message}}
});
// the fabric from the materials library: choose it for the concept (its cost follows), and have the image model draw the piece in it
let FABS=null,FABPICKS=null;
// the fabric list, ranked for this piece's style (src/lab-fabric-fit.js rankFabrics): best first, in groups; with no style, the library's order
const fabOpt=(m,main)=>`<option value="${m.id}" ${main&&m.id===main.id?'selected':''}>${esc(m.name)} · ${'$'+(m.priceCents/100).toFixed(2)}/${esc(m.unit)}</option>`;
function fabOptions(list,mine,main){const R=mine.style&&FFIT?FFIT.rankFabrics(mine.style,list):null;if(!R||!R[0]?.fit?.tier)return list.map(m=>fabOpt(m,main)).join('');
  const piece=mine.styleLabel||'this piece';return [['best','Best for '+piece],['good','Also suits '+piece],['check','Works with changes'],['no','Does not suit '+piece]].map(([t,h])=>{const l=R.filter(m=>m.fit.tier===t);return l.length?`<optgroup label="${esc(h)}">${l.map(m=>fabOpt(m,main)).join('')}</optgroup>`:''}).join('')}
async function paintFabrics(){
  const f=$('#fabSec');if(!f)return;
  const [lib,mine]=await Promise.all([FABS?Promise.resolve(FABS):api('/v1/lab/materials?kind=fabric'),api(`/v1/lab/concepts/${CID}/materials`),fitMod().catch(()=>null)]);FABS=lib;FABPICKS=mine;
  const main=mine.picks.find(p=>p.role==='main'&&p.kind==='fabric'),words=m=>[m.spec.weightGsm?m.spec.weightGsm+' gsm':'',m.spec.construction,m.spec.composition?`(${m.spec.composition})`:'',m.spec.finish&&m.spec.finish!=='none'?m.spec.finish:''].filter(Boolean).join(' ');
  f.innerHTML=`<h4>The fabric</h4><p class="note">${main?`On the concept: <b>${esc(main.name)}</b>${main.colour?` in ${esc(main.colour.name||main.colour.hex)}`:''} · landed cost ${'$'+(mine.cost.landedCents/100).toFixed(2)}${mine.cost.marginPct!=null?` · margin ${mine.cost.marginPct}%`:''}.`:'No fabric chosen yet: the concept costs out on the usual making cost alone.'}</p>${mine.fit&&mine.fit.verdict!=='unknown'?`<p class="note" style="color:${mine.fit.accepted||mine.fit.verdict==='good'?'#17603a':mine.fit.verdict==='wrong'?'#a02a20':'#8a5a00'}">${mine.fit.accepted||mine.fit.verdict==='good'?'✓':mine.fit.verdict==='wrong'?'✕':'!'} ${esc(mine.fit.accepted||mine.fit.verdict==='good'?mine.fit.summary:mine.fit.findings[0].msg+' '+mine.fit.findings[0].fix)}</p>`:''}
    <div class="row"><select class="t" id="fabSel" style="flex:1;min-width:0" aria-label="The fabric, best for this piece first">${fabOptions(lib.materials,mine,main)}</select><select class="t" id="fabCol" style="width:auto"></select></div>
    <div class="row"><button class="btn sm" type="button" id="fabUse" ${D.concept.locked?'disabled':''}>Use it on the concept</button><button class="btn go sm" type="button" id="fabDraw" ${D.ai.connected?'':'disabled'}>Redraw the piece in it</button></div><div class="row"><button class="btn q sm" type="button" id="fabMore">Fabrics, trims &amp; labels…</button></div>
    <p class="note">Use it: the concept's bill of materials, landed cost and margin update, and the tech pack takes the fabric line. Redraw: the image model draws the piece in that cloth and colour as a new layer on top.</p>`;
  const cols=()=>{const m=lib.materials.find(x=>x.id===$('#fabSel').value);$('#fabCol').innerHTML=`<option value="">Any colour</option>${(m?.colours||[]).map(c=>`<option value="${c.hex}" ${main&&main.id===m.id&&main.colour?.hex===c.hex?'selected':''}>${esc(c.name||c.hex)}</option>`).join('')}`};cols();$('#fabSel').onchange=cols;
  $('#fabUse').onclick=async()=>{const b=$('#fabUse');try{await FBN.run(b,()=>api(`/v1/lab/concepts/${CID}/materials`,{body:{material:$('#fabSel').value,role:'main',colour:$('#fabCol').value||undefined}}),{done:'The concept is made of it: cost and margin updated.'});await paintFabrics()}catch{}};
  $('#fabDraw').onclick=()=>{const m=lib.materials.find(x=>x.id===$('#fabSel').value);if(!m)return;const col=(m.colours||[]).find(c=>c.hex===$('#fabCol').value);$('#aiEdit').value=`Render the whole piece in ${words(m)}${col?`, ${col.name||col.hex} colour`:''}: the real weight, drape, surface texture and sheen of that cloth, same cut and details.`;$('#aiGo').click()};
}
// the AI changes the piece, or only the painted area, and the answer lands as the top layer → true when it did
async function runEdit(prompt,{label=null}={}){
  const m=$('#aiMsg');busy(MASKED?'The AI is changing the painted area. About a minute…':'The AI is changing the piece. About a minute…');
  try{compose();const r=await api(AI_URL(),{body:{mode:'edit',prompt,image:docC.toDataURL('image/png'),mask:MASKED?maskPng():null}});
    const img=await imgOf(r.image),c=canvas(W,H),x=c.getContext('2d');x.drawImage(img,0,0,W,H);
    // only the painted area is kept from the answer (softened at its edge), so the rest stays exactly as it was
    if(MASKED){x.globalCompositeOperation='destination-in';x.filter='blur(3px)';x.drawImage(mask,0,0);x.filter='none'}
    addLayer(fresh('image',{name:(label||'AI · '+prompt).slice(0,40),raster:stamp(c),src:null,dirty:true,x:W/2,y:H/2}),{top:true});D.ai.left=r.left;if(m){m.className='msg ok';m.textContent=`Done: it is the top layer.${r.left==null?'':` ${r.left} left today.`}`}if(MASKED)clearMask();toast('Done: the change is the top layer.');return true}
  catch(x){if(m){m.className='msg bad';m.textContent=x.message}toast(x.message);return false}finally{busy()}}
// "Remove the graphic": a selected graphic layer simply goes; otherwise the painted area, or the area the vision model finds, is filled with plain fabric by the AI,
// and the graphic can come off the concept's words too, so a redraw or the tech pack does not bring it back
const REMOVE_WORDS='Remove the printed or embroidered graphic in this area completely and fill it with the plain garment fabric: continue the weave, colour, seams, folds and lighting from around it, so nothing printed is left.';
function isGraphicLayer(l){return l&&l.kind==='image'&&(String(l.src||'').startsWith('/v1/lab/art/')||/^Graphic\b/.test(l.name||''))}
function paintFound(list){maskX.save();maskX.fillStyle='#e03b2e';for(const f of list){const w=f.w*W*1.3,h=Math.max(w*1.05,f.w*W*1.1);maskX.beginPath();maskX.ellipse(f.x*W,f.y*H,w/2,h/2,(f.angle||0)*Math.PI/180,0,Math.PI*2);maskX.fill()}maskX.restore();MASKED=list.length>0;paintAiState();draw()}
async function removeGraphic(){
  const l=selected();if(isGraphicLayer(l)){removeLayer(l);toast(`"${l.name}" is off the piece.`);return}
  if(!MASKED){busy('Finding the graphic on the piece…');let r;try{compose();r=await api(`/v1/lab/concepts/${CID}/studio/find-graphics`,{body:{image:docC.toDataURL('image/png')}})}catch(x){busy();toast(x.message);return}busy();
    if(!r.found.length){setTool('area');tab('ai');toast(r.note||'The graphic could not be found on its own: paint over it, then press Remove the graphic again.');return}
    paintFound(r.found);toast(`Found ${r.found.map(f=>f.name).join(', ')}: that area is painted. Removing it…`)}
  const ok=await runEdit(REMOVE_WORDS,{label:'Graphic removed'});if(!ok)return;
  const names=D.graphicNames||[];if(names.length&&!D.concept.locked){
    const yes=await ask('Also take the graphic off the concept?',`The picture is changed here. The concept's words still carry ${names.length===1?'the graphic':'these graphics'}: ${names.join(', ')}. Taking ${names.length===1?'it':'them'} off means a redraw and the tech pack will not bring ${names.length===1?'it':'them'} back.${D.concept.status==='approved'?' The concept is approved, so it goes back to draft to be approved again.':''}`,'Take it off');
    if(yes){try{await api(`/v1/lab/concepts/${CID}`,{method:'PUT',body:{graphics:[]}});D.graphicNames=[];D.graphics=[];if(TAB==='add')paintAdd();toast('The graphic is off the concept. Use as the concept picture when the piece looks right.')}catch(x){toast(x.message)}}}
}
function paintAiState(){const s=$('#aiScope');if(s)s.textContent=MASKED?'Only the painted (red) area will change.':'Nothing is painted: the whole piece can change. Paint an area to keep the rest exactly as it is.';const b=$('#pAi [data-clearmask]');if(b)b.disabled=!MASKED;const a=$('#pAi [data-aiscope]');if(a){a.className='btn sm '+(MASKED?'':'q');a.setAttribute('aria-pressed',String(MASKED))}}
function maskPng(){const c=canvas(W,H),x=c.getContext('2d');x.fillStyle='#000';x.fillRect(0,0,W,H);x.globalCompositeOperation='destination-out';x.drawImage(mask,0,0);return c.toDataURL('image/png')}
$('#pAi').addEventListener('click',async e=>{
  if(e.target.closest('[data-paintarea]')||e.target.closest('[data-aiscope]')){setTool('area');toast('Paint over what should change. Hold Alt to rub out.');return}
  if(e.target.closest('[data-clearmask]')){clearMask();return}
  const m=$('#aiMsg');
  if(e.target.id==='aiGo'){const prompt=$('#aiEdit').value.trim();if(prompt.length<3){m.className='msg bad';m.textContent='Say what to change.';toast('Say what to change first.');return}e.target.disabled=true;try{await runEdit(prompt)}finally{e.target.disabled=false}return}
  if(e.target.id==='rmGfx'){e.target.disabled=true;try{await removeGraphic()}finally{const b=$('#rmGfx');if(b)b.disabled=false}return}
  if(e.target.id==='artGo'){const prompt=$('#aiArt').value.trim();if(prompt.length<3){m.className='msg bad';m.textContent='Say what the graphic should be.';return}
    busy('Drawing the graphic. About a minute…');e.target.disabled=true;
    try{const tid=$('#aiTech').value||null,r=await api(AI_URL(),{body:{mode:'art',prompt,techniqueId:tid}});const l=await addPicture(r.image,'Graphic · '+prompt.slice(0,32),{fit:.4,origin:r.art?'/v1/lab/art/'+r.art:null});if(tid){applyTech(l,tid);commit();paintLayers();draw()}D.ai.left=r.left;LIB=null;m.className='msg ok';m.textContent=`Done: the graphic is a new layer, and it is in the graphics library. Move it into place.${r.left==null?'':` ${r.left} left today.`}`}
    catch(x){m.className='msg bad';m.textContent=x.message;toast(x.message)}finally{busy();e.target.disabled=false}}
});
