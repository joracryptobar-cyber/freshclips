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
// 2. СБОРЩИК ВКОНТАКТЕ (БЕЗ API)
// ==========================================
async function updateVKClips() {
    console.log('Начинаем сбор клипов с ВКонтакте...');
    let vkClips = [];
    try {
        // Притворяемся мобильным браузером (iPhone), чтобы ВК отдал нам легкую мобильную версию
        const url = 'https://m.vk.com/video/@fresh_clips';
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
                'Accept-Language': 'ru-RU,ru;q=0.9'
            }
        });
        
        const html = await response.text();
        const $ = cheerio.load(html);
        
        // В мобильной версии ВК видео часто лежат внутри ссылок. Ищем все теги <a> с ссылкой на видео.
        $('a[href^="/video-"]').each((i, el) => {
            const link = $(el).attr('href');
            
            // Проверяем, что это формат ссылки на видео: /video-12345_67890
            if (link && link.match(/\/video(-?\d+)_(\d+)/)) {
                const videoIdMatch = link.match(/\/video(-?\d+)_(\d+)/);
                const ownerId = videoIdMatch[1];
                const vidId = videoIdMatch[2];
                
                const postUrl = 'https://vk.com' + link.split('?')[0]; // Ссылка на сам пост
                
                // МАГИЯ: Собираем системную ссылку для встраиваемого плеера!
                const playerUrl = `https://vk.com/video_ext.php?oid=${ownerId}&id=${vidId}&hd=2&autoplay=1`;
                
                // Ищем название
                let title = $(el).attr('aria-label') || $(el).attr('title') || $(el).find('.VideoItem__title').text().trim();
                if (!title) title = 'Клип ВКонтакте 🔥';
                
                // Ищем картинку-превью
                let image = '';
                const style = $(el).find('.VideoItem__thumb, .video_item_thumb').attr('style') || $(el).attr('style') || '';
                const imgMatch = style.match(/url\(['"]?([^'")]+)['"]?\)/);
                if (imgMatch) {
                    image = imgMatch[1];
                } else {
                    image = $(el).find('img').attr('src') || '';
                }

                // Ищем просмотры
                let views = $(el).find('.VideoItem__views, .video_item_views').text().trim() || '';
                views = views.replace('просмотров', '').replace('просмотра', '').trim();

                // Проверяем, чтобы видео не дублировалось и картинка была найдена
                if (image && !vkClips.some(c => c.url === postUrl)) {
                    vkClips.push({
                        title: title,
                        url: postUrl,
                        playerUrl: playerUrl,  // Передаем ссылку плеера в сайт
                        image: image,
                        views: views,
                        timestamp: new Date().toISOString() // m.vk.com не отдает дату, используем время парсинга
                    });
                }
            }
        });

        // Если удалось собрать клипы, сохраняем в файл
        if (vkClips.length > 0) {
            fs.writeFileSync('vk_clips.json', JSON.stringify(vkClips, null, 4));
            console.log(`VK: Успешно сохранено ${vkClips.length} клипов в vk_clips.json.`);
        } else {
            console.log('VK: Клипы не найдены. Возможно, изменилась верстка сайта.');
            fs.writeFileSync('vk_clips.json', JSON.stringify([])); 
        }

    } catch (e) {
        console.error('Ошибка при сборе ВК:', e);
        fs.writeFileSync('vk_clips.json', JSON.stringify([])); 
    }
}

// Запускаем обе функции по очереди
async function runTasks() {
    await updateTelegramClips();
    await updateVKClips();
}

runTasks();
