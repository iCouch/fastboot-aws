"use strict";

const S3Downloader = require("fastboot-s3-downloader");
const S3Notifier = require("fastboot-s3-notifier");
const RedisCache = require("fastboot-redis-cache");
const FastBootAppServer = require("fastboot-app-server");

const S3_BUCKET = process.env.FASTBOOT_S3_BUCKET;
const S3_KEY = process.env.FASTBOOT_S3_KEY;
const REDIS_HOST = process.env.FASTBOOT_REDIS_HOST;
const REDIS_PORT = process.env.FASTBOOT_REDIS_PORT;
const REDIS_EXPIRY = process.env.FASTBOOT_REDIS_EXPIRY;
const USERNAME = process.env.FASTBOOT_USERNAME;
const PASSWORD = process.env.FASTBOOT_PASSWORD;

let downloader = new S3Downloader({
  bucket: S3_BUCKET,
  key: S3_KEY
});

let notifier = new S3Notifier({
  bucket: S3_BUCKET,
  key: S3_KEY
});

const enforceHTTPS = function(req, res, next) {
  // Header indicates edge server received request over HTTPS
  if (req.headers["x-forwarded-proto"] === "https") {
    return next();
  } else {
    // Did not come over HTTPS. Fix that!
    return res.redirect(301, `https://${req.hostname}${req.url}`);
  }
};
let cache;
if (REDIS_HOST || REDIS_PORT) {
  cache = new RedisCache({
    host: REDIS_HOST,
    port: REDIS_PORT,
    expiration: REDIS_EXPIRY
  });
} else {
  console.log("No FASTBOOT_REDIS_HOST or FASTBOOT_REDIS_PORT provided; caching is disabled.");
}

let server = new FastBootAppServer({
  downloader: downloader,
  notifier: notifier,
  cache: cache,
  username: USERNAME,
  password: PASSWORD,
  gzip: true,
  beforeMiddleware(app) {
    app.use((req, res, next) => {
      if (
        process.env.DISABLE_FORCE_HTTPS || // Ability to disable force HTTPS via env
        req.headers["user-agent"].indexOf("HealthChecker") >= 0
      ) {
        // EBS health over HTTP
        return next(); // Proceed as planned (http or https -- whatever was asked for)
      } else {
        return enforceHTTPS(req, res, next); // Middleware to force all other HTTP --> HTTPS
      }
    });
  }
});

server.start();
