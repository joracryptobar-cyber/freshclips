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

// 2. VK SCRAPER (PUPPETEER) - Улучшенная версия
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
        
        // Переходим на страницу
        await page.goto('https://vkvideo.ru/@fresh_clips/all', { waitUntil: 'networkidle2', timeout: 60000 });
        
        // ПРОКРУТКА: Чтобы подгрузились картинки и реальные названия
        console.log('VK: Scrolling to trigger lazy load...');
        await page.evaluate(async () => {
            await new Promise((resolve) => {
                let totalHeight = 0;
                let distance = 400;
                let timer = setInterval(() => {
                    window.scrollBy(0, distance);
                    totalHeight += distance;
                    // Прокручиваем достаточно глубоко для 50-70 клипов
                    if(totalHeight >= 4000){
                        clearInterval(timer);
                        resolve();
                    }
                }, 200);
            });
        });

        // Ждем небольшую паузу после прокрутки
        await new Promise(r => setTimeout(r, 3000));
        
        const clips = await page.evaluate(() => {
            let res = [];
            // Ищем ссылки, которые ведут на видео
            document.querySelectorAll('a[href*="/video"]').forEach(link => {
                const href = link.href;
                const match = href.match(/\/video(-?\d+)_(\d+)/);
                
                if (match) {
                    // 1. ИСПРАВЛЕНИЕ TITLE: забираем из атрибута aria-label или title, 
                    // чтобы не цеплять длительность "3:04" из внутреннего текста
                    let videoTitle = link.getAttribute('aria-label') || link.title || "";
                    
                    // Если название всё равно пустое, ищем текстовый блок внутри (обычно под видео)
                    if (!videoTitle || /^\d+:\d+$/.test(videoTitle)) {
                        const titleEl = link.closest('div')?.querySelector('[class*="title"], [class*="name"]');
                        videoTitle = titleEl ? titleEl.innerText : 'VK Clip';
                    }

                    // 2. ИСПРАВЛЕНИЕ ПРЕВЬЮ: ищем src у картинки
                    let imgUrl = "";
                    const imgTag = link.querySelector('img');
                    if (imgTag && imgTag.src && !imgTag.src.includes('base64')) {
                        imgUrl = imgTag.src;
                    }

                    // Очищаем название от лишних переносов
                    videoTitle = videoTitle.replace(/\n/g, ' ').trim();
                    if (videoTitle.length > 80) videoTitle = videoTitle.substring(0, 77) + '...';

                    // Добавляем только если удалось найти картинку и это похоже на видео
                    if (imgUrl && videoTitle) {
                        res.push({
                            title: videoTitle,
                            url: href,
                            playerUrl: `https://vk.com/video_ext.php?oid=${match[1]}&id=${match[2]}&hd=2&autoplay=1`,
                            image: imgUrl
                        });
                    }
                }
            });
            return res;
        });

        // Убираем дубликаты
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
