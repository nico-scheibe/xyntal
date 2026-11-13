// Rendert Carousels aus einer JSON-Datei als PNG (1080x1350, Instagram 4:5).
// Aufruf: node src/render-carousels.cjs carousels/woche1.json [deck-id]
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

(async () => {
  const [, , file, only] = process.argv;
  const root = path.resolve(__dirname, "..");
  const decks = JSON.parse(fs.readFileSync(path.resolve(root, file), "utf8")).filter((d) => !only || d.id === only);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 1500 }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.error("Seitenfehler:", e.message));
  await page.goto("file://" + path.join(__dirname, "carousel.html"));
  for (const deck of decks) {
    const out = path.join(root, "export", deck.id);
    fs.mkdirSync(out, { recursive: true });
    await page.evaluate((d) => window.renderDeck(d), deck);
    await page.waitForTimeout(300);
    const slides = await page.$$(".slide");
    for (const s of slides) {
      const name = await s.getAttribute("data-file");
      await s.screenshot({ path: path.join(out, name + ".png") });
    }
    fs.writeFileSync(path.join(out, "caption.txt"), deck.caption + "\n");
    console.log(`${deck.id}: ${slides.length} Slides`);
  }
  await browser.close();
})();
