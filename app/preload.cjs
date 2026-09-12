const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('spaces',{
 invoke:(action,args={})=>ipcRenderer.invoke('spaces:ui',action,args),
 onState:callback=>ipcRenderer.on('spaces:state',(_event,state)=>callback(state))
});
