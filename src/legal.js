// Terms of Service and Privacy Policy. A plain-language starting point, not legal advice:
// have a lawyer review before relying on it. Update LEGAL.updated whenever the text changes.
import { layout } from './views.js';

export const LEGAL = {
  updated: 'September 29, 2026',
  contact: 'support@iphoneadvanced.com',
};

const mail = `<a href="mailto:${LEGAL.contact}">${LEGAL.contact}</a>`;

const page = ({ title, path, user, intro, body }) => layout({
  title,
  user,
  active: path,
  body: `
<section class="wrap narrow page-head">
  <h1>${title}</h1>
  <p class="muted small">Last updated ${LEGAL.updated}</p>
  <p class="lede">${intro}</p>
</section>
<article class="wrap narrow legal">${body}</article>`,
});

export const terms = ({ user }) => page({
  title: 'Terms of Service',
  path: '/terms',
  user,
  intro: 'These terms cover your use of iphoneadvanced.com, the Shortcuts you download from it, and the AI features they call. By creating an account or using the site, you agree to them.',
  body: `
<h2>1. The service</h2>
<p>Advanced Automations ("we", "us") offers free iPhone Shortcuts. Some of them send text, images or audio to our API, which runs an AI model and returns the result. The Shortcuts are free. AI usage is paid from a prepaid credit balance on your account.</p>

<h2>2. Your account</h2>
<p>You need an account to download Shortcuts and use AI features. You can sign up with an email and password, or with Google or Apple. You must be at least 13 years old to use the service, and at least 18 (or have a parent or guardian's permission) to buy credit.</p>
<p>Keep your password and API keys private. Anyone holding one of your API keys can spend your balance, so revoke a key from your account page if it leaks. You are responsible for activity on your account and keys.</p>

<h2>3. Credit and payments</h2>
<ul>
  <li>You add credit in fixed amounts through Stripe Checkout. We do not see or store your card number.</li>
  <li>Each AI request is charged against your balance at the rates on the <a href="/pricing">pricing page</a>. Those rates include our margin over what our AI providers charge us, and we may change them. New rates apply to requests made after the change, never to credit already spent.</li>
  <li>Credit does not expire. It has no cash value, cannot be transferred, and is not a deposit account.</li>
  <li>Purchases are final, except where the law requires a refund or where we charged you in error. If something looks wrong, email ${mail} and we will make it right.</li>
  <li>Promotional credit, such as a sign-up bonus, may be withdrawn if it is abused (for example, by creating many accounts).</li>
</ul>

<h2>4. Acceptable use</h2>
<p>Do not use the service to:</p>
<ul>
  <li>break the law or infringe anyone's rights, including privacy and intellectual property;</li>
  <li>create sexual content involving minors, content that harasses or threatens people, or content meant to deceive (such as impersonation or fake evidence);</li>
  <li>send us data you have no right to share, such as someone else's private messages without their consent;</li>
  <li>attack, overload, scrape or reverse-engineer the service, or get around its limits or billing;</li>
  <li>violate the usage policies of our AI providers, which apply to requests made through us.</li>
</ul>
<p>We may refuse requests, suspend accounts or revoke keys that break these rules.</p>

<h2>5. AI output</h2>
<p>AI output can be wrong, incomplete or offensive, and the same input can give different results. Check anything important before you rely on it, and do not use it as a substitute for medical, legal, financial or other professional advice. Between you and us, you own what you send and what you get back, to the extent the law allows, and you are responsible for how you use it.</p>

<h2>6. The Shortcuts</h2>
<p>You may use, change and share the Shortcuts we publish. They run on your device through Apple's Shortcuts app, which we do not control. Apple is not a party to these terms and is not responsible for the service.</p>

<h2>7. Availability and changes</h2>
<p>We work to keep the service running, but it is provided "as is" and "as available", without warranties of any kind, to the fullest extent the law allows. We may change, add or remove features, models and Shortcuts. If we shut the service down, we will give reasonable notice and refund any unused paid credit.</p>

<h2>8. Limitation of liability</h2>
<p>To the fullest extent the law allows, we are not liable for indirect, incidental, special or consequential damages, or for lost data or profits. Our total liability for any claim is limited to the amount you paid us in the 12 months before the claim. Some places do not allow these limits, so they may not apply to you.</p>

<h2>9. Ending your account</h2>
<p>You can stop using the service at any time and ask us to delete your account by emailing ${mail}. We may suspend or close accounts that break these terms. If we close your account without cause, we will refund any unused paid credit.</p>

<h2>10. Changes to these terms</h2>
<p>We may update these terms. If a change is significant, we will say so on the site before it takes effect. Continuing to use the service after that means you accept the new terms.</p>

<h2>11. Contact</h2>
<p>Questions about these terms: ${mail}. See also our <a href="/privacy">Privacy Policy</a>.</p>`,
});

export const privacy = ({ user }) => page({
  title: 'Privacy Policy',
  path: '/privacy',
  user,
  intro: 'We collect what we need to run your account, bill you and answer your AI requests. We do not sell your data or show you ads.',
  body: `
<h2>What we collect</h2>
<ul>
  <li><strong>Account details.</strong> Your email address and, if you use a password, a salted hash of it (never the password itself). If you sign in with Google or Apple, we receive your email address and an account identifier from them. With Apple, that may be a private relay address.</li>
  <li><strong>Billing records.</strong> Your balance and a ledger of top-ups and AI requests: the amount, time, model used and token counts. Stripe gives us a customer ID and confirms each payment. Card details go straight to Stripe and never reach us.</li>
  <li><strong>API keys.</strong> A hash and short prefix of each key, when it was made and when it was last used.</li>
  <li><strong>Session cookie.</strong> One cookie that keeps you signed in, plus a short-lived cookie during Google or Apple sign-in. We use no advertising or analytics cookies.</li>
  <li><strong>Request logs.</strong> Like most websites, our hosting provider records technical details such as IP address, browser, and the time and path of each request, for security and debugging.</li>
</ul>

<h2>What you send to the AI</h2>
<p>When a Shortcut calls our API, it sends the text, image or audio you chose to our servers, which pass it to an AI model and return the result. <strong>We do not store the content of your requests or the AI's replies in our database.</strong> We keep only the billing record described above. Our providers may keep request data briefly, as described below.</p>

<h2>Who we share it with</h2>
<p>We share data only with the companies that run the service for us:</p>
<ul>
  <li><strong>Cloudflare</strong> hosts the site and database and runs most AI models (Workers AI) and the AI Gateway that routes image requests. See <a href="https://www.cloudflare.com/privacypolicy/" rel="noopener">Cloudflare's privacy policy</a>.</li>
  <li><strong>OpenAI</strong> generates images for the Make an Image block. OpenAI says it does not train on API data by default and may keep it for up to 30 days to monitor abuse. See <a href="https://openai.com/policies/privacy-policy/" rel="noopener">OpenAI's privacy policy</a>.</li>
  <li><strong>Stripe</strong> processes payments. See <a href="https://stripe.com/privacy" rel="noopener">Stripe's privacy policy</a>.</li>
  <li><strong>Google and Apple</strong>, only if you choose to sign in with them.</li>
</ul>
<p>We may also disclose data when the law requires it, to protect people or the service from harm, or as part of a sale or merger of the service (in which case this policy keeps applying).</p>

<h2>How we use it</h2>
<p>To run your account, answer your requests, charge the right amount, prevent fraud and abuse, keep the service secure, and reply when you contact us. We do not sell your personal information, share it for advertising, or use your requests to train AI models.</p>

<h2>How long we keep it</h2>
<p>We keep account and billing records while your account is open. After you delete your account, we remove your account details, keys and sessions, but may keep payment records for as long as tax and accounting law requires. Sessions expire on their own, and our hosting provider's logs are kept for a limited time.</p>

<h2>Your choices and rights</h2>
<p>You can see your balance, history and API keys on your <a href="/account">account page</a>, and revoke keys there. To get a copy of your data, correct it, or delete your account, email ${mail}. Depending on where you live (for example, in the EU, UK or California), you may have further rights, such as to object to processing or to complain to a data protection authority. We will not treat you differently for using them.</p>

<h2>Security</h2>
<p>Traffic is encrypted with HTTPS, passwords and keys are stored only as hashes, and access to production systems is limited. No system is perfectly secure, so please use a strong, unique password.</p>

<h2>Children</h2>
<p>The service is not meant for children under 13, and we do not knowingly collect their data. If you think a child has given us data, email ${mail} and we will delete it.</p>

<h2>International users</h2>
<p>We and our providers may process data in the United States and other countries, which may have different data protection laws from yours.</p>

<h2>Changes</h2>
<p>If we change this policy in a meaningful way, we will update the date above and say so on the site.</p>

<h2>Contact</h2>
<p>Privacy questions or requests: ${mail}. See also our <a href="/terms">Terms of Service</a>.</p>`,
});

export const support = ({ user }) => page({
  title: 'Support', path: '/support', user,
  intro: 'Get help with Advanced Automations, your account, or an AI action.',
  body: `
<h2>Contact us</h2>
<p>Email ${mail}. Include the action name, what you expected, and the error message. Never send your password, API key, payment details or private source content.</p>
<h2>Finding the actions</h2>
<p>In Apple Shortcuts, create a shortcut and search for Advanced Automations under Apps. To use a ready-made automation, open its detail page in the library and follow the installation instructions.</p>
<h2>An action cannot run</h2>
<p>Check your connection, sign in to the same account, and review Account → AI Privacy in the iPhone app. A shortcut installed separately uses its own API key; if that key was revoked, add the shortcut again. Check the account balance if an action reports insufficient credit.</p>
<h2>Unexpected AI results</h2>
<p>AI answers can be inaccurate. Review output before using it to send a message, create a reminder or record information. Nutrition estimates from photos are approximate and are not medical advice.</p>
<h2>Privacy questions</h2>
<p>See our <a href="/privacy">Privacy Policy</a> or contact ${mail} for questions about your data.</p>`,
});
