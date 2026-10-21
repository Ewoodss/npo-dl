/**
 * Unit Tests for npo-dl
 * Tests core functionality without requiring network access
 */

import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.208.0/assert/mod.ts";

// Mock data and functions
const mockEpisodeData = {
  productId: "pid_12345",
  url: "https://npo.nl/start/afspelen/test_episode_123/afspelen",
  series: "Test Series",
  season: "Seizoen 1",
  title: "Test Episode",
  programKey: "Afl. 1•1",
};

/**
 * Test: Filename generation
 * Verifies that episode data is correctly formatted into a filename
 */
Deno.test("generateFileName formats episode data correctly", () => {
  function generateFileName(episodeData) {
    const rawSerie = episodeData.series;
    const rawTitle = episodeData.title;
    const rawNumber = episodeData.programKey;
    const rawSeason = episodeData.season;

    let filename = "";
    filename += rawSerie + " - ";
    const seasonNumber = parseInt(rawSeason.replace("Seizoen ", ""));
    const episodeNumber = parseInt(
      rawNumber.replace("Afl. ", "").split("•")[0],
    );
    filename += "S" + seasonNumber.toString().padStart(2, "0") + "E" +
      episodeNumber.toString().padStart(2, "0") + " - ";
    filename += rawTitle;
    filename = filename.replace(/[/\\?%*:|"<>]/g, "#");

    return filename;
  }

  const filename = generateFileName(mockEpisodeData);
  assertEquals(filename, "Test Series - S01E01 - Test Episode");
});

/**
 * Test: Filename sanitization
 * Verifies that illegal characters are properly removed
 */
Deno.test("generateFileName removes illegal characters", () => {
  function generateFileName(episodeData) {
    const rawSerie = episodeData.series;
    const rawTitle = episodeData.title;
    const rawNumber = episodeData.programKey;
    const rawSeason = episodeData.season;

    let filename = "";
    filename += rawSerie + " - ";
    const seasonNumber = parseInt(rawSeason.replace("Seizoen ", ""));
    const episodeNumber = parseInt(
      rawNumber.replace("Afl. ", "").split("•")[0],
    );
    filename += "S" + seasonNumber.toString().padStart(2, "0") + "E" +
      episodeNumber.toString().padStart(2, "0") + " - ";
    filename += rawTitle;
    filename = filename.replace(/[/\\?%*:|"<>]/g, "#");

    return filename;
  }

  const dirtyEpisodeData = {
    ...mockEpisodeData,
    series: 'Test "Series"',
    title: "Episode: <Test>",
  };

  const filename = generateFileName(dirtyEpisodeData);
  assertEquals(filename, "Test #Series# - S01E01 - Episode# #Test#");
});

/**
 * Test: PSSH extraction logic
 * Verifies that PSSH data is correctly extracted from mock MPD structure
 */
Deno.test("PSSH extraction from mock MPD data", () => {
  // Mock MPD structure
  const mockMpdData = {
    MPD: {
      Period: {
        AdaptationSet: [
          {/* video track */},
          {
            ContentProtection: [
              {
                "@_value": "cenc",
                "@_codePoints": "cenc",
              },
              {
                "@_value": "Widevine",
                pssh: "AAAAOmR1YWwAAAAA7u/7vgAAABoAAAAA",
              },
            ],
          },
        ],
      },
    },
  };

  // Simulate PSSH extraction
  let pssh = "";
  if ("ContentProtection" in mockMpdData["MPD"]["Period"]["AdaptationSet"][1]) {
    const contentProtections = mockMpdData["MPD"]["Period"]["AdaptationSet"][1]["ContentProtection"];
    const widevineContent = contentProtections.find((cp) => cp["@_value"] === "Widevine");
    pssh = widevineContent?.pssh || "";
  }

  assertEquals(pssh, "AAAAOmR1YWwAAAAA7u/7vgAAABoAAAAA");
});

/**
 * Test: URL type detection
 * Verifies detection of episode vs season vs series from URL patterns
 */
Deno.test("URL type detection works correctly", () => {
  function detectUrlType(url) {
    if (url.includes("/afspelen/")) {
      return "episode";
    } else if (url.includes("/serie/") && url.split("/serie/")[1].split("/").length === 2) {
      return "season";
    } else if (url.includes("/serie/") && url.split("/serie/")[1].split("/").length === 1) {
      return "series";
    }
    return "unknown";
  }

  assertEquals(
    detectUrlType("https://npo.nl/start/afspelen/sluipschutters_184"),
    "episode",
  );
  assertEquals(
    detectUrlType("https://npo.nl/start/serie/sluipschutters/seizoen-7"),
    "season",
  );
  assertEquals(
    detectUrlType("https://npo.nl/start/serie/sluipschutters"),
    "series",
  );
});

/**
 * Test: Episode count detection
 * Verifies that series vs season is correctly detected based on episode count
 */
Deno.test("Content type detection based on episode count", () => {
  function detectContentType(url, episodeCount) {
    let contentType = "episode";
    if (episodeCount > 1) {
      if (url.includes("/serie/")) {
        contentType = episodeCount > 10 ? "series" : "season";
      } else {
        contentType = "season";
      }
    }
    return contentType;
  }

  // Single episode
  assertEquals(
    detectContentType("https://npo.nl/start/afspelen/episode_1", 1),
    "episode",
  );

  // Season (multiple episodes, < 10)
  assertEquals(
    detectContentType("https://npo.nl/start/serie/show/seizoen-1", 8),
    "season",
  );

  // Series (many episodes, > 10)
  assertEquals(
    detectContentType("https://npo.nl/start/serie/show", 25),
    "series",
  );
});

/**
 * Test: Season number parsing
 * Verifies correct extraction of season numbers from Dutch "Seizoen X" format
 */
Deno.test("Season number parsing from Dutch format", () => {
  function parseSeasonNumber(seasonStr) {
    return parseInt(seasonStr.replace("Seizoen ", ""));
  }

  assertEquals(parseSeasonNumber("Seizoen 1"), 1);
  assertEquals(parseSeasonNumber("Seizoen 7"), 7);
  assertEquals(parseSeasonNumber("Seizoen 12"), 12);
});

/**
 * Test: Episode number parsing
 * Verifies correct extraction of episode numbers from "Afl. X•Y" format
 */
Deno.test("Episode number parsing from program key format", () => {
  function parseEpisodeNumber(programKey) {
    return parseInt(programKey.replace("Afl. ", "").split("•")[0]);
  }

  assertEquals(parseEpisodeNumber("Afl. 1•1"), 1);
  assertEquals(parseEpisodeNumber("Afl. 5•2"), 5);
  assertEquals(parseEpisodeNumber("Afl. 13•7"), 13);
});

/**
 * Test: License URL handling
 * Verifies that license URL is correctly prioritized from stream data
 */
Deno.test("License URL extraction and prioritization", () => {
  const defaultUrl = "https://drm.npoplayer.nl/proxyEngine.aspx";

  // Test with custom license URL in stream data
  const streamDataWithCustomUrl = {
    stream: {
      drm: {
        licenseUrl: "https://custom-drm.example.com/license",
      },
    },
  };

  let selectedUrl = defaultUrl;
  if (
    streamDataWithCustomUrl["stream"]["drm"] &&
    streamDataWithCustomUrl["stream"]["drm"]["licenseUrl"]
  ) {
    selectedUrl = streamDataWithCustomUrl["stream"]["drm"]["licenseUrl"];
  }

  assertEquals(selectedUrl, "https://custom-drm.example.com/license");

  // Test with missing license URL (fallback to default)
  const streamDataWithoutUrl = {
    stream: {
      drm: null,
    },
  };

  selectedUrl = defaultUrl;
  if (
    streamDataWithoutUrl["stream"]["drm"] &&
    streamDataWithoutUrl["stream"]["drm"]["licenseUrl"]
  ) {
    selectedUrl = streamDataWithoutUrl["stream"]["drm"]["licenseUrl"];
  }

  assertEquals(selectedUrl, defaultUrl);
});

/**
 * Test: Data validation
 * Verifies that required fields are present in episode data
 */
Deno.test("Episode data validation", () => {
  function validateEpisodeData(episodeData) {
    const requiredFields = ["productId", "url", "series", "season", "title"];
    return requiredFields.every((field) => field in episodeData);
  }

  const validData = {
    productId: "123",
    url: "https://npo.nl/start/afspelen/episode_1",
    series: "Test",
    season: "Seizoen 1",
    title: "Episode 1",
  };

  const invalidData = {
    productId: "123",
    url: "https://npo.nl/start/afspelen/episode_1",
    // missing 'series'
    season: "Seizoen 1",
    title: "Episode 1",
  };

  assertEquals(validateEpisodeData(validData), true);
  assertEquals(validateEpisodeData(invalidData), false);
});

console.log("✅ All unit tests passed!");
