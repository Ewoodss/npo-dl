import { XMLParser } from "fast-xml-parser";
import getWvKeys from "./getwvkeys.js";
import { existsSync, mkdirSync, readFileSync, writeFile } from "node:fs";
import process from "node:process";
import { getKeyPath, getVideoPath, fileExists } from "./utils.js";
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

async function getEmbededJsonData(url) {
  console.debug(`getEmbededJsonData: ${url}`);

  const response = await axios.get(
    url,
  );

  const type_str = 'type="application/json"';
  const json_start = response.data.indexOf(type_str);
  const json_end = response.data.lastIndexOf("</script>");
  const json_str = response.data.substring(
    json_start + type_str.length + 1,
    json_end,
  );

  return JSON.parse(json_str);
}

const urlTypes = Object.freeze({
  EPISODE: "episode",
  SEASON: "season",
  SERIES: "series",
  MOVIE: "movie",


  UNKNOWN: "unknown",
})


async function getSeriesData(seriesSlug) {
  const seasonRespone = await axios.get(`https://npo.nl/start/api/domain/series-seasons?slug=${seriesSlug}`)
  const seasonQuery = seasonRespone.data
  const episodesData = []

  const seasonDataPromises = []

  for (const season of seasonQuery) {
    const seasonData = getSeasonData(seriesSlug, season.slug)
    seasonDataPromises.push(seasonData)
  }

  const seasonData = await Promise.all(seasonDataPromises)
  for (const season of seasonData) {
    episodesData.push(...season)
  }

  return episodesData;
}

async function getSeasonData(seriesSlug, seasonSlug) {
  const embeddedJsonData = await getEmbededJsonData(`https://npo.nl/start/serie/${seriesSlug}/${seasonSlug}`);
  const dehydratedState = embeddedJsonData.props.pageProps.dehydratedState;
  const episodesQuery = dehydratedState.queries[4].state.data;


  const episodesDataPromises = []
  for (const episode of episodesQuery) {
    const seriesSlug = episode.series.slug
    const seasonSlug = episode.season.slug
    const episodeData = getEpisodeData(`https://npo.nl/start/serie/${seriesSlug}/${seasonSlug}/${episode.slug}`)
    episodesDataPromises.push(episodeData)
  }
  const episodesData = await Promise.all(episodesDataPromises)

  return episodesData;
}

async function getEpisodesData(url) {
  const embeddedJsonData = await getEmbededJsonData(url);
  let urlType = urlTypes.UNKNOWN;
  const query = embeddedJsonData.query;
  if (query.hasOwnProperty("seriesSlug")) {
    urlType = urlTypes.SERIES
    if (query.hasOwnProperty("seasonSlug")) {
      urlType = urlTypes.SEASON
      if (query.seasonSlug.length > 1) {
        urlType = urlTypes.EPISODE
      }
    }
  } else if (query.hasOwnProperty("programSlug")) {
    urlType = urlTypes.EPISODE
  }

  const seriesSlug = query.seriesSlug;

  console.log(`urlType: ${urlType}`);

  if (urlType === urlTypes.SERIES) {
    console.log("getting series data");
    return await getSeriesData(seriesSlug);
  }
  else if (urlType === urlTypes.SEASON) {
    console.log("getting season data");
    return await getSeasonData(seriesSlug, query.seasonSlug[0]);
  }
  else if (urlType === urlTypes.EPISODE) {
    console.log("getting episode data");
    const episodeSlug = query.programSlug;
    return [await getEpisodeData(`https://npo.nl/start/afspelen/${episodeSlug}`)]
  }
  else {
    throw new Error("Unknown url type");
  }
}


async function getEpisodeData(url) {
  const embeddedJsonData = await getEmbededJsonData(url);
  const dehydratedState = embeddedJsonData.props.pageProps.dehydratedState

  const episodeData = dehydratedState.queries[0].state.data;


  return {
    productId: episodeData.productId, url: `${url}/afspelen`, series: episodeData.series.title, season: episodeData.season.seasonKey, title: episodeData.title, programKey: episodeData.programKey
  };
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
  console.log(`Getting stream data for ${url}`)
  const streamData = await axios.post(
    "https://prod.npoplayer.nl/stream-link",
    {
      "profileName": "dash",
      "drmType": "widevine",
      "referrerUrl": url,
    },
    config,
  ).catch(() => {
    console.log("Most likely a premium episode, skipping...");
  });

  if (!streamData) {
    return null;
  }


  return streamData.data;
}

async function getMpdData(mpdUrl, config) {
  const mpdData = await axios.request(mpdUrl, config);
  return parser.parse(mpdData.data);
}

async function getInformation(episodeData) {
  const config = {
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

  const filename = generateFileName(episodeData);
  console.log(`${filename} - ${episodeData.url}`);
  const keyPath = getKeyPath(filename);

  const keyExists = await fileExists(keyPath);
  if (keyExists) {
    console.log(`key exists for ${keyPath}`)
    // read key from file
    const key = readFileSync(keyPath, "utf8");
    return JSON.parse(key)
  }

  config["headers"]["Cookie"] = await getCookie(config);
  config["headers"]["Authorization"] = await getJwtToken(episodeData.productId, config);
  const streamData = await getStreamData(episodeData.url, config);

  if (streamData === null) {
    console.log("no stream data found");
    return null;
  }

  const mpdUrl = streamData["stream"]["streamURL"];
  const mpdData = await getMpdData(mpdUrl, config);

  let pssh = "";
  // check if the mpdData contains the necessary information
  if ("ContentProtection" in mpdData["MPD"]["Period"]["AdaptationSet"][1]) {
    pssh = mpdData["MPD"]["Period"]["AdaptationSet"][1]["ContentProtection"][3]
      .pssh || "";
  }
  const x_custom_data = streamData["stream"]["drmToken"] || "";



  const information = {
    "filename": filename,
    "pssh": pssh,
    "x_custom_data": x_custom_data,
    "mpdUrl": streamData["stream"]["streamURL"],
    "wideVineKeyResponse": null,
  };

  //if pssh and x_custom_data are not empty, get the keys
  if (pssh.length !== 0 && x_custom_data.length !== 0) {
    const WVKey = (await getWVKeys(pssh, x_custom_data)).toString();
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

function generateFileName(episodeData) {
  const rawSerie = episodeData.series;
  const rawTitle = episodeData.title;
  const rawNumber = episodeData.programKey;
  const rawSeason = episodeData.season;

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


export { getCookie, getEpisodesData, getInformation };
