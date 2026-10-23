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
  const certainty = {identified:'Cenário identificado',probable:'Ponto provável',alternative:'Alternativa proposta',unknown:'Origem não identificada'};
  const feasibility = {fits:'Cabe na rota',adapt:'Precisa adaptar',optional:'Desvio / extra',blocked:'Fora deste dia',unlocated:'Sem spot comprovado'};
  const sectionNames = {spots:'Spots & fotos',reels:'Reels & takes',route:'Rota proposta',decisions:'Decisões',refs:'Todas as refs'};
  const labels = ['Paris · 27/10','Paris · 28/10','Tóquio · 29/10','Fuji · 30/10','Tóquio · 31/10','Tóquio · 01/11','Tóquio · 02/11','Disney · 03/11','Kyoto','Osaka'];
  const storageKey = 'trip-review-v2';
  const state = {choices:{},photos:{},takes:{},notes:{}};
  let model, plan, current = {day:'paris-27',section:'spots',anchor:''};
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
    const section = Object.hasOwn(sectionNames, parts[1]) ? parts[1] : 'spots';
    return {day,section,anchor:parts[2] || ''};
  }
  function nav() {
    const host = $('#days'); host.replaceChildren();
    model.tabs.forEach((t,i) => {
      const key = i ? 'day-'+i : 'paris-27';
      const a = link('', '#'+key+'/spots', 'day'+(current.day===key?' active':''));
      a.append(el('b',null,labels[i]),el('small',null,i ? 'a revisar' : 'em revisão'));
      if (current.day===key) a.setAttribute('aria-current','page');
      host.append(a);
    });
    host.querySelector('.active')?.scrollIntoView({block:'nearest',inline:'nearest'});
  }
  function hero() {
    const h = el('section','hero'), text = el('div');
    text.append(el('p','eyebrow','Terça · 27 de outubro · Paris'),el('h1',null,'Paris, cena por cena.'),el('p','description','A foto no spot certo. O take no Reel certo. Uma sequência que respeita o ingresso das 16h40.'));
    const p = el('div','pills'); p.append(pill('Rascunho para aprovação','em'),pill('16h40 · Torre confirmada','ok'));
    text.append(p);
    const a = el('div','actions'); a.append(link('Ver a sequência do dia →','#paris-27/route','button primary'),link('O que falta decidir','#paris-27/decisions','button'));
    text.append(a);
    const photo = el('div','hero-image');photo.append(imageNode(plan.hero,'Referência em silhueta na passagem do Louvre',true),el('span','hero-caption','Passage Richelieu · referência do Iagor'));
    h.append(text,photo); return h;
  }
  function subnav() {
    const n = el('nav','section-nav'); n.setAttribute('aria-label','Organização de Paris');
    Object.entries(sectionNames).forEach(([key,label]) => { const a=link(label,'#paris-27/'+key,current.section===key?'active':''); if(current.section===key)a.setAttribute('aria-current','page');n.append(a); });
    return n;
  }
  async function render() {
    const version = ++renderVersion; current = parseHash(); nav();
    const main = $('#main');main.replaceChildren();
    if (current.day !== 'paris-27') {
      await renderLegacy(main, Number(current.day.split('-')[1]),version);
      if(version!==renderVersion)return;
    } else {
      main.append(hero(),subnav());
      if(current.section==='spots')renderSpots(main);
      if(current.section==='reels')renderVideos(main);
      if(current.section==='route')renderRoute(main);
      if(current.section==='decisions')renderDecisions(main);
      if(current.section==='refs')renderReferences(main);
    }
    paintImages();
    if (current.anchor) {
      requestAnimationFrame(() => {
        let target = document.getElementById(current.anchor);
        if (!target && current.section === 'spots' && spotBy(current.anchor)) {
          spotFilter = 'all';
          search = '';
          const searchBox = document.querySelector('[aria-label="Buscar spots e fotos"]');
          if (searchBox) searchBox.value = '';
          const filter = document.querySelector('[aria-label="Filtrar spots"]');
          if (filter) { filter.value = 'all'; filter.dispatchEvent(new Event('change')); }
          target = document.getElementById(current.anchor);
          paintImages();
        }
        if (target) { if(target.tagName==='DETAILS')target.open=true; target.scrollIntoView(); }
      });
    } else window.scrollTo({top:0});
  }

  function constraints() {
    const grid=el('div','constraint-grid');
    plan.constraints.forEach(c=>{const b=el('div','constraint');b.append(el('h3',null,c.title),el('p',null,c.detail));grid.append(b);});return grid;
  }
  function renderSpots(main) {
    main.append(el('h2',null,'De onde a câmera olha?'),el('p','lead','Cada spot descreve onde ficar, para onde apontar e o quanto sabemos da localização. “Cenário identificado” reconhece o lugar; não comprova o metro exato da câmera. Os links abrem o ponto nomeado no mapa.'),constraints());
    const legend=el('div','legend');Object.entries(certainty).forEach(([k,v])=>legend.append(el('span',k,v)));main.append(legend);
    const issue=el('div','callout warn');issue.append(el('strong',null,'As referências tinham lugares misturados.'),el('p',null,'Tower Bridge em “Bir-Hakeim”, interiores fechados em “Louvre”, Opéra em “Palais-Royal” e uma sacada privada em “Champ de Mars”. O arquivo completo mostra a correção foto a foto.'),link('Ver as 109 refs e os casos que não cabem →','#paris-27/spots/audit'));
    main.append(issue);
    const tools=el('div','tools'),q=el('input');q.type='search';q.placeholder='Buscar spot, foto, rua ou referência…';q.setAttribute('aria-label','Buscar spots e fotos');q.value=search;
    const select=el('select');select.setAttribute('aria-label','Filtrar spots');
    [['base','Rota base + próximos'],['all','Todos os spots'],['outside','Desvios fora da rota']].forEach(([v,t])=>{const o=el('option',null,t);o.value=v;select.append(o);});select.value=spotFilter;
    const container=el('div');
    const update=()=>{
      container.replaceChildren();
      const list=plan.spots.filter(s=>(spotFilter==='all'||(spotFilter==='base'?s.mode!=='outside':s.mode==='outside'))&&matchesSpot(s,q.value));
      if(!list.length)container.append(el('p','empty','Nenhum spot com esse filtro.'));
      list.forEach(s=>container.append(spotCard(s)));
    };
    q.oninput=()=>{search=q.value;update();};select.onchange=()=>{spotFilter=select.value;update();};tools.append(q,select);main.append(tools,container);update();
    main.append(auditGallery());
  }
  function matchesSpot(s,text) {
    const q=text.toLocaleLowerCase('pt-BR').trim();if(!q)return true;
    return [s.title,s.where,s.area,...spotPhotos(s.id).flatMap(p=>[p.title,p.id,p.note])].join(' ').toLocaleLowerCase('pt-BR').includes(q);
  }
  function spotCard(s) {
    const card=el('article','spot'+(choice(s)==='cut'?' cut':''));card.id=s.id;
    const content=el('div'),head=el('div','spot-title'),title=el('div');
    title.append(el('p','eyebrow',s.area),el('h3',null,s.title));head.append(el('span','spot-number',String(plan.spots.indexOf(s)+1).padStart(2,'0')),title);content.append(head);
    const pills=el('div','pills');pills.append(pill(certainty[s.certainty],s.certainty==='identified'?'ok':s.certainty==='probable'?'warn':''),pill(s.mode==='outside'?'Fora da rota base':s.mode==='optional'?'Se sobrar':s.window));content.append(pills);
    const dl=el('dl','definition');[['Onde ficar',s.where],['Como enquadrar',s.camera],['Acesso e encaixe',s.access]].forEach(([t,v])=>dl.append(el('dt',null,t),el('dd',null,v)));content.append(dl);
    if(s.alternative)content.append(el('p','subtle','Plano B: '+s.alternative));
    content.append(link(s.certainty==='alternative'?'Abrir alternativa no Maps ↗':'Abrir este spot no Maps ↗',mapUrl(s),'button'));
    const controls=el('div','spot-controls'),label=el('label',null,'Prioridade nesta revisão');label.htmlFor='choice-'+s.id;
    const pick=el('select');pick.id='choice-'+s.id;
    [['keep','Captar'],['maybe','Se sobrar'],['cut','Fora desta versão']].forEach(([v,t])=>{const o=el('option',null,t);o.value=v;pick.append(o);});pick.value=choice(s);
    if(s.id==='tower'){pick.disabled=true;pick.setAttribute('aria-label','Compromisso fixo confirmado');}
    pick.onchange=()=>{state.choices[s.id]=pick.value;save();card.classList.toggle('cut',pick.value==='cut');};controls.append(label,pick);content.append(controls);
    const related=plan.videos.flatMap(v=>v.takes.filter(t=>t.spotId===s.id).map(t=>({v,t})));
    if(related.length){const block=el('div','spot-reels');block.append(el('b',null,'Reels para captar aqui'));related.forEach(({v,t})=>block.append(link(v.id+' · '+t.text,'#paris-27/reels/'+v.id)));content.append(block);}
    if(s.sources.length){const details=el('details');details.append(el('summary',null,'Fontes e nível de certeza'));s.sources.forEach(id=>{const src=plan.sources.find(x=>x.id===id);if(src)details.append(el('p',null,src.supports),link(src.title+' ↗',src.url));});content.append(details);}
    const photos=spotPhotos(s.id).sort((a,b)=>({mine:0,must:1,insp:2}[a.originalPriority])-({mine:0,must:1,insp:2}[b.originalPriority]));
    const grid=el('div','photo-grid');photos.slice(0,3).forEach(p=>grid.append(photoCard(p,photos)));
    if(photos.length>3){const more=el('details','gallery-more');more.append(el('summary',null,'Ver mais '+(photos.length-3)+' referências deste spot'));const rest=el('div','photo-grid');photos.slice(3).forEach(p=>rest.append(photoCard(p,photos)));more.append(rest);grid.append(more);}
    if(!photos.length)grid.append(el('p','subtle','Captação definida no roteiro de Reels. Não há foto original comprovada deste ponto.'));
    card.append(content,grid);return card;
  }
  function photoCard(p,list=plan.photos) {
    const ps=photoState(p), card=el('figure','photo'+(ps.done?' is-done':''));card.dataset.refId=p.id;
    const open=button('',()=>openPhoto(p,list),'photo-open');open.setAttribute('aria-label','Ver ref '+p.id+' e o ponto de captura');open.append(imageNode(p.id,p.title),el('span','photo-index',p.id.startsWith('pa-')||p.id.startsWith('jp-')?p.id:'#'+p.index));card.append(open);
    const caption=el('figcaption','photo-label');caption.append(el('strong',null,p.title),el('small',null,'Antes: '+p.originalLocation));
    const place=spotBy(p.spotId);caption.append(el('p','status',feasibility[p.feasibility]),el('small',null,place?certainty[p.precision]+' · '+place.title:p.precision==='identified'?'Outro local / acesso incompatível':'Sem localização comprovada'));
    card.append(caption);
    const checks=el('div','photo-checks');[['use','Quero fazer'],['done','Captada']].forEach(([key,title])=>{
      const label=el('label'),cb=el('input');cb.type='checkbox';cb.checked=ps[key];cb.dataset.photoAction=key;cb.setAttribute('aria-label',title+' · ref '+p.id);
      cb.onchange=()=>{state.photos[p.id]={...photoState(p),[key]:cb.checked};save();document.querySelectorAll('figure[data-ref-id]').forEach(node=>{if(node.dataset.refId!==p.id)return;const now=photoState(p);node.classList.toggle('is-done',now.done);node.querySelectorAll('input[data-photo-action]').forEach(input=>{input.checked=now[input.dataset.photoAction];});});};label.append(cb,document.createTextNode(title));checks.append(label);
    });card.append(checks);return card;
  }
  function auditGallery() {
    const details=el('details','audit');details.id='audit';details.append(el('summary',null,'Arquivo completo · 109 referências de Paris'));
    details.append(el('p','lead','Nenhuma referência foi apagada. Abra uma foto para ver identificação, motivo do encaixe, categoria original, alternativa e fonte. “Quero fazer” é uma escolha sua; não altera a conclusão sobre o local.'));
    const controls=el('div','tools'),select=el('select');select.setAttribute('aria-label','Filtrar referências por viabilidade');
    [['all','Todas as fotos'],['selected','Quero fazer'],['done','Já captadas'],...Object.entries(feasibility)].forEach(([v,t])=>{const o=el('option',null,t);o.value=v;select.append(o);});select.value=auditFilter;
    const grid=el('div','photo-grid audit-grid');const update=()=>{grid.replaceChildren();const list=plan.photos.filter(p=>auditFilter==='all'||(auditFilter==='selected'?photoState(p).use:auditFilter==='done'?photoState(p).done:p.feasibility===auditFilter));list.forEach(p=>grid.append(photoCard(p,list)));if(!list.length)grid.append(el('p','empty','Nenhuma foto com este filtro.'));paintImages();};select.onchange=()=>{auditFilter=select.value;update();};controls.append(select);details.append(controls,grid);
    let built=false;details.addEventListener('toggle',()=>{if(details.open&&!built){built=true;update();}});return details;
  }
  function openPhoto(p,list) {
    modalPhotos=list;modalIndex=Math.max(0,list.findIndex(x=>x.id===p.id));paintModal();
    if(!$('#lightbox').open)$('#lightbox').showModal();
  }
  function paintModal() {
    const p=modalPhotos[modalIndex];if(!p)return;
    const host=$('#light-content');host.replaceChildren();const layout=el('div','light-layout'),info=el('div');layout.append(imageNode(p.id,p.title,true));
    info.append(el('p','eyebrow','Ref '+p.id),el('h2',null,p.title));const pills=el('div','pills');pills.append(pill(certainty[p.precision]),pill(feasibility[p.feasibility],'warn'));info.append(pills,el('p',null,p.note));
    const spot=spotBy(p.spotId);if(spot){info.append(el('h3',null,spot.title),el('p',null,spot.where),el('p','subtle',spot.camera),link('Abrir ponto nomeado no Maps ↗',mapUrl(spot),'button'));}
    const alternative=spotBy(p.alternativeSpotId);if(alternative)info.append(el('h3',null,'Alternativa: '+alternative.title),el('p',null,'Reproduz a ideia em outro lugar. Não confirma o endereço original.'),link('Abrir alternativa ↗',mapUrl(alternative),'button'));
    info.append(el('p','subtle','Categoria original: '+p.originalLocation+' · '+({must:'obrigatória',mine:'pasta do Iagor',insp:'inspiração'}[p.originalPriority])));
    if(/^\d+$/.test(p.id))info.append(link('Consultar fonte no Pinterest ↗','https://www.pinterest.com/pin/'+p.id+'/','button text'));
    const arrows=el('div','light-arrows');arrows.append(button('←',()=>stepPhoto(-1)),el('span','subtle',(modalIndex+1)+' / '+modalPhotos.length),button('→',()=>stepPhoto(1)));info.append(arrows);layout.append(info);host.append(layout);paintImages();
  }
  function stepPhoto(delta){modalIndex=(modalIndex+delta+modalPhotos.length)%modalPhotos.length;paintModal();}

  function renderVideos(main) {
    main.append(el('h2',null,'Três vídeos. Takes no caminho.'),el('p','lead','Estas são propostas para Paris a partir das refs já salvas. O mesmo plano pode abastecer mais de um edit. A duração do checklist é de gravação bruta, não o tempo do corte final.'));
    plan.videos.forEach(v=>{
      const article=el('article','video');article.id=v.id;article.append(el('div','video-index',v.id));const body=el('div'),pills=el('div','pills');pills.append(pill(v.type),pill(v.duration));body.append(pills,el('h3',null,v.title),el('p',null,v.hook));
      const refs=el('div','ref-links');v.references.forEach(id=>{const r=refBy(id);if(r)refs.append(link('▶ '+r.title+' ↗',r.url,'button'));});body.append(refs);
      const detail=el('div','video-detail');[['O que modelar',v.edit],['Áudio',v.audio]].forEach(([title,text])=>{const d=el('div');d.append(el('h4',null,title),el('p',null,text));detail.append(d);});body.append(detail,el('p','info-line',v.adaptation));
      v.takes.forEach(t=>{
        const row=el('div','take'+(state.takes[t.id]?' done':'')),cb=el('input');cb.type='checkbox';cb.checked=!!state.takes[t.id];cb.id='take-'+t.id;cb.setAttribute('aria-label','Gravado: '+t.text);
        cb.onchange=()=>{state.takes[t.id]=cb.checked;save();row.classList.toggle('done',cb.checked);};
        const d=el('div'),label=el('label');label.htmlFor=cb.id;label.append(el('p',null,t.text));const s=spotBy(t.spotId);d.append(label,el('small',null,t.seconds+'s de bruto · '+s.window),link('Captar em '+s.title+' →',spotHref(s.id)));row.append(cb,d);body.append(row);
      });article.append(body);main.append(article);
    });
  }
  function routeSketch() {
    const box=el('div','route-sketch');
    // Esquema de sequência, deliberadamente sem pinos que finjam exatidão fotográfica.
    box.innerHTML='<svg viewBox="0 0 520 260" role="img" aria-label="Sequência esquemática: Louvre, Palais-Royal, Arco, Trocadéro, Torre, Sena e Bir-Hakeim"><path d="M30 220 C95 185 130 240 180 205 S280 110 365 135 S455 190 510 160" fill="none" stroke="var(--blue)" stroke-width="15" opacity=".12"/><path d="M430 110 L455 70 L250 35 L105 95 L160 170 L95 225" fill="none" stroke="var(--accent)" stroke-width="2" stroke-dasharray="5 5"/><g><circle class="point" cx="430" cy="110" r="11"/><text class="point-text" x="426" y="114">1</text><text x="437" y="139">Louvre</text><circle class="point" cx="455" cy="70" r="11"/><text class="point-text" x="451" y="74">2</text><text x="380" y="54">Palais-Royal</text><circle class="point" cx="250" cy="35" r="11"/><text class="point-text" x="246" y="39">3</text><text x="220" y="62">Arco</text><circle class="point" cx="105" cy="95" r="11"/><text class="point-text" x="101" y="99">4</text><text x="29" y="78">Trocadéro</text><circle class="point" cx="160" cy="170" r="11"/><text class="point-text" x="156" y="174">5</text><text x="176" y="175">Torre · 16h40</text><circle class="point" cx="95" cy="225" r="11"/><text class="point-text" x="91" y="229">6</text><text x="113" y="235">Bir-Hakeim</text></g></svg>';
    box.append(el('p',null,'Esquema da sequência base, sem escala. Traços não representam ruas nem rotas calculadas. Os deslocamentos estão nos links abaixo.'));return box;
  }
  function renderRoute(main) {
    const intro=el('div','route-intro'),text=el('div');text.append(el('h2',null,'Uma passagem por cada região.'),el('p','lead','Louvre → Palais-Royal → Arco → Trocadéro → Torre → Sena → Bir-Hakeim → jantar. Primeiro resolvemos os spots; esta é a proposta logística para aprovação.'),el('p','info-line','16h40 é fixo e o jantar pode ser após as fotos, ambos confirmados pelo Iagor. Os demais horários são estimativas, sem trânsito ou filas em tempo real. Reserva do almoço, restaurante e hotel continuam pendentes.'));intro.append(text,routeSketch());main.append(intro);
    if(Object.keys(state.choices).length)main.append(el('p','info-line warn','Suas prioridades alteram os spots exibidos e os links de deslocamento. Os horários continuam sendo a base editorial; precisam ser revalidados se cortar ou acrescentar uma região.'));
    const outside=plan.spots.filter(s=>s.mode==='outside'&&choice(s)!=='cut');
    if(outside.length)main.append(el('p','info-line warn','Você marcou um desvio: '+outside.map(s=>s.title).join(', ')+'. Ele ainda não foi inserido nesta rota. Precisamos escolher qual bloco cortar antes de encaixá-lo.'));
    const active=plan.route.filter(r=>routeIds(r).length);
    active.forEach((r,i)=>{
      const row=el('article','route-step'+(r.fixed?' fixed':''));const content=el('div');content.append(el('h3',null,r.title),el('p',null,r.note));const spots=el('div','route-spots');routeIds(r).forEach(id=>{const s=spotBy(id);spots.append(link(s.title+(choice(s)==='maybe'?' · opcional':''),spotHref(id)));});content.append(spots);
      const next=active[i+1];if(next){const from=spotBy(routeIds(r).at(-1)),to=spotBy(routeIds(next)[0]);const transfer=el('div','transfer');transfer.append(el('span',null,active[i+1]===plan.route[plan.route.indexOf(r)+1]?r.next:'Deslocamento mudou com a seleção; tempo a recalcular.'),document.createElement('br'),link('Abrir este trecho no Maps ↗',directions(from,to,r.mode||'walking')));content.append(transfer);}
      row.append(el('div','clock',r.time),content);main.append(row);
    });
    const last=el('div','callout warn');last.append(el('strong',null,'Se atrasar: proteger o ingresso.'),el('p',null,'Cortar jardim e colunas extras primeiro; depois encurtar o Arco ou a escadaria. Às 15h55, sair do Trocadéro rumo à Torre. A visita ao topo não garante saída às 18h: captar as luzes depois da saída real.'),link('Resolver jantar e volta ao hotel →','#paris-27/decisions'));main.append(last);
  }
  function renderDecisions(main) {
    main.append(el('h2',null,'Fechar Paris antes do próximo dia.'),el('p','lead','O ingresso das 16h40 já está confirmado. Estas decisões ainda mudam a viabilidade da rota. Anotações e checklists ficam apenas neste navegador; exporte a revisão se quiser compartilhá-la.'));
    plan.decisions.forEach(d=>{
      const row=el('article','decision'),copy=el('div');copy.append(el('h3',null,d.title),el('p',null,d.detail),el('p','recommendation',d.recommendation));
      const field=el('div'),label=el('label',null,'Anotação da revisão');label.htmlFor='note-'+d.id;const textarea=el('textarea');textarea.id=label.htmlFor;textarea.value=typeof state.notes[d.id]==='string'?state.notes[d.id]:'';textarea.placeholder='Registrar a decisão ou o que falta confirmar…';textarea.maxLength=5000;textarea.oninput=()=>{state.notes[d.id]=textarea.value;save();};field.append(label,textarea);row.append(copy,field);main.append(row);
    });
    const actions=el('div','review-actions');actions.append(button('Exportar revisão',exportReview,'button primary'),button('Importar revisão',()=>$('#import-file').click()));main.append(actions);
    const source=el('section','sources');source.append(el('h3',null,'Base da revisão · consultada em 23/10/2026'));
    plan.sources.forEach(s=>{const d=el('div','source');d.append(link(s.title+' ↗',s.url),el('p',null,s.supports));source.append(d);});main.append(source);
  }
  function renderReferences(main) {
    main.append(el('h2',null,'As refs de vocês, com função clara.'),el('p','lead','Reunião dos links enviados pelo Iagor com os Reels salvos no site do Daniel. Paris está ligada aos três roteiros; as demais referências continuam disponíveis para a revisão dos dias do Japão. Os links abrem o original — a disponibilidade no Instagram pode variar.'));
    const grid=el('div','reference-grid');
    plan.references.forEach(r=>{const c=el('article','reference');if(r.thumbnail)c.append(imageNode(r.thumbnail,'Frame da referência '+r.title));const pills=el('div','pills');pills.append(pill(r.origin),pill(r.kind));c.append(pills,el('h3',null,r.title),el('p',null,r.summary),link('Abrir Reel original ↗',r.url));const uses=plan.videos.filter(v=>v.references.includes(r.id));uses.forEach(v=>c.append(document.createElement('br'),link('Modelado em '+v.id+' →','#paris-27/reels/'+v.id)));if(!uses.length)c.append(el('p','subtle','Encaixe por dia ainda não revisado.'));grid.append(c);});main.append(grid);
  }
  async function renderLegacy(main,index,version) {
    const tab=model.tabs[index],locs=model.locs.filter(l=>l.tab===tab);
    main.append(el('p','eyebrow','Próximo dia · aguardando revisão'),el('h1',null,labels[index]),el('p','lead','Este dia preserva o material original. As fotos ainda estão agrupadas por região, e seus pontos de captura não foram validados. Vamos revisar os spots e os Reels antes de ordenar a logística.'));
    const callout=el('div','callout');callout.append(el('strong',null,'Uma etapa por vez.'),el('p',null,'Paris, em 27/10, é o primeiro dia em revisão. Os horários e os locais abaixo são do roteiro anterior, sem otimização nova.'),link('Voltar à revisão de Paris →','#paris-27/spots','button'));main.append(callout);
    locs.forEach(l=>{
      const card=el('article','spot'),text=el('div');text.append(el('p','eyebrow','Roteiro original · '+l.time),el('h3',null,l.name),el('p','subtle',l.note),pill('Spot da câmera ainda não revisado','warn'),el('div','actions'));
      text.lastChild.append(link('Região no Maps ↗',l.maps,'button'));
      const related=(l.reels||[]).map(id=>model.reels.find(r=>r.id===id)).filter(Boolean);related.forEach(r=>text.append(el('p',null,r.aproveitar),link('▶ '+r.autor+' ↗',r.url)));
      const all=[...l.must,...l.mine,...l.insp],grid=el('div','photo-grid');
      const add=(id,host)=>{const p=button('',()=>openLegacyPhoto(id,l,all),'photo-open');p.append(imageNode(id,model.desc[id]||'Referência original de '+l.name));host.append(p);};
      all.slice(0,3).forEach(id=>add(id,grid));
      if(all.length>3){const more=el('details','gallery-more');more.append(el('summary',null,'Ver todas as '+all.length+' refs desta região'));const rest=el('div','photo-grid');all.slice(3).forEach(id=>add(id,rest));more.append(rest);grid.append(more);}
      if(!all.length)grid.append(el('p','subtle','Sem foto salva neste local.'));
      card.append(text,grid);main.append(card);
    });
    await loadPhotos(locs.map(l=>l.file));if(version!==renderVersion)return;
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
