#!/usr/bin/env node
/**
 * Test different request variants for the new Widevine proxy endpoint
 * This helps identify what format/headers the new endpoint expects
 *
 * Usage:
 *   deno run -A test-endpoint-variants.js
 */

import axios from "axios";

const NewWidevineProxyUrl = "https://drm.npoplayer.nl/proxyEngine.aspx";

// Mock license challenge (would be real in actual use)
// This is just for testing the endpoint behavior
const mockChallenge = Buffer.from("test_challenge_data");

// Test different request variants
const variants = [
  {
    name: "Standard (JSON headers, binary data)",
    config: {
      method: "post",
      url: NewWidevineProxyUrl,
      headers: {
        "Content-Type": "application/octet-stream",
        "X-API-Key": "test",
      },
      data: mockChallenge,
      responseType: "arraybuffer",
      validateStatus: false,
    }
  },
  {
    name: "Form Data",
    config: {
      method: "post",
      url: NewWidevineProxyUrl,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-API-Key": "test",
      },
      data: "challenge=" + mockChallenge.toString("base64"),
      validateStatus: false,
    }
  },
  {
    name: "ASP.NET POST (multipart/form-data)",
    config: {
      method: "post",
      url: NewWidevineProxyUrl,
      headers: {
        "X-API-Key": "test",
      },
      data: mockChallenge,
      validateStatus: false,
    }
  },
  {
    name: "With User-Agent",
    config: {
      method: "post",
      url: NewWidevineProxyUrl,
      headers: {
        "Content-Type": "application/octet-stream",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "X-API-Key": "test",
      },
      data: mockChallenge,
      responseType: "arraybuffer",
      validateStatus: false,
    }
  },
  {
    name: "With Referer",
    config: {
      method: "post",
      url: NewWidevineProxyUrl,
      headers: {
        "Content-Type": "application/octet-stream",
        "Referer": "https://npo.nl/start/",
        "X-API-Key": "test",
      },
      data: mockChallenge,
      responseType: "arraybuffer",
      validateStatus: false,
    }
  },
];

async function testVariant(variant) {
  console.log(`\n🔍 Testing: ${variant.name}`);
  console.log(`   URL: ${variant.config.url}`);
  console.log(`   Headers: ${JSON.stringify(variant.config.headers)}`);

  try {
    const response = await axios(variant.config);

    console.log(`   ✓ Status: ${response.status}`);
    console.log(`   ✓ Content-Type: ${response.headers["content-type"] || "not specified"}`);
    console.log(`   ✓ Content-Length: ${response.data ? response.data.length : 0} bytes`);

    if (response.status === 200) {
      console.log(`   ✓ Response looks promising!`);
      const preview = response.data.toString().substring(0, 100);
      console.log(`   Response preview: ${preview}`);
    } else if (response.status >= 400) {
      console.log(`   ✗ Error response (${response.status})`);
      const errorPreview = response.data ? response.data.toString().substring(0, 200) : "";
      if (errorPreview) console.log(`   Error: ${errorPreview}`);
    }

    return response;
  } catch (error) {
    console.log(`   ✗ Connection error: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log("Widevine Proxy Endpoint Variant Tester");
  console.log("=====================================");
  console.log(`\nTesting endpoint: ${NewWidevineProxyUrl}`);
  console.log(`⚠️  NOTE: Using mock data - results are just to identify endpoint type`);
  console.log(`\nThis will test different request formats to see how the endpoint responds.\n`);

  for (const variant of variants) {
    await testVariant(variant);
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`Analysis Complete`);
  console.log(`${"=".repeat(50)}`);
  console.log(`
The above tests will help identify:
1. What content type the endpoint expects
2. What headers are required or accepted
3. Basic endpoint behavior

If you see a 200 status code on any variant, note which one works best.

Next steps:
1. Run: deno run -A test-widevine-endpoint.js https://npo.nl/start/afspelen/...
2. Check the verbose output for detailed error messages
3. If a specific variant shows promise, update getwvkeys.js post_request() accordingly
  `);
}

main().catch(console.error);
