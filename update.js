const fs = require('fs');
const cheerio = require('cheerio');

// ==========================================
// ВАШ СЕРВИСНЫЙ КЛЮЧ ВКОНТАКТЕ (API)
// ==========================================
const VK_API_KEY = 'ВСТАВЬТЕ_СЮДА_ВАШ_КЛЮЧ'; 
const VK_OWNER_ID = '-1946517'; 
// ==========================================

async function updateTelegramClips() {
    try {
        console.log('Starting Telegram extraction...');
        let allClips = [];
        let url = 'https://t.me/s/fresh_clips';
        let pagesToFetch = 20; 
        
        for (let i = 0; i < pagesToFetch; i++) {
            const response = await fetch(url);
            const html = await response.text();
            const $ = cheerio.load(html);
            
            let pageClips = []; 

            $('.tgme_widget_message').each((index, el) => {
                const videoThumb = $(el).find('.tgme_widget_message_video_thumb');
                if (videoThumb.length === 0) return; // Берем только видео

                // 1. Ссылка
                const postUrl = $(el).find('.tgme_widget_message_date').attr('href') || '';
                
                // 2. Картинка
                const style = videoThumb.attr('style') || '';
                const imgMatch = style.match(/url\(['"]?([^'")]+)['"]?\)/);
                const image = imgMatch ? imgMatch[1] : '';
                
                // 3. ДАТА (Рентген-поиск: ищем строку datetime="2024-..." в любом месте кода)
                const elHtml = $(el).html() || '';
                let timestamp = new Date().toISOString(); // Резерв
                const dateMatch = elHtml.match(/datetime=['"]([^'"]+)['"]/);
                if (dateMatch && dateMatch[1]) {
                    timestamp = dateMatch[1];
                }

                // 4. ПРОСМОТРЫ (Рентген-поиск просмотров)
                let views = '';
                const viewsMatch = elHtml.match(/tgme_widget_message_views[^>]*>([^<]+)</);
                if (viewsMatch && viewsMatch[1]) {
                    views = viewsMatch[1].trim();
                }
                
                // 5. Название
                let title = 'TG Clip 🔥';
                const textEl = $(el).find('.tgme_widget_message_text');
                if (textEl.length > 0) {
                    let rawText = textEl.text().replace('Премьера клипа! ', '').split('#')[0].trim();
                    title = rawText.length > 60 ? rawText.substring(0, 57) + '...' : rawText;
                    if (!title) title = 'TG Clip 🔥';
                }

                pageClips.push({ title, url: postUrl, image, timestamp, views });
            });
            
            allClips = allClips.concat(pageClips.reverse());
            
            const moreLink = $('.tme_messages_more').attr('href');
            if (!moreLink) break; 
            url = 'https://t.me' + moreLink;
        }
        
        // Сортируем все клипы строго по дате (от новых к старым)
        allClips.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        fs.writeFileSync('clips.json', JSON.stringify(allClips, null, 4));
        console.log(`TG: Saved ${allClips.length} clips with PERFECT dates and views!`);
    } catch (e) { console.error('TG Error:', e); }
}

async function updateVKClips() {
    console.log('Starting VK extraction via API...');
    if (VK_API_KEY === 'ВСТАВЬТЕ_СЮДА_ВАШ_КЛЮЧ' || !VK_API_KEY) {
        console.error('VK ERROR: Вы не вставили сервисный ключ!');
        fs.writeFileSync('vk_clips.json', JSON.stringify([])); 
        return;
    }
    try {
        const videoUrl = `https://api.vk.com/method/video.get?owner_id=${VK_OWNER_ID}&count=200&v=5.131&access_token=${VK_API_KEY}`;
        const videoRes = await fetch(videoUrl).then(r => r.json());

        if (videoRes.error) {
            console.error('VK API Error:', videoRes.error.error_msg);
            fs.writeFileSync('vk_clips.json', JSON.stringify([]));
            return;
        }

        let vkClips = [];
        if (videoRes.response && videoRes.response.items) {
            for (let v of videoRes.response.items) {
                if (v.type !== 'video') continue;
                let title = v.title || 'VK Clip 🔥';
                if (/^\d+:\d+$/.test(title.trim())) title = 'VK Clip 🔥';

                const postUrl = `https://vkvideo.ru/video${v.owner_id}_${v.id}`;
                const playerUrl = `https://vk.com/video_ext.php?oid=${v.owner_id}&id=${v.id}&hd=2&autoplay=1`;
                
                let views = v.views || 0;
                let viewsStr = views.toString();
                if (views >= 1000000) viewsStr = (views / 1000000).toFixed(1) + 'M';
                else if (views >= 1000) viewsStr = (views / 1000).toFixed(1) + 'K';

                let image = 'https://vk.com/images/video_empty.png';
                if (v.image && v.image.length > 0) {
                    image = v.image[v.image.length - 1].url; 
                }

                vkClips.push({
                    title: title, url: postUrl, playerUrl: playerUrl, image: image,
                    views: viewsStr, timestamp: new Date(v.date * 1000).toISOString()
                });
            }
        }
        fs.writeFileSync('vk_clips.json', JSON.stringify(vkClips, null, 4));
        console.log(`VK: Successfully saved ${vkClips.length} clips!`);
    } catch (e) {
        console.error('VK Network Error:', e.message);
        fs.writeFileSync('vk_clips.json', JSON.stringify([]));
    }
}

async function runTasks() {
    await updateTelegramClips();
    await updateVKClips();
}

runTasks();
