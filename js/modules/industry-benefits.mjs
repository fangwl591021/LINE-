import {angles, general, industries, matchIndustry} from './industry-benefits-data.mjs?v=2';

const form = document.getElementById('industry-form');
const input = document.getElementById('industry');
const error = document.getElementById('industry-error');
const result = document.getElementById('analysis');
const title = document.getElementById('analysis-title');
const category = document.getElementById('category');
const list = document.getElementById('angles');
const builtinFeatures = document.getElementById('builtin-features-template');
const profiles = [general, ...industries];
let analyzedName = '';
let inferred = null;

for (const profile of profiles) {
  category.add(new Option(profile.label, profile.id));
}

function render(profile) {
  document.getElementById('matched').textContent =
    profile === general ? '暫以通用情境分析，可調整類別' :
      (profile === inferred ? '參考類別：' : '已選類別：') + profile.label;
  title.textContent = analyzedName + '加入點數通的做法';
  document.getElementById('analysis-value').textContent = profile.value;
  document.getElementById('first-step').textContent = profile.first;
  list.replaceChildren();
  for (const [index, label] of angles.entries()) {
    const item = document.createElement('li');
    const heading = document.createElement('h3');
    const text = document.createElement('p');
    heading.textContent = label;
    text.textContent = profile.ideas[index];
    item.append(heading);
    if (index === 0) {
      item.classList.add('builtin-angle');
      item.append(builtinFeatures.content.cloneNode(true));
    }
    item.append(text);
    list.append(item);
  }
  result.hidden = false;
}

form.addEventListener('submit', event => {
  event.preventDefault();
  const value = input.value.trim();
  if (value.length > 60 || !/\p{L}/u.test(value)) {
    result.hidden = true;
    error.textContent = '請輸入行業名稱，例如房仲、民宿或咖啡店。';
    error.hidden = false;
    input.setAttribute('aria-invalid', 'true');
    input.focus();
    return;
  }
  error.hidden = true;
  input.removeAttribute('aria-invalid');
  analyzedName = value;
  inferred = matchIndustry(value);
  const profile = inferred || general;
  category.value = profile.id;
  render(profile);
  title.focus();
});

category.addEventListener('change', () => {
  render(profiles.find(profile => profile.id === category.value) || general);
});

for (const button of document.querySelectorAll('[data-example]')) {
  button.addEventListener('click', () => {
    input.value = button.dataset.example;
    form.requestSubmit();
  });
}
