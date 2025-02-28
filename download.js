import {
    deleteFile,
    fileExists,
    getVideoPath,
    runCommand,
    sleep,
} from "./utils.js";

const videoPath = getVideoPath();

async function downloadFromID(information) {
    if (information === null) {
        return null;
    }

    let filename = information.filename.toString();

    console.log(filename);

    const combinedFileName = videoPath + filename + ".mkv";
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

async function downloadMpd(mpdUrl, filename) {
    const filenameFormat = "encrypted#" + filename + ".%(ext)s";
    const args = [
        "--allow-u",
        "--downloader",
        "aria2c",
        "-f",
        "bv,ba",
        "-P",
        videoPath,
        "-o",
        filenameFormat,
        mpdUrl,
    ];
    return runCommand("yt-dlp", args, filename);
}

async function decryptFiles(filename, key) {
    //console.log(videoPath);
    let encryptedFilename = "encrypted#" + filename;

    const mp4File = videoPath + encryptedFilename + ".mp4";
    const m4aFile = videoPath + encryptedFilename + ".m4a";

    if (key != null) {
        key = key.split(":")[1];
    }
    const resultFileName = await combineVideoAndAudio(
        filename,
        mp4File,
        m4aFile,
        key,
    );

    await sleep(100);

    if (await fileExists(resultFileName)) {
        await deleteFile(mp4File);
        await deleteFile(m4aFile);
    }

    return resultFileName;
}

async function combineVideoAndAudio(filename, video, audio, key) {
    const combinedFileName = videoPath + filename + ".mkv";
    let args = ["-i", video, "-i", audio, "-c", "copy", combinedFileName];
    if (key != null) {
        args = [
            "-decryption_key",
            key,
            "-i",
            video,
            "-decryption_key",
            key,
            "-i",
            audio,
            "-c",
            "copy",
            combinedFileName,
        ];
    }
    return runCommand("ffmpeg", args, combinedFileName);
}

export { downloadFromID };
