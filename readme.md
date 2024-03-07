# folder structure
this folder is not the root of the project, the root of the project is the parent folder of this folder. the following is the folder structure of the project

```text
npo/ # root of the project
├─ npo-dl/ # this repo
│  ├─ getwvkeys.js # this is the file that gets the keys from the website
│  ├─ index.js # this is the main file
│  ├─ readme.md # this is the file you are reading
├─ videos/ # this is where the videos will be downloaded to make sure this folder exists and contains the following subfolders
│  ├─ keys/ # this is where the keys will be stored
├─ mp4decrypt.exe # this is the mp4decrypt executable
├─ yt-dlp.exe # this is the yt-dlp executable
```
## the following files should be downloaded and placed in the root of the project

- [mp4decrypt.exe](https://www.bento4.com/documentation/mp4decrypt/)
- [yt-dlp.exe](https://github.com/yt-dlp/yt-dlp)

## the following environment variables are required

- AUTH_KEY: this is a key from the website [getwvkeys](https://getwvkeys.cc) this is used for decrypting the video stream
- NPO_EMAIL: this is the email address used to login to the npo website
- NPO_PASSW: this is the password used to login to the npo website
