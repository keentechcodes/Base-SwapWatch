#!/usr/bin/env node

/**
 * Script to test CDP webhook API endpoints
 * Generates JWT token and lists current webhooks
 */

const crypto = require('crypto');
const https = require('https');

// Your CDP API credentials
const API_KEY_ID = 'b8f29fe0-67f5-4b3f-87dd-21b8e23f6d83';
const API_SECRET = 'bYKZ1lVdgGhFwjMnscmywNdMASr8Us0Gb47DvRwy5FwZDBWY0A26n6pghc4bPRaJvgwZVgv7LdZ27ybaDnvFSA==';

/**
 * Generate JWT token for CDP API authentication
 */
function generateJWT() {
  const now = Math.floor(Date.now() / 1000);
  
  // Try different JWT configurations based on CDP documentation
  // CDP may use different claims structure
  
  // JWT header
  const header = {
    alg: 'HS256',
    typ: 'JWT',
    kid: API_KEY_ID
  };

  // JWT payload - adjusted based on CDP docs
  const payload = {
    iss: 'cdp',
    sub: API_KEY_ID,
    nbf: now,
    exp: now + 120, // 2 minutes as per CDP docs
    iat: now
  };

  // Encode header and payload
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  
  // Create signature
  const signatureBase = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .createHmac('sha256', Buffer.from(API_SECRET, 'base64'))
    .update(signatureBase)
    .digest('base64url');

  // Return complete JWT
  return `${signatureBase}.${signature}`;
}

/**
 * Make HTTPS request to CDP API
 */
function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const jwt = generateJWT();
    
    const options = {
      hostname: 'api.cdp.coinbase.com',
      port: 443,
      path: path,
      method: method,
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ status: res.statusCode, data: parsed });
          } else {
            reject({ status: res.statusCode, error: parsed });
          }
        } catch (e) {
          resolve({ status: res.statusCode, data: responseData });
        }
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

/**
 * List all webhooks
 */
async function listWebhooks() {
  console.log('🔍 Listing CDP webhooks...\n');
  
  try {
    const response = await makeRequest('GET', '/platform/v1/webhooks');
    
    console.log(`Status: ${response.status}`);
    console.log('Response:', JSON.stringify(response.data, null, 2));
    
    if (response.data.data && Array.isArray(response.data.data)) {
      console.log(`\n📋 Found ${response.data.data.length} webhook(s):\n`);
      
      response.data.data.forEach((webhook, index) => {
        console.log(`Webhook ${index + 1}:`);
        console.log(`  ID: ${webhook.id}`);
        console.log(`  Network: ${webhook.network_id}`);
        console.log(`  Event Type: ${webhook.event_type}`);
        console.log(`  Notification URI: ${webhook.notification_uri}`);
        console.log(`  Status: ${webhook.status}`);
        console.log(`  Created: ${webhook.created_at}`);
        
        if (webhook.event_type_filter?.addresses?.length > 0) {
          console.log(`  Monitored Addresses: ${webhook.event_type_filter.addresses.join(', ')}`);
        }
        
        if (webhook.event_filters?.length > 0) {
          console.log(`  Event Filters:`);
          webhook.event_filters.forEach(filter => {
            if (filter.contract_address) console.log(`    - Contract: ${filter.contract_address}`);
            if (filter.from_address) console.log(`    - From: ${filter.from_address}`);
            if (filter.to_address) console.log(`    - To: ${filter.to_address}`);
          });
        }
        
        console.log('');
      });
    } else if (response.data.data && response.data.data.length === 0) {
      console.log('No webhooks found. You can create one using the create-webhook command.\n');
    }
    
    return response.data;
  } catch (error) {
    console.error('❌ Error listing webhooks:', error);
    if (error.error) {
      console.error('API Error:', JSON.stringify(error.error, null, 2));
    }
    throw error;
  }
}

/**
 * Create a test webhook
 */
async function createWebhook(notificationUri) {
  console.log('🔨 Creating CDP webhook...\n');
  
  const webhookData = {
    network_id: 'base-mainnet',
    event_type: 'erc20_transfer',
    notification_uri: notificationUri,
    signature_header: 'x-webhook-signature'
  };
  
  try {
    const response = await makeRequest('POST', '/platform/v1/webhooks', webhookData);
    
    console.log(`✅ Webhook created successfully!`);
    console.log(`Status: ${response.status}`);
    console.log('Response:', JSON.stringify(response.data, null, 2));
    
    return response.data;
  } catch (error) {
    console.error('❌ Error creating webhook:', error);
    if (error.error) {
      console.error('API Error:', JSON.stringify(error.error, null, 2));
    }
    throw error;
  }
}

/**
 * Delete a webhook
 */
async function deleteWebhook(webhookId) {
  console.log(`🗑️  Deleting webhook ${webhookId}...\n`);
  
  try {
    const response = await makeRequest('DELETE', `/platform/v1/webhooks/${webhookId}`);
    
    console.log(`✅ Webhook deleted successfully!`);
    console.log(`Status: ${response.status}`);
    
    return response;
  } catch (error) {
    console.error('❌ Error deleting webhook:', error);
    if (error.error) {
      console.error('API Error:', JSON.stringify(error.error, null, 2));
    }
    throw error;
  }
}

/**
 * Main execution
 */
async function main() {
  const command = process.argv[2];
  
  console.log('🔐 CDP Webhook Management Tool\n');
  console.log(`API Key ID: ${API_KEY_ID}`);
  console.log('-----------------------------------\n');
  
  try {
    switch (command) {
      case 'list':
        await listWebhooks();
        break;
        
      case 'create':
        const uri = process.argv[3];
        if (!uri) {
          console.error('Please provide a notification URI: node test-cdp-webhooks.js create <uri>');
          process.exit(1);
        }
        await createWebhook(uri);
        break;
        
      case 'delete':
        const id = process.argv[3];
        if (!id) {
          console.error('Please provide a webhook ID: node test-cdp-webhooks.js delete <webhook-id>');
          process.exit(1);
        }
        await deleteWebhook(id);
        break;
        
      case 'jwt':
        const token = generateJWT();
        console.log('Generated JWT Token (valid for 5 minutes):\n');
        console.log(token);
        console.log('\n\nYou can use this with curl:');
        console.log(`curl -H "Authorization: Bearer ${token}" https://api.cdp.coinbase.com/platform/v1/webhooks`);
        break;
        
      default:
        console.log('Available commands:');
        console.log('  node test-cdp-webhooks.js list                    - List all webhooks');
        console.log('  node test-cdp-webhooks.js create <uri>            - Create a webhook');
        console.log('  node test-cdp-webhooks.js delete <webhook-id>     - Delete a webhook');
        console.log('  node test-cdp-webhooks.js jwt                     - Generate JWT token for manual testing');
        break;
    }
  } catch (error) {
    console.error('\n❌ Operation failed');
    process.exit(1);
  }
}

// Run the script
main().catch(console.error);