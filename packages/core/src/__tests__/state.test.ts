import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StateMachine, StateType, StateEvent } from '../state/machine.js';

describe('StateMachine', () => {
  let machine: StateMachine;

  beforeEach(() => {
    machine = new StateMachine();
  });

  describe('initial state', () => {
    it('should start in idle state', () => {
      expect(machine.state).toBe('idle');
    });
  });

  describe('transition', () => {
    it('should transition from idle to thinking', () => {
      const result = machine.transition('START_THINKING');
      expect(result).toBe(true);
      expect(machine.state).toBe('thinking');
    });

    it('should transition from idle to speaking', () => {
      const result = machine.transition('START_SPEAKING');
      expect(result).toBe(true);
      expect(machine.state).toBe('speaking');
    });

    it('should transition from idle to listening', () => {
      const result = machine.transition('START_LISTENING');
      expect(result).toBe(true);
      expect(machine.state).toBe('listening');
    });

    it('should transition from idle to acting', () => {
      const result = machine.transition('START_ACTING');
      expect(result).toBe(true);
      expect(machine.state).toBe('acting');
    });

    it('should transition from thinking to speaking', () => {
      machine.transition('START_THINKING');
      const result = machine.transition('START_SPEAKING');
      expect(result).toBe(true);
      expect(machine.state).toBe('speaking');
    });

    it('should transition from thinking to idle on FINISH', () => {
      machine.transition('START_THINKING');
      const result = machine.transition('FINISH');
      expect(result).toBe(true);
      expect(machine.state).toBe('idle');
    });

    it('should transition from speaking to listening', () => {
      machine.transition('START_SPEAKING');
      const result = machine.transition('START_LISTENING');
      expect(result).toBe(true);
      expect(machine.state).toBe('listening');
    });

    it('should transition from listening to thinking', () => {
      machine.transition('START_LISTENING');
      const result = machine.transition('START_THINKING');
      expect(result).toBe(true);
      expect(machine.state).toBe('thinking');
    });

    it('should transition to idle on ERROR from any state', () => {
      machine.transition('START_THINKING');
      const result = machine.transition('ERROR');
      expect(result).toBe(true);
      expect(machine.state).toBe('idle');
    });

    it('should return false for invalid transitions', () => {
      // Cannot go from idle to idle via FINISH
      const result = machine.transition('FINISH');
      expect(result).toBe(false);
      expect(machine.state).toBe('idle');
    });
  });

  describe('reset', () => {
    it('should reset to idle from any state', () => {
      machine.transition('START_THINKING');
      machine.reset();
      expect(machine.state).toBe('idle');
    });
  });

  describe('canTransition', () => {
    it('should return true for valid transitions', () => {
      expect(machine.canTransition('START_THINKING')).toBe(true);
      expect(machine.canTransition('START_SPEAKING')).toBe(true);
    });

    it('should return false for invalid transitions', () => {
      expect(machine.canTransition('FINISH')).toBe(false);
    });
  });

  describe('subscribe', () => {
    it('should notify listeners on state change', () => {
      const listener = vi.fn();
      machine.subscribe(listener);

      machine.transition('START_THINKING');

      expect(listener).toHaveBeenCalledWith('idle', 'thinking', 'START_THINKING');
    });

    it('should allow unsubscribing', () => {
      const listener = vi.fn();
      const unsubscribe = machine.subscribe(listener);

      unsubscribe();
      machine.transition('START_THINKING');

      expect(listener).not.toHaveBeenCalled();
    });

    it('should handle listener errors gracefully', () => {
      const errorListener = vi.fn().mockImplementation(() => {
        throw new Error('Listener error');
      });
      const normalListener = vi.fn();

      machine.subscribe(errorListener);
      machine.subscribe(normalListener);

      // Should not throw
      expect(() => machine.transition('START_THINKING')).not.toThrow();
      expect(normalListener).toHaveBeenCalled();
    });
  });
});
