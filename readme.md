# Downloading from npo start

this project makes it possible to download from npo start

## the following files should be downloaded and added to your path

- [ffmpeg](https://ffmpeg.org/download.html) version 6.0 and 7.0 are tested
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) version 2023.03.04 and 2024.03.10
  are tested

other versions might work but are not tested

## Setting up the environment

### for windows users

```powershell
winget install ffmpeg
winget install yt-dlp
```

### for debian/ubuntu users

```bash
sudo apt install ffmpeg
sudo apt install yt-dlp
```

### for macos

```bash
brew install ffmpeg
brew install yt-dlp
```

### installing dependencies

make sure too run the following commands in the root of the project

```bash
npm install
```

## the following environment variables are required

- GETWVKEYS_API_KEY: this is a api key from the website
  [getwvkeys](https://getwvkeys.cc) this is used for decrypting the video stream
- NPO_EMAIL: this is the email address used to login to the npo website
- NPO_PASSW: this is the password used to login to the npo website

## running the project

```bash
node cli.js download <url>
```
