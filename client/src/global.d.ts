export {};

declare global {
  interface Window {
    __victorysyncGetClerkToken?: () => Promise<string | null>;
    __victorysyncClerkUserId?: string;
  }
}
