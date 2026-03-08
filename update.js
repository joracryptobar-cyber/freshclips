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
// 2. СБОРЩИК ВКОНТАКТЕ (МАСКИРОВКА ПОД GOOGLEBOT)
// ==========================================
async function updateVKClips() {
    console.log('Начинаем сбор клипов ВК (Обход защиты)...');
    let vkClips = [];
    try {
        // Идем на классический домен
        const url = 'https://vk.com/video/@fresh_clips';
        
        // Маскируемся под официального поискового робота Google
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
                'Accept-Language': 'ru-RU,ru;q=0.9'
            },
            redirect: 'follow'
        });
        const html = await response.text();

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

                const postUrl = `https://vk.com/video${ownerId}_${vidId}`;
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
        console.error('Ошибка при сборе ВК:', e);
    }

    if (vkClips && vkClips.length > 0) {
        vkClips = vkClips.slice(0, 50); 
        fs.writeFileSync('vk_clips.json', JSON.stringify(vkClips, null, 4));
        console.log(`VK: Успешно сохранено ${vkClips.length} клипов в vk_clips.json.`);
    } else {
        console.log('VK: Не удалось обойти защиту ВК. Файл остается пустым.');
        fs.writeFileSync('vk_clips.json', JSON.stringify([]));
    }
}

async function runTasks() {
    await updateTelegramClips();
    await updateVKClips();
}

runTasks();
