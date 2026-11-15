
const CanvaMCPClient = require('./canva-mcp-client');

async function main() {
  const canva = new CanvaMCPClient();

  try {
    await canva.connect();

    const tools = await canva.listTools();

    const tool = tools.tools.find(
      t => t.name === 'get-generate-image-job'
    );

    if (!tool) {
      console.log('Tool not found: get-generate-image-job');
      return;
    }

    console.log('\nGENERATE IMAGE JOB TOOL:');
    console.log(JSON.stringify(tool, null, 2));

  } catch (error) {
    console.error('ERROR:', error.message);
  } finally {
    await canva.disconnect();
  }
}

main();
