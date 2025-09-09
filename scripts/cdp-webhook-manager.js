#!/usr/bin/env node

/**
 * CDP Webhook Manager - User-friendly CLI for managing CDP webhooks
 * 
 * Usage:
 *   node cdp-webhook-manager.js list
 *   node cdp-webhook-manager.js create --url <notification-url> --event <event-type>
 *   node cdp-webhook-manager.js update <webhook-id> --addresses <address1,address2>
 *   node cdp-webhook-manager.js delete <webhook-id>
 *   node cdp-webhook-manager.js monitor <webhook-id> --add <addresses> --remove <addresses>
 */

const https = require('https');
const readline = require('readline');
const fs = require('fs').promises;
const path = require('path');

// Try to load credentials from environment or .env file
let API_KEY_ID = process.env.CDP_API_KEY_ID || 'b8f29fe0-67f5-4b3f-87dd-21b8e23f6d83';
let API_SECRET = process.env.CDP_API_KEY_SECRET || 'bYKZ1lVdgGhFwjMnscmywNdMASr8Us0Gb47DvRwy5FwZDBWY0A26n6pghc4bPRaJvgwZVgv7LdZ27ybaDnvFSA==';

// Available event types in CDP
const EVENT_TYPES = {
  'wallet_activity': 'All wallet activity including transfers',
  'erc20_transfer': 'ERC20 token transfers',
  'erc721_transfer': 'NFT transfers (ERC721)',
  'erc1155_transfer': 'Multi-token transfers (ERC1155)',
  'smart_contract_event': 'Smart contract events',
  'transaction': 'All transactions'
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  red: '\x1b[31m',
  gray: '\x1b[90m'
};

/**
 * Generate authentication headers using CDP SDK
 */
async function getAuthHeaders(method, path, body = null) {
  try {
    const { getAuthHeaders } = require('@coinbase/cdp-sdk/auth');
    
    const config = {
      apiKeyId: API_KEY_ID,
      apiKeySecret: API_SECRET,
      requestMethod: method,
      requestHost: 'api.cdp.coinbase.com',
      requestPath: path,
      expiresIn: 120
    };
    
    if (body) {
      config.requestBody = body;
    }
    
    return await getAuthHeaders(config);
  } catch (error) {
    console.error(`${colors.red}Error generating auth headers:${colors.reset}`, error.message);
    throw error;
  }
}

/**
 * Make authenticated API request
 */
async function makeRequest(method, path, body = null) {
  const headers = await getAuthHeaders(method, path, body);
  
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.cdp.coinbase.com',
      port: 443,
      path: path,
      method: method,
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
        try {
          const parsed = res.statusCode === 204 ? {} : JSON.parse(responseData);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ status: res.statusCode, data: parsed });
          } else {
            reject({ status: res.statusCode, error: parsed });
          }
        } catch (e) {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ status: res.statusCode, data: responseData });
          } else {
            reject({ status: res.statusCode, error: responseData });
          }
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

/**
 * List all webhooks
 */
async function listWebhooks(detailed = false) {
  console.log(`\n${colors.blue}📋 Fetching webhooks...${colors.reset}\n`);
  
  try {
    const response = await makeRequest('GET', '/platform/v1/webhooks');
    const webhooks = response.data.data || [];
    
    if (webhooks.length === 0) {
      console.log(`${colors.yellow}No webhooks found.${colors.reset}`);
      console.log(`\nCreate one with: ${colors.bright}node cdp-webhook-manager.js create --url <your-url> --event wallet_activity${colors.reset}\n`);
      return;
    }
    
    console.log(`Found ${colors.green}${webhooks.length}${colors.reset} webhook(s):\n`);
    
    webhooks.forEach((webhook, index) => {
      console.log(`${colors.bright}Webhook ${index + 1}:${colors.reset}`);
      console.log(`  ${colors.gray}ID:${colors.reset} ${webhook.id}`);
      console.log(`  ${colors.gray}Status:${colors.reset} ${webhook.status === 'active' ? colors.green : colors.red}${webhook.status}${colors.reset}`);
      console.log(`  ${colors.gray}Network:${colors.reset} ${webhook.network_id}`);
      console.log(`  ${colors.gray}Event Type:${colors.reset} ${webhook.event_type}`);
      console.log(`  ${colors.gray}Notification URL:${colors.reset} ${webhook.notification_uri}`);
      
      if (webhook.event_type_filter?.addresses?.length > 0) {
        console.log(`  ${colors.gray}Monitored Addresses (${webhook.event_type_filter.addresses.length}):${colors.reset}`);
        if (detailed) {
          webhook.event_type_filter.addresses.forEach(addr => {
            console.log(`    • ${addr}`);
          });
        } else {
          webhook.event_type_filter.addresses.slice(0, 3).forEach(addr => {
            console.log(`    • ${addr}`);
          });
          if (webhook.event_type_filter.addresses.length > 3) {
            console.log(`    • ... and ${webhook.event_type_filter.addresses.length - 3} more`);
          }
        }
      }
      
      if (webhook.event_filters?.length > 0) {
        console.log(`  ${colors.gray}Event Filters:${colors.reset}`);
        webhook.event_filters.forEach(filter => {
          if (filter.contract_address) console.log(`    • Contract: ${filter.contract_address}`);
          if (filter.from_address) console.log(`    • From: ${filter.from_address}`);
          if (filter.to_address) console.log(`    • To: ${filter.to_address}`);
        });
      }
      
      console.log(`  ${colors.gray}Created:${colors.reset} ${new Date(webhook.created_at).toLocaleString()}`);
      console.log(`  ${colors.gray}Updated:${colors.reset} ${new Date(webhook.updated_at).toLocaleString()}`);
      console.log('');
    });
    
    return webhooks;
  } catch (error) {
    console.error(`${colors.red}❌ Error listing webhooks:${colors.reset}`, error.error || error.message);
    throw error;
  }
}

/**
 * Create a new webhook
 */
async function createWebhook(options) {
  const { url, event = 'wallet_activity', addresses = [], network = 'base-mainnet', secret = 'webhook-secret' } = options;
  
  if (!url) {
    console.error(`${colors.red}❌ Notification URL is required${colors.reset}`);
    console.log(`Usage: node cdp-webhook-manager.js create --url <notification-url> [--event <type>] [--addresses <addr1,addr2>]`);
    return;
  }
  
  console.log(`\n${colors.blue}🔨 Creating webhook...${colors.reset}\n`);
  
  const webhookData = {
    network_id: network,
    event_type: event,
    notification_uri: url,
    signature_header: secret
  };
  
  if (addresses.length > 0) {
    webhookData.event_type_filter = {
      addresses: addresses
    };
  }
  
  console.log(`  ${colors.gray}Network:${colors.reset} ${network}`);
  console.log(`  ${colors.gray}Event Type:${colors.reset} ${event}`);
  console.log(`  ${colors.gray}URL:${colors.reset} ${url}`);
  if (addresses.length > 0) {
    console.log(`  ${colors.gray}Addresses:${colors.reset} ${addresses.length} address(es)`);
  }
  console.log('');
  
  try {
    const response = await makeRequest('POST', '/platform/v1/webhooks', webhookData);
    
    console.log(`${colors.green}✅ Webhook created successfully!${colors.reset}`);
    console.log(`  ${colors.gray}ID:${colors.reset} ${response.data.id}`);
    console.log(`  ${colors.gray}Status:${colors.reset} ${response.data.status}`);
    
    return response.data;
  } catch (error) {
    console.error(`${colors.red}❌ Error creating webhook:${colors.reset}`, error.error || error.message);
    throw error;
  }
}

/**
 * Update a webhook
 */
async function updateWebhook(webhookId, options) {
  if (!webhookId) {
    console.error(`${colors.red}❌ Webhook ID is required${colors.reset}`);
    return;
  }
  
  console.log(`\n${colors.blue}🔄 Updating webhook ${webhookId}...${colors.reset}\n`);
  
  const updateData = {};
  
  if (options.url) {
    updateData.notification_uri = options.url;
    console.log(`  ${colors.gray}New URL:${colors.reset} ${options.url}`);
  }
  
  if (options.event) {
    updateData.event_type = options.event;
    console.log(`  ${colors.gray}New Event Type:${colors.reset} ${options.event}`);
  }
  
  if (options.addresses) {
    updateData.event_type_filter = {
      addresses: options.addresses
    };
    console.log(`  ${colors.gray}New Addresses:${colors.reset} ${options.addresses.length} address(es)`);
  }
  
  if (options.status) {
    updateData.status = options.status;
    console.log(`  ${colors.gray}New Status:${colors.reset} ${options.status}`);
  }
  
  if (Object.keys(updateData).length === 0) {
    console.log(`${colors.yellow}No updates specified.${colors.reset}`);
    return;
  }
  
  console.log('');
  
  try {
    const response = await makeRequest('PUT', `/platform/v1/webhooks/${webhookId}`, updateData);
    
    console.log(`${colors.green}✅ Webhook updated successfully!${colors.reset}`);
    
    if (response.data) {
      console.log(`  ${colors.gray}Status:${colors.reset} ${response.data.status}`);
      if (response.data.event_type_filter?.addresses) {
        console.log(`  ${colors.gray}Monitoring:${colors.reset} ${response.data.event_type_filter.addresses.length} address(es)`);
      }
    }
    
    return response.data;
  } catch (error) {
    console.error(`${colors.red}❌ Error updating webhook:${colors.reset}`, error.error || error.message);
    throw error;
  }
}

/**
 * Delete a webhook
 */
async function deleteWebhook(webhookId) {
  if (!webhookId) {
    console.error(`${colors.red}❌ Webhook ID is required${colors.reset}`);
    return;
  }
  
  console.log(`\n${colors.blue}🗑️  Deleting webhook ${webhookId}...${colors.reset}\n`);
  
  // Confirm deletion
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const confirmed = await new Promise(resolve => {
    rl.question(`${colors.yellow}Are you sure you want to delete this webhook? (y/n): ${colors.reset}`, answer => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
  
  if (!confirmed) {
    console.log(`${colors.gray}Deletion cancelled.${colors.reset}`);
    return;
  }
  
  try {
    await makeRequest('DELETE', `/platform/v1/webhooks/${webhookId}`);
    console.log(`${colors.green}✅ Webhook deleted successfully!${colors.reset}`);
  } catch (error) {
    console.error(`${colors.red}❌ Error deleting webhook:${colors.reset}`, error.error || error.message);
    throw error;
  }
}

/**
 * Activate a webhook
 */
async function activateWebhook(webhookId) {
  if (!webhookId) {
    console.error(`${colors.red}❌ Webhook ID is required${colors.reset}`);
    return;
  }
  
  console.log(`\n${colors.blue}✅ Activating webhook ${webhookId}...${colors.reset}\n`);
  
  try {
    const response = await makeRequest('PUT', `/platform/v1/webhooks/${webhookId}`, {
      status: 'ACTIVE'
    });
    
    console.log(`${colors.green}✅ Webhook activated successfully!${colors.reset}`);
    console.log(`  ${colors.gray}Status:${colors.reset} ${response.data.status}`);
    
    return response.data;
  } catch (error) {
    console.error(`${colors.red}❌ Error activating webhook:${colors.reset}`, error.error || error.message);
    throw error;
  }
}

/**
 * Deactivate a webhook
 */
async function deactivateWebhook(webhookId) {
  if (!webhookId) {
    console.error(`${colors.red}❌ Webhook ID is required${colors.reset}`);
    return;
  }
  
  console.log(`\n${colors.blue}⏸️  Deactivating webhook ${webhookId}...${colors.reset}\n`);
  
  try {
    const response = await makeRequest('PUT', `/platform/v1/webhooks/${webhookId}`, {
      status: 'INACTIVE'
    });
    
    console.log(`${colors.green}✅ Webhook deactivated successfully!${colors.reset}`);
    console.log(`  ${colors.gray}Status:${colors.reset} ${response.data.status}`);
    
    return response.data;
  } catch (error) {
    console.error(`${colors.red}❌ Error deactivating webhook:${colors.reset}`, error.error || error.message);
    throw error;
  }
}

/**
 * Monitor specific addresses (add/remove from existing webhook)
 */
async function monitorAddresses(webhookId, options) {
  if (!webhookId) {
    console.error(`${colors.red}❌ Webhook ID is required${colors.reset}`);
    return;
  }
  
  console.log(`\n${colors.blue}📍 Managing monitored addresses for webhook ${webhookId}...${colors.reset}\n`);
  
  try {
    // First, get current webhook configuration
    const webhooks = await makeRequest('GET', '/platform/v1/webhooks');
    const webhook = webhooks.data.data?.find(w => w.id === webhookId);
    
    if (!webhook) {
      console.error(`${colors.red}❌ Webhook not found: ${webhookId}${colors.reset}`);
      return;
    }
    
    let currentAddresses = webhook.event_type_filter?.addresses || [];
    console.log(`${colors.gray}Currently monitoring ${currentAddresses.length} address(es)${colors.reset}`);
    
    // Add new addresses
    if (options.add && options.add.length > 0) {
      const newAddresses = options.add.filter(addr => !currentAddresses.includes(addr.toLowerCase()));
      currentAddresses = [...currentAddresses, ...newAddresses];
      console.log(`${colors.green}+ Adding ${newAddresses.length} address(es)${colors.reset}`);
    }
    
    // Remove addresses
    if (options.remove && options.remove.length > 0) {
      const removeSet = new Set(options.remove.map(a => a.toLowerCase()));
      const beforeCount = currentAddresses.length;
      currentAddresses = currentAddresses.filter(addr => !removeSet.has(addr.toLowerCase()));
      console.log(`${colors.red}- Removing ${beforeCount - currentAddresses.length} address(es)${colors.reset}`);
    }
    
    // Update webhook
    const updateData = {
      event_type_filter: {
        addresses: currentAddresses
      }
    };
    
    console.log(`\n${colors.gray}New total: ${currentAddresses.length} address(es)${colors.reset}\n`);
    
    const response = await makeRequest('PUT', `/platform/v1/webhooks/${webhookId}`, updateData);
    
    console.log(`${colors.green}✅ Addresses updated successfully!${colors.reset}`);
    
    if (options.list) {
      console.log(`\n${colors.gray}Currently monitoring:${colors.reset}`);
      currentAddresses.forEach(addr => console.log(`  • ${addr}`));
    }
    
    return response.data;
  } catch (error) {
    console.error(`${colors.red}❌ Error updating addresses:${colors.reset}`, error.error || error.message);
    throw error;
  }
}

/**
 * Interactive mode - guide user through webhook management
 */
async function interactiveMode() {
  console.log(`\n${colors.bright}${colors.blue}CDP Webhook Manager - Interactive Mode${colors.reset}\n`);
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const question = (query) => new Promise(resolve => rl.question(query, resolve));
  
  while (true) {
    console.log(`\n${colors.gray}What would you like to do?${colors.reset}`);
    console.log('  1. List webhooks');
    console.log('  2. Create webhook');
    console.log('  3. Update webhook');
    console.log('  4. Manage addresses');
    console.log('  5. Activate webhook');
    console.log('  6. Deactivate webhook');
    console.log('  7. Delete webhook');
    console.log('  8. Exit');
    
    const choice = await question(`\n${colors.bright}Choice (1-8): ${colors.reset}`);
    
    switch (choice.trim()) {
      case '1':
        await listWebhooks(true);
        break;
        
      case '2':
        const url = await question('Notification URL: ');
        console.log('\nAvailable event types:');
        Object.entries(EVENT_TYPES).forEach(([key, desc]) => {
          console.log(`  • ${key}: ${desc}`);
        });
        const event = await question('Event type (default: wallet_activity): ') || 'wallet_activity';
        const addrInput = await question('Addresses to monitor (comma-separated, optional): ');
        const addresses = addrInput ? addrInput.split(',').map(a => a.trim()).filter(a => a) : [];
        
        await createWebhook({ url, event, addresses });
        break;
        
      case '3':
        const webhooks = await listWebhooks();
        if (webhooks && webhooks.length > 0) {
          const updateId = await question('Webhook ID to update: ');
          const newUrl = await question('New URL (leave empty to skip): ');
          const newAddrs = await question('New addresses (comma-separated, leave empty to skip): ');
          
          const updateOptions = {};
          if (newUrl) updateOptions.url = newUrl;
          if (newAddrs) updateOptions.addresses = newAddrs.split(',').map(a => a.trim()).filter(a => a);
          
          await updateWebhook(updateId, updateOptions);
        }
        break;
        
      case '4':
        const webhooksList = await listWebhooks();
        if (webhooksList && webhooksList.length > 0) {
          const monitorId = await question('Webhook ID: ');
          const addAddrs = await question('Addresses to ADD (comma-separated, optional): ');
          const removeAddrs = await question('Addresses to REMOVE (comma-separated, optional): ');
          
          const monitorOptions = { list: true };
          if (addAddrs) monitorOptions.add = addAddrs.split(',').map(a => a.trim()).filter(a => a);
          if (removeAddrs) monitorOptions.remove = removeAddrs.split(',').map(a => a.trim()).filter(a => a);
          
          await monitorAddresses(monitorId, monitorOptions);
        }
        break;
        
      case '5':
        const activateList = await listWebhooks();
        if (activateList && activateList.length > 0) {
          const activateId = await question('Webhook ID to activate: ');
          await activateWebhook(activateId);
        }
        break;
        
      case '6':
        const deactivateList = await listWebhooks();
        if (deactivateList && deactivateList.length > 0) {
          const deactivateId = await question('Webhook ID to deactivate: ');
          await deactivateWebhook(deactivateId);
        }
        break;
        
      case '7':
        const deleteList = await listWebhooks();
        if (deleteList && deleteList.length > 0) {
          const deleteId = await question('Webhook ID to delete: ');
          await deleteWebhook(deleteId);
        }
        break;
        
      case '8':
        console.log(`\n${colors.gray}Goodbye!${colors.reset}\n`);
        rl.close();
        return;
        
      default:
        console.log(`${colors.yellow}Invalid choice. Please try again.${colors.reset}`);
    }
  }
}

/**
 * Parse command line arguments
 */
function parseArgs(args) {
  const options = {};
  const positional = [];
  
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].substring(2);
      const value = args[i + 1];
      
      if (key === 'addresses' || key === 'add' || key === 'remove') {
        options[key] = value ? value.split(',').map(a => a.trim()).filter(a => a) : [];
        i++;
      } else {
        options[key] = value;
        i++;
      }
    } else if (!args[i].startsWith('-')) {
      positional.push(args[i]);
    }
  }
  
  return { options, positional };
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    await interactiveMode();
    return;
  }
  
  const { options, positional } = parseArgs(args);
  const command = positional[0];
  const id = positional[1];
  
  console.log(`\n${colors.bright}${colors.blue}🔐 CDP Webhook Manager${colors.reset}`);
  console.log(`${colors.gray}API Key: ${API_KEY_ID.substring(0, 8)}...${colors.reset}\n`);
  
  try {
    switch (command) {
      case 'list':
      case 'ls':
        await listWebhooks(options.detailed || options.all);
        break;
        
      case 'create':
      case 'add':
        await createWebhook(options);
        break;
        
      case 'update':
      case 'edit':
        await updateWebhook(id, options);
        break;
        
      case 'delete':
      case 'rm':
        await deleteWebhook(id);
        break;
        
      case 'monitor':
        await monitorAddresses(id, options);
        break;
        
      case 'activate':
        await activateWebhook(id);
        break;
        
      case 'deactivate':
        await deactivateWebhook(id);
        break;
        
      case 'help':
      default:
        console.log(`${colors.bright}Usage:${colors.reset}`);
        console.log(`  ${colors.gray}node cdp-webhook-manager.js${colors.reset}                    Interactive mode`);
        console.log(`  ${colors.gray}node cdp-webhook-manager.js list [--detailed]${colors.reset}  List all webhooks`);
        console.log(`  ${colors.gray}node cdp-webhook-manager.js create --url <url> [--event <type>] [--addresses <addr1,addr2>]${colors.reset}`);
        console.log(`  ${colors.gray}node cdp-webhook-manager.js update <id> [--url <url>] [--addresses <addr1,addr2>] [--status active|inactive]${colors.reset}`);
        console.log(`  ${colors.gray}node cdp-webhook-manager.js monitor <id> [--add <addresses>] [--remove <addresses>]${colors.reset}`);
        console.log(`  ${colors.gray}node cdp-webhook-manager.js activate <id>${colors.reset}      Activate a webhook`);
        console.log(`  ${colors.gray}node cdp-webhook-manager.js deactivate <id>${colors.reset}    Deactivate a webhook`);
        console.log(`  ${colors.gray}node cdp-webhook-manager.js delete <id>${colors.reset}        Delete a webhook`);
        console.log(`\n${colors.bright}Event Types:${colors.reset}`);
        Object.entries(EVENT_TYPES).forEach(([key, desc]) => {
          console.log(`  ${colors.gray}${key}:${colors.reset} ${desc}`);
        });
        console.log(`\n${colors.bright}Examples:${colors.reset}`);
        console.log(`  ${colors.gray}# List all webhooks with details${colors.reset}`);
        console.log(`  node cdp-webhook-manager.js list --detailed`);
        console.log(`\n  ${colors.gray}# Create webhook monitoring specific addresses${colors.reset}`);
        console.log(`  node cdp-webhook-manager.js create --url https://example.com/webhook --addresses 0x123,0x456`);
        console.log(`\n  ${colors.gray}# Add addresses to existing webhook${colors.reset}`);
        console.log(`  node cdp-webhook-manager.js monitor <webhook-id> --add 0x789,0xabc`);
        console.log(`\n  ${colors.gray}# Update webhook to monitor different addresses${colors.reset}`);
        console.log(`  node cdp-webhook-manager.js update <webhook-id> --addresses 0xnew1,0xnew2`);
        console.log(`\n  ${colors.gray}# Activate/deactivate webhook${colors.reset}`);
        console.log(`  node cdp-webhook-manager.js activate <webhook-id>`);
        console.log(`  node cdp-webhook-manager.js deactivate <webhook-id>`);
    }
  } catch (error) {
    console.error(`\n${colors.red}Error: ${error.message || 'Unknown error'}${colors.reset}`);
    process.exit(1);
  }
}

// Check if CDP SDK is installed
try {
  require('@coinbase/cdp-sdk/auth');
} catch (error) {
  console.error(`${colors.red}Error: CDP SDK not installed.${colors.reset}`);
  console.log(`Please run: ${colors.bright}npm install @coinbase/cdp-sdk${colors.reset}\n`);
  process.exit(1);
}

// Run the manager
main().catch(error => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, error);
  process.exit(1);
});