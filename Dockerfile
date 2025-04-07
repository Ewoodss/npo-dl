FROM denoland/deno:latest

RUN apt-get update && apt-get install -y ffmpeg yt-dlp

WORKDIR /app
COPY package.json ./
COPY deno.lock ./
COPY *.js ./
RUN deno install

RUN deno compile -A cli.js

CMD ["./npo-dl"]