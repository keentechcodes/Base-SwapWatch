# Spec Tasks

## Tasks

- [x] 1. Set up project foundation and webhook server
  - [x] 1.1 Write tests for Express server and health endpoints
  - [x] 1.2 Initialize Node.js project with TypeScript configuration
  - [x] 1.3 Create Express server with basic endpoints (/, /health)
  - [x] 1.4 Set up environment variables and .env.example file
  - [x] 1.5 Add request logging middleware
  - [x] 1.6 Verify all tests pass

- [ ] 2. Implement webhook receiver endpoint
  - [ ] 2.1 Write tests for webhook endpoint and payload handling
  - [ ] 2.2 Create POST /webhook endpoint with JSON body parsing
  - [ ] 2.3 Implement raw body capture for signature verification
  - [ ] 2.4 Add request validation and error handling
  - [ ] 2.5 Create webhook event logger with formatted output
  - [ ] 2.6 Verify all tests pass

- [ ] 3. Add webhook signature verification
  - [ ] 3.1 Write tests for HMAC signature validation
  - [ ] 3.2 Implement signature generation using webhook secret
  - [ ] 3.3 Add timing-safe signature comparison
  - [ ] 3.4 Implement timestamp validation (5-minute window)
  - [ ] 3.5 Add security error responses for invalid signatures
  - [ ] 3.6 Verify all tests pass

- [ ] 4. Parse and identify swap events
  - [ ] 4.1 Write tests for swap event detection and parsing
  - [ ] 4.2 Create event type identifier for CDP webhook payloads
  - [ ] 4.3 Implement swap detection logic for DEX transactions
  - [ ] 4.4 Extract and format swap data (tokens, amounts, addresses)
  - [ ] 4.5 Add color-coded console output using chalk
  - [ ] 4.6 Verify all tests pass

- [ ] 5. Set up development tools and documentation
  - [ ] 5.1 Write tests for ngrok integration script
  - [ ] 5.2 Create ngrok tunnel setup script
  - [ ] 5.3 Add CDP webhook configuration instructions
  - [ ] 5.4 Create README with setup and usage guide
  - [ ] 5.5 Add example webhook payloads for testing
  - [ ] 5.6 Test complete flow with ngrok and CDP portal
  - [ ] 5.7 Verify all tests pass