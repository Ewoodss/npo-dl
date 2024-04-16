const puppeteer = require('puppeteer');
const {XMLParser} = require('fast-xml-parser');
const getWvKeys = require('./getwvkeys.js');
const options = {
    ignoreAttributes: false, removeNSPrefix: true
};
const parser = new XMLParser(options);
const fs = require('fs');
const {unlink} = require('fs/promises');
const {spawn} = require('child_process');
const path = require("path");

const WidevineProxyUrl = 'https://npo-drm-gateway.samgcloud.nepworldwide.nl/authentication';

//set as environment variable or replace with your own key
const authKey = process.env.AUTH_KEY || "";
const email = process.env.NPO_EMAIL || "";
const password = process.env.NPO_PASSW || "";
const videoPath = path.resolve("./videos") + "/";

if (!fs.existsSync(videoPath)) {
    fs.mkdirSync(videoPath);
    fs.mkdirSync(videoPath + '/keys');
}

let browser = null;

//enter the npo start show name and download all episodes from all seasons.
//second parameter = season count (0 = all)
//third parameter = reverse seasons (false = Start from latest, true = Start from first)

getAllEpisodesFromShow("keuringsdienst-van-waarde", 2, true).then((urls) => {
    getEpisodes(urls).then((result) => {
        console.log(result);
    });
});


// enter the npo start show name and download all episodes from the chosen season.
/*
getAllEpisodesFromSeason("keuringsdienst-van-waarde", "seizoen-3").then((urls) => {
    getEpisodes(urls);
});
*/

/*
enter the video id here, you can find it in the url of the video, full url should look like this: https://www.npostart.nl/AT_300003151
if the video ids are sequential you can use the second parameter to download multiple episodes
*/

// getEpisodesInOrder("AT_300003161", 1).then((result) => {
//     console.log(result);
// });

//getEpisode("https://npo.nl/start/serie/flikken-maastricht/seizoen-11/undercover_1/afspelen").then((result) => {
//    console.log(result);
//});

async function npoLogin() {
    // check if browser is already running
    if (browser === null) {
        browser = await puppeteer.launch({headless: false});
    }

    console.log('Running tests..');
    const page = await browser.newPage();

    await page.goto('https://npo.nl/start');

    await page.waitForSelector('div[data-testid=\'btn-login\']');
    await page.click('div[data-testid=\'btn-login\']');

    await page.waitForSelector('#EmailAddress');
    await page.$eval('#EmailAddress', (el, secret) => el.value = secret, email);
    await page.$eval('#Password', (el, secret) => el.value = secret, password);

    await sleep(1000);
    await page.waitForSelector('button[value=\'login\']');
    await page.click('button[value=\'login\']');

    await page.waitForSelector('button[class=\'group w-full cursor-pointer\']');
    await page.click('button[class=\'group w-full cursor-pointer\']');

    try {
        await page.waitForNetworkIdle();
    } catch (TimeoutError) {
        // keep going
    }

    await page.close();

}

async function getEpisode(url) {
    const promiseLogin = npoLogin();
    await promiseLogin;
    const result = await getInformation(url);
    await browser.close();
    return downloadFromID(result);
}

async function getEpisodesInOrder(firstId, episodeCount) {
    const index = firstId.lastIndexOf('_') + 1;

    const id = firstId.substring(index, firstId.length);
    let prefix = firstId.substring(0, index);
    // if id start with 0 add 0 to the prefix
    if (id.startsWith('0')) {
        prefix += '0';
    }
    const urls = [];
    for (let i = 0; i < episodeCount; i++) {
        const episodeId = prefix + (parseInt(id) + i);
        urls.push(`https://www.npostart.nl/${episodeId}`);
    }
    return getEpisodes(urls);
}

async function getAllEpisodesFromShow(show, seasonCount = 0, reverse = false) {
    if (browser == null) {
        browser = await puppeteer.launch({headless: false});
    }
    const page = await browser.newPage();

    const urls = [];

    await page.goto(`https://npo.nl/start/serie/${show}`);

    const jsonData = await page.evaluate(() => {
        return JSON.parse(document.getElementById('__NEXT_DATA__').innerText) || null;
    });

    if (jsonData === null) {
        console.log('Error retrieving show data');
        return null;
    }

    await page.close();

    const seasons = reverse
        ? jsonData['props']['pageProps']['dehydratedState']['queries'][1]['state']['data'].reverse()
        : jsonData['props']['pageProps']['dehydratedState']['queries'][1]['state']['data'];

    const seasonsLength = seasonCount !== 0 ? seasonCount : seasons.length;


    for (let i = 0; i < seasonsLength; i++) {
        let season = seasons[i]['slug'];
        console.log(season);
        let seasonUrls = await getAllEpisodesFromSeason(show, season, reverse);
        for (let x = 0; x < seasonUrls.length; x++) {
            console.log(seasonUrls[x]);
            urls.push(seasonUrls[x]);
        }
    }

    return urls;
}

async function getAllEpisodesFromSeason(show, season = 0, reverse = false) {
    if (browser == null) {
        browser = await puppeteer.launch({headless: false});
    }
    const page = await browser.newPage();

    const urls = [];

    console.log(`${show} - ${season}`);

    await page.goto(`https://npo.nl/start/serie/${show}/${season}`);
    await page.waitForSelector('div[data-testid=\'btn-login\']');
    const jsonData = await page.evaluate(() => {
        return JSON.parse(document.getElementById('__NEXT_DATA__').innerText) || null;
    });

    if (jsonData === null) {
        console.log('Error retrieving episode data');
        return null;
    }

    const episodes = reverse
        ? jsonData['props']['pageProps']['dehydratedState']['queries'][2]['state']['data'].reverse()
        : jsonData['props']['pageProps']['dehydratedState']['queries'][2]['state']['data'];

    for (let x = 0; x < episodes.length; x++) {
        let programKey = episodes[x]['programKey'];
        let slug = episodes[x]['slug'];
        let productId = episodes[x]['productId'];
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
    for (const npo_url of urls) {
        informationList.push(getInformation(npo_url));
        await sleep(7500);
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

async function getInformation(url) {
    let tries = 0;
    while (tries <= 3) {
        tries++;
        try {
            const page = await browser.newPage();

            await page.goto(url);
            if (page.url() === "https://npo.nl/start") {
                await page.close();
                console.log(`Error wrong episode ID ${url}`);
                return null;
            }

            // const iframe = await page.waitForSelector(`#iframe-${id}`);
            await page.waitForSelector(`.bmpui-image`);
            const filename = await generateFileName(page);

            console.log(`${filename} - ${url}`);
            const keyPath = getKeyPath(filename);

            if (await fileExists(keyPath)) {
                await page.close();
                console.log('information already gathered');
                return JSON.parse(fs.readFileSync(keyPath, 'utf8'));
            }

            const mpdPromise = page.waitForResponse((response) => {
                if (response.url().endsWith('.mpd')) {
                    return response;
                }
            });

            // wait for post request that ends with 'stream-link'
            const streamResponsePromise = page.waitForResponse((response) => {
                if (response.url().endsWith('stream-link') && response.request().method() === 'POST') {
                    return response;
                }
            });

            // reload the page to get the stream link
            await page.reload();
            const streamData = await (await streamResponsePromise).json();

            let x_custom_data = "";
            try {
                x_custom_data = streamData['stream']['drmToken'] || "";
            } catch (TypeError) {
                const pageContent = await page.content();
                if (pageContent.includes("Alleen te zien met NPO Plus")) {
                    console.log('Error content needs NPO Plus subscription');
                    return null;
                }
            }

            const mpdData = parser.parse(await (await mpdPromise).text());

            let pssh = "";
            // check if the mpdData contains the necessary information
            if ('ContentProtection' in mpdData["MPD"]["Period"]["AdaptationSet"][1]) {
                pssh = mpdData["MPD"]["Period"]["AdaptationSet"][1]["ContentProtection"][3].pssh || "";
            }

            const information = {
                "filename": filename,
                "pssh": pssh,
                "x_custom_data": x_custom_data,
                "mpdUrl": streamData['stream']['streamURL'],
                "wideVineKeyResponse": null
            };

            //if pssh and x_custom_data are not empty, get the keys
            if (pssh.length !== 0 && x_custom_data.length !== 0) {
                information.wideVineKeyResponse = ((await getWVKeys(pssh, x_custom_data)).trim());
            } else {
                console.log('probably no drm');
            }

            await writeFile(keyPath, JSON.stringify(information));

            page.close();
            console.log(information);
            return information;
        } catch (e) {
            console.log(`Error retrieving information, try ${tries}/3 (${url})`);
            console.log(e);
            await sleep(5000);
            try {
                await page.close();
            } catch (E) {
            }
        }
    }
}

function getKeyPath(filename) {
    return path.join(videoPath, '/keys/', filename + '.json');
}

async function writeFile(path, data) {
    await fs.writeFile(path, data, 'utf8', (err) => {
        if (err) {
            console.log(`Error writing file: ${err}`);
        } else {
            console.log(`${path} is written successfully!`);
        }

    });

}

async function deleteFile(path) {
    // check if file exists
    if (await fileExists(path)) {
        try {
            await unlink(path.toString());
            console.log(`successfully deleted ${path}`);
        } catch (error) {
            console.error('there was an error:', error.message);
        }
    } else {
        console.warn(`file ${path} does not exist`);
    }
}


async function downloadFromID(information) {
    if (information === null) {
        return null;
    }

    let filename = information.filename.toString();

    console.log(filename);

    const combinedFileName = videoPath + filename + '.mkv';
    if (await fileExists(combinedFileName)) {
        console.log("File already downloaded");
        return combinedFileName;
    }


    console.log(information);

    filename = await downloadMpd(information.mpdUrl.toString(), filename);

    console.log(filename);

    let key = null;

    if (information.wideVineKeyResponse !== null) {
        key = information.wideVineKeyResponse.toString();
    }

    return await decryptFiles(filename, key);
}


async function decryptFiles(filename, key) {
    //console.log(videoPath);
    let encryptedFilename = 'encrypted#' + filename;

    const mp4File = videoPath + encryptedFilename + '.mp4';
    const m4aFile = videoPath + encryptedFilename + '.m4a';

    //if key is none then file probably not encrypted
    let [mp4DecryptedFile, m4aDecryptedFile] = [mp4File, m4aFile];

    // if (key != null) {
    //     const mp4Decrypted = mp4Decrypt(mp4File, key);
    //     const m4aDecrypted = mp4Decrypt(m4aFile, key);
    //     [mp4DecryptedFile, m4aDecryptedFile] = await Promise.all([mp4Decrypted, m4aDecrypted]);
    // }
    if (key != null) {
        key = key.split(':')[1];
    }
    const resultFileName = await combineVideoAndAudio(filename, mp4DecryptedFile, m4aDecryptedFile, key);

    await sleep(1000);

    if (await fileExists(resultFileName)) {
        await deleteFile(mp4File);
        await deleteFile(m4aFile);
        await deleteFile(mp4DecryptedFile);
        await deleteFile(m4aDecryptedFile);
    }

    return resultFileName;
}

async function runCommand(command, args, result) {
    return new Promise((resolve, reject) => {
        const cmd = spawn(command, args);
        const stdout = cmd.stdout;
        let stdoutData = null;

        stdout.on('end', () => {
            console.log(`finished: ${command} ${args}`);
            resolve(result);
        });

        stdout.on('readable', () => {
            stdoutData = stdout.read();
            if (stdoutData != null) console.log(stdoutData + `\t [${result}]`);
        });

        cmd.stderr.on('error', (data) => {
            reject(data);
        });

    });
}

async function combineVideoAndAudio(filename, video, audio, key) {
    const combinedFileName = videoPath + filename + '.mkv';
    let args = ['-i', video, '-i', audio, '-c', 'copy', combinedFileName];
    if (key != null) {
        args = ['-decryption_key', key, '-i', video, '-decryption_key', key, '-i', audio, '-c', 'copy', combinedFileName];
    }
    return runCommand('ffmpeg', args, combinedFileName);
}

async function downloadMpd(mpdUrl, filename) {
    const filenameFormat = 'encrypted#' + filename + '.%(ext)s';
    const args = ['--allow-u', '--downloader', 'aria2c', '-f', 'bv,ba', '-P', videoPath, '-o', filenameFormat, mpdUrl];
    return runCommand('yt-dlp', args, filename);
}


function getWVKeys(pssh, x_custom_data) {
    console.log('getting keys from website');

    return new Promise((resolve, reject) => {
        if (authKey === "") {
            reject('no auth key');
        }
        const js_getWVKeys = new getWvKeys(pssh, WidevineProxyUrl, authKey, x_custom_data);
        js_getWVKeys.getWvKeys().then((result) => {
            resolve(result);
        });
    });
}

async function generateFileName(page) {
    const rawSerie = page.$eval('.font-bold.font-npo-scandia.leading-130.text-30 .line-clamp-2', el => el["innerText"]);
    const rawTitle = page.$eval('h2.font-bold.font-npo-scandia.leading-130.text-22', el => el["innerText"]);
    const rawNumber = page.$eval('.mb-24 .flex.items-center .leading-130.text-13 .line-clamp-1', el => el["innerText"]);
    const rawSeason = page.$eval('.bg-card-3.font-bold.font-npo-scandia.inline-flex.items-center', el => el["innerText"]);

    let filename = "";

    filename += (await rawSerie) + " - ";
    // remove word "Seizoen" from rawSeason
    const seasonNumber = parseInt((await rawSeason).replace("Seizoen ", ""));
    const episodeNumber = parseInt((await rawNumber).replace("Afl. ", "").split("•")[0]);
    // add season and episode number to filename formatted as SxxExx
    filename += "S" + seasonNumber.toString().padStart(2, '0') + "E" + episodeNumber.toString().padStart(2, '0') + " - ";
    filename += (await rawTitle);

    // remove illegal characters from filename
    filename = filename.replace(/[/\\?%*:|"<>]/g, '#');

    return filename;
}


const fileExists = async path => !!(await fs.promises.stat(path).catch(() => false));

const sleep = (milliseconds) => {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
};








