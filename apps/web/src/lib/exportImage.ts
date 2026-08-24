/**
 * Downloads an SVG chart as a PNG. Shareability is the growth loop for this product — a
 * screenshot with a koruna trough in it is the advertisement — so the chart has to leave the
 * page as a picture without the user reaching for a screenshot tool.
 *
 * The chart is written against CSS custom properties, which a rasteriser cannot resolve: an
 * SVG loaded into an <img> has no access to the document's cascade. So every `var(--token)` is
 * substituted for its computed value before serialising.
 */

const SCALE = 2;

function resolveTokens(markup: string, root: HTMLElement): string {
  const styles = getComputedStyle(root);
  return markup.replace(/var\((--[a-z0-9-]+)\)/gi, (_match, token: string) => {
    const value = styles.getPropertyValue(token).trim();
    return value || 'currentColor';
  });
}

export async function downloadChartPng(
  svg: SVGSVGElement,
  filename: string,
): Promise<void> {
  const viewBox = svg.viewBox.baseVal;
  const width = viewBox.width || svg.clientWidth || 880;
  const height = viewBox.height || svg.clientHeight || 320;

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  /* An <img>-loaded SVG gets no inherited font, so state one explicitly. */
  clone.setAttribute('font-family', 'system-ui, -apple-system, "Segoe UI", sans-serif');

  const surface = getComputedStyle(document.documentElement)
    .getPropertyValue('--surface')
    .trim();
  const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  background.setAttribute('x', '0');
  background.setAttribute('y', '0');
  background.setAttribute('width', String(width));
  background.setAttribute('height', String(height));
  background.setAttribute('fill', surface || '#ffffff');
  clone.insertBefore(background, clone.firstChild);

  const markup = resolveTokens(new XMLSerializer().serializeToString(clone), document.documentElement);
  const source = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;

  const image = new Image();
  image.decoding = 'sync';
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('chart could not be rasterised'));
    image.src = source;
  });

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * SCALE);
  canvas.height = Math.round(height * SCALE);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas unavailable');
  context.scale(SCALE, SCALE);
  context.drawImage(image, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('PNG encoding failed');

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
