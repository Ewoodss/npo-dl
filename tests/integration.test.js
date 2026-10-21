/**
 * Integration Tests for npo-dl
 * Tests real API calls to NPO infrastructure
 * Optional: Requires network access and can be skipped in CI
 */

import { assert, assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";

const TIMEOUT = 30000; // 30 seconds per test
const ENABLE_NETWORK_TESTS = Deno.env.get("ENABLE_NETWORK_TESTS") === "true";

/**
 * Test: Fetch session cookie from NPO auth endpoint
 * Verifies that the auth session endpoint is reachable and returns valid cookies
 */
Deno.test({
  name: "Integration: NPO auth session endpoint responds",
  fn: async () => {
    try {
      const config = {
        headers: {
          "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:136.0) Gecko/20100101 Firefox/136.0",
        },
      };

      const response = await fetch(
        "https://npo.nl/start/api/auth/session",
        config,
      );

      assert(response.ok, `Auth session endpoint returned ${response.status}`);
      assert(
        response.headers.has("set-cookie"),
        "Response should have set-cookie header",
      );

      // Consume response body to prevent leak
      await response.body?.cancel();
    } catch (error) {
      if (error.message.includes("Network")) {
        console.warn("⚠️  Network test skipped: No internet access");
      } else {
        throw error;
      }
    }
  },
  ignore: !ENABLE_NETWORK_TESTS,
  timeout: TIMEOUT,
});

/**
 * Test: Fetch embedded JSON from episode page
 * Verifies that episode pages contain valid JSON data structures
 */
Deno.test({
  name: "Integration: Episode page contains valid JSON data",
  fn: async () => {
    try {
      const url = "https://npo.nl/start/afspelen/sluipschutters_184";
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:136.0) Gecko/20100101 Firefox/136.0",
        },
      });

      assert(response.ok, `Episode page returned ${response.status}`);

      const html = await response.text();
      const type_str = 'type="application/json"';
      const json_start = html.indexOf(type_str);

      assert(
        json_start !== -1,
        "Episode page should contain embedded JSON data",
      );

      const json_end = html.lastIndexOf("</script>");
      const json_str = html.substring(
        json_start + type_str.length + 1,
        json_end,
      );
      const jsonData = JSON.parse(json_str);

      assertExists(jsonData.props, "JSON should have props field");
      assertExists(
        jsonData.props.pageProps,
        "props should have pageProps field",
      );
    } catch (error) {
      if (
        error.message.includes("Network") ||
        error.message.includes("refused")
      ) {
        console.warn("⚠️  Network test skipped: No internet access");
      } else {
        throw error;
      }
    }
  },
  ignore: !ENABLE_NETWORK_TESTS,
  timeout: TIMEOUT,
});

/**
 * Test: Fetch stream data from NPO player API
 * Verifies that the stream endpoint returns DRM configuration
 */
Deno.test({
  name: "Integration: NPO player stream endpoint accessible",
  fn: async () => {
    try {
      // First get auth session
      const sessionResponse = await fetch(
        "https://npo.nl/start/api/auth/session",
        {
          headers: {
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:136.0) Gecko/20100101 Firefox/136.0",
          },
        },
      );

      assert(sessionResponse.ok, "Session endpoint should be reachable");

      const cookies = sessionResponse.headers
        .get("set-cookie")
        ?.split(",")
        .map((c) => c.split(";")[0])
        .join("; ");

      // Consume session response body to prevent leak
      await sessionResponse.body?.cancel();

      // Try to access stream endpoint (may fail for this episode but endpoint should exist)
      const streamResponse = await fetch(
        "https://prod.npoplayer.nl/stream-link",
        {
          method: "POST",
          headers: {
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:136.0) Gecko/20100101 Firefox/136.0",
            "Content-Type": "application/json",
            ...(cookies && { "Cookie": cookies }),
          },
          body: JSON.stringify({
            profileName: "dash",
            drmType: "widevine",
            referrerUrl: "https://npo.nl/start/afspelen/test",
          }),
        },
      );

      // Stream endpoint should exist (may return 401 or 403 but not 404)
      assert(
        streamResponse.status !== 404,
        `Stream endpoint should exist (got ${streamResponse.status})`,
      );

      // Consume response body to prevent leak
      await streamResponse.body?.cancel();
    } catch (error) {
      if (
        error.message.includes("Network") ||
        error.message.includes("refused")
      ) {
        console.warn("⚠️  Network test skipped: No internet access");
      } else {
        throw error;
      }
    }
  },
  ignore: !ENABLE_NETWORK_TESTS,
  timeout: TIMEOUT,
});

/**
 * Test: Fetch series seasons from NPO API
 * Verifies that series API endpoint returns valid season data
 */
Deno.test({
  name: "Integration: NPO series API returns seasons",
  fn: async () => {
    try {
      const seriesSlug = "sluipschutters";
      const response = await fetch(
        `https://npo.nl/start/api/domain/series-seasons?slug=${seriesSlug}`,
        {
          headers: {
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:136.0) Gecko/20100101 Firefox/136.0",
          },
        },
      );

      assert(response.ok, `Series API returned ${response.status}`);

      const seasonData = await response.json();
      assert(Array.isArray(seasonData), "Series API should return an array");
      assert(
        seasonData.length > 0,
        "Series should have at least one season",
      );

      const season = seasonData[0];
      assertExists(season.slug, "Season should have a slug");
      // Season data may have different fields, so just verify slug is present
      console.log(`✓ Series API returned ${seasonData.length} seasons`);
    } catch (error) {
      if (
        error.message.includes("Network") ||
        error.message.includes("refused")
      ) {
        console.warn("⚠️  Network test skipped: No internet access");
      } else {
        throw error;
      }
    }
  },
  ignore: !ENABLE_NETWORK_TESTS,
  timeout: TIMEOUT,
});

/**
 * Test: Verify Widevine endpoint accessibility
 * Confirms that the new Widevine proxy endpoint is reachable
 */
Deno.test({
  name: "Integration: Widevine proxy endpoint is accessible",
  fn: async () => {
    try {
      const widevineUrl = "https://drm.npoplayer.nl/proxyEngine.aspx";
      const response = await fetch(widevineUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:136.0) Gecko/20100101 Firefox/136.0",
        },
        body: new Uint8Array(0), // Empty challenge
      });

      // Endpoint should exist (may return error but not 404)
      assert(
        response.status !== 404,
        `Widevine endpoint should exist (got ${response.status})`,
      );

      // Consume response body to prevent leak
      await response.body?.cancel();

      console.log(
        `✓ Widevine proxy endpoint is accessible (${response.status})`,
      );
    } catch (error) {
      if (
        error.message.includes("Network") ||
        error.message.includes("refused")
      ) {
        console.warn("⚠️  Network test skipped: No internet access");
      } else {
        throw error;
      }
    }
  },
  ignore: !ENABLE_NETWORK_TESTS,
  timeout: TIMEOUT,
});

console.log(`
Network Integration Tests
========================
These tests verify connectivity to real NPO API endpoints.
They do NOT retrieve actual Widevine keys.

Enable with: ENABLE_NETWORK_TESTS=true deno test tests/integration.test.js
Or in GitHub Actions via ENABLE_NETWORK_TESTS environment variable.

⚠️  Note: Tests are skipped if ENABLE_NETWORK_TESTS is not set.
     This allows CI to run without network access.
`);
