
(function(){
"use strict";
function integritySummary(){
 const assignments=window.hub?.assignments||[],grades=window.hub?.grades||[],students=window.hub?.students||[];
 const qualA=window.hub?.qualitativeAssessments||[],qualD=window.hub?.qualitativeDocuments||[],qualR=window.hub?.qualitativeReviews||[];
 const assignmentIds=new Set(assignments.map(a=>a.id)),studentIds=new Set(students.map(s=>s.id));
 const qualIds=new Set(qualA.map(a=>a.id)),docIds=new Set(qualD.map(d=>d.id));
 return{
   courses:(window.hub?.courses||[]).length,assignments:assignments.length,students:students.length,grades:grades.length,
   qualitativeDocuments:qualD.length,
   orphanGrades:grades.filter(g=>!assignmentIds.has(g.assignmentId)||!studentIds.has(g.studentId)).length,
   orphanQualDocuments:qualD.filter(d=>!qualIds.has(d.assessmentId)).length,
   orphanQualReviews:qualR.filter(r=>!(r.assessmentId&&qualIds.has(r.assessmentId))&&!(r.documentId&&docIds.has(r.documentId))).length
 };
}
function renderIntegrity(){
 const host=document.getElementById("v4Integrity");if(!host)return;
 const s=integritySummary(),orphans=s.orphanGrades+s.orphanQualDocuments+s.orphanQualReviews;
 host.innerHTML=`<div class="grid">
 <div class="metric"><strong>${s.courses}</strong><span>Courses</span></div>
 <div class="metric"><strong>${s.assignments}</strong><span>Assignments</span></div>
 <div class="metric"><strong>${s.students}</strong><span>Students</span></div>
 <div class="metric"><strong>${s.grades}</strong><span>Grade Records</span></div>
 <div class="metric"><strong>${s.qualitativeDocuments}</strong><span>Qualitative Documents</span></div>
 <div class="metric"><strong>${orphans}</strong><span>Orphan Records</span></div></div>
 ${orphans?`<div class="notice warning">Found ${orphans} disconnected record(s). Use the Analytics cleanup controls after downloading a backup.</div>`:'<div class="notice success">All checked records are connected correctly.</div>'}`;
}
document.addEventListener("DOMContentLoaded",()=>setTimeout(()=>{
 renderIntegrity();
 document.getElementById("v4RunIntegrity")?.addEventListener("click",renderIntegrity);
},1400));
})();
