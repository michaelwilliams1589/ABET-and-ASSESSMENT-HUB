
(function(){
  "use strict";
  const VERSION="2.0.0";
  const COLLECTIONS=[
    "routedUploads","students","courses","slos","assignments","grades",
    "qualitativeAssessments","qualitativeDocuments","qualitativeReviews",
    "qualitativeNarratives","streamlinedNarratives","meetingNotes",
    "formsMappings","currentAssignments","teachingHistory","syllabusLibrary","termDates"
  ];

  function safePage(){
    const clean=location.pathname.replace(/\/+$/,"");
    const leaf=clean.split("/").pop()||"";
    return leaf.includes(".")?leaf:"index.html";
  }

  // Guard against GitHub Pages repository-root URLs.
  window.v2Page=safePage;

  function normalizeHubData(data){
    const h=(data&&typeof data==="object")?data:{};
    COLLECTIONS.forEach(k=>{if(!Array.isArray(h[k]))h[k]=[]});
    if(!h.settings||typeof h.settings!=="object")h.settings={};
    if(!h.roadmapSettings||typeof h.roadmapSettings!=="object")h.roadmapSettings={cycleStartYear:2026,retentionYears:6};
    if(!h.curriculum||typeof h.curriculum!=="object")h.curriculum={};
    if(!h.schemaVersion||Number(h.schemaVersion)<2)h.schemaVersion=2;
    h.lastMigrationAt=new Date().toISOString();
    return h;
  }
  window.v2NormalizeHubData=normalizeHubData;

  // Wrap the existing load function so old and incomplete workspace records are migrated safely.
  const vEsc=x=>String(x??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
  const waitForFunctions=setInterval(()=>{
    if(typeof window.loadHub!=="function"||typeof window.saveHub!=="function")return;
    clearInterval(waitForFunctions);
    const originalLoad=window.loadHub;
    window.loadHub=async function(){
      await originalLoad();
      window.hub=normalizeHubData(window.hub);
    };
  },20);

  function showFatal(message){
    let box=document.getElementById("v2FatalError");
    if(!box){
      box=document.createElement("div");
      box.id="v2FatalError";
      box.style.cssText="position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;background:#7a1712;color:#fff;padding:12px;border-radius:8px;font:14px Arial";
      document.body.appendChild(box);
    }
    box.textContent=message;
  }
  window.addEventListener("error",e=>showFatal("Application error: "+(e.message||"Unknown error")));
  window.addEventListener("unhandledrejection",e=>showFatal("Application error: "+(e.reason?.message||e.reason||"Unknown error")));

  async function diagnostics(){
    const results=[];
    const push=(name,ok,detail)=>results.push({name,ok,detail});
    push("Version",true,VERSION);
    push("Firebase SDK",typeof firebase!=="undefined","Firebase scripts loaded");
    push("Configuration",!!window.ABET_CONFIG?.firebase?.projectId,window.ABET_CONFIG?.firebase?.projectId||"Missing");
    push("Authentication",!!window.currentUser,window.currentUser?.email||"No signed-in user");
    push("Firestore",!!window.db,"Database object available");
    push("Workspace",!!window.hub,window.ABET_CONFIG?.workspaceId||"Unknown");
    push("Schema",Number(window.hub?.schemaVersion)>=2,"Schema version "+(window.hub?.schemaVersion||"legacy"));
    push("Curriculum",Array.isArray(window.ETDE_CURRICULUM?.courses),`${window.ETDE_CURRICULUM?.courses?.length||0} courses`);
    push("Syllabus seed",Array.isArray(window.ETDE_SYLLABUS_SEED),`${window.ETDE_SYLLABUS_SEED?.length||0} records`);
    push("Chart library",typeof Chart!=="undefined","Only required on analytics pages");
    return results;
  }

  function renderHealth(){
    if(safePage()!=="system-health.html")return;
    const run=async()=>{
      const rows=await diagnostics();
      const passed=rows.filter(x=>x.ok).length;
      document.getElementById("v2HealthMetrics").innerHTML=[
        ["Checks Passed",`${passed}/${rows.length}`],
        ["Version",VERSION],
        ["Signed In",window.currentUser?"Yes":"No"],
        ["Workspace",window.ABET_CONFIG?.workspaceId||"Unknown"]
      ].map(([l,v])=>`<div class="metric"><strong>${vEsc(v)}</strong><span>${vEsc(l)}</span></div>`).join("");
      document.getElementById("v2Diagnostics").innerHTML=rows.map(r=>`<div class="admin-row"><strong>${r.ok?"✓":"✗"} ${vEsc(r.name)}</strong><br>${vEsc(r.detail)}</div>`).join("");
      const counts={};
      COLLECTIONS.forEach(k=>counts[k]=Array.isArray(window.hub?.[k])?window.hub[k].length:0);
      document.getElementById("v2CollectionCounts").innerHTML='<div class="table-wrap"><table class="table"><tr><th>Collection</th><th>Records</th></tr>'+Object.entries(counts).map(([k,v])=>`<tr><td>${vEsc(k)}</td><td>${vEsc(v)}</td></tr>`).join("")+"</table></div>";
    };
    document.getElementById("v2RunDiagnostics").onclick=run;
    document.getElementById("v2ExportBackup").onclick=()=>{
      const backup={application:"OSUIT ETDE Assessment & Accreditation Hub",version:VERSION,exportedAt:new Date().toISOString(),workspaceId:window.ABET_CONFIG?.workspaceId,data:normalizeHubData(structuredClone(window.hub||{}))};
      const blob=new Blob([JSON.stringify(backup,null,2)],{type:"application/json"});
      const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`ETDE_Hub_Backup_${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);
      document.getElementById("v2BackupStatus").innerHTML='<div class="notice success">Backup downloaded.</div>';
    };
    document.getElementById("v2RestoreBackup").onclick=async()=>{
      const file=document.getElementById("v2RestoreFile").files[0];
      if(!file)return alert("Choose a JSON backup file.");
      if(!confirm("Restore this backup and replace the current workspace data?"))return;
      try{
        const parsed=JSON.parse(await file.text());
        if(!parsed.data||typeof parsed.data!=="object")throw new Error("Invalid backup format");
        window.hub=normalizeHubData(parsed.data);
        await window.saveHub();
        document.getElementById("v2BackupStatus").innerHTML='<div class="notice success">Backup restored successfully. Refreshing…</div>';
        setTimeout(()=>location.reload(),800);
      }catch(err){
        document.getElementById("v2BackupStatus").innerHTML=`<div class="notice warning">Restore failed: ${vEsc(err.message||err)}</div>`;
      }
    };
    run();
  }

  window.onHubReady(renderHealth);
})();
