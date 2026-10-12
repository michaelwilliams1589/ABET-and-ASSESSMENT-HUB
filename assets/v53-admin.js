/* v5.3 administrator tools: approved-users list and the one-time storage migration. */
(function(){
"use strict";
const el=id=>document.getElementById(id);
const fsdb=()=>firebase.firestore();
function msg(host,text,ok){if(host)host.innerHTML=`<div class="notice ${ok?"success":"warning"}">${esc(text)}</div>`}

/* ---------- Approved users (admin.html) ---------- */
async function renderUsers(){
  const host=el("approvedUsersList");if(!host)return;
  try{
    const snap=await fsdb().collection("hubUsers").get();
    const rows=snap.docs.map(d=>({email:d.id,...d.data()})).sort((a,b)=>a.email.localeCompare(b.email));
    host.innerHTML=rows.length?`<div class="table-wrap"><table class="table"><tr><th>Email</th><th>Name</th><th>Role</th><th>Active</th><th></th></tr>${rows.map(u=>`<tr><td>${esc(u.email)}</td><td>${esc(u.name||"")}</td><td>${esc(u.role)}</td><td>${u.active?"Yes":"No"}</td><td><button class="btn outline" data-toggle-user="${esc(u.email)}">${u.active?"Deactivate":"Activate"}</button> <button class="btn danger" data-remove-user="${esc(u.email)}">Remove</button></td></tr>`).join("")}</table></div>`:'<div class="notice">No approved users yet. Add yourself first as admin in the Firebase console (see the README checklist).</div>';
    host.querySelectorAll("[data-toggle-user]").forEach(b=>b.onclick=async()=>{const u=rows.find(r=>r.email===b.dataset.toggleUser);try{await fsdb().collection("hubUsers").doc(u.email).set({...u,email:undefined,active:!u.active,updatedAt:new Date().toISOString(),updatedBy:currentUser?.email||""},{merge:true});renderUsers()}catch(e){msg(el("approvedUsersMsg"),"Not saved: "+e.message)}});
    host.querySelectorAll("[data-remove-user]").forEach(b=>b.onclick=async()=>{if(!confirm("Remove "+b.dataset.removeUser+" from the approved list?"))return;try{await fsdb().collection("hubUsers").doc(b.dataset.removeUser).delete();renderUsers()}catch(e){msg(el("approvedUsersMsg"),"Not removed: "+e.message)}});
  }catch(e){
    host.innerHTML=`<div class="notice warning">${e.code==="permission-denied"?"The approved-users list can't be read yet. Deploy the new security rules and add yourself as admin in the Firebase console first.":esc(e.message)}</div>`;
  }
}
async function addUser(){
  const email=el("newUserEmail").value.trim().toLowerCase(),name=el("newUserName").value.trim(),role=el("newUserRole").value;
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){msg(el("approvedUsersMsg"),"Enter a valid email address.");return}
  try{
    await fsdb().collection("hubUsers").doc(email).set({role,active:true,name,addedAt:new Date().toISOString(),addedBy:currentUser?.email||""});
    msg(el("approvedUsersMsg"),`${email} added as ${role}. They can now use "Sign in with Microsoft", or you can create a password account for them in the Firebase console and send a reset email.`,true);
    el("newUserEmail").value="";el("newUserName").value="";renderUsers();
  }catch(e){msg(el("approvedUsersMsg"),"Not saved: "+e.message)}
}

/* ---------- One-time migration (system-health.html) ---------- */
async function renderMigration(){
  const host=el("migrationStatus");if(!host)return;
  try{
    const st=await HubStore.detect(fsdb(),ABET_CONFIG.workspaceId);
    if(st){host.innerHTML=`<div class="notice success"><strong>Done.</strong> The Hub uses the new per-record storage. Migrated ${esc(st.migratedAt||"")} by ${esc(st.migratedBy||"")}. The old single record is kept read-only as a historical copy.</div>`;el("runMigration")?.classList.add("hidden");return}
    host.innerHTML='<div class="notice">The Hub still uses the old single-record storage. Everything works, but two people saving at once can overwrite each other, and the record has a 1 MB size limit.</div>';
  }catch(e){host.innerHTML=`<div class="notice warning">${esc(e.message)}</div>`}
}
async function runMigration(){
  const out=el("migrationLog"),btn=el("runMigration");
  if(!admin()){msg(out,"Only an administrator can run the migration.");return}
  if(!confirm("Step 1 downloads a full backup. Step 2 copies everything into the new storage. The old record is not changed. Continue?"))return;
  btn.disabled=true;btn.textContent="Working…";
  const save=(b)=>downloadBlob(`ETDE_Hub_PreMigration_Backup_${new Date().toISOString().replace(/[:.]/g,"-")}.json`,new Blob([JSON.stringify(b,null,2)],{type:"application/json"}));
  try{
    const r=await HubStore.migrate(fsdb(),ABET_CONFIG.workspaceId,{userEmail:currentUser?.email||"",onProgress:(d,n)=>msg(out,`Copied ${d} of ${n} records…`,true)});
    save(r.backup);
    msg(out,`Migration complete: ${r.documents} documents written (${Object.entries(r.counts).map(([k,v])=>`${k} ${v}`).join(", ")}). A backup file was downloaded; keep it in OneDrive. Reloading…`,true);
    setTimeout(()=>location.reload(),2500);
  }catch(e){
    if(e.backup)save(e.backup);
    msg(out,"Migration stopped: "+e.message+" Nothing was switched over; the Hub keeps using the old record.");
    btn.disabled=false;btn.textContent="Back Up and Migrate";
  }
}
window.v53={renderUsers,addUser,renderMigration,runMigration};
onHubReady(()=>{
  if(page()==="admin.html"){el("addApprovedUser")&&(el("addApprovedUser").onclick=addUser);renderUsers()}
  if(page()==="system-health.html"){el("runMigration")&&(el("runMigration").onclick=runMigration);renderMigration()}
});
})();
