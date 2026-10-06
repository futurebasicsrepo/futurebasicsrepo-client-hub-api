// Hub language for the public pages (/start, /fair): English, Simplified Chinese (zh) and Traditional Chinese (zh-hk).
// Which language: ?lang= in the link (the trade-show cards carry it), else a choice made earlier on this device, else the
// browser's own language. Never the visitor's IP: Hong Kong reads Traditional, the mainland Simplified, and many visitors at
// the fairs are foreign buyers on roaming phones. A switcher in the header lets anyone change it, and the choice is kept.
// English lives in the page itself; elements carry data-i18n (text), data-i18n-html (markup) or data-i18n-ph (placeholder)
// keys, and scripts use HubI18n.t(key, english, vars) for the words they write.
(function () {
  const LANGS = { en: { label: 'EN', html: 'en' }, zh: { label: '简体', html: 'zh-Hans' }, 'zh-hk': { label: '繁體', html: 'zh-Hant' } };
  const norm = v => { v = String(v || '').toLowerCase().replace('_', '-'); if (!v) return null; if (v === 'en' || v.startsWith('en-')) return 'en';
    if (v === 'zh-hk' || v === 'zh-tw' || v === 'zh-mo' || v.startsWith('zh-hant')) return 'zh-hk'; if (v.startsWith('zh')) return 'zh'; return null; };
  const S = {
    zh: {
      'lang.suggest': '已切换为中文。', 'nav.site': '官网', 'nav.tag': '/ 技术包', 'nav.free': '首个技术包免费',
      'start.meta': '产品开发', 'start.h1': '任何图片，变成<em>技术包。</em>',
      'start.short': '上传渲染图、草图、照片或截图，大约一分钟就能得到<b>你自己的技术包草稿</b>，首个免费。',
      'start.long': '成品渲染图、平面款式图、样品照片或你保存的截图都可以。上传后告诉我们你想做什么，就会进入<b>你自己的草稿</b>：标注、尺寸、材料和颜色都可以继续填写。Future Basics 会和你一起完成。',
      'start.sheet': '技术包 · 草稿 v1', 'start.ready': '✓ 可以编辑',
      'st.reading': '识别图片中', 'st.callouts': '添加标注', 'st.measuring': '测量尺寸', 'st.colours': '选择配色', 'st.ready': '草稿已就绪',
      'start.drop': '添加你的设计、草图或照片', 'start.dropMeta': '渲染图 · 草图 · 照片 · 截图 · 最多 4 张', 'start.addMore': '+ 再加一张', 'start.count': '已添加 {n} / {max} 张',
      'start.main': '主图', 'start.detail': '细节 {n}', 'start.trim': '裁掉状态栏', 'start.trimmed': '✓ 已裁剪',
      'start.title': '这是什么产品？', 'start.titlePh': '老爹跑鞋 · 板鞋 · 连帽卫衣 · 棒球帽',
      'start.notes': '你想做什么？有什么需要照做或修改的地方？', 'start.notesPh': '和图片同款式，鞋面换成皮革，用我们的配色，300 双……',
      'start.email': '你的邮箱', 'start.name': '你的名字', 'start.namePh': '李明',
      'start.go': '生成我的技术包', 'start.building': '正在生成草稿……', 'start.buildingPack': '正在生成技术包……', 'start.opening': '正在打开技术包……',
      'err.noImage': '请先添加一张设计图片。', 'err.noTitle': '告诉我们这是什么产品，几个字就够。', 'err.noEmail': '请填写用来联系你的邮箱。',
      'err.tooMany': '最多 {max} 张，删除一张才能再添加。', 'err.notImage': '这个文件不是图片。请添加设计图、草图、照片或截图（JPG、PNG 或 HEIC）。',
      'code.meta': '还差一步', 'code.h': '这个邮箱已经注册过。', 'code.p': '你的草稿已保存到你现有的工作间。输入我们刚发到 <b id="codeEmail"></b> 的六位验证码即可打开。',
      'code.go': '打开我的技术包', 'code.nothing': '没收到？', 'code.resend': '重新发送验证码', 'code.change': '换一个邮箱', 'code.sent': '新的验证码已发出，可能要等一分钟。请使用最新的一封。',
      'step.1': '你的图片会成为技术包草稿的第一页。', 'step.2': '在图上标注细节，补充尺码、材料、颜色，也可以交给我们。', 'step.3': '提交后，我们完成技术包，你确认后再交给工厂。',
      'start.fine': '已经有工作间？<a href="/">登录客户中心</a> · <a href="/help">使用说明</a>。继续即表示你同意我们就此产品与你联系。',
      'fair.eyebrow': 'Future Basics · {fair}', 'fair.h1': '工厂看得懂的技术包，<em>看得见的生产进度。</em>',
      'fair.lede': '从一张图片到工厂确认的技术包：标注、尺寸、材料和配色，中英文对照。品牌方和工厂在同一个地方确认每个细节。',
      'fair.brandTag': '品牌方 · 采购商', 'fair.brandH': '把照片或阿里巴巴商品截图变成技术包。',
      'fair.brandP': '上传图片，几分钟就有可编辑的技术包草稿。供应商收到中文版，打样前逐条确认每个细节。',
      'fair.brand1': '支持照片、草图、渲染图、商品截图', 'fair.brand2': '给工厂的链接自动显示中文', 'fair.brand3': '你、Future Basics、工厂依次签字确认',
      'fair.brandGo': '开始做技术包 · 首个免费', 'fair.factoryTag': '工厂 · 供应商', 'fair.factoryH': '打样前就拿到完整、清楚的技术包。',
      'fair.factoryP': '海外客户的需求常常不清楚，打样一改再改。注册后你会得到专属链接，发给你的客户，他们的技术包会带着中文版直接给到你。',
      'fair.f1': '公司名称', 'fair.f2': '联系人', 'fair.f3': '邮箱', 'fair.f4': '微信号', 'fair.f5': '电话 / WhatsApp', 'fair.f6': '城市', 'fair.f7': '主要生产什么？',
      'fair.f7ph': '运动鞋、针织、蓝牙耳机、包装……', 'fair.factoryGo': '获取我的工厂链接', 'fair.factoryNeed': '请填写公司名称，并至少留一个联系方式（邮箱、微信或电话）。',
      'fair.doneH': '这是你的专属链接', 'fair.doneP': '发给你的海外客户，或者让他们扫这个二维码。他们从这里开始的技术包会关联到你的工厂，我们也会联系你。',
      'fair.copy': '复制链接', 'fair.copied': '已复制', 'fair.save': '长按或右键保存二维码', 'fair.how': '怎么运作', 'fair.how1': '品牌上传图片，生成技术包草稿。',
      'fair.how2': 'Future Basics 审核完善，品牌确认。', 'fair.how3': '工厂通过链接看到中文版，逐条确认并签字。', 'fair.how4': '打样、生产、质检、发货，进度都在一个地方。',
      'fair.contact': '在展会上见过我们？加微信或发邮件，我们一起看你的产品。', 'fair.sending': '正在提交……'
    },
    'zh-hk': {
      'lang.suggest': '已切換為中文。', 'nav.site': '官網', 'nav.tag': '/ 技術包', 'nav.free': '首個技術包免費',
      'start.meta': '產品開發', 'start.h1': '任何圖片，變成<em>技術包。</em>',
      'start.short': '上傳渲染圖、草圖、相片或截圖，大約一分鐘就能得到<b>你自己的技術包草稿</b>，首個免費。',
      'start.long': '成品渲染圖、平面款式圖、樣辦相片或你儲存的截圖都可以。上傳後告訴我們你想做甚麼，就會進入<b>你自己的草稿</b>：標註、尺寸、物料和顏色都可以繼續填寫。Future Basics 會和你一起完成。',
      'start.sheet': '技術包 · 草稿 v1', 'start.ready': '✓ 可以編輯',
      'st.reading': '識別圖片中', 'st.callouts': '加入標註', 'st.measuring': '量度尺寸', 'st.colours': '選擇配色', 'st.ready': '草稿已就緒',
      'start.drop': '加入你的設計、草圖或相片', 'start.dropMeta': '渲染圖 · 草圖 · 相片 · 截圖 · 最多 4 張', 'start.addMore': '+ 再加一張', 'start.count': '已加入 {n} / {max} 張',
      'start.main': '主圖', 'start.detail': '細節 {n}', 'start.trim': '裁走狀態列', 'start.trimmed': '✓ 已裁剪',
      'start.title': '這是甚麼產品？', 'start.titlePh': '老爹跑鞋 · 板鞋 · 連帽衛衣 · 棒球帽',
      'start.notes': '你想做甚麼？有甚麼需要照做或修改的地方？', 'start.notesPh': '和圖片同款式，鞋面改用皮革，用我們的配色，300 對……',
      'start.email': '你的電郵', 'start.name': '你的名字', 'start.namePh': '陳大文',
      'start.go': '生成我的技術包', 'start.building': '正在生成草稿……', 'start.buildingPack': '正在生成技術包……', 'start.opening': '正在打開技術包……',
      'err.noImage': '請先加入一張設計圖片。', 'err.noTitle': '告訴我們這是甚麼產品，幾個字就夠。', 'err.noEmail': '請填寫用來聯絡你的電郵。',
      'err.tooMany': '最多 {max} 張，刪除一張才能再加入。', 'err.notImage': '這個檔案不是圖片。請加入設計圖、草圖、相片或截圖（JPG、PNG 或 HEIC）。',
      'code.meta': '還差一步', 'code.h': '這個電郵已經登記過。', 'code.p': '你的草稿已儲存到你現有的工作間。輸入我們剛發到 <b id="codeEmail"></b> 的六位驗證碼即可打開。',
      'code.go': '打開我的技術包', 'code.nothing': '沒有收到？', 'code.resend': '重新發送驗證碼', 'code.change': '改用另一個電郵', 'code.sent': '新的驗證碼已發出，可能要等一分鐘。請使用最新的一封。',
      'step.1': '你的圖片會成為技術包草稿的第一頁。', 'step.2': '在圖上標註細節，補充尺碼、物料、顏色，也可以交給我們。', 'step.3': '提交後，我們完成技術包，你確認後再交給工廠。',
      'start.fine': '已經有工作間？<a href="/">登入客戶中心</a> · <a href="/help">使用說明</a>。繼續即表示你同意我們就此產品與你聯絡。',
      'fair.eyebrow': 'Future Basics · {fair}', 'fair.h1': '工廠看得懂的技術包，<em>看得見的生產進度。</em>',
      'fair.lede': '由一張圖片到工廠確認的技術包：標註、尺寸、物料和配色，中英對照。品牌和工廠在同一個地方確認每個細節。',
      'fair.brandTag': '品牌 · 採購商', 'fair.brandH': '把相片或阿里巴巴產品截圖變成技術包。',
      'fair.brandP': '上傳圖片，幾分鐘就有可編輯的技術包草稿。供應商收到中文版，打辦前逐項確認每個細節。',
      'fair.brand1': '支援相片、草圖、渲染圖、產品截圖', 'fair.brand2': '給工廠的連結自動顯示中文', 'fair.brand3': '你、Future Basics、工廠依次簽署確認',
      'fair.brandGo': '開始做技術包 · 首個免費', 'fair.factoryTag': '工廠 · 供應商', 'fair.factoryH': '打辦前就拿到完整、清楚的技術包。',
      'fair.factoryP': '海外客戶的要求經常不清楚，樣辦一改再改。登記後你會得到專屬連結，發給你的客戶，他們的技術包會連同中文版直接交到你手上。',
      'fair.f1': '公司名稱', 'fair.f2': '聯絡人', 'fair.f3': '電郵', 'fair.f4': '微信號', 'fair.f5': '電話 / WhatsApp', 'fair.f6': '城市', 'fair.f7': '主要生產甚麼？',
      'fair.f7ph': '運動鞋、針織、藍牙耳機、包裝……', 'fair.factoryGo': '取得我的工廠連結', 'fair.factoryNeed': '請填寫公司名稱，並最少留下一個聯絡方式（電郵、微信或電話）。',
      'fair.doneH': '這是你的專屬連結', 'fair.doneP': '發給你的海外客戶，或者讓他們掃描這個二維碼。他們由這裡開始的技術包會連繫到你的工廠，我們也會聯絡你。',
      'fair.copy': '複製連結', 'fair.copied': '已複製', 'fair.save': '長按或右鍵儲存二維碼', 'fair.how': '怎樣運作', 'fair.how1': '品牌上傳圖片，生成技術包草稿。',
      'fair.how2': 'Future Basics 審核完善，品牌確認。', 'fair.how3': '工廠經連結看到中文版，逐項確認並簽署。', 'fair.how4': '打辦、生產、品檢、出貨，進度都在一個地方。',
      'fair.contact': '在展會上見過我們？加微信或發電郵，我們一起看看你的產品。', 'fair.sending': '正在提交……'
    }
  };
  const fill = (s, vars) => String(s).replace(/\{(\w+)\}/g, (m, k) => vars && vars[k] != null ? vars[k] : m);
  let stored = null; try { stored = norm(localStorage.getItem('fb.lang')); } catch {}
  const fromUrl = norm(new URLSearchParams(location.search).get('lang'));
  const browser = (navigator.languages || [navigator.language]).map(norm).find(Boolean) || 'en';
  let lang = fromUrl || stored || browser;
  if (fromUrl) { try { localStorage.setItem('fb.lang', fromUrl); } catch {} }
  const t = (key, en, vars) => fill((S[lang] && S[lang][key]) || en || key, vars);
  function apply(root = document) {
    document.documentElement.lang = LANGS[lang].html;
    root.querySelectorAll('[data-i18n]').forEach(el => { if (el.dataset.en == null) el.dataset.en = el.textContent; el.textContent = t(el.dataset.i18n, el.dataset.en); });
    root.querySelectorAll('[data-i18n-html]').forEach(el => { if (el.dataset.en == null) el.dataset.en = el.innerHTML; el.innerHTML = t(el.dataset.i18nHtml, el.dataset.en); });
    root.querySelectorAll('[data-i18n-ph]').forEach(el => { if (el.dataset.enPh == null) el.dataset.enPh = el.placeholder; el.placeholder = t(el.dataset.i18nPh, el.dataset.enPh); });
    document.querySelectorAll('.lang-switch button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  }
  function set(next) { next = norm(next) || 'en'; lang = next; try { localStorage.setItem('fb.lang', next); } catch {} apply(); document.dispatchEvent(new CustomEvent('hub:lang', { detail: { lang } })); }
  function switcher() {
    return `<span class="lang-switch" role="group" aria-label="Language · 语言">${Object.entries(LANGS).map(([k, v]) => `<button type="button" data-lang="${k}" lang="${v.html}" aria-pressed="${k === lang}">${v.label}</button>`).join('')}</span>`;
  }
  document.addEventListener('click', e => { const b = e.target.closest('.lang-switch button'); if (b) set(b.dataset.lang); });
  window.HubI18n = { get lang() { return lang; }, t, apply, set, switcher, LANGS };
  const boot = () => { document.querySelectorAll('[data-lang-switch]').forEach(el => { el.innerHTML = switcher(); }); apply(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
