// Full-page screenshots of every page with Firebase mocked (same mock and sample data as smoke-test.js).
//   python3 -m http.server 8765 &   then   node tools/screenshots.js <prefix> <outdir>
const {chromium}=require('playwright');const fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'smoke-test.js'),'utf8');
const MOCK=eval(src.match(/const MOCK=(`[\s\S]*?`);/)[1]);
const FIX=eval('(()=>{'+src.match(/const grades=[\s\S]*?const FIX=[\s\S]*?;\n(?=\(async)/)[0]+';return FIX})()');
const prefix=process.argv[2]||'shot',out=process.argv[3]||'/tmp/shots';fs.mkdirSync(out,{recursive:true});
(async()=>{
  const b=await chromium.launch();
  const ctx=await b.newContext({viewport:{width:1366,height:900}});
  await ctx.route('https://www.gstatic.com/firebasejs/**',r=>r.fulfill({contentType:'application/javascript',body:r.request().url().includes('app-compat')?MOCK:''}));
  await ctx.addInitScript(fix=>{if(location.pathname.endsWith('index.html'))return;window.__mockUser={email:'michael.williams14@okstate.edu'};if(!localStorage.mockHub)localStorage.mockHub=JSON.stringify(fix);localStorage.etdeMyInstructorName='Michael Williams'},FIX);
  const pages=fs.readdirSync(path.join(__dirname,'..')).filter(f=>f.endsWith('.html'));
  for(const f of pages){
    const p=await ctx.newPage();await p.goto('http://127.0.0.1:8765/'+f);
    await p.waitForFunction(()=>window.__hubReady||location.pathname.endsWith('index.html'),null,{timeout:8000}).catch(()=>{});
    await p.waitForTimeout(500);await p.screenshot({path:path.join(out,`${prefix}-${f.replace('.html','')}.png`),fullPage:true});await p.close();
  }
  await b.close();console.log('saved',pages.length,'screens to',out);
})();
