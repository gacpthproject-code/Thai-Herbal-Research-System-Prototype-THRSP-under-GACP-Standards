const { request } = require('@playwright/test');
const fs = require('fs');
const { STATE_FILE, BASE, PDF_FIXTURE, PNG_FIXTURE } = require('./common');

(async () => {
  const ctx = await request.newContext({ baseURL: BASE, storageState: STATE_FILE });
  for (const [label, filePath, mimeType] of [
    ['pdf-fixture', PDF_FIXTURE, 'application/pdf'],
    ['png-fixture', PNG_FIXTURE, 'image/png'],
  ]) {
    try {
      const res = await ctx.post('/api/applications/draft-documents', {
        multipart: {
          file: { name: label + (mimeType === 'application/pdf' ? '.pdf' : '.png'), mimeType, buffer: fs.readFileSync(filePath) },
          slotId: 'M1_PT11',
          stepKey: 'plant-selection',
        },
      });
      console.log(label, 'status=', res.status());
      console.log(label, 'body=', await res.text());
    } catch (e) {
      console.log(label, 'THREW', e.message);
    }
  }
  await ctx.dispose();
})();
