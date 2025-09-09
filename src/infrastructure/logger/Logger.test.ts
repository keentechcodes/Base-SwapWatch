import { Logger } from './Logger';
import * as fs from 'fs/promises';

describe('Logger', () => {
  let logger: Logger;
  let consoleSpies: {
    debug: jest.SpyInstance;
    info: jest.SpyInstance;
    warn: jest.SpyInstance;
    error: jest.SpyInstance;
  };

  beforeEach(() => {
    logger = new Logger({
      enableBuffer: true,
      enableConsole: true,
      enableFile: false,
      flushInterval: 0 // Disable auto-flush for tests
    });

    consoleSpies = {
      debug: jest.spyOn(console, 'debug').mockImplementation(),
      info: jest.spyOn(console, 'info').mockImplementation(),
      warn: jest.spyOn(console, 'warn').mockImplementation(),
      error: jest.spyOn(console, 'error').mockImplementation()
    };
  });

  afterEach(async () => {
    await logger.destroy();
    Object.values(consoleSpies).forEach(spy => spy.mockRestore());
  });

  describe('log levels', () => {
    it('should respect log level settings', () => {
      logger.setLevel('warn');
      
      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(consoleSpies.debug).not.toHaveBeenCalled();
      expect(consoleSpies.info).not.toHaveBeenCalled();
      expect(consoleSpies.warn).toHaveBeenCalled();
      expect(consoleSpies.error).toHaveBeenCalled();
    });

    it('should log all levels when set to debug', () => {
      logger.setLevel('debug');
      
      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(consoleSpies.debug).toHaveBeenCalled();
      expect(consoleSpies.info).toHaveBeenCalled();
      expect(consoleSpies.warn).toHaveBeenCalled();
      expect(consoleSpies.error).toHaveBeenCalled();
    });
  });

  describe('buffering', () => {
    it('should buffer log entries', () => {
      logger.info('message 1');
      logger.warn('message 2');
      
      const buffered = logger.getBufferedLogs();
      expect(buffered).toHaveLength(2);
      expect(buffered[0].message).toBe('message 1');
      expect(buffered[0].level).toBe('info');
      expect(buffered[1].message).toBe('message 2');
      expect(buffered[1].level).toBe('warn');
    });

    it('should auto-flush when buffer is full', async () => {
      const smallBufferLogger = new Logger({
        bufferSize: 2,
        enableFile: false,
        flushInterval: 0
      });

      smallBufferLogger.info('message 1');
      smallBufferLogger.info('message 2');
      smallBufferLogger.info('message 3'); // Should trigger flush

      await new Promise(resolve => setTimeout(resolve, 10));

      const buffered = smallBufferLogger.getBufferedLogs();
      expect(buffered).toHaveLength(1); // Only message 3 should remain
      expect(buffered[0].message).toBe('message 3');

      await smallBufferLogger.destroy();
    });

    it('should manually flush buffer', async () => {
      logger.info('message 1');
      logger.info('message 2');
      
      expect(logger.getBufferedLogs()).toHaveLength(2);
      
      await logger.flush();
      
      expect(logger.getBufferedLogs()).toHaveLength(0);
    });
  });

  describe('context and formatting', () => {
    it('should include context in logs', () => {
      logger.info('operation started', {
        service: 'TestService',
        operation: 'test',
        tokenAddress: '0x123'
      });

      const logs = logger.getBufferedLogs();
      expect(logs[0].context).toEqual({
        service: 'TestService',
        operation: 'test',
        tokenAddress: '0x123'
      });
    });

    it('should format pretty output correctly', () => {
      const prettyLogger = new Logger({
        outputFormat: 'pretty',
        enableConsole: true
      });

      prettyLogger.info('test message', { key: 'value' });
      
      expect(consoleSpies.info).toHaveBeenCalled();
      const output = consoleSpies.info.mock.calls[0][0];
      expect(output).toContain('[INFO ]');
      expect(output).toContain('test message');
      expect(output).toContain('{"key":"value"}');

      prettyLogger.destroy();
    });

    it('should format JSON output correctly', () => {
      const jsonLogger = new Logger({
        outputFormat: 'json',
        enableConsole: true
      });

      jsonLogger.info('test message', { key: 'value' });
      
      expect(consoleSpies.info).toHaveBeenCalled();
      const output = consoleSpies.info.mock.calls[0][0];
      const parsed = JSON.parse(output);
      
      expect(parsed.level).toBe('info');
      expect(parsed.message).toBe('test message');
      expect(parsed.key).toBe('value');

      jsonLogger.destroy();
    });
  });

  describe('error handling', () => {
    it('should extract error information', () => {
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at test.js:1:1';
      
      logger.error('Operation failed', error, { operation: 'test' });
      
      const logs = logger.getBufferedLogs();
      expect(logs[0].error).toBeDefined();
      expect(logs[0].error?.message).toBe('Test error');
      expect(logs[0].error?.stack).toContain('test.js:1:1');
      expect(logs[0].error?.name).toBe('Error');
    });

    it('should handle non-Error objects', () => {
      logger.error('Operation failed', 'string error');
      
      const logs = logger.getBufferedLogs();
      expect(logs[0].error).toBeDefined();
      expect(logs[0].error?.message).toBe('string error');
    });

    it('should handle null/undefined errors', () => {
      logger.error('Operation failed', undefined);
      
      const logs = logger.getBufferedLogs();
      expect(logs[0].error).toBeUndefined();
    });
  });

  describe('file output', () => {
    const testLogPath = './test-logs/test.log';

    afterEach(async () => {
      try {
        await fs.rm('./test-logs', { recursive: true, force: true });
      } catch {}
    });

    it('should write logs to file', async () => {
      const fileLogger = new Logger({
        enableFile: true,
        filePath: testLogPath,
        enableConsole: false
      });

      fileLogger.info('test message 1');
      fileLogger.warn('test message 2');
      
      await fileLogger.flush();
      
      const content = await fs.readFile(testLogPath, 'utf-8');
      expect(content).toContain('test message 1');
      expect(content).toContain('test message 2');
      expect(content).toContain('[INFO ]');
      expect(content).toContain('[WARN ]');

      await fileLogger.destroy();
    });

    it('should create directory if it does not exist', async () => {
      const fileLogger = new Logger({
        enableFile: true,
        filePath: './nested/deep/path/test.log',
        enableConsole: false
      });

      fileLogger.info('test message');
      await fileLogger.flush();
      
      const exists = await fs.stat('./nested/deep/path/test.log')
        .then(() => true)
        .catch(() => false);
      
      expect(exists).toBe(true);
      
      await fileLogger.destroy();
      await fs.rm('./nested', { recursive: true, force: true });
    });
  });

  describe('auto-flush', () => {
    it('should auto-flush at intervals', async () => {
      const autoFlushLogger = new Logger({
        flushInterval: 50,
        enableFile: false
      });

      autoFlushLogger.info('message 1');
      autoFlushLogger.info('message 2');
      
      expect(autoFlushLogger.getBufferedLogs()).toHaveLength(2);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(autoFlushLogger.getBufferedLogs()).toHaveLength(0);
      
      await autoFlushLogger.destroy();
    });
  });

  describe('global logger', () => {
    it('should create and reuse singleton instance', async () => {
      const { getGlobalLogger } = await import('./Logger');
      
      const logger1 = getGlobalLogger({ service: 'Test1' });
      const logger2 = getGlobalLogger({ service: 'Test2' });
      
      expect(logger1).toBe(logger2);
    });
  });
});