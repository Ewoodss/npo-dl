#!/usr/bin/env node
/**
 * Test script to debug the new Widevine proxy endpoint
 *
 * Usage:
 *   deno run -A test-widevine-endpoint.js <npo-url>
 *
 * Example:
 *   deno run -A test-widevine-endpoint.js https://npo.nl/start/afspelen/sluipschutters_184
 */

import axios from "axios";
import { XMLParser } from "fast-xml-parser";
import getWvKeys from "./getwvkeys.js";

const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
});

const OldWidevineProxyUrl = "https://npo-drm-gateway.samgcloud.nepworldwide.nl/authentication";
const NewWidevineProxyUrl = "https://drm.npoplayer.nl/proxyEngine.aspx";

async function getEmbededJsonData(url) {
  console.log(`\n📥 Fetching URL: ${url}`);
  const response = await axios.get(url);

  const type_str = 'type="application/json"';
  const json_start = response.data.indexOf(type_str);
  const json_end = response.data.lastIndexOf("</script>");
  const json_str = response.data.substring(
    json_start + type_str.length + 1,
    json_end,
  );

  return JSON.parse(json_str);
}

async function getCookie(config) {
  const result = await axios.request(
    "https://npo.nl/start/api/auth/session",
    config,
  );

  const responseCookies = [];
  result.headers["set-cookie"].forEach((cookie) => {
    responseCookies.push(cookie.substring(0, cookie.indexOf(";")));
  });

  return responseCookies[0] + ";" + responseCookies[1];
}

async function getJwtToken(productId, config) {
  const playerToken = await axios.request(
    `https://npo.nl/start/api/domain/player-token?productId=${productId}`,
    config,
  );
  return playerToken.data.jwt;
}

async function getStreamData(url, config) {
  console.log(`\n🎬 Getting stream data...`);
  const streamData = await axios.post(
    "https://prod.npoplayer.nl/stream-link",
    {
      "profileName": "dash",
      "drmType": "widevine",
      "referrerUrl": url,
    },
    config,
  ).catch((error) => {
    console.log("⚠️  Stream request failed (likely premium episode)");
    console.log("Error:", error.message);
  });

  return streamData ? streamData.data : null;
}

async function getMpdData(mpdUrl, config) {
  console.log(`\n📋 Fetching MPD data...`);
  const mpdData = await axios.request(mpdUrl, config);
  return parser.parse(mpdData.data);
}

async function testEndpoint(pssh, x_custom_data, proxyUrl, endpointName) {
  console.log(`\n🔧 Testing ${endpointName}: ${proxyUrl}`);
  console.log(`   PSSH (first 50 chars): ${pssh.substring(0, 50)}...`);
  console.log(`   DRM Token present: ${x_custom_data.length > 0 ? "✓" : "✗"}`);

  const authKey = process.env.GETWVKEYS_API_KEY;
  if (!authKey) {
    console.error("❌ GETWVKEYS_API_KEY environment variable not set");
    return false;
  }

  try {
    const wvKeys = new getWvKeys(
      pssh,
      proxyUrl,
      authKey,
      x_custom_data,
      "https://getwvkeys.cc/pywidevine",
      "",
      false,
      true // verbose logging
    );

    console.log(`\n⏳ Attempting to get Widevine keys...`);
    const result = await wvKeys.getWvKeys();

    if (result) {
      console.log(`\n✅ SUCCESS with ${endpointName}`);
      console.log(`   Key (first 50 chars): ${result.toString().substring(0, 50)}...`);
      return true;
    } else {
      console.log(`\n❌ FAILED with ${endpointName} - No result returned`);
      return false;
    }
  } catch (error) {
    console.log(`\n❌ ERROR with ${endpointName}:`);
    console.log(`   ${error.message}`);
    return false;
  }
}

async function main() {
  const args = Deno.args;

  if (args.length === 0) {
    console.log("NPO Widevine Proxy Endpoint Tester");
    console.log("===================================\n");
    console.log("Usage: deno run -A test-widevine-endpoint.js <npo-url>");
    console.log("Example: deno run -A test-widevine-endpoint.js https://npo.nl/start/afspelen/sluipschutters_184");
    console.log("\nRequired environment variable:");
    console.log("  GETWVKEYS_API_KEY  - Your API key from https://getwvkeys.cc/me");
    process.exit(1);
  }

  const npoUrl = args[0];
  const config = {
    headers: {
      "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:136.0) Gecko/20100101 Firefox/136.0",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Accept-Encoding": "gzip, deflate, br",
      "Connection": "keep-alive",
    },
  };

  try {
    // Get episode data
    const embeddedJsonData = await getEmbededJsonData(npoUrl);
    const dehydratedState = embeddedJsonData.props.pageProps.dehydratedState;
    const episodeData = dehydratedState.queries[0].state.data;

    console.log(`\n📺 Episode: ${episodeData.title}`);
    console.log(`   Series: ${episodeData.series.title}`);
    console.log(`   Season: ${episodeData.season.seasonKey}`);

    // Get stream data
    config.headers["Cookie"] = await getCookie(config);
    config.headers["Authorization"] = await getJwtToken(episodeData.productId, config);
    const streamData = await getStreamData(npoUrl, config);

    if (!streamData) {
      console.log("❌ No stream data available");
      process.exit(1);
    }

    const mpdUrl = streamData["stream"]["streamURL"];
    const mpdData = await getMpdData(mpdUrl, config);

    // Extract PSSH and DRM token
    let pssh = "";
    if ("ContentProtection" in mpdData["MPD"]["Period"]["AdaptationSet"][1]) {
      pssh = mpdData["MPD"]["Period"]["AdaptationSet"][1]["ContentProtection"][3].pssh || "";
    }
    const x_custom_data = streamData["stream"]["drmToken"] || "";

    if (!pssh || !x_custom_data) {
      console.log("❌ Missing PSSH or DRM Token");
      console.log(`   PSSH: ${pssh ? "✓" : "✗"}`);
      console.log(`   DRM Token: ${x_custom_data ? "✓" : "✗"}`);
      process.exit(1);
    }

    console.log(`\n🔐 DRM Information:`);
    console.log(`   PSSH: ✓`);
    console.log(`   DRM Token: ✓`);

    // Test both endpoints
    console.log(`\n${"=".repeat(50)}`);
    console.log(`Testing Widevine Proxy Endpoints`);
    console.log(`${"=".repeat(50)}`);

    const oldSuccess = await testEndpoint(pssh, x_custom_data, OldWidevineProxyUrl, "Old Endpoint");
    const newSuccess = await testEndpoint(pssh, x_custom_data, NewWidevineProxyUrl, "New Endpoint");

    // Summary
    console.log(`\n${"=".repeat(50)}`);
    console.log(`Summary:`);
    console.log(`${"=".repeat(50)}`);
    console.log(`Old Endpoint (${OldWidevineProxyUrl}): ${oldSuccess ? "✅ WORKS" : "❌ FAILS"}`);
    console.log(`New Endpoint (${NewWidevineProxyUrl}): ${newSuccess ? "✅ WORKS" : "❌ FAILS"}`);

    if (newSuccess) {
      console.log(`\n✅ Good news! The new endpoint is working correctly.`);
    } else if (oldSuccess) {
      console.log(`\n⚠️  The old endpoint still works, but the new one doesn't.`);
      console.log(`   This means we need to debug the new endpoint further.`);
    } else {
      console.log(`\n❌ Neither endpoint works. This could indicate:`);
      console.log(`   1. GETWVKEYS_API_KEY is invalid`);
      console.log(`   2. The PSSH or DRM token is invalid`);
      console.log(`   3. Both endpoints have issues`);
    }

  } catch (error) {
    console.error("Fatal error:", error.message);
    process.exit(1);
  }
}

main().catch(console.error);
