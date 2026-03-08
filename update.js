const fs = require('fs');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');

// ==========================================
// 1. СБОРЩИК TELEGRAM
// ==========================================
async function updateTelegramClips() {
    try {
        console.log('Starting Telegram clips extraction...');
        let allClips = [];
        let url = 'https://t.me/s/fresh_clips';
        let pagesToFetch = 5; 

        for (let i = 0; i < pagesToFetch; i++) {
            console.log(`TG: Loading page ${i + 1}...`);
            const response = await fetch(url);
            const html = await response.text();
            const $ = cheerio.load(html);

            let pageClips = [];

            $('.tgme_widget_message').each((index, el) => {
                const videoThumb = $(el).find('.tgme_widget_message_video_thumb');
                if (videoThumb.length > 0) {
                    const style = videoThumb.attr('style') || '';
                    const imgMatch = style.match(/url\(['"]?([^'")]+)['"]?\)/);
                    const image = imgMatch ? imgMatch[1] : '';

                    const dateLinkEl = $(el).find('.tgme_widget_message_date');
                    const postUrl = dateLinkEl.attr('href') || 'https://t.me/fresh_clips';
                    
                    let timestamp = '';
                    const timeEl = $(el).find('.tgme_widget_message_date time');
                    if (timeEl.length > 0) { timestamp = timeEl.attr('datetime') || ''; }

                    let views = '';
                    const viewsEl = $(el).find('.tgme_widget_message_views');
                    if (viewsEl.length > 0) { views = viewsEl.text().trim(); }

                    let title = 'New Clip 🔥';
                    const textEl = $(el).find('.tgme_widget_message_text');
                    if (textEl.length > 0) {
                        let rawText = textEl.text();
                        rawText = rawText.replace('Премьера клипа! ', '');
                        rawText = rawText.split('#')[0].trim();
                        title = rawText.length > 70 ? rawText.substring(0, 67) + '...' : rawText;
                        if (!title) title = 'New Clip 🔥';
                    }
                    pageClips.push({ title, url: postUrl, image, timestamp, views });
                }
            });

            allClips = allClips.concat(pageClips.reverse());
            const moreLink = $('.tme_messages_more').attr('href');
            if (!moreLink) break; 
            url = 'https://t.me' + moreLink;
        }

        const uniqueClips = Array.from(new Map(allClips.map(item => [item.url, item])).values());
        fs.writeFileSync('clips.json', JSON.stringify(uniqueClips, null, 4));
        console.log(`TG: Successfully saved ${uniqueClips.length} clips.`);
    } catch (error) {
        console.error('TG ERROR:', error);
    }
}

// ==========================================
// 2. СБОРЩИК ВКОНТАКТЕ (PUPPETEER ДЛЯ СЕРВЕРА)
// ==========================================
async function updateVKClips() {
    console.log('Starting VK clips extraction (via Headless Chrome)...');
    let browser;
    try {
        // Серверные настройки для Chrome (чтобы не падал на Linux)
        browser = await puppeteer.launch({ 
            headless: "new", 
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled']
        });
        const page = await browser.newPage();
        
        // Маскируемся под обычный Windows
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        console.log('VK: Navigating to page...');
        await page.goto('https://vkvideo.ru/@fresh_clips', { waitUntil: 'networkidle2', timeout: 60000 });
        
        console.log('VK: Waiting 5 seconds and scrolling...');
        await new Promise(r => setTimeout(r, 5000));
        await page.evaluate(() => window.scrollBy(0, 1000));
        await new Promise(r => setTimeout(r, 2000));
        
        console.log('VK: Extracting video data...');
        const clips = await page.evaluate(() => {
            let results = [];
            let links = document.querySelectorAll('a');
            
            links.forEach(link => {
                const url = link.href;
                if (!url) return;

                const match = url.match(/\/video(-?\d+)_(\d+)/);
                if (match) {
                    const ownerId = match[1];
                    const vidId = match[2];
                    const playerUrl = `https://vk.com/video_ext.php?oid=${ownerId}&id=${vidId}&hd=2&autoplay=1`;
                    
                    let title = link.getAttribute('aria-label') || link.title || link.innerText || 'VK Clip 🔥';
                    title = title.replace(/\n/g, ' ').trim();
                    if (title === '') title = 'VK Clip 🔥';
                    if (title.length > 70) title = title.substring(0, 67) + '...';
                    
                    let image = 'https://vk.com/images/video_empty.png';
                    const img = link.querySelector('img');
                    if (img && img.src) {
                        image = img.src;
                    } else {
                        const bgEl = link.querySelector('[style*="background-image"]') || link;
                        if (bgEl && bgEl.style && bgEl.style.backgroundImage) {
                            const bgStyle = bgEl.style.backgroundImage;
                            const imgMatch = bgStyle.match(/url\(['"]?([^'")]+)['"]?\)/);
                            if (imgMatch) image = imgMatch[1];
                        }
                    }
                    
                    results.push({ title, url, playerUrl, image, views: 'VK', timestamp: new Date().toISOString() });
                }
            });
            return results;
        });

        const uniqueClips = Array.from(new Map(clips.map(item => [item.playerUrl, item])).values());

        if (uniqueClips.length > 0) {
            fs.writeFileSync('vk_clips.json', JSON.stringify(uniqueClips.slice(0, 50), null, 4));
            console.log(`VK: SUCCESS! Found ${uniqueClips.length} clips.`);
        } else {
            console.log('VK WARNING: No clips found. VK might be blocking the headless browser with a Captcha.');
        }

    } catch (error) {
        console.error('VK ERROR:', error.message);
    } finally {
        if (browser) {
            console.log('VK: Closing browser...');
            await browser.close();
        }
    }
