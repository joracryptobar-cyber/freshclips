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
// 2. УМНЫЙ СБОРЩИК ВКОНТАКТЕ (БЕЗ API КЛЮЧЕЙ)
// ==========================================
async function updateVKClips() {
    console.log('Начинаем сбор клипов с ВКонтакте (vkvideo.ru)...');
    let vkClips = [];
    try {
        const url = 'https://vkvideo.ru/@fresh_clips';
        // Притворяемся обычным пользователем компьютера
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'ru-RU,ru;q=0.9'
            }
        });
        const html = await response.text();
        
        // ВК прячет данные от ботов в JSON-формате внутри HTML-кода.
        // Мы используем Regex, чтобы "выцепить" ID видео, Название и Обложку напрямую из кода!
        const videoRegex = /"ownerId":(-?\d+),"videoId":(\d+),"title":"([^"\\]*(?:\\.[^"\\]*)*)"/g;
        let match;
        
        while ((match = videoRegex.exec(html)) !== null) {
            const ownerId = match[1];
            const vidId = match[2];
            
            // Раскодируем название (убираем юникод вроде \u041a)
            let rawTitle = match[3];
            try { rawTitle = JSON.parse(`"${rawTitle}"`); } catch(e) {}
            
            const title = rawTitle.length > 70 ? rawTitle.substring(0, 67) + '...' : rawTitle;
            const postUrl = `https://vkvideo.ru/video${ownerId}_${vidId}`;
            
            // Создаем официальную ссылку для встраиваемого плеера ВК
            const playerUrl = `https://vk.com/video_ext.php?oid=${ownerId}&id=${vidId}&hd=2&autoplay=1`;
            
            // Ищем картинку в коде рядом с найденным видео
            let image = 'https://vk.com/images/video_empty.png';
            const blockStr = html.substring(match.index - 500, match.index + 1000);
            const thumbMatch = blockStr.match(/"url":"(https:\/\/[^"]+\.jpg[^"]*)"/);
            if (thumbMatch) {
                try { image = JSON.parse(`"${thumbMatch[1]}"`); } catch(e) {}
            }

            // Исключаем дубликаты
            if (!vkClips.some(c => c.playerUrl === playerUrl)) {
                vkClips.push({
                    title: title,
                    url: postUrl,
                    playerUrl: playerUrl,
                    image: image,
                    views: 'ВК', // Просмотры без ключа достать сложно, ставим заглушку
                    timestamp: new Date().toISOString() // Сортируем по времени парсинга
                });
            }
        }

        if (vkClips.length > 0) {
            // Ограничим до 50 последних видео
            vkClips = vkClips.slice(0, 50);
            fs.writeFileSync('vk_clips.json', JSON.stringify(vkClips, null, 4));
            console.log(`VK: Успешно сохранено ${vkClips.length} клипов в vk_clips.json.`);
        } else {
            console.log('VK: Клипы не найдены. Возможно, канал пуст.');
            fs.writeFileSync('vk_clips.json', JSON.stringify([])); 
        }

    } catch (e) {
        console.error('Ошибка при сборе ВК:', e);
        fs.writeFileSync('vk_clips.json', JSON.stringify([])); 
    }
}

// Запускаем сбор
async function runTasks() {
    await updateTelegramClips();
    await updateVKClips();
}

runTasks();
