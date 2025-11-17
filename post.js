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
          const artifactClient = new artifact.DefaultArtifactClient();
          
          const uploadResult = await artifactClient.uploadArtifact(artifactName, [jsonFile], process.cwd());
          core.info(`Uploaded artifact: ${artifactName}`);
          
          // Create issue if requested
          const createIssue = core.getInput('create-issue') === 'true';
          if (createIssue) {
            await createAnalysisIssue(artifactName);
          }
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

async function createAnalysisIssue(artifactName) {
  try {
    const github = require('@actions/github');
    const token = process.env.GITHUB_TOKEN;
    
    if (!token) {
      core.warning('GITHUB_TOKEN not available, skipping issue creation');
      return;
    }
    
    const octokit = github.getOctokit(token);
    const context = github.context;
    
    const runUrl = `https://github.com/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`;
    const artifactUrl = `https://github.com/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}#artifacts`;
    
    const issueBody = `## Build Performance Analysis Request

A new build has completed with vcperf tracing enabled.

**Build Details:**
- Run: ${runUrl}
- Artifacts: ${artifactUrl}
- Artifact Name: ${artifactName}
- Commit: ${context.sha}
- Branch: ${context.ref}

@copilot Please analyze the build trace artifact from this run and identify opportunities to improve build performance. After analyzing, please:

1. Download and analyze the ${artifactName} artifact
2. Identify build bottlenecks and optimization opportunities
3. Trigger a new build with your recommended optimizations
4. Compare the new build trace to identify improvements
5. Report back on this issue with your findings

The build trace JSON artifact contains detailed timing information about compilation units, headers, and build bottlenecks.`;

    const issue = await octokit.rest.issues.create({
      owner: context.repo.owner,
      repo: context.repo.repo,
      title: `Build Performance Analysis - Run ${context.runNumber}`,
      body: issueBody,
      assignees: ['copilot']
    });

    core.info(`Created issue #${issue.data.number}: ${issue.data.html_url}`);
  } catch (error) {
    core.warning(`Failed to create issue: ${error.message}`);
  }
}

run();
