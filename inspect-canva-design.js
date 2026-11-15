'use strict';

const CanvaMCPClient = require('./canva-mcp-client');

async function main() {
  const canva = new CanvaMCPClient();

  const requiredTools = [
    'create-design',
    'get-create-design-async-job',
    'create-upload-url',
    'export-design',
    'get-design-pages',
    'get-design',
    'get-export-formats'
  ];

  try {
    console.log('Connecting to Canva MCP...\n');
    await canva.connect();

    const result = await canva.listTools();
    const tools = result.tools || [];

    for (const name of requiredTools) {
      const tool = tools.find(item => item.name === name);

      console.log('\n' + '='.repeat(65));
      console.log('TOOL:', name);

      if (!tool) {
        console.log('NOT AVAILABLE');
        continue;
      }

      console.log('\nDESCRIPTION:\n', tool.description || 'No description');
      console.log('\nINPUT SCHEMA:\n');
      console.log(JSON.stringify(tool.inputSchema || {}, null, 2));
    }

    console.log('\n\nInspection completed successfully.');

  } catch (error) {
    console.error('\nInspection failed:', error.message);
    process.exitCode = 1;
  } finally {
    await canva.disconnect();
  }
}

main();