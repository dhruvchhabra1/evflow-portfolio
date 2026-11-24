// Runs on Cloudflare Pages at every deploy: stamps the commit + version onto the site.
const fs = require('fs'); const p = require('./package.json');
const sha = process.env.CF_PAGES_COMMIT_SHA || 'local';
fs.writeFileSync('public/version.json', JSON.stringify({
  version: p.version, commit: sha.slice(0, 7), fullCommit: sha,
  branch: process.env.CF_PAGES_BRANCH || 'local', built: new Date().toISOString() }));
console.log('version.json written for', sha.slice(0, 7));
