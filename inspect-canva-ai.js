'use strict';

const CanvaMCPClient = require('./canva-mcp-client');

async function main() {
  const canva = new CanvaMCPClient();

  try {
    console.log('Connecting to Canva AI tools...\n');
    await canva.connect();

    const result = await canva.listTools();
    const tools = result.tools || [];

    const keywords = [
      'generate',
      'image',
      'design',
      'brand',
      'template',
      'magic',
      'ai',
      'upload'
    ];

    const matches = tools.filter(tool => {
      const searchable = (
        tool.name + ' ' + (tool.description || '')
      ).toLowerCase();

      return keywords.some(keyword => searchable.includes(keyword));
    });

    console.log('Total Canva MCP tools:', tools.length);
    console.log('Matching AI/design tools:', matches.length);

    for (const tool of matches) {
      console.log('\n' + '='.repeat(70));
      console.log('NAME:', tool.name);
      console.log('\nDESCRIPTION:\n', tool.description || 'No description');
      console.log('\nINPUT SCHEMA:\n');
      console.log(JSON.stringify(tool.inputSchema || {}, null, 2));
    }

    console.log('\nAI tools inspection completed.');

  } catch (error) {
    console.error('\nInspection failed:', error.message);
    process.exitCode = 1;
  } finally {
    await canva.disconnect();
  }
}

main();