import type { ScenarioInput } from '@wealthplanner/engine';
import { withRegime } from './defaults';

/**
 * A whole plan encoded into the URL fragment, so a projection can be shared without an account
 * and without anything reaching a server. The fragment is never sent in an HTTP request, which
 * means a shared link carries household finances past the server rather than through it.
 *
 * Compression is native `CompressionStream('deflate-raw')` — no dependency, and available in
 * every current browser and in Node 22. A typical plan is about 1.5 kB of JSON, which deflates
 * to roughly 500 bytes and base64url-encodes to a link that survives being pasted into a chat.
 */

const PREFIX = '#p=';

/** The leave regime holds functions; it is reattached from the jurisdiction on decode. */
function serialisable(scenario: ScenarioInput): unknown {
  const { leaveRegime, ...rest } = scenario;
  return rest;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function pipe(bytes: Uint8Array, transform: ReadableWritablePair): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(transform);
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

export async function encodeScenario(scenario: ScenarioInput): Promise<string> {
  const json = JSON.stringify(serialisable(scenario));
  const compressed = await pipe(
    new TextEncoder().encode(json),
    new CompressionStream('deflate-raw'),
  );
  return PREFIX + toBase64Url(compressed);
}

export async function decodeScenario(fragment: string): Promise<ScenarioInput | null> {
  if (!fragment.startsWith(PREFIX)) return null;
  try {
    const bytes = fromBase64Url(fragment.slice(PREFIX.length));
    const inflated = await pipe(bytes, new DecompressionStream('deflate-raw'));
    const parsed = JSON.parse(new TextDecoder().decode(inflated)) as ScenarioInput;
    if (!parsed?.assumptions || !Array.isArray(parsed.people)) return null;
    return withRegime(parsed);
  } catch {
    /* A truncated or hand-edited link must fall back to the normal flow, never crash. */
    return null;
  }
}

export async function shareUrl(scenario: ScenarioInput, origin: string, path: string): Promise<string> {
  return `${origin}${path}${await encodeScenario(scenario)}`;
}
