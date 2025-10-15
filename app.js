const GEMINI_API_KEY = 'AIzaSyArd87o_wRn21M_SiAiTWtrNosgN_Jsq9o';
const MODEL_NAME = 'gemini-1.5-flash';
const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${GEMINI_API_KEY}`;
const THEME_STORAGE_KEY = 'wordsoft-theme-preference';

const INITIAL_GREETING = [
  'Привет! Я WORDSOFT AI. Расскажи, чем могу помочь, или прикрепи изображение для анализа.',
  'Для быстрого старта воспользуйся подсказками слева.'
].join('\n\n');

const chatArea = document.querySelector('#chat-area');
const composerForm = document.querySelector('#composer-form');
const promptInput = document.querySelector('#prompt-input');
const imageInput = document.querySelector('#image-input');
const statusIndicator = document.querySelector('#status-indicator');
const themeToggle = document.querySelector('#theme-toggle');
const suggestionButtons = document.querySelectorAll('[data-suggestion]');
const clearInputButton = document.querySelector('#clear-input');
const sendButton = document.querySelector('#send-button');
const sendButtonIcon = sendButton?.querySelector('.icon');
const composerAttachments = document.querySelector('#composer-attachments');

const conversation = [];
let pendingImage = null;
let pendingImagePreviewUrl = null;

function fillBubbleWithContent(bubble, content) {
  bubble.innerHTML = '';
  if (!content || !content.trim()) {
    return;
  }

  const paragraphs = content.split(/\n{2,}/).map(paragraph => paragraph.trim()).filter(Boolean);

  if (paragraphs.length === 0) {
    bubble.textContent = content.trim();
    return;
  }

  paragraphs.forEach(paragraph => {
    const p = document.createElement('p');
    const lines = paragraph.split('\n');
    lines.forEach((line, index) => {
      p.appendChild(document.createTextNode(line));
      if (index < lines.length - 1) {
        p.appendChild(document.createElement('br'));
      }
    });
    bubble.appendChild(p);
  });
}

function createMessageElement(role, content, imageSrc) {
  const template = document.querySelector('#message-template');
  const element = template.content.firstElementChild.cloneNode(true);
  const avatar = element.querySelector('.avatar');
  const bubble = element.querySelector('.bubble');

  if (role === 'user') {
    element.classList.add('message-user');
    avatar.textContent = '🧑';
  } else {
    element.classList.add('message-model');
    avatar.textContent = '🤖';
  }

  fillBubbleWithContent(bubble, content);

  if (imageSrc) {
    const img = document.createElement('img');
    img.src = imageSrc;
    img.alt = 'Загруженное изображение пользователя';
    if (imageSrc.startsWith('blob:')) {
      img.addEventListener('load', () => {
        URL.revokeObjectURL(imageSrc);
      }, { once: true });
    }
    bubble.appendChild(img);
  }

  return element;
}

function appendMessage(role, content, imageSrc) {
  const element = createMessageElement(role, content, imageSrc);
  chatArea.appendChild(element);
  chatArea.scrollTop = chatArea.scrollHeight;
}

function setLoadingState(isLoading) {
  if (sendButton) {
    sendButton.disabled = isLoading;
    sendButton.classList.toggle('is-loading', isLoading);
    if (sendButtonIcon) {
      sendButtonIcon.textContent = isLoading ? '⏳' : '➤';
    }
  }
  promptInput.disabled = isLoading;
  imageInput.disabled = isLoading;
  clearInputButton.disabled = isLoading;
  suggestionButtons.forEach(button => {
    button.disabled = isLoading;
  });
  statusIndicator.textContent = isLoading ? 'WORDSOFT AI думает…' : 'В сети';
}

function updateClearButtonState() {
  const hasText = promptInput.value.trim().length > 0;
  const hasAttachment = Boolean(pendingImage);
  clearInputButton.classList.toggle('is-visible', hasText || hasAttachment);
}

function renderAttachments() {
  composerAttachments.innerHTML = '';
  if (!pendingImage || !pendingImagePreviewUrl) {
    return;
  }

  const chip = document.createElement('div');
  chip.className = 'attachment-chip';

  const img = document.createElement('img');
  img.src = pendingImagePreviewUrl;
  img.alt = pendingImage.name || 'Изображение';

  const label = document.createElement('span');
  label.textContent = pendingImage.name || 'Изображение';

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'remove-attachment';
  removeButton.setAttribute('aria-label', 'Удалить изображение');
  removeButton.textContent = '✕';
  removeButton.addEventListener('click', () => {
    clearPendingImage();
  });

  chip.appendChild(img);
  chip.appendChild(label);
  chip.appendChild(removeButton);
  composerAttachments.appendChild(chip);
}

function clearPendingImage(options = {}) {
  const { preservePreviewUrl = false } = options;
  if (pendingImagePreviewUrl && !preservePreviewUrl) {
    URL.revokeObjectURL(pendingImagePreviewUrl);
  }
  pendingImage = null;
  pendingImagePreviewUrl = null;
  imageInput.value = '';
  renderAttachments();
  updateClearButtonState();
}

function applyTheme(theme, persist = true) {
  const nextTheme = theme === 'light' ? 'light' : 'dark';
  document.body.classList.toggle('light', nextTheme === 'light');
  if (themeToggle) {
    themeToggle.setAttribute('aria-pressed', nextTheme === 'light' ? 'true' : 'false');
    const icon = themeToggle.querySelector('.icon');
    if (icon) {
      icon.textContent = nextTheme === 'light' ? '🌞' : '🌙';
    }
  }
  if (persist) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch (error) {
      console.warn('Не удалось сохранить тему', error);
    }
  }
}

function initializeTheme() {
  let storedTheme = null;
  try {
    storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  } catch (error) {
    storedTheme = null;
  }

  if (storedTheme !== 'light' && storedTheme !== 'dark') {
    const prefersLightMedia = window.matchMedia('(prefers-color-scheme: light)');
    applyTheme(prefersLightMedia.matches ? 'light' : 'dark', false);
    prefersLightMedia.addEventListener('change', event => {
      let savedTheme = null;
      try {
        savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
      } catch (storageError) {
        savedTheme = null;
      }
      if (!savedTheme) {
        applyTheme(event.matches ? 'light' : 'dark', false);
      }
    });
    return;
  }

  applyTheme(storedTheme);
}

async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function handleSubmit(event) {
  event.preventDefault();
  const text = promptInput.value.trim();

  if (!text && !pendingImage) {
    return;
  }

  const messageParts = [];
  if (text) {
    messageParts.push({ text });
  }

  let imagePreviewForMessage = null;
  if (pendingImage) {
    messageParts.push({
      inlineData: {
        mimeType: pendingImage.type,
        data: await fileToBase64(pendingImage)
      }
    });
    imagePreviewForMessage = pendingImagePreviewUrl || URL.createObjectURL(pendingImage);
  }

  conversation.push({
    role: 'user',
    parts: messageParts
  });

  appendMessage('user', text, imagePreviewForMessage);
  promptInput.value = '';
  promptInput.style.height = 'auto';
  clearPendingImage({ preservePreviewUrl: Boolean(imagePreviewForMessage) });
  updateClearButtonState();
  setLoadingState(true);

  const loadingMessage = createMessageElement('model', '', null);
  const bubble = loadingMessage.querySelector('.bubble');
  bubble.innerHTML = '<span class="loading-indicator">WORDSOFT AI формирует ответ</span>';
  chatArea.appendChild(loadingMessage);
  chatArea.scrollTop = chatArea.scrollHeight;

  try {
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ contents: conversation })
    });

    if (!response.ok) {
      throw new Error(`Ошибка API: ${response.status}`);
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];
    const textAnswer = parts.map(part => part.text ?? '').join('\n').trim();

    if (!textAnswer) {
      throw new Error('Модель не вернула текст.');
    }

    conversation.push({
      role: 'model',
      parts
    });

    loadingMessage.remove();
    appendMessage('model', textAnswer);
  } catch (error) {
    console.error(error);
    if (conversation[conversation.length - 1]?.role === 'user') {
      conversation.pop();
    }
    loadingMessage.remove();
    appendMessage('model', 'Произошла ошибка при обращении к модели. Попробуйте ещё раз позже.');
  } finally {
    setLoadingState(false);
    promptInput.focus();
  }
}

function autoResizeInput() {
  promptInput.style.height = 'auto';
  const maxHeight = 240;
  const next = Math.min(promptInput.scrollHeight, maxHeight);
  promptInput.style.height = `${next}px`;
}

function handleSuggestionClick(event) {
  const suggestion = event.currentTarget.getAttribute('data-suggestion');
  if (!suggestion) {
    return;
  }
  promptInput.value = suggestion;
  autoResizeInput();
  updateClearButtonState();
  promptInput.focus();
}

function setupEventListeners() {
  composerForm.addEventListener('submit', handleSubmit);

  promptInput.addEventListener('input', () => {
    autoResizeInput();
    updateClearButtonState();
  });

  imageInput.addEventListener('change', () => {
    const file = imageInput.files?.[0];
    if (!file) {
      clearPendingImage();
      return;
    }

    const maxSizeMB = 4;
    if (file.size > maxSizeMB * 1024 * 1024) {
      alert(`Размер файла превышает ${maxSizeMB} МБ. Пожалуйста, выберите изображение поменьше.`);
      clearPendingImage();
      return;
    }

    if (pendingImagePreviewUrl) {
      URL.revokeObjectURL(pendingImagePreviewUrl);
    }

    pendingImage = file;
    pendingImagePreviewUrl = URL.createObjectURL(file);
    renderAttachments();
    updateClearButtonState();
  });

  clearInputButton.addEventListener('click', () => {
    promptInput.value = '';
    promptInput.dispatchEvent(new Event('input'));
    clearPendingImage();
    promptInput.focus();
  });

  suggestionButtons.forEach(button => {
    button.addEventListener('click', handleSuggestionClick);
  });

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const currentTheme = document.body.classList.contains('light') ? 'light' : 'dark';
      applyTheme(currentTheme === 'light' ? 'dark' : 'light');
    });
  }
}

function init() {
  appendMessage('model', INITIAL_GREETING);
  initializeTheme();
  autoResizeInput();
  updateClearButtonState();
  renderAttachments();
  setupEventListeners();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
