#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const STORE = path.join(ROOT, 'store-assets');
const { version } = require(path.join(ROOT, 'package.json'));

const sourceDemo = path.join(STORE, 'demo.webm');
const landscapeCover = path.join(STORE, 'promo-video-thumbnail-1280x720.png');
const shortCover = path.join(STORE, 'promo-short-thumbnail-1080x1920.png');
const landscapeVideo = path.join(STORE, `skillbridge-v${version}-demo-landscape.mp4`);
const shortVideo = path.join(STORE, `skillbridge-v${version}-demo-short.mp4`);
const manifestPath = path.join(STORE, 'promo-media-manifest.json');

function assertFile(file) {
  if (!fs.existsSync(file) || fs.statSync(file).size < 1024) {
    throw new Error(`Missing or empty promo input: ${path.relative(ROOT, file)}`);
  }
}

function run(binary, args) {
  const result = spawnSync(binary, args, { cwd: ROOT, encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${binary} failed (${result.status}):\n${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function probe(file) {
  const output = run('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=codec_name,width,height,r_frame_rate:format=duration,size',
    '-of',
    'json',
    file,
  ]);
  const parsed = JSON.parse(output);
  const stream = parsed.streams?.[0];
  return {
    codec: stream?.codec_name,
    width: stream?.width,
    height: stream?.height,
    fps: stream?.r_frame_rate,
    durationSeconds: Number(parsed.format?.duration || 0),
    bytes: Number(parsed.format?.size || 0),
  };
}

for (const file of [sourceDemo, landscapeCover, shortCover]) assertFile(file);
run('ffmpeg', ['-version']);

const encodeArgs = ['-an', '-r', '25', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p'];

run('ffmpeg', [
  '-y',
  '-loop',
  '1',
  '-framerate',
  '25',
  '-i',
  landscapeCover,
  '-i',
  sourceDemo,
  '-loop',
  '1',
  '-framerate',
  '25',
  '-i',
  landscapeCover,
  '-filter_complex',
  [
    '[0:v]fps=25,scale=1280:720,trim=duration=2.4,setpts=PTS-STARTPTS,format=yuv420p[intro]',
    '[1:v]fps=25,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:#17192a,setsar=1,setpts=1.15*(PTS-STARTPTS),format=yuv420p[demo]',
    '[2:v]fps=25,scale=1280:720,trim=duration=1.8,setpts=PTS-STARTPTS,format=yuv420p[outro]',
    '[intro][demo][outro]concat=n=3:v=1:a=0[outv]',
  ].join(';'),
  '-map',
  '[outv]',
  ...encodeArgs,
  '-movflags',
  '+faststart',
  landscapeVideo,
]);

run('ffmpeg', [
  '-y',
  '-loop',
  '1',
  '-framerate',
  '25',
  '-i',
  shortCover,
  '-i',
  sourceDemo,
  '-loop',
  '1',
  '-framerate',
  '25',
  '-i',
  shortCover,
  '-filter_complex',
  [
    '[0:v]fps=25,scale=1080:1920,trim=duration=2.4,setpts=PTS-STARTPTS,format=yuv420p[intro]',
    'color=c=#17192a:s=1080x1920:r=25[bg]',
    '[1:v]fps=25,scale=1000:-2,setsar=1,setpts=1.15*(PTS-STARTPTS)[demo-small]',
    '[bg][demo-small]overlay=(W-w)/2:(H-h)/2:shortest=1,format=yuv420p[demo]',
    '[2:v]fps=25,scale=1080:1920,trim=duration=1.8,setpts=PTS-STARTPTS,format=yuv420p[outro]',
    '[intro][demo][outro]concat=n=3:v=1:a=0[outv]',
  ].join(';'),
  '-map',
  '[outv]',
  ...encodeArgs,
  '-movflags',
  '+faststart',
  shortVideo,
]);

const assets = [landscapeVideo, shortVideo].map((file) => ({
  path: path.relative(ROOT, file),
  sha256: sha256(file),
  ...probe(file),
}));

for (const asset of assets) {
  if (asset.codec !== 'h264' || asset.durationSeconds < 10 || asset.bytes < 100_000) {
    throw new Error(`Promo output failed validation: ${JSON.stringify(asset)}`);
  }
}

const manifest = {
  schemaVersion: 1,
  product: 'SkillBridge',
  version,
  status: 'release-candidate',
  publicIdentity: 'Heznpc',
  source: {
    path: path.relative(ROOT, sourceDemo),
    sha256: sha256(sourceDemo),
    runtime: 'dist/bundled',
    captureEnvironment: 'neutral deterministic fixture; not the live Skilljar UI',
  },
  claimGuard: 'Do not claim the release is live until the CWS listing shows v3.5.42.',
  supportedClaims: [
    'Translates supported AI-course lessons into 32 interface languages.',
    'Provides local learning tools including progress and flashcards.',
    'Leaves quiz answer choices untranslated in exam mode.',
    'The CWS bundle omits the AI Tutor, Puter SDK, and page bridge.',
  ],
  assets,
};

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(
  `Promo media ready:\n${assets.map((asset) => `- ${asset.path} (${asset.width}x${asset.height}, ${asset.durationSeconds.toFixed(2)}s)`).join('\n')}`,
);
