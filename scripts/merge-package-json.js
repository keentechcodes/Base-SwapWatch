#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Read both package.json files
const mainPkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const uiPkg = JSON.parse(fs.readFileSync('UI/package.json', 'utf8'));

// Merge dependencies
const mergedDependencies = {
  ...mainPkg.dependencies,
  ...uiPkg.dependencies
};

// Merge devDependencies (prefer versions from UI for React/Next.js related packages)
const mergedDevDependencies = {
  ...mainPkg.devDependencies,
  ...uiPkg.devDependencies
};

// Update scripts to include Next.js commands
const mergedScripts = {
  ...mainPkg.scripts,
  "dev": "concurrently \"npm run dev:worker\" \"npm run dev:pages\"",
  "dev:worker": "wrangler dev src/worker/index.ts",
  "dev:pages": "next dev --turbopack",
  "build": "npm run build:worker && npm run build:pages",
  "build:worker": "tsc --noEmit src/worker/index.ts",
  "build:pages": "@cloudflare/next-on-pages",
  "preview": "npm run build && wrangler pages dev",
  "deploy": "npm run deploy:worker && npm run deploy:pages",
  "deploy:worker": "wrangler deploy --env production",
  "deploy:pages": "npm run build:pages && wrangler pages deploy .vercel/output/static --project-name swapwatch",
  "test": "npm run test:worker && npm run test:frontend",
  "test:worker": "jest --config jest.config.js",
  "test:frontend": "jest --config jest.config.frontend.js",
  "test:edge": "jest --config jest.config.frontend.js --testMatch='**/*.edge.test.*'",
  "typecheck": "tsc --noEmit",
  "lint": "next lint"
};

// Create the merged package.json
const mergedPkg = {
  ...mainPkg,
  name: "swapwatch",
  description: "Real-time cryptocurrency swap monitoring platform on Cloudflare edge",
  scripts: mergedScripts,
  dependencies: mergedDependencies,
  devDependencies: {
    ...mergedDevDependencies,
    "concurrently": "^8.2.2"  // Add concurrently for running multiple scripts
  }
};

// Write the merged package.json
fs.writeFileSync('package.json', JSON.stringify(mergedPkg, null, 2));

console.log('✅ Successfully merged package.json files');
console.log('📦 Total dependencies:', Object.keys(mergedDependencies).length);
console.log('🔧 Total devDependencies:', Object.keys(mergedDevDependencies).length);