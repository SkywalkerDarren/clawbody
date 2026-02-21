import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { logger } from '../logger/logger.js';

describe('Logger', () => {
  beforeEach(() => {
    logger.clearEntries();
    logger.setLevel('debug');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('log levels', () => {
    it('should log debug messages when level is debug', () => {
      logger.debug('test', 'debug message');
      expect(logger.getEntries()).toHaveLength(1);
      expect(logger.getEntries()[0]?.level).toBe('debug');
    });

    it('should log info messages', () => {
      logger.info('test', 'info message');
      expect(logger.getEntries()).toHaveLength(1);
      expect(logger.getEntries()[0]?.level).toBe('info');
    });

    it('should log warn messages', () => {
      logger.warn('test', 'warn message');
      expect(logger.getEntries()).toHaveLength(1);
      expect(logger.getEntries()[0]?.level).toBe('warn');
    });

    it('should log error messages', () => {
      logger.error('test', 'error message');
      expect(logger.getEntries()).toHaveLength(1);
      expect(logger.getEntries()[0]?.level).toBe('error');
    });
  });

  describe('level filtering', () => {
    it('should filter debug messages when level is info', () => {
      logger.setLevel('info');
      logger.debug('test', 'debug message');
      expect(logger.getEntries()).toHaveLength(0);
    });

    it('should filter debug and info when level is warn', () => {
      logger.setLevel('warn');
      logger.debug('test', 'debug');
      logger.info('test', 'info');
      logger.warn('test', 'warn');
      expect(logger.getEntries()).toHaveLength(1);
      expect(logger.getEntries()[0]?.level).toBe('warn');
    });

    it('should only log errors when level is error', () => {
      logger.setLevel('error');
      logger.debug('test', 'debug');
      logger.info('test', 'info');
      logger.warn('test', 'warn');
      logger.error('test', 'error');
      expect(logger.getEntries()).toHaveLength(1);
      expect(logger.getEntries()[0]?.level).toBe('error');
    });
  });

  describe('entry management', () => {
    it('should store log entries', () => {
      logger.info('module1', 'message1');
      logger.info('module2', 'message2');

      const entries = logger.getEntries();
      expect(entries).toHaveLength(2);
      expect(entries[0]?.module).toBe('module1');
      expect(entries[1]?.module).toBe('module2');
    });

    it('should clear entries', () => {
      logger.info('test', 'message');
      logger.clearEntries();
      expect(logger.getEntries()).toHaveLength(0);
    });

    it('should limit entries to maxEntries', () => {
      logger.setMaxEntries(3);
      logger.info('test', 'message1');
      logger.info('test', 'message2');
      logger.info('test', 'message3');
      logger.info('test', 'message4');

      const entries = logger.getEntries();
      expect(entries).toHaveLength(3);
      expect(entries[0]?.message).toBe('message2');
    });
  });

  describe('data logging', () => {
    it('should log additional data', () => {
      logger.info('test', 'message', { key: 'value' });
      expect(logger.getEntries()[0]?.data).toEqual({ key: 'value' });
    });

    it('should handle Error objects', () => {
      const error = new Error('test error');
      logger.error('test', 'error occurred', error);
      expect(logger.getEntries()[0]?.data).toBe(error);
    });
  });

  describe('console output', () => {
    it('should call console.log for debug and info', () => {
      logger.debug('test', 'debug');
      logger.info('test', 'info');
      expect(console.log).toHaveBeenCalledTimes(2);
    });

    it('should call console.warn for warn level', () => {
      logger.warn('test', 'warning');
      expect(console.warn).toHaveBeenCalledTimes(1);
    });

    it('should call console.error for error level', () => {
      logger.error('test', 'error');
      expect(console.error).toHaveBeenCalledTimes(1);
    });
  });
});
