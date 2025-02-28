import express from "express";
import { getInformation, npoLogin } from "./npo-dl.js";

const app = express();
const port = 8080;

app.get("/getEpisode", async (req, res) => {
    console.log(req.query);
    const url = req.query["url"];
    if (url == undefined) {
        res.status(400).send("No url provided");
        return;
    }
    // check that start with 'https://npo.nl/start/serie/' and end with '/afspelen'
    if (
        !url.startsWith("https://npo.nl/start/serie/") ||
        !url.endsWith("/afspelen")
    ) {
        res.status(400).send("Invalid url");
        return;
    }

    const information = await getInformation(url);
    res.status(200).send(information);
});

app.listen(port, async () => {
    await npoLogin();
    console.log(`Example app listening on port ${port}`);
});
