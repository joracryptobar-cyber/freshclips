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

async function updateVKClips() {
    console.log('Starting VK extraction...');
    let browser;
    try {
        browser = await puppeteer.launch({ 
            headless: "new", 
            args: ['--no-sandbox', '--disable-setuid-sandbox'] 
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
        
        console.log('VK: Loading page...');
        // Пробуем зайти на страницу видео (без /all для стабильности)
        await page.goto('https://vkvideo.ru/@fresh_clips/all/', { waitUntil: 'networkidle2', timeout: 60000 });
        
        console.log('VK: Scrolling...');
        // Простая прокрутка вниз
        await page.evaluate(() => window.scrollBy(0, 3000));
        await new Promise(r => setTimeout(r, 5000));

        const clips = await page.evaluate(() => {
            let res = [];
            // Собираем вообще все ссылки на странице
            const allLinks = document.querySelectorAll('a');
            
            allLinks.forEach(link => {
                const href = link.href || '';
                // Ищем паттерн видео ID
                const match = href.match(/\/video(-?\d+)_(\d+)/);
                
                if (match) {
                    // Пытаемся вытащить хоть какой-то текст для названия
                    let title = link.getAttribute('aria-label') || 
                                link.title || 
                                link.innerText.split('\n')[0] || 
                                "VK Clip 🔥";

                    // Очистка от времени (если в названии только цифры и двоеточие)
                    if (/^\d+:\d+$/.test(title.trim())) title = "VK Clip 🔥";

                    // Ищем картинку внутри этой ссылки или рядом
                    let img = link.querySelector('img')?.src || "";

                    res.push({
                        title: title.trim(),
                        url: href,
                        playerUrl: `https://vk.com/video_ext.php?oid=${match[1]}&id=${match[2]}&hd=2&autoplay=1`,
                        image: img
                    });
                }
            });
            return res;
        });

        // Фильтруем дубликаты и пустые обложки (если нужно)
        const uniqueVK = Array.from(new Map(clips.map(item => [item.playerUrl, item])).values());
        
        // Если совсем ничего не нашли, запишем пустой массив, чтобы не ломать сайт
        fs.writeFileSync('vk_clips.json', JSON.stringify(uniqueVK.slice(0, 60), null, 4));
        console.log(`VK: Found ${clips.length} raw links, saved ${uniqueVK.length} unique clips.`);
        
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
