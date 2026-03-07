const fs = require('fs');
const cheerio = require('cheerio');

async function updateClips() {
    try {
        console.log('Начинаем сбор клипов...');
        let allClips = [];
        let url = 'https://t.me/s/fresh_clips';
        let pagesToFetch = 5; // Сколько страниц истории листать (около 100 постов)

        for (let i = 0; i < pagesToFetch; i++) {
            console.log(`Загрузка страницы ${i + 1}...`);
            const response = await fetch(url);
            const html = await response.text();
            const $ = cheerio.load(html);

            let pageClips = [];

            // Ищем все посты на текущей странице
            $('.tgme_widget_message').each((index, el) => {
                const videoThumb = $(el).find('.tgme_widget_message_video_thumb');
                
                if (videoThumb.length > 0) {
                    const style = videoThumb.attr('style') || '';
                    const imgMatch = style.match(/url\(['"]?([^'")]+)['"]?\)/);
                    const image = imgMatch ? imgMatch[1] : '';

                    const dateLinkEl = $(el).find('.tgme_widget_message_date');
                    const postUrl = dateLinkEl.attr('href') || 'https://t.me/fresh_clips';

                    let title = 'Свежий клип 🔥';
                    const textEl = $(el).find('.tgme_widget_message_text');
                    if (textEl.length > 0) {
                        let rawText = textEl.text().split('\n')[0].replace('Премьера клипа! ', '');
                        title = rawText.length > 70 ? rawText.substring(0, 67) + '...' : rawText;
                    }

                    pageClips.push({ title, url: postUrl, image });
                }
            });

            // На странице посты идут сверху вниз (от старых к новым). 
            // Переворачиваем, чтобы новые были первыми, и добавляем в общую базу.
            allClips = allClips.concat(pageClips.reverse());

            // Ищем кнопку "Показать более старые" для перехода на следующую страницу
            const moreLink = $('.tme_messages_more').attr('href');
            if (!moreLink) break; // Если истории больше нет - останавливаемся
            
            url = 'https://t.me' + moreLink;
        }

        // Удаляем возможные дубликаты (по URL)
        const uniqueClips = Array.from(new Map(allClips.map(item => [item.url, item])).values());

        // Сохраняем все собранные клипы в файл
        fs.writeFileSync('clips.json', JSON.stringify(uniqueClips, null, 4));
        console.log(`Успешно! Сохранено ${uniqueClips.length} клипов в clips.json.`);

    } catch (error) {
        console.error('Ошибка при обновлении клипов:', error);
    }
}

updateClips();
