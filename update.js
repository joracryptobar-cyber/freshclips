const fs = require('fs');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');

// 1. TELEGRAM SCRAPER (Стабилен)
async function updateTelegramClips() {
    try {
        console.log('Starting Telegram clips extraction...');
        let allClips = [];
        let url = 'https://t.me/s/fresh_clips';
        
        for (let i = 0; i < 5; i++) {
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

// 2. VK SCRAPER (Та самая рабочая версия)
async function updateVKClips() {
    console.log('Starting VK extraction (Stable Version)...');
    let browser;
    try {
        browser = await puppeteer.launch({ 
            headless: "new", 
            args: ['--no-sandbox', '--disable-setuid-sandbox'] 
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // Возвращаемся на главную страницу профиля
        await page.goto('https://vkvideo.ru/@fresh_clips', { waitUntil: 'networkidle2', timeout: 60000 });
        
        // Ждем чуть дольше для прогрузки названий
        await new Promise(r => setTimeout(r, 7000));
        
        const clips = await page.evaluate(() => {
            let res = [];
            document.querySelectorAll('a').forEach(link => {
                const href = link.href || '';
                const match = href.match(/\/video(-?\d+)_(\d+)/);
                
                if (match) {
                    // УЛУЧШЕННЫЙ ПОИСК НАЗВАНИЯ: 
                    // Сначала ищем в aria-label (там обычно полное название), если нет - в тексте
                    let rawTitle = link.getAttribute('aria-label') || link.innerText || '';
                    let cleanTitle = rawTitle.replace(/\n/g, ' ').trim();
                    
                    // Если в название попало только время (напр. "3:04"), ставим заглушку
                    if (/^\d+:\d+$/.test(cleanTitle) || cleanTitle.length < 2) {
                        cleanTitle = "VK Clip 🔥";
                    }

                    // Ограничиваем длину
                    if (cleanTitle.length > 80) cleanTitle = cleanTitle.substring(0, 77) + '...';

                    res.push({
                        title: cleanTitle,
                        url: href,
                        playerUrl: `https://vk.com/video_ext.php?oid=${match[1]}&id=${match[2]}&hd=2&autoplay=1`,
                        image: link.querySelector('img')?.src || 'https://vk.com/images/video_empty.png'
                    });
                }
            });
            return res;
        });

        // Оставляем только уникальные и сохраняем
        const uniqueVK = Array.from(new Map(clips.map(item => [item.playerUrl, item])).values());
        fs.writeFileSync('vk_clips.json', JSON.stringify(uniqueVK.slice(0, 70), null, 4));
        console.log(`VK: Saved ${uniqueVK.length} clips.`);
        
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
