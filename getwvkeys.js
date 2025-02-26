import axios from 'axios';

class getWvKeys {
    constructor(pssh, licenseUrl, authKey, x_custom_data, apiUrl = "https://getwvkeys.cc/pywidevine", buildInfo = "", force = false, verbose = false) {
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
            "license_url": this.licenseUrl
        };
        this.headers = { "X-API-Key": this.authKey, "Content-Type": "application/json" };
        this.headers["x-custom-data"] = x_custom_data;
        this.verbose = verbose;
    }

    async generate_request() {
        const config = {
            method: 'post',
            url: this.apiUrl,
            headers: this.headers,
            data: this.data,
            validateStatus: false
        };

        const licenseResponse = await axios(config);
        //get json from response
        const licenseData = licenseResponse.data;

        const responseHeaders = licenseResponse.headers;
        if (this.verbose)
            log("headers: " + JSON.stringify(responseHeaders));

        if ("x-cache" in responseHeaders) {
            return { "cache": true, "keys": licenseData["keys"] };
        }

        this.data["session_id"] = licenseData["session_id"];
        let challenge = licenseData["challenge"];

        if (this.verbose) {
            log("License Request Generated\n", challenge);
            log("Session ID:", this.data["session_id"]);
        }

        //turn challenge into byte array it's encoded in base64
        challenge = Buffer.from(challenge, 'base64');

        return { "cache": false, "challenge": challenge };
    }

    async post_request(challenge) {
        const config = {
            method: 'post',
            url: this.licenseUrl,
            headers: this.headers,
            data: challenge,
            responseType: 'arraybuffer'
        };

        let licenseResponse = await axios(config);
        // check if response is ok
        if (licenseResponse.status !== 200) {
            log("License Request Failed" + licenseResponse.data.toString(), true);
            return;
        }

        // encode license response in base64
        licenseResponse = Buffer.from(licenseResponse.data, 'binary').toString('base64');

        if (this.verbose)
            log("License Response Generated\n" + licenseResponse);

        return licenseResponse;
    }

    async decrypter(license_response) {
        this.data["response"] = license_response;
        const header = { "X-API-Key": this.authKey, "Content-Type": "application/json" };

        let config = {
            method: 'post',
            url: this.apiUrl,
            headers: header,
            data: this.data
        };

        let decrypterResponse = await axios(config);

        // check if response is ok
        if (decrypterResponse.status !== 200) {
            log("License Request Failed" + decrypterResponse.data.toString(), true);
            return;
        }


        log("License Response Generated\n" + decrypterResponse.data.toString());

        return decrypterResponse.data;
    }

    async getWvKeys() {
        let licenseData = await this.generate_request();

        if (licenseData["cache"] === true)
            return licenseData["keys"][0]['key'];

        let license_response = await this.post_request(licenseData["challenge"]);
        let decrypt_response = await this.decrypter(license_response);

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