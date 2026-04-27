import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";

/**
 * Slot-based context panel. Routes call `useSetContextPanel(<Component />)`
 * to populate the panel; the Layout renders it via `useContextPanelContent()`.
 *
 * Uses `useSyncExternalStore` instead of `useState` to avoid re-render
 * cascades: setting content updates a ref and notifies subscribers without
 * triggering a re-render in the component that called `useSetContextPanel`.
 */

type Listener = () => void;

class PanelStore {
  content: ReactNode = null;
  private listeners = new Set<Listener>();

  setContent = (node: ReactNode) => {
    this.content = node;
    this.listeners.forEach((l) => l());
  };

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.content;
}

const PanelStoreCtx = createContext<PanelStore>(new PanelStore());

export function ContextPanelProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef<PanelStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = new PanelStore();
  }
  const store = storeRef.current;
  return (
    <PanelStoreCtx.Provider value={store}>
      {children}
    </PanelStoreCtx.Provider>
  );
}

/**
 * Set the context panel content for the current route.
 *
 * The content is stored in a ref-based external store so setting it does
 * NOT re-render the calling component. Only the `ContextPanel` (which
 * reads via `useContextPanelContent`) re-renders.
 *
 * Clears the panel on unmount so stale content doesn't linger.
 */
export function useSetContextPanel(content: ReactNode) {
  const store = useContext(PanelStoreCtx);
  useLayoutEffect(() => {
    store.setContent(content);
    return () => store.setContent(null);
  });
}

export function useContextPanelContent(): ReactNode {
  const store = useContext(PanelStoreCtx);
  const subscribe = useCallback(
    (cb: Listener) => store.subscribe(cb),
    [store]
  );
  const getSnapshot = useCallback(() => store.getSnapshot(), [store]);
  return useSyncExternalStore(subscribe, getSnapshot);
}
