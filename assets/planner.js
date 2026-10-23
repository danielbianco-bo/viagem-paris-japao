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
  const feasibility = {fits:'Cabe na rota',adapt:'Precisa adaptar',optional:'Desvio / extra',blocked:'Fora deste dia',unlocated:'Sem spot comprovado'};
  const sectionNames = {content:'Conteúdos',spots:'Fotos & spots',route:'Rota',decisions:'Pendências',refs:'Refs salvas'};
  const labels = ['Paris · 27/10','Paris · 28/10','Tóquio · 29/10','Fuji · 30/10','Tóquio · 31/10','Tóquio · 01/11','Tóquio · 02/11','Disney · 03/11','Kyoto','Osaka'];
  const storageKey = 'trip-review-v2';
  const state = {choices:{},photos:{},takes:{},notes:{}};
  let model, plan, current = {day:'paris-27',section:'content',anchor:''};
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
  function spotBy(id) { return plan.spots.find(s => s.id === id); }
  function refBy(id) { return plan.references.find(r => r.id === id); }
  function spotHref(id) { return '#paris-27/spots/'+id; }
  function spotPhotos(id) { return plan.photos.filter(p => p.spotId === id); }
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
    return {use: saved?.use ?? (['fits','adapt'].includes(p.feasibility) && ['must','mine'].includes(p.originalPriority)),done:saved?.done ?? !!oldDone[p.id]};
  }
  function routeIds(r) { return r.spots.filter(id => choice(spotBy(id)) !== 'cut'); }


  function parseHash() {
    const parts = location.hash.slice(1).split('/');
    const day = parts[0] === 'paris-27' || /^day-[1-9]$/.test(parts[0]) ? parts[0] : 'paris-27';
    const section = parts[1] === 'reels' ? 'content' : Object.hasOwn(sectionNames, parts[1]) ? parts[1] : 'content';
    return {day,section,anchor:parts[2] || ''};
  }


  function nav() {
    const host = $('#days'); host.replaceChildren();
    model.tabs.forEach((t,i) => {
      const key = i ? 'day-'+i : 'paris-27';
      const a = link(labels[i], '#'+key+'/content', 'day'+(current.day===key?' active':''));
      if (current.day===key) a.setAttribute('aria-current','page');
      host.append(a);
    });
    host.querySelector('.active')?.scrollIntoView({block:'nearest',inline:'nearest'});
  }


  function hero(index = 0) {
    const h = el('header','day-heading'), copy = el('div');
    const label = labels[index].split(' · ');
    copy.append(el('p','eyebrow',index ? 'Referências do roteiro' : 'Plano de captação · 27 de outubro'),el('h1',null,label[0]));
    const meta = el('div','day-meta');
    meta.append(pill(index ? 'A revisar' : 'Em revisão',index ? '' : 'em'));
    if(index) meta.append(el('span','subtle',label[1] || 'Datas no roteiro'));
    else meta.append(link('Torre · 16h40','#paris-27/route','fixed-time'),el('span','subtle','Jantar após as fotos'));
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
    if(current.day==='paris-27')menu.append(link('Pendências e notas','#paris-27/decisions'));
    menu.append(link('Site anterior ↗','arquivo.html'));
    more.append(menu);n.append(more);return n;
  }


  async function render() {
    const version = ++renderVersion;current = parseHash();nav();
    const main=$('#main');main.replaceChildren();
    if(current.day!=='paris-27'){
      await renderLegacy(main,Number(current.day.split('-')[1]),version);
      if(version!==renderVersion)return;
    } else {
      main.append(hero(),subnav());
      if(current.section==='content')renderVideos(main);
      if(current.section==='spots')renderSpots(main);
      if(current.section==='route')renderRoute(main);
      if(current.section==='decisions')renderDecisions(main);
      if(current.section==='refs')renderReferences(main);
    }
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
          const script=target.querySelector('.reel-script');if(script)script.open=true;
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
    main.append(sectionHeading('Fotos & spots',link('Arquivo de refs','#paris-27/spots/audit','quiet-link')));
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
    const explanation=el('div');explanation.append(el('p',null,'“Local identificado” reconhece o cenário. A posição exata da câmera continua estimada. Pontos prováveis e alternativas estão sinalizados.'),constraints());
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
    if(photos.length)card.append(gallery);
    const body=el('div','spot-body'),meta=el('div','card-meta');
    meta.append(el('span',null,s.displayTime||compact(s.window,35)),el('span','certainty '+s.certainty,certainty[s.certainty]));
    body.append(meta,el('h3',null,titleOf(s)),el('p','card-summary',s.summary||compact(s.camera)));
    const related=plan.videos.filter(v=>v.takes.some(t=>t.spotId===s.id));
    const meta2=el('div','minor-meta');
    if(photos.length)meta2.append(el('span',null,photos.length+' fotos'));
    if(related.length)meta2.append(el('span',null,related.length+' Reel'+(related.length>1?'s':'')));
    if(s.mode==='outside')meta2.append(el('span','warning-text','Exige desvio'));
    if(s.mode==='optional')meta2.append(el('span',null,'Opcional'));
    body.append(meta2);
    const actions=el('div','card-actions');actions.append(link('Mapa ↗',mapUrl(s),'button small'));
    related.forEach(v=>actions.append(link(v.id+' · roteiro','#paris-27/content/'+v.id,'quiet-link')));body.append(actions);
    const full=el('div','details-body'),dl=el('dl','definition');
    [['Onde ficar',s.where],['Como enquadrar',s.camera],['Acesso',s.access]].forEach(([t,v])=>dl.append(el('dt',null,t),el('dd',null,v)));full.append(dl);
    if(s.alternative)full.append(el('p','subtle','Plano B: '+s.alternative));
    const controls=el('div','spot-controls'),label=el('label',null,'Prioridade');label.htmlFor='choice-'+s.id;const pick=el('select');pick.id=label.htmlFor;
    [['keep','Captar'],['maybe','Se sobrar'],['cut','Fora desta versão']].forEach(([v,t])=>{const o=el('option',null,t);o.value=v;pick.append(o);});pick.value=choice(s);
    if(s.id==='tower'){pick.disabled=true;pick.setAttribute('aria-label','Compromisso fixo confirmado');}
    pick.onchange=()=>{state.choices[s.id]=pick.value;save();card.classList.toggle('cut',pick.value==='cut');};controls.append(label,pick);full.append(controls);
    if(photos.length){const grid=el('div','photo-grid');photos.forEach(p=>grid.append(photoCard(p,photos)));full.append(disclosure('Escolher fotos · '+photos.length,grid));}
    if(s.sources.length){const source=el('div');s.sources.forEach(id=>{const src=plan.sources.find(x=>x.id===id);if(src)source.append(link(src.title+' ↗',src.url),el('p','subtle',src.supports));});full.append(disclosure('Fontes da localização',source));}
    const instructions=disclosure('Como captar',full,'spot-details');instructions.setAttribute('name','spot-instructions');
    body.append(instructions);card.append(body);return card;
  }


  function photoCard(p,list=plan.photos) {
    const ps=photoState(p),card=el('figure','photo'+(ps.done?' is-done':''));card.dataset.refId=p.id;
    const open=button('',()=>openPhoto(p,list),'photo-open');open.setAttribute('aria-label','Ver ref '+p.id+' e o ponto de captura');
    open.append(imageNode(p.id,p.title),el('span','photo-index',p.id.startsWith('pa-')||p.id.startsWith('jp-')?p.id:'#'+p.index));card.append(open);
    const caption=el('figcaption','photo-label'),place=spotBy(p.spotId);
    caption.append(el('strong',null,place?titleOf(place):p.feasibility==='blocked'?'Fora deste dia':'Local a confirmar'));
    caption.append(el('small','certainty '+p.precision,p.feasibility==='blocked'?feasibility[p.feasibility]:certainty[p.precision]));card.append(caption);
    const checks=el('div','photo-checks');[['use','Selecionar'],['done','Captada']].forEach(([key,title])=>{
      const label=el('label'),cb=el('input');cb.type='checkbox';cb.checked=ps[key];cb.dataset.photoAction=key;cb.setAttribute('aria-label',title+' · ref '+p.id);
      cb.onchange=()=>{
        state.photos[p.id]={...photoState(p),[key]:cb.checked};save();syncPhotoCards(p);
      };
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
    const details=el('details','disclosure audit');details.id='audit';details.append(el('summary',null,'Todas as referências de Paris · 109'));
    const body=el('div','details-body'),controls=el('div','tools'),select=el('select');select.setAttribute('aria-label','Filtrar referências por viabilidade');
    [['all','Todas'],['selected','Selecionadas'],['done','Captadas'],...Object.entries(feasibility)].forEach(([v,t])=>{const o=el('option',null,t);o.value=v;select.append(o);});select.value=auditFilter;
    const grid=el('div','photo-grid audit-grid');
    const update=()=>{
      grid.replaceChildren();const list=plan.photos.filter(p=>auditFilter==='all'||(auditFilter==='selected'?photoState(p).use:auditFilter==='done'?photoState(p).done:p.feasibility===auditFilter));
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
    const pills=el('div','pills');pills.append(pill(certainty[p.precision]),pill(feasibility[p.feasibility],p.feasibility==='blocked'?'warn':''));info.append(pills);
    if(spot)info.append(el('p','modal-caption',spot.summary||compact(spot.camera,130)),link('Abrir spot no Maps ↗',mapUrl(spot),'button primary'));
    else info.append(el('p','modal-caption',compact(p.note,180)));
    if(alternative)info.append(el('p','subtle','Alternativa: '+titleOf(alternative)),link('Mapa da alternativa ↗',mapUrl(alternative),'button'));
    const checks=el('div','photo-checks modal-checks');
    if(plan.photos.some(x=>x.id===p.id)){
      [['use','Selecionar foto'],['done','Foto captada']].forEach(([key,text])=>{
        const label=el('label'),cb=el('input');cb.type='checkbox';cb.checked=photoState(p)[key];cb.setAttribute('aria-label',text+' · '+p.id);
        cb.onchange=()=>{state.photos[p.id]={...photoState(p),[key]:cb.checked};save();syncPhotoCards(p);};label.append(cb,document.createTextNode(text));checks.append(label);
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
    main.append(sectionHeading('Vídeos do dia',el('span','subtle',plan.videos.length+' propostas')));
    const grid=el('div','content-grid');plan.videos.forEach(v=>grid.append(videoCard(v)));main.append(grid);
    const selected=link('Ver todas as selecionadas →','#paris-27/spots/audit','quiet-link');selected.onclick=()=>{auditFilter='selected';};
    main.append(sectionHeading('Fotos para escolher',selected));
    const photos=el('div','photo-grid featured-photos');const list=(plan.presentation?.featuredPhotos||[]).map(id=>plan.photos.find(p=>p.id===id)).filter(Boolean);
    list.forEach(p=>photos.append(photoCard(p,list)));main.append(photos);
  }

  function videoCard(v) {
    const article=el('article','content-card');article.id=v.id;const ref=refBy(v.references[0]);
    const media=link('',ref.url,'cover-link');media.setAttribute('aria-label','Ver Reel de referência: '+v.title);
    media.append(cover(v.coverIds||[plan.hero],v.displayTitle||v.title));
    const label=(v.coverIds||[]).every(id=>id.startsWith('ig-'))?'Frame da referência':'Referência visual';
    media.append(el('span','cover-label',label),el('span','cover-play','Ver ref ↗'));article.append(media);
    const body=el('div','content-body'),meta=el('div','card-meta');meta.append(el('span',null,v.id+' · '+(v.displayType||v.type)),el('span',null,v.displayDuration||v.duration));
    body.append(meta,el('h3',null,v.displayTitle||v.title),el('p','card-summary',v.summary||compact(v.hook)));
    const places=[...new Set(v.takes.map(t=>spotBy(t.spotId).area.split(' · ')[0]))];body.append(el('p','content-location',v.placesLabel||compact(places.join(' · '),70)));
    const script=el('div','details-body');script.append(el('p',null,v.hook));
    const refs=el('div','ref-links');v.references.forEach(id=>{const r=refBy(id);if(r)refs.append(link('Reel de referência ↗',r.url,'quiet-link'));});script.append(refs);
    v.takes.forEach(t=>script.append(takeRow(t,v)));
    const edit=el('div','details-body');[['Edição',v.edit],['Áudio',v.audio],['Adaptação',v.adaptation]].forEach(([label,text])=>edit.append(el('h4',null,label),el('p',null,text)));
    script.append(disclosure('Edição e áudio',edit));
    const done=v.takes.filter(t=>state.takes[t.id]).length;
    const panel=disclosure('Ver roteiro · '+done+'/'+v.takes.length+' takes',script,'reel-script');panel.dataset.videoId=v.id;panel.setAttribute('name','reel-scripts');
    body.append(panel);article.append(body);return article;
  }

  function takeRow(t,v) {
    const row=el('div','take'+(state.takes[t.id]?' done':'')),cb=el('input');cb.type='checkbox';cb.checked=!!state.takes[t.id];cb.id='take-'+t.id;cb.setAttribute('aria-label','Gravado: '+t.text);
    cb.onchange=()=>{
      state.takes[t.id]=cb.checked;save();row.classList.toggle('done',cb.checked);
      const summary=document.querySelector('[data-video-id="'+v.id+'"] > summary');
      if(summary)summary.textContent='Ver roteiro · '+v.takes.filter(item=>state.takes[item.id]).length+'/'+v.takes.length+' takes';
    };
    const body=el('div'),label=el('label');label.htmlFor=cb.id;label.append(el('p',null,t.text));const spot=spotBy(t.spotId);
    body.append(label,link(titleOf(spot)+' · '+t.seconds+'s',spotHref(spot.id),'quiet-link'));row.append(cb,body);return row;
  }

  function routeSketch() {
    const box=el('div','route-sketch');
    // Esquema de sequência, deliberadamente sem pinos que finjam exatidão fotográfica.
    box.innerHTML='<svg viewBox="0 0 520 260" role="img" aria-label="Sequência esquemática: Louvre, Palais-Royal, Arco, Trocadéro, Torre, Sena e Bir-Hakeim"><path d="M30 220 C95 185 130 240 180 205 S280 110 365 135 S455 190 510 160" fill="none" stroke="var(--blue)" stroke-width="15" opacity=".12"/><path d="M430 110 L455 70 L250 35 L105 95 L160 170 L95 225" fill="none" stroke="var(--accent)" stroke-width="2" stroke-dasharray="5 5"/><g><circle class="point" cx="430" cy="110" r="11"/><text class="point-text" x="426" y="114">1</text><text x="437" y="139">Louvre</text><circle class="point" cx="455" cy="70" r="11"/><text class="point-text" x="451" y="74">2</text><text x="380" y="54">Palais-Royal</text><circle class="point" cx="250" cy="35" r="11"/><text class="point-text" x="246" y="39">3</text><text x="220" y="62">Arco</text><circle class="point" cx="105" cy="95" r="11"/><text class="point-text" x="101" y="99">4</text><text x="29" y="78">Trocadéro</text><circle class="point" cx="160" cy="170" r="11"/><text class="point-text" x="156" y="174">5</text><text x="176" y="175">Torre · 16h40</text><circle class="point" cx="95" cy="225" r="11"/><text class="point-text" x="91" y="229">6</text><text x="113" y="235">Bir-Hakeim</text></g></svg>';
    box.append(el('p',null,'Esquema da sequência base, sem escala. Traços não representam ruas nem rotas calculadas. Os deslocamentos estão nos links abaixo.'));return box;
  }

  function renderRoute(main) {
    main.append(sectionHeading('Rota do dia',el('span','subtle','Horários estimados')));
    const fixed=el('div','route-fixed');fixed.append(el('b',null,'16h15 · chegar à segurança'),el('span',null,'16h40 · ingresso da Torre'));main.append(fixed);
    if(Object.keys(state.choices).length)main.append(el('p','compact-notice','Prioridades alteradas: os horários ainda precisam de revisão.'));
    const outside=plan.spots.filter(s=>s.mode==='outside'&&choice(s)!=='cut');
    if(outside.length)main.append(el('p','compact-notice','Desvio selecionado, ainda sem encaixe: '+outside.map(titleOf).join(', ')+'.'));
    const active=plan.route.filter(r=>routeIds(r).length),list=el('div','route-list');
    active.forEach((r,i)=>{
      const row=el('article','route-row'+(r.fixed?' fixed':'')),mainline=el('div','route-main'),title=el('div');
      mainline.append(el('span','clock',r.time));title.append(el('h3',null,r.title));
      const content=el('div','details-body');content.append(el('p',null,r.note));const points=el('div','route-spots');
      routeIds(r).forEach(id=>points.append(link(titleOf(spotBy(id)),spotHref(id),'quiet-link')));content.append(points);
      if(r.next)content.append(el('p','subtle',r.next));
      const details=disclosure('Ver paradas e tempo',content,'route-details');title.append(details);mainline.append(title);
      const next=active[i+1];if(next){const from=spotBy(routeIds(r).at(-1)),to=spotBy(routeIds(next)[0]);mainline.append(link('Trajeto ↗',directions(from,to,r.mode||'walking'),'button small'));}
      row.append(mainline);list.append(row);
    });main.append(list);
    const backup=el('div','details-body');backup.append(el('p',null,'Se atrasar, cortar jardim, fotos extras e depois encurtar o Arco. Sair do Trocadéro às 15h55. A captação noturna acompanha a saída real da Torre.'),link('Ver pendências','#paris-27/decisions','quiet-link'));
    main.append(disclosure('Se o dia atrasar',backup),disclosure('Ver esquema da sequência',routeSketch()));
  }


  function renderDecisions(main) {
    main.append(sectionHeading('Pendências & notas'));
    plan.decisions.forEach(d=>{
      const content=el('div','details-body');content.append(el('p',null,d.detail),el('p','subtle',d.recommendation));
      const label=el('label',null,'Sua anotação');label.htmlFor='note-'+d.id;const textarea=el('textarea');textarea.id=label.htmlFor;textarea.value=typeof state.notes[d.id]==='string'?state.notes[d.id]:'';
      textarea.placeholder='Registrar decisão';textarea.maxLength=5000;textarea.oninput=()=>{state.notes[d.id]=textarea.value;save();};content.append(label,textarea);
      main.append(disclosure(d.title,content,'decision'));
    });
    const actions=el('div','review-actions');actions.append(button('Exportar revisão',exportReview),button('Importar revisão',()=>$('#import-file').click()));main.append(actions,el('p','storage-note','Notas e marcações ficam neste aparelho.'));
    const sources=el('div','details-body');plan.sources.forEach(s=>{const d=el('div','source');d.append(link(s.title+' ↗',s.url),el('p','subtle',s.supports));sources.append(d);});
    main.append(disclosure('Fontes da revisão · 23/10',sources,'supporting'));
  }


  function renderReferences(main) {
    main.append(sectionHeading('Refs salvas',el('span','subtle','Iagor + Daniel')));
    const grid=el('div','reference-grid');
    plan.references.forEach(r=>{
      const card=el('article','reference');if(r.thumbnail){const media=link('',r.url,'reference-image');media.append(imageNode(r.thumbnail,'Frame da referência '+r.title));card.append(media);}
      const body=el('div','reference-body');body.append(el('p','eyebrow',r.origin+' · '+r.kind),el('h3',null,compact(r.title,65)),link('Ver Reel ↗',r.url,'button small'));
      const detail=el('div','details-body');detail.append(el('p',null,r.summary));plan.videos.filter(v=>v.references.includes(r.id)).forEach(v=>detail.append(link('Roteiro '+v.id,'#paris-27/content/'+v.id,'quiet-link')));
      body.append(disclosure('O que aproveitar',detail));card.append(body);grid.append(card);
    });main.append(grid);
  }


  async function renderLegacy(main,index,version) {
    const tab=model.tabs[index],locs=model.locs.filter(l=>l.tab===tab);main.append(hero(index),subnav());
    if(current.section==='refs')renderReferences(main);
    else if(current.section==='route'){
      main.append(sectionHeading('Roteiro original'),el('p','compact-notice','A ordem e os spots deste dia ainda serão revisados.'));
      const list=el('div','route-list');locs.forEach(l=>{
        const row=el('article','route-row'),line=el('div','route-main'),title=el('div');title.append(el('h3',null,l.name),disclosure('Ver detalhes',el('p','details-body',l.note)));
        line.append(el('span','clock',l.time),title,link('Região ↗',l.maps,'button small'));row.append(line);list.append(row);
      });main.append(list);
    } else {
      const refIds=new Set(locs.flatMap(l=>l.reels||[])),refs=model.reels.filter(r=>refIds.has(r.id));
      if(current.section==='content'&&refs.length){
        main.append(sectionHeading('Refs de vídeo do dia'));const videoGrid=el('div','reference-grid');
        refs.forEach(r=>{const c=el('article','reference'),media=link('',r.url,'reference-image');media.append(imageNode(r.id,r.autor));const b=el('div','reference-body');b.append(el('h3',null,r.autor),link('Ver Reel ↗',r.url,'button small'),disclosure('O que aproveitar',el('p','details-body',r.aproveitar)));c.append(media,b);videoGrid.append(c);});main.append(videoGrid);
      }
      main.append(sectionHeading('Fotos por região'),el('p','compact-notice','Pontos exatos e captação deste dia ainda a revisar.'));
      const grid=el('div','spot-grid');locs.forEach(l=>{
        const card=el('article','spot-card'),all=[...l.must,...l.mine,...l.insp],preview=el('div','spot-preview');
        all.slice(0,3).forEach(id=>{const b=button('',()=>openLegacyPhoto(id,l,all),'spot-preview-image');b.setAttribute('aria-label','Abrir referência de '+l.name);b.append(imageNode(id,model.desc[id]||l.name));preview.append(b);});if(all.length)card.append(preview);
        const body=el('div','spot-body');body.append(el('div','card-meta',l.time),el('h3',null,l.name));const actions=el('div','card-actions');actions.append(link('Região no mapa ↗',l.maps,'button small'));body.append(actions);
        const detail=el('div','details-body');detail.append(el('p',null,l.note));
        if(all.length){const images=el('div','photo-grid');all.forEach(id=>{const b=button('',()=>openLegacyPhoto(id,l,all),'photo-open');b.setAttribute('aria-label','Ver referência de '+l.name);b.append(imageNode(id,model.desc[id]||l.name));images.append(b);});detail.append(images);}
        const label=all.length===0?'Detalhes da parada':all.length===1?'Ver referência e detalhes':'Ver '+all.length+' refs e detalhes';
        body.append(disclosure(label,detail));card.append(body);grid.append(card);
      });main.append(grid);
    }
    await loadPhotos([...locs.map(l=>l.file),'ck-extras.json']);if(version!==renderVersion)return;
  }

  function openLegacyPhoto(id,loc,all) {
    const list=all.map((key,i)=>({id:key,index:i+1,title:model.desc[key]||'Referência original de '+loc.name,precision:'unknown',feasibility:'unlocated',note:'Este dia ainda não foi auditado. A categoria original indica uma região, não o spot da câmera.',originalLocation:loc.name,originalPriority:loc.must.includes(key)?'must':loc.mine.includes(key)?'mine':'insp',spotId:null}));openPhoto(list.find(p=>p.id===id),list);
  }
  function exportReview() {
    const file={schema:'trip-review-v2',day:plan.id,baseDate:plan.reviewedAt,exportedAt:new Date().toISOString(),state};
    const url=URL.createObjectURL(new Blob([JSON.stringify(file,null,2)],{type:'application/json'}));const a=link('',''+url);a.download='revisao-paris-27out.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Revisão exportada com suas escolhas e anotações.');
  }
  async function importReview(file) {
    if(!file)return;
    try{
      if(file.size>1000000)throw Error('Arquivo muito grande');const data=JSON.parse(await file.text());
      if(data.schema!=='trip-review-v2'||data.day!==plan.id||!data.state||typeof data.state!=='object')throw Error('Formato diferente');
      const incoming=data.state;
      for(const s of plan.spots)if(['keep','maybe','cut'].includes(incoming.choices?.[s.id])&&s.id!=='tower')state.choices[s.id]=incoming.choices[s.id];
      for(const p of plan.photos){const v=incoming.photos?.[p.id];if(v&&typeof v.use==='boolean'&&typeof v.done==='boolean')state.photos[p.id]={use:v.use,done:v.done};}
      for(const v of plan.videos)for(const t of v.takes)if(typeof incoming.takes?.[t.id]==='boolean')state.takes[t.id]=incoming.takes[t.id];
      for(const d of plan.decisions)if(typeof incoming.notes?.[d.id]==='string')state.notes[d.id]=incoming.notes[d.id].slice(0,5000);
      save();await render();toast('Revisão importada neste aparelho.');
    }catch{toast('Não foi possível importar. Escolha uma revisão de Paris exportada por este site.');}
  }
  async function init() {
    restore();
    document.querySelector('.skip').onclick=e=>{e.preventDefault();$('#main').focus();$('#main').scrollIntoView();};
    $('#theme').onclick=()=>{const theme=document.documentElement.dataset.theme==='light'?'dark':'light';document.documentElement.dataset.theme=theme;try{localStorage.setItem('trip-theme',theme);}catch{}};
    $('#light-close').onclick=()=>$('#lightbox').close();$('#lightbox').addEventListener('click',e=>{if(e.target===$('#lightbox')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
    document.addEventListener('keydown',e=>{if(!$('#lightbox').open)return;if(e.key==='ArrowRight')stepPhoto(1);if(e.key==='ArrowLeft')stepPhoto(-1);});
    $('#import-file').onchange=async e=>{await importReview(e.target.files[0]);e.target.value='';};
    try{
      [model,plan]=await Promise.all([load('data/referencias.json'),load('data/paris-27.json')]);
      await render();loadPhotos(['ck-ter-27-10.json','ck-extras.json']);
      window.addEventListener('hashchange',render);
      window.addEventListener('storage',e=>{if(e.key===storageKey){restore();render();}});
    }catch(e){const main=$('#main');main.replaceChildren(el('h1',null,'O plano não abriu.'),el('p',null,'Confira a conexão e recarregue a página.'),button('Tentar de novo',()=>location.reload()),link('Consultar site anterior','arquivo.html','button'));}
  }
  return {init};
})();
TripPlanner.init();
