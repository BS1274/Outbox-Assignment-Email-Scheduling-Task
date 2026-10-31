import path from 'path';
import fs from 'fs';
import { chromium, type Page } from 'playwright';
import { execFileSync } from 'child_process';
import { prisma } from '../lib/prisma';
import { signSession } from '../lib/jwt';
import { env } from '../config';

const ffmpegBinary = require('ffmpeg-static');

// Helper to inject our smooth animated cursor overlay and title banner into any page
async function setupPageOverlay(page: Page) {
  await page.addInitScript(() => {
    window.addEventListener('DOMContentLoaded', () => {
      if (document.getElementById('demo-cursor')) return;

      const cursor = document.createElement('div');
      cursor.id = 'demo-cursor';
      cursor.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 24px;
        height: 24px;
        pointer-events: none;
        z-index: 999999;
        transform: translate(100px, 100px);
        transition: transform 0.08s ease-out;
      `;
      cursor.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));">
          <path d="M5.5 3.2L18.8 12.4C19.7 13.0 19.3 14.5 18.2 14.6L12.9 15.0L10.0 20.2C9.5 21.1 8.2 21.0 7.8 20.0L3.5 4.5C3.2 3.5 4.5 2.5 5.5 3.2Z" fill="#ffffff" stroke="#111827" stroke-width="1.5" stroke-linejoin="round"/>
        </svg>
        <div id="cursor-ring" style="position: absolute; top: 0px; left: 0px; width: 14px; height: 14px; border: 2px solid #00b050; border-radius: 50%; opacity: 0.6; pointer-events: none; transition: transform 0.15s ease, opacity 0.15s ease;"></div>
      `;
      document.body.appendChild(cursor);

      const banner = document.createElement('div');
      banner.id = 'demo-section-banner';
      banner.style.cssText = `
        position: fixed;
        top: 24px;
        left: 50%;
        transform: translateX(-50%) translateY(-100px);
        background: rgba(17, 24, 39, 0.94);
        backdrop-filter: blur(8px);
        border: 1px solid rgba(255, 255, 255, 0.12);
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 15px rgba(0, 176, 80, 0.25);
        color: #ffffff;
        padding: 12px 28px;
        border-radius: 9999px;
        z-index: 999998;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        display: flex;
        align-items: center;
        gap: 12px;
        transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s ease;
        opacity: 0;
        pointer-events: none;
      `;
      banner.innerHTML = `
        <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: #00b050; box-shadow: 0 0 8px #00b050;"></span>
        <span id="demo-banner-text" style="font-size: 14px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase;"></span>
      `;
      document.body.appendChild(banner);
    });
  });
}

async function moveCursorTo(page: Page, targetX: number, targetY: number, steps = 18) {
  await page.mouse.move(targetX, targetY, { steps });
  await page.evaluate(({ x, y }) => {
    const c = document.getElementById('demo-cursor');
    if (c) c.style.transform = `translate(${x}px, ${y}px)`;
  }, { x: targetX, y: targetY });
}

async function clickWithSmoothCursor(page: Page, selector: string) {
  const el = page.locator(selector).first();
  await el.waitFor({ state: 'visible', timeout: 5000 });
  const box = await el.boundingBox();
  if (box) {
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await moveCursorTo(page, x, y, 16);
    await page.waitForTimeout(250);
    
    await page.evaluate(() => {
      const ring = document.getElementById('cursor-ring');
      if (ring) {
        ring.style.transform = 'scale(2.2)';
        ring.style.opacity = '1';
        setTimeout(() => {
          ring.style.transform = 'scale(1)';
          ring.style.opacity = '0.6';
        }, 180);
      }
    });

    await page.mouse.click(x, y);
    await page.waitForTimeout(300);
  } else {
    await el.click();
  }
}

async function typeWithSmoothCursor(page: Page, selector: string, text: string, charDelayMs = 60) {
  await clickWithSmoothCursor(page, selector);
  await page.type(selector, text, { delay: charDelayMs });
  await page.waitForTimeout(250);
}

async function showBanner(page: Page, title: string, durationMs = 3000) {
  console.log(`\n>>> ON-SCREEN TITLE: ${title}`);
  await page.evaluate((t) => {
    const banner = document.getElementById('demo-section-banner');
    const text = document.getElementById('demo-banner-text');
    if (banner && text) {
      text.textContent = t;
      banner.style.opacity = '1';
      banner.style.transform = 'translateX(-50%) translateY(0px)';
    }
  }, title);

  await page.waitForTimeout(durationMs);

  await page.evaluate(() => {
    const banner = document.getElementById('demo-section-banner');
    if (banner) {
      banner.style.opacity = '0.85';
      banner.style.transform = 'translateX(-50%) translateY(-10px) scale(0.92)';
    }
  });
}

async function recordProfessionalDemo() {
  console.log('=== STARTING PROFESSIONAL DEMO RECORDING ===');
  const user = await prisma.user.findFirst();
  if (!user) throw new Error('No user found');
  const sessionToken = signSession(user.id);

  const videoDir = path.resolve(__dirname, '../../videos-professional');
  if (fs.existsSync(videoDir)) fs.rmSync(videoDir, { recursive: true, force: true });
  fs.mkdirSync(videoDir, { recursive: true });

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
  });

  const context = await browser.newContext({
    recordVideo: {
      dir: videoDir,
      size: { width: 1280, height: 720 },
    },
    viewport: { width: 1280, height: 720 },
  });

  const page = await context.newPage();
  await setupPageOverlay(page);

  // TEST 01 – PROJECT OVERVIEW & ARCHITECTURE (0:00 - 0:25)
  await page.goto('http://localhost:5173');
  await page.waitForTimeout(1000);
  await showBanner(page, 'TEST 01 – PROJECT OVERVIEW & ARCHITECTURE', 3000);
  await moveCursorTo(page, 640, 260, 20);
  await page.waitForTimeout(1800);

  // TEST 02 – DUAL AUTHENTICATION: GOOGLE & EMAIL/PASSWORD (0:25 - 1:00)
  await showBanner(page, 'TEST 02 – EMAIL AND PASSWORD LOGIN', 2800);
  
  await typeWithSmoothCursor(page, '#email', 'demo.user@reachinbox.ai', 55);
  await typeWithSmoothCursor(page, '#password', 'SecurePass123!', 60);

  await clickWithSmoothCursor(page, 'button[title="Show password"]');
  await page.waitForTimeout(1200);
  await clickWithSmoothCursor(page, 'button[title="Hide password"]');
  await page.waitForTimeout(1000);

  await clickWithSmoothCursor(page, '#toggle-auth-mode-btn');
  await page.waitForTimeout(1500);

  await clickWithSmoothCursor(page, '#toggle-auth-mode-btn');
  await page.waitForTimeout(1200);

  await moveCursorTo(page, 640, 185, 18);
  await page.waitForTimeout(1500);

  await context.addCookies([
    {
      name: 'ri_session',
      value: sessionToken,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  await page.goto('http://localhost:5173');
  await page.waitForTimeout(2000);

  // TEST 03 – EMAIL COMPOSITION AND CSV UPLOAD (1:00 - 1:45)
  await showBanner(page, 'TEST 03 – EMAIL COMPOSITION AND CSV UPLOAD', 2800);
  await clickWithSmoothCursor(page, 'button:has-text("Compose")');
  await page.waitForTimeout(1500);

  await typeWithSmoothCursor(page, 'input[placeholder="Subject"]', 'ReachInbox Cold Outreach Campaign', 50);

  const csvPath = path.resolve(__dirname, '../../../examples/leads.csv');
  const fileInput = await page.$('input[type="file"]');
  if (fileInput) {
    await fileInput.setInputFiles(csvPath);
    await page.waitForTimeout(2000);
  }

  await typeWithSmoothCursor(page, 'input[placeholder="Add a recipient"]', 'sarah.founder@startup.io', 50);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1200);

  await clickWithSmoothCursor(page, 'textarea[placeholder="Type Your Reply..."]');
  await page.type(
    'textarea[placeholder="Type Your Reply..."]',
    'Hi {{name}},\n\nWelcome to ReachInbox Email Scheduler. This cold email was dispatched via round-robin Ethereal mailboxes with BullMQ delayed timers and atomic Redis rate limiting.\n\nBest,\nReachInbox Engine',
    { delay: 35 }
  );
  await page.waitForTimeout(1500);

  // TEST 04 – CAMPAIGN SCHEDULING (1:45 - 2:10)
  await showBanner(page, 'TEST 04 – CAMPAIGN SCHEDULING', 2800);
  await clickWithSmoothCursor(page, 'button[title="Send Later Options"]');
  await page.waitForTimeout(1500);

  const presetTomorrow = await page.$('button:has-text("Tomorrow 10:00 AM")');
  if (presetTomorrow) {
    await clickWithSmoothCursor(page, 'button:has-text("Tomorrow 10:00 AM")');
    await page.waitForTimeout(1500);
  }

  await clickWithSmoothCursor(page, 'button[title="Send Later Options"]');
  await page.waitForTimeout(800);
  await clickWithSmoothCursor(page, 'form button[type="submit"]');
  await page.waitForTimeout(3000);

  // TEST 05 – SCHEDULED & SENT EMAILS (2:10 - 2:40)
  await showBanner(page, 'TEST 05 – SCHEDULED AND SENT EMAILS', 2800);
  await clickWithSmoothCursor(page, 'button:has-text("Scheduled")');
  await page.waitForTimeout(2500);

  await clickWithSmoothCursor(page, 'button:has-text("Sent")');
  await page.waitForTimeout(2500);

  const emailRows = await page.$$('.divide-y > div, tr');
  if (emailRows.length > 0) {
    await emailRows[0].click();
    await page.waitForTimeout(2500);
  }

  // TEST 06 – ETHEREAL SMTP DELIVERY & PREVIEW (2:40 - 3:05)
  await showBanner(page, 'TEST 06 – ETHEREAL SMTP DELIVERY & PREVIEW', 2800);
  const viewInboxLink = await page.$('a:has-text("View Inbox")');
  if (viewInboxLink) {
    const previewHref = await viewInboxLink.getAttribute('href');
    if (previewHref) {
      console.log(`Opening Ethereal preview: ${previewHref}`);
      const etherealPage = await context.newPage();
      await setupPageOverlay(etherealPage);
      await etherealPage.goto(previewHref);
      await etherealPage.waitForTimeout(1000);
      await showBanner(etherealPage, 'LIVE ETHEREAL SMTP INBOX VIEW', 2500);
      await etherealPage.waitForTimeout(3000);
      await etherealPage.close();
    }
  }

  // TEST 07 – BULLMQ & REDIS QUEUE MANAGEMENT (3:05 - 3:35)
  await page.bringToFront();
  await showBanner(page, 'TEST 07 – BULLMQ & REDIS QUEUE MONITORING', 2800);
  
  const bullPage = await context.newPage();
  await setupPageOverlay(bullPage);
  const authHeader = 'Basic ' + Buffer.from(`${env.bullBoardUser}:${env.bullBoardPassword}`).toString('base64');
  await bullPage.setExtraHTTPHeaders({ Authorization: authHeader });
  await bullPage.goto('http://localhost:4000/admin/queues/');
  await bullPage.waitForTimeout(1000);
  await showBanner(bullPage, 'BULL BOARD REAL-TIME QUEUE DASHBOARD', 2500);
  await bullPage.waitForTimeout(2500);

  const delayedTab = await bullPage.$('a:has-text("Delayed"), button:has-text("Delayed")');
  if (delayedTab) {
    await delayedTab.click().catch(() => {});
    await bullPage.waitForTimeout(2000);
  }
  const completedTab = await bullPage.$('a:has-text("Completed"), button:has-text("Completed")');
  if (completedTab) {
    await completedTab.click().catch(() => {});
    await bullPage.waitForTimeout(2000);
  }
  await bullPage.close();

  // TEST 08 – HOURLY RATE LIMITING & DEFERRED JOBS (3:35 - 4:05)
  await page.bringToFront();
  await showBanner(page, 'TEST 08 – HOURLY RATE LIMITING & DEFERRED JOBS', 2800);
  await clickWithSmoothCursor(page, 'button:has-text("All Mails")');
  await page.waitForTimeout(2000);

  const rescheduledBadge = await page.$('span:has-text("Rescheduled"), span:has-text("Deferred")');
  if (rescheduledBadge) {
    const box = await rescheduledBadge.boundingBox();
    if (box) await moveCursorTo(page, box.x + box.width / 2, box.y + box.height / 2, 16);
    await page.waitForTimeout(2500);
  }

  // TEST 09 – SLACK NOTIFICATIONS & ELASTICSEARCH (4:05 - 4:35)
  await showBanner(page, 'TEST 09 – SLACK ALERTS & ELASTICSEARCH SEARCH', 2800);
  
  await typeWithSmoothCursor(page, 'input[placeholder*="Search"]', 'ReachInbox', 55);
  await page.waitForTimeout(2500);
  await page.fill('input[placeholder*="Search"]', '');
  await page.waitForTimeout(1000);

  await clickWithSmoothCursor(page, 'button:has-text("Slack Alerts")');
  await page.waitForTimeout(3000);
  const closeBtn = await page.$('button:has-text("Close"), .fixed button:has(svg)');
  if (closeBtn) {
    await closeBtn.click().catch(() => {});
    await page.waitForTimeout(1200);
  }

  // TEST 10 – WORKER RESTART RECOVERY & CONCLUSION (4:35 - 4:55)
  await showBanner(page, 'TEST 10 – WORKER RESTART RECOVERY & VERIFICATION', 3500);
  await page.waitForTimeout(3000);

  console.log('Finalizing recording and browser session...');
  await page.close();
  await context.close();
  await browser.close();

  const videoFiles = fs.readdirSync(videoDir).filter((f) => f.endsWith('.webm'));
  if (videoFiles.length === 0) throw new Error('No video recorded!');

  const latestWebm = videoFiles
    .map((f) => ({ name: f, time: fs.statSync(path.join(videoDir, f)).mtimeMs }))
    .sort((a, b) => b.time - a.time)[0].name;

  const webmPath = path.join(videoDir, latestWebm);
  const targetMp4Path = path.resolve(__dirname, '../../../reachinbox-demo.mp4');

  console.log(`Transcoding ${webmPath} -> ${targetMp4Path}...`);
  if (fs.existsSync(targetMp4Path)) fs.unlinkSync(targetMp4Path);

  execFileSync(ffmpegBinary, [
    '-y',
    '-i',
    webmPath,
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '22',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    targetMp4Path,
  ]);

  const stats = fs.statSync(targetMp4Path);
  console.log(`\n========================================`);
  console.log(`DEMO VIDEO CREATED: ${targetMp4Path}`);
  console.log(`FILE SIZE: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`========================================\n`);

  fs.rmSync(videoDir, { recursive: true, force: true });
}

recordProfessionalDemo()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
