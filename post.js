const { execSync } = require('child_process');
const core = require('@actions/core');
const fs = require('fs');
const path = require('path');

async function run() {
  try {
    const traceName = core.getInput('trace-name');
    const artifactName = core.getInput('artifact-name');
    const vcperfPath = core.getState('vcperf-path');
    
    if (!vcperfPath) {
      core.warning('vcperf was not started, skipping trace stop');
      return;
    }
    
    // Stop vcperf and generate ETL
    const etlFile = `${traceName}.etl`;
    core.info(`Stopping vcperf trace and generating ${etlFile}...`);
    execSync(`"${vcperfPath}" /stop ${traceName} ${etlFile}`, { stdio: 'inherit' });
    core.info(`Successfully stopped vcperf trace and created ${etlFile}`);
    
    // Convert ETL to JSON
    const jsonFile = `${traceName}.json`;
    const toolPath = path.join(process.env.GITHUB_WORKSPACE, '.github', 'tools', 'BuildInsights.EtlToJson.exe');
    
    if (fs.existsSync(etlFile)) {
      if (fs.existsSync(toolPath)) {
        core.info(`Converting ${etlFile} to JSON...`);
        execSync(`"${toolPath}" ${etlFile} ${jsonFile}`, { stdio: 'inherit' });
        
        if (fs.existsSync(jsonFile)) {
          const stats = fs.statSync(jsonFile);
          const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
          core.info(`Successfully created ${jsonFile} (${sizeMB} MB)`);
          
          // Upload artifact using artifact action
          const artifact = require('@actions/artifact');
          const artifactClient = artifact.create();
          const files = [jsonFile];
          const rootDirectory = process.cwd();
          
          await artifactClient.uploadArtifact(artifactName, files, rootDirectory, {
            continueOnError: false
          });
          core.info(`Uploaded artifact: ${artifactName}`);
        } else {
          core.warning('JSON file was not created');
        }
      } else {
        core.warning(`BuildInsights.EtlToJson.exe not found at ${toolPath}`);
      }
    } else {
      core.warning(`${etlFile} not found, skipping conversion`);
    }
  } catch (error) {
    core.warning(`Failed to stop vcperf or upload artifact: ${error.message}`);
  }
}

run();
