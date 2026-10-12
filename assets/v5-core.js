
(function(){
"use strict";
function v5CollectionHealth(){
  const h=window.hub||{};
  const required=["courses","students","slos","assignments","grades","routedUploads","abetAssignmentMappings"];
  return required.map(name=>({name,ok:Array.isArray(h[name]),count:Array.isArray(h[name])?h[name].length:0}));
}
function renderV5Health(){
  const host=document.getElementById("v5CoreHealth");
  if(!host)return;
  const rows=v5CollectionHealth();
  host.innerHTML=rows.map(r=>`<div class="admin-row"><strong>${r.ok?"✓":"✗"} ${String(r.name).replace(/[<>&"]/g,"")}</strong><br>${r.ok?r.count+" record(s)":"Collection was not initialized"}</div>`).join("");
}
window.onHubReady(renderV5Health);
window.v5CollectionHealth=v5CollectionHealth;
})();
