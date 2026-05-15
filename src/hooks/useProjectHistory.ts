import { useReducer, useCallback } from 'react';

// Define the shape of your application state
// Replace this with your actual state interface
interface AppState {
  zeroGap: any;
  wizardStep: any;
  gridVisible: boolean;
}

interface HistoryState {
  past: AppState[];
  present: AppState;
  future: AppState[];
}

type Action =
  | { type: 'PUSH'; payload: AppState }
  | { type: 'UNDO' }
  | { type: 'REDO' };

const historyReducer = (state: HistoryState, action: Action): HistoryState => {
  const { past, present, future } = state;

  switch (action.type) {
    case 'PUSH':
      return {
        past: [...past, present],
        present: action.payload,
        future: [],
      };
    case 'UNDO':
      if (past.length === 0) return state;
      const previous = past[past.length - 1];
      const newPast = past.slice(0, past.length - 1);
      return {
        past: newPast,
        present: previous,
        future: [present, ...future],
      };
    case 'REDO':
      if (future.length === 0) return state;
      const next = future[0];
      const newFuture = future.slice(1);
      return {
        past: [...past, present],
        present: next,
        future: newFuture,
      };
    default:
      return state;
  }
};

export const useProjectHistory = (initialState: AppState) => {
  const [state, dispatch] = useReducer(historyReducer, {
    past: [],
    present: initialState,
    future: []
  });

  const undo = useCallback(() => {
    dispatch({ type: 'UNDO' });
  }, []);

  const redo = useCallback(() => {
    dispatch({ type: 'REDO' });
  }, []);

  const push = useCallback((newState: AppState) => {
    dispatch({ type: 'PUSH', payload: newState });
  }, []);

  return { state: state.present, undo, redo, push };
};
