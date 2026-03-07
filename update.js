const fs = require('fs');
const cheerio = require('cheerio');

async function updateClips() {
    try {
        console.log('Загрузка канала https://t.me/s/fresh_clips...');
        // Загружаем публичную веб-версию канала (без прокси!)
        const response = await fetch('https://t.me/s/fresh_clips');
        const html = await response.text();
        
        // Загружаем HTML в парсер
        const $ = cheerio.load(html);
        const clips = [];

        // Ищем все посты
        $('.tgme_widget_message').each((i, el) => {
            const videoThumb = $(el).find('.tgme_widget_message_video_thumb');
            
            if (videoThumb.length > 0) {
                // Достаем картинку
                const style = videoThumb.attr('style') || '';
                const imgMatch = style.match(/url\(['"]?([^'")]+)['"]?\)/);
                const image = imgMatch ? imgMatch[1] : '';

                // Достаем ссылку на пост
                const dateLinkEl = $(el).find('.tgme_widget_message_date');
                const url = dateLinkEl.attr('href') || 'https://t.me/fresh_clips';

                // Вытаскиваем название клипа из текста
                let title = 'Свежий клип 🔥';
                const textEl = $(el).find('.tgme_widget_message_text');
                if (textEl.length > 0) {
                    let rawText = textEl.text().split('\n')[0].replace('Премьера клипа! ', '');
                    title = rawText.length > 70 ? rawText.substring(0, 67) + '...' : rawText;
                }

                // Сохраняем во временный массив
                clips.push({ title, url, image });
            }
        });

        // Берем последние 12 клипов (переворачиваем массив, чтобы новые были первыми)
        const finalClips = clips.reverse().slice(0, 12);

        // Записываем данные в файл clips.json
        fs.writeFileSync('clips.json', JSON.stringify(finalClips, null, 4));
        console.log(`Успешно! Сохранено ${finalClips.length} клипов в clips.json.`);

    } catch (error) {
        console.error('Ошибка при обновлении клипов:', error);
    }
}

updateClips();
