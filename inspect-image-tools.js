'use strict';

const CanvaMCPClient = require('./canva-mcp-client');

async function main() {
  const canva = new CanvaMCPClient();

  try {
    await canva.connect();

    const result = await canva.callTool('create-upload-url', {
      user_intent: 'Upload a test child reference image for storybook character generation.'
    });

    console.log('\nUPLOAD URL RESULT:');
    console.log(JSON.stringify(result, null, 2));

  } catch (error) {
    console.error('ERROR:', error.message);
  } finally {
    await canva.disconnect();
  }
}

main();