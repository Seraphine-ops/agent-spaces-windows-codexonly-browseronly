import {spawn} from 'node:child_process';import {existsSync} from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const branded=path.join(root,'node_modules/electron/dist/AgentSpaces.exe');
const executable=process.platform==='win32'&&existsSync(branded)?branded:(await import('electron')).default;
const child=spawn(executable,[root,...process.argv.slice(2)],{cwd:root,windowsHide:true,stdio:'inherit'});child.on('error',()=>{console.error('Agent Spaces could not start.');process.exitCode=1;});child.on('exit',code=>{process.exitCode=code||0;});
