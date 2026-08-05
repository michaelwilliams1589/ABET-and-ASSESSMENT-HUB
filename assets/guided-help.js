
(function(){
"use strict";
const DATA=window.GUIDED_HELP_DATA||{};
const WORKFLOW=[
 ["Dashboard","dashboard.html"],["Upload Evidence","uploads.html"],["Review Analytics","assessment-analytics.html"],
 ["Approve Results","results.html"],["Meeting Notes","meeting-notes.html"],["Generate Report","reports.html"],
 ["Create OneDrive Archive","reports.html"]
];
function pageName(){
 const clean=location.pathname.replace(/\/+$/,"");
 const leaf=clean.split("/").pop()||"";
 return leaf.includes(".")?leaf:"index.html";
}
function hEsc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
function panelHtml(info){
 return `<div class="coach-header"><div><span class="eyebrow">INSTRUCTOR GUIDE</span><h2>${hEsc(info.title)}</h2></div><button id="closePageCoach" class="btn outline">Close</button></div>
 <div class="coach-section"><h3>What is this page?</h3><p>${hEsc(info.purpose)}</p></div>
 <div class="coach-section"><h3>When do I use it?</h3><p>${hEsc(info.when)}</p></div>
 <div class="coach-section"><h3>What do I do?</h3><ol>${info.steps.map(x=>`<li>${hEsc(x)}</li>`).join("")}</ol></div>
 <div class="coach-section"><h3>Common mistakes</h3><ul>${info.mistakes.map(x=>`<li>${hEsc(x)}</li>`).join("")}</ul></div>
 <div class="coach-section next"><h3>What happens next?</h3><p>${hEsc(info.next)}</p></div>
 <div class="coach-section supports"><h3>ABET / Records</h3><p><strong>Supports:</strong> ${hEsc(info.criterion)}</p><p><strong>Evidence:</strong> ${hEsc(info.evidence)}</p><p><strong>Retention:</strong> ${hEsc(info.retention)}</p><p><strong>Completed by:</strong> ${hEsc(info.role)}</p></div>`;
}
function addCoach(){
 const p=pageName(),info=DATA[p];if(!info||p==="index.html")return;
 const button=document.createElement("button");button.id="pageCoachButton";button.className="page-coach-button";button.textContent="❓ Help for This Page";button.title="Open instructions for this page";
 document.body.appendChild(button);
 const panel=document.createElement("aside");panel.id="pageCoachPanel";panel.className="page-coach-panel hidden";panel.innerHTML=panelHtml(info);document.body.appendChild(panel);
 button.onclick=()=>panel.classList.remove("hidden");
 panel.querySelector("#closePageCoach").onclick=()=>panel.classList.add("hidden");
}
function completedState(){
 const uploads=(window.hub?.routedUploads||[]).filter(u=>!u.archived);
 return {
   grades:uploads.some(u=>u.type==="gradebook")||(window.hub?.grades||[]).length>0,
   analytics:uploads.some(u=>u.resultApproved)||(window.hub?.streamlinedNarratives||[]).length>0,
   qualitative:uploads.some(u=>["journals","reflection","microsoft-forms"].includes(u.type)),
   notes:(window.hub?.meetingNotes||[]).length>0,
   reports:(window.hub?.streamlinedNarratives||[]).length>0,
   archive:localStorage.getItem("etdeSemesterArchiveCreated")==="yes"
 };
}
function readiness(){
 const s=completedState(),items=[
  ["Quantitative evidence uploaded",s.grades,"uploads.html"],
  ["Analytics reviewed or approved",s.analytics,"assessment-analytics.html"],
  ["Qualitative evidence uploaded",s.qualitative,"uploads.html"],
  ["Meeting notes entered",s.notes,"meeting-notes.html"],
  ["Report narrative available",s.reports,"reports.html"],
  ["OneDrive semester archive created",s.archive,"reports.html"]
 ];
 const done=items.filter(x=>x[1]).length,pct=Math.round(done/items.length*100);
 return {items,done,pct};
}
function renderDashboardGuidance(){
 if(pageName()!=="dashboard.html")return;
 const welcome=document.getElementById("guidedWelcome");
 if(welcome&&!localStorage.getItem("etdeGuidedWelcomeDone")){
   welcome.classList.remove("hidden");
   welcome.innerHTML=`<div><span class="eyebrow">NEW INSTRUCTOR START HERE</span><h2>Welcome to the ETDE ABET Hub</h2><p>This guided setup explains the semester workflow and shows exactly what your courses require.</p><div class="actions"><button id="startGuidedWizard" class="btn primary">Start Guided Setup</button><button id="skipGuidedWizard" class="btn outline">Skip for Now</button></div></div>`;
   welcome.querySelector("#startGuidedWizard").onclick=startWizard;
   welcome.querySelector("#skipGuidedWizard").onclick=()=>{localStorage.setItem("etdeGuidedWelcomeDone","yes");welcome.classList.add("hidden")};
 }
 const r=readiness(),host=document.getElementById("guidedReadiness");
 if(host)host.innerHTML=`<div class="readiness-head"><strong>${r.pct}%</strong><span>Semester readiness</span></div><div class="progress-track"><div class="progress-fill" style="width:${r.pct}%"></div></div>${r.items.filter(x=>!x[1]).slice(0,4).map(x=>`<p>○ <a href="${x[2]}">${hEsc(x[0])}</a></p>`).join("")||'<div class="notice success">All tracked closeout items are complete.</div>'}`;
 const check=document.getElementById("guidedSemesterChecklist");
 if(check)check.innerHTML=r.items.map(x=>`<div class="checklist-row"><span>${x[1]?"☑":"☐"} ${hEsc(x[0])}</span><a href="${x[2]}">${x[1]?"Review":"Complete"}</a></div>`).join("");
}
function startWizard(){
 const steps=[
  {title:"1. Confirm Your Semester",text:"Open Syllabus & Semester and verify your current courses and sections.",href:"syllabus-engine.html"},
  {title:"2. Upload Evidence",text:"Upload Canvas gradebooks, journals, reflections, and employer evaluations.",href:"uploads.html"},
  {title:"3. Review Analytics",text:"Filter by course and SLO. Check threshold and qualitative themes.",href:"assessment-analytics.html"},
  {title:"4. Approve Results",text:"Edit and approve the final assessment narrative.",href:"results.html"},
  {title:"5. Record Decisions",text:"Save faculty discussion, Action Taken, responsibility, and follow-up.",href:"meeting-notes.html"},
  {title:"6. Close the Semester",text:"Create the Criterion 4 insert and OneDrive archive.",href:"reports.html"}
 ];
 let i=0;
 const modal=document.createElement("div");modal.className="guided-modal";document.body.appendChild(modal);
 function draw(){const s=steps[i];modal.innerHTML=`<div class="guided-modal-card"><span class="eyebrow">GUIDED SETUP ${i+1} OF ${steps.length}</span><h2>${s.title}</h2><p>${s.text}</p><div class="workflow-mini">${steps.map((_,n)=>`<span class="${n<=i?"done":""}">${n+1}</span>`).join("")}</div><div class="actions">${i?'<button id="wizardBack" class="btn outline">Back</button>':""}${i<steps.length-1?'<button id="wizardNext" class="btn primary">Next</button>':`<a class="btn primary" href="${s.href}">Open ${s.title.replace(/^\d+\.\s*/,"")}</a>`}<button id="wizardClose" class="btn secondary">Close</button></div></div>`;
 if(modal.querySelector("#wizardBack"))modal.querySelector("#wizardBack").onclick=()=>{i--;draw()};
 if(modal.querySelector("#wizardNext"))modal.querySelector("#wizardNext").onclick=()=>{i++;draw()};
 modal.querySelector("#wizardClose").onclick=()=>{localStorage.setItem("etdeGuidedWelcomeDone","yes");modal.remove();const w=document.getElementById("guidedWelcome");if(w)w.classList.add("hidden")};
 }
 draw();
}
function renderHelpCenter(){
 if(pageName()!=="help-center.html")return;
 const workflow=document.getElementById("helpWorkflow");
 if(workflow)workflow.innerHTML=WORKFLOW.map((x,i)=>`<a href="${x[1]}"><span>${i+1}</span>${hEsc(x[0])}</a>`).join("");
 const search=document.getElementById("helpSearch"),list=document.getElementById("helpTopicList");
 function draw(){
  const q=(search.value||"").toLowerCase();
  const rows=Object.entries(DATA).filter(([k,v])=>k!=="help-center.html"&&(!q||JSON.stringify(v).toLowerCase().includes(q)||k.toLowerCase().includes(q)));
  list.innerHTML=rows.map(([k,v])=>`<details class="help-topic"><summary>${hEsc(v.title)}</summary><div class="help-topic-body">${panelHtml(v).replace(/<button.*?<\/button>/,"")}<a class="btn primary" href="${k}">Open Page</a></div></details>`).join("")||'<div class="notice">No help topics matched your search.</div>';
 }
 search.oninput=draw;draw();
 document.getElementById("downloadInstructorGuide").onclick=()=>{
  const text=["OSUIT ETDE ASSESSMENT & ACCREDITATION HUB","INSTRUCTOR GUIDE","Version 2.2","",...WORKFLOW.map((x,i)=>`${i+1}. ${x[0]}`),""];
  Object.values(DATA).forEach(v=>{text.push(v.title.toUpperCase(),`Purpose: ${v.purpose}`,`When to use: ${v.when}`,"Steps:",...v.steps.map((x,i)=>`${i+1}. ${x}`),"Common mistakes:",...v.mistakes.map(x=>`- ${x}`),`Next: ${v.next}`,`Supports: ${v.criterion}`,`Evidence: ${v.evidence}`,`Retention: ${v.retention}`,`Role: ${v.role}`,"")});
  const blob=new Blob([text.join("\n")],{type:"text/plain"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="ETDE_ABET_Hub_Instructor_Guide.txt";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);
 };
}
function markArchiveButton(){
 const b=document.getElementById("downloadSemesterArchive");
 if(b)b.addEventListener("click",()=>localStorage.setItem("etdeSemesterArchiveCreated","yes"));
}
document.addEventListener("DOMContentLoaded",()=>setTimeout(()=>{addCoach();renderDashboardGuidance();renderHelpCenter();markArchiveButton()},1300));
})();
