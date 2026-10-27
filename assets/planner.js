'use strict';

// Dados editoriais ficam separados das escolhas feitas no aparelho.
const TripPlanner = (() => {
  const $ = s => document.querySelector(s);
  const el = (tag, cls, value) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (value != null) n.textContent = value;
    return n;
  };
  const certainty = {identified:'Local identificado',probable:'Ponto provável',alternative:'Alternativa',unknown:'Não localizado'};
  const feasibility = {fits:'Cabe na rota',adapt:'Precisa adaptar',optional:'Desvio / extra',blocked:'Fora da captação',unlocated:'Sem spot comprovado',otherday:'Em outro dia'};
  const sectionNames = {content:'Conteúdos',spots:'Fotos & spots',route:'Rota',decisions:'Pendências',refs:'Refs salvas'};
  const storageKey = 'trip-review-v2';
  const state = {choices:{},photos:{},takes:{},notes:{},videos:{}};
  let plan, trip, plans=[], allPhotos=[], allVideos=[], spotIndex=new Map(), current = {day:'paris-27',section:'content',anchor:''};
  let renderVersion = 0, images = {}, oldDone = {}, modalPhotos = [], modalIndex = 0;
  const loads = new Map();
  let spotFilter = 'base', search = '', auditFilter = 'all';

  function toast(message) {
    $('#toast').textContent = message; $('#toast').classList.add('show');
    clearTimeout(toast.timer); toast.timer = setTimeout(() => $('#toast').classList.remove('show'), 3500);
  }
  function restore() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
      for (const k of Object.keys(state)) if (saved[k] && typeof saved[k] === 'object' && !Array.isArray(saved[k])) state[k] = saved[k];
      oldDone = JSON.parse(localStorage.getItem('ck-done') || '{}');
      if (!oldDone || typeof oldDone !== 'object' || Array.isArray(oldDone)) oldDone = {};
      const theme = localStorage.getItem('trip-theme');
      if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
    } catch { $('#local-status').textContent = 'Escolhas temporárias'; }
  }
  function save() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
      $('#local-status').textContent = 'Salvo neste aparelho';
    } catch { $('#local-status').textContent = 'Sem salvar'; toast('O navegador não conseguiu salvar. Exporte a revisão para guardar as escolhas.'); }
  }
  function load(file) {
    if (!loads.has(file)) loads.set(file, fetch(file).then(r => {
      if (!r.ok) throw Error('Falha ao abrir '+file);
      return r.json();
    }).catch(e => { loads.delete(file); throw e; }));
    return loads.get(file);
  }
  async function loadPhotos(files) {
    const results = await Promise.allSettled([...new Set(files)].filter(f => f !== 'ck-qua-28-10.json').map(async f => Object.assign(images, await load(f))));
    paintImages();
    if (results.some(r => r.status === 'rejected')) toast('Algumas imagens não carregaram. Reabra o dia com conexão.');
  }
  function imageNode(id, alt, eager = false) {
    const n = el('img'); n.dataset.photoId = id; n.alt = alt; n.loading = eager ? 'eager' : 'lazy';
    if (images[id]) n.src = images[id];
    return n;
  }
  function paintImages() {
    document.querySelectorAll('img[data-photo-id]').forEach(n => {
      const src = images[n.dataset.photoId]; if (src && !n.hasAttribute('src')) n.src = src;
    });
  }
  function link(label, href, cls) {
    const a = el('a', cls, label); a.href = href;
    if (/^https:\/\//.test(href)) { a.target = '_blank'; a.rel = 'noopener'; }
    return a;
  }
  function button(label, action, cls = 'button') {
    const b = el('button', cls, label); b.type = 'button'; b.onclick = action; return b;
  }
  function pill(text, type = '') { return el('span', 'pill '+type, text); }
  function counted(n,singular,plural=singular+'s') { return n+' '+(n===1?singular:plural); }
  function dayBy(id) { return plans.find(d=>d.id===id); }
  function dayHref(section,anchor='',day=current.day) { return '#'+day+'/'+section+(anchor?'/'+anchor:''); }
  function spotBy(id) { return spotIndex.get(id); }
  function refBy(id) { return plan.references.find(r => r.id === id); }
  function spotHref(id) { return dayHref('spots',id,spotBy(id)?.dayId||current.day); }
  function spotPhotos(id) { return allPhotos.filter(p => p.spotId === id || p.alternativeSpotId === id); }
  function photoFeasibility(p) { return p.dayId && p.dayId!==current.day?'otherday':p.feasibility; }
  function mapUrl(spot) { return 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(spot.query); }
  function directions(from, to, mode = 'walking', waypoints = []) {
    const u = new URL('https://www.google.com/maps/dir/');
    u.searchParams.set('api','1'); u.searchParams.set('origin',from.query); u.searchParams.set('destination',to.query);
    u.searchParams.set('travelmode',mode);
    if (waypoints.length) u.searchParams.set('waypoints',waypoints.map(s=>s.query).join('|'));
    return u.href;
  }
  function choice(s) {
    if (s.id === 'tower') return 'keep';
    const value = state.choices[s.id];
    return ['keep','maybe','cut'].includes(value) ? value : s.mode === 'core' ? 'keep' : s.mode === 'optional' ? 'maybe' : 'cut';
  }
  function photoState(p) {
    const saved = state.photos[p.id];
    return {use: saved?.use ?? p.selected ?? (['fits','adapt'].includes(p.feasibility) && ['must','mine'].includes(p.originalPriority)),done:saved?.done ?? !!oldDone[p.id]};
  }
  function videoEnabled(v) { return state.videos[v.id] ?? !v.optional; }
  function setVideo(v,value) {
    state.videos[v.id]=value;save();
    document.querySelectorAll('[data-video-switch]').forEach(cb=>{if(cb.dataset.videoSwitch===v.id){cb.checked=value;cb.closest('article')?.classList.toggle('optional-inactive',!value);}});
    refreshRouteProgress(true);updateNavProgress();
  }
  function routeIds(r) { return r.spots.filter(id => choice(spotBy(id)) !== 'cut'); }

  function captureSpotIds(r) {
    return [...new Set([...routeIds(r),...(r.captureSpots || []).filter(id=>choice(spotBy(id))!=='cut')])];
  }
  function routeCaptures(r,day=plan) {
    const ids=new Set(captureSpotIds(r)),takes=new Map();
    day.videos.filter(videoEnabled).forEach(video=>video.takes.filter(t=>ids.has(t.spotId)).forEach(take=>{
      if(!takes.has(take.id))takes.set(take.id,{type:'take',id:take.id,spotId:take.spotId,take,videos:[]});
      takes.get(take.id).videos.push(video);
    }));
    return [...takes.values(),...day.photos.filter(p=>ids.has(p.spotId)&&photoState(p).use).map(photo=>({type:'photo',id:photo.id,spotId:photo.spotId,photo}))];
  }
  function captureDone(item) { return item.type==='take'?!!state.takes[item.id]:photoState(item.photo).done; }
  function captureStats(items) {
    const takes=items.filter(c=>c.type==='take'),photos=items.filter(c=>c.type==='photo');
    return {total:items.length,done:items.filter(captureDone).length,takes:takes.length,takesDone:takes.filter(captureDone).length,photos:photos.length,photosDone:photos.filter(captureDone).length};
  }
  function setPhoto(p,key,value) {
    state.photos[p.id]={...photoState(p),[key]:value};save();syncPhotoCards(p);refreshRouteProgress(key==='use');updateNavProgress();
  }
  function syncTakeRows() {
    document.querySelectorAll('[data-take-id]').forEach(row=>{
      const done=!!state.takes[row.dataset.takeId];row.classList.toggle('done',done);row.querySelector('input').checked=done;
    });
    document.querySelectorAll('[data-video-id] > summary').forEach(summary=>{
      const video=plan.videos.find(v=>v.id===summary.parentElement.dataset.videoId);
      summary.textContent=videoSummary(video);
    });
    document.querySelectorAll('[data-video-progress]').forEach(node=>{
      const video=plan.videos.find(v=>v.id===node.dataset.videoProgress);node.textContent=videoTripProgress(video);
    });
    updateNavProgress();
  }


  function parseHash() {
    const parts = location.hash.slice(1).split('/');
    const requested=trip.aliases[parts[0]]||parts[0],day=dayBy(requested)?requested:'paris-27';
    const section = parts[1] === 'reels' ? 'content' : Object.hasOwn(sectionNames, parts[1]) ? parts[1] : 'content';
    return {day,section,anchor:parts[2] || ''};
  }


  function nav() {
    const host = $('#days'); host.replaceChildren();
    const links=el('div','day-links');
    plans.forEach(d => {
      const a = link(d.label,dayHref('content','',d.id),'day'+(current.day===d.id?' active':''));a.dataset.dayId=d.id;
      if (current.day===d.id) a.setAttribute('aria-current','page');
      links.append(a);
    });
    const jump=el('select','day-jump');jump.setAttribute('aria-label','Ir para um dia da viagem');const placeholder=el('option',null,'Datas');placeholder.value='';placeholder.disabled=true;placeholder.selected=true;jump.append(placeholder);
    plans.forEach(d=>{const option=el('option',null,d.label);option.value=d.id;jump.append(option);});
    jump.onchange=()=>{location.hash=dayHref(current.section,'',jump.value);};host.append(links,jump);
    updateNavProgress();
    host.querySelector('.active')?.scrollIntoView({block:'nearest',inline:'nearest'});
  }

  function updateNavProgress() {
    document.querySelectorAll('#days [data-day-id]').forEach(a=>{
      const day=dayBy(a.dataset.dayId),items=[...new Map(day.route.filter(r=>routeIds(r).length).flatMap(r=>routeCaptures(r,day)).map(c=>[c.type+':'+c.id,c])).values()],counts=captureStats(items);
      a.querySelector('.day-progress')?.remove();
      if(counts.done){const badge=el('span','day-progress',counts.done===counts.total?'✓':counts.done+'/'+counts.total);badge.setAttribute('aria-label',counts.done+' de '+counts.total+' captações');a.append(badge);}
    });
  }

  function hero() {
    const h = el('header','day-heading'), copy = el('div');
    const date=new Date(plan.date+'T12:00:00Z').toLocaleDateString('pt-BR',{day:'numeric',month:'long',timeZone:'UTC'});
    copy.append(el('p','eyebrow','Plano de captação · '+date),el('h1',null,plan.city));
    const meta = el('div','day-meta');
    meta.append(pill(plan.id==='paris-27'?'Em revisão':'Proposta','em'));
    meta.append(link(plan.headerLabel||plan.focus,dayHref('route'),'fixed-time'));
    h.append(copy,meta);return h;
  }

  function compact(text, limit = 100) {
    const value = String(text || '').replace(/\s+/g,' ').trim();
    if(value.length <= limit) return value;
    return value.slice(0,limit-1).replace(/\s+\S*$/,'')+'…';
  }
  function titleOf(spot) { return spot.displayTitle || spot.title; }
  function disclosure(label, content, cls = '') {
    const details = el('details','disclosure '+cls);
    details.append(el('summary',null,label),content);
    return details;
  }
  function sectionHeading(title, action) {
    const row=el('div','section-heading');row.append(el('h2',null,title));if(action)row.append(action);return row;
  }
  function cover(ids, label, cls = '') {
    const c=el('div','content-cover '+cls);
    ids.forEach(id=>c.append(imageNode(id,label)));
    if(!ids.length)c.append(el('span','cover-placeholder',label));
    return c;
  }


  function subnav() {
    const n = el('nav','section-nav');n.setAttribute('aria-label','Organização do dia');
    ['content','spots','route'].forEach(key=>{
      const a=link(sectionNames[key],'#'+current.day+'/'+key,current.section===key?'active':'');
      if(current.section===key)a.setAttribute('aria-current','page');n.append(a);
    });
    const more=el('details','more-menu');more.append(el('summary',null,'Mais'));
    const menu=el('div','more-options');
    menu.append(link('Refs salvas','#'+current.day+'/refs'));
    menu.append(link('Pendências e notas',dayHref('decisions')));
    menu.append(link('Site anterior ↗','arquivo.html'));
    more.append(menu);n.append(more);return n;
  }


  async function render() {
    const version = ++renderVersion,previous=current.day;current = parseHash();plan=dayBy(current.day);
    if(previous!==current.day){spotFilter='base';search='';auditFilter='all';}
    nav();
    const main=$('#main');main.replaceChildren();
    main.append(hero(),subnav());
    if(current.section==='content')renderVideos(main);
    if(current.section==='spots')renderSpots(main);
    if(current.section==='route')renderRoute(main);
    if(current.section==='decisions')renderDecisions(main);
    if(current.section==='refs')renderReferences(main);
    loadPhotos(plan.imageFiles);
    paintImages();
    if(current.anchor){
      requestAnimationFrame(()=>{
        let target=document.getElementById(current.anchor);
        if(!target&&current.section==='spots'&&spotBy(current.anchor)){
          spotFilter='all';search='';
          const searchBox=document.querySelector('[aria-label="Buscar spots e fotos"]');if(searchBox)searchBox.value='';
          const filter=document.querySelector('[aria-label="Filtrar spots"]');if(filter){filter.value='all';filter.dispatchEvent(new Event('change'));}
          target=document.getElementById(current.anchor);paintImages();
        }
        if(target){
          if(target.tagName==='DETAILS')target.open=true;
          const script=target.querySelector('.reel-script,.route-captures');if(script)script.open=true;
          target.scrollIntoView();
        }
      });
    } else window.scrollTo({top:0});
  }

  function constraints() {
    const grid=el('div','constraint-grid');
    plan.constraints.forEach(c=>{const b=el('div','constraint');b.append(el('h3',null,c.title),el('p',null,c.detail));grid.append(b);});return grid;
  }

  function renderSpots(main) {
    main.append(sectionHeading('Fotos & spots',link('Arquivo de refs',dayHref('spots','audit'),'quiet-link')));
    const tools=el('div','tools'),q=el('input');q.type='search';q.placeholder='Buscar lugar ou foto';q.setAttribute('aria-label','Buscar spots e fotos');q.value=search;
    const select=el('select');select.setAttribute('aria-label','Filtrar spots');
    [['base','No caminho'],['all','Todos os spots'],['outside','Desvios']].forEach(([v,t])=>{const o=el('option',null,t);o.value=v;select.append(o);});select.value=spotFilter;
    const container=el('div','spot-grid');
    const update=()=>{
      container.replaceChildren();
      const list=plan.spots.filter(s=>(spotFilter==='all'||(spotFilter==='base'?s.mode!=='outside':s.mode==='outside'))&&matchesSpot(s,q.value));
      if(!list.length)container.append(el('p','empty','Nenhum spot com esse filtro.'));
      list.forEach(s=>container.append(spotCard(s)));paintImages();
    };
    q.oninput=()=>{search=q.value;update();};select.onchange=()=>{spotFilter=select.value;update();};tools.append(q,select);main.append(tools,container);update();
    const explanation=el('div');explanation.append(el('p',null,'“Local identificado” reconhece o cenário, sem comprovar a posição exata da câmera. “Alternativa” propõe um lugar real para adaptar uma ref cuja origem não foi fechada.'),constraints());
    main.append(disclosure('Como ler os spots',explanation,'supporting'),auditGallery());
  }

  function matchesSpot(s,text) {
    const q=text.toLocaleLowerCase('pt-BR').trim();if(!q)return true;
    return [s.title,s.where,s.area,...spotPhotos(s.id).flatMap(p=>[p.title,p.id,p.note])].join(' ').toLocaleLowerCase('pt-BR').includes(q);
  }

  function spotCard(s) {
    const card=el('article','spot-card'+(choice(s)==='cut'?' cut':''));card.id=s.id;
    const photos=spotPhotos(s.id).sort((a,b)=>({mine:0,must:1,insp:2}[a.originalPriority])-({mine:0,must:1,insp:2}[b.originalPriority]));
    const gallery=el('div','spot-preview');
    photos.slice(0,3).forEach(p=>{
      const b=button('',()=>openPhoto(p,photos),'spot-preview-image');b.setAttribute('aria-label','Ver ref '+p.id+' e o ponto de captura');
      b.append(imageNode(p.id,p.title));gallery.append(b);
    });
    if(photos.length){
      if(photos.every(p=>p.spotId!==s.id||p.precision==='alternative'||p.precision==='unknown'))gallery.append(el('span','media-note','Ref de estilo · local proposto'));
      card.append(gallery);
    }
    const body=el('div','spot-body'),meta=el('div','card-meta');
    meta.append(el('span',null,s.displayTime||compact(s.window,35)),el('span','certainty '+s.certainty,certainty[s.certainty]));
    body.append(meta,el('h3',null,titleOf(s)),el('p','card-summary',s.summary||compact(s.camera)));
    const related=plan.videos.filter(v=>v.takes.some(t=>t.spotId===s.id));
    const meta2=el('div','minor-meta');
    if(photos.length)meta2.append(el('span',null,counted(photos.length,'foto')));
    if(related.length)meta2.append(el('span',null,related.length+' Reel'+(related.length>1?'s':'')));
    if(s.mode==='outside')meta2.append(el('span','warning-text','Exige desvio'));
    if(s.mode==='optional')meta2.append(el('span',null,'Opcional'));
    body.append(meta2);
    const actions=el('div','card-actions');
    if(s.query)actions.append(link(s.certainty==='alternative'?'Mapa da adaptação ↗':'Mapa ↗',mapUrl(s),'button small'));else actions.append(el('span','subtle','Ponto de encontro a confirmar'));
    related.forEach(v=>actions.append(link(v.id+' · roteiro',dayHref('content',v.id),'quiet-link')));body.append(actions);
    const full=el('div','details-body'),dl=el('dl','definition');
    [['Onde ficar',s.where],['Como enquadrar',s.camera],['Acesso',s.access]].forEach(([t,v])=>dl.append(el('dt',null,t),el('dd',null,v)));full.append(dl);
    if(s.alternative)full.append(el('p','subtle','Plano B: '+s.alternative));
    const controls=el('div','spot-controls'),label=el('label',null,'Prioridade');label.htmlFor='choice-'+s.id;const pick=el('select');pick.id=label.htmlFor;
    [['keep','Captar'],['maybe','Se sobrar'],['cut','Fora desta versão']].forEach(([v,t])=>{const o=el('option',null,t);o.value=v;pick.append(o);});pick.value=choice(s);
    if(s.id==='tower'){pick.disabled=true;pick.setAttribute('aria-label','Compromisso fixo confirmado');}
    pick.onchange=()=>{state.choices[s.id]=pick.value;save();card.classList.toggle('cut',pick.value==='cut');updateNavProgress();};controls.append(label,pick);full.append(controls);
    if(photos.length){const grid=el('div','photo-grid');photos.forEach(p=>grid.append(photoCard(p,photos)));full.append(disclosure('Escolher fotos · '+photos.length,grid));}
    if(s.sources.length){const source=el('div');s.sources.forEach(id=>{const src=plan.sources.find(x=>x.id===id);if(src)source.append(link(src.title+' ↗',src.url),el('p','subtle',src.supports));});full.append(disclosure('Fontes da localização',source));}
    const instructions=disclosure('Como captar',full,'spot-details');instructions.setAttribute('name','spot-instructions');
    body.append(instructions);card.append(body);return card;
  }


  function photoCard(p,list=plan.photos,captureOnly=false) {
    const ps=photoState(p),card=el('figure','photo'+(ps.done?' is-done':''));card.dataset.refId=p.id;
    const open=button('',()=>openPhoto(p,list),'photo-open');open.setAttribute('aria-label','Ver ref '+p.id+' e o ponto de captura');
    open.append(imageNode(p.id,p.title),el('span','photo-index',p.id.startsWith('pa-')||p.id.startsWith('jp-')?p.id:'#'+p.index));card.append(open);
    const caption=el('figcaption','photo-label'),place=spotBy(p.spotId);
    caption.append(el('strong',null,place?titleOf(place):p.feasibility==='blocked'?'Fora deste dia':'Local a confirmar'));
    caption.append(el('small','certainty '+p.precision,p.feasibility==='blocked'?feasibility[p.feasibility]:certainty[p.precision]));
    if(p.dayId&&p.dayId!==current.day)caption.append(link(dayBy(p.dayId)?.label||'Outro dia',dayHref('spots',p.spotId||'audit',p.dayId),'photo-day-link'));
    card.append(caption);
    const checks=el('div','photo-checks');(captureOnly?[['done','Captada']]:[['use','Selecionar'],['done','Captada']]).forEach(([key,title])=>{
      const label=el('label'),cb=el('input');cb.type='checkbox';cb.checked=ps[key];cb.dataset.photoAction=key;cb.setAttribute('aria-label',title+' · ref '+p.id);
      cb.onchange=()=>setPhoto(p,key,cb.checked);
      label.append(cb,document.createTextNode(title));checks.append(label);
    });card.append(checks);return card;
  }

  function syncPhotoCards(p) {
    const now=photoState(p);
    document.querySelectorAll('figure[data-ref-id]').forEach(node=>{
      if(node.dataset.refId!==p.id)return;node.classList.toggle('is-done',now.done);
      node.querySelectorAll('input[data-photo-action]').forEach(input=>{input.checked=now[input.dataset.photoAction];});
    });
  }


  function auditGallery() {
    const audit=plan.auditPhotos;
    const details=el('details','disclosure audit');details.id='audit';details.append(el('summary',null,'Arquivo de fotos · '+audit.length));
    const body=el('div','details-body'),controls=el('div','tools'),select=el('select');select.setAttribute('aria-label','Filtrar referências por viabilidade');
    [['all','Todas'],['selected','Selecionadas'],['done','Captadas'],...Object.entries(feasibility)].forEach(([v,t])=>{const o=el('option',null,t);o.value=v;select.append(o);});select.value=auditFilter;
    const grid=el('div','photo-grid audit-grid');
    const update=()=>{
      grid.replaceChildren();const list=audit.filter(p=>auditFilter==='all'||(auditFilter==='selected'?photoState(p).use:auditFilter==='done'?photoState(p).done:photoFeasibility(p)===auditFilter));
      list.forEach(p=>grid.append(photoCard(p,list)));if(!list.length)grid.append(el('p','empty','Nenhuma foto com este filtro.'));paintImages();
    };
    select.onchange=()=>{auditFilter=select.value;update();};controls.append(select);body.append(controls,grid);details.append(body);
    let built=false;details.addEventListener('toggle',()=>{if(details.open&&!built){built=true;update();}});return details;
  }

  function openPhoto(p,list) {
    modalPhotos=list;modalIndex=Math.max(0,list.findIndex(x=>x.id===p.id));paintModal();
    if(!$('#lightbox').open)$('#lightbox').showModal();
  }

  function paintModal() {
    const p=modalPhotos[modalIndex];if(!p)return;
    const host=$('#light-content');host.replaceChildren();const layout=el('div','light-layout'),info=el('div','light-info');layout.append(imageNode(p.id,p.title,true));
    const spot=spotBy(p.spotId),alternative=spotBy(p.alternativeSpotId);
    info.append(el('p','eyebrow','Ref '+p.id),el('h2',null,spot?titleOf(spot):p.feasibility==='blocked'?'Fora deste dia':'Local a confirmar'));
    const pills=el('div','pills');pills.append(pill(certainty[p.precision]),pill(feasibility[photoFeasibility(p)],p.feasibility==='blocked'?'warn':''));info.append(pills);
    if(p.dayId&&p.dayId!==current.day){const target=link('Captar em '+dayBy(p.dayId).label,dayHref('spots',p.spotId||'audit',p.dayId),'quiet-link');target.onclick=()=>$('#lightbox').close();info.append(target);}
    if(spot){info.append(el('p','modal-caption',p.precision==='alternative'?compact(p.note,190):spot.summary||compact(spot.camera,130)));if(spot.query)info.append(link(p.precision==='alternative'?'Mapa da adaptação ↗':'Abrir spot no Maps ↗',mapUrl(spot),'button primary'));}
    else info.append(el('p','modal-caption',compact(p.note,180)));
    if(alternative){info.append(el('p','subtle','Alternativa: '+titleOf(alternative)));if(alternative.query)info.append(link('Mapa da alternativa ↗',mapUrl(alternative),'button'));}
    const checks=el('div','photo-checks modal-checks');
    if(allPhotos.some(x=>x.id===p.id)){
      [['use','Selecionar foto'],['done','Foto captada']].forEach(([key,text])=>{
        const label=el('label'),cb=el('input');cb.type='checkbox';cb.checked=photoState(p)[key];cb.setAttribute('aria-label',text+' · '+p.id);
        cb.onchange=()=>setPhoto(p,key,cb.checked);label.append(cb,document.createTextNode(text));checks.append(label);
      });info.append(checks);
    }
    const full=el('div','details-body');full.append(el('p',null,p.note));
    if(spot){const dl=el('dl','definition');[['Onde ficar',spot.where],['Como enquadrar',spot.camera],['Acesso',spot.access]].forEach(([t,v])=>dl.append(el('dt',null,t),el('dd',null,v)));full.append(dl);}
    full.append(el('p','subtle','Pasta original: '+p.originalLocation));
    if(/^\d+$/.test(p.id))full.append(link('Fonte no Pinterest ↗','https://www.pinterest.com/pin/'+p.id+'/'));
    info.append(disclosure('Ver localização e análise',full));
    const arrows=el('div','light-arrows');const prev=button('←',()=>stepPhoto(-1));prev.setAttribute('aria-label','Foto anterior');const next=button('→',()=>stepPhoto(1));next.setAttribute('aria-label','Próxima foto');
    arrows.append(prev,el('span','subtle',(modalIndex+1)+' / '+modalPhotos.length),next);info.append(arrows);layout.append(info);host.append(layout);paintImages();
  }

  function stepPhoto(delta){modalIndex=(modalIndex+delta+modalPhotos.length)%modalPhotos.length;paintModal();}


  function renderVideos(main) {
    const core=plan.videos.filter(v=>!v.optional).sort((a,b)=>Number(a.allTakes.length>a.takes.length)-Number(b.allTakes.length>b.takes.length));
    main.append(sectionHeading('Vídeos para este dia',el('span','subtle',counted(core.length,'roteiro'))));
    const grid=el('div','content-grid');grid.dataset.count=core.length;core.forEach(v=>grid.append(videoCard(v)));main.append(grid);
    const optional=plan.videos.filter(v=>v.optional);
    if(optional.length){main.append(sectionHeading('Se fizer sentido',el('span','subtle','Opcionais · você ativa')));const extras=el('div','content-grid');extras.dataset.count=optional.length;optional.forEach(v=>extras.append(videoCard(v)));main.append(extras);}
    const selected=link('Ver fotos do dia →',dayHref('spots','audit'),'quiet-link');selected.onclick=()=>{auditFilter='selected';};
    const photos=el('div','photo-grid featured-photos');const list=(plan.presentation?.featuredPhotos||[]).map(id=>plan.photos.find(p=>p.id===id)).filter(Boolean);
    if(list.length){main.append(sectionHeading('Fotos em destaque',selected));list.forEach(p=>photos.append(photoCard(p,list)));main.append(photos);}
    if(plan.itinerarySource){const note=el('div','details-body');note.append(el('p',null,plan.itinerarySource),el('p',null,'Uma proposta de captação sobre o roteiro enviado. Horários de ingresso/voo precisam ser conferidos nas reservas; o conteúdo acompanha o passeio.'),link('Ver pendências do dia',dayHref('decisions'),'quiet-link'));main.append(disclosure('Base do planejamento',note,'supporting'));}
  }

  function videoSummary(v) { return (v.allTakes.length>v.takes.length?'Ver captação de hoje':'Ver roteiro')+' · '+v.takes.filter(t=>state.takes[t.id]).length+'/'+counted(v.takes.length,'take'); }
  function videoTripProgress(v) { return 'Vídeo da viagem · '+v.allTakes.filter(t=>state.takes[t.id]).length+'/'+v.allTakes.length+' takes no total'; }

  function videoCard(v) {
    const article=el('article','content-card'+(v.optional&&!videoEnabled(v)?' optional-inactive':''));article.id=v.id;const ref=refBy(v.references[0]);
    const frameId=(v.coverIds||[]).find(id=>id.startsWith('ig-')&&v.references.includes(id.slice(3))),frameRef=frameId?refBy(frameId.slice(3)):ref;
    const media=link('',frameRef.url,'cover-link');media.setAttribute('aria-label','Ver Reel de referência: '+v.title);
    media.append(cover(v.coverIds||(plan.hero?[plan.hero]:[]),v.displayTitle||v.title));
    const label=v.coverIds?.length&&v.coverIds.every(id=>id.startsWith('ig-')&&v.references.includes(id.slice(3)))?'Frame da referência':'Referência visual';
    media.append(el('span','cover-label',label),el('span','cover-play','Ver ref ↗'));article.append(media);
    const body=el('div','content-body'),meta=el('div','card-meta');meta.append(el('span',null,v.id+' · '+(v.displayType||v.type)),el('span',null,v.displayDuration||v.duration));
    body.append(meta,el('h3',null,v.displayTitle||v.title),el('p','card-summary',v.summary||compact(v.hook)));
    const places=[...new Set(v.takes.map(t=>spotBy(t.spotId).area.split(' · ')[0]))];body.append(el('p','content-location',v.placesLabel||compact(places.join(' · '),70)));
    if(v.allTakes.length>v.takes.length){const progress=el('p','video-trip-progress',videoTripProgress(v));progress.dataset.videoProgress=v.id;body.append(progress);}
    if(v.optional){const toggle=el('label','video-toggle'),cb=el('input');cb.type='checkbox';cb.checked=videoEnabled(v);cb.dataset.videoSwitch=v.id;cb.setAttribute('aria-label','Incluir '+(v.displayTitle||v.title)+' na captação');cb.onchange=()=>setVideo(v,cb.checked);toggle.append(cb,document.createTextNode('Incluir na captação'));body.append(toggle);}
    const script=el('div','details-body');script.append(el('p',null,v.hook));
    const refs=el('div','ref-links');v.references.forEach(id=>{const r=refBy(id);if(r)refs.append(link(r.origin+' · '+compact(r.title,45)+' ↗',r.url,'quiet-link'));});script.append(refs);
    v.takes.forEach(t=>script.append(takeRow(t,'content-'+v.id)));
    if(v.allTakes.length>v.takes.length){
      const others=el('div','details-body');
      plans.filter(d=>d.id!==current.day&&v.allTakes.some(t=>t.dayId===d.id)).forEach(d=>{const takes=v.allTakes.filter(t=>t.dayId===d.id);others.append(link(d.label+' · '+takes.filter(t=>state.takes[t.id]).length+'/'+takes.length,dayHref('content',v.id,d.id),'other-day-link'));});
      script.append(disclosure('Outros dias deste vídeo',others));
    }
    const edit=el('div','details-body');[['Edição',v.edit],['Áudio',v.audio],['Adaptação',v.adaptation]].forEach(([label,text])=>edit.append(el('h4',null,label),el('p',null,text)));
    script.append(disclosure('Edição e áudio',edit));
    const panel=disclosure(videoSummary(v),script,'reel-script');panel.dataset.videoId=v.id;panel.setAttribute('name','reel-scripts');
    body.append(panel);article.append(body);return article;
  }

  function takeRow(t,context='content') {
    const row=el('div','take'+(state.takes[t.id]?' done':'')),cb=el('input');row.dataset.takeId=t.id;
    cb.type='checkbox';cb.checked=!!state.takes[t.id];cb.id=context+'-take-'+t.id;cb.setAttribute('aria-label','Gravado: '+t.text);
    cb.onchange=()=>{
      state.takes[t.id]=cb.checked;save();syncTakeRows();refreshRouteProgress();
    };
    const body=el('div'),label=el('label');label.htmlFor=cb.id;label.append(el('p',null,t.text));const spot=spotBy(t.spotId);
    body.append(label,link(titleOf(spot)+' · '+t.seconds+'s',spotHref(spot.id),'quiet-link'));row.append(cb,body);return row;
  }

  function routeSketch() {
    const box=el('div','route-sketch');
    if(current.day!=='paris-27'){
      const list=el('ol','sequence-list');plan.route.forEach(r=>list.append(el('li',null,r.time+' · '+r.title)));
      box.append(list,el('p',null,'Sequência de planejamento, sem escala ou tráfego em tempo real. Blocos condicionais e trajetos sem origem confirmada não são reservas.'));return box;
    }
    // Esquema de sequência, deliberadamente sem pinos que finjam exatidão fotográfica.
    box.innerHTML='<svg viewBox="0 0 520 260" role="img" aria-label="Sequência esquemática: Louvre, Palais-Royal, Arco, Trocadéro, Torre, Sena e Bir-Hakeim"><path d="M30 220 C95 185 130 240 180 205 S280 110 365 135 S455 190 510 160" fill="none" stroke="var(--blue)" stroke-width="15" opacity=".12"/><path d="M430 110 L455 70 L250 35 L105 95 L160 170 L95 225" fill="none" stroke="var(--accent)" stroke-width="2" stroke-dasharray="5 5"/><g><circle class="point" cx="430" cy="110" r="11"/><text class="point-text" x="426" y="114">1</text><text x="437" y="139">Louvre</text><circle class="point" cx="455" cy="70" r="11"/><text class="point-text" x="451" y="74">2</text><text x="380" y="54">Palais-Royal</text><circle class="point" cx="250" cy="35" r="11"/><text class="point-text" x="246" y="39">3</text><text x="220" y="62">Arco</text><circle class="point" cx="105" cy="95" r="11"/><text class="point-text" x="101" y="99">4</text><text x="29" y="78">Trocadéro</text><circle class="point" cx="160" cy="170" r="11"/><text class="point-text" x="156" y="174">5</text><text x="176" y="175">Torre · 16h40</text><circle class="point" cx="95" cy="225" r="11"/><text class="point-text" x="91" y="229">6</text><text x="113" y="235">Bir-Hakeim</text></g></svg>';
    box.append(el('p',null,'Esquema da sequência base, sem escala. Traços não representam ruas nem rotas calculadas. Os deslocamentos estão nos links abaixo.'));return box;
  }

  function renderRoute(main) {
    main.append(sectionHeading('Rota do dia',el('span','subtle','Horários estimados')));
    const progress=el('section','capture-progress');progress.setAttribute('aria-label','Progresso de captação');
    const top=el('div','capture-progress-top'),copy=el('div');copy.append(el('p','eyebrow','Captação do dia'));
    const total=el('strong');total.id='capture-total';total.setAttribute('aria-live','polite');total.setAttribute('aria-atomic','true');copy.append(total);
    const percent=el('span','capture-percent');percent.id='capture-percent';top.append(copy,percent);
    const bar=el('progress');bar.id='capture-bar';bar.setAttribute('aria-label','Captações concluídas');
    const bottom=el('div','capture-progress-bottom'),breakdown=el('span');breakdown.id='capture-breakdown';
    const nextCapture=link('Próxima pendência ↓',dayHref('route'),'quiet-link');nextCapture.id='next-capture';bottom.append(breakdown,nextCapture);
    progress.append(top,bar,bottom,el('p','storage-note','Takes da rota + fotos selecionadas · salvo neste aparelho'));main.append(progress);
    const fixed=el('div','route-fixed');fixed.append(el('b',null,plan.routeHighlight.primary),el('span',null,plan.routeHighlight.secondary));main.append(fixed);
    if(plan.spots.some(s=>Object.hasOwn(state.choices,s.id)))main.append(el('p','compact-notice','Prioridades alteradas: os horários ainda precisam de revisão.'));
    const outside=plan.spots.filter(s=>s.mode==='outside'&&choice(s)!=='cut');
    if(outside.length)main.append(el('p','compact-notice','Desvio selecionado, ainda sem encaixe: '+outside.map(titleOf).join(', ')+'.'));
    const active=plan.route.filter(r=>routeIds(r).length),list=el('div','route-list');
    active.forEach((r,i)=>{
      const row=el('article','route-row'+(r.fixed?' fixed':'')),mainline=el('div','route-main'),title=el('div');
      row.id='route-'+r.id;row.dataset.routeId=r.id;
      mainline.append(el('span','clock',r.time));title.append(el('h3',null,r.title));
      if(r.optional)title.append(pill('Se couber','warn'));
      if(r.parallel)title.append(pill('Programas paralelos'));
      if(r.suggested)title.append(pill('Ordem sugerida'));
      const content=el('div','details-body');content.append(el('p',null,r.note));const points=el('div','route-spots');
      routeIds(r).forEach(id=>points.append(link(titleOf(spotBy(id)),spotHref(id),'quiet-link')));content.append(points);
      if(r.next)content.append(el('p','subtle',r.next));
      const details=disclosure('Ver paradas e tempo',content,'route-details');title.append(details);mainline.append(title);
      const next=active[i+1];if(next&&!r.noDirections){const from=spotBy(routeIds(r).at(-1)),to=spotBy(routeIds(next)[0]);if(from.query&&to.query)mainline.append(link('Trajeto ↗',directions(from,to,r.mode||'walking'),'button small'));}
      const captures=el('div','route-capture-block'),preview=el('div','capture-preview');preview.dataset.capturePreview=r.id;
      const actions=el('div','capture-actions'),detailsBody=el('div','route-capture-list');
      const capturePanel=disclosure('Ver captações',detailsBody,'route-captures');capturePanel.dataset.capturePanel=r.id;
      const check=el('label','stop-check'),cb=el('input');cb.type='checkbox';cb.dataset.routeCheck=r.id;cb.setAttribute('aria-label','Tudo captado em '+r.title);
      cb.onchange=()=>{
        routeCaptures(r).forEach(item=>{
          if(item.type==='take')state.takes[item.id]=cb.checked;
          else{state.photos[item.id]={...photoState(item.photo),done:cb.checked};syncPhotoCards(item.photo);}
        });save();syncTakeRows();refreshRouteProgress();
      };
      check.append(cb,el('span',null,'Tudo captado'));actions.append(capturePanel,check);captures.append(preview,actions);
      row.append(mainline,captures);list.append(row);
    });main.append(list);
    refreshRouteProgress(true);
    const backup=el('div','details-body');backup.append(el('p',null,plan.backup||'Se atrasar, tirar fotos extras e roteiros opcionais antes de mexer em ingressos, encontros e embarques. Adaptar o take ao lugar já no caminho, sem acrescentar uma volta para imitar a referência.'),link('Ver pendências',dayHref('decisions'),'quiet-link'));
    main.append(disclosure('Se o dia atrasar',backup),disclosure('Ver esquema da sequência',routeSketch()));
  }

  function renderRouteCaptures(r,host) {
    host.replaceChildren();const captures=routeCaptures(r);
    if(!captures.length)host.append(el('p','subtle','Sem takes ou fotos selecionadas nesta parada. A visita não precisa virar vídeo.'));
    captureSpotIds(r).forEach(id=>{
      const items=captures.filter(c=>c.spotId===id);if(!items.length)return;
      const spot=spotBy(id),group=el('section','capture-group'),heading=el('div','capture-group-heading');
      heading.append(el('h4',null,((r.captureSpots||[]).includes(id)?'No deslocamento · ':'')+titleOf(spot)),link('Spot ↗',spotHref(id),'quiet-link'));group.append(heading);
      items.filter(c=>c.type==='take').forEach(c=>{
        const name=el('div','capture-video-heading'),links=el('div','shared-video-links');
        c.videos.forEach(v=>links.append(link(v.id+' · '+(v.displayTitle||v.title),dayHref('content',v.id),'quiet-link')));
        name.append(links);const refVideo=[...c.videos].sort((a,b)=>a.allTakes.length-b.allTakes.length)[0],ref=refBy(refVideo.references[0]);if(ref)name.append(link('Ref · '+refVideo.id+' ↗',ref.url,'quiet-link'));
        group.append(name,takeRow(c.take,'route'));
      });
      const photos=items.filter(c=>c.type==='photo').map(c=>c.photo);
      if(photos.length){group.append(el('p','capture-photo-title','Fotos selecionadas · '+photos.length));const grid=el('div','photo-grid route-photos');photos.forEach(p=>grid.append(photoCard(p,photos,true)));group.append(grid);}
      host.append(group);
    });paintImages();
    const optional=plan.videos.filter(v=>v.optional&&!videoEnabled(v)&&v.takes.some(t=>captureSpotIds(r).includes(t.spotId)));
    optional.forEach(v=>host.append(button('Incluir '+(v.displayTitle||v.title),()=>setVideo(v,true),'button small optional-capture')));
  }

  function refreshRouteProgress(rebuild=false) {
    if(!$('#capture-total'))return;
    const active=plan.route.filter(r=>routeIds(r).length),all=[...new Map(active.flatMap(r=>routeCaptures(r)).map(c=>[c.type+':'+c.id,c])).values()],stats=captureStats(all);
    const percent=stats.total?Math.round(stats.done/stats.total*100):0;
    $('#capture-total').textContent=stats.done+' de '+counted(stats.total,'captação','captações');$('#capture-percent').textContent=percent+'%';
    const bar=$('#capture-bar');bar.max=stats.total||1;bar.value=stats.done;bar.setAttribute('aria-valuetext',stats.done+' de '+stats.total+' captações');
    $('#capture-breakdown').textContent=stats.takesDone+'/'+counted(stats.takes,'take')+' · '+stats.photosDone+'/'+counted(stats.photos,'foto');
    const next=active.find(r=>routeCaptures(r).some(c=>!captureDone(c))),jump=$('#next-capture');
    jump.hidden=!next;if(next)jump.href=dayHref('route','route-'+next.id);
    active.forEach(r=>{
      const row=document.getElementById('route-'+r.id);if(!row)return;
      const items=routeCaptures(r),counts=captureStats(items),complete=counts.total>0&&counts.done===counts.total;
      row.classList.toggle('capture-complete',complete);
      const cb=row.querySelector('[data-route-check]');cb.checked=complete;cb.indeterminate=counts.done>0&&!complete;cb.disabled=!counts.total;
      cb.closest('label').hidden=!counts.total;
      const preview=row.querySelector('[data-capture-preview]');preview.replaceChildren();
      plan.videos.filter(v=>v.takes.some(t=>captureSpotIds(r).includes(t.spotId))).forEach(v=>preview.append(link(v.id+' · '+(v.displayTitle||v.title)+(videoEnabled(v)?'':' · opcional'),dayHref('content',v.id),'capture-chip'+(videoEnabled(v)?'':' inactive'))));
      if(counts.photos)preview.append(el('span','capture-photo-count',counts.photos+' foto'+(counts.photos===1?'':'s')));
      const panel=row.querySelector('[data-capture-panel]');
      panel.querySelector(':scope > summary').textContent=counts.total?'Ver captações · '+counts.done+'/'+counts.total:'Ver detalhes da captação';
      if(rebuild)renderRouteCaptures(r,panel.querySelector('.route-capture-list'));
    });
    updateNavProgress();
  }


  function renderDecisions(main) {
    main.append(sectionHeading('Pendências & notas'));
    if(!plan.decisions.length)main.append(el('p','compact-notice','Nenhuma pendência específica registrada neste bloco. A base continua sendo o roteiro enviado.'));
    plan.decisions.forEach(d=>{
      const content=el('div','details-body');content.append(el('p',null,d.detail),el('p','subtle',d.recommendation));
      const label=el('label',null,'Sua anotação');label.htmlFor='note-'+d.id;const textarea=el('textarea');textarea.id=label.htmlFor;textarea.value=typeof state.notes[d.id]==='string'?state.notes[d.id]:'';
      textarea.placeholder='Registrar decisão';textarea.maxLength=5000;textarea.oninput=()=>{state.notes[d.id]=textarea.value;save();};content.append(label,textarea);
      main.append(disclosure(d.title,content,'decision'));
    });
    const actions=el('div','review-actions');actions.append(button('Exportar progresso da viagem',exportReview),button('Importar progresso',()=>$('#import-file').click()));main.append(actions,el('p','storage-note','Inclui todos os dias. Notas e marcações ficam neste navegador; exportar/importar permite levá-las para outro aparelho.'));
    const sources=el('div','details-body');plan.sources.forEach(s=>{const d=el('div','source');d.append(link(s.title+' ↗',s.url),el('p','subtle',s.supports));sources.append(d);});
    main.append(disclosure('Fontes e base da revisão',sources,'supporting'));
  }


  function renderReferences(main) {
    main.append(sectionHeading('Refs salvas',el('span','subtle','Iagor + Daniel')));
    const grid=el('div','reference-grid');
    const used=new Set(plan.videos.flatMap(v=>v.references));
    plan.references.filter(r=>used.has(r.id)).forEach(r=>{
      const card=el('article','reference');if(r.thumbnail){const media=link('',r.url,'reference-image');media.append(imageNode(r.thumbnail,'Frame da referência '+r.title));card.append(media);}
      const body=el('div','reference-body');body.append(el('p','eyebrow',r.origin+' · '+r.kind),el('h3',null,compact(r.title,65)),link('Ver Reel ↗',r.url,'button small'));
      const detail=el('div','details-body');detail.append(el('p',null,r.summary));if(r.evidence)detail.append(el('p','subtle',r.evidence));plan.videos.filter(v=>v.references.includes(r.id)).forEach(v=>detail.append(link('Roteiro '+v.id,dayHref('content',v.id),'quiet-link')));
      body.append(disclosure('O que aproveitar',detail));card.append(body);grid.append(card);
    });main.append(grid);
    const rest=el('div','details-body');plan.references.filter(r=>!used.has(r.id)).forEach(r=>{const item=el('p');item.append(link(r.title+' ↗',r.url),el('small','subtle',' · '+r.origin));rest.append(item);});
    if(rest.children.length)main.append(disclosure('Outras referências salvas na viagem',rest,'supporting'));
  }


  function preparePlans(paris) {
    const parisSpots=paris.spots.map(s=>({...s,dayId:paris.id}));
    spotIndex=new Map([...parisSpots,...trip.spots].map(s=>[s.id,s]));
    const originalPhotos=paris.photos.map(p=>({...p,dayId:paris.id,originalDayId:paris.id,file:'ck-ter-27-10.json'}));
    allPhotos=[...originalPhotos,...trip.photos];
    const photoIndex=new Map(allPhotos.map(p=>[p.id,p]));
    const originalVideos=paris.videos.map(v=>({...v,takes:v.takes.map(t=>({...t,dayId:paris.id}))}));
    allVideos=[...originalVideos,...trip.videos];
    Object.assign(paris,{label:'Paris · 27/10',focus:'Torre · 16h40 confirmado',headerLabel:'Torre · 16h40',spots:parisSpots,
      routeHighlight:{primary:'16h40 · ingresso da Torre confirmado',secondary:'PDF novo cita 16h00; galeria e jantar a conciliar'},
      backup:'Se atrasar, cortar fotos extras antes do compromisso da Torre. A captação noturna acompanha a saída real. Galeria às 18h00 e jantar às 19h40 do PDF novo ainda precisam ser conciliados.',
      imageFiles:['ck-ter-27-10.json','ck-extras.json']});
    paris.decisions.push({id:'paris-27-new-pdf',title:'Paris no PDF novo × ingresso confirmado',detail:'O PDF recebido em 24/10 traz Torre às 16h00, galeria às 18h00 e jantar às 19h40. O ingresso das 16h40 foi confirmado diretamente em 23/10; a galeria não foi identificada.',recommendation:'Manter o horário confirmado até conferir o bilhete. Não encaixar uma galeria sem nome ou prometer uma saída da Torre às 18h00. A revisão deste dia continua explícita.'});
    plans=[paris,...trip.days].sort((a,b)=>a.date.localeCompare(b.date));
    plans.forEach(d=>{
      d.spots=d.spots.map(s=>typeof s==='string'?spotBy(s):s);
      d.photos=allPhotos.filter(p=>p.dayId===d.id);
      d.auditPhotos=[...new Map([...d.photos,...(d.auditPhotoIds||[]).map(id=>photoIndex.get(id)).filter(Boolean)].map(p=>[p.id,p])).values()];
      d.videos=allVideos.filter(v=>v.takes.some(t=>t.dayId===d.id)).map(v=>({...v,allTakes:v.takes,takes:v.takes.filter(t=>t.dayId===d.id)}));
      d.references=trip.references;
      if(d.id!==paris.id)d.sources=trip.sources.filter(s=>d.sourceIds.includes(s.id));
    });
  }

  function exportReview() {
    const file={schema:'trip-review-v3',scope:'trip',baseDate:trip.updatedAt,exportedAt:new Date().toISOString(),state:{...state,photos:Object.fromEntries(allPhotos.map(p=>[p.id,photoState(p)]))}};
    const url=URL.createObjectURL(new Blob([JSON.stringify(file,null,2)],{type:'application/json'}));const a=link('',''+url);a.download='progresso-viagem-paris-japao.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Revisão exportada com suas escolhas e anotações.');
  }
  async function importReview(file) {
    if(!file)return;
    try{
      if(file.size>1000000)throw Error('Arquivo muito grande');const data=JSON.parse(await file.text());
      if(!['trip-review-v2','trip-review-v3'].includes(data.schema)||!data.state||typeof data.state!=='object'||Array.isArray(data.state))throw Error('Formato diferente');
      if(data.schema==='trip-review-v2'&&data.day!=='paris-27')throw Error('Revisão antiga desconhecida');
      const incoming=data.state;
      for(const s of spotIndex.values())if(['keep','maybe','cut'].includes(incoming.choices?.[s.id])&&s.id!=='tower')state.choices[s.id]=incoming.choices[s.id];
      for(const p of allPhotos){const v=incoming.photos?.[p.id];if(v&&typeof v.use==='boolean'&&typeof v.done==='boolean')state.photos[p.id]={use:v.use,done:v.done};}
      for(const v of allVideos){for(const t of v.takes)if(typeof incoming.takes?.[t.id]==='boolean')state.takes[t.id]=incoming.takes[t.id];if(typeof incoming.videos?.[v.id]==='boolean')state.videos[v.id]=incoming.videos[v.id];}
      for(const d of plans.flatMap(p=>p.decisions))if(typeof incoming.notes?.[d.id]==='string')state.notes[d.id]=incoming.notes[d.id].slice(0,5000);
      save();await render();toast('Revisão importada neste aparelho.');
    }catch{toast('Não foi possível importar. Use um progresso da viagem ou a revisão antiga de Paris exportada por este site.');}
  }
  async function init() {
    restore();
    document.querySelector('.skip').onclick=e=>{e.preventDefault();$('#main').focus();$('#main').scrollIntoView();};
    $('#theme').onclick=()=>{const theme=document.documentElement.dataset.theme==='light'?'dark':'light';document.documentElement.dataset.theme=theme;try{localStorage.setItem('trip-theme',theme);}catch{}};
    $('#light-close').onclick=()=>$('#lightbox').close();$('#lightbox').addEventListener('click',e=>{if(e.target===$('#lightbox')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
    document.addEventListener('keydown',e=>{if(!$('#lightbox').open)return;if(e.key==='ArrowRight')stepPhoto(1);if(e.key==='ArrowLeft')stepPhoto(-1);});
    $('#import-file').onchange=async e=>{await importReview(e.target.files[0]);e.target.value='';};
    try{
      const [paris,bundle]=await Promise.all([load('data/paris-27.json'),load('data/viagem.json')]);trip=bundle;preparePlans(paris);
      await render();
      window.addEventListener('hashchange',render);
      window.addEventListener('storage',e=>{if(e.key===storageKey){restore();render();}});
    }catch(e){const main=$('#main');main.replaceChildren(el('h1',null,'O plano não abriu.'),el('p',null,'Confira a conexão e recarregue a página.'),button('Tentar de novo',()=>location.reload()),link('Consultar site anterior','arquivo.html','button'));}
  }
  return {init};
})();
TripPlanner.init();
