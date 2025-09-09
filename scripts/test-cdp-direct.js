#!/usr/bin/env node

/**
 * Test CDP API directly using the API key
 * CDP API uses a different authentication mechanism
 */

const https = require('https');

// Your CDP API credentials
const API_KEY_ID = 'b8f29fe0-67f5-4b3f-87dd-21b8e23f6d83';
const API_SECRET = 'bYKZ1lVdgGhFwjMnscmywNdMASr8Us0Gb47DvRwy5FwZDBWY0A26n6pghc4bPRaJvgwZVgv7LdZ27ybaDnvFSA==';

/**
 * Make request with API key authentication
 * CDP might use API key directly in header
 */
function makeRequest(method, path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.cdp.coinbase.com',
      port: 443,
      path: path,
      method: method,
      headers: {
        'X-API-KEY': API_KEY_ID,
        'X-API-SECRET': API_SECRET,
        'Content-Type': 'application/json'
      }
    };

    console.log('Testing with headers:');
    console.log('  X-API-KEY:', API_KEY_ID);
    console.log('  X-API-SECRET:', API_SECRET.substring(0, 20) + '...');
    console.log('');

    const req = https.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        console.log('Status:', res.statusCode);
        console.log('Headers:', res.headers);
        console.log('Response:', responseData);
        resolve({ status: res.statusCode, data: responseData });
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    req.end();
  });
}

/**
 * Test basic auth with API key and secret
 */
function makeRequestBasicAuth(method, path) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${API_KEY_ID}:${API_SECRET}`).toString('base64');
    
    const options = {
      hostname: 'api.cdp.coinbase.com',
      port: 443,
      path: path,
      method: method,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      }
    };

    console.log('Testing with Basic Auth...');
    console.log('');

    const req = https.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        console.log('Status:', res.statusCode);
        console.log('Response:', responseData);
        resolve({ status: res.statusCode, data: responseData });
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    req.end();
  });
}

/**
 * Test API key as Bearer token directly
 */
function makeRequestBearer(method, path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.cdp.coinbase.com',
      port: 443,
      path: path,
      method: method,
      headers: {
        'Authorization': `Bearer ${API_SECRET}`,
        'Content-Type': 'application/json'
      }
    };

    console.log('Testing with Bearer token (API secret)...');
    console.log('');

    const req = https.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        console.log('Status:', res.statusCode);
        console.log('Response:', responseData);
        resolve({ status: res.statusCode, data: responseData });
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    req.end();
  });
}

async function main() {
  console.log('🔐 Testing CDP API Authentication Methods\n');
  console.log('API Key ID:', API_KEY_ID);
  console.log('-----------------------------------\n');
  
  console.log('1. Testing with X-API-KEY headers...\n');
  try {
    await makeRequest('GET', '/platform/v1/webhooks');
  } catch (error) {
    console.error('Error:', error.message);
  }
  
  console.log('\n-----------------------------------\n');
  console.log('2. Testing with Basic Auth...\n');
  try {
    await makeRequestBasicAuth('GET', '/platform/v1/webhooks');
  } catch (error) {
    console.error('Error:', error.message);
  }
  
  console.log('\n-----------------------------------\n');
  console.log('3. Testing with Bearer token...\n');
  try {
    await makeRequestBearer('GET', '/platform/v1/webhooks');
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main().catch(console.error);