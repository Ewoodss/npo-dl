import { HTTPResponse, launch, Page } from "puppeteer";
import { XMLParser } from "fast-xml-parser";
import getWvKeys from "./getwvkeys.js";
import { existsSync, mkdirSync, readFileSync, writeFile } from "node:fs";
import { unlink } from "node:fs/promises";
import process from "node:process";
import { fileExists, getKeyPath, getVideoPath, parseBoolean } from "./utils.js";

const options = {
  ignoreAttributes: false,
  removeNSPrefix: true,
};
const parser = new XMLParser(options);

const WidevineProxyUrl =
  "https://npo-drm-gateway.samgcloud.nepworldwide.nl/authentication";

//set as environment variable or replace with your own key
const authKey = process.env.AUTH_KEY || "";
const email = process.env.NPO_EMAIL || "";
const password = process.env.NPO_PASSW || "";
const headless = parseBoolean(process.env.HEADLESS);

const videoPath = getVideoPath();

if (!existsSync(videoPath)) {
  mkdirSync(videoPath);
  mkdirSync(videoPath + "/keys");
}

const browser = await launch({ headless: headless });

async function npoLogin() {
  const page = await browser.newPage();

  await page.goto("https://npo.nl/start");

  await page.waitForSelector("div[data-testid='btn-login']");
  await page.click("div[data-testid='btn-login']");

  await page.waitForSelector("#EmailAddress");
  await page.$eval("#EmailAddress", (el, secret) => el.value = secret, email);
  await page.$eval("#Password", (el, secret) => el.value = secret, password);

  await sleep(1000);
  await page.waitForSelector("button[value='login']");
  await page.click("button[value='login']");

  await page.waitForSelector(
    "button[class='bg-transparent group w-full cursor-pointer']",
  );
  await page.click(
    "button[class='bg-transparent group w-full cursor-pointer']",
  );

  await waitResponseSuffix(page, "session");

  await page.close();
  console.log("Login successful");
}

async function getEpisode(url) {
  const promiseLogin = npoLogin();
  await promiseLogin;
  const result = await getInformation(url);
  await browser.close();
  return result;
}

function getEpisodesInOrder(firstId, episodeCount) {
  const index = firstId.lastIndexOf("_") + 1;

  const id = firstId.substring(index, firstId.length);
  let prefix = firstId.substring(0, index);
  // if id start with 0 add 0 to the prefix
  if (id.startsWith("0")) {
    prefix += "0";
  }
  const urls = [];
  for (let i = 0; i < episodeCount; i++) {
    const episodeId = prefix + (parseInt(id) + i);
    urls.push(`https://www.npostart.nl/${episodeId}`);
  }
  return getEpisodes(urls);
}

async function getAllEpisodesFromShow(url, seasonCount = -1, reverse = false) {
  const page = await browser.newPage();

  await page.goto(url);

  const jsonData = await page.evaluate(() => {
    return JSON.parse(document.getElementById("__NEXT_DATA__").innerText) ||
      null;
  });

  if (jsonData === null) {
    console.log("Error retrieving show data");
    return null;
  }

  await page.close();

  const show =
    jsonData["props"]["pageProps"]["dehydratedState"]["queries"][0]["state"][
      "data"
    ]["slug"];
  const seasons =
    jsonData["props"]["pageProps"]["dehydratedState"]["queries"][1]["state"][
      "data"
    ];
  if (!reverse) { // the normal season order is already reversed
    seasons.reverse();
  }

  const seasonsLength = seasonCount !== -1 ? seasonCount : seasons.length;
  const urls = [];
  const perSeasonEpisodes = [];

  for (let i = 0; i < seasonsLength; i++) {
    const seasonEpisodes = getAllEpisodesFromSeason(
      `https://npo.nl/start/serie/${show}/${seasons[i]["slug"]}`,
      reverse,
    );
    perSeasonEpisodes.push(seasonEpisodes);
  }

  await Promise.all(perSeasonEpisodes)
    .then((result) => {
      for (const season of result) {
        urls.push(...season);
      }
    });

  return urls;
}

async function getAllEpisodesFromSeason(url, reverse = false) {
  const page = await browser.newPage();

  const urls = [];

  await page.goto(url);

  await page.waitForSelector("div[data-testid='btn-login']");
  const jsonData = await page.evaluate(() => {
    return JSON.parse(document.getElementById("__NEXT_DATA__").innerText) ||
      null;
  });

  if (jsonData === null) {
    console.log("Error retrieving episode data");
    return null;
  }

  const show = jsonData["query"]["seriesSlug"];
  const season = jsonData["query"]["seriesParams"][0];
  const episodes =
    jsonData["props"]["pageProps"]["dehydratedState"]["queries"][2]["state"][
      "data"
    ];
  if (!reverse) { // the normal is already reversed, so if we want to start from the first episode we need to reverse it
    episodes.reverse();
  }

  for (let x = 0; x < episodes.length; x++) {
    let programKey = episodes[x]["programKey"];
    let slug = episodes[x]["slug"];
    let productId = episodes[x]["productId"];
    console.log(`ep. ${programKey} - ${slug} - ${productId}`);
    urls.push(`https://npo.nl/start/serie/${show}/${season}/${slug}/afspelen`);
  }

  await page.close();

  return urls;
}

async function getEpisodes(urls) {
  const promiseLogin = npoLogin();
  let informationList = [];
  await promiseLogin;

  let count = 0;
  for (const npo_url of urls) {
    informationList.push(getInformation(npo_url));
    if (count % 10 === 0) {
      await Promise.all(informationList);
    }
  }

  const list = await Promise.all(informationList);
  await browser.close();

  return downloadMulti(list, true);
}

async function downloadMulti(InformationList, runParallel = false) {
  if (runParallel === true) {
    let downloadPromises = [];
    for (const information of InformationList) {
      downloadPromises.push(downloadFromID(information));
    }
    return await Promise.all(downloadPromises);
  }

  let result = [];
  for (const information of InformationList) {
    result.push(await downloadFromID(information));
  }
  return result;
}

/**
 * @param {Page} page
 * @param {str} suffix
 * @returns {Promise<HTTPResponse>}
 */
async function waitResponseSuffix(page, suffix) {
  const response = page.waitForResponse(async (response) => {
    const request = response.request();
    const method = request.method().toUpperCase();

    if (method != "GET" && method != "POST") {
      return false;
    }
    const url = response.url();
    if (!url.endsWith(suffix)) {
      return false;
    }

    console.log(`request: ${url} method: ${method}`);
    try {
      const body = await response.buffer();
    } catch (error) {
      console.error("preflicht error");
      return false;
    }

    return url.endsWith(suffix);
  });
  return await response;
}

async function getInformation(url) {
  const page = await browser.newPage();

  await page.goto(url);
  if (page.url() === "https://npo.nl/start") {
    await page.close();
    console.log(`Error wrong episode ID ${url}`);
    return null;
  }

  const canDownload = await new Promise((resolve) => {
    page.waitForSelector(`.bmpui-image`, { timeout: 5000 })
      .then(() => resolve(true))
      .catch(() => resolve(false));
    page.waitForSelector(".bg-gradient-video-overlay", { timeout: 5000 })
      .then(() => resolve(false))
      .catch(() => resolve(true));
  });

  if (!canDownload)
  {
    return null;
  }

  const filename = await generateFileName(page);

  console.log(`${filename} - ${url}`);
  const keyPath = getKeyPath(filename);

  if (await fileExists(keyPath)) {
    await page.close();
    console.log("information already gathered");
    return JSON.parse(readFileSync(keyPath, "utf8"));
  }
  console.log("gathering information");

  const mpdPromise = waitResponseSuffix(page, "mpd");
  const streamResponsePromise = waitResponseSuffix(page, "stream-link");

  // reload the page to get the stream link
  await page.reload();

  const streamResponse = await streamResponsePromise;
  const streamData = await streamResponse.json();

  let x_custom_data = "";
  try {
    x_custom_data = streamData["stream"]["drmToken"] || "";
  } catch (TypeError) {
    const pageContent = await page.content();
    if (pageContent.includes("Alleen te zien met NPO Plus")) {
      console.log("Error content needs NPO Plus subscription");
      return null;
    }
  }
  const mpdResponse = await mpdPromise;
  const mpdText = await mpdResponse.text();
  const mpdData = parser.parse(mpdText);

  let pssh = "";
  // check if the mpdData contains the necessary information
  if ("ContentProtection" in mpdData["MPD"]["Period"]["AdaptationSet"][1]) {
    pssh = mpdData["MPD"]["Period"]["AdaptationSet"][1]["ContentProtection"][3]
      .pssh || "";
  }

  const information = {
    "filename": filename,
    "pssh": pssh,
    "x_custom_data": x_custom_data,
    "mpdUrl": streamData["stream"]["streamURL"],
    "wideVineKeyResponse": null,
  };

  //if pssh and x_custom_data are not empty, get the keys
  if (pssh.length !== 0 && x_custom_data.length !== 0) {
    const WVKey = await getWVKeys(pssh, x_custom_data);
    information.wideVineKeyResponse = WVKey.trim();
  } else {
    console.log("probably no drm");
  }

  writeKeyFile(keyPath, JSON.stringify(information));

  try {
    await page.close();
  } catch (error) {
    console.error(error);
  }
  return information;
}

function writeKeyFile(path, data) {
  writeFile(path, data, "utf8", (err) => {
    if (err) {
      console.log(`Error writing file: ${err}`);
    } else {
      console.log(`${path} is written successfully!`);
    }
  });
}

async function getWVKeys(pssh, x_custom_data) {
  console.log("getting keys from website");
  const promise = new Promise((success, reject) => {
    if (authKey === "") {
      reject("no auth key");
    }
    const js_getWVKeys = new getWvKeys(
      pssh,
      WidevineProxyUrl,
      authKey,
      x_custom_data,
    );
    js_getWVKeys.getWvKeys().then((result) => {
      success(result);
    });
  });
  return await promise;
}

async function generateFileName(page) {
  const rawSerie = page.$eval(
    ".font-bold.font-npo-scandia.leading-130.text-30 .line-clamp-2",
    (el) => el["innerText"],
  );
  const rawTitle = page.$eval(
    "h2.font-bold.font-npo-scandia.leading-130.text-22",
    (el) => el["innerText"],
  );
  const rawNumber = page.$eval(
    ".mb-24 .flex.items-center .leading-130.text-13 .line-clamp-1",
    (el) => el["innerText"],
  );
  const rawSeason = page.$eval(
    ".bg-card-3.font-bold.font-npo-scandia.inline-flex.items-center",
    (el) => el["innerText"],
  );

  let filename = "";

  filename += (await rawSerie) + " - ";
  // remove word "Seizoen" from rawSeason
  let seasonNumber = parseInt((await rawSeason).replace("Seizoen ", ""));
  // if nan try different method
  if (isNaN(seasonNumber)) {
    const pageUrl = await page.url();
    // get index of word 'seizoen' in pageUrl
    const season_index = pageUrl.indexOf("seizoen-");
    seasonNumber = parseInt(pageUrl.slice(season_index + 8).split("/")[0]);
  }

  const episodeNumber = parseInt(
    (await rawNumber).replace("Afl. ", "").split("•")[0],
  );
  // add season and episode number to filename formatted as SxxExx
  filename += "S" + seasonNumber.toString().padStart(2, "0") + "E" +
    episodeNumber.toString().padStart(2, "0") + " - ";
  filename += await rawTitle;

  // remove illegal characters from filename
  filename = filename.replace(/[/\\?%*:|"<>]/g, "#");

  return filename;
}

const sleep = (milliseconds) => {
  return new Promise((success) => setTimeout(success, milliseconds));
};

export { getEpisode, getInformation, npoLogin };
