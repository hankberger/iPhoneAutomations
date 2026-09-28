// Copies the shortcut's key, then follows the link into the Shortcuts app. The copy has to
// happen inside the tap, before navigating, or iOS refuses it.
const add = document.getElementById('add');
const status = document.getElementById('add-status');
const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
if (isIos) document.documentElement.classList.add('ios');

add?.addEventListener('click', async (event) => {
  event.preventDefault();
  let copied = false;
  try {
    await navigator.clipboard.writeText(add.dataset.key);
    copied = true;
  } catch {
    // Older browsers: select the key so a long-press copy is one step.
    const range = document.createRange();
    range.selectNodeContents(document.getElementById('key'));
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  }
  add.querySelector('span').textContent = copied ? add.dataset.going : 'Copy the key above, then tap again';
  if (!copied) return;
  if (!isIos) {
    status.textContent = 'Key copied. Shortcuts only installs on iPhone and iPad, so open this page there.';
    return;
  }
  location.href = add.href;
});
