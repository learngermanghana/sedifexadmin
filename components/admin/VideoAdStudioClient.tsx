'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { ArrowUpRight, ClipboardCopy, Download, ImagePlus, Music2, Play, Settings2, Sparkles, Video } from 'lucide-react';
import {
  type AdFormat, type AdStyle, type VideoAdInput, type VideoAdScript,
  templateScript,
} from '@/lib/video-ad-studio';

type LoadedMedia = { photo: HTMLImageElement | null; logo: HTMLImageElement | null };
const SIZE: Record<AdFormat, [number, number]> = {
  vertical: [720, 1280],
  square: [960, 960],
  wide: [1280, 720],
};
const COLORS: Record<AdStyle, [string, string, string]> = {
  bold: ['#0e142b', '#4f46e5', '#b6f5db'],
  luxury: ['#161313', '#6e5331', '#f2d6a2'],
  fresh: ['#063e3d', '#11a88e', '#e0ffb0'],
};
const DEFAULT_INPUT: VideoAdInput = {
  brand: 'Your Business', product: 'Your next favourite product',
  price: 'From GH₵ 150', callToAction: 'Order today', duration: 15, style: 'bold',
};
const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};
function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines = 3) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  words.forEach(word => {
    const next = current ? current + ' ' + word : word;
    if (current && ctx.measureText(next).width > maxWidth) {
      lines.push(current);
      current = word;
    } else current = next;
  });
  if (current) lines.push(current);
  if (lines.length > maxLines) {
    const trimmed = lines.slice(0, maxLines);
    trimmed[maxLines - 1] = trimmed[maxLines - 1].replace(/\s+\S*$/, '') + '…';
    return trimmed;
  }
  return lines;
}
function cover(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, w: number, h: number, zoom = 1) {
  const scale = Math.max(w / image.naturalWidth, h / image.naturalHeight) * zoom;
  const rw = image.naturalWidth * scale;
  const rh = image.naturalHeight * scale;
  ctx.drawImage(image, x + (w-rw)/2, y + (h-rh)/2, rw, rh);
}

function frame(
  canvas: HTMLCanvasElement, time: number, input: VideoAdInput,
  format: AdFormat, script: VideoAdScript, media: LoadedMedia,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const [w, h] = SIZE[format];
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const [dark, vibrant, light] = COLORS[input.style];
  const segment = input.duration / 4;
  const scene = Math.min(3, Math.floor(time / segment));
  const local = Math.max(0, Math.min(1, (time - scene * segment) / segment));
  const appear = smooth(local * 4);
  const leave = 1 - smooth((local - 0.80) * 5);
  const alpha = Math.min(appear, leave);
  const portrait = h > w;
  const unit = Math.min(w, h);
  const padding = Math.round(unit * 0.078);
  const gradient = ctx.createLinearGradient(0, 0, w, h);
  gradient.addColorStop(0, dark);
  gradient.addColorStop(0.65, vibrant);
  gradient.addColorStop(1, dark);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  // Animated glow and angular graphic accents are free procedural graphics.
  const glowX = w * (0.78 - 0.11 * Math.sin(time / 4));
  const glowY = h * (0.25 + 0.07 * Math.cos(time / 6));
  const glow = ctx.createRadialGradient(glowX, glowY, 0, glowX, glowY, unit * 1.1);
  glow.addColorStop(0, light + '55');
  glow.addColorStop(1, light + '00');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.strokeStyle = light + '22';
  ctx.lineWidth = Math.max(2, unit * 0.003);
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.arc(w * 0.85, h * 0.24, unit * (0.30 + i * 0.11), -0.8, 1.65);
    ctx.stroke();
  }
  ctx.restore();

  const imageH = portrait ? h * 0.47 : h * 0.74;
  const imageW = portrait ? w * 0.87 : w * 0.44;
  const imageX = portrait ? w * 0.065 : w * 0.53;
  const imageY = portrait ? h * 0.23 : h * 0.13;
  if (media.photo) {
    ctx.save();
    ctx.shadowColor = '#00000080';
    ctx.shadowBlur = unit * 0.06;
    ctx.fillStyle = '#ffffff12';
    ctx.beginPath();
    ctx.roundRect(imageX, imageY, imageW, imageH, unit * 0.03);
    ctx.fill();
    ctx.clip();
    cover(ctx, media.photo, imageX, imageY, imageW, imageH, 1.05 + (time / input.duration) * 0.12);
    const shade = ctx.createLinearGradient(0, imageY + imageH * 0.4, 0, imageY + imageH);
    shade.addColorStop(0, '#00000000');
    shade.addColorStop(1, '#00000080');
    ctx.fillStyle = shade;
    ctx.fillRect(imageX, imageY, imageW, imageH);
    ctx.restore();
  } else {
    ctx.save();
    ctx.translate(w * 0.77, h * 0.45);
    ctx.rotate(-0.25 + 0.08 * Math.sin(time / 2));
    ctx.fillStyle = light + '28';
    ctx.fillRect(-unit * 0.16, -unit * 0.22, unit * 0.32, unit * 0.44);
    ctx.strokeStyle = light + '99';
    ctx.lineWidth = unit * 0.007;
    ctx.strokeRect(-unit * 0.16, -unit * 0.22, unit * 0.32, unit * 0.44);
    ctx.restore();
  }

  // Brand is always drawn separately to avoid AI-generated text errors.
  ctx.save();
  if (media.logo) {
    const lh = unit * 0.08;
    const lw = Math.min(unit * 0.22, lh * media.logo.naturalWidth / media.logo.naturalHeight);
    ctx.drawImage(media.logo, padding, padding, lw, lh);
  }
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 ' + Math.floor(unit * 0.033) + 'px Arial, sans-serif';
  ctx.fillText(input.brand.slice(0, 45).toUpperCase(), padding + (media.logo ? unit * 0.23 : 0), padding + unit * 0.017, w * 0.8);
  ctx.restore();

  const title = script.scenes[scene]?.title || input.product;
  const subtitle = script.scenes[scene]?.subtitle || script.subheading;
  const textTop = portrait ? h * 0.76 : h * 0.24;
  const maxTextWidth = portrait ? w - padding * 2 : w * 0.47;
  const titleFont = Math.round(unit * (portrait ? 0.071 : 0.055));
  const subFont = Math.round(unit * 0.031);
  ctx.save();
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.globalAlpha = alpha;
  ctx.translate(0, (1 - appear) * unit * 0.065);
  ctx.font = '800 ' + titleFont + 'px Arial, sans-serif';
  const lines = wrapLines(ctx, title, maxTextWidth, portrait ? 3 : 4);
  const lineHeight = titleFont * 1.17;
  ctx.fillStyle = '#ffffff';
  let y = textTop - (portrait ? (lines.length - 1) * lineHeight * 0.24 : 0);
  for (const line of lines) {
    ctx.fillText(line, padding, y);
    y += lineHeight;
  }
  ctx.font = '500 ' + subFont + 'px Arial, sans-serif';
  ctx.fillStyle = '#ffffffdc';
  wrapLines(ctx, subtitle, maxTextWidth, 2).forEach(line => { ctx.fillText(line, padding, y + unit * 0.024); y += subFont * 1.45; });
  ctx.restore();

  // The last scene always highlights the customer-provided call to action.
  const barY = h - (portrait ? unit * 0.135 : unit * 0.09);
  ctx.save();
  ctx.fillStyle = light;
  ctx.beginPath();
  const chipWidth = Math.min(w - padding * 2, maxTextWidth);
  ctx.roundRect(padding, barY, chipWidth, unit * 0.072, unit * 0.03);
  ctx.fill();
  ctx.fillStyle = dark;
  ctx.font = '800 ' + Math.round(unit * 0.032) + 'px Arial, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText((scene === 2 ? script.offer : script.callToAction).slice(0, 45), padding + unit * 0.028, barY + unit * 0.036, chipWidth - unit * 0.06);
  ctx.restore();

  const bar = h - Math.max(5, unit * 0.008);
  ctx.fillStyle = '#ffffff33';
  ctx.fillRect(0, bar, w, h - bar);
  ctx.fillStyle = light;
  ctx.fillRect(0, bar, w * Math.min(1, time / input.duration), h - bar);
}

function readImage(file: File | null, onLoaded: (image: HTMLImageElement | null, url: string | null) => void) {
  if (!file) { onLoaded(null, null); return; }
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => onLoaded(image, url);
  image.onerror = () => {
    URL.revokeObjectURL(url);
    onLoaded(null, null);
  };
  image.src = url;
}
function makeMusic(destination: MediaStreamAudioDestinationNode, context: AudioContext, seconds: number) {
  const notes = [261.63, 329.63, 392, 523.25, 392, 329.63, 293.66, 392];
  const oscillators: OscillatorNode[] = [];
  for (let i = 0; i < seconds * 2; i++) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const t = context.currentTime + 0.06 + i * 0.5;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(notes[i % notes.length], t);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.04, t + 0.035);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.44);
    oscillator.connect(gain).connect(destination);
    oscillator.start(t);
    oscillator.stop(t + 0.46);
    oscillators.push(oscillator);
  }
  return oscillators;
}
function getMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  return ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    .find(mime => MediaRecorder.isTypeSupported(mime)) || '';
}

export default function VideoAdStudioClient() {
  const [input, setInput] = useState<VideoAdInput>(DEFAULT_INPUT);
  const [prompt, setPrompt] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advancedBrand, setAdvancedBrand] = useState('');
  const [advancedPrice, setAdvancedPrice] = useState('');
  const [advancedCta, setAdvancedCta] = useState('');
  const [format, setFormat] = useState<AdFormat>('vertical');
  const [script, setScript] = useState<VideoAdScript>(() => templateScript(DEFAULT_INPUT));
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [logo, setLogo] = useState<HTMLImageElement | null>(null);
  const [mode, setMode] = useState<'template' | 'gemini'>('template');
  const [notice, setNotice] = useState('Type what you want to advertise. Sedifex will build an animated video from your description.');
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [music, setMusic] = useState(true);
  const [progress, setProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoType, setVideoType] = useState('');
  const [supportedMime, setSupportedMime] = useState('');
  const [error, setError] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const urlRef = useRef<{ photo: string | null; logo: string | null; video: string | null }>({photo:null,logo:null,video:null});
  const renderingRef = useRef(false);
  const media = useMemo(() => ({ photo, logo }), [photo, logo]);
  useEffect(() => { setSupportedMime(getMimeType()); }, []);
  const mime = supportedMime;

  useEffect(() => {
    if (renderingRef.current) return;
    const origin = performance.now();
    let last = 0;
    const animate = (now: number) => {
      if (renderingRef.current) return;
      const t = ((now - origin) / 1000) % input.duration;
      const canvas = canvasRef.current;
      if (canvas) frame(canvas, t, input, format, script, media);
      if (now - last > 350) { setProgress(t / input.duration * 100); last = now; }
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [input, format, script, media, exporting]);

  useEffect(() => {
    if (urlRef.current.video) {
      URL.revokeObjectURL(urlRef.current.video);
      urlRef.current.video = null;
    }
    setVideoUrl('');
    setVideoType('');
  }, [input, format, script, photo, logo, music]);

  useEffect(() => () => {
    for (const url of Object.values(urlRef.current)) if (url) URL.revokeObjectURL(url);
    cancelAnimationFrame(rafRef.current);
  }, []);

  const changeInput = useCallback((next: Partial<VideoAdInput>) => {
    setInput(previous => ({ ...previous, ...next }));
  }, []);

  const fileChanged = (event: ChangeEvent<HTMLInputElement>, kind: 'photo' | 'logo') => {
    const file = event.target.files?.[0] || null;
    if (file && (!file.type.startsWith('image/') || file.size > 8_000_000)) {
      setError('Please use a JPG, PNG or WebP image smaller than 8 MB.');
      event.target.value = '';
      return;
    }
    setError('');
    readImage(file, (image, url) => {
      const previous = urlRef.current[kind];
      if (previous) URL.revokeObjectURL(previous);
      urlRef.current[kind] = url;
      if (kind === 'photo') setPhoto(image);
      else setLogo(image);
    });
  };

  const generate = async () => {
    if (prompt.trim().length < 12) {
      setError('Describe your advert in at least 12 characters.');
      return;
    }
    if (!getMimeType()) {
      setError('Your browser cannot export animated videos. Try Chrome, Edge or another browser with MediaRecorder support.');
      return;
    }
    setGenerating(true);
    setError('');
    setVideoUrl('');
    setNotice('Creating your storyboard and video from the prompt…');
    try {
      const preferences = showAdvanced ? {
        style: input.style, duration: input.duration,
        brand: advancedBrand, price: advancedPrice, callToAction: advancedCta,
      } : undefined;
      const response = await fetch('/api/admin/ai-studio/script', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({prompt, preferences}),
      });
      const result = await response.json() as {
        ok?: boolean; script?: VideoAdScript; input?: VideoAdInput;
        mode?: 'gemini' | 'template'; notice?: string; error?: string;
      };
      if (!response.ok || !result.ok || !result.script || !result.input) {
        throw new Error(result.error || 'Unable to create the video storyboard.');
      }
      setInput(result.input);
      setScript(result.script);
      setMode(result.mode || 'template');
      await exportVideo(result.input, result.script);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to generate video.');
    } finally {
      setGenerating(false);
    }
  };

  const exportVideo = async (adInput: VideoAdInput = input, adScript: VideoAdScript = script) => {
    if (!canvasRef.current || exporting) return;
    const mimeType = getMimeType();
    if (!mimeType || !HTMLCanvasElement.prototype.captureStream) {
      setError('This browser cannot record canvas video. Try current Chrome, Edge, Safari or Firefox.');
      return;
    }
    setExporting(true); setError(''); setProgress(0);
    renderingRef.current = true;
    cancelAnimationFrame(rafRef.current);
    const canvas = canvasRef.current;
    // The new prompt's scene layout must be drawn before capture starts.
    frame(canvas, 0, adInput, format, adScript, media);
    const visual = canvas.captureStream(30);
    let audioContext: AudioContext | null = null;
    let recorder: MediaRecorder | null = null;
    let exportRaf = 0;
    try {
      const tracks = [...visual.getVideoTracks()];
      if (music) {
        audioContext = new AudioContext();
        const destination = audioContext.createMediaStreamDestination();
        makeMusic(destination, audioContext, adInput.duration);
        await audioContext.resume();
        tracks.push(...destination.stream.getAudioTracks());
      }
      const stream = new MediaStream(tracks);
      recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4_000_000 });
      const chunks: Blob[] = [];
      const recorded = new Promise<Blob>((resolve, reject) => {
        recorder!.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
        recorder!.onerror = () => reject(new Error('Video recording failed.'));
        recorder!.onstop = () => chunks.length ? resolve(new Blob(chunks, {type: mimeType})) : reject(new Error('No video frames were recorded.'));
      });
      const started = performance.now();
      recorder.start(250);
      const renderLive = (now: number) => {
        const t = Math.min(adInput.duration, (now - started) / 1000);
        frame(canvas, t, adInput, format, adScript, media);
        setProgress(Math.round(t / adInput.duration * 100));
        if (t < adInput.duration) exportRaf = requestAnimationFrame(renderLive);
        else if (recorder?.state === 'recording') recorder.stop();
      };
      exportRaf = requestAnimationFrame(renderLive);
      const blob = await recorded;
      const url = URL.createObjectURL(blob);
      if (urlRef.current.video) URL.revokeObjectURL(urlRef.current.video);
      urlRef.current.video = url;
      const actualType = blob.type.includes('mp4') ? 'mp4' : 'webm';
      setVideoUrl(url); setVideoType(actualType);
      setNotice('Video rendered locally in your browser. No AI video-generation API was used.');
      setProgress(100);
    } catch (e) {
      if (recorder?.state === 'recording') recorder.stop();
      setError(e instanceof Error ? e.message : 'Could not export this video.');
    } finally {
      cancelAnimationFrame(exportRaf);
      for (const track of visual.getTracks()) track.stop();
      if (audioContext) await audioContext.close().catch(() => {});
      renderingRef.current = false;
      setExporting(false);
    }
  };

  const copyForFlow = () => {
    if (!prompt.trim()) { setError('Write your video prompt first.'); return; }
    navigator.clipboard.writeText(prompt.trim())
      .then(() => setNotice('Your prompt is copied. Open Google Flow and paste it into the prompt box. Flow credits are separate from Sedifex.'))
      .catch(() => setError('Clipboard unavailable. Select and copy the prompt yourself.'));
  };

  const download = () => {
    if (!videoUrl) return;
    const link = document.createElement('a');
    link.href = videoUrl;
    link.download = (input.brand.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'sedifex') + '-ad.' + videoType;
    link.click();
  };

  return (
    <div className="space-y-6">
      <section className="rounded-3xl bg-slate-950 p-6 text-white sm:p-8">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-indigo-200">
          <Video className="h-5 w-5" /> Sedifex AI Video Studio
        </div>
        <h2 className="mt-4 text-3xl font-bold sm:text-4xl">Describe your ad. Get a video.</h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
          Just tell Sedifex what to promote, what it should say and the mood you want. One prompt becomes an animated social ad you can download. No manual scene editing required.
        </p>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
        <div className="space-y-5">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-950">
              <Sparkles className="h-5 w-5 text-indigo-600" /> What video should Sedifex create?
            </div>
            <label htmlFor="sedifex-video-prompt" className="mt-3 block text-sm leading-6 text-slate-600">
              Include your business name, product, price, style and message in ordinary language.
            </label>
            <textarea
              id="sedifex-video-prompt"
              rows={6}
              maxLength={1100}
              value={prompt}
              onChange={event => setPrompt(event.target.value)}
              disabled={generating || exporting}
              placeholder={'Create a 15-second Instagram advertisement for my business called Ama Shoes. Promote leather sandals for GHS 180. Make it elegant and end with “Order on WhatsApp”.'}
              className="mt-3 w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 p-5 text-base leading-7 text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 disabled:opacity-70"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {['Promote my hair salon with an elegant 15-second video and invite people to book an appointment.', 'Create a bold 12-second Instagram ad for my shoe business. End with “Order on WhatsApp”.'].map(example => (
                <button key={example} type="button" disabled={generating || exporting}
                  onClick={() => setPrompt(example)}
                  className="rounded-xl bg-slate-100 px-3 py-2 text-left text-xs font-medium leading-5 text-slate-700 hover:bg-indigo-50 disabled:opacity-60">
                  {example.slice(0, 83)}…
                </button>
              ))}
            </div>
            <button type="button" onClick={generate} disabled={generating || exporting || prompt.trim().length < 12 || !mime}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-6 py-4 text-base font-bold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">
              <Sparkles className="h-5 w-5" />
              {exporting ? 'Creating your video · '+Math.round(progress)+'%' : generating ? 'Building your advertisement…' : 'Generate Video'}
            </button>
            <p className="mt-3 text-center text-xs leading-5 text-slate-500">
              Free local animated video rendering. No Google Flow credits used. {mime ? 'Your browser exports '+(mime.includes('mp4')?'MP4.':'WebM.') : 'This browser does not support video recording.'}
            </p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <button type="button" aria-expanded={showAdvanced} onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex w-full items-center justify-between gap-3 text-sm font-bold text-slate-900">
              <span className="flex items-center gap-2"><Settings2 className="h-4 w-4 text-slate-500"/> Optional: Photos, logo and advanced settings</span>
              <span className="text-xs text-indigo-700">{showAdvanced ? 'Hide' : 'Customize'}</span>
            </button>
            {showAdvanced && <div className="mt-5 space-y-4 border-t border-slate-100 pt-5">
              <p className="text-xs leading-5 text-slate-500">Only change what you need. Sedifex otherwise uses your description.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold text-slate-700">Brand name (optional)
                  <input value={advancedBrand} maxLength={55} onChange={e=>setAdvancedBrand(e.target.value)} placeholder="Extract from prompt" className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm"/>
                </label>
                <label className="text-xs font-semibold text-slate-700">Price or offer (optional)
                  <input value={advancedPrice} maxLength={36} onChange={e=>setAdvancedPrice(e.target.value)} placeholder="Extract from prompt" className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm"/>
                </label>
                <label className="text-xs font-semibold text-slate-700">Visual style
                  <select value={input.style} onChange={e=>changeInput({style:e.target.value as AdStyle})} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm"><option value="bold">Bold</option><option value="luxury">Luxury</option><option value="fresh">Fresh</option></select>
                </label>
                <label className="text-xs font-semibold text-slate-700">Length
                  <select value={input.duration} onChange={e=>changeInput({duration:Number(e.target.value) as VideoAdInput['duration']})} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm"><option value={12}>12 seconds</option><option value={15}>15 seconds</option><option value={20}>20 seconds</option></select>
                </label>
                <label className="text-xs font-semibold text-slate-700">Video format
                  <select value={format} onChange={e=>setFormat(e.target.value as AdFormat)} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm"><option value="vertical">9:16 Reels / TikTok</option><option value="square">1:1 Square</option><option value="wide">16:9 YouTube</option></select>
                </label>
                <label className="text-xs font-semibold text-slate-700">Call to action (optional)
                  <input value={advancedCta} onChange={e=>setAdvancedCta(e.target.value)} maxLength={55} placeholder="Extract from prompt" className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm"/>
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700"><Music2 className="h-4 w-4"/> <input type="checkbox" checked={music} onChange={e=>setMusic(e.target.checked)}/> Add built-in synthesized background music</label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="rounded-xl border border-dashed border-slate-300 p-3 text-xs font-semibold text-slate-700"><ImagePlus className="mb-2 h-5 w-5"/> Product photo<input type="file" accept="image/png,image/jpeg,image/webp" className="mt-2 block w-full text-xs" onChange={e=>fileChanged(e,'photo')}/></label>
                <label className="rounded-xl border border-dashed border-slate-300 p-3 text-xs font-semibold text-slate-700"><ImagePlus className="mb-2 h-5 w-5"/> Business logo<input type="file" accept="image/png,image/jpeg,image/webp" className="mt-2 block w-full text-xs" onChange={e=>fileChanged(e,'logo')}/></label>
              </div>
            </div>}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="rounded-xl bg-emerald-50 p-2 text-emerald-700"><Sparkles className="h-5 w-5"/></span>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Want realistic AI-generated scenes instead?</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Google Flow offers 50 free credits per day for eligible Google accounts. These credits can be used only inside Flow, not inside Sedifex. Copy your prompt, open Flow and generate there manually.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={copyForFlow} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"><ClipboardCopy className="h-4 w-4"/> Copy prompt for Flow</button>
                  <a href="https://labs.google/fx/tools/flow" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800">Open Google Flow <ArrowUpRight className="h-4 w-4"/></a>
                </div>
                <p className="mt-3 text-xs text-slate-500">Flow credit consumption depends on the model, video duration and Google account availability.</p>
              </div>
            </div>
          </section>
        </div>

        <div className="space-y-5 xl:sticky xl:top-5 xl:self-start">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between"><h3 className="text-sm font-bold text-slate-900">Advertisement preview</h3><span className="flex items-center gap-1 text-xs text-slate-500"><Play className="h-3 w-3"/> Animated</span></div>
            <div className="mt-4 flex min-h-80 items-center justify-center overflow-hidden rounded-xl bg-slate-950 p-3">
              <canvas ref={canvasRef} aria-label="Animated advertisement preview" className="block max-h-[520px] max-w-full rounded-md object-contain shadow-xl" style={{aspectRatio:SIZE[format][0]+'/'+SIZE[format][1],width:format==='vertical'?'min(100%,294px)':'100%',height:'auto'}}/>
            </div>
            <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-indigo-500 transition-[width]" style={{width:progress+'%'}}/></div>
            {videoUrl ? <div className="mt-4 space-y-3 rounded-xl bg-emerald-50 p-3">
              <p className="text-xs font-bold text-emerald-800">Your {videoType.toUpperCase()} video is ready</p>
              <video controls playsInline src={videoUrl} className="max-h-72 w-full rounded-lg bg-slate-950"/>
              <button type="button" onClick={download} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white"><Download className="h-4 w-4"/> Download video</button>
            </div> : <p className="mt-3 text-xs leading-5 text-slate-500">The live animation preview runs automatically. Click Generate Video to make a downloadable recording with your prompt.</p>}
            <p role="status" className="mt-4 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">{notice}</p>
            {mode === 'gemini' && <p className="mt-2 text-xs text-indigo-700">Storyboard created with Gemini text AI; visuals are still browser-rendered animation.</p>}
            {error && <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-800">{error}</p>}
          </section>
          {videoUrl && <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900">Ready-to-post caption</h3>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{script.caption}</p>
            <button type="button" onClick={()=>navigator.clipboard.writeText(script.caption).then(()=>setNotice('Caption copied.')).catch(()=>setError('Could not copy caption.'))}
              className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700"><ClipboardCopy className="h-4 w-4"/> Copy caption</button>
          </section>}
        </div>
      </div>
    </div>
  );
}
