/* Version 5.2 — Outcomes & Improvement, PEO surveys, advisory board, self-study exports,
   historical import, and the simple instructor "My Courses" view.
   Everything is stored as NEW fields inside the existing workspace record (hub.*), using saveHub(). */
(function(){
"use strict";
const SOS=["SO1","SO2","SO3","SO4","SO5"];
const SO_TEXT={
 SO1:"Apply knowledge, techniques, skills and modern tools to solve broadly-defined problems",
 SO2:"Design systems, components, or processes",
 SO3:"Written, oral, and graphical communication; use technical literature",
 SO4:"Conduct tests and measurements; analyze and interpret results to improve processes",
 SO5:"Function effectively as a member or leader on a technical team"
};
const ACTION_STATUS=["Planned","In progress","Implemented","Follow-up complete"];
const H=v=>esc(v);
const el=id=>document.getElementById(id);
const fmtPct=v=>v===null||v===undefined||!Number.isFinite(v)?"—":v.toFixed(1)+"%";

function ensureV52(){
  ["improvementActions","peoSurveys","advisoryMeetings","historicalResults"].forEach(k=>{if(!Array.isArray(hub[k]))hub[k]=[]});
  if(!hub.settings||typeof hub.settings!=="object")hub.settings={};
  if(!Array.isArray(hub.settings.peoList)||!hub.settings.peoList.length)
    hub.settings.peoList=["PEO1","PEO2","PEO3","PEO4","PEO5"].map(id=>({id,text:""}));
}
async function save(msgHost,okText){
  try{await saveHub();if(msgHost)msgHost.innerHTML=`<div class="notice success">${H(okText||"Saved.")}</div>`;return true}
  catch(e){if(msgHost)msgHost.innerHTML=`<div class="notice warning">Not saved: ${H(e.message||e)}</div>`;return false}
}

/* ---------- academic years and outcome codes ---------- */
function termToAY(term){
  const m=String(term||"").match(/(Fall|Spring|Summer)\s*(\d{4})/i);if(!m)return "";
  const y=Number(m[2]),start=/fall/i.test(m[1])?y:y-1;
  return `${start}-${String(start+1).slice(-2)}`;
}
function ayStart(ay){return Number(String(ay).slice(0,4))}
function ayLabel(start){return `${start}-${String(start+1).slice(-2)}`}
function currentAY(){const d=new Date();return ayLabel(d.getMonth()>=6?d.getFullYear():d.getFullYear()-1)}
function soFromText(t){const m=String(t||"").match(/\bS(?:L)?O\s*-?\s*([1-5])\b|Outcome\s*([1-5])\b/i);return m?`SO${m[1]||m[2]}`:""}
function soOfAssignment(a){return soFromText(a.officialSloCode)||soFromText(typeof sloCode==="function"?sloCode(a.sloId):"")||""}
const normCode=c=>(typeof normalizeCourse==="function"?normalizeCourse(c):"")||String(c||"").trim().toUpperCase();

/* ---------- schedule: spreadsheet years first, then the six-year cycle ---------- */
function scheduledFor(ay){
  const start=ayStart(ay),rows=(window.ETDE_ASSESSMENT_SCHEDULE||[]).filter(x=>x.academicYear===ay);
  if(rows.length)return rows.map(x=>({so:x.so,courseCode:normCode(x.courseCode),term:x.term,tool:x.tool,source:"Assessment schedule spreadsheet"}));
  const cycStart=Number(hub.roadmapSettings?.cycleStartYear)||2026;
  if(start<cycStart)return [];
  const idx=((start-cycStart)%6)+1,out=[];
  Object.entries(hub.curriculum?.schedule||{}).forEach(([so,years])=>(years[idx]||[]).forEach(c=>out.push({so,courseCode:normCode(c),term:"",tool:"",source:`Six-year cycle, year ${idx}`})));
  return out;
}

/* ---------- results: live Hub grades + imported historical counts ---------- */
function allResults(){
  ensureV52();
  const {threshold}=hubSettings(),out=[];
  (hub.assignments||[]).forEach(a=>{
    const so=soOfAssignment(a);if(!so)return;
    const st=assessmentStats(a,threshold);if(!st.assessed)return;
    const course=assignmentCourse(a);
    out.push({so,academicYear:termToAY(a.term),term:a.term||"",courseCode:normCode(course.code),tool:assignmentName(a),assessed:st.assessed,met:st.met,source:"Hub gradebook upload"});
  });
  hub.historicalResults.forEach(h=>out.push({...h,courseCode:normCode(h.courseCode),historical:true}));
  return out;
}
function summarize(){
  const {target}=hubSettings(),res=allResults(),cur=ayStart(currentAY());
  const years=new Set([currentAY()]);
  res.forEach(r=>r.academicYear&&years.add(r.academicYear));
  (window.ETDE_ASSESSMENT_SCHEDULE||[]).forEach(x=>years.add(x.academicYear));
  const ys=[...years].filter(Boolean).sort();
  const cells={},missing=[];
  SOS.forEach(so=>ys.forEach(ay=>{
    const rows=res.filter(r=>r.so===so&&r.academicYear===ay);
    const counted=rows.filter(r=>Number.isFinite(r.met)&&r.met!==null&&r.assessed>0);
    const assessed=counted.reduce((s,r)=>s+r.assessed,0),met=counted.reduce((s,r)=>s+r.met,0);
    const sched=scheduledFor(ay).filter(x=>x.so===so);
    const haveCourses=new Set(counted.map(r=>r.courseCode));
    const dueMissing=ayStart(ay)<=cur?sched.filter(x=>!haveCourses.has(x.courseCode)):[];
    dueMissing.forEach(x=>missing.push({so,ay,...x,incomplete:rows.some(r=>r.courseCode===x.courseCode)}));
    const rate=assessed?met/assessed*100:null;
    cells[so+"|"+ay]={rows,assessed,met,rate,status:rate===null?(sched.length?(ayStart(ay)<=cur?"missing":"scheduled"):"na"):(rate>=target?"met":"notmet"),sched,dueMissing};
  }));
  return {years:ys,cells,missing,res};
}

/* ---------- 1. outcome summary ---------- */
function renderSummary(){
  const host=el("soSummary");if(!host)return;
  const {threshold,target}=hubSettings(),s=summarize();
  const head=`<tr><th>Outcome</th>${s.years.map(y=>`<th>${H(y)}${y===currentAY()?"<br><small>(this year)</small>":""}</th>`).join("")}</tr>`;
  const body=SOS.map(so=>`<tr><td><strong>${so}</strong><br><small>${H(SO_TEXT[so])}</small></td>${s.years.map(y=>{
    const c=s.cells[so+"|"+y],cls={met:"met",notmet:"notmet",missing:"missing",scheduled:"",na:"na"}[c.status];
    let txt=c.status==="na"?"—":c.status==="scheduled"?"Scheduled":c.status==="missing"?"<strong>Due — no data</strong>":`<strong>${fmtPct(c.rate)}</strong><br>${c.met} of ${c.assessed}<br>${c.status==="met"?"Target met":"Below target"}`;
    if(c.dueMissing.length&&c.rate!==null)txt+=`<br><small>⚠ ${c.dueMissing.length} scheduled course(s) missing</small>`;
    if(c.status==="notmet")txt+=`<br><button class="btn outline" style="padding:2px 6px;font-size:.8em" data-new-action="${H(so)}|${H(y)}|${H(c.rate.toFixed(1))}">+ Action</button>`;
    return `<td class="${cls}">${txt}</td>`}).join("")}</tr>`).join("");
  host.innerHTML=`<p class="muted">Each cell = students who reached the ${threshold}% individual threshold ÷ students assessed, for every course that assessed that outcome that year. Program target: ${target}%.</p>
  <div class="legend"><span class="so-grid" style="background:#e3f4e6">Target met</span><span style="background:#fde8e6">Below target</span><span style="background:#fff4d6">Due but no data</span></div>
  <div class="table-wrap"><table class="table so-grid">${head}${body}</table></div>`;
  const miss=el("soMissing");
  if(miss)miss.innerHTML=s.missing.length?`<div class="notice warning"><strong>${s.missing.length} scheduled assessment(s) have no usable results yet.</strong></div><div class="table-wrap"><table class="table"><tr><th>Year</th><th>Outcome</th><th>Course</th><th>Term</th><th>Assessment</th><th>Why flagged</th></tr>${s.missing.map(m=>`<tr><td>${H(m.ay)}</td><td>${H(m.so)}</td><td>${H(m.courseCode)}</td><td>${H(m.term)}</td><td>${H(m.tool)}</td><td>${m.incomplete?"Data imported but success count is blank":"No upload or imported result"}</td></tr>`).join("")}</table></div>`:'<div class="notice success">Every scheduled assessment up to this year has results.</div>';
  const det=el("soDetail");
  if(det)det.innerHTML=s.res.length?`<div class="table-wrap"><table class="table"><tr><th>Year</th><th>Term</th><th>Outcome</th><th>Course</th><th>Assessment</th><th>Assessed</th><th>Met</th><th>%</th><th>Source</th></tr>${s.res.slice().sort((a,b)=>(a.academicYear+a.so).localeCompare(b.academicYear+b.so)).map(r=>`<tr><td>${H(r.academicYear)}</td><td>${H(r.term)}</td><td>${H(r.so)}</td><td>${H(r.courseCode)}</td><td>${H(r.tool)}</td><td>${H(r.assessed)}</td><td>${r.met===null||r.met===undefined?"<em>blank</em>":H(r.met)}</td><td>${r.met===null||r.met===undefined?"—":fmtPct(r.met/r.assessed*100)}</td><td><small>${H(r.source)}</small></td></tr>`).join("")}</table></div>`:'<div class="notice">No results yet. Upload a Canvas gradebook or import the historical data below.</div>';
  host.querySelectorAll("[data-new-action]").forEach(b=>b.onclick=()=>{
    const [so,ay,rate]=b.dataset.newAction.split("|");
    showTab("actions");
    el("caSo").value=so;el("caFinding").value=`${so} ${ay}: ${rate}% of students met the ${hubSettings().threshold}% threshold, below the ${hubSettings().target}% program target.`;
    el("caFinding").focus();
  });
}

/* ---------- settings (single source for 70/75) ---------- */
function renderSettings(){
  const host=el("v52Settings");if(!host)return;ensureV52();
  const st=hubSettings();
  host.innerHTML=`<div class="form-grid"><label>Individual threshold (%)<input id="setThreshold" type="number" min="0" max="100" value="${st.threshold}"></label><label>Program target (%)<input id="setTarget" type="number" min="0" max="100" value="${st.target}"></label></div>
  <h4>Program Educational Objectives</h4><p class="muted">Type the wording from your self-study so surveys and advisory records show it.</p>
  ${hub.settings.peoList.map((p,i)=>`<label>${H(p.id)}<input data-peo-text="${i}" value="${H(p.text)}"></label>`).join("")}
  <div class="actions"><button id="saveV52Settings" class="btn primary">Save Settings</button></div><div id="v52SettingsMsg"></div>`;
  el("saveV52Settings").onclick=async()=>{
    hub.settings.sloThreshold=clampPct(el("setThreshold").value,70);hub.settings.programTarget=clampPct(el("setTarget").value,75);
    host.querySelectorAll("[data-peo-text]").forEach(i=>hub.settings.peoList[Number(i.dataset.peoText)].text=i.value.trim());
    if(await save(el("v52SettingsMsg"),"Settings saved. Analytics, reports, the self-study insert, and closeout now use these values."))renderAll();
  };
}

/* ---------- 2. continuous-improvement actions ---------- */
function renderActions(){
  const host=el("caList");if(!host)return;ensureV52();
  const f=el("caFilter")?.value||"";
  const rows=hub.improvementActions.filter(a=>!f||a.status===f||a.so===f).sort((a,b)=>String(b.date||"").localeCompare(String(a.date||"")));
  host.innerHTML=rows.length?`<div class="table-wrap"><table class="table"><tr><th>Outcome</th><th>Finding</th><th>Change made</th><th>Owner</th><th>Date</th><th>Status</th><th>Follow-up result</th><th></th></tr>${rows.map(a=>`<tr><td>${H(a.so)}</td><td>${H(a.finding)}</td><td>${H(a.change)}</td><td>${H(a.owner)}</td><td>${H(a.date)}</td><td><span class="badge ${a.status==="Follow-up complete"?"good":"warn"}">${H(a.status)}</span></td><td>${H(a.followUpResult)}${a.followUpDate?`<br><small>${H(a.followUpDate)}</small>`:""}</td><td><button class="btn outline" data-edit-action="${H(a.id)}">Edit</button> <button class="btn danger" data-del-action="${H(a.id)}">Delete</button></td></tr>`).join("")}</table></div>`:'<div class="notice">No improvement actions yet. Use "+ Action" in the outcome table or the form above.</div>';
  host.querySelectorAll("[data-edit-action]").forEach(b=>b.onclick=()=>loadAction(b.dataset.editAction));
  host.querySelectorAll("[data-del-action]").forEach(b=>b.onclick=async()=>{
    if(!confirm("Delete this improvement action?"))return;
    hub.improvementActions=hub.improvementActions.filter(a=>a.id!==b.dataset.delAction);
    hub.advisoryMeetings.forEach(m=>m.linkedActionIds=(m.linkedActionIds||[]).filter(x=>x!==b.dataset.delAction));
    await save(el("caMsg"),"Action deleted.");renderActions();renderAdvisory();
  });
}
function loadAction(idn){
  const a=hub.improvementActions.find(x=>x.id===idn);if(!a)return;
  el("caId").value=a.id;["So","Finding","Change","Owner","Date","Status","FollowUp","FollowUpDate"].forEach(k=>{const key={So:"so",Finding:"finding",Change:"change",Owner:"owner",Date:"date",Status:"status",FollowUp:"followUpResult",FollowUpDate:"followUpDate"}[k];el("ca"+k).value=a[key]||""});
  el("caSave").textContent="Update Action";el("caFinding").focus();
}
function clearActionForm(){["caId","caFinding","caChange","caOwner","caDate","caFollowUp","caFollowUpDate"].forEach(i=>el(i).value="");el("caStatus").value="Planned";el("caSave").textContent="Save Action"}
async function saveAction(){
  ensureV52();
  const rec={so:el("caSo").value,finding:el("caFinding").value.trim(),change:el("caChange").value.trim(),owner:el("caOwner").value.trim(),date:el("caDate").value,status:el("caStatus").value,followUpResult:el("caFollowUp").value.trim(),followUpDate:el("caFollowUpDate").value};
  if(!rec.finding){el("caMsg").innerHTML='<div class="notice warning">Describe the finding first.</div>';return}
  const existing=hub.improvementActions.find(x=>x.id===el("caId").value);
  if(existing)Object.assign(existing,rec,{updatedAt:now(),updatedBy:currentUser?.email||""});
  else hub.improvementActions.push({id:id("action"),...rec,createdAt:now(),createdBy:currentUser?.email||""});
  if(await save(el("caMsg"),"Action saved."))clearActionForm();
  renderActions();renderAdvisory();
}

/* ---------- 3a. PEO survey import (stores totals only) ---------- */
const LIKERT={"strongly agree":5,"agree":4,"neutral":3,"neither agree nor disagree":3,"disagree":2,"strongly disagree":1,"excellent":5,"very good":4,"good":3,"fair":2,"poor":1,"exceeds":5,"meets":4,"partially meets":3,"does not meet":1};
function likertValue(v){
  if(v===null||v===undefined||v==="")return null;
  if(typeof v==="number")return v;
  const s=String(v).trim().toLowerCase(),n=Number(s);
  if(Number.isFinite(n)&&s!=="")return n;
  const m=s.match(/^([1-5])\b/);if(m)return Number(m[1]);
  return LIKERT[s]??null;
}
async function readSheetRows(file){
  const wb=XLSX.read(await file.arrayBuffer(),{type:"array"});
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:""});
}
function summarizeSurvey(rows){
  const headers=Object.keys(rows[0]||{}),peoCols={},commentCols=[];
  headers.forEach(h=>{const m=h.match(/PEO\s*-?\s*(\d)/i);if(m)(peoCols["PEO"+m[1]] ||= []).push(h);else if(/comment|suggest|feedback|improve/i.test(h))commentCols.push(h)});
  const results={};
  Object.entries(peoCols).forEach(([peo,cols])=>{
    const vals=[];rows.forEach(r=>cols.forEach(c=>{const v=likertValue(r[c]);if(v!==null&&v>=1&&v<=5)vals.push(v)}));
    results[peo]={n:vals.length,mean:vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null,pctAgree:vals.length?vals.filter(v=>v>=4).length/vals.length*100:null};
  });
  const comments=[];rows.forEach(r=>commentCols.forEach(c=>{const t=String(r[c]||"").trim();if(t)comments.push(t.slice(0,500))}));
  return {respondents:rows.length,results,comments,peoColumns:peoCols};
}
let pendingSurvey=null;
async function previewSurvey(){
  const f=el("psFile").files[0],box=el("psPreview");
  if(!f){box.innerHTML='<div class="notice warning">Choose a CSV or Excel file.</div>';return}
  try{
    const rows=await readSheetRows(f);if(!rows.length)throw new Error("The file has no rows.");
    const s=summarizeSurvey(rows);
    if(!Object.keys(s.results).length)throw new Error('No columns with "PEO1"…"PEO5" in the header were found. Download the template to see the expected layout.');
    pendingSurvey={...s,fileName:f.name};
    box.innerHTML=`<div class="notice">${s.respondents} response(s). Only the totals below are saved; individual answers stay in your file.</div>${surveyTable(s.results)}${s.comments.length?`<p><strong>${s.comments.length} comment(s)</strong> will be saved for review.</p>`:""}<button id="psSave" class="btn primary">Save Survey Summary</button>`;
    el("psSave").onclick=saveSurvey;
  }catch(e){pendingSurvey=null;box.innerHTML=`<div class="notice warning">${H(e.message||e)}</div>`}
}
function surveyTable(results){
  const {target}=hubSettings();
  return `<div class="table-wrap"><table class="table"><tr><th>PEO</th><th>Answers</th><th>Average (1–5)</th><th>% agree or better</th><th>Target ${target}%</th></tr>${Object.entries(results).sort().map(([p,r])=>`<tr><td>${H(p)} ${H(peoText(p))}</td><td>${r.n}</td><td>${r.mean===null?"—":r.mean.toFixed(2)}</td><td>${fmtPct(r.pctAgree)}</td><td>${r.pctAgree===null?"—":r.pctAgree>=target?"Met":"Not met"}</td></tr>`).join("")}</table></div>`;
}
function peoText(p){const x=(hub.settings?.peoList||[]).find(q=>q.id===p);return x?.text?`— ${x.text}`:""}
async function saveSurvey(){
  if(!pendingSurvey)return;ensureV52();
  hub.peoSurveys.push({id:id("peosurvey"),type:el("psType").value,name:el("psName").value.trim()||`${el("psType").value} survey`,date:el("psDate").value,fileName:pendingSurvey.fileName,respondents:pendingSurvey.respondents,results:pendingSurvey.results,comments:pendingSurvey.comments,createdAt:now(),createdBy:currentUser?.email||""});
  pendingSurvey=null;el("psFile").value="";
  await save(el("psPreview"),"Survey summary saved.");renderSurveys();
}
function renderSurveys(){
  const host=el("psList");if(!host)return;ensureV52();
  host.innerHTML=hub.peoSurveys.length?hub.peoSurveys.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(s=>`<div class="admin-row"><strong>${H(s.name)}</strong> <span class="badge">${H(s.type)}</span> <span class="badge">${H(s.date||"no date")}</span> <span class="badge">${H(s.respondents)} responses</span>${surveyTable(s.results||{})}${(s.comments||[]).length?`<details><summary>${s.comments.length} comment(s)</summary>${s.comments.map(c=>`<p>• ${H(c)}</p>`).join("")}</details>`:""}<div class="actions"><button class="btn danger" data-del-survey="${H(s.id)}">Delete</button></div></div>`).join(""):'<div class="notice">No PEO surveys imported yet.</div>';
  host.querySelectorAll("[data-del-survey]").forEach(b=>b.onclick=async()=>{if(!confirm("Delete this survey summary?"))return;hub.peoSurveys=hub.peoSurveys.filter(x=>x.id!==b.dataset.delSurvey);await save(null);renderSurveys()});
}
function downloadSurveyTemplate(){
  const peos=(hub.settings?.peoList||[]).map(p=>p.id);
  const head=["Respondent role","Graduation year",...peos.map(p=>`${p} rating (1-5)`),"Comments"];
  const ex=["Employer","2022",...peos.map(()=>"4"),"Graduates are well prepared for PLC work."];
  download("PEO_Survey_Template.csv",[head,ex].map(r=>r.map(csvEscape).join(",")).join("\r\n"),"text/csv");
}

/* ---------- 3b. advisory board ---------- */
function renderAdvisoryForm(){
  const host=el("abPeoChecks");if(!host)return;ensureV52();
  host.innerHTML=hub.settings.peoList.map(p=>`<label style="display:inline-block;margin-right:12px"><input type="checkbox" value="${H(p.id)}" data-ab-peo> ${H(p.id)}</label>`).join("");
  const sel=el("abActions");
  sel.innerHTML=hub.improvementActions.map(a=>`<option value="${H(a.id)}">${H(a.so)} — ${H(String(a.finding).slice(0,80))}</option>`).join("");
}
async function saveAdvisory(){
  ensureV52();
  const rec={id:id("advisory"),date:el("abDate").value,attendees:el("abAttendees").value.trim(),peosReviewed:[...document.querySelectorAll("[data-ab-peo]:checked")].map(c=>c.value),peoReviewNotes:el("abPeoNotes").value.trim(),recommendations:el("abRecs").value.trim(),linkedActionIds:[...el("abActions").selectedOptions].map(o=>o.value),createdAt:now(),createdBy:currentUser?.email||""};
  if(!rec.date){el("abMsg").innerHTML='<div class="notice warning">Enter the meeting date.</div>';return}
  hub.advisoryMeetings.push(rec);
  if(await save(el("abMsg"),"Advisory board meeting saved.")){["abDate","abAttendees","abPeoNotes","abRecs"].forEach(i=>el(i).value="");document.querySelectorAll("[data-ab-peo]").forEach(c=>c.checked=false)}
  renderAdvisory();
}
function renderAdvisory(){
  renderAdvisoryForm();
  const host=el("abList");if(!host)return;
  host.innerHTML=hub.advisoryMeetings.length?hub.advisoryMeetings.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(m=>{
    const acts=(m.linkedActionIds||[]).map(x=>hub.improvementActions.find(a=>a.id===x)).filter(Boolean);
    return `<div class="admin-row"><strong>${H(m.date)}</strong> — ${H(m.attendees||"attendees not recorded")}<br><strong>PEOs reviewed:</strong> ${m.peosReviewed?.length?m.peosReviewed.map(p=>`<span class="badge">${H(p)}</span>`).join(" "):"none recorded"}${m.peoReviewNotes?`<p>${H(m.peoReviewNotes)}</p>`:""}${m.recommendations?`<p><strong>Recommendations:</strong> ${H(m.recommendations)}</p>`:""}${acts.length?`<p><strong>Linked actions:</strong></p>${acts.map(a=>`<p>• ${H(a.so)}: ${H(a.change||a.finding)} <span class="badge">${H(a.status)}</span></p>`).join("")}`:""}<div class="actions"><button class="btn danger" data-del-ab="${H(m.id)}">Delete</button></div></div>`}).join(""):'<div class="notice">No advisory board meetings recorded yet.</div>';
  host.querySelectorAll("[data-del-ab]").forEach(b=>b.onclick=async()=>{if(!confirm("Delete this meeting record?"))return;hub.advisoryMeetings=hub.advisoryMeetings.filter(x=>x.id!==b.dataset.delAb);await save(null);renderAdvisory()});
}

/* ---------- 4. self-study tables (.xlsx and .docx) ---------- */
function tableSoCourse(){
  const map=hub.curriculum?.courseOutcomeMap||CUR.draftMap||{};
  return [["Course","Title","Credits",...SOS],...CUR.courses.map(c=>[c[0],c[1],c[2],...SOS.map(so=>(map[c[0]]||[]).includes(so)?"X":"")])];
}
function tableResults(){
  const {threshold,target}=hubSettings(),s=summarize();
  const rows=[["Academic Year","Term","Student Outcome","Course","Assessment Tool",`Students Assessed`,`Students ≥ ${threshold}%`,"% Met",`Target (${target}%)`,"Source"]];
  s.res.slice().sort((a,b)=>(a.so+a.academicYear+a.courseCode).localeCompare(b.so+b.academicYear+b.courseCode)).forEach(r=>{
    const has=r.met!==null&&r.met!==undefined,p=has&&r.assessed?r.met/r.assessed*100:null;
    rows.push([r.academicYear,r.term,r.so,r.courseCode,r.tool,r.assessed,has?r.met:"",p===null?"":Number(p.toFixed(1)),p===null?"No data":p>=target?"Met":"Not met",r.source]);
  });
  return rows;
}
function tableSoSummary(){
  const {target}=hubSettings(),s=summarize();
  return [["Student Outcome",...s.years],...SOS.map(so=>[so,...s.years.map(y=>{const c=s.cells[so+"|"+y];return c.rate===null?(c.status==="missing"?"Due - no data":c.status==="scheduled"?"Scheduled":""):`${c.rate.toFixed(1)}% (${c.met}/${c.assessed}) ${c.rate>=target?"Met":"Not met"}`})])];
}
function tablePeoSo(){
  ensureV52();
  const m=hub.settings.peoSoMap||window.ETDE_PEO_SO_SEED||{};
  return [["PEO","Objective",...SOS],...hub.settings.peoList.map(p=>[p.id,p.text||"",...SOS.map(so=>m[p.id]?.[so]?"X":"")])];
}
function tableActions(){return [["Outcome","Finding","Change Made","Owner","Date","Status","Follow-up Result","Follow-up Date"],...hub.improvementActions.map(a=>[a.so,a.finding,a.change,a.owner,a.date,a.status,a.followUpResult,a.followUpDate])]}
function tableAdvisory(){return [["Date","Attendees","PEOs Reviewed","PEO Review Notes","Recommendations","Linked Actions"],...hub.advisoryMeetings.map(m=>[m.date,m.attendees,(m.peosReviewed||[]).join(", "),m.peoReviewNotes,m.recommendations,(m.linkedActionIds||[]).map(x=>{const a=hub.improvementActions.find(y=>y.id===x);return a?`${a.so}: ${a.change||a.finding}`:""}).filter(Boolean).join("; ")])]}
function tableSurveys(){const r=[["Survey","Type","Date","Respondents","PEO","Answers","Average","% Agree"]];hub.peoSurveys.forEach(s=>Object.entries(s.results||{}).forEach(([p,v])=>r.push([s.name,s.type,s.date,s.respondents,p,v.n,v.mean===null?"":Number(v.mean.toFixed(2)),v.pctAgree===null?"":Number(v.pctAgree.toFixed(1))])));return r}
const EXPORT_TABLES=()=>[
  ["Table 3-1 SO-Course Map",tableSoCourse()],["Table 4-1 SO Summary",tableSoSummary()],["Table 4-2 Assessment Results",tableResults()],
  ["Table 2-1 PEO-SO Map",tablePeoSo()],["CI Actions",tableActions()],["Advisory Board",tableAdvisory()],["PEO Surveys",tableSurveys()]
];
function exportXlsx(){
  const wb=XLSX.utils.book_new();
  EXPORT_TABLES().forEach(([name,rows])=>{const ws=XLSX.utils.aoa_to_sheet(rows);ws["!cols"]=rows[0].map((_,i)=>({wch:Math.min(60,Math.max(8,...rows.map(r=>String(r[i]??"").length)))}));XLSX.utils.book_append_sheet(wb,ws,name.slice(0,31))});
  XLSX.writeFile(wb,`ETDE_Self_Study_Tables_${new Date().toISOString().slice(0,10)}.xlsx`);
}
const X=s=>String(s??"").replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,"");
function docxPara(text,style){return `<w:p>${style?`<w:pPr><w:pStyle w:val="${style}"/></w:pPr>`:""}<w:r><w:t xml:space="preserve">${X(text)}</w:t></w:r></w:p>`}
function docxTable(rows){
  const cell=(v,hdr)=>`<w:tc><w:tcPr>${hdr?'<w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/>':""}</w:tcPr><w:p><w:r>${hdr?"<w:rPr><w:b/></w:rPr>":""}<w:rPr><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">${X(v)}</w:t></w:r></w:p></w:tc>`;
  return `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${["top","left","bottom","right","insideH","insideV"].map(b=>`<w:${b} w:val="single" w:sz="4" w:space="0" w:color="808080"/>`).join("")}</w:tblBorders></w:tblPr>${rows.map((r,i)=>`<w:tr>${i===0?"<w:trPr><w:tblHeader/></w:trPr>":""}${r.map(v=>cell(v,i===0)).join("")}</w:tr>`).join("")}</w:tbl>`;
}
async function exportDocx(){
  const body=[docxPara("OSUIT Instrumentation & Automation Engineering Technology — Self-Study Tables","Title"),docxPara(`Generated ${new Date().toLocaleDateString()} from the ETDE Assessment Hub. Individual threshold ${hubSettings().threshold}%, program target ${hubSettings().target}%.`)];
  EXPORT_TABLES().forEach(([name,rows])=>{body.push(docxPara(name,"Heading1"));body.push(rows.length>1?docxTable(rows):docxPara("No records yet."));body.push(docxPara(""))});
  const zip=new JSZip();
  zip.file("[Content_Types].xml",'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',{createFolders:false});
  zip.file("_rels/.rels",'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',{createFolders:false});
  zip.file("word/_rels/document.xml.rels",'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',{createFolders:false});
  zip.file("word/styles.xml",'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style><w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/></w:style></w:styles>',{createFolders:false});
  zip.file("word/document.xml",`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join("")}<w:sectPr><w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`,{createFolders:false});
  const blob=await zip.generateAsync({type:"blob",mimeType:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"});
  downloadBlob(`ETDE_Self_Study_Tables_${new Date().toISOString().slice(0,10)}.docx`,blob);
}
window.v52BuildDocxXml=()=>EXPORT_TABLES(); // used by automated checks

/* ---------- 5. historical import (preview, then add only what you tick) ---------- */
const histKey=r=>[r.so,r.academicYear,r.term,normCode(r.courseCode),r.source].join("|");
function renderHistorical(){
  const host=el("histSeed");if(!host)return;ensureV52();
  const have=new Set(hub.historicalResults.map(histKey)),seed=window.ETDE_HISTORICAL_SEED||[];
  host.innerHTML=`<p class="muted">Counts read from SO 3 Data.xlsx, Student Outcome 5 Data.xlsx, and the capstone assessment-results workbook. Only totals are imported, no student names. Nothing is saved until you click Import.</p><div class="table-wrap"><table class="table"><tr><th><input type="checkbox" id="histAll"></th><th>Year</th><th>Term</th><th>SO</th><th>Course</th><th>Assessment</th><th>Assessed</th><th>Met</th><th>Note</th></tr>${seed.map((r,i)=>`<tr><td>${have.has(histKey(r))?"✓ imported":`<input type="checkbox" data-hist="${i}">`}</td><td>${H(r.academicYear)}</td><td>${H(r.term)}</td><td>${H(r.so)}</td><td>${H(r.courseCode)}</td><td>${H(r.tool)}</td><td>${H(r.assessed)}</td><td>${r.met===null?"<em>blank</em>":H(r.met)}</td><td><small>${H(r.note)}</small></td></tr>`).join("")}</table></div><div class="actions"><button id="histImport" class="btn primary">Import Selected</button></div><div id="histMsg"></div>`;
  el("histAll").onchange=e=>host.querySelectorAll("[data-hist]").forEach(c=>c.checked=e.target.checked);
  el("histImport").onclick=async()=>{
    const picked=[...host.querySelectorAll("[data-hist]:checked")].map(c=>seed[Number(c.dataset.hist)]);
    if(!picked.length){el("histMsg").innerHTML='<div class="notice warning">Tick at least one row.</div>';return}
    picked.forEach(r=>hub.historicalResults.push({id:id("hist"),...r,importedAt:now(),importedBy:currentUser?.email||""}));
    const ok=await save(null);renderHistorical();renderSummary();el("histMsg").innerHTML=ok?`<div class="notice success">${picked.length} historical result(s) imported. See the Outcome Summary tab.</div>`:'<div class="notice warning">Not saved. See the warning at the top of the page.</div>';
  };
  const mine=el("histMine");
  if(mine)mine.innerHTML=hub.historicalResults.length?`<div class="table-wrap"><table class="table"><tr><th>Year</th><th>Term</th><th>SO</th><th>Course</th><th>Assessed</th><th>Met</th><th></th></tr>${hub.historicalResults.map(r=>`<tr><td>${H(r.academicYear)}</td><td>${H(r.term)}</td><td>${H(r.so)}</td><td>${H(r.courseCode)}</td><td><input type="number" min="0" style="width:70px" data-hist-assessed="${H(r.id)}" value="${H(r.assessed)}"></td><td><input type="number" min="0" style="width:70px" data-hist-met="${H(r.id)}" value="${r.met===null||r.met===undefined?"":H(r.met)}" placeholder="blank"></td><td><button class="btn danger" data-hist-del="${H(r.id)}">Remove</button></td></tr>`).join("")}</table></div><div class="actions"><button id="histSaveEdits" class="btn primary">Save Changes</button></div><div id="histEditMsg"></div>`:'<div class="notice">No historical results imported yet.</div>';
  el("histSaveEdits")&&(el("histSaveEdits").onclick=async()=>{
    hub.historicalResults.forEach(r=>{const a=document.querySelector(`[data-hist-assessed="${CSS.escape(r.id)}"]`),m=document.querySelector(`[data-hist-met="${CSS.escape(r.id)}"]`);if(a)r.assessed=Number(a.value)||0;if(m)r.met=m.value===""?null:Math.min(Number(m.value),r.assessed)});
    const ok=await save(null);renderHistorical();renderSummary();if(el("histEditMsg"))el("histEditMsg").innerHTML=ok?'<div class="notice success">Historical results updated.</div>':'<div class="notice warning">Not saved.</div>';
  });
  mine?.querySelectorAll("[data-hist-del]").forEach(b=>b.onclick=async()=>{if(!confirm("Remove this imported result?"))return;hub.historicalResults=hub.historicalResults.filter(x=>x.id!==b.dataset.histDel);await save(null);renderHistorical();renderSummary()});
}

/* ---------- outcomes page wiring ---------- */
function showTab(name){
  document.querySelectorAll("[data-oc-tab]").forEach(b=>b.classList.toggle("active",b.dataset.ocTab===name));
  document.querySelectorAll(".oc-panel").forEach(p=>p.classList.toggle("hidden",p.id!=="oc_"+name));
}
function renderAll(){renderSummary();renderActions();renderSurveys();renderAdvisory();renderHistorical();renderSettings()}
function initOutcomes(){
  ensureV52();
  el("caSo").innerHTML=SOS.map(s=>`<option>${s}</option>`).join("")+'<option value="Program">Program-wide</option>';
  el("caStatus").innerHTML=ACTION_STATUS.map(s=>`<option>${s}</option>`).join("");
  el("caFilter").innerHTML='<option value="">All actions</option>'+ACTION_STATUS.map(s=>`<option>${s}</option>`).join("")+SOS.map(s=>`<option>${s}</option>`).join("");
  el("caFilter").onchange=renderActions;el("caSave").onclick=saveAction;el("caClear").onclick=clearActionForm;
  el("psPreviewBtn").onclick=previewSurvey;el("psTemplate").onclick=downloadSurveyTemplate;el("abSave").onclick=saveAdvisory;
  el("exportXlsx").onclick=exportXlsx;el("exportDocx").onclick=()=>exportDocx().catch(e=>alert("Export failed: "+e.message));
  document.querySelectorAll("[data-oc-tab]").forEach(b=>b.onclick=()=>showTab(b.dataset.ocTab));
  renderAll();
  const t=new URLSearchParams(location.search).get("tab");if(t&&el("oc_"+t))showTab(t);
}

/* ---------- 6. My Courses (simple instructor view) ---------- */
function initMyCourses(){
  ensureSyllabusEngine();
  const term=currentTermName(),email=(currentUser?.email||"").toLowerCase();
  const instructors=[...new Set(hub.currentAssignments.filter(a=>a.term===term).map(a=>a.instructor))].sort();
  const saved=localStorage.getItem("etdeMyInstructorName")||"";
  const guess=instructors.find(n=>n.toLowerCase()===email)||instructors.find(n=>email&&email.split("@")[0].split(/[._\d]/).filter(Boolean).some(p=>p.length>2&&n.toLowerCase().includes(p)))||"";
  const who=instructors.includes(saved)?saved:guess;
  el("mcTerm").textContent=term;
  el("mcWho").innerHTML='<option value="">— choose your name —</option>'+instructors.map(n=>`<option ${n===who?"selected":""}>${H(n)}</option>`).join("")+'<option value="__all">Show all courses this term</option>';
  el("mcWho").onchange=()=>{localStorage.setItem("etdeMyInstructorName",el("mcWho").value);renderMyCourses()};
  renderMyCourses();
}
function renderMyCourses(){
  const term=currentTermName(),who=el("mcWho").value,host=el("mcList");
  let rows=hub.currentAssignments.filter(a=>a.term===term);
  if(who&&who!=="__all")rows=rows.filter(a=>a.instructor===who);
  else if(!who)rows=[];
  if(!hub.currentAssignments.some(a=>a.term===term)){host.innerHTML=`<div class="notice">No courses have been assigned for ${H(term)} yet. Your ABET coordinator adds them on <a href="syllabus-engine.html">Syllabus & Semester</a>. You can still <a href="uploads.html">upload a gradebook</a> directly.</div>`;return}
  if(!rows.length){host.innerHTML='<div class="notice">Choose your name above to see your courses.</div>';return}
  host.innerHTML=rows.map(a=>{
    const req=requirementsForAssignment(a),done=req.filter(r=>requirementDone(a,r)).length;
    const maps=(hub.abetAssignmentMappings||[]).filter(m=>m.active!==false&&normCode(m.courseCode)===a.courseCode);
    const complete=req.length&&done===req.length;
    return `<section class="card"><h3>${complete?"✅":"⬜"} ${H(a.courseCode)} — ${H(a.courseName||"")}${a.section?` <small>Section ${H(a.section)}</small>`:""}</h3>
    ${req.length?`<p><strong>${done} of ${req.length} done this term.</strong></p>${req.map(r=>`<div class="requirement-item"><span>${H(r.label)}</span><span class="badge ${requirementDone(a,r)?"good":"warn"}">${requirementDone(a,r)?"Done":"To do"}</span></div>`).join("")}`:'<p class="notice success">No ABET evidence is scheduled for this course this term. Nothing to do.</p>'}
    ${maps.length?`<p class="muted">Look for this in your Canvas gradebook: ${maps.map(m=>`<strong>${H(m.assignmentName)}</strong> (${H(m.sloCode)})`).join(", ")}</p>`:""}
    ${req.some(r=>r.type==="quantitative"&&!requirementDone(a,r))?`<a class="btn primary" href="uploads.html?type=gradebook&course=${encodeURIComponent(a.courseCode)}&term=${encodeURIComponent(a.term)}">Upload Canvas grades</a>`:""}
    ${req.some(r=>r.type==="journals"&&!requirementDone(a,r))?` <a class="btn outline" href="uploads.html?type=journals&term=${encodeURIComponent(a.term)}">Upload journals</a>`:""}
    ${req.some(r=>r.type==="employer"&&!requirementDone(a,r))?` <a class="btn outline" href="uploads.html?type=microsoft-forms&term=${encodeURIComponent(a.term)}">Upload employer evaluations</a>`:""}
    </section>`}).join("");
}
/* Uploads page: honour links from My Courses (?type=gradebook&course=ETDE 2113&term=Fall 2026). */
function applyUploadLink(){
  const q=new URLSearchParams(location.search),type=q.get("type");if(!type)return;
  document.querySelector(`[data-upload-type="${CSS.escape(type)}"]`)?.click();
  const term=q.get("term"),sel=el("uploadTerm");
  if(term&&sel){if(![...sel.options].some(o=>o.value===term))sel.add(new Option(term,term),0);sel.value=term}
  const course=q.get("course"),cs=el("gradebookCourseSelect");
  if(course&&cs&&[...cs.options].some(o=>o.value===course)){cs.value=course;cs.dispatchEvent(new Event("change"))}
}
/* Reports page: show saved threshold/target instead of fixed 70/75. */
function applyReportDefaults(){const st=hubSettings();if(el("insertThreshold"))el("insertThreshold").value=st.threshold;if(el("insertTarget"))el("insertTarget").value=st.target}

window.v52=Object.assign(window.v52||{},{termToAY,soFromText,summarize,allResults,summarizeSurvey,likertValue,tableResults,tableSoCourse,tablePeoSo,exportXlsx,exportDocx});
onHubReady(()=>{
  ensureV52();
  const p=page();
  if(p==="outcomes.html")initOutcomes();
  if(p==="my-courses.html")initMyCourses();
  if(p==="uploads.html")applyUploadLink();
  if(p==="reports.html")applyReportDefaults();
});
})();
