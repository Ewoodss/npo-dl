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
const keyArgString = '--key';

//set as environment variable or replace with your own key
const authKey = process.env.AUTH_KEY || "";
const email = process.env.NPO_EMAIL || "";
const password = process.env.NPO_PASSW || "";

const videoPath = path.resolve("../", "./videos/") + '\\';

const fileExists = async path => !!(await fs.promises.stat(path).catch(() => false));

const sleep = (milliseconds) => {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
};

let browser;

async function npoLogin() {
    browser = await puppeteer.launch({headless: false});
    console.log('Running tests..');
    const page = await browser.newPage();

    await page.goto('https://npo.nl/start');

    await page.waitForSelector('div[data-testid=\'btn-login\']');
    await page.click('div[data-testid=\'btn-login\']');


    await page.waitForSelector('#EmailAddress');
    await page.$eval('#EmailAddress', (el, secret) => el.value = secret, email);
    await page.$eval('#Password', (el, secret) => el.value = secret, password);

    await page.waitForSelector('button[value=\'login\']');
    await page.click('button[value=\'login\']');

    await page.waitForSelector('button[class=\'group w-full cursor-pointer\']');
    await page.click('button[class=\'group w-full cursor-pointer\']');

    await page.waitForNetworkIdle();

    await page.close();

}


/*
enter the video id here, you can find it in the url of the video, full url should look like this: https://www.npostart.nl/AT_300002877
if the video ids are sequential you can use the second parameter to download multiple episodes
*/

getEpisodes("AT_300003151", 1).then((data) => (console.log('succes')));

async function getEpisode(episodeId) {
    return await getEpisodes(episodeId, 1);
}

async function getEpisodes(firstId, episodeCount) {
    const promiseLogin = npoLogin();

    const index = firstId.indexOf('_') + 1;

    const id = firstId.substr(index, firstId.length);
    const prefix = firstId.substr(0, index);

    let informationList = [];

    await promiseLogin;
    for (let i = 0; i < episodeCount; i++) {
        const newId = parseInt(id) + i;
        console.log(newId);
        const episodeId = prefix + (newId);
        console.log(episodeId);

        informationList.push(getInformation(episodeId));

        await sleep(5000);
    }

    console.log('test');
    const list = await Promise.all(informationList);
    await browser.close();

    for (const information of list) {
        console.log(await downloadFromID(information));
    }
}

async function getInformation(id) {
    const page = await browser.newPage();

    await page.goto(`https://www.npostart.nl/${id}`);
    // const iframe = await page.waitForSelector(`#iframe-${id}`);
    await page.waitForSelector(`.bmpui-image`);
    const filename = await generateFileName(page);

    console.log(filename);
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
    const streamData = await (await streamResponsePromise).json();
    const x_custom_data = streamData['stream']['drmToken'];

    const mpdData = parser.parse(await (await mpdPromise).text());
    const pssh = mpdData["MPD"]["Period"]["AdaptationSet"][1]["ContentProtection"][3].pssh;


    const information = {
        "filename": filename,
        "pssh": pssh,
        "x_custom_data": x_custom_data,
        "mpdUrl": streamData['stream']['streamURL'],
        "wideVineKeyResponse": null
    };

    console.log(information);

    information.wideVineKeyResponse = ((await getWVKeys(pssh, x_custom_data)).trim());

    await writeFile(keyPath, JSON.stringify(information));

    return information;
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
    try {
        await unlink(path.toString());
        console.log(`successfully deleted ${path}`);
    } catch (error) {
        console.error('there was an error:', error.message);
    }
}


async function downloadFromID(information) {
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


    return await decryptFiles(filename, information.wideVineKeyResponse.toString());
}


async function decryptFiles(filename, key) {
    //console.log(videoPath);
    let encryptedFilename = 'encrypted#' + filename;

    const mp4File = videoPath + encryptedFilename + '.mp4';
    const m4aFile = videoPath + encryptedFilename + '.m4a';

    const mp4Decrypted = mp4Decrypt(mp4File, key);
    const m4aDecrypted = mp4Decrypt(m4aFile, key);
    let [mp4DecryptedFile, m4aDecryptedFile] = await Promise.all([mp4Decrypted, m4aDecrypted]);

    const resultFileName = await combineVideoAndAudio(filename, mp4DecryptedFile, m4aDecryptedFile);
    await sleep(1000);

    if (await fileExists(resultFileName)) {
        await deleteFile(mp4File);
        await deleteFile(m4aFile);
        await deleteFile(mp4DecryptedFile);
        await deleteFile(m4aDecryptedFile);
    }

    return resultFileName;
}

async function combineVideoAndAudio(filename, video, audio) {
    const combinedFileName = videoPath + filename + '.mkv';

    return new Promise((resolve, reject) => {
        const cmd_ffmpeg = spawn('ffmpeg', ['-i', video, '-i', audio, '-c', 'copy', combinedFileName]);
        const stdout = cmd_ffmpeg.stdout;

        stdout.on('end', () => {
            console.log(`finished combining: ${video} and ${audio} result  ${combinedFileName}`);
            resolve(combinedFileName);
        });

        cmd_ffmpeg.stderr.on('', (data) => {
            reject(data);
        });

    });

}

function mp4Decrypt(encryptedFilename, key) {
    const decryptedFileName = videoPath + encryptedFilename.substr(encryptedFilename.indexOf('#') + 1, encryptedFilename.length);
    return new Promise((resolve, reject) => {
        const cmd_mp4decrypt = spawn('../mp4decrypt.exe', ['--show-progress', '--key', key, encryptedFilename, decryptedFileName.toString()]);
        const stdout = cmd_mp4decrypt.stdout;

        stdout.on('close', () => {
            console.log(`finished decrypting: ${encryptedFilename}`);
            resolve(decryptedFileName);
        });

        cmd_mp4decrypt.stderr.on('', (data) => {
            reject(data);
        });

    });

}

function keySubstring(response) {
    return response.substr(1 + response.lastIndexOf(keyArgString) + keyArgString.length, response.length);
}

function getKeyFromCache(response, x_custom_data) {
    if (!response.includes("--key")) return null;
    response = response.substring(response.indexOf('--key') + 6, response.length);
    response = response.replace('\r\n', '');
    return response;
}


function getCustomDataStart(x_custom_data) {
    return (x_custom_data.substr(0, x_custom_data.indexOf('.')));

}

function downloadMpd(mpdUrl, filename) {
    const filenameFormat = 'encrypted#' + filename + '.%(ext)s';
    return new Promise((resolve, reject) => {
        const cmd_downloadMpd = spawn('../yt-dlp.exe', ['--allow-u', '--downloader', 'aria2c', '-f', 'bv,ba', '-P', "../videos", '-o', filenameFormat, mpdUrl]);
        const stdout = cmd_downloadMpd.stdout;
        let stdoutData = null;

        stdout.on('readable', () => {
            stdoutData = stdout.read();
            if (stdoutData != null) console.log(stdoutData + `\t [${filename}]`);
        });

        stdout.on('end', () => {
            resolve(filename + '');
        });

        cmd_downloadMpd.stderr.on('error', (data) => {
            reject(data);
        });

    });
}


function getWVKeys(pssh, x_custom_data) {
    console.log('getting keys from website');

    return new Promise((resolve, reject) => {
        if (authKey === "") {
            getL3Keys(pssh, x_custom_data).then((result) => {
                resolve(keySubstring(result));
            });
        }
        const js_getWVKeys = new getWvKeys(pssh, WidevineProxyUrl, authKey, x_custom_data);
        js_getWVKeys.getWvKeys().then((result) => {
            resolve(result[0]['key']);
        });
    });
}

function getL3Keys(pssh, x_custom_data) {
    return new Promise((resolve, reject) => {
        const python_getWVKeys = spawn('python', ["../wks-keys/L3.py", "-url", WidevineProxyUrl, "-pssh", pssh, "-data", x_custom_data]);

        python_getWVKeys.stdout.on('data', (data) => {
            resolve(data + '');
        });

        python_getWVKeys.stderr.on('error', (data) => {
            reject(data);
        });

    });
}

async function generateFileName(page) {
    const rawSerie = page.$eval('.font-bold.font-npo-scandia.leading-130.text-30 .line-clamp-2', el => el["innerText"]);
    const rawTitle = page.$eval('.font-bold.font-npo-scandia.leading-130.text-22', el => el["innerText"]);
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

    return filename;
}









