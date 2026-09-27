import { costMicros } from './inference.js';

// Each automation ships as a signed shortcut built from shortcuts/<slug>.cherri
// (npm run shortcuts). The shortcut sends its input to /api/v1/run/<slug>; the prompt
// and model live here, so they can change without anyone reinstalling.
// `inside` lists the shortcut's actions in plain words, for people who want to check.
const CALL = { action: 'Ask Advanced Automations', detail: 'Sends the text to our API with your key. Nothing else leaves your phone.' };

export const CATEGORIES = ['Writing', 'Productivity', 'Capture', 'Everyday'];

export const AUTOMATIONS = [
  {
    slug: 'summarize-anything',
    icon: 'doc',
    color: 'orange',
    name: 'Summarize Anything',
    tagline: 'Share any article, email or note and get a three-line summary.',
    category: 'Productivity',
    trigger: 'Share Sheet',
    runTip: 'In Safari, Mail or Notes, tap Share and pick Summarize Anything. Run it on its own to summarize your clipboard.',
    model: '@cf/meta/llama-3.1-8b-instruct-fp8-fast',
    typicalTokens: [900, 120],
    prompt: 'Summarize the input in three short lines. Lead with the single most important point.',
    inside: [
      { action: 'Get Text from Input', detail: 'Whatever you shared, or your clipboard.' },
      CALL,
      { action: 'Quick Look', detail: 'Shows the summary.' },
    ],
  },
  {
    slug: 'reply-drafter',
    icon: 'chat',
    color: 'violet',
    name: 'Reply Drafter',
    tagline: 'Copy a message, run it, and get a warm, concise reply on your clipboard.',
    category: 'Writing',
    trigger: 'Back Tap or Action Button',
    runTip: 'Copy a message, then run it. For one tap, set it as your Action Button or Back Tap (Settings, Accessibility, Touch, Back Tap).',
    model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    typicalTokens: [300, 150],
    prompt: 'Draft a friendly, concise reply to this message. Match its tone. Output only the reply.',
    inside: [
      { action: 'Get Clipboard' },
      CALL,
      { action: 'Copy to Clipboard', detail: 'Then a notification says the reply is ready to paste.' },
    ],
  },
  {
    slug: 'tone-shifter',
    icon: 'wand',
    color: 'indigo',
    name: 'Tone Shifter',
    tagline: 'Rewrite selected text as friendlier, firmer, or more formal.',
    category: 'Writing',
    trigger: 'Share Sheet',
    runTip: 'Select text, tap Share and pick Tone Shifter. The rewrite lands on your clipboard.',
    model: '@cf/meta/llama-3.1-8b-instruct-fp8-fast',
    typicalTokens: [250, 120],
    choices: ['Friendlier', 'Firmer', 'More formal', 'Shorter'],
    prompt: 'Rewrite the input so it reads {{choice}}. Keep the meaning. Output only the rewrite.',
    inside: [
      { action: 'Get Text from Input' },
      { action: 'Choose from List', detail: 'Friendlier, Firmer, More formal or Shorter.' },
      CALL,
      { action: 'Copy to Clipboard', detail: 'And shows the rewrite.' },
    ],
  },
  {
    slug: 'voice-to-notes',
    icon: 'mic',
    color: 'green',
    name: 'Voice to Notes',
    tagline: 'Talk for a minute. Get a tidy note with action items in Apple Notes.',
    category: 'Capture',
    trigger: 'Action Button or Siri',
    runTip: 'Say "Hey Siri, Voice to Notes", or set it as your Action Button. It stops listening when you pause.',
    model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    typicalTokens: [500, 250],
    prompt: 'Turn this dictation into a clean note: a title line, a short summary, then a checklist of action items.',
    inside: [
      { action: 'Dictate Text', detail: 'Transcribed on your iPhone.' },
      CALL,
      { action: 'Create Note', detail: 'In Apple Notes.' },
    ],
  },
  {
    slug: 'smart-reminders',
    icon: 'bell',
    color: 'yellow',
    name: 'Smart Reminders',
    tagline: 'Share a messy list or email and get one clean reminder per task.',
    category: 'Productivity',
    trigger: 'Share Sheet',
    runTip: 'Share an email or note, or copy a list and run it. Each task becomes its own reminder.',
    model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    typicalTokens: [400, 150],
    prompt: 'Extract the tasks from the input. Output one short task per line, starting with a verb, and add any deadline in brackets at the end, like "Send invoice [Fri]". No numbering, bullets or other text.',
    inside: [
      { action: 'Get Text from Input', detail: 'Whatever you shared, or your clipboard.' },
      CALL,
      { action: 'Split Text', detail: 'One line per task.' },
      { action: 'Add New Reminder', detail: 'For each task.' },
    ],
  },
  {
    slug: 'receipt-reader',
    icon: 'receipt',
    color: 'pink',
    name: 'Receipt Reader',
    tagline: 'Snap a receipt and log merchant, date and total to a spreadsheet.',
    category: 'Capture',
    trigger: 'Home Screen',
    runTip: 'Add it to your Home Screen. Rows go to Receipts.csv in iCloud Drive, in the Shortcuts folder.',
    model: '@cf/meta/llama-3.1-8b-instruct-fp8-fast',
    typicalTokens: [300, 40],
    prompt: 'From this receipt text, output one CSV line: merchant,date (YYYY-MM-DD),total. No header and no other text.',
    inside: [
      { action: 'Take Photo' },
      { action: 'Extract Text from Image', detail: 'Runs on your iPhone. Only the text is sent.' },
      CALL,
      { action: 'Append to Text File', detail: 'Receipts.csv in iCloud Drive.' },
    ],
  },
  {
    slug: 'translate-selection',
    icon: 'globe',
    color: 'sky',
    name: 'Translate Selection',
    tagline: 'Natural translation that keeps names, tone and formatting intact.',
    category: 'Everyday',
    trigger: 'Share Sheet',
    runTip: 'Select text or share a page, tap Share and pick Translate Selection.',
    model: '@cf/meta/llama-3.1-8b-instruct-fp8-fast',
    typicalTokens: [300, 300],
    choices: ['English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Japanese', 'Korean', 'Chinese'],
    prompt: 'Translate the input to {{choice}}. Keep names and formatting. Output only the translation.',
    inside: [
      { action: 'Get Text from Input' },
      { action: 'Choose from List', detail: 'Pick the language.' },
      CALL,
      { action: 'Show Result' },
    ],
  },
  {
    slug: 'morning-brief',
    icon: 'sun',
    color: 'amber',
    name: 'Morning Brief',
    tagline: 'A two-paragraph plan for your day from your calendar and reminders.',
    category: 'Everyday',
    trigger: 'Personal Automation at 7:00',
    runTip: 'In Shortcuts, open Automation, tap +, pick Time of Day and choose Morning Brief so it runs every morning.',
    model: '@cf/mistralai/mistral-small-3.1-24b-instruct',
    typicalTokens: [700, 350],
    prompt: 'Here are my upcoming events and reminders. Write a calm two-paragraph plan for today only, ignoring anything on later days, and flag conflicts.',
    inside: [
      { action: 'Get Upcoming Events' },
      { action: 'Get Upcoming Reminders' },
      CALL,
      { action: 'Speak Text', detail: 'And shows the plan.' },
    ],
  },
];

// Typical cost in USD at current prices and markup, for display.
for (const a of AUTOMATIONS) a.typicalCost = costMicros(a.model, ...a.typicalTokens) / 1e6;

export const findAutomation = (slug) => AUTOMATIONS.find((a) => a.slug === slug);
