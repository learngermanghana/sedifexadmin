'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Download, ImagePlus, Music2, Play, RefreshCw, Sparkles, Video } from 'lucide-react';
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
  const [format, setFormat] = useState<AdFormat>('vertical');
  const [script, setScript] = useState<VideoAdScript>(() => templateScript(DEFAULT_INPUT));
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [logo, setLogo] = useState<HTMLImageElement | null>(null);
  const [mode, setMode] = useState<'template' | 'gemini'>('template');
  const [notice, setNotice] = useState('Start with the free built-in storyboard, or request a Gemini script if enabled.');
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
    if (!input.brand.trim() || !input.product.trim()) { setError('Enter a business name and product first.'); return; }
    setGenerating(true); setError('');
    try {
      const response = await fetch('/api/admin/ai-studio/script', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
      });
      const result = await response.json() as { ok?: boolean; script?: VideoAdScript; mode?: 'gemini' | 'template'; notice?: string; error?: string };
      if (!response.ok || !result.ok || !result.script) throw new Error(result.error || 'Unable to generate storyboard.');
      setScript(result.script);
      setMode(result.mode || 'template');
      setNotice(result.notice || 'Storyboard ready.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to generate storyboard.');
    } finally { setGenerating(false); }
  };

  const exportVideo = async () => {
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
    const visual = canvas.captureStream(30);
    let audioContext: AudioContext | null = null;
    let recorder: MediaRecorder | null = null;
    let exportRaf = 0;
    try {
      const tracks = [...visual.getVideoTracks()];
      if (music) {
        audioContext = new AudioContext();
        const destination = audioContext.createMediaStreamDestination();
        makeMusic(destination, audioContext, input.duration);
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
        const t = Math.min(input.duration, (now - started) / 1000);
        frame(canvas, t, input, format, script, media);
        setProgress(Math.round(t / input.duration * 100));
        if (t < input.duration) exportRaf = requestAnimationFrame(renderLive);
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
        <div className="flex flex-wrap items-center gap-3 text-xs font-bold uppercase tracking-[0.2em] text-indigo-200"><Video className="h-5 w-5" /> AI Video Studio <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-emerald-200">Admin experiment</span></div>
        <h2 className="mt-4 max-w-3xl text-3xl font-bold">Create a real animated business advertisement.</h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">Upload a product photo, customize the message, preview the animation, and export a shareable video. Rendering is local and uses no paid video-generation API. Google scripting is optional.</p>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(300px,0.9fr)]">
        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900">1. Business and product</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-600">Business name<input className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm" maxLength={55} value={input.brand} onChange={e => changeInput({brand:e.target.value})} /></label>
              <label className="text-xs font-semibold text-slate-600">Price / offer<input className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm" maxLength={36} value={input.price} onChange={e => changeInput({price:e.target.value})} /></label>
              <label className="text-xs font-semibold text-slate-600 sm:col-span-2">What are we promoting?<textarea className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm" rows={2} maxLength={110} value={input.product} onChange={e => changeInput({product:e.target.value})} /></label>
              <label className="text-xs font-semibold text-slate-600 sm:col-span-2">Call to action<input className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm" maxLength={55} value={input.callToAction} onChange={e => changeInput({callToAction:e.target.value})} /></label>
              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 p-3 text-sm font-semibold text-slate-700"><ImagePlus className="h-5 w-5" /> Product photo<input type="file" accept="image/png,image/jpeg,image/webp" className="w-full min-w-0 text-xs" onChange={e => fileChanged(e,'photo')} /></label>
              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 p-3 text-sm font-semibold text-slate-700"><ImagePlus className="h-5 w-5" /> Business logo<input type="file" accept="image/png,image/jpeg,image/webp" className="w-full min-w-0 text-xs" onChange={e => fileChanged(e,'logo')} /></label>
            </div>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900">2. Video look and length</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <label className="text-xs font-semibold text-slate-600">Visual style<select className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm" value={input.style} onChange={e=>changeInput({style:e.target.value as AdStyle})}><option value="bold">Bold</option><option value="luxury">Luxury</option><option value="fresh">Fresh</option></select></label>
              <label className="text-xs font-semibold text-slate-600">Format<select className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm" value={format} onChange={e=>setFormat(e.target.value as AdFormat)}><option value="vertical">9:16 Reels</option><option value="square">1:1 Square</option><option value="wide">16:9 Wide</option></select></label>
              <label className="text-xs font-semibold text-slate-600">Duration<select className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm" value={input.duration} onChange={e=>changeInput({duration:Number(e.target.value) as VideoAdInput['duration']})}><option value={12}>12 seconds</option><option value={15}>15 seconds</option><option value={20}>20 seconds</option></select></label>
            </div>
            <label className="mt-4 flex items-center gap-3 text-sm text-slate-700"><input type="checkbox" checked={music} onChange={e=>setMusic(e.target.checked)} /><Music2 className="h-4 w-4" /> Include built-in synthesized music (no licensed track)</label>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-bold text-slate-900">3. Script and scenes</h3><span className="rounded-full bg-indigo-50 px-3 py-1 text-xs text-indigo-700">{mode === 'gemini' ? 'Gemini script' : 'Free template script'}</span></div>
            <button type="button" onClick={generate} disabled={generating || exporting} className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"><Sparkles className="h-4 w-4" /> {generating ? 'Creating storyboard…' : 'Generate storyboard'}</button>
            <div className="mt-4 space-y-3">
              {script.scenes.map((scene,index)=>(
                <div key={index} className="grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-[45px_1fr]">
                  <span className="pt-3 text-xs font-bold text-slate-500">0{index+1}</span>
                  <div className="space-y-2">
                    <input aria-label={'Scene '+(index+1)+' title'} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold" maxLength={65} value={scene.title} onChange={e=>setScript(prev=>({...prev,scenes:prev.scenes.map((s,i)=>i===index?{...s,title:e.target.value}:s)}))} />
                    <input aria-label={'Scene '+(index+1)+' subtitle'} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs" maxLength={90} value={scene.subtitle} onChange={e=>setScript(prev=>({...prev,scenes:prev.scenes.map((s,i)=>i===index?{...s,subtitle:e.target.value}:s)}))} />
                  </div>
                </div>
              ))}
              <label className="block text-xs font-semibold text-slate-600">Copy-ready social media caption<textarea rows={3} maxLength={350} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm" value={script.caption} onChange={e=>setScript(prev=>({...prev,caption:e.target.value}))}/></label>
              <button type="button" onClick={()=>navigator.clipboard.writeText(script.caption).then(()=>setNotice('Caption copied.')).catch(()=>setError('Could not copy caption.'))} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold">Copy caption</button>
              <button type="button" onClick={()=>{setScript(templateScript(input));setMode('template');}} className="ml-2 inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold"><RefreshCw className="h-3 w-3" /> Reset text</button>
            </div>
          </section>
        </div>

        <div className="space-y-5 xl:sticky xl:top-5 xl:self-start">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between"><h3 className="text-sm font-bold text-slate-900">Live video preview</h3><span className="flex items-center gap-1 text-xs text-slate-500"><Play className="h-3 w-3" /> Looping</span></div>
            <div className="mt-4 flex min-h-80 items-center justify-center overflow-hidden rounded-xl bg-slate-950 p-3">
              <canvas ref={canvasRef} aria-label="Animated advertisement preview" className="block max-h-[520px] max-w-full rounded-md object-contain shadow-xl" style={{aspectRatio:SIZE[format][0]+'/'+SIZE[format][1],width:format==='vertical'?'min(100%,294px)':'100%',height:'auto'}}/>
            </div>
            <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-indigo-500 transition-[width]" style={{width:progress+'%'}} /></div>
            <p className="mt-3 text-xs leading-5 text-slate-500">Preview loops silently. If music is selected, it is added to the downloaded recording. The first export may require browser recording permission/support.</p>
            <button type="button" disabled={exporting||generating||!mime} onClick={exportVideo} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:opacity-50"><Video className="h-5 w-5" /> {exporting ? 'Recording '+Math.round(progress)+'%…' : 'Create video ('+(mime.includes('mp4')?'MP4':'WebM')+')'}</button>
            {videoUrl && <div className="mt-4 space-y-3 rounded-xl bg-emerald-50 p-3"><p className="text-xs font-bold text-emerald-800">Video exported locally · {videoType.toUpperCase()}</p><video controls playsInline src={videoUrl} className="max-h-72 w-full rounded-lg bg-slate-950"/><button type="button" onClick={download} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white"><Download className="h-4 w-4" /> Download {videoType.toUpperCase()}</button></div>}
            <p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">{notice}</p>
            {error && <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-800">{error}</p>}
            <p className="mt-3 text-xs leading-5 text-slate-500">No video API fees. Browser encoding may offer MP4 or WebM depending on codec support. This prototype does not upload videos or charge customers.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
