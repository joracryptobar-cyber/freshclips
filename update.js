const fs = require('fs');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');

// 1. TELEGRAM SCRAPER (Оставляем рабочую версию)
async function updateTelegramClips() {
    try {
        console.log('Starting Telegram extraction...');
        let allClips = [];
        let url = 'https://t.me/s/fresh_clips';
        for (let i = 0; i < 5; i++) {
            const response = await fetch(url);
            const html = await response.text();
            const $ = cheerio.load(html);
            $('.tgme_widget_message').each((index, el) => {
                const videoThumb = $(el).find('.tgme_widget_message_video_thumb');
                if (videoThumb.length > 0) {
                    const style = videoThumb.attr('style') || '';
                    const imgMatch = style.match(/url\(['"]?([^'")]+)['"]?\)/);
                    const image = imgMatch ? imgMatch[1] : '';
                    const postUrl = $(el).find('.tgme_widget_message_date').attr('href') || '';
                    let title = $(el).find('.tgme_widget_message_text').text().trim().substring(0, 60) || 'TG Clip';
                    allClips.push({ title, url: postUrl, image, timestamp: new Date().toISOString() });
                }
            });
            const moreLink = $('.tme_messages_more').attr('href');
            if (!moreLink) break; 
            url = 'https://t.me' + moreLink;
        }
        fs.writeFileSync('clips.json', JSON.stringify(allClips, null, 4));
        console.log(`TG: Saved ${allClips.length} clips.`);
    } catch (e) { console.error('TG Error:', e); }
}

// 2. VK SCRAPER (Улучшенная маскировка и поиск)
async function updateVKClips() {
    console.log('Starting VK extraction...');
    let browser;
    try {
        browser = await puppeteer.launch({ 
            headless: "new", 
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled' // Скрываем, что мы бот
            ] 
        });
        const page = await browser.newPage();
        
        // Маскируемся под свежий Chrome на Windows
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1280, height: 1600 });

        console.log('VK: Navigating to page...');
        await page.goto('https://vkvideo.ru/@fresh_clips/all/', { waitUntil: 'networkidle2', timeout: 60000 });

        // Проверка: не выкинуло ли нас на логин?
        const currentUrl = page.url();
        console.log(`VK: Current browser URL: ${currentUrl}`);

        console.log('VK: Waiting and scrolling...');
        await new Promise(r => setTimeout(r, 5000));
        await page.evaluate(() => window.scrollBy(0, 3000));
        await new Promise(r => setTimeout(r, 3000));

        const clips = await page.evaluate(() => {
            const results = [];
            // Ищем вообще все ссылки
            const links = document.querySelectorAll('a');
            
            links.forEach(link => {
                const href = link.href || '';
                // Ищем ссылки формата /video-123_456
                const match = href.match(/video(-?\d+)_(\d+)/);
                
                if (match) {
                    const oid = match[1];
                    const vid = match[2];
                    
                    // Собираем название: из aria-label (лучший вариант) или title
                    let title = link.getAttribute('aria-label') || link.title || "";
                    
                    // Если название - это просто время (типа 3:05), сбрасываем его
                    if (/^\d+:\d+$/.test(title.trim())) title = "";

                    // Если всё еще пусто, ищем текст внутри
                    if (!title) {
                        title = link.innerText.split('\n')[0];
                    }

                    // Поиск картинки (img или фон)
                    let img = "";
                    const imgTag = link.querySelector('img');
                    if (imgTag && imgTag.src && !imgTag.src.includes('data:')) {
                        img = imgTag.src;
                    } else {
                        const style = window.getComputedStyle(link);
                        if (style.backgroundImage.includes('url')) {
                            const m = style.backgroundImage.match(/url\(["']?([^"']+)["']?\)/);
                            if (m) img = m[1];
                        }
                    }

                    results.push({
                        title: (title || "VK Clip 🔥").trim().substring(0, 80),
                        url: href,
                        playerUrl: `https://vk.com/video_ext.php?oid=${oid}&id=${vid}&hd=2&autoplay=1`,
                        image: img
                    });
                }
            });
            return results;
        });

        // Оставляем только уникальные по ссылке на плеер
        const uniqueVK = Array.from(new Map(clips.map(c => [c.playerUrl, c])).values());
        
        // Подставляем заглушку для пустых картинок
        const finalVK = uniqueVK.map(c => ({
            ...c,
            image: c.image || 'https://vk.com/images/video_empty.png'
        }));

        fs.writeFileSync('vk_clips.json', JSON.stringify(finalVK.slice(0, 80), null, 4));
        console.log(`VK: Successfully saved ${finalVK.length} clips.`);
        
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
