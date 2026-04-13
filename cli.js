// import from npo-dl.js
import { getEpisodesData, getInformation } from "./npo-dl.js";
import { Command } from "commander";
import { downloadFromID } from "./download.js";
import process from "node:process";

// simple cli
const program = new Command();

program
  .name("npo-start-downloader")
  .description("CLI to download npo start episodes")
  .version("1.0.1");

async function download(url) {
  const episodesData = await getEpisodesData(url);
  const informationPromises = []
  for (const episodeData of episodesData) {
    const information = getInformation(episodeData);
    informationPromises.push(information);
  }

  const EpisodesInformation = await Promise.all(informationPromises);

  const result = []
  for (const information of EpisodesInformation) {
    result.push(await downloadFromID(information));
  }

  console.log(result);
}

program.command("download")
  .description("download a single episode")
  .argument("<url>", "url of the episode")
  .action(async (url) => {
    await download(url);
  });

await program.parseAsync(process.argv);
