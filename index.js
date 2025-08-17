require('dotenv').config();
const express = require('express');
const path = require('path');
const axios = require("axios").default;
const { wrapper } = require("axios-cookiejar-support");
const tough = require("tough-cookie");

const app = express();
const port = process.env.PORT || 3000;

const jar = new tough.CookieJar();
const client = wrapper(axios.create({ jar, withCredentials: true }));

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
let lastStart = null;
let latestData = null;

async function sendTelegramMessage(message) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        console.log("Telegram bilgileri eksik, mesaj gönderilmiyor.");
        return;
    }
    try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            chat_id: TELEGRAM_CHAT_ID,
            text: message
        });
        console.log(`📨 Telegram mesajı gönderildi: ${message}`);
    } catch (err) {
        console.error("❌ Telegram mesajı gönderilemedi:", err.message);
    }
}

async function fetchTimeslots() {
    try {
        await client.post(
            "https://www.qtermin.de/site?pageidx=2&z=45039&storeip=true",
            {},
            {
                headers: {
                    "Accept": "application/json, text/plain",
                    "Content-Type": "application/json",
                    "User-Agent": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36 Edg/139.0.0.0",
                    "Referer": "https://www.qtermin.de/qtermin-stadtheilbronn-abh",
                    "Origin": "https://www.qtermin.de",
                    "webid": "qtermin-stadtheilbronn-abh"
                }
            }
        );

        const dateParam = new Date().toISOString().split("T")[0];
        const timeslotUrl = `https://www.qtermin.de/api/timeslots?date=${dateParam}&serviceid=144511&rangesearch=1&caching=false&capacity=1&duration=20&cluster=false&slottype=0&fillcalendarstrategy=0&showavcap=false&appfuture=270&appdeadline=480&appdeadlinewm=1&oneoff=null&msdcm=0&calendarid=`;

        const res = await client.get(timeslotUrl, {
            headers: {
                "Accept": "application/json, text/plain",
                "User-Agent": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36 Edg/139.0.0.0",
                "Referer": "https://www.qtermin.de/qtermin-stadtheilbronn-abh",
                "Origin": "https://www.qtermin.de",
                "webid": "qtermin-stadtheilbronn-abh"
            }
        });

        if (res.data && res.data.length > 0) {
            const currentStart = res.data[0].start;
            if (lastStart === null) {
                lastStart = currentStart;
                const message = `[İlk Kayıt] start: ${currentStart}`;
                console.log(message);
                await sendTelegramMessage(message);
            } else if (currentStart !== lastStart) {
                const message = `🚨 Tarih değişti!\nÖnceki: ${lastStart}\nYeni: ${currentStart}`;
                console.log(message);
                await sendTelegramMessage(message);
                lastStart = currentStart;
            } else {
                console.log(`[${new Date().toLocaleTimeString()}] Değişiklik yok. start: ${currentStart}`);
            }
        } else {
            console.log("⚠️ Response boş veya beklenen formatta değil.");
        }
        latestData = res.data; // En son veriyi sakla
        return res.data;
    } catch (err) {
        console.error("❌ İstek hatası:", err.response ? err.response.status : err.message);
        throw err;
    }
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/timeslots', (req, res) => {
    if (latestData) {
        res.json(latestData);
    } else {
        res.status(503).json({ message: 'Veri henüz mevcut değil, lütfen daha sonra tekrar deneyin.' });
    }
});

app.listen(port, () => {
    console.log(`Sunucu http://localhost:${port} adresinde çalışıyor`);
    
    // Sunucu başlar başlamaz ilk veriyi çek
    fetchTimeslots().catch(err => {
        console.error("Başlangıçtaki ilk veri çekme hatası:", err.message);
    });

    // Sonra periyodik olarak devam et
    setInterval(() => {
        fetchTimeslots().catch(err => {
            console.error("Periyodik veri çekme hatası:", err.message);
        });
    }, 1 * 60 * 1000);
});

