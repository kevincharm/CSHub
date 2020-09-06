/* eslint-disable */
const sha = require("sha.js");

const API_BASE = `${process.env.VUE_APP_API_URL ||
  (window as any).appConfig.VUE_APP_API_URL}`;

// 99.9999999% !!!!
const MIRROR_BASE_URL = "https://cshub.spicyme.me";

// List of routes to intercept
const proxiedUrls: string[] = [
  new URL("verifytoken", API_BASE).href,
  new URL("study", API_BASE).href,
  new URL("topics", API_BASE).href,
  new URL("posts", API_BASE).href,
  new URL("post", API_BASE).href,
];

(function(xhr) {
  const _open = xhr.open;
  xhr.open = function(method: string, url: string) {
    if (proxiedUrls.some((proxiedUrl) => url.includes(proxiedUrl))) {
      this.withCredentials = false; // CORS

      const oldUrl = url;
      const key = sha("sha256")
        .update(url)
        .digest("hex");

      url = new URL(key, MIRROR_BASE_URL).href;
      console.log(`${oldUrl} -> ${url}`);
    }

    _open.bind(this)(method, url);
  };
})(XMLHttpRequest.prototype);
