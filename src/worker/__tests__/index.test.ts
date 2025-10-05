/**
 * Tests for main Worker API endpoints and webhook handling
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import worker from '../index';
import type { Env } from '../types';

// Mock environment
const mockEnv: Env = {
  ROOMS: {
    idFromName: jest.fn((name: string) => ({ toString: () => `room-${name}` })),
    get: jest.fn(() => ({
      fetch: jest.fn(() => Promise.resolve(new Response(JSON.stringify({ success: true })))),
    })),
  } as any,
  ROOM_INDEX: {} as any,
  COINBASE_WEBHOOK_SECRET: 'test-secret',
  TELEGRAM_BOT_TOKEN: 'test-token',
};

describe('Worker API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Health Check', () => {
    it('should return OK status', async () => {
      const request = new Request('https://api.swapwatch.app/health');
      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('status', 'ok');
      expect(data).toHaveProperty('timestamp');
    });
  });

  describe('CORS', () => {
    it('should handle preflight requests', async () => {
      const request = new Request('https://api.swapwatch.app/room/ABC123', {
        method: 'OPTIONS',
      });
      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    });

    it('should add CORS headers to responses', async () => {
      const request = new Request('https://api.swapwatch.app/health');
      const response = await worker.fetch(request, mockEnv);

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
  });

  describe('Room Management', () => {
    it('should route room requests to Durable Object', async () => {
      const request = new Request('https://api.swapwatch.app/room/ABC123/wallets');
      const response = await worker.fetch(request, mockEnv);

      expect(mockEnv.ROOMS.idFromName).toHaveBeenCalledWith('ABC123');
      expect(mockEnv.ROOMS.get).toHaveBeenCalled();
      expect(response.status).toBe(200);
    });

    it('should reject invalid room codes', async () => {
      const request = new Request('https://api.swapwatch.app/room//wallets');
      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toHaveProperty('error', 'Invalid room code');
    });

    it('should handle room creation', async () => {
      const request = new Request('https://api.swapwatch.app/room/NEW123/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threshold: 1000 }),
      });
      const response = await worker.fetch(request, mockEnv);

      expect(mockEnv.ROOMS.idFromName).toHaveBeenCalledWith('NEW123');
      expect(response.status).toBe(200);
    });
  });

  describe('404 Handling', () => {
    it('should return 404 for unknown routes', async () => {
      const request = new Request('https://api.swapwatch.app/unknown/route');
      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(404);
    });
  });

  describe('Error Handling', () => {
    it('should handle Worker errors gracefully', async () => {
      const errorEnv = {
        ...mockEnv,
        ROOMS: {
          idFromName: jest.fn(() => {
            throw new Error('Durable Object error');
          }),
        } as any,
      };

      const request = new Request('https://api.swapwatch.app/room/ERROR/wallets');
      const response = await worker.fetch(request, errorEnv);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data).toHaveProperty('error', 'Internal server error');
    });
  });
});