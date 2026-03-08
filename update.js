const fs = require('fs');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');

// ==========================================
// 1. СБОРЩИК TELEGRAM
// ==========================================
async function updateTelegramClips() {
    try {
        console.log('Starting Telegram clips extraction...');
        let allClips = [];
        let url = 'https://t.me/s/fresh_clips';
        let pagesToFetch = 5; 

        for (let i = 0; i < pagesToFetch; i++) {
            console.log(`TG: Loading page ${i + 1}...`);
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

                    let title = 'New Clip 🔥';
                    const textEl = $(el).find('.tgme_widget_message_text');
                    if (textEl.length > 0) {
                        let rawText = textEl.text();
                        rawText = rawText.replace('Премьера клипа! ', '');
                        rawText = rawText.split('#')[0].trim();
                        title = rawText.length > 70 ? rawText.substring(0, 67) + '...' : rawText;
                        if (!title) title = 'New Clip 🔥';
                    }
                    pageClips.push({ title, url: postUrl, image, timestamp, views });
                }
            });

            allClips = allClips.concat(pageClips.reverse());
