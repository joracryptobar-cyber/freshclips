const fs = require('fs');
const cheerio = require('cheerio');

// ==========================================
const VK_API_KEY = 'vk1.a.7ge6OqgZ6Zt5LorZXDdQeqSeycIi13axxrdZgriCp3V3VhEF3f1BHkLe3RJpJuhdaqbW92UoknxE1mQfZjqALBPGlXXPyMd5-NL_q9oOjthVy9urKttkwKhwNTcbvvWmf3qDAhvqxzgqE6skj3Rl4tDP2HwRDJnWPIa0OUia3BSdx69C4UnH32vnGiRR-cKdycpmUq2ns3p8drk9eCHohA&expires_in=86400&user_id=15322444'; 
const VK_OWNER_ID = '-1946517'; // Точный ID вашей группы!
// ==========================================

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
                    let title = $(el).find('.tgme_widget_message_text').text().trim().substring(0, 60) || 'TG Clip 🔥';
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

async function updateVKClips() {
    console.log('Starting VK extraction via API...');
    
    if (VK_API_KEY === 'ВСТАВЬТЕ_СЮДА_ВАШ_КЛЮЧ' || !VK_API_KEY) {
        console.error('VK ERROR: Вы не вставили сервисный ключ!');
        fs.writeFileSync('vk_clips.json', JSON.stringify([])); 
        return;
    }

    try {
        // Запрашиваем видео напрямую по ID
        const videoUrl = `https://api.vk.com/method/video.get?owner_id=${VK_OWNER_ID}&count=100&v=5.131&access_token=${VK_API_KEY}`;
        const videoRes = await fetch(videoUrl).then(r => r.json());

        // Проверка на ошибку самого ключа
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
                    title: title,
                    url: postUrl,
                    playerUrl: playerUrl,
                    image: image,
                    views: viewsStr,
                    timestamp: new Date(v.date * 1000).toISOString()
                });
            }
        }

        fs.writeFileSync('vk_clips.json', JSON.stringify(vkClips, null, 4));
        console.log(`VK: Successfully saved ${vkClips.length} clips with perfect data!`);

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
