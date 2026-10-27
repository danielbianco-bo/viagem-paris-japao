import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const read=path=>JSON.parse(readFileSync(new URL(path,root),'utf8'));
const trip=read('data/viagem.json'),paris=read('data/paris-27.json'),original=read('data/referencias.json');
const days=[paris,...trip.days],dayIds=new Set(days.map(d=>d.id));
const spots=[...paris.spots.map(s=>({...s,dayId:paris.id})),...trip.spots],spotBy=new Map(spots.map(s=>[s.id,s]));
const photos=[...paris.photos.map(p=>({...p,dayId:paris.id,file:'ck-ter-27-10.json'})),...trip.photos],photoBy=new Map(photos.map(p=>[p.id,p]));
const videos=[...paris.videos.map(v=>({...v,takes:v.takes.map(t=>({...t,dayId:paris.id}))})),...trip.videos];
const refs=new Set(trip.references.map(r=>r.id)),sources=new Set([...paris.sources,...trip.sources].map(s=>s.id));
const takes=new Map(),assets=new Map();
const imageFile=file=>{if(!assets.has(file))assets.set(file,read(file));return assets.get(file);};
const use=p=>p.selected??(['fits','adapt'].includes(p.feasibility)&&['must','mine'].includes(p.originalPriority));
const enabledSpots=r=>[...r.spots,...(r.captureSpots||[])].filter(id=>spotBy.get(id).mode!=='outside');

assert.equal(days.length,18);
assert.equal(dayIds.size,days.length);
const dates=days.map(d=>d.date).sort();
for(let i=0;i<18;i++)assert.equal(dates[i],new Date(Date.UTC(2026,9,26+i)).toISOString().slice(0,10));
assert.equal(spotBy.size,spots.length,'IDs de spot precisam ser únicos na viagem');
assert.equal(photoBy.size,photos.length,'IDs de foto precisam ser únicos na viagem');
const originalIds=new Set([...original.locs.flatMap(l=>[...l.must,...l.mine,...l.insp]),...original.extra.map(p=>p.id)]);
assert.equal(originalIds.size,240);
assert.deepEqual(new Set(photoBy.keys()),originalIds,'Todas as refs originais e extras devem continuar acessíveis');

for(const p of photos){
  assert(dayIds.has(p.dayId),`Dia de foto inexistente: ${p.id}`);
  assert(imageFile(p.file)[p.id],`Imagem ausente: ${p.id}`);
  if(p.spotId){assert(spotBy.has(p.spotId));assert.equal(spotBy.get(p.spotId).dayId,p.dayId);}
  if(p.alternativeSpotId)assert(spotBy.has(p.alternativeSpotId));
  if(p.selected){assert(p.spotId);assert.notEqual(p.precision,'unknown');assert(['fits','adapt'].includes(p.feasibility));}
}
for(const s of spots)for(const source of s.sources)assert(sources.has(source),`Fonte ausente: ${source}`);
for(const v of videos){
  assert(v.takes.length>0,`Vídeo sem captação: ${v.id}`);
  for(const r of v.references)assert(refs.has(r),`Ref ausente: ${v.id}/${r}`);
  for(const t of v.takes){
    assert(dayIds.has(t.dayId));assert(spotBy.has(t.spotId));assert.equal(spotBy.get(t.spotId).dayId,t.dayId);
    if(takes.has(t.id))assert.deepEqual(takes.get(t.id),t,`Take compartilhado divergente: ${t.id}`);else takes.set(t.id,t);
    const day=days.find(d=>d.id===t.dayId);
    assert.equal(day.route.filter(r=>[...r.spots,...(r.captureSpots||[])].includes(t.spotId)).length,1,`Take sem uma única parada: ${t.id}`);
  }
  for(const id of v.coverIds||[]){
    if(id.startsWith('ig-'))assert(imageFile('ck-extras.json')[id],`Capa ausente: ${id}`);
    else assert(photoBy.has(id),`Foto de capa ausente: ${id}`);
  }
}
for(const d of trip.days){
  assert(d.routeHighlight.primary&&d.itinerarySource);
  for(const id of d.photoIds)assert.equal(photoBy.get(id).dayId,d.id);
  for(const id of d.auditPhotoIds)assert(photoBy.has(id));
  for(const r of d.route)for(const id of [...r.spots,...(r.captureSpots||[])])assert.equal(spotBy.get(id).dayId,d.id);
}

function captureIds(dayId,extraVideos=[]){
  const d=days.find(x=>x.id===dayId),active=new Set(d.route.flatMap(enabledSpots));
  return new Set([
    ...videos.filter(v=>!v.optional||extraVideos.includes(v.id)).flatMap(v=>v.takes.filter(t=>t.dayId===dayId&&active.has(t.spotId)).map(t=>'take:'+t.id)),
    ...photos.filter(p=>p.dayId===dayId&&active.has(p.spotId)&&use(p)).map(p=>'photo:'+p.id)
  ]);
}

// Regressões dos vínculos geográficos e da revisão do itinerário.
assert.equal(photoBy.get('269512358948157651').dayId,'kyoto-osaka-06'); // Glico, não Shinjuku
assert.equal(photoBy.get('119063983897845805').dayId,'osaka-09'); // Nintendo, não Disney
assert.equal(photoBy.get('195836283797974291').dayId,'tokyo-31'); // Sky saiu de Ginza / 02/11
assert.equal(photoBy.get('158329743146342063').dayId,'kyoto-04'); // Yasaka, não Chureito
assert.equal(trip.aliases['day-6'],'tokyo-03');
assert.equal(trip.aliases['day-7'],'disney-02');
assert.equal(captureIds('paris-27').size,46,'Progresso original de Paris deve ser preservado');
assert.equal(captureIds('tokyo-31').size,7,'Take que serve ao recap e ao Sky conta uma vez');
assert.equal(captureIds('kyoto-04').size,5,'Frame que serve a três vídeos não gera três gravações');
assert.equal(captureIds('tokyo-01',['J06']).size-captureIds('tokyo-01').size,4,'Drift só entra ao ativar o vídeo opcional');
assert.equal(captureIds('kyoto-04',['J14']).size-captureIds('kyoto-04').size,3,'Chá paralelo só entra ao ativar a captação opcional');
assert(!captureIds('tokyo-01').has('take:J-drift-carro'));
assert.equal(spotBy.get('t01-drift').query,'','Encontro não confirmado não recebe pin de Daikoku');
console.log(JSON.stringify({days:days.length,spots:spots.length,preservedPhotos:photos.length,videos:videos.length,uniqueTakes:takes.size,defaultCaptures:days.reduce((sum,d)=>sum+captureIds(d.id).size,0),data:'OK'},null,2));
