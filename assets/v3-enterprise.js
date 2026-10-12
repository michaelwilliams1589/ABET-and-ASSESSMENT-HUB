
(function(){
"use strict";
function bindEnterpriseTools(){
  const button=document.getElementById("adminResetGraphs");
  if(button){
    button.addEventListener("click",async()=>{
      button.disabled=true;button.textContent="Recalculating…";
      try{
        await window.resetAnalyticsGraphs({purgeOrphans:true});
        const box=document.getElementById("adminResetGraphStatus");
        if(box)box.innerHTML='<div class="notice success">Graphs were rebuilt from the remaining records.</div>';
      }finally{
        button.disabled=false;button.textContent="Reset/Recalculate All Graphs";
      }
    });
  }
  const cleanup=document.getElementById("adminCleanupDeletedUploads");
  if(cleanup){
    cleanup.addEventListener("click",async()=>{
      cleanup.disabled=true;cleanup.textContent="Cleaning…";
      try{await window.cleanupDeletedUploadAnalytics()}
      finally{cleanup.disabled=false;cleanup.textContent="Clean Analytics from Deleted Uploads"}
    });
  }
}
window.onHubReady(bindEnterpriseTools);
})();
