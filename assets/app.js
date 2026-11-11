import {sb} from './db.js';
const app=document.getElementById('app'),PAGE=document.body.dataset.page;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=b=>{if(b==null)return '∞';const u=['B','KB','MB','GB','TB'];let i=0;b=+b;while(b>=1024&&i<4){b/=1024;i++}return (i?b.toFixed(1):b)+' '+u[i]};
const when=d=>d?new Date(d).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}):'—';
const err=e=>{const m=(e.message||'')+(e.code||'');return /quota_exceeded/.test(m)?'Storage is full. Free up space or ask an admin for more.':/too_large/.test(m)?'That file is larger than your plan allows.':/23505|duplicate/.test(m)?'An item with that name already exists here.':e.message};
const fail=e=>{alert(err(e));};
let S={user:null,role:'user',use:null,items:[],crumbs:[],q:''};
const route=()=>{const h=location.hash.replace(/^#\/?/,'').split('/');return{v:h[0]||'drive',id:h[1]||null}};

async function boot(){
  const {data:{session}}=await sb.auth.getSession();
  if(!session){sessionStorage.setItem('dd_next',location.hash);location.replace('index.html');return}
  S.user=session.user;
  const r=route();
  if(r.v==='claim'&&r.id){const {error}=await sb.rpc('drive_claim_link',{p_token:r.id});if(error)fail(error);location.hash='#/shared';return}
  const {data:u,error}=await sb.rpc('drive_my_usage');
  if(error)return fail(error);
  S.use=u[0];S.role=S.use.role;
  if(PAGE==='admin'&&S.role!=='admin'){location.replace('drive.html');return}
  render(PAGE==='admin'?{v:'admin'}:r);
}
async function fetchItems(r){
  let q=sb.from('drive_items').select('*');
  if(r.v==='drive'&&r.id)q=q.eq('parent_id',r.id).is('trashed_at',null);
  else if(r.v==='drive')q=q.eq('owner',S.user.id).is('parent_id',null).is('trashed_at',null);
  else if(r.v==='starred')q=q.eq('owner',S.user.id).eq('starred',true).is('trashed_at',null);
  else if(r.v==='trash')q=q.eq('owner',S.user.id).not('trashed_at','is',null);
  else if(r.v==='shared'){
    const {data:sh}=await sb.from('drive_shares').select('item_id').eq('shared_with',S.user.id).eq('revoked',false);
    const ids=(sh||[]).map(x=>x.item_id);if(!ids.length)return[];q=q.in('id',ids).is('trashed_at',null)}
  const {data,error}=await q.order('kind',{ascending:false}).order('name');
  if(error){fail(error);return[]}return data;
}
async function crumbs(id){const out=[];let cur=id;for(let i=0;cur&&i<20;i++){const {data}=await sb.from('drive_items').select('id,name,parent_id').eq('id',cur).maybeSingle();if(!data)break;out.unshift(data);cur=data.parent_id}return out}
const NAV=[['drive','📁 My Drive'],['shared','👥 Shared with me'],['starred','⭐ Starred'],['trash','🗑 Trash']];
async function render(r=route()){
  const adminNav=S.role==='admin'?`<a href="admin.html" class="${r.v==='admin'?'on':''}">🛡 Admin</a>`:'';
  const u=S.use,pct=u.quota_bytes?Math.min(100,u.used_bytes/u.quota_bytes*100):0;
  app.innerHTML=`<div class="top"><span class="logo">🐉 Draco Drive</span><input type="search" id="q" placeholder="Search in this view" value="${esc(S.q)}"><span class="sp"></span>
   <span class="badge">${esc(S.role)}</span><span class="m">${esc(S.user.email||S.user.phone||'')}</span><button id="out">Sign out</button></div>
  <div class="wrap"><nav>${r.v==='admin'?'':'<button class="pri" id="new">＋ New folder</button><button id="up">⬆ Upload</button>'}
   ${NAV.map(([k,l])=>`<a href="drive.html#/${k}" class="${r.v===k?'on':''}">${l}</a>`).join('')}${adminNav}
   <div style="margin-top:auto"><div class="bar"><i style="width:${pct}%"></i></div><div class="m">${fmt(u.used_bytes)} of ${fmt(u.quota_bytes)} used</div></div></nav>
  <main id="main"><p class="m">Loading…</p></main></div><input type="file" id="file" multiple hidden>`;
  document.getElementById('out').onclick=async()=>{await sb.auth.signOut();sessionStorage.removeItem('dd_next');location.replace('index.html')};
  document.getElementById('q').oninput=e=>{S.q=e.target.value;list(r)};
  if(r.v==='admin')return admin();
  document.getElementById('new').onclick=()=>newFolder(r);
  const f=document.getElementById('file');document.getElementById('up').onclick=()=>f.click();f.onchange=()=>upload(f.files,r);
  const m=document.getElementById('main');
  m.ondragover=e=>{e.preventDefault();m.classList.add('drop')};m.ondragleave=()=>m.classList.remove('drop');
  m.ondrop=e=>{e.preventDefault();m.classList.remove('drop');upload(e.dataTransfer.files,r)};
  S.items=await fetchItems(r);S.crumbs=r.v==='drive'&&r.id?await crumbs(r.id):[];list(r);
}
function list(r){
  const mine=i=>i.owner===S.user.id,q=S.q.toLowerCase();
  const items=S.items.filter(i=>i.name.toLowerCase().includes(q));
  const cr=r.v==='drive'?`<div class="crumb"><a href="#/drive">My Drive</a>${S.crumbs.map(c=>` / <a href="#/drive/${c.id}">${esc(c.name)}</a>`).join('')}</div>`:`<h3>${NAV.find(n=>n[0]===r.v)?.[1]||''}</h3>`;
  document.getElementById('main').innerHTML=cr+(items.length?items.map(i=>`<div class="row" data-id="${i.id}">
    <div class="nm" data-a="open">${i.kind==='folder'?'📁':'📄'} ${esc(i.name)}</div><div class="m">${when(i.updated_at)}</div><div class="m">${i.kind==='file'?fmt(i.size_bytes):'—'}</div>
    <div class="acts">${r.v==='trash'?'<button data-a="restore">Restore</button><button data-a="purge">Delete forever</button>':
     (mine(i)?`<button data-a="star">${i.starred?'★':'☆'}</button><button data-a="share">Share</button><button data-a="rename">Rename</button>`:'')+
     (i.kind==='file'?'<button data-a="dl">⬇</button>':'')+(mine(i)?'<button data-a="trash">🗑</button>':'')}</div></div>`).join(''):'<p class="m">Nothing here yet.</p>');
  document.getElementById('main').onclick=async e=>{
    const b=e.target.closest('[data-a]');if(!b)return;const id=b.closest('.row').dataset.id,it=S.items.find(x=>x.id===id);
    await act(b.dataset.a,it,r)};
}
async function act(a,it,r){
  let e;
  if(a==='open'){if(it.kind==='folder'){location.hash='#/drive/'+it.id;return}return preview(it)}
  if(a==='dl')return dl(it);
  if(a==='star')({error:e}=await sb.from('drive_items').update({starred:!it.starred}).eq('id',it.id));
  else if(a==='rename'){const n=prompt('New name',it.name);if(!n||n===it.name)return;({error:e}=await sb.from('drive_items').update({name:n.trim()}).eq('id',it.id))}
  else if(a==='trash')({error:e}=await sb.from('drive_items').update({trashed_at:new Date().toISOString()}).eq('id',it.id));
  else if(a==='restore')({error:e}=await sb.from('drive_items').update({trashed_at:null}).eq('id',it.id));
  else if(a==='purge'){if(!confirm('Delete "'+it.name+'" forever?'))return;({error:e}=await sb.from('drive_items').delete().eq('id',it.id));
    if(!e&&it.storage_path)await sb.storage.from('draco-drive').remove([it.storage_path])}
  else if(a==='share')return share(it);
  if(e)return fail(e);await refresh(r);
}
async function refresh(r){const {data}=await sb.rpc('drive_my_usage');S.use=data[0];render(r)}
async function dl(it){const {data,error}=await sb.storage.from('draco-drive').createSignedUrl(it.storage_path,60,{download:it.name});if(error)return fail(error);location.href=data.signedUrl}
async function newFolder(r){
  const name=prompt('Folder name');if(!name)return;
  const {error}=await sb.from('drive_items').insert({owner:S.user.id,parent_id:r.v==='drive'?r.id:null,name:name.trim(),kind:'folder'});
  if(error)return fail(error);render(r)}
async function upload(files,r){
  if(r.v!=='drive')return alert('Open My Drive or a folder to upload.');
  for(const f of files){
    const id=crypto.randomUUID(),path=S.user.id+'/'+id;
    const {error}=await sb.from('drive_items').insert({id,owner:S.user.id,parent_id:r.id||null,name:f.name,kind:'file',mime_type:f.type||null,size_bytes:f.size,storage_path:path});
    if(error){alert(f.name+': '+err(error));continue}
    const up=await sb.storage.from('draco-drive').upload(path,f,{contentType:f.type||'application/octet-stream'});
    if(up.error){await sb.from('drive_items').delete().eq('id',id);alert(f.name+': '+up.error.message)}
  }
  await refresh(r)}
async function share(it){
  const em=prompt('Share "'+it.name+'" with (email) — leave blank to create a link');if(em===null)return;
  if(!em.trim()){const {data,error}=await sb.rpc('drive_create_link',{p_item:it.id,p_role:'viewer'});if(error)return fail(error);
    return prompt('Anyone signed in with this link can view:',location.origin+location.pathname+'#/claim/'+data)}
  const {data:f,error}=await sb.rpc('drive_find_user',{p_email:em});if(error)return fail(error);
  if(!f.length)return alert('No Caged-Dragon account found for that email.');
  const role=confirm('Allow them to edit (rename)? OK = editor, Cancel = viewer')?'editor':'viewer';
  const r=await sb.from('drive_shares').insert({item_id:it.id,owner:S.user.id,shared_with:f[0].user_id,role});
  alert(r.error?err(r.error):'Shared with '+(f[0].display_name||em))}
/* ---------- admin route ---------- */
async function admin(){
  const [st,ov,pl]=await Promise.all([sb.rpc('drive_admin_stats'),sb.rpc('drive_admin_overview'),sb.from('drive_quota_plans').select('*')]);
  if(st.error||ov.error)return fail(st.error||ov.error);
  const s=st.data[0],T=(l,v)=>`<div class="tile"><span class="m">${l}</span><b>${v}</b></div>`;
  document.getElementById('main').innerHTML=`<h3>🛡 Admin</h3><div class="tiles">${T('Users',s.total_users)}${T('Files',s.total_files)}${T('Folders',s.total_folders)}${T('Storage used',fmt(s.total_bytes))}${T('In trash',fmt(s.trashed_bytes))}${T('Active shares',s.active_shares)}</div>
  <h4>Role plans</h4><table><tr><th>Role</th><th>Quota</th><th>Max file</th><th></th></tr>${(pl.data||[]).map(p=>`<tr><td>${p.role}</td><td>${fmt(p.quota_bytes)}</td><td>${fmt(p.max_file_bytes)}</td><td><button data-plan="${p.role}">Edit quota</button></td></tr>`).join('')}</table>
  <h4>Users</h4><table><tr><th>User</th><th>Role</th><th>Files</th><th>Used / Quota</th><th>Last upload</th><th></th></tr>${ov.data.map(u=>`<tr><td>${esc(u.display_name||'')}<div class="m">${esc(u.email||'')}</div></td><td>${u.role}</td><td>${u.file_count}</td><td>${fmt(u.used_bytes)} / ${fmt(u.quota_bytes)}</td><td>${when(u.last_upload)}</td><td><button data-q="${u.user_id}">Set quota</button></td></tr>`).join('')}</table>
  <p class="m">Admins see file names and sizes for moderation, never file contents.</p>`;
  document.getElementById('main').onclick=async e=>{
    const gb=v=>{const t=v.trim().toLowerCase();return t==='unlimited'?null:Math.round(parseFloat(t)*1073741824)};
    const pb=e.target.closest('[data-plan]'),qb=e.target.closest('[data-q]');
    if(pb){const v=prompt('Quota in GB, or "unlimited"');if(v==null)return;const n=gb(v);if(n!==null&&isNaN(n))return;const {error}=await sb.from('drive_quota_plans').update({quota_bytes:n,updated_at:new Date().toISOString()}).eq('role',pb.dataset.plan);if(error)return fail(error);admin()}
    if(qb){const v=prompt('Quota in GB, "unlimited", or "plan" to use the role default');if(v==null)return;let r;
      if(v.trim().toLowerCase()==='plan')r=await sb.from('drive_quota_overrides').delete().eq('user_id',qb.dataset.q);
      else{const n=gb(v);if(n!==null&&isNaN(n))return;r=await sb.from('drive_quota_overrides').upsert({user_id:qb.dataset.q,quota_bytes:n,updated_by:S.user.id})}
      if(r.error)return fail(r.error);admin()}};
}
async function preview(it){
  const {data,error}=await sb.storage.from('draco-drive').createSignedUrl(it.storage_path,300);if(error)return fail(error);
  const u=data.signedUrl,t=it.mime_type||'';
  const body=t.startsWith('image/')?`<img src="${u}">`:t.startsWith('video/')?`<video src="${u}" controls autoplay></video>`:t.startsWith('audio/')?`<audio src="${u}" controls autoplay></audio>`:(t==='application/pdf'||t.startsWith('text/'))?`<iframe src="${u}"></iframe>`:'<p class="m">No preview for this file type. Use Download.</p>';
  const d=document.createElement('div');d.className='pv';
  d.innerHTML=`<div class="pvh"><b>${esc(it.name)}</b><span><button id="pd">Download</button> <button id="px">✕</button></span></div><div class="pvb">${body}</div>`;
  document.body.appendChild(d);d.querySelector('#px').onclick=()=>d.remove();d.querySelector('#pd').onclick=()=>dl(it);
  addEventListener('keydown',function k(e){if(e.key==='Escape'){d.remove();removeEventListener('keydown',k)}})}
if(PAGE==='drive')addEventListener('hashchange',boot);
sb.auth.onAuthStateChange(ev=>{if(ev==='SIGNED_OUT')location.replace('index.html')});boot();
