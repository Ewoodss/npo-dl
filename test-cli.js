#!/usr/bin/env deno
/**
 * Test script for CLI - Tests up to PSSH retrieval
 * Does NOT download files or get Widevine keys
 * Tests with real NPO API
 */

import { getEpisodesData, getInformation } from "./npo-dl.js";

const testUrl = "https://npo.nl/start/serie/sluipschutters/seizoen-7";

console.log("🧪 Testing NPO-DL CLI (Network Test)");
console.log("=====================================\n");
console.log(`URL: ${testUrl}`);
console.log("Mode: PSSH retrieval only (no download, no keys)\n");

try {
  console.log("📡 Fetching episodes data from NPO API...");
  const episodesData = await getEpisodesData(testUrl);
  
  console.log(`✓ Retrieved ${episodesData.length} episodes\n`);
  
  // Show first 3 episodes
  console.log("📺 Sample Episodes:");
  console.log("-------------------");
  for (let i = 0; i < Math.min(3, episodesData.length); i++) {
    const ep = episodesData[i];
    console.log(`${i + 1}. ${ep.series} - ${ep.season} - ${ep.title}`);
  }
  
  if (episodesData.length > 3) {
    console.log(`... and ${episodesData.length - 3} more episodes\n`);
  } else {
    console.log("");
  }
  
  console.log("🔍 Testing getInformation for first episode...");
  const firstEpisode = episodesData[0];
  const information = await getInformation(firstEpisode);
  
  console.log("✓ Got episode information\n");
  
  console.log("📊 Episode Data Structure:");
  console.log("---------------------------");
  console.log(`Filename: ${information.filename}`);
  console.log(`PSSH: ${information.pssh.substring(0, 50)}...`);
  console.log(`MPD URL: ${information.mpdUrl.substring(0, 80)}...`);
  console.log(`Keys: ${information.wideVineKeyResponse ? "Present (would be retrieved)" : "Not retrieved (skipped)"}`);
  console.log(`Custom Data: ${information.x_custom_data || "empty"}\n`);
  
  console.log("🎯 Retrieving PSSH for all episodes...");
  const psshData = [];
  
  for (let i = 0; i < episodesData.length; i++) {
    const ep = episodesData[i];
    const info = await getInformation(ep);
    psshData.push({
      filename: info.filename,
      pssh: info.pssh,
      url: ep.url,
    });
    
    if ((i + 1) % 5 === 0 || i === episodesData.length - 1) {
      console.log(`  ✓ Processed ${i + 1}/${episodesData.length} episodes`);
    }
  }
  
  console.log(`\n✅ Test Complete!\n`);
  
  console.log("📈 Summary:");
  console.log("-----------");
  console.log(`Total episodes: ${psshData.length}`);
  console.log(`Episodes with PSSH: ${psshData.filter(p => p.pssh).length}`);
  console.log(`Episodes without PSSH: ${psshData.filter(p => !p.pssh).length}`);
  
  // Show a sample of the PSSH data
  console.log("\n📝 Sample PSSH Data (first 2 episodes):");
  console.log("--------------------------------------");
  for (let i = 0; i < Math.min(2, psshData.length); i++) {
    const data = psshData[i];
    console.log(`${i + 1}. ${data.filename}`);
    console.log(`   PSSH: ${data.pssh.substring(0, 60)}...`);
  }
  
  console.log("\n✨ All tests passed! NPO API responds with expected data.");
  
} catch (error) {
  console.error("\n❌ Test Failed!");
  console.error(`Error: ${error.message}`);
  console.error("\nStack trace:");
  console.error(error.stack);
  process.exit(1);
}
