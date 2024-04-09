# folder structure
this folder is not the root of the project, the root of the project is the parent folder of this folder. the following is the folder structure of the project



## the following files should be downloaded and added to your path

- [ffmpeg](https://ffmpeg.org/download.html) version 6.0 and 7.0 are tested
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) version 2023.03.04 and 2024.03.10 are tested

other versions might work but are not tested

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


## the following environment variables are required

- AUTH_KEY: this is a key from the website [getwvkeys](https://getwvkeys.cc) this is used for decrypting the video stream
- NPO_EMAIL: this is the email address used to login to the npo website
- NPO_PASSW: this is the password used to login to the npo website
