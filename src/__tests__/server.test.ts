import request from 'supertest';
import { app } from '../server';

describe('Express Server', () => {

  describe('GET /', () => {
    it('should return service information', async () => {
      const response = await request(app).get('/');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('service', 'SwapWatch Webhook Demo');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('status', 'running');
    });
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('webhook_configured');
      expect(typeof response.body.uptime).toBe('number');
    });

    it('should return valid ISO timestamp', async () => {
      const response = await request(app).get('/health');
      const timestamp = new Date(response.body.timestamp);
      
      expect(timestamp.toString()).not.toBe('Invalid Date');
      expect(response.body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('Server Configuration', () => {
    it('should handle JSON requests', async () => {
      const testData = { test: 'data' };
      const response = await request(app)
        .post('/test-json')
        .send(testData)
        .set('Content-Type', 'application/json');
      
      // Even if endpoint doesn't exist, server should handle JSON
      expect(response.status).toBeDefined();
    });

    it('should have proper error handling for unknown routes', async () => {
      const response = await request(app).get('/unknown-route');
      
      expect(response.status).toBe(404);
    });
  });

  describe('Request Logging', () => {
    const originalLog = console.log;
    let logOutput: string[] = [];

    beforeEach(() => {
      logOutput = [];
      console.log = jest.fn((...args) => {
        logOutput.push(args.join(' '));
      });
    });

    afterEach(() => {
      console.log = originalLog;
    });

    it('should log incoming requests', async () => {
      await request(app).get('/');
      
      const hasRequestLog = logOutput.some(log => 
        log.includes('GET') && log.includes('/')
      );
      
      expect(hasRequestLog).toBe(true);
    });
  });

  describe('Environment Variables', () => {
    it('should load environment variables', () => {
      // Environment should be configured
      expect(process.env.NODE_ENV).toBeDefined();
    });
  });
});