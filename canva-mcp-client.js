
'use strict';

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const path = require('node:path');

const ROOT = __dirname;
const AUTH_FILE = path.join(ROOT, 'canva-client-info.json');

// مهلة افتراضية 10 دقائق
const DEFAULT_TIMEOUT = 10 * 60 * 1000;

class CanvaMCPClient {
  constructor() {
    this.client = null;
    this.transport = null;
    this.connected = false;
  }

  async connect() {
    if (this.connected) return;

    this.transport = new StdioClientTransport({
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

    this.client = new Client({
      name: 'kotybook-storybook',
      version: '1.0.0'
    });

    await this.client.connect(this.transport);
    this.connected = true;

    console.log('Canva MCP connected successfully.');
  }

  async listTools() {
    if (!this.connected) {
      throw new Error('Canva MCP is not connected.');
    }

    return await this.client.listTools();
  }

  async callTool(name, args = {}, timeout = DEFAULT_TIMEOUT) {
    if (!this.connected) {
      throw new Error('Canva MCP is not connected.');
    }

    return await this.client.callTool(
      {
        name,
        arguments: args
      },
      undefined,
      {
        timeout
      }
    );
  }

  async disconnect() {
    if (this.client) {
      await this.client.close().catch(() => {});
    }

    this.client = null;
    this.transport = null;
    this.connected = false;

    console.log('Canva MCP disconnected.');
  }
}

module.exports = CanvaMCPClient;
