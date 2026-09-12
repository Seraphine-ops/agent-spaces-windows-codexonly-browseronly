const path=require('node:path');
const os=require('node:os');
// Shared by the app and its Node.js MCP process. Never uses a source checkout for user data.
function dataDirectory(){return process.env.AGENT_SPACES_DATA||path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'AppData','Local'),'Agent Spaces Browser');}
module.exports={dataDirectory};
