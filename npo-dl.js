import { XMLParser } from "fast-xml-parser";
import getWvKeys from "./getwvkeys.js";
import { existsSync, mkdirSync, writeFile } from "node:fs";
import process from "node:process";
import { getKeyPath, getVideoPath, parseBoolean } from "./utils.js";
import axios from "axios";

const options = {
  ignoreAttributes: false,
  removeNSPrefix: true,
};
const parser = new XMLParser(options);

const WidevineProxyUrl =
  "https://npo-drm-gateway.samgcloud.nepworldwide.nl/authentication";

//set as environment variable or replace with your own key
const authKey = process.env.GETWVKEYS_API_KEY || "";
// check that all required environment variables are set one by one
if (!authKey) {
  console.error(
    "GETWVKEYS_API_KEY is not set, enter key from https://getwvkeys.cc/me",
  );
  process.exit(1);
}

const videoPath = getVideoPath();

if (!existsSync(videoPath)) {
  mkdirSync(videoPath);
  mkdirSync(videoPath + "/keys");
}

async function getEpisode(url) {
  const result = await getInformation(url);
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

async function getEpisodeData(url, config) {
  const response = await axios.get(
    url,
    config,
  );

  const type_str = 'type="application/json"';
  const json_start = response.data.indexOf(type_str);
  const json_end = response.data.lastIndexOf("</script>");
  const json_str = response.data.substring(
    json_start + type_str.length + 1,
    json_end,
  );

  const response_json = JSON.parse(json_str);
  const slug = response_json.query.seriesParams[1];

  const data =
    response_json.props.pageProps.dehydratedState.queries[3].state.data;

  let episodeData = "";

  for (const episode of data) {
    if (episode.slug === slug) {
      episodeData = episode;
      break;
    }
  }
  if (episodeData === "") {
    throw new Error("Episode not found");
  }

  return episodeData;
}

async function getCookie(config) {
  let result = await axios.request(
    "https://npo.nl/start/api/auth/session",
    config,
  );

  let responseCookies = [];
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
  const streamData = await axios.post(
    "https://prod.npoplayer.nl/stream-link",
    {
      "profileName": "dash",
      "drmType": "widevine",
      "referrerUrl": url,
    },
    config,
  );
  return streamData.data;
}

async function getMpdData(mpdUrl, config) {
  const mpdData = await axios.request(mpdUrl, config);
  return parser.parse(mpdData.data);
}

async function getInformation(url) {
  let config = {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64; rv:136.0) Gecko/20100101 Firefox/136.0",
      "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Accept-Encoding": "gzip, deflate, br",
      "Connection": "keep-alive",
    },
  };
  const episodeData = await getEpisodeData(url, config);
  const productId = episodeData.productId;
  config["headers"]["Cookie"] = await getCookie(config);
  config["headers"]["Authorization"] = await getJwtToken(productId, config);
  const streamData = await getStreamData(url, config);
  const mpdUrl = streamData["stream"]["streamURL"];
  const mpdData = await getMpdData(mpdUrl, config);

  let pssh = "";
  // check if the mpdData contains the necessary information
  if ("ContentProtection" in mpdData["MPD"]["Period"]["AdaptationSet"][1]) {
    pssh = mpdData["MPD"]["Period"]["AdaptationSet"][1]["ContentProtection"][3]
      .pssh || "";
  }
  const x_custom_data = streamData["stream"]["drmToken"] || "";

  const filename = await generateFileName(episodeData);
  console.log(`${filename} - ${url}`);
  const keyPath = getKeyPath(filename);

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

async function generateFileName(episodeData) {
  const rawSerie = episodeData.series.title;
  const rawTitle = episodeData.title;
  const rawNumber = episodeData.programKey;
  const rawSeason = episodeData.season.seasonKey;

  let filename = "";

  filename += rawSerie + " - ";
  // remove word "Seizoen" from rawSeason
  const seasonNumber = parseInt(rawSeason.replace("Seizoen ", ""));
  const episodeNumber = parseInt(
    rawNumber.replace("Afl. ", "").split("•")[0],
  );
  // add season and episode number to filename formatted as SxxExx
  filename += "S" + seasonNumber.toString().padStart(2, "0") + "E" +
    episodeNumber.toString().padStart(2, "0") + " - ";
  filename += rawTitle;

  // remove illegal characters from filename
  filename = filename.replace(/[/\\?%*:|"<>]/g, "#");

  return filename;
}

const sleep = (milliseconds) => {
  return new Promise((success) => setTimeout(success, milliseconds));
};

export { getCookie, getEpisode, getInformation };
