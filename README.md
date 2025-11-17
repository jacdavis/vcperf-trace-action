# VCPerf Trace Action

A GitHub Action that automatically traces C++ builds using Microsoft's vcperf tool, converts the trace to JSON format, and uploads it as an artifact.

## Features

- Automatically starts vcperf tracing before your build
- Stops tracing after the build completes (even on failure)
- Converts ETL trace files to JSON using BuildInsights
- Uploads the JSON trace as a GitHub Actions artifact

## Usage

```yaml
steps:
  - uses: actions/checkout@v4
  
  - name: Setup MSBuild
    uses: microsoft/setup-msbuild@v2
  
  - name: Trace build with vcperf
    uses: YOUR_USERNAME/vcperf-trace-action@v1
    with:
      trace-name: 'BuildTrace'
      artifact-name: 'build-trace-analysis'
  
  - name: Build
    run: msbuild /m /p:Configuration=Release YourSolution.sln
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `trace-name` | Name for the trace session and output files | No | `BuildTrace` |
| `artifact-name` | Name for the uploaded artifact | No | `build-trace-analysis` |

## Requirements

- Windows runner (windows-latest or windows-2022)
- Visual Studio 2022 (Enterprise edition for vcperf)
- BuildInsights.EtlToJson.exe tool in `.github/tools/` directory of your repository

## How It Works

This action uses the pre/post lifecycle hooks to:
1. **Pre**: Start vcperf trace before your build steps
2. **Main**: (No-op, your build happens between pre and post)
3. **Post**: Stop vcperf, convert ETL to JSON, and upload artifact

The post step always runs, even if the build fails, ensuring you get trace data for failed builds.

## License

MIT
