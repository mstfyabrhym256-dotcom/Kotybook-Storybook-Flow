'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
const {StdioClientTransport}=require('@modelcontextprotocol/sdk/client/stdio.js');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function objs(r){const a=[];if(r?.structuredContent)a.push(r.structuredContent);for(const c of r?.content||[])if(c.type==='text'&&c.text){try{a.push(JSON.parse(c.text))}catch{}}const m=r?._meta?.['com.canva/mcpAppOutput'];if(m?.result)a.push(m.result);return a;}
function get(r,k){for(const o of objs(r)){if(o[k]!==undefined)return o[k];if(o.result?.[k]!==undefined)return o.result[k];if(o.job?.[k]!==undefined)return o.job[k];}return undefined;}
async function main(){
 const auth=path.join(process.env.RUNNER_TEMP,'canva-design-test-client.json');
 fs.writeFileSync(auth,process.env.CANVA_CLIENT_INFO_JSON,{mode:0o600});
 const transport=new StdioClientTransport({command:'npx',args:['--yes','mcp-remote','https://api.canva.com/connect/v1/mcp','3334','--host','127.0.0.1','--static-oauth-client-info','@'+auth],stderr:'inherit',env:{...process.env}});
 const client=new Client({name:'kotybook-design-test',version:'1.0.0'});
 try{
  await client.connect(transport);
  const listed=await client.listTools(),tools=listed.tools||[];
  const names=new Set(tools.map(t=>t.name));
  console.log('CANVA_TOOLS:',[...names].sort().join(','));
  for(const n of ['create-design','get-create-design-async-job','get-design-pages','get-export-formats','export-design'])if(!names.has(n))throw new Error('Required Canva MCP tool unavailable: '+n);
  console.log('CREATE_DESIGN_SCHEMA:',JSON.stringify(tools.find(t=>t.name==='create-design').inputSchema));
  const brief=[
   'Create a complete 11-page portrait 3:4 Arabic children storybook, not a presentation. Full-bleed pages, premium cinematic Pixar-like 3D toy hospital world, sky blue, white, mint, coral and warm golden light. The main child is a six-year-old Egyptian boy named عمرو, shown as a photorealistic human child (not cartoon face), wearing a white doctor coat, light-blue scrubs, navy trousers and silver/navy stethoscope. Keep the same character identity and outfit on every page. All visible story text must be accurate Egyptian colloquial Arabic, RTL, with connected letters and no English. Each inner page has a short story paragraph of 20–30 Arabic words, integrated in clean open space without text boxes. Tiny bottom-left watermark: kotybook 01276626592.',
   'Page 1 cover: exact title عمرو الدكتور and subtitle بطل الرحمة, beautiful 3D Arabic typography with medical icons.',
   'Page 2: عمرو in his bedroom dreaming of becoming a doctor.',
   'Page 3: arriving at a modern hospital and meeting the medical team.',
   'Page 4: counting activity: exactly 3 red first-aid kits and 5 bandage boxes.',
   'Page 5: examination room, checking heartbeat and viewing 3D scans.',
   'Page 6: emergency call, hospital corridor and ambulance.',
   'Page 7: treating an injured athlete with a futuristic cast.',
   'Page 8: interactive maze/tracing activity from البداية to النهاية, passing hearts and vitamins while avoiding germs.',
   'Page 9: fever crisis, treatment, and monitor turning green.',
   'Page 10: peaceful recovery and patients thanking عمرو.',
   'Page 11: عمرو returns as a hero; celebration in the hospital garden.',
   'Preserve this exact 11-page sequence. Do not merge pages. No mockup, no outer border, no page furniture.'
  ].join('\n');
  let r=await client.callTool({name:'create-design',arguments:{brief}},undefined,{timeout:120000});
  let jobId=get(r,'job_id'),token=get(r,'continuation_token'),status=get(r,'status');
  if(!jobId)throw new Error('create-design returned no job_id: '+JSON.stringify(objs(r)).slice(0,2500));
  console.log('CREATE_JOB:',jobId,'STATUS:',status);
  let design=null,deadline=Date.now()+30*60*1000;
  while(Date.now()<deadline){
   if(status==='completed'||status==='success'){design=get(r,'design');break;}
   if(status==='failed'||status==='error')throw new Error('Canva create-design failed: '+JSON.stringify(objs(r)).slice(0,2500));
   const wait=get(r,'polling_policy')?.wait_seconds||15;
   await sleep(Math.max(15000,wait*1000));
   r=await client.callTool({name:'get-create-design-async-job',arguments:{job_id:jobId,continuation_token:token}},undefined,{timeout:120000});
   status=get(r,'status');token=get(r,'continuation_token');
   console.log('CREATE_STATUS:',status);
   if(status==='completed'){design=get(r,'design');break;}
   if(status==='failed')throw new Error('Canva create-design failed: '+JSON.stringify(objs(r)).slice(0,2500));
  }
  if(!design?.id)throw new Error('Timed out or no design id returned: '+JSON.stringify(objs(r)).slice(0,2500));
  console.log('DESIGN_CREATED:',JSON.stringify({id:design.id,url:design.url,edit_url:design.edit_url}));
  let pageCount=null;
  const pages=await client.callTool({name:'get-design-pages',arguments:{design_id:design.id}},undefined,{timeout:120000});
  const items=get(pages,'items')||[];
  pageCount=items.length;
  console.log('DESIGN_PAGE_COUNT:',pageCount);
  const formats=await client.callTool({name:'get-export-formats',arguments:{design_id:design.id}},undefined,{timeout:120000});
  console.log('EXPORT_FORMATS:',JSON.stringify(get(formats,'formats')||{}));
  if(!(get(formats,'formats')||{}).pdf)throw new Error('Canva design does not support PDF export.');
  const exp=await client.callTool({name:'export-design',arguments:{design_id:design.id,format:'pdf'}},undefined,{timeout:120000});
  const urls=get(exp,'urls')||get(exp,'job')?.urls||[];
  if(!urls.length)throw new Error('PDF export returned no download URL: '+JSON.stringify(objs(exp)).slice(0,2500));
  const response=await fetch(urls[0],{signal:AbortSignal.timeout(180000)});
  if(!response.ok)throw new Error('PDF download failed: '+response.status);
  const bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.length<10000)throw new Error('Downloaded PDF is unexpectedly small: '+bytes.length);
  fs.writeFileSync(path.join(process.env.RUNNER_TEMP,'kotybook-canva-smoke-test.pdf'),bytes);
  console.log('PDF_EXPORTED_BYTES:',bytes.length);
  if(pageCount!==11)throw new Error('Expected 11 pages, Canva returned '+pageCount+'. Design: '+design.url);
  console.log('CANVA_DESIGN_TEST_PASSED:',design.url);
 }finally{await client.close().catch(()=>{});}
}
main().catch(e=>{console.error('CANVA_DESIGN_TEST_FAILED:',e.stack||e);process.exit(1);});
