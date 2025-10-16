declare module "react" {
  export type ReactNode = any;
  export interface FC<P = {}> {
    (props: P & { children?: ReactNode }): ReactNode | null;
  }
  export const Fragment: unique symbol;
  export function createElement(...args: any[]): ReactNode;
  export function useMemo<T>(factory: () => T, deps?: any[]): T;
  export function useState<S>(initial: S | (() => S)): [S, (value: S) => void];
  export function useEffect(effect: () => void | (() => void), deps?: any[]): void;
  const React: {
    createElement: typeof createElement;
    Fragment: typeof Fragment;
  };
  export default React;
}
