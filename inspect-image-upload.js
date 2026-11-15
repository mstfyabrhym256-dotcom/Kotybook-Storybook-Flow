
'use strict';

const CanvaMCPClient = require('./canva-mcp-client');

async function main() {
  const canva = new CanvaMCPClient();

  try {
    console.log('Connecting to Canva MCP...');

    await canva.connect();

    console.log('Connected successfully.');
    console.log('Requesting upload URL...');

    const result = await canva.callTool(
      'create-upload-url',
      {
        user_intent: 'Upload a test reference image for consistent child character generation in a personalized storybook.'
      },
      600000
    );

    console.log('\nUPLOAD URL RESULT:');
    console.log(JSON.stringify(result, null, 2));

  } catch (error) {
    console.error('\nUPLOAD ERROR:');
    console.error(error.message);

  } finally {
    console.log('\nDisconnecting Canva MCP...');

    try {
      await canva.disconnect();
    } catch (error) {
      console.error('Disconnect warning:', error.message);
    }
  }
}

main();
