const fs = require('fs');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');

// 1. TELEGRAM SCRAPER
async function updateTelegramClips() {
    try {
        console.log('Starting Telegram clips extraction...');
        let allClips = [];
        let url = 'https://t.me/s/fresh_clips';
        for (let i = 0; i < 5; i++) {
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
                    const postUrl = $(el).find('.tgme_widget_message_date').attr('href') || '';
                    let title = $(el).find('.tgme_widget_message_text').text().trim().substring(0, 60) || 'TG Clip';
                    pageClips.push({ title, url: postUrl, image, timestamp: new Date().toISOString() });
                }
            });
            allClips = allClips.concat(pageClips.reverse());
            const moreLink = $('.tme_messages_more').attr('href');
            if (!moreLink) break; 
            url = 'https://t.me' + moreLink;
        }
        fs.writeFileSync('clips.json', JSON.stringify(allClips, null, 4));
        console.log(`TG: Saved ${allClips.length} clips.`);
    } catch (e) { console.error('TG Error:', e); }
}

// 2. VK SCRAPER (Улучшенная версия для /all)
async function updateVKClips() {
    console.log('Starting VK extraction from /all page...');
    let browser;
    try {
        browser = await puppeteer.launch({ 
            headless: "new", 
            args: ['--no-sandbox', '--disable-setuid-sandbox'] 
        });
        const page = await browser.newPage();
        
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1280, height: 1000 });

        console.log('VK: Loading /all page...');
        await page.goto('https://vkvideo.ru/@fresh_clips/all', { waitUntil: 'networkidle2', timeout: 90000 });

        // УМНАЯ ПРОКРУТКА: листаем вниз для прогрузки ленивых элементов
        console.log('VK: Scrolling to load titles and images...');
        for(let i = 0; i < 3; i++) {
            await page.evaluate(() => window.scrollBy(0, 2000));
            await new Promise(r => setTimeout(r, 2000)); 
        }

        const clips = await page.evaluate(() => {
            let res = [];
            document.querySelectorAll('a').forEach(link => {
                const href = link.href || '';
                const match = href.match(/\/video(-?\d+)_(\d+)/);
                
                if (match) {
                    // Ищем название в атрибутах (там оно всегда полное)
                    let titleCandidate = link.getAttribute('aria-label') || 
                                         link.title || 
                                         link.innerText.split('\n')[0];
                    
                    let cleanTitle = titleCandidate ? titleCandidate.trim() : 'VK Clip';
                    // Если название состоит только из цифр и двоеточия (время), сбрасываем его
                    if (/^\d+:\d+$/.test(cleanTitle)) cleanTitle = 'VK Clip';

                    let imgUrl = '';
                    const imgTag = link.querySelector('img');
                    if (imgTag && imgTag.src && !imgTag.src.includes('base64')) {
                        imgUrl = imgTag.src;
                    } else {
                        const bgEl = link.querySelector('[style*="background-image"]');
                        if (bgEl) {
                            const bgStyle = bgEl.style.backgroundImage;
                            const m = bgStyle.match(/url\(['"]?([^'")]+)[') ]/);
                            if (m) imgUrl = m[1];
                        }
                    }

                    if (imgUrl && cleanTitle !== 'VK Clip') {
                        res.push({
                            title: cleanTitle,
                            url: href,
                            playerUrl: `https://vk.com/video_ext.php?oid=${match[1]}&id=${match[2]}&hd=2&autoplay=1`,
                            image: imgUrl
                        });
                    }
                }
            });
            return res;
        });

        const uniqueVK = Array.from(new Map(clips.map(item => [item.playerUrl, item])).values());
        fs.writeFileSync('vk_clips.json', JSON.stringify(uniqueVK, null, 4));
        console.log(`VK: Successfully saved ${uniqueVK.length} unique clips with correct titles and images.`);
        
    } catch (e) { 
        console.error('VK Error:', e.message); 
    } finally { 
        if (browser) await browser.close(); 
    }
}

async function runTasks() {
    await updateTelegramClips();
    await updateVKClips();
}

runTasks();
