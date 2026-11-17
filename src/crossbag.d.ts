/**
 * Firmware-injected types for the CrossPoint plugin API.
 *
 * The real `CrossPoint` global is provided at runtime by the device's
 * browser WebUI. Keeping the declarations here lets `src/plugin.ts` type
 * check and build without the firmware present.
 */

export interface RelayOptions {
  headers?: Record<string, string>;
  body?: string;
}

export interface RelayResponse {
  status: number;
  body: string;
}

export interface CrossPointApi {
  name: string;
  relay(
    method: string,
    url: string,
    options?: RelayOptions,
  ): Promise<RelayResponse>;
  writeFile(path: string, data: string): Promise<void>;
}

export type PluginSetup = (
  container: HTMLElement,
  api: CrossPointApi,
) => void | Promise<void>;

export interface CrossPoint {
  registerPlugin(setup: PluginSetup): void;
}

declare global {
  // Injected by firmware before the plugin bundle is evaluated.
  var CrossPoint: CrossPoint | undefined;
}
