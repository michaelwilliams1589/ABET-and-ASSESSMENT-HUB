
const cfg=window.ABET_CONFIG, CUR=window.ETDE_CURRICULUM;
let auth,db,currentUser=null,hub={};
// v5.2: one shared workspace object. Older add-on scripts read window.hub / window.currentUser;
// before v5.2 those pointed at a different, empty object. These accessors keep them in sync.
Object.defineProperty(window,"hub",{configurable:true,get(){return hub},set(v){hub=v&&typeof v==="object"?v:{}}});
Object.defineProperty(window,"currentUser",{configurable:true,get(){return currentUser}});
// v5.2: page add-ons start when the workspace has loaded, instead of guessing with timers.
window.__hubReady=false;
window.onHubReady=function(fn){
  const run=()=>{try{fn()}catch(e){console.error("Hub add-on failed",e)}};
  if(window.__hubReady)run();else document.addEventListener("hub:loaded",run,{once:true});
};
// v5.2: single source of truth for the individual threshold and program target.
function clampPct(v,d){const n=Number(v);return Number.isFinite(n)&&String(v).trim()!==""?Math.max(0,Math.min(100,n)):d}
function hubSettings(){
  const s=(hub&&hub.settings)||{};
  return {threshold:clampPct(s.sloThreshold??s.threshold??s.defaultThreshold,70),target:clampPct(s.programTarget,75)};
}
window.hubSettings=hubSettings;
let uploadType="",uploadRows=[],formsRows=[],formsHeaders=[],formsMapping={},formsFile=null,journalRows=[],journalSourceFiles=[],gradebookFile=null,gradebookMatrix=[],gradebookHeaders=[],gradebookAssignments=[],gradebookStudents=[],gradebookCourseCode="",gradebookSection="";

const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const id=(p="id")=>`${p}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
const now=()=>new Date().toISOString();

function ensureCoreCollections(){
  window.hub ||= {};
  const arrays=[
    "routedUploads","students","courses","slos","assignments","grades",
    "qualitativeAssessments","qualitativeDocuments","qualitativeReviews",
    "qualitativeNarratives","streamlinedNarratives","meetingNotes",
    "formsMappings","currentAssignments","teachingHistory","syllabusLibrary",
    "termDates","abetAssignmentMappings","deletedUploadTombstones","analyticsDeletionLog"
  ];
  arrays.forEach(key=>{if(!Array.isArray(hub[key]))hub[key]=[]});
  if(!hub.settings||typeof hub.settings!=="object")hub.settings={};
  if(!hub.curriculum||typeof hub.curriculum!=="object")hub.curriculum={};
  return hub;
}

const page=()=>{
  const last=location.pathname.split("/").filter(Boolean).pop()||"";
  return /\.html$/i.test(last)?last:"index.html";
};
const goToPage=file=>{ location.assign(new URL(file, location.href).href); };
const admin=()=>cfg.adminEmails.map(x=>x.toLowerCase()).includes((currentUser?.email||"").toLowerCase());
const normalizeCourse=s=>{const m=String(s||"").toUpperCase().match(/\b(ETDE|ETD|ETDG)\s*[-_]?\s*(\d{4})\b/);return m?`${m[1]} ${m[2]}`:""};
const sectionFrom=s=>{const t=String(s||"");const m=t.match(/\b(?:SECTION|SEC|CRN)\s*[-_:]?\s*(\d{4,6})\b/i);if(m)return m[1];return (t.match(/\b\d{5}\b/)||[""])[0]};
const currentAcademicStart=()=>new Date().getMonth()>=6?new Date().getFullYear():new Date().getFullYear()-1;
const ay=y=>`${y}–${String(y+1).slice(-2)}`;
const download=(name,text,type="text/plain")=>{const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)};

async function init(){
  if(!firebase.apps.length)firebase.initializeApp(cfg.firebase);
  auth=firebase.auth();db=firebase.firestore();
  bindStatic();
  auth.onAuthStateChanged(async user=>{
    currentUser=user;
    if(!user&&page()!=="index.html"){goToPage("index.html");return}
    if(user&&page()==="index.html"){goToPage(admin()?"dashboard.html":"my-courses.html");return}
    if(!user)return;
    document.querySelectorAll("[data-user-email]").forEach(e=>e.textContent=user.email||"");
    document.querySelectorAll("[data-user-role]").forEach(e=>e.textContent=admin()?"Administrator":"Instructor");
    document.querySelectorAll(".admin-only").forEach(e=>e.style.display=admin()?"":"none");
    if(page()==="admin.html"&&!admin()){location.href="dashboard.html";return}
    await loadHub();
    await routePage();
    window.__hubReady=true;
    document.dispatchEvent(new CustomEvent("hub:loaded"));
  });
}
function bindStatic(){
  document.querySelectorAll('[data-action="logout"]').forEach(b=>b.addEventListener("click",async()=>{await auth.signOut();goToPage("index.html")}));
  $("signInButton")?.addEventListener("click",login);
  ["loginEmail","loginPassword"].forEach(idn=>$(idn)?.addEventListener("keydown",e=>{if(e.key==="Enter")login()}));
  $("requestAccessButton")?.addEventListener("click",()=>$("accessPanel").classList.toggle("hidden"));
  $("sendAccessRequest")?.addEventListener("click",requestAccess);
}
async function login(){
  const box=$("loginError"),button=$("signInButton");
  box.style.display="none";
  const email=$("loginEmail").value.trim(),password=$("loginPassword").value;
  if(!email||!password){box.textContent="Enter both your email and password.";box.style.display="block";return}
  button.disabled=true;button.textContent="Signing In…";
  try{
    await auth.signInWithEmailAndPassword(email,password);
    // onAuthStateChanged sends instructors to My Courses and administrators to the Dashboard.
  }catch(e){
    box.textContent=(e.code==="auth/invalid-credential"||e.code==="auth/wrong-password"||e.code==="auth/user-not-found")?"Incorrect email or password.":"Sign-in failed: "+e.message;
    box.style.display="block";button.disabled=false;button.textContent="Sign In";
  }
}
function requestAccess(){
  const subject=encodeURIComponent("ABET Hub Faculty Access Request");
  const body=encodeURIComponent(`Name: ${$("requestName").value}\nEmail: ${$("requestEmail").value}\nRole/Courses: ${$("requestReason").value}`);
  location.href=`mailto:${cfg.adminEmails[0]}?subject=${subject}&body=${body}`;
}
async function loadHub(){
  try{
    const snap=await db.collection("abetHubs").doc(cfg.workspaceId).get();
    const raw=snap.exists?snap.data():{};
    // Support both the current nested hubData format and older direct-field workspaces.
    hub=raw.hubData&&typeof raw.hubData==="object"?raw.hubData:{...raw};
    delete hub.updatedAt;
    hub.routedUploads ||= [];hub.meetingNotes ||= [];hub.streamlinedNarratives ||= [];hub.formsMappings ||= [];
    hub.students ||= [];hub.courses ||= [];hub.slos ||= [];hub.assignments ||= [];hub.grades ||= [];
    hub.qualitativeAssessments ||= [];hub.qualitativeDocuments ||= [];hub.qualitativeReviews ||= [];hub.qualitativeNarratives ||= [];
    hub.curriculum ||= {courseOutcomeMap:JSON.parse(JSON.stringify(CUR.draftMap)),schedule:defaultSchedule()};
    hub.curriculum.courseOutcomeMap ||= JSON.parse(JSON.stringify(CUR.draftMap));
    hub.curriculum.schedule ||= defaultSchedule();
    hub.roadmapSettings ||= {cycleStartYear:2026,retentionYears:6};
    syncGood();
  }catch(error){
    setSyncStatus("bad","Could not load data");
    showSaveWarning("The Hub could not load your saved data ("+(error.message||error)+"). Do not enter new grades until this is fixed; refresh the page or check your connection.");
    throw error;
  }
}
async function saveHub(){
  setSyncStatus("busy","Saving…");
  try{
    await db.collection("abetHubs").doc(cfg.workspaceId).set({hubData:hub,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
    setSyncStatus("good","Saved "+new Date().toLocaleTimeString([], {hour:"numeric",minute:"2-digit"}));
    hideSaveWarning();
  }catch(error){
    setSyncStatus("bad","NOT saved");
    showSaveWarning("Your last change was NOT saved ("+(error.message||error)+"). Keep this page open, check your connection, and try again. Download a backup from System Health if this keeps happening.");
    throw error;
  }
}
// v5.2: honest save status. "good" is shown only after a real load or save succeeds.
function setSyncStatus(state,text){
  const cls=state==="good"?"good":state==="busy"?"":"warn";
  document.querySelectorAll("[data-sync]").forEach(e=>{e.innerHTML=`<span class="dot ${cls}"></span> ${esc(text)}`;e.title=state==="good"?"Your data is stored in the shared workspace.":""});
}
function showSaveWarning(msg){
  let box=$("saveWarningBanner");
  if(!box){box=document.createElement("div");box.id="saveWarningBanner";box.setAttribute("role","alert");box.className="save-warning";document.body.prepend(box)}
  box.textContent=msg;box.style.display="block";
}
function hideSaveWarning(){const b=$("saveWarningBanner");if(b)b.style.display="none"}
window.addEventListener("beforeunload",e=>{const b=$("saveWarningBanner");if(b&&b.style.display==="block"){e.preventDefault();e.returnValue=""}});
function syncGood(){setSyncStatus("good","Loaded "+new Date().toLocaleTimeString([], {hour:"numeric",minute:"2-digit"}))}

async function routePage(){
  const p=page();
  if(p==="dashboard.html")renderDashboard();
  if(p==="uploads.html")initUploads();
  if(p==="results.html")renderResultsPage();
  if(p==="analytics.html")initAnalytics();
  if(p==="qualitative.html")initQualitativeAnalytics();
  if(p==="curriculum.html")renderCurriculum();
  if(p==="calendar.html")renderCalendar();
  if(p==="reports.html")initReports();
  if(p==="meeting-notes.html")renderNotes();
  if(p==="admin.html")renderAdmin();
}
function defaultSchedule(){return{
 SO1:{1:["ETDE 1343"],2:["ETDE 3143"],3:["ETDE 4133"],4:["ETDE 3233"],5:["ETDE 3513"],6:["ETDE 4813"]},
 SO2:{1:["ETDE 2113"],2:["ETDE 3143"],3:["ETDE 4133"],4:["ETDE 3213"],5:["ETDE 4313"],6:["ETDE 4813"]},
 SO3:{1:["ETD 2411"],2:["ETDE 3213"],3:["ETDE 4112"],4:["ETDG 1143"],5:["ETDE 4313"],6:["ETDE 4813"]},
 SO4:{1:["ETDE 1363"],2:["ETDE 2133"],3:["ETDE 3233"],4:["ETDE 3143"],5:["ETDE 4133"],6:["ETDE 4813"]},
 SO5:{1:["ETDE 3213"],2:["ETDE 4112"],3:["ETDE 4813"],4:["ETD 2411"],5:["ETDE 4313"],6:["ETDE 4813"]}
}}
function cycleInfo(){
  const start=Number(hub.roadmapSettings.cycleStartYear)||2026,cur=currentAcademicStart(),diff=cur-start;
  const year=((diff%6)+6)%6+1,cycleStart=start+Math.floor(diff/6)*6;
  return {start,cur,year,cycleStart};
}
function scheduledCodes(year){
  const set=new Set();Object.values(hub.curriculum.schedule||{}).forEach(byYear=>(byYear[year]||[]).forEach(c=>set.add(c)));return [...set]
}
function hasEvidence(code){return hub.routedUploads.some(u=>!u.archived&&normalizeCourse(u.courseCode)===normalizeCourse(code))}
function renderDashboard(){
  const active=hub.routedUploads.filter(u=>!u.archived),unapproved=active.filter(u=>!u.resultApproved),issues=active.filter(u=>u.status==="needs-review");
  $("dashboardMetrics").innerHTML=[
    ["Active Uploads",active.length],["Ready to Review",unapproved.length],["Routing Issues",issues.length],["Meeting Notes",hub.meetingNotes.length]
  ].map(([l,v])=>`<div class="metric"><strong>${v}</strong><span>${l}</span></div>`).join("");
  const c=cycleInfo(),themes=["Collect","Improve","Analyze","Collect","Improve","Prepare"];
  $("dashboardCycle").innerHTML=`<strong>Year ${c.year} of 6 — ${ay(c.cur)}</strong><p>${themes[c.year-1]} phase</p>`;
  const due=scheduledCodes(c.year).filter(x=>!hasEvidence(x));
  $("dashboardDue").innerHTML=due.length?due.map(x=>`<span class="badge warn">${esc(x)}</span>`).join(" "):'<span class="badge good">All scheduled evidence received</span>';
  if(issues.length){$("nextStepTitle").textContent=`Correct ${issues.length} upload routing issue${issues.length===1?"":"s"}`;$("nextStepText").textContent="Administrator review is needed.";$("nextStepButton").href="admin.html"}
  else if(unapproved.length){$("nextStepTitle").textContent=`Review ${unapproved.length} assessment result${unapproved.length===1?"":"s"}`;$("nextStepText").textContent="Review the summary and approve the narrative.";$("nextStepButton").href="results.html"}
  else{$("nextStepTitle").textContent="Upload the next assessment";$("nextStepText").textContent="The Hub will route it to the correct course and section.";$("nextStepButton").href="uploads.html"}
}

function initUploads(){
  ensureCoreCollections();
  if(typeof window.ensureAbetAssignmentMappings==="function")window.ensureAbetAssignmentMappings();
  document.querySelectorAll("[data-upload-type]").forEach(b=>b.addEventListener("click",()=>selectType(b.dataset.uploadType,b.querySelector("strong").textContent)));
  $("uploadBack").addEventListener("click",resetUpload);$("reviewBack").addEventListener("click",()=>{$("uploadReviewPanel").classList.add("hidden");$("uploadFilePanel").classList.remove("hidden")});
  $("formsMapBack").addEventListener("click",()=>{$("formsMapPanel").classList.add("hidden");$("uploadFilePanel").classList.remove("hidden")});
  $("gradebookCourseSelect")?.addEventListener("change",()=>{
    gradebookCourseCode=$("gradebookCourseSelect").value;
    renderGradebookOfficialGuide();
  });
  $("analyzeUpload").addEventListener("click",analyzeUpload);$("formsMapSave").addEventListener("click",saveFormsMap);
  $("saveUpload").addEventListener("click",saveUpload);$("uploadAnother").addEventListener("click",resetUpload);
}
function selectType(type,label){
  uploadType=type;
  $("uploadTypePanel").classList.add("hidden");
  $("uploadFilePanel").classList.remove("hidden");
  $("uploadHeading").textContent=label;
  const wrap=$("gradebookSloWrap");
  const courseWrap=$("gradebookCourseWrap");
  if(wrap)wrap.classList.toggle("hidden",type!=="gradebook");
  if(courseWrap)courseWrap.classList.toggle("hidden",type!=="gradebook");
  if($("gradebookOfficialGuide"))$("gradebookOfficialGuide").classList.toggle("hidden",type!=="gradebook");
  if(type==="gradebook"){
    populateGradebookCourseOptions();
    renderGradebookOfficialGuide();
  }
}
function resetUpload(){
  uploadType="";uploadRows=[];formsRows=[];formsHeaders=[];formsMapping={};formsFile=null;
  journalRows=[];journalSourceFiles=[];gradebookFile=null;gradebookMatrix=[];gradebookHeaders=[];
  gradebookAssignments=[];gradebookStudents=[];gradebookCourseCode="";gradebookSection="";
  $("uploadFiles").value="";$("uploadAssessment").value="";
  if($("gradebookProcessingStatus"))$("gradebookProcessingStatus").classList.add("hidden");
  if($("gradebookSloWrap"))$("gradebookSloWrap").classList.add("hidden");
  if($("gradebookCourseWrap"))$("gradebookCourseWrap").classList.add("hidden");
  if($("gradebookOfficialGuide"))$("gradebookOfficialGuide").innerHTML="";
  ["uploadFilePanel","formsMapPanel","uploadReviewPanel","uploadDone"].forEach(x=>$(x).classList.add("hidden"));
  $("uploadTypePanel").classList.remove("hidden");
}

const JOURNAL_EXTENSIONS=/\.(docx|pdf|txt)$/i;
const JOURNAL_INCLUDE=/(journal|reflection)/i;
const JOURNAL_EXCLUDE=/(time\s*sheet|timesheet|bill of materials|\bbom\b|sign[\s_-]*in|roles?|\.mpp$|project plan)/i;
const QUAL_KEYWORDS={
  "Technical Competency":["plc","instrument","calibrat","wiring","electrical","program","control","sensor","transmitter","automation","technical","commission"],
  "Problem Solving":["troubleshoot","problem","solve","solution","diagnos","fault","issue","correct","repair","debug"],
  "Communication":["communicat","present","report","document","explain","discuss","meeting","update","listen"],
  "Teamwork":["team","group","together","collaborat","partner","helped","assigned","role"],
  "Leadership":["lead","leader","managed","coordinat","delegat","decision","responsib"],
  "Safety":["safe","safety","ppe","hazard","lockout","tagout","risk"],
  "Ethics":["ethic","honest","integrity","responsible","professional judgment"],
  "Professionalism":["professional","punctual","attendance","dependable","work ethic","attitude"],
  "Project Management":["schedule","timeline","deadline","milestone","plan","budget","materials","project management","scope"],
  "Continuous Improvement":["improve","learned","next time","future","change","better","reflect","growth"]
};

function setJournalStatus(message,visible=true){
  const box=$("journalProcessingStatus");
  if(!box)return;
  box.textContent=message;
  box.classList.toggle("hidden",!visible);
}
function basename(path){return String(path||"").split("/").pop()||""}
function inferWeekFromNames(names){
  const found=[];
  names.forEach(name=>{
    const m=String(name).match(/week[\s_-]*(\d{1,2})/i)||String(name).match(/journal[\s_-]*(\d{1,2})/i);
    if(m)found.push(Number(m[1]));
  });
  if(!found.length)return null;
  const counts={};found.forEach(n=>counts[n]=(counts[n]||0)+1);
  return Number(Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0]);
}
function journalCandidate(name){
  const b=basename(name);
  return JOURNAL_EXTENSIONS.test(b)&&JOURNAL_INCLUDE.test(b)&&!JOURNAL_EXCLUDE.test(b);
}
function inferJournalStudent(name){
  const b=basename(name).replace(/\.(docx|pdf|txt)$/i,"");
  const canvas=b.match(/^([^_]+)(?:_LATE)?_\d+_\d+_/i);
  if(canvas)return canvas[1];
  return b.replace(/group journal.*$/i,"").replace(/journal.*$/i,"").replace(/[_-]+/g," ").trim()||"Unknown";
}
function inferJournalWeek(name,fallback){
  const m=String(name).match(/week[\s_-]*(\d{1,2})/i)||String(name).match(/journal[\s_-]*(\d{1,2})/i);
  return m?Number(m[1]):fallback||null;
}
function xmlText(xml){
  try{
    const doc=new DOMParser().parseFromString(xml,"application/xml");
    return [...doc.getElementsByTagNameNS("*","p")].map(p=>[...p.getElementsByTagNameNS("*","t")].map(t=>t.textContent).join("")).filter(Boolean).join("\n");
  }catch{return""}
}
async function extractDocxText(bytes){
  const zip=await JSZip.loadAsync(bytes);
  const file=zip.file("word/document.xml");
  if(!file)return"";
  return xmlText(await file.async("string"));
}
async function extractPdfText(bytes){
  try{
    let lib=window.pdfjsLib;
    if(!lib){
      try{
        const mod=await import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs");
        lib=mod;
        if(lib.GlobalWorkerOptions)lib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs";
      }catch{return""}
    }
    if(lib.GlobalWorkerOptions&&!lib.GlobalWorkerOptions.workerSrc)lib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs";
    const pdf=await lib.getDocument({data:bytes}).promise;
    const pages=[];
    for(let i=1;i<=pdf.numPages;i++){
      const page=await pdf.getPage(i);
      const content=await page.getTextContent();
      pages.push(content.items.map(x=>x.str).join(" "));
    }
    return pages.join("\n");
  }catch{return""}
}
async function extractJournalText(bytes,name){
  if(/\.docx$/i.test(name))return extractDocxText(bytes);
  if(/\.pdf$/i.test(name))return extractPdfText(bytes);
  if(/\.txt$/i.test(name))return new TextDecoder("utf-8").decode(bytes);
  return"";
}
async function readJournalArchive(bytes,archiveName,depth=0,parentWeek=null){
  if(depth>3)return[];
  const zip=await JSZip.loadAsync(bytes);
  const entries=Object.values(zip.files).filter(f=>!f.dir);
  const inferredWeek=inferWeekFromNames(entries.map(f=>f.name))||parentWeek;
  const rows=[];
  for(const entry of entries){
    const name=entry.name;
    if(/\.zip$/i.test(name)){
      const nested=await entry.async("uint8array");
      rows.push(...await readJournalArchive(nested,`${archiveName} → ${basename(name)}`,depth+1,inferredWeek));
      continue;
    }
    if(!journalCandidate(name))continue;
    const data=await entry.async("uint8array");
    const text=await extractJournalText(data,name);
    rows.push({
      fileName:basename(name),
      archivePath:`${archiveName} → ${name}`,
      fileSize:data.byteLength,
      student:inferJournalStudent(name),
      week:inferJournalWeek(name,inferredWeek),
      text:text.trim(),
      textLength:text.trim().length,
      courseCode:normalizeCourse(name)||"ETDE 4813",
      courseName:"Instrumentation Capstone",
      section:sectionFrom(name)||""
    });
  }
  return rows;
}
async function readDirectJournalFile(file){
  const bytes=new Uint8Array(await file.arrayBuffer());
  return {
    fileName:file.name,archivePath:file.name,fileSize:file.size,
    student:inferJournalStudent(file.name),week:inferJournalWeek(file.name,null),
    text:(await extractJournalText(bytes,file.name)).trim(),
    textLength:0,courseCode:normalizeCourse(file.name)||"ETDE 4813",
    courseName:"Instrumentation Capstone",section:sectionFrom(file.name)||""
  };
}
function keywordOccurrences(text,keyword){
  const escaped=keyword.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  const matches=String(text||"").toLowerCase().match(new RegExp(escaped,"g"));
  return matches?matches.length:0;
}
function analyzeJournalThemes(text){
  const themes={};
  Object.entries(QUAL_KEYWORDS).forEach(([theme,keywords])=>{
    const matched=keywords.filter(k=>keywordOccurrences(text,k)>0);
    const score=keywords.reduce((sum,k)=>sum+keywordOccurrences(text,k),0);
    const rating=score>=5?"strong":score>=2?"present":score>=1?"limited":"not-observed";
    themes[theme]={rating,note:matched.length?`Detected terms: ${matched.slice(0,6).join(", ")}`:"No clear evidence detected automatically."};
  });
  return themes;
}
function journalAutoSummary(row,themes){
  const strong=Object.entries(themes).filter(([,v])=>v.rating==="strong"||v.rating==="present").map(([k])=>k);
  const week=row.week?`Week ${row.week}`:"Journal";
  return `${week} submission for ${row.student}. ${row.textLength?`${row.textLength.toLocaleString()} characters were extracted.`:"Text could not be extracted; manual review may be needed."} ${strong.length?`Automated evidence was detected in ${strong.join(", ")}.`:"No strong themes were detected automatically."}`;
}
function showJournalReview(){
  $("uploadFilePanel").classList.add("hidden");
  $("uploadReviewPanel").classList.remove("hidden");
  const readable=journalRows.filter(r=>r.textLength>0).length;
  $("uploadReview").innerHTML=`<div class="notice success"><strong>${journalRows.length} actual journal file(s) found.</strong><br>${esc(readable)} had readable text. Unrelated timesheets, BOMs, sign-in sheets, and project files were ignored.</div>
  <div class="table-wrap"><table class="table"><tr><th>Student</th><th>Week</th><th>File</th><th>Text</th><th>Section</th></tr>${journalRows.map((r,i)=>`<tr><td>${esc(r.student)}</td><td>${r.week||"—"}</td><td>${esc(r.fileName)}<br><small>${esc(r.archivePath)}</small></td><td>${r.textLength?`${r.textLength.toLocaleString()} characters`:"Manual review"}</td><td><input data-journal-row="${i}" data-field="section" value="${esc(r.section)}" placeholder="Section / CRN"></td></tr>`).join("")}</table></div>`;
  document.querySelectorAll("[data-journal-row]").forEach(input=>input.addEventListener("input",()=>journalRows[Number(input.dataset.journalRow)][input.dataset.field]=input.value));
}
async function analyzeJournalUpload(files){
  journalRows=[];
  journalSourceFiles=files.map(f=>f.name);
  setJournalStatus("Opening the journal package and reading nested ZIP files…");
  for(const file of files){
    if(/\.zip$/i.test(file.name)){
      journalRows.push(...await readJournalArchive(new Uint8Array(await file.arrayBuffer()),file.name));
    }else if(journalCandidate(file.name)){
      const row=await readDirectJournalFile(file);
      row.textLength=row.text.length;
      journalRows.push(row);
    }
  }
  journalRows.forEach(r=>r.textLength=r.text.length);
  journalRows.sort((a,b)=>(a.week||999)-(b.week||999)||a.student.localeCompare(b.student));
  setJournalStatus("",false);
  if(!journalRows.length)return alert("No journal or reflection documents were found. Files named as timesheets, BOMs, sign-in sheets, or project files are intentionally ignored.");
  showJournalReview();
}



function activeAbetMappings(){
  ensureCoreCollections();
  if(typeof window.ensureAbetAssignmentMappings==="function")window.ensureAbetAssignmentMappings();
  return (hub.abetAssignmentMappings||[]).filter(m=>m.active!==false);
}
function gradebookCourseChoices(){
  const map=new Map();
  activeAbetMappings().forEach(m=>{
    const code=normalizeCourse(m.courseCode)||m.courseCode;
    if(!map.has(code))map.set(code,{code,name:m.courseName||""});
  });
  (window.ETDE_CURRICULUM?.courses||[]).forEach(c=>{
    const code=Array.isArray(c)?c[0]:c.code;
    const name=Array.isArray(c)?c[1]:c.name;
    if(code&&!map.has(code))map.set(code,{code,name:name||""});
  });
  return [...map.values()].sort((a,b)=>a.code.localeCompare(b.code));
}
function mappingsForCourse(code){
  const normalized=normalizeCourse(code)||String(code||"").toUpperCase();
  return activeAbetMappings().filter(m=>
    normalizeCourse(m.courseCode)===normalized ||
    (m.legacyCourseCodes||[]).some(x=>normalizeCourse(x)===normalized)
  );
}
function populateGradebookCourseOptions(){
  const select=$("gradebookCourseSelect");if(!select)return;
  const current=select.value;
  select.innerHTML='<option value="">Choose course first</option>'+gradebookCourseChoices().map(c=>`<option value="${esc(c.code)}">${esc(c.code)} — ${esc(c.name)}</option>`).join("");
  if([...select.options].some(o=>o.value===current))select.value=current;
}
function renderGradebookOfficialGuide(){
  const host=$("gradebookOfficialGuide");if(!host)return;
  const code=$("gradebookCourseSelect")?.value||"";
  const mappings=mappingsForCourse(code);
  if(!code){
    host.innerHTML='<div class="notice">Choose the class first. The Hub will show the SLO and official assignment to look for.</div>';
    return;
  }
  host.innerHTML=mappings.length?`<div class="official-guide"><strong>Official ABET assessments for ${esc(code)}</strong>${mappings.map(m=>`<div class="official-guide-row"><span class="badge good">${esc(m.sloCode)}</span><span><strong>${esc(m.assignmentName)}</strong>${(m.aliases||[]).length?`<br><small>Canvas names also recognized: ${esc(m.aliases.join(", "))}</small>`:""}</span></div>`).join("")}</div>`:'<div class="notice warning">No official ABET assignment is currently mapped for this course. You may still upload the gradebook and select an SLO manually.</div>';
  populateGradebookSloOptions();
}
function gradebookSloChoicesForCourse(){
  const code=$("gradebookCourseSelect")?.value||gradebookCourseCode||"";
  const mappings=mappingsForCourse(code);
  const ids=[];
  mappings.forEach(m=>{
    const idn=sloIdFromCode(m.sloCode);
    if(idn&&!ids.includes(idn))ids.push(idn);
  });
  return ids;
}
function populateGradebookSloOptions(){
  ensureCoreCollections();
  const select=$("gradebookDefaultSlo");if(!select)return;
  const current=select.value;
  const recommended=gradebookSloChoicesForCourse();
  const all=Array.isArray(hub.slos)?hub.slos:[];
  const ordered=[...all.filter(s=>recommended.includes(s.id)),...all.filter(s=>!recommended.includes(s.id))];
  select.innerHTML='<option value="">Choose SLO</option>'+ordered.map(s=>{
    const preferred=recommended.includes(s.id)?"★ Recommended — ":"";
    return `<option value="${esc(s.id)}">${preferred}${esc([s.code,s.description].filter(Boolean).join(" — "))}</option>`;
  }).join("");
  if([...select.options].some(o=>o.value===current))select.value=current;
  else if(recommended.length===1)select.value=recommended[0];
}
function setGradebookStatus(message,kind="notice"){
  const box=$("gradebookProcessingStatus");if(!box)return;
  if(!message){box.classList.add("hidden");box.textContent="";return}
  box.className=kind==="success"?"notice success":kind==="warning"?"notice warning":"notice";
  box.textContent=message;box.classList.remove("hidden");
}
function cleanCell(v){return String(v??"").trim()}
function numericValue(v){
  if(v===null||v===undefined||v==="")return null;
  if(typeof v==="number"&&Number.isFinite(v))return v;
  const s=String(v).replace(/,/g,"").replace(/%$/,"").trim();
  if(!s||/^(EX|MI|NA|N\/A|NULL|-)$/.test(s.toUpperCase()))return null;
  const n=Number(s);return Number.isFinite(n)?n:null;
}
function canvasStudentColumn(headers){
  const preferred=["Student","Student Name","Name","Sortable Name"];
  return preferred.find(x=>headers.some(h=>cleanCell(h).toLowerCase()===x.toLowerCase()))||
    headers.find(h=>/student|name/i.test(cleanCell(h)))||headers[0];
}
function canvasIdColumn(headers){
  return headers.find(h=>/^(sis user id|sis id|student id|id)$/i.test(cleanCell(h)))||
    headers.find(h=>/login id|sis login/i.test(cleanCell(h)))||null;
}
function canvasSectionColumn(headers){
  return headers.find(h=>/section|course section/i.test(cleanCell(h)))||null;
}
function ignoredGradebookColumn(name){
  return /^(student|student name|name|sortable name|id|sis user id|sis id|sis login id|login id|section|course section|root account|current points|final points|current score|final score|current grade|final grade|unposted current score|unposted final score|unposted current grade|unposted final grade|enrollment state)$/i.test(cleanCell(name))||
    /^(notes?|status)$/i.test(cleanCell(name));
}
function assignmentPossibleFromHeader(header){
  const m=String(header).match(/\((\d+(?:\.\d+)?)\s*(?:pts?|points?)?\)\s*$/i);
  return m?Number(m[1]):null;
}
function assignmentDisplayName(header){
  return cleanCell(header).replace(/\s*\(\d+(?:\.\d+)?\s*(?:pts?|points?)?\)\s*$/i,"").trim();
}
function rowLooksLikePointsPossible(row,studentKey){
  const label=cleanCell(row[studentKey]).toLowerCase();
  return /points possible|possible points/.test(label);
}
async function readGradebookMatrix(file){
  const buffer=await file.arrayBuffer();
  const wb=XLSX.read(buffer,{type:"array"});
  const ws=wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws,{header:1,defval:"",raw:true,blankrows:false});
}
function detectGradebookFromMatrix(matrix,fileName){
  if(!Array.isArray(matrix)||matrix.length<2)throw new Error("The gradebook does not contain enough rows.");
  let headerIndex=matrix.findIndex(row=>row.some(v=>/^(student|student name|sortable name)$/i.test(cleanCell(v))));
  if(headerIndex<0)headerIndex=0;
  const seenHeaders={};
  const headers=matrix[headerIndex].map((h,i)=>{
    const base=cleanCell(h)||`Column ${i+1}`;
    seenHeaders[base]=(seenHeaders[base]||0)+1;
    return seenHeaders[base]===1?base:`${base} [${seenHeaders[base]}]`;
  });
  const rows=matrix.slice(headerIndex+1).map(row=>Object.fromEntries(headers.map((h,i)=>[h,row[i]??""])));
  const safeRows=Array.isArray(rows)?rows:[];
  const studentKey=canvasStudentColumn(headers),idKey=canvasIdColumn(headers),sectionKey=canvasSectionColumn(headers);
  const pointsRow=safeRows.find(r=>rowLooksLikePointsPossible(r,studentKey))||null;
  const studentRows=safeRows.filter(r=>{
    const name=cleanCell(r[studentKey]);
    return name&&!rowLooksLikePointsPossible(r,studentKey)&&!/^(student|test student)$/i.test(name)&&
      !/points possible/i.test(name);
  });
  if(!studentRows.length)throw new Error("No student rows were detected.");

  const assignments=headers.filter(h=>{
    if(ignoredGradebookColumn(h))return false;
    const numericCount=studentRows.reduce((n,r)=>n+(numericValue(r[h])!==null?1:0),0);
    return numericCount>0;
  }).map(h=>{
    const possible=numericValue(pointsRow?.[h])||assignmentPossibleFromHeader(h)||
      Math.max(...studentRows.map(r=>numericValue(r[h])??0),0)||100;
    return{header:h,name:assignmentDisplayName(h),possible,selected:true,sloId:$("gradebookDefaultSlo")?.value||""};
  });
  if(!assignments.length)throw new Error("No assignment score columns were detected.");

  const selectedCourse=$("gradebookCourseSelect")?.value||"";
  const courseCode=normalizeCourse(selectedCourse)||normalizeCourse(fileName+" "+headers.join(" "))||"";
  const sections=[...new Set(studentRows.map(r=>cleanCell(r[sectionKey])).filter(Boolean))];
  return{
    headers,studentKey,idKey,sectionKey,assignments,
    students:studentRows.map((r,index)=>({
      sourceRow:r,
      name:cleanCell(r[studentKey])||`Student ${index+1}`,
      sid:cleanCell(r[idKey])||`anon-${index+1}`,
      section:cleanCell(r[sectionKey])||sections[0]||""
    })),
    courseCode,section:sections.join(", ")
  };
}

function sloIdFromCode(code){
  ensureCoreCollections();
  const target=String(code||"").replace(/\s+/g,"").toLowerCase();
  return (Array.isArray(hub.slos)?hub.slos:[]).find(s=>{
    const values=[s.code,s.name,s.description].filter(Boolean).map(x=>String(x).replace(/\s+/g,"").toLowerCase());
    return values.some(v=>v===target||v.startsWith(target));
  })?.id||"";
}
function applyOfficialAbetMatches(){
  ensureCoreCollections();
  if(typeof window.ensureAbetAssignmentMappings==="function")window.ensureAbetAssignmentMappings();
  if(typeof window.matchAbetAssignment!=="function")return;
  gradebookAssignments.forEach(a=>{
    const match=window.matchAbetAssignment(gradebookCourseCode,a.name||a.header);
    if(match){
      a.officialMappingId=match.id;
      a.officialAssignmentName=match.assignmentName;
      a.officialSloCode=match.sloCode;
      a.sloId=sloIdFromCode(match.sloCode)||a.sloId;
      a.matchStatus="official";
    }else a.matchStatus="unmatched";
  });
}
function showGradebookReview(){
  $("uploadFilePanel").classList.add("hidden");$("uploadReviewPanel").classList.remove("hidden");
  const defaultSlo=$("gradebookDefaultSlo")?.value||"";
  gradebookAssignments.forEach(a=>{if(!a.sloId)a.sloId=defaultSlo});
  const sloOptions=(hub.slos||[]).map(s=>`<option value="${esc(s.id)}">${esc([s.code,s.description].filter(Boolean).join(" — "))}</option>`).join("");
  $("uploadReview").innerHTML=`<div class="notice success"><strong>${gradebookStudents.length} students and ${gradebookAssignments.length} score columns detected.</strong><br>Choose the assignments to import and verify each Student Outcome.</div>
  <div class="form-grid"><label>Course Code<input id="gradebookCourseCode" value="${esc(gradebookCourseCode)}" placeholder="ETDE 1343"></label><label>Course Name<input id="gradebookCourseName" placeholder="Course title"></label><label>Section / CRN<input id="gradebookSection" value="${esc(gradebookSection)}"></label></div>
  <div class="table-wrap"><table class="table"><tr><th>Import</th><th>Assignment</th><th>ABET Match</th><th>Points Possible</th><th>Student Outcome / SLO</th><th>Usable Scores</th></tr>${gradebookAssignments.map((a,i)=>{
    const count=gradebookStudents.filter(s=>numericValue(s.sourceRow[a.header])!==null).length;
    return`<tr><td><input type="checkbox" data-gb-index="${i}" data-gb-field="selected" ${a.selected?"checked":""}></td><td><input data-gb-index="${i}" data-gb-field="name" value="${esc(a.name)}"></td><td>${a.matchStatus==="official"?`<span class="badge good">${esc(a.officialSloCode)} — Official</span><br><small>${esc(a.officialAssignmentName)}</small>`:`<span class="badge warn">No official match</span>`}</td><td><input type="number" min="0.01" step="0.01" data-gb-index="${i}" data-gb-field="possible" value="${a.possible}"></td><td><select data-gb-index="${i}" data-gb-field="sloId"><option value="">Unmapped</option>${sloOptions}</select></td><td>${count}</td></tr>`
  }).join("")}</table></div>`;
  document.querySelectorAll("[data-gb-index]").forEach(control=>{
    const row=gradebookAssignments[Number(control.dataset.gbIndex)],field=control.dataset.gbField;
    if(field==="sloId")control.value=row.sloId||"";
    control.addEventListener("change",()=>{
      row[field]=field==="selected"?control.checked:field==="possible"?Number(control.value):control.value;
    });
    control.addEventListener("input",()=>{
      if(field!=="selected")row[field]=field==="possible"?Number(control.value):control.value;
    });
  });
}
async function analyzeGradebookUpload(files){
  ensureCoreCollections();
  if(files.length!==1||!/\.(csv|xlsx|xls)$/i.test(files[0].name))throw new Error("Choose one Canvas CSV or Excel gradebook.");
  gradebookFile=files[0];
  setGradebookStatus("Reading the Canvas gradebook…");
  gradebookMatrix=await readGradebookMatrix(gradebookFile);
  const detected=detectGradebookFromMatrix(gradebookMatrix,gradebookFile.name);
  gradebookHeaders=detected.headers;gradebookAssignments=detected.assignments;gradebookStudents=detected.students;
  gradebookCourseCode=detected.courseCode||$("gradebookCourseSelect")?.value||"";gradebookSection=detected.section;
  if($("gradebookCourseSelect")&&gradebookCourseCode)$("gradebookCourseSelect").value=gradebookCourseCode;
  renderGradebookOfficialGuide();
  applyOfficialAbetMatches();
  setGradebookStatus("", "");
  showGradebookReview();
}
function findOrCreateCourse(code,name,section,term,uploadId){
  ensureCoreCollections();
  let course=hub.courses.find(c=>normalizeCourse(c.code)===normalizeCourse(code)&&String(c.section||"")===String(section||"")&&String(c.term||"")===String(term||""));
  if(!course){
    course={id:id("course"),code:normalizeCourse(code)||code,name:name||"",section:section||"",term,sourceUploadId:uploadId,createdAt:now()};
    hub.courses.push(course);
  }
  return course;
}
function findOrCreateStudent(s,course,term,uploadId){
  ensureCoreCollections();
  let student=hub.students.find(x=>String(x.sid||"")===String(s.sid)&&x.courseId===course.id);
  if(!student){
    student={id:id("student"),sid:s.sid,name:s.name,courseId:course.id,section:s.section||course.section||"",term,active:true,sourceUploadId:uploadId,createdAt:now()};
    hub.students.push(student);
  }
  return student;
}
async function saveGradebookUpload(term,assessmentName){
  ensureCoreCollections();
  const selected=gradebookAssignments.filter(a=>a.selected);
  if(!selected.length)throw new Error("Select at least one assignment.");
  const courseCode=normalizeCourse($("gradebookCourseCode").value)||$("gradebookCourseCode").value.trim();
  const courseName=$("gradebookCourseName").value.trim();
  const section=$("gradebookSection").value.trim();
  if(!courseCode)throw new Error("Enter the course code.");
  const uploadId=id("upload"),course=findOrCreateCourse(courseCode,courseName,section,term,uploadId);
  const assignmentIds=[],gradeIds=[],studentIds=[];
  hub.assignments ||= [];hub.grades ||= [];hub.routedUploads ||= [];
  for(const source of selected){
    const assignment={
      id:id("assignment"),courseId:course.id,courseCode:course.code,courseName:course.name,
      section:section||course.section||"",term,sloId:source.sloId||"",
      name:source.name||source.header,possible:Number(source.possible)||100,
      sourceHeader:source.header,sourceUploadId:uploadId,officialMappingId:source.officialMappingId||"",officialSloCode:source.officialSloCode||"",createdAt:now(),createdBy:currentUser.email
    };
    hub.assignments.push(assignment);assignmentIds.push(assignment.id);
    for(const row of gradebookStudents){
      const earned=numericValue(row.sourceRow[source.header]);
      if(earned===null)continue;
      const student=findOrCreateStudent(row,course,term,uploadId);
      studentIds.push(student.id);
      const grade={id:id("grade"),studentId:student.id,assignmentId:assignment.id,earned,possible:assignment.possible,
        sourceUploadId:uploadId,term,courseId:course.id,section:student.section||section,createdAt:now()};
      hub.grades.push(grade);gradeIds.push(grade.id);
    }
  }
  const upload={
    id:uploadId,type:"gradebook",fileName:gradebookFile.name,fileSize:gradebookFile.size,
    courseCode:course.code,courseName:course.name,section:section||course.section||"",term,
    assessmentName:assessmentName||`${selected.length} Canvas assignment(s)`,
    uploaderEmail:currentUser.email,uploadedAt:now(),status:"routed",archived:false,
    courseId:course.id,assignmentIds,gradeIds,studentIds:[...new Set(studentIds)],
    importedAssignments:selected.map(a=>({name:a.name,possible:a.possible,sloId:a.sloId,sourceHeader:a.header,officialMappingId:a.officialMappingId||"",officialSloCode:a.officialSloCode||"",matchStatus:a.matchStatus||"unmatched"})),
    studentCount:new Set(studentIds).size,gradeCount:gradeIds.length,
    history:[{at:now(),by:currentUser.email,action:"canvas-gradebook-import"}]
  };
  hub.routedUploads.unshift(upload);
  return upload;
}

async function analyzeUpload(){
  const files=[...$("uploadFiles").files];if(!files.length)return alert("Choose at least one file.");
  if(uploadType==="gradebook"){
    try{await analyzeGradebookUpload(files)}catch(error){setGradebookStatus("", "");console.error(error);alert("The gradebook could not be processed: "+error.message)}
    return;
  }
  if(uploadType==="journals"||uploadType==="reflection"){
    try{await analyzeJournalUpload(files)}catch(error){setJournalStatus("",false);console.error(error);alert("The journal package could not be processed: "+error.message)}
    return;
  }
  if(uploadType==="microsoft-forms"){
    if(files.length!==1||!/\.(xlsx|xls)$/i.test(files[0].name))return alert("Choose one Microsoft Forms Excel workbook.");
    formsFile=files[0];const wb=XLSX.read(await formsFile.arrayBuffer(),{type:"array"});formsRows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:""});
    if(!formsRows.length)return alert("No responses found.");formsHeaders=Object.keys(formsRows[0]);
    const key=formsKey(),saved=hub.formsMappings.find(x=>x.key===key);
    if(saved){formsMapping=saved.mapping;showFormsReview()}else showFormsMap();
    return;
  }
  uploadRows=[];
  for(const f of files){
    let text=f.name;
    if(/\.(csv|txt)$/i.test(f.name))try{text+=" "+(await f.text()).slice(0,8000)}catch{}
    if(/\.zip$/i.test(f.name)&&window.JSZip)try{const z=await JSZip.loadAsync(f);text+=" "+Object.keys(z.files).join(" ")}catch{}
    uploadRows.push({fileName:f.name,fileSize:f.size,courseCode:normalizeCourse(text),section:sectionFrom(text),courseName:""});
  }
  showReview();
}

function formsKey(){return formsHeaders.map(x=>x.toLowerCase().replace(/[^a-z0-9]+/g," ")).sort().join("|")}
const MAP_FIELDS=[["student","Student Name or ID"],["course","Course"],["section","Section / CRN"],["term","Semester / Term"],["company","Employer / Company"],["technical","Technical Skills"],["communication","Communication"],["teamwork","Teamwork"],["professionalism","Professionalism"],["comments","Comments"],["recommendations","Recommendations"]];
function guess(key){const aliases={student:["student"],course:["course","class"],section:["section","crn"],term:["semester","term"],company:["company","employer"],technical:["technical"],communication:["communication"],teamwork:["teamwork","team work"],professionalism:["professional"],comments:["comment","feedback"],recommendations:["recommend","improvement"]}[key];return formsHeaders.find(h=>aliases.some(a=>h.toLowerCase().includes(a)))||""}
function showFormsMap(){$("uploadFilePanel").classList.add("hidden");$("formsMapPanel").classList.remove("hidden");$("formsMapFields").innerHTML=MAP_FIELDS.map(([k,l])=>`<label>${l}<select id="map_${k}"><option value="">Not Used</option>${formsHeaders.map(h=>`<option value="${esc(h)}" ${h===guess(k)?"selected":""}>${esc(h)}</option>`).join("")}</select></label>`).join("")}
async function saveFormsMap(){formsMapping={};MAP_FIELDS.forEach(([k])=>formsMapping[k]=$(`map_${k}`).value);const key=formsKey();let saved=hub.formsMappings.find(x=>x.key===key);if(!saved){saved={id:id("map"),key,createdAt:now(),createdBy:currentUser.email};hub.formsMappings.push(saved)}saved.mapping=formsMapping;saved.updatedAt=now();saved.updatedBy=currentUser.email;await saveHub();showFormsReview()}
function fv(row,key){return formsMapping[key]?row[formsMapping[key]]:""}
function showFormsReview(){$("formsMapPanel").classList.add("hidden");$("uploadFilePanel").classList.add("hidden");$("uploadReviewPanel").classList.remove("hidden");$("uploadReview").innerHTML=`<div class="notice"><strong>${formsRows.length} responses found.</strong> The Hub will save a combined employer-evaluation summary.</div><div class="table-wrap"><table class="table"><tr><th>Student</th><th>Section</th><th>Company</th><th>Comments</th></tr>${formsRows.slice(0,5).map(r=>`<tr><td>${esc(fv(r,"student"))}</td><td>${esc(fv(r,"section"))}</td><td>${esc(fv(r,"company"))}</td><td>${esc(String(fv(r,"comments")).slice(0,100))}</td></tr>`).join("")}</table></div>`}
function showReview(){$("uploadFilePanel").classList.add("hidden");$("uploadReviewPanel").classList.remove("hidden");$("uploadReview").innerHTML=uploadRows.map((r,i)=>`<div class="route-row"><strong>${esc(r.fileName)}</strong><div class="form-grid"><label>Course Code<input data-row="${i}" data-field="courseCode" value="${esc(r.courseCode)}"></label><label>Course Name<input data-row="${i}" data-field="courseName" value="${esc(r.courseName)}"></label><label>Section / CRN<input data-row="${i}" data-field="section" value="${esc(r.section)}"></label></div></div>`).join("");document.querySelectorAll("[data-row]").forEach(x=>x.addEventListener("input",()=>uploadRows[Number(x.dataset.row)][x.dataset.field]=x.value))}
function number(v){if(typeof v==="number")return v;const n=parseFloat(String(v||""));if(!Number.isNaN(n))return n;const m={excellent:5,"very good":4,good:3,satisfactory:3,fair:2,poor:1};const k=Object.keys(m).find(x=>String(v).toLowerCase().includes(x));return k?m[k]:null}
function formsSummary(){const keys=["technical","communication","teamwork","professionalism"],ratings={};keys.forEach(k=>{const v=formsRows.map(r=>number(fv(r,k))).filter(x=>x!==null);ratings[k]=v.length?Math.round(v.reduce((a,b)=>a+b,0)/v.length*100)/100:null});return{count:formsRows.length,sections:[...new Set(formsRows.map(r=>String(fv(r,"section")).trim()).filter(Boolean))],companies:[...new Set(formsRows.map(r=>String(fv(r,"company")).trim()).filter(Boolean))],ratings,comments:formsRows.map(r=>String(fv(r,"comments")).trim()).filter(Boolean),recommendations:formsRows.map(r=>String(fv(r,"recommendations")).trim()).filter(Boolean)}}

async function saveUpload(){
  const term=$("uploadTerm").value,assessment=$("uploadAssessment").value.trim()||(uploadType==="journals"?"Capstone Journal Review":uploadType);
  if(uploadType==="gradebook"){
    try{await saveGradebookUpload(term,assessment)}
    catch(error){console.error(error);alert("The gradebook could not be saved: "+error.message);return}
  }else if(uploadType==="journals"||uploadType==="reflection"){
    if(!journalRows.length)return alert("No journals are ready to save.");
    hub.qualitativeAssessments ||= [];hub.qualitativeDocuments ||= [];hub.qualitativeReviews ||= [];hub.qualitativeNarratives ||= [];
    const assessmentId=id("qualAssessment");
    const course=journalRows.find(r=>r.courseCode)?.courseCode||"ETDE 4813";
    const sections=[...new Set(journalRows.map(r=>r.section).filter(Boolean))];
    hub.qualitativeAssessments.unshift({
      id:assessmentId,term,courseCode:course,courseName:"Instrumentation Capstone",
      assessmentType:uploadType==="journals"?"capstone-journal":"reflection",
      assessmentName:assessment,slo:"",cycle:"",createdBy:currentUser.email,createdAt:now(),status:"open",
      importSource:journalSourceFiles.join(", "),automaticAnalysis:"keyword-based"
    });
    const batchId=id("journalBatch");
    for(const row of journalRows){
      const documentId=id("qualDoc");
      const themes=analyzeJournalThemes(row.text);
      const autoSummary=journalAutoSummary(row,themes);
      hub.qualitativeDocuments.unshift({
        id:documentId,assessmentId,section:row.section||"Unassigned",batch:batchId,
        fileName:row.fileName,sourceZip:row.archivePath,fileSize:row.fileSize,
        subjectIdentifier:row.student,week:row.week||null,uploaderEmail:currentUser.email,
        uploadedAt:now(),status:"reviewed",textLength:row.textLength,
        textExcerpt:row.text.slice(0,1200),archivePath:row.archivePath
      });
      hub.qualitativeReviews.unshift({
        id:id("qualReview"),documentId,assessmentId,themes,facultySummary:autoSummary,
        status:"reviewed",reviewedBy:"Automatic journal importer",createdAt:now(),updatedAt:now()
      });
    }
    const themeTotals={};
    Object.keys(QUAL_KEYWORDS).forEach(theme=>{
      const ratings=hub.qualitativeReviews.filter(r=>r.assessmentId===assessmentId).map(r=>r.themes?.[theme]?.rating);
      const usable=ratings.filter(Boolean);
      const met=usable.filter(v=>v==="strong"||v==="present").length;
      themeTotals[theme]=usable.length?Math.round(met/usable.length*100):null;
    });
    const strongest=Object.entries(themeTotals).filter(([,v])=>v!==null&&v>=75).map(([k])=>k);
    const attention=Object.entries(themeTotals).filter(([,v])=>v!==null&&v<60).map(([k])=>k);
    const narrative=`${term} ${assessment} included ${journalRows.length} journal document(s)${sections.length?` across ${sections.length} section(s)`:``}. The nested Canvas ZIP package was opened automatically, while timesheets, bills of materials, sign-in sheets, and project files were excluded. ${strongest.length?`The strongest recurring evidence areas were ${strongest.join(", ")}.`:""} ${attention.length?`Evidence was less consistently detected in ${attention.join(", ")}, which should be verified by faculty before an improvement action is selected.`:""} This is an automated keyword-based first review and remains editable before approval.`;
    hub.qualitativeNarratives.unshift({id:id("qualNarrative"),assessmentId,assessmentKey:`qa:${assessmentId}`,text:narrative,createdAt:now(),updatedAt:now(),updatedBy:"Automatic journal importer",approved:false});
    hub.routedUploads.unshift({
      id:id("upload"),type:uploadType,fileName:journalSourceFiles.join(", "),fileSize:journalRows.reduce((s,r)=>s+r.fileSize,0),
      courseCode:course,courseName:"Instrumentation Capstone",section:sections.join(", "),term,
      assessmentName:assessment,uploaderEmail:currentUser.email,uploadedAt:now(),status:"routed",
      archived:false,journalAssessmentId:assessmentId,journalCount:journalRows.length,
      generatedNarrative:narrative,history:[{at:now(),by:currentUser.email,action:"nested-journal-import"}]
    });
  }else if(uploadType==="microsoft-forms"){
    const s=formsSummary(),course=normalizeCourse(formsRows.map(r=>fv(r,"course")).join(" "))||"ETDE 4112";
    const narrative=`${term} employer evaluation results for ${course} included ${s.count} Microsoft Forms response(s) across ${s.sections.length||1} section(s). Faculty should review the rating averages and written employer comments, then approve the final findings for the ABET report.`;
    hub.routedUploads.unshift({id:id("upload"),type:uploadType,fileName:formsFile.name,fileSize:formsFile.size,courseCode:course,section:s.sections.join(", "),term,assessmentName:assessment,uploaderEmail:currentUser.email,uploadedAt:now(),status:"routed",archived:false,formsSummary:s,generatedNarrative:narrative,history:[{at:now(),by:currentUser.email,action:"created"}]});
  }else uploadRows.forEach(r=>hub.routedUploads.unshift({id:id("upload"),type:uploadType,...r,term,assessmentName:assessment,uploaderEmail:currentUser.email,uploadedAt:now(),status:r.courseCode&&r.section?"routed":"needs-review",archived:false,history:[{at:now(),by:currentUser.email,action:"created"}]}));
  await saveHub();$("uploadReviewPanel").classList.add("hidden");$("uploadDone").classList.remove("hidden");
}

function resultKey(u){return [u.term,u.courseCode,u.assessmentName,u.type].join("|")}
function renderResultsPage(){
  const active=hub.routedUploads.filter(u=>!u.archived),groups=[...new Map(active.map(u=>[resultKey(u),u])).entries()];
  $("resultAssessment").innerHTML='<option value="">Choose an assessment</option>'+groups.map(([k,u])=>`<option value="${esc(k)}">${esc(u.term)} — ${esc(u.courseCode||"Unmatched")} — ${esc(u.assessmentName)}</option>`).join("");
  $("resultAssessment").addEventListener("change",renderSelectedResult);$("approveResult").addEventListener("click",approveResult);$("saveNarrative").addEventListener("click",saveNarrative);
  if(groups[0]){$("resultAssessment").value=groups[0][0];renderSelectedResult()}
}
function selectedUploads(){const k=$("resultAssessment").value;return hub.routedUploads.filter(u=>!u.archived&&resultKey(u)===k)}
function generatedNarrative(rows){if(rows[0]?.generatedNarrative)return rows[0].generatedNarrative;const u=rows[0],secs=[...new Set(rows.map(x=>x.section).filter(Boolean))];return `${u.term} assessment evidence for ${u.courseCode||"the selected course"} included ${rows.length} upload(s) across ${secs.length||1} section(s). Faculty reviewed the combined evidence and should document strengths, areas for improvement, and any required continuous-improvement actions.`}
function renderSelectedResult(){
  const rows=selectedUploads();if(!rows.length){$("resultSummary").innerHTML="";return}
  const u=rows[0],forms=rows.find(x=>x.formsSummary),saved=hub.streamlinedNarratives.find(n=>n.key===$("resultAssessment").value);
  $("resultSummary").innerHTML=`<div class="grid"><div class="metric"><strong>${rows.length}</strong><span>Uploads</span></div><div class="metric"><strong>${new Set(rows.map(x=>x.section)).size}</strong><span>Sections</span></div><div class="metric"><strong>${rows.filter(x=>x.status==="needs-review").length}</strong><span>Routing Issues</span></div></div>`+(forms?`<h4>Microsoft Forms Summary</h4><p>${forms.formsSummary.count} responses from ${forms.formsSummary.companies.length} companies.</p>`:"");
  $("resultNarrative").value=saved?.text||generatedNarrative(rows);
  $("resultEvidence").innerHTML=`<div class="table-wrap"><table class="table"><tr><th>File</th><th>Section</th><th>Uploader</th><th>Status</th></tr>${rows.map(x=>`<tr><td>${esc(x.fileName)}</td><td>${esc(x.section)}</td><td>${esc(x.uploaderEmail)}</td><td>${esc(x.status)}</td></tr>`).join("")}</table></div>`+(forms?`<h4>Employer Comments</h4>${forms.formsSummary.comments.map(c=>`<p>• ${esc(c)}</p>`).join("")}`:"");
}
async function saveNarrative(){
  const key=$("resultAssessment").value;if(!key)return;let n=hub.streamlinedNarratives.find(x=>x.key===key);if(!n){n={id:id("narrative"),key,createdAt:now()};hub.streamlinedNarratives.push(n)}n.text=$("resultNarrative").value;n.updatedAt=now();n.updatedBy=currentUser.email;await saveHub();alert("Narrative saved.")
}
async function approveResult(){const rows=selectedUploads();rows.forEach(x=>{x.resultApproved=true;x.resultApprovedAt=now();x.resultApprovedBy=currentUser.email});await saveNarrative();await saveHub();alert("Results approved.")}

function renderCurriculum(){
  $("courseSearch").addEventListener("input",renderCourseCatalog);$("saveMatrix")?.addEventListener("click",saveMatrix);$("saveSchedule")?.addEventListener("click",saveSchedule);
  renderCoverage();renderCurrentPlan();renderCourseCatalog();renderMatrix();renderSchedule();
}
function renderCoverage(){$("coverageCards").innerHTML=CUR.outcomes.map(o=>{const mapped=Object.entries(hub.curriculum.courseOutcomeMap).filter(([,v])=>v.includes(o.id)).map(([k])=>k),done=mapped.filter(hasEvidence).length;return`<div class="metric"><strong>${mapped.length?Math.round(done/mapped.length*100):0}%</strong><span>${o.id}: ${esc(o.short)}</span></div>`}).join("")}
function renderCurrentPlan(){const y=cycleInfo().year,codes=scheduledCodes(y);$("currentPlan").innerHTML=codes.map(c=>`<div class="plan-row"><strong>${c}</strong> <span class="badge ${hasEvidence(c)?"good":"warn"}">${hasEvidence(c)?"Evidence Received":"Due This Year"}</span></div>`).join("")}
function renderCourseCatalog(){const q=$("courseSearch").value.toLowerCase();$("courseCatalog").innerHTML='<div class="table-wrap"><table class="table"><tr><th>Code</th><th>Course</th><th>Credits</th></tr>'+CUR.courses.filter(c=>`${c[0]} ${c[1]}`.toLowerCase().includes(q)).map(c=>`<tr><td>${c[0]}</td><td>${c[1]}</td><td>${c[2]}</td></tr>`).join("")+"</table></div>"}
function renderMatrix(){if(!$("outcomeMatrix"))return;$("outcomeMatrix").innerHTML=`<table class="matrix"><tr><th>Course</th>${CUR.outcomes.map(o=>`<th>${o.id}</th>`).join("")}</tr>${CUR.courses.map(c=>`<tr><td><strong>${c[0]}</strong><br><small>${c[1]}</small></td>${CUR.outcomes.map(o=>`<td><input type="checkbox" id="m_${c[0].replace(/\W/g,"_")}_${o.id}" ${(hub.curriculum.courseOutcomeMap[c[0]]||[]).includes(o.id)?"checked":""}></td>`).join("")}</tr>`).join("")}</table>`}
async function saveMatrix(){const map={};CUR.courses.forEach(c=>{const a=CUR.outcomes.filter(o=>$(`m_${c[0].replace(/\W/g,"_")}_${o.id}`).checked).map(o=>o.id);if(a.length)map[c[0]]=a});hub.curriculum.courseOutcomeMap=map;await saveHub();renderCoverage();alert("Matrix saved.")}
function renderSchedule(){if(!$("scheduleEditor"))return;$("scheduleEditor").innerHTML=CUR.outcomes.map(o=>`<div class="card"><strong>${o.id}: ${o.short}</strong><div class="form-grid">${[1,2,3,4,5,6].map(y=>`<label>Year ${y}<select id="s_${o.id}_${y}"><option value="">Not scheduled</option>${CUR.courses.map(c=>`<option value="${c[0]}" ${(hub.curriculum.schedule[o.id]?.[y]||[])[0]===c[0]?"selected":""}>${c[0]} — ${c[1]}</option>`).join("")}</select></label>`).join("")}</div></div>`).join("")}
async function saveSchedule(){const s={};CUR.outcomes.forEach(o=>{s[o.id]={};[1,2,3,4,5,6].forEach(y=>{const v=$(`s_${o.id}_${y}`).value;s[o.id][y]=v?[v]:[]})});hub.curriculum.schedule=s;await saveHub();renderCurrentPlan();alert("Schedule saved.")}

function renderCalendar(){
  const c=cycleInfo(),themes=[["Collect","Establish baseline evidence"],["Improve","Implement and verify improvements"],["Analyze","Review trends and curriculum"],["Collect","Begin second-cycle evidence"],["Improve","Verify continued effectiveness"],["Prepare","Complete cycle and prepare review"]];
  $("cycleCurrent").textContent=`Year ${c.year} of 6 — ${ay(c.cur)}`;$("cycleFocus").textContent=`${themes[c.year-1][0]}: ${themes[c.year-1][1]}`;
  $("cycleStart").value=hub.roadmapSettings.cycleStartYear;$("saveCycle")?.addEventListener("click",async()=>{hub.roadmapSettings.cycleStartYear=Number($("cycleStart").value)||2026;await saveHub();renderCalendar()});
  $("cycleTimeline").innerHTML=themes.map((t,i)=>`<div class="year-card ${i+1===c.year?"current":""}"><strong>Year ${i+1}</strong><span>${ay(c.cycleStart+i)}</span><h4>${t[0]}</h4><p>${t[1]}</p></div>`).join("");
  const tasks=[["Upload Gradebooks","gradebook"],["Upload Journals","journals"],["Upload Employer Evaluations","microsoft-forms"],["Approve Results","approved"],["Save Meeting Notes","notes"]];
  $("semesterTasks").innerHTML=tasks.map(([l,t])=>{const done=t==="approved"?hub.routedUploads.some(x=>x.resultApproved):t==="notes"?hub.meetingNotes.length>0:hub.routedUploads.some(x=>x.type===t&&!x.archived);return`<div class="plan-row">${l} <span class="badge ${done?"good":"warn"}">${done?"Complete":"Not Complete"}</span></div>`}).join("");
  const eligible=retentionItems().filter(x=>x.eligible);$("retentionList").innerHTML=eligible.length?eligible.map(x=>`<div class="admin-row"><strong>${esc(x.fileName)}</strong><br>Eligible ${x.retentionDue.toLocaleDateString()}</div>`).join(""):'<div class="notice success">No evidence has reached the six-year review date.</div>';
}
function retentionItems(){const yrs=Number(hub.roadmapSettings.retentionYears)||6,nowd=new Date();return hub.routedUploads.map(u=>{const d=new Date(u.uploadedAt||now());d.setFullYear(d.getFullYear()+yrs);return{...u,retentionDue:d,eligible:d<=nowd}})}

function initReports(){
  $("generateReport").addEventListener("click",generateReport);
  $("downloadReport").addEventListener("click",()=>download("ETDE_ABET_Report.txt",$("reportPreview").value));
  $("printReport").addEventListener("click",()=>window.print());
  initSemesterCloseout();
}
function generateReport(){const type=$("reportType").value,term=$("reportTerm").value,uploads=hub.routedUploads.filter(x=>!x.archived&&(!term||x.term===term)),approved=uploads.filter(x=>x.resultApproved),notes=hub.meetingNotes.filter(n=>!term||String(n.date||"").includes(term.slice(-4)));$("reportPreview").value=`OSUIT ETDE ASSESSMENT & ACCREDITATION HUB\n${type.toUpperCase()} REPORT\nTerm: ${term}\nGenerated: ${new Date().toLocaleString()}\n\nUploads: ${uploads.length}\nApproved assessments: ${approved.length}\nMeeting notes: ${notes.length}\nCurrent cycle year: ${cycleInfo().year} of 6\n\nASSESSMENTS\n${uploads.map(x=>`- ${x.courseCode||"Unmatched"} | ${x.assessmentName} | ${x.section||"No section"} | ${x.status}`).join("\n")}\n\nAPPROVED NARRATIVES\n${hub.streamlinedNarratives.map(n=>n.text).join("\n\n")}\n\nMEETING NOTES\n${notes.map(n=>`${n.date} ${n.type}\n${n.discussion}\nActions: ${n.actions}`).join("\n\n")}`}

function renderNotes(){
  $("noteDate").value=new Date().toISOString().slice(0,10);$("saveNote").addEventListener("click",saveNote);$("noteSearch").addEventListener("input",listNotes);listNotes()
}
async function saveNote(){hub.meetingNotes.unshift({id:id("note"),date:$("noteDate").value,type:$("noteType").value,cycle:$("noteCycle").value,attendees:$("noteAttendees").value,discussion:$("noteDiscussion").value,actions:$("noteActions").value,author:currentUser.email,createdAt:now()});await saveHub();["noteAttendees","noteDiscussion","noteActions"].forEach(x=>$(x).value="");listNotes()}
function listNotes(){const q=($("noteSearch")?.value||"").toLowerCase();$("notesList").innerHTML=hub.meetingNotes.filter(n=>JSON.stringify(n).toLowerCase().includes(q)).map(n=>`<div class="note-row"><strong>${esc(n.date)} — ${esc(n.type)}</strong><p>${esc(n.discussion)}</p><p><strong>Actions:</strong> ${esc(n.actions)}</p><small>${esc(n.author)}</small></div>`).join("")||'<div class="notice">No meeting notes found.</div>'}


function renderAdminRetention(){
  const host=$("adminRetention");
  if(!host)return;
  const rows=typeof retentionItems==="function"?retentionItems().filter(x=>x.eligible):[];
  host.innerHTML=rows.length?rows.map(x=>`<div class="admin-row"><strong>${esc(x.fileName||"Evidence record")}</strong><br>Eligible for retention review ${x.retentionDue instanceof Date?x.retentionDue.toLocaleDateString():esc(x.retentionDue||"")}</div>`).join(""):'<div class="notice success">No records are currently eligible for deletion review.</div>';
}

function renderAdmin(){
  $("adminView").addEventListener("change",listAdmin);$("adminSearch").addEventListener("input",listAdmin);listAdmin();renderAdminRetention()
}
function listAdmin(){const view=$("adminView").value,q=$("adminSearch").value.toLowerCase();let rows=hub.routedUploads.filter(x=>view==="all"||(view==="archived"?x.archived:!x.archived));rows=rows.filter(x=>JSON.stringify(x).toLowerCase().includes(q));$("adminUploads").innerHTML=rows.map(x=>`<div class="admin-row"><strong>${esc(x.fileName)}</strong><br>${esc(x.courseCode)} | ${esc(x.section)} | ${esc(x.assessmentName)}<div class="actions"><button class="btn outline" data-edit="${esc(x.id)}">Edit</button>${x.archived?`<button class="btn primary" data-restore="${esc(x.id)}">Restore</button>`:`<button class="btn secondary" data-archive="${esc(x.id)}">Archive</button>`}<button class="btn danger" data-delete="${esc(x.id)}">Delete</button></div></div>`).join("")||'<div class="notice">No uploads found.</div>';document.querySelectorAll("[data-edit]").forEach(b=>b.addEventListener("click",()=>editUpload(b.dataset.edit)));document.querySelectorAll("[data-archive]").forEach(b=>b.addEventListener("click",()=>archiveUpload(b.dataset.archive,true)));document.querySelectorAll("[data-restore]").forEach(b=>b.addEventListener("click",()=>archiveUpload(b.dataset.restore,false)));document.querySelectorAll("[data-delete]").forEach(b=>b.addEventListener("click",()=>deleteUpload(b.dataset.delete)))}
async function editUpload(i){const u=hub.routedUploads.find(x=>x.id===i);if(!u)return;const c=prompt("Course code:",u.courseCode||"");if(c===null)return;const s=prompt("Section:",u.section||"");if(s===null)return;const a=prompt("Assessment name:",u.assessmentName||"");if(a===null)return;u.courseCode=c.toUpperCase();u.section=s;u.assessmentName=a;u.status=u.courseCode&&u.section?"routed":"needs-review";await saveHub();listAdmin()}
async function archiveUpload(i,v){const u=hub.routedUploads.find(x=>x.id===i);if(!u)return;u.archived=v;await saveHub();listAdmin();renderAdminRetention()}
async function deleteUpload(i){
  const u=(hub.routedUploads||[]).find(x=>x.id===i);
  if(!u||!confirm(`Permanently delete ${u.fileName}? Linked analytics records will also be removed when they can be identified.`))return;

  hub.deletedUploadTombstones ||= [];
  hub.deletedUploadTombstones.unshift({
    id:id("deletedUpload"),deletedAt:now(),deletedBy:currentUser.email,
    uploadId:u.id,type:u.type||"",term:u.term||"",courseCode:normalizeCourse(u.courseCode)||u.courseCode||"",
    courseName:u.courseName||"",section:u.section||"",assessmentName:u.assessmentName||"",
    assignmentId:u.assignmentId||"",assignmentIds:Array.isArray(u.assignmentIds)?u.assignmentIds:[],
    gradeIds:Array.isArray(u.gradeIds)?u.gradeIds:[],studentIds:Array.isArray(u.studentIds)?u.studentIds:[]
  });

  const qualId=u.journalAssessmentId||u.qualitativeAssessmentId||u.assessmentId;
  const batchIds=new Set([u.id,u.importBatchId,u.batchId,u.uploadId].filter(Boolean));
  const assignmentIds=new Set([
    ...(Array.isArray(u.assignmentIds)?u.assignmentIds:[]),
    u.assignmentId
  ].filter(Boolean));
  const gradeIds=new Set(Array.isArray(u.gradeIds)?u.gradeIds:[]);
  const studentIds=new Set(Array.isArray(u.studentIds)?u.studentIds:[]);

  hub.routedUploads=(hub.routedUploads||[]).filter(x=>x.id!==i);

  if(qualId){
    const docIds=new Set((hub.qualitativeDocuments||[]).filter(d=>d.assessmentId===qualId).map(d=>d.id));
    hub.qualitativeAssessments=(hub.qualitativeAssessments||[]).filter(a=>a.id!==qualId);
    hub.qualitativeDocuments=(hub.qualitativeDocuments||[]).filter(d=>d.assessmentId!==qualId);
    hub.qualitativeReviews=(hub.qualitativeReviews||[]).filter(r=>r.assessmentId!==qualId&&!docIds.has(r.documentId));
    hub.qualitativeNarratives=(hub.qualitativeNarratives||[]).filter(n=>n.assessmentId!==qualId&&n.assessmentKey!==`qa:${qualId}`);
  }

  // Remove explicitly linked or batch-linked quantitative records.
  hub.grades=(hub.grades||[]).filter(g=>
    !gradeIds.has(g.id) &&
    !assignmentIds.has(g.assignmentId) &&
    !batchIds.has(g.sourceUploadId) &&
    !batchIds.has(g.uploadId) &&
    !batchIds.has(g.importBatchId) &&
    !batchIds.has(g.batchId)
  );
  hub.assignments=(hub.assignments||[]).filter(a=>
    !assignmentIds.has(a.id) &&
    !batchIds.has(a.sourceUploadId) &&
    !batchIds.has(a.uploadId) &&
    !batchIds.has(a.importBatchId) &&
    !batchIds.has(a.batchId)
  );

  // Remove explicitly linked students only when they no longer have grades.
  hub.students=(hub.students||[]).filter(s=>{
    if(!studentIds.has(s.id))return true;
    return (hub.grades||[]).some(g=>g.studentId===s.id);
  });

  await saveHub();
  resetAnalyticsGraphs({silent:true,purgeOrphans:true});
  listAdmin();
  renderAdminRetention();
  alert("The upload and identifiable linked analytics records were deleted. Graphs were recalculated.");
}
function studentName(s){return s?.name||s?.sid||"Unnamed student"}
function courseName(c){return [c?.code,c?.name,c?.section].filter(Boolean).join(" — ")}
function sloName(s){return [s?.code,s?.description].filter(Boolean).join(" — ")}
function validGradePercent(g,a){
  const earned=Number(g?.earned);
  const possible=Number(g?.possible)||Number(a?.possible);
  return Number.isFinite(earned)&&Number.isFinite(possible)&&possible>0?earned/possible*100:null;
}
function calculateStudentSloResults(courseId,sloId,threshold){
  const d=analyticsData();
  const assignments=d.assignments.filter(a=>(!courseId||a.courseId===courseId)&&(!sloId||a.sloId===sloId));
  const ids=new Set(assignments.map(a=>a.id));
  const relevantStudentIds=new Set(d.grades.filter(g=>ids.has(g.assignmentId)).map(g=>g.studentId));
  const students=d.students.filter(s=>s.active!==false&&(!courseId||s.courseId===courseId||relevantStudentIds.has(s.id)));
  return students.map(student=>{
    const grades=d.grades.filter(g=>g.studentId===student.id&&ids.has(g.assignmentId));
    let weighted=0,weightTotal=0,earned=0,possible=0,validCount=0;
    grades.forEach(g=>{
      const a=d.assignments.find(x=>x.id===g.assignmentId);
      const pct=validGradePercent(g,a);
      if(pct===null)return;
      const w=Number(a?.weight)>0?Number(a.weight):1;
      weighted+=pct*w;weightTotal+=w;
      earned+=Number(g.earned);possible+=Number(g.possible)||Number(a?.possible)||0;
      validCount++;
    });
    if(!validCount||weightTotal<=0)return {student,status:"Skipped",percent:null,validCount};
    const percent=weighted/weightTotal;
    return {student,status:percent>=threshold?"Passed":"Failed",percent,validCount,earned,possible};
  });
}
function analyticsSummary(courseId,sloId,threshold,target){
  const rows=calculateStudentSloResults(courseId,sloId,threshold);
  const passed=rows.filter(r=>r.status==="Passed"),failed=rows.filter(r=>r.status==="Failed"),skipped=rows.filter(r=>r.status==="Skipped");
  const assessed=passed.length+failed.length,rate=assessed?passed.length/assessed*100:0;
  return {rows,passed,failed,skipped,assessed,total:rows.length,rate,programMet:rate>=target};
}
function allSloSummaries(courseId,threshold){
  const d=analyticsData();
  return d.slos.map(s=>{
    const r=analyticsSummary(courseId,s.id,threshold,hubSettings().target);
    return {slo:s,passed:r.passed.length,failed:r.failed.length,skipped:r.skipped.length,assessed:r.assessed,rate:r.rate};
  }).filter(x=>x.assessed||x.skipped);
}
function renderAnalyticsSelectors(){
  const d=analyticsData();
  $("analyticsCourse").innerHTML='<option value="">All Courses</option>'+d.courses.map(c=>`<option value="${esc(c.id)}">${esc(courseName(c))}</option>`).join("");
  $("analyticsSlo").innerHTML='<option value="">All SLOs Combined</option>'+d.slos.map(s=>`<option value="${esc(s.id)}">${esc(sloName(s))}</option>`).join("");
  const st=hubSettings();
  $("analyticsThreshold").value=st.threshold;
  $("analyticsTarget").value=st.target;
}
function renderStudentList(idName,rows,cls){
  const host=$(idName);
  host.innerHTML=rows.length?rows.map(r=>`<div class="student-chip ${cls}"><strong>${esc(studentName(r.student))}</strong>${r.percent!==null?`<br>${r.percent.toFixed(1)}%`:"<br>No usable grade"}</div>`).join(""):'<div class="notice">None</div>';
}
function renderStatusChart(summary){
  if(typeof Chart==="undefined")return;
  if(statusChartInstance)statusChartInstance.destroy();
  statusChartInstance=new Chart($("statusChart"),{
    type:"bar",
    data:{labels:["Met Threshold","Below Threshold","Skipped / Missing"],datasets:[{label:"Students",data:[summary.passed.length,summary.failed.length,summary.skipped.length]}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,ticks:{precision:0}}}}
  });
}
function renderSloChart(courseId,threshold){
  if(typeof Chart==="undefined")return;
  const rows=allSloSummaries(courseId,threshold);
  if(sloChartInstance)sloChartInstance.destroy();
  sloChartInstance=new Chart($("sloChart"),{
    type:"bar",
    data:{labels:rows.map(x=>x.slo.code||x.slo.description||"SLO"),datasets:[{label:"Threshold success rate (%)",data:rows.map(x=>Number(x.rate.toFixed(1)))}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,max:100}}}
  });
}
function renderAnalytics(){
  const courseId=$("analyticsCourse").value,sloId=$("analyticsSlo").value;
  const threshold=Math.max(0,Math.min(100,Number($("analyticsThreshold").value)||70));
  const target=Math.max(0,Math.min(100,Number($("analyticsTarget").value)||75));
  const s=analyticsSummary(courseId,sloId,threshold,target);
  $("analyticsMetrics").innerHTML=[
    ["Required Threshold",threshold.toFixed(0)+"%"],
    ["Met Threshold",s.passed.length],
    ["Below Threshold",s.failed.length],
    ["Skipped / Missing",s.skipped.length],
    ["Students Assessed",s.assessed],
    ["Success Rate",s.rate.toFixed(1)+"%"],
    ["Program Target",target.toFixed(0)+"%"],
    ["Target Status",s.programMet?"Met":"Not Met"]
  ].map(([l,v])=>`<div class="metric"><strong>${v}</strong><span>${l}</span></div>`).join("");
  renderStudentList("passedStudents",s.passed,"pass");
  renderStudentList("failedStudents",s.failed,"fail");
  renderStudentList("skippedStudents",s.skipped,"skip");
  $("studentResultTable").innerHTML=`<div class="table-wrap"><table class="table"><tr><th>Student</th><th>Status</th><th>Percentage</th><th>Valid Grade Records</th></tr>${s.rows.map(r=>`<tr><td>${esc(studentName(r.student))}</td><td><span class="badge ${r.status==="Passed"?"good":r.status==="Failed"?"danger":"warn"}">${r.status}</span></td><td>${r.percent===null?"—":r.percent.toFixed(1)+"%"}</td><td>${r.validCount}</td></tr>`).join("")}</table></div>`;
  renderStatusChart(s);renderSloChart(courseId,threshold);
}
function initAnalytics(){
  if(page()!=="analytics.html")return;
  renderAnalyticsSelectors();
  $("refreshAnalytics").addEventListener("click",renderAnalytics);
  ["analyticsCourse","analyticsSlo"].forEach(x=>$(x).addEventListener("change",renderAnalytics));
  renderAnalytics();
}


// Version 5.1 — Guided Gradebook — clean qualitative analytics
const QUAL_THEMES=[
  "Technical Competency","Problem Solving","Communication","Teamwork","Leadership",
  "Safety","Ethics","Professionalism","Project Management","Continuous Improvement"
];
let qualitativeThemeChart=null;

function qualitativeSources(){
  const reviews=Array.isArray(hub.qualitativeReviews)?hub.qualitativeReviews:[];
  const docs=Array.isArray(hub.qualitativeDocuments)?hub.qualitativeDocuments:[];
  const assessments=Array.isArray(hub.qualitativeAssessments)?hub.qualitativeAssessments:[];
  const forms=(hub.routedUploads||[]).filter(u=>!u.archived&&u.formsSummary);
  return {reviews,docs,assessments,forms};
}
function qualAssessmentOptions(){
  const s=qualitativeSources();
  const items=[];
  s.assessments.forEach(a=>items.push({key:"qa:"+a.id,label:`${a.term||""} — ${a.courseCode||""} — ${a.assessmentName||"Qualitative Assessment"}`,kind:"qa",id:a.id}));
  s.forms.forEach(u=>items.push({key:"forms:"+u.id,label:`${u.term||""} — ${u.courseCode||""} — ${u.assessmentName||"Employer Evaluation"}`,kind:"forms",id:u.id}));
  return items;
}
function selectedQualOption(){
  const key=$("qualAssessment")?.value||"";
  return qualAssessmentOptions().find(x=>x.key===key)||null;
}
function ratingScore(v){
  return ({strong:100,present:75,limited:40,"not-observed":0,na:null})[v] ?? null;
}
function qualitativeSummary(){
  const option=selectedQualOption();
  if(!option)return null;
  const section=$("qualSection")?.value||"";
  const src=qualitativeSources();

  if(option.kind==="forms"){
    const row=src.forms.find(x=>x.id===option.id);
    if(!row)return null;
    const f=row.formsSummary||{};
    const ratings={
      "Technical Competency":f.ratings?.technical==null?null:Math.min(100,Math.round(f.ratings.technical/5*100)),
      "Communication":f.ratings?.communication==null?null:Math.min(100,Math.round(f.ratings.communication/5*100)),
      "Teamwork":f.ratings?.teamwork==null?null:Math.min(100,Math.round(f.ratings.teamwork/5*100)),
      "Professionalism":f.ratings?.professionalism==null?null:Math.min(100,Math.round(f.ratings.professionalism/5*100))
    };
    return {
      option,row,total:f.count||0,reviewed:f.count||0,sections:f.sections||[],companies:f.companies||[],
      themes:ratings,comments:f.comments||[],recommendations:f.recommendations||[],documents:[row]
    };
  }

  const assessment=src.assessments.find(x=>x.id===option.id);
  let documents=src.docs.filter(d=>d.assessmentId===option.id&&!d.archived);
  if(section)documents=documents.filter(d=>d.section===section);
  const ids=new Set(documents.map(d=>d.id));
  const reviews=src.reviews.filter(r=>ids.has(r.documentId)&&(r.status==="reviewed"||r.status==="approved"));
  const themes={};
  QUAL_THEMES.forEach(theme=>{
    const vals=reviews.map(r=>ratingScore(r.themes?.[theme]?.rating)).filter(v=>v!==null);
    themes[theme]=vals.length?Math.round(vals.reduce((a,b)=>a+b,0)/vals.length):null;
  });
  const comments=[];
  reviews.forEach(r=>{
    if(r.facultySummary)comments.push(r.facultySummary);
    QUAL_THEMES.forEach(t=>{const n=r.themes?.[t]?.note;if(n)comments.push(`${t}: ${n}`)});
  });
  return {
    option,assessment,total:documents.length,reviewed:reviews.length,
    sections:[...new Set(documents.map(d=>d.section).filter(Boolean))],
    companies:[],themes,comments,recommendations:[],documents,reviews
  };
}
function renderQualSelectors(){
  const options=qualAssessmentOptions();
  $("qualAssessment").innerHTML='<option value="">Choose an assessment</option>'+options.map(o=>`<option value="${esc(o.key)}">${esc(o.label)}</option>`).join("");
  if(options[0])$("qualAssessment").value=options[0].key;
  updateQualSections();
}
function updateQualSections(){
  const option=selectedQualOption(),select=$("qualSection");if(!select)return;
  select.disabled=false;select.title="";
  let sections=[];
  if(option?.kind==="forms"){
    // Forms imports currently store one combined summary, not raw rows by section.
    sections=[];
    select.disabled=true;
    select.title="Microsoft Forms results are stored as a combined multi-section summary.";
  }else if(option){
    select.disabled=false;select.title="";
    sections=[...new Set(qualitativeSources().docs.filter(d=>d.assessmentId===option.id).map(d=>d.section).filter(Boolean))];
  }
  const current=select.value;
  select.innerHTML='<option value="">All Sections</option>'+sections.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join("");
  if(sections.includes(current))select.value=current;
}
function qualNarrative(summary){
  if(!summary)return "";
  const scored=Object.entries(summary.themes).filter(([,v])=>v!==null).sort((a,b)=>b[1]-a[1]);
  const strengths=scored.filter(([,v])=>v>=75).map(([k])=>k);
  const attention=scored.filter(([,v])=>v<60).map(([k])=>k);
  const label=summary.option?.label||"the qualitative assessment";
  return `${label} included ${summary.total} document or response record(s) across ${summary.sections.length||1} section(s). ${strengths.length?`The strongest recurring evidence areas were ${strengths.join(", ")}.`:""} ${attention.length?`Evidence was less consistently observed in ${attention.join(", ")}, indicating an opportunity for faculty review and possible improvement actions.`:""} Faculty should verify the combined findings and approve the final narrative for inclusion in the ABET report.`;
}
function renderQualThemeChart(summary){
  if(typeof Chart==="undefined")return;
  if(qualitativeThemeChart)qualitativeThemeChart.destroy();
  const rows=Object.entries(summary.themes).filter(([,v])=>v!==null);
  qualitativeThemeChart=new Chart($("qualThemeChart"),{
    type:"bar",
    data:{labels:rows.map(x=>x[0]),datasets:[{label:"Evidence strength (%)",data:rows.map(x=>x[1])}]},
    options:{indexAxis:"y",responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{beginAtZero:true,max:100}}}
  });
}
function renderQualitative(){
  updateQualSections();
  const s=qualitativeSummary();
  if(!s){
    $("qualMetrics").innerHTML="";
    $("qualExecutive").innerHTML='<div class="notice">Choose an assessment.</div>';
    $("qualStrengths").innerHTML="";
    $("qualAttention").innerHTML="";
    $("qualNarrative").value="";
    $("qualEvidence").innerHTML="";
    return;
  }
  const scored=Object.entries(s.themes).filter(([,v])=>v!==null).sort((a,b)=>b[1]-a[1]);
  const strengths=scored.filter(([,v])=>v>=75);
  const attention=scored.filter(([,v])=>v<60);
  $("qualMetrics").innerHTML=[
    ["Documents / Responses",s.total],["Reviewed",s.reviewed],["Sections",s.sections.length||1],
    ["Strong Themes",strengths.length],["Attention Areas",attention.length],["Comments",s.comments.length]
  ].map(([l,v])=>`<div class="metric"><strong>${v}</strong><span>${l}</span></div>`).join("");
  $("qualExecutive").innerHTML=`<p><strong>${esc(s.option.label)}</strong></p><p>${s.reviewed} of ${s.total} available records are represented in the current summary.</p>`;
  $("qualStrengths").innerHTML=strengths.length?strengths.map(([k,v])=>`<div class="theme-row"><span>${esc(k)}</span><strong>${v}%</strong></div>`).join(""):'<div class="notice">No theme reached the strong-evidence level yet.</div>';
  $("qualAttention").innerHTML=attention.length?attention.map(([k,v])=>`<div class="theme-row"><span>${esc(k)}</span><strong>${v}%</strong></div>`).join(""):'<div class="notice success">No low-evidence themes were identified.</div>';
  const saved=(hub.qualitativeNarratives||[]).find(n=>n.assessmentKey===$("qualAssessment").value);
  $("qualNarrative").value=saved?.text||qualNarrative(s);
  $("qualEvidence").innerHTML=`<h4>Supporting Comments</h4><div class="comment-list">${s.comments.length?s.comments.map(c=>`<p>• ${esc(c)}</p>`).join(""):"<p>No written comments are available.</p>"}</div>
  <h4>Sections</h4><p>${s.sections.length?s.sections.map(x=>`<span class="badge">${esc(x)}</span>`).join(" "):"Not identified"}</p>`;
  renderQualThemeChart(s);
}
async function saveQualNarrative(approved=false){
  const key=$("qualAssessment").value;if(!key)return;
  hub.qualitativeNarratives ||= [];
  let row=hub.qualitativeNarratives.find(n=>n.assessmentKey===key);
  if(!row){row={id:id("qualNarrative"),assessmentKey:key,createdAt:now()};hub.qualitativeNarratives.push(row)}
  row.text=$("qualNarrative").value;row.updatedAt=now();row.updatedBy=currentUser.email;
  if(approved){row.approved=true;row.approvedAt=now();row.approvedBy=currentUser.email}
  await saveHub();alert(approved?"Qualitative results approved.":"Qualitative narrative saved.");
}
function initQualitativeAnalytics(){
  if(page()!=="qualitative.html")return;
  hub.qualitativeNarratives ||= [];
  renderQualSelectors();
  $("qualAssessment").addEventListener("change",renderQualitative);
  $("qualSection").addEventListener("change",renderQualitative);
  $("refreshQualitative").addEventListener("click",renderQualitative);
  $("saveQualitativeNarrative").addEventListener("click",()=>saveQualNarrative(false));
  $("approveQualitative").addEventListener("click",()=>saveQualNarrative(true));
  renderQualitative();
}


// Version 5.1 — Guided Gradebook — unified analytics and automatic graph reset
let uaCharts={};

function destroyUaChart(name){
  if(uaCharts[name]){uaCharts[name].destroy();uaCharts[name]=null}
}
function activeUploads(){return (hub.routedUploads||[]).filter(u=>!u.archived)}
function uaTerms(){
  return [...new Set([
    ...activeUploads().map(u=>u.term),
    ...(hub.assignments||[]).map(a=>a.term)
  ].filter(Boolean))].sort().reverse()
}
function uaCourses(){
  const map=new Map();
  (hub.courses||[]).forEach(c=>map.set(c.id,{id:c.id,code:c.code||"",name:c.name||"",section:c.section||""}));
  activeUploads().forEach(u=>{
    const key=normalizeCourse(u.courseCode)||u.courseCode||"unmatched";
    if(![...map.values()].some(c=>normalizeCourse(c.code)===normalizeCourse(key)))map.set("upload:"+key,{id:"upload:"+key,code:key,name:u.courseName||"",section:""});
  });
  return [...map.values()];
}
function selectedUaCourse(){
  const value=$("uaCourse")?.value||"";
  return uaCourses().find(c=>c.id===value)||null;
}
function uaCourseMatches(code,course){
  if(!course)return true;
  return normalizeCourse(code)===normalizeCourse(course.code);
}
function populateUnifiedFilters(){
  const terms=uaTerms(),courses=uaCourses();
  $("uaTerm").innerHTML='<option value="">All Terms</option>'+terms.map(t=>`<option>${esc(t)}</option>`).join("");
  $("uaCourse").innerHTML='<option value="">All Courses</option>'+courses.map(c=>`<option value="${esc(c.id)}">${esc([c.code,c.name].filter(Boolean).join(" — "))}</option>`).join("");
  updateUaDependentFilters();
}
function updateUaDependentFilters(){
  const term=$("uaTerm")?.value||"",course=selectedUaCourse();
  const sections=[...new Set(activeUploads().filter(u=>(!term||u.term===term)&&uaCourseMatches(u.courseCode,course)).map(u=>u.section).filter(Boolean))];
  const currentSection=$("uaSection")?.value||"";
  $("uaSection").innerHTML='<option value="">All Sections</option>'+sections.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join("");
  if(sections.includes(currentSection))$("uaSection").value=currentSection;

  const slos=(hub.slos||[]).filter(s=>{
    if(!course)return true;
    const assignments=(hub.assignments||[]).filter(a=>a.sloId===s.id);
    return assignments.some(a=>!a.courseId||a.courseId===course.id);
  });
  const currentSlo=$("uaSlo")?.value||"";
  $("uaSlo").innerHTML='<option value="">All SLOs</option>'+slos.map(s=>`<option value="${esc(s.id)}">${esc([s.code,s.description].filter(Boolean).join(" — "))}</option>`).join("");
  if(slos.some(s=>s.id===currentSlo))$("uaSlo").value=currentSlo;

  const sloId=$("uaSlo")?.value||"",section=$("uaSection")?.value||"";
  const assignmentItems=(hub.assignments||[]).filter(a=>(!term||a.term===term)&&(!sloId||a.sloId===sloId)&&(!course||!a.courseId||a.courseId===course.id));
  const uploadItems=activeUploads().filter(u=>(!term||u.term===term)&&uaCourseMatches(u.courseCode,course)&&(!section||u.section===section));
  const currentAssessment=$("uaAssessment")?.value||"";
  $("uaAssessment").innerHTML='<option value="">All Assessments</option>'+
    assignmentItems.map(a=>`<option value="assignment:${esc(a.id)}">${esc(a.name||a.title||"Assignment")}</option>`).join("")+
    uploadItems.map(u=>`<option value="upload:${esc(u.id)}">${esc(u.assessmentName||u.fileName)}</option>`).join("");
  if([...$("uaAssessment").options].some(o=>o.value===currentAssessment))$("uaAssessment").value=currentAssessment;
}
function uaFilter(){
  return {term:$("uaTerm")?.value||"",course:selectedUaCourse(),section:$("uaSection")?.value||"",sloId:$("uaSlo")?.value||"",assessment:$("uaAssessment")?.value||""}
}
function filteredQuantRows(){
  const f=uaFilter(),assignments=(hub.assignments||[]).filter(a=>
    (!f.term||a.term===f.term)&&(!f.course||!a.courseId||a.courseId===f.course.id)&&(!f.sloId||a.sloId===f.sloId)&&
    (!f.assessment||f.assessment===`assignment:${a.id}`)
  );
  const assignmentIds=new Set(assignments.map(a=>a.id));
  const students=(hub.students||[]).filter(s=>s.active!==false&&(!f.course||!s.courseId||s.courseId===f.course.id));
  const threshold=hubSettings().threshold;
  return students.map(student=>{
    const grades=(hub.grades||[]).filter(g=>g.studentId===student.id&&assignmentIds.has(g.assignmentId));
    let weighted=0,weight=0,count=0;
    grades.forEach(g=>{
      const a=assignments.find(x=>x.id===g.assignmentId);
      const earned=Number(g.earned),possible=Number(g.possible)||Number(a?.possible);
      if(!Number.isFinite(earned)||!Number.isFinite(possible)||possible<=0)return;
      const w=Number(a?.weight)>0?Number(a.weight):1;
      weighted+=(earned/possible*100)*w;weight+=w;count++;
    });
    if(!count)return{student,status:"Skipped",percent:null};
    const percent=weighted/weight;
    return{student,status:percent>=threshold?"Passed":"Failed",percent};
  });
}
function filteredQualitativeSummary(){
  const f=uaFilter();
  const assessments=(hub.qualitativeAssessments||[]).filter(a=>
    (!f.term||a.term===f.term)&&uaCourseMatches(a.courseCode,f.course)&&
    (!f.assessment||f.assessment===`upload:${(hub.routedUploads||[]).find(u=>u.journalAssessmentId===a.id)?.id}`)
  );
  const ids=new Set(assessments.map(a=>a.id));
  let docs=(hub.qualitativeDocuments||[]).filter(d=>ids.has(d.assessmentId)&&!d.archived&&(!f.section||d.section===f.section));
  const docIds=new Set(docs.map(d=>d.id));
  const reviews=(hub.qualitativeReviews||[]).filter(r=>docIds.has(r.documentId));
  const themes={};
  const themeNames=["Technical Competency","Problem Solving","Communication","Teamwork","Leadership","Safety","Ethics","Professionalism","Project Management","Continuous Improvement"];
  themeNames.forEach(theme=>{
    const vals=reviews.map(r=>({strong:100,present:75,limited:40,"not-observed":0})[r.themes?.[theme]?.rating]).filter(v=>v!==undefined);
    themes[theme]=vals.length?Math.round(vals.reduce((a,b)=>a+b,0)/vals.length):null;
  });
  return{assessments,docs,reviews,themes};
}
function renderUnifiedOverview(){
  const f=uaFilter(),q=filteredQuantRows(),qual=filteredQualitativeSummary();
  const passed=q.filter(x=>x.status==="Passed").length,failed=q.filter(x=>x.status==="Failed").length,skipped=q.filter(x=>x.status==="Skipped").length;
  $("uaOverviewMetrics").innerHTML=[
    ["Course",f.course?.code||"All"],["SLO",f.sloId?(hub.slos||[]).find(s=>s.id===f.sloId)?.code||"Selected":"All"],
    ["Passed",passed],["Failed",failed],["Skipped",skipped],["Qualitative Documents",qual.docs.length]
  ].map(([l,v])=>`<div class="metric"><strong>${esc(v)}</strong><span>${l}</span></div>`).join("");
  const statusItems=[
    ["Quantitative Data",q.length?`${passed+failed} assessed`:"No data"],
    ["Qualitative Data",qual.docs.length?`${qual.docs.length} documents`:"No data"],
    ["Faculty Approval",(activeUploads().some(u=>u.resultApproved))?"Some approved":"Not approved"],
    ["Evidence Status",(q.length||qual.docs.length)?"Evidence present":"No evidence"]
  ];
  $("uaCourseStatus").innerHTML='<div class="status-list">'+statusItems.map(([l,v])=>`<div class="status-card"><strong>${l}</strong><span>${v}</span></div>`).join("")+'</div>';

  const sloRows=(hub.slos||[]).map(s=>{
    const assignments=(hub.assignments||[]).filter(a=>a.sloId===s.id&&(!f.course||!a.courseId||a.courseId===f.course.id));
    const ids=new Set(assignments.map(a=>a.id));
    const grades=(hub.grades||[]).filter(g=>ids.has(g.assignmentId));
    return{label:s.code||s.description||"SLO",count:grades.length};
  });
  destroyUaChart("coverage");
  uaCharts.coverage=new Chart($("uaCoverageChart"),{type:"bar",data:{labels:sloRows.map(x=>x.label),datasets:[{label:"Grade records",data:sloRows.map(x=>x.count)}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,ticks:{precision:0}}}}});
}
function renderUnifiedQuantitative(){
  const rows=filteredQuantRows(),passed=rows.filter(x=>x.status==="Passed"),failed=rows.filter(x=>x.status==="Failed"),skipped=rows.filter(x=>x.status==="Skipped");
  const assessed=passed.length+failed.length,rate=assessed?passed.length/assessed*100:0;
  $("uaQuantMetrics").innerHTML=[["Met Threshold",passed.length],["Below Threshold",failed.length],["Skipped",skipped.length],["Success Rate",rate.toFixed(1)+"%"]].map(([l,v])=>`<div class="metric"><strong>${v}</strong><span>${l}</span></div>`).join("");
  destroyUaChart("status");
  uaCharts.status=new Chart($("uaStatusChart"),{type:"bar",data:{labels:["Met Threshold","Below Threshold","Skipped"],datasets:[{label:"Students",data:[passed.length,failed.length,skipped.length]}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,ticks:{precision:0}}}}});
  const f=uaFilter();
  const sloRows=(hub.slos||[]).map(s=>{
    const prev=$("uaSlo").value;$("uaSlo").value=s.id;
    const rs=filteredQuantRows();$("uaSlo").value=prev;
    const p=rs.filter(x=>x.status==="Passed").length,fa=rs.filter(x=>x.status==="Failed").length;
    return{label:s.code||s.description||"SLO",rate:p+fa?p/(p+fa)*100:0};
  });
  destroyUaChart("slo");
  uaCharts.slo=new Chart($("uaSloChart"),{type:"bar",data:{labels:sloRows.map(x=>x.label),datasets:[{label:"Success rate (%)",data:sloRows.map(x=>Number(x.rate.toFixed(1)))}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,max:100}}}});
  $("uaStudentTable").innerHTML=`<div class="table-wrap"><table class="table"><tr><th>Student</th><th>Status</th><th>Percentage</th></tr>${rows.map(r=>`<tr><td>${esc(r.student?.name||r.student?.sid||"Unnamed")}</td><td>${r.status}</td><td>${r.percent===null?"—":r.percent.toFixed(1)+"%"}</td></tr>`).join("")}</table></div>`;
}
function renderUnifiedQualitative(){
  const s=filteredQualitativeSummary(),scored=Object.entries(s.themes).filter(([,v])=>v!==null).sort((a,b)=>b[1]-a[1]);
  const strengths=scored.filter(([,v])=>v>=75),attention=scored.filter(([,v])=>v<60);
  $("uaQualMetrics").innerHTML=[["Assessments",s.assessments.length],["Documents",s.docs.length],["Reviews",s.reviews.length],["Strong Themes",strengths.length],["Attention Areas",attention.length]].map(([l,v])=>`<div class="metric"><strong>${v}</strong><span>${l}</span></div>`).join("");
  destroyUaChart("theme");
  uaCharts.theme=new Chart($("uaThemeChart"),{type:"bar",data:{labels:scored.map(x=>x[0]),datasets:[{label:"Evidence strength (%)",data:scored.map(x=>x[1])}]},options:{indexAxis:"y",responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{beginAtZero:true,max:100}}}});
  $("uaStrengths").innerHTML=strengths.length?strengths.map(([k,v])=>`<div class="theme-row"><span>${esc(k)}</span><strong>${v}%</strong></div>`).join(""):'<div class="notice">None identified.</div>';
  $("uaAttention").innerHTML=attention.length?attention.map(([k,v])=>`<div class="theme-row"><span>${esc(k)}</span><strong>${v}%</strong></div>`).join(""):'<div class="notice success">No low-evidence themes.</div>';
  const key=`unified:${$("uaTerm").value}|${$("uaCourse").value}|${$("uaSection").value}|${$("uaSlo").value}|${$("uaAssessment").value}`;
  const saved=(hub.qualitativeNarratives||[]).find(n=>n.assessmentKey===key);
  const course=selectedUaCourse()?.code||"the selected course";
  const narrative=`Qualitative evidence for ${course} included ${s.docs.length} document(s) across ${new Set(s.docs.map(d=>d.section)).size||1} section(s). ${strengths.length?`The strongest recurring themes were ${strengths.map(x=>x[0]).join(", ")}.`:""} ${attention.length?`Evidence was less consistently observed in ${attention.map(x=>x[0]).join(", ")}.`:""} Faculty should verify the findings and approve the final narrative before reporting.`;
  $("uaQualNarrative").value=saved?.text||narrative;
}
function renderUnifiedHistory(){
  const f=uaFilter(),course=f.course,sloId=f.sloId;
  const terms=uaTerms().slice().reverse();
  const oldTerm=$("uaTerm").value,oldCourse=$("uaCourse").value,oldSlo=$("uaSlo").value;
  const data=terms.map(term=>{
    $("uaTerm").value=term;if(course)$("uaCourse").value=course.id;if(sloId)$("uaSlo").value=sloId;
    const rows=filteredQuantRows(),p=rows.filter(x=>x.status==="Passed").length,fa=rows.filter(x=>x.status==="Failed").length;
    return{term,rate:p+fa?p/(p+fa)*100:0};
  });
  $("uaTerm").value=oldTerm;$("uaCourse").value=oldCourse;$("uaSlo").value=oldSlo;
  destroyUaChart("history");
  uaCharts.history=new Chart($("uaHistoryChart"),{type:"line",data:{labels:data.map(x=>x.term),datasets:[{label:"Success rate (%)",data:data.map(x=>Number(x.rate.toFixed(1)))}]},options:{responsive:true,maintainAspectRatio:false,scales:{y:{beginAtZero:true,max:100}}}});
}
function renderUnifiedAnalytics(){
  updateUaDependentFilters();
  renderUnifiedOverview();renderUnifiedQuantitative();renderUnifiedQualitative();renderUnifiedHistory();
}
async function saveUnifiedQualNarrative(approved=false){
  hub.qualitativeNarratives ||= [];
  const key=`unified:${$("uaTerm").value}|${$("uaCourse").value}|${$("uaSection").value}|${$("uaSlo").value}|${$("uaAssessment").value}`;
  let row=hub.qualitativeNarratives.find(n=>n.assessmentKey===key);
  if(!row){row={id:id("unifiedNarrative"),assessmentKey:key,createdAt:now()};hub.qualitativeNarratives.push(row)}
  row.text=$("uaQualNarrative").value;row.updatedAt=now();row.updatedBy=currentUser.email;
  if(approved){row.approved=true;row.approvedAt=now();row.approvedBy=currentUser.email}
  await saveHub();alert(approved?"Qualitative narrative approved.":"Narrative saved.");
}


function assignmentMatchesGraphFilter(a,filter){
  if(filter.term&&String(a.term||"").trim().toLowerCase()!==String(filter.term).trim().toLowerCase())return false;
  if(filter.sloId&&a.sloId!==filter.sloId)return false;
  if(filter.assessment){
    const [kind,value]=String(filter.assessment).split(":");
    if(kind==="assignment"&&a.id!==value)return false;
    if(kind==="upload"){
      const u=(hub.routedUploads||[]).find(x=>x.id===value);
      if(u&&String(a.name||a.title||"").trim().toLowerCase()!==String(u.assessmentName||"").trim().toLowerCase())return false;
    }
  }
  if(filter.course){
    const c=(hub.courses||[]).find(x=>x.id===a.courseId);
    const code=normalizeCourse(c?.code||a.courseCode||"");
    if(code&&code!==normalizeCourse(filter.course.code))return false;
    if(!code&&a.courseId&&a.courseId!==filter.course.id)return false;
  }
  if(filter.section){
    const c=(hub.courses||[]).find(x=>x.id===a.courseId);
    const section=String(a.section||c?.section||"");
    if(section&&section!==String(filter.section))return false;
  }
  return true;
}
function graphDataDeletionPreview(filter=uaFilter()){
  const assignments=(hub.assignments||[]).filter(a=>assignmentMatchesGraphFilter(a,filter));
  const assignmentIds=new Set(assignments.map(a=>a.id));
  const grades=(hub.grades||[]).filter(g=>assignmentIds.has(g.assignmentId));
  const studentIds=new Set(grades.map(g=>g.studentId));
  const students=(hub.students||[]).filter(s=>studentIds.has(s.id));
  return{filter,assignments,grades,students};
}
async function deleteDataBehindCurrentGraph(){
  const preview=graphDataDeletionPreview();
  if(!preview.assignments.length&&!preview.grades.length){
    alert("No quantitative assignment or grade records match the current graph filters.");
    return;
  }
  const f=preview.filter;
  const description=[
    f.term||"All terms",f.course?.code||"All courses",f.section||"All sections",
    f.sloId?(hub.slos||[]).find(s=>s.id===f.sloId)?.code||f.sloId:"All SLOs",
    f.assessment||"All assessments"
  ].join(" • ");
  const warning=`Permanently delete the data behind this graph?\n\n${description}\n\nAssignments: ${preview.assignments.length}\nGrade records: ${preview.grades.length}\nStudents referenced: ${preview.students.length}\n\nThis cannot be undone unless you restore a workspace backup.`;
  if(!confirm(warning))return;

  const assignmentIds=new Set(preview.assignments.map(a=>a.id));
  hub.assignments=(hub.assignments||[]).filter(a=>!assignmentIds.has(a.id));
  hub.grades=(hub.grades||[]).filter(g=>!assignmentIds.has(g.assignmentId));

  // Keep students that are still referenced by another remaining grade.
  const remainingStudentIds=new Set((hub.grades||[]).map(g=>g.studentId));
  hub.students=(hub.students||[]).filter(s=>remainingStudentIds.has(s.id)||!preview.students.some(x=>x.id===s.id));

  hub.analyticsDeletionLog ||= [];
  hub.analyticsDeletionLog.unshift({
    id:id("analyticsDelete"),deletedAt:now(),deletedBy:currentUser.email,
    term:f.term||"",courseCode:f.course?.code||"",section:f.section||"",
    sloId:f.sloId||"",assessment:f.assessment||"",
    assignmentsRemoved:preview.assignments.length,gradesRemoved:preview.grades.length
  });
  await saveHub();
  await resetAnalyticsGraphs({silent:true,purgeOrphans:true});
  populateUnifiedFilters();
  renderUnifiedAnalytics();
  alert(`Removed ${preview.assignments.length} assignment record(s) and ${preview.grades.length} grade record(s). The graphs now use only the remaining data.`);
}
window.deleteDataBehindCurrentGraph=deleteDataBehindCurrentGraph;

function tombstoneMatchesAssignment(t,a){
  if(t.term&&a.term&&String(t.term).toLowerCase()!==String(a.term).toLowerCase())return false;
  if(t.assessmentName&&String(a.name||a.title||"").trim().toLowerCase()===String(t.assessmentName).trim().toLowerCase())return true;
  if(t.assignmentId&&a.id===t.assignmentId)return true;
  if((t.assignmentIds||[]).includes(a.id))return true;
  const c=(hub.courses||[]).find(x=>x.id===a.courseId);
  const courseMatch=t.courseCode&&normalizeCourse(c?.code||a.courseCode||"")===normalizeCourse(t.courseCode);
  const sectionMatch=!t.section||!String(a.section||c?.section||"")||String(a.section||c?.section||"")===String(t.section);
  return Boolean(courseMatch&&sectionMatch&&t.type==="gradebook");
}
async function cleanupDeletedUploadAnalytics(){
  const tombstones=hub.deletedUploadTombstones||[];
  if(!tombstones.length){
    alert("No deletion markers exist for earlier uploads. Use Delete Data Behind This Graph after selecting the old graph's term, course, SLO, and assessment.");
    return;
  }
  const assignments=(hub.assignments||[]).filter(a=>tombstones.some(t=>tombstoneMatchesAssignment(t,a)));
  const ids=new Set(assignments.map(a=>a.id));
  const gradeCount=(hub.grades||[]).filter(g=>ids.has(g.assignmentId)).length;
  if(!ids.size){
    alert("No analytics records matched the saved deletion markers.");
    return;
  }
  if(!confirm(`Remove analytics linked to deleted uploads?\n\nAssignments: ${ids.size}\nGrade records: ${gradeCount}`))return;
  hub.assignments=(hub.assignments||[]).filter(a=>!ids.has(a.id));
  hub.grades=(hub.grades||[]).filter(g=>!ids.has(g.assignmentId));
  await saveHub();
  await resetAnalyticsGraphs({silent:true,purgeOrphans:true});
  alert(`Removed ${ids.size} assignment record(s) and ${gradeCount} grade record(s) linked to deleted uploads.`);
}
window.cleanupDeletedUploadAnalytics=cleanupDeletedUploadAnalytics;


function qualitativeAssessmentMatchesFilter(a,filter){
  if(filter.term&&String(a.term||"").trim().toLowerCase()!==String(filter.term).trim().toLowerCase())return false;
  if(filter.course&&normalizeCourse(a.courseCode||"")!==normalizeCourse(filter.course.code||""))return false;
  if(filter.sloId){
    const mapped=String(a.sloId||a.slo||a.studentOutcome||"");
    if(mapped&&mapped!==filter.sloId&&mapped!==String((hub.slos||[]).find(s=>s.id===filter.sloId)?.code||""))return false;
  }
  if(filter.assessment){
    const [kind,value]=String(filter.assessment).split(":");
    if(kind==="upload"){
      const u=(hub.routedUploads||[]).find(x=>x.id===value);
      if(u){
        if(u.journalAssessmentId&&a.id!==u.journalAssessmentId)return false;
        if(!u.journalAssessmentId&&String(a.assessmentName||"").trim().toLowerCase()!==String(u.assessmentName||"").trim().toLowerCase())return false;
      }
    }else if(kind==="qualitative"&&a.id!==value)return false;
    else if(kind==="assignment")return false;
  }
  return true;
}
function qualitativeDeletionPreview(filter=uaFilter()){
  const assessments=(hub.qualitativeAssessments||[]).filter(a=>qualitativeAssessmentMatchesFilter(a,filter));
  const assessmentIds=new Set(assessments.map(a=>a.id));
  const documents=(hub.qualitativeDocuments||[]).filter(d=>
    assessmentIds.has(d.assessmentId)&&(!filter.section||!d.section||String(d.section)===String(filter.section))
  );
  const documentIds=new Set(documents.map(d=>d.id));
  const reviews=(hub.qualitativeReviews||[]).filter(r=>
    assessmentIds.has(r.assessmentId)||documentIds.has(r.documentId)
  );
  const narratives=(hub.qualitativeNarratives||[]).filter(n=>
    assessmentIds.has(n.assessmentId)||
    assessments.some(a=>n.assessmentKey===`qa:${a.id}`)||
    (String(n.assessmentKey||"").startsWith("unified:")&&
      (!filter.term||String(n.assessmentKey).includes(filter.term))&&
      (!filter.course||String(n.assessmentKey).includes(filter.course.id)))
  );
  const uploads=(hub.routedUploads||[]).filter(u=>
    !u.archived&&(
      assessmentIds.has(u.journalAssessmentId)||
      assessmentIds.has(u.qualitativeAssessmentId)||
      assessmentIds.has(u.assessmentId)
    )
  );
  return{filter,assessments,documents,reviews,narratives,uploads};
}
async function deleteQualitativeDataBehindCurrentGraph(){
  const preview=qualitativeDeletionPreview();
  if(!preview.assessments.length&&!preview.documents.length&&!preview.reviews.length){
    alert("No qualitative assessment records match the current filters. Select the term, course, section, and journal or employer-evaluation assessment first.");
    return;
  }
  const f=preview.filter;
  const description=[
    f.term||"All terms",f.course?.code||"All courses",f.section||"All sections",
    f.sloId?(hub.slos||[]).find(s=>s.id===f.sloId)?.code||f.sloId:"All SLOs",
    f.assessment||"All qualitative assessments"
  ].join(" • ");
  const warning=`Permanently delete the qualitative data behind this graph?

${description}

Assessments: ${preview.assessments.length}
Documents: ${preview.documents.length}
Reviews: ${preview.reviews.length}
Narratives: ${preview.narratives.length}
Linked upload records: ${preview.uploads.length}

This cannot be undone unless you restore a workspace backup.`;
  if(!confirm(warning))return;

  const assessmentIds=new Set(preview.assessments.map(a=>a.id));
  const documentIds=new Set(preview.documents.map(d=>d.id));
  const narrativeIds=new Set(preview.narratives.map(n=>n.id));
  const uploadIds=new Set(preview.uploads.map(u=>u.id));

  hub.qualitativeAssessments=(hub.qualitativeAssessments||[]).filter(a=>!assessmentIds.has(a.id));
  hub.qualitativeDocuments=(hub.qualitativeDocuments||[]).filter(d=>!documentIds.has(d.id)&&!assessmentIds.has(d.assessmentId));
  hub.qualitativeReviews=(hub.qualitativeReviews||[]).filter(r=>!assessmentIds.has(r.assessmentId)&&!documentIds.has(r.documentId));
  hub.qualitativeNarratives=(hub.qualitativeNarratives||[]).filter(n=>
    !narrativeIds.has(n.id)&&
    !assessmentIds.has(n.assessmentId)&&
    !assessmentIds.has(String(n.assessmentKey||"").replace(/^qa:/,""))
  );
  hub.routedUploads=(hub.routedUploads||[]).filter(u=>!uploadIds.has(u.id));

  hub.analyticsDeletionLog ||= [];
  hub.analyticsDeletionLog.unshift({
    id:id("qualAnalyticsDelete"),type:"qualitative",deletedAt:now(),deletedBy:currentUser.email,
    term:f.term||"",courseCode:f.course?.code||"",section:f.section||"",
    sloId:f.sloId||"",assessment:f.assessment||"",
    assessmentsRemoved:preview.assessments.length,documentsRemoved:preview.documents.length,
    reviewsRemoved:preview.reviews.length,narrativesRemoved:preview.narratives.length
  });

  await saveHub();
  await resetAnalyticsGraphs({silent:true,purgeOrphans:true});
  populateUnifiedFilters();
  renderUnifiedAnalytics();
  alert(`Removed ${preview.assessments.length} qualitative assessment(s), ${preview.documents.length} document record(s), ${preview.reviews.length} review record(s), and ${preview.narratives.length} narrative(s).`);
}
window.deleteQualitativeDataBehindCurrentGraph=deleteQualitativeDataBehindCurrentGraph;

function purgeOrphanAnalyticsRecords(){
  const assignmentIds=new Set((hub.assignments||[]).map(a=>a.id));
  const studentIds=new Set((hub.students||[]).map(s=>s.id));
  const qualAssessmentIds=new Set((hub.qualitativeAssessments||[]).map(a=>a.id));
  const qualDocumentIds=new Set((hub.qualitativeDocuments||[]).map(d=>d.id));

  const before={
    grades:(hub.grades||[]).length,
    reviews:(hub.qualitativeReviews||[]).length,
    documents:(hub.qualitativeDocuments||[]).length,
    narratives:(hub.qualitativeNarratives||[]).length
  };

  hub.grades=(hub.grades||[]).filter(g=>assignmentIds.has(g.assignmentId)&&studentIds.has(g.studentId));
  hub.qualitativeDocuments=(hub.qualitativeDocuments||[]).filter(d=>qualAssessmentIds.has(d.assessmentId));
  const validDocIds=new Set(hub.qualitativeDocuments.map(d=>d.id));
  hub.qualitativeReviews=(hub.qualitativeReviews||[]).filter(r=>
    (r.assessmentId&&qualAssessmentIds.has(r.assessmentId)) ||
    (r.documentId&&validDocIds.has(r.documentId))
  );
  hub.qualitativeNarratives=(hub.qualitativeNarratives||[]).filter(n=>
    !n.assessmentId || qualAssessmentIds.has(n.assessmentId) || String(n.assessmentKey||"").startsWith("unified:")
  );

  const after={
    grades:hub.grades.length,
    reviews:hub.qualitativeReviews.length,
    documents:hub.qualitativeDocuments.length,
    narratives:hub.qualitativeNarratives.length
  };
  return Object.keys(before).reduce((sum,k)=>sum+(before[k]-after[k]),0);
}

async function resetAnalyticsGraphs(options={}){
  const {silent=false,purgeOrphans=false}=options;
  let removed=0;
  if(purgeOrphans)removed=purgeOrphanAnalyticsRecords();

  // Destroy every known Chart.js instance.
  if(typeof uaCharts==="object"&&uaCharts){
    Object.keys(uaCharts).forEach(name=>{
      try{if(uaCharts[name])uaCharts[name].destroy()}catch{}
      uaCharts[name]=null;
    });
  }
  try{if(typeof statusChartInstance!=="undefined"&&statusChartInstance){statusChartInstance.destroy();statusChartInstance=null}}catch{}
  try{if(typeof sloChartInstance!=="undefined"&&sloChartInstance){sloChartInstance.destroy();sloChartInstance=null}}catch{}
  try{if(typeof qualitativeThemeChart!=="undefined"&&qualitativeThemeChart){qualitativeThemeChart.destroy();qualitativeThemeChart=null}}catch{}

  if(purgeOrphans)await saveHub();

  if(page()==="assessment-analytics.html"&&$("uaCourse")){
    populateUnifiedFilters();
    renderUnifiedAnalytics();
  }
  if(page()==="dashboard.html"){
    renderDashboard();
    if(typeof renderDashboardGuidance==="function")renderDashboardGuidance();
  }

  localStorage.setItem("etdeAnalyticsLastReset",new Date().toISOString());
  if(!silent)alert(`Graphs were reset and recalculated from the records that still exist.${removed?` ${removed} orphaned analytics record(s) were removed.`:""}`);
}
window.resetAnalyticsGraphs=resetAnalyticsGraphs;

function initUnifiedAnalytics(){
  if(page()!=="assessment-analytics.html")return;
  populateUnifiedFilters();
  ["uaTerm","uaCourse","uaSection","uaSlo","uaAssessment"].forEach(idn=>$(idn).addEventListener("change",renderUnifiedAnalytics));
  $("uaRefresh").addEventListener("click",renderUnifiedAnalytics);
  $("uaResetFilters").addEventListener("click",()=>{["uaTerm","uaCourse","uaSection","uaSlo","uaAssessment"].forEach(idn=>$(idn).value="");renderUnifiedAnalytics()});
  $("uaResetGraphs")?.addEventListener("click",()=>resetAnalyticsGraphs({purgeOrphans:true}));
  $("uaDeleteGraphData")?.addEventListener("click",deleteDataBehindCurrentGraph);
  $("uaDeleteQualGraphData")?.addEventListener("click",deleteQualitativeDataBehindCurrentGraph);
  document.querySelectorAll(".analytics-tab").forEach(btn=>btn.addEventListener("click",()=>{
    document.querySelectorAll(".analytics-tab").forEach(b=>b.classList.remove("active"));btn.classList.add("active");
    document.querySelectorAll(".analytics-panel").forEach(p=>p.classList.add("hidden"));$(`tab_${btn.dataset.tab}`).classList.remove("hidden");
  }));
  $("uaSaveQualNarrative").addEventListener("click",()=>saveUnifiedQualNarrative(false));
  $("uaApproveQualNarrative").addEventListener("click",()=>saveUnifiedQualNarrative(true));
  renderUnifiedAnalytics();
}

// Main application bootstrap. This must run before page-specific delayed initializers.
document.addEventListener("DOMContentLoaded",()=>{
  init().catch(error=>{
    console.error("Hub startup failed",error);
    const box=$("loginError");
    if(box){box.textContent="The Hub could not start: "+error.message;box.style.display="block"}
  });
});

onHubReady(initUnifiedAnalytics);

// Recalculate all analytics automatically after any save/delete/archive action.
const originalSaveHubForAnalytics=saveHub;
saveHub=async function(){
  await originalSaveHubForAnalytics();
  if(page()==="assessment-analytics.html"&&$("uaCourse"))renderUnifiedAnalytics();
};

// Version 5.1 — Guided Gradebook — Syllabus, teaching-history, and semester engine
const DEFAULT_TERM_DATES=[
 {name:"Spring 2026",start:"2026-01-05",end:"2026-04-23"},
 {name:"Summer 2026",start:"2026-05-04",end:"2026-08-14"},
 {name:"Fall 2026",start:"2026-08-31",end:"2026-12-10"},
 {name:"Spring 2027",start:"2027-01-04",end:"2027-04-22"},
 {name:"Summer 2027",start:"2027-05-03",end:"2027-08-13"},
 {name:"Fall 2027",start:"2027-08-30",end:"2027-12-09"}
];
function ensureSyllabusEngine(){
 hub.syllabusLibrary ||= JSON.parse(JSON.stringify(window.ETDE_SYLLABUS_SEED||[]));
 hub.teachingHistory ||= [];
 hub.termDates ||= JSON.parse(JSON.stringify(DEFAULT_TERM_DATES));
 hub.currentAssignments ||= [];
}
function currentTermRecord(date=new Date()){
 ensureSyllabusEngine();
 const iso=date.toISOString().slice(0,10);
 return hub.termDates.find(t=>iso>=t.start&&iso<=t.end)||null;
}
function derivedTerm(date=new Date()){
 const found=currentTermRecord(date);if(found)return found.name;
 const m=date.getMonth(),y=date.getFullYear();
 return m<=3?`Spring ${y}`:m<=7?`Summer ${y}`:`Fall ${y}`;
}
function currentTermName(){return derivedTerm(new Date())}
function syllabusCourse(code){return CUR.courses.find(c=>c[0]===code)}
function mergeTeachingFromUploads(){
 ensureSyllabusEngine();
 (hub.routedUploads||[]).forEach(u=>{
   if(!u.uploaderEmail||!u.courseCode||!u.term)return;
   const key=[u.uploaderEmail.toLowerCase(),normalizeCourse(u.courseCode),u.section||"",u.term].join("|");
   if(!hub.teachingHistory.some(x=>x.key===key))hub.teachingHistory.push({id:id("teach"),key,instructor:u.uploaderEmail,courseCode:normalizeCourse(u.courseCode)||u.courseCode,courseName:u.courseName||"",section:u.section||"",term:u.term,source:"Hub upload",createdAt:u.uploadedAt||now()});
 });
 hub.currentAssignments.forEach(a=>{
   const key=[a.instructor.toLowerCase(),a.courseCode,a.section||"",a.term].join("|");
   if(!hub.teachingHistory.some(x=>x.key===key))hub.teachingHistory.push({...a,key,source:"Semester assignment"});
 });
}
// v5.2: this helper was called but never defined, which crashed Dashboard and Syllabus & Semester once courses were assigned.
function currentCycleYearNumber(){return cycleInfo().year}
function requirementsForAssignment(a){
 const cycle=currentCycleYearNumber();
 const scheduled=[];
 Object.entries(hub.curriculum?.schedule||{}).forEach(([so,years])=>{if((years[cycle]||[]).includes(a.courseCode))scheduled.push(so)});
 const req=[];
 if(scheduled.length)req.push({label:`Quantitative evidence for ${scheduled.join(", ")}`,type:"quantitative"});
 if(a.courseCode==="ETDE 4813")req.push({label:"Capstone journal qualitative assessment",type:"journals"});
 if(a.courseCode==="ETDE 4112")req.push({label:"Employer evaluation and final reflection",type:"employer"});
 if(scheduled.length||["ETDE 4813","ETDE 4112"].includes(a.courseCode))req.push({label:"Faculty review and approved narrative",type:"review"});
 return req;
}
function requirementDone(a,r){
 const uploads=(hub.routedUploads||[]).filter(u=>!u.archived&&u.term===a.term&&normalizeCourse(u.courseCode)===a.courseCode&&(!a.section||!u.section||String(u.section).includes(a.section)));
 if(r.type==="quantitative")return uploads.some(u=>u.type==="gradebook"); // v5.2: was true whenever ANY grade existed anywhere
 if(r.type==="journals")return uploads.some(u=>u.type==="journals");
 if(r.type==="employer")return uploads.some(u=>u.type==="microsoft-forms"||u.type==="reflection");
 if(r.type==="review")return uploads.some(u=>u.resultApproved);
 return false;
}
function renderSyllabusLibrary(){
 const host=$("seSyllabusList");if(!host)return;
 const q=($("seSyllabusSearch").value||"").toLowerCase(),status=$("seSyllabusStatus").value;
 const rows=hub.syllabusLibrary.filter(s=>(!status||s.status===status)&&JSON.stringify(s).toLowerCase().includes(q));
 host.innerHTML=rows.map(s=>`<div class="syllabus-card"><strong>${esc(s.courseCode)} — ${esc(s.courseName)}</strong><div class="syllabus-meta"><span class="badge ${s.status==="uploaded"?"good":s.status==="source-available"?"warn":""}">${s.status==="uploaded"?"Uploaded to Hub":s.status==="source-available"?"Source Located":"Course Sheet Only"}</span><span class="badge">${esc(s.term)}</span>${s.instructor?`<span class="badge">${esc(s.instructor)}</span>`:""}</div><p><strong>Source:</strong> ${esc(s.sourceTitle)}</p><p><strong>Grading:</strong> ${esc(s.grading)}</p><p><strong>Schedule:</strong> ${esc(s.schedule)}</p><p class="muted">${esc(s.notes)}</p></div>`).join("")||'<div class="notice">No matching syllabus records.</div>';
}
function populateSyllabusControls(){
 const options=CUR.courses.map(c=>`<option value="${c[0]}">${c[0]} — ${c[1]}</option>`).join("");
 if($("seUploadCourse"))$("seUploadCourse").innerHTML=options;
 if($("seAssignCourse"))$("seAssignCourse").innerHTML=options;
}
async function extractSyllabusFile(file){
 if(/\.txt$/i.test(file.name))return file.text();
 if(/\.docx$/i.test(file.name)&&window.mammoth){const r=await mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()});return r.value}
 if(/\.pdf$/i.test(file.name)&&window.pdfjsLib){
   pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
   const pdf=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise,pages=[];
   for(let i=1;i<=pdf.numPages;i++){const p=await pdf.getPage(i),c=await p.getTextContent();pages.push(c.items.map(x=>x.str).join(" "))}
   return pages.join("\n");
 }
 return"";
}
function inferSyllabusFields(text){
 const grading=(text.match(/grading.{0,500}/is)||[""])[0].replace(/\s+/g," ").slice(0,500);
 const objectives=(text.match(/(?:course|educational|student learning) objectives?.{0,1200}/is)||[""])[0].replace(/\s+/g," ").slice(0,1200);
 return{grading:grading||"Imported; review source text",objectives};
}
async function importSyllabus(){
 const file=$("seUploadFile").files[0];if(!file)return alert("Choose a syllabus file.");
 $("seImportStatus").innerHTML='<div class="notice">Reading syllabus…</div>';
 const text=await extractSyllabusFile(file),code=$("seUploadCourse").value,c=syllabusCourse(code),fields=inferSyllabusFields(text);
 let row=hub.syllabusLibrary.find(s=>s.courseCode===code&&s.term===$("seUploadTerm").value);
 if(!row){row={id:id("syllabus"),courseCode:code,courseName:c?.[1]||"",term:$("seUploadTerm").value};hub.syllabusLibrary.push(row)}
 Object.assign(row,{instructor:$("seUploadInstructor").value,status:"uploaded",sourceTitle:file.name,sourceType:"Uploaded syllabus",grading:fields.grading,schedule:"See uploaded syllabus",requiredEvidence:row.requiredEvidence||[],notes:"Syllabus text imported into Hub metadata.",textExcerpt:text.slice(0,5000),updatedAt:now(),updatedBy:currentUser.email});
 await saveHub();renderSyllabusLibrary();$("seImportStatus").innerHTML='<div class="notice success">Syllabus imported.</div>';
}
function renderTeachingHistory(){
 const host=$("seTeachingHistory");if(!host)return;
 mergeTeachingFromUploads();
 const inst=$("seInstructorFilter").value,term=$("seTeachingTerm").value;
 const rows=hub.teachingHistory.filter(x=>(!inst||x.instructor===inst)&&(!term||x.term===term)).sort((a,b)=>String(b.term).localeCompare(String(a.term)));
 host.innerHTML=rows.map(x=>`<div class="syllabus-card"><strong>${esc(x.term)} — ${esc(x.courseCode)} ${esc(x.courseName||"")}</strong><p>${esc(x.instructor)}${x.section?` • Section ${esc(x.section)}`:""}</p><span class="badge">${esc(x.source||"Recorded")}</span></div>`).join("")||'<div class="notice">No teaching history found.</div>';
}
function populateTeachingFilters(){
 mergeTeachingFromUploads();
 const inst=[...new Set(hub.teachingHistory.map(x=>x.instructor).filter(Boolean))],terms=[...new Set(hub.teachingHistory.map(x=>x.term).filter(Boolean))].sort().reverse();
 $("seInstructorFilter").innerHTML='<option value="">All Instructors</option>'+inst.map(x=>`<option>${esc(x)}</option>`).join("");
 $("seTeachingTerm").innerHTML='<option value="">All Terms</option>'+terms.map(x=>`<option>${esc(x)}</option>`).join("");
}
function currentAssignments(){
 const term=currentTermName();
 return hub.currentAssignments.filter(a=>a.term===term);
}
function renderRequirementBoard(){
 const host=$("seRequirementBoard");if(!host)return;
 const rows=currentAssignments();
 host.innerHTML=rows.length?rows.map(a=>{const req=requirementsForAssignment(a);return`<div class="requirement-course"><strong>${esc(a.courseCode)} — ${esc(a.courseName||syllabusCourse(a.courseCode)?.[1]||"")} • ${esc(a.instructor)}</strong>${a.section?`<p>Section ${esc(a.section)}</p>`:""}${req.length?req.map(r=>`<div class="requirement-item"><span>${esc(r.label)}</span><span class="badge ${requirementDone(a,r)?"good":"warn"}">${requirementDone(a,r)?"Complete":"Required"}</span></div>`).join(""):'<div class="notice success">No ABET evidence scheduled for this course this term.</div>'}</div>`}).join(""):'<div class="notice">No current-term course assignments have been entered yet.</div>';
}
async function addTeachingAssignment(){
 const code=$("seAssignCourse").value,c=syllabusCourse(code),row={id:id("assignment"),instructor:$("seAssignInstructor").value.trim(),courseCode:code,courseName:c?.[1]||"",section:$("seAssignSection").value.trim(),term:$("seAssignTerm").value.trim()||currentTermName(),createdAt:now(),createdBy:currentUser.email};
 if(!row.instructor)return alert("Enter the instructor.");
 hub.currentAssignments.push(row);mergeTeachingFromUploads();await saveHub();renderAssignmentManager();renderRequirementBoard();populateTeachingFilters();
}
function renderAssignmentManager(){
 const host=$("seAssignmentManager");if(!host)return;
 host.innerHTML=hub.currentAssignments.map(a=>`<div class="admin-row"><strong>${esc(a.term)} — ${esc(a.courseCode)} — ${esc(a.instructor)}</strong><br>${esc(a.section||"No section")}<div class="actions"><button class="btn danger" data-delete-assignment="${esc(a.id)}">Delete</button></div></div>`).join("")||'<div class="notice">No assignments entered.</div>';
 document.querySelectorAll("[data-delete-assignment]").forEach(b=>b.onclick=async()=>{hub.currentAssignments=hub.currentAssignments.filter(a=>a.id!==b.dataset.deleteAssignment);await saveHub();renderAssignmentManager();renderRequirementBoard()});
}
function renderTermManager(){
 const host=$("seTermManager");if(!host)return;
 host.innerHTML=hub.termDates.map(t=>`<div class="admin-row"><strong>${esc(t.name)}</strong><br>${esc(t.start)} through ${esc(t.end)}</div>`).join("");
}
function renderCurrentTermHeader(){
 const term=currentTermName(),record=currentTermRecord();
 $("seCurrentTerm").textContent=term;$("seCurrentDate").textContent=new Date().toLocaleString();
 const assigns=currentAssignments(),required=assigns.reduce((n,a)=>n+requirementsForAssignment(a).filter(r=>!requirementDone(a,r)).length,0);
 $("seCurrentRequirements").innerHTML=`<span class="badge">${assigns.length} assigned course(s)</span> <span class="badge ${required?"warn":"good"}">${required} requirement(s) remaining</span>${record?`<p>Official term range configured: ${esc(record.start)} through ${esc(record.end)}</p>`:"<p class='warning'>This date is outside the configured term ranges; the term was inferred from the month.</p>"}`;
}
function renderDashboardSemester(){
 if(page()!=="dashboard.html"||!$("dashCurrentTerm"))return;
 ensureSyllabusEngine();mergeTeachingFromUploads();
 const term=currentTermName(),assigns=currentAssignments(),remaining=assigns.reduce((n,a)=>n+requirementsForAssignment(a).filter(r=>!requirementDone(a,r)).length,0);
 $("dashCurrentTerm").innerHTML=`<strong>${esc(term)}</strong><p>${new Date().toLocaleDateString()}</p>`;
 $("dashSemesterNeeds").innerHTML=`<p>${assigns.length} assigned course(s); ${remaining} assessment requirement(s) remaining.</p>`;
}
function initSyllabusEngine(){
 if(page()!=="syllabus-engine.html")return;
 ensureSyllabusEngine();mergeTeachingFromUploads();populateSyllabusControls();renderCurrentTermHeader();renderSyllabusLibrary();populateTeachingFilters();renderTeachingHistory();renderRequirementBoard();renderAssignmentManager();renderTermManager();
 $("seSyllabusSearch").oninput=renderSyllabusLibrary;$("seSyllabusStatus").onchange=renderSyllabusLibrary;$("seImportSyllabus").onclick=importSyllabus;$("seInstructorFilter").onchange=renderTeachingHistory;$("seTeachingTerm").onchange=renderTeachingHistory;$("seAddAssignment").onclick=addTeachingAssignment;
 $("seAssignTerm").value=currentTermName();
 document.querySelectorAll("[data-se-tab]").forEach(b=>b.onclick=()=>{document.querySelectorAll("[data-se-tab]").forEach(x=>x.classList.remove("active"));b.classList.add("active");document.querySelectorAll(".se-panel").forEach(x=>x.classList.add("hidden"));$(`se_${b.dataset.seTab}`).classList.remove("hidden")});
}
onHubReady(()=>{initSyllabusEngine();renderDashboardSemester()});


// Version 2.1 - Semester closeout and self-study insertion exports
function csvEscape(value){
  const s=String(value??"");
  return /[",\n\r]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;
}
function toCsv(rows, columns){
  const headers=columns.map(c=>c.label);
  return [headers.join(","),...rows.map(row=>columns.map(c=>csvEscape(typeof c.value==="function"?c.value(row):row[c.value])).join(","))].join("\r\n");
}
function termMatches(record,term){
  if(!term)return true;
  return String(record?.term||record?.semester||record?.academicTerm||"").trim().toLowerCase()===String(term).trim().toLowerCase();
}
function termUploads(term){return (hub.routedUploads||[]).filter(u=>!u.archived&&termMatches(u,term))}
function termAssignments(term){
  const direct=(hub.assignments||[]).filter(a=>termMatches(a,term));
  if(direct.length)return direct;
  const uploadAssessmentNames=new Set(termUploads(term).map(u=>u.assessmentName).filter(Boolean));
  return (hub.assignments||[]).filter(a=>uploadAssessmentNames.has(a.name||a.title));
}
function termAssignmentIds(term){return new Set(termAssignments(term).map(a=>a.id))}
function termGrades(term){
  const ids=termAssignmentIds(term);
  if(ids.size)return (hub.grades||[]).filter(g=>ids.has(g.assignmentId));
  return (hub.grades||[]).filter(g=>termMatches(g,term));
}
function termQualAssessments(term){return (hub.qualitativeAssessments||[]).filter(a=>termMatches(a,term))}
function termQualIds(term){return new Set(termQualAssessments(term).map(a=>a.id))}
function termQualDocuments(term){
  const ids=termQualIds(term);return (hub.qualitativeDocuments||[]).filter(d=>ids.has(d.assessmentId)&&!d.archived);
}
function termQualReviews(term){
  const ids=termQualIds(term),docIds=new Set(termQualDocuments(term).map(d=>d.id));
  return (hub.qualitativeReviews||[]).filter(r=>ids.has(r.assessmentId)||docIds.has(r.documentId));
}
function termMeetingNotes(term){
  const year=(String(term).match(/\b(20\d{2})\b/)||[])[1];
  return (hub.meetingNotes||[]).filter(n=>termMatches(n,term)||(year&&String(n.date||"").startsWith(year)));
}
function termTeaching(term){
  return [...(hub.currentAssignments||[]),...(hub.teachingHistory||[])].filter(a=>termMatches(a,term));
}
function termSyllabi(term){
  return (hub.syllabusLibrary||[]).filter(s=>termMatches(s,term));
}
function downloadBlob(name,blob){
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function sanitizeFilePart(s){return String(s||"Semester").replace(/[^\w.-]+/g,"_").replace(/^_+|_+$/g,"")}

function assignmentCourse(a){
  const c=(hub.courses||[]).find(x=>x.id===a.courseId);
  return {code:c?.code||a.courseCode||"",name:c?.name||a.courseName||""};
}
function sloRecord(idn){return (hub.slos||[]).find(s=>s.id===idn)}
function sloCode(idn){const s=sloRecord(idn);return s?.code||s?.name||idn||"Unmapped"}
function assignmentName(a){return a?.name||a?.title||"Assessment"}
function gradeStudent(g){return (hub.students||[]).find(s=>s.id===g.studentId)}
function assessmentStats(a,threshold){
  const grades=(hub.grades||[]).filter(g=>g.assignmentId===a.id);
  let met=0,below=0,skipped=0;
  const rows=grades.map(g=>{
    const possible=Number(g.possible)||Number(a.possible)||0,earned=Number(g.earned);
    const pct=Number.isFinite(earned)&&possible>0?earned/possible*100:null;
    const status=pct===null?"Skipped":pct>=threshold?"Met":"Below";
    if(status==="Met")met++;else if(status==="Below")below++;else skipped++;
    return {g,pct,status};
  });
  const assessed=met+below,rate=assessed?met/assessed*100:0;
  return {grades,rows,met,below,skipped,assessed,total:rows.length,rate};
}
function assignmentNarrative(a,term,threshold,target){
  const stats=assessmentStats(a,threshold),course=assignmentCourse(a);
  const result=`${stats.assessed} students were assessed${stats.skipped?`, with ${stats.skipped} skipped or missing record(s)`:``}. ${stats.met} of ${stats.assessed||0} (${stats.rate.toFixed(1)}%) met or exceeded the ${threshold}% individual threshold. The program target was ${target}% and was ${stats.rate>=target?"met":"not met"}.`;
  const saved=(hub.streamlinedNarratives||[]).find(n=>String(n.key||"").includes(a.id)||String(n.key||"").includes(assignmentName(a)));
  const action=saved?.text||a.actionTaken||a.continuousImprovement||"Faculty review and action are pending or were not entered in the Hub.";
  return {course,stats,result,action};
}
function qualitativeForCourse(term,code){
  const assessments=termQualAssessments(term).filter(a=>normalizeCourse(a.courseCode)===normalizeCourse(code));
  const ids=new Set(assessments.map(a=>a.id));
  const docs=termQualDocuments(term).filter(d=>ids.has(d.assessmentId));
  const docIds=new Set(docs.map(d=>d.id));
  const reviews=termQualReviews(term).filter(r=>ids.has(r.assessmentId)||docIds.has(r.documentId));
  const themes={};
  reviews.forEach(r=>Object.entries(r.themes||{}).forEach(([theme,v])=>{
    themes[theme] ||= {strong:0,present:0,limited:0,notObserved:0};
    if(v.rating==="strong")themes[theme].strong++;
    else if(v.rating==="present")themes[theme].present++;
    else if(v.rating==="limited")themes[theme].limited++;
    else themes[theme].notObserved++;
  }));
  return {assessments,docs,reviews,themes};
}
function reportEsc(s){return esc(s).replace(/\n/g,"<br>")}
function selfStudyStyles(){
  return `<style>
  body{font-family:"Times New Roman",serif;font-size:11pt;line-height:1.15;color:#000}
  h1{font-size:16pt;text-align:center}h2{font-size:14pt;margin-top:18pt}h3{font-size:12pt;margin-top:14pt}
  table{width:100%;border-collapse:collapse;margin:8pt 0}th,td{border:1px solid #000;padding:5pt;vertical-align:top}
  .course{page-break-inside:avoid;border-top:1.5pt solid #000;margin-top:15pt;padding-top:6pt}
  .label{font-weight:bold}.small{font-size:9pt}
  </style>`;
}
function buildSelfStudyInsertHtml(term,sloFilter="",threshold=hubSettings().threshold,target=hubSettings().target,programAction=""){
  const assignments=termAssignments(term).filter(a=>!sloFilter||a.sloId===sloFilter);
  const grouped={};
  assignments.forEach(a=>{const key=a.sloId||"unmapped";(grouped[key] ||= []).push(a)});
  const qualitative=termQualAssessments(term);
  const sections=Object.entries(grouped).map(([sloId,items])=>{
    const s=sloRecord(sloId),sloTitle=s?.description||s?.name||"Student outcome description not entered.";
    return `<h2>${reportEsc(sloCode(sloId))}</h2>
    <p><span class="label">Student Outcome:</span> ${reportEsc(sloTitle)}</p>
    ${items.map((a,index)=>{
      const n=assignmentNarrative(a,term,threshold,target),q=qualitativeForCourse(term,n.course.code);
      const reason=a.reason||a.alignmentReason||"The assessment was selected to measure the mapped Student Outcome.";
      const tool=a.assessmentToolDescription||a.description||`Student performance was evaluated using ${assignmentName(a)}.`;
      const criteria=a.successCriteria||`Students must earn at least ${threshold}% to meet the individual performance threshold. The program target is ${target}% achievement.`;
      const qualText=q.docs.length?` Qualitative evidence included ${q.docs.length} document(s) and ${q.reviews.length} review record(s) for this course during ${term}.`:"";
      return `<div class="course">
      <h3>${index+1}. ${reportEsc(n.course.code)} ${reportEsc(n.course.name)}</h3>
      <p><span class="label">Assignment:</span> ${reportEsc(assignmentName(a))}</p>
      <p><span class="label">Reason:</span> ${reportEsc(reason)}</p>
      <p><span class="label">Description of Assessment Tool - ${reportEsc(sloCode(sloId))}:</span><br>${reportEsc(tool)}</p>
      <p><span class="label">Description of Success Criteria - ${reportEsc(sloCode(sloId))}:</span><br>${reportEsc(criteria)}</p>
      <p><span class="label">Results Summary:</span> ${reportEsc(n.result)}${reportEsc(qualText)}</p>
      <p><span class="label">Action Taken:</span> ${reportEsc(n.action)}</p>
      <table><tr><th>Total Records</th><th>Assessed</th><th>Met Threshold</th><th>Below Threshold</th><th>Skipped/Missing</th><th>Achievement Rate</th></tr>
      <tr><td>${n.stats.total}</td><td>${n.stats.assessed}</td><td>${n.stats.met}</td><td>${n.stats.below}</td><td>${n.stats.skipped}</td><td>${n.stats.rate.toFixed(1)}%</td></tr></table>
      <p><span class="label">Faculty Review and Follow-Up:</span> ${reportEsc(a.facultyReview||a.followUp||"Enter meeting decision, responsible person, implementation term, and follow-up evidence before finalizing.")}</p>
      <p class="small"><span class="label">Supporting Evidence:</span> Place the assignment, rubric, representative student work, and related meeting minutes in the corresponding Appendix E evidence folder.</p>
      </div>`;
    }).join("")}`;
  }).join("");
  const qualitativeOnly=qualitative.filter(q=>!assignments.some(a=>normalizeCourse(assignmentCourse(a).code)===normalizeCourse(q.courseCode)));
  const qualitativeSection=qualitativeOnly.length?`<h2>Qualitative Assessments</h2>${qualitativeOnly.map(q=>{
    const docs=termQualDocuments(term).filter(d=>d.assessmentId===q.id),reviews=termQualReviews(term).filter(r=>r.assessmentId===q.id);
    const narrative=(hub.qualitativeNarratives||[]).find(n=>n.assessmentId===q.id||n.assessmentKey===`qa:${q.id}`);
    return `<div class="course"><h3>${reportEsc(q.courseCode)} - ${reportEsc(q.assessmentName||q.assessmentType||"Qualitative Assessment")}</h3><p><span class="label">Results Summary:</span> ${docs.length} document(s) and ${reviews.length} review(s) were included. ${reportEsc(narrative?.text||"Faculty narrative has not yet been approved.")}</p><p><span class="label">Action Taken:</span> ${reportEsc(q.actionTaken||"Faculty action and follow-up should be documented after review.")}</p></div>`;
  }).join("")}`:"";
  return `<!doctype html><html><head><meta charset="utf-8">${selfStudyStyles()}</head><body>
  <h1>CRITERION 4. CONTINUOUS IMPROVEMENT<br>Semester Assessment Insert - ${reportEsc(term)}</h1>
  <p>The following section is formatted for insertion into Criterion 4 of the ETAC Self-Study. It documents assessment methods, performance against established benchmarks, evaluation of results, actions taken, and planned follow-up.</p>
  ${sections||"<p>No quantitative assignments were found for the selected semester and outcome.</p>"}
  ${qualitativeSection}
  <h2>Program-Level Continuous Improvement</h2>
  <p><span class="label">Program Conclusion and Action:</span> ${reportEsc(programAction||"Review the course-level results and record any program-level decision, responsible person, implementation term, and closing-the-loop plan.")}</p>
  <p><span class="label">Meeting Evidence:</span> ${termMeetingNotes(term).length} meeting note record(s) are available in the semester archive.</p>
  </body></html>`;
}
function populateInsertSlos(){
  const select=$("insertSlo");if(!select)return;
  select.innerHTML='<option value="">All Outcomes Assessed This Semester</option>'+(hub.slos||[]).map(s=>`<option value="${esc(s.id)}">${esc(s.code||s.name||s.id)} - ${esc(s.description||"")}</option>`).join("");
}
function previewSelfStudyInsert(){
  const html=buildSelfStudyInsertHtml($("insertTerm").value,$("insertSlo").value,clampPct($("insertThreshold").value,hubSettings().threshold),clampPct($("insertTarget").value,hubSettings().target),$("insertProgramAction").value);
  $("selfStudyInsertPreview").innerHTML=`<div class="self-study-preview">${html.replace(/<!doctype html>|<html>|<\/html>|<head>.*?<\/head>|<body>|<\/body>/gs,"")}</div>`;
}
function downloadSelfStudyInsert(){
  const term=$("insertTerm").value,html=buildSelfStudyInsertHtml(term,$("insertSlo").value,clampPct($("insertThreshold").value,hubSettings().threshold),clampPct($("insertTarget").value,hubSettings().target),$("insertProgramAction").value);
  downloadBlob(`Criterion_4_Self_Study_Insert_${sanitizeFilePart(term)}.doc`,new Blob([html],{type:"application/msword"}));
}
async function downloadSemesterArchive(){
  if(typeof JSZip==="undefined")return alert("The ZIP library did not load. Refresh the page and try again.");
  const term=$("closeoutTerm").value.trim();if(!term)return alert("Enter the semester.");
  const zip=new JSZip(),root=zip.folder(sanitizeFilePart(term)+"_ABET_Semester_Archive");
  const uploads=termUploads(term),assignments=termAssignments(term),grades=termGrades(term),qualA=termQualAssessments(term),qualD=termQualDocuments(term),qualR=termQualReviews(term),notes=termMeetingNotes(term),teaching=termTeaching(term),syllabi=termSyllabi(term);
  const metadata={term,status:$("closeoutStatus").value,preparedBy:$("closeoutPreparedBy").value||currentUser?.email||"",reviewDate:$("closeoutReviewDate").value,exportedAt:now(),workspaceId:cfg.workspaceId,notice:"Original uploaded source files are not included because Firebase Storage is not enabled. This archive contains all records and extracted text stored in Firestore."};
  root.file("00_READ_ME.txt",`OSUIT ETDE ABET Semester Archive\nSemester: ${term}\nStatus: ${metadata.status}\nPrepared By: ${metadata.preparedBy}\nReview Date: ${metadata.reviewDate}\nExported: ${metadata.exportedAt}\n\nIMPORTANT: Original PDF, DOCX, ZIP, and XLSX source files are not stored by the Hub. Save those separately in this OneDrive folder when needed. This archive contains the Hub data, extracted journal excerpts, summaries, analytics records, meeting notes, and evidence index.`);
  root.file("01_Archive_Metadata.json",JSON.stringify(metadata,null,2));
  root.file("02_Semester_Report.txt",(()=>{const old=$("reportTerm").value;$("reportTerm").value=term;generateReport();const v=$("reportPreview").value;$("reportTerm").value=old;return v})());
  root.file("03_Criterion_4_Self_Study_Insert.doc",buildSelfStudyInsertHtml(term,"",hubSettings().threshold,hubSettings().target,""));
  root.file("04_Criterion_4_Self_Study_Insert.html",buildSelfStudyInsertHtml(term,"",hubSettings().threshold,hubSettings().target,""));
  root.file("05_Evidence_Index.csv",toCsv(uploads,[
    {label:"Type",value:"type"},{label:"File Name",value:"fileName"},{label:"Course Code",value:"courseCode"},{label:"Course Name",value:"courseName"},{label:"Section",value:"section"},{label:"Assessment",value:"assessmentName"},{label:"Uploader",value:"uploaderEmail"},{label:"Uploaded At",value:"uploadedAt"},{label:"Status",value:"status"},{label:"Approved",value:u=>u.resultApproved?"Yes":"No"}
  ]));
  root.file("Quantitative/Assignments.csv",toCsv(assignments,[
    {label:"ID",value:"id"},{label:"Course",value:a=>assignmentCourse(a).code},{label:"Course Name",value:a=>assignmentCourse(a).name},{label:"SLO",value:a=>sloCode(a.sloId)},{label:"Assignment",value:a=>assignmentName(a)},{label:"Possible",value:"possible"},{label:"Reason",value:a=>a.reason||a.alignmentReason||""},{label:"Assessment Tool",value:a=>a.assessmentToolDescription||a.description||""},{label:"Success Criteria",value:a=>a.successCriteria||""}
  ]));
  root.file("Quantitative/Grades.csv",toCsv(grades,[
    {label:"Student ID",value:g=>gradeStudent(g)?.sid||g.studentId},{label:"Assignment ID",value:"assignmentId"},{label:"Earned",value:"earned"},{label:"Possible",value:"possible"},{label:"Notes",value:"notes"}
  ]));
  root.file("Quantitative/Students.csv",toCsv((hub.students||[]).filter(s=>grades.some(g=>g.studentId===s.id)),[
    {label:"Anonymous ID",value:s=>s.sid||s.id},{label:"Course ID",value:"courseId"},{label:"Section",value:"section"},{label:"Instructor",value:"instructor"}
  ]));
  root.file("Qualitative/Assessments.json",JSON.stringify(qualA,null,2));
  root.file("Qualitative/Documents.json",JSON.stringify(qualD,null,2));
  root.file("Qualitative/Reviews.json",JSON.stringify(qualR,null,2));
  root.file("Qualitative/Narratives.json",JSON.stringify((hub.qualitativeNarratives||[]).filter(n=>qualA.some(a=>n.assessmentId===a.id||n.assessmentKey===`qa:${a.id}`)),null,2));
  root.file("Meetings/Meeting_Notes.json",JSON.stringify(notes,null,2));
  root.file("Meetings/Meeting_Notes.txt",notes.map(n=>`${n.date||""} - ${n.type||"Meeting"}\nAttendees: ${n.attendees||""}\nDiscussion: ${n.discussion||""}\nActions: ${n.actions||""}\n`).join("\n--------------------\n"));
  root.file("Faculty/Teaching_Assignments.json",JSON.stringify(teaching,null,2));
  root.file("Syllabi/Syllabus_Records.json",JSON.stringify(syllabi,null,2));
  root.file("Backup/Complete_Workspace_Backup.json",JSON.stringify({application:"OSUIT ETDE Assessment & Accreditation Hub",version:"2.1.0",exportedAt:now(),workspaceId:cfg.workspaceId,data:hub},null,2));
  root.file("Backup/Semester_Only_Data.json",JSON.stringify({metadata,uploads,assignments,grades,qualitativeAssessments:qualA,qualitativeDocuments:qualD,qualitativeReviews:qualR,meetingNotes:notes,teaching,syllabi},null,2));
  const blob=await zip.generateAsync({type:"blob",compression:"DEFLATE",compressionOptions:{level:6}});
  downloadBlob(`${sanitizeFilePart(term)}_ABET_Semester_Archive.zip`,blob);
  $("closeoutStatusMessage").innerHTML='<div class="notice success">Semester archive created. Save the ZIP in OneDrive, then add any original source files you want preserved beside it.</div>';
}
function initSemesterCloseout(){
  if(!$("downloadSemesterArchive"))return;
  const current=typeof currentTermName==="function"?currentTermName():$("reportTerm").value;
  $("closeoutTerm").value=current;$("insertTerm").value=current;
  $("closeoutPreparedBy").value=currentUser?.email||"";
  $("closeoutReviewDate").value=new Date().toISOString().slice(0,10);
  populateInsertSlos();
  $("downloadSemesterArchive").addEventListener("click",downloadSemesterArchive);
  $("previewSelfStudyInsert").addEventListener("click",previewSelfStudyInsert);
  $("downloadSelfStudyInsert").addEventListener("click",downloadSelfStudyInsert);
}
