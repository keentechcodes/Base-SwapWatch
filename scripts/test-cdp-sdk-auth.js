#!/usr/bin/env node

/**
 * Test CDP API using the official SDK authentication
 */

const https = require('https');

// Your CDP API credentials
const API_KEY_ID = 'b8f29fe0-67f5-4b3f-87dd-21b8e23f6d83';
const API_SECRET = 'bYKZ1lVdgGhFwjMnscmywNdMASr8Us0Gb47DvRwy5FwZDBWY0A26n6pghc4bPRaJvgwZVgv7LdZ27ybaDnvFSA==';

/**
 * Try using the SDK auth if available
 */
async function testWithSDK() {
  try {
    const { getAuthHeaders } = require('@coinbase/cdp-sdk/auth');
    
    console.log('Using CDP SDK auth helper...\n');
    
    const headers = await getAuthHeaders({
      apiKeyId: API_KEY_ID,
      apiKeySecret: API_SECRET,
      requestMethod: 'GET',
      requestHost: 'api.cdp.coinbase.com',
      requestPath: '/platform/v1/webhooks',
      expiresIn: 120
    });
    
    console.log('Generated headers:', headers);
    
    // Make request with generated headers
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.cdp.coinbase.com',
        port: 443,
        path: '/platform/v1/webhooks',
        method: 'GET',
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        }
      };

      const req = https.request(options, (res) => {
        let responseData = '';
        
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        
        res.on('end', () => {
          console.log('\nStatus:', res.statusCode);
          console.log('Response:', responseData);
          
          if (res.statusCode === 200) {
            try {
              const data = JSON.parse(responseData);
              console.log('\n✅ Success! Found webhooks:', JSON.stringify(data, null, 2));
            } catch (e) {
              console.log('Response body:', responseData);
            }
          }
          
          resolve({ status: res.statusCode, data: responseData });
        });
      });

      req.on('error', (e) => {
        reject(e);
      });

      req.end();
    });
  } catch (error) {
    console.error('Error with SDK auth:', error.message);
    throw error;
  }
}

/**
 * Alternative: Try direct API key in different header formats
 */
async function testDirectAPIKey() {
  console.log('\nTrying direct API key authentication...\n');
  
  const tests = [
    {
      name: 'CDP-API-KEY header',
      headers: {
        'CDP-API-KEY': API_KEY_ID,
        'CDP-API-SECRET': API_SECRET
      }
    },
    {
      name: 'X-CDP-API-KEY header',
      headers: {
        'X-CDP-API-KEY': API_KEY_ID,
        'X-CDP-API-SECRET': API_SECRET
      }
    },
    {
      name: 'API-Key header',
      headers: {
        'API-Key': API_KEY_ID,
        'API-Secret': API_SECRET
      }
    },
    {
      name: 'Combined Authorization',
      headers: {
        'Authorization': `ApiKey ${API_KEY_ID}:${API_SECRET}`
      }
    }
  ];
  
  for (const test of tests) {
    console.log(`Testing ${test.name}...`);
    
    await new Promise((resolve) => {
      const options = {
        hostname: 'api.cdp.coinbase.com',
        port: 443,
        path: '/platform/v1/webhooks',
        method: 'GET',
        headers: {
          ...test.headers,
          'Content-Type': 'application/json'
        }
      };

      const req = https.request(options, (res) => {
        let responseData = '';
        
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        
        res.on('end', () => {
          console.log(`  Status: ${res.statusCode}`);
          if (res.statusCode === 200) {
            console.log(`  ✅ SUCCESS with ${test.name}!`);
            console.log(`  Response:`, responseData);
          }
          console.log('');
          resolve();
        });
      });

      req.on('error', (e) => {
        console.error(`  Error: ${e.message}`);
        resolve();
      });

      req.end();
    });
  }
}

async function main() {
  console.log('🔐 CDP API Authentication Testing\n');
  console.log('API Key ID:', API_KEY_ID);
  console.log('API Secret:', API_SECRET.substring(0, 20) + '...');
  console.log('-----------------------------------\n');
  
  try {
    // First try with SDK
    await testWithSDK();
  } catch (error) {
    console.error('SDK auth failed:', error.message);
    
    // Fallback to direct API key tests
    await testDirectAPIKey();
  }
}

main().catch(console.error);