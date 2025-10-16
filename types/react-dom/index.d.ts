declare module "react-dom" {
  export function render(...args: any[]): void;
  export function hydrate(...args: any[]): void;
  export const version: string;
}
