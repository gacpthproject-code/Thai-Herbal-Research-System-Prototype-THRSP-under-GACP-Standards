const fs = require('fs');
const puppeteer = require('puppeteer');
const pdfGenerator = require('../../services/pdf/pdf-generator.service');

function resolveChromium() {
    const fromEnv = process.env.PUPPETEER_EXECUTABLE_PATH;
    if (fromEnv && fs.existsSync(fromEnv)) { return fromEnv; }
    try {
        const p = puppeteer.executablePath();
        if (p && fs.existsSync(p)) { return p; }
    } catch {}
    return null;
}

const CHROMIUM = resolveChromium();
const d = CHROMIUM ? describe : describe.skip;
const STALL_PAST_NETWORK_IDLE_WINDOW_MS = 700;

d('PDF render survives a stall after the blank page opens', () => {
    beforeAll(async () => {
        process.env.PUPPETEER_EXECUTABLE_PATH = CHROMIUM;
        const browser = await pdfGenerator.initialize();
        const openPage = browser.newPage.bind(browser);
        jest.spyOn(browser, 'newPage').mockImplementation(async (...args) => {
            const page = await openPage(...args);
            await new Promise((resolve) => setTimeout(resolve, STALL_PAST_NETWORK_IDLE_WINDOW_MS));
            return page;
        });
    });

    afterAll(async () => {
        await pdfGenerator.close().catch(() => {});
    });

    test('generatePDF returns a PDF well inside the navigation timeout', async () => {
        const html = '<!doctype html><html><head></head><body><h1>ใบเสนอราคา</h1></body></html>';
        const started = Date.now();

        const pdf = await pdfGenerator.generatePDF(html);

        expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
        expect(Date.now() - started).toBeLessThan(10000);
    }, 60000);
});
