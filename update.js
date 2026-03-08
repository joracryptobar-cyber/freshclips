const fs = require('fs');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');

// 1. TELEGRAM EXTRACTION (Original working logic)
async function updateTelegramClips() {
    try {
        console.log('--- Starting Telegram extraction ---');
        let allClips = [];
        let url = 'https://t.me/s/fresh_clips';
        let pagesToFetch = 15; 
        
        for (let i = 0; i < pagesToFetch; i++) {
            const response = await fetch(url);
            const html = await response.text();
            const $ = cheerio.load(html);
            
            let pageClips = []; 
            $('.tgme_widget_message').each((index, el) => {
                const videoThumb = $(el).find('.tgme_widget_message_video_thumb');
                if (videoThumb.length === 0) return;

                const postUrl = $(el).find('.tgme_widget_message_date').attr('href') || '';
                const style = videoThumb.attr('style') || '';
                const imgMatch = style.match(/url\(['"]?([^'")]+)['"]?\)/);
                const image = imgMatch ? imgMatch[1] : '';
                
                const elHtml = $(el).html() || '';
                let timestamp = new Date().toISOString();
                const dateMatch = elHtml.match(/datetime=['"]([^'"]+)['"]/);
                if (dateMatch && dateMatch[1]) timestamp = dateMatch[1];

                let views = '';
                const viewsMatch = elHtml.match(/tgme_widget_message_views[^>]*>([^<]+)</);
                if (viewsMatch && viewsMatch[1]) views = viewsMatch[1].trim();
                
                let title = 'TG Clip';
                const textEl = $(el).find('.tgme_widget_message_text');
                if (textEl.length > 0) {
                    let rawText = textEl.text().split('#')[0].trim();
                    title = rawText.length > 60 ? rawText.substring(0, 57) + '...' : rawText;
                }

                pageClips.push({ title, url: postUrl, image, timestamp, views });
            });
            
            allClips = allClips.concat(pageClips.reverse());
            const moreLink = $('.tme_messages_more').attr('href');
            if (!moreLink) break; 
            url = 'https://t.me' + moreLink;
        }
        
        allClips.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        fs.writeFileSync('clips.json', JSON.stringify(allClips, null, 4));
        console.log('--- TG: Success! ---');
    } catch (e) { console.error('--- TG Error ---', e); }
}

// 2. VK EXTRACTION (New Puppeteer logic with Unicode fixes)
async function updateVKClips() {
    console.log('--- Starting VK extraction (Puppeteer) ---');
    let browser;
    try {
        browser = await puppeteer.launch({ 
            headless: "new", 
            // Important for Ubuntu Server
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--lang=ru-RU,ru'] 
        });
        const page = await browser.newPage();
        await page.goto('https://vkvideo.ru/@fresh_clips/all', { waitUntil: 'networkidle2', timeout: 60000 });

        await page.evaluate(async () => {
            await new Promise((resolve) => {
                let totalHeight = 0;
                let distance = 500; 
                let timer = setInterval(() => {
                    window.scrollBy(0, distance);
                    totalHeight += distance;
                    if(totalHeight >= 50000){ clearInterval(timer); resolve(); }
                }, 400); 
            });
        });

        await new Promise(r => setTimeout(r, 4000));

        const vkClips = await page.evaluate(() => {
            let results = [];
            const cards = document.querySelectorAll('[data-testid="catalog_item_video"]');
            
            // Safe Unicode roots
            const mK = "\u0442\u044b\u0441"; // тыс
            const mM = "\u043c\u043b\u043d"; // млн
            const mDot = "\u00b7"; // dot
            const mYesterday = "\u0432\u0447\u0435\u0440\u0430"; // вчера
            const mD = "\u0434\u043d"; // дн
            const mW = "\u043d\u0435\u0434"; // нед
            const mMo = "\u043c\u0435\u0441"; // мес
            const mY = "\u0433\u043e\u0434"; // год

            cards.forEach(card => {
                const linkEl = card.querySelector('a[href*="/video"]');
                if (!linkEl) return;
                const href = linkEl.href;
                const match = href.match(/\/video(-?\d+)_(\d+)/);
                if (!match) return;

                let title = "Video";
                let titleEl = card.querySelector('[data-testid="video_card_title"]');
                if (titleEl) title = titleEl.textContent.trim();

                let imgUrl = "";
                const img = card.querySelector('img');
                if (img && img.src && !img.src.includes('video_empty')) imgUrl = img.src;

                let viewsStr = "0";
                let dateText = "";
                let finalDate = new Date();

                let metaEl = card.querySelector('[data-testid="video_card_additional_info"]');
                if (metaEl) {
                    let rawText = (metaEl.textContent || "").toLowerCase();
                    let numMatch = rawText.match(/(\d+([.,]\d+)?)/);
                    if (numMatch) {
                        let num = numMatch[1].replace(',', '.'); 
                        if (rawText.includes(mK)) viewsStr = num + 'K';
                        else if (rawText.includes(mM)) viewsStr = num + 'M';
                        else viewsStr = num;
                    }

                    let metaParts = rawText.split(mDot); 
                    dateText = metaParts.length > 1 ? metaParts[1].trim() : rawText;

                    let daysToSub = 0;
                    let valMatch = dateText.match(/\d+/);
                    let val = valMatch ? parseInt(valMatch[0]) : 0;

                    if (dateText.includes(mYesterday)) daysToSub = 1;
                    else if (dateText.includes(mD)) daysToSub = val;
                    else if (dateText.includes(mW)) daysToSub = val * 7;
                    else if (dateText.includes(mMo)) daysToSub = val * 30;
                    else if (dateText.includes(mY)) daysToSub = val * 365;
                    
                    finalDate.setDate(finalDate.getDate() - daysToSub);
                }

                results.push({
                    title: title,
                    url: href,
                    playerUrl: `https://vk.com/video_ext.php?oid=${match[1]}&id=${match[2]}&hd=2&autoplay=1`,
                    image: imgUrl,
                    views: viewsStr,
                    timestamp: finalDate.toISOString(),
                    dateText: dateText
                });
            });
            return Array.from(new Map(results.map(i => [i.playerUrl, i])).values());
        });

        fs.writeFileSync('vk_clips.json', JSON.stringify(vkClips, null, 4));
        console.log('--- VK: Success! ---');
    } catch (e) { console.error('--- VK Error ---', e.message); } 
    finally { if (browser) await browser.close(); }
}

async function runTasks() {
    await updateTelegramClips();
    await updateVKClips();
}

runTasks();
