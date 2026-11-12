// Kodla çizilen (HTML/CSS/SVG) animasyonu kare kare MP4'e çevirir. Ücretsiz, yerel.
// Kullanım: node render.js <sayfa.html> <çıktı.mp4> <süre_sn> [genişlik] [yükseklik] [fps]
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
(async () => {
  const [html, out, dur, w = 1080, h = 1920, fps = 30] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
  await page.goto('file://' + path.resolve(html) + (process.argv[8] ? '?' + process.argv[8] : ''));
  await page.evaluate(() => document.fonts.ready);
  const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
    '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-shortest',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const frames = Math.round(dur * fps);
  for (let f = 0; f < frames; f++) {
    await page.evaluate(ms => document.getAnimations().forEach(a => { a.pause(); a.currentTime = ms; }), f * 1000 / fps);
    const buf = await page.screenshot({ type: 'jpeg', quality: 96 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  await browser.close();
})();
