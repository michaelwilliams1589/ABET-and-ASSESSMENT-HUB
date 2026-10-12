
(function(){
"use strict";
function ensureMappings(){
  window.hub ||= {};
  if(!Array.isArray(window.hub.abetAssignmentMappings)){
    window.hub.abetAssignmentMappings=JSON.parse(JSON.stringify(window.ABET_ASSIGNMENT_MAPPING_SEED||[]));
  }
  return window.hub.abetAssignmentMappings;
}
function norm(s){return String(s||"").trim().toLowerCase().replace(/[^a-z0-9]+/g," ")}
function mappingMatchesCourse(m,code){
  const n=normalizeCourse(code)||String(code||"").toUpperCase();
  return normalizeCourse(m.courseCode)===n||(m.legacyCourseCodes||[]).some(x=>normalizeCourse(x)===n);
}
function renderMappings(){
  ensureMappings();
  const host=document.getElementById("mappingList");if(!host)return;
  const slo=document.getElementById("mappingSloFilter").value;
  const course=document.getElementById("mappingCourseFilter").value;
  const q=norm(document.getElementById("mappingSearch").value);
  const rows=hub.abetAssignmentMappings.filter(m=>m.active!==false&&(!slo||m.sloCode===slo)&&(!course||mappingMatchesCourse(m,course))&&(!q||norm(JSON.stringify(m)).includes(q)));
  host.innerHTML=rows.map(m=>`<div class="mapping-card">
  <div><span class="badge">${m.sloCode}</span><strong>${m.courseCode} — ${m.courseName||""}</strong></div>
  <h4>${m.assignmentName}</h4>
  <p><strong>Recognized aliases:</strong> ${(m.aliases||[]).join(", ")||"None"}</p>
  ${(m.legacyCourseCodes||[]).length?`<p><strong>Legacy course code:</strong> ${m.legacyCourseCodes.join(", ")}</p>`:""}
  ${admin()?`<div class="actions"><button class="btn outline" data-edit-map="${m.id}">Edit</button><button class="btn danger" data-disable-map="${m.id}">Disable</button></div>`:""}
  </div>`).join("")||'<div class="notice">No mappings match the filters.</div>';
  document.querySelectorAll("[data-edit-map]").forEach(b=>b.onclick=()=>editMapping(b.dataset.editMap));
  document.querySelectorAll("[data-disable-map]").forEach(b=>b.onclick=()=>disableMapping(b.dataset.disableMap));
}
function populateMappingFilters(){
  ensureMappings();
  const slos=[...new Set(hub.abetAssignmentMappings.map(m=>m.sloCode))].sort();
  const courses=[...new Set(hub.abetAssignmentMappings.map(m=>m.courseCode))].sort();
  document.getElementById("mappingSloFilter").innerHTML='<option value="">All Outcomes</option>'+slos.map(x=>`<option>${esc(x)}</option>`).join("");
  document.getElementById("mappingEditSlo").innerHTML=slos.map(x=>`<option>${esc(x)}</option>`).join("");
  document.getElementById("mappingCourseFilter").innerHTML='<option value="">All Courses</option>'+courses.map(x=>`<option>${esc(x)}</option>`).join("");
}
function editMapping(idn){
  const m=hub.abetAssignmentMappings.find(x=>x.id===idn);if(!m)return;
  document.getElementById("mappingEditId").value=m.id;
  document.getElementById("mappingEditSlo").value=m.sloCode;
  document.getElementById("mappingEditCourse").value=m.courseCode;
  document.getElementById("mappingEditCourseName").value=m.courseName||"";
  document.getElementById("mappingEditAssignment").value=m.assignmentName;
  document.getElementById("mappingEditAliases").value=(m.aliases||[]).join(", ");
  document.getElementById("mappingEditLegacy").value=(m.legacyCourseCodes||[]).join(", ");
  document.getElementById("mappingEditAssignment").focus();
}
function clearMappingForm(){
  ["mappingEditId","mappingEditCourse","mappingEditCourseName","mappingEditAssignment","mappingEditAliases","mappingEditLegacy"].forEach(idn=>document.getElementById(idn).value="");
}
async function saveMapping(){
  ensureMappings();
  const idn=document.getElementById("mappingEditId").value;
  const row={
    id:idn||id("abetMap"),sloCode:document.getElementById("mappingEditSlo").value,
    courseCode:normalizeCourse(document.getElementById("mappingEditCourse").value)||document.getElementById("mappingEditCourse").value.trim().toUpperCase(),
    courseName:document.getElementById("mappingEditCourseName").value.trim(),
    assignmentName:document.getElementById("mappingEditAssignment").value.trim(),
    aliases:document.getElementById("mappingEditAliases").value.split(",").map(x=>x.trim()).filter(Boolean),
    legacyCourseCodes:document.getElementById("mappingEditLegacy").value.split(",").map(x=>x.trim().toUpperCase()).filter(Boolean),
    active:true,updatedAt:now(),updatedBy:currentUser.email
  };
  if(!row.sloCode||!row.courseCode||!row.assignmentName)return alert("Student Outcome, course code, and assignment are required.");
  const existing=hub.abetAssignmentMappings.findIndex(x=>x.id===row.id);
  if(existing>=0)hub.abetAssignmentMappings[existing]={...hub.abetAssignmentMappings[existing],...row};
  else hub.abetAssignmentMappings.push(row);
  await saveHub();clearMappingForm();populateMappingFilters();renderMappings();
  document.getElementById("mappingMessage").innerHTML='<div class="notice success">Assignment mapping saved.</div>';
}
async function disableMapping(idn){
  const row=hub.abetAssignmentMappings.find(x=>x.id===idn);if(!row||!confirm(`Disable ${row.courseCode} — ${row.assignmentName}?`))return;
  row.active=false;row.updatedAt=now();row.updatedBy=currentUser.email;await saveHub();renderMappings();
}
function init(){
  if(!document.getElementById("mappingList"))return;
  ensureMappings();populateMappingFilters();renderMappings();
  ["mappingSloFilter","mappingCourseFilter"].forEach(x=>document.getElementById(x).onchange=renderMappings);
  document.getElementById("mappingSearch").oninput=renderMappings;
  document.getElementById("mappingSave").onclick=saveMapping;
  document.getElementById("mappingCancel").onclick=clearMappingForm;
}
onHubReady(init);
window.ensureAbetAssignmentMappings=ensureMappings;
window.matchAbetAssignment=function(courseCode,assignmentName){
  ensureMappings();
  const a=norm(assignmentName);
  const mappings=ensureMappings();
  return mappings.find(m=>{
    if(m.active===false||!mappingMatchesCourse(m,courseCode))return false;
    const names=[m.assignmentName,...(m.aliases||[])].map(norm);
    return names.some(n=>n&&(a===n||a.includes(n)||n.includes(a)));
  })||null;
};
})();
