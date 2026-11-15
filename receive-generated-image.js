
'use strict';

const fs = require('fs');
const path = require('path');

async function main() {
  const resultPath = path.join(
    __dirname,
    'generated-image-result.json'
  );

  if (!fs.existsSync(resultPath)) {
    console.error('ERROR: Generated image result file not found.');
    process.exitCode = 1;
    return;
  }

  try {
    const response = JSON.parse(
      fs.readFileSync(resultPath, 'utf8')
    );

    const result =
      response?._meta?.['com.canva/mcpAppOutput']?.result;

    if (!result || !result.mediaId) {
      throw new Error('Could not find the generated Canva image.');
    }

    console.log('\nGenerated image found successfully.');
    console.log('Media ID:', result.mediaId);
    console.log('Canva URL:', result.canvaUrl);
    
    const printFile = result.files?.find(
      file => file.quality === 'PRINT'
    );

    if (printFile) {
      console.log('Print resolution:',
        `${printFile.width} x ${printFile.height}`
      );
    }

  } catch (error) {
    console.error('ERROR:', error.message);
    process.exitCode = 1;
  }
}

main();
