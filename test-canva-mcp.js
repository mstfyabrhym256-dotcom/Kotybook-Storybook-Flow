
'use strict';

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const path = require('node:path');

const ROOT = __dirname;
const AUTH_FILE = path.join(ROOT, 'canva-client-info.json');

async function main() {
  console.log('Connecting to Canva MCP...');

  const transport = new StdioClientTransport({
    command: 'npx.cmd',
    args: [
      '-y',
      'mcp-remote',
      'https://api.canva.com/connect/v1/mcp',
      '3334',
      '--host',
      '127.0.0.1',
      '--static-oauth-client-info',
      `@${AUTH_FILE}`
    ],
    cwd: ROOT,
    stderr: 'inherit'
  });

  const client = new Client({
    name: 'kotybook-storybook',
    version: '1.0.0'
  });

  try {
    await client.connect(transport);

    console.log('\nConnected to Canva MCP successfully.');

    const result = await client.listTools();

    console.log('\nAvailable Canva MCP tools:');
    console.log('--------------------------');

    for (const tool of result.tools || []) {
      console.log(`\nName: ${tool.name}`);
      console.log(`Description: ${tool.description || 'No description'}`);
      if (tool.inputSchema) {
        console.log('Input schema:');
        console.log(JSON.stringify(tool.inputSchema, null, 2));
      }
    }

    console.log(`\nTotal tools: ${(result.tools || []).length}`);
  } catch (error) {
    console.error('\nCanva MCP test failed:');
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await client.close().catch(() => {});
  }
}

main();
