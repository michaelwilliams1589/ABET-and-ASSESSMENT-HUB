/* ETDE 3213: final-presentation assessment mapping, selected by Michael Williams on 2026-11-06.
   Uses the bachelor program's existing approved SOs, not newly invented official PIs. */
(function(){
"use strict";
const VERSION="etde3213-final-presentation-v1";
const SOURCE="OSUIT BT Instrumentation Engineering Technology Self-Study Report (June 20, 2025), Criterion 3; existing outcomes reaffirmed October 30 and November 12, 2025";
const OUTCOMES=[
 {key:"technical",so:"SO1",sloCode:"SLO 1",area:"Technical problem-solving",statement:"An ability to apply knowledge, techniques, skills and modern tools of mathematics, science, engineering, and technology to solve broadly-defined engineering problems appropriate to the discipline.",evidence:"Supporting rubric evidence: Technical Design & Execution (/12), Challenges & Problem-Solving (/8), Final Results & Demonstration (/10), and individual Project Knowledge (/5).",method:"Ask each student to explain a technical choice, test result or corrective action. Enter the student's own Technical rating (0–5) and observation. Shared group points do not alone establish individual attainment."},
 {key:"communication",so:"SO3",sloCode:"SLO 3",area:"Communication",statement:"An ability to apply written, oral, and graphical communication in broadly-defined technical and non-technical environments; and an ability to identify and use appropriate technical literature.",evidence:"Supporting rubric evidence: group Presentation Quality (/5), individual Presentation (/5), and individual Project Knowledge (/5).",method:"Evaluate each student's own spoken technical explanation and answers. Enter an individual Communication rating (0–5) and observation."},
 {key:"teamwork",so:"SO5",sloCode:"SLO 5",area:"Teamwork",statement:"An ability to function effectively as a member as well as a leader on technical teams.",evidence:"Rubric evidence: individual Contribution (/5) and Accountability & Teamwork (/5), plus assigned tasks or peer evidence.",method:"Enter an individual Teamwork rating (0–5) and note the student's responsibilities, collaboration, accountability and leadership when observed."}
];
function threshold(){const n=Number(window.hubSettings?hubSettings().threshold:70);return Number.isFinite(n)&&n>=0&&n<=100?n:70}
function target(){const n=Number(window.hubSettings?hubSettings().target:75);return Number.isFinite(n)&&n>=0&&n<=100?n:75}
function meets(rating,thresholdPercent=70){return rating!==null&&rating!==undefined&&rating!==""&&Number.isFinite(Number(rating))&&Number(rating)/5*100>=thresholdPercent}
function isCurrent(record){return record?.mappingVersion===VERSION&&record?.abetMappingStatus==="mapped"}
function isOfficial(record){return isCurrent(record)&&record?.abetReview?.status==="reviewed"}
function evidenceStatus(record){return isOfficial(record)?"reviewed":isCurrent(record)?"unreviewed":"proposed"}
function statusLabel(record){return isOfficial(record)?"Reviewed for official outcome use":isCurrent(record)?"Mapped — faculty review needed":"Proposed / historical — not official"}
function stats(records,reviewedOnly=false){
 const rows=records.filter(r=>!reviewedOnly||isOfficial(r)),out={};
 OUTCOMES.forEach(o=>{let assessed=0,met=0;rows.forEach(r=>(r.students||[]).filter(s=>String(s.name||"").trim()).forEach(s=>{const v=s.abet?.[o.key];if(v===null||v===undefined||v===""||!Number.isFinite(Number(v)))return;assessed++;if(meets(v,threshold()))met++}));let rate=assessed?met/assessed*100:null;out[o.so]={assessed,met,rate,target:target(),targetMet:rate!==null&&rate>=target(),threshold:threshold()}});return out;
}
function currentMap(){return (window.hub?.abetAssignmentMappings||[]).filter(m=>m.active!==false&&m.courseCode==="ETDE 3213"&&m.assessmentKind==="final-project-rubric"&&OUTCOMES.some(o=>o.sloCode===m.sloCode))}
function mapFullyApplied(){return currentMap().length===3}
function workspaceStatus(collection){
  const old=collection.find(m=>m.id==="map-slo3-etde3213"&&/email assignment/i.test(m.assignmentName||""));
  if(currentMap().length===3&&old&&old.active!==false)return "applied-existing";
  if(currentMap().length===3&&!collection.some(m=>m.id==="map-slo3-etde3213"))return "applied-new";
  if(currentMap().length===3&&old?.active===false)return "applied-existing";
  return "upgrade-needed";
}
function workspaceNoticeHtml(){
 const status=workspaceStatus(window.hub?.abetAssignmentMappings||[]);
 if(status==="applied-existing")return '<div class="notice success">This saved workspace uses Final Project Presentation for SO 1, SO 3 and SO 5; the Email Assignment is inactive and preserved as historical.</div>';
 if(status==="applied-new")return '<div class="notice success">This is a new workspace using the current Final Project Presentation mapping for SO 1, SO 3 and SO 5.</div>';
 return '<div class="notice">To apply this mapping to your saved workspace, use the button above. The old Email Assignment stays as an inactive historical mapping so original records retain their meaning.</div>';
}
function upgradeMappings(collection,actor,at){
 if(!Array.isArray(collection))collection=[];
 const before=collection.length;
 const old=collection.find(m=>m.id==="map-slo3-etde3213"&&/email assignment/i.test(m.assignmentName||""));
 if(old){old.active=false;old.status="historical";old.replacedBy="map-slo3-etde3213-final-presentation";old.historicalReason="Historical Email Assignment mapping retained for original records; new assessments use Final Project Presentation beginning Fall 2026.";old.replacedOn="2026-11-06"}
 const seed=(window.ABET_ASSIGNMENT_MAPPING_SEED||[]).filter(m=>m.mappingVersion===VERSION);
 seed.forEach(def=>{const i=collection.findIndex(m=>m.id===def.id);if(i<0)collection.push({...def,aliases:[...(def.aliases||[])]});else if(collection[i].active===false){collection[i]={...collection[i],...def,active:true,aliases:[...(def.aliases||[])]}}});
 return {collection,added:collection.length-before,appliedBy:actor,appliedAt:at};
}
function detailedHtml(){return `<h3>Final Project Presentation mapping</h3><p><strong>Program:</strong> Bachelor of Technology in Instrumentation Engineering Technology<br><strong>Course:</strong> ETDE 3213 — Project Management &amp; Engineering Economics<br><strong>Mapping:</strong> <span class="badge good">Current</span> selected by Michael Williams on November 6, 2026; effective Fall 2026.</p>${workspaceNoticeHtml()}<p><strong>Individual threshold:</strong> 70% = 3.5/5, so a direct rating of 4 or 5 meets it (4/5 = 80%). <strong>Program target:</strong> 75% of assessed students meet the threshold. Official attainment counts only reviewed teams; existing grades and proposed records are not changed.</p><div class="table-wrap"><table class="table"><thead><tr><th>Outcome and approved statement</th><th>Course performance evidence</th><th>Direct individual assessment method</th></tr></thead><tbody>${OUTCOMES.map(o=>`<tr><td><strong>${o.so} — ${o.area}</strong><br>${o.statement}</td><td>${o.evidence}</td><td>${o.method}</td></tr>`).join("")}</tbody></table></div><h4>Course-level evidence, not a separate SO</h4><p>Work Breakdown Structure, Gantt schedule, Bill of Materials and budget remain strong evidence of project-management and economics learning. They are not assigned an invented program outcome or performance indicator in this mapping. No SO 2 or SO 4 mapping is claimed.</p><h4>Source and interpretation</h4><p>${SOURCE}. Rubric items above are <strong>locally-derived course performance evidence</strong>, not new official program performance-indicator numbers. This mapping does not assert ABET or advisory-board approval of a new program definition.</p><h4>Historical assessment</h4><p>Previous SO 3 assessment: Email Assignment. It is replaced for this new Final Project Presentation workflow and retained as a historical mapping, not erased or retroactively reinterpreted.</p>`}
window.ProjectMapping={VERSION,SOURCE,OUTCOMES,meets,stats,isCurrent,isOfficial,evidenceStatus,statusLabel,upgradeMappings,mapFullyApplied,workspaceStatus,workspaceNoticeHtml,currentMap,detailedHtml};
})();
