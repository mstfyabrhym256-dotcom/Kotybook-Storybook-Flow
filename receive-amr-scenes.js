
'use strict';

const CanvaMCPClient = require('./canva-mcp-client');
const fs = require('fs');
const path = require('path');

const SCENES = [
  'amr-scene-01-dream',
  'amr-scene-02-examination',
  'amr-scene-03-emergency'
];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function readJobId(sceneName) {
  const file = path.join(__dirname, `${sceneName}-result.json`);
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));

  let data = saved.structuredContent;

  if (!data && saved.content) {
    const item = saved.content.find(x => x.type === 'text');
    if (item) data = JSON.parse(item.text);
  }

  if (!data || !data.jobId) {
    throw new Error(`Job ID not found: ${sceneName}`);
  }

  return data.jobId;
}

function readJobData(response) {
  if (response.structuredContent) {
    return response.structuredContent;
  }

  const item = response.content?.find(x => x.type === 'text');

  if (item) {
    return JSON.parse(item.text);
  }

  return null;
}

async function main() {
  const canva = new CanvaMCPClient();
  const allResults = [];

  try {
    console.log('Connecting to Canva MCP...');
    await canva.connect();

    for (const sceneName of SCENES) {
      console.log(`\n================================`);
      console.log(`Checking: ${sceneName}`);
      console.log(`================================`);

      const jobId = readJobId(sceneName);
      let completed = false;

      for (let attempt = 1; attempt <= 18; attempt++) {
        console.log(`Checking job (${attempt}/18)...`);

        const response = await canva.callTool(
          'get-generate-image-job',
          {
            jobId,
            user_intent: 'Retrieve the result of an existing personalized storybook image generation job.'
          },
          600000
        );

        if (response.isError) {
          throw new Error(`Canva error while checking ${sceneName}`);
        }

        const data = readJobData(response);

        if (!data || !data.status) {
          throw new Error(`Could not read status for ${sceneName}`);
        }

        console.log('Status:', data.status);

        if (data.status === 'SUCCESS') {
          const outputFile = path.join(
            __dirname,
            `${sceneName}-generated.json`
          );

          fs.writeFileSync(
            outputFile,
            JSON.stringify(response, null, 2),
            'utf8'
          );

          console.log(`SUCCESS! Saved: ${sceneName}-generated.json`);

          allResults.push({
            scene: sceneName,
            status: 'SUCCESS',
            result: response
          });

          completed = true;
          break;
        }

        if (data.status === 'FAILURE') {
          console.log('FAILED:', data.failureType);
          console.log(data.failureMessage || 'No additional details.');

          allResults.push({
            scene: sceneName,
            status: 'FAILURE',
            failureType: data.failureType,
            failureMessage: data.failureMessage
          });

          completed = true;
          break;
        }

        console.log('Still pending. Waiting 10 seconds...');

        if (attempt < 18) {
          await sleep(10000);
        }
      }

      if (!completed) {
        console.log(`Timeout waiting for ${sceneName}.`);

        allResults.push({
          scene: sceneName,
          status: 'PENDING'
        });
      }
    }

    fs.writeFileSync(
      path.join(__dirname, 'amr-all-scenes-results.json'),
      JSON.stringify(allResults, null, 2),
      'utf8'
    );

    console.log('\n================================');
    console.log('ALL SCENES CHECKED');
    console.log('Results saved in amr-all-scenes-results.json');
    console.log('================================');

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
