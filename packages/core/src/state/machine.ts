/**
 * 状态类型
 */
export type StateType = 'idle' | 'thinking' | 'speaking' | 'listening' | 'acting';

/**
 * 状态转换事件
 */
export type StateEvent =
  | 'START_THINKING'
  | 'START_SPEAKING'
  | 'START_LISTENING'
  | 'START_ACTING'
  | 'FINISH'
  | 'ERROR'
  | 'RESET';

/**
 * 状态转换监听器
 */
export type StateListener = (from: StateType, to: StateType, event: StateEvent) => void;

/**
 * 状态机 - 管理 Body 的整体状态
 */
export class StateMachine {
  private _state: StateType = 'idle';
  private listeners = new Set<StateListener>();

  /**
   * 获取当前状态
   */
  get state(): StateType {
    return this._state;
  }

  /**
   * 触发状态转换
   */
  transition(event: StateEvent): boolean {
    const nextState = this.getNextState(this._state, event);
    if (nextState === null) {
      return false;
    }

    const prevState = this._state;
    this._state = nextState;

    for (const listener of this.listeners) {
      try {
        listener(prevState, nextState, event);
      } catch {
        // 忽略监听器错误
      }
    }

    return true;
  }

  /**
   * 订阅状态变化
   */
  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * 重置到初始状态
   */
  reset(): void {
    this.transition('RESET');
  }

  /**
   * 检查是否可以转换到指定状态
   */
  canTransition(event: StateEvent): boolean {
    return this.getNextState(this._state, event) !== null;
  }

  /**
   * 获取下一个状态
   */
  private getNextState(current: StateType, event: StateEvent): StateType | null {
    const transitions: Record<StateType, Partial<Record<StateEvent, StateType>>> = {
      idle: {
        START_THINKING: 'thinking',
        START_SPEAKING: 'speaking',
        START_LISTENING: 'listening',
        START_ACTING: 'acting',
      },
      thinking: {
        START_SPEAKING: 'speaking',
        FINISH: 'idle',
        ERROR: 'idle',
        RESET: 'idle',
      },
      speaking: {
        FINISH: 'idle',
        START_LISTENING: 'listening',
        ERROR: 'idle',
        RESET: 'idle',
      },
      listening: {
        START_THINKING: 'thinking',
        FINISH: 'idle',
        ERROR: 'idle',
        RESET: 'idle',
      },
      acting: {
        FINISH: 'idle',
        START_SPEAKING: 'speaking',
        ERROR: 'idle',
        RESET: 'idle',
      },
    };

    return transitions[current][event] ?? null;
  }
}
