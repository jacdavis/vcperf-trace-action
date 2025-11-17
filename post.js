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
    const token = core.getInput('github-token') || process.env.GITHUB_TOKEN;
    
    if (!token) {
      core.warning('GITHUB_TOKEN not available, skipping issue creation. Please pass github-token input.');
      return;
    }
    
    const octokit = github.getOctokit(token);
    const context = github.context;
    
    // Check if an open analysis issue already exists
    const existingIssues = await octokit.rest.issues.listForRepo({
      owner: context.repo.owner,
      repo: context.repo.repo,
      state: 'open',
      labels: 'build-performance',
      per_page: 1
    });
    
    const runUrl = `https://github.com/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`;
    const artifactUrl = `https://github.com/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}#artifacts`;
    
    if (existingIssues.data.length > 0) {
      // Comment on existing issue instead of creating new one
      const existingIssue = existingIssues.data[0];
      
      // Count existing comments to track iterations
      const comments = await octokit.rest.issues.listComments({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: existingIssue.number
      });
      
      const iterationCount = comments.data.filter(c => c.body.includes('New Build Trace Available')).length + 1;
      const maxIterations = 5;
      
      if (iterationCount > maxIterations) {
        const finalComment = `## Maximum Iterations Reached

Build trace available but not analyzing further (${iterationCount}/${maxIterations} iterations completed).

**Build Details:**
- Run: ${runUrl}
- Artifacts: ${artifactUrl}

Closing this issue as the optimization process has completed ${maxIterations} iterations.`;

        await octokit.rest.issues.createComment({
          owner: context.repo.owner,
          repo: context.repo.repo,
          issue_number: existingIssue.number,
          body: finalComment
        });
        
        await octokit.rest.issues.update({
          owner: context.repo.owner,
          repo: context.repo.repo,
          issue_number: existingIssue.number,
          state: 'closed'
        });
        
        core.info(`Closed issue #${existingIssue.number} after ${maxIterations} iterations`);
        return;
      }
      
      const commentBody = `## New Build Trace Available (Iteration ${iterationCount}/${maxIterations})

**Build Details:**
- Run: ${runUrl}
- Artifacts: ${artifactUrl}
- Artifact Name: ${artifactName}
- Commit: ${context.sha}
- Branch: ${context.ref}

@copilot Please analyze this latest build trace and compare it to previous results. Continue iterating on the same PR to improve build performance. This is iteration ${iterationCount} of ${maxIterations}.`;

      await octokit.rest.issues.createComment({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: existingIssue.number,
        body: commentBody
      });
      
      core.info(`Added comment to existing issue #${existingIssue.number}: ${existingIssue.html_url} (Iteration ${iterationCount}/${maxIterations})`);
    } else {
      // Create new issue with label
      const issueBody = `## Build Performance Analysis Request

A new build has completed with vcperf tracing enabled.

**Build Details:**
- Run: ${runUrl}
- Artifacts: ${artifactUrl}
- Artifact Name: ${artifactName}
- Commit: ${context.sha}
- Branch: ${context.ref}

@copilot Please analyze the build trace artifact from this run and identify opportunities to improve build performance. 

**Instructions:**
1. Download and analyze the ${artifactName} artifact from the link above
2. Identify the top build bottlenecks and optimization opportunities
3. Create a SINGLE pull request with your recommended code changes to improve build performance
4. After the PR is merged, I will mention you in this issue with the new build trace to continue iterating
5. Keep updating the SAME PR for all optimization iterations - do not create multiple PRs
6. Report your findings and progress in this issue
7. **LIMIT: You have a maximum of 5 iterations to optimize build performance**

The build trace JSON artifact contains detailed timing information about compilation units, headers, and build bottlenecks.`;

      const issue = await octokit.rest.issues.create({
        owner: context.repo.owner,
        repo: context.repo.repo,
        title: `Build Performance Optimization`,
        body: issueBody,
        assignees: ['copilot'],
        labels: ['build-performance']
      });

      core.info(`Created issue #${issue.data.number}: ${issue.data.html_url}`);
    }
  } catch (error) {
    core.warning(`Failed to create/update issue: ${error.message}`);
  }
}

run();
