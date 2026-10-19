# Debugging Widevine Proxy Endpoint Changes

## Issue
NPO has updated their Widevine DRM proxy endpoint. The old endpoint:
```
https://npo-drm-gateway.samgcloud.nepworldwide.nl/authentication
```

Has been replaced with:
```
https://drm.npoplayer.nl/proxyEngine.aspx
```

## Running with Verbose Logging

To see detailed debugging information about the DRM key retrieval process, set the `NPO_DL_VERBOSE` or `DEBUG` environment variable:

### Linux/macOS:
```bash
export NPO_DL_VERBOSE=true
deno cli.js download <url>
```

Or:
```bash
DEBUG=true deno cli.js download <url>
```

### Windows (PowerShell):
```powershell
$env:NPO_DL_VERBOSE = "true"
deno cli.js download <url>
```

## What to Check

When running with verbose logging, look for:

1. **License Request Generation**
   - Verify the proxy URL is correct: `https://drm.npoplayer.nl/proxyEngine.aspx`
   - Check if a `session_id` is returned
   - Check the `challenge` size

2. **License Response**
   - HTTP status code (should be 200)
   - Response headers
   - Response size and format

3. **Key Decryption**
   - Whether keys are successfully extracted
   - Format of the response

## Common Issues

### Issue 1: Different Request Format
The new endpoint (`proxyEngine.aspx`) might expect:
- Different headers (e.g., `Content-Type: application/octet-stream` instead of `application/json`)
- Different request body format (binary vs base64)
- Different request structure

**Solution**: If you see a 400 or 415 error, the request format likely needs adjustment.

### Issue 2: Different Response Format
The endpoint might return:
- XML instead of JSON
- A wrapped response (e.g., inside a JSON object)
- Different field names

**Solution**: Check the response structure in verbose output.

### Issue 3: Additional Headers Required
The new endpoint might require:
- Authorization headers
- User-Agent headers
- Origin/Referer headers
- Custom NPO headers

**Solution**: Add required headers in the request config.

## Testing the Endpoint Directly

Create a test file `test-widevine.js`:

```javascript
import axios from "axios";

const WidevineProxyUrl = "https://drm.npoplayer.nl/proxyEngine.aspx";
const licenseChallenge = Buffer.from("your_base64_challenge_here", "base64");

const headers = {
  "X-API-Key": process.env.GETWVKEYS_API_KEY,
  "Content-Type": "application/octet-stream", // Try different content types
};

const config = {
  method: "post",
  url: WidevineProxyUrl,
  headers: headers,
  data: licenseChallenge,
  responseType: "arraybuffer",
  validateStatus: false,
};

const response = await axios(config);
console.log("Status:", response.status);
console.log("Headers:", response.headers);
console.log("Data (first 200 chars):", response.data.toString().substring(0, 200));
```

Run with:
```bash
deno run -A test-widevine.js
```

## Next Steps if Still Failing

1. **Check NPO's page source** for any hints about the new endpoint or DRM configuration
2. **Monitor network requests** in browser DevTools when playing a video on npo.nl/start
3. **Check for getwvkeys.cc updates** - the underlying service might need updates too
4. **Try alternative Widevine proxy services** if the endpoint changes again

## Files Modified

- `npo-dl.js`: Updated WidevineProxyUrl and added verbose logging
- `getwvkeys.js`: Enhanced with detailed logging for debugging

## Reverting Changes

If you need to revert to debugging the old endpoint:
```javascript
const WidevineProxyUrl = "https://npo-drm-gateway.samgcloud.nepworldwide.nl/authentication";
```

## Additional Resources

- [Widevine DRM Overview](https://developers.google.com/widevine/drm)
- [yt-dlp Widevine Information](https://github.com/yt-dlp/yt-dlp/wiki/Extractors#widevine)
