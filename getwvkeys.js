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
    verbose = false,
  ) {
    this.pssh = pssh;
    this.licenseUrl = licenseUrl;
    this.authKey = authKey;
    this.apiUrl = apiUrl;
    this.buildInfo = buildInfo;
    this.force = force;
    this.x_custom_data = x_custom_data; // Store for use in post_request
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
    this.verbose = verbose;
  }

  async generate_request() {
    const config = {
      method: "post",
      url: this.apiUrl,
      headers: this.headers,
      data: this.data,
      validateStatus: false,
    };

    if (this.verbose) {
      log("Generating license request...");
      log("API URL: " + this.apiUrl);
      log("License URL (proxy): " + this.licenseUrl);
      log("PSSH: " + this.pssh.substring(0, 50) + "...");
    }

    const licenseResponse = await axios(config);
    //get json from response
    const licenseData = licenseResponse.data;

    const responseHeaders = licenseResponse.headers;
    if (this.verbose) {
      log("Generate request response status: " + licenseResponse.status);
      log("Response headers: " + JSON.stringify(responseHeaders));
      log("Response data keys: " + (typeof licenseData === 'object' ? Object.keys(licenseData).join(', ') : 'not an object'));
    }

    if ("x-cache" in responseHeaders) {
      if (this.verbose) {
        log("Cache hit! Using cached keys");
      }
      return { "cache": true, "keys": licenseData["keys"] };
    }

    if (!licenseData["session_id"]) {
      log("Error: No session_id in response", true);
      log("Response: " + JSON.stringify(licenseData).substring(0, 500), true);
      return { "cache": false, "challenge": null, "error": "No session_id" };
    }

    this.data["session_id"] = licenseData["session_id"];
    let challenge = licenseData["challenge"];

    if (this.verbose) {
      log("License Request Generated");
      log("Session ID: " + this.data["session_id"]);
      log("Challenge size: " + (challenge ? Buffer.from(challenge, "base64").length : 0) + " bytes");
    }

    //turn challenge into byte array it's encoded in base64
    challenge = Buffer.from(challenge, "base64");

    return { "cache": false, "challenge": challenge };
  }

  async post_request(challenge) {
    let url = this.licenseUrl;
    let headers = { ...this.headers };

    // Check if x_custom_data contains auth/sig parameters (new endpoint format)
    let authParams = null;
    try {
      if (this.x_custom_data && typeof this.x_custom_data === 'string' && this.x_custom_data.startsWith("{")) {
        const parsed = JSON.parse(this.x_custom_data);
        if (parsed.auth && parsed.sig) {
          authParams = parsed;
          // Add auth and sig as query parameters for the new endpoint
          const separator = url.includes("?") ? "&" : "?";
          url = url + separator + "auth=" + encodeURIComponent(parsed.auth) + "&sig=" + encodeURIComponent(parsed.sig);
          if (this.verbose) {
            log("Using new endpoint with auth/sig query parameters");
          }
        }
      }
    } catch (e) {
      // Not JSON, treat as legacy drmToken
      if (this.verbose) {
        log("x_custom_data is not auth/sig JSON, treating as legacy drmToken");
      }
    }

    const config = {
      method: "post",
      url: url,
      headers: headers,
      data: challenge,
      responseType: "arraybuffer",
      validateStatus: false, // Don't throw on any status code
    };

    if (this.verbose) {
      log("Posting challenge to: " + url);
      log("Challenge size: " + challenge.length + " bytes");
      log("Request headers: " + JSON.stringify(headers));
      if (authParams) {
        log("Auth params present: auth + sig");
      }
    }

    let licenseResponse = await axios(config);

    if (this.verbose) {
      log("Response Status: " + licenseResponse.status);
      log("Response Headers: " + JSON.stringify(licenseResponse.headers));
      log("Response Size: " + (licenseResponse.data ? licenseResponse.data.length : 0) + " bytes");
    }

    // check if response is ok
    if (licenseResponse.status !== 200) {
      log("License Request Failed - Status: " + licenseResponse.status, true);
      if (licenseResponse.data) {
        const responseText = licenseResponse.data.toString().substring(0, 500);
        log("Response: " + responseText, true);
      }
      return;
    }

    // encode license response in base64
    licenseResponse = Buffer.from(licenseResponse.data, "binary").toString(
      "base64",
    );

    if (this.verbose) {
      log("License Response Generated (base64 length: " + licenseResponse.length + ")");
    }

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
      log("License Request Failed" + decrypterResponse.data.toString(), true);
      return;
    }

    log("License Response Generated\n" + decrypterResponse.data.toString());

    return decrypterResponse.data;
  }

  async getWvKeys() {
    const licenseData = await this.generate_request();

    if (licenseData["cache"] === true) {
      return licenseData["keys"][0]["key"];
    }

    const license_response = await this.post_request(licenseData["challenge"]);
    const decrypt_response = await this.decrypter(license_response);

    return decrypt_response["keys"][0];
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
