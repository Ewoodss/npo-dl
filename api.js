import express, { response } from "express";
import axios from "axios";
import { getInformation, npoLogin } from "./npo-dl.js";

const app = express();
const port = 8080;

const url_prefix = "https://npo.nl/start/serie/";
const url_suffix = "/afspelen";

async function is_valid_npo_url(url) {
    if (
        !url.startsWith(url_prefix) ||
        !url.endsWith(url_suffix)
    ) {
        return false;
    }
    try {
        const npo_response = await axios.get(url);
        const status = npo_response.status;
        // if response not between 200 and 299 return with 400
        if (npo_response < 200 || npo_response > 299) {
            return false;
        }
    } catch (error) {
        return false;
    }
    return true;
}

const cacheEpisodeMap = new Map()

app.get("/getEpisode", async (req, res) => {
    console.log(req.query);
    const url = req.query["url"];

    if (url == undefined) {
        res.status(400).send("No url provided");
        return;
    }

    if (cacheEpisodeMap.has(url))
    {
        res.status(200).send(cacheEpisodeMap.get(url));
        return;
    }

    const url_valid = await is_valid_npo_url(url);

    if (!url_valid) {
        const response = {
            message:
                `Provided url ${url} is not a valid npo url, they should start with ${url_prefix} and end with ${url_suffix}`,
        };

        res.status(400).send(response);
        return;
    }

    const information = await getInformation(url);

    if (information == null)
    {
        const response = {
            message:
                `Provided url ${url} is valid, but need's a premium account to download`,
        };
        
        res.status(403).send(response);
        return;
    }

    // cache control header
    res.setHeader("Cache-Control", "public");

    // expires header (1 hour from now)
    res.setHeader("Expires", new Date(Date.now() + 3600000).toUTCString());

    // add too cache
    cacheEpisodeMap.set(url, information);

    res.status(200).send(information);
});

app.listen(port, async () => {
    await npoLogin();
    console.log(`Example app listening on port ${port}`);
});
