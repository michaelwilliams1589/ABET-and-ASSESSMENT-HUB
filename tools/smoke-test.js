const {chromium}=require('playwright');const fs=require('fs');
const BASE='http://127.0.0.1:8765/';
const MOCK=`window.firebase={apps:[],initializeApp(){this.apps.push(1)},
auth(){return{onAuthStateChanged(cb){setTimeout(()=>cb(window.__mockUser||null),0)},signOut:async()=>{},signInWithEmailAndPassword:async()=>{}}},
firestore:Object.assign(()=>({collection:()=>({doc:()=>({get:async()=>({exists:!!localStorage.mockHub,data:()=>JSON.parse(localStorage.mockHub||'{}')}),set:async(d)=>{if(window.__failSave)throw new Error('offline (test)');const cur=JSON.parse(localStorage.mockHub||'{}');localStorage.mockHub=JSON.stringify({...cur,...d})}})})}),{FieldValue:{serverTimestamp:()=>null}})};`;
const grades=[95,88,72,71,90,65,50,40,30,85].map((e,i)=>({id:'g'+i,studentId:'s'+i,assignmentId:'a1',earned:e,possible:100,term:'Fall 2025'}));
const FIX={hubData:{courses:[{id:'c1',code:'ETDE 2113',name:'Intro to PLCs',term:'Fall 2025'}],students:grades.map((g,i)=>({id:'s'+i,sid:'100'+i,name:'Student '+i,courseId:'c1'})),
 slos:[],assignments:[{id:'a1',courseId:'c1',courseCode:'ETDE 2113',term:'Fall 2025',officialSloCode:'SLO 2',name:'Lab 2 Door System',possible:100}],grades,
 routedUploads:[],currentAssignments:[{id:'x1',instructor:'Michael Williams',courseCode:'ETDE 4813',courseName:'Instrumentation Capstone',section:'',term:'Fall 2026'},{id:'x2',instructor:'Michael Williams',courseCode:'ETDE 2113',courseName:'Intro to PLCs',section:'',term:'Fall 2026'}],
 settings:{sloThreshold:70,programTarget:75},legacyField:'keep-me'}};
(async()=>{
 const browser=await chromium.launch();const errors=[];let fail=0;
 const ctx=await browser.newContext({acceptDownloads:true});
 await ctx.route('https://www.gstatic.com/firebasejs/**',r=>r.fulfill({contentType:'application/javascript',body:r.request().url().includes('app-compat')?MOCK:''}));
 await ctx.addInitScript(fix=>{window.__mockUser={email:'michael.williams14@okstate.edu'};if(!localStorage.mockHub)localStorage.mockHub=JSON.stringify(fix)},FIX);
 const pages=fs.readdirSync(require('path').join(__dirname,'..')).filter(f=>f.endsWith('.html')&&f!=='index.html');
 const check=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++};
 for(const f of pages){
  const p=await ctx.newPage();const errs=[];
  p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/favicon|net::ERR|Failed to load resource/.test(m.text()))errs.push(m.text())});
  await p.goto(BASE+f);await p.waitForFunction(()=>window.__hubReady===true,null,{timeout:8000}).catch(()=>errs.push('hub:loaded never fired'));
  await p.waitForTimeout(300);
  const fatal=await p.$eval('#v2FatalError',e=>e.textContent).catch(()=>null);if(fatal)errs.push(fatal);
  check(!errs.length,`${f} loads without JS errors ${errs.join(' | ')}`);await p.close();
 }
 // index (no user) loads
 {const p=await browser.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));await p.route('https://www.gstatic.com/firebasejs/**',r=>r.fulfill({contentType:'application/javascript',body:r.request().url().includes('app-compat')?MOCK:''}));await p.goto(BASE+'index.html');await p.waitForTimeout(500);check(!errs.length&&p.url().endsWith('index.html'),'index.html (signed out) loads '+errs.join('|'));await p.close()}
 const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
 await p.goto(BASE+'outcomes.html');await p.waitForFunction(()=>window.__hubReady);
 let t=await p.textContent('#soSummary');check(t.includes('60.0%')&&t.includes('Below target'),'SO2 2025-26 shows 60.0% below target');
 check((await p.textContent('#soMissing')).includes('ETDE 1373'),'due-but-missing flags SO5 ETDE 1373 before import');
 check(await p.evaluate(()=>window.hub===hub&&window.hub.assignments.length===1),'window.hub is the real workspace');
 await p.click('[data-oc-tab=history]');await p.check('#histAll');await p.click('#histImport');await p.waitForSelector('#histMsg .success');
 t=await p.textContent('#soSummary');check(t.includes('92.3%')||t.includes('36 of 39'),'SO5 2025-26 from historical import: '+(t.match(/\d+ of 39/)||[''])[0]);
 const stored=await p.evaluate(()=>JSON.parse(localStorage.mockHub));check(stored.hubData.historicalResults.length===14&&stored.hubData.legacyField==='keep-me'&&stored.hubData.grades.length===10,'import saved 14 rows; existing data untouched');
 check(!JSON.stringify(stored.hubData.historicalResults).match(/Student \d/),'historical rows carry no student names');
 await p.click('[data-oc-tab=summary]');await p.click('[data-new-action]');
 check((await p.inputValue('#caFinding')).includes('below the 75% program target'),'"+ Action" pre-fills finding');
 await p.fill('#caChange','Added PLC simulation pre-lab');await p.fill('#caOwner','Cullum');await p.click('#caSave');await p.waitForSelector('#caMsg .success');
 check((await p.textContent('#caList')).includes('simulation pre-lab'),'action saved and listed');
 await p.click('[data-oc-tab=peo]');
 fs.writeFileSync('/tmp/survey.csv','Role,PEO1 rating,PEO2 rating,Comments\nEmployer,5,Agree,Great\nAlumni,3,Strongly agree,\nEmployer,4,disagree,More networking\n');
 await p.setInputFiles('#psFile','/tmp/survey.csv');await p.fill('#psDate','2026-05-01');await p.click('#psPreviewBtn');await p.waitForSelector('#psSave');
 t=await p.textContent('#psPreview');check(t.includes('66.7%')&&t.includes('4.00'),'survey preview computes mean/%agree');
 await p.click('#psSave');await p.waitForTimeout(200);check((await p.textContent('#psList')).includes('More networking'),'survey saved');
 await p.fill('#abDate','2026-04-10');await p.fill('#abAttendees','Board A');await p.check('[data-ab-peo][value=PEO1]');await p.selectOption('#abActions',{index:0});await p.click('#abSave');await p.waitForTimeout(200);
 t=await p.textContent('#abList');check(t.includes('PEO1')&&t.includes('simulation pre-lab'),'advisory meeting with PEO + linked action');
 await p.click('[data-oc-tab=exports]');
 let [d]=await Promise.all([p.waitForEvent('download'),p.click('#exportXlsx')]);await d.saveAs('/tmp/t.xlsx');
 [d]=await Promise.all([p.waitForEvent('download'),p.click('#exportDocx')]);await d.saveAs('/tmp/t.docx');
 // save failure banner
 await p.evaluate(()=>window.__failSave=true);await p.click('[data-oc-tab=actions]');await p.fill('#caFinding','x');await p.click('#caSave');await p.waitForTimeout(200);
 check(await p.isVisible('#saveWarningBanner')&&(await p.textContent('[data-sync]')).includes('NOT saved'),'failed save shows banner + NOT saved');
 await p.evaluate(()=>window.__failSave=false);
 const m=await ctx.newPage();m.on('pageerror',e=>errors.push(e.message));await m.goto(BASE+'my-courses.html');await m.waitForFunction(()=>window.__hubReady);
 await m.selectOption('#mcWho','Michael Williams');t=await m.textContent('#mcList');check(t.includes('ETDE 2113')&&t.includes('ETDE 4813'),'My Courses lists assigned courses');
 const link=await m.getAttribute('a[href*="type=gradebook"]','href').catch(()=>null);check(!!link,'upload link present: '+link);
 if(link){await m.goto(BASE+link);await m.waitForFunction(()=>window.__hubReady);await m.waitForTimeout(300);check(await m.isVisible('#uploadFilePanel')&&(await m.inputValue('#uploadTerm'))==='Fall 2026','uploads opens gradebook step from link (course='+await m.inputValue('#gradebookCourseSelect')+')')}
 const r=await ctx.newPage();await r.goto(BASE+'reports.html');await r.waitForFunction(()=>window.__hubReady);check(await r.inputValue('#insertTarget')==='75','reports uses saved target');
 check(!errors.length,'no runtime errors during flows '+errors.join('|'));
 await browser.close();console.log(fail?`${fail} FAILED`:'ALL PASSED');process.exit(fail?1:0);
})();
