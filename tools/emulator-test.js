// End-to-end test against the local Firebase emulator (no live project is ever contacted).
//   python3 -m http.server 8765 &   (in the repo folder)
//   npx firebase emulators:exec --project demo-etde-hub --only auth,firestore "node tools/emulator-test.js"
const {chromium}=require('playwright');const fs=require('fs'),path=require('path');
const {initializeTestEnvironment}=require('@firebase/rules-unit-testing');
const {doc,getDoc,setDoc,collection,getDocs}=require('firebase/firestore');
const P='demo-etde-hub',BASE='http://127.0.0.1:8765/',AUTH='http://127.0.0.1:9099';
const users={admin:['michael.williams14@okstate.edu','admin'],inst:['inst@okstate.edu','instructor'],stranger:['nobody@gmail.com',null]};
async function mkUser(email){
  const r=await (await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password:'Passw0rd!',returnSecureToken:true})})).json();
  await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${P}/accounts:update`,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer owner'},body:JSON.stringify({localId:r.localId,emailVerified:true})});
}
function legacyHub(){
  const grades=[],students=[];
  for(let i=0;i<300;i++){students.push({id:'s'+i,sid:String(1000+i),name:'Student '+i,courseId:'c1'});grades.push({id:'g'+i,studentId:'s'+i,assignmentId:'a1',earned:i%100,possible:100,term:'Fall 2025'})}
  return {schemaVersion:2,legacyField:'keep-me',tags:['a','b'],
    settings:{sloThreshold:70,programTarget:75,nested:{deep:{x:1}}},roadmapSettings:{cycleStartYear:2026,retentionYears:6},
    courses:[{id:'c1',code:'ETDE 2113',name:'Intro to PLCs',term:'Fall 2025'}],students,grades,
    assignments:[{id:'a1',courseId:'c1',courseCode:'ETDE 2113',term:'Fall 2025',officialSloCode:'SLO 2',name:'Lab 2',possible:100}],
    routedUploads:[{id:'u1',type:'gradebook',courseCode:'ETDE 2113',term:'Fall 2025',archived:false}],
    termDates:[{name:'Fall 2026',start:'2026-08-17',end:'2026-12-12'},{name:'Spring 2027',start:'2027-01-11',end:'2027-05-07'}], // no ids
    meetingNotes:[{id:'dup',title:'First'},{id:'dup',title:'Second (duplicate id)'},{id:'bad/id',title:'Slash id'}],
    improvementActions:[]};
}
(async()=>{
  let fail=0;const check=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++};
  const env=await initializeTestEnvironment({projectId:P,firestore:{host:'127.0.0.1',port:8080,rules:fs.readFileSync(path.join(__dirname,'..','firestore.rules'),'utf8')}});
  const raw=c=>c.firestore();
  const LEG=legacyHub();
  await env.withSecurityRulesDisabled(async c=>{const d=raw(c);
    await setDoc(doc(d,'abetHubs/etde-main'),{hubData:LEG,updatedAt:'2026-10-01T00:00:00Z'});
    for(const [k,[e,role]] of Object.entries(users))if(role)await setDoc(doc(d,'hubUsers/'+e),{role,active:true});
  });
  for(const [,[e]] of Object.entries(users))await mkUser(e);
  const readAll=async()=>{let out;await env.withSecurityRulesDisabled(async c=>{const d=raw(c);out=(await getDoc(doc(d,'abetHubs/etde-main'))).data()});return out};
  const before=JSON.stringify(await readAll());

  const cfg=fs.readFileSync(path.join(__dirname,'..','assets','config.js'),'utf8').replace(/projectId: "[^"]+"/,`projectId: "${P}"`).replace(/apiKey: "[^"]+"/,'apiKey: "fake-api-key"').replace(/authDomain: "[^"]+"/,'authDomain: "localhost"');
  const browser=await chromium.launch(),liveCalls=[],errors=[];
  async function ctxFor(){
    const ctx=await browser.newContext({acceptDownloads:true});
    await ctx.route('**/assets/config.js',r=>r.fulfill({contentType:'application/javascript',body:cfg}));
    await ctx.route(u=>/(googleapis\.com|firebaseio\.com|firebaseapp\.com)$/.test(new URL(u).hostname),r=>{liveCalls.push(r.request().url());r.abort()});
    await ctx.addInitScript(()=>{window.ABET_TEST_EMULATOR={firestore:'127.0.0.1:8080',auth:'127.0.0.1:9099'}});
    return ctx;
  }
  const watch=p=>{p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());return p};
  async function signIn(ctx,email){
    const p=watch(await ctx.newPage());await p.goto(BASE+'index.html');
    await p.fill('#loginEmail',email);await p.fill('#loginPassword','Passw0rd!');await p.click('#signInButton');return p;
  }
  // 1. stranger is refused
  const sctx=await ctxFor(),sp=await signIn(sctx,users.stranger[0]);
  await sp.waitForFunction(()=>/not on the approved list/.test(document.getElementById('loginError').textContent),null,{timeout:15000}).catch(()=>{});
  check(/not on the approved list/.test(await sp.textContent('#loginError'))&&sp.url().includes('index.html'),'unapproved account is refused at sign-in');
  // 2. password reset + Microsoft button
  const rp=watch(await sctx.newPage());await rp.goto(BASE+'index.html');await rp.fill('#loginEmail','inst@okstate.edu');await rp.click('#forgotPasswordLink');
  await rp.waitForFunction(()=>/password-reset email/.test(document.getElementById('loginError').textContent),null,{timeout:10000}).catch(()=>{});
  check(/password-reset email/.test(await rp.textContent('#loginError')),'Forgot password sends reset email (emulator)');
  const oob=await (await fetch(`${AUTH}/emulator/v1/projects/${P}/oobCodes`)).json();
  check((oob.oobCodes||[]).some(o=>o.email==='inst@okstate.edu'&&o.requestType==='PASSWORD_RESET'),'emulator received the PASSWORD_RESET request');
  await rp.evaluate(()=>{window.__prov=null;firebase.auth().signInWithPopup=async p=>{window.__prov={id:p.providerId,params:p.customParameters||p.customParameters_||null};throw {code:'auth/popup-closed-by-user'}}});
  await rp.click('#microsoftSignInButton');await rp.waitForTimeout(300);
  const prov=await rp.evaluate(()=>window.__prov);
  check(prov&&prov.id==='microsoft.com'&&JSON.stringify(prov).includes('okstate.edu'),'Microsoft button uses microsoft.com provider with tenant '+JSON.stringify(prov));
  // 3. admin signs in, legacy mode
  const actx=await ctxFor(),ap=await signIn(actx,users.admin[0]);
  await ap.waitForURL(/dashboard\.html/,{timeout:15000});await ap.waitForFunction(()=>window.__hubReady,null,{timeout:15000});
  check(await ap.evaluate(()=>HubStore.mode==='legacy'&&hub.grades.length===300),'admin lands on Dashboard; old record read (legacy mode, 300 grades)');
  // 4. migration
  await ap.goto(BASE+'system-health.html');await ap.waitForFunction(()=>window.__hubReady);
  await ap.click('.more-options > summary'); // the upgrade lives under More options
  const [dl]=await Promise.all([ap.waitForEvent('download',{timeout:60000}),ap.click('#runMigration')]);
  const bpath='/tmp/premigration.json';await dl.saveAs(bpath);const backup=JSON.parse(fs.readFileSync(bpath,'utf8'));
  check(backup.kind==='pre-migration-backup'&&backup.data.grades.length===300&&backup.data.legacyField==='keep-me','backup downloaded with full old data');
  await ap.waitForFunction(()=>window.__hubReady&&HubStore.mode==='v2',null,{timeout:30000}).catch(()=>{});
  const v2=await ap.evaluate(()=>({mode:HubStore.mode,g:hub.grades.length,s:hub.students.length,notes:hub.meetingNotes.map(n=>n.title),terms:hub.termDates.length,legacy:hub.legacyField,tags:hub.tags,deep:hub.settings?.nested?.deep?.x,order:hub.grades.slice(0,3).map(g=>g.id)}));
  check(v2.mode==='v2'&&v2.g===300&&v2.s===300,'after migration app reads new layout with all 300 grades/students');
  check(v2.notes.length===3&&v2.notes.includes('Second (duplicate id)')&&v2.notes.includes('Slash id'),'duplicate and invalid ids preserved as separate records');
  check(v2.terms===2&&v2.legacy==='keep-me'&&v2.tags.join()==='a,b'&&v2.deep===1,'id-less records, extra fields, primitive arrays, nested settings preserved');
  check(v2.order.join()==='g0,g1,g2','record order preserved');
  check(JSON.stringify(await readAll())===before,'old single record left byte-for-byte untouched');
  let structure;await env.withSecurityRulesDisabled(async c=>{structure=(await getDoc(doc(raw(c),'abetHubs/etde-main/meta/_structure'))).data()});
  check(structure.version===2&&structure.migratedBy===users.admin[0],'_structure written last with migratedBy');
  // 5. concurrent saves from two people don't clobber
  const ictx=await ctxFor(),ip=await signIn(ictx,users.inst[0]);await ip.waitForURL(/my-courses\.html/,{timeout:15000});await ip.waitForFunction(()=>window.__hubReady);
  check(await ip.evaluate(()=>HubStore.mode==='v2'&&!admin()),'instructor lands on My Courses, role from approved list');
  await ap.goto(BASE+'outcomes.html');await ap.waitForFunction(()=>window.__hubReady);
  // both loaded the same state; each adds a different action, then saves
  await ap.evaluate(()=>{hub.improvementActions.push({id:'act_admin',so:'SO1',finding:'admin finding',status:'Planned'})});
  await ip.evaluate(()=>{hub.improvementActions.push({id:'act_inst',so:'SO2',finding:'instructor finding',status:'Planned'})});
  const wa=await ap.evaluate(()=>saveHub().then(r=>r));const wi=await ip.evaluate(()=>saveHub().then(r=>r));
  check(wa.written===1&&wi.written===1,`each save wrote only the changed record (admin ${wa.written}, instructor ${wi.written})`);
  let acts;await env.withSecurityRulesDisabled(async c=>{acts=(await getDocs(collection(raw(c),'abetHubs/etde-main/improvementActions'))).docs.map(d=>d.id).sort()});
  check(acts.join()==='act_admin,act_inst','concurrent saves both kept: '+acts.join());
  // deletes propagate per record
  await ip.evaluate(()=>{hub.grades=hub.grades.filter(g=>g.id!=='g5');return saveHub()});
  let gcount;await env.withSecurityRulesDisabled(async c=>{gcount=(await getDocs(collection(raw(c),'abetHubs/etde-main/grades'))).size});
  check(gcount===299,'deleting one grade deletes one document');
  // instructor working normally on the Outcomes page sees no admin warning
  await ip.goto(BASE+'outcomes.html');await ip.waitForFunction(()=>window.__hubReady);
  await ip.click('[data-oc-tab=actions]');await ip.fill('#caFinding','UI finding');await ip.click('#caSave');await ip.waitForSelector('#caMsg .success',{timeout:10000});
  check(!(await ip.isVisible('#saveWarningBanner'))&&/Saved/.test(await ip.textContent('[data-sync]')),'instructor saves an action from the page with no warning');
  // instructor cannot change admin-only settings: skipped with warning, nothing written
  await ip.evaluate(()=>{hub.settings.programTarget=10});const r3=await ip.evaluate(()=>saveHub());
  check(r3.skipped.includes('settings')&&await ip.isVisible('#saveWarningBanner'),'instructor settings change refused with a clear warning');
  let st;await env.withSecurityRulesDisabled(async c=>{st=(await getDoc(doc(raw(c),'abetHubs/etde-main/meta/settings'))).data().value.programTarget});
  check(st===75,'settings unchanged in Firestore');
  // admin page approved-users manager
  await ap.goto(BASE+'admin.html');await ap.waitForFunction(()=>window.__hubReady);await ap.waitForSelector('#approvedUsersList table',{timeout:10000});
  await ap.fill('#newUserEmail','New.Person@okstate.edu');await ap.click('#addApprovedUser');await ap.waitForTimeout(800);
  let nu;await env.withSecurityRulesDisabled(async c=>{nu=(await getDoc(doc(raw(c),'hubUsers/new.person@okstate.edu'))).data()});
  check(nu&&nu.role==='instructor'&&nu.active===true,'admin adds an approved user from the Administration page');
  // re-running migration is refused
  await ap.goto(BASE+'system-health.html');await ap.waitForFunction(()=>window.__hubReady);await ap.waitForTimeout(800);
  check(/Done\./.test(await ap.textContent('#migrationStatus'))&&!(await ap.isVisible('#runMigration')),'System Health shows migration done; button hidden');
  check(liveCalls.length===0,'no requests to live Firebase/Google endpoints '+liveCalls.slice(0,3).join(' '));
  check(errors.length===0,'no page errors '+errors.join(' | '));
  await browser.close();await env.cleanup();
  console.log(fail?`${fail} FAILED`:'ALL EMULATOR TESTS PASSED');process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
