/* v5.5: ETDE 3213 Final Project Presentation rubric (Project Management & Engineering Economics).
   Course grade: 80-point group score + 20-point individual score = 100.
   ABET evidence uses SO1/SO3/SO5 under the Final Project Presentation mapping. Older proposed
   records remain historical; only explicitly faculty-reviewed mapped records count as outcome evidence.
   Storage: hub.projectRubrics, one Firestore document per team record (abetHubs/{ws}/projectRubrics/{id}). */
(function(){
"use strict";
const el=id=>document.getElementById(id);
const H=v=>esc(v);
const LEVELS=["Poor","Limited","Satisfactory","Strong","Excellent"];
// Rating-to-points conversion from the rubric (index = rating 1..5).
const CONVERT={5:[1,2,3,4,5],8:[2,3,5,6,8],10:[2,4,6,8,10],12:[2,5,7,10,12]};
const GROUP=[
 ["overview","Project Overview & Objectives",8,["Purpose unclear; no goals","Basic purpose; goals missing","Purpose and most goals stated","Clear purpose and measurable goals","Compelling problem, goals and success measures"]],
 ["wbs","Project Planning & WBS",12,["No usable WBS","Incomplete tasks or ownership","Main tasks and roles shown","Well-organized tasks and milestones","Complete WBS with owners, dependencies and tracking"]],
 ["gantt","Schedule & Gantt Chart",8,["No credible schedule","Major dates or tasks missing","Timeline and key milestones shown","Planned vs. actual progress explained","Detailed schedule, variances and corrective actions"]],
 ["bom","Budget & Bill of Materials",12,["No usable BOM or costs","Major items or costs missing","Most items and estimated costs shown","Itemized BOM and actual costs compared","Complete BOM, cost variance and purchasing rationale"]],
 ["design","Technical Design & Execution",12,["Cannot explain design","Limited design or work evidence","Basic design and work described","Sound design with build/test evidence","Strong technical decisions supported by testing"]],
 ["challenges","Challenges & Problem-Solving",8,["No challenges addressed","Problems named, no solutions","Problems and basic fixes explained","Solutions and impact explained","Root causes, tradeoffs and lessons demonstrated"]],
 ["results","Final Results & Demonstration",10,["No results or evidence","Limited or unclear evidence","Partial demo or credible results","Working demo with testing evidence","Thorough demo, verification and limitations"]],
 ["lessons","Lessons Learned",5,["No meaningful reflection","Vague or generic reflection","Some specific lessons identified","Clear successes, failures and improvements","Insightful reflection tied to future practice"]],
 ["quality","Presentation Quality",5,["Disorganized; difficult to follow","Weak visuals or delivery","Understandable with some gaps","Organized, clear, professional","Polished, engaging, readable and well paced"]]
];
const INDIV=[
 ["contribution","Contribution",["Little/no assigned work completed","Major tasks incomplete; needed frequent prompting","Completed some assigned work","Completed most assigned work reliably","Completed all assigned work; meaningful initiative"]],
 ["knowledge","Project Knowledge",["Cannot explain own work","Limited understanding; major errors","Explains basic role with some gaps","Explains own work and key project decisions","Clearly explains own work and broader project"]],
 ["presentation","Presentation",["Does not meaningfully present","Minimal or unclear explanation","Adequate explanation with support","Clear, organized explanation","Confident, precise, professional explanation"]],
 ["accountability","Accountability & Teamwork",["Unreliable; little collaboration","Frequent missed commitments","Inconsistent follow-through","Dependable and cooperative","Consistently dependable; proactively supports team"]]
];
const ABET=[
 ["technical","Technical problem-solving","Technical Design & Execution; Challenges; Final Results","Ask each student to explain a technical choice, test result or corrective action."],
 ["communication","Communication","Presentation Quality; individual Presentation; Project Knowledge","Evaluate the student’s own spoken technical explanation and answers."],
 ["teamwork","Teamwork","Individual Contribution; Accountability & Teamwork","Use individual rubric scores plus documented assigned tasks or peer evidence."]
];
const ABET_PM=["Project management / economics","WBS; Gantt; BOM and budget","Use as course-level evidence; map to a program SO only if approved."];
const ABET_SCALE="1 = insufficient evidence; 2 = limited; 3 = meets expectations; 4 = strong; 5 = exemplary. 0 = no evidence.";
const SUGGESTED_LINE=3; // the rubric's *suggested* line; not approved by the program
const MIN_ROWS=5;
const PM=window.ProjectMapping;

/* ---------- pure scoring (exported for tests) ---------- */
function ratingPoints(max,rating){
  if(rating===""||rating===null||rating===undefined)return null;
  const r=Number(rating);if(r===0)return 0;
  const row=CONVERT[max];return row&&r>=1&&r<=5?row[r-1]:null;
}
function groupTotal(ratings){
  let total=0,scored=0;
  GROUP.forEach(([k,,max])=>{const p=ratingPoints(max,ratings?.[k]);if(p!==null){total+=p;scored++}});
  return {total,scored,complete:scored===GROUP.length};
}
const clamp5=v=>{if(v===""||v===null||v===undefined)return null;const n=Math.round(Number(v));return Number.isFinite(n)?Math.max(0,Math.min(5,n)):null};
function individualTotal(s){
  let total=0,scored=0;INDIV.forEach(([k])=>{const v=clamp5(s?.scores?.[k]);if(v!==null){total+=v;scored++}});
  return {total,scored,complete:scored===INDIV.length};
}
function finalScore(rec,s){
  const g=groupTotal(rec.ratings),i=individualTotal(s);
  return {group:g.total,individual:i.total,final:g.total+i.total,complete:g.complete&&i.complete};
}
const namedStudents=rec=>(rec.students||[]).filter(s=>String(s.name||"").trim());
/* Provisional attainment: share of students with an ABET rating at or above the rubric's suggested 3/5. */
function provisionalAttainment(records){
  const out={};ABET.forEach(([k])=>out[k]={rated:0,met:0,pct:null});
  records.forEach(r=>namedStudents(r).forEach(s=>ABET.forEach(([k])=>{const v=clamp5(s.abet?.[k]);if(v!==null){out[k].rated++;if(v>=SUGGESTED_LINE)out[k].met++}})));
  Object.values(out).forEach(o=>o.pct=o.rated?100*o.met/o.rated:null);
  return out;
}
window.ProjectRubric={GROUP,INDIV,ABET,CONVERT,ratingPoints,groupTotal,individualTotal,finalScore,provisionalAttainment};

/* ---------- page ---------- */
let current=null;
const blank=()=>({id:"pr_"+Date.now()+"_"+Math.random().toString(36).slice(2,8),course:"ETDE 3213",team:"",project:"",date:new Date().toISOString().slice(0,10),term:"",ratings:{},groupFeedback:"",students:[],mappingVersion:PM.VERSION,abetMappingStatus:"mapped",abetReview:{status:"unreviewed"}});
function ensure(){if(!Array.isArray(hub.projectRubrics))hub.projectRubrics=[]}
function passLine(){return window.hubSettings?window.hubSettings().threshold:70}

function renderForm(){
  const r=current;
  el("prTeam").value=r.team||"";el("prProject").value=r.project||"";el("prDate").value=r.date||"";el("prTerm").value=r.term||"";el("prFeedback").value=r.groupFeedback||"";
  el("prGroup").innerHTML=GROUP.map(([k,label,max,desc])=>{
    const v=r.ratings[k]??"";
    const opts=[`<option value="">Not scored yet</option>`,`<option value="0"${v===0||v==="0"?" selected":""}>0 · No evidence (0 pts)</option>`,...LEVELS.map((l,i)=>`<option value="${i+1}"${String(v)===String(i+1)?" selected":""}>${i+1} · ${l} (${CONVERT[max][i]} pts)</option>`)].join("");
    return `<tr><th scope="row">${H(label)}<div class="muted pr-desc" id="prDesc_${k}"></div></th><td>${max}</td><td><label class="sr-only" for="prR_${k}">${H(label)} rating</label><select id="prR_${k}" data-pr-rating="${k}">${opts}</select></td><td class="pr-pts" id="prP_${k}">—</td></tr>`;
  }).join("");
  if(r.students.length<MIN_ROWS)for(let i=r.students.length;i<MIN_ROWS;i++)r.students.push({name:"",scores:{},abet:{}});
  renderStudents();bindForm();recalc();renderEvidenceState();
}
function sel05(attr,k,i,v,title){
  return `<select ${attr}="${k}" data-i="${i}" aria-label="${H(title)}"><option value="">—</option>${[0,1,2,3,4,5].map(n=>`<option${String(v)===String(n)?" selected":""}>${n}</option>`).join("")}</select>`;
}
function renderStudents(){
  const r=current;
  el("prStudents").innerHTML=r.students.map((s,i)=>`<tr><td><input data-st-name data-i="${i}" value="${H(s.name)}" aria-label="Student ${i+1} name" placeholder="Student ${i+1}"></td>${INDIV.map(([k,l])=>`<td>${sel05("data-st-score",k,i,s.scores?.[k]??"",l+" for student "+(i+1))}</td>`).join("")}<td id="prInd_${i}">—</td><td id="prFin_${i}"><strong>—</strong></td><td><button class="btn outline" data-st-del="${i}" aria-label="Remove student ${i+1}">✕</button></td></tr>`).join("");
  el("prAbetRows").innerHTML=r.students.map((s,i)=>`<tr><td id="prAbetName_${i}">${H(s.name||"Student "+(i+1))}</td>${ABET.map(([k,l])=>`<td>${sel05("data-st-abet",k,i,s.abet?.[k]??"",l+" for student "+(i+1))}</td>`).join("")}<td><input data-st-note data-i="${i}" value="${H(s.abet?.note||"")}" aria-label="Evidence note for student ${i+1}"></td></tr>`).join("");
  document.querySelectorAll("[data-st-name]").forEach(x=>x.oninput=()=>{r.students[x.dataset.i].name=x.value;el("prAbetName_"+x.dataset.i).textContent=x.value||"Student "+(+x.dataset.i+1);markEvidenceUnreviewed()});
  document.querySelectorAll("[data-st-score]").forEach(x=>x.onchange=()=>{r.students[x.dataset.i].scores[x.dataset.stScore]=x.value===""?null:Number(x.value);markEvidenceUnreviewed();recalc()});
  document.querySelectorAll("[data-st-abet]").forEach(x=>x.onchange=()=>{const s=r.students[x.dataset.i];s.abet ||= {};s.abet[x.dataset.stAbet]=x.value===""?null:Number(x.value);markEvidenceUnreviewed()});
  document.querySelectorAll("[data-st-note]").forEach(x=>x.oninput=()=>{const s=r.students[x.dataset.i];s.abet ||= {};s.abet.note=x.value;markEvidenceUnreviewed()});
  document.querySelectorAll("[data-st-del]").forEach(b=>b.onclick=()=>{const s=r.students[b.dataset.stDel];if(String(s.name||"").trim()&&!confirm(`Remove ${s.name} from this team?`))return;r.students.splice(+b.dataset.stDel,1);markEvidenceUnreviewed();renderStudents();recalc();renderEvidenceState()});
}
function renderEvidenceState(){
  if(!el("prEvidenceBadge")||!PM||!current)return;
  current.abetReview ||= {status:PM.isCurrent(current)?"unreviewed":"proposed"};
  const status=PM.evidenceStatus(current),badge=el("prEvidenceBadge");
  badge.textContent=status==="reviewed"?"REVIEWED":status==="unreviewed"?"REVIEW NEEDED":"PROPOSED";
  badge.className="badge "+(status==="reviewed"?"good":"warn");
  const reviewedAt=current.abetReview?.reviewedAt?H(new Date(current.abetReview.reviewedAt).toLocaleString()):"";
  const reviewedBy=H(current.abetReview?.reviewedBy||"");
  el("prEvidenceStatus").innerHTML=status==="reviewed"?`<div class="notice success">Faculty-reviewed for the individual outcome evidence entered under SO 1, SO 3 and SO 5 on ${reviewedAt} by ${reviewedBy}. Blank outcome areas remain unassessed.</div>`:status==="unreviewed"?'<div class="notice">Direct individual ratings are saved separately from the team grade. Save the team, then use the review button after checking the evidence.</div>':'<div class="notice warning">Older proposed-evidence record preserved as historical. It does not enter official outcome totals.</div>';
  if(el("prReview")){
    el("prReview").textContent=status==="reviewed"?"Return to unreviewed":"Faculty review for official outcome use";
    el("prReview").disabled=status==="proposed";
  }
}
function markEvidenceUnreviewed(){
  if(current?.abetReview?.status==="reviewed"){
    current.abetReview={status:"unreviewed",unreviewedAt:new Date().toISOString(),unreviewedBy:currentUser?.email||""};
    renderEvidenceState();
  }
}
function bindForm(){
  document.querySelectorAll("[data-pr-rating]").forEach(x=>x.onchange=()=>{current.ratings[x.dataset.prRating]=x.value===""?null:Number(x.value);markEvidenceUnreviewed();recalc()});
  ["prTeam","prProject","prDate","prTerm","prFeedback"].forEach(id=>{const n=el(id);if(n&&!n.dataset.prBound){n.dataset.prBound="1";n.addEventListener("change",markEvidenceUnreviewed);n.addEventListener("input",markEvidenceUnreviewed)}});
}
function recalc(){
  const r=current,g=groupTotal(r.ratings);
  GROUP.forEach(([k,,max,desc])=>{const v=r.ratings[k];const p=ratingPoints(max,v);el("prP_"+k).textContent=p===null?"—":p;el("prDesc_"+k).textContent=v===0?"No evidence or no submission":v>=1?desc[v-1]:""});
  el("prGroupTotal").textContent=`${g.total} / 80`+(g.complete?"":` (${g.scored} of ${GROUP.length} scored)`);
  el("prGroupBadge").textContent=g.total;
  r.students.forEach((s,i)=>{const t=individualTotal(s);if(!el("prInd_"+i))return;el("prInd_"+i).textContent=t.scored?`${t.total} / 20`:"—";el("prFin_"+i).innerHTML=t.scored||g.scored?`<strong>${g.total+t.total}</strong> / 100${g.complete&&t.complete?"":' <span class="muted">(in progress)</span>'}`:"<strong>—</strong>"});
}
function readHeader(){const r=current;r.team=el("prTeam").value.trim();r.project=el("prProject").value.trim();r.date=el("prDate").value;r.term=el("prTerm").value.trim();r.groupFeedback=el("prFeedback").value}
function snapshotTotals(r){
  const g=groupTotal(r.ratings);r.groupTotal=g.total;r.groupComplete=g.complete;
  r.students=r.students.filter(s=>String(s.name||"").trim()||Object.values(s.scores||{}).some(v=>v!==null&&v!==undefined));
  r.students.forEach(s=>{const f=finalScore(r,s);s.individualTotal=f.individual;s.finalScore=f.final});
}
async function saveRecord(){
  readHeader();const msg=el("prMsg");
  if(!current.team){msg.innerHTML='<div class="notice warning">Please add a team name before saving.</div>';el("prTeam").focus();return}
  ensure();const rec=JSON.parse(JSON.stringify(current));snapshotTotals(rec);
  // New mapped records keep mappingVersion / mapped / review state. Legacy proposed stay proposed.
  if(rec.mappingVersion===PM.VERSION){
    rec.abetMappingStatus="mapped";
    rec.abetReview ||= {status:"unreviewed"};
  }else if(!rec.mappingVersion){
    rec.abetMappingStatus=rec.abetMappingStatus||"proposed";
  }
  rec.updatedAt=new Date().toISOString();rec.updatedBy=currentUser?.email||"";
  const i=hub.projectRubrics.findIndex(x=>x.id===rec.id);
  const prev=i>=0?hub.projectRubrics[i]:null;
  if(i>=0)hub.projectRubrics[i]=rec;else{rec.createdAt=rec.updatedAt;rec.createdBy=rec.updatedBy;hub.projectRubrics.push(rec)}
  try{await saveHub();msg.innerHTML=`<div class="notice success">Saved ${H(rec.team)}.</div>`;current=JSON.parse(JSON.stringify(rec));renderForm();renderList();renderReports()}
  catch(e){if(prev)hub.projectRubrics[i]=prev;else hub.projectRubrics=hub.projectRubrics.filter(x=>x.id!==rec.id);msg.innerHTML=`<div class="notice warning">Not saved: ${H(e.message||e)}</div>`}
}
function openRecord(id){
  const r=hub.projectRubrics.find(x=>x.id===id);if(!r)return;
  current=JSON.parse(JSON.stringify(r));current.ratings ||= {};current.students ||= [];
  current.students.forEach(s=>{s.scores ||= {};s.abet ||= {}});
  // Do not upgrade historical proposed records.
  if(current.mappingVersion===PM.VERSION){current.abetMappingStatus="mapped";current.abetReview ||= {status:"unreviewed"}}
  el("prMsg").innerHTML="";renderForm();showTab("score");el("prTeam").focus();
}
function newRecord(){current=blank();el("prMsg").innerHTML="";if(el("prReviewMsg"))el("prReviewMsg").innerHTML="";renderForm()}
function renderList(){
  ensure();const host=el("prList");
  const list=hub.projectRubrics.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  host.innerHTML=list.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Team</th><th>Project</th><th>Students</th><th>Group</th><th>Evidence</th><th></th></tr></thead><tbody>${list.map(r=>{const st=PM?PM.evidenceStatus(r):"proposed";return `<tr><td>${H(r.date)}</td><td>${H(r.team)}</td><td>${H(r.project)}</td><td>${namedStudents(r).length}</td><td>${groupTotal(r.ratings).total} / 80</td><td><span class="badge ${st==="reviewed"?"good":"warn"}">${st==="reviewed"?"Reviewed":st==="unreviewed"?"Review needed":"Proposed"}</span></td><td><button class="btn outline" data-pr-open="${H(r.id)}">Open</button> <button class="btn outline" data-pr-del="${H(r.id)}" aria-label="Delete ${H(r.team)}">Delete</button></td></tr>`}).join("")}</tbody></table></div>`:'<div class="notice">No teams scored yet. Fill in the form to add the first one.</div>';
  host.querySelectorAll("[data-pr-open]").forEach(b=>b.onclick=()=>openRecord(b.dataset.prOpen));
  host.querySelectorAll("[data-pr-del]").forEach(b=>b.onclick=async()=>{const r=hub.projectRubrics.find(x=>x.id===b.dataset.prDel);if(!r||!confirm(`Delete the rubric for ${r.team}? This cannot be undone.`))return;const before=hub.projectRubrics;hub.projectRubrics=before.filter(x=>x!==r);try{await saveHub()}catch(e){hub.projectRubrics=before;alert("Not deleted: "+(e.message||e))}if(current?.id===r.id)newRecord();renderList();renderReports()});
}

/* ---------- reports & graphs ---------- */
function bar(label,value,max,note){
  const pct=value===null?0:Math.max(0,Math.min(100,100*value/max));
  return `<div class="pr-bar"><span class="pr-bar-label">${H(label)}</span><span class="pr-bar-track" role="img" aria-label="${H(label)}: ${value===null?"no data":H(note)}"><span class="pr-bar-fill" style="width:${pct.toFixed(1)}%"></span></span><span class="pr-bar-val">${value===null?"—":H(note)}</span></div>`;
}
function reportRows(records){
  const rows=[];records.forEach(r=>namedStudents(r).forEach(s=>{const f=finalScore(r,s);rows.push({r,s,f})}));return rows;
}
function outcomeBars(statsObj){
  return PM.OUTCOMES.map(o=>{
    const st=statsObj[o.so]||{assessed:0,met:0,rate:null,threshold:passLine(),target:null};
    return bar(`${o.so} — ${o.area}`,st.rate,100,st.rate===null?"":`${st.rate.toFixed(1)}% (${st.met} of ${st.assessed}; threshold ${st.threshold}%)`);
  }).join("");
}
function renderReports(){
  ensure();const host=el("prReports");if(!host)return;
  const term=el("prRepTerm")?.value||"";
  const terms=[...new Set(hub.projectRubrics.map(r=>r.term).filter(Boolean))].sort();
  const tsel=el("prRepTerm");if(tsel){const keep=tsel.value;tsel.innerHTML=`<option value="">All terms</option>`+terms.map(t=>`<option${t===keep?" selected":""}>${H(t)}</option>`).join("")}
  const recs=hub.projectRubrics.filter(r=>!term||r.term===term);
  if(!recs.length){host.innerHTML='<div class="notice">Reports appear here after you save at least one team.</div>';return}
  const line=passLine(),rows=reportRows(recs),pass=rows.filter(x=>x.f.final>=line).length;
  const byCat=GROUP.map(([k,l,max])=>{const pts=recs.map(r=>ratingPoints(max,r.ratings?.[k])).filter(v=>v!==null);const avg=pts.length?pts.reduce((a,b)=>a+b,0)/pts.length:null;return bar(l,avg,max,avg===null?"":`${avg.toFixed(1)} / ${max}`)}).join("");
  const trend=recs.slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))).map(r=>{const g=groupTotal(r.ratings).total;return bar(`${r.date||"No date"} · ${r.team}`,g,80,`${g} / 80`)}).join("");
  const reviewed=recs.filter(r=>PM.isOfficial(r));
  const unreviewed=recs.filter(r=>PM.isCurrent(r)&&!PM.isOfficial(r));
  const proposed=recs.filter(r=>!PM.isCurrent(r)&&!PM.isOfficial(r));
  const reviewedStats=PM.stats(reviewed,true);
  const unreviewedStats=PM.stats(unreviewed,false);
  const att=provisionalAttainment(proposed);
  host.innerHTML=`<section class="card"><h3>Course grade: pass / below ${line}%</h3><p class="muted">Final score (group + individual) compared with the Hub's ${line}% individual threshold from Settings.</p>
  <p><strong>${pass} of ${rows.length}</strong> students at or above ${line} / 100 ${rows.length?`(${(100*pass/rows.length).toFixed(1)}%)`:""}.</p>
  ${bar("At or above "+line,rows.length?pass:null,rows.length||1,`${pass}`)}${bar("Below "+line,rows.length?rows.length-pass:null,rows.length||1,`${rows.length-pass}`)}
  <details><summary>Show each student</summary><div class="table-wrap"><table class="table"><thead><tr><th>Team</th><th>Student</th><th>Group /80</th><th>Individual /20</th><th>Final /100</th><th>Result</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${H(x.r.team)}</td><td>${H(x.s.name)}</td><td>${x.f.group}</td><td>${x.f.individual}</td><td>${x.f.final}</td><td><span class="badge ${x.f.final>=line?"good":"warn"}">${x.f.final>=line?"At or above":"Below"}</span>${x.f.complete?"":' <span class="muted">(in progress)</span>'}</td></tr>`).join("")}</tbody></table></div></details></section>
  <section class="card"><h3>Average points by group category</h3>${byCat}</section>
  <section class="card"><h3>Group score trend (by presentation date)</h3>${trend}</section>
  <section class="card"><h3>Reviewed official outcome attainment <span class="badge good">REVIEWED</span></h3>
  <p class="muted">Only faculty-reviewed teams under the Final Project Presentation mapping. Individual threshold ${line}% (4 or 5 of 5). Program target from Settings.</p>
  ${reviewed.length?outcomeBars(reviewedStats):'<div class="notice">No reviewed teams in this filter yet.</div>'}</section>
  <section class="card"><h3>Mapped — faculty review needed <span class="badge warn">UNREVIEWED</span></h3>
  <p class="muted">Saved under the current mapping but not yet faculty-reviewed. These ratings do not enter official outcome totals.</p>
  ${unreviewed.length?outcomeBars(unreviewedStats)+`<p class="muted">${unreviewed.length} team(s) waiting for review.</p>`:'<div class="notice">No unreviewed mapped teams in this filter.</div>'}</section>
  <section class="card pr-proposed"><h3>Proposed / historical ABET evidence <span class="badge warn">PROPOSED · not official</span></h3>
  <p>Share of rated students at <strong>${SUGGESTED_LINE}/5 or higher</strong>, the rubric's <em>suggested</em> line. Older proposed records are preserved and excluded from official Outcomes, Reports, and self-study tables.</p>
  ${proposed.length?ABET.map(([k,l])=>bar(l,att[k].pct,100,att[k].pct===null?"":`${att[k].pct.toFixed(1)}% (${att[k].met} of ${att[k].rated})`)).join("")+'<p class="muted">'+proposed.length+" proposed/historical team(s).</p>":'<div class="notice">No proposed/historical teams in this filter.</div>'}</section>`;
}
const csvCell=v=>{const s=String(v??"");return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s};
function buildCsv(records){
  const thr=passLine();
  const head=["Course","Term","Date","Team","Project","Student",...GROUP.map(([,l,m])=>`${l} (/${m})`),"Group total (/80)",...INDIV.map(([,l])=>`${l} (/5)`),"Individual total (/20)","Final (/100)","Scoring complete","Outcome","Assessment area","Direct rating (0-5)","Meets individual threshold","Individual threshold %","Evidence status","Evidence note","PROPOSED Technical problem-solving (0-5)","PROPOSED Communication (0-5)","PROPOSED Teamwork (0-5)","PROPOSED evidence note","Legacy ABET mapping status"];
  const lines=[head];
  const outcomes=PM&&PM.OUTCOMES?PM.OUTCOMES:ABET.map(([k,l],i)=>({key:k,so:"SO?",area:l}));
  records.forEach(r=>namedStudents(r).forEach(s=>{
    const f=finalScore(r,s);
    const status=PM?PM.evidenceStatus(r):(r.abetMappingStatus||"proposed");
    const statusLabel=status==="reviewed"?"reviewed":status==="unreviewed"?"unreviewed — mapped, faculty review needed":"PROPOSED - not mapped to approved SOs/PIs; do not report as official SO results";
    const gradePart=[r.course||"ETDE 3213",r.term,r.date,r.team,r.project,s.name,...GROUP.map(([k,,m])=>ratingPoints(m,r.ratings?.[k])??""),f.group,...INDIV.map(([k])=>clamp5(s.scores?.[k])??""),f.individual,f.final,f.complete?"yes":"no"];
    const proposedPart=[...ABET.map(([k])=>clamp5(s.abet?.[k])??""),s.abet?.note||"",r.abetMappingStatus==="proposed"||status==="proposed"?"PROPOSED - not mapped to approved SOs/PIs; do not report as official SO results":(r.abetMappingStatus||status)];
    outcomes.forEach(o=>{
      const rating=clamp5(s.abet?.[o.key]);
      const meets=rating===null?"":(PM?PM.meets(rating,thr):(rating/5*100>=thr))?"yes":"no";
      lines.push([...gradePart,o.so||"",o.area||"",rating??"",meets,thr,statusLabel,s.abet?.note||"",...proposedPart]);
    });
  }));
  return "\ufeff"+lines.map(l=>l.map(csvCell).join(",")).join("\r\n");
}
window.ProjectRubric.buildCsv=buildCsv;
function downloadCsv(){
  ensure();const term=el("prRepTerm")?.value||"";const recs=hub.projectRubrics.filter(r=>!term||r.term===term);
  const blob=new Blob([buildCsv(recs)],{type:"text/csv"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`ETDE3213_Project_Rubric_${(term||"all").replace(/\W+/g,"_")}.csv`;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500);
}
function msgReview(text){el("prReviewMsg").innerHTML='<div class="notice warning">'+H(text)+"</div>"}
async function reviewRecord(){
  readHeader();
  if(!el("prReviewMsg"))return;
  el("prReviewMsg").innerHTML="";
  ensure();
  const i=hub.projectRubrics.findIndex(x=>x.id===current.id);
  if(i<0){msgReview("Save this team under the new mapping first.");return}
  if(!PM.isCurrent(current)&&current.mappingVersion!==PM.VERSION){msgReview("Older proposed records stay historical and cannot be marked reviewed under this mapping.");return}
  // Ensure mapped fields before review of a newly created team that was saved.
  if(!current.mappingVersion){msgReview("Save this team under the new mapping first.");return}
  const rows=namedStudents(current);
  if(PM.isOfficial(current)){
    if(!confirm("Return this team to unreviewed? Its direct ratings will no longer count in reviewed attainment totals."))return;
    current.abetReview={status:"unreviewed",unreviewedAt:new Date().toISOString(),unreviewedBy:currentUser?.email||""};
  }else{
    if(!rows.length){msgReview("Add and save at least one named student before review.");return}
    const direct=rows.every(s=>PM.OUTCOMES.some(o=>{const v=s.abet?.[o.key];return v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v))}));
    if(!direct){msgReview("Enter a direct outcome rating for each named student before review. Unassessed areas may remain blank but need evidence later.");return}
    current.abetMappingStatus="mapped";
    current.mappingVersion=PM.VERSION;
    current.abetReview={status:"reviewed",reviewedAt:new Date().toISOString(),reviewedBy:currentUser?.email||"",mappingVersion:PM.VERSION};
  }
  const before=JSON.parse(JSON.stringify(hub.projectRubrics||[]));
  snapshotTotals(current);
  current.updatedAt=new Date().toISOString();current.updatedBy=currentUser?.email||"";
  hub.projectRubrics[i]=JSON.parse(JSON.stringify(current));
  try{await saveHub();renderEvidenceState();renderList();renderReports();el("prReviewMsg").innerHTML='<div class="notice success">Review status saved.</div>'}catch(e){hub.projectRubrics=before;current=JSON.parse(JSON.stringify(before[i]||current));current.ratings||={};current.students||=[];renderEvidenceState();msgReview("Review status not saved: "+(e.message||e))}
}
async function applyProjectMapping(){
  if(!el("prMapMsg"))return;
  if(typeof admin==="function"&&!admin()){el("prMapMsg").innerHTML='<div class="notice warning">An administrator needs to update assignment mappings. Your course grades and assessment records are unchanged.</div>';return}
  if(!confirm("Use the Final Project Presentation mapping for SO1, SO3 and SO5 in this workspace? The old Email Assignment will remain inactive for historical records. No grades or previous assessments are changed."))return;
  const before=JSON.parse(JSON.stringify(hub.abetAssignmentMappings||[]));
  try{const {collection}=PM.upgradeMappings(hub.abetAssignmentMappings||[],currentUser?.email||"",new Date().toISOString());hub.abetAssignmentMappings=collection;await saveHub();el("prMapMsg").innerHTML='<div class="notice success">Final-presentation mapping is now current for SO1, SO3 and SO5. The Email Assignment is retained as historical. No existing grades were changed.</div>';if(el('prDetailedMap'))el('prDetailedMap').innerHTML=PM.detailedHtml();if(typeof renderMappings==="function")renderMappings()}catch(e){hub.abetAssignmentMappings=before;el("prMapMsg").innerHTML='<div class="notice warning">Mapping not saved: '+H(e.message||e)+"</div>"}
}
function renderGuide(){
  const conv=`<div class="table-wrap"><table class="table"><thead><tr><th>Maximum</th>${LEVELS.map((l,i)=>`<th>${i+1} · ${l}</th>`).join("")}</tr></thead><tbody>${[5,8,10,12].map(m=>`<tr><th scope="row">${m} pts</th>${CONVERT[m].map(p=>`<td>${p}</td>`).join("")}</tr>`).join("")}</tbody></table></div><p class="muted">0 points = no evidence or no submission for that category.</p>`;
  const grid=(rows,first)=>`<div class="table-wrap"><table class="table"><thead><tr><th>${first}</th>${LEVELS.map((l,i)=>`<th>${i+1} · ${l}</th>`).join("")}</tr></thead><tbody>${rows.map(([l,d])=>`<tr><th scope="row">${H(l)}</th>${d.map(x=>`<td>${H(x)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  if(el("prGuide"))el("prGuide").innerHTML=`<h4>Group categories (rate 1–5, then convert)</h4>${grid(GROUP.map(g=>[g[1]+" ("+g[2]+")",g[3]]),"Category")}<h4>Rating-to-points conversion</h4>${conv}<h4>Individual student (0–5 points each)</h4>${grid(INDIV.map(x=>[x[1],x[2]]),"Category")}<p class="muted">0 points: no evidence of participation or performance in that category. Final score = group score (out of 80) + individual score (out of 20).</p><h4>Direct outcome evidence (SO 1, SO 3, SO 5)</h4><div class="table-wrap"><table class="table"><thead><tr><th>Assessment area</th><th>Evidence from the rubric</th><th>Individual method</th></tr></thead><tbody>${[...ABET.map(a=>a.slice(1)),ABET_PM].map(a=>`<tr><td>${H(a[0])}</td><td>${H(a[1])}</td><td>${H(a[2])}</td></tr>`).join("")}</tbody></table></div><p class="muted">Rating scale: ${H(ABET_SCALE)} Official attainment uses the Hub individual threshold from Settings (typically 70%, so 4 or 5 of 5). Older proposed records remain excluded until replaced by reviewed mapped evidence.</p>`;
}
function showTab(t){document.querySelectorAll("[data-pr-tab]").forEach(b=>{const on=b.dataset.prTab===t;b.classList.toggle("active",on);b.setAttribute("aria-selected",on)});document.querySelectorAll(".pr-panel").forEach(p=>p.classList.toggle("hidden",p.id!=="pr_"+t));if(t==="reports")renderReports()}

onHubReady(()=>{
  if(!el("prGroup")||!PM)return;
  ensure();renderGuide();newRecord();renderList();renderReports();
  document.querySelectorAll("[data-pr-tab]").forEach(b=>b.onclick=()=>showTab(b.dataset.prTab));
  if(el("prReview"))el("prReview").onclick=reviewRecord;
  if(el("prApplyMap"))el("prApplyMap").onclick=applyProjectMapping;
  if(el("prDetailedMap"))el("prDetailedMap").innerHTML=PM.detailedHtml();
  if(el("prMeetingRecord")&&window.ProjectChangeMinutes){
    el("prMeetingRecord").innerHTML=ProjectChangeMinutes.detailsHtml();
    el("prSaveMinutes").onclick=async()=>{const r=await ProjectChangeMinutes.saveProjectChangeMinutes();el("prMinutesMsg").innerHTML='<div class="notice '+(r.ok?'success':'warning')+'">'+H(r.message)+"</div>"};
  }
  el("prSave").onclick=saveRecord;el("prNew").onclick=()=>{if(confirm("Start a new team? Unsaved changes on this form will be cleared."))newRecord()};
  el("prAddStudent").onclick=()=>{current.students.push({name:"",scores:{},abet:{}});markEvidenceUnreviewed();renderStudents();recalc()};
  el("prPrint").onclick=()=>{readHeader();window.print()};
  el("prCsv").onclick=downloadCsv;el("prRepTerm").onchange=renderReports;
});
})();
