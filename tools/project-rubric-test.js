// Project Rubric (ETDE 3213) test with Firebase mocked. Server: python3 -m http.server 8765 (repo folder).
//   node tools/project-rubric-test.js
const {chromium}=require('playwright');const fs=require('fs'),path=require('path'),vm=require('vm');
const BASE='http://127.0.0.1:8765/';
const MOCK=fs.readFileSync(path.join(__dirname,'smoke-test.js'),'utf8').match(/const MOCK=`([\s\S]*?)`;/)[1];
let fail=0;const check=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++};
// 1. pure scoring
{const w={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/project-rubric.js'),'utf8'),{window:w,esc:String,onHubReady(){},document:{}});
 const P=w.ProjectRubric,all=n=>Object.fromEntries(P.GROUP.map(g=>[g[0],n]));
 check([5,8,10,12].every(m=>JSON.stringify([1,2,3,4,5].map(r=>P.ratingPoints(m,r)))===JSON.stringify(P.CONVERT[m])),'conversion table matches rubric');
 check(JSON.stringify(P.CONVERT)==='{"5":[1,2,3,4,5],"8":[2,3,5,6,8],"10":[2,4,6,8,10],"12":[2,5,7,10,12]}','conversion values exact');
 check(P.GROUP.reduce((a,g)=>a+g[2],0)===80&&P.groupTotal(all(5)).total===80&&P.groupTotal(all(0)).total===0&&P.groupTotal(all(3)).total===48&&P.groupTotal(all(1)).total===16,'group totals (80/0/48/16)');
 check(P.groupTotal({}).scored===0&&P.ratingPoints(8,null)===null,'unscored is blank, not zero');
 const s={scores:{contribution:5,knowledge:4,presentation:3,accountability:5}};
 check(P.individualTotal(s).total===17&&P.finalScore({ratings:all(4)},s).final===64+17,'individual 17 + group 64 = 81');
 check(P.buildCsv([{team:'Historical',ratings:all(5),students:[]}]).split('\r\n').length===1,'an older record without students exports only the CSV header');
 const att=P.provisionalAttainment([{students:[{name:'A',abet:{technical:3}},{name:'B',abet:{technical:2}},{name:'',abet:{technical:5}}]}]);
 check(att.technical.rated===2&&att.technical.pct===50&&att.teamwork.pct===null,'provisional attainment counts named students only');
 const csv=P.buildCsv([{team:'T, "1"',ratings:all(5),students:[{name:'A',scores:{},abet:{teamwork:4}}]}]);
 check(csv.includes('"T, ""1"""')&&csv.includes('PROPOSED Teamwork')&&csv.includes('PROPOSED - not mapped'),'CSV escapes and labels proposed columns');}
// 2. data layer: an empty projectRubrics array is a collection, not a settings field
{const w={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/data-store.js'),'utf8'),{window:w});
 const r=w.HubStore.splitHub({projectRubrics:[],settings:{a:1}});check(r.collections.projectRubrics&&!('projectRubrics' in r.meta),'projectRubrics stored as per-record collection');}
const FIX={hubData:{courses:[{id:'c1',code:'ETDE 2113'}],grades:[{id:'g1',earned:90}],improvementActions:[{id:'ia1',so:'SO4',finding:'keep'}],meetingNotes:[{id:'n1',date:'2026-11-03'}],settings:{sloThreshold:70,programTarget:75},legacyField:'keep-me'}};
(async()=>{
 const browser=await chromium.launch();const errors=[];
 const ctx=await browser.newContext({acceptDownloads:true});
 await ctx.route('https://www.gstatic.com/firebasejs/**',r=>r.fulfill({contentType:'application/javascript',body:r.request().url().includes('app-compat')?MOCK:''}));
 await ctx.addInitScript(fix=>{window.__mockUser={email:'michael.williams14@okstate.edu'};if(!localStorage.mockHub)localStorage.mockHub=JSON.stringify(fix)},FIX);
 const p=await ctx.newPage();p.setDefaultTimeout(9000);p.on('console',m=>{if(m.type()==='error') console.log('CONSOLE',m.text())});p.on('pageerror',e=>errors.push(e.message));
 await p.goto(BASE+'project-rubric.html');await p.waitForFunction(()=>window.__hubReady);
 check(await p.locator('a[href="project-rubric.html"]').count()>0,'menu link present');
 check(await p.$$eval('#prStudents tr',r=>r.length)===5,'five student rows to start');
 await p.click('#prSave');check((await p.textContent('#prMsg')).includes('team name'),'team name required');
 await p.fill('#prTeam','Team Alpha');await p.fill('#prProject','Tank level PID');await p.fill('#prDate','2026-12-01');await p.fill('#prTerm','Fall 2026');
 for(const k of ['overview','wbs','gantt','bom','design','challenges','results','lessons','quality'])await p.selectOption('#prR_'+k,'4');
 check((await p.textContent('#prGroupTotal')).startsWith('64 / 80'),'group total 64 from all 4s');
 check((await p.textContent('#prDesc_wbs')).includes('Well-organized'),'descriptor shown for rating');
 await p.click('#prAddStudent');await p.click('#prAddStudent');await p.click('#prAddStudent');
 check(await p.$$eval('#prStudents tr',r=>r.length)===8,'can add up to 8 students');
 for(let i=0;i<8;i++){await p.fill(`[data-st-name][data-i="${i}"]`,'Student '+(i+1));for(const k of ['contribution','knowledge','presentation','accountability'])await p.selectOption(`[data-st-score="${k}"][data-i="${i}"]`,String(i<6?5:2))}
 check((await p.textContent('#prFin_0')).includes('84')&&(await p.textContent('#prFin_7')).includes('72'),'final = group + individual (84, 72)');
 await p.selectOption('[data-st-abet="technical"][data-i="0"]','4');await p.selectOption('[data-st-abet="technical"][data-i="1"]','2');await p.fill('[data-st-note][data-i="0"]','Explained PID tuning');
 await p.click('#prSave');await p.waitForSelector('#prMsg .success');
 let st=JSON.parse(await p.evaluate(()=>localStorage.mockHub)).hubData;
 const rec=st.projectRubrics?.[0];
 check(st.projectRubrics.length===1&&rec.students.length===8&&rec.groupTotal===64&&rec.students[0].finalScore===84&&rec.abetMappingStatus==='mapped'&&rec.mappingVersion==='etde3213-final-presentation-v1'&&rec.abetReview.status==='unreviewed','saved record with 8 students, scores, mapping and review needed');
 check(st.legacyField==='keep-me'&&st.grades.length===1&&st.improvementActions[0].finding==='keep'&&st.meetingNotes.length===1&&st.settings.programTarget===75,'existing grades, actions, notes, settings untouched');
 check(!('projectRubrics' in (st.settings||{}))&&!st.improvementActions.some(a=>/PROPOSED|Team Alpha/.test(JSON.stringify(a))),'nothing leaks into official records');
 // second team, then reopen and edit the first
 await p.evaluate(()=>window.confirm=()=>true);
 await p.click('#prNew');check(await p.inputValue('#prTeam')==='','new team clears form');
 await p.fill('#prTeam','Team Beta');await p.fill('#prTerm','Fall 2026');await p.fill('#prDate','2026-12-02');for(const k of ['overview','wbs','gantt','bom','design','challenges','results','lessons','quality'])await p.selectOption('#prR_'+k,'2');
 await p.fill('[data-st-name][data-i="0"]','Student Z');for(const k of ['contribution','knowledge','presentation','accountability'])await p.selectOption(`[data-st-score="${k}"][data-i="0"]`,'2');
 await p.click('#prSave');await p.waitForSelector('#prMsg .success');
 await p.click('[data-pr-tab=teams]');check((await p.textContent('#prList')).includes('Team Alpha')&&(await p.textContent('#prList')).includes('Team Beta'),'both teams listed');
 await p.click('[data-pr-open="'+rec.id+'"]');check(await p.inputValue('#prTeam')==='Team Alpha'&&await p.inputValue('[data-st-name][data-i="7"]')==='Student 8','reopen restores team and students');
 await p.selectOption('#prR_lessons','5');await p.click('#prSave');await p.waitForSelector('#prMsg .success');
 st=JSON.parse(await p.evaluate(()=>localStorage.mockHub)).hubData;
 check(st.projectRubrics.length===2&&st.projectRubrics.find(r=>r.id===rec.id).groupTotal===65&&st.projectRubrics.find(r=>r.team==='Team Beta').students.length===1,'edit updates the same record; other team unchanged');
 // Check the unreviewed gate, then persist review and calculate official SO1 statistics.
await p.click('[data-pr-tab=reports]');
check((await p.textContent('#prReports')).includes('50.0% (1 of 2; threshold 70%)'),'unreviewed SO1 attainment uses only entered direct ratings');
await p.click('[data-pr-tab=score]');
check((await p.textContent('#prEvidenceBadge')).includes('REVIEW NEEDED'),'editing a saved team requires a fresh review');
for(let i=0;i<8;i++)await p.selectOption(`[data-st-abet="communication"][data-i="${i}"]`,'4');
await p.click('#prSave');await p.waitForSelector('#prMsg .success');
await p.click('#prReview');await p.waitForSelector('#prReviewMsg .success');
check((await p.textContent('#prEvidenceBadge')).includes('REVIEWED'),'faculty review persists in the display');
await p.click('[data-pr-tab=reports]');const t=await p.textContent('#prReports');
check(t.includes('8 of 9')&&t.includes('REVIEWED')&&t.includes('50.0% (1 of 2; threshold 70%)')&&t.includes('Team Beta'),'reports: pass count, reviewed attainment, trend');
st=JSON.parse(await p.evaluate(()=>localStorage.mockHub)).hubData;
check(await p.evaluate(()=>window.v52?.allResults().some(r=>r.so==='SO1'&&r.academicYear==='2026-27'&&r.assessed===2&&r.met===1&&r.courseCode==='ETDE 3213')), 'reviewed individual ratings enter the correct academic year: '+await p.evaluate(()=>JSON.stringify(window.v52?.allResults())));
 const [d]=await Promise.all([p.waitForEvent('download'),p.click('#prCsv')]);const csv=fs.readFileSync(await d.path(),'utf8');
 check(csv.split('\r\n').length===28&&csv.includes('Student 8')&&csv.includes('PROPOSED Technical'),'CSV: header + three outcome evidence rows for 9 students');
 // Mapping and historical-data compatibility.
check(await p.evaluate(()=>matchAbetAssignmentsAll('ETDE 3213','Presentation').length===0),'generic Presentation alone cannot trigger outcome mappings');
check(await p.evaluate(()=>matchAbetAssignmentsAll('ETDE 3213','Final Project Presentation').length===3),'the exact rubric title matches only SO1, SO3 and SO5');
check(await p.evaluate(()=>matchAbetAssignmentsAll('ETDE 3213','Email Assignment').length===0),'the retired Email Assignment cannot claim new official data');
 // Mapping and historical-data compatibility. Preserve the scored-team fixtures exactly.
 const preservedTeams=await p.evaluate(()=>JSON.parse(JSON.stringify(hub.projectRubrics)));
 await p.click('[data-pr-tab=teams]');
 await p.evaluate(()=>{hub.projectRubrics=[{id:'old-proposed',team:'Historical proposed',term:'Fall 2025',date:'2025-12-01',groupFeedback:'Preserve this',abetMappingStatus:'proposed',ratings:{overview:4},students:[{name:'Original student',scores:{contribution:3},abet:{technical:3,note:'Keep original'}}]}];const row=document.querySelector('#prList tbody tr');row.querySelector('td:nth-child(2)').textContent='Historical proposed';row.querySelector('[data-pr-open]').dataset.prOpen='old-proposed'});
 await p.click('[data-pr-open="old-proposed"]');
 check(await p.isDisabled('#prReview')&&(await p.textContent('#prEvidenceBadge')).includes('PROPOSED'),'older proposed records remain historical and cannot be upgraded through the review button');
 await p.click('#prSave');await p.waitForSelector('#prMsg .success');
 const historical=await p.evaluate(()=>hub.projectRubrics.find(r=>r.id==='old-proposed'));
 check(historical.abetMappingStatus==='proposed'&&historical.groupFeedback==='Preserve this'&&historical.students[0].abet.note==='Keep original'&&historical.abetReview.status==='proposed','saving an older proposed record keeps it proposed');
 await p.evaluate(teams=>{hub.projectRubrics=teams},preservedTeams);
 await p.click('[data-pr-tab=mapping]');
 check((await p.textContent('#prDetailedMap')).includes('To apply this mapping to your saved workspace'),'existing saved workspaces are clearly marked for the one-time upgrade');
 await p.evaluate(()=>window.confirm=()=>false);await p.click('#prSaveMinutes');check((await p.textContent('#prMinutesMsg')).includes('cancelled')&&await p.evaluate(()=>hub.meetingNotes.length===1),'cancelling minutes does not change existing notes');
 await p.evaluate(()=>{window.__failSave=true;window.confirm=()=>true});await p.click('#prSaveMinutes');
 check((await p.textContent('#prMinutesMsg')).includes('Not saved')&&await p.evaluate(()=>hub.meetingNotes.length===1),'failed minute save restores existing notes');
 await p.evaluate(()=>{window.__failSave=false;window.confirm=()=>true});await p.click('#prSaveMinutes');await p.waitForSelector('#prMinutesMsg .success');
 const savedNote=await p.evaluate(()=>JSON.parse(localStorage.mockHub).hubData.meetingNotes.find(n=>n.id===ProjectChangeMinutes.RECORD_ID));
 check(savedNote.attendees==='Michael Williams (chair), Darrel, Matthew, Carlos, Amanda, Paula'&&savedNote.author==='michael.williams14@okstate.edu'&&savedNote.discussion.includes('All listed attendees voted yes'),'minutes save the six listed attendees, chair, unanimous motion and actual signed-in author');
 await p.click('#prSaveMinutes');
 check((await p.textContent('#prMinutesMsg')).includes('no duplicate')&&await p.evaluate(()=>hub.meetingNotes.filter(n=>n.id===ProjectChangeMinutes.RECORD_ID).length===1),'saving minutes twice cannot create a duplicate');
 await p.evaluate(()=>window.__failSave=true);await p.click('#prApplyMap');await p.waitForSelector('#prMapMsg .warning');
 check(await p.evaluate(()=>hub.abetAssignmentMappings.some(m=>m.id==='map-slo3-etde3213'&&m.active===false&&!m.assessmentKind&&m.sloCode==='SLO 3')),'failed workspace-map saving restores the exact old Email mapping');
 await p.evaluate(()=>window.__failSave=false);await p.click('#prApplyMap');await p.waitForSelector('#prMapMsg .success');
 check(await p.evaluate(()=>{const m=hub.abetAssignmentMappings;return m.filter(x=>x.active!==false&&x.assessmentKind==='final-project-rubric').length===3&&m.some(x=>x.id==='map-slo3-etde3213'&&x.active===false&&x.status==='historical')}),'mapping upgrade preserves inactive old Email and activates three presentation rows');
 check((await p.textContent('#prDetailedMap')).includes('This saved workspace uses')&&(await p.textContent('#prMinutesMsg')).includes('already'),'mapping status refreshes without changing saved minutes');
 await p.screenshot({path:'/tmp/pr-mapping-and-minutes.png',fullPage:true});
 const savedCount=await p.evaluate(()=>hub.meetingNotes.filter(n=>n.id===ProjectChangeMinutes.RECORD_ID).length);await p.reload();await p.waitForFunction(()=>window.__hubReady);await p.click('[data-pr-tab=mapping]');await p.click('#prSaveMinutes');check(await p.evaluate(()=>hub.meetingNotes.filter(n=>n.id===ProjectChangeMinutes.RECORD_ID).length)===savedCount,'reloading the mapping panel recognizes the already saved note');
 await p.evaluate(()=>window.confirm=()=>true);
 // failed save does not add a record
 await p.evaluate(()=>window.__failSave=true);await p.click('[data-pr-tab=score]');await p.click('#prNew');await p.fill('#prTeam','Team Fail');await p.click('#prSave');await p.waitForSelector('#prMsg .warning');
 check(await p.evaluate(()=>hub.projectRubrics.length)===2,'failed save leaves list unchanged');await p.evaluate(()=>window.__failSave=false);
 // delete
 await p.click('[data-pr-tab=teams]');await p.click('[data-pr-del]:last-of-type >> nth=1');await p.waitForTimeout(200);
 st=JSON.parse(await p.evaluate(()=>localStorage.mockHub)).hubData;check(st.projectRubrics.length===1,'delete removes one record');
 // pdf, other pages, mobile
 check((await (await p.request.get(BASE+'assets/documents/ETDE-3213-Final-Project-Group-Rubric.pdf')).body()).slice(0,4).toString()==='%PDF','original rubric PDF downloadable');
 await p.setViewportSize({width:390,height:844});await p.click('[data-pr-tab=score]');await p.screenshot({path:'/tmp/pr-mobile.png',fullPage:true});
 await p.setViewportSize({width:1280,height:900});await p.screenshot({path:'/tmp/pr-desktop.png',fullPage:true});
 await p.click('[data-pr-tab=reports]');await p.screenshot({path:'/tmp/pr-reports.png',fullPage:true});
 const instructor=await ctx.newPage();instructor.setDefaultTimeout(9000);instructor.on('pageerror',e=>errors.push(e.message));
 await instructor.addInitScript(()=>{window.__mockUser={email:'instructor@example.com'}});
 await instructor.goto(BASE+'project-rubric.html');await instructor.waitForFunction(()=>window.__hubReady);
 await instructor.click('[data-pr-tab=mapping]');
 check(!(await instructor.isVisible('#prApplyMap')),'assignment mapping control is hidden from an instructor account');
 await instructor.locator('#prApplyMap').evaluate(b=>b.click());
 check((await instructor.textContent('#prMapMsg')).includes('administrator')&&await instructor.evaluate(()=>hub.abetAssignmentMappings.some(m=>m.id==='map-slo3-etde3213'&&m.active===false)),'an instructor cannot change saved mappings even if a hidden button is activated');
 check(!errors.length,'no runtime errors '+errors.join(' | '));
 await browser.close();console.log(fail?`${fail} FAILED`:'ALL PASSED');process.exit(fail?1:0);
})();
