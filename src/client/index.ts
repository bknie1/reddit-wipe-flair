import { purchase, OrderResultStatus, showToast } from '@devvit/web/client';

type TipOption = {
  sku: string;
  label: string;
  gold: number;
};

const TIP_OPTIONS: TipOption[] = [
  { sku: 'tip-coffee', label: 'Coffee', gold: 100 },
  { sku: 'tip-nice-coffee', label: 'Nice Coffee', gold: 250 },
  { sku: 'tip-lunch', label: 'Lunch', gold: 500 },
];

const optionsEl = document.getElementById('options');
const statusEl = document.getElementById('status');

function renderOptions(): void {
  if (!optionsEl) return;

  for (const option of TIP_OPTIONS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tip';
    button.innerHTML = `<span>🪙 ${option.label}</span><span class="price">${option.gold} Gold</span>`;
    button.addEventListener('click', () => handleTip(option, button));
    optionsEl.appendChild(button);
  }
}

async function handleTip(option: TipOption, button: HTMLButtonElement): Promise<void> {
  if (!statusEl) return;

  button.disabled = true;
  statusEl.textContent = '';

  try {
    const result = await purchase(option.sku);
    if (result.status === OrderResultStatus.STATUS_SUCCESS) {
      statusEl.textContent = 'Thanks for the tip!';
      showToast('Thanks for the tip!');
    } else if (result.status === OrderResultStatus.STATUS_CANCELLED) {
      // User backed out of the purchase flow; nothing to report.
    } else {
      statusEl.textContent = result.errorMessage ?? 'Something went wrong - try again later.';
    }
  } finally {
    button.disabled = false;
  }
}

renderOptions();
