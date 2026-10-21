// import from npo-dl.js
import { getEpisodesData, getInformation } from "./npo-dl.js";
import { Command } from "commander";
import { downloadFromID } from "./download.js";
import process from "node:process";
import { writeFile } from "node:fs";

const program = new Command();

program
  .name("npo-start-downloader")
  .description("CLI to download npo start episodes, seasons, or series")
  .version("1.1.1");

async function processEpisodes(episodesData, keysOnly = false) {
  console.log(`Processing ${episodesData.length} episode(s)...`);

  const informationPromises = [];
  for (const episodeData of episodesData) {
    const information = getInformation(episodeData);
    informationPromises.push(information);
  }

  const episodesInformation = await Promise.all(informationPromises);

  if (keysOnly) {
    // Only retrieve keys without downloading
    console.log("Retrieving DRM keys only (no download)...");
    const keyResults = [];
    for (const information of episodesInformation) {
      keyResults.push({
        filename: information.filename,
        pssh: information.pssh,
        key: information.wideVineKeyResponse,
      });
      console.log(`✓ ${information.filename}`);
    }
    return keyResults;
  } else {
    // Download and decrypt videos
    console.log("Downloading and decrypting episodes...");
    const result = [];
    for (const information of episodesInformation) {
      const downloaded = await downloadFromID(information);
      result.push(downloaded);
    }
    return result;
  }
}

program.command("download")
  .description("download episode(s), season, or entire series")
  .argument("<url>", "URL of the episode, season, or series")
  .option("-k, --keys-only", "retrieve DRM keys only (no download)")
  .action(async (url, options) => {
    try {
      const episodesData = await getEpisodesData(url);

      // Detect content type
      let contentType = "episode";
      if (episodesData.length > 1) {
        if (url.includes("/serie/")) {
          contentType = episodesData.length > 10 ? "series" : "season";
        } else {
          contentType = "season";
        }
      }

      console.log(`Detected: ${contentType} (${episodesData.length} episode${episodesData.length > 1 ? "s" : ""})`);

      const result = await processEpisodes(episodesData, options.keysOnly);

      if (options.keysOnly) {
        console.log(`\n✓ Retrieved ${result.length} key(s)`);

        // Save keys to JSON file
        const keysFile = "npo-dl-keys.json";
        const keysData = JSON.stringify(result, null, 2);
        writeFile(keysFile, keysData, "utf8", (err) => {
          if (err) {
            console.error(`Error writing keys file: ${err}`);
          } else {
            console.log(`Keys saved to ${keysFile}`);
          }
        });
      } else {
        console.log(`\n✓ Downloaded ${result.filter(r => r).length} episode(s)`);
      }
    } catch (error) {
      console.error("Error:", error.message);
      process.exit(1);
    }
  });

program
  .addHelpText("after", `
Examples:
  # Download a single episode
  deno -A cli.js download https://npo.nl/start/afspelen/sluipschutters_184

  # Download an entire season
  deno -A cli.js download https://npo.nl/start/serie/sluipschutters/seizoen-7

  # Download all seasons of a series
  deno -A cli.js download https://npo.nl/start/serie/sluipschutters

  # Get DRM keys only (no download)
  deno -A cli.js download --keys-only https://npo.nl/start/afspelen/sluipschutters_184`);

await program.parseAsync(process.argv);
