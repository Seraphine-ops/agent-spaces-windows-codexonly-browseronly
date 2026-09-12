// With no application menu, Electron needs explicit editing accelerators.
// Invoke native editing only on the WebContents that received the keystroke.
// No clipboard contents cross IPC or enter application history.
function installEditShortcuts(contents){
 contents.on('before-input-event',(event,input)=>{
  if(input.type!=='keyDown'||input.alt||input.meta||input.isComposing)return;
  const key=input.key.toLowerCase();let action;
  if(input.control){
   if(!input.shift)action={c:'copy',x:'cut',v:'paste',a:'selectAll',z:'undo',y:'redo',insert:'copy'}[key];
   else if(key==='z')action='redo';
   else if(key==='v')action='pasteAndMatchStyle';
  }else if(input.shift){
   action={insert:'paste',delete:'cut'}[key];
  }
  if(action){event.preventDefault();contents[action]();}
 });
}
module.exports={installEditShortcuts};
