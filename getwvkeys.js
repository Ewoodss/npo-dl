import axios from "axios";
import { Buffer } from "node:buffer";

class getWvKeys {
  constructor(
    pssh,
    licenseUrl,
    authKey,
    x_custom_data,
    apiUrl = "https://getwvkeys.cc/pywidevine",
    buildInfo = "",
    force = false,
  ) {
    this.pssh = pssh;
    this.licenseUrl = licenseUrl;
    this.authKey = authKey;
    this.apiUrl = apiUrl;
    this.buildInfo = buildInfo;
    this.force = force;
    this.data = {
      "pssh": this.pssh,
      "buildInfo": this.buildInfo,
      "force": this.force,
      "license_url": this.licenseUrl,
    };
    this.headers = {
      "X-API-Key": this.authKey,
      "Content-Type": "application/json",
    };
    this.headers["x-custom-data"] = x_custom_data;
  }

  async generate_request() {
    const config = {
      method: "post",
      url: this.apiUrl,
      headers: this.headers,
      data: this.data,
      validateStatus: false,
    };

    const licenseResponse = await axios(config);
    //get json from response
    const licenseData = licenseResponse.data;

    const responseHeaders = licenseResponse.headers;
    if ("x-cache" in responseHeaders) {
      return { "cache": true, "keys": licenseData["keys"] };
    }

    if (!licenseData["session_id"]) {
      log("Error: No session_id in response", true);
      return { "cache": false, "challenge": null, "error": "No session_id" };
    }

    this.data["session_id"] = licenseData["session_id"];
    let challenge = licenseData["challenge"];

    //turn challenge into byte array it's encoded in base64
    challenge = Buffer.from(challenge, "base64");

    return { "cache": false, "challenge": challenge };
  }

  async post_request(challenge) {
    const config = {
      method: "post",
      url: this.licenseUrl,
      headers: this.headers,
      data: challenge,
      responseType: "arraybuffer",
      validateStatus: false,
    };

    let licenseResponse = await axios(config);

    if (licenseResponse.status !== 200) {
      log("License Request Failed - Status: " + licenseResponse.status, true);
      if (licenseResponse.data) {
        const responseText = licenseResponse.data.toString().substring(0, 500);
        log("Response: " + responseText, true);
      }
      return;
    }

    licenseResponse = Buffer.from(licenseResponse.data, "binary").toString("base64");
    return licenseResponse;
  }

  async decrypter(license_response) {
    this.data["response"] = license_response;
    const header = {
      "X-API-Key": this.authKey,
      "Content-Type": "application/json",
    };

    const config = {
      method: "post",
      url: this.apiUrl,
      headers: header,
      data: this.data,
    };

    const decrypterResponse = await axios(config);

    // check if response is ok
    if (decrypterResponse.status !== 200) {
      log("License Request Failed", true);
      return;
    }

    return decrypterResponse.data;
  }

  async getWvKeys() {
    const licenseData = await this.generate_request();

    if (licenseData["cache"] === true) {
      return licenseData["keys"][0]["key"];
    }

    const license_response = await this.post_request(licenseData["challenge"]);
    const decrypt_response = await this.decrypter(license_response);

    return decrypt_response["keys"][0]["key"];
  }
}

export default getWvKeys;

function log(msg, error = false) {
  if (error) {
    console.error("[-]\t" + msg);
    return;
  }

  console.log("[+]\t" + msg);
}
