// Writes the catalog the iPhone app ships with, for its first launch and when it is offline.
// Run after changing src/catalog.js: npm run ios:catalog
import { writeFileSync } from 'node:fs';
import { publicCatalog } from '../src/catalog.js';

const out = new URL('../ios/AdvancedAutomations/Resources/catalog.json', import.meta.url);
writeFileSync(out, `${JSON.stringify(publicCatalog(), null, 2)}\n`);
console.log(`Wrote ${out.pathname}`);
