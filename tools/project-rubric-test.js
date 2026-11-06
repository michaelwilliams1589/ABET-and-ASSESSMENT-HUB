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
 const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
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
 await p.click('#pr_score details summary');await p.selectOption('[data-st-abet="technical"][data-i="0"]','4');await p.selectOption('[data-st-abet="technical"][data-i="1"]','2');await p.fill('[data-st-note][data-i="0"]','Explained PID tuning');
 await p.click('#prSave');await p.waitForSelector('#prMsg .success');
 let st=JSON.parse(await p.evaluate(()=>localStorage.mockHub)).hubData;
 const rec=st.projectRubrics?.[0];
 check(st.projectRubrics.length===1&&rec.students.length===8&&rec.groupTotal===64&&rec.students[0].finalScore===84&&rec.abetMappingStatus==='proposed','saved record with 8 students and totals');
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
 // reports
 await p.click('[data-pr-tab=reports]');const t=await p.textContent('#prReports');
 check(t.includes('8 of 9')&&t.includes('PROPOSED')&&t.includes('50.0% (1 of 2)')&&t.includes('Team Beta'),'reports: pass count, proposed attainment, trend');
 const [d]=await Promise.all([p.waitForEvent('download'),p.click('#prCsv')]);const csv=fs.readFileSync(await d.path(),'utf8');
 check(csv.split('\r\n').length===10&&csv.includes('Student 8')&&csv.includes('PROPOSED Technical'),'CSV: header + 9 student rows');
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
 check(!errors.length,'no runtime errors '+errors.join(' | '));
 await browser.close();console.log(fail?`${fail} FAILED`:'ALL PASSED');process.exit(fail?1:0);
})();
