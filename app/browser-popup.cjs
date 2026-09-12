// Preserve human input ownership across links that open a new window.
async function openPopup({workspace,parent,url,create,isParentVisible,show}){
 const events=parent?(parent.popupEvents??=[]):[];
 const event={sequence:(parent?(parent.popupSequence=(parent.popupSequence||0)+1):1),status:'opening',actionId:parent?.currentActionId||null};
 events.push(event);if(events.length>32)events.shift();
 try{
 const owner=parent?.owner||null,manual=!owner||!!parent?.paused||workspace.paused;
 const result=await create(owner,url);const child=workspace.tab(result.tabId);
 child.parentTabId=parent?.id||null;
 child.task=parent?.task||null;
 if(manual){child.paused=true;child.needsHuman=!!owner;await workspace.adapter.suspend(child.view);}
 workspace.save();
 // Navigation can be slow: do not pull users back after they switch workspace.
 if(manual&&isParentVisible())show(child.id);
 Object.assign(event,{status:'opened',tabId:child.id});
 return result;
 }catch(error){event.status='failed';throw error;}
}
function popupInfo(workspace,parent,clientId,after=0){
 const popups=(parent.popupEvents||[]).filter(e=>e.sequence>after).map(e=>{
  const child=e.tabId&&workspace.tabs.get(e.tabId);
  return {...e,...(e.tabId?{status:!child?'closed':child.owner!==clientId?'unavailable':e.status,paused:!!child?.paused||workspace.paused}:{} )};
 });
 return {popupCursor:parent.popupSequence||0,popups,...(popups.length?{popupInstruction:'These windows were opened by this tab. Inspect each opened tabId with browser_snapshot and continue verification there; do not repeat the original click. For opening tabs or delayed popups use browser_wait_for_popup. Respect manual pauses. Popup creation alone does not confirm verification success.'}:{})};
}
module.exports={openPopup,popupInfo};
