FROM ghcr.io/puppeteer/puppeteer:latest

USER root
RUN apt-get update && apt-get install -y ffmpeg yt-dlp

USER pptruser
COPY package.json ./
RUN npm install

COPY *.js ./

ENTRYPOINT [ "node", "api.js"]