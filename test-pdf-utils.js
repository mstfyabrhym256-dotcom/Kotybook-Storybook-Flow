'use strict';
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const sharp=require('sharp');
const {PDFDocument}=require('pdf-lib');
const {buildPdfFile}=require('./pdf-utils');

async function main(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kotybook-pdf-test-'));
 try{
  const images=[];
  for(let i=1;i<=11;i++){
   const file=path.join(dir,'page-'+String(i).padStart(2,'0')+'.png');
   await sharp({create:{width:900,height:1200,channels:3,background:{r:i*10,g:120,b:190}}}).png().toFile(file);
   images.push(file);
  }
  const pdfPath=path.join(dir,'storybook-test.pdf');
  await buildPdfFile(images,pdfPath,'Kotybook PDF Test','Test Child');
  const bytes=fs.readFileSync(pdfPath);
  const pdf=await PDFDocument.load(bytes);
  if(pdf.getPageCount()!==11)throw new Error('Expected 11 PDF pages; got '+pdf.getPageCount());
  if(bytes.length<10000)throw new Error('PDF output is unexpectedly small: '+bytes.length);
  console.log('PDF_UTILS_TEST_PASSED: 11 pages, '+bytes.length+' bytes.');
 }finally{
  fs.rmSync(dir,{recursive:true,force:true});
 }
}
main().catch(error=>{console.error('PDF_UTILS_TEST_FAILED:',error);process.exit(1);});
