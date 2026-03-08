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

// 2. VK SCRAPER (PUPPETEER)
async function updateVKClips() {
    console.log('Starting VK extraction...');
    let browser;
    try {
        browser = await puppeteer.launch({ 
            headless: "new", 
            args: ['--no-sandbox', '--disable-setuid-sandbox'] 
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36');
        
        // Устанавливаем большой размер окна, чтобы видеть больше карточек сразу
        await page.setViewport({ width: 1280, height: 2000 });
        
        console.log('VK: Loading page...');
        await page.goto('https://vkvideo.ru/@fresh_clips/all/', { waitUntil: 'networkidle2', timeout: 60000 });

        // --- БЛОК ПРОКРУТКИ (SCROLLING) ---
        console.log('VK: Scrolling to load images...');
        await page.evaluate(async () => {
            await new Promise((resolve) => {
                let totalHeight = 0;
                let distance = 600; // Прокручиваем по 600 пикселей
                let timer = setInterval(() => {
                    window.scrollBy(0, distance);
                    totalHeight += distance;
                    // Прокручиваем 5 раз (хватит для первых 50-60 клипов)
                    if(totalHeight >= 3000){
                        clearInterval(timer);
                        resolve();
                    }
                }, 400); // Пауза между скроллами
            });
        });

        // Ждем еще чуть-чуть после скролла, чтобы картинки успели отрисоваться
        await new Promise(r => setTimeout(r, 4000));
        
        const clips = await page.evaluate(() => {
            let res = [];
            // Ищем все карточки видео
            document.querySelectorAll('a').forEach(link => {
                const href = link.href || '';
                const match = href.match(/\/video(-?\d+)_(\d+)/);
                
                if (match) {
                    // Ищем название в aria-label (оно там самое полное)
                    let videoTitle = link.getAttribute('aria-label') || link.innerText.split('\n')[0] || 'VK Clip';
                    
                    // Если в название попало время (напр. "3:04"), игнорируем его
                    if (/^\d+:\d+$/.test(videoTitle.trim())) videoTitle = 'VK Clip';

                    // Ищем картинку (img) внутри ссылки
                    let imgUrl = '';
                    const imgTag = link.querySelector('img');
                    if (imgTag && imgTag.src && !imgTag.src.includes('base64')) {
                        imgUrl = imgTag.src;
                    }

                    // Если нашли хоть какое-то превью, добавляем в список
                    if (imgUrl) {
                        res.push({
                            title: videoTitle.trim(),
                            url: href,
                            playerUrl: `https://vk.com/video_ext.php?oid=${match[1]}&id=${match[2]}&hd=2&autoplay=1`,
                            image: imgUrl
                        });
                    }
                }
            });
            return res;
        });

        // Убираем дубликаты по playerUrl
        const uniqueVK = Array.from(new Map(clips.map(item => [item.playerUrl, item])).values());

        fs.writeFileSync('vk_clips.json', JSON.stringify(uniqueVK.slice(0, 70), null, 4));
        console.log(`VK: Saved ${uniqueVK.length} clips with images!`);
        
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
