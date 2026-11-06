/* ETDE 3213 Project Management assessment-mapping meeting minutes.
   Prepared from Michael Williams's requested summary on 2026-11-06.
   Does not invent a seconder, ABET/advisory approval, or unreported discussion. */
(function(){
"use strict";

const RECORD_ID="note-etde3213-mapping-2026-11-06";
const VERSION="etde3213-final-presentation-v1";
const SELECTED_DATE="2026-11-06";
const PRINTABLE="assets/documents/ETDE-3213-Mapping-Meeting-Minutes-2026-11-06.html";
const MAPPING_DOC="assets/documents/ETDE-3213-Outcome-Mapping.html";
const RUBRIC_PDF="assets/documents/ETDE-3213-Final-Project-Group-Rubric.pdf";

const DISCUSSION=[
  "Michael Williams called a faculty meeting on November 6, 2026 to approve replacing the ETDE 3213 Email Assignment → SO 3 assessment mapping with the Final Project Presentation → SO 1, SO 3, and SO 5 mapping for the Bachelor of Technology in Instrumentation Engineering Technology program, effective Fall 2026. Attendees were Michael Williams (chair), Darrel, Matthew, Carlos, Amanda, and Paula. All listed attendees voted yes. No seconder was recorded.",
  "Rationale (synthesized for this request; not presented as prior factual history or as an ABET mandate): the previous Email Assignment provided narrow SO 3 evidence. The new team Final Project Presentation, scored with a common rubric, supports systematically observing technical problem-solving (SO 1), oral technical communication (SO 3), and individual team contribution and leadership (SO 5) in an applied project-management context. Shared group points remain separate from individual outcome ratings. A faculty review gate keeps unreviewed records from being treated as official prematurely. The change is intended to provide stronger, more consistent individual evidence for continuous improvement while leaving prior performance records intact.",
  "Existing Program Educational Objectives and Student Outcomes remain as previously reaffirmed; the next regular PEO/SO review is scheduled for 2028. Work Breakdown Structure, Gantt schedule, Bill of Materials, and economics content continue as course performance evidence and are not assigned a new program outcome or invented official performance indicator. Shared group points alone do not establish individual attainment. The Hub individual threshold remains 70% on the direct 0–5 scale (a rating of 4 or 5 meets it; 3 or below does not). The program target remains 75% of assessed students meeting the threshold.",
  "Michael Williams moved to approve the Final Project Presentation mapping (version "+VERSION+", selected "+SELECTED_DATE+") as the current ETDE 3213 assessment mapping beginning Fall 2026, with the Email Assignment retained as inactive historical mapping so original records keep their meaning. The motion carried unanimously. This record documents an internal assessment-mapping decision; it does not claim ABET or advisory-board approval of a new program definition, and it does not assert that attendees reviewed the confidential self-study PDF."
].join("\n\n");

const ACTIONS=[
  "1. Assessment coordinator: apply the Final Project Presentation mapping in the Hub workspace (Email Assignment remains historical).",
  "2. Course instructor: enter direct individual outcome notes for roles/leadership and complete faculty review before treating a team as official.",
  "3. Retain the original grade rubric and the approved source Student Outcome statements; do not invent new outcomes or official PIs.",
  "4. After use, evaluate attainment against the 70% / 75% criteria and document any continuous-improvement follow-up.",
  "5. Do not edit prior grades, historical mappings, or earlier meeting records."
].join("\n");

const MINUTES={
  id:RECORD_ID,
  date:"2026-11-06",
  type:"Faculty — ETDE 3213 assessment mapping",
  cycle:"Year 1 of 6 — 2026–27",
  attendees:"Michael Williams (chair), Darrel, Matthew, Carlos, Amanda, Paula",
  discussion:DISCUSSION,
  actions:ACTIONS,
  title:"BT Instrumentation Engineering Technology – Project Management Assessment Mapping",
  mappingVersion:VERSION,
  selectedDate:SELECTED_DATE,
  printable:PRINTABLE,
  mappingDoc:MAPPING_DOC,
  rubricPdf:RUBRIC_PDF
};

function esc(s){
  return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
}

function detailsHtml(){
  const paras=MINUTES.discussion.split(/\n\n+/).map(p=>`<p>${esc(p)}</p>`).join("");
  const acts=`<ol>${MINUTES.actions.split(/\n+/).map(line=>esc(line.replace(/^\d+\.\s*/,""))).map(t=>`<li>${t}</li>`).join("")}</ol>`;
  return `<div class="stamp" id="prMinutesPanel">
<h3>${esc(MINUTES.title)}</h3>
<p><strong>Date:</strong> November 6, 2026 (America/Chicago)<br>
<strong>Type:</strong> ${esc(MINUTES.type)}<br>
<strong>Cycle:</strong> ${esc(MINUTES.cycle)}<br>
<strong>Mapping version:</strong> ${esc(VERSION)} · <strong>Selected:</strong> ${esc(SELECTED_DATE)}<br>
<strong>Record id:</strong> <code>${esc(RECORD_ID)}</code></p>
<p><strong>Attendance:</strong> ${esc(MINUTES.attendees)}. Michael Williams called the meeting and moved approval; all listed attendees voted yes. No seconder was recorded.</p>
<h4>Discussion summary</h4>${paras}
<h4>Action items</h4>${acts}
<p class="muted">Prepared from Michael Williams's requested summary on November 6, 2026. Does not invent unreported conversation, a seconder, or ABET/advisory approval.</p>
<div class="actions">
<a class="btn outline" href="${esc(PRINTABLE)}" target="_blank" rel="noopener">Open / print meeting minutes</a>
<a class="btn outline" href="${esc(MAPPING_DOC)}" target="_blank" rel="noopener">Open mapping document</a>
<a class="btn outline" href="${esc(RUBRIC_PDF)}" target="_blank" rel="noopener">Open rubric PDF</a>
<button type="button" id="prSaveMinutes" class="btn primary">Save minutes to Meeting Notes</button>
</div>
<div id="prMinutesMsg" aria-live="polite"></div>
</div>`;
}

function alreadySaved(){
  return Array.isArray(window.hub?.meetingNotes)&&hub.meetingNotes.some(n=>n&&n.id===RECORD_ID);
}

function buildNote(){
  const author=(typeof currentUser!=="undefined"&&currentUser&&currentUser.email)||"";
  return {
    id:RECORD_ID,
    date:MINUTES.date,
    type:MINUTES.type,
    cycle:MINUTES.cycle,
    attendees:MINUTES.attendees,
    discussion:MINUTES.discussion,
    actions:MINUTES.actions,
    author:author,
    createdAt:new Date().toISOString()
  };
}

async function saveProjectChangeMinutes(){
  if(typeof window.hub!=="object"||!window.hub){
    return {ok:false,status:"no-hub",message:"Hub workspace is not loaded."};
  }
  if(typeof saveHub!=="function"){
    return {ok:false,status:"no-save",message:"saveHub is not available."};
  }
  if(!Array.isArray(hub.meetingNotes))hub.meetingNotes=[];
  if(alreadySaved()){
    return {ok:true,status:"exists",message:"These meeting minutes are already in Meeting Notes; no duplicate was created.",id:RECORD_ID};
  }
  if(!confirm("Save the November 6, 2026 Project Management mapping meeting minutes to Meeting Notes?\n\nThis adds one faculty meeting note. It does not change grades, historical mappings, or earlier meeting records.")){
    return {ok:false,status:"cancelled",message:"Save cancelled."};
  }
  const before=JSON.parse(JSON.stringify(hub.meetingNotes));
  const note=buildNote();
  hub.meetingNotes.unshift(note);
  try{
    await saveHub();
    if(typeof listNotes==="function"&&document.getElementById("notesList"))listNotes();
    return {ok:true,status:"saved",message:"Meeting minutes saved to Meeting Notes.",id:RECORD_ID,note:note};
  }catch(err){
    hub.meetingNotes=before;
    return {ok:false,status:"error",message:"Not saved: "+(err&&err.message?err.message:String(err))};
  }
}

window.ProjectChangeMinutes={
  RECORD_ID,
  VERSION,
  SELECTED_DATE,
  MINUTES,
  detailsHtml,
  alreadySaved,
  saveProjectChangeMinutes,
  save:saveProjectChangeMinutes
};
})();
