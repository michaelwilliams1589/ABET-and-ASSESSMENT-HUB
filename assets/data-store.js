/* v5.3 data layer.
   NEW layout (after an administrator runs the one-time migration):
     abetHubs/{workspace}/meta/_structure        {version:2, collections:[...], migratedAt, migratedBy}
     abetHubs/{workspace}/meta/{fieldName}       {value: ...}   settings, curriculum, roadmapSettings, ...
     abetHubs/{workspace}/{arrayName}/{itemId}   one document per record (routedUploads, grades, improvementActions, ...)
   OLD layout (still supported, untouched by migration):
     abetHubs/{workspace}  {hubData:{...everything...}}
   Saves in the new layout only write the records that changed, so two people working at once
   don't overwrite each other, and the 1 MB single-document limit no longer applies. */
(function(){
"use strict";
const ADMIN_META=["settings","curriculum","roadmapSettings"];
const ADMIN_COLLECTIONS=["abetAssignmentMappings","historicalResults"];
const VOLATILE=new Set(["updatedAt","lastMigrationAt"]);
const KNOWN_COLLECTIONS=["routedUploads","students","courses","slos","assignments","grades","qualitativeAssessments","qualitativeDocuments","qualitativeReviews","qualitativeNarratives","streamlinedNarratives","meetingNotes","formsMappings","currentAssignments","teachingHistory","syllabusLibrary","termDates","abetAssignmentMappings","deletedUploadTombstones","analyticsDeletionLog","improvementActions","peoSurveys","advisoryMeetings","historicalResults"];
const BATCH=400;
let snapshot={items:{},meta:{}};   // last state known to be in Firestore
let mode="legacy";

function stable(v){
  if(v===undefined)return "null";
  if(v&&typeof v.toDate==="function")return JSON.stringify(v.toDate().toISOString());
  if(Array.isArray(v))return "["+v.map(stable).join(",")+"]";
  if(v&&typeof v==="object")return "{"+Object.keys(v).filter(k=>v[k]!==undefined).sort().map(k=>JSON.stringify(k)+":"+stable(v[k])).join(",")+"}";
  return JSON.stringify(v);
}
const isRecordArray=v=>Array.isArray(v)&&v.every(x=>x&&typeof x==="object"&&!Array.isArray(x));
function validId(s){return typeof s==="string"&&s.length>0&&s.length<=700&&!s.includes("/")&&s!=="."&&s!==".."&&!/^__.*__$/.test(s)}
function randomId(){return "r"+Date.now().toString(36)+Math.random().toString(36).slice(2,10)}
/* Give every record a stable document id. Records without a usable id (or with a duplicate id) get __docId. */
function assignDocIds(arr,deterministicPrefix){
  const seen=new Set();
  arr.forEach((item,i)=>{
    let d=validId(item.__docId)?item.__docId:validId(item.id)?item.id:null;
    if(!d||seen.has(d)){d=deterministicPrefix?`${deterministicPrefix}_${i}`:randomId();while(seen.has(d))d+="_"+i;item.__docId=d}
    seen.add(d);
    if(typeof item.__seq!=="number")item.__seq=deterministicPrefix?i:Date.now()*1000+i;
  });
  return arr;
}
const docIdOf=item=>validId(item.__docId)?item.__docId:item.id;
function splitHub(hub){
  const collections={},meta={};
  Object.entries(hub||{}).forEach(([k,v])=>{
    if(VOLATILE.has(k)||v===undefined)return;
    if(isRecordArray(v)&&(v.length||KNOWN_COLLECTIONS.includes(k)))collections[k]=v;else meta[k]=v;
  });
  return {collections,meta};
}
function takeSnapshot(hub){
  const {collections,meta}=splitHub(hub);snapshot={items:{},meta:{}};
  Object.entries(collections).forEach(([k,arr])=>{assignDocIds(arr);snapshot.items[k]=new Map(arr.map(x=>[docIdOf(x),stable(x)]))});
  Object.entries(meta).forEach(([k,v])=>snapshot.meta[k]=stable(v));
}
const root=(db,ws)=>db.collection("abetHubs").doc(ws);

async function detect(db,ws){
  const s=await root(db,ws).collection("meta").doc("_structure").get();
  return s.exists&&Number(s.data().version)>=2?s.data():null;
}
async function loadV2(db,ws,structure){
  const hub={};
  const metaSnap=await root(db,ws).collection("meta").get();
  metaSnap.forEach(d=>{if(d.id!=="_structure")hub[d.id]=d.data().value});
  const names=[...new Set([...(structure.collections||[]),...KNOWN_COLLECTIONS])];
  await Promise.all(names.map(async n=>{
    const snap=await root(db,ws).collection(n).get();
    if(snap.empty&&!KNOWN_COLLECTIONS.includes(n))return;
    hub[n]=snap.docs.map(d=>{const x=d.data();if(!validId(x.id)||x.id!==d.id)x.__docId=d.id;return x}).sort((a,b)=>(a.__seq??0)-(b.__seq??0));
  }));
  return hub;
}
async function load(db,ws){
  const structure=await detect(db,ws).catch(e=>{if(e.code==="permission-denied")throw e;return null});
  if(structure){mode="v2";return {hub:await loadV2(db,ws,structure),mode,structure}}
  mode="legacy";
  const snap=await root(db,ws).get();const raw=snap.exists?snap.data():{};
  return {hub:raw.hubData&&typeof raw.hubData==="object"?raw.hubData:{...raw},mode,raw};
}
async function commitOps(db,ops,onCommitted){
  for(let i=0;i<ops.length;i+=BATCH){
    const chunk=ops.slice(i,i+BATCH),b=db.batch();
    chunk.forEach(o=>o.del?b.delete(o.ref):b.set(o.ref,o.data));
    await b.commit();chunk.forEach(onCommitted);
  }
}
/* Write only what changed since the last load/save. Returns counts. */
async function saveV2(db,ws,hub,{isAdmin=false}={}){
  const {collections,meta}=splitHub(hub),ops=[],skipped=[],newCollections=[];
  Object.entries(collections).forEach(([k,arr])=>{
    if(!isAdmin&&ADMIN_COLLECTIONS.includes(k)){skippedIfChanged(k,arr,skipped);return}
    assignDocIds(arr);
    const prev=snapshot.items[k]||new Map(),now=new Set();
    if(!snapshot.items[k]&&!KNOWN_COLLECTIONS.includes(k))newCollections.push(k);
    arr.forEach(x=>{const d=docIdOf(x),s=stable(x);now.add(d);if(prev.get(d)!==s)ops.push({kind:"item",coll:k,id:d,ref:root(db,ws).collection(k).doc(d),data:x,s})});
    prev.forEach((_,d)=>{if(!now.has(d))ops.push({kind:"item",coll:k,id:d,ref:root(db,ws).collection(k).doc(d),del:true})});
  });
  Object.entries(snapshot.items).forEach(([k,prev])=>{if(!collections[k]&&!(ADMIN_COLLECTIONS.includes(k)&&!isAdmin))prev.forEach((_,d)=>ops.push({kind:"item",coll:k,id:d,ref:root(db,ws).collection(k).doc(d),del:true}))});
  Object.entries(meta).forEach(([k,v])=>{
    const s=stable(v);if(snapshot.meta[k]===s)return;
    if(!isAdmin&&ADMIN_META.includes(k)){skipped.push(k);return}
    ops.push({kind:"meta",key:k,ref:root(db,ws).collection("meta").doc(k),data:{value:v},s});
  });
  if(newCollections.length)ops.push({kind:"structure",ref:root(db,ws).collection("meta").doc("_structure"),update:true});
  const structOps=ops.filter(o=>o.kind==="structure"),dataOps=ops.filter(o=>o.kind!=="structure");
  if(structOps.length)await root(db,ws).collection("meta").doc("_structure").update({collections:firebase.firestore.FieldValue.arrayUnion(...newCollections)});
  await commitOps(db,dataOps,o=>{
    if(o.kind==="item"){snapshot.items[o.coll] ||= new Map();o.del?snapshot.items[o.coll].delete(o.id):snapshot.items[o.coll].set(o.id,o.s)}
    else snapshot.meta[o.key]=o.s;
  });
  return {written:dataOps.filter(o=>!o.del).length,deleted:dataOps.filter(o=>o.del).length,skipped};
}
function skippedIfChanged(k,arr,skipped){
  const prev=snapshot.items[k]||new Map();
  if(arr.length!==prev.size||arr.some(x=>prev.get(docIdOf(x))!==stable(x)))skipped.push(k);
}

/* One-time migration: copies the old single record into the new layout. The old record is NOT changed.
   _structure is written last, so the app keeps using the old record until everything is copied. */
async function migrate(db,ws,{userEmail="",onProgress=()=>{}}={}){
  if(await detect(db,ws))throw new Error("This workspace has already been migrated.");
  const snap=await root(db,ws).get();
  if(!snap.exists)throw new Error("No existing workspace record was found to migrate.");
  const raw=snap.data(),hub=raw.hubData&&typeof raw.hubData==="object"?raw.hubData:{...raw};
  const backup={application:"OSUIT ETDE Assessment & Accreditation Hub",kind:"pre-migration-backup",exportedAt:new Date().toISOString(),workspaceId:ws,data:JSON.parse(JSON.stringify(hub))};
  const copy=JSON.parse(JSON.stringify(hub));
  const {collections,meta}=splitHub(copy),ops=[],expected={};
  Object.entries(collections).forEach(([k,arr])=>{
    assignDocIds(arr,"m");expected[k]=arr.length;
    arr.forEach(x=>ops.push({ref:root(db,ws).collection(k).doc(docIdOf(x)),data:x}));
  });
  Object.entries(meta).forEach(([k,v])=>ops.push({ref:root(db,ws).collection("meta").doc(k),data:{value:v}}));
  let done=0;await commitOps(db,ops,()=>{done++;if(done%50===0||done===ops.length)onProgress(done,ops.length)});
  // verify counts before switching over
  const problems=[];
  for(const [k,n] of Object.entries(expected)){const s=await root(db,ws).collection(k).get();if(s.size!==n)problems.push(`${k}: expected ${n}, found ${s.size}`)}
  if(problems.length)throw Object.assign(new Error("Verification failed; the app is still using the old record. "+problems.join("; ")),{backup});
  await root(db,ws).collection("meta").doc("_structure").set({version:2,collections:Object.keys(collections),migratedAt:new Date().toISOString(),migratedBy:userEmail,sourceUpdatedAt:raw.updatedAt||null,counts:expected});
  return {backup,counts:expected,documents:ops.length};
}

window.HubStore={load,saveV2,migrate,detect,takeSnapshot,splitHub,stable,get mode(){return mode},ADMIN_META,ADMIN_COLLECTIONS};
})();
