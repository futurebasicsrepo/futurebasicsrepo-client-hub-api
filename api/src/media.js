// ffmpeg helpers: probing uploads, converting them to web-safe H.264/AAC MP4, and grabbing poster frames.
import { spawn } from 'node:child_process';

export const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
export const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';

// Longest side 1920 (so 1080p landscape and portrait both fit), even dimensions for yuv420p.
const SCALE_1080 = `scale=w='if(gte(iw,ih),trunc(min(1920,iw)/2)*2,-2)':h='if(gte(iw,ih),-2,trunc(min(1920,ih)/2)*2)'`;
const COPYABLE_PIX = ['yuv420p', 'yuvj420p'];

export function run(bin, args, { timeoutMs = 30 * 60 * 1000, input } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4000); });
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(`${bin} exited with ${code ?? 'a signal'}: ${stderr.trim().split('\n').slice(-3).join(' ')}`));
    });
    if (input) child.stdin.end(input);
  });
}

let available;
export async function ffmpegAvailable() {
  if (process.env.TRANSCODE === 'off') return false;
  available ??= Promise.all([run(FFMPEG, ['-version']), run(FFPROBE, ['-version'])]).then(() => true, () => false);
  return available;
}

// Reduces ffprobe JSON to what the planner needs. Width/height are as displayed (rotation applied).
export function summarizeProbe(json) {
  const streams = json.streams || [];
  const video = streams.find(s => s.codec_type === 'video' && !s.disposition?.attached_pic);
  const audio = streams.find(s => s.codec_type === 'audio');
  const rotation = Number(video?.side_data_list?.find(d => d.rotation !== undefined)?.rotation ?? video?.tags?.rotate ?? 0);
  const quarter = Math.abs(rotation) % 180 === 90;
  const duration = Number(json.format?.duration ?? video?.duration);
  return {
    format: String(json.format?.format_name || ''),
    duration: Number.isFinite(duration) && duration > 0 ? duration : null,
    video: video ? {
      codec: video.codec_name,
      pixFmt: video.pix_fmt,
      width: quarter ? video.height : video.width,
      height: quarter ? video.width : video.height
    } : null,
    audio: audio ? { codec: audio.codec_name } : null
  };
}

export async function probe(file) {
  const out = await run(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { timeoutMs: 60_000 });
  return summarizeProbe(JSON.parse(out));
}

// Decide the cheapest path to a file every browser plays: remux when the streams are already
// H.264/AAC at ≤1080p, otherwise re-encode (iPhone HEVC, WebM/VP9, 4K, 10-bit, ProRes…).
const VIDEO_CONTAINERS = /mov|mp4|matroska|webm|avi|mpegts|mpeg|flv|3gp|asf/;

export function planTranscode(info) {
  // ffprobe will happily read random bytes as e.g. an ANSI "video"; only real containers go through.
  if (!VIDEO_CONTAINERS.test(info.format)) return { error: 'That file doesn’t look like a video.' };
  if (!info.video) return { error: 'We couldn’t find a video track in that file.' };
  const longSide = Math.max(info.video.width || 0, info.video.height || 0);
  const copyVideo = info.video.codec === 'h264' && COPYABLE_PIX.includes(info.video.pixFmt) && longSide <= 1920 && /mp4|mov/.test(info.format);
  const copyAudio = !info.audio || info.audio.codec === 'aac';
  return { copyVideo, copyAudio, mode: copyVideo && copyAudio ? 'remux' : 'transcode' };
}

export function transcodeArgs(plan, src, dst) {
  return [
    '-hide_banner', '-loglevel', 'error', '-y', '-i', src,
    '-map', '0:v:0', '-map', '0:a:0?', '-map_metadata', '-1',
    ...(plan.copyVideo ? ['-c:v', 'copy']
      : ['-vf', `${SCALE_1080},format=yuv420p`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-profile:v', 'high']),
    ...(plan.copyAudio ? ['-c:a', 'copy'] : ['-c:a', 'aac', '-b:a', '128k', '-ac', '2']),
    '-movflags', '+faststart', '-f', 'mp4', dst
  ];
}

export const transcode = (plan, src, dst) => run(FFMPEG, transcodeArgs(plan, src, dst));

export const posterFrame = (src, dst, at) => run(FFMPEG, [
  '-hide_banner', '-loglevel', 'error', '-y', '-ss', String(Math.max(0, at)), '-i', src,
  '-frames:v', '1', '-vf', `scale=w='if(gte(iw,ih),min(1280,iw),-2)':h='if(gte(iw,ih),-2,min(1280,ih))'`, '-q:v', '4', dst
], { timeoutMs: 60_000 });

// Rewrites a finished recording so it starts playing before it has fully downloaded.
export const faststart = (src, dst) => run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-c', 'copy', '-movflags', '+faststart', '-f', 'mp4', dst]);
