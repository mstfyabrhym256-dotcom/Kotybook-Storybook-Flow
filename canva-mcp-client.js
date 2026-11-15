'use strict';
const path=require('node:path');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
const {StdioClientTransport}=require('@modelcontextprotocol/sdk/client/stdio.js');
class CanvaMCPClient{
 constructor(){this.client=null;this.transport=null;this.connected=false;this.toolSchemas={};}
 async connect(){
  if(this.connected)return;const auth=process.env.CANVA_CLIENT_INFO_PATH;if(!auth)throw new Error('CANVA_CLIENT_INFO_PATH is missing.');
  this.transport=new StdioClientTransport({command:process.platform==='win32'?'npx.cmd':'npx',args:['--yes','mcp-remote','https://api.canva.com/connect/v1/mcp','3334','--host','127.0.0.1','--static-oauth-client-info','@'+path.resolve(auth)],cwd:__dirname,stderr:'inherit',env:{...process.env}});
  this.client=new Client({name:'kotybook-storybook',version:'3.0.0'});await this.client.connect(this.transport);this.connected=true;
  const t=await this.client.listTools(),names=new Set((t.tools||[]).map(x=>x.name)),needed=['create-upload-url','generate-image','get-generate-image-job','get-assets'],missing=needed.filter(x=>!names.has(x));if(missing.length)throw new Error('Canva MCP tools missing: '+missing.join(', '));
  for(const tool of t.tools||[])this.toolSchemas[tool.name]=tool.inputSchema||{};
  console.log('Canva MCP connected; required tools verified.');
  console.log('Canva generate-image input schema:',JSON.stringify(this.toolSchemas['generate-image']));
 }
 async callTool(name,args={},timeout=120000){
  if(!this.connected)throw new Error('Canva MCP is not connected.');
  const retryable=new Set(['get-generate-image-job','get-assets']);
  let lastError;
  for(let attempt=1;attempt<=4;attempt++){
   try{
    const r=await this.client.callTool({name,arguments:args},undefined,{timeout});
    if(r?.isError){
     const m=(r.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\\n');
     throw new Error('Canva MCP '+name+' failed: '+(m||'unknown error')+'; inputSchema='+JSON.stringify(this.toolSchemas[name]||{}));
    }
    return r;
   }catch(error){
    lastError=error;
    const message=String(error?.message||error).toLowerCase();
    const transient=/\b(429|500|502|503|504)\b|service unavailable|temporarily unavailable|overloaded|rate.?limit|too many requests|quota.?cooldown|cooldown|client_http_not_implemented|mcp error -32001|econnreset|etimedout|socket hang up|fetch failed/.test(message);
    if(!retryable.has(name)||!transient||attempt===4)throw error;
    const delay=[3000,8000,16000][attempt-1];
    console.warn('Canva '+name+' temporary error; retry '+attempt+'/3 in '+(delay/1000)+'s:',String(error.message||error).slice(0,250));
    await new Promise(resolve=>setTimeout(resolve,delay));
   }
  }
  throw lastError;
 }
 async reconnect(){
  await this.disconnect();
  await new Promise(resolve=>setTimeout(resolve,1500));
  await this.connect();
 }
 async disconnect(){if(this.client)await this.client.close().catch(()=>{});this.client=null;this.transport=null;this.connected=false;}
}
module.exports=CanvaMCPClient;
