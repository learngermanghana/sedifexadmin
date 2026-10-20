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

/**
 * No AI key is needed for a usable result. Pull only explicit marketing details
 * from the user's prompt; never make up prices, discounts or a business name.
 */
export function promptToAdInput(value: unknown, preferences?: Partial<VideoAdInput>): VideoAdInput {
  const prompt = safeText(value, 1100);
  const normalized = prompt.replace(/\s+/g, ' ').trim();
  const business = normalized.match(/\b(?:called|named|brand(?:ed)?|business (?:is|called)|shop (?:is|called))\s+["“]?([^.!?,;\n]{2,55})/i);
  const price = normalized.match(/(?:GH₵|GHS|₵|\$|USD)\s*[\d,.]+(?:\s*(?:each|only|per\s+item))?/i);
  const seconds = normalized.match(/\b(12|15|20)\s*(?:second|sec|s)\b/i);
  const requestedStyle: AdStyle = /luxur|premium|elegan|classy/i.test(normalized) ? 'luxury'
    : /fresh|bright|clean|natural|wellness/i.test(normalized) ? 'fresh' : 'bold';
  const askedCta = normalized.match(/\b(?:say|end with|call to action|cta)\s*[:“"]?\s*(order (?:now|today|on whatsapp)|shop now|book now|visit (?:our )?(?:website|store)|contact us|sign up now)/i);
  // Prefer the thing being advertised over repeating "Create a video for..."
  const advertised = normalized.match(/\b(?:promote|advertise|showcase|feature)\s+([^.!?]{4,110})/i);
  const fallbackTopic = normalized.match(/\b(?:for|about)\s+([^.!?]{4,110})/i);
  const product = (advertised?.[1] || fallbackTopic?.[1] || normalized)
    .replace(/\s+(?:with (?:a |an |the )|for (?:GHS|GH₵|₵|\$)|and (?:end|invite|show)|priced at).*/i, '')
    .trim().slice(0, 110) || 'Your product or service';
  const input = normalizeAdInput({
    brand: business?.[1]?.replace(/\b(?:and|with|selling|offering)\b.*$/i, '').trim() || 'Your Business',
    product,
    price: price?.[0] || '',
    callToAction: askedCta?.[1] || (/whatsapp/i.test(normalized) ? 'Message us on WhatsApp' : 'Learn more'),
    duration: seconds?.[1] ? Number(seconds[1]) : 15,
    style: requestedStyle,
  });
  // Allow only explicit, normalized preferences from the browser.
  return normalizeAdInput({
    ...input,
    ...(safeText(preferences?.brand, 55) ? { brand: safeText(preferences?.brand, 55) } : {}),
    ...(safeText(preferences?.product, 110) ? { product: safeText(preferences?.product, 110) } : {}),
    ...(safeText(preferences?.price, 36) ? { price: safeText(preferences?.price, 36) } : {}),
    ...(safeText(preferences?.callToAction, 55) ? { callToAction: safeText(preferences?.callToAction, 55) } : {}),
    ...(preferences?.duration !== undefined ? { duration: preferences.duration } : {}),
    ...(preferences?.style !== undefined ? { style: preferences.style } : {}),
  });
}

export function templateScriptForPrompt(prompt: string, input: VideoAdInput): VideoAdScript {
  const fallback = templateScript(input);
  const cleanPrompt = safeText(prompt, 500);
  const headline = input.product.length > 70 ? input.product.slice(0, 68).replace(/\s+\S*$/, '') + '…' : input.product;
  return {
    ...fallback,
    headline,
    caption: cleanPrompt ? `${input.product}${input.brand === 'Your Business' ? '' : ' by ' + input.brand}. ${input.price ? input.price + '. ' : ''}${input.callToAction}.` : fallback.caption,
    scenes: [
      { title: input.brand === 'Your Business' ? 'Your next big moment' : input.brand, subtitle: 'Something for you' },
      { title: headline, subtitle: 'Take a closer look' },
      { title: input.price || 'Available now', subtitle: 'Made for you' },
      { title: input.callToAction, subtitle: input.brand === 'Your Business' ? 'Start today' : input.brand },
    ],
  };
}
