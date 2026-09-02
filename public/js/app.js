const $=s=>document.querySelector(s);

const api=async(url,opt={})=>{
  const r=await fetch(url,{credentials:"include",...opt});
  const x=await r.json().catch(()=>({success:false,message:"Invalid response"}));
  if(r.status===401){location="/login.html";throw Error("Authentication required")}
  if(!r.ok||x.success===false)throw Error(x.message||"Request failed");
  return x;
};

const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const size=n=>{if(!n)return"0 B";let u=["B","KB","MB","GB","TB"],i=Math.floor(Math.log(n)/Math.log(1024));return(n/1024**i).toFixed(i?1:0)+" "+u[i]};
const icon=f=>f.mimeType?.startsWith("image/")?"🖼️":f.mimeType?.startsWith("video/")?"🎬":f.mimeType?.startsWith("audio/")?"🎵":f.mimeType==="application/pdf"?"📕":f.mimeType?.includes("zip")?"🗜️":"📄";

let state={folder:null,view:"grid"};

async function boot(){
  try{
    const me=await api("/api/users/me");
    render(me.data.user);
    await load();
  }catch(e){
    location="/login.html";
  }
}

function render(user){
  document.body.innerHTML=`
  <div class="app">
    <aside class="sidebar" id="side" aria-label="Main navigation">
      <div class="brand">☁️ CloudDrive</div>
      <nav class="nav">
        <button onclick="goRoot();closeMenu()">📁 My Drive</button>
        <button onclick="loadRecent();closeMenu()">🕘 Recent</button>
        <button onclick="loadStarred();closeMenu()">⭐ Starred</button>
        <button onclick="showTrash();closeMenu()">🗑️ Trash</button>
        <button onclick="showStorage();closeMenu()">💾 Storage</button>
        ${user.role==="admin"?'<button onclick="showAdmin();closeMenu()">🛡️ Admin</button>':""}
        <button onclick="toggleDark()">🌙 Theme</button>
        <button onclick="logout()">↪️ Logout</button>
      </nav>
    </aside>
    <div class="sidebar-backdrop" id="backdrop" onclick="closeMenu()"></div>
    <section class="main">
      <header class="topbar">
        <button class="btn secondary mobile-only" aria-label="Open menu" onclick="toggleMenu()">☰</button>
        <input id="search" class="search" type="search" aria-label="Search files and folders" placeholder="Search files and folders…" oninput="search(this.value)">
        <span class="muted user-name" title="${esc(user.name)}">${esc(user.name)}</span>
      </header>
      <main class="content" id="content"></main>
    </section>
  </div>`;
}

function toggleMenu(){
  const side=$("#side"),backdrop=$("#backdrop");
  side?.classList.toggle("open");
  backdrop?.classList.toggle("show",side?.classList.contains("open"));
}
function closeMenu(){
  $("#side")?.classList.remove("open");
  $("#backdrop")?.classList.remove("show");
}
function goRoot(){state.folder=null;load();closeMenu()}

async function load(){
  try{
    const x=await api("/api/files?folder="+(state.folder||""));
    const c=$("#content");
    c.innerHTML=`
      <div class="actions">
        <button class="btn primary" onclick="pickFiles()">⬆ Upload</button>
        <button class="btn secondary" onclick="newFolder()">＋ Folder</button>
        <button class="btn secondary" onclick="state.view=state.view==='grid'?'list':'grid';load()">▦ View</button>
        ${state.folder?'<button class="btn secondary" onclick="goRoot()">← My Drive</button>':""}
      </div>
      <div id="drop" class="upload-drop">Drag & drop files here or click Upload</div>
      <div id="list" class="${state.view} grid"></div>`;

    const list=$("#list");
    x.data.folders.forEach(f=>list.insertAdjacentHTML("beforeend",folderCard(f)));
    x.data.files.forEach(f=>list.insertAdjacentHTML("beforeend",fileCard(f)));

    const drop=$("#drop");
    drop.onclick=pickFiles;
    drop.ondragover=e=>{e.preventDefault();drop.classList.add("drag")};
    drop.ondragleave=()=>drop.classList.remove("drag");
    drop.ondrop=e=>{e.preventDefault();drop.classList.remove("drag");uploadFiles([...e.dataTransfer.files])};
  }catch(e){toast(e.message)}
}

function folderCard(f){
  return `<article class="card">
    <div onclick="openFolder('${f._id}')" class="clickable">
      <div class="icon">📁</div><b>${esc(f.name)}</b><div class="muted">Folder</div>
    </div>
    <div class="card-actions">
      <button class="btn secondary" onclick="renameFolder('${f._id}','${esc(f.name)}')">Rename</button>
      <button class="btn secondary" onclick="deleteFolder('${f._id}')">Delete</button>
    </div>
  </article>`;
}

function fileCard(f){
  return `<article class="card">
    <div onclick="preview('${f._id}')" class="clickable">
      <div class="icon">${icon(f)}</div>
      <b title="${esc(f.name)}">${esc(f.name)}</b>
      <div class="muted">${size(f.size)} · ${esc(f.mimeType||"file")}</div>
    </div>
    <div class="card-actions">
      <button class="btn secondary" onclick="download('${f._id}')">Download</button>
      <button class="btn secondary" onclick="renameFile('${f._id}','${esc(f.name)}')">Rename</button>
      <button class="btn secondary" onclick="share('${f._id}')">Share</button>
      <button class="btn secondary" onclick="star('${f._id}',${!f.starred})">${f.starred?"★":"☆"}</button>
      <button class="btn danger" onclick="deleteFile('${f._id}')">Delete</button>
    </div>
  </article>`;
}

function pickFiles(){
  const i=document.createElement("input");
  i.type="file";
  i.multiple=true;
  i.onchange=()=>uploadFiles([...i.files]);
  i.click();
}

async function uploadFiles(fs){
  for(const f of fs){
    try{
      const fd=new FormData();
      fd.append("files",f);
      if(state.folder)fd.append("folder",state.folder);
      const x=await api("/api/files/upload",{method:"POST",body:fd});
      toast(`${f.name}: ${x.message}`);
    }catch(e){toast(`${f.name}: ${e.message}`)}
  }
  await load();
}

async function newFolder(){
  const n=prompt("Folder name");
  if(!n)return;
  try{
    await api("/api/folders",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:n,parent:state.folder})});
    await load();
  }catch(e){toast(e.message)}
}

function openFolder(id){state.folder=id;load()}

async function renameFolder(id,n){
  const x=prompt("New folder name",n);
  if(!x)return;
  try{
    await api("/api/folders/"+id,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:x})});
    await load();
  }catch(e){toast(e.message)}
}

async function deleteFolder(id){
  if(!confirm("Move folder to trash?"))return;
  try{await api("/api/folders/"+id,{method:"DELETE"});await load()}catch(e){toast(e.message)}
}

async function renameFile(id,n){
  const x=prompt("New filename",n);
  if(!x)return;
  try{
    await api("/api/files/"+id,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:x})});
    await load();
  }catch(e){toast(e.message)}
}

async function deleteFile(id){
  if(!confirm("Move file to trash?"))return;
  try{await api("/api/files/"+id,{method:"DELETE"});await load()}catch(e){toast(e.message)}
}

async function star(id,v){
  try{
    await api("/api/files/"+id,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({starred:v})});
    await load();
  }catch(e){toast(e.message)}
}

function download(id){location="/api/files/"+id+"/download"}

function preview(id){
  const w=window.open();
  if(!w){toast("Please allow popups");return}
  w.location="/api/files/"+id+"/preview";
}

async function share(id){
  try{
    const x=await api("/api/files/"+id+"/share",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({permission:"viewer",publicLink:true})});
    await navigator.clipboard?.writeText(x.data.link);
    toast("Share link copied");
  }catch(e){toast(e.message)}
}

async function search(q){
  if(!q){load();return}
  try{
    const x=await api("/api/search?q="+encodeURIComponent(q));
    $("#content").innerHTML=`<div class="actions"><button class="btn secondary" onclick="load()">← Back</button></div><div class="grid">${x.data.files.map(fileCard).join("")||"<div class='panel'>No files found.</div>"}</div>`;
  }catch(e){toast(e.message)}
}

async function loadRecent(){
  try{
    const x=await api("/api/activity");
    $("#content").innerHTML=`<h2>Recent activity</h2><div class="panel">${x.data.activity.map(a=>`<p>• ${esc(a.action)} ${esc(a.file?.name||"")} <span class="muted">${new Date(a.createdAt).toLocaleString()}</span></p>`).join("")||"No recent activity."}</div>`;
  }catch(e){toast(e.message)}
}

async function loadStarred(){
  try{
    const x=await api("/api/files?starred=true");
    $("#content").innerHTML=`<h2>Starred</h2><div class="grid">${x.data.files.map(fileCard).join("")||"<div class='panel'>Nothing starred.</div>"}</div>`;
  }catch(e){toast(e.message)}
}

async function showTrash(){
  try{
    const x=await api("/api/trash");
    $("#content").innerHTML=`<div class="actions"><button class="btn secondary" onclick="load()">← My Drive</button><button class="btn danger" onclick="emptyTrash()">Empty trash</button></div><div class="grid">${x.data.files.map(f=>`<article class="card"><div class="icon">${icon(f)}</div><b>${esc(f.name)}</b><div class="muted">${size(f.size)}</div></article>`).join("")||"<div class='panel'>Trash is empty.</div>"}</div>`;
  }catch(e){toast(e.message)}
}

async function emptyTrash(){
  if(!confirm("Permanently delete trash?"))return;
  try{await api("/api/trash/empty",{method:"DELETE"});showTrash()}catch(e){toast(e.message)}
}

async function showStorage(){
  try{
    const x=await api("/api/storage"),d=x.data;
    $("#content").innerHTML=`<h2>Storage</h2><div class="panel"><p>${size(d.used)} / ${size(d.quota)} · ${d.percentage}% used</p><div class="bar"><i style="width:${d.percentage}%"></i></div><h3>Largest files</h3>${d.largest.map(f=>`<p>${esc(f.name)} — ${size(f.size)}</p>`).join("")||"<p>No files.</p>"}</div>`;
  }catch(e){toast(e.message)}
}

async function showAdmin(){
  try{
    const x=await api("/api/admin/stats"),d=x.data;
    $("#content").innerHTML=`<h2>Admin dashboard</h2><div class="grid"><div class="panel"><b>Users</b><h2>${d.totalUsers}</h2></div><div class="panel"><b>Files</b><h2>${d.totalFiles}</h2></div><div class="panel"><b>Storage</b><h2>${size(d.totalStorageUsed)}</h2></div><div class="panel"><b>Shared</b><h2>${d.sharedFiles}</h2></div></div>`;
  }catch(e){toast(e.message)}
}

async function logout(){
  await fetch("/api/auth/logout",{method:"POST",credentials:"include"});
  location="/login.html";
}

function toggleDark(){
  document.body.classList.toggle("dark");
  localStorage.theme=document.body.classList.contains("dark")?"dark":"light";
}

function toast(t){
  const d=document.createElement("div");
  d.className="toast";
  d.textContent=t;
  document.body.appendChild(d);
  setTimeout(()=>d.remove(),2500);
}

if(localStorage.theme==="dark")document.body.classList.add("dark");
boot();
