const fs = require('fs');
const cheerio = require('cheerio');

// ==========================================
// 1. СБОРЩИК TELEGRAM
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
// 2. ДВОЙНОЙ СБОРЩИК ВКОНТАКТЕ (БЕЗ API)
// ==========================================
async function updateVKClips() {
    console.log('Начинаем сбор клипов с ВКонтакте (Метод 1: vkvideo.ru)...');
    let vkClips = [];
    try {
        const url = 'https://vkvideo.ru/@fresh_clips';
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'ru-RU,ru;q=0.9'
            }
        });
        const html = await response.text();

        // Разбиваем код на блоки, чтобы достать скрытые видео
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

        // Если первый метод ничего не нашел (ВК изменил верстку), включаем Метод 2
        if (vkClips.length === 0) {
            console.log('Метод 1 не дал результатов. Пробуем Метод 2 (m.vk.com)...');
            vkClips = await updateVKMobileFallback();
        }

    } catch (e) {
        console.error('Ошибка в Методе 1:', e);
        vkClips = await updateVKMobileFallback();
    }

    // Сохраняем результат в файл
    if (vkClips && vkClips.length > 0) {
        vkClips = vkClips.slice(0, 50); // Берем 50 самых свежих
        fs.writeFileSync('vk_clips.json', JSON.stringify(vkClips, null, 4));
        console.log(`VK: Успешно сохранено ${vkClips.length} клипов в vk_clips.json.`);
    } else {
        console.log('VK: Не удалось собрать клипы. Оставляем файл пустым.');
        fs.writeFileSync('vk_clips.json', JSON.stringify([]));
    }
}

// Запасной метод парсинга (на случай блокировок)
async function updateVKMobileFallback() {
    console.log('VK Метод 2: Загрузка мобильной версии...');
    let fallbackClips = [];
    try {
        const url = 'https://m.vk.com/video/@fresh_clips';
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
                'Accept-Language': 'ru-RU,ru;q=0.9'
            }
        });
        const html = await response.text();
        const $ = cheerio.load(html);

        $('a[href^="/video-"]').each((i, el) => {
            const link = $(el).attr('href');
            if (link && link.match(/\/video(-?\d+)_(\d+)/)) {
                const videoIdMatch = link.match(/\/video(-?\d+)_(\d+)/);
                const ownerId = videoIdMatch[1];
                const vidId = videoIdMatch[2];
                
                const postUrl = 'https://vk.com' + link.split('?')[0];
                const playerUrl = `https://vk.com/video_ext.php?oid=${ownerId}&id=${vidId}&hd=2&autoplay=1`;
                
                let title = $(el).attr('aria-label') || $(el).find('.VideoItem__title').text().trim() || 'Клип ВКонтакте 🔥';
                let image = $(el).find('.VideoItem__thumb').attr('style') || '';
                const imgMatch = image.match(/url\(['"]?([^'")]+)['"]?\)/);
                image = imgMatch ? imgMatch[1] : 'https://vk.com/images/video_empty.png';

                let views = $(el).find('.VideoItem__views').text().replace('просмотров', '').trim() || 'ВК';

                if (!fallbackClips.some(c => c.playerUrl === playerUrl)) {
                    fallbackClips.push({ title, url: postUrl, playerUrl, image, views, timestamp: new Date().toISOString() });
                }
            }
        });
    } catch (e) { console.error('Ошибка в Методе 2:', e); }
    return fallbackClips;
}

// Запуск обеих задач
async function runTasks() {
    await updateTelegramClips();
    await updateVKClips();
}

runTasks();
