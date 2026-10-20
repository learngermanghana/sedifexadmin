export type AdStyle = 'bold' | 'luxury' | 'fresh';
export type AdFormat = 'vertical' | 'square' | 'wide';

export type VideoAdInput = {
  brand: string;
  product: string;
  price: string;
  callToAction: string;
  style: AdStyle;
  duration: 12 | 15 | 20;
};
export type VideoAdScript = {
  headline: string;
  subheading: string;
  offer: string;
  callToAction: string;
  caption: string;
  scenes: Array<{ title: string; subtitle: string }>;
};
export function safeText(value: unknown, max = 120): string {
  return typeof value === 'string' ? value.trim().replace(/[\x00-\x1f]/g, ' ').slice(0, max) : '';
}
export function normalizeAdInput(value: unknown): VideoAdInput {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const style = ['bold','luxury','fresh'].includes(String(input.style)) ? input.style as AdStyle : 'bold';
  const duration = [12,15,20].includes(Number(input.duration)) ? Number(input.duration) as VideoAdInput['duration'] : 15;
  return {
    brand: safeText(input.brand, 55),
    product: safeText(input.product, 110),
    price: safeText(input.price, 36),
    callToAction: safeText(input.callToAction, 55) || 'Shop now',
    style, duration,
  };
}
export function templateScript(input: VideoAdInput): VideoAdScript {
  const brand = input.brand || 'Your Business';
  const product = input.product || 'Discover something new';
  return {
    headline: product,
    subheading: 'Made for your everyday moments',
    offer: input.price || 'Available now',
    callToAction: input.callToAction,
    caption: `${product} from ${brand}. ${input.price ? input.price + '. ' : ''}${input.callToAction}.`,
    scenes: [
      { title: brand, subtitle: 'Presents' },
      { title: product, subtitle: 'Take a closer look' },
      { title: input.price || 'Available now', subtitle: 'Your next favourite' },
      { title: input.callToAction, subtitle: brand },
    ],
  };
}
export function sanitizeAdScript(value: unknown, fallback: VideoAdScript): VideoAdScript {
  const candidate = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const rawScenes = Array.isArray(candidate.scenes) ? candidate.scenes : [];
  const scenes = rawScenes.slice(0, 4).map((scene) => {
    const obj = scene && typeof scene === 'object' ? scene as Record<string, unknown> : {};
    return { title: safeText(obj.title, 65), subtitle: safeText(obj.subtitle, 90) };
  });
  return {
    headline: safeText(candidate.headline, 85) || fallback.headline,
    subheading: safeText(candidate.subheading, 100) || fallback.subheading,
    offer: safeText(candidate.offer, 50) || fallback.offer,
    callToAction: safeText(candidate.callToAction, 55) || fallback.callToAction,
    caption: safeText(candidate.caption, 350) || fallback.caption,
    scenes: scenes.length === 4 && scenes.every((scene) => scene.title) ? scenes : fallback.scenes,
  };
}
