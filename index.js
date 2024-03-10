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
const videoPath = path.resolve("../", "./videos/") + '\\';


/*
enter the video id here, you can find it in the url of the video, full url should look like this: https://www.npostart.nl/AT_300003151
if the video ids are sequential you can use the second parameter to download multiple episodes
*/

getEpisodes("POW_05490242", 6).then((result) => {
    console.log(result);
});

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

async function getEpisode(episodeId) {
    return await getEpisodes(episodeId, 1);
}

async function getEpisodes(firstId, episodeCount) {
    const promiseLogin = npoLogin();

    const index = firstId.lastIndexOf('_') + 1;

    const id = firstId.substring(index, firstId.length);
    let prefix = firstId.substring(0, index);
    // if id start with 0 add 0 to the prefix
    if (id.startsWith('0')) {
        prefix += '0';
    }

    let informationList = [];

    await promiseLogin;
    for (let i = 0; i < episodeCount; i++) {
        const episodeId = prefix + (parseInt(id) + i);
        informationList.push(getInformation(`https://www.npostart.nl/${episodeId}`));

        await sleep(5000);
    }

    console.log('test');
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
    const page = await browser.newPage();

    await page.goto(url);
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
    const x_custom_data = streamData['stream']['drmToken'] || "";

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

    console.log(information);

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

    if (key != null) {
        const mp4Decrypted = mp4Decrypt(mp4File, key);
        const m4aDecrypted = mp4Decrypt(m4aFile, key);
        [mp4DecryptedFile, m4aDecryptedFile] = await Promise.all([mp4Decrypted, m4aDecrypted]);
    }

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

    // remove illegal characters from filename
    filename = filename.replace(/[/\\?%*:|"<>]/g, '#');

    return filename;
}


const fileExists = async path => !!(await fs.promises.stat(path).catch(() => false));

const sleep = (milliseconds) => {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
};








