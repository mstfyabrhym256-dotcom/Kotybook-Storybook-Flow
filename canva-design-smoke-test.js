'use strict';
const fs=require('node:fs');
const path=require('node:path');
const CanvaMCPClient=require('./canva-mcp-client');
const {buildPdfFile}=require('./pdf-utils');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function roots(r){
 const out=[];
 if(r?.structuredContent)out.push(r.structuredContent);
 for(const c of r?.content||[])if(c.type==='text'&&c.text){try{out.push(JSON.parse(c.text));}catch{}}
 const m=r?._meta?.['com.canva/mcpAppOutput'];if(m?.result)out.push(m.result);
 return out;
}
function value(r,key){
 for(const o of roots(r)){if(o[key]!==undefined)return o[key];if(o.result?.[key]!==undefined)return o.result[key];}
 return undefined;
}
function imageFile(r){
 for(const c of r?.content||[])if(c.type==='image'&&c.data)return {bytes:Buffer.from(c.data,'base64'),mime:c.mimeType||'image/png'};
 for(const o of roots(r))for(const f of (o.files||o.result?.files||[])){
  if(f.base64||f.data)return {bytes:Buffer.from(f.base64||f.data,'base64'),mime:f.mimeType||'image/png'};
  if(f.url&&/^https:\/\//i.test(f.url))return {url:f.url,mime:f.mimeType||'image/png'};
 }
 return null;
}
async function main(){
 const dir=process.env.RUNNER_TEMP||process.cwd();
 const refFile=path.join(process.cwd(),'test-reference.jpg');
 if(!fs.existsSync(refFile))throw new Error('test-reference.jpg is missing from the repository.');
 if(!process.env.CANVA_CLIENT_INFO_JSON)throw new Error('CANVA_CLIENT_INFO_JSON is missing.');
 const auth=path.join(dir,'canva-design-test-client.json');
 fs.writeFileSync(auth,process.env.CANVA_CLIENT_INFO_JSON,{mode:0o600});
 process.env.CANVA_CLIENT_INFO_PATH=auth;
 const client=new CanvaMCPClient();
 try{
  console.log('STEP 1: Connect and inspect Canva tools');
  await client.connect();
  console.log('GENERATE_IMAGE_SCHEMA:',JSON.stringify(client.toolSchemas['generate-image']));
  console.log('STEP 2: Request upload URL for the exact reference photo');
  const ticket=await client.callTool('create-upload-url',{
   user_intent:'Upload the supplied reference photo to test identity-consistent personalized storybook image generation.'
  },120000);
  const uploadUrl=value(ticket,'uploadUrl');
  if(!uploadUrl)throw new Error('Canva did not return uploadUrl: '+JSON.stringify(roots(ticket)).slice(0,2000));
  const upload=await fetch(uploadUrl,{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:fs.readFileSync(refFile),signal:AbortSignal.timeout(180000)});
  const uploadText=await upload.text();
  if(!upload.ok)throw new Error('Reference photo upload failed: HTTP '+upload.status+' '+uploadText.slice(0,300));
  const uploadData=JSON.parse(uploadText);
  if(!uploadData.mediaId)throw new Error('Canva upload response has no mediaId: '+uploadText.slice(0,1000));
  console.log('REFERENCE_UPLOAD_OK: mediaId received; source photo left unchanged.');
  console.log('STEP 3: Generate one sample page using the uploaded reference');
  const started=await client.callTool('generate-image',{
   prompt:'Create one premium portrait 3:4 illustrated children storybook page. Use the attached reference photo as the identity source. Preserve the same child recognizable facial features, skin tone and hairstyle; do not replace the child with a different person. Show the child as a confident young explorer in a magical library, cinematic polished 3D storybook illustration, warm light, beautiful composition. No text, no logo, no watermark, no mockup.',
   user_intent:'Create one sample personalized storybook illustration while preserving the identity of the uploaded reference child.',
   imageReferences:[{type:'MEDIA',id:uploadData.mediaId}]
  },180000);
  const jobId=value(started,'jobId');
  if(!jobId)throw new Error('Canva did not return jobId: '+JSON.stringify(roots(started)).slice(0,2000));
  console.log('IMAGE_JOB_STARTED:',jobId);
  const deadline=Date.now()+12*60*1000;let mediaId=null,last=null;
  while(Date.now()<deadline){
   await sleep(6000);
   last=await client.callTool('get-generate-image-job',{jobId},120000);
   const status=value(last,'status');
   console.log('IMAGE_JOB_STATUS:',status||'unknown');
   if(status==='SUCCESS'){
    const results=value(last,'results')||value(last,'result')?.results;
    mediaId=Array.isArray(results)?results.find(x=>x.type==='MEDIA')?.id:null;
    mediaId=mediaId||value(last,'mediaId');
    break;
   }
   if(status==='FAILURE')throw new Error('Canva image generation failed: '+(value(last,'failureMessage')||JSON.stringify(roots(last)).slice(0,1500)));
  }
  if(!mediaId)throw new Error('Timed out waiting for Canva image generation.');
  console.log('STEP 4: Download generated image');
  let found=imageFile(last);
  if(!found){const assets=await client.callTool('get-assets',{asset_ids:[mediaId]},120000);found=imageFile(assets);}
  if(!found)throw new Error('Canva returned mediaId but no downloadable image data.');
  let bytes=found.bytes;
  if(found.url){const response=await fetch(found.url,{signal:AbortSignal.timeout(180000)});if(!response.ok)throw new Error('Image download failed: HTTP '+response.status);bytes=Buffer.from(await response.arrayBuffer());}
  if(!bytes||bytes.length<10000)throw new Error('Generated image is empty or unexpectedly small.');
  const ext=/jpe?g/i.test(found.mime)?'.jpg':'.png';
  const imagePath=path.join(dir,'kotybook-reference-smoke-test'+ext);
  fs.writeFileSync(imagePath,bytes);
  console.log('GENERATED_IMAGE_BYTES:',bytes.length);
  console.log('STEP 5: Build one-page PDF to validate the final file pipeline');
  const pdf=path.join(dir,'kotybook-canva-smoke-test.pdf');
  await buildPdfFile([imagePath],pdf,'Kotybook reference test');
  if(!fs.existsSync(pdf)||fs.statSync(pdf).size<10000)throw new Error('Smoke-test PDF was not created correctly.');
  console.log('CANVA_REFERENCE_TEST_PASSED');
 }finally{await client.disconnect();}
}
main().catch(e=>{console.error('CANVA_REFERENCE_TEST_FAILED:',e.stack||e);process.exit(1);});
