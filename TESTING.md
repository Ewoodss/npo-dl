# Testing Guide for npo-dl

This document describes how to run tests and set up CI/CD for this project.

## Test Types

### 1. Unit Tests (Default)
Unit tests verify core functionality using mocked data. **No network access required.**

```bash
deno test tests/unit.test.js
```

**What's tested:**
- Filename generation and sanitization
- PSSH extraction from MPD structures
- URL type detection
- Episode/season number parsing
- License URL handling
- Data validation

**Run in CI:** Automatically on every push to `main`

---

### 2. Integration Tests (Optional)
Integration tests verify real connectivity to NPO API endpoints. **Network access required.**

```bash
ENABLE_NETWORK_TESTS=true deno test --allow-net tests/integration.test.js
```

**What's tested:**
- NPO auth session endpoint
- Episode page data retrieval
- Stream API accessibility
- Series API endpoints
- Widevine proxy endpoint availability

**Note:** These tests do NOT retrieve actual Widevine keys.

**Run in CI:** Manual trigger or weekly schedule

---

## Setting Up GETWVKEYS_API_KEY

### For Local Development

1. **Get your API key:**
   - Visit https://getwvkeys.cc/me
   - Sign up or log in
   - Copy your API key

2. **Set environment variable:**
   ```bash
   export GETWVKEYS_API_KEY="your-api-key-here"
   ```

3. **Run the CLI:**
   ```bash
   deno -A cli.js download https://npo.nl/start/afspelen/sluipschutters_184
   ```

**⚠️ Important:** Never commit your API key to the repository!

### For GitHub Actions (CI/CD)

#### Step 1: Add Secret to Repository

1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Create secret with:
   - **Name:** `GETWVKEYS_API_KEY`
   - **Value:** Your API key from https://getwvkeys.cc/me

#### Step 2: Use Secret in Workflow

The `.github/workflows/test-integration.yml` already uses the secret:

```yaml
env:
  GETWVKEYS_API_KEY: ${{ secrets.GETWVKEYS_API_KEY }}
```

#### Step 3: Trigger Integration Tests

**Option A: Manual Trigger**
1. Go to **Actions** tab in GitHub
2. Select **Integration Tests** workflow
3. Click **Run workflow** button

**Option B: Automatic Schedule**
Tests run automatically every Sunday at midnight UTC (as configured in `test-integration.yml`)

**Option C: On Release (Optional)**
To run tests on every release, add this to `.github/workflows/test-integration.yml`:
```yaml
on:
  workflow_dispatch:
  schedule:
    - cron: '0 0 * * 0'
  release:
    types: [published]
```

---

## GitHub Actions Workflows

### 1. Unit Tests (`test.yml`)
- **Trigger:** Every push to `main`
- **What it does:**
  - Runs unit tests
  - Checks code formatting (`deno fmt`)
  - Runs linter (`deno lint`)
- **Duration:** ~30 seconds
- **API Key Required:** ❌ No

### 2. Build (`build.yml`)
- **Trigger:** Every push to `main`
- **What it does:**
  - Compiles CLI for Windows, macOS, Linux
  - Creates release artifacts
- **Duration:** ~2-3 minutes
- **API Key Required:** ❌ No

### 3. Integration Tests (`test-integration.yml`)
- **Trigger:** Manual or weekly schedule
- **What it does:**
  - Tests real NPO API connectivity
  - Verifies endpoints are accessible
- **Duration:** ~1-2 minutes
- **API Key Required:** ✅ Yes (for Widevine key testing if added later)

---

## Environment Variables

### GETWVKEYS_API_KEY
- **Required for:** Widevine key retrieval
- **Source:** https://getwvkeys.cc/me
- **In GitHub:** Settings → Secrets and variables → Actions
- **Usage:** Passed to workflow via `${{ secrets.GETWVKEYS_API_KEY }}`
- **Security:** Never logged or exposed in workflow output

### ENABLE_NETWORK_TESTS
- **Required for:** Integration tests
- **Default:** `false` (tests skipped if not set)
- **Set in workflow:** `env: ENABLE_NETWORK_TESTS: 'true'`
- **Local usage:** `ENABLE_NETWORK_TESTS=true deno test tests/integration.test.js`

---

## Security Best Practices

### ✅ DO:
- Store API keys in GitHub Secrets, not in code
- Use `${{ secrets.SECRET_NAME }}` in workflows
- Keep API key private and rotate it if compromised
- Never commit `.env` files or credentials

### ❌ DON'T:
- Hardcode API keys in workflows or code
- Share API keys in pull requests or issues
- Log environment variables to console
- Commit `package-lock.json` with sensitive data

---

## Troubleshooting

### Integration Tests Fail with "Network Error"
This is expected in environments without internet access (like some CI systems). Tests gracefully skip with a warning.

### Workflow Shows "API Key Not Found"
1. Check that `GETWVKEYS_API_KEY` secret is added to repository
2. Verify secret name exactly matches what's in the workflow
3. Go to Settings → Secrets and verify it's there

### Tests Pass Locally but Fail in CI
Common causes:
- API key not set in GitHub Secrets
- Network restrictions in CI environment
- Different Node.js/Deno versions

Check workflow logs at **Actions** → [Workflow Name] → **Run Details**

---

## Adding More Tests

To add new tests:

1. **Unit tests:** Add to `tests/unit.test.js`
   ```typescript
   Deno.test("Your test name", () => {
     // Test code here
   });
   ```

2. **Integration tests:** Add to `tests/integration.test.js`
   ```typescript
   Deno.test({
     name: "Your integration test",
     fn: async () => { /* ... */ },
     ignore: !globalThis.ENABLE_NETWORK_TESTS,
   });
   ```

3. Run locally:
   ```bash
   deno test tests/*.test.js
   ```

---

## CI/CD Pipeline Overview

```
Push to main
    ↓
Unit Tests (test.yml)
├─ Run unit tests ✓
├─ Format check ✓
└─ Lint ✓
    ↓
Build (build.yml)
├─ Compile for Windows ✓
├─ Compile for macOS ✓
├─ Compile for Linux ✓
└─ Upload artifacts ✓
    ↓
Integration Tests (manual/weekly)
├─ Test NPO API ✓
├─ Test Widevine endpoint ✓
└─ Test stream API ✓
```

---

## Questions?

For more information:
- NPO-DL Issues: https://github.com/Ewoodss/npo-dl/issues
- GETWVKEYS: https://getwvkeys.cc/
- Deno Testing: https://docs.deno.com/runtime/manual/basics/testing
