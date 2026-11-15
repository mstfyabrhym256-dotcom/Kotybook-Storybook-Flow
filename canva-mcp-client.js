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
 async callTool(name,args={},timeout=120000){if(!this.connected)throw new Error('Canva MCP is not connected.');const r=await this.client.callTool({name,arguments:args},undefined,{timeout});if(r?.isError){const m=(r.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\\n');throw new Error('Canva MCP '+name+' failed: '+(m||'unknown error')+'; inputSchema='+JSON.stringify(this.toolSchemas[name]||{}));}return r;}
 async disconnect(){if(this.client)await this.client.close().catch(()=>{});this.client=null;this.transport=null;this.connected=false;}
}
module.exports=CanvaMCPClient;
