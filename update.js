const fs = require('fs');
const cheerio = require('cheerio');

async function updateClips() {
    try {
        console.log('Начинаем сбор клипов...');
        let allClips = [];
        let url = 'https://t.me/s/fresh_clips';
        let pagesToFetch = 5; 

        for (let i = 0; i < pagesToFetch; i++) {
            console.log(`Загрузка страницы ${i + 1}...`);
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
                    if (timeEl.length > 0) {
                        timestamp = timeEl.attr('datetime') || ''; 
                    }

                    let title = 'Свежий клип 🔥';
                    let tags = []; // Массив для хранения хэштегов
                    
                    const textEl = $(el).find('.tgme_widget_message_text');
                    if (textEl.length > 0) {
                        let rawText = textEl.text();
                        rawText = rawText.replace('Премьера клипа! ', '');
                        
                        // Извлекаем все хэштеги из текста
                        const foundTags = rawText.match(/#[a-zA-Zа-яА-ЯёЁ0-9_]+/g);
                        if (foundTags) {
                            tags = foundTags;
                        }

                        // Очищаем название от хэштегов
                        rawText = rawText.split('#')[0].trim();
                        title = rawText.length > 70 ? rawText.substring(0, 67) + '...' : rawText;
                        if (!title) title = 'Свежий клип 🔥';
                    }

                    // Сохраняем в базу вместе с тегами
                    pageClips.push({ title, url: postUrl, image, timestamp, tags });
                }
            });

            allClips = allClips.concat(pageClips.reverse());

            const moreLink = $('.tme_messages_more').attr('href');
            if (!moreLink) break; 
            
            url = 'https://t.me' + moreLink;
        }

        const uniqueClips = Array.from(new Map(allClips.map(item => [item.url, item])).values());

        fs.writeFileSync('clips.json', JSON.stringify(uniqueClips, null, 4));
        console.log(`Успешно! Сохранено ${uniqueClips.length} клипов в clips.json.`);

    } catch (error) {
        console.error('Ошибка при обновлении клипов:', error);
    }
}

updateClips();
