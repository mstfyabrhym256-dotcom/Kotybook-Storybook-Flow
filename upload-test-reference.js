
'use strict';

const fs = require('fs');
const path = require('path');
const CanvaMCPClient = require('./canva-mcp-client');

async function main() {
  const canva = new CanvaMCPClient();

  const imagePath = path.join(__dirname, 'test-reference.jpg');

  try {
    // 1. Check image
    if (!fs.existsSync(imagePath)) {
      throw new Error('Image not found: ' + imagePath);
    }

    const imageBuffer = fs.readFileSync(imagePath);

    console.log('Image found:', imagePath);
    console.log('Image size:', imageBuffer.length, 'bytes');

    // 2. Connect to Canva
    console.log('\nConnecting to Canva...');
    await canva.connect();

    // 3. Request a single-use upload URL
    console.log('\nRequesting upload URL...');

    const uploadResult = await canva.callTool(
      'create-upload-url',
      {
        user_intent: 'Upload a test reference image for consistent character generation in a personalized storybook.'
      },
      600000
    );

    const uploadInfo = uploadResult.structuredContent;

    if (!uploadInfo || !uploadInfo.uploadUrl) {
      throw new Error('Canva did not return a valid upload URL.');
    }

    // 4. Upload raw image bytes
    console.log('\nUploading image to Canva...');

    const response = await fetch(uploadInfo.uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream'
      },
      body: imageBuffer,
      signal: AbortSignal.timeout(600000)
    });

    const responseText = await response.text();

    console.log('\nUPLOAD HTTP STATUS:', response.status);
    console.log('\nUPLOAD RESPONSE:');

    let uploadData;

    try {
      uploadData = JSON.parse(responseText);
      console.log(JSON.stringify(uploadData, null, 2));
    } catch {
      console.log(responseText);
      throw new Error('Upload response was not valid JSON.');
    }

    if (!response.ok) {
      throw new Error('Image upload failed with HTTP ' + response.status);
    }

    // 5. Save response for inspection
    fs.writeFileSync(
      path.join(__dirname, 'test-upload-result.json'),
      JSON.stringify(uploadData, null, 2),
      'utf8'
    );

    console.log('\nUpload completed. Response saved to test-upload-result.json');

  } catch (error) {
    console.error('\nERROR:', error.message);
  } finally {
    try {
      await canva.disconnect();
    } catch (error) {
      console.error('Disconnect warning:', error.message);
    }
  }
}

main();
