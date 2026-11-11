import {sb} from './db.js';
import {t,lang,ctl,bindCtl} from './ui.js';
const app=document.getElementById('app'),PAGE=document.body.dataset.page;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=b=>{if(b==null)return '∞';const u=['B','KB','MB','GB','TB'];let i=0;b=+b;while(b>=1024&&i<4){b/=1024;i++}return (i?b.toFixed(1):b)+' '+u[i]};
const when=d=>d?new Date(d).toLocaleDateString(lang==='ta'?'ta-IN':'en-IN',{day:'numeric',month:'short',year:'numeric'}):'—';
const err=e=>{const m=(e.message||'')+(e.code||'');return /quota_exceeded/.test(m)?t('Storage is full. Free up space or ask an admin for more.'):/too_large/.test(m)?t('That file is larger than your plan allows.'):/23505/.test(m)?t('An item with that name already exists here.'):e.message};
const toast=(m,bad)=>{const d=document.createElement('div');d.className='toast'+(bad?' bad':'');d.textContent=m;document.body.appendChild(d);setTimeout(()=>d.remove(),3500)};
const fail=e=>toast(err(e),1);
const BASE=location.href.split('#')[0].replace(/[^/]*$/,'');
let S={user:null,role:'user',use:null,items:[],crumbs:[],q:'',view:'list',sort:'name'};
const route=()=>{const h=location.hash.replace(/^#\/?/,'').split('/');return{v:h[0]||'drive',id:h[1]||null}};
const save=()=>sb.from('drive_user_settings').upsert({user_id:S.user.id,view_mode:S.view,sort_by:S.sort});
const modal=h=>{const d=document.createElement('div');d.className='ov';d.innerHTML=`<div class="md"><button class="x" aria-label="${t('Close')}">✕</button>${h}</div>`;
  const close=()=>{d.remove();removeEventListener('keydown',k)},k=e=>{if(e.key==='Escape')close()};addEventListener('keydown',k);
  d.onclick=e=>{if(e.target===d||e.target.closest('.x'))close()};document.body.appendChild(d);d.close=close;return d};

async function boot(){
  const {data:{session}}=await sb.auth.getSession();
  if(!session){sessionStorage.setItem('dd_next',location.hash);location.replace('index.html');return}
  sessionStorage.removeItem('dd_next');S.user=session.user;const r=route();
  if(r.v==='claim'&&r.id){const {error}=await sb.rpc('drive_claim_link',{p_token:r.id});if(error)fail(error);location.hash='#/shared';return}
  const [u,st]=await Promise.all([sb.rpc('drive_my_usage'),sb.from('drive_user_settings').select('view_mode,sort_by').maybeSingle()]);
  if(u.error)return fail(u.error);
  S.use=u.data[0];S.role=S.use.role;S.view=st.data?.view_mode||'list';S.sort=st.data?.sort_by||'name';
  if(PAGE==='admin'&&S.role!=='admin'){location.replace('drive.html');return}
  render(PAGE==='admin'?{v:'admin'}:r);
}
async function fetchItems(r){
  let q=sb.from('drive_items').select('*');
  if(r.v==='drive'&&r.id)q=q.eq('parent_id',r.id).is('trashed_at',null);
  else if(r.v==='drive')q=q.eq('owner',S.user.id).is('parent_id',null).is('trashed_at',null);
  else if(r.v==='recent')q=q.eq('owner',S.user.id).eq('kind','file').is('trashed_at',null).order('updated_at',{ascending:false}).limit(40);
  else if(r.v==='starred')q=q.eq('owner',S.user.id).eq('starred',true).is('trashed_at',null);
  else if(r.v==='trash')q=q.eq('owner',S.user.id).not('trashed_at','is',null);
  else if(r.v==='shared'){
    const {data:sh}=await sb.from('drive_shares').select('item_id').eq('shared_with',S.user.id).eq('revoked',false);
    const ids=(sh||[]).map(x=>x.item_id);if(!ids.length)return[];q=q.in('id',ids).is('trashed_at',null)}
  const {data,error}=await q;if(error){fail(error);return[]}return data;
}
async function crumbs(id){const out=[];let cur=id;for(let i=0;cur&&i<20;i++){const {data}=await sb.from('drive_items').select('id,name,parent_id').eq('id',cur).maybeSingle();if(!data)break;out.unshift(data);cur=data.parent_id}return out}
const NAV=[['drive','📁','My Drive'],['recent','🕘','Recent'],['shared','👥','Shared with me'],['starred','⭐','Starred'],['trash','🗑','Trash']];
async function render(r=route()){
  const adm=r.v==='admin',u=S.use,pct=u.quota_bytes?Math.min(100,u.used_bytes/u.quota_bytes*100):0;
  app.innerHTML=`<div class="top"><span class="logo">🐉 Draco Drive</span>${adm?'':`<input type="search" id="q" placeholder="${t('Search in this view')}" value="${esc(S.q)}">`}<span class="sp"></span>${ctl()}<span class="badge">${t(S.role)}</span><span class="m em">${esc(S.user.email||'')}</span><button id="out">${t('Sign out')}</button></div>
  <div class="wrap"><nav>${adm?'':`<button class="pri" id="new">＋ ${t('New folder')}</button><button id="up">⬆ ${t('Upload')}</button>`}
  ${NAV.map(([k,i,l])=>`<a href="drive.html#/${k}" class="${r.v===k?'on':''}">${i} ${t(l)}</a>`).join('')}${S.role==='admin'?`<a href="admin.html" class="${adm?'on':''}">🛡 ${t('Admin')}</a>`:''}
  <div class="usage"><div class="bar"><i style="width:${pct}%"></i></div><div class="m">${t('{0} of {1} used',fmt(u.used_bytes),fmt(u.quota_bytes))}</div></div></nav>
  <main id="main"><p class="m">${t('Loading…')}</p></main></div><input type="file" id="file" multiple hidden>`;
  bindCtl(()=>render(r));
  document.getElementById('out').onclick=async()=>{await sb.auth.signOut();location.replace('index.html')};
  if(adm)return admin();
  const $=id=>document.getElementById(id),main=$('main');
  $('q').oninput=e=>{S.q=e.target.value;list(r)};
  $('new').onclick=()=>newFolder(r);const f=$('file');$('up').onclick=()=>f.click();f.onchange=()=>upload(f.files,r);
  main.ondragover=e=>{e.preventDefault();main.classList.add('drop')};main.ondragleave=()=>main.classList.remove('drop');
  main.ondrop=e=>{e.preventDefault();main.classList.remove('drop');upload(e.dataTransfer.files,r)};
  main.innerHTML=`<div class="tb"><div id="hd"></div><div class="tools"><select id="so">${[['name','Name'],['updated','Last modified'],['size','Size']].map(([k,l])=>`<option value="${k}" ${S.sort===k?'selected':''}>${t(l)}</option>`).join('')}</select><button id="vw"></button></div></div><div id="ls" class="ls"><p class="m">${t('Loading…')}</p></div>`;
  const vw=$('vw'),paint=()=>{vw.textContent=S.view==='grid'?'☰':'▦';vw.title=t(S.view==='grid'?'List':'Grid')};paint();
  $('so').onchange=e=>{S.sort=e.target.value;save();list(r)};vw.onclick=()=>{S.view=S.view==='grid'?'list':'grid';paint();save();list(r)};
  S.items=await fetchItems(r);S.crumbs=r.v==='drive'&&r.id?await crumbs(r.id):[];list(r);
}
function list(r){
  const q=S.q.toLowerCase(),me=S.user.id;let it=S.items.filter(i=>i.name.toLowerCase().includes(q));
  if(r.v!=='recent'){const o={name:(a,b)=>a.name.localeCompare(b.name,lang),updated:(a,b)=>new Date(b.updated_at)-new Date(a.updated_at),size:(a,b)=>b.size_bytes-a.size_bytes}[S.sort];
    it.sort((a,b)=>(b.kind==='folder')-(a.kind==='folder')||o(a,b))}
  document.getElementById('hd').innerHTML=r.v==='drive'?`<div class="crumb"><a href="drive.html#/drive">${t('My Drive')}</a>${S.crumbs.map(c=>` / <a href="drive.html#/drive/${c.id}">${esc(c.name)}</a>`).join('')}</div>`:`<h3>${t(NAV.find(n=>n[0]===r.v)[2])}</h3>`;
  const ls=document.getElementById('ls');ls.className='ls '+S.view;
  ls.innerHTML=it.length?it.map(i=>{const own=i.owner===me;return `<div class="it" data-id="${i.id}"><div class="nm" data-a="open"><span class="ic">${i.kind==='folder'?'📁':'📄'}</span> <span class="nn">${esc(i.name)}</span></div><div class="m">${when(i.updated_at)}</div><div class="m">${i.kind==='file'?fmt(i.size_bytes):'—'}</div><div class="acts">${
   r.v==='trash'?`<button data-a="restore">${t('Restore')}</button><button data-a="purge">${t('Delete forever')}</button>`:
   (own?`<button data-a="star" title="${t('Starred')}">${i.starred?'★':'☆'}</button><button data-a="share" title="${t('Share')}">👥</button><button data-a="rename" title="${t('Rename')}">✏️</button><button data-a="move" title="${t('Move')}">📂</button>`:'')+
   (i.kind==='file'?`<button data-a="dl" title="${t('Download')}">⬇</button>`:'')+(own?`<button data-a="trash" title="${t('Trash')}">🗑</button>`:'')}</div></div>`}).join(''):`<p class="m">${t('Nothing here yet.')}</p>`;
  ls.onclick=async e=>{const b=e.target.closest('[data-a]');if(!b)return;await act(b.dataset.a,S.items.find(x=>x.id===b.closest('.it').dataset.id),r)};
}
async function act(a,it,r){
  let e;
  if(a==='open')return it.kind==='folder'?(location.hash='#/drive/'+it.id):preview(it);
  if(a==='dl')return dl(it);if(a==='share')return shareItem(it);if(a==='move')return moveItem(it,r);
  if(a==='star')({error:e}=await sb.from('drive_items').update({starred:!it.starred}).eq('id',it.id));
  else if(a==='rename'){const n=prompt(t('New name'),it.name);if(!n||n.trim()===it.name)return;({error:e}=await sb.from('drive_items').update({name:n.trim()}).eq('id',it.id))}
  else if(a==='trash')({error:e}=await sb.from('drive_items').update({trashed_at:new Date().toISOString()}).eq('id',it.id));
  else if(a==='restore')({error:e}=await sb.from('drive_items').update({trashed_at:null}).eq('id',it.id));
  else if(a==='purge'){if(!confirm(t('Delete "{0}" forever?',it.name)))return;({error:e}=await sb.from('drive_items').delete().eq('id',it.id));
    if(!e&&it.storage_path)await sb.storage.from('draco-drive').remove([it.storage_path])}
  if(e)return fail(e);refresh(r);
}
async function refresh(r){const {data}=await sb.rpc('drive_my_usage');S.use=data[0];render(r)}
async function dl(it){const {data,error}=await sb.storage.from('draco-drive').createSignedUrl(it.storage_path,60,{download:it.name});if(error)return fail(error);location.href=data.signedUrl}
async function newFolder(r){
  const name=prompt(t('Folder name'));if(!name)return;
  const {error}=await sb.from('drive_items').insert({owner:S.user.id,parent_id:r.v==='drive'?r.id:null,name:name.trim(),kind:'folder'});
  if(error)return fail(error);render(r)}
async function upload(files,r){
  if(r.v!=='drive'||!files.length)return r.v!=='drive'&&toast(t('Open My Drive or a folder to upload.'),1);
  toast(t('Uploading {0} file(s)…',files.length));
  for(const f of files){
    const id=crypto.randomUUID(),path=S.user.id+'/'+id;
    const {error}=await sb.from('drive_items').insert({id,owner:S.user.id,parent_id:r.id||null,name:f.name,kind:'file',mime_type:f.type||null,size_bytes:f.size,storage_path:path});
    if(error){toast(f.name+': '+err(error),1);continue}
    const up=await sb.storage.from('draco-drive').upload(path,f,{contentType:f.type||'application/octet-stream'});
    if(up.error){await sb.from('drive_items').delete().eq('id',id);toast(f.name+': '+up.error.message,1)}
  }
  toast(t('Uploaded'));refresh(r)}
async function moveItem(it,r){
  const {data}=await sb.from('drive_items').select('id,name,parent_id').eq('owner',S.user.id).eq('kind','folder').is('trashed_at',null);
  const by=Object.fromEntries((data||[]).map(f=>[f.id,f])),path=f=>(f.parent_id&&by[f.parent_id]?path(by[f.parent_id])+' / ':'')+f.name;
  const opts=(data||[]).filter(f=>f.id!==it.id).map(f=>[f.id,path(f)]).sort((a,b)=>a[1].localeCompare(b[1],lang));
  const m=modal(`<h3>${t('Move to…')}</h3><select class="f" id="mv"><option value="">${t('My Drive')}</option>${opts.map(([id,p])=>`<option value="${id}" ${id===it.parent_id?'selected':''}>${esc(p)}</option>`).join('')}</select><button class="pri" id="mg">${t('Move here')}</button>`);
  m.querySelector('#mg').onclick=async()=>{const {error}=await sb.from('drive_items').update({parent_id:m.querySelector('#mv').value||null}).eq('id',it.id);if(error)return fail(error);m.close();refresh(r)}}
async function acl(m,it){
  const {data,error}=await sb.rpc('drive_item_access',{p_item:it.id});if(error)return fail(error);
  m.querySelector('#acl').innerHTML=data.length?data.map(a=>`<div class="ar" data-s="${a.share_id}"><span class="nn">${a.is_link?'🔗 '+t('Link (any signed-in user)'):esc(a.email)}</span>${a.is_link?`<button data-k="${a.link_token}">${t('Copy link')}</button>`:`<select data-r><option value="viewer" ${a.role==='viewer'?'selected':''}>${t('Can view')}</option><option value="editor" ${a.role==='editor'?'selected':''}>${t('Can edit')}</option></select>`}<button data-x>${t('Remove')}</button></div>`).join(''):`<p class="m">${t('Only you')}</p>`}
function shareItem(it){
  const m=modal(`<h3>${t('Share "{0}"',esc(it.name))}</h3><div class="sr"><input class="f" id="se" type="email" placeholder="${t('Email address')}"><select id="sr"><option value="viewer">${t('Can view')}</option><option value="editor">${t('Can edit')}</option></select><button class="pri" id="sa">${t('Add person')}</button></div>
   <div class="sr"><button id="sl">🔗 ${t('Create link')}</button></div><h4>${t('Who has access')}</h4><div id="acl"></div>`);
  const q=s=>m.querySelector(s);acl(m,it);
  q('#sa').onclick=async()=>{const em=q('#se').value.trim();if(!em)return;const {data:f,error}=await sb.rpc('drive_find_user',{p_email:em});if(error)return fail(error);
    if(!f.length)return toast(t('No account found for that email.'),1);
    const x=await sb.from('drive_shares').insert({item_id:it.id,owner:S.user.id,shared_with:f[0].user_id,role:q('#sr').value});if(x.error)return toast(x.error.message,1);q('#se').value='';acl(m,it)};
  const copy=k=>navigator.clipboard?.writeText(BASE+'drive.html#/claim/'+k).then(()=>toast(t('Link copied')));
  q('#sl').onclick=async()=>{const {data,error}=await sb.rpc('drive_create_link',{p_item:it.id,p_role:'viewer'});if(error)return fail(error);copy(data);acl(m,it)};
  m.onclick=async e=>{const k=e.target.closest('[data-k]'),x=e.target.closest('[data-x]');
    if(k)copy(k.dataset.k);if(x){const {error}=await sb.from('drive_shares').delete().eq('id',x.closest('.ar').dataset.s);if(error)return fail(error);acl(m,it)}};
  m.onchange=async e=>{if(e.target.matches('[data-r]')){const {error}=await sb.from('drive_shares').update({role:e.target.value}).eq('id',e.target.closest('.ar').dataset.s);if(error)fail(error)}};
}
async function preview(it){
  const {data,error}=await sb.storage.from('draco-drive').createSignedUrl(it.storage_path,300);if(error)return fail(error);
  const u=data.signedUrl,ty=it.mime_type||'';
  const body=ty.startsWith('image/')?`<img src="${u}" alt="">`:ty.startsWith('video/')?`<video src="${u}" controls autoplay></video>`:ty.startsWith('audio/')?`<audio src="${u}" controls autoplay></audio>`:(ty==='application/pdf'||ty.startsWith('text/'))?`<iframe src="${u}"></iframe>`:`<p>${t('No preview for this file type. Use Download.')}</p>`;
  const d=document.createElement('div');d.className='pv';
  d.innerHTML=`<div class="pvh"><b>${esc(it.name)}</b><span><button id="pd">⬇ ${t('Download')}</button> <button id="px" aria-label="${t('Close')}">✕</button></span></div><div class="pvb">${body}</div>`;
  const k=e=>{if(e.key==='Escape')off()},off=()=>{d.remove();removeEventListener('keydown',k)};
  document.body.appendChild(d);d.querySelector('#px').onclick=off;d.querySelector('#pd').onclick=()=>dl(it);addEventListener('keydown',k)}
async function admin(){
  const main=document.getElementById('main');
  const [st,ov,pl]=await Promise.all([sb.rpc('drive_admin_stats'),sb.rpc('drive_admin_overview'),sb.from('drive_quota_plans').select('*')]);
  if(st.error||ov.error)return fail(st.error||ov.error);
  const s=st.data[0],T=(l,v)=>`<div class="tile"><span class="m">${t(l)}</span><b>${v}</b></div>`;
  main.innerHTML=`<h3>🛡 ${t('Admin')}</h3><div class="tiles">${T('Users',s.total_users)}${T('Files',s.total_files)}${T('Folders',s.total_folders)}${T('Storage used',fmt(s.total_bytes))}${T('In trash',fmt(s.trashed_bytes))}${T('Active shares',s.active_shares)}</div>
  <h4>${t('Role plans')}</h4><div class="sc"><table><tr><th>${t('Role')}</th><th>${t('Quota')}</th><th>${t('Max file')}</th><th></th></tr>${(pl.data||[]).map(p=>`<tr><td>${t(p.role)}</td><td>${fmt(p.quota_bytes)}</td><td>${fmt(p.max_file_bytes)}</td><td><button data-plan="${p.role}">${t('Edit quota')}</button></td></tr>`).join('')}</table></div>
  <h4>${t('Users')}</h4><div class="sc"><table><tr><th>${t('User')}</th><th>${t('Role')}</th><th>${t('Files')}</th><th>${t('Used / Quota')}</th><th>${t('Last upload')}</th><th></th></tr>${ov.data.map(u=>`<tr><td>${esc(u.display_name||'')}<div class="m">${esc(u.email||'')}</div></td><td>${t(u.role)}</td><td>${u.file_count}</td><td>${fmt(u.used_bytes)} / ${fmt(u.quota_bytes)}</td><td>${when(u.last_upload)}</td><td><button data-q="${u.user_id}">${t('Set quota')}</button></td></tr>`).join('')}</table></div>
  <p class="m">${t('Admins see file names and sizes for moderation, never file contents.')}</p>`;
  main.onclick=async e=>{
    const gb=v=>{const x=v.trim().toLowerCase();return x==='unlimited'?null:Math.round(parseFloat(x)*1073741824)};
    const pb=e.target.closest('[data-plan]'),qb=e.target.closest('[data-q]');
    if(pb){const v=prompt(t('Quota in GB, or "unlimited"'));if(v==null)return;const n=gb(v);if(n!==null&&isNaN(n))return;const {error}=await sb.from('drive_quota_plans').update({quota_bytes:n,updated_at:new Date().toISOString()}).eq('role',pb.dataset.plan);if(error)return fail(error);admin()}
    if(qb){const v=prompt(t('Quota in GB, "unlimited", or "plan" to use the role default'));if(v==null)return;let r;
      if(v.trim().toLowerCase()==='plan')r=await sb.from('drive_quota_overrides').delete().eq('user_id',qb.dataset.q);
      else{const n=gb(v);if(n!==null&&isNaN(n))return;r=await sb.from('drive_quota_overrides').upsert({user_id:qb.dataset.q,quota_bytes:n,updated_by:S.user.id})}
      if(r.error)return fail(r.error);admin()}};
}
if(PAGE==='drive')addEventListener('hashchange',boot);
sb.auth.onAuthStateChange(ev=>{if(ev==='SIGNED_OUT')location.replace('index.html')});boot();
