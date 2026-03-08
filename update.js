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

// 2. VK SCRAPER (Ультимативная версия с глубоким поиском картинок)
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
        
        // Увеличиваем область просмотра, чтобы ВК "думал", что мы видим всё сразу
        await page.setViewport({ width: 1280, height: 5000 });
        
        console.log('VK: Loading page...');
        await page.goto('https://vkvideo.ru/@fresh_clips/all', { waitUntil: 'networkidle2', timeout: 60000 });

        // Даем время на первичную прогрузку
        await new Promise(r => setTimeout(r, 5000));
        
        // Прокрутка для активации ленивой загрузки
        console.log('VK: Scrolling to activate content...');
        await page.evaluate(() => window.scrollBy(0, 4000));
        await new Promise(r => setTimeout(r, 3000));

        const clips = await page.evaluate(() => {
            let res = [];
            // Ищем все ссылки на видео
            const links = document.querySelectorAll('a[href*="/video"]');
            
            links.forEach(link => {
                const href = link.href;
                const match = href.match(/\/video(-?\d+)_(\d+)/);
                
                if (match) {
                    // 1. ПОИСК НАЗВАНИЯ (из атрибутов)
                    let title = link.getAttribute('aria-label') || link.title || "";
                    if (!title || /^\d+:\d+$/.test(title.trim())) {
                        const innerTitle = link.querySelector('[class*="title"], [class*="name"]');
                        if (innerTitle) title = innerTitle.innerText;
                    }
                    if (!title) title = "VK Clip 🔥";

                    // 2. ГЛУБОКИЙ ПОИСК КАРТИНКИ
                    let imgUrl = "";
                    
                    // Способ А: Тег img
                    const imgTag = link.querySelector('img');
                    if (imgTag && imgTag.src && !imgTag.src.includes('data:image')) {
                        imgUrl = imgTag.src;
                    }
                    
                    // Способ Б: Поиск в стилях (background-image)
                    if (!imgUrl) {
                        const allDivs = link.querySelectorAll('div');
                        allDivs.forEach(div => {
                            const bg = div.style.backgroundImage;
                            if (bg && bg.includes('url')) {
                                const m = bg.match(/url\(["']?([^"']+)["']?\)/);
                                if (m) imgUrl = m[1];
                            }
                        });
                    }

                    // Способ В: Поиск превью через вычисленные стили, если ВК спрятал их в классы
                    if (!imgUrl) {
                        const thumb = link.querySelector('[class*="thumb"], [class*="image"]');
                        if (thumb) {
                            const style = window.getComputedStyle(thumb);
                            const bg = style.backgroundImage;
                            if (bg && bg.includes('url')) {
                                const m = bg.match(/url\(["']?([^"']+)["']?\)/);
                                if (m) imgUrl = m[1];
                            }
                        }
                    }

                    res.push({
                        title: title.replace(/\n/g, ' ').trim(),
                        url: href,
                        playerUrl: `https://vk.com/video_ext.php?oid=${match[1]}&id=${match[2]}&hd=2&autoplay=1`,
                        image: imgUrl // Сохраняем, даже если пустая (потом разберемся)
                    });
                }
            });
            return res;
        });

        // Убираем дубликаты
        const uniqueVK = Array.from(new Map(clips.map(item => [item.playerUrl, item])).values());
        
        // Финальная проверка: если картинки всё же нет, подставим заглушку, чтобы сайт не был пустым
        const finalVK = uniqueVK.map(item => ({
            ...item,
            image: item.image || 'https://vk.com/images/video_empty.png'
        }));

        fs.writeFileSync('vk_clips.json', JSON.stringify(finalVK.slice(0, 100), null, 4));
        console.log(`VK: Found ${finalVK.length} clips.`);
        
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
