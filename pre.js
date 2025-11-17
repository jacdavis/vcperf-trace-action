const { execSync } = require('child_process');
const core = require('@actions/core');
const fs = require('fs');
const path = require('path');

async function run() {
  try {
    const traceName = core.getInput('trace-name');
    
    // Find vcperf.exe
    const vsPath = 'C:\\Program Files\\Microsoft Visual Studio\\2022\\Enterprise\\VC\\Tools\\MSVC';
    let vcperfPath = null;
    
    if (fs.existsSync(vsPath)) {
      const findVcperf = (dir) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            const result = findVcperf(fullPath);
            if (result) return result;
          } else if (entry.name === 'vcperf.exe') {
            return fullPath;
          }
        }
        return null;
      };
      
      vcperfPath = findVcperf(vsPath);
    }
    
    if (vcperfPath) {
      core.info(`Found vcperf at: ${vcperfPath}`);
      core.saveState('vcperf-path', vcperfPath);
      
      execSync(`"${vcperfPath}" /start ${traceName}`, { stdio: 'inherit' });
      core.info(`Successfully started vcperf trace: ${traceName}`);
    } else {
      core.warning('vcperf not found, skipping trace');
    }
  } catch (error) {
    core.warning(`Failed to start vcperf: ${error.message}`);
  }
}

run();
