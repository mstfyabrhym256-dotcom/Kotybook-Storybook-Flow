'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const CanvaMCPClient=require('./canva-mcp-client');
const {buildPdfFile,safeName}=require('./pdf-utils');
const APPS_SCRIPT_URL=process.env.APPS_SCRIPT_URL, API_SECRET=process.env.API_SECRET, CODE=process.env.ORDER_CODE;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function required(n,v){if(!v)throw new Error('GitHub Secret/Variable ناقص: '+n);}
async function apps(action,payload={}){
 const r=await fetch(APPS_SCRIPT_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,secret:API_SECRET,...payload}),signal:AbortSignal.timeout(180000)});
 const raw=await r.text();let d;try{d=JSON.parse(raw)}catch{throw new Error('Apps Script رد غير مفهوم: '+raw.slice(0,250))}
 if(!r.ok||d.ok!==true)throw new Error(d.error||d.message||('Apps Script HTTP '+r.status));return d;
}
const STORYBOOK_RULES = `
Create a complete premium personalized children's storybook with exactly 11 pages:
one artistic typographic front cover plus 10 distinct narrative pages. Portrait 3:4,
flat full-bleed artwork, no borders, frames, mockups or digital UI.

PERSONALIZATION: Use the child's name, age, gender and dream. Invent an original,
coherent, age-appropriate adventure that progressively moves the child toward that dream.
"Amr the Doctor" is only an example, never fixed content. Adapt setting, outfit, props,
supporting characters and events to the actual dream. Never assume every child wants to be a doctor.

NARRATIVE: Exactly 10 interior pages. All interior text MUST be simple Egyptian colloquial
Arabic for children (العامية المصرية البسيطة), never Modern Standard Arabic. Each interior
page must contain 20-30 words. Include a beginning, escalating adventure, challenge,
helpful action, resolution and uplifting ending. Include two story-integrated visual activities:
one clear counting game and one finger-trace maze/dotted path. Label endpoints exactly
"البداية" and "النهاية". Activities must be visually unambiguous and must not replace the story.

PAGE PLAN: Cover; dream/calling; arrival at dream-related place; counting activity; first task;
urgent challenge; skillful helpful action; maze activity; overcome bigger obstacle; warm solution;
hero's return/celebration with a concrete hopeful step toward the dream.

PREMIUM HIGH-END GRAPHICS: Exceptional professional art direction, cinematic lighting,
rich fine detail, refined color harmony, realistic materials, depth, clean composition and
print-quality finish. Environments can be richly stylized toy-like 3D animated worlds,
but the child must remain photorealistic and lifelike, absolutely NO cartoon/3D/illustration
filters on the child. Use the exact uploaded reference photo on every page; preserve same face,
facial geometry, skin tone, hairstyle and identity. Never redesign the child. Natural expressive
body language and believable interaction. Keep outfit appropriate to the dream and consistent.

TYPOGRAPHY: Cover title and subtitle at top center in custom-drawn artistic Arabic lettering,
playful interlocking dimensional letters, glossy/glowing outlines, with tiny dream-related
symbols woven into the lettering. Interior paragraphs in rounded friendly readable Arabic
children's font, high contrast, placed in natural open space at top or bottom. Only a very soft
feathered defocus directly behind letters; no boxes, borders or hard rectangular edges.
Correct connected RTL Arabic, spelling and punctuation. No extra text or English.

BRAND: On EVERY page, bottom-left, render the exact tiny subtle clean white watermark
with faint drop shadow: "kotybook 01276626592". No other logo, watermark or page number.

OUTPUT: Return valid JSON only, no markdown fences:
{"title":"Arabic title","subtitle":"Arabic subtitle","pages":[
{"scene":"detailed visual scene in English","text":"","cover":true},
{"scene":"detailed visual scene in English","text":"20-30 Egyptian colloquial Arabic words","cover":false}
]}
The pages array MUST contain exactly 11 objects: index 0 cover, indices 1-10 interior pages.
Every scene description must specify composition, action, environment and any activity details.
`;

function storyPrompt(m){
 return STORYBOOK_RULES + "\n\nCHILD DETAILS:\nName: "+m.name+
 "\nAge: "+m.age+"\nGender: "+m.gender+"\nDream: "+m.dream+
 "\nCreate an original story specifically for this child.";
}
function wordCount(text){return String(text||"").trim().split(/\s+/).filter(Boolean).length;}
function validateStory(s,m){
 if(!s||!Array.isArray(s.pages)||s.pages.length!==11)
  throw new Error("القصة يجب أن تحتوي على غلاف و10 صفحات داخلية (11 صفحة إجمالًا).");
 s.pages=s.pages.map((p,i)=>({scene:String(p.scene||"").trim(),text:i===0?"":String(p.text||"").trim(),cover:i===0}));
 if(s.pages.some((p,i)=>!p.scene||(i>0&&(!p.text||wordCount(p.text)<20||wordCount(p.text)>30))))
  throw new Error("كل صفحة داخلية لازم تحتوي على وصف و20 إلى 30 كلمة بالعامية المصرية.");
 s.title=String(s.title||("رحلة "+m.name+" نحو حلمه")).slice(0,100);
 s.subtitle=String(s.subtitle||"حكاية بطل بيحقق حلمه").slice(0,100);
 return s;
}

async function createStory(m){
 const prompt=storyPrompt(m);let last;
 if(process.env.GROQ_API_KEY){
  try{
   const r=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+process.env.GROQ_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.GROQ_MODEL||'openai/gpt-oss-120b',messages:[{role:'system',content:'أعد JSON صالحًا فقط.'},{role:'user',content:prompt}],temperature:.8,max_completion_tokens:8192,response_format:{type:'json_object'}}),signal:AbortSignal.timeout(120000)});
   const raw=await r.text(),d=JSON.parse(raw);if(!r.ok)throw new Error(d.error?.message||raw.slice(0,250));return validateStory(JSON.parse(d.choices?.[0]?.message?.content||'{}'),m);
  }catch(e){last=e;console.error('Groq:',e.message);}
 }
 if(process.env.GEMINI_API_KEY){
  try{
   const model=process.env.GEMINI_MODEL||'gemini-2.5-flash';
   const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':process.env.GEMINI_API_KEY},body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{temperature:.8,maxOutputTokens:8192,responseMimeType:'application/json'}}),signal:AbortSignal.timeout(120000)});
   const raw=await r.text(),d=JSON.parse(raw);if(!r.ok)throw new Error(d.error?.message||raw.slice(0,250));const out=(d.candidates?.[0]?.content?.parts||[]).map(x=>x.text||'').join('');return validateStory(JSON.parse(out),m);
  }catch(e){last=e;}
 }
 throw new Error('فشل تأليف القصة: '+(last?.message||'أضف GROQ_API_KEY أو GEMINI_API_KEY.'));
}
function promptFor(p,m,title,i,subtitle){
 const common='Premium high-end professionally art-directed personalized children storybook artwork. Portrait 3:4, flat full-bleed, no borders, frames, mockups or UI. Use the uploaded reference photo as the exact identity source; preserve the same photorealistic lifelike child face, facial geometry, skin tone and hairstyle. Absolutely no cartoon/3D/illustration filters on the child. Rich cinematic stylized 3D toy-like environments, exceptional detail, natural lighting, refined colors, polished print-quality composition. Keep dream-appropriate outfit and identity consistent. Accurate connected RTL Arabic, no spelling errors. Include exact subtle white bottom-left watermark with faint shadow: "kotybook 01276626592". No other logos, page numbers, watermarks or English text.';
 if(i===0)return common+' FRONT COVER. Action-packed artistic cover. At top center render exact Arabic title «'+title+'» and subtitle «'+subtitle+'» as custom-drawn playful interlocking dimensional Arabic lettering with glossy glowing outlines and tiny dream-related symbols. Scene: '+p.scene+'.';
 return common+' INTERIOR PAGE '+i+' of 10. Scene: '+p.scene+'. Render this exact Egyptian colloquial Arabic paragraph (20-30 words), letter-for-letter, no additions or omissions: «'+p.text+'». Place in natural open space at top or bottom in a rounded friendly Arabic children font, high contrast, with only soft feathered defocus behind letters; no text box or border. If activity page, make countable objects/path clear and label endpoints exactly «البداية» and «النهاية».';
}
function textObjects(r){
 const out=[];if(r?.structuredContent)out.push(r.structuredContent);for(const c of r?.content||[]){if(c.type==='text'&&c.text){try{out.push(JSON.parse(c.text))}catch{}}}
 const m=r?._meta?.['com.canva/mcpAppOutput'];if(m?.result)out.push(m.result);return out;
}
function value(r,k){for(const o of textObjects(r)){if(o[k]!==undefined)return o[k];if(o.result?.[k]!==undefined)return o.result[k];}return undefined;}
async function uploadReference(client,file){
 const ticket=await client.callTool('create-upload-url',{});const url=value(ticket,'uploadUrl');if(!url)throw new Error('Canva لم يرجع uploadUrl.');
 const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:fs.readFileSync(file),signal:AbortSignal.timeout(120000)});
 const raw=await r.text();if(!r.ok)throw new Error('فشل رفع صورة الطفل إلى Canva: '+r.status+' '+raw.slice(0,200));
 const d=JSON.parse(raw);if(!d.mediaId)throw new Error('Canva لم يرجع mediaId للصورة المرجعية.');return d.mediaId;
}
function imageBlock(r){
 for(const c of r?.content||[])if(c.type==='image'&&c.data)return {bytes:Buffer.from(c.data,'base64'),mime:c.mimeType||'image/png'};
 for(const o of textObjects(r))for(const f of (o.files||o.result?.files||[])){if(f.base64||f.data)return {bytes:Buffer.from(f.base64||f.data,'base64'),mime:f.mimeType||'image/png'};if(f.url&&/^https:\/\//i.test(f.url))return {url:f.url,mime:f.mimeType||'image/png'};}
 return null;
}
async function saveMedia(client,id,target,jobResult){
 // Prefer Canva's PRINT download URL when the MCP app exposes it in job metadata.
 let found=imageBlock(jobResult);
 if(!found){const r=await client.callTool('get-assets',{asset_ids:[id]},120000);found=imageBlock(r);}
 if(found?.bytes){const ext=/jpe?g/i.test(found.mime)?'.jpg':'.png',p=target.replace(/\.png$/i,ext);fs.writeFileSync(p,found.bytes);return p;}
 if(found?.url){const d=await fetch(found.url,{signal:AbortSignal.timeout(120000)});if(!d.ok)throw new Error('تعذر تنزيل صورة Canva: '+d.status);const b=Buffer.from(await d.arrayBuffer());if(b.length<10000)throw new Error('صورة Canva المستلمة صغيرة جدًا.');const p=target.replace(/\.png$/i,/jpe?g/i.test(found.mime)?'.jpg':'.png');fs.writeFileSync(p,b);return p;}
 throw new Error('Canva أعاد MEDIA ID لكن get-assets لم يُرجع بيانات الصورة. ID='+id);
}
async function generateImage(client,ref,prompt,index,dir){
 // Canva requires user_intent and ContentRef objects for image references.
 // ref is the mediaId returned by create-upload-url; pass it as a MEDIA reference.
 const started=await client.callTool('generate-image',{
  prompt,
  user_intent:'Create a personalized illustrated children storybook using the uploaded child photo as the visual reference.',
  imageReferences:[{type:'MEDIA',id:ref}]
 },120000);
 const id=value(started,'jobId');if(!id)throw new Error('Canva لم يرجع jobId للصورة '+(index+1));
 const deadline=Date.now()+8*60*1000;let media=null,lastJob=null;
 while(Date.now()<deadline){
  await sleep(5000);
  lastJob=await client.callTool('get-generate-image-job',{jobId:id},120000);
  const state=value(lastJob,'status');
  if(state==='SUCCESS'){
   const res=value(lastJob,'results')||value(lastJob,'result')?.results;
   media=Array.isArray(res)?res.find(x=>x.type==='MEDIA')?.id:null;
   media=media||value(lastJob,'mediaId');break;
  }
  if(state==='FAILURE')throw new Error('Canva generation failed: '+(value(lastJob,'failureMessage')||'unknown'));
 }
 if(!media)throw new Error('انتهت مهلة توليد الصورة '+(index+1));
 return saveMedia(client,media,path.join(dir,'page-'+String(index+1).padStart(2,'0')+'.png'),lastJob);
}
async function uploadPdf(code,file,title){
 const bytes=fs.readFileSync(file),s=await apps('startUpload',{code,fileSize:bytes.length,fileName:safeName(title)+'.pdf'});if(!s.sessionUrl)throw new Error('Apps Script لم يرجع sessionUrl.');
 const r=await fetch(s.sessionUrl,{method:'PUT',headers:{'Content-Type':'application/pdf','Content-Length':String(bytes.length)},body:bytes,signal:AbortSignal.timeout(600000)});const raw=await r.text();if(!r.ok)throw new Error('فشل رفع PDF إلى Drive: '+r.status+' '+raw.slice(0,250));const d=JSON.parse(raw);if(!d.id)throw new Error('Drive لم يرجع file ID.');return apps('completeStory',{code,fileId:d.id,fileName:safeName(title)});
}
async function main(){
 required('APPS_SCRIPT_URL',APPS_SCRIPT_URL);required('API_SECRET',API_SECRET);required('ORDER_CODE',CODE);required('CANVA_CLIENT_INFO_JSON',process.env.CANVA_CLIENT_INFO_JSON);
 if(!process.env.GROQ_API_KEY&&!process.env.GEMINI_API_KEY)throw new Error('أضف GROQ_API_KEY أو GEMINI_API_KEY إلى GitHub Secrets.');
 const dir=path.join(__dirname,'work',Date.now()+'-'+crypto.randomBytes(3).toString('hex'));fs.mkdirSync(dir,{recursive:true});
 const clientInfo=path.join(dir,'canva-client-info.json');fs.writeFileSync(clientInfo,process.env.CANVA_CLIENT_INFO_JSON,{mode:0o600});process.env.CANVA_CLIENT_INFO_PATH=clientInfo;
 let client;
 try{
  console.log('1) جلب الطلب والصورة من Apps Script');const job=await apps('getJob',{code:CODE});if(!job.meta||!job.photoBase64)throw new Error('بيانات الطلب أو الصورة ناقصة.');
  const mime=String(job.photoMime||'image/jpeg').toLowerCase(),ext=({'image/jpeg':'.jpg','image/jpg':'.jpg','image/png':'.png','image/webp':'.webp'})[mime];if(!ext)throw new Error('صيغة صورة غير مدعومة: '+mime);
  const photo=path.join(dir,'reference'+ext);fs.writeFileSync(photo,Buffer.from(job.photoBase64,'base64'));if(fs.statSync(photo).size<1000)throw new Error('صورة العميل تالفة.');
  console.log('2) تأليف قصة من 11 صفحة: غلاف + 10 صفحات داخلية');const story=await createStory(job.meta);const meta={...job.meta,title:story.title};
  console.log('3) الاتصال بـ Canva MCP');client=new CanvaMCPClient();await client.connect();const ref=await uploadReference(client,photo);
  const images=[];for(let i=0;i<11;i++){console.log('إنشاء الصورة '+(i+1)+'/10');const f=await generateImage(client,ref,promptFor(story.pages[i],meta,story.title,i,story.subtitle),i,dir);if(!fs.existsSync(f)||fs.statSync(f).size<10000)throw new Error('الصورة '+(i+1)+' غير صالحة.');images.push(f);}
  if(images.length!==11)throw new Error('لم يتم إنشاء 11 صورة (غلاف + 10 صفحات).');
  console.log('4) إنشاء PDF');const pdf=path.join(dir,safeName(story.title)+'.pdf');await buildPdfFile(images,pdf,story.title,meta.name);if(!fs.existsSync(pdf)||fs.statSync(pdf).size<50000)throw new Error('PDF الناتج غير صالح.');
  console.log('5) رفع PDF إلى Google Drive');const done=await uploadPdf(CODE,pdf,story.title);console.log('KOTYBOOK STORY COMPLETED:',done.url||'Drive upload complete');
 }catch(e){console.error('KOTYBOOK STORY FAILED:',e.stack||e.message);try{await apps('failStory',{code:CODE,error:String(e.message||e).slice(0,500)});}catch(x){console.error('تعذر تسجيل الفشل في Sheets:',x.message);}throw e;
 }finally{if(client)await client.disconnect().catch(()=>{});fs.rmSync(dir,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exit(1);});
