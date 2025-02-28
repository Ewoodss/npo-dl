FROM ghcr.io/puppeteer/puppeteer:latest

USER root
RUN apt-get update && apt-get install -y ffmpeg yt-dlp

USER pptruser
COPY package.json ./
RUN npm install

COPY getwvkeys.js ./
COPY index.js ./

ENV URL="provide a url using the -e flag or the .env file"

ENTRYPOINT [ "node", "api.js", "$URL" ]