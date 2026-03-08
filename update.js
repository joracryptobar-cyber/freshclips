const fs = require('fs');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer'); // Подключаем управление браузером

// ==========================================
// 1. СБОРЩИК TELEGRAM (Обычный быстрый метод)
// ==========================================
async function updateTelegramClips() {
    try {
        console.log('Начинаем сбор клипов с Telegram...');
        let allClips = [];
        let url = 'https://t.me/s/fresh_clips';
        let pagesToFetch = 5; 

        for (let i = 0; i < pagesToFetch; i++) {
            console.log(`TG: Загрузка страницы ${i + 1}...`);
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

                    let title = 'Свежий клип 🔥';
                    const textEl = $(el).find('.tgme_widget_message_text');
                    if (textEl.length > 0) {
                        let rawText = textEl.text();
                        rawText = rawText.replace('Премьера клипа! ', '');
                        rawText = rawText.split('#')[0].trim();
                        title = rawText.length > 70 ? rawText.substring(0, 67) + '...' : rawText;
                        if (!title) title = 'Свежий клип 🔥';
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
        console.log(`TG: Успешно сохранено ${uniqueClips.length} клипов.`);

    } catch (error) {
        console.error('Ошибка при обновлении Telegram:', error);
    }
}

// ==========================================
// 2. СБОРЩИК ВКОНТАКТЕ (Эмуляция реального браузера)
// ==========================================
async function updateVKClips() {
    console.log('Начинаем сбор клипов ВК (запуск невидимого браузера Chrome)...');
    let vkClips = [];
    let browser = null;

    try {
        // Запускаем браузер со специальными флагами для серверов GitHub
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });
        
        const page = await browser.newPage();
        
        // Притворяемся компьютером на Windows
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        console.log('VK: Переходим на страницу канала...');
        // networkidle2 означает "ждать, пока не загрузятся все скрипты и видео"
        await page.goto('https://vkvideo.ru/@fresh_clips', { waitUntil: 'networkidle2', timeout: 45000 });
        
        // Ждем еще 3 секунды, чтобы ВК точно отрисовал карточки с клипами
        await new Promise(r => setTimeout(r, 3000));
        
        // Забираем исходный код страницы, который сгенерировал браузер
        const html = await page.content();

        // Парсим JSON данные, которые ВК теперь добровольно отдал браузеру
        const blocks = html.split('"videoId":');
        for (let i = 1; i < blocks.length; i++) {
            const block = blocks[i].substring(0, 1500);
            
            const vidMatch = block.match(/^"(\d+)"/ ) || block.match(/^(\d+)/);
            const ownerMatch = block.match(/"ownerId":\s*"?(-?\d+)"?/);
            
            if (vidMatch && ownerMatch) {
                const vidId = vidMatch[1];
                const ownerId = ownerMatch[1];
                
                let titleMatch = block.match(/"title":\s*"([^"\\]*(?:\\.[^"\\]*)*)"/) || block.match(/"title":\s*"([^"]+)"/);
                let rawTitle = titleMatch ? titleMatch[1] : 'Клип ВКонтакте 🔥';
                try { rawTitle = JSON.parse(`"${rawTitle}"`); } catch(e) {}
                const title = rawTitle.length > 70 ? rawTitle.substring(0, 67) + '...' : rawTitle;

                const postUrl = `https://vkvideo.ru/video${ownerId}_${vidId}`;
                const playerUrl = `https://vk.com/video_ext.php?oid=${ownerId}&id=${vidId}&hd=2&autoplay=1`;

                let image = 'https://vk.com/images/video_empty.png';
                const thumbMatch = block.match(/"url":\s*"(https:\/\/[^"]+\.jpg[^"]*)"/);
                if (thumbMatch) {
                    try { image = JSON.parse(`"${thumbMatch[1]}"`); } catch(e) {}
                }

                let views = 'ВК';
                const viewsMatch = block.match(/"views":\s*(\d+)/);
                if (viewsMatch) {
                    const v = parseInt(viewsMatch[1]);
                    if (v >= 1000000) views = (v / 1000000).toFixed(1) + 'M';
                    else if (v >= 1000) views = (v / 1000).toFixed(1) + 'K';
                    else views = v.toString();
                }

                if (!vkClips.some(c => c.playerUrl === playerUrl)) {
                    vkClips.push({ title, url: postUrl, playerUrl, image, views, timestamp: new Date().toISOString() });
                }
            }
        }

    } catch (e) {
        console.error('VK: Ошибка при работе с браузером:', e);
    } finally {
        if (browser) {
            await browser.close(); // Обязательно закрываем браузер
        }
    }

    if (vkClips.length > 0) {
        vkClips = vkClips.slice(0, 50); // Берем последние 50
        fs.writeFileSync('vk_clips.json', JSON.stringify(vkClips, null, 4));
        console.log(`VK: Успешно сохранено ${vkClips.length} клипов без всяких API ключей!`);
    } else {
        console.log('VK: Не удалось собрать клипы. Возможно, ВК включил супер-защиту.');
        fs.writeFileSync('vk_clips.json', JSON.stringify([]));
    }
}

// Запуск обеих задач
async function runTasks() {
    await updateTelegramClips();
    await updateVKClips();
}

runTasks();
