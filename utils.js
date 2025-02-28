import { join, resolve } from "node:path";
import { promises } from "node:fs";
import { unlink } from "node:fs/promises";
import { spawn } from "node:child_process";

//unlink
function parseBoolean(str) {
  if (str === "true") return true;
  if (str === "false") return false;
  if (str === undefined) return str;
  // Handle cases where the string is neither 'true' nor 'false'
  throw new Error("Invalid boolean string");
}

function getVideoPath() {
  return resolve("./videos") + "/";
}

const fileExists = async (path) =>
  !!(await promises.stat(path).catch(() => false));

async function deleteFile(path) {
  // check if file exists
  if (await fileExists(path)) {
    try {
      await unlink(path.toString());
      console.log(`successfully deleted ${path}`);
    } catch (error) {
      console.error("there was an error:", error.message);
    }
  } else {
    console.warn(`file ${path} does not exist`);
  }
}

async function runCommand(command, args, result) {
  return new Promise((success, reject) => {
    const cmd = spawn(command, args);
    const stdout = cmd.stdout;
    let stdoutData = null;

    stdout.on("end", () => {
      console.log(`finished: ${command} ${args}`);
      success(result);
    });

    stdout.on("readable", () => {
      stdoutData = stdout.read();
      if (stdoutData != null) console.log(stdoutData + `\t [${result}]`);
    });

    cmd.stderr.on("error", (data) => {
      reject(data);
    });
  });
}

const sleep = (milliseconds) => {
  return new Promise((success) => setTimeout(success, milliseconds));
};

function getKeyPath(filename) {
  return join(getVideoPath(), "/keys/", filename + ".json");
}

export {
  deleteFile,
  fileExists,
  getKeyPath,
  getVideoPath,
  parseBoolean,
  runCommand,
  sleep,
};
